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
//   - `{ ok: false, error: { kind: 'write-failed', message } }` — IO / serialization error

import { promises as fs } from 'node:fs';

import { dialog } from 'electron';

import { serializeArxml } from '../../core/arxml/serializer.js';
import type { FileError, SaveArxmlRequest, SaveArxmlResponse } from '../../shared/types.js';

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

  const serialized = serializeArxml(req.doc);
  if (!serialized.ok) {
    const err: FileError = {
      kind: 'write-failed',
      message: serialized.error.message,
    };
    return { ok: false, error: err };
  }

  try {
    await fs.writeFile(targetPath, serialized.value, 'utf8');
    return { ok: true, value: { canceled: false, path: targetPath } };
  } catch (e) {
    const err: FileError = {
      kind: 'write-failed',
      message: e instanceof Error ? e.message : String(e),
    };
    return { ok: false, error: err };
  }
}
