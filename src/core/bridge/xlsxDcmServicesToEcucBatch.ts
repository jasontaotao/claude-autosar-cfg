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

import type { DcmServiceKind } from './dcmConfigPipeline.js';
import { DCM_MODULE_SHORT_NAME } from './dcmConstants.js';

export type { EcucInstanceRow };

// v1.27.0 T4 — T2 mapper used a private `DcmSheetKind` (same 5-element
// union as T3's `DcmServiceKind`). T3 review flagged the duplication;
// re-export the canonical name from T3 so the mapper, the orchestrator,
// and the IPC handler all share one source of truth.
export type DcmSheetKind = DcmServiceKind;

const SHEET_TO_MODULE: Readonly<Record<DcmSheetKind, string>> = {
  DcmClearDTC: DCM_MODULE_SHORT_NAME,
  DcmReadDTC: DCM_MODULE_SHORT_NAME,
  DcmReadDataById: DCM_MODULE_SHORT_NAME,
  DcmWriteDataById: DCM_MODULE_SHORT_NAME,
  DcmRoutineControl: DCM_MODULE_SHORT_NAME,
};

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
    // v1.27.2 PATCH — switch from leaf-parent add (`Dcm/DcmDspDid`) to
    // module-level sibling add (`Dcm` + `definitionRef`).
    //
    // BSWMD's `DcmDspDid` / `DcmDspRoutine` / `DcmDspClearDTC` /
    // `DcmDspReadDTCInformation` are all `ECUC-PARAM-CONF-CONTAINER-DEF`
    // (leaf, no sub-containers). AUTOSAR convention: a leaf container
    // cannot host children; only the module (or a non-leaf container)
    // can host multiple container instances. By emitting `parentPath:
    // 'Dcm'` (the module shortName), the mapper creates new
    // `<ECUC-CONTAINER-VALUE>` of the canonical type as siblings of the
    // ODX-extracted instances (which themselves live under the same
    // module after v1.27.2's `buildDcmContent` rewrite).
    //
    // The `definitionRef` tells `findChildDefForAdd`
    // (`core/mutation/applyPatchSteps.ts:658-701`) which BSWMD-side
    // container def to instantiate — it side-steps the leaf
    // container's empty `subContainers` / `choices` arrays that would
    // otherwise defeat the permissive fallback.
    //
    // The mutation engine's `findParentContainerDef` already handles
    // module-level parents via a synthetic-parent fallback
    // (`applyPatchSteps.ts:714-732`) — the new synthetic parent exposes
    // the module's top-level containers as its `subContainers`, which
    // `findChildDefForAdd` then matches against the `definitionRef` tail.
    //
    // TODO (out-of-scope for v1.27.2): the Com-stack mapper
    // (`xlsxToEcucBatch.ts:71`) still uses the old strip-prefix idiom.
    // Consolidation of the two mapper shapes into a single
    // `addChildSiblingStep({ moduleShortName, containerShortName, instanceShortName, instanceDefRef })`
    // helper is a separate refactor.
    const parentPath = moduleShortName;
    const containerPath = `${parentPath}/${row.shortName}`;
    const addChildBase = {
      op: 'add-child' as const,
      parentPath,
      shortName: row.shortName,
      // Always emit `definitionRef` so the mutation engine can resolve
      // the leaf-container child def via the BSWMD-side definition path
      // (see `applyPatchSteps.ts:677-680`).
      definitionRef: containerDef.path,
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
