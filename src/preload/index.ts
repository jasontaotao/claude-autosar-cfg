import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS } from '../shared/ipc-contract.js';
import type {
  OpenArxmlResult,
  ParseArxmlRequest,
  ParseArxmlResponse,
  SaveArxmlRequest,
  SaveArxmlResponse,
} from '../shared/types.js';

const api = {
  ping: (): Promise<{ ok: boolean; ts: number }> => ipcRenderer.invoke(IPC_CHANNELS.PING),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.GET_APP_VERSION),
  openArxml: (opts?: { readonly title?: string }): Promise<OpenArxmlResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_ARXML, opts),
  parseArxml: (req: ParseArxmlRequest): Promise<ParseArxmlResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.PARSE_ARXML, req),
  saveArxml: (req: SaveArxmlRequest): Promise<SaveArxmlResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_ARXML, req),
};

contextBridge.exposeInMainWorld('autosarApi', api);

export type AutosarApi = typeof api;
