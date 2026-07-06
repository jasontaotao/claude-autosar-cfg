// core/bridge/addChildSiblingStep.ts
//
// Single source of truth for the Dcm xlsx mapper's "add-child + per-
// param set-param" PatchStep emission. Promoted from
// `xlsxDcmServicesToEcucBatch.ts:111-131` (inline construction) in
// v1.28.0 MINOR to close the v1.27.2 release notes §"Out of Scope"
// TODO at `xlsxDcmServicesToEcucBatch.ts:106-110`:
//
//   TODO (out-of-scope for v1.27.2): the Com-stack mapper
//   (`xlsxToEcucBatch.ts:71`) still uses the old strip-prefix idiom.
//   Consolidation of the two mapper shapes into a single
//   `addChildSiblingStep({ moduleShortName, containerShortName, instanceShortName, instanceDefRef })`
//   helper is a separate refactor.
//
// v1.28.0 MINOR closes THIS half of that TODO (Dcm mapper consumes
// the helper; emits module-level sibling + definitionRef shape per
// v1.27.2 PATCH). The Com-stack mapper-shape alignment is a larger
// refactor that changes the Mapper emit shape (and pipeline
// semantics) — deferred to a future MINOR with explicit pre-flight
// design (§"Out of Scope (deferred)" in v1.28.0 release notes).

import type { PatchStep } from '../../shared/headless/ipc-contract.js';

/**
 * Inputs for the module-level "add a new sibling instance" emission.
 *
 *   - `moduleShortName` — the AUTOSAR module's `<SHORT-NAME>`; also
 *     used as the `parentPath` of the `add-child` step (one-segment,
 *     matching the v1.27.2 synthetic-parent fallback boundary).
 *   - `instanceShortName` — the new container instance's name (the
 *     `SHORT-NAME` of the freshly-added `<ECUC-CONTAINER-VALUE>`).
 *   - `containerDefPath` — the BSWMD-side `ECUC-PARAM-CONF-CONTAINER-DEF`
 *     path (the `definitionRef` emitted on the step).
 *   - `instanceParams` — xlsx-row params. Only defined, non-null
 *     values become `set-param` steps (null/undefined are skipped,
 *     matching v1.27.2 mapper's pre-patch behavior).
 */
export interface AddChildSiblingStepInput {
  readonly moduleShortName: string;
  readonly instanceShortName: string;
  readonly containerDefPath: string;
  readonly instanceParams: Readonly<Record<string, string | number | boolean | null>>;
}

/**
 * Build the `[add-child + set-param × N]` PatchStep sequence that
 * installs a new sibling instance under the named module. One
 * `add-child` step (with `definitionRef` pointing at the leaf
 * container def) plus one `set-param` per non-null
 * `instanceParams` entry.
 */
export function addChildSiblingStep(input: AddChildSiblingStepInput): readonly PatchStep[] {
  const containerPath = `${input.moduleShortName}/${input.instanceShortName}`;
  const steps: PatchStep[] = [
    {
      op: 'add-child',
      parentPath: input.moduleShortName,
      shortName: input.instanceShortName,
      // Always emit `definitionRef` so the mutation engine's
      // `findChildDefForAdd` (`core/mutation/applyPatchSteps.ts:677-680`)
      // can resolve the leaf-container child def via the BSWMD-side
      // definition path. Pre-v1.27.2, the mapper emitted a leaf-parent
      // add (`parentPath: 'Dcm/DcmDspDid'`) without a definitionRef,
      // which failed after the synthetic-parent fallback tightened to
      // 1-segment module-level paths.
      definitionRef: input.containerDefPath,
    },
  ];
  for (const [paramName, value] of Object.entries(input.instanceParams)) {
    if (value === null) continue;
    steps.push({
      op: 'set-param',
      containerPath,
      paramName,
      value,
    });
  }
  return steps;
}
