// v1.22.0 T1 — `odx:open` IPC handler.
//
// Thin wrapper around `dialog.showOpenDialog` filtered to `.odx` /
// `.pdx` files. Reads the chosen file's content into memory and
// returns it alongside the path. Mirrors `openDbcHandler.ts` line
// for line (DBC + ODX are both read-only diagnostic-format
// importers, so the dialog mechanics are identical).
//
// Design notes (mirrors `OPEN_ARXML` + `DBC_OPEN`):
//   - Single-file picker (`properties: ['openFile']`); multi-ODX
//     import is not a T1 use case.
//   - Returns a discriminated union (`canceled` / `opened` /
//     `read-failed`) so the renderer can distinguish a user cancel
//     from a real read failure (per CLAUDE.md "errors handled
//     explicitly, never silently swallowed").
//   - The read-failure dialog is shown via `dialog.showMessageBox`
//     BEFORE returning `read-failed` so the user sees both the OS
//     dialog and the renderer's error banner — same dual-surface
//     pattern as the DBC handler.

import { promises as fs } from 'node:fs';

import { dialog, ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/ipc-contract.js';
import type { OpenOdxResult } from '../../shared/types.js';

export async function openOdxDialog(): Promise<OpenOdxResult> {
  const result = await dialog.showOpenDialog({
    title: 'Open ODX',
    properties: ['openFile'],
    filters: [
      // `.odx` is the ODX-D XML. `.pdx` is the ODX-D "package" (a
      // zip of multiple .odx files) — parseOdxHandler only handles
      // a single .odx for T1, so we filter to .odx only. A future
      // "extract + parse .pdx" T can extend the filter without
      // changing the dialog contract.
      { name: 'ODX', extensions: ['odx'] },
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
      title: 'Failed to read ODX',
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      kind: 'read-failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Register the `odx:open` IPC handler. Called from
 * `register.ts` alongside the other handler registrations.
 *
 * Extracted as a separate function (vs inlined like `OPEN_ARXML`)
 * for symmetry with the `parseOdxHandler` / `parseDbcHandler`
 * pairing — keeps the parse path testable in isolation.
 */
export function registerOpenOdxHandler(): void {
  ipcMain.handle(IPC_CHANNELS.ODX_OPEN, async (): Promise<OpenOdxResult> => {
    return openOdxDialog();
  });
}
