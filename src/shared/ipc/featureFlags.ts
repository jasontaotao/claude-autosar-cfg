// src/shared/ipc/featureFlags.ts
// v1.6.0 U — shared feature-flags wire types.
//
// `FeatureFlags` is the canonical payload returned by the
// `feature-flags:get` IPC handler. Lives in `shared/` so the main
// process and the renderer both import from a single SoT.
//
// The W spec (`src/shared/ipc/tourReset.ts` `FeatureFlagsResponse`)
// ships a narrower 4-flag shape (3 experimental + flat
// `keyboardFirst`); the U spec owns the broader 6-flag shape
// including `headlessCli` and `swsValidator`. We keep both surfaces
// for now; the main handler serves the U shape and the W consumers
// project the fields they need.

export interface FeatureFlags {
  readonly experimental: {
    readonly onboarding: boolean;
    readonly streaming: boolean;
    readonly indexedDb: boolean;
    readonly headlessCli: boolean;
    readonly swsValidator: boolean;
    readonly keyboardFirst: boolean;
  };
}
