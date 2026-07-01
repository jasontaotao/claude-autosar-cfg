// v1.8.0 K Stencil Wizard — feature flag.
//
// Mirrors the v1.7.3 pattern used by `src/main/arxml-stream/feature-flag.ts`:
// async lookup of `settings.json` from cwd or `%APPDATA%/claude-autosarcfg/`,
// cached after first read. Tests call `_resetStencilFlagCache()` to
// re-read the file.
//
// v1.20.0 MINOR T3 — sync readers migrated to async (Promise-based
// cache). The single public function `isStencilWizardEnabled()` now
// returns `Promise<boolean>`. Caller `featureFlagsHandler.ts` was
// already async — no signature ripple beyond that one IPC handler.
//
// Default OFF (per plan Global Constraints — "Feature flag
// `experimental.stencilWizard` default OFF, mirrors
// `experimental.swsValidator`"). When OFF, the IPC handler in
// `src/main/ipc/stencilHandler.ts` rejects the request with
// a `feature-disabled` error code.

import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

let cached: Promise<boolean> | null = null;

export async function isStencilWizardEnabled(): Promise<boolean> {
  if (cached !== null) return cached;
  cached = (async (): Promise<boolean> => {
    try {
      const candidates = [
        join(process.cwd(), 'settings.json'),
        join(process.env.APPDATA ?? '', 'claude-autosarcfg', 'settings.json'),
      ];
      for (const path of candidates) {
        try {
          await access(path);
        } catch {
          continue;
        }
        const raw = await readFile(path, 'utf-8');
        const parsed = JSON.parse(raw) as { experimental?: { stencilWizard?: boolean } };
        return parsed.experimental?.stencilWizard ?? false;
      }
    } catch {
      /* fall through — settings.json missing or malformed */
    }
    return false;
  })();
  return cached;
}

/** Test-only: clear the cached file lookup so the next call re-reads settings.json. */
export function _resetStencilFlagCache(): void {
  cached = null;
}
