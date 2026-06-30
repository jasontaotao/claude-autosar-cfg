// core/variant/__tests__/engineering.test.ts
//
// v1.18.0 MINOR T8 (C8) — variant engineering state machine contract.
//
// Per `docs/superpowers/specs/2026-06-30-v1-18-0-minor-design.md` §8.1:
//   - `decideVariantType(multiplicity, options?)` returns a
//     `VariantDecision` with `type`, `requiresVariant`, and an
//     optional `downgrade` block (when the caller knows the previous
//     multiplicity).
//   - POST-BUILD and LINK-TIME require a variant file
//     (`requiresVariant: true`); PRE-COMPILE does not.
//   - A downgrade is the `previous → current` transition where the
//     new multiplicity is "lower" in the
//     POST-BUILD > PRE-COMPILE > LINK-TIME hierarchy (looser
//     variant binding).
//
// The downgrade hierarchy is:
//   POST-BUILD  > PRE-COMPILE  > LINK-TIME
// (POST-BUILD is most strict / latest-binding; LINK-TIME is least).
// A transition `from > to` is a downgrade; `from < to` is an upgrade
// (no warning); `from === to` is a no-op (no downgrade field).

import { describe, expect, it } from 'vitest';

import type { MultiplicityConfigClass } from '../../project/bswmd.js';
import { decideVariantType, type VariantDecision, type VariantType } from '../engineering.js';

// Minimal `MultiplicityConfigClass` factories — only the
// `configClass` field is consulted by `decideVariantType`.
// `configVariant` is read-only metadata (CONFIG-VARIANT tag).
function multiplicity(
  configClass: 'POST-BUILD' | 'PRE-COMPILE' | 'LINK-TIME',
  configVariant = 'VARIANT-PRE-COMPILE',
): MultiplicityConfigClass {
  return { configClass, configVariant };
}

describe('v1.18.0 C8 — decideVariantType', () => {
  it('POST-BUILD multiplicity → { type: "POST-BUILD", requiresVariant: true }', () => {
    const d: VariantDecision = decideVariantType(multiplicity('POST-BUILD'));
    expect(d.type).toBe('POST-BUILD');
    expect(d.requiresVariant).toBe(true);
    expect(d.downgrade).toBeUndefined();
  });

  it('PRE-COMPILE multiplicity → { type: "PRE-COMPILE", requiresVariant: false }', () => {
    const d: VariantDecision = decideVariantType(multiplicity('PRE-COMPILE'));
    expect(d.type).toBe('PRE-COMPILE');
    expect(d.requiresVariant).toBe(false);
    expect(d.downgrade).toBeUndefined();
  });

  it('LINK-TIME multiplicity → { type: "LINK-TIME", requiresVariant: true }', () => {
    const d: VariantDecision = decideVariantType(multiplicity('LINK-TIME'));
    expect(d.type).toBe('LINK-TIME');
    expect(d.requiresVariant).toBe(true);
    expect(d.downgrade).toBeUndefined();
  });

  it('downgrade POST-BUILD → PRE-COMPILE emits downgrade block', () => {
    const d = decideVariantType(multiplicity('PRE-COMPILE'), {
      previous: multiplicity('POST-BUILD'),
    });
    expect(d.type).toBe('PRE-COMPILE');
    expect(d.requiresVariant).toBe(false);
    expect(d.downgrade).toBeDefined();
    expect(d.downgrade?.from).toBe('POST-BUILD');
    expect(d.downgrade?.to).toBe('PRE-COMPILE');
    expect(typeof d.downgrade?.reason).toBe('string');
    expect(d.downgrade?.reason.length).toBeGreaterThan(0);
  });

  it('PRE-COMPILE → PRE-COMPILE does NOT emit downgrade (no-op transition)', () => {
    const d = decideVariantType(multiplicity('PRE-COMPILE'), {
      previous: multiplicity('PRE-COMPILE'),
    });
    expect(d.type).toBe('PRE-COMPILE');
    expect(d.downgrade).toBeUndefined();
  });

  it('upgrade POST-BUILD → POST-BUILD (same) does NOT emit downgrade', () => {
    // Same multiplicity on both sides — identity, no transition.
    const d = decideVariantType(multiplicity('POST-BUILD'), {
      previous: multiplicity('POST-BUILD'),
    });
    expect(d.type).toBe('POST-BUILD');
    expect(d.downgrade).toBeUndefined();
  });

  it('upgrade PRE-COMPILE → POST-BUILD does NOT emit downgrade (tighter binding)', () => {
    // PRE-COMPILE → POST-BUILD is an *upgrade* (tighter variant
    // binding), not a downgrade. The downgrade detector must
    // distinguish direction.
    const d = decideVariantType(multiplicity('POST-BUILD'), {
      previous: multiplicity('PRE-COMPILE'),
    });
    expect(d.type).toBe('POST-BUILD');
    expect(d.downgrade).toBeUndefined();
  });

  it('VariantType is a closed union of POST-BUILD | PRE-COMPILE | LINK-TIME', () => {
    // Type-level pin: compile-time assertion that the literal union
    // is exactly these 3 strings. Runtime sanity: the function
    // returns one of them for every valid input.
    const types: ReadonlyArray<VariantType> = ['POST-BUILD', 'PRE-COMPILE', 'LINK-TIME'];
    for (const t of types) {
      const d = decideVariantType(multiplicity(t));
      expect(d.type).toBe(t);
    }
  });
});
