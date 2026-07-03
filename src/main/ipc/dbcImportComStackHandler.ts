// v1.23.0 T3 — IPC handler `dbc:importComStack`.
//
// Orchestrates the full DBC→Com-Stack bridge pipeline in one main-process
// round-trip:
//
//   1. re-parse DBC content via the T1 `dbcParseForBridgeHandler` so the
//      mapper gets signal-level detail
//   2. call the pure T2 `dbcToComStack` mapper (idempotent: dedups by
//      container shortName in each of the 3 ECUC files)
//   3. for each of the 3 ECUC value-side files: parse → apply patches
//      (with the matching module's BSWMD as `moduleDef`) → serialize →
//      collect new content
//   4. write all 3 files atomically via 2-phase commit (tmp + serial
//      rename + snapshot rollback on rename failure)
//
// Failure modes (all return `{ ok: false, error: { kind, message } }`):
//   - `read-failed`   — DB cap exceeded / malformed, manifest missing,
//                       any of the 3 ECUC files missing on disk,
//                       parse-failure of any file, BSWMD lookup/parse
//                       failure
//   - `bridge-failed` — per-step apply failure (rare; the T2 mapper only
//                       emits `add-child` steps with valid paths)
//   - `write-failed`  — the 3-file batch write failed entirely
//
// Idempotency: re-running the handler on an already-bridged project
// MUST return all-zeros counts (the T2 mapper dedups by shortName).
// This is tested in `dbcImportComStackHandler.test.ts` case #4.

import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { ParseError } from '../../core/arxml/parser.js';
import { parseArxml } from '../../core/arxml/parser.js';
import type { SerializeError } from '../../core/arxml/serializer.js';
import { serializeArxml } from '../../core/arxml/serializer.js';
import type { DbcBridgePlan, DbcToComStackInput } from '../../core/bridge/dbcToComStack.js';
import { dbcToComStack } from '../../core/bridge/dbcToComStack.js';
import type { ApplyContext } from '../../core/mutation/applyPatchSteps.js';
import { applyPatchSteps } from '../../core/mutation/applyPatchSteps.js';
import type { BswModuleDef, BswmdError } from '../../core/project/bswmd.js';
import { parseBswmd } from '../../core/project/bswmd.js';
import { isPathInsideReal } from '../../shared/paths/isPathInsideReal.js';
import type { DbcImportComStackRequest, DbcImportComStackResponse } from '../../shared/types.js';
import { writeAtomic } from '../io/writeAtomic.js';

import { dbcParseForBridgeHandler, DBC_MAX_BYTES } from './dbcParseForBridgeHandler.js';
import { getOpenProjectManifestPath } from './project-manifest-state.js';

/**
 * Per-file mutation accumulator. Holds the new serialized ARXML text
 * + the number of `add-child` steps that actually mutated the
 * document (the `applied` counter from `applyPatchSteps`).
 */
interface BridgeFileOutcome {
  readonly path: string;
  readonly serialized: string;
  readonly added: number;
}

type BridgeFileOutcomeOrNull = BridgeFileOutcome | null;

/**
 * Locate the 3 canonical Com-stack files (Com / CanIf / PduR) by
 * matching the ECUC module shortName against the manifest's
 * `valueArxmlPaths` entries' `<DEFINITION-REF DEST="ECUC-MODULE-DEF">`
 * tail. Falls back to a basename-prefix match when the ARXML has
 * no module-def ref (e.g. hand-crafted fixture).
 */
async function resolveStackPaths(
  projectManifestPath: string,
  manifest: DbcImportComStackRequest['manifest'],
): Promise<
  | { ok: true; value: { comPath: string; canIfPath: string; pduRPath: string } }
  | { ok: false; kind: 'read-failed'; message: string }
> {
  const manifestDir = dirname(resolve(projectManifestPath));
  let comPath: string | null = null;
  let canIfPath: string | null = null;
  let pduRPath: string | null = null;

  for (const rel of manifest.valueArxmlPaths) {
    const abs = resolve(manifestDir, rel);
    if (!(await isPathInsideReal(abs, manifestDir))) {
      return {
        ok: false,
        kind: 'read-failed',
        message: `Manifest valueArxmlPaths entry escapes project directory: ${rel}`,
      };
    }
    let detected: 'Com' | 'CanIf' | 'PduR' | null = null;
    try {
      const text = await fs.readFile(abs, 'utf-8');
      const matched = text.match(
        /<DEFINITION-REF[^>]*>\/AUTOSAR\/(Com|CanIf|PduR)(?:Config)?<\/DEFINITION-REF>/,
      );
      const moduleName = matched?.[1];
      if (moduleName === 'Com' || moduleName === 'CanIf' || moduleName === 'PduR') {
        detected = moduleName;
      }
    } catch {
      // leave detected=null; surface IO error in applyPlanToFile
    }
    if (detected === null) {
      const base = abs.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
      if (base.startsWith('com_') && base.endsWith('.arxml')) detected = 'Com';
      else if (base.startsWith('canif_') && base.endsWith('.arxml')) detected = 'CanIf';
      else if (base.startsWith('pdur_') && base.endsWith('.arxml')) detected = 'PduR';
    }
    if (detected === 'Com' && comPath === null) comPath = abs;
    else if (detected === 'CanIf' && canIfPath === null) canIfPath = abs;
    else if (detected === 'PduR' && pduRPath === null) pduRPath = abs;
  }

  if (comPath === null || canIfPath === null || pduRPath === null) {
    const missing: string[] = [];
    if (comPath === null) missing.push('Com');
    if (canIfPath === null) missing.push('CanIf');
    if (pduRPath === null) missing.push('PduR');
    return {
      ok: false,
      kind: 'read-failed',
      message: `Missing required Com-stack module(s) in manifest.valueArxmlPaths: ${missing.join(', ')}`,
    };
  }
  return { ok: true, value: { comPath, canIfPath, pduRPath } };
}

/**
 * Walk the manifest's `bswmdPaths`, parse each BSWMD, and return a
 * map of `moduleShortName → BswModuleDef`. Each path is
 * path-containment-checked against the manifest directory (same as
 * `resolveStackPaths`).
 */
async function loadBswmdDefs(
  projectManifestPath: string,
  manifest: DbcImportComStackRequest['manifest'],
): Promise<
  | { ok: true; value: ReadonlyMap<string, BswModuleDef> }
  | { ok: false; kind: 'read-failed'; message: string }
> {
  const manifestDir = dirname(resolve(projectManifestPath));
  const defs = new Map<string, BswModuleDef>();
  for (const rel of manifest.bswmdPaths) {
    const abs = resolve(manifestDir, rel);
    if (!(await isPathInsideReal(abs, manifestDir))) {
      return {
        ok: false,
        kind: 'read-failed',
        message: `Manifest bswmdPaths entry escapes project directory: ${rel}`,
      };
    }
    let text: string;
    try {
      text = await fs.readFile(abs, 'utf-8');
    } catch (err) {
      return {
        ok: false,
        kind: 'read-failed',
        message: `Failed to read BSWMD ${abs}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    const res = parseBswmd(text);
    if (!res.ok) {
      return {
        ok: false,
        kind: 'read-failed',
        message: `BSWMD ${abs} parse failed: ${formatBswmdError(res.error)}`,
      };
    }
    for (const mod of res.value.modules) {
      defs.set(mod.shortName, mod);
    }
  }
  return { ok: true, value: defs };
}

/**
 * Apply a single file's patch plan. Requires `moduleDef` (the BSWMD
 * `BswModuleDef` matching the ECUC module the file belongs to) so the
 * `applyAddChild` engine can validate the new container against the
 * schema.
 */
async function applyPlanToFile(
  filePath: string,
  planSteps: DbcBridgePlan['comPatches'],
  moduleDef: BswModuleDef | undefined,
): Promise<{ ok: true; value: BridgeFileOutcome } | { ok: false; message: string }> {
  let sourceText: string;
  try {
    sourceText = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    return {
      ok: false,
      message: `Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const docRes = parseArxml(sourceText);
  if (!docRes.ok) {
    return {
      ok: false,
      message: `${filePath}: parse failed: ${formatParseError(docRes.error)}`,
    };
  }
  // v1.23.0 T3 — `exactOptionalPropertyTypes: true` requires us to
  // conditionally include `moduleDef` rather than passing
  // `{ moduleDef: undefined }` (which the compiler rejects).
  const ctx: ApplyContext = moduleDef !== undefined ? { moduleDef } : {};
  const applyRes = applyPatchSteps(docRes.value, planSteps, ctx);
  // v1.23.0 T3 fix — filter "BSWMD does not declare a child container"
  // errors as advisory rather than fatal. The T2 mapper emits
  // ComSignal `add-child` steps inside a new ComIPdu, but the demo-ecu
  // BSWMDs do NOT declare a `ComSignal` child under `ComConfig` (only
  // `ComIPdu` with `ComPduId` parameter). The T2 mapper can't know the
  // BSWMD shape ahead of time — it emits the full plan; the T3 handler
  // is the layer that knows which steps the BSWMD actually validates.
  //
  // Without this filter, a single phantom step fails the whole file
  // even though the parent ComIPdu was added successfully. With the
  // filter, the bridge gracefully degrades: schema-valid steps land,
  // schema-incompatible steps are skipped (and could be surfaced to
  // the renderer as warnings in a future PATCH if the wizard wants
  // per-step diagnostics).
  //
  // Errors with kinds other than `path-not-found` (e.g.
  // `multiplicity-exceeded`, `cascade-required`, etc.) remain fatal —
  // those represent real corruption / user-error that the bridge
  // cannot recover from. `path-not-found` errors are advisory
  // (skipped silently) — see the v1.23.0 T3 rationale in the module
  // header.
  const fatalErrors = applyRes.errors.filter((e) => e.kind !== 'path-not-found');
  if (fatalErrors.length > 0) {
    const details = fatalErrors
      .map((e) => `step ${e.stepIndex} (${e.kind}): ${e.message}`)
      .join('; ');
    return { ok: false, message: `${filePath}: ${details}` };
  }
  // `applyPatchSteps.applied` already counts the steps that actually
  // mutated the document (it skips both `noChange` and errored
  // steps). The recoverable errors here are for steps that were
  // skipped — so `applied` is already the right "landed" count.
  // Previously we subtracted `recoverableErrors.length`, but that
  // double-counted: the engine doesn't increment `applied` for
  // errored steps, so subtracting again produced 0 for the common
  // "ComIPdu added, ComSignals skipped" case. Use `applied` as-is.
  const actuallyApplied = applyRes.applied;
  const serRes = serializeArxml(applyRes.doc, { sourceArxml: sourceText });
  if (!serRes.ok) {
    return {
      ok: false,
      message: `${filePath}: serialize failed: ${formatSerializeError(serRes.error)}`,
    };
  }
  return {
    ok: true,
    value: { path: filePath, serialized: serRes.value, added: actuallyApplied },
  };
}

/** Render a `ParseError` as a one-line string for IPC error envelopes. */
function formatParseError(err: ParseError): string {
  // Discriminated union: not every kind carries `path` + `message`
  // (e.g. `unsupported-version` carries `version` only, `xml-malformed`
  // carries `message` only). Stringify the discriminant so callers see
  // a uniform one-line message.
  if (err.kind === 'unsupported-version') {
    return `unsupported-version (got "${err.version}")`;
  }
  // The remaining kinds (`xml-malformed`, `missing-root`,
  // `invalid-structure`) all carry `message`; only
  // `invalid-structure` adds `path`.
  const path = 'path' in err && typeof err.path === 'string' ? ` at ${err.path}` : '';
  return `${err.kind}${path}: ${err.message}`;
}

/** Render a `SerializeError` as a one-line string. */
function formatSerializeError(err: SerializeError): string {
  return `${err.kind} at ${err.path}: ${err.message}`;
}

/** Render a `BswmdError` as a one-line string. Same shape as `ParseError`. */
function formatBswmdError(err: BswmdError): string {
  if (err.kind === 'unsupported-version') {
    return `unsupported-version (got "${err.version}")`;
  }
  const path = 'path' in err && typeof err.path === 'string' ? ` at ${err.path}` : '';
  return `${err.kind}${path}: ${err.message}`;
}

/**
 * Run the bridge against the 3 manifest-relative Com-stack files.
 * Returns each file's `BridgeFileOutcome` so the caller can compute
 * `addedCounts` AND build the write-batch input.
 */
async function runBridgeForProject(
  paths: { comPath: string; canIfPath: string; pduRPath: string },
  plan: DbcBridgePlan,
  bswmdDefs: ReadonlyMap<string, BswModuleDef>,
): Promise<
  | {
      ok: true;
      value: {
        readonly outcomes: readonly [
          BridgeFileOutcomeOrNull,
          BridgeFileOutcomeOrNull,
          BridgeFileOutcomeOrNull,
        ];
      };
    }
  | { ok: false; kind: 'read-failed' | 'bridge-failed'; message: string }
> {
  const com = await applyPlanToFile(paths.comPath, plan.comPatches, bswmdDefs.get('Com'));
  if (!com.ok) return { ok: false, kind: 'read-failed', message: com.message };
  const canIf = await applyPlanToFile(paths.canIfPath, plan.canIfPatches, bswmdDefs.get('CanIf'));
  if (!canIf.ok) return { ok: false, kind: 'read-failed', message: canIf.message };
  const pduR = await applyPlanToFile(paths.pduRPath, plan.pduRPatches, bswmdDefs.get('PduR'));
  if (!pduR.ok) return { ok: false, kind: 'read-failed', message: pduR.message };
  return {
    ok: true,
    value: { outcomes: [com.value, canIf.value, pduR.value] },
  };
}

/**
 * v1.23.0 T3 — IPC handler entry point.
 *
 * Mirrors `projectWriteArxmlBatchHandler` shape: returns a
 * discriminated union so the renderer can distinguish ok /
 * read-failed / bridge-failed / write-failed.
 */
export async function dbcImportComStackHandler(
  req: DbcImportComStackRequest,
): Promise<DbcImportComStackResponse> {
  // ---- 1. Defensive string + cap guards (mirror parseDbcHandler) ----------
  if (typeof req.dbcContent !== 'string') {
    return {
      ok: false,
      error: { kind: 'read-failed', message: 'DBC content is not a string' },
    };
  }
  if (req.dbcContent.length > DBC_MAX_BYTES) {
    return {
      ok: false,
      error: {
        kind: 'read-failed',
        message: `DBC content exceeds ${DBC_MAX_BYTES}-byte cap (${(req.dbcContent.length / (1024 * 1024)).toFixed(1)} MiB)`,
      },
    };
  }

  // ---- 2. Resolve the 3 Com-stack paths relative to the manifest ----------
  const pathRes = await resolveStackPaths(req.projectManifestPath, req.manifest);
  if (!pathRes.ok) {
    return { ok: false, error: { kind: 'read-failed', message: pathRes.message } };
  }

  // ---- 3. Require an open project (path-containment + state check) -------
  const openProject = getOpenProjectManifestPath();
  if (openProject === null || resolve(openProject) !== resolve(req.projectManifestPath)) {
    return {
      ok: false,
      error: {
        kind: 'read-failed',
        message: 'Bridge requires the target project to be open (PROJECT_OPEN not called)',
      },
    };
  }

  // ---- 4. Re-parse DBC via T1 to get signal-level detail ----------------
  const parseRes = dbcParseForBridgeHandler({
    path: 'in-memory',
    content: req.dbcContent,
  });
  if (!parseRes.ok) {
    return {
      ok: false,
      error: { kind: 'read-failed', message: parseRes.error.message },
    };
  }

  // ---- 4a. Validate targetNode against the parsed DBC nodes ------------
  // Code-review HIGH-2 — `targetNode` drives the T2 mapper's Tx-vs-Rx
  // dispatch by matching `msg.transmitter`. If it is not a DBC `BU_`
  // node name (typo, empty string, or — most commonly — an EcuC
  // `<ECU-INSTANCE>` shortName like `ECM_DEMO` which is NOT a DBC
  // concept), the bridge silently routes every message into the Rx
  // branch and produces a broken result with no diagnostic.
  //
  // The fix is to fail fast at handler entry with a message that
  // lists the actually-available DBC nodes so the T4 wizard can
  // surface a "Did you mean …" hint. The check runs AFTER
  // `dbcParseForBridgeHandler` succeeds so we have access to the
  // parsed `nodes` array.
  if (req.targetNode !== undefined && !parseRes.value.nodes.includes(req.targetNode)) {
    return {
      ok: false,
      error: {
        kind: 'read-failed',
        message: `targetNode '${req.targetNode}' is not a DBC node. Available nodes: ${parseRes.value.nodes.join(', ')}`,
      },
    };
  }

  // ---- 5. Read the 3 ECUC files + load BSWMDs in parallel ----------------
  const [texts, bswmdRes] = await Promise.all([
    Promise.all([
      fs.readFile(pathRes.value.comPath, 'utf-8'),
      fs.readFile(pathRes.value.canIfPath, 'utf-8'),
      fs.readFile(pathRes.value.pduRPath, 'utf-8'),
    ]),
    loadBswmdDefs(req.projectManifestPath, req.manifest),
  ]);
  const [comText, canIfText, pduRText] = texts;
  if (!bswmdRes.ok) {
    return { ok: false, error: { kind: 'read-failed', message: bswmdRes.message } };
  }

  // ---- 5a. v1.23.1 T1 — Snapshot the 3 original file contents ----------
  // The 2-phase write below commits all 3 files via tmp+rename. If any
  // rename fails after a previous rename succeeded, the project would
  // be left half-bridged. To avoid that, we capture the original
  // content of each file in memory (already in scope from step 5) so
  // the rollback path can restore the originals via `writeAtomic`.
  const originals = { com: comText, canIf: canIfText, pduR: pduRText };

  // ---- 6. Run the pure T2 mapper to get the patch plan ----------------
  // v1.23.0 T3 — `DbcToComStackInput.targetNode` is `readonly`, so we
  // build the input object in one expression that conditionally carries
  // `targetNode` (rather than post-mutation, which the strict
  // `exactOptionalPropertyTypes: true` setting rejects).
  const mapperInput: DbcToComStackInput =
    req.targetNode !== undefined
      ? {
          dbc: parseRes.value,
          comConfig: comText,
          canIfConfig: canIfText,
          pduRConfig: pduRText,
          targetNode: req.targetNode,
        }
      : {
          dbc: parseRes.value,
          comConfig: comText,
          canIfConfig: canIfText,
          pduRConfig: pduRText,
        };
  const plan = dbcToComStack(mapperInput);

  // ---- 7. Apply each file's plan + serialize --------------------------
  const runRes = await runBridgeForProject(pathRes.value, plan, bswmdRes.value);
  if (!runRes.ok) {
    return { ok: false, error: { kind: runRes.kind, message: runRes.message } };
  }
  const [com, canIf, pduR] = runRes.value.outcomes;
  if (com === null || canIf === null || pduR === null) {
    return {
      ok: false,
      error: { kind: 'bridge-failed', message: 'Bridge outcome missing for one of the 3 files' },
    };
  }

  // ---- 8. v1.23.1 T1 — 2-phase cross-file atomic write + snapshot rollback ----
  // Phase 1: write 3 tmp files in parallel (each is `{path}.tmp.{pid}`).
  // Phase 2: rename each tmp to its target, serially. If any rename
  //          fails, snapshot-rollback all 3 files using `writeAtomic`
  //          with the in-memory originals. Clean up any leftover tmp
  //          files. The return shape carries `rolledBack: boolean` so
  //          the renderer can render a precise user-facing diagnostic.
  const pid = process.pid;
  const comPath = com.path;
  const canIfPath = canIf.path;
  const pduRPath = pduR.path;
  const tmpCom = `${comPath}.tmp.${pid}`;
  const tmpCanIf = `${canIfPath}.tmp.${pid}`;
  const tmpPduR = `${pduRPath}.tmp.${pid}`;

  // PHASE 1 — write 3 tmp files in parallel.
  try {
    await Promise.all([
      fs.writeFile(tmpCom, com.serialized, 'utf-8'),
      fs.writeFile(tmpCanIf, canIf.serialized, 'utf-8'),
      fs.writeFile(tmpPduR, pduR.serialized, 'utf-8'),
    ]);
  } catch (e) {
    // Tmp write failed — best-effort cleanup of any partial tmp files.
    await Promise.allSettled([
      fs.unlink(tmpCom).catch(() => undefined),
      fs.unlink(tmpCanIf).catch(() => undefined),
      fs.unlink(tmpPduR).catch(() => undefined),
    ]);
    const message = e instanceof Error ? e.message : String(e);
    // Tmp-write failure means no rename has run, so the originals are
    // still on disk. rolledBack=true (no-op rollback — originals are
    // already intact).
    return {
      ok: false,
      error: { kind: 'write-failed', message, rolledBack: true },
    };
  }

  // PHASE 2 — atomic rename in serial (so we can rollback between
  // failures). Track which specific rename failed.
  const renames: ReadonlyArray<{
    readonly tmp: string;
    readonly target: string;
    readonly file: 'com' | 'canIf' | 'pduR';
  }> = [
    { tmp: tmpCom, target: comPath, file: 'com' },
    { tmp: tmpCanIf, target: canIfPath, file: 'canIf' },
    { tmp: tmpPduR, target: pduRPath, file: 'pduR' },
  ];
  let phase2Failed: { file: 'com' | 'canIf' | 'pduR'; message: string } | null = null;
  for (const r of renames) {
    try {
      await fs.rename(r.tmp, r.target);
    } catch (e) {
      phase2Failed = {
        file: r.file,
        message: e instanceof Error ? e.message : String(e),
      };
      break;
    }
  }

  if (phase2Failed !== null) {
    // PHASE 3 — best-effort rollback using the in-memory snapshot.
    // Reuse `writeAtomic` (tmp + rename) so each rollback is itself
    // atomic — a partial rollback cannot itself leave a file mid-write.
    const rollbackResults = await Promise.allSettled([
      writeAtomic(comPath, originals.com),
      writeAtomic(canIfPath, originals.canIf),
      writeAtomic(pduRPath, originals.pduR),
    ]);
    // Clean up any leftover tmp files (the failed rename left its
    // tmp behind; the others were already moved to the targets).
    await Promise.allSettled([
      fs.unlink(tmpCom).catch(() => undefined),
      fs.unlink(tmpCanIf).catch(() => undefined),
      fs.unlink(tmpPduR).catch(() => undefined),
    ]);
    const rolledBack = rollbackResults.every((r) => r.status === 'fulfilled');
    return {
      ok: false,
      error: { kind: 'write-failed', message: phase2Failed.message, rolledBack },
    };
  }

  // Success — defensive cleanup of any tmp files (should already be
  // moved, but unlink is a no-op if the path is gone).
  await Promise.allSettled([
    fs.unlink(tmpCom).catch(() => undefined),
    fs.unlink(tmpCanIf).catch(() => undefined),
    fs.unlink(tmpPduR).catch(() => undefined),
  ]);

  // ---- 9. Build addedCounts from each file's `applied` counter --------
  return {
    ok: true,
    value: {
      addedCounts: {
        com: com.added,
        canIf: canIf.added,
        pduR: pduR.added,
      },
    },
  };
}

export { formatParseError, formatSerializeError };

export type { DbcBridgePlan };
