// src/main/ipc/featureFlagsHandler.ts
// v1.6.0 U — feature-flags:get main-process handler.
//
// v1.6.0 ships feature flags in two places:
//   1. The renderer's `src/renderer/config/featureFlags.ts` reads flags
//      via `autosarApi.getFeatureFlags()`. That bridge must hit a real
//      `ipcMain.handle('feature-flags:get', ...)` or the renderer falls
//      back to all-OFF (per the W spec §5.3 fallback contract).
//   2. The W cluster's `tourReset.ts` exposes a 4-flag shape
//      (`experimental.{onboarding, streaming, indexedDb}` + a flat
//      `keyboardFirst`); the U spec owns the broader 6-flag shape
//      including `headlessCli` and `swsValidator`.
//
// This handler serves the **U-spec shape** (the renderer's expected
// surface) and default-everything-OFF semantics — feature flag wiring
// is intentionally minimal in v1.6.0: enabling a flag requires a
// future change to read the value from a config file.
//
// Pure function: no fs / no IPC — easy to unit test without the
// ipcMain round-trip.

import type { FeatureFlags } from '../../shared/ipc/featureFlags.js';

export function featureFlagsGetHandler(): FeatureFlags {
  return {
    experimental: {
      onboarding: false,
      streaming: false,
      indexedDb: false,
      headlessCli: false,
      swsValidator: false,
      keyboardFirst: false,
    },
  };
}

