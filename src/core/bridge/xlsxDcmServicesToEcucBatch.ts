// v1.27.0 — Dcm service mapper (BSWMD-driven, mirrors v1.26.0 xlsx mapper).
//
// Two-layer sheet-name mapping (the abstracted-vs-canonical seam):
//   SHEET_TO_MODULE            : user-facing xlsx sheet name → BswModuleDef key
//                                (5 entries; all map to 'Dcm' since Dcm is the
//                                only module owning Dcm service containers).
//   SHEET_TO_CONTAINER_SHORT_NAME: user-facing xlsx sheet name → canonical
//                                AUTOSAR BSWMD container shortName (DcmDsp*
//                                prefix; 4 canonical shortNames shared by
//                                the 5 user-facing sheet names — see note).
//
// Note on 5 vs 4: xlsx has 5 sheet kinds (DcmClearDTC / DcmReadDTC /
// DcmReadDataById / DcmWriteDataById / DcmRoutineControl) but canonical
// AUTOSAR uses DcmDspDid as the shared parent for both 0x22 + 0x2E.
// Mapper differentiates via per-row definitionRef emitted in PatchSteps.
//
// One row → one `add-child` + per-param `set-param` PatchSteps.
// Throws on unrecognized sheet (YAGNI guard), missing module, or missing container.

import type { PatchStep } from '../../shared/headless/ipc-contract.js';
import type { EcucInstanceRow } from '../../shared/types.js';
import { lookupContainerDef, type BswModuleDef } from '../project/bswmd.js';

export type { EcucInstanceRow };

type DcmSheetKind =
  | 'DcmClearDTC'
  | 'DcmReadDTC'
  | 'DcmReadDataById'
  | 'DcmWriteDataById'
  | 'DcmRoutineControl';

const SHEET_TO_MODULE = {
  DcmClearDTC: 'Dcm',
  DcmReadDTC: 'Dcm',
  DcmReadDataById: 'Dcm',
  DcmWriteDataById: 'Dcm',
  DcmRoutineControl: 'Dcm',
} as const;

const SHEET_TO_CONTAINER_SHORT_NAME: Readonly<Record<DcmSheetKind, string>> = {
  DcmClearDTC: 'DcmDspClearDTC',
  DcmReadDTC: 'DcmDspReadDTCInformation',
  DcmReadDataById: 'DcmDspDid',
  DcmWriteDataById: 'DcmDspDid',
  DcmRoutineControl: 'DcmDspRoutine',
};

export function xlsxDcmServicesToEcucBatch(
  rows: readonly EcucInstanceRow[],
  bswmds: ReadonlyMap<string, BswModuleDef>,
): PatchStep[] {
  const steps: PatchStep[] = [];
  for (const row of rows) {
    if (!row.shortName || row.shortName.length === 0) {
      throw new Error(`EcucInstanceRow missing shortName (sheet=${row.sheet})`);
    }
    if (!(row.sheet in SHEET_TO_MODULE)) {
      throw new Error(
        `Unrecognized sheet name: '${row.sheet}' (allowed: ${Object.keys(SHEET_TO_MODULE).join(', ')})`,
      );
    }
    const moduleShortName = SHEET_TO_MODULE[row.sheet as DcmSheetKind];
    const lookupKey = SHEET_TO_CONTAINER_SHORT_NAME[row.sheet as DcmSheetKind];
    const bswmd = bswmds.get(moduleShortName);
    if (bswmd === undefined) {
      throw new Error(
        `BSWMD map missing module '${moduleShortName}' (needed by sheet '${row.sheet}'). ` +
        `Provided modules: ${Array.from(bswmds.keys()).join(', ') || '<empty>'}`,
      );
    }
    const containerDef = lookupContainerDef(bswmd, lookupKey);
    if (containerDef === null) {
      throw new Error(
        `Container '${lookupKey}' not found in BSWMD module '${moduleShortName}'. ` +
        `Verify the BSWMD declares this canonical AUTOSAR container shortName.`,
      );
    }
    const parentPath = containerDef.path;
    const containerPath = `${parentPath}/${row.shortName}`;
    const addChildBase = {
      op: 'add-child' as const,
      parentPath,
      shortName: row.shortName,
      ...(row.definitionRef !== undefined && { definitionRef: row.definitionRef }),
    };
    steps.push(addChildBase);
    for (const [paramName, value] of Object.entries(row.params)) {
      if (value === null || value === undefined) continue;
      steps.push({
        op: 'set-param',
        containerPath,
        paramName,
        value: value as string | number | boolean,
      });
    }
  }
  return steps;
}