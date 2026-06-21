// src/core/sws-validator/sandbox/types.ts
// Cluster G (v1.6.0) — G sandbox types (different ctx API from v1.3.0 Script Engine).
//
// Per G spec §5.4: G's `RuleCtx` is **read-only** + exposes `log` + a
// `result()` helper. Different shape from Script Engine's `ScriptCtx`
// (which supports mutation + applyMutation etc.) — direct import would
// force one side to absorb the other's API. v1.7.0 will extract
// `src/core/sandbox/vm-runner.ts` as the canonical SoT.

import type { InternalValidatorResult, ValidationContext } from '../types.js';

export interface RuleLog {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Whitelisted surface visible to user-defined SWS rules.
 * Mirrors v1.3.0 Script Engine's `ctx` API but **read-only** + rule-shaped.
 */
export interface RuleCtx {
  /** Same `ValidationContext` shape as built-in rules — read-only. */
  readonly project: ValidationContext;
  readonly log: RuleLog;
  /** Build a result. Helper to enforce the contract shape. */
  result(
    partial: Omit<InternalValidatorResult, 'ruleId'>,
  ): InternalValidatorResult;
}

export interface RuleLogSink {
  readonly logs: readonly string[];
  push(level: 'info' | 'warn' | 'error', message: string): void;
}