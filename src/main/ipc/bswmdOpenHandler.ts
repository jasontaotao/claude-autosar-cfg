// v1.53.0 PATCH T1 -- `bswmd:open` IPC handler.
//
// Path-only picker: returns the chosen file path WITHOUT reading the
// file. The renderer pairs this with a follow-up `bswmd:read` call
// which applies the 32 MiB cap + BSWMD shape validation.
//
// Extracted from the inline `ipcMain.handle(...)` at
// `src/main/ipc/register.ts:429-443` (pre-v1.53.0) so it can be unit
// tested directly. Mirrors the `openDbcHandler.ts` /
// `openOdxHandler.ts` extraction pattern (both follow the same shape
// but DO read the file inline; BSWMD_OPEN deliberately separates pick
// from read so the renderer can apply its own validation/cap pipeline
// without paying for the read on cancel).
//
// Filter is `.arxml` first, then `.xml`, then `*` -- matches the
// pre-v1.53.0 inline handler's exact filter list (kept stable for
// parity with the renderer-side renderer's "BSWMD file picker" UI).

import { dialog, ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/ipc-contract.js';
import type { OpenBswmdResult } from '../../shared/types.js';

export async function openBswmdDialog(): Promise<OpenBswmdResult> {
  const result = await dialog.showOpenDialog({
    title: 'Load BSWMD',
    properties: ['openFile'],
    filters: [
      { name: 'BSWMD', extensions: ['arxml'] },
      { name: 'XML', extensions: ['xml'] },
      { name: 'All', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { kind: 'canceled' };
  }
  return { kind: 'ok', path: result.filePaths[0]! };
}

/**
 * Register the `bswmd:open` IPC handler. Called from
 * `register.ts` alongside the other handler registrations.
 */
export function registerBswmdOpenHandler(): void {
  ipcMain.handle(IPC_CHANNELS.BSWMD_OPEN, async (): Promise<OpenBswmdResult> => {
    return openBswmdDialog();
  });
}
