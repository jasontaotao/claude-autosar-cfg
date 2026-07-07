// v1.33.0 MINOR T2 — bswmd:pick IPC handler.
// Thin wrapper around dialog.showOpenDialog filtered to .arxml files.
// Reads the chosen file's content into memory and returns it alongside
// the path. Mirrors openDbcHandler / openOdxHandler line-for-line
// (DBC + ODX + BSWMD are all read-only file importers, so the dialog
// mechanics are identical). v1.33.0 added to enable the v1.32.1 PATCH
// Override UI Browse button.
//
// Design notes:
//   - Single-file picker (properties: ['openFile']); multi-BSWMD
//     import is not a use case.
//   - Returns a discriminated union (canceled / opened / read-failed-via-messagebox)
//     so the renderer can distinguish a user cancel from a real read
//     failure (per lesson: errors handled explicitly, never silently
//     swallowed).
//   - The read-failure dialog is shown via dialog.showMessageBox BEFORE
//     returning 'canceled' so the user sees both the OS dialog and the
//     renderer's error banner.

import { promises as fs } from 'node:fs';
import { dialog, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-contract.js';
import type { BswmdPickResult } from '../../shared/types.js';

export async function bswmdPickDialog(): Promise<BswmdPickResult> {
  const result = await dialog.showOpenDialog({
    title: 'Override BSWMD',
    properties: ['openFile'],
    filters: [
      { name: 'BSWMD', extensions: ['arxml'] },
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
      title: 'Failed to read BSWMD',
      message: err instanceof Error ? err.message : String(err),
    });
    return { kind: 'canceled' };
  }
}

export function registerBswmdPickHandler(): void {
  ipcMain.handle(IPC_CHANNELS.BSWMD_PICK, async (): Promise<BswmdPickResult> => {
    return bswmdPickDialog();
  });
}
