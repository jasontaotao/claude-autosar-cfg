// src/preload/__tests__/platform.test.ts
// v1.6.0 Cluster U — `process.platform` preload bridge (TDD).
//
// The renderer cannot read Node.js globals directly (sandboxed by
// Electron's contextBridge). U spec §6.4 + A+C §17 Q8 lock the design:
// expose `process.platform` verbatim via the preload bridge so the
// renderer can normalize `Mod` ↔ `Cmd`/`Ctrl` without an extra IPC
// round-trip.

import { describe, expect, it } from 'vitest';

import { getRendererPlatform } from '../platform.js';

describe('platform preload bridge (v1.6.0 U)', () => {
  it('exposes the host Node platform via getRendererPlatform()', () => {
    const p = getRendererPlatform();
    // Node 22 reports 'win32' / 'darwin' / 'linux' / etc. on
    // supported hosts. We accept any string but assert it matches
    // process.platform verbatim.
    expect(p).toBe(process.platform);
  });
});
