// --- Sprint 12 #3 — `project:pickDir` IPC types ----------------------------

/**
 * Request payload for `PICK_DIR`. `defaultPath` is optional and is
 * forwarded to `dialog.showOpenDialog` as-is — when omitted, the OS
 * picks the default starting location.
 *
 * `locale` (Sprint 13+ Stage 4 M7) is the renderer's current i18n
 * locale; main uses it to render the dialog title via the shared
 * `t(locale, key)` helper. When omitted, main falls back to `'en'`
 * (the hard-coded English title) — this is a defensive default for
 * older callers and the IPC contract is backward-compatible.
 */
export interface PickDirRequest {
  readonly defaultPath?: string;
  readonly locale?: 'zh-CN' | 'en';
}

/**
 * Response payload for `PICK_DIR`. Discriminated union:
 *   - `{ kind: 'picked', dirPath }` — user picked a directory;
 *     `dirPath` is its absolute on-disk path. The renderer hands it
 *     straight to the NewProjectDialog form (and eventually
 *     `PROJECT_NEW.directory` in Phase 1 Task 4).
 *   - `{ kind: 'canceled' }` — user dismissed the dialog (or selected
 *     0 directories).
 *
 * We deliberately do NOT validate that `dirPath` is a directory here:
 * the dialog was opened with `properties: ['openDirectory']`, so a
 * real OS can never return a file. The renderer is the right place to
 * double-check before committing a project to the path.
 */
export type PickDirResult =
  | { readonly kind: 'picked'; readonly dirPath: string }
  | { readonly kind: 'canceled' };

// --- Sprint 13 #1 — built-in template IPC types ---------------------------

export interface TemplateListRequest {
  // No fields. Reserved for future filters (e.g. vendor dialect).
  readonly _placeholder?: never;
}

export interface TemplateListResponse {
  readonly templates: ReadonlyArray<{
    readonly id: string;
    readonly displayNameKey: string;
    readonly descriptionKey: string;
    readonly fileCount: number;
    /**
     * Sprint 13+ Stage 3.4 — absolute on-disk paths of schema-side
     * BSWMD files within the template's `bswmd/` subdirectory. The
     * renderer surfaces them as multi-select chips in
     * `NewProjectDialog` (Classic template). Empty for templates
     * without a `bswmd/` dir (e.g. `empty`, `clone`).
     *
     * Absolute paths are exposed because the renderer cannot
     * import `node:path` to resolve `process.resourcesPath`
     * itself, and the chip row needs the full path to thread
     * back to the `projectNew` IPC. The renderer treats them
     * as opaque strings (basename for display, full path for
     * IPC); it does not read, write, or evaluate the path.
     */
    readonly bswmdPaths: readonly string[];
  }>;
}

export interface TemplateCopyRequest {
  readonly templateId: string;
  /** Absolute path of the target directory. Main has already shown a
   *  directory picker; renderer forwards the chosen path verbatim. */
  readonly destDir: string;
}

export interface TemplateCopyResponse {
  readonly copiedValueArxml: readonly string[];
  readonly copiedBswmd: readonly string[];
}

