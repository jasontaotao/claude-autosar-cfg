// core/variant/engineering.ts
//
// v1.18.0 MINOR T8 (C8) — variant engineering state machine.
//
// Reads MULTIPLICITY-CONFIG-CLASS from the BSWMD (see
// `core/project/bswmd.ts`) and decides the variant type for a
// parameter. Companion to `validateVariantCoverage` (v1.17.0 T2,
// `core/validation/validate.ts`): that helper checks *runtime*
// coverage (POST-BUILD params need a variant file at use-site);
// this one decides the *type* and detects downgrades across
// multiplicity transitions (e.g. a BSWMD that moved a param from
// POST-BUILD to PRE-COMPILE in a newer revision).
//
// Hierarchy (most → least strict binding):
//   POST-BUILD > PRE-COMPILE > LINK-TIME
//
// A `from > to` transition is a *downgrade* (looser variant
// binding, so previously-supplied variants may now be silently
// ignored at link time); `from < to` is an *upgrade*; `from ===
// to` is a no-op.

import type { MultiplicityConfigClass } from '../project/bswmd.js';

/**
 * The three AUTOSAR multiplicity-config-classes that drive variant
 * binding. Mirrors `HeadlessGenerateVariant` (`shared/headless/ipc-contract.ts`)
 * but at the schema-side (BSWMD `<MULTIPLICITY-CONFIG-CLASS>` block)
 * rather than the dispatch-side (CLI `generate --variant` flag).
 */
export type VariantType = 'POST-BUILD' | 'PRE-COMPILE' | 'LINK-TIME';

/**
 * The decision `decideVariantType` produces for a single multiplicity
 * (and optionally the multiplicity it replaces, for downgrade
 * detection).
 *
 * - `type`: the variant type that matches the multiplicity.
 * - `requiresVariant`: true for POST-BUILD and LINK-TIME (a variant
 *   file is needed to bind the value at use-site); false for
 *   PRE-COMPILE (the value is baked into the generated code).
 * - `downgrade`: present ONLY when the caller supplied a `previous`
 *   multiplicity AND the transition is a downgrade (POST-BUILD →
 *   PRE-COMPILE, POST-BUILD → LINK-TIME, or PRE-COMPILE →
 *   LINK-TIME). Same-mult and upgrade transitions leave this
 *   field undefined.
 */
export interface VariantDecision {
  readonly type: VariantType;
  readonly requiresVariant: boolean;
  readonly downgrade?: {
    readonly from: VariantType;
    readonly to: VariantType;
    readonly reason: string;
  };
}

/** Internal — the strictness ordering, higher number = stricter binding. */
const STRICTNESS: Readonly<Record<VariantType, number>> = {
  'POST-BUILD': 2,
  'PRE-COMPILE': 1,
  'LINK-TIME': 0,
};

/**
 * Build a `VariantDecision` for the supplied multiplicity, optionally
 * comparing it against a `previous` multiplicity to surface a
 * downgrade.
 *
 * @param multiplicity the current BSWMD `<MULTIPLICITY-CONFIG-CLASS>`
 *                     row (only `configClass` is consulted).
 * @param options.previous the multiplicity the param carried before
 *                         the current revision. Omit when the caller
 *                         has no prior state (no downgrade detection
 *                         needed).
 */
export function decideVariantType(
  multiplicity: MultiplicityConfigClass,
  options?: { readonly previous?: MultiplicityConfigClass },
): VariantDecision {
  const type = multiplicity.configClass as VariantType;
  const decision: VariantDecision = {
    type,
    requiresVariant: type !== 'PRE-COMPILE',
  };
  const prev = options?.previous;
  if (prev === undefined) return decision;
  const from = prev.configClass as VariantType;
  const to = type;
  if (from === to) return decision;
  // Downgrade = `from` was strictly tighter than `to`.
  if (STRICTNESS[from] > STRICTNESS[to]) {
    return {
      ...decision,
      downgrade: {
        from,
        to,
        reason: `Variant binding loosened: ${from} → ${to} (previously-supplied variants may be silently ignored)`,
      },
    };
  }
  return decision;
}
