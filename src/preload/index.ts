import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS } from '../shared/ipc-contract.js';
import type {
  OpenArxmlMultiResult,
  OpenArxmlResult,
  ParseArxmlRequest,
  ParseArxmlResponse,
  ParseBswmdRequest,
  ParseBswmdResponse,
  ProjectNewRequest,
  ProjectNewResult,
  ProjectOpenResult,
  ProjectSaveRequest,
  ProjectSaveResult,
  SaveArxmlRequest,
  SaveArxmlResponse,
} from '../shared/types.js';

const api = {
  ping: (): Promise<{ ok: boolean; ts: number }> => ipcRenderer.invoke(IPC_CHANNELS.PING),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.GET_APP_VERSION),
  openArxml: (opts?: { readonly title?: string }): Promise<OpenArxmlResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_ARXML, opts),
  openArxmlMulti: (opts?: { readonly title?: string }): Promise<OpenArxmlMultiResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_ARXML_MULTI, opts),
  parseArxml: (req: ParseArxmlRequest): Promise<ParseArxmlResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.PARSE_ARXML, req),
  saveArxml: (req: SaveArxmlRequest): Promise<SaveArxmlResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_ARXML, req),
  // Sprint 11 Phase 1 — project manifest IO
  projectNew: (req: ProjectNewRequest): Promise<ProjectNewResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_NEW, req),
  projectOpen: (): Promise<ProjectOpenResult> => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_OPEN),
  projectSave: (req: ProjectSaveRequest): Promise<ProjectSaveResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SAVE, req),
  // Sprint 12 #1 — BSWMD schema-side parser
  parseBswmd: (req: ParseBswmdRequest): Promise<ParseBswmdResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.BSWMD_PARSE, req),
};

contextBridge.exposeInMainWorld('autosarApi', api);

export type AutosarApi = typeof api;
