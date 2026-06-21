// src/shared/ipc/tourReset.ts
// v1.6.0 W — IPC channel constants + payload types for the tour cluster.
//
// 设计要点 (locked W spec §3.2):
//   - 5 new channels: tour:reset / tour:state-get / tour:state-set
//     feature-flags:get / demo-ecu:load
//   - Channels use the `tour:*` / `feature-flags:*` / `demo-ecu:*` namespace
//     so W stays orthogonal to A+C (`headless:*`) and G (future `validator:*`)
//   - Channel name strings are the wire-format SoT; payload types live here
//     so main / preload / renderer all import from a single path
//   - TourResetRequest / TourResetResponse are `void` (no args / no return)

/**
 * Channel name constants. Use these instead of inline strings so a
 * typo is a compile-time error rather than a silent IPC miss.
 */
export const TOUR_CHANNELS = {
  RESET: 'tour:reset',
  STATE_GET: 'tour:state-get',
  STATE_SET: 'tour:state-set',
  FEATURE_FLAGS_GET: 'feature-flags:get',
  DEMO_ECU_LOAD: 'demo-ecu:load',
} as const;

/** No payload — the renderer calls this to clear persisted tour state. */
export type TourResetRequest = void;

/** No payload — the renderer awaits this once persistence is cleared. */
export type TourResetResponse = void;

/**
 * Persisted tour state shape. Stored at `<userData>/tour.json` via the
 * v1.5.1 PR(4) `writeAtomic` helper (see §4.1 + §5.5). The renderer
 * reads/writes it via tour:state-get / tour:state-set on boot.
 *
 * `version: 1` is fixed for v1.6.0; future bumps land as `version: 2`
 * with a migration path (no silent default).
 */
export interface TourPersistedState {
  readonly version: 1;
  /** Epoch ms when the user clicked Skip. Null = never dismissed. */
  readonly dismissedAt: number | null;
  /** Epoch ms when the user reached the last step + clicked Finish. */
  readonly completedAt: number | null;
  /** App version that last showed the tour (semver string). Bumps re-arm. */
  readonly lastShownVersion: string | null;
}

/**
 * Bundled Demo ECU manifest response. The IPC handler reads
 * `samples/arxml/demo-ecu/demo.autosarcfg.json` (relative to the
 * package `extraResources`) and parses it via
 * `parseDemoEcuManifest` (see src/renderer/onboarding/DemoEcuManifest.ts).
 *
 * `estimatedLoadMs` is measured at startup so the welcome card can
 * surface "loads in N ms" — see W spec §3.4.
 */
export interface DemoEcuManifest {
  readonly templateId: 'demo-ecu';
  readonly displayName: string;
  readonly bswmdPaths: readonly string[];
  readonly valueArxmlPaths: readonly string[];
  readonly estimatedLoadMs: number;
}

export interface DemoEcuLoadResponse {
  /** Absolute path to the parsed manifest file (for diagnostics). */
  readonly manifestPath: string;
  readonly manifest: DemoEcuManifest;
}

/**
 * Feature flags as the renderer sees them. Mirrors W spec §2.3 —
 * `keyboardFirst` is a top-level flat field (renderer convenience);
 * `experimental.*` carries the canonical wire shape (U spec owns
 * `experimental.keyboardFirst`).
 */
export interface FeatureFlagsResponse {
  readonly experimental: {
    readonly onboarding: boolean;
    readonly streaming: boolean;
    readonly indexedDb: boolean;
  };
  readonly keyboardFirst: boolean;
}