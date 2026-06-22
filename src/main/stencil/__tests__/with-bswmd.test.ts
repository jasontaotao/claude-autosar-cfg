// v1.8.0 K Stencil Wizard — Task 9 (with-BSWMD mode) tests.
//
// Pins the public contract for `buildWithBswmd`: the function takes
// a `StencilFamily` and the renderer's user-loaded BSWMDs (as
// `ArxmlDocument[]`) and returns a merged `ArxmlDocument` whose
// `packages[0]?.shortName` matches the family (per the corrected
// `packages[].elements[]` shape, NOT the pre-Task-2 `rootPackages[0]`
// draft).
//
// Task 9 minimum-viable scope:
//   - Build the BSWMD-free skeleton via `buildStencil`.
//   - Run the v1.5.1 A+C `applyPatchSteps` engine over the skeleton
//     with patch steps derived from the user BSWMDs. In this first
//     cut the derivation is intentionally minimal (an empty step
//     list when no user BSWMDs declare <CONTAINERS> to merge) — the
//     merge semantics live behind the same `applyPatchSteps` engine
//     the CLI mutate handler uses, so future Task 9+ work can plug
//     in richer BSWMD→patch-step conversion without changing the
//     public function signature.
//   - Return the resulting `ArxmlDocument` (the handler does the
//     serialize + SWS gate).
//
// Deviations vs the plan example:
//   - The plan's import path for the test file is `../with-bswmd.js`
//     (correct relative to `__tests__/`); we use the same shape as
//     the other tests in this directory.

import { describe, expect, it } from 'vitest';

import { buildWithBswmd } from '../with-bswmd.js';

describe('buildWithBswmd', () => {
  it('merges Com skeleton with user BSWMD → packages[0].shortName === "Com"', () => {
    // Empty user BSWMD array is acceptable: applyPatchSteps on an
    // empty step list returns the same doc ref (idempotent per
    // core/mutation/__tests__/applyPatchSteps.test.ts:169). The
    // minimum-viable merge preserves the skeleton's top-level
    // package identity.
    const doc = buildWithBswmd('com', []);
    expect(doc.packages[0]?.shortName).toBe('Com');
  });

  it('returns the family shortName for every supported family', () => {
    // The dispatcher must reach the right family builder before
    // delegating to applyPatchSteps; pin all 4 so a future family
    // addition is a compile error here until the table updates.
    expect(buildWithBswmd('comm', []).packages[0]?.shortName).toBe('ComM');
    expect(buildWithBswmd('pdur', []).packages[0]?.shortName).toBe('PduR');
    expect(buildWithBswmd('ecuc', []).packages[0]?.shortName).toBe('EcuC');
  });

  it('accepts a non-empty BSWMD array without throwing', () => {
    // The merge engine tolerates non-empty user BSWMD arrays as long
    // as the patch-step derivation produces a valid step list. With
    // the minimal-derivation scope, a non-empty array may yield zero
    // steps (the user BSWMD is informational metadata today), which
    // is still a valid input — applyPatchSteps no-ops gracefully.
    const dummyUserBswmd = {
      path: '/dummy/Com_Bswmd.arxml',
      version: '4.6' as const,
      packages: [
        {
          shortName: 'EcucDefs',
          path: '/EcucDefs',
          elements: [],
        },
      ],
    };
    const doc = buildWithBswmd('com', [dummyUserBswmd]);
    expect(doc.packages[0]?.shortName).toBe('Com');
  });
});
