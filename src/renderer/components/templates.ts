// templates helper — Sprint 13+ Stage 3.3 Task 1.
//
// The IPC `templates:list` returns `displayNameKey` / `descriptionKey`
// as raw strings (the IPC layer keeps its types serializable — it
// cannot import from `@shared/i18n` because that would create a
// renderer→main→shared import cycle for the i18n MessageKey type).
// These helpers cast the raw key to `MessageKey` and delegate to
// `t()` for actual rendering.
//
// `isTemplateAvailable` is the Stage 3.3 gate. Only `empty` is wired
// up end-to-end (the IPC exposes the full list for future expansion);
// `classic` and `clone` show the "coming soon" badge and are non-
// interactive. When Stage 3.4 / 3.5 land and the corresponding
// backend files are added, this list will flip to dynamic
// (e.g. `template.fileCount > 0`).

import { t, type Locale, type MessageKey } from '@shared/i18n';

/** Minimal shape of a template row, as returned by the IPC. */
export interface TemplateRow {
  readonly id: string;
  readonly displayNameKey: string;
  readonly descriptionKey: string;
  readonly fileCount: number;
}

/**
 * Resolve the i18n key to the localized display name.
 *
 * Unknown keys fall through `t()`'s defensive warn-and-return-key
 * behavior — the visible string in that case is the key itself, so a
 * typo (e.g. `template.emtpy.displayName`) is loud at runtime.
 */
export function getTemplateDisplayName(locale: Locale, template: TemplateRow): string {
  return t(locale, template.displayNameKey as MessageKey);
}

/** Resolve the i18n key to the localized description. */
export function getTemplateDescription(locale: Locale, template: TemplateRow): string {
  return t(locale, template.descriptionKey as MessageKey);
}

/**
 * Stage 3.3 availability gate.
 *
 * Returns true only for the `empty` template. The other templates
 * (`classic`, `clone`) are present in the IPC response (so the UI
 * can show them as "coming soon" placeholders) but not actionable.
 */
export function isTemplateAvailable(templateId: string): boolean {
  return templateId === 'empty';
}
