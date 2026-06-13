import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/ipc-contract.js';

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PING, async () => {
    return { ok: true, ts: Date.now() };
  });

  ipcMain.handle(IPC_CHANNELS.GET_APP_VERSION, async () => {
    return '0.1.0';
  });
}