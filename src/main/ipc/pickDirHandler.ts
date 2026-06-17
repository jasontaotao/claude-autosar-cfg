// Sprint 12 #3 — `project:pickDir` IPC handler.
//
// Pops a native "Choose folder…" dialog and returns the picked
// absolute directory path. Used by `NewProjectDialog` (Phase 1 Task 1)
// to populate its `directory` field before the user clicks "Create".
// Pairs with `PROJECT_NEW` (Phase 1 Task 4) which will then join
// `<directory>/<name>.autosarcfg.json` and write the manifest.
//
// Shape: `{ kind: 'picked', dirPath } | { kind: 'canceled' }`.
// We deliberately use a separate `kind` discriminator (rather than the
// `Result<T, E>` envelope used elsewhere) because the failure side
// carries no value other than "user dismissed" — there's nothing for
// the renderer to surface. This mirrors `BSWMD_OPEN` (Sprint 12 #2).
//
// OS-trust contract: the dialog is opened with
// `properties: ['openDirectory']`, so a real OS will never return a
// file path. We don't add a defensive `statSync` check here — if a
// future change widens the dialog properties (e.g. multi-select with
// files), the renderer can validate before calling `PROJECT_NEW`.

import { dialog } from 'electron';

import type { PickDirRequest, PickDirResult } from '../../shared/types.js';

export async function pickDirHandler(req: PickDirRequest): Promise<PickDirResult> {
  // Build the options object conditionally. We do NOT pass
  // `defaultPath: undefined` because `exactOptionalPropertyTypes`
  // rejects an explicit `undefined` on a `string` typed property —
  // the OS default is "remember last directory" which is exactly the
  // behavior we want when the renderer omits `defaultPath`.
  const options: Electron.OpenDialogOptions = {
    title: 'Choose Project Directory',
    properties: ['openDirectory'],
  };
  if (req.defaultPath !== undefined) {
    options.defaultPath = req.defaultPath;
  }
  const result = await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) {
    return { kind: 'canceled' };
  }
  return { kind: 'picked', dirPath: result.filePaths[0]! };
}
