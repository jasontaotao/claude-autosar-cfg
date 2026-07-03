// i18n — Path redirect shim (v1.23.1 T2 compatibility).
//
// Pre-T2 callers import from `@shared/i18n` (with `.js` suffix on TS
// imports) which resolved to the monolithic `i18n.ts`. Post-T2 the
// type interface and bundles live under `i18n/` with a barrel
// `index.ts`. To keep zero caller changes, this file is a pure
// re-export from the barrel so the old import path still works.
//
// NOTE: this shim exists ONLY for backward compatibility. New code
// should import from `@shared/i18n` directly (which now resolves to
// `./i18n/index.ts` via the folder resolution rules).

export type { Messages, MessageKey, Locale } from './i18n/index.js';
export {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  MESSAGES_BY_LOCALE,
  MessagesEn,
  MessagesZhCN,
  t,
} from './i18n/index.js';
