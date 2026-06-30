// v1.18.0 MINOR T6 (PB-3) — graceful shutdown drain registry.
//
// Background: When the user quits (or the OS sends SIGTERM), `app.quit()`
// fires the `before-quit` event in the main process. By default Electron
// exits as soon as `before-quit` listeners return — there is no built-in
// way to wait for in-flight async work to finish.
//
// This module is the registry used by `app.on('before-quit', ...)` in
// `src/main/index.ts` to track in-flight IPC handler promises. `drainInFlightHandlers`
// awaits ALL currently-tracked promises before the app actually exits.
//
// Design choices (rationale next to each decision):
//
//   1. `Set<Promise<unknown>>` — Set semantics give us O(1) add/delete and
//      `inFlight.has(p)` membership checks. The `unknown` element type
//      reflects that callers can track any Promise shape; `trackHandler`
//      preserves the original type via its generic signature.
//
//   2. `trackHandler(p).finally(() => inFlight.delete(p))` — the `.finally`
//      callback fires whether the handler resolves or rejects. The
//      returned Promise is the ORIGINAL handler's Promise (chained via
//      `.finally`), NOT the bookkeeping wrapper — so callers awaiting
//      `trackHandler(p)` see the handler's value, not the drain state.
//      Critically, `trackHandler` MUST NOT re-throw rejections — IPC
//      handlers are responsible for their own error handling.
//
//   3. `drainInFlightHandlers` snapshots the set on entry. Without the
//      snapshot, a handler that spawns a follow-up IPC call would create
//      a new entry AFTER the drain started, causing the drain to either
//      loop forever (if it re-scans) or miss the new entry (if it
//      captures an iterator). `Array.from(inFlight)` + `Promise.allSettled`
//      bounds the wait to the entries present at entry, and any
//      post-drain additions are owned by the next drain cycle.
//
//   4. `Promise.allSettled` (not `Promise.all`) — a single rejected
//      handler must NOT prevent drain from settling, because the caller
//      wraps `drainInFlightHandlers().finally(() => app.quit())` and a
//      rejecting drain would skip the `app.quit()` re-fire. With
//      `allSettled`, the drain always resolves; rejections are silently
//      absorbed (they should have been logged by the handler itself).
//
//   5. `_resetForTest` — test-only escape hatch. The drain registry is
//      module-scoped (so the same Set is shared between IPC handlers in
//      production and the `before-quit` handler), which means tests
//      need a way to start each case from a clean state. The leading
//      underscore signals "private to the package — do not import from
//      outside main/".

const inFlight = new Set<Promise<unknown>>();

/**
 * Track an in-flight async IPC handler.
 *
 * Adds `p` to the registry and returns a Promise that mirrors `p`'s
 * settlement (resolve OR reject). On settlement, `p` is removed from the
 * registry via `.finally`. The returned Promise is NOT a new wrapper —
 * it's `p.finally(...)`, so callers awaiting `trackHandler(p)` receive
 * the handler's value with no behavioral change.
 *
 * @param p - The Promise returned by an IPC handler (or any other async work).
 * @returns A Promise that settles with the same value/error as `p`.
 */
export function trackHandler<T>(p: Promise<T>): Promise<T> {
  inFlight.add(p);
  // Use .finally to remove from set regardless of resolve/reject.
  // The returned promise must NOT reject when the underlying handler
  // rejects — handlers must handle their own errors.
  return p.finally(() => {
    inFlight.delete(p);
  });
}

/**
 * Drain all currently-tracked in-flight handlers.
 *
 * Snapshots the registry at entry, then awaits every Promise in the
 * snapshot via `Promise.allSettled` (so individual rejections do NOT
 * prevent the drain from settling). After `await` returns, the registry
 * is empty.
 *
 * Handlers added DURING the drain are NOT awaited — they remain in the
 * registry and will be picked up by the next drain cycle. This bounds
 * the wait time and prevents an infinite-loop scenario where a handler
 * spawns a follow-up handler that spawns another, etc.
 *
 * @returns A Promise that always resolves (never rejects). Resolves with
 *          `undefined` after every snapshot entry has settled.
 */
export async function drainInFlightHandlers(): Promise<void> {
  // Snapshot the set so handlers added during drain don't block forever.
  const snapshot = Array.from(inFlight);
  await Promise.allSettled(snapshot);
  inFlight.clear();
}

/**
 * Test/debug accessor — return the current number of tracked handlers.
 * Production code should not rely on this; it exists for diagnostics
 * and for the drain tests.
 *
 * @returns Number of Promises currently in the registry.
 */
export function pendingHandlerCount(): number {
  return inFlight.size;
}

/**
 * Test-only: reset the registry to empty. Called by tests in `beforeEach`
 * / `afterEach` to ensure each case starts from a clean state.
 *
 * NOT exported from `index.ts` or any public surface — only test files
 * should import this (the leading underscore signals private-to-package).
 */
export function _resetForTest(): void {
  inFlight.clear();
}
