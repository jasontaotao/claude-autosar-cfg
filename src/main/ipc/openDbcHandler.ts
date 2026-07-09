// v1.21.0 Bug #5 — `dbc:open` IPC handler.
//
// Thin wrapper around `dialog.showOpenDialog` filtered to `.dbc`
// files. Reads the chosen file's content into memory and returns it
// alongside the path. Mirrors the `OPEN_ARXML` handler at
// `register.ts:92-121`.
//
// Design notes (mirrors `OPEN_ARXML`):
//   - Single-file picker (`properties: ['openFile']`); multi-DBC
//     import is not a Bug #5 use case.
//   - Returns a discriminated union (`canceled` / `opened` /
//     `read-failed`) so the renderer can distinguish a user cancel
//     from a real read failure (per CLAUDE.md "errors handled
//     explicitly, never silently swallowed").
//   - The read-failure dialog is shown via `dialog.showMessageBox`
//     BEFORE returning `read-failed` so the user sees both the OS
//     dialog and the renderer's error banner — same dual-surface
//     pattern as `OPEN_ARXML`.
//
// v1.40.0 MINOR T1 (H1) — read uses the shared `readFileWithCap`
// helper (32 MiB cap). Both `too-large` and `read-failed` fold into
// the IPC-level `read-failed` envelope to preserve the renderer
// contract (the renderer's `dbc:open` consumer does not differentiate
// the cause — the `dialog.showMessageBox` text + the `message` field
// are the user-facing surface).

import { dialog, ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/ipc-contract.js';
import type { OpenDbcResult } from '../../shared/types.js';

import { readFileWithCap } from './sizeCap.js';

export async function openDbcDialog(): Promise<OpenDbcResult> {
  const result = await dialog.showOpenDialog({
    title: 'Open DBC',
    properties: ['openFile'],
    filters: [
      { name: 'DBC', extensions: ['dbc'] },
      { name: 'All', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { kind: 'canceled' };
  }
  const path = result.filePaths[0]!;
  const read = await readFileWithCap(path);
  if (read.ok) {
    return { kind: 'opened', path, content: read.content };
  }
  await dialog.showMessageBox({
    type: 'error',
    title: 'Failed to read DBC',
    message: read.message,
  });
  return {
    kind: 'read-failed',
    message: read.message,
  };
}

/**
 * Register the `dbc:open` IPC handler. Called from
 * `register.ts` alongside the other handler registrations.
 *
 * Extracted as a separate function (vs inlined like `OPEN_ARXML`)
 * for symmetry with the `parseDbcHandler` / `parseArxmlHandler`
 * pairing — keeps the parse path testable in isolation.
 */
export function registerOpenDbcHandler(): void {
  ipcMain.handle(IPC_CHANNELS.DBC_OPEN, async (): Promise<OpenDbcResult> => {
    return openDbcDialog();
  });
}
