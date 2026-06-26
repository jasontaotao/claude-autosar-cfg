// core/generator/__tests__/build-self-includes.test.ts
//
// v1.14.2 PATCH-H (H2) — unit tests for `buildSelfIncludes`.
// Mirrors the v1.14.1 PATCH-G `buildReferenceIncludes` shape
// (immutable dedup against a caller-owned Set) so the two
// include sources compose in a single ordering in the Cfg.h
// template (self-includes first, cross-refs second).

import { describe, it, expect } from 'vitest';

import { buildSelfIncludes } from '../modules/_shared.js';

describe('buildSelfIncludes (v1.14.2 PATCH-H H2)', () => {
  it('returns empty array for undefined input', () => {
    // Arrange — no self-includes (BSWMD omits <STD-INCLUDES>).
    // Act
    const out = buildSelfIncludes(undefined, new Set());
    // Assert
    expect(out).toEqual([]);
  });

  it('returns empty array for empty array input', () => {
    const out = buildSelfIncludes([], new Set());
    expect(out).toEqual([]);
  });

  it('skips empty entries (H1 BSW-SEC-003 territory)', () => {
    // The v1.14.2 parser keeps empty SHORT-NAME as '' in
    // includes[]. The validator (H1) owns the BSW-SEC-003
    // channel; buildSelfIncludes must not re-emit '' as a
    // `#include ""` directive. (Empty `existing` Set means
    // dedup is a no-op here.)
    const out = buildSelfIncludes(['Os/Os_Cfg.h', '', 'Dem/Dem_Cfg.h'], new Set());
    expect(out).toEqual(['Os/Os_Cfg.h', 'Dem/Dem_Cfg.h']);
  });

  it('dedupes against the caller-owned existing Set', () => {
    // buildSelfIncludes must never mutate `existing` (per the
    // immutability contract v1.14.1 PATCH-G established for
    // buildReferenceIncludes). The local `seen` Set is seeded
    // from `existing`, so the caller can pass in cross-ref
    // includes from a prior `buildReferenceIncludes` call
    // without double-emission.
    const existing = new Set<string>(['Os/Os_Cfg.h']);
    const out = buildSelfIncludes(['Os/Os_Cfg.h', 'Dem/Dem_Cfg.h'], existing);
    expect(out).toEqual(['Dem/Dem_Cfg.h']);
    // The caller's Set is untouched.
    expect(existing.has('Dem/Dem_Cfg.h')).toBe(false);
  });
});
