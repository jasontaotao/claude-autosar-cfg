// v1.8.0 K Stencil Wizard — Task 12 save IPC handler.
//
// Pairs with `stencil:generate:v1`: the renderer calls generate first
// to get a serialized XML string, then calls this channel to ask main
// to show the native save dialog and persist the file. Keeping the
// save path in a separate channel (vs. folding it into generate)
// preserves the generate path's purity (no IO) and lets the save
// path be re-used by any future feature that needs "write this string
// to a user-chosen path".
//
// Return shape mirrors `SaveArxmlResponse` from `saveArxmlHandler.ts`
// so the renderer can dispatch per-kind errors (permission / disk-full
// / path-not-found) with one code path. Cancellation is a successful
// no-op (`{ ok: true, value: { canceled: true } }`) — same convention
// as the rest of the IPC surface.

import * as path from 'node:path';

import { dialog } from 'electron';

import { writeAtomic } from '../io/writeAtomic.js';
import type { StencilSaveRequest, StencilSaveResponse } from '../stencil/types.js';

const STENCIL_SAVE_MAX_BYTES = 32 * 1024 * 1024;

export async function handleStencilSave(req: StencilSaveRequest): Promise<StencilSaveResponse> {
  // Defensive: refuse payloads above the cap so a tampered preload
  // can't OOM the main process via a multi-GB string. 32 MiB is
  // generous (the largest family schema tops out around a few KiB
  // even with BSWMD merge) but matches the rest of the IPC surface
  // (BSWMD / ARXML / write-batch all use 32 MiB or smaller).
  if (req.xml.length > STENCIL_SAVE_MAX_BYTES) {
    return {
      ok: false,
      error: {
        kind: 'unknown',
        message: `Stencil payload exceeds ${STENCIL_SAVE_MAX_BYTES}-byte cap`,
      },
    };
  }

  // Defensive: reject a missing filename so the dialog has something
  // to pre-fill. Should be impossible in normal use (the generate
  // response always carries a suggestedFilename), but the IPC bridge
  // accepts any string from the renderer.
  const suggested = req.suggestedFilename.trim();
  if (suggested === '' || !suggested.toLowerCase().endsWith('.arxml')) {
    return {
      ok: false,
      error: {
        kind: 'unknown',
        message: `Invalid suggested filename: ${JSON.stringify(req.suggestedFilename)}`,
      },
    };
  }

  let targetPath: string;
  try {
    const result = await dialog.showSaveDialog({
      title: 'Save Stencil',
      defaultPath: suggested,
      filters: [
        { name: 'ARXML', extensions: ['arxml'] },
        { name: 'All', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePath === undefined) {
      return { ok: true, value: { canceled: true } };
    }
    targetPath = result.filePath;
  } catch (e) {
    return {
      ok: false,
      error: {
        kind: 'unknown',
        message: `Failed to show save dialog: ${e instanceof Error ? e.message : String(e)}`,
      },
    };
  }

  // Defensive path-traversal guard (matches saveArxmlHandler §Sprint 17b H8).
  // The OS dialog always returns a normalized path, but a future
  // refactor that accepts `req.currentPath` (silent save-back) would
  // re-introduce the renderer-controlled path risk — keep the check
  // here so the seam is already safe.
  if (path.normalize(targetPath).includes('..')) {
    return {
      ok: false,
      error: {
        kind: 'path-not-found',
        message: `File path contains parent traversal: ${targetPath}`,
      },
    };
  }

  try {
    // FIO-2 (v1.17.0) — route through writeAtomic so the stencil commit
    // survives a crash mid-write (temp-file + fsync + rename atomicity).
    // v1.15.5 C1 grep missed this site because it targeted only
    // writeFileSync (sync form); this site used the async form.
    await writeAtomic(targetPath, req.xml);
    return { ok: true, value: { canceled: false, path: targetPath } };
  } catch (e) {
    const errno = (e as NodeJS.ErrnoException | undefined)?.code;
    const kind = mapErrnoToKind(errno);
    return {
      ok: false,
      error: {
        kind,
        ...(errno !== undefined ? { code: errno } : {}),
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

function mapErrnoToKind(
  code: string | undefined,
): 'permission-denied' | 'disk-full' | 'path-not-found' | 'unknown' {
  if (code === 'EACCES' || code === 'EPERM') return 'permission-denied';
  if (code === 'ENOSPC' || code === 'EDQUOT') return 'disk-full';
  if (code === 'ENOENT' || code === 'ENOTDIR') return 'path-not-found';
  return 'unknown';
}
