// Sprint 17 P1 — `bswmd:delete` IPC handler.
//
// Delete a single BSWMD file from disk. Used by the
// `removeBswmdFromDisk` store action when the user picks the
// 4th-option "delete BSWMD from disk" in the (Sprint 17 P2)
// RemoveModuleConfirmDialog. The cascade flow (removing
// value-side ARXMLs that depend on a BSWMD) is a separate IPC
// (`project:deleteArxml`).
//
// Return shape mirrors `projectDeleteArxmlHandler.ts` for parity
// (ok / not-found / write-failed / invalid-path). ENOENT collapses to
// `kind: 'not-found'` so the cascade flow stays idempotent
// against a user-deleted BSWMD file.
//
// v1.15.5 — path-containment enforced via `isPathInside` against the
// currently-open project's manifest directory. Closes the
// renderer-forged-path vector when the IPC bridge is bypassed.

import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { isPathInside } from '../../shared/paths/isPathInside.js';
import type { ProjectDeleteBswmdRequest, ProjectDeleteBswmdResult } from '../../shared/types.js';

import { getOpenProjectManifestPath } from './project-manifest-state.js';

export async function bswmdDeleteHandler(
  req: ProjectDeleteBswmdRequest,
): Promise<ProjectDeleteBswmdResult> {
  // v1.15.5 — refuse if no project is open OR the path escapes the project.
  const manifestPath = getOpenProjectManifestPath();
  if (manifestPath === null) {
    return { kind: 'invalid-path', message: 'No project is open' };
  }
  const manifestDir = dirname(resolve(manifestPath));
  if (!isPathInside(resolve(req.filePath), manifestDir)) {
    return {
      kind: 'invalid-path',
      message: `BSWMD path escapes project directory: ${req.filePath}`,
    };
  }

  try {
    await fs.unlink(req.filePath);
    return { kind: 'ok' };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { kind: 'not-found' };
    return {
      kind: 'write-failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
