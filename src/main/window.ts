// v1.17.0 MINOR (T5) IPC-1 — main BrowserWindow accessor.
//
// Lives in its own module so IPC handlers (e.g. script-handler)
// can import the accessor without dragging the entire
// `src/main/index.ts` boot sequence (`app.whenReady`, etc.) into
// their unit-test import graph. Tests that mock this module —
// without mocking `electron` — can exercise the IPC emit path
// in isolation.
//
// The real production `mainWindow` reference is owned by THIS
// module. `src/main/index.ts` calls `setMainWindow` from its
// `createMainWindow` factory to register the live BrowserWindow.
// IPC handlers (e.g. script-handler) call `getMainWindow` to read
// the current value without depending on the boot sequence.

import type { BrowserWindow } from 'electron';

let _mainWindow: BrowserWindow | null = null;

/**
 * Register the production main BrowserWindow. Called once from
 * `createMainWindow()` in `src/main/index.ts`. Production code
 * MUST NOT call this from any other site — the invariant is "one
 * window, registered exactly once at boot".
 */
export function setMainWindow(w: BrowserWindow | null): void {
  _mainWindow = w;
}

/**
 * Read the current main BrowserWindow. Returns `null` before
 * `setMainWindow` runs, or after the window is closed. IPC
 * handlers MUST null-check before calling `webContents.send`.
 */
export function getMainWindow(): BrowserWindow | null {
  return _mainWindow;
}
