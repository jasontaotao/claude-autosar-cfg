// src/renderer/lib/TourIpcContract.ts
// v1.6.0 Cluster U — preload-bridge-injected TourIpcContract type.
//
// U spec §6.6: Cluster U does NOT own the `tour:reset` IPC channel —
// W §3.2 defines it. U only consumes the typed bridge that W injects
// into `window.autosarApi.tour` (preload-side). This module exports:
//   1. The TypeScript shape U depends on (compile-time safety)
//   2. A `createStubTourIpcContract()` factory that no-ops when W's
//      IPC handler isn't registered yet — defensive default so the
//      renderer does not crash in v1.6.0 main builds where W has not
//      shipped.
//
// Once W ships (Sprint 18), the stub is replaced by the real contract
// from `window.autosarApi.tour`. The shape is locked across both
// surfaces (W spec §3.2 + U spec §6.6).

export type TourState = 'idle' | 'running' | 'dismissed' | 'completed' | 'suppressed';

export interface TourIpcContract {
  /** Triggers W store action `tourReset()`; clears <userData>/tour.json. */
  reset(): Promise<void>;
  /** Returns current W TourState. */
  getState(): Promise<TourState>;
  /** Subscribes to TourState changes; returns idempotent unsubscribe. */
  onStateChange(cb: (state: TourState) => void): () => void;
}

/** Safe-default stub used when W hasn't shipped yet. The real
 *  implementation is injected via `window.autosarApi.tour` (W PR(W-1)
 *  owns the preload bridge line). U never blocks on W — the menu item
 *  renders when the flag is ON, the IPC call resolves or warns but
 *  never crashes the renderer. */
export function createStubTourIpcContract(): TourIpcContract {
  let state: TourState = 'idle';
  const listeners = new Set<(s: TourState) => void>();
  return {
    async reset(): Promise<void> {
      state = 'idle';
      for (const l of listeners) l(state);
    },
    async getState(): Promise<TourState> {
      return state;
    },
    onStateChange(cb): () => void {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}

/** Resolve the live TourIpcContract from the preload bridge when
 *  available; otherwise return the stub. Callers should ALWAYS treat
 *  the returned contract as the source of truth. */
export function getTourIpcContract(): TourIpcContract {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = typeof globalThis !== 'undefined' ? (globalThis as any).window : undefined;
  if (w !== undefined && w.autosarApi !== undefined && w.autosarApi.tour !== undefined) {
    return w.autosarApi.tour as TourIpcContract;
  }
  return createStubTourIpcContract();
}
