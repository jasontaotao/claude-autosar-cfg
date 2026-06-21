// src/renderer/onboarding/__tests__/suppressWindow.test.ts
// v1.6.0 W — 7-day suppress window helper.
//
// Contract (locked W spec §3.1 / §5.6):
//   - `shouldSuppress({ dismissedAt, now })` returns true when
//     `now - dismissedAt > 7 days`
//   - The 7-day window is a module constant (configurable in v1.7.0+,
//     hardcoded for v1.6.0)
//   - `SUPPRESS_WINDOW_DAYS` is exported as a typed constant for
//     documentation / future config wiring
//
// TDD: pins the 7-day rule BEFORE the reducer / persistence layer consume it.

import { describe, expect, it } from 'vitest';

import {
  SUPPRESS_WINDOW_DAYS,
  SUPPRESS_WINDOW_MS,
  shouldSuppress,
} from '../suppressWindow.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe('suppressWindow (v1.6.0 W)', () => {
  it('exports a 7-day window constant', () => {
    expect(SUPPRESS_WINDOW_DAYS).toBe(7);
    expect(SUPPRESS_WINDOW_MS).toBe(7 * ONE_DAY_MS);
  });

  it('returns false when dismissedAt is null (never dismissed)', () => {
    expect(shouldSuppress({ dismissedAt: null, now: 1_700_000_000_000 })).toBe(false);
  });

  it('returns false when elapsed < 7 days', () => {
    const dismissedAt = 1_000_000_000_000;
    const now = dismissedAt + 6 * ONE_DAY_MS;
    expect(shouldSuppress({ dismissedAt, now })).toBe(false);
  });

  it('returns false when elapsed === exactly 7 days (strict greater-than)', () => {
    const dismissedAt = 1_000_000_000_000;
    const now = dismissedAt + 7 * ONE_DAY_MS;
    expect(shouldSuppress({ dismissedAt, now })).toBe(false);
  });

  it('returns true when elapsed > 7 days', () => {
    const dismissedAt = 1_000_000_000_000;
    const now = dismissedAt + 8 * ONE_DAY_MS;
    expect(shouldSuppress({ dismissedAt, now })).toBe(true);
  });

  it('handles very long elapsed times (years)', () => {
    const dismissedAt = 1_000_000_000_000;
    const now = dismissedAt + 365 * ONE_DAY_MS;
    expect(shouldSuppress({ dismissedAt, now })).toBe(true);
  });
});