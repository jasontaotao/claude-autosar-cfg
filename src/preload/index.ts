import { contextBridge, ipcRenderer } from 'electron';

import type { XlsHistoryLoadResponse } from '../main/ipc/xlsxHistoryLoadHandler.js';
import type {
  StencilRequest,
  StencilResponse,
  StencilSaveRequest,
  StencilSaveResponse,
} from '../main/stencil/types.js';
import type {
  HeadlessRunCommandRequest,
  HeadlessRunCommandResult,
} from '../shared/headless/ipc-contract.js';
import { IPC_CHANNELS } from '../shared/ipc-contract.js';
import type {
  EcucInstanceRow,
  OpenArxmlMultiResult,
  OpenArxmlResult,
  OpenBswmdResult,
  OpenDbcResult,
  OpenOdxResult,
  OpenOdxWithDefaultRequest,
  OpenOdxWithDefaultResult,
  BswmdPickResult,
  DbcImportComStackRequest,
  DbcImportComStackResponse,
  OdxImportDiagExtractRequest,
  OdxImportDiagExtractResponse,
  ParseArxmlRequest,
  ParseArxmlResponse,
  ParseBswmdRequest,
  ParseBswmdResponse,
  ParseDbcRequest,
  ParseDbcResponse,
  ParseOdxRequest,
  ParseOdxResponse,
  PickDirRequest,
  PickDirResult,
  ProjectCloseResult,
  ProjectDeleteArxmlRequest,
  ProjectDeleteArxmlResult,
  ProjectDeleteBswmdRequest,
  ProjectDeleteBswmdResult,
  ProjectNewRequest,
  ProjectNewResult,
  ProjectOpenResult,
  ProjectReloadRequest,
  ProjectReloadResponse,
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
  XlsxParseBatchRequest,
  XlsxParseBatchResponse,
  XlsxWriteBatchTemplateRequest,
  XlsxWriteBatchTemplateResponse,
  XlsxCommitBatchRequest,
  XlsxCommitBatchResponse,
  DcmConfigRequest,
  DcmConfigResponse,
} from '../shared/types.js';

import { getRendererPlatform } from './platform.js';

const api = {
  ping: (): Promise<{ ok: boolean; ts: number }> => ipcRenderer.invoke(IPC_CHANNELS.PING),
  // v1.6.0 Cluster U — expose `process.platform` to the renderer.
  // The renderer normalizes Mod → Cmd/Ctrl based on this value
  // (per U spec §6.4 + A+C §17 Q8). Pure passthrough, no IPC.
  getPlatform: (): NodeJS.Platform => getRendererPlatform(),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.GET_APP_VERSION),
  openArxml: (opts?: { readonly title?: string }): Promise<OpenArxmlResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_ARXML, opts),
  openArxmlMulti: (opts?: { readonly title?: string }): Promise<OpenArxmlMultiResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_ARXML_MULTI, opts),
  parseArxml: (req: ParseArxmlRequest): Promise<ParseArxmlResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.PARSE_ARXML, req),
  // v1.21.0 Bug #5 — DBC open + parse. Closes the "DBC 解析器装上未
  // 接入" gap from v1.7.0. The renderer wires these into the
  // "File Operations → Open DBC…" menu entry and the <DbcViewer />
  // modal.
  openDbc: (): Promise<OpenDbcResult> => ipcRenderer.invoke(IPC_CHANNELS.DBC_OPEN),
  parseDbc: (req: ParseDbcRequest): Promise<ParseDbcResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.DBC_PARSE, req),
  // v1.22.0 T1 — ODX open + parse. Closes the v1.21.0 carry-over
  // "ODX 完全没做" gap. The renderer wires these into the
  // "File Operations → Open ODX…" menu entry and the <OdxViewer />
  // modal (T2 + T3).
  openOdx: (): Promise<OpenOdxResult> => ipcRenderer.invoke(IPC_CHANNELS.ODX_OPEN),
  // v1.33.0 MINOR T3 — `odx:open-with-default` IPC bridge. Variant
  // of the v1.22.0 `openOdx` that accepts a `defaultPath` hint so
  // the OS dialog opens at the project root instead of `user-home`.
  // Additive channel (lesson additive-ipc-channels-over-extending-args)
  // — `openOdx` IPC contract preserved verbatim.
  openOdxWithDefault: (req: OpenOdxWithDefaultRequest): Promise<OpenOdxWithDefaultResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ODX_OPEN_WITH_DEFAULT, req),
  parseOdx: (req: ParseOdxRequest): Promise<ParseOdxResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.ODX_PARSE, req),
  saveArxml: (req: SaveArxmlRequest): Promise<SaveArxmlResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_ARXML, req),
  // Sprint 11 Phase 1 — project manifest IO
  projectNew: (req: ProjectNewRequest): Promise<ProjectNewResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_NEW, req),
  projectOpen: (): Promise<ProjectOpenResult> => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_OPEN),
  // v1.19.0 MINOR — wire the v1.18.2 PROJECT_CLOSE IPC into the renderer
  // bridge so the `useProjectActions.closeProject` hook can invoke it.
  // Idempotent: returns `{ kind: 'closed' }` whether or not a project
  // is open (mirrors Unix `close(2)` semantics per v1.18.2 plan).
  projectClose: (): Promise<ProjectCloseResult> => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_CLOSE),
  // v1.23.0 PATCH (HIGH-1) — `project:reload`. Non-dialog counterpart
  // to `projectOpen`: takes an already-known manifest path and
  // re-reads the manifest + every referenced ARXML/BSWMD. Used by the
  // T4 DBC→Com-Stack apply handler so the user sees fresh ECUC values
  // immediately after the bridge writes 3 files — without popping the
  // OS file picker that `projectOpen` requires. The IPC envelope is
  // intentionally narrow (manifestPath only); the response carries the
  // full bundle so the renderer's `useArxmlStore.openProject` can
  // consume it verbatim.
  projectReload: (req: ProjectReloadRequest): Promise<ProjectReloadResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_RELOAD, req),
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
  // v1.33.0 MINOR T2 — bswmd:pick IPC. Renderer asks main to show
  // a .arxml picker AND read the chosen file's content in one
  // round-trip. Activates the v1.32.1 PATCH Override UI Browse
  // button. Distinct from `openBswmdDialog` (Sprint 12 #2): the older
  // channel returns just the path so the renderer pairs it with a
  // `readBswmd` call, while this one returns the path + content
  // together for the simpler Override use case. New additive channel
  // (lesson additive-ipc-channels-over-extending-args).
  bswmdPick: (): Promise<BswmdPickResult> => ipcRenderer.invoke(IPC_CHANNELS.BSWMD_PICK),
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
  // Sprint 17 P1 — delete a BSWMD file from disk. Used by the
  // 4th option "delete BSWMD from disk" in RemoveModuleConfirmDialog
  // (P2). Mirrors `deleteArxml` for the same idempotent
  // ok / not-found / write-failed shape; see
  // `bswmdDeleteHandler.ts` for the rationale.
  deleteBswmd: (req: ProjectDeleteBswmdRequest): Promise<ProjectDeleteBswmdResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.BSWMD_DELETE, req),
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
  // v1.8.0 K — Stencil Wizard (Task 7). Renderer invokes
  // `window.autosarApi.stencilGenerate(req)` to ask main to build a
  // minimal valid ECUC module skeleton (.arxml) for one of 4 families
  // (com / comm / pdur / ecuc). Main returns a discriminated
  // `StencilResponse` so the modal can render the suggested filename
  // (ok path) or the localized error (gate / build-failed path). Gated
  // by the `experimental.stencilWizard` feature flag on the main
  // side; the renderer mirrors the gate by hiding the menu entry +
  // Cmd-K palette command when the flag is OFF (per Task 7 plan).
  stencilGenerate: (req: StencilRequest): Promise<StencilResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.STENCIL_GENERATE_V1, req),
  // v1.8.0 K Task 12 polish — pairs with `stencilGenerate`. The
  // wizard calls this after a successful generate to ask main to
  // show the native save dialog and persist the XML. Same Result
  // envelope as `saveArxml` so the renderer dispatches per-kind
  // errors (permission / disk-full / path-not-found) uniformly.
  stencilSave: (req: StencilSaveRequest): Promise<StencilSaveResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.STENCIL_SAVE_V1, req),
  // v1.6.0 U — feature flags. Renderer reads flags via
  // `autosarApi.getFeatureFlags()` (see
  // `src/renderer/config/featureFlags.ts`). The main-process handler
  // is registered in `src/main/ipc/register.ts` and returns
  // all-OFF by default; enabling a flag is a future change.
  getFeatureFlags: (): Promise<{
    experimental: {
      onboarding: boolean;
      streaming: boolean;
      indexedDb: boolean;
      headlessCli: boolean;
      swsValidator: boolean;
      keyboardFirst: boolean;
    };
  }> => ipcRenderer.invoke('feature-flags:get'),
  // v1.21.0 MINOR T1 — GUI entry for the BSW code generator.
  // Wraps the existing HEADLESS_RUN_COMMAND channel (used by the CLI
  // dispatcher for `read` / `mutate` / `validate` / `generate`) so
  // the renderer's Generate button can ask main to run the same
  // pipeline the CLI runs. The result envelope is returned verbatim
  // via the invoke response — `generate` is a synchronous-of-effect
  // command so no push emitter is needed (mutate / validate are the
  // only commands that emit push events; see the `result.command`
  // switch in `headlessRunCommandHandler.ts`).
  runHeadlessCommand: (req: HeadlessRunCommandRequest): Promise<HeadlessRunCommandResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.HEADLESS_RUN_COMMAND, req),
  // v1.23.0 T3 — DBC→Com-Stack bridge IPC. Renderer wires this into the
  // T4 wizard (the next MINOR). The handler orchestrates the full
  // pipeline: parse DBC (T1) → call the pure mapper (T2) → parse 3
  // ECUC files → apply patches → write all 3 atomically. Returns ok
  // with `addedCounts: { com, canIf, pduR }` or a discriminated error.
  // The IPC envelope is intentionally narrow — a future "re-bridge
  // without re-parsing" affordance can introduce a separate channel
  // rather than overloading this one.
  dbcImportComStack: (req: DbcImportComStackRequest): Promise<DbcImportComStackResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.DBC_IMPORT_COM_STACK, req),
  // v1.24.0 T2 — ODX→Diagnostic Extract bridge. Takes a path-based
  // request `{ odxPath, outputDir }`; the handler re-parses the
  // .odx-d file via v1.22.0's `odx:parse` channel (path-based to keep
  // the IPC payload small) and writes 2 ARXML files atomically
  // (Dem_Extract.arxml + Dcm_Extract.arxml) into outputDir. Returns
  // ok with `{ demPath, dcmPath, stats }` or a discriminated error
  // (`read-failed` for missing/unparseable input, `write-failed`
  // for atomic-write failure with `rolledBack: boolean` per the
  // v1.23.1 T1 contract).
  importDiagnosticExtract: (
    req: OdxImportDiagExtractRequest,
  ): Promise<OdxImportDiagExtractResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.ODX_IMPORT_DIAGNOSTIC_EXTRACT, req),
  // v1.25.0 T5 — Excel→Com-Stack ECUC batch 3-IPC surface. The
  // renderer wires these into the XlsxBatchWizard modal. Mirrors the
  // v1.23.0 T3 / v1.24.0 T2 DBC/ODX bridge pattern: each handler is
  // an isolated pure module on the main side and a 1-line invoke
  // wrapper here. `Uint8Array` payloads survive the IPC boundary
  // intact (verified by the T4 ship-blocking test).
  xlsxWriteBatchTemplate: (
    req: XlsxWriteBatchTemplateRequest,
  ): Promise<XlsxWriteBatchTemplateResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.XLSX_WRITE_BATCH_TEMPLATE, req),
  xlsxParseBatch: (req: XlsxParseBatchRequest): Promise<XlsxParseBatchResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.XLSX_PARSE_BATCH, req),
  xlsxCommitBatch: (req: XlsxCommitBatchRequest): Promise<XlsxCommitBatchResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.XLSX_COMMIT_BATCH, req),
  // v1.30.0 MINOR — Dcm config bridge. Wires the v1.27.0 T4
  // dcmConfigHandler (existing-but-unregistered since v1.27.0)
  // into the renderer-side bridge. First `dcm:*` channel. The
  // renderer consumer is the minimal `DcmConfigTrigger` button
  // (full UI lands in 1.31.0 PATCH).
  dcmConfig: (req: DcmConfigRequest): Promise<DcmConfigResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.DCM_CONFIG, req),
  // v1.33.0 MINOR T1 — xlsx-import complete push channel.
  // Main pushes after xlsxEcucBatchImportHandler succeeds; renderer
  // listens via xlsxImportListener.ts to update the store slice.
  onXlsxImportComplete: (
    handler: (payload: {
      readonly rows: readonly EcucInstanceRow[];
      readonly source: 'manual' | 'wizard';
      // v1.36.1 PATCH M1 — listen inherits main's timestamp
      readonly importedAt: number;
      // v1.40.0 MINOR T3 (L1) — bridge surfaces persistence outcome.
      readonly persisted: boolean;
    }) => void,
  ) => {
    const listener = (
      _event: unknown,
      payload: {
        rows: readonly EcucInstanceRow[];
        source: 'manual' | 'wizard';
        importedAt: number;
        persisted: boolean;
      },
    ) => {
      handler(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.XLSX_IMPORT_COMPLETE, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.XLSX_IMPORT_COMPLETE, listener);
  },
  // v1.36.0 MINOR T2 — xlsxImportHistory load bridge.
  // Renderer bootstrap calls this on App mount to hydrate the
  // session-scope xlsxImportHistory from disk. The save side is
  // main-internal (T3 wires it into xlsxEcucBatchImportHandler) and
  // is NOT exposed via this bridge.
  xlsxHistoryLoad: (): Promise<XlsHistoryLoadResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.XLSX_HISTORY_LOAD),
};

contextBridge.exposeInMainWorld('autosarApi', api);

export type AutosarApi = typeof api;
