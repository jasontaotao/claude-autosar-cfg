// src/main/ipc/__tests__/featureFlagsHandler.test.ts
// v1.6.0 U — feature-flags:get handler unit test.

import { describe, expect, it } from 'vitest';

import { featureFlagsGetHandler } from '../featureFlagsHandler.js';

describe('featureFlagsGetHandler (v1.6.0 U)', () => {
  it('returns all-OFF by default (v1.6.0 ships no enabled flags)', () => {
    const flags = featureFlagsGetHandler();
    expect(flags.experimental).toEqual({
      onboarding: false,
      streaming: false,
      indexedDb: false,
      headlessCli: false,
      swsValidator: false,
      keyboardFirst: false,
    });
  });

  it('returns a plain object (no fs / no IPC dependency)', () => {
    const a = featureFlagsGetHandler();
    const b = featureFlagsGetHandler();
    // Each call returns a fresh shape so callers cannot mutate the
    // module-level cache by accident.
    expect(a).not.toBe(b);
    expect(a.experimental).not.toBe(b.experimental);
  });

  it('shape matches the renderer-expected FeatureFlags contract', () => {
    const flags = featureFlagsGetHandler();
    // All 6 keys present and boolean-typed.
    for (const key of [
      'onboarding',
      'streaming',
      'indexedDb',
      'headlessCli',
      'swsValidator',
      'keyboardFirst',
    ]) {
      expect(typeof flags.experimental[key as keyof typeof flags.experimental]).toBe('boolean');
    }
  });
});
