// src/core/sws-validator/hooks/useTourState.ts
// Cluster G (v1.6.0) — In-process zustand subscribe to W's tour slice.
//
// Per G spec §3.9 (locked 2026-06-21; Round 3 in-process refinement):
// G's debounce handler reads `validationPaused` from `useArxmlStore.tour`
// via `useArxmlStore.subscribe(state => state.tour, ...)` — NO new IPC
// channel. Cross-slice reads via zustand keep the module graph
// one-directional (G does not import W's reducer file, W does not
// import G's engine file).
//
// W spec §3.7 owns the `validationPaused` field + `tour:state-changed`
// propagation; G only subscribes.

import { useArxmlStore } from '../../../renderer/store/useArxmlStore.js';

/**
 * Read the current `validationPaused` boolean from `useArxmlStore.tour`.
 * Returns `false` when the tour slice hasn't been initialised yet
 * (W's slice may ship after G's, depending on PR merge order — the
 * cross-cluster acceptance is "tour running → G silent skip" not
 * "tour slice loaded").
 */
export function readValidationPaused(): boolean {
  const state = useArxmlStore.getState();
  const tour = (state as { tour?: { validationPaused?: boolean } }).tour;
  if (tour === undefined) return false;
  return tour.validationPaused === true;
}

/**
 * Set up an in-process subscription that calls `cb(validationPaused)`
 * whenever the tour's `validationPaused` field flips. Returns the
 * unsubscribe function. The engine installs one subscription at
 * engine-init time (renderer-only path).
 */
export function subscribeToValidationPaused(cb: (paused: boolean) => void): () => void {
  // zustand v4 2-arg subscribe: (selector, listener, options?)
  // The store does not require equality fn; the listener is invoked
  // on every store change with the selected slice. We narrow inside
  // the listener to read just `validationPaused`.
  type MaybeTour = { tour?: { validationPaused?: boolean } };
  return useArxmlStore.subscribe((s: MaybeTour) => {
    const paused = s.tour?.validationPaused === true;
    cb(paused);
  });
}