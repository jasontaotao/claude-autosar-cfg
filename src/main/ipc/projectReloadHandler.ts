// v1.23.0 PATCH (HIGH-1) — `project:reload` IPC handler.
//
// Non-dialog counterpart to the dialog-driven `PROJECT_OPEN` handler
// in `src/main/ipc/register.ts`. Takes an already-known absolute
// manifest path and re-reads the manifest + every referenced
// value-side ARXML + BSWMD. Used by the T4 `DBC→Com-Stack` apply
// handler so the user sees fresh ECUC values immediately after the
// bridge writes 3 files — without popping the OS file picker that
// `PROJECT_OPEN` requires.
//
// Behaviour matches the read-side of `PROJECT_OPEN` line-for-line:
//   - JSON parse + `loadManifest` validation
//   - Path-containment check (`isPathInsideReal`) on every entry
//   - utf8 read of each referenced file
//
// Extracted to its own module (mirrors `projectCloseHandler.ts` /
// `bswmdDeleteHandler.ts` pattern) so the pure-function handler is
// directly unit-testable without a full `ipcMain` round-trip.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import type { ManifestError } from '../../core/project/manifest.js';
import { loadManifest } from '../../core/project/manifest.js';
import { isPathInsideReal } from '../../shared/paths/isPathInsideReal.js';
import type { ProjectManifest } from '../../shared/project.js';
import type { ProjectReloadRequest, ProjectReloadResponse } from '../../shared/types.js';

import { setOpenProjectManifestPath } from './project-manifest-state.js';

/**
 * Render a `ManifestError` as a single human-readable line. Duplicates
 * the helper in `register.ts` deliberately: the handler is extracted
 * for direct testability, and re-declaring the local helper keeps the
 * module self-contained.
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

/**
 * Pure async handler — no `electron` dependency. Reads the manifest
 * at `req.manifestPath`, resolves + reads every referenced ARXML +
 * BSWMD with a path-containment check, and returns the bundle.
 *
 * On success, also registers the manifest path so subsequent
 * `bswmdDeleteHandler` / `projectWriteArxmlBatch` calls enforce
 * containment against it (mirrors `PROJECT_OPEN` behaviour at line
 * 340 of `register.ts`).
 */
export async function projectReloadHandler(
  req: ProjectReloadRequest,
): Promise<ProjectReloadResponse> {
  const { manifestPath } = req;
  const manifestDir = path.dirname(manifestPath);

  // Read + parse the manifest JSON.
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
  const manifest: ProjectManifest = loaded.value;

  // Resolve + read each referenced file with path-containment check.
  // Path containment is a defence-in-depth against a hostile manifest
  // like `../../etc/passwd`. Each entry is returned with its absolute
  // on-disk path so the renderer can pair it back to a manifest entry
  // (basenames are not unique across sub-directories).
  const files: { path: string; content: string }[] = [];
  for (const rel of manifest.valueArxmlPaths) {
    const resolved = path.resolve(manifestDir, rel);
    if (!(await isPathInsideReal(resolved, manifestDir))) {
      return {
        kind: 'read-failed',
        message: `Manifest valueArxmlPaths entry escapes project directory: ${rel}`,
      };
    }
    try {
      const content = await fs.readFile(resolved, 'utf8');
      files.push({ path: resolved, content });
    } catch (e) {
      return {
        kind: 'read-failed',
        message: `Failed to read ${resolved}: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }
  for (const rel of manifest.bswmdPaths) {
    const resolved = path.resolve(manifestDir, rel);
    if (!(await isPathInsideReal(resolved, manifestDir))) {
      return {
        kind: 'read-failed',
        message: `Manifest bswmdPaths entry escapes project directory: ${rel}`,
      };
    }
    try {
      const content = await fs.readFile(resolved, 'utf8');
      files.push({ path: resolved, content });
    } catch (e) {
      return {
        kind: 'read-failed',
        message: `Failed to read ${resolved}: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  // Register the loaded manifest path so subsequent
  // `bswmdDeleteHandler` / `projectWriteArxmlBatch` calls enforce
  // containment against it. Mirrors `PROJECT_OPEN` at line 340 of
  // `register.ts`.
  setOpenProjectManifestPath(manifestPath);
  return { kind: 'ok', manifest, files };
}
