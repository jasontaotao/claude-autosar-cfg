// v1.21.0 Bug #5 -- `dbc:open` IPC handler.
//
// Thin wrapper around `dialog.showOpenDialog` filtered to `.dbc`
// files. Reads the chosen file's content into memory and returns it
// alongside the path.
//
// v1.52.0 MINOR T1: the picker+read+messagebox body was extracted
// to `src/main/io/pickFile.ts:pickFileWithCap`. The handler now
// delegates the entire shape to the helper, keeping only the
// handler-specific titles and filter surface. Per Round-10 audit
// F-3 closure (Round-9 F-3 + Round-10 F-3 share root cause: source
// structured for production not test isolation).

import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/ipc-contract.js';
import type { OpenDbcResult } from '../../shared/types.js';
import { pickFileWithCap } from '../io/pickFile.js';

export async function openDbcDialog(): Promise<OpenDbcResult> {
  return pickFileWithCap({
    title: 'Open DBC',
    failureTitle: 'Failed to read DBC',
    filters: [
      { name: 'DBC', extensions: ['dbc'] },
      { name: 'All', extensions: ['*'] },
    ],
  });
}

/**
 * Register the `dbc:open` IPC handler.
 */
export function registerOpenDbcHandler(): void {
  ipcMain.handle(IPC_CHANNELS.DBC_OPEN, async (): Promise<OpenDbcResult> => {
    return openDbcDialog();
  });
}
