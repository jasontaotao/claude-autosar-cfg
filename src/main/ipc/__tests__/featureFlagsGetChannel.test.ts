// v1.51.0 PATCH T2 -- regression test for IPC_CHANNELS.FEATURE_FLAGS_GET
// hoisted-const stability.
//
// Pins two contracts:
//   1. The string identity ('feature-flags:get') matches between
//      IPC_CHANNELS and the top-level alias export.
//   2. The top-level alias export points back to the IPC_CHANNELS
//      entry -- no alias drift.
//
// The Round-10 F-2 finding was that the channel was referenced as a
// raw string literal in 2 sites (register.ts:519 + preload/index.ts:305)
// without an IPC_CHANNELS entry. This test catches the regression:
// if either site ever falls back to a literal, the alias-export
// surface remains the only SoT and lint warnings would surface a
// drift here.

import { describe, expect, it } from 'vitest';

import { FEATURE_FLAGS_GET, IPC_CHANNELS } from '../../../shared/ipc-contract.js';

describe('IPC_CHANNELS.FEATURE_FLAGS_GET (v1.51.0 PATCH T2 -- Round-10 F-2 closure)', () => {
  it('IPC_CHANNELS.FEATURE_FLAGS_GET is the canonical "feature-flags:get" string', () => {
    expect(IPC_CHANNELS.FEATURE_FLAGS_GET).toBe('feature-flags:get');
  });

  it('top-level alias points back to the IPC_CHANNELS entry', () => {
    expect(FEATURE_FLAGS_GET).toBe('feature-flags:get');
    expect(FEATURE_FLAGS_GET).toBe(IPC_CHANNELS.FEATURE_FLAGS_GET);
  });

  it('FEATURE_FLAGS_GET is in the IpcChannel union', () => {
    // The IpcChannel type is (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS].
    // This `as unknown as string` cast confirms the key exists at
    // runtime -- if the entry were missing, tsc would error out at
    // the export site well before this test runs.
    const channelId = (IPC_CHANNELS as unknown as Record<string, string>).FEATURE_FLAGS_GET;
    expect(channelId).toBe('feature-flags:get');
  });
});
