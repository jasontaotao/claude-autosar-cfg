import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS } from '../shared/ipc-contract.js';
import type {
  OpenArxmlMultiResult,
  OpenArxmlResult,
  OpenBswmdResult,
  ParseArxmlRequest,
  ParseArxmlResponse,
  ParseBswmdRequest,
  ParseBswmdResponse,
  PickDirRequest,
  PickDirResult,
  ProjectDeleteArxmlRequest,
  ProjectDeleteArxmlResult,
  ProjectNewRequest,
  ProjectNewResult,
  ProjectOpenResult,
  ProjectSaveRequest,
  ProjectSaveResult,
  ProjectWriteArxmlBatchRequest,
  ProjectWriteArxmlBatchResult,
  ReadBswmdRequest,
  ReadBswmdResponse,
  SaveArxmlRequest,
  SaveArxmlResponse,
  ScriptDeleteRequest,
  ScriptDeleteResponse,
  ScriptListRequest,
  ScriptListResponse,
  ScriptProgressEvent,
  ScriptRunRequest,
  ScriptRunResponse,
  ScriptSaveRequest,
  ScriptSaveResponse,
  TemplateCopyRequest,
  TemplateCopyResponse,
  TemplateListResponse,
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
  // Sprint 12 #2 — BSWMD file reader (renderer-driven "Load BSWMD")
  readBswmd: (req: ReadBswmdRequest): Promise<ReadBswmdResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.BSWMD_READ, req),
  // Sprint 12 #2 — BSWMD open-file dialog. Pairs with `readBswmd`:
  // renderer asks main to show the picker, gets back the picked path,
  // then asks main to read its content (with the 32 MiB cap).
  openBswmdDialog: (): Promise<OpenBswmdResult> => ipcRenderer.invoke(IPC_CHANNELS.BSWMD_OPEN),
  // Sprint 12 #3 — directory picker for the New Project flow. Pairs
  // with `projectNew`: the renderer asks main to show a folder picker,
  // gets back the chosen absolute path (or `canceled`), and supplies
  // that as `ProjectNewRequest.directory` when creating the project.
  pickDir: (req: PickDirRequest): Promise<PickDirResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PICK_DIR, req),
  // Sprint 13 #1 — built-in template list. Renderer does not call
  // this in Sprint 13 #1; it is exposed so the IPC contract is
  // complete and the bridge is ready for Sprint 13 #2's picker.
  listTemplates: (): Promise<TemplateListResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATES_LIST, {}),
  // Sprint 13 #1 — copy a template into a project dir. Not called
  // by the renderer in Sprint 13 #1.
  copyTemplate: (req: TemplateCopyRequest): Promise<TemplateCopyResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATES_COPY, req),
  // Sprint 14 — BSWMD-to-ECUC skeleton creation. Renderer computes
  // destination paths + serialized content for one or more ECUC
  // value-side documents and hands them to main, which writes them
  // with `mkdir -p`. See `projectWriteArxmlBatchHandler.ts` for the
  // ok / partial / write-failed response shape; the partial case
  // carries `written` + `failed` lists so the renderer's store
  // action can decide whether to surface individual failures.
  writeArxmlBatch: (req: ProjectWriteArxmlBatchRequest): Promise<ProjectWriteArxmlBatchResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_WRITE_ARXML_BATCH, req),
  // Sprint 14 — delete a single ARXML file. Used by the cascade-delete
  // flow (T12 — removeBswmdWithCascade) when removing a BSWMD also
  // requires removing the value-side ARXML(s) generated from it.
  // ENOENT collapses to `kind: 'not-found'` rather than
  // `write-failed` so the cascade flow is idempotent against a
  // user-deleted value-side file.
  deleteArxml: (req: ProjectDeleteArxmlRequest): Promise<ProjectDeleteArxmlResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DELETE_ARXML, req),
  // Sprint 14 #1 — script engine IPC bridge. Four invoke wrappers
  // (`listScripts` / `saveScript` / `deleteScript` / `runScript`) and
  // one push subscription (`onScriptProgress`) that returns an
  // unsubscribe fn (matches the existing `deleteArxml` style). The
  // push channel is wired in main via `webContents.send`; the
  // preload only subscribes.
  listScripts: (req: ScriptListRequest): Promise<ScriptListResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.SCRIPT_LIST, req),
  saveScript: (req: ScriptSaveRequest): Promise<ScriptSaveResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.SCRIPT_SAVE, req),
  deleteScript: (req: ScriptDeleteRequest): Promise<ScriptDeleteResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.SCRIPT_DELETE, req),
  runScript: (req: ScriptRunRequest): Promise<ScriptRunResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.SCRIPT_RUN, req),
  onScriptProgress: (cb: (e: ScriptProgressEvent) => void): (() => void) => {
    const handler = (_evt: unknown, e: ScriptProgressEvent): void => cb(e);
    ipcRenderer.on(IPC_CHANNELS.SCRIPT_PROGRESS, handler);
    return () => ipcRenderer.off(IPC_CHANNELS.SCRIPT_PROGRESS, handler);
  },
};

contextBridge.exposeInMainWorld('autosarApi', api);

export type AutosarApi = typeof api;
