// core/bridge/dcmConstants.ts
//
// Centralized domain identifier for the AUTOSAR Diagnostic
// Communication Manager (Dcm) module. Replaces ad-hoc `'Dcm'`
// literals scattered across the Dcm xlsx mapper, the Dcm config
// pipeline orchestrator, the IPC handler, and the corresponding
// tests. Eliminates typo risk and makes a future rename
// (e.g. cluster-aware shortName like `Dcm_<Cluster>`) a single-edit
// operation.
//
// Scope: Dcm-bridge-internal. Not exported to `src/shared/` because
// the renderer never references Dcm by module shortName — Dcm is
// only addressed by the IPC pipeline. Kept colocated with the
// other Dcm-bridge files (`xlsxDcmServicesToEcucBatch.ts`,
// `dcmConfigPipeline.ts`) per the project's domain-organize
// convention (cf. `xlsxToEcucBatch.ts`, `dbcToComStack.ts`).

/**
 * AUTOSAR module shortName for the Diagnostic Communication
 * Manager. Matches the `<SHORT-NAME>` element under
 * `<ECUC-MODULE-DEF>` in both `samples/arxml/demo-ecu/bswmd/`
 * (`Bsw_Dcm_Bswmd.arxml`) and the real-OEM Vector-derived
 * fixture (`samples/comstack-existing-fixture/Dcm.bswmd.arxml`).
 *
 * Used as:
 *   - the key into the `bswmds` map returned by `parseDemoBswmds`
 *     / `loadDcmBswmd` (see `dcmConfigPipeline.ts`,
 *     `dcmConfigHandler.ts`);
 *   - the `parentPath` emitted by the Dcm xlsx mapper
 *     (`xlsxDcmServicesToEcucBatch.ts`) when adding ECUC module
 *     siblings via the v1.27.2 PATCH 1-segment synthetic-parent
 *     fallback in `applyPatchSteps.findParentContainerDef`;
 *   - the value of every entry in `SHEET_TO_MODULE` in the Dcm
 *     mapper (all 5 xlsx sheets resolve to this single module).
 */
export const DCM_MODULE_SHORT_NAME = 'Dcm' as const;
