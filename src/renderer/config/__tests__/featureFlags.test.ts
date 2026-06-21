// src/renderer/config/__tests__/featureFlags.test.ts
// v1.6.0 Cluster U — renderer-side feature flag reader (TDD).
//
// The renderer cannot read settings.json directly (no fs access in the
// sandboxed renderer process). It reads flags via the existing
// `feature-flags:get` IPC channel that the W cluster owns — this test
// pins the contract: when the flag is missing / OFF, every getter
// returns false (default OFF per U spec §6.4 / §10.1 #7).

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  isExperimentalKeyboardFirstEnabled,
  isExperimentalOnboardingEnabled,
  isExperimentalSwsValidatorEnabled,
  isExperimentalStreamingEnabled,
  resetFeatureFlagCache,
} from '../featureFlags.js';

describe('renderer feature flags (v1.6.0 U)', () => {
  beforeEach(() => {
    resetFeatureFlagCache();
    // Replace the global autosarApi flag reader used by the helpers.
    // Default = everything OFF (per W + U spec default).
    (globalThis as { window?: unknown }).window = {
      autosarApi: {
        getFeatureFlags: async () => ({
          experimental: {
            onboarding: false,
            streaming: false,
            indexedDb: false,
            headlessCli: false,
            swsValidator: false,
            keyboardFirst: false,
          },
        }),
      },
    };
  });

  afterEach(() => {
    resetFeatureFlagCache();
    vi.restoreAllMocks();
  });

  it('defaults to OFF when the IPC reply sets experimental.keyboardFirst=false', async () => {
    expect(await isExperimentalKeyboardFirstEnabled()).toBe(false);
  });

  it('returns true when the IPC reply sets experimental.keyboardFirst=true', async () => {
    const win = globalThis as unknown as { window: { autosarApi: { getFeatureFlags: () => Promise<unknown> } } };
    win.window.autosarApi.getFeatureFlags = async () => ({
      experimental: {
        onboarding: false,
        streaming: false,
        indexedDb: false,
        headlessCli: false,
        swsValidator: false,
        keyboardFirst: true,
      },
    });
    resetFeatureFlagCache();
    expect(await isExperimentalKeyboardFirstEnabled()).toBe(true);
  });

  it('returns false for every other cluster flag (no cross-bleed)', async () => {
    expect(await isExperimentalOnboardingEnabled()).toBe(false);
    expect(await isExperimentalSwsValidatorEnabled()).toBe(false);
    expect(await isExperimentalStreamingEnabled()).toBe(false);
  });

  it('falls back to OFF when autosarApi is unavailable', async () => {
    (globalThis as { window?: unknown }).window = undefined;
    resetFeatureFlagCache();
    expect(await isExperimentalKeyboardFirstEnabled()).toBe(false);
  });
});