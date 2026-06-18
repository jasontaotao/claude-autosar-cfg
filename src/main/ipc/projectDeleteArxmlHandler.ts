// Sprint 14 — `project:deleteArxml` IPC handler.
//
// Delete a single ARXML file. Used by the cascade-delete flow when
// removing a BSWMD also requires removing the value-side ARXML(s)
// generated from it (T12 — `removeBswmdWithCascade`). Renderer asks
// main to delete; main returns a discriminated union so the caller
// can distinguish "deleted" from "already gone" from "permission
// error / other write failure".
//
// Return shape (discriminated union):
//   - `{ kind: 'ok' }` — file deleted
//   - `{ kind: 'not-found' }` — file did not exist (ENOENT). This is
//     NOT an error for the cascade flow: if the user already deleted
//     the value-side ARXML manually, the cascade should be idempotent
//     and not surface a scary "file missing" message.
//   - `{ kind: 'write-failed', message }` — any other error (EACCES,
//     EISDIR, EBUSY on Windows, etc). Renderer surfaces this with the
//     `app.error.deleteArxmlFailed` i18n key.
//
// We use `fs.unlink` (not `fs.rm`) deliberately: `unlink` refuses to
// delete a non-empty directory, which is the correct behavior for a
// file-delete handler. The `kind: 'not-found'` branch covers ENOENT;
// other codes (EACCES, EISDIR, EBUSY) fall through to `write-failed`.
//
// Path-containment: NOT enforced. The renderer is the only caller
// and the IPC bridge is locked down by `contextBridge`. If a future
// caller passes an arbitrary path, the OS write/unlink will fail
// with EACCES (or succeed, on a permissive POSIX system) and the
// response shape carries the failure info. See the matching note
// in `projectWriteArxmlBatchHandler.ts` for rationale.

import { promises as fs } from 'node:fs';

import type {
  ProjectDeleteArxmlRequest,
  ProjectDeleteArxmlResult,
} from '../../shared/types.js';

export async function projectDeleteArxmlHandler(
  req: ProjectDeleteArxmlRequest,
): Promise<ProjectDeleteArxmlResult> {
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