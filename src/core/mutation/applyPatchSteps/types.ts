// core/mutation/applyPatchSteps/types.ts
// Public types + re-exports for the patch-step engine. Split from
// `src/core/mutation/applyPatchSteps.ts` as part of v1.41.x PATCH T2
// (file-size backlog).
//
// Public surface: re-export of `PatchStep` + interfaces `ApplyContext`,
// `StepError`, `StepWarning`, `ApplyResult`. Zero runtime code in this
// file. Consumed by the engine (`./engine.ts`) and exposed via the
// barrel (`./index.ts`) + the shim at `../applyPatchSteps.ts`.

export type { PatchStep } from '../../../shared/headless/ipc-contract.js';

import type { PatchStep as _PatchStep } from '../../../shared/headless/ipc-contract.js';
import type { ArxmlDocument } from '../../arxml/types.js';
import type { BswModuleDef } from '../../project/bswmd.js';

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/** Optional context the engine uses to enforce BSWMD-derived rules. */
export interface ApplyContext {
  /**
   * BSWMD schema for the target module. Required for `add-child`
   * (so the multiplicity + child def lookup has schema data to
   * consult). Omit only for legacy `add` / `remove` / `replace`
   * paths that don't need schema validation.
   */
  readonly moduleDef?: BswModuleDef;
}

/** Per-step error envelope. Mirrors the wire `MutationStepError`. */
export interface StepError {
  readonly stepIndex: number;
  readonly kind: string;
  readonly message: string;
}

/**
 * v1.18.0 MINOR T1 (Obs-3) — non-fatal step diagnostic.
 *
 * Distinct from `StepError`: a warning does NOT abort the step
 * nor the loop, and does NOT contribute to `errors`. The CLI
 * dispatcher (src/cli/command-dispatcher.ts:92-97) maps a
 * non-empty `warnings` array on the `HeadlessResult` to
 * `EXIT_WARNING` (exit code 2).
 *
 * The `kind` discriminator is the contract C8 (T8) emits against;
 * keep it open for future consumers (variant-downgrade is the
 * first, more to follow).
 *
 * The optional `step` field lets the renderer drill down from the
 * warning to the offending patch step (e.g. show a "View step"
 * affordance). Kept optional so simple consumers (CLI) can omit it.
 */
export interface StepWarning {
  readonly stepIndex: number;
  readonly kind: 'variant-downgrade' | 'type-coercion' | 'deprecated-param' | 'cross-dialect-ref';
  readonly message: string;
  readonly step?: _PatchStep;
}

/** Result of applying a (possibly empty) list of steps. */
export interface ApplyResult {
  readonly doc: ArxmlDocument;
  readonly applied: number;
  readonly errors: ReadonlyArray<StepError>;
  /** v1.18.0 Obs-3 — non-fatal diagnostics. Always empty array when no step emits a warning. */
  readonly warnings: ReadonlyArray<StepWarning>;
}
