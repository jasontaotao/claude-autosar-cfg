// Sprint 13 #1 — built-in template types.
//
// Pure data shapes only. No fs / no electron / no I/O — these are
// safe to import from both main and (in future) renderer code.

/**
 * A template discovered on disk at startup. The main process caches
 * an array of these in `app._builtinTemplates`; the renderer asks for
 * summaries via the `templates:list` IPC.
 *
 * `displayNameKey` / `descriptionKey` are i18n keys, NOT localized
 * strings. The renderer resolves them via `t(locale, key)`. The
 * `displayName` / `description` fields in the on-disk `template.json`
 * are kept on `TemplateManifest` only; the cache stores the key form
 * because the key is stable across locales (the string is not).
 */
export interface BuiltinTemplate {
  readonly id: string; // 'empty' | 'classic' | 'clone' (kebab-case, must match dirname)
  readonly displayNameKey: string; // 'template.empty.displayName'
  readonly descriptionKey: string; // 'template.empty.description'
  /** Absolute paths to value-side ARXML files within `samplesRoot`. */
  readonly valueArxmlPaths: readonly string[];
  /** Absolute paths to schema-side BSWMD files within `<templateId>/bswmd/`. */
  readonly bswmdPaths: readonly string[];
  /** valueArxmlPaths.length + bswmdPaths.length. Pre-computed for the IPC response. */
  readonly fileCount: number;
}

/**
 * Shape of `template.json` on disk. `displayName` / `description` are
 * present on disk for human readability of the manifest itself, but
 * the cached `BuiltinTemplate` only stores the i18n keys (see above).
 */
export interface TemplateManifest {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
}

/** Result of `copyTemplateFilesToDir`. Paths are absolute in `destDir`. */
export interface CopyResult {
  readonly copiedValueArxml: readonly string[];
  readonly copiedBswmd: readonly string[];
}
