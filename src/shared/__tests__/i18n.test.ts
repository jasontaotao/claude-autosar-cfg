// i18n helper tests — Sprint 11 Phase 1 (Option A: full i18n).
//
// Pins:
//   - t() returns the zh-CN string by default
//   - t() returns the en string when locale='en'
//   - placeholder interpolation works ({varName} substituted with values)
//   - unknown key returns the key itself + a console.warn (defensive)
//   - both message bundles cover the same set of keys (compile-time-like
//     safety net; if either bundle is missing a key, the test fails)

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { t, MessagesZhCN, MessagesEn } from '../i18n.js';
import type { Locale, MessageKey, Messages } from '../i18n.js';

const ALL_KEYS = Object.keys(MessagesZhCN) as MessageKey[];

describe('i18n — t() helper', () => {
  it('returns the zh-CN string when locale="zh-CN"', () => {
    expect(t('zh-CN', 'app.open')).toBe('打开');
  });

  it('returns the en string when locale="en"', () => {
    expect(t('en', 'app.open')).toBe('Open');
  });

  it('interpolates {var} placeholders in zh-CN', () => {
    const out = t('zh-CN', 'projectPanel.subtitle', {
      arxmlCount: 3,
      bswmdCount: 1,
    });
    expect(out).toBe('3 个 ARXML · 1 个 BSWMD');
  });

  it('interpolates {var} placeholders in en', () => {
    const out = t('en', 'projectPanel.subtitle', {
      arxmlCount: 3,
      bswmdCount: 1,
    });
    expect(out).toBe('3 ARXML · 1 BSWMD');
  });

  it('handles singular vs plural in Chinese (no-op — Chinese has no plural inflection)', () => {
    expect(t('zh-CN', 'validation.violation', { count: 1 })).toBe('1 项违规');
    expect(t('zh-CN', 'validation.violation', { count: 5 })).toBe('5 项违规');
  });

  it('falls back to the key itself + warns for unknown keys', () => {
    // Suppress console.warn noise in test output
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Cast through unknown to bypass the MessageKey constraint
    const out = t('zh-CN', 'nonexistent.key' as MessageKey);
    expect(out).toBe('nonexistent.key');
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it('returns the string unchanged when no params are passed and the string has no placeholders', () => {
    expect(t('en', 'app.open')).toBe('Open');
  });

  it('does not crash when a placeholder is missing from params (leaves it literal)', () => {
    const out = t('en', 'projectPanel.subtitle', { arxmlCount: 2 });
    expect(out).toContain('{bswmdCount}');
    expect(out).toContain('2');
  });
});

describe('i18n — message bundle parity', () => {
  it('zh-CN bundle and en bundle cover the same set of keys', () => {
    // Order-insensitive: both bundles must declare every MessageKey.
    const zhKeys = new Set(Object.keys(MessagesZhCN));
    const enKeys = new Set(Object.keys(MessagesEn));
    const onlyInZh = ALL_KEYS.filter((k) => !enKeys.has(k));
    const onlyInEn = [...enKeys].filter((k) => !zhKeys.has(k));
    expect(onlyInZh).toEqual([]);
    expect(onlyInEn).toEqual([]);
  });

  it('every key has a non-empty value in both bundles', () => {
    const isNonEmpty = (s: string) => s.trim().length > 0;
    for (const k of ALL_KEYS) {
      expect(isNonEmpty(MessagesZhCN[k]), `zh-CN ${k} is empty`).toBe(true);
      expect(isNonEmpty(MessagesEn[k]), `en ${k} is empty`).toBe(true);
    }
  });
});

describe('i18n — locale type', () => {
  it('accepts "zh-CN" and "en"', () => {
    const locales: Locale[] = ['zh-CN', 'en'];
    expect(locales).toHaveLength(2);
  });
});

// Suppress the unknown-key warning in parity tests so console output stays
// clean. (No unknown keys expected — this is just hygiene.)
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

// Re-export so vitest can find types in this module-scope helper.
// (Type-only — does not affect runtime behavior.)
export type { Messages };
