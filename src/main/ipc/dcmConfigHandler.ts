// v1.27.0 T4 — Dcm config IPC handler.
//
// Stitch pipeline:
//   1. Read ODX file from disk + parse via v1.22.0's `parseOdxHandler` →
//      `OdxSummary`.
//   2. Load T1's Dcm BSWMD (canonical demo-ecu fixture) into a single-
//      entry `BswModuleDef` map via `parseDemoBswmds`.
//   3. Run T3's `dcmConfigPipeline` — validates ODX-Dcm linkage (fail-
//      fast) and produces the ODX-derived `dcmConfigXml` (DIDs +
//      Routines as standalone ARXML).
//   4. Run T2's `xlsxDcmServicesToEcucBatch` → per-row `add-child` +
//      `set-param` PatchSteps.
//   5. Re-parse the ODX-extract ARXML (so we have a mutable
//      `ArxmlDocument`) and apply the service patches via the mutation
//      engine's `applyPatchSteps`.
//   6. Serialize via `serializeArxml` and atomically write to
//      `outputPath` via v1.23.0's `writeAtomic` (tmp + rename + fsync).
//
// All errors propagate via `IpcResult.error.message` so the renderer
// can regex-match the 5 fail-fast classes (UNKNOWN SHEET / MODULE
// MISSING / CONTAINER MISSING / ODX-DCM LINKAGE BROKEN / WRITE FAILED).
// The handler NEVER throws — every branch returns an `IpcResult`.
//
// Trade-off: `outputPath` defaults to `<projectRoot>/Dcm_Config.arxml`
// where `projectRoot` is derived from the ODX file's directory. This
// matches v1.24.0's `odxImportDiagnosticExtractHandler` convention
// (outputDir defaults to the .odx-d's parent dir).

import { existsSync, readFileSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';

import { parseArxml } from '../../core/arxml/parser.js';
import { serializeArxml } from '../../core/arxml/serializer.js';
import { dcmConfigPipeline, type DcmConfigResult } from '../../core/bridge/dcmConfigPipeline.js';
import { DCM_MODULE_SHORT_NAME } from '../../core/bridge/dcmConstants.js';
import { parseDemoBswmds } from '../../core/bridge/demoBswmdLoader.js';
import { xlsxDcmServicesToEcucBatch } from '../../core/bridge/xlsxDcmServicesToEcucBatch.js';
import { applyPatchSteps, type ApplyContext } from '../../core/mutation/applyPatchSteps.js';
import type { BswModuleDef } from '../../core/project/bswmd.js';
import type { PatchStep } from '../../shared/headless/ipc-contract.js';
import type { EcucInstanceRow } from '../../shared/types.js';
import { writeAtomic } from '../io/writeAtomic.js';

import { parseOdxHandler } from './parseOdxHandler.js';

/**
 * Generic `IpcResult<T>` envelope — typed variant of the v1.25.0
 * `{ok, error: {kind, message}}` shape. The renderer-side `dcm:config`
 * bridge can unwrap without needing a bespoke envelope per call.
 */
export type IpcResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly message: string; readonly cause?: unknown } };

/**
 * IPC return shape — the pipeline's `DcmConfigResult` augmented with
 * the resolved `outputPath` so the renderer can navigate to the file
 * (e.g. open in OS file explorer). T3's `DcmConfigResult` does not
 * include this field; the handler attaches it on the way out.
 */
export type DcmConfigHandlerResult = DcmConfigResult & { readonly outputPath: string };

/**
 * Locate the demo-ecu Dcm BSWMD fixture. The fixture ships at
 * `samples/arxml/demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml` (added by v1.27.0
 * T1). We resolve the path via two strategies:
 *   1. Walk up from `process.cwd()` until we find a `samples/arxml/
 *      demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml` subtree. This is the dev
 *      case (electron / vite-serve runs from the repo root).
 *   2. Walk up from the ODX file's directory. This handles the
 *      packaged-app case (the user's project may live anywhere) AND
 *      the test case (where cwd may not have a `samples/` tree).
 *
 * v1.28.0+ will extend this with a real-OEM override path (project
 * manifest may declare an alternate BSWMD location).
 */
function locateDcmBswmdPath(odxPath: string): string {
  // Strategy 1: walk up from cwd.
  const fromCwd = walkUpForFixture(process.cwd());
  if (fromCwd !== null) return fromCwd;
  // Strategy 2: walk up from the ODX file's directory.
  const fromOdx = walkUpForFixture(pathResolve(odxPath, '..'));
  if (fromOdx !== null) return fromOdx;
  throw new Error(
    `Dcm BSWMD fixture not found via discovery. ` +
      `Searched from cwd='${process.cwd()}' and from ODX dir='${pathResolve(odxPath, '..')}'. ` +
      `Expected '<some-dir>/samples/arxml/demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml' (T1 demo-ecu fixture).`,
  );
}

/** Walk up from `start` up to 6 levels looking for the T1 Dcm BSWMD
 *  fixture under `<dir>/samples/arxml/demo-ecu/bswmd/`. Returns the
 *  absolute path on hit, `null` on miss. */
function walkUpForFixture(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 6; i += 1) {
    const candidate = pathResolve(
      dir,
      'samples',
      'arxml',
      'demo-ecu',
      'bswmd',
      'Bsw_Dcm_Bswmd.arxml',
    );
    if (existsSync(candidate)) return candidate;
    const parent = pathResolve(dir, '..');
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * Patch the ODX-derived extract ARXML (string) with xlsx service
 * PatchSteps. Returns the serialized final XML.
 *
 * Three steps:
 *   a. parseArxml(extractXml) → ArxmlDocument
 *   b. applyPatchSteps(doc, serviceSteps) → ArxmlDocument
 *   c. serializeArxml(doc) → string
 *
 * Errors from any of the three are propagated as IpcResult.error by
 * the caller.
 */
function applyPatchesToExtract(
  extractXml: string,
  serviceSteps: readonly PatchStep[],
  dcmModuleDef: BswModuleDef,
): { ok: true; value: string } | { ok: false; message: string } {
  const docRes = parseArxml(extractXml);
  if (!docRes.ok) {
    // `unsupported-version` carries `version` instead of `message`;
    // other variants carry `message`. Normalize to a string.
    const detail =
      'message' in docRes.error
        ? docRes.error.message
        : `version=${'version' in docRes.error ? docRes.error.version : '<unknown>'}`;
    return {
      ok: false,
      message: `Failed to parse ODX-extract ARXML: ${docRes.error.kind} ${detail}`,
    };
  }
  // Prepend `/<docRootPkg>/` so the mutation engine's
  // `findContainerByPath` can resolve the BSWMD-relative paths emitted
  // by `xlsxDcmServicesToEcucBatch`. Mirrors
  // `xlsxEcucBatchImportHandler.applyStepsToFile:79-81`.
  const docRootPkg = docRes.value.packages[0]?.shortName;
  const resolvedSteps =
    docRootPkg !== undefined
      ? serviceSteps.map((s) => prefixDocRootPath(s, docRootPkg))
      : serviceSteps;
  // v1.27.x PATCH — pass `moduleDef` so `applyAddChild` can validate the
  // new container against the BSWMD schema. Without it, every
  // `add-child` step fails with `no-bswmd-for-module` (see
  // `core/mutation/applyPatchSteps.ts:288-297`). The handler has Dcm
  // BSWMD context (from `dcmConfigPipeline`'s pre-flight check), so we
  // narrow the parameter to `BswModuleDef` (required) rather than
  // optional — same shape as `xlsxEcucBatchImportHandler.applyStepsToFile`.
  const ctx: ApplyContext = { moduleDef: dcmModuleDef };
  const applyRes = applyPatchSteps(docRes.value, resolvedSteps, ctx);
  // v1.27.x PATCH — spec §275 (2026-07-05-v1-27-0-minor-design.md:275):
  // "All 5 fail-fast errors are thrown inside `dcmConfigPipeline` or
  // `dcmConfigHandler` — never emitted as patches that get silently
  // filtered". Pre-patch, the filter at lines 155-156 (now removed)
  // silently swallowed `path-not-found` + `no-bswmd-for-module`,
  // returning `ok: true` with silently-missing data. Any non-empty
  // error set now fails fast via `IpcResult.error`.
  if (applyRes.errors.length > 0) {
    return {
      ok: false,
      message: `Patch application failed: ${applyRes.errors
        .map((e) => `${e.kind}: ${e.message}`)
        .join('; ')}`,
    };
  }
  const serRes = serializeArxml(applyRes.doc, { sourceArxml: extractXml });
  if (!serRes.ok) {
    return {
      ok: false,
      message: `Serialize failed: ${serRes.error.kind} at ${serRes.error.path}: ${serRes.error.message}`,
    };
  }
  return { ok: true, value: serRes.value };
}

/** Prepend `/<docRootPkg>/` to step paths so the mutation engine can
 *  resolve BSWMD-relative paths. Mirrors the same helper in
 *  `xlsxEcucBatchImportHandler:144-163`. */
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

export interface DcmConfigHandlerArgs {
  /** Absolute path of the ODX-D file on disk. */
  readonly odxPath: string;
  /** xlsx rows carrying the 5 Dcm service kinds + per-row params. */
  readonly xlsxRows: readonly EcucInstanceRow[];
  /** Optional output path; defaults to `<odxDir>/Dcm_Config.arxml`. */
  readonly outputPath?: string;
}

/**
 * IPC entry point: `dcm:config`.
 *
 * Signature:
 *   dcmConfigHandler({ odxPath, xlsxRows, outputPath? })
 *     → Promise<IpcResult<DcmConfigResult>>
 *
 * 5 fail-fast error classes (all surfaced via `error.message` so
 * renderer-side `dcm:config` can regex-match):
 *   - ENOENT                — ODX file unreadable
 *   - ODX-Dcm linkage broken — propagated from T3
 *   - BSWMD map missing …   — propagated from T3 (no `Dcm` module)
 *   - Container … not found — propagated from T2 (BSWMD shape drift)
 *   - Write failed / serialize / patch — atomic-write / engine errors
 */
export async function dcmConfigHandler(
  args: DcmConfigHandlerArgs,
): Promise<IpcResult<DcmConfigHandlerResult>> {
  try {
    // 1. Read ODX file from disk.
    let odxXml: string;
    try {
      odxXml = readFileSync(args.odxPath, 'utf-8');
    } catch (e) {
      return {
        ok: false,
        error: {
          message: `ODX file unreadable: ${e instanceof Error ? e.message : String(e)}`,
          cause: e,
        },
      };
    }

    // 2. Parse ODX via v1.22.0's parseOdxHandler (returns OdxSummary).
    const odxParse = parseOdxHandler({ content: odxXml });
    if (!odxParse.ok) {
      return {
        ok: false,
        error: {
          message: `ODX parse failed: ${odxParse.error.message}`,
          cause: odxParse.error,
        },
      };
    }
    const odx = odxParse.value;

    // 3. Locate + parse T1's Dcm BSWMD fixture.
    const dcmBswmdPath = locateDcmBswmdPath(args.odxPath);
    const dcmBswmdXml = readFileSync(dcmBswmdPath, 'utf-8');
    const bswmds = parseDemoBswmds(new Map([[DCM_MODULE_SHORT_NAME, dcmBswmdXml]]));

    // 4. Run T3 orchestrator (validates ODX-Dcm linkage, produces
    //    ODX-derived dcmConfigXml, tallies service kinds).
    const pipelineResult = await dcmConfigPipeline({
      odx,
      xlsxRows: args.xlsxRows,
      bswmds,
    });

    // 5. Generate xlsx service PatchSteps via T2 mapper.
    const serviceSteps = xlsxDcmServicesToEcucBatch(args.xlsxRows, bswmds);

    // 6. Apply the service patches to the ODX-derived extract doc and
    //    serialize. This stitches both halves into a single ARXML.
    //    `dcmConfigPipeline` (step 4) already pre-flight-checks that the
    //    Dcm BSWMD is present (it throws `BSWMD map missing module 'Dcm'`
    //    which is caught by the outer `try`/`catch` below and surfaced
    //    as `IpcResult.error`). The non-null assertion narrows the type
    //    for `applyPatchesToExtract`'s required `BswModuleDef` parameter.
    const dcmModuleDef = bswmds.get(DCM_MODULE_SHORT_NAME)!;
    const patched = applyPatchesToExtract(pipelineResult.dcmConfigXml, serviceSteps, dcmModuleDef);
    if (!patched.ok) {
      return { ok: false, error: { message: patched.message } };
    }
    const finalXml = patched.value;

    // 7. Atomic write with snapshot rollback (v1.23.0 `writeAtomic`:
    //    tmp + rename + fsync; the OS rename is atomic on POSIX and
    //    MoveFileEx(MOVEFILE_REPLACE_EXISTING) on Windows).
    const projectRoot = pathResolve(args.odxPath, '..');
    const outputPath = args.outputPath ?? pathResolve(projectRoot, 'Dcm_Config.arxml');
    try {
      await writeAtomic(outputPath, finalXml);
    } catch (e) {
      return {
        ok: false,
        error: {
          message: `Atomic write failed: ${e instanceof Error ? e.message : String(e)}`,
          cause: e,
        },
      };
    }

    // 8. Build the result. Re-export the pipeline's counters verbatim
    //    (already includes the 5-kind tally from T3), surface the final
    //    XML the renderer should preview, and attach the resolved
    //    `outputPath` so the renderer can navigate to the file.
    const result: DcmConfigHandlerResult = {
      dcmConfigXml: finalXml,
      odxLinkedDcmDspCount: pipelineResult.odxLinkedDcmDspCount,
      odxLinkedRoutineCount: pipelineResult.odxLinkedRoutineCount,
      serviceCounts: pipelineResult.serviceCounts,
      outputPath,
    };
    return { ok: true, value: result };
  } catch (e) {
    // T3's `dcmConfigPipeline` throws on linkage / BSWMD errors; the
    // mapper throws on unrecognized sheet / missing container. Catch
    // all here so the IPC contract never throws to the renderer.
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { message, cause: e } };
  }
}
