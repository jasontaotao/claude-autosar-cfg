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
// The lookup is sync (cached after the first read). Tests use
// `setFlagForTest(...)` / `_resetFlagCache()` / `_setSettingsPathForTest(...)`
// to override.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

let cached: FlagsConfig | null = null;
/** Test-only override. When a key is present, it wins over the file lookup. */
let override: { swsValidator?: boolean } | null = null;
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

function loadFromSettingsFile(): FlagsConfig {
  for (const candidate of resolveCandidates()) {
    if (!existsSync(candidate)) continue;
    try {
      const raw = readFileSync(candidate, 'utf-8');
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
  return { experimental: { swsValidator: false } };
}

function loadFlags(): FlagsConfig {
  if (cached !== null) return cached;
  cached = loadFromSettingsFile();
  return cached;
}

function applyOverride(base: FlagsConfig): FlagsConfig {
  if (override === null) return base;
  return {
    experimental: {
      swsValidator: override.swsValidator ?? base.experimental.swsValidator,
    },
  };
}

export function isSwsValidatorEnabled(): boolean {
  return applyOverride(loadFlags()).experimental.swsValidator;
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