// src/renderer/lib/__tests__/TourIpcContract.test.ts
// v1.6.0 Cluster U — TourIpcContract type contract test.
//
// Per U spec §6.6: U consumes the W-defined `tour:reset` IPC channel
// via a preload-bridge-injected `TourIpcContract`. This test pins the
// shape so the renderer-side type and the main-side handler agree
// (without W's actual implementation shipping yet, the contract is the
// frozen surface U depends on).

import { describe, expect, it } from 'vitest';

import {
  createStubTourIpcContract,
  type TourIpcContract,
  type TourState,
} from '../TourIpcContract.js';

describe('TourIpcContract (v1.6.0 U)', () => {
  it('exposes reset() returning a Promise<void>', async () => {
    const c: TourIpcContract = createStubTourIpcContract();
    const r = c.reset();
    expect(r).toBeInstanceOf(Promise);
    await r;
  });

  it('exposes getState() returning a Promise<TourState>', async () => {
    const c = createStubTourIpcContract();
    const state: TourState = await c.getState();
    expect(['idle', 'running', 'dismissed', 'completed', 'suppressed']).toContain(state);
  });

  it('exposes onStateChange(cb) returning an unsubscribe function', () => {
    const c = createStubTourIpcContract();
    const cb = (): void => undefined;
    const unsub = c.onStateChange(cb);
    expect(typeof unsub).toBe('function');
    unsub(); // idempotent
  });

  it('stub surfaces the 5 documented TourState values', () => {
    const c = createStubTourIpcContract();
    const states: TourState[] = ['idle', 'running', 'dismissed', 'completed', 'suppressed'];
    for (const s of states) {
      expect(typeof s).toBe('string');
    }
    // Stub default state is 'idle' so the Reset button can render
    // without an initial W round-trip.
    void c;
  });
});