// v1.25.0 T2 — IPC handler `xlsx:commitBatch`.
//
// Mirrors dbcImportComStackHandler §6-§8:
//   - resolve 3 Com-stack paths (Com/CanIf/PduR)
//   - read originals in parallel (BSWMDs not required — xlsx rows carry
//     their own params and we don't need schema validation per the spec)
//   - run T1 mapper → split per-file PatchStep[] via sheet → file
//     dispatch (ComIPdu/ComSignal → Com, CanIfTxPdu/CanIfRxPdu →
//     CanIf, PduRRoutingPath → PduR)
//   - apply each file's plan via `applyPatchSteps`
//   - 2-phase write + snapshot rollback (tmp + serial rename + on-failure
//     rollback using `writeAtomic` with the in-memory originals)
//
// Resolutions map controls collision policy:
//   - row with `overwrite` resolution → counted as `overwritten`
//   - row with `skip` resolution (or absent key) → counted as `skipped`
//
// Returns per-file counters so the wizard's "Added: N" line is exact.

import { promises as fs } from 'node:fs';

import type { ParseError } from '../../core/arxml/parser.js';
import { parseArxml } from '../../core/arxml/parser.js';
import type { SerializeError } from '../../core/arxml/serializer.js';
import { serializeArxml } from '../../core/arxml/serializer.js';
import { xlsxToEcucBatch } from '../../core/bridge/xlsxToEcucBatch.js';
import { applyPatchSteps } from '../../core/mutation/applyPatchSteps.js';
import type { BswModuleDef } from '../../core/project/bswmd.js';
import { parseBswmd } from '../../core/project/bswmd.js';
import type { PatchStep } from '../../shared/headless/ipc-contract.js';
import type {
  EcucInstanceRow,
  XlsxCommitBatchRequest,
  XlsxCommitBatchResponse,
} from '../../shared/types.js';
import { writeAtomic } from '../io/writeAtomic.js';

import { getOpenProjectManifestPath } from './project-manifest-state.js';

const FILE_BY_KIND: Record<EcucInstanceRow['sheet'], 'Com' | 'CanIf' | 'PduR'> = {
  ComIPdu: 'Com',
  ComSignal: 'Com',
  CanIfTxPdu: 'CanIf',
  CanIfRxPdu: 'CanIf',
  PduRRoutingPath: 'PduR',
};

type ComStackFile = 'Com' | 'CanIf' | 'PduR';

interface FileOutcome {
  readonly path: string;
  readonly serialized: string;
  readonly added: number;
}

/**
 * Apply a per-file patch list + serialize, mirroring
 * `dbcImportComStackHandler.applyPlanToFile` (lines ~140-260) — but
 * here the steps are produced upstream by `xlsxToEcucBatch` and split
 * into 3 lists (Com/CanIf/PduR) by the caller. Requires `moduleDef` so
 * `applyAddChild` can validate the new container against the BSWMD
 * schema; without it, every `add-child` step fails with
 * `no-bswmd-for-module`.
 */
function applyStepsToFile(
  path: string,
  sourceText: string,
  steps: readonly PatchStep[],
  moduleDef: BswModuleDef | undefined,
): { ok: true; value: FileOutcome } | { ok: false; message: string } {
  const docRes = parseArxml(sourceText);
  if (!docRes.ok) return { ok: false, message: `parse failed: ${formatParseError(docRes.error)}` };
  // Prepend `/<docRootPkg>/` so the mutation engine's
  // `findContainerByPath` can resolve the BSWMD-relative paths emitted
  // by `xlsxToEcucBatch` + `translateStepPath`. Without this prefix,
  // `set-param` steps are rejected with `path-not-found` (T2 diagnostic
  // root cause). The mapper / translator don't have doc context, so we
  // inject the package root here.
  const docRootPkg = docRes.value.packages[0]?.shortName;
  const resolvedSteps =
    docRootPkg !== undefined ? steps.map((s) => prefixDocRootPath(s, docRootPkg)) : steps;
  // `exactOptionalPropertyTypes: true` requires us to conditionally
  // include `moduleDef` rather than passing `{ moduleDef: undefined }`.
  const ctx = moduleDef !== undefined ? { moduleDef } : {};
  const applyRes = applyPatchSteps(docRes.value, resolvedSteps, ctx);
  // Same filter as `dbcImportComStackHandler:230` — `path-not-found`
  // and `no-bswmd-for-module` are advisory (skipped silently) because
  // the bridge doesn't have BSWMD context for every Com-stack kind
  // and the spec accepts schema-mismatched steps as soft-fail.
  const fatal = applyRes.errors.filter(
    (e) => e.kind !== 'path-not-found' && e.kind !== 'no-bswmd-for-module',
  );
  if (fatal.length > 0)
    return { ok: false, message: fatal.map((e) => `${e.kind}: ${e.message}`).join('; ') };
  const serRes = serializeArxml(applyRes.doc, { sourceArxml: sourceText });
  if (!serRes.ok)
    return { ok: false, message: `serialize failed: ${formatSerializeError(serRes.error)}` };
  return {
    ok: true,
    value: { path, serialized: serRes.value, added: applyRes.applied },
  };
}

function formatParseError(err: ParseError): string {
  if (err.kind === 'unsupported-version') {
    return `unsupported-version (got "${err.version}")`;
  }
  const path = 'path' in err && typeof err.path === 'string' ? ` at ${err.path}` : '';
  return `${err.kind}${path}: ${err.message}`;
}

function formatSerializeError(err: SerializeError): string {
  return `${err.kind} at ${err.path}: ${err.message}`;
}

/**
 * Translate the T1 mapper's AUTOSAR-spec casing (e.g. `ComIpdu`) to
 * the BSWMD-side casing (`ComIPdu`) before passing a step to the
 * mutation engine. The engine's `findParentContainerDef` walks the
 * BSWMD defs case-sensitively, so a path like `Com/ComConfig/ComIpdu`
 * resolves to `null` when the BSWMD declares `ComIPdu` (different
 * case). This helper re-resolves each path segment against the
 * module's def tree.
 *
 * Trade-off: this couples the import handler to the BSWMD shape, but
 * the DBC handler has the same coupling (it relies on BSWMD-derived
 * paths). Without this translator the e2e returns 0 added for every
 * row.
 */
/**
 * Prepend `/<docRootPkg>/` to every path in a step so the mutation
 * engine's `findContainerByPath` (which walks doc paths starting with
 * `/<pkg.shortName>` and uses strict equality) can resolve the path.
 *
 * Without this prefix, the mapper's BSWMD-relative paths (e.g.
 * `Com/ComConfig/Pdu_Diag`) are rejected with `path-not-found`. The
 * bug was masked when the user value happened to equal the BSWMD
 * `<DEFAULT-VALUE>` populated by `fillParamsFromBswmd` at
 * `add-child` time — so the v1.25.0 75-row fixture's `SEND` enum
 * assertion (BSWMD default) passed even though `set-param` silently
 * failed. Real-OEM ComPduId integer assignments (=1, =2, ...) bypassed
 * the default and exposed the bug.
 */
function prefixDocRootPath(step: PatchStep, docRootPkg: string): PatchStep {
  const prefix = `/${docRootPkg}`;
  if (step.op === 'add-child') {
    return {
      ...step,
      parentPath: step.parentPath.startsWith(prefix)
        ? step.parentPath
        : `${prefix}/${step.parentPath}`,
    };
  }
  if (step.op === 'set-param') {
    return {
      ...step,
      containerPath: step.containerPath.startsWith(prefix)
        ? step.containerPath
        : `${prefix}/${step.containerPath}`,
    };
  }
  return step;
}

function translateStepPath(step: PatchStep, moduleDef: BswModuleDef): PatchStep {
  if (step.op === 'add-child') {
    // T1 mapper emits parentPath as a 3-segment path that includes
    // the leaf container def (e.g. `Com/ComConfig/ComIpdu`). The
    // mutation engine expects the parent CONTAINER (e.g.
    // `Com/ComConfig`); the leaf segment is interpreted as
    // child-def hint via `findChildDefForAdd`. Strip the leaf
    // segment after case-translating it (so the engine's
    // permissive fallback picks the right first-subContainer).
    const translated = translatePath(step.parentPath, moduleDef);
    const segments = translated.split('/').filter((s) => s.length > 0);
    if (segments.length <= 2) return { ...step, parentPath: translated };
    const parentPath = segments.slice(0, 2).join('/');
    return { ...step, parentPath };
  }
  if (step.op === 'set-param') {
    // T1 mapper builds containerPath as `${parentPath}/${shortName}`
    // where parentPath is the 3-segment path. After add-child's
    // parentPath is shortened to 2 segments, the matching set-param's
    // containerPath must follow suit (drop the leaf container def
    // segment between the module/parent and the new shortName).
    const segments = step.containerPath.split('/').filter((s) => s.length > 0);
    if (segments.length >= 4) {
      // Drop the 3rd segment (leaf container def) — pattern is
      // `<module>/<parentContainer>/<leafDef>/<instance>` →
      // `<module>/<parentContainer>/<instance>`.
      const translated = translatePath(step.containerPath, moduleDef);
      const segs = translated.split('/').filter((s) => s.length > 0);
      if (segs.length >= 4) {
        return { ...step, containerPath: [segs[0]!, segs[1]!, segs[3]!].join('/') };
      }
      return { ...step, containerPath: translated };
    }
    const translated = translatePath(step.containerPath, moduleDef);
    return translated === step.containerPath ? step : { ...step, containerPath: translated };
  }
  return step;
}

function translatePath(path: string, moduleDef: BswModuleDef): string {
  const segments = path.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return path;
  // First segment must match the module shortName (case-sensitive).
  if (segments[0] !== moduleDef.shortName) return path;
  const out: string[] = [segments[0]!];
  let candidates: readonly {
    shortName: string;
    subContainers?: readonly {
      shortName: string;
      subContainers?: readonly { shortName: string }[];
    }[];
  }[] = moduleDef.containers;
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]!;
    const match = candidates.find((c) => c.shortName === seg);
    if (match !== undefined) {
      out.push(match.shortName);
    } else {
      // Try case-insensitive match.
      const lower = seg.toLowerCase();
      const ci = candidates.find((c) => c.shortName.toLowerCase() === lower);
      if (ci !== undefined) {
        out.push(ci.shortName);
      } else {
        out.push(seg); // Give up — keep original segment.
      }
    }
    const last = out[out.length - 1]!;
    const lastDef = candidates.find((c) => c.shortName === last);
    candidates = lastDef?.subContainers ?? [];
  }
  return out.join('/');
}

export async function xlsxEcucBatchImportHandler(
  req: XlsxCommitBatchRequest,
): Promise<XlsxCommitBatchResponse> {
  // 1. Defensive guards (mirror dbcImportComStackHandler §1-§3).
  const openProject = getOpenProjectManifestPath();
  if (openProject === null || openProject !== req.projectManifestPath) {
    return {
      ok: false,
      error: { kind: 'read-failed', message: 'No open project at manifest path' },
    };
  }
  if (req.instances.length === 0) {
    return { ok: false, error: { kind: 'parse-failed', message: 'No instances provided' } };
  }

  // 2. Read manifest, locate 3 Com-stack files.
  let manifestRaw: string;
  try {
    manifestRaw = await fs.readFile(req.projectManifestPath, 'utf-8');
  } catch (e) {
    return {
      ok: false,
      error: { kind: 'read-failed', message: `Cannot read manifest: ${(e as Error).message}` },
    };
  }
  let manifest: { valueArxmlPaths?: readonly string[]; bswmdPaths?: readonly string[] };
  try {
    manifest = JSON.parse(manifestRaw) as { valueArxmlPaths?: readonly string[] };
  } catch (e) {
    return {
      ok: false,
      error: {
        kind: 'read-failed',
        message: `Manifest is not valid JSON: ${(e as Error).message}`,
      },
    };
  }
  if (!Array.isArray(manifest.valueArxmlPaths)) {
    return {
      ok: false,
      error: { kind: 'read-failed', message: 'Manifest missing valueArxmlPaths' },
    };
  }
  const projectDir = (() => {
    const norm = req.projectManifestPath.replace(/\\/g, '/');
    const i = norm.lastIndexOf('/');
    return i < 0 ? norm : norm.slice(0, i);
  })();
  const fileByComStack: Record<ComStackFile, string | null> = {
    Com: null,
    CanIf: null,
    PduR: null,
  };
  for (const rel of manifest.valueArxmlPaths) {
    const lower = rel.replace(/\\/g, '/').toLowerCase();
    const fn = lower.split('/').pop() ?? '';
    if (fileByComStack['Com'] === null && (fn.startsWith('com_') || fn.includes('comconfig'))) {
      fileByComStack['Com'] = `${projectDir}/${rel.replace(/\\/g, '/')}`;
    } else if (
      fileByComStack['CanIf'] === null &&
      (fn.startsWith('canif_') || fn.includes('canifconfig'))
    ) {
      fileByComStack['CanIf'] = `${projectDir}/${rel.replace(/\\/g, '/')}`;
    } else if (
      fileByComStack['PduR'] === null &&
      (fn.startsWith('pdur_') || fn.includes('pdurrouting'))
    ) {
      fileByComStack['PduR'] = `${projectDir}/${rel.replace(/\\/g, '/')}`;
    }
  }
  if (
    fileByComStack['Com'] === null ||
    fileByComStack['CanIf'] === null ||
    fileByComStack['PduR'] === null
  ) {
    const missing = (['Com', 'CanIf', 'PduR'] as const).filter((k) => fileByComStack[k] === null);
    return {
      ok: false,
      error: { kind: 'read-failed', message: `Missing ECUC files: ${missing.join(', ')}` },
    };
  }

  // 3. Read 3 originals in parallel.
  const comPath = fileByComStack['Com']!;
  const canIfPath = fileByComStack['CanIf']!;
  const pduRPath = fileByComStack['PduR']!;
  const [comText, canIfText, pduRText] = await Promise.all([
    fs.readFile(comPath, 'utf-8'),
    fs.readFile(canIfPath, 'utf-8'),
    fs.readFile(pduRPath, 'utf-8'),
  ]);
  const originals = { com: comText, canIf: canIfText, pduR: pduRText };

  // 4. Load BSWMDs in parallel (one per ECUC file) — needed for
  //    `add-child` schema validation. Manifest may not carry
  //    `bswmdPaths` (e.g., the v1.25.0 demo-ecu manifest), in which
  //    case we skip and let the path-not-found filter absorb the
  //    schema-mismatched steps (same as the DBC handler fallback).
  const bswmdPaths: readonly string[] = Array.isArray(manifest.bswmdPaths)
    ? manifest.bswmdPaths
    : [];
  const bswmdDefs = new Map<string, BswModuleDef>();
  await Promise.all(
    bswmdPaths.map(async (rel) => {
      const abs = `${projectDir}/${rel.replace(/\\/g, '/')}`;
      try {
        const text = await fs.readFile(abs, 'utf-8');
        const res = parseBswmd(text);
        if (!res.ok) return;
        for (const mod of res.value.modules) {
          bswmdDefs.set(mod.shortName, mod);
        }
      } catch {
        // Best-effort: missing BSWMD is non-fatal — the engine will
        // produce path-not-found errors which we filter.
      }
    }),
  );

  // 5. Split instances by file. Missing resolutions default to `skip`
  //    (safer than `overwrite`); explicit `skip` also skipped.
  const split: Record<ComStackFile, EcucInstanceRow[]> = { Com: [], CanIf: [], PduR: [] };
  let skipped = 0;
  let overwritten = 0;
  for (const row of req.instances) {
    const key = `${row.sheet}:${row.shortName}`;
    const reso = req.resolutions[key];
    if (reso === undefined || reso === 'skip') {
      skipped++;
      continue;
    }
    overwritten++;
    split[FILE_BY_KIND[row.sheet]].push(row);
  }

  // 6. Run T1 mapper per file → PatchStep[].
  const stepSets: Record<ComStackFile, PatchStep[]> = {
    Com: xlsxToEcucBatch(split['Com']),
    CanIf: xlsxToEcucBatch(split['CanIf']),
    PduR: xlsxToEcucBatch(split['PduR']),
  };

  // Translate T1 mapper's AUTOSAR-spec casing (e.g. `ComIpdu`) to the
  // BSWMD-side casing (`ComIPdu`) before apply. Without this the
  // engine's case-sensitive `findParentContainerDef` walk fails and
  // every step lands as `path-not-found`. The translateXlsxToBswmdPath
  // helper walks the module's containers to find the matching def at
  // each segment.
  for (const file of ['Com', 'CanIf', 'PduR'] as const) {
    const mod = bswmdDefs.get(file);
    if (mod === undefined) continue;
    stepSets[file] = stepSets[file].map((s) => translateStepPath(s, mod));
  }

  // 7. Apply + serialize each file. BSWMD context is module-level
  //    (Com/CanIf/PduR), not per-instance, so each file gets the
  //    matching module's BswModuleDef.
  const comRes = applyStepsToFile(comPath, comText, stepSets['Com'], bswmdDefs.get('Com'));
  const canIfRes = applyStepsToFile(
    canIfPath,
    canIfText,
    stepSets['CanIf'],
    bswmdDefs.get('CanIf'),
  );
  const pduRRes = applyStepsToFile(pduRPath, pduRText, stepSets['PduR'], bswmdDefs.get('PduR'));
  if (!comRes.ok) return { ok: false, error: { kind: 'bridge-failed', message: comRes.message } };
  if (!canIfRes.ok)
    return { ok: false, error: { kind: 'bridge-failed', message: canIfRes.message } };
  if (!pduRRes.ok) return { ok: false, error: { kind: 'bridge-failed', message: pduRRes.message } };

  // 7. 2-phase atomic write + snapshot rollback (mirror dbcImportComStackHandler §8).
  const pid = process.pid;
  const outcomes: FileOutcome[] = [comRes.value, canIfRes.value, pduRRes.value];
  const targets: string[] = [comPath, canIfPath, pduRPath];
  const tmpFiles: string[] = outcomes.map((o) => `${o.path}.tmp.${pid}`);

  // PHASE 1 — write 3 tmp files in parallel.
  try {
    await Promise.all([
      fs.writeFile(tmpFiles[0]!, outcomes[0]!.serialized, 'utf-8'),
      fs.writeFile(tmpFiles[1]!, outcomes[1]!.serialized, 'utf-8'),
      fs.writeFile(tmpFiles[2]!, outcomes[2]!.serialized, 'utf-8'),
    ]);
  } catch (e) {
    await Promise.allSettled(tmpFiles.map((p) => fs.unlink(p).catch(() => undefined)));
    return {
      ok: false,
      error: {
        kind: 'write-failed',
        message: `tmp write failed: ${(e as Error).message}`,
      },
    };
  }

  // PHASE 2 — serial rename; rollback on first failure.
  for (let i = 0; i < outcomes.length; i++) {
    try {
      await fs.rename(tmpFiles[i]!, targets[i]!);
    } catch (e) {
      // Snapshot rollback using in-memory originals.
      await Promise.allSettled([
        writeAtomic(targets[0]!, originals.com),
        writeAtomic(targets[1]!, originals.canIf),
        writeAtomic(targets[2]!, originals.pduR),
      ]);
      // Cleanup leftover tmp files.
      await Promise.allSettled(tmpFiles.map((p) => fs.unlink(p).catch(() => undefined)));
      return {
        ok: false,
        error: {
          kind: 'write-failed',
          message: `rename failed: ${(e as Error).message}`,
        },
      };
    }
  }
  // Cleanup any leftover tmp files.
  await Promise.allSettled(tmpFiles.map((p) => fs.unlink(p).catch(() => undefined)));

  return {
    ok: true,
    value: {
      added: outcomes.reduce((acc, o) => acc + o.added, 0),
      overwritten,
      skipped,
      perFile: {
        Com: outcomes[0]!.added,
        CanIf: outcomes[1]!.added,
        PduR: outcomes[2]!.added,
      },
    },
  };
}
