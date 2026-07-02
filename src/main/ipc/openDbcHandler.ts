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

import { promises as fs } from 'node:fs';

import { dialog, ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/ipc-contract.js';
import type { OpenDbcResult } from '../../shared/types.js';

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
  try {
    const content = await fs.readFile(path, 'utf8');
    return { kind: 'opened', path, content };
  } catch (err) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Failed to read DBC',
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      kind: 'read-failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }
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
