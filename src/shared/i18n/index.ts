// i18n — Barrel re-export.
//
// The pre-split `i18n.ts` declared the `Messages` interface and the
// `t()` helper alongside the per-locale bundles. After the v1.23.1 T2
// interface split, the cluster types and per-locale bundles live in
// dedicated files (`i18n/`, `i18n.en/`, `i18n.zh-CN/`) and this
// barrel stitches them back together so callers can keep importing
// from `@shared/i18n` unchanged.
//
// Behaviour parity:
//   - `t(locale, key, params)` — same signature, same return semantics
//   - `MESSAGES_BY_LOCALE` — `Record<Locale, Messages>` keyed by locale
//   - `Messages` — full interface (intersection of 7 cluster interfaces)
//   - `MessagesEn` / `MessagesZhCN` — full bundles (spread across 7
//     clusters). The cast to `Messages` is safe because the cluster
//     interfaces collectively cover every key.

import { AppEn } from '../i18n.en/app.js';
import { DbcEn } from '../i18n.en/dbc.js';
import { DialogEn } from '../i18n.en/dialog.js';
import { EditorEn } from '../i18n.en/editor.js';
import { MiscEn } from '../i18n.en/misc.js';
import { OdxEn } from '../i18n.en/odx.js';
import { ValidationEn } from '../i18n.en/validation.js';
import { AppZhCN } from '../i18n.zh-CN/app.js';
import { DbcZhCN } from '../i18n.zh-CN/dbc.js';
import { DialogZhCN } from '../i18n.zh-CN/dialog.js';
import { EditorZhCN } from '../i18n.zh-CN/editor.js';
import { MiscZhCN } from '../i18n.zh-CN/misc.js';
import { OdxZhCN } from '../i18n.zh-CN/odx.js';
import { ValidationZhCN } from '../i18n.zh-CN/validation.js';

import type { Messages } from './types.js';

/** Supported locales. Order matches the toggle button in AppHeader. */
export type Locale = 'zh-CN' | 'en';

export const DEFAULT_LOCALE: Locale = 'zh-CN';

/** Default locale for new sessions. */
export const SUPPORTED_LOCALES: readonly Locale[] = ['zh-CN', 'en'] as const;

export type { Messages };
export type MessageKey = keyof Messages;

/** Merged English bundle — union of all 7 en cluster bundles. */
export const MessagesEn: Messages = {
  ...AppEn,
  ...DialogEn,
  ...EditorEn,
  ...ValidationEn,
  ...DbcEn,
  ...OdxEn,
  ...MiscEn,
} as Messages;

/** Merged Simplified Chinese bundle — union of all 7 zh-CN cluster bundles. */
export const MessagesZhCN: Messages = {
  ...AppZhCN,
  ...DialogZhCN,
  ...EditorZhCN,
  ...ValidationZhCN,
  ...DbcZhCN,
  ...OdxZhCN,
  ...MiscZhCN,
} as Messages;

/**
 * Bundle map (used by the store's setLocale action)
 */
export const MESSAGES_BY_LOCALE: Readonly<Record<Locale, Messages>> = {
  'zh-CN': MessagesZhCN,
  en: MessagesEn,
};

/**
 * Render the message for `key` in the given `locale`, interpolating
 * `{varName}` placeholders from `params` (if any).
 *
 * Behaviour on edge cases:
 *   - unknown key → returns the key verbatim + console.warn (one-shot
 *     per call, no debouncing — bugs should be visible)
 *   - missing param → leaves the `{varName}` placeholder literal so the
 *     caller can see the typo
 *   - non-string param value → coerced via String() (numbers / booleans
 *     render naturally; objects/arrays render via their toString)
 */
export function t(
  locale: Locale,
  key: MessageKey,
  params?: Readonly<Record<string, string | number | boolean>>,
): string {
  const bundle = MESSAGES_BY_LOCALE[locale];
  const template: string | undefined = bundle[key];
  if (template === undefined) {
    // Defensive guard — the parity test catches missing keys at build
    // time; this only fires for a typo at a call site.
    // eslint-disable-next-line no-console
    console.warn(`[i18n] missing key: ${String(key)} for locale ${locale}`);
    return String(key);
  }
  if (params === undefined) return template;

  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = params[name];
    if (v === undefined) return match;
    return String(v);
  });
}
