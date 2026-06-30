// v1.18.0 MINOR T6 (PB-3) — graceful shutdown drain registry tests.
//
// Background: PB-3 adds a `before-quit` handler in `src/main/index.ts` that
// intercepts the first `app.quit()`, awaits in-flight IPC handler promises
// tracked in `src/main/shutdown/drain.ts`, then re-quits. The drain registry
// is the critical correctness primitive — if it leaks handlers, an
// in-flight `SCRIPT_RUN` (which can take up to 5s per `req.timeoutMs`)
// could be torn down mid-execution, corrupting manifest state.
//
// Why this test exists: The drain registry has 5 behavioral contracts that
// any future refactor must preserve:
//   1. Drain with empty registry resolves immediately (no IPC, no handlers
//      to wait for — quit should not block).
//   2. `trackHandler` returns a Promise that resolves when the underlying
//      handler resolves; callers awaiting `trackHandler(p)` see the
//      handler's value (NOT the drain-side bookkeeping).
//   3. After drain, the registry is empty — verified by `pendingHandlerCount`
//      returning 0 and a subsequent drain returning immediately.
//   4. Handlers added DURING drain don't block the drain (snapshot
//      semantics — `Array.from(inFlight)` captures the set at drain entry,
//      then `await Promise.allSettled` waits only on the snapshot).
//   5. A rejected handler does NOT cause `drainInFlightHandlers` to reject.
//      `Promise.allSettled` ignores individual rejections — drain must
//      always settle so `app.quit()` always fires.
//
// Approach: Pure unit tests against the registry. No electron mock needed
// because `drain.ts` does not import `electron` — drain is a pure data
// structure (Set<Promise<unknown>>) plus 4 functions.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  _resetForTest,
  drainInFlightHandlers,
  pendingHandlerCount,
  trackHandler,
} from '../shutdown/drain.js';

beforeEach(() => {
  _resetForTest();
});

afterEach(() => {
  _resetForTest();
});

describe('PB-3: shutdown drain registry', () => {
  it('drainInFlightHandlers resolves immediately when the registry is empty', async () => {
    // No handlers tracked — drain must NOT block on any I/O.
    const start = Date.now();
    await drainInFlightHandlers();
    const elapsed = Date.now() - start;
    // 50ms is generous (microtask-only path should be <1ms). If this ever
    // trips, the drain accidentally awaited something external.
    expect(elapsed).toBeLessThan(50);
    expect(pendingHandlerCount()).toBe(0);
  });

  it('trackHandler waits for the tracked handler to complete', async () => {
    // Track a handler that resolves with a value after a short delay.
    // `trackHandler` must return the resolved value (NOT the bookkeeping
    // Promise.allSettled wrapper), so callers see the handler's return.
    let resolved = false;
    const tracked = trackHandler(
      new Promise<string>((resolve) => {
        setTimeout(() => {
          resolved = true;
          resolve('done');
        }, 10);
      }),
    );

    // While the handler is pending, the registry has 1 entry.
    expect(pendingHandlerCount()).toBe(1);

    // The returned Promise must resolve with the handler's value.
    await expect(tracked).resolves.toBe('done');
    expect(resolved).toBe(true);

    // After settle, the `.finally` callback should have removed the entry.
    expect(pendingHandlerCount()).toBe(0);
  });

  it('drainInFlightHandlers clears the registry after completion', async () => {
    // Track 3 concurrent handlers, drain, verify registry is empty.
    const p1 = trackHandler(Promise.resolve('a'));
    const p2 = trackHandler(Promise.resolve('b'));
    const p3 = trackHandler(Promise.resolve('c'));

    expect(pendingHandlerCount()).toBe(3);

    await drainInFlightHandlers();

    expect(pendingHandlerCount()).toBe(0);
    // Caller-facing promises still resolved with their values.
    await expect(p1).resolves.toBe('a');
    await expect(p2).resolves.toBe('b');
    await expect(p3).resolves.toBe('c');

    // A second drain should be a no-op (registry empty, microtask only).
    const start = Date.now();
    await drainInFlightHandlers();
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('handlers added DURING drain do not block the drain (snapshot semantics)', async () => {
    // Track a handler that, when awaited, spawns a new tracked handler.
    // Drain must NOT wait for the late-spawned handler — it would loop
    // forever in `Promise.allSettled` if it re-scanned the set.
    let lateSpawned = false;
    const original = trackHandler(
      new Promise<void>((resolve) => {
        setTimeout(() => {
          // Spawn a new tracked handler AFTER the original settles. This
          // simulates an IPC handler that triggers a follow-up IPC call.
          trackHandler(
            new Promise<void>((r) => {
              setTimeout(() => {
                lateSpawned = true;
                r();
              }, 200); // Long enough that a buggy drain would block.
            }),
          );
          resolve();
        }, 10);
      }),
    );

    expect(pendingHandlerCount()).toBe(1);

    // Drain must resolve within a short window — it should NOT wait 200ms
    // for the late-spawned handler.
    const start = Date.now();
    await drainInFlightHandlers();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(150);
    // Original handler is done (it spawned the late one, then resolved).
    await original;
    // The late-spawned handler should NOT have completed by now (we are
    // still within its 200ms window) — proving drain did not await it.
    expect(lateSpawned).toBe(false);
    // Drain ALWAYS clears the registry on completion (per contract:
    // "After `await` returns, the registry is empty"). The late entry
    // is wiped by the .clear() — but the drain did NOT wait for it
    // (proven by `lateSpawned === false` and elapsed < 150ms).
    expect(pendingHandlerCount()).toBe(0);
  });

  it('rejected handlers do not cause drainInFlightHandlers to reject', async () => {
    // Track a handler that rejects. Drain must settle (not reject) so the
    // caller can unconditionally call `app.quit()` in a `.finally`.
    const rejecting = trackHandler(Promise.reject(new Error('handler-boom')));

    // Swallow the rejection on the caller-facing promise so vitest doesn't
    // flag it as an unhandled rejection — this is exactly what production
    // code does (handlers handle their own errors; `trackHandler` is the
    // bookkeeping wrapper that NEVER re-throws).
    rejecting.catch(() => {
      /* expected — drain must not propagate */
    });

    expect(pendingHandlerCount()).toBe(1);

    // The drain itself MUST resolve (not reject) — `Promise.allSettled`
    // is the implementation choice that makes this contract hold.
    await expect(drainInFlightHandlers()).resolves.toBeUndefined();

    // Registry cleared.
    expect(pendingHandlerCount()).toBe(0);
  });
});
