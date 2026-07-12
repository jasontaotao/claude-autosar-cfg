// v1.52.0 MINOR T1 -- pickFileWithCap helper.
//
// Round-10 audit F-3 (MEDIUM): the 3 picker handlers
// (`openDbcHandler.ts:34-60`, `openOdxWithDefaultHandler.ts:25-54`,
// `bswmdPickHandler.ts:33-56`) had line-for-line duplicates of the
// body:
//
//   const result = await dialog.showOpenDialog({...});
//   if (result.canceled || result.filePaths.length === 0)
//     return {kind: 'canceled'};
//   const path = result.filePaths[0]!;
//   const read = await readFileWithCap(path);
//   if (read.ok) return {kind: 'opened', path, content: read.content};
//   await dialog.showMessageBox({type: 'error', title: 'Failed to read X', message: read.message});
//   return {kind: 'read-failed', message: read.message};
//
// The dedup is the v1.46.0 D5 "dual-home deduplication deferred"
// follow-up. PickFile helper centralizes the dialog + read-and-
// message-on-failure sequence.
//
// Per the picker-handler shape comment at bswmdPickHandler.ts:4-7:
// "Mirrors openDbcHandler / openOdxHandler line-for-line" — the
// three callers were always structurally identical.
//
// Shape note: openOdxWithDefault supports an optional `defaultPath`
// argument + caller-supplied `filters`; openDbcHandler + bswmdPickHandler
// do not. We expose all 3 as `PickFileOptions` with sensible defaults
// so all 3 callers consume the same shape. The new behavioral surface
// is identical to the prior per-handler inline body (collapsed only).

import { dialog } from 'electron';

import { readFileWithCap } from '../ipc/sizeCap.js';

export interface PickFileOptions {
  readonly title: string;
  readonly filters: ReadonlyArray<{
    readonly name: string;
    readonly extensions: readonly string[];
  }>;
  readonly defaultPath?: string;
  readonly failureTitle: string;
}

export type PickFileOutcome =
  | { readonly kind: 'canceled' }
  | { readonly kind: 'opened'; readonly path: string; readonly content: string }
  | { readonly kind: 'read-failed'; readonly message: string };

/**
 * Show a single-file open dialog, read the chosen file (32 MiB cap,
 * via shared readFileWithCap), surface a modal error dialog on read
 * failure, and return a discriminated union mirroring the 3 callers'
 * prior inline result shapes.
 */
export async function pickFileWithCap(opts: PickFileOptions): Promise<PickFileOutcome> {
  const dialogResult = await dialog.showOpenDialog({
    title: opts.title,
    ...(opts.defaultPath !== undefined ? { defaultPath: opts.defaultPath } : {}),
    properties: ['openFile'],
    filters: opts.filters.map((f) => ({
      name: f.name,
      extensions: [...f.extensions],
    })),
  });
  if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
    return { kind: 'canceled' };
  }
  const filePath = dialogResult.filePaths[0]!;
  const read = await readFileWithCap(filePath);
  if (read.ok) {
    return { kind: 'opened', path: filePath, content: read.content };
  }
  await dialog.showMessageBox({
    type: 'error',
    title: opts.failureTitle,
    message: read.message,
  });
  return {
    kind: 'read-failed',
    message: read.message,
  };
}
