// arxml-stream/feature-flag.ts
// Feature flags for the new ARXML streaming + IndexedDB cache layer.
// Both default OFF (per Q6 A in v1.5.1 spec). To opt in, write a
// `settings.json` at the project root or under `%APPDATA%/claude-autosarcfg/`:
//
//   { "experimental": { "streaming": true, "indexedDb": true } }
//
// When OFF, the router in `./router.ts` falls back to the existing
// DOMParser path — behavior is identical to v1.5.0.
//
// v1.20.0 MINOR T3 — sync readers migrated to async (Promise-based
// cache). Each public function now returns `Promise<...>`. Callers
// must `await`. The renderer's bridge in `featureFlagsHandler.ts`
// was already async, so the surface stays the same from the renderer.
// Tests use `setFlagForTest(...)` / `_resetFlagCache()` / `_setSettingsPathForTest(...)`
// to override.

import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Result } from '../../core/arxml/types.js';

interface FlagsConfig {
  readonly experimental: {
    readonly streaming: boolean;
    readonly indexedDb: boolean;
  };
}

interface SettingsFile {
  readonly experimental?: {
    readonly streaming?: boolean;
    readonly indexedDb?: boolean;
  };
}

export type FlagKey = 'streaming' | 'indexedDb';

// v1.20.0 T3 — cache holds a Promise so concurrent first-callers all
// observe the same in-flight read. After settle, the resolved value is
// reused (subsequent awaits resolve on the same microtask).
let cached: Promise<FlagsConfig> | null = null;
/** Test-only override map. When a key is present, it wins over the file lookup. */
let override: { streaming?: boolean; indexedDb?: boolean } | null = null;
/** Test-only: when set, replaces process.cwd() in the lookup path. */
let settingsDirOverride: string | null = null;

function resolveCandidates(): string[] {
  const baseDir = settingsDirOverride ?? process.cwd();
  const candidates: string[] = [join(baseDir, 'settings.json')];
  if (typeof process.env.APPDATA === 'string' && process.env.APPDATA.length > 0) {
    candidates.push(join(process.env.APPDATA, 'claude-autosarcfg', 'settings.json'));
  }
  return candidates;
}

async function loadFromSettingsFile(): Promise<FlagsConfig> {
  for (const candidate of resolveCandidates()) {
    try {
      await access(candidate);
    } catch {
      continue;
    }
    try {
      const raw = await readFile(candidate, 'utf-8');
      const parsed = JSON.parse(raw) as SettingsFile;
      return {
        experimental: {
          streaming: parsed.experimental?.streaming ?? false,
          indexedDb: parsed.experimental?.indexedDb ?? false,
        },
      };
    } catch {
      // Malformed settings file — fall through to defaults.
    }
  }
  return { experimental: { streaming: false, indexedDb: false } };
}

function loadFlags(): Promise<FlagsConfig> {
  if (cached !== null) return cached;
  cached = loadFromSettingsFile();
  return cached;
}

function applyOverride(base: FlagsConfig): FlagsConfig {
  if (override === null) return base;
  return {
    experimental: {
      streaming: override.streaming ?? base.experimental.streaming,
      indexedDb: override.indexedDb ?? base.experimental.indexedDb,
    },
  };
}

export async function isStreamingEnabled(): Promise<boolean> {
  return applyOverride(await loadFlags()).experimental.streaming;
}

export async function isIndexedDbEnabled(): Promise<boolean> {
  return applyOverride(await loadFlags()).experimental.indexedDb;
}

/**
 * Read the resolved flag set. Exposed for diagnostics / the router;
 * returns a Result to make parse / IO failures explicit instead of
 * silently defaulting to OFF (callers can log when needed).
 */
export async function readFlags(): Promise<
  Result<FlagsConfig, { readonly kind: 'io-error'; readonly message: string }>
> {
  try {
    return { ok: true, value: applyOverride(await loadFlags()) };
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: 'io-error',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

/** Test-only: override one flag to force its value. Pass `null` to clear. */
export function setFlagForTest(flag: FlagKey | null, value?: boolean): void {
  if (flag === null) {
    override = null;
    return;
  }
  override = { ...(override ?? {}), [flag]: value ?? false };
}

/** Test-only: redirect the settings file lookup to a different directory. */
export function _setSettingsPathForTest(dir: string | null): void {
  settingsDirOverride = dir;
  cached = null;
}

/** Test-only: clear the cached file lookup. */
export function _resetFlagCache(): void {
  cached = null;
}