// v1.27.0 — Dcm config pipeline orchestrator.
//
// Three-step flow:
//   1. Cross-document ODX-Dcm linkage validation (fail-fast).
//      Every xlsx didRef / routineRef must resolve to a shortName
//      present in the ODX extract. Throws with diff if not.
//   2. ODX extract via v1.24.0's odxToDiagnosticExtract (Dcm half).
//   3. Service-kind tally + BSWMD presence check (Dcm module required).
//
// T4 (dcmConfigHandler IPC) is responsible for applying xlsx service
// add-children on top of the ODX-extract ARXML and serializing to disk.
// T3 surfaces the ODX-derived half as dcmConfigXml (a marker); the
// actual apply+serialize step is in T4 to keep the orchestrator
// concern-narrow (linkage + counts + ODX extract).
//
// Reuses: v1.24.0 odxToDiagnosticExtract, v1.26.0 BswModuleDef /
// lookupContainerDef infrastructure, EcucInstanceRow cast pattern
// (T2 widened via call-site cast; production union stays scoped).

import type {
  EcucInstanceRow,
  OdxDidSummary,
  OdxRoutineSummary,
  OdxSummary,
} from '../../shared/types.js';
import type { BswModuleDef } from '../project/bswmd.js';

import { odxToDiagnosticExtract } from './odxToDiagnosticExtract.js';

export type DcmServiceKind =
  | 'DcmClearDTC'
  | 'DcmReadDTC'
  | 'DcmReadDataById'
  | 'DcmWriteDataById'
  | 'DcmRoutineControl';

export interface DcmConfigResult {
  /** ODX-derived Dcm extract (DIDs + Routines as standalone ARXML). */
  readonly dcmConfigXml: string;
  /** Count of DIDs the ODX contributed (mirrors v1.24.0 stats). */
  readonly odxLinkedDcmDspCount: number;
  /** Count of Routines the ODX contributed (mirrors v1.24.0 stats). */
  readonly odxLinkedRoutineCount: number;
  /** Per-kind tally of xlsx rows (5 kinds). */
  readonly serviceCounts: Readonly<Record<DcmServiceKind, number>>;
}

const SERVICE_KINDS: readonly DcmServiceKind[] = [
  'DcmClearDTC',
  'DcmReadDTC',
  'DcmReadDataById',
  'DcmWriteDataById',
  'DcmRoutineControl',
];

/**
 * Collect all DID shortNames + Routine shortNames from the ODX summary.
 * Used to build the "available alternatives" diff message in linkage errors.
 */
function collectOdxDidsAndRoutines(odx: OdxSummary): {
  readonly dids: readonly OdxDidSummary[];
  readonly routines: readonly OdxRoutineSummary[];
} {
  return { dids: odx.dids, routines: odx.routines };
}

/**
 * Resolve a xlsx row's didRef / routineRef against the ODX shortNames.
 * Returns the matching shortName or null if absent.
 */
function resolveOdxReference(
  odx: OdxSummary,
  kind: 'didRef' | 'routineRef',
  shortName: string,
): string | null {
  if (kind === 'didRef') {
    return odx.dids.some((d) => d.shortName === shortName) ? shortName : null;
  }
  return odx.routines.some((r) => r.shortName === shortName) ? shortName : null;
}

/**
 * Validate that all xlsx rows' didRef / routineRef params resolve to ODX
 * shortNames. Throws ODX-Dcm linkage broken if any reference is missing.
 *
 * The diff message includes available alternatives (first 10 DID shortNames
 * or all Routine shortNames) so users can correct the .xlsx row directly.
 */
function validateOdxLinkage(odx: OdxSummary, rows: readonly EcucInstanceRow[]): void {
  for (const row of rows) {
    const params = row.params as Readonly<Record<string, string | number | boolean | null>>;
    // Cast through `unknown` because EcucInstanceRow.sheet is the narrow
    // Com/CanIf/PduR union (per T2 concern 2 — production types stay scoped;
    // Dcm kinds widen via call-site cast). Mirrors xlsxDcmServicesToEcucBatch
    // SHEET_TO_MODULE pattern.
    const sheetKind = row.sheet as DcmServiceKind;
    if (sheetKind === 'DcmReadDataById' || sheetKind === 'DcmWriteDataById') {
      const didRef = params.didRef;
      if (typeof didRef === 'string' && didRef.length > 0) {
        if (resolveOdxReference(odx, 'didRef', didRef) === null) {
          const { dids } = collectOdxDidsAndRoutines(odx);
          const sample = dids
            .slice(0, 10)
            .map((d) => d.shortName)
            .join(', ');
          const more = dids.length > 10 ? ` (and ${dids.length - 10} more)` : '';
          throw new Error(
            `ODX-Dcm linkage broken: Sheet '${row.sheet}', row '${row.shortName}': ` +
              `referenced DID '${didRef}' not found. Available DIDs from ODX: ${sample}${more}.`,
          );
        }
      }
    }
    if (sheetKind === 'DcmRoutineControl') {
      const routineRef = params.routineRef;
      if (typeof routineRef === 'string' && routineRef.length > 0) {
        if (resolveOdxReference(odx, 'routineRef', routineRef) === null) {
          const { routines } = collectOdxDidsAndRoutines(odx);
          const routineList = routines.map((r) => r.shortName).join(', ') || '<none>';
          throw new Error(
            `ODX-Dcm linkage broken: Sheet '${row.sheet}', row '${row.shortName}': ` +
              `referenced Routine '${routineRef}' not found. Available Routines from ODX: ${routineList}.`,
          );
        }
      }
    }
  }
}

/**
 * Tally xlsx rows by service kind. Unknown sheet kinds are ignored
 * (the T2 mapper catches them with a regex-stable error before we
 * get here in production; this loop is best-effort count only).
 */
function tallyServiceCounts(
  rows: readonly EcucInstanceRow[],
): Readonly<Record<DcmServiceKind, number>> {
  const counts: Record<DcmServiceKind, number> = {
    DcmClearDTC: 0,
    DcmReadDTC: 0,
    DcmReadDataById: 0,
    DcmWriteDataById: 0,
    DcmRoutineControl: 0,
  };
  for (const row of rows) {
    // Cast through DcmServiceKind union — see validateOdxLinkage note
    // re: EcucInstanceRow.sheet being scoped to Com/CanIf/PduR kinds.
    const kind = row.sheet as DcmServiceKind;
    if (SERVICE_KINDS.includes(kind)) {
      counts[kind] += 1;
    }
  }
  return counts;
}

export interface DcmConfigPipelineRequest {
  readonly odx: OdxSummary;
  readonly xlsxRows: readonly EcucInstanceRow[];
  readonly bswmds: ReadonlyMap<string, BswModuleDef>;
}

/**
 * Orchestrate ODX-Dcm cross-document config generation.
 *
 * Steps:
 *   1. Validate ODX-Dcm linkage BEFORE any work (fail-fast, regex-stable).
 *   2. Produce ODX-derived Dcm extract via v1.24.0's odxToDiagnosticExtract.
 *   3. Verify Dcm BSWMD is present (needed by T4 to resolve xlsx paths).
 *   4. Tally xlsx rows per service kind for the caller's UI summary.
 *
 * The returned `dcmConfigXml` carries the ODX extract half (DIDs +
 * Routines as standalone ARXML). T4 stitches xlsx service add-children
 * on top via applyPatchSteps and serializes the final document.
 */
export async function dcmConfigPipeline(
  request: DcmConfigPipelineRequest,
): Promise<DcmConfigResult> {
  // 1. Cross-document linkage validation (fail-fast).
  validateOdxLinkage(request.odx, request.xlsxRows);

  // 2. ODX-derived Dcm extract (DIDs + Routines as standalone ARXML).
  const extract = odxToDiagnosticExtract({ odx: request.odx });

  // 3. BSWMD presence check. T4 needs Dcm module to resolve xlsx paths;
  //    surface the same error message here so the orchestrator's contract
  //    is self-contained (T4 can rely on the orchestrator's validation).
  const dcmBswmd = request.bswmds.get('Dcm');
  if (dcmBswmd === undefined) {
    throw new Error(
      `BSWMD map missing module 'Dcm' (needed for Dcm service configs). ` +
        `Provided modules: ${Array.from(request.bswmds.keys()).join(', ') || '<empty>'}`,
    );
  }

  // 4. Service-kind tally for the caller's UI summary.
  const serviceCounts = tallyServiceCounts(request.xlsxRows);

  return {
    dcmConfigXml: extract.dcmContent,
    odxLinkedDcmDspCount: extract.stats.didCount,
    odxLinkedRoutineCount: extract.stats.routineCount,
    serviceCounts,
  };
}
