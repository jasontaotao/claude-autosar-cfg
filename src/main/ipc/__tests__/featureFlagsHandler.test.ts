// src/main/ipc/__tests__/featureFlagsHandler.test.ts
// v1.6.0 U — feature-flags:get handler unit test.
// v1.8.0 K — stencilWizard wired through the handler.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { isStencilWizardEnabled } from '../../stencil/feature-flag.js';
import { featureFlagsGetHandler } from '../featureFlagsHandler.js';

// Mock the stencil feature-flag module so we can drive
// `isStencilWizardEnabled()` from the test without touching disk.
vi.mock('../../stencil/feature-flag.js', () => ({
  isStencilWizardEnabled: vi.fn(),
  _resetStencilFlagCache: vi.fn(),
}));

const mockedIsStencilWizardEnabled = vi.mocked(isStencilWizardEnabled);

describe('featureFlagsGetHandler (v1.6.0 U + v1.8.0 K)', () => {
  afterEach(() => {
    mockedIsStencilWizardEnabled.mockReset();
  });

  it('returns all-OFF by default (v1.6.0 ships no enabled flags)', () => {
    mockedIsStencilWizardEnabled.mockReturnValue(false);
    const flags = featureFlagsGetHandler();
    expect(flags.experimental).toEqual({
      onboarding: false,
      streaming: false,
      indexedDb: false,
      headlessCli: false,
      swsValidator: false,
      keyboardFirst: false,
      stencilWizard: false,
    });
  });

  it('returns a plain object (no fs / no IPC dependency)', () => {
    mockedIsStencilWizardEnabled.mockReturnValue(false);
    const a = featureFlagsGetHandler();
    const b = featureFlagsGetHandler();
    // Each call returns a fresh shape so callers cannot mutate the
    // module-level cache by accident.
    expect(a).not.toBe(b);
    expect(a.experimental).not.toBe(b.experimental);
  });

  it('shape matches the renderer-expected FeatureFlags contract', () => {
    mockedIsStencilWizardEnabled.mockReturnValue(false);
    const flags = featureFlagsGetHandler();
    // All 7 keys present and boolean-typed.
    for (const key of [
      'onboarding',
      'streaming',
      'indexedDb',
      'headlessCli',
      'swsValidator',
      'keyboardFirst',
      'stencilWizard',
    ]) {
      expect(typeof flags.experimental[key as keyof typeof flags.experimental]).toBe('boolean');
    }
  });

  it('propagates stencilWizard=true when isStencilWizardEnabled() returns true', () => {
    mockedIsStencilWizardEnabled.mockReturnValue(true);
    const flags = featureFlagsGetHandler();
    expect(flags.experimental.stencilWizard).toBe(true);
  });

  it('propagates stencilWizard=false when isStencilWizardEnabled() returns false', () => {
    mockedIsStencilWizardEnabled.mockReturnValue(false);
    const flags = featureFlagsGetHandler();
    expect(flags.experimental.stencilWizard).toBe(false);
  });
});
