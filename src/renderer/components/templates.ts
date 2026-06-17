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
  /**
   * Sprint 13+ Stage 3.4 — absolute on-disk paths of BSWMD files
   * that the template ships with. Surfaced to the user as multi-
   * select chips in NewProjectDialog when the Classic template is
   * picked. Empty for templates without a `bswmd/` directory.
   */
  readonly bswmdPaths: readonly string[];
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
 * Stage 3.3 + 3.4 availability gate.
 *
 * Returns true for templates whose metadata the renderer can
 * consume end-to-end:
 *   - `empty` — always available (zero-config starter project).
 *   - `classic` — Stage 3.4 wires the BSWMD chip multi-select on
 *     top of this template, so the card is actionable. Until the
 *     main process ships template files for `classic` the IPC
 *     stub returns `bswmdPaths: []` and the chip row stays empty
 *     — the card remains clickable but creation just doesn't
 *     pre-load any BSWMDs.
 *   - `clone` — still a "coming soon" placeholder. Returns false
 *     so the card stays disabled and the "coming soon" badge
 *     shows; a future stage will wire it.
 */
export function isTemplateAvailable(templateId: string): boolean {
  return templateId === 'empty' || templateId === 'classic';
}
