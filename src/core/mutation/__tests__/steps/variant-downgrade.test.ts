// core/mutation/__tests__/steps/variant-downgrade.test.ts
//
// v1.18.0 MINOR T8 (C8) — `variantDowngradeStep` contract tests.
//
// Per `docs/superpowers/specs/2026-06-30-v1-18-0-minor-design.md` §8.2:
// when a `variant-downgrade` step declares a `from` multiplicity
// strictly tighter than its `to` multiplicity, the step returns a
// `StepWarning` (kind: 'variant-downgrade'); otherwise it returns
// an `ok: true` result with no warning.
//
// This is the FIRST consumer of `StepWarning.kind: 'variant-downgrade'`
// (T1 (Obs-3) shipped the shape but no emitter yet). The shape the
// step returns is consumed by `applyPatchSteps` to push into
// `ApplyResult.warnings`.

import { describe, expect, it } from 'vitest';

import type { PatchStep } from '../../../../shared/headless/ipc-contract.js';
import type { ApplyContext, StepWarning } from '../../applyPatchSteps.js';
import { variantDowngradeStep } from '../../steps/variant-downgrade.js';

// Minimal `ApplyContext` — `variantDowngradeStep` does not consult
// `moduleDef` (it operates on the step's multiplicity strings only),
// so the empty object satisfies the contract.
const ctx: ApplyContext = {};

function vDownStep(
  fromMultiplicity: 'POST-BUILD' | 'PRE-COMPILE' | 'LINK-TIME',
  toMultiplicity: 'POST-BUILD' | 'PRE-COMPILE' | 'LINK-TIME',
): PatchStep {
  return {
    op: 'variant-downgrade',
    containerPath: '/EcuC/Com/ComConfig',
    paramName: 'ComTimeBase',
    fromMultiplicity,
    toMultiplicity,
  };
}

describe('v1.18.0 C8 — variantDowngradeStep', () => {
  it('POST-BUILD → PRE-COMPILE emits StepWarning with kind "variant-downgrade"', () => {
    const r = variantDowngradeStep(ctx, vDownStep('POST-BUILD', 'PRE-COMPILE'));
    expect(r.result.ok).toBe(true);
    expect(r.warning).toBeDefined();
    const w = r.warning as StepWarning;
    expect(w.kind).toBe('variant-downgrade');
    // `stepIndex` is patched in by the dispatcher
    // (`applyVariantDowngrade` in applyPatchSteps.ts); the helper
    // itself returns a partial warning shape that omits dispatch-
    // time metadata.
    expect(typeof w.message).toBe('string');
    expect(w.message.length).toBeGreaterThan(0);
  });

  it('PRE-COMPILE → PRE-COMPILE does NOT emit a warning', () => {
    const r = variantDowngradeStep(ctx, vDownStep('PRE-COMPILE', 'PRE-COMPILE'));
    expect(r.result.ok).toBe(true);
    expect(r.warning).toBeUndefined();
  });

  it('warning carries `from` / `to` / `reason` fields when surfaced', () => {
    const r = variantDowngradeStep(ctx, vDownStep('POST-BUILD', 'LINK-TIME'));
    expect(r.result.ok).toBe(true);
    expect(r.warning).toBeDefined();
    // The StepWarning wire shape (ipc-contract.ts:258-262) is
    // {stepIndex, kind, message}. The `from` / `to` / `reason`
    // live in the `message` text (deterministic, grep-able) so
    // CLI consumers can surface them without depending on internal
    // step fields. Verify the message includes both multiplicity
    // names so the user can identify the transition.
    const w = r.warning as StepWarning;
    expect(w.message).toContain('POST-BUILD');
    expect(w.message).toContain('LINK-TIME');
  });

  it('upgrade PRE-COMPILE → POST-BUILD does NOT emit a warning (tighter binding)', () => {
    const r = variantDowngradeStep(ctx, vDownStep('PRE-COMPILE', 'POST-BUILD'));
    expect(r.result.ok).toBe(true);
    expect(r.warning).toBeUndefined();
  });

  it('no warning on identity transition (POST-BUILD → POST-BUILD)', () => {
    const r = variantDowngradeStep(ctx, vDownStep('POST-BUILD', 'POST-BUILD'));
    expect(r.result.ok).toBe(true);
    expect(r.warning).toBeUndefined();
  });

  it('rejects an unknown fromMultiplicity literal (defensive)', () => {
    // The wire shape is `string` at runtime; a malformed patch file
    // could carry an unknown value. Surface it as `ok: false` rather
    // than silently passing it to `decideVariantType`.
    const step = {
      op: 'variant-downgrade' as const,
      containerPath: '/x',
      paramName: 'y',
      fromMultiplicity: 'BOGUS',
      toMultiplicity: 'PRE-COMPILE',
    } as unknown as PatchStep;
    const r = variantDowngradeStep(ctx, step);
    expect(r.result.ok).toBe(false);
    expect((r.result as { ok: false; error: string }).error).toContain('fromMultiplicity');
  });

  it('rejects an unknown toMultiplicity literal (defensive)', () => {
    const step = {
      op: 'variant-downgrade' as const,
      containerPath: '/x',
      paramName: 'y',
      fromMultiplicity: 'POST-BUILD',
      toMultiplicity: 'NOPE',
    } as unknown as PatchStep;
    const r = variantDowngradeStep(ctx, step);
    expect(r.result.ok).toBe(false);
    expect((r.result as { ok: false; error: string }).error).toContain('toMultiplicity');
  });
});
