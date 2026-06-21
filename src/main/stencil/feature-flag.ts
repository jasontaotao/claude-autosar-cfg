// v1.8.0 K Stencil Wizard — feature flag.
//
// Mirrors the v1.7.3 pattern used by `src/main/arxml-stream/feature-flag.ts`:
// sync lookup of `settings.json` from cwd or `%APPDATA%/claude-autosarcfg/`,
// cached after first read. Tests call `_resetStencilFlagCache()` to
// re-read the file.
//
// Default OFF (per plan Global Constraints — "Feature flag
// `experimental.stencilWizard` default OFF, mirrors
// `experimental.swsValidator`"). When OFF, the IPC handler in
// `src/main/ipc/stencilHandler.ts` (Task 6) rejects the request with
// a `feature-disabled` error code.
//
// Static `import { ... } from 'node:fs'` is safe here because this
// module lives under `src/main/` (renderer never reaches it via Vite
// graph); if a future task lifts this into shared code, switch to the
// dynamic-import pattern from `arxml-stream/feature-flag.ts`.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

let cached: boolean | null = null;

export function isStencilWizardEnabled(): boolean {
  if (cached !== null) return cached;
  try {
    const candidates = [
      join(process.cwd(), 'settings.json'),
      join(process.env.APPDATA ?? '', 'claude-autosarcfg', 'settings.json'),
    ];
    for (const path of candidates) {
      if (!existsSync(path)) continue;
      const raw = readFileSync(path, 'utf-8');
      const parsed = JSON.parse(raw) as { experimental?: { stencilWizard?: boolean } };
      cached = parsed.experimental?.stencilWizard ?? false;
      return cached;
    }
  } catch {
    /* fall through — settings.json missing or malformed */
  }
  cached = false;
  return false;
}

/** Test-only: clear the cached file lookup so the next call re-reads settings.json. */
export function _resetStencilFlagCache(): void {
  cached = null;
}