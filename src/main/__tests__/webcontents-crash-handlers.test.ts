// v1.18.0 MINOR T5 (PB-1) — main-side renderer crash recovery test.
//
// Background: When the renderer process crashes, hangs, or its GPU process
// crashes, the main process must surface a recovery dialog to the user and
// offer Reload/Quit (render-process-gone), Wait/Reload (unresponsive), or
// silent reload (gpu-process-crashed). These handlers are wired in
// `src/main/index.ts:createMainWindow` after `registerMainWindowCloseHandler`
// (v1.17.1 PATCH wiring site).
//
// Why this test exists: PB-1 was spec-only in v1.18.0 spec §5.1. Without a
// regression test, a future refactor of `createMainWindow` could silently
// remove the dialog handlers and the user would see no recovery prompt on
// renderer crash. This test exercises the handler-wiring contract: each
// event name maps to the correct `dialog.showMessageBox` shape and the
// correct post-dialog action (`reload()` / `app.quit()` / no-op).
//
// Approach: Mock the `electron` module BEFORE importing `index.ts`. The
// mock captures every `mainWindow.webContents.on(event, cb)` call via a
// `Map` keyed by event name. Tests then invoke the captured callbacks and
// assert on `dialog.showMessageBox` arguments + post-dialog side effects.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock state. `vi.hoisted` runs before `vi.mock`'s factory, so the
// mock closure can write into `capturedHandlers` / `dialogCalls` / etc.
// ---------------------------------------------------------------------------
// Wrap counters in objects so the mock factory (closure) can mutate them
// without violating `const` bindings in the outer scope.
const { capturedHandlers, dialogCalls, counters } = vi.hoisted(() => ({
  capturedHandlers: new Map<string, (...args: unknown[]) => unknown>(),
  dialogCalls: [] as Array<{
    win: unknown;
    opts: { type: string; title: string; message: string; buttons: string[]; defaultId: number };
  }>,
  counters: { reloadCalls: 0, quitCalls: 0 },
}));

// ---------------------------------------------------------------------------
// `electron` mock — `dialog.showMessageBox` records calls; `app.quit`
// increments a counter; `mainWindow.webContents.on(event, cb)` records the
// handler under its event name; `mainWindow.webContents.reload()` increments.
// `app.whenReady()` resolves immediately so `createMainWindow` can run in
// the background of the test (we don't await it — its only observable
// surface is the handler registrations).
// ---------------------------------------------------------------------------
vi.mock('electron', () => {
  const BrowserWindow = vi.fn().mockImplementation(() => ({
    webContents: {
      on: (event: string, cb: (...args: unknown[]) => unknown) => {
        capturedHandlers.set(event, cb);
      },
      setWindowOpenHandler: vi.fn(),
      reload: () => {
        counters.reloadCalls++;
      },
    },
    on: vi.fn(),
    loadURL: vi.fn().mockResolvedValue(undefined),
    loadFile: vi.fn().mockResolvedValue(undefined),
  }));
  return {
    app: {
      whenReady: () => Promise.resolve(),
      on: vi.fn(),
      quit: () => {
        counters.quitCalls++;
      },
    },
    BrowserWindow,
    dialog: {
      showMessageBox: vi.fn(
        (
          win: unknown,
          opts: {
            type: string;
            title: string;
            message: string;
            buttons: string[];
            defaultId: number;
          },
        ) => {
          dialogCalls.push({ win, opts });
          // Default response = defaultId (most tests override via the .then handler)
          return Promise.resolve({ response: opts.defaultId });
        },
      ),
    },
    shell: {
      openExternal: vi.fn(),
    },
    // v1.20.x — App logo wiring in `src/main/index.ts:createMainWindow`
    // uses `nativeImage.createFromPath(...)` to load the 32x32 PNG. The
    // production Electron returns a NativeImage stub when the file is
    // absent (silently empty), so the mock returns a minimal shape that
    // satisfies `BrowserWindow`'s constructor contract.
    nativeImage: {
      createFromPath: vi.fn(() => ({ isEmpty: () => false })),
    },
  };
});

// ---------------------------------------------------------------------------
// Stub out the IPC + cache initialization so importing index.ts does not
// require the real handlers / templates cache. These imports happen at the
// top of `app.whenReady().then(...)` and would otherwise blow up on
// missing files in the test environment.
// ---------------------------------------------------------------------------
vi.mock('../ipc/register.js', () => ({
  registerIpcHandlers: vi.fn(),
}));
vi.mock('../ipc/templatesHandler.js', () => ({
  initBuiltinTemplatesCache: vi.fn(),
}));
vi.mock('../window.js', () => ({
  registerMainWindowCloseHandler: vi.fn(),
  setMainWindow: vi.fn(),
  getMainWindow: vi.fn(() => null),
}));
vi.mock('../window-open-allowlist.js', () => ({
  isAllowedExternalUrl: vi.fn(() => false),
}));

// Now safe to import — `index.ts` calls `app.whenReady().then(...)` at top
// level; the handlers get registered asynchronously after the microtask
// queue drains. `beforeEach` flushes the queue.
beforeEach(async () => {
  capturedHandlers.clear();
  dialogCalls.length = 0;
  counters.reloadCalls = 0;
  counters.quitCalls = 0;

  // Import (or re-import) the module under test. The first import wires the
  // handlers; subsequent imports are cached. Use dynamic import + cache
  // invalidation via `vi.resetModules` to ensure a clean handler map per
  // test — otherwise handlers from a previous test bleed into the next.
  vi.resetModules();
  await import('../index.js');
  // Flush microtasks so `app.whenReady().then(createMainWindow)` runs and
  // registers handlers via `mainWindow.webContents.on(...)`.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

afterEach(() => {
  vi.resetModules();
});

describe('PB-1: main-side renderer crash recovery handlers', () => {
  it('renders an error dialog with Reload/Quit on render-process-gone', async () => {
    const handler = capturedHandlers.get('render-process-gone');
    expect(handler).toBeDefined();

    // Simulate Electron firing the event with a `details` payload. We type
    // it loosely because the production signature comes from Electron's
    // generated types which we do not pull into the test environment.
    handler!({}, { reason: 'crashed', exitCode: 1 });

    // Flush the `.then(...)` microtask chain that consumes the dialog response.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dialogCalls).toHaveLength(1);
    expect(dialogCalls[0]!.opts.type).toBe('error');
    expect(dialogCalls[0]!.opts.title).toBe('Renderer crashed');
    expect(dialogCalls[0]!.opts.buttons).toEqual(['Reload', 'Quit']);
    expect(dialogCalls[0]!.opts.defaultId).toBe(0);
    expect(dialogCalls[0]!.opts.message).toContain('crashed');
  });

  it('reloads the renderer when the user clicks Reload on render-process-gone', async () => {
    const handler = capturedHandlers.get('render-process-gone');
    expect(handler).toBeDefined();

    // Override the dialog to simulate the user clicking Reload (response 0).
    // `checkboxChecked` is required by MessageBoxReturnValue in @types/electron.
    const { dialog } = await import('electron');
    vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({
      response: 0,
      checkboxChecked: false,
    });

    handler!({}, { reason: 'crashed', exitCode: 1 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(counters.reloadCalls).toBe(1);
    expect(counters.quitCalls).toBe(0);
  });

  it('quits the app when the user clicks Quit on render-process-gone', async () => {
    const handler = capturedHandlers.get('render-process-gone');
    expect(handler).toBeDefined();

    const { dialog } = await import('electron');
    vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({
      response: 1,
      checkboxChecked: false,
    });

    handler!({}, { reason: 'crashed', exitCode: 1 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(counters.reloadCalls).toBe(0);
    expect(counters.quitCalls).toBe(1);
  });

  it('renders a warning dialog with Wait/Reload on unresponsive', async () => {
    const handler = capturedHandlers.get('unresponsive');
    expect(handler).toBeDefined();

    handler!();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dialogCalls).toHaveLength(1);
    expect(dialogCalls[0]!.opts.type).toBe('warning');
    expect(dialogCalls[0]!.opts.title).toBe('Renderer unresponsive');
    expect(dialogCalls[0]!.opts.buttons).toEqual(['Wait', 'Reload']);
    expect(dialogCalls[0]!.opts.defaultId).toBe(0);
  });

  it('reloads silently on gpu-process-crashed (no dialog)', async () => {
    const handler = capturedHandlers.get('gpu-process-crashed');
    expect(handler).toBeDefined();

    // gpu-process-crashed fires with `(_e, killed: boolean)`.
    handler!({}, true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // No dialog — silent recovery is the spec'd behavior.
    expect(dialogCalls).toHaveLength(0);
    // But a reload IS issued so the renderer picks up a fresh GPU process.
    expect(counters.reloadCalls).toBe(1);
    expect(counters.quitCalls).toBe(0);
  });
});
