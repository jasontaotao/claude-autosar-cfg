// v1.33.0 MINOR T2 -- bswmd:pick IPC handler.
//
// v1.52.0 MINOR T1: the picker+read+messagebox body was extracted
// to `src/main/io/pickFile.ts:pickFileWithCap`. The handler now
// delegates the entire shape to the helper, collapsing the
// `read-failed` branch to `canceled` per the original v1.33.0 T2
// design (the picker collapses read errors to canceled so the
// renderer's "no change" branch is uniform).

import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/ipc-contract.js';
import type { BswmdPickResult } from '../../shared/types.js';
import { pickFileWithCap } from '../io/pickFile.js';

export async function bswmdPickDialog(): Promise<BswmdPickResult> {
  const result = await pickFileWithCap({
    title: 'Override BSWMD',
    failureTitle: 'Failed to read BSWMD',
    filters: [
      { name: 'BSWMD', extensions: ['arxml'] },
      { name: 'All', extensions: ['*'] },
    ],
  });
  // BSWMD picker collapses read-failed -> canceled (v1.33.0 T2 design).
  if (result.kind === 'read-failed') {
    return { kind: 'canceled' };
  }
  return result;
}

/**
 * Register the `bswmd:pick` IPC handler.
 */
export function registerBswmdPickHandler(): void {
  ipcMain.handle(IPC_CHANNELS.BSWMD_PICK, async (): Promise<BswmdPickResult> => {
    return bswmdPickDialog();
  });
}
