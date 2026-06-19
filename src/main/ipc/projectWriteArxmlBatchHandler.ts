// Sprint 14 — `project:writeArxmlBatch` IPC handler.
//
// Batch-write a list of ARXML files into the project directory. The
// renderer (T7 store action + T8 hook) computes the destination paths
// and serializes the ECUC skeleton content (one or more
// `<ECUC-MODULE-CONFIGURATION-VALUES>` documents, one per picked
// BSWMD module); main writes them with `mkdir -p` so intermediate
// directories are created on demand.
//
// Return shape (discriminated union):
//   - `{ kind: 'ok', written: <string[]> }` — all files written
//   - `{ kind: 'partial', written, failed }` — some written, some failed
//   - `{ kind: 'write-failed', message }` — none written (caller gave up)
//
// We deliberately keep the handler sync-per-file (await each write in
// sequence) rather than `Promise.all`-parallel: writing multiple files
// to the same project directory is rare (typically 1-3 modules picked
// from a BSWMD) and the determinism of "first file is always written
// before second" matches the renderer's ordering intent. A parallel
// implementation would still serialize on the same destination
// directory's write lock on Windows.
//
// Path-containment: NOT enforced here. The handler trusts the
// renderer's destination paths. The renderer is expected to compute
// paths under the user's project directory (the `ProjectNew` /
// `ProjectOpen` flow guarantees a known root). If a hostile renderer
// tried to write to `/etc/passwd`, the OS-level write would either
// succeed (Linux, no EACCES) or fail with EACCES (Windows / restricted
// dir) — either way the response shape carries enough info to surface
// the failure. Adding path-containment here would mirror the
// `PROJECT_OPEN` defense-in-depth but is tracked as a follow-up since
// the renderer is the only caller and the IPC bridge is locked down
// by `contextBridge` in production.
//
// Failure handling: each file's write is wrapped in try/catch so a
// single failure does not abort the batch. The handler returns the
// `partial` shape so the caller can surface the failed files
// individually rather than dropping them on the floor.

import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

import type {
  ProjectWriteArxmlBatchRequest,
  ProjectWriteArxmlBatchResult,
} from '../../shared/types.js';

export async function projectWriteArxmlBatchHandler(
  req: ProjectWriteArxmlBatchRequest,
): Promise<ProjectWriteArxmlBatchResult> {
  const written: string[] = [];
  const failed: { filePath: string; message: string }[] = [];

  for (const f of req.files) {
    try {
      // mkdir -p so callers don't have to ensure intermediate
      // directories exist (project:pickDir hands the renderer a brand
      // new dir; the renderer then wants to write
      // `<projectDir>/EcuC/EcuC.ecuc.arxml` without first creating
      // `<projectDir>/EcuC/`).
      await fs.mkdir(dirname(f.filePath), { recursive: true });
      await fs.writeFile(f.filePath, f.content, 'utf-8');
      written.push(f.filePath);
    } catch (err) {
      failed.push({
        filePath: f.filePath,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (failed.length === 0) return { kind: 'ok', written };
  if (written.length === 0) {
    // Nothing was written at all — collapse to a single failure so
    // the renderer's UI can show one error message rather than a
    // list. The first failed entry's message is the most useful
    // (the others are usually the same root cause — e.g. all EACCES).
    const first = failed[0];
    if (!first) {
      // Defensive: this branch is unreachable when failed.length > 0
      // but the strict `noUncheckedIndexedAccess` linter doesn't
      // know that. Return a generic message instead of crashing.
      return { kind: 'write-failed', message: 'unknown write failure' };
    }
    return { kind: 'write-failed', message: first.message };
  }
  return { kind: 'partial', written, failed };
}
