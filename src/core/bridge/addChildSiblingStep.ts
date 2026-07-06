// core/bridge/addChildSiblingStep.ts
//
// Single source of truth for both mappers' "add-child + per-param set-param"
// PatchStep emission. Promoted from
// `xlsxDcmServicesToEcucBatch.ts:111-131` (inline Dcm construction) in
// v1.28.0 MINOR; extended in v1.29.0 MINOR to absorb the Com-stack mapper's
// in-line emission (`xlsxToEcucBatch.ts:82-99`).
//
// Two callers; two shapes — both supported by the helper's input type:
//
//   Dcm mapper (xlsxDcmServicesToEcucBatch.ts):
//     { moduleShortName: 'Dcm', containerDefPath: '/Dcm/...', instanceShortName, instanceParams }
//     → parentPath derived from moduleShortName (1-segment); definitionRef
//       ALWAYS emitted.
//
//   Com-stack mapper (xlsxToEcucBatch.ts):
//     { parentPath: 'Com/ComConfig/ComIPdu' (multi-segment), containerDefPath: '/AUTOSAR/...' (optional),
//       instanceShortName, instanceParams }
//     → parentPath caller-provided; definitionRef conditionally emitted
//       (omitted when containerDefPath is undefined).
//
// Precedence rules (v1.29.0 spec §1.4 / §6):
//   - `parentPath` may be provided INSTEAD OF `moduleShortName` (Com-stack style).
//     `parentPath` may also be provided ALONGSIDE `moduleShortName` (defensive);
//     parentPath wins in that case.
//   - Neither provided → throw (fail-fast per project rule).
//   - `containerDefPath === undefined` → emit add-child WITHOUT a `definitionRef`
//     key (no `definitionRef: undefined` form).
//   - Empty-string `containerDefPath` is NOT null/undefined — emitted verbatim.
//
// v1.27.2 PATCH release-notes TODO at `xlsxDcmServicesToEcucBatch.ts:106-110`
// proposed this exact consolidation; v1.28.0 closed the Dcm-half; v1.29.0
// closes the Com-stack-half.

import type { PatchStep } from '../../shared/headless/ipc-contract.js';

/**
 * Resolve the emitted `add-child.parentPath` with precedence:
 *   1. caller-provided `parentPath` wins (Com-stack mapper shape).
 *   2. fall back to `moduleShortName` (Dcm mapper shape).
 *   3. neither → throw (fail-fast per project rule).
 *
 * The two `if (X !== undefined) return X;` branches guarantee
 * TypeScript narrows `string` on each return path; this avoids the
 * `string | undefined` leftover that `??` produces under
 * `exactOptionalPropertyTypes: true`.
 */
function resolveParentPath(input: AddChildSiblingStepInput): string {
  if (input.parentPath !== undefined) return input.parentPath;
  if (input.moduleShortName !== undefined) return input.moduleShortName;
  throw new Error('addChildSiblingStep: either `parentPath` or `moduleShortName` must be provided');
}

/**
 * Inputs for "add a new sibling instance" emission. Either `parentPath`
 * (caller-provided multi-segment leaf-parent path) or `moduleShortName`
 * (1-segment module-level derivation) MUST be provided; exactly one of
 * the two is the typical case but both are accepted (parentPath wins).
 *
 * `containerDefPath` is optional: when omitted (or explicitly undefined)
 * the emitted `add-child` step has no `definitionRef` key.
 *
 * NOTE: `| undefined` is explicit on the optional fields because the
 * project compiles with `exactOptionalPropertyTypes: true` — callers
 * may either OMIT the property or PASS it as `undefined`. Both are
 * treated identically (the helper resolves `undefined → "not provided"`).
 */
export interface AddChildSiblingStepInput {
  readonly instanceShortName: string;
  readonly instanceParams: Readonly<Record<string, string | number | boolean | null>>;
  readonly parentPath?: string | undefined;
  readonly moduleShortName?: string | undefined;
  readonly containerDefPath?: string | undefined;
}

/**
 * Build the `[add-child + set-param × N]` PatchStep sequence that installs
 * a new sibling instance at the resolved `parentPath`. One `add-child`
 * step (optionally with `definitionRef`) plus one `set-param` per
 * non-null, non-undefined `instanceParams` entry.
 */
export function addChildSiblingStep(input: AddChildSiblingStepInput): readonly PatchStep[] {
  // Resolve `parentPath` with strict TS narrowing (see `resolveParentPath`).
  const parentPath = resolveParentPath(input);

  const containerPath = `${parentPath}/${input.instanceShortName}`;

  // Build the `add-child` step. Conditional `definitionRef` is the
  // Com-stack mapper's affordance; emitting `definitionRef: undefined`
  // would pollute `Object.keys(step)` semantics, so we omit the key
  // entirely when the value is absent (conditional-spread idiom — same
  // pattern the legacy Com-stack mapper used at `xlsxToEcucBatch.ts:86`).
  const addChildStep: PatchStep = {
    op: 'add-child',
    parentPath,
    shortName: input.instanceShortName,
    ...(input.containerDefPath !== undefined && { definitionRef: input.containerDefPath }),
  };

  const steps: PatchStep[] = [addChildStep];

  for (const [paramName, value] of Object.entries(input.instanceParams)) {
    // Skip both `null` AND `undefined` to preserve the legacy Com-stack
    // mapper's behavior (`xlsxToEcucBatch.ts` line 92 — `if (value === null
    // || value === undefined) continue;`). v1.29.0 spec §8 Risk #4.
    if (value === null || value === undefined) continue;
    steps.push({
      op: 'set-param',
      containerPath,
      paramName,
      value,
    });
  }
  return steps;
}
