// Sprint 12 #2 — `bswmd:read` IPC handler.
//
// Reads a BSWMD file from disk and returns its content as a string.
// Unlike `bswmd:parse` (Sprint 12 #1) — which runs against content
// already in memory after `project:open` — this handler is the entry
// point used by the renderer's "Load BSWMD" button (Task 5 / `useProjectActions.addBswmdFromDialog`).
//
// Shape: `{ kind: 'ok', content } | { kind: 'read-failed', message }`.
// We deliberately use a separate `kind` discriminator (rather than the
// `Result<T, E>` envelope used elsewhere) because there is no value to
// carry on the failure side other than the message — the renderer
// only needs to know "did it read? if not, what went wrong?"
//
// Caps + safety:
//   - 32 MiB cap on file size (same as `bswmd:parse`). Without a cap a
//     renderer (or tampered preload bridge) could OOM the main process.
//     v1.40.0 MINOR T1 — delegates to the shared `readFileWithCap`
//     helper so the cap is enforced uniformly across all picker + read
//     paths (H1 + H2 closure).
//   - Reject empty / whitespace-only paths up-front. node:fs handles
//     these but with confusing errors; an explicit reject is cheaper
//     and gives the renderer a clean message.
//   - Use `e instanceof Error ? e.message : String(e)` for read
//     failures so we don't leak full stack traces to the renderer.

import type { ReadBswmdRequest, ReadBswmdResponse } from '../../shared/types.js';

import { readFileWithCap } from './sizeCap.js';

export async function readBswmdHandler(req: ReadBswmdRequest): Promise<ReadBswmdResponse> {
  // Reject empty / whitespace-only paths up-front. node:fs would reject
  // these too but with platform-dependent errors (EISDIR on POSIX,
  // "path must be a string" on Windows); we want a clean message.
  if (typeof req.path !== 'string' || req.path.trim().length === 0) {
    return { kind: 'read-failed', message: 'BSWMD path is empty' };
  }

  // v1.40.0 MINOR T1 — delegate to the shared `readFileWithCap`
  // helper (see `sizeCap.ts` for the 32 MiB cap rationale). The helper
  // returns a discriminated union; both `too-large` and `read-failed`
  // fold into the IPC-level `read-failed` envelope to preserve the
  // existing renderer contract (renderer's `app.error.readBswmdFailed`
  // regex-matches `message` and does not differentiate the cause).
  //
  // For `too-large`, we re-shape the helper message into the
  // human-readable MiB-units form the existing branch emitted (lesson
  // error-message-must-be-actionable — "33.0 MiB, max 32.0 MiB"
  // beats raw byte counts).
  const result = await readFileWithCap(req.path);
  if (result.ok) {
    return { kind: 'ok', content: result.content };
  }
  if (result.kind === 'too-large') {
    // Read the actual size via stat (best-effort; if stat fails the
    // message just won't include MiB units — the raw byte counts are
    // still accurate).
    try {
      const { statSync } = await import('node:fs');
      const size = statSync(req.path).size;
      const capMiB = (32 * 1024 * 1024) / (1024 * 1024);
      const sizeMiB = (size / (1024 * 1024)).toFixed(1);
      return {
        kind: 'read-failed',
        message: `file too large (${sizeMiB} MiB, max ${capMiB.toFixed(1)} MiB). Check that the file is complete and not corrupted.`,
      };
    } catch {
      // Fall through to the raw helper message — better than nothing.
      return { kind: 'read-failed', message: result.message };
    }
  }
  // read-failed: keep the helper's message (already includes the
  // underlying error text from `stat` / `readFile`).
  return { kind: 'read-failed', message: result.message };
}
