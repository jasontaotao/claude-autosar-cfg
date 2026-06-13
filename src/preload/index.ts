import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS } from '../shared/ipc-contract.js';

const api = {
  ping: (): Promise<{ ok: boolean; ts: number }> => ipcRenderer.invoke(IPC_CHANNELS.PING),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.GET_APP_VERSION),
};

contextBridge.exposeInMainWorld('autosarApi', api);

export type AutosarApi = typeof api;