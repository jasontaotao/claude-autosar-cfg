// core/mutation/steps/variant-downgrade.ts
//
// v1.18.0 MINOR T8 (C8) — per-step helper that evaluates a
// multiplicity transition and emits a `StepWarning` when the
// transition loosens variant binding.
//
// The step op (`PatchStep.op === 'variant-downgrade'`) carries the
// previous and the next multiplicity as strings. This helper
// delegates to `decideVariantType` (from `core/variant/engineering`)
// which owns the strictness ordering and the downgrade-detection
// rules. We add nothing on top of that ordering here — the only
// responsibility of this module is to adapt the wire-shape strings
// into the `decideVariantType` call and translate the resulting
// `VariantDecision.downgrade` block into a `StepWarning`.
//
// Wired into `applyPatchSteps.ts` via the `'variant-downgrade'`
// switch case (see `applyVariantDowngrade` there).

import type { PatchStep } from '../../../shared/headless/ipc-contract.js';
import {
  decideVariantType,
  type VariantDecision,
  type VariantType,
} from '../../variant/engineering.js';
import type { ApplyContext, StepWarning } from '../applyPatchSteps.js';

/** Minimal subset of `PatchStep` we accept (keeps the helper testable). */
export interface VariantDowngradeStepShape {
  readonly op: 'variant-downgrade';
  readonly containerPath: string;
  readonly paramName: string;
  readonly fromMultiplicity: VariantType;
  readonly toMultiplicity: VariantType;
}

export interface VariantDowngradeResult {
  readonly result: { readonly ok: true } | { readonly ok: false; readonly error: string };
  readonly warning?: Omit<StepWarning, 'stepIndex' | 'step'>;
}

/**
 * Evaluate a `variant-downgrade` step and return either an `ok: true`
 * outcome (with an optional `StepWarning`) or an `ok: false` outcome
 * with a patch-invalid error message.
 *
 * Accepts the full `PatchStep` union so callers (the dispatcher +
 * tests) can pass wire-shaped steps directly without an unsafe cast.
 * Inside, we narrow on `step.op === 'variant-downgrade'` and use the
 * shape's `fromMultiplicity` / `toMultiplicity` / `containerPath` /
 * `paramName` fields. Non-variant-downgrade steps are treated as a
 * programming error (returns `ok: false`).
 *
 * Failure modes:
 *   - `step.op` is not `'variant-downgrade'` → `ok: false`
 *     (programmer error — caller should not route other ops here).
 *   - `fromMultiplicity` or `toMultiplicity` not in the closed union
 *     (`'POST-BUILD' | 'PRE-COMPILE' | 'LINK-TIME'`). The TS compiler
 *     narrows the union for in-source callers, but the wire shape is
 *     a string so a malformed patch file could carry an unknown
 *     value. We surface those as `ok: false` rather than silently
 *     skipping the step.
 *
 * Success modes:
 *   - downgrade (from > to in strictness order) → `ok: true` + warning.
 *   - identity / upgrade / previous-unknown → `ok: true`, no warning.
 */
export function variantDowngradeStep(_ctx: ApplyContext, step: PatchStep): VariantDowngradeResult {
  if (step.op !== 'variant-downgrade') {
    return {
      result: {
        ok: false,
        error: `variantDowngradeStep: expected op 'variant-downgrade', got '${step.op}'`,
      },
    };
  }
  // The two multiplicity values are wire-side strings; we trust the
  // TS narrowing for in-process callers and validate defensively for
  // the wire path (a malformed patch file could carry an unknown
  // literal). When the value is not a known VariantType, treat it as
  // patch-invalid rather than silently passing it to
  // `decideVariantType` (which would coerce via `as VariantType`).
  if (!isVariantType(step.fromMultiplicity)) {
    return {
      result: {
        ok: false,
        error: `variant-downgrade: fromMultiplicity must be POST-BUILD | PRE-COMPILE | LINK-TIME, got "${step.fromMultiplicity}"`,
      },
    };
  }
  if (!isVariantType(step.toMultiplicity)) {
    return {
      result: {
        ok: false,
        error: `variant-downgrade: toMultiplicity must be POST-BUILD | PRE-COMPILE | LINK-TIME, got "${step.toMultiplicity}"`,
      },
    };
  }

  // `decideVariantType` takes the CURRENT multiplicity and (optionally)
  // the previous one. We map the step's `from`/`to` fields onto that
  // contract: the previous multiplicity is `step.fromMultiplicity`,
  // the current is `step.toMultiplicity`.
  const decision: VariantDecision = decideVariantType(
    { configClass: step.toMultiplicity, configVariant: 'VARIANT-PRE-COMPILE' },
    { previous: { configClass: step.fromMultiplicity, configVariant: 'VARIANT-PRE-COMPILE' } },
  );
  if (decision.downgrade === undefined) {
    return { result: { ok: true } };
  }
  // Translate `VariantDecision.downgrade` into a `StepWarning`. The
  // `message` field carries the deterministic `from → to` text so
  // CLI consumers can grep it without depending on internal fields.
  // `stepIndex` and `step` are filled in by `applyVariantDowngrade`
  // (the dispatcher) — this helper returns a partial warning and
  // the dispatcher patches in the dispatch-time metadata.
  const location = `${step.containerPath}/${step.paramName}`;
  const message = `${location}: variant binding loosened (${decision.downgrade.from} → ${decision.downgrade.to}). ${decision.downgrade.reason}`;
  return {
    result: { ok: true },
    warning: { kind: 'variant-downgrade', message },
  };
}

function isVariantType(v: string): v is VariantType {
  return v === 'POST-BUILD' || v === 'PRE-COMPILE' || v === 'LINK-TIME';
}
