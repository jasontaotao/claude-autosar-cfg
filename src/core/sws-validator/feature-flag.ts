// src/core/sws-validator/feature-flag.ts
// Cluster G (v1.6.0) — SWS Validator feature flag.
//
// Default OFF per G spec §2 (G5) — opt-in via settings.json:
//   { "experimental": { "swsValidator": true } }
//
// Mirrors `src/main/arxml-stream/feature-flag.ts` pattern (Q6 A from
// v1.5.1). When OFF, the GUI panel does not mount and the CLI `--validate`
// stub returns an "experimental disabled" message.
//
// v1.7.3 — Renderer build fix: switch from static `import { ... } from
// 'node:fs' / 'node:path'` to dynamic `await import(...)`. Vite
// externalizes dynamic imports at the bundle level rather than failing
// the build when the renderer reaches the file. The sync read API
// (`isSwsValidatorEnabled`) stays synchronous for renderer callers and
// defaults to `false` when no cached value is available. Main-process
// callers (CLI) call `loadSwsValidatorFlag()` async at boot to
// populate the cache from `settings.json`.
//
// Tests use `setFlagForTest(...)` / `_resetFlagCache()` /
// `_setSettingsPathForTest(...)` to override without disk I/O.

interface FlagsConfig {
  readonly experimental: {
    readonly swsValidator: boolean;
  };
}

interface SettingsFile {
  readonly experimental?: {
    readonly swsValidator?: boolean;
  };
}

export type FlagKey = 'swsValidator';

const DEFAULT_FLAGS: FlagsConfig = { experimental: { swsValidator: false } };

let cached: FlagsConfig | null = null;
/** Test-only override. When a key is present, it wins over the file lookup. */
let override: { swsValidator?: boolean } | null = null;
/** Test-only: when set, replaces process.cwd() in the lookup path. */
let settingsDirOverride: string | null = null;

/**
 * v1.7.3 — Lazy, dynamic file lookup. Returns `DEFAULT_FLAGS` if
 * `node:fs` / `node:path` aren't available (renderer) or if no
 * `settings.json` matches the candidate paths.
 *
 * The dynamic import is intentional: a top-level `import { existsSync,
 * readFileSync } from 'node:fs'` is externalized by Vite for the
 * renderer bundle but Rollup then errors when the imported `join` is
 * actually referenced during module evaluation. Dynamic imports let
 * Vite defer the failure to runtime, where we catch and fall back.
 */
async function loadFromSettingsFile(): Promise<FlagsConfig> {
  let existsSync: ((p: string) => boolean) | null = null;
  type ReadFileSyncFn = (p: string, opts: { encoding: 'utf-8' }) => string;
  let readFileSync: ReadFileSyncFn | null = null;
  let join: (...parts: string[]) => string = null as unknown as (...parts: string[]) => string;
  try {
    const fs = await import('node:fs');
    const nodePath = await import('node:path');
    existsSync = fs.existsSync;
    readFileSync = fs.readFileSync;
    join = nodePath.join;
  } catch {
    // node:fs / node:path unavailable (renderer) — fall back to defaults.
    return DEFAULT_FLAGS;
  }
  if (existsSync === null || readFileSync === null) {
    return DEFAULT_FLAGS;
  }
  const baseDir = settingsDirOverride ?? (typeof process !== 'undefined' ? process.cwd() : '');
  const candidates: string[] = [join(baseDir, 'settings.json')];
  if (
    typeof process !== 'undefined' &&
    typeof process.env.APPDATA === 'string' &&
    process.env.APPDATA.length > 0
  ) {
    candidates.push(join(process.env.APPDATA, 'claude-autosarcfg', 'settings.json'));
  }
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const raw = readFileSync(candidate, { encoding: 'utf-8' });
      const parsed = JSON.parse(raw) as SettingsFile;
      return {
        experimental: {
          swsValidator: parsed.experimental?.swsValidator ?? false,
        },
      };
    } catch {
      // Malformed settings file — fall through to defaults.
    }
  }
  return DEFAULT_FLAGS;
}

function applyOverride(base: FlagsConfig): FlagsConfig {
  if (override === null) return base;
  return {
    experimental: {
      swsValidator: override.swsValidator ?? base.experimental.swsValidator,
    },
  };
}

/**
 * Sync renderer-safe API. Returns `false` when:
 *   - The cached file lookup hasn't been populated (renderer context)
 *   - `setFlagForTest('swsValidator', false)` was called
 *   - The settings.json lookup returned `false` (default)
 *
 * Tests that want to flip the flag use `setFlagForTest(...)` directly
 * without going through disk.
 */
export function isSwsValidatorEnabled(): boolean {
  const base = cached ?? DEFAULT_FLAGS;
  return applyOverride(base).experimental.swsValidator;
}

/**
 * Main-process boot helper. Call once at CLI start to populate the
 * cache from `settings.json`. In renderer, this is a no-op (the catch
 * inside `loadFromSettingsFile` handles it). Returns the resolved
 * value so callers can short-circuit.
 */
export async function loadSwsValidatorFlag(): Promise<boolean> {
  cached = await loadFromSettingsFile();
  return applyOverride(cached).experimental.swsValidator;
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
