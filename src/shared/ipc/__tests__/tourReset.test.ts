// src/shared/ipc/__tests__/tourReset.test.ts
// v1.6.0 W — IPC contract for `tour:reset` and `tour:state-*` channels.
//
// Contract (locked W spec §3.2):
//   - `tour:reset` (R→M, invoke) clears persisted tour state
//   - `tour:state-get` (R→M, invoke) returns TourPersistedState
//   - `tour:state-set` (R→M, invoke) writes TourPersistedState
//   - `feature-flags:get` (R→M, invoke) returns FeatureFlags (passthrough)
//   - `demo-ecu:load` (R→M, invoke) returns DemoEcuManifest
//
// TDD: channel constants + payload types land BEFORE main-side handlers.

import { describe, expect, it } from 'vitest';

import {
  TOUR_CHANNELS,
  type TourPersistedState,
  type DemoEcuManifest,
  type TourResetRequest,
  type TourResetResponse,
  type FeatureFlagsResponse,
  type DemoEcuLoadResponse,
} from '../tourReset.js';

describe('TOUR_CHANNELS (v1.6.0 W)', () => {
  it('defines the 5 W cluster channels with stable names', () => {
    expect(TOUR_CHANNELS.RESET).toBe('tour:reset');
    expect(TOUR_CHANNELS.STATE_GET).toBe('tour:state-get');
    expect(TOUR_CHANNELS.STATE_SET).toBe('tour:state-set');
    expect(TOUR_CHANNELS.FEATURE_FLAGS_GET).toBe('feature-flags:get');
    expect(TOUR_CHANNELS.DEMO_ECU_LOAD).toBe('demo-ecu:load');
  });
});

describe('TourPersistedState', () => {
  it('accepts the canonical 4-field shape (version + 3 timestamps)', () => {
    const s: TourPersistedState = {
      version: 1,
      dismissedAt: 1_700_000_000_000,
      completedAt: null,
      lastShownVersion: null,
    };
    expect(s.version).toBe(1);
    expect(s.dismissedAt).toBeTypeOf('number');
    expect(s.completedAt).toBeNull();
    expect(s.lastShownVersion).toBeNull();
  });
});

describe('IPC payload types', () => {
  it('TourResetRequest is a void payload (no args)', () => {
    const _req: TourResetRequest = undefined;
    expect(_req).toBeUndefined();
  });

  it('TourResetResponse is a void promise (clears persistence)', () => {
    const _res: TourResetResponse = undefined;
    expect(_res).toBeUndefined();
  });

  it('DemoEcuManifest carries the canonical 5-field shape', () => {
    const m: DemoEcuManifest = {
      templateId: 'demo-ecu',
      displayName: 'Demo ECU',
      bswmdPaths: ['bswmd/Bsw_Com_Bswmd.arxml'],
      valueArxmlPaths: ['EcuC_Config.arxml'],
      estimatedLoadMs: 250,
    };
    expect(m.templateId).toBe('demo-ecu');
    expect(m.bswmdPaths).toHaveLength(1);
    expect(m.valueArxmlPaths).toHaveLength(1);
  });

  it('FeatureFlagsResponse mirrors the W spec §2.3 shape', () => {
    const f: FeatureFlagsResponse = {
      experimental: { onboarding: false, streaming: false, indexedDb: false },
      keyboardFirst: false,
    };
    expect(f.experimental.onboarding).toBe(false);
    expect(f.keyboardFirst).toBe(false);
  });

  it('DemoEcuLoadResponse wraps DemoEcuManifest with the manifest path', () => {
    const r: DemoEcuLoadResponse = {
      manifestPath: 'samples/arxml/demo-ecu/demo.autosarcfg.json',
      manifest: {
        templateId: 'demo-ecu',
        displayName: 'Demo ECU',
        bswmdPaths: [],
        valueArxmlPaths: [],
        estimatedLoadMs: 100,
      },
    };
    expect(r.manifestPath).toContain('demo.autosarcfg.json');
  });
});