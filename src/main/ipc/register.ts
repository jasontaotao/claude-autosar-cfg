import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { dialog, ipcMain } from 'electron';

import { parseArxml } from '../../core/arxml/parser.js';
import { serializeArxml } from '../../core/arxml/serializer.js';
import { parseBswmd } from '../../core/project/bswmd.js';
import { createEmptyManifest, loadManifest, saveManifest } from '../../core/project/manifest.js';
import type { ManifestError } from '../../core/project/manifest.js';
import { IPC_CHANNELS } from '../../shared/ipc-contract.js';
import type {
  FileError,
  OpenArxmlMultiResult,
  OpenArxmlResult,
  OpenBswmdResult,
  ParseArxmlRequest,
  ParseArxmlResponse,
  ParseBswmdRequest,
  ParseBswmdResponse,
  ProjectNewRequest,
  ProjectNewResult,
  ProjectOpenResult,
  ProjectSaveRequest,
  ProjectSaveResult,
  ReadBswmdRequest,
  ReadBswmdResponse,
  SaveArxmlRequest,
  SaveArxmlResponse,
} from '../../shared/types.js';

import { readBswmdHandler } from './bswmdReadHandler.js';

/**
 * Hard cap on BSWMD payloads. Shared between `bswmd:parse` (string in
 * memory, Sprint 12 #1) and `bswmd:read` (file on disk, Sprint 12 #2).
 * Without a cap a renderer (or a tampered preload bridge) could OOM
 * the main process by passing / pointing at a multi-GB payload. 8 MiB
 * is ~100× the largest real fixture (`Adc_bswmd.arxml` is 82 KiB) and
 * still tight enough to be a useful ceiling for any sane BSWMD file.
 */
const BSWMD_MAX_BYTES = 8 * 1024 * 1024;

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

  ipcMain.handle(
    IPC_CHANNELS.PARSE_ARXML,
    async (_evt, req: ParseArxmlRequest): Promise<ParseArxmlResponse> => {
      return parseArxml(req.content);
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
      const defaultName = req.defaultName ?? 'untitled.arxml';
      const result = await dialog.showSaveDialog({
        title: 'Save ARXML',
        defaultPath: defaultName,
        filters: [{ name: 'ARXML', extensions: ['arxml'] }],
      });
      if (result.canceled || result.filePath === undefined) {
        return { ok: true, value: { canceled: true } };
      }
      const path = result.filePath;
      const serialized = serializeArxml(req.doc);
      if (!serialized.ok) {
        const err: FileError = {
          kind: 'write-failed',
          message: serialized.error.message,
        };
        return { ok: false, error: err };
      }
      try {
        await fs.writeFile(path, serialized.value, 'utf8');
        return { ok: true, value: { canceled: false, path } };
      } catch (e) {
        const err: FileError = {
          kind: 'write-failed',
          message: e instanceof Error ? e.message : String(e),
        };
        return { ok: false, error: err };
      }
    },
  );

  // ============================================================
  // Sprint 11 Phase 1 — Project manifest IO
  // ============================================================

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_NEW,
    async (_evt, req: ProjectNewRequest): Promise<ProjectNewResult> => {
      // Default filename: `<safe-name>.autosarcfg.json`. Strip path-unsafe
      // chars so a project named "My/Project: Demo" still saves cleanly.
      const safe = req.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 64) || 'untitled';
      const defaultName = `${safe}.autosarcfg.json`;

      const result = await dialog.showSaveDialog({
        title: 'New Project',
        defaultPath: defaultName,
        filters: [
          { name: 'AutosarCfg Project', extensions: ['json'] },
          { name: 'All', extensions: ['*'] },
        ],
      });
      if (result.canceled || result.filePath === undefined) {
        return { kind: 'canceled' };
      }
      const manifestPath = result.filePath;
      const manifest = createEmptyManifest(req.name);
      try {
        await fs.writeFile(manifestPath, saveManifest(manifest), 'utf8');
        return { kind: 'created', path: manifestPath, manifest };
      } catch (e) {
        return {
          kind: 'write-failed',
          message: e instanceof Error ? e.message : String(e),
        };
      }
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
    const loaded = loadManifest(manifestJson);
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
  // multi-GB string. 8 MiB is ~100× the largest real fixture
  // (`Adc_bswmd.arxml` is 82 KiB) and still tight enough to be a useful
  // ceiling for any sane BSWMD file. (Reviewer HIGH: equivalent cap on
  // `parseArxml` is tracked for Sprint 13.)
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
  // Reads the file from disk, applies the same 8 MiB cap as parse, and
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
  // renderer calls the reader next, which applies the 8 MiB cap and
  // shape validation). Kept as a separate channel so a future change to
  // dialog filters doesn't have to touch the read path.
  ipcMain.handle(
    IPC_CHANNELS.BSWMD_OPEN,
    async (): Promise<OpenBswmdResult> => {
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
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_SAVE,
    async (_evt, req: ProjectSaveRequest): Promise<ProjectSaveResult> => {
      const manifestDir = path.dirname(req.manifestPath);
      // Phase 1: files are written verbatim to their declared paths. We
      // don't constrain them to manifestDir because the renderer may have
      // intentionally captured an "Open ARXML" file that's elsewhere on
      // disk (the loose-mode back-compat contract). Path containment is
      // enforced on PROJECT_OPEN, not PROJECT_SAVE.
      for (const f of req.files) {
        try {
          await fs.writeFile(f.path, f.content, 'utf8');
        } catch (e) {
          return {
            kind: 'write-failed',
            message: `Failed to write ${f.path}: ${e instanceof Error ? e.message : String(e)}`,
          };
        }
      }
      try {
        await fs.writeFile(req.manifestPath, saveManifest(req.manifest), 'utf8');
        return { kind: 'saved', path: req.manifestPath };
      } catch (e) {
        return {
          kind: 'write-failed',
          message: `Failed to write manifest: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
      // Reference `manifestDir` so the noUnusedLocals linter doesn't flag it
      // — future phases may use it for output staging or relative-path
      // re-writing. (Reachable only if Phase 2 adds extra logic above.)
      void manifestDir;
    },
  );
}

// ---------------------------------------------------------------------------
// Helpers (file-local)
// ---------------------------------------------------------------------------

/**
 * Path-containment check. `child` must resolve to a path strictly inside
 * `parent` (not equal to `parent` itself, not above it on any platform).
 *
 * Implemented with `path.relative` so Windows drive boundaries and mixed
 * separators are handled correctly. Used by PROJECT_OPEN to refuse a
 * hostile manifest listing paths like `../../etc/passwd`.
 */
function isPathInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  // On different drives (Windows), path.relative returns an absolute path.
  // An empty rel means child === parent (we want strictly inside).
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

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
