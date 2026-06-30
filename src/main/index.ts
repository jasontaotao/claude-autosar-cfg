import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow, shell } from 'electron';

import { registerIpcHandlers } from './ipc/register.js';
import { logFatal } from './log.js';
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
      sandbox: false,
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
