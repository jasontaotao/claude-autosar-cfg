// Sprint 16 — `autosar:save-arxml` IPC handler.
//
// Persist an ArxmlDocument to disk. Two modes:
//   1. Silent save-back (preferred): when the renderer passes
//      `currentPath`, write directly to that on-disk path without
//      prompting. Used by Save after Edit where the document already
//      has a known location (loaded from project or generated via
//      BSWMD-to-ECUC).
//   2. Save-as fallback: when `currentPath` is absent (brand-new
//      untitled doc), pop the OS showSaveDialog and let the user
//      pick a destination. Returned `{ canceled: true }` short-
//      circuits the renderer.
//
// Return shape (discriminated union via Result):
//   - `{ ok: true, value: { canceled: false, path } }` — file written
//   - `{ ok: true, value: { canceled: true } }` — user backed out
//   - `{ ok: false, error: SaveArxmlError }` — IO / serialization error
//     (Sprint 17b T7 — the `kind` field is now one of 6 typed values
//      so the renderer can dispatch a localized toast per failure
//      class. `code` carries the raw NodeJS errno string when set.)

import * as path from 'node:path';

import { dialog } from 'electron';

import { serializeArxml } from '../../core/arxml/serializer.js';
import type {
  FileError,
  SaveArxmlError,
  SaveArxmlErrorKind,
  SaveArxmlRequest,
  SaveArxmlResponse,
} from '../../shared/types.js';
import { writeAtomic } from '../io/writeAtomic.js';

export async function saveArxmlHandler(req: SaveArxmlRequest): Promise<SaveArxmlResponse> {
  const defaultName = req.defaultName ?? 'untitled.arxml';
  let targetPath: string | null = null;

  // Sprint 16 — silent save-back. When the renderer hands us the
  // on-disk path the document already lives at, skip the OS save
  // dialog entirely. The dialog is a confusing UX for the common
  // post-edit save flow (the user already knows where the file is).
  if (req.currentPath !== undefined && req.currentPath !== '') {
    targetPath = req.currentPath;
  } else {
    const result = await dialog.showSaveDialog({
      title: 'Save ARXML',
      defaultPath: defaultName,
      filters: [{ name: 'ARXML', extensions: ['arxml'] }],
    });
    if (result.canceled || result.filePath === undefined) {
      return { ok: true, value: { canceled: true } };
    }
    targetPath = result.filePath;
  }

  // Sprint 17b (H8) — defensive path-containment check. Reject any
  // `targetPath` containing a `..` parent-traversal segment before
  // touching the filesystem. The OS dialog always returns a
  // normalized path, but the renderer's `currentPath` (silent save-
  // back) is a renderer-controlled string — a compromised preload
  // bridge could otherwise forge `../../etc/passwd` and we'd
  // happily overwrite it.
  if (path.normalize(targetPath).includes('..')) {
    const err: SaveArxmlError = {
      kind: 'invalid-path',
      message: `File path contains parent traversal: ${targetPath}`,
    };
    return { ok: false, error: err };
  }

  const serialized = serializeArxml(req.doc);
  if (!serialized.ok) {
    // Serialize failure is in-memory — no errno applies. Surface a
    // dedicated `serialize-failed` kind so the renderer can offer a
    // "Report a bug" hint (vs. a permission toast for IO failures).
    const err: SaveArxmlError = {
      kind: 'serialize-failed',
      message: serialized.error.message,
    };
    return { ok: false, error: err };
  }

  try {
    await writeAtomic(targetPath, serialized.value);
    return { ok: true, value: { canceled: false, path: targetPath } };
  } catch (e) {
    // Sprint 17b T7 — translate the NodeJS.ErrnoException `.code`
    // field into a typed SaveArxmlErrorKind. The three mapped
    // clusters cover the failure modes a renderer user can act on
    // (fix permissions / free disk / pick a different path); any
    // unmapped errno falls back to `'unknown'` and preserves the
    // original code so the renderer can show it in the toast's
    // `{message}` placeholder.
    const errno = (e as NodeJS.ErrnoException | undefined)?.code;
    const kind: SaveArxmlErrorKind = mapErrnoToKind(errno);
    const err: SaveArxmlError = {
      kind,
      // Only surface the errno code for the kinds the renderer is
      // likely to log. The serialize-failed arm never reaches here
      // (it returned above), so the spread is safe.
      ...(errno !== undefined ? { code: errno } : {}),
      message: e instanceof Error ? e.message : String(e),
    };
    return { ok: false, error: err };
  }
}

/**
 * Sprint 17b T7 — translate a NodeJS errno code into the typed
 * `SaveArxmlErrorKind` union. The mapping is intentionally narrow:
 * the three clusters (permission / disk-full / path-not-found) cover
 * the failure modes a user can act on, and `unknown` is the safe
 * fallback for anything else (EIO, EROFS, EMFILE, ...). Kept as a
 * pure helper so the renderer-side test for the errno branch can
 * mock `fs.writeFile` without reaching into the handler body.
 */
function mapErrnoToKind(code: string | undefined): SaveArxmlErrorKind {
  if (code === 'EACCES' || code === 'EPERM') return 'permission-denied';
  if (code === 'ENOSPC' || code === 'EDQUOT') return 'disk-full';
  if (code === 'ENOENT' || code === 'ENOTDIR') return 'path-not-found';
  return 'unknown';
}

/**
 * Re-export so consumers that import `FileError` from the handler
 * still get the same type surface after the Sprint 17b T7 refactor.
 * (Pure type-only; no runtime impact.)
 */
export type { FileError };
