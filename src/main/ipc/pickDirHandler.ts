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
//
// Sprint 13+ Stage 4 M7 — dialog title rendered through the shared
// i18n helper using the renderer's current locale. Defaults to 'en'
// for backward compatibility with older callers.

import { dialog } from 'electron';

import { t, type Locale } from '../../shared/i18n/index.js';
import type { PickDirRequest, PickDirResult } from '../../shared/types.js';

export async function pickDirHandler(req: PickDirRequest): Promise<PickDirResult> {
  // v1.41.0 M2 — strict validate `req.locale`. The IPC type is a
  // closed union (`'zh-CN' | 'en'`) but TypeScript only guards within
  // TS callers; a tampered preload passing `'fr'` (or any other
  // string) bypasses the type and would crash inside `t()` because
  // `MESSAGES_BY_LOCALE['fr']` is `undefined`. The ternary keeps the
  // `Locale` type narrowed while collapsing unknown / unsupported
  // values to the `'en'` fallback. `'zh-CN'` is checked first so the
  // hot path is unchanged.
  const locale: Locale = req.locale === 'zh-CN' ? 'zh-CN' : 'en';
  const options: Electron.OpenDialogOptions = {
    title: t(locale, 'dialog.pickDir.title'),
    properties: ['openDirectory'],
  };
  // Build the options object conditionally. We do NOT pass
  // `defaultPath: undefined` because `exactOptionalPropertyTypes`
  // rejects an explicit `undefined` on a `string` typed property —
  // the OS default is "remember last directory" which is exactly the
  // behavior we want when the renderer omits `defaultPath`.
  if (req.defaultPath !== undefined) {
    options.defaultPath = req.defaultPath;
  }
  const result = await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) {
    return { kind: 'canceled' };
  }
  return { kind: 'picked', dirPath: result.filePaths[0]! };
}
