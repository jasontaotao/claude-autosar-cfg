import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow, dialog, shell } from 'electron';

import { registerIpcHandlers } from './ipc/register.js';
import { logFatal } from './log.js';
import { drainInFlightHandlers } from './shutdown/drain.js';
import { isAllowedExternalUrl } from './window-open-allowlist.js';
import { registerMainWindowCloseHandler, setMainWindow } from './window.js';

// v1.15.5 — log-only safety nets for process-wide fatal events.
// Fire-and-forget `cacheSet` from arxml-stream + vm-runner timeouts
// can otherwise leak unhandled rejections and crash the main process.
// We deliberately do NOT call `app.exit(1)` — see `log.ts` rationale.
process.on('uncaughtException', (err) => {
  logFatal('uncaughtException', err);
});
process.on('unhandledRejection', (reason) => {
  logFatal('unhandledRejection', reason);
});

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'claude-AutosarCfg',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      // v1.18.0 MINOR T2 (SE-1) — flip OS-level Chromium sandbox ON.
      // Safe per preload bridge audit (src/main/__tests__/sandbox-flip.test.ts):
      // bridge exposes only typed function refs; `process.platform` is read in
      // the preload process via getRendererPlatform() and serialized to a
      // string before crossing contextBridge. No Node handles exposed.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // v1.17.0 MINOR (T5) IPC-1 — publish the live BrowserWindow to
  // `window.ts` so IPC handlers can read it via `getMainWindow`
  // without importing this boot module (which calls `app.whenReady`
  // and breaks tests that don't mock `electron`).
  setMainWindow(mainWindow);
  // v1.17.1 PATCH (T5 M1) — wire the close handler so the accessor
  // is cleared when the user closes the window. Without this,
  // `getMainWindow()` would return a stale reference and any IPC
  // push (e.g. SCRIPT_PROGRESS) would call `webContents.send` on
  // a destroyed window — which Electron rejects.
  registerMainWindowCloseHandler(mainWindow);

  // v1.18.0 MINOR T5 (PB-1) — renderer crash recovery dialogs.
  // Three handlers cover the recoverable failure modes Electron surfaces
  // on `webContents`:
  //   * `render-process-gone` — renderer process exited (crashed / OOM /
  //     killed). Hard failure, requires user choice: Reload (re-spawn the
  //     renderer, preserving main-side state) or Quit (close the app).
  //   * `unresponsive` — renderer stopped responding for >30s. Soft failure
  //     (renderer may recover). Offer Wait (no action, user can keep
  //     waiting) or Reload (force a fresh renderer).
  //   * `gpu-process-crashed` — GPU subprocess died. Recoverable without
  //     user intervention: a reload re-attaches a fresh GPU process. No
  //     dialog — this is a transient infrastructure failure, not a
  //     user-facing error.
  // All three log via `logFatal` so post-mortem analysis can correlate
  // the dialog with the crash payload (see src/main/log.ts).
  //
  // Capture `mainWindow` in a local const so the async `.then` closures
  // don't need a non-null assertion — the dialog + reload fire after the
  // current microtask and `mainWindow` could in principle be cleared.
  const win = mainWindow;
  // The webContents event overload set in @types/electron only enumerates
  // a subset of event names (`zoom-changed` is the last overload). The
  // three crash-recovery events here are valid runtime events but lack
  // compile-time overloads — narrow via a typed callback signature.
  type RenderProcessGoneDetails = { reason: string; exitCode: number };
  interface CrashRecoveryWebContents {
    on(
      event: 'render-process-gone',
      listener: (_e: unknown, details: RenderProcessGoneDetails) => void,
    ): unknown;
    on(event: 'unresponsive', listener: () => void): unknown;
    on(event: 'gpu-process-crashed', listener: (_e: unknown, killed: boolean) => void): unknown;
  }
  const wc = win.webContents as unknown as CrashRecoveryWebContents;
  wc.on('render-process-gone', (_e, details) => {
    logFatal('render-process-gone', details);
    dialog
      .showMessageBox(win, {
        type: 'error',
        title: 'Renderer crashed',
        message: `Renderer process exited unexpectedly (reason: ${details.reason}).`,
        buttons: ['Reload', 'Quit'],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) win.webContents.reload();
        else app.quit();
      });
  });

  wc.on('unresponsive', () => {
    logFatal('webContents-unresponsive', new Error('Renderer unresponsive > 30s'));
    dialog
      .showMessageBox(win, {
        type: 'warning',
        title: 'Renderer unresponsive',
        message: 'The renderer is unresponsive. Continue waiting?',
        buttons: ['Wait', 'Reload'],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 1) win.webContents.reload();
      });
  });

  wc.on('gpu-process-crashed', (_e, killed) => {
    logFatal('gpu-process-crashed', new Error(`GPU process crashed (killed=${killed})`));
    win.webContents.reload();
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  // Open external links in default browser — gate via allowlist (HIGH-5 from v1.10.2 joint review).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Dev: load vite dev server; Prod: load built index.html
  if (process.env['VITE_DEV_SERVER_URL']) {
    await mainWindow.loadURL(process.env['VITE_DEV_SERVER_URL']);
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  // Sprint 13 #1 — populate the built-in templates cache at boot.
  // The cache is read-only after this; no file watcher needed because
  // samples/ is part of the install, not user-mutable.
  const { initBuiltinTemplatesCache } = await import('./ipc/templatesHandler.js');
  initBuiltinTemplatesCache();
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

// v1.18.0 MINOR T6 (PB-3) — graceful shutdown drain.
// Intercept the first `app.quit()` call, await in-flight IPC
// handlers via `drainInFlightHandlers`, then re-quit. The
// `isShuttingDown` flag is module-scoped so re-entrant `before-quit`
// events (which Electron emits if other paths trigger quit during
// drain) don't loop. The `before-quit` event fires AFTER
// `window-all-closed`, so the existing non-macOS quit path still
// drives us here — the drain intercepts the actual exit.
let isShuttingDown = false;
app.on('before-quit', (event) => {
  if (isShuttingDown) return;
  event.preventDefault();
  isShuttingDown = true;
  drainInFlightHandlers().finally(() => {
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
