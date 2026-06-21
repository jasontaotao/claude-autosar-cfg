// src/renderer/store/slices/i18nSlice.ts
// Sprint 11 Phase 1 (Option A) — i18n slice. Extracted from
// useArxmlStore.ts in PR(5). Pure refactor.

import type { StateCreator } from 'zustand';

import { DEFAULT_LOCALE } from '@shared/i18n';
import type { Locale } from '@shared/i18n';

import type { ArxmlState } from '../useArxmlStore.js';

export interface I18nSlice {
  readonly locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const createI18nSlice: StateCreator<ArxmlState, [], [], I18nSlice> = (set) => ({
  // Sprint 11 Phase 1 (Option A) — i18n default.
  locale: DEFAULT_LOCALE,
  setLocale: (locale) => set({ locale }),
});
