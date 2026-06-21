// src/core/sws-validator/adapter.ts
// Cluster G (v1.6.0) — Wire-result translator (per G spec §5.1.1).
//
// Translates G's engine-internal `InternalValidatorResult` to the
// canonical wire shape `ValidatorResult` (imported verbatim from
// `src/shared/headless/ipc-contract.ts` per A+C spec §4 + C1 fix).
//
// The translation lives at the IPC boundary so future cluster additions
// (e.g. v1.7.0 N ASPICE traceability) can reuse the same translator.

import type { ValidatorResult } from '../../shared/headless/ipc-contract.js';
import { t, type Locale } from '../../shared/i18n.js';

import type { InternalValidatorResult, Severity } from './types.js';

/**
 * Severity narrowing map (per G spec §5.1.1).
 *
 * The wire union is restricted to `'error' | 'warning'` (A+C spec §4
 * + C1 fix). G's engine-internal type also has `'info'`. The narrowing
 * rule:
 *   - `'error'`  → `'error'`  (verbatim)
 *   - `'warning'`→ `'warning'` (verbatim)
 *   - `'info'`   → `'warning'` (per §5.1.1: "G's severity: 'info' is
 *                   preserved on the wire; renderer/CLI decide how to
 *                   filter (A+C's union omits 'info' from --validate
 *                   results because G's v1.6.0 only ships error/warning
 *                   rules)")
 *
 * Note: the §5.1.1 narrative above says "'info' is preserved on the
 * wire" but the type signature is `'error' | 'warning'` only. To stay
 * consistent with the type we narrow `'info'` → `'warning'`. A+C's
 * `ValidateResult.results` field accepts the narrower union; rendering
 * the info-message as a warning keeps the shape valid.
 */
function narrowSeverity(s: Severity): 'error' | 'warning' {
  if (s === 'error') return 'error';
  return 'warning';
}

/**
 * Field policy (per re-review N1, 2026-06-21):
 *
 * The `fix` field on `InternalValidatorResult` is RESERVED for v1.7.0
 * (currently typed `never` — no starter rule emits it in v1.6.0). If a
 * future maintainer relaxes the engine type to `fix?: SomeShape`, this
 * translator MUST be updated to include the new field via a
 * discriminated union — silent drop is a wire bug. Tracked in G spec
 * §10 v1.7.0 handoff #2.
 *
 * For v1.6.0 we drop `fix` (it doesn't exist on `InternalValidatorResult`)
 * and do NOT carry it on the wire.
 */
export function toWireResult(
  internal: InternalValidatorResult,
  locale: Locale,
): ValidatorResult {
  return {
    ruleId: internal.ruleId,
    severity: narrowSeverity(internal.severity),
    path: internal.path,
    message: t(
      locale,
      internal.messageKey as Parameters<typeof t>[1],
      internal.messageVars as Readonly<Record<string, string | number | boolean>> | undefined,
    ),
    i18nKey: internal.messageKey,
  };
}

/**
 * Bulk translator. Used by A+C's `--validate` handler to emit the
 * canonical `ValidateResult.results` array.
 */
export function toWireResults(
  internals: readonly InternalValidatorResult[],
  locale: Locale,
): readonly ValidatorResult[] {
  return Object.freeze(internals.map((r) => toWireResult(r, locale)));
}