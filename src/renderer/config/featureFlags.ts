// src/renderer/config/featureFlags.ts
// v1.6.0 Cluster U — renderer-side feature flag reader.
//
// The renderer cannot read settings.json directly (no fs access).
// It reads flags via the `feature-flags:get` IPC channel owned by the
// W cluster (TourPersistedState carries the flags; see W spec §2.3).
//
// Every getter returns a Promise<boolean>. The first call triggers an
// IPC round-trip; subsequent calls return the cached value until
// `resetFeatureFlagCache()` is called. Callers SHOULD call
// `isExperimentalKeyboardFirstEnabled()` once during the
// KeymapProvider mount and short-circuit on false (per U spec §6.4 —
// zero-overhead when OFF).

import type { Locale } from '../../shared/i18n.js';
import type { FeatureFlags } from '../../shared/ipc/featureFlags.js';

export type FeatureFlagsResponse = FeatureFlags;

interface AutosarApiLike {
  getFeatureFlags?: () => Promise<FeatureFlagsResponse>;
}

let cached: FeatureFlagsResponse | null = null;
let inflight: Promise<FeatureFlagsResponse> | null = null;

function readApi(): AutosarApiLike | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = typeof globalThis !== 'undefined' ? (globalThis as any).window : undefined;
  if (w === undefined || w.autosarApi === undefined) return null;
  return w.autosarApi as AutosarApiLike;
}

async function loadFlags(): Promise<FeatureFlagsResponse> {
  if (cached !== null) return cached;
  if (inflight !== null) return inflight;
  const api = readApi();
  if (api === null || typeof api.getFeatureFlags !== 'function') {
    cached = {
      experimental: {
        onboarding: false,
        streaming: false,
        indexedDb: false,
        headlessCli: false,
        swsValidator: false,
        keyboardFirst: false,
        stencilWizard: false,
      },
    };
    return cached;
  }
  inflight = api.getFeatureFlags().finally(() => {
    inflight = null;
  });
  try {
    cached = await inflight;
  } catch {
    // IPC failure — fall back to default OFF rather than crashing.
    cached = {
      experimental: {
        onboarding: false,
        streaming: false,
        indexedDb: false,
        headlessCli: false,
        swsValidator: false,
        keyboardFirst: false,
        stencilWizard: false,
      },
    };
  }
  return cached;
}

/** Test-only: forget the cached flag set so the next call re-queries. */
export function resetFeatureFlagCache(): void {
  cached = null;
  inflight = null;
}

/** Test-only: pre-seed the cache (avoids the IPC round-trip in unit tests). */
export function _setFlagsForTest(flags: FeatureFlagsResponse | null): void {
  cached = flags;
  inflight = null;
}

export async function isExperimentalKeyboardFirstEnabled(): Promise<boolean> {
  return (await loadFlags()).experimental.keyboardFirst;
}

export async function isExperimentalOnboardingEnabled(): Promise<boolean> {
  return (await loadFlags()).experimental.onboarding;
}

export async function isExperimentalSwsValidatorEnabled(): Promise<boolean> {
  return (await loadFlags()).experimental.swsValidator;
}

export async function isExperimentalStreamingEnabled(): Promise<boolean> {
  return (await loadFlags()).experimental.streaming;
}

// Re-export Locale so callers can import both from a single module.
export type { Locale };
