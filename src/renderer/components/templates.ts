// templates helper — Sprint 13+ Stage 3.3 Task 1 + v1.21.0 MINOR T2.
//
// The IPC `templates:list` returns `displayNameKey` / `descriptionKey`
// as raw strings (the IPC layer keeps its types serializable — it
// cannot import from `@shared/i18n` because that would create a
// renderer→main→shared import cycle for the i18n MessageKey type).
// These helpers cast the raw key to `MessageKey` and delegate to
// `t()` for actual rendering.
//
// `isTemplateAvailable` is the gate. v1.21.0 T2 flipped it from a
// hard-coded `templateId === 'empty' || templateId === 'classic'`
// allowlist to a data-driven check (the Stage 3.3 / 3.4 plan called
// for this change — see the original comment at line 14; the actual
// flip landed only after the Classic template files shipped in
// `samples/arxml/classic/`). Empty is always available because it's
// a zero-config starter; non-empty templates require `fileCount > 0`
// so a broken on-disk layout (`template.json` present but no files)
// does not render as a clickable card that copies an empty directory.

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
 * v1.21.0 MINOR T2 — data-driven availability gate.
 *
 * Rules:
 *   - `empty` is ALWAYS available — it's the zero-config starter and
 *     is the only template without on-disk files by design.
 *   - Any other template (classic, clone, future) is available iff
 *     `fileCount > 0` — i.e. the on-disk layout actually shipped
 *     something. A `template.json` with no accompanying value-side
 *     ARXMLs / BSWMDs renders as "coming soon" so the user does not
 *     hit a clickable card that copies an empty directory.
 *   - Unknown template ids (defensive default) — returns false.
 *
 * The function takes the full `TemplateRow` instead of just the id
 * because the gate decision now depends on `fileCount`, which is
 * data the IPC carries. Templates not surfaced by the IPC (e.g. a
 * hard-coded 'clone' fallback) cannot reach this function in the
 * first place — the IPC `templates:list` response is the source of
 * truth for what cards the renderer renders.
 */
export function isTemplateAvailable(template: TemplateRow): boolean {
  if (template.id === 'empty') return true;
  return template.fileCount > 0;
}
