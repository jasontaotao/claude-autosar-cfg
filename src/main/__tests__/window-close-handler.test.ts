// v1.17.1 PATCH (T5 M1) — IPC-1 close-handler test.
//
// Verifies that `registerMainWindowCloseHandler` (added in v1.17.1
// to close the T5 M1 follow-up) wires the BrowserWindow `closed`
// event to clear the window accessor.
//
// Why this test exists: v1.17.0 T5 added `setMainWindow(null)`
// but no production code calls it. Without wiring, `getMainWindow()`
// returns a stale reference after `window.close()` and any IPC
// push (e.g. SCRIPT_PROGRESS) would `webContents.send` on a
// destroyed window. This test exercises the helper in isolation
// against a duck-typed fake window — no `electron` mock needed,
// consistent with the T5 design intent for `window.ts`
// ("Tests that mock this module — without mocking `electron` —
// can exercise the IPC emit path in isolation").

import type { BrowserWindow } from 'electron';
import { afterEach, describe, expect, it } from 'vitest';

import { getMainWindow, registerMainWindowCloseHandler, setMainWindow } from '../window.js';

afterEach(() => {
  // Reset module-level state between tests so the suite is
  // order-independent (window.ts holds state in a module-scoped
  // variable; without this reset, the second test would inherit
  // the first test's cleared accessor and the first test's
  // "not.toBeNull" assertion would not actually verify setup).
  setMainWindow(null);
});

/**
 * Minimal duck-typed stand-in for `BrowserWindow`. Only the
 * `on('closed', cb)` surface is needed by the helper. We keep
 * the handler in a single slot (last write wins) because that
 * mirrors how `src/main/index.ts:createMainWindow` invokes the
 * helper once per window lifetime.
 */
type FakeWindow = {
  on: (event: string, cb: () => void) => void;
  closedHandler: (() => void) | null;
};

function makeFakeWindow(): FakeWindow {
  const w: FakeWindow = {
    closedHandler: null,
    on(event: string, cb: () => void) {
      if (event === 'closed') {
        w.closedHandler = cb;
      }
    },
  };
  return w;
}

describe('registerMainWindowCloseHandler (v1.17.1 T5 M1)', () => {
  it('clears the window accessor when the closed event fires', () => {
    const w = makeFakeWindow();
    setMainWindow(w as unknown as Parameters<typeof setMainWindow>[0]);
    expect(getMainWindow()).not.toBeNull();

    registerMainWindowCloseHandler(w as unknown as BrowserWindow);
    expect(w.closedHandler).not.toBeNull();

    w.closedHandler!();
    expect(getMainWindow()).toBeNull();
  });

  it('is a no-op when no window is registered (idempotent)', () => {
    const w = makeFakeWindow();
    // Accessor starts null (afterEach reset).
    expect(getMainWindow()).toBeNull();

    registerMainWindowCloseHandler(w as unknown as BrowserWindow);
    // Triggering the close handler without an active window must
    // not throw — production code may call the helper before
    // `setMainWindow` if the boot order ever changes.
    w.closedHandler!();
    expect(getMainWindow()).toBeNull();
  });
});
