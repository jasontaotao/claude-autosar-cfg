import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { dialog, ipcMain } from 'electron';

import { parseBswmd } from '../../core/project/bswmd.js';
import { loadManifest } from '../../core/project/manifest.js';
import type { ManifestError } from '../../core/project/manifest.js';
import { IPC_CHANNELS } from '../../shared/ipc-contract.js';
import { isPathInside } from '../../shared/paths/isPathInside.js';
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
  ProjectDeleteBswmdRequest,
  ProjectDeleteBswmdResult,
  ProjectNewRequest,
  ProjectNewResult,
  ProjectOpenResult,
  ProjectSaveRequest,
  ProjectSaveResult,
  ProjectCloseResult,
  ProjectWriteArxmlBatchRequest,
  ProjectWriteArxmlBatchResult,
  ReadBswmdRequest,
  ReadBswmdResponse,
  SaveArxmlRequest,
  SaveArxmlResponse,
  ScriptDeleteRequest,
  ScriptListRequest,
  ScriptRunRequest,
  ScriptSaveRequest,
} from '../../shared/types.js';
import { trackHandler } from '../shutdown/drain.js';

import { bswmdDeleteHandler } from './bswmdDeleteHandler.js';
import { readBswmdHandler } from './bswmdReadHandler.js';
import { featureFlagsGetHandler } from './featureFlagsHandler.js';
import { swsValidateCancelStub, swsValidateStub } from './headless-stubs.js';
import { headlessRunCommandHandler } from './headlessRunCommandHandler.js';
import { parseArxmlHandler } from './parseArxmlHandler.js';
import { pickDirHandler } from './pickDirHandler.js';
import { setOpenProjectManifestPath } from './project-manifest-state.js';
import { projectCloseHandler } from './projectCloseHandler.js';
import { projectDeleteArxmlHandler } from './projectDeleteArxmlHandler.js';
import { projectNewHandler } from './projectNewHandler.js';
import { projectSaveHandler } from './projectSaveHandler.js';
import { projectWriteArxmlBatchHandler } from './projectWriteArxmlBatchHandler.js';
import { saveArxmlHandler } from './saveArxmlHandler.js';
import {
  scriptDeleteHandler,
  scriptListHandler,
  scriptRunHandler,
  scriptSaveHandler,
} from './script-handler.js';
import { registerStencilHandler } from './stencilHandler.js';
import { handleStencilSave } from './stencilSaveHandler.js';
import { templatesCopyHandler, templatesListHandler } from './templatesHandler.js';

/**
 * Hard cap on BSWMD payloads. Shared between `bswmd:parse` (string in
 * memory, Sprint 12 #1) and `bswmd:read` (file on disk, Sprint 12 #2).
 * Without a cap a renderer (or a tampered preload bridge) could OOM
 * the main process by passing / pointing at a multi-GB payload.
 *
 * Sized at 32 MiB to cover the AUTOSAR standard master ECUC parameter
 * definition file (`AUTOSAR_MOD_ECUConfigurationParameters.arxml`,
 * ~12 MiB at R4.2.2) with ~2.6× headroom for future AUTOSAR releases.
 * Vendor BSWMDs (EB tresos Adc/Can fixtures) remain well under 100 KiB
 * so this ceiling is invisible to the common case but does not block
 * the legitimate "load the AUTOSAR master BSWMD" path.
 */
const BSWMD_MAX_BYTES = 32 * 1024 * 1024;

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PING, async () => {
    return { ok: true, ts: Date.now() };
  });

  ipcMain.handle(IPC_CHANNELS.GET_APP_VERSION, async () => {
    return '0.11.0';
  });

  ipcMain.handle(
    IPC_CHANNELS.OPEN_ARXML,
    async (_evt, opts?: { readonly title?: string }): Promise<OpenArxmlResult> => {
      const result = await dialog.showOpenDialog({
        title: opts?.title ?? 'Open ARXML',
        properties: ['openFile'],
        filters: [
          { name: 'ARXML', extensions: ['arxml'] },
          { name: 'XML', extensions: ['xml'] },
          { name: 'All', extensions: ['*'] },
        ],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
      }
      const path = result.filePaths[0]!;
      try {
        const content = await fs.readFile(path, 'utf8');
        return { canceled: false, path, content };
      } catch (err) {
        // Surface error via dialog but keep Result shape
        await dialog.showMessageBox({
          type: 'error',
          title: 'Failed to read ARXML',
          message: err instanceof Error ? err.message : String(err),
        });
        return { canceled: true };
      }
    },
  );

  // Sprint 13 Stage 5.D — `arxml:parse` size cap. Mirrors the
  // BSWMD cap pattern (`bswmd:parse` / `bswmd:read` at 32 MiB).
  // The handler is extracted to `parseArxmlHandler.ts` for parity
  // with the `bswmdReadHandler` pattern (direct testability without
  // the full IPC round-trip) and to keep this file focused on
  // registration. Cap rationale: see `ARXML_MAX_BYTES` in
  // `parseArxmlHandler.ts`.
  ipcMain.handle(
    IPC_CHANNELS.PARSE_ARXML,
    async (_evt, req: ParseArxmlRequest): Promise<ParseArxmlResponse> => {
      return parseArxmlHandler(req);
    },
  );

  // Sprint 10 #2 — multi-file open. Returns a discriminated union so the
  // renderer can distinguish "user canceled" from "all opened" from
  // "some opened, some failed" from "OS-level read error". Replaces the
  // silent-failure pattern where a read-failure was collapsed into a
  // canceled result (silent-failure-hunter finding #4).
  ipcMain.handle(
    IPC_CHANNELS.OPEN_ARXML_MULTI,
    async (_evt, opts?: { readonly title?: string }): Promise<OpenArxmlMultiResult> => {
      const result = await dialog.showOpenDialog({
        title: opts?.title ?? 'Open ARXML',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'ARXML', extensions: ['arxml'] },
          { name: 'XML', extensions: ['xml'] },
          { name: 'All', extensions: ['*'] },
        ],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { kind: 'canceled' };
      }
      const opened: { path: string; content: string }[] = [];
      const failed: { path: string; message: string }[] = [];
      for (const path of result.filePaths) {
        try {
          const content = await fs.readFile(path, 'utf8');
          opened.push({ path, content });
        } catch (err) {
          failed.push({
            path,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (failed.length === 0) {
        return { kind: 'opened', results: opened };
      }
      if (opened.length === 0) {
        return {
          kind: 'read-failed',
          message: failed.map((f) => `${f.path}: ${f.message}`).join('\n'),
        };
      }
      return { kind: 'partial', opened, failed };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SAVE_ARXML,
    async (_evt, req: SaveArxmlRequest): Promise<SaveArxmlResponse> => {
      return saveArxmlHandler(req);
    },
  );

  // ============================================================
  // Sprint 11 Phase 1 — Project manifest IO
  // ============================================================
  //
  // Sprint 12 #3 Task 4 rewrote PROJECT_NEW to be directory-driven:
  // the renderer (NewProjectDialog) supplies both name AND directory,
  // and main joins them into `<sanitized_name>.autosarcfg.json` and
  // writes directly — no more OS showSaveDialog. The handler is
  // extracted to `projectNewHandler.ts` for parity with the
  // `bswmdReadHandler` pattern and direct testability.
  //
  // New `ProjectNewResult` kinds: `overwrite-confirm` (file already
  // exists, not overwritten), `invalid-name` (defensive reject for
  // names containing path separators). The previous `canceled` kind
  // is gone — there is no dialog for the user to cancel.

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_NEW,
    async (_evt, req: ProjectNewRequest): Promise<ProjectNewResult> => {
      return projectNewHandler(req);
    },
  );

  ipcMain.handle(IPC_CHANNELS.PROJECT_OPEN, async (): Promise<ProjectOpenResult> => {
    const dialogResult = await dialog.showOpenDialog({
      title: 'Open Project',
      properties: ['openFile'],
      filters: [
        { name: 'AutosarCfg Project', extensions: ['json'] },
        { name: 'All', extensions: ['*'] },
      ],
    });
    if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
      return { kind: 'canceled' };
    }
    const manifestPath = dialogResult.filePaths[0]!;
    const manifestDir = path.dirname(manifestPath);

    // Read + parse the manifest JSON
    let manifestJson: string;
    try {
      manifestJson = await fs.readFile(manifestPath, 'utf8');
    } catch (e) {
      return {
        kind: 'read-failed',
        message: `Failed to read manifest: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    const loaded = loadManifest(manifestJson, manifestDir);
    if (!loaded.ok) {
      return {
        kind: 'read-failed',
        message: `Invalid manifest: ${describeManifestError(loaded.error)}`,
      };
    }
    const manifest = loaded.value;

    // Resolve + read each referenced file with path-containment check.
    // A manifest's paths are relative to its directory; we refuse anything
    // that resolves outside `manifestDir` (defence-in-depth against a
    // hostile manifest like `../../etc/passwd`). Each entry also carries
    // the original `rel` so the renderer can pair it back to the manifest
    // even when two entries share a basename (e.g. `subdir1/EcuC.arxml`
    // and `subdir2/EcuC.arxml` both end in `EcuC.arxml`).
    const docs: { rel: string; path: string; content: string }[] = [];
    const bswmds: { rel: string; path: string; content: string }[] = [];
    for (const rel of manifest.valueArxmlPaths) {
      const resolved = path.resolve(manifestDir, rel);
      if (!isPathInside(resolved, manifestDir)) {
        return {
          kind: 'read-failed',
          message: `Manifest valueArxmlPaths entry escapes project directory: ${rel}`,
        };
      }
      try {
        const content = await fs.readFile(resolved, 'utf8');
        docs.push({ rel, path: resolved, content });
      } catch (e) {
        return {
          kind: 'read-failed',
          message: `Failed to read ${resolved}: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }
    for (const rel of manifest.bswmdPaths) {
      const resolved = path.resolve(manifestDir, rel);
      if (!isPathInside(resolved, manifestDir)) {
        return {
          kind: 'read-failed',
          message: `Manifest bswmdPaths entry escapes project directory: ${rel}`,
        };
      }
      try {
        const content = await fs.readFile(resolved, 'utf8');
        bswmds.push({ rel, path: resolved, content });
      } catch (e) {
        return {
          kind: 'read-failed',
          message: `Failed to read ${resolved}: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }

    // v1.15.5 — register the loaded project so subsequent calls to
    // bswmdDeleteHandler / writeArxmlBatch can enforce containment.
    // On success, set the state; on any failure above, we return
    // early and the previous manifest path is untouched.
    setOpenProjectManifestPath(manifestPath);
    return { kind: 'opened', manifestPath, manifest, docs, bswmds };
  });

  // Sprint 12 #1 — BSWMD schema-side parser. Pure-function handler:
  // `project:open` already read the file content, so this just runs
  // `parseBswmd` and re-shapes the Result envelope to the IPC type.
  // Renderer integration (storing into `bswmdSchemas`) is Sprint 13.
  //
  // Size cap: `parseBswmd` runs `XMLValidator.validate` + `XMLParser.parse`
  // on the full string in main-process memory. Without a cap, a renderer
  // (or a tampered preload bridge) could OOM the process by passing a
  // multi-GB string. 32 MiB covers the AUTOSAR master BSWMD (~12 MiB
  // at R4.2.2) with 2.6× headroom; see `BSWMD_MAX_BYTES` above for the
  // rationale. (Reviewer HIGH: equivalent cap on `parseArxml` is
  // tracked for Sprint 13.)
  ipcMain.handle(
    IPC_CHANNELS.BSWMD_PARSE,
    async (_evt, req: ParseBswmdRequest): Promise<ParseBswmdResponse> => {
      if (req.content.length > BSWMD_MAX_BYTES) {
        return {
          ok: false,
          error: {
            kind: 'xml-malformed',
            message: `BSWMD content exceeds ${BSWMD_MAX_BYTES}-byte cap`,
          },
        };
      }
      const result = parseBswmd(req.content);
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      return { ok: true, value: result.value };
    },
  );

  // Sprint 12 #2 — BSWMD file reader. Used by the renderer-driven
  // "Load BSWMD" button (`useProjectActions.addBswmdFromDialog`).
  // Reads the file from disk, applies the same 32 MiB cap as parse, and
  // returns the raw string so the renderer can hand it to `parseBswmd`.
  // (Equivalent cap on `parseArxml` is tracked for Sprint 13.)
  ipcMain.handle(
    IPC_CHANNELS.BSWMD_READ,
    async (_evt, req: ReadBswmdRequest): Promise<ReadBswmdResponse> => {
      return readBswmdHandler(req);
    },
  );

  // Sprint 12 #2 — BSWMD file-open dialog. Lets the renderer pop a
  // native `Open file…` filtered to `.arxml`/`.xml`. Returns either the
  // picked absolute path or `canceled`. Pairs with `BSWMD_READ` (the
  // renderer calls the reader next, which applies the 32 MiB cap and
  // shape validation). Kept as a separate channel so a future change to
  // dialog filters doesn't have to touch the read path.
  ipcMain.handle(IPC_CHANNELS.BSWMD_OPEN, async (): Promise<OpenBswmdResult> => {
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
  });

  // Sprint 12 #3 — directory picker for the New Project flow. Pairs
  // with `PROJECT_NEW` (Task 4), which expects the user-supplied
  // directory in `req.directory`. The handler is extracted to
  // `pickDirHandler.ts` for parity with the `bswmdReadHandler` pattern
  // (direct testability without the full IPC round-trip) and to keep
  // this file focused on registration. `defaultPath` is forwarded
  // verbatim to `dialog.showOpenDialog` so the renderer can pre-fill
  // a sensible starting location (e.g. the most-recent project dir).
  ipcMain.handle(
    IPC_CHANNELS.PICK_DIR,
    async (_evt, req: PickDirRequest): Promise<PickDirResult> => {
      return pickDirHandler(req);
    },
  );

  // Sprint 13 #1 — built-in template IPC.
  ipcMain.handle(IPC_CHANNELS.TEMPLATES_LIST, async (_e, req) => templatesListHandler(req));
  ipcMain.handle(IPC_CHANNELS.TEMPLATES_COPY, async (_e, req) => templatesCopyHandler(req));

  // Sprint 14 — BSWMD-to-ECUC skeleton creation. Both handlers are
  // extracted to their own modules for parity with `bswmdReadHandler`
  // / `templatesHandler` (direct testability without an IPC round-trip).
  // See `projectWriteArxmlBatchHandler.ts` for the response-shape
  // rationale (ok / partial / write-failed discriminated union) and
  // `projectDeleteArxmlHandler.ts` for the ok / not-found / write-failed
  // shape.
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_WRITE_ARXML_BATCH,
    async (_evt, req: ProjectWriteArxmlBatchRequest): Promise<ProjectWriteArxmlBatchResult> => {
      return projectWriteArxmlBatchHandler(req);
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_DELETE_ARXML,
    async (_evt, req: ProjectDeleteArxmlRequest): Promise<ProjectDeleteArxmlResult> => {
      return projectDeleteArxmlHandler(req);
    },
  );

  // Sprint 17 P1 — `bswmd:delete` handler. Unlink a single BSWMD
  // file from disk. Mirrors `PROJECT_DELETE_ARXML` for the same
  // ok / not-found / write-failed contract; see
  // `bswmdDeleteHandler.ts` for the rationale.
  ipcMain.handle(
    IPC_CHANNELS.BSWMD_DELETE,
    async (_evt, req: ProjectDeleteBswmdRequest): Promise<ProjectDeleteBswmdResult> => {
      return bswmdDeleteHandler(req);
    },
  );

  // v1.6.0 U — `feature-flags:get` handler. Returns the current
  // experimental flag set (all OFF by default; enabling a flag
  // requires a future change to read the value from a config file).
  // Renderer-side fallback (per W spec §5.3) defaults to all-OFF
  // when the channel is missing; this handler is the real source.
  // Channel name matches `TOUR_CHANNELS.FEATURE_FLAGS_GET` in
  // `src/shared/ipc/tourReset.ts`.
  ipcMain.handle('feature-flags:get', async () => featureFlagsGetHandler());

  // Sprint 14 #1 — script engine IPC. The 4 invoke handlers are
  // wired to the dedicated `script-handler.ts` module so they can be
  // unit-tested directly without a full ipcMain round-trip. The
  // `SCRIPT_PROGRESS` channel is push-only (main → renderer via
  // webContents.send); it is intentionally NOT registered here
  // (Phase C wires the subscription in the preload bridge).
  ipcMain.handle(IPC_CHANNELS.SCRIPT_LIST, async (_evt, req: ScriptListRequest) =>
    scriptListHandler(req),
  );
  ipcMain.handle(IPC_CHANNELS.SCRIPT_SAVE, async (_evt, req: ScriptSaveRequest) =>
    scriptSaveHandler(req),
  );
  ipcMain.handle(IPC_CHANNELS.SCRIPT_DELETE, async (_evt, req: ScriptDeleteRequest) =>
    scriptDeleteHandler(req),
  );
  // v1.18.0 MINOR T6 (PB-3) — wrap the SCRIPT_RUN invoke so the
  // graceful-shutdown drain in src/main/index.ts `before-quit` can await
  // an in-flight script execution. `scriptRunHandler` is the longest-
  // running IPC handler (default 5s timeout, user-supplied up to 60s),
  // so a user-triggered quit mid-run would otherwise tear down the
  // sandbox while the manifest write is in progress — corrupting
  // project state. Wrapping at the registration site (not inside the
  // handler) preserves `scriptRunHandler`'s pure-function signature
  // for direct unit testing without the drain dependency.
  ipcMain.handle(IPC_CHANNELS.SCRIPT_RUN, async (_evt, req: ScriptRunRequest) =>
    trackHandler(scriptRunHandler(req)),
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_SAVE,
    async (_evt, req: ProjectSaveRequest): Promise<ProjectSaveResult> => {
      // Sprint 17b (H8) — handler extracted to `projectSaveHandler.ts`
      // so the path-traversal pre-flight check is unit-testable
      // without the full IPC round-trip. The body preserves the
      // loose-mode back-compat contract (files may live anywhere
      // on disk; containment is enforced on PROJECT_OPEN, not
      // PROJECT_SAVE).
      return projectSaveHandler(req);
    },
  );

  // v1.18.2 PATCH — PROJECT_CLOSE handler. Symmetric counterpart to
  // PROJECT_OPEN (line 214). Handler extracted to `projectCloseHandler.ts`
  // for direct testability (mirrors `bswmdDeleteHandler` pattern).
  // Returns `{ kind: 'closed' }` whether or not a project was open
  // (idempotent — mirrors Unix `close(2)` semantics).
  ipcMain.handle(IPC_CHANNELS.PROJECT_CLOSE, async (): Promise<ProjectCloseResult> => {
    return projectCloseHandler();
  });

  // v1.8.0 K — Stencil Wizard IPC. Generates a minimal valid ECUC
  // module skeleton (.arxml) for one of 4 families. Gate logic (SWS
  // Validator opt-in) is added in Task 8; CLI parity in v1.9.0+.
  registerStencilHandler();

  // v1.8.0 K — Task 12 polish. The save dialog + disk write live in
  // a separate channel from `STENCIL_GENERATE_V1` so the generate
  // path stays pure (no IO) and the save path can be re-used by
  // future features. Returns the same Result envelope as
  // `saveArxmlHandler` so the renderer's per-kind error dispatch
  // works uniformly.
  ipcMain.handle(
    IPC_CHANNELS.STENCIL_SAVE_V1,
    async (_evt, req: { readonly xml: string; readonly suggestedFilename: string }) =>
      handleStencilSave(req),
  );

  // v1.15.5 — stub handlers for 5 channels declared in IPC_CHANNELS
  // but previously unregistered (per joint review 2026-06-29). Renderer
  // does not consume any of these (useSwsValidatorRunner calls the
  // local store directly; CLI path does not go through main IPC).
  // HEADLESS_MUTATE_APPLIED and HEADLESS_VALIDATE_RESULT are push
  // channels (main→renderer via webContents.send) — they are NOT
  // registered here because there is no renderer listener and
  // registering would produce "Renderer did not register listener"
  // console noise. When the GUI bridge ships (planned v1.7.0),
  // replace the stubs with real handlers.
  ipcMain.handle(IPC_CHANNELS.SWS_VALIDATE, swsValidateStub);
  ipcMain.handle(IPC_CHANNELS.SWS_VALIDATE_CANCEL, swsValidateCancelStub);
  ipcMain.handle(IPC_CHANNELS.HEADLESS_RUN_COMMAND, headlessRunCommandHandler);
}

// ---------------------------------------------------------------------------
// Helpers (file-local)
// ---------------------------------------------------------------------------

/**
 * Render a `ManifestError` as a single human-readable line. Used in
 * `read-failed` IPC responses so the renderer can surface the cause
 * without having to re-implement the kind switch.
 */
function describeManifestError(err: ManifestError): string {
  switch (err.kind) {
    case 'json-parse':
      return `JSON parse error: ${err.message}`;
    case 'invalid-shape':
      return `shape error: ${err.message}`;
    case 'version-mismatch':
      return `schemaVersion mismatch (expected "${err.expected}", got "${err.found}")`;
    case 'invalid-path':
      return `${err.field} contains invalid path "${err.path}" (${err.reason})`;
    case 'invalid-field':
      return `${err.field}: ${err.message}`;
  }
}
