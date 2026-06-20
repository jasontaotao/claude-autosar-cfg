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
// (ok / not-found / write-failed). ENOENT collapses to
// `kind: 'not-found'` so the cascade flow stays idempotent
// against a user-deleted BSWMD file.
//
// Path-containment: NOT enforced. The renderer is the only caller
// and the IPC bridge is locked down by `contextBridge`. If a future
// caller passes an arbitrary path, the OS unlink will fail with
// EACCES (or succeed, on a permissive POSIX system) and the
// response shape carries the failure info.

import { promises as fs } from 'node:fs';

import type { ProjectDeleteBswmdRequest, ProjectDeleteBswmdResult } from '../../shared/types.js';

export async function bswmdDeleteHandler(
  req: ProjectDeleteBswmdRequest,
): Promise<ProjectDeleteBswmdResult> {
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
