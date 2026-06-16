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
//   - 8 MiB cap on file size (same as `bswmd:parse`). Without a cap a
//     renderer (or tampered preload bridge) could OOM the main process.
//   - Reject empty / whitespace-only paths up-front. node:fs handles
//     these but with confusing errors; an explicit reject is cheaper
//     and gives the renderer a clean message.
//   - Use `e instanceof Error ? e.message : String(e)` for read
//     failures so we don't leak full stack traces to the renderer.

import { promises as fs } from 'node:fs';

import type { ReadBswmdRequest, ReadBswmdResponse } from '../../shared/types.js';

/**
 * Hard cap on the BSWMD file size the handler will read. Mirrors
 * `BSWMD_PARSE_MAX_BYTES` in `register.ts` — kept as a separate
 * constant so `parseBswmd` and `readBswmd` could diverge later if one
 * needs a tighter limit. Today they share the 8 MiB ceiling.
 */
const BSWMD_MAX_BYTES = 8 * 1024 * 1024;

export async function readBswmdHandler(req: ReadBswmdRequest): Promise<ReadBswmdResponse> {
  // Reject empty / whitespace-only paths up-front. node:fs would reject
  // these too but with platform-dependent errors (EISDIR on POSIX,
  // "path must be a string" on Windows); we want a clean message.
  if (typeof req.path !== 'string' || req.path.trim().length === 0) {
    return { kind: 'read-failed', message: 'BSWMD path is empty' };
  }

  // Stat first so we can short-circuit on the size cap without reading
  // the entire file into memory. Saves IO when the user accidentally
  // picks a multi-GB binary blob.
  let size: number;
  try {
    const st = await fs.stat(req.path);
    size = st.size;
  } catch (e) {
    return {
      kind: 'read-failed',
      message: `Failed to read BSWMD at ${req.path}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (size > BSWMD_MAX_BYTES) {
    return {
      kind: 'read-failed',
      message: `BSWMD file exceeds ${BSWMD_MAX_BYTES}-byte cap (${size} bytes)`,
    };
  }

  try {
    const content = await fs.readFile(req.path, 'utf8');
    return { kind: 'ok', content };
  } catch (e) {
    return {
      kind: 'read-failed',
      message: `Failed to read BSWMD at ${req.path}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}