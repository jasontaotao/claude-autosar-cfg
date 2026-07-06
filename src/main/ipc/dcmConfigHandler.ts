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
// All errors propagate via `DcmConfigResponse.error.message` so the
// renderer can regex-match the fail-fast classes. The handler NEVER
// throws — every branch returns a `DcmConfigResponse`.
//
// Trade-off: `outputPath` defaults to `<projectRoot>/Dcm_Config.arxml`
// where `projectRoot` is derived from the ODX file's directory. This
// matches v1.24.0's `odxImportDiagnosticExtractHandler` convention.
//
// v1.30.0 MINOR — add `bswmdPath?: string` for real-OEM override;
// add `appliedStepCount: number` to the result (computed pre-apply
// from `serviceSteps.length`). Channel + types migrated to
// `src/shared/ipc-contract.ts` (`DCM_CONFIG`) and `src/shared/types.ts`
// (`DcmConfigRequest`, `DcmConfigResponse`, `DcmConfigHandlerResult`)
// so the IPC envelope can be consumed by `main/ipc/register.ts` and
// `src/preload/index.ts` without crossing the shared/main boundary.

import { existsSync, readFileSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';

import { applyPatchesToExtract } from '../../core/arxml/extractPatch.js';
import { dcmConfigPipeline } from '../../core/bridge/dcmConfigPipeline.js';
import { DCM_MODULE_SHORT_NAME } from '../../core/bridge/dcmConstants.js';
import { parseDemoBswmds } from '../../core/bridge/demoBswmdLoader.js';
import { xlsxDcmServicesToEcucBatch } from '../../core/bridge/xlsxDcmServicesToEcucBatch.js';
import type {
  DcmConfigHandlerResult,
  DcmConfigResponse,
  EcucInstanceRow,
} from '../../shared/types.js';
import { writeAtomic } from '../io/writeAtomic.js';

import { parseOdxHandler } from './parseOdxHandler.js';

/** Re-export the canonical IPC envelope so existing importers (e.g.
 *  `src/main/ipc/__tests__/dcmConfigHandler.test.ts`) continue to
 *  bind to the same type identity. v1.30.0 MINOR moved the
 *  definition upstream so the IPC contract lives in `shared/types.ts`. */
export type { DcmConfigHandlerResult };

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
 * v1.30.0 MINOR — still the fallback when `args.bswmdPath` is
 * omitted. When the caller provides `bswmdPath`, this helper is
 * bypassed entirely (no fall-through to the sample fixture — fail-loud
 * over fail-soft when the explicit override path is unreadable).
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
 * Resolve the BSWMD path per the v1.30.0 precedence rule:
 *   1. Caller-provided `bswmdPath` wins (real-OEM override).
 *   2. Fall back to `locateDcmBswmdPath(odxPath)` (sample fixture
 *      discovery).
 *
 * No fall-through from (1) to (2): a real-OEM path is a declaration,
 * not a hint; if the caller-supplied path is unreadable the handler
 * surfaces a specific `BSWMD file unreadable` error (caught at the
 * `readFileSync` site, not via the catch-all).
 */
function resolveDcmBswmdPath(args: DcmConfigHandlerArgs): string {
  return args.bswmdPath ?? locateDcmBswmdPath(args.odxPath);
}

/**
 * Patch the ODX-derived extract ARXML (string) with xlsx service
 * PatchSteps. Returns the serialized final XML.
 *
 * v1.28.0 MINOR — the patch + serialize + prefix-strip logic was
 * promoted to `src/core/arxml/extractPatch.ts` as
 * `applyPatchesToExtract` so the v1.27.5 PATCH real-OEM end-to-end
 * test could import the same wrapper (eliminating ~10 LoC of
 * inline duplication). The IPC handler now imports it at file top.
 */
export interface DcmConfigHandlerArgs {
  /** Absolute path of the ODX-D file on disk. */
  readonly odxPath: string;
  /** xlsx rows carrying the 5 Dcm service kinds + per-row params. */
  readonly xlsxRows: readonly EcucInstanceRow[];
  /** Optional output path; defaults to `<odxDir>/Dcm_Config.arxml`. */
  readonly outputPath?: string;
  /**
   * v1.30.0 MINOR — real-OEM BSWMD override. When set, the handler
   * reads this file directly and skips the
   * `<samples>/arxml/demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml` discovery
   * walk. The file MUST be a parseable Dcm BSWMD with the canonical
   * AUTOSAR container shortNames (per v1.25.1 PATCH lesson).
   */
  readonly bswmdPath?: string;
}

/**
 * IPC entry point: `dcm:config`.
 *
 * Signature:
 *   dcmConfigHandler({ odxPath, xlsxRows, outputPath?, bswmdPath? })
 *     → Promise<DcmConfigResponse>
 *
 * 5 fail-fast error classes (all surfaced via `error.message` so
 * renderer-side `dcm:config` can regex-match):
 *   - ENOENT                — ODX file unreadable
 *   - ODX-Dcm linkage broken — propagated from T3
 *   - BSWMD map missing …   — propagated from T3 (no `Dcm` module)
 *   - Container … not found — propagated from T2 (BSWMD shape drift)
 *   - Write failed / serialize / patch — atomic-write / engine errors
 *
 * v1.30.0 MINOR adds 1 new error class surfaced via the explicit
 * `bswmdPath` readFileSync site (NOT via the catch-all):
 *   - BSWMD file unreadable   — explicit readFileSync catch when
 *                                args.bswmdPath is provided; the
 *                                renderer can regex-match this class
 *                                to surface a "real-OEM path not
 *                                found" toast. Sample-fixture discovery
 *                                still surfaces its own
 *                                `Dcm BSWMD fixture not found via
 *                                discovery` error via the catch-all.
 */
export async function dcmConfigHandler(args: DcmConfigHandlerArgs): Promise<DcmConfigResponse> {
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

    // 3. Resolve + parse T1's Dcm BSWMD fixture (or caller override).
    //    v1.30.0 MINOR — explicit-bswmdPath read is wrapped in a
    //    narrow try/catch to surface a renderer-distinguishable
    //    `BSWMD file unreadable` error class.
    const dcmBswmdPath = resolveDcmBswmdPath(args);
    let dcmBswmdXml: string;
    try {
      dcmBswmdXml = readFileSync(dcmBswmdPath, 'utf-8');
    } catch (e) {
      return {
        ok: false,
        error: {
          message: `BSWMD file unreadable: ${e instanceof Error ? e.message : String(e)}`,
          cause: e,
        },
      };
    }
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

    // v1.30.0 MINOR — compute `appliedStepCount` PRE-apply from
    // serviceSteps.length so the counter is meaningful even when the
    // patch engine reports errors downstream. Raw count represents
    // "what the mapper intended to do" (complementary to the engine's
    // post-apply `applied` field, which lands at 0 on partial failure).
    const appliedStepCount = serviceSteps.length;

    // 6. Apply the service patches to the ODX-derived extract doc and
    //    serialize. This stitches both halves into a single ARXML.
    //    `dcmConfigPipeline` (step 4) already pre-flight-checks that the
    //    Dcm BSWMD is present (it throws `BSWMD map missing module 'Dcm'`
    //    which is caught by the outer `try`/`catch` below and surfaced
    //    as `DcmConfigResponse.error`). The non-null assertion narrows
    //    the type for `applyPatchesToExtract`'s required `BswModuleDef`
    //    parameter.
    const dcmModuleDef = bswmds.get(DCM_MODULE_SHORT_NAME)!;
    const patched = applyPatchesToExtract(pipelineResult.dcmConfigXml, serviceSteps, dcmModuleDef);
    if (!patched.ok) {
      return { ok: false, error: { message: patched.error } };
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
    //    XML the renderer should preview, attach the resolved
    //    `outputPath` so the renderer can navigate to the file, and
    //    (v1.30.0 MINOR) include `appliedStepCount` so the renderer
    //    can render a "N steps applied" counter on the success toast.
    const result: DcmConfigHandlerResult = {
      dcmConfigXml: finalXml,
      odxLinkedDcmDspCount: pipelineResult.odxLinkedDcmDspCount,
      odxLinkedRoutineCount: pipelineResult.odxLinkedRoutineCount,
      serviceCounts: pipelineResult.serviceCounts,
      outputPath,
      appliedStepCount,
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
