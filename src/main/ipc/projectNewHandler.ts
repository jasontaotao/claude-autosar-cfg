// Sprint 12 #3 — `project:new` IPC handler (Task 4: directory-driven
// overwrite-confirm protocol).
//
// Sprint 11 shipped `PROJECT_NEW` as a dialog-driven flow: the main
// process popped an OS `showSaveDialog` and wrote the manifest to the
// picked path. Sprint 12 #3 removes that dialog — the renderer
// (`NewProjectDialog`) now collects both the project name AND the
// target directory, and the main handler joins them into
// `<sanitized_name>.autosarcfg.json` and writes directly.
//
// Response shape (`ProjectNewResult`):
//   - `{ kind: 'created', path, manifest }` — file written successfully.
//   - `{ kind: 'overwrite-confirm', path }` — the target file already
//     exists. We do NOT overwrite; the renderer surfaces this so the
//     user can pick a different name/directory (or in a future phase,
//     re-invoke with an explicit overwrite flag).
//   - `{ kind: 'write-failed', message }` — write failed (directory
//     missing, permission denied, EISDIR for a non-directory path, etc.).
//   - `{ kind: 'invalid-name', message }` — defensive guard for names
//     containing path separators. Pre-validated by the renderer; this
//     is a safety net for a tampered preload bridge.
//
// Extraction rationale: the previous handler lived inline in
// `register.ts`. Extracting it to its own module keeps `register.ts`
// thin (one handler per IPC channel, easy to scan), mirrors the
// `bswmdReadHandler` pattern from Sprint 12 #2, and makes the new
// handler directly testable without needing to mock `ipcMain`.

import { promises as fs } from 'node:fs';
import type { Stats } from 'node:fs';
import * as path from 'node:path';

import { createEmptyManifest, saveManifest } from '../../core/project/manifest.js';
import type { ProjectNewRequest, ProjectNewResult } from '../../shared/types.js';
import { writeAtomic } from '../io/writeAtomic.js';

import { setOpenProjectManifestPath } from './project-manifest-state.js';

/**
 * Handle a `PROJECT_NEW` request. See file header for the full contract.
 *
 * Implementation notes:
 *   - We reject empty / path-separator names up-front (defensive guard).
 *   - We sanitize the name by replacing non-`[A-Za-z0-9._-]` chars with `_`
 *     (same rule as before — covers Windows-reserved characters
 *     `<>:"/\\|?*` plus spaces and Unicode), falling back to `untitled`
 *     if the result is empty.
 *   - We `fs.stat` the parent directory before any file access so we
 *     can return `write-failed` for "directory does not exist" or
 *     "directory is actually a file" without hitting a confusing
 *     EISDIR / ENOENT from `writeFile`.
 *   - We `fs.access` the target file path to detect overwrite-confirm
 *     (cheap, no IO beyond the directory entry lookup). Only on
 *     `create` button click — race-free per user decision (Phase 0 #3).
 */
export async function projectNewHandler(req: ProjectNewRequest): Promise<ProjectNewResult> {
  // --- 1. Defensive input validation ---------------------------------
  if (typeof req.directory !== 'string' || req.directory.trim().length === 0) {
    return {
      kind: 'write-failed',
      message: 'Project directory is empty — pick a directory first',
    };
  }
  if (typeof req.name !== 'string' || req.name.trim().length === 0) {
    return {
      kind: 'invalid-name',
      message: 'Project name is empty',
    };
  }
  // Refuse names that contain path separators outright. The renderer
  // pre-validates via `validateProjectName`, but a tampered preload
  // could still smuggle one in. Sanitizing would replace `/` with `_`,
  // but that hides the bug from the user — a rejected call is more
  // honest.
  if (req.name.includes('/') || req.name.includes('\\')) {
    return {
      kind: 'invalid-name',
      message: 'Project name cannot contain path separators (/ or \\)',
    };
  }

  // --- 2. Sanitize the name into a safe filename ----------------------
  // Same rule as before: replace anything outside [A-Za-z0-9._-] with
  // `_` (the `+` quantifier collapses runs into one `_`). Cap the
  // sanitized result at 64 chars so the on-disk filename stays sane
  // (Windows caps full paths at 260). The manifest name preserves the
  // raw user input regardless of the filename length.
  const sanitized = req.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 64);
  // Defensive fallback: every char stripped away → filename is `untitled`.
  // The `+` quantifier means a name like `@#$` collapses to `_` (length 1),
  // so this branch only triggers for genuinely degenerate inputs (e.g. an
  // all-`.` name that happens to sanitize to empty).
  const safeName = sanitized.length > 0 ? sanitized : 'untitled';
  const fileName = `${safeName}.autosarcfg.json`;
  const filePath = path.join(req.directory, fileName);

  // --- 3. Verify the parent directory exists and is actually a dir --
  let dirStat: Stats;
  try {
    dirStat = await fs.stat(req.directory);
  } catch (e) {
    return {
      kind: 'write-failed',
      message: `Directory not found: ${req.directory} (${e instanceof Error ? e.message : String(e)})`,
    };
  }
  if (!dirStat.isDirectory()) {
    return {
      kind: 'write-failed',
      message: `Project path is not a directory: ${req.directory}`,
    };
  }

  // --- 4. Overwrite check (race-free, click-time) --------------------
  // `fs.access` throws ENOENT if the file doesn't exist; any other
  // outcome (no throw, or a different error) we treat as "file exists".
  // Sprint 13 #2 Stage 3.2 Task 2: when the renderer passes
  // `overwrite: true` (only set after the user has confirmed the
  // overwrite in the ConfirmDialog), we skip the existence check and
  // fall straight through to `writeFile` below.
  if (req.overwrite !== true) {
    try {
      await fs.access(filePath);
      return { kind: 'overwrite-confirm', path: filePath };
    } catch {
      // Expected: ENOENT -> file does not exist -> fall through to create.
      // Other errors (EACCES, etc.) will resurface on `writeFile` below
      // with their real message; we don't shadow them here.
    }
  }

  // --- 5. Create + write the manifest --------------------------------
  // Sprint 13+ Stage 3.4 — `createEmptyManifest` produces a manifest
  // with `bswmdPaths: []`. When the renderer passes `bswmdPaths`
  // (the user pre-selected via BswmdChipRow), we override the
  // empty array with the caller's selection. The IPC contract
  // treats the value as opaque — main does not validate that the
  // files exist; that's a Stage 3.5+ concern (copy BSWMDs into
  // the project dir, then load them on project:open).
  const manifest = {
    ...createEmptyManifest(req.name),
    bswmdPaths: req.bswmdPaths !== undefined ? [...req.bswmdPaths] : [],
  };
  try {
    await writeAtomic(filePath, saveManifest(manifest));
    // v1.15.5 — register the new project as "open" so subsequent
    // bswmdDeleteHandler / writeArxmlBatch calls can enforce containment.
    setOpenProjectManifestPath(filePath);
    return { kind: 'created', path: filePath, manifest };
  } catch (e) {
    return {
      kind: 'write-failed',
      message: `Failed to write ${filePath}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
