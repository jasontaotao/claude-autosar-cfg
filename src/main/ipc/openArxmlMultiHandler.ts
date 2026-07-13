// v1.54.1 PATCH T4 -- `arxml:open-multi` IPC handler.
//
// Multi-file picker (distinct from `arxml:open` which is single-file):
// reads all chosen files into memory (subject to the shared 32 MiB
// per-file cap), then returns one of 3 discriminated-union outcomes:
//   - `kind: 'canceled'`  -- user dismissed the dialog
//   - `kind: 'opened'`    -- all files read successfully
//   - `kind: 'partial'`   -- some succeeded, some failed
//   - `kind: 'read-failed'` -- all files failed (or single file failed)
//
// v1.40.0 MINOR T1 (H1 + M4) -- per-file `readFileWithCap` (32 MiB
// cap). M4 specifically closes the "5 picks × 1 GB each = 5 GB
// heap pressure" vector -- without the cap a multi-GB file in any
// single slot could OOM main.
//
// v1.54.1 PATCH T4 -- extracted from inline at
// `register.ts:217-260` (pre-v1.54.1) for direct unit-testability.
// Verbatim body clip per lesson `#15`. Mirrors the
// `openDbcHandler.ts` / `openOdxHandler.ts` extraction pattern.

import { dialog, ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/ipc-contract.js';
import type { OpenArxmlMultiResult } from '../../shared/types.js';

import { readFileWithCap } from './sizeCap.js';

export async function openArxmlMultiDialog(opts?: {
  readonly title?: string;
}): Promise<OpenArxmlMultiResult> {
  const result = await dialog.showOpenDialog({
    title: opts?.title ?? 'Open ARXML',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'ARXML', extensions: ['arxml'] },
      { name: 'XML', extensions: ['xml'] },
      { name: 'All', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { kind: 'canceled' };
  }
  const opened: { path: string; content: string }[] = [];
  const failed: { path: string; message: string }[] = [];
  for (const path of result.filePaths) {
    // v1.40.0 MINOR T1 (H1 + M4) -- use the shared `readFileWithCap`
    // helper (32 MiB cap). Per-file reject: `too-large` and
    // `read-failed` both fold into the `failed[]` list with the
    // helper's message so the existing `partial` / `read-failed`
    // envelope contract is preserved.
    const read = await readFileWithCap(path);
    if (read.ok) {
      opened.push({ path, content: read.content });
    } else {
      failed.push({ path, message: read.message });
    }
  }
  if (failed.length === 0) {
    return { kind: 'opened', results: opened };
  }
  if (opened.length === 0) {
    return {
      kind: 'read-failed',
      message: failed.map((f) => `${f.path}: ${f.message}`).join('\n'),
    };
  }
  return { kind: 'partial', opened, failed };
}

/**
 * Register the `arxml:open-multi` IPC handler. Called from
 * `register.ts` alongside the other handler registrations.
 */
export function registerOpenArxmlMultiHandler(): void {
  ipcMain.handle(
    IPC_CHANNELS.OPEN_ARXML_MULTI,
    async (_evt, opts?: { readonly title?: string }): Promise<OpenArxmlMultiResult> => {
      return openArxmlMultiDialog(opts);
    },
  );
}
