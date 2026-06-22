// src/renderer/store/slices/projectSlice.ts
// Sprint 11 Phase 1 — project manifest state + openProject / closeProject.
// Extracted from useArxmlStore.ts in PR(5). Pure refactor — bodies
// copied verbatim, only the imports changed.

import type { StateCreator } from 'zustand';

import type { BswmdDocument } from '@core/project/bswmd.js';
import { parseBswmd } from '@core/project/bswmd.js';
import { buildSchemaLayer, validateProjectForRenderer } from '@core/validation';
import { t } from '@shared/i18n';
import { dirname as sharedDirname, toManifestRelative } from '@shared/path';
import type { ProjectManifest } from '@shared/project';

import { computeDisplayDoc } from '../helpers/combinedDoc.js';
import { parseArxmlOrThrow } from '../helpers/projectSync.js';
import type { ArxmlState } from '../useArxmlStore.js';

export interface ProjectSlice {
  // Sprint 11 Phase 1 — project manifest state.
  // `project === null` ⇒ loose mode (pre-Sprint-11 behavior, back-compat
  // for the 329-test baseline). When non-null, mutating actions keep
  // `project.valueArxmlPaths` in sync with `documentPaths`.
  readonly project: ProjectManifest | null;
  /** Absolute on-disk path of the project manifest. Null in loose mode. */
  readonly projectPath: string | null;

  /**
   * Open a project from disk. Replaces the in-memory document set with
   * the bundle returned by IPC `project:open`. `manifest.bswmdPaths`
   * is recorded but the actual BSWMD contents are NOT parsed in
   * Phase 1 — that wires up in Phase 2 once `parseBswmd` lands.
   *
   * Sprint A (P0-A2) — also accepts `bswmds` (the IPC contract already
   * returns them but Phase 1 dropped the bundle). Each entry's
   * `content` is parsed via `parseBswmd` and the resulting schema is
   * pushed to `bswmdSchemas` alongside the IPC-provided absolute
   * `path` in `bswmdPaths`. Parse failures surface a localized
   * `'app.error.parseBswmdFailed'` toast and the bad entry is
   * skipped — good entries still register (best-effort load). Any
   * pre-existing `bswmdSchemas` / `bswmdPaths` are cleared first so a
   * prior project's schemas don't leak across openProject calls.
   */
  openProject: (input: {
    readonly manifestPath: string;
    readonly manifest: ProjectManifest;
    /**
     * Bundled docs. Each entry carries the manifest-relative path
     * (`rel`) alongside the absolute path so the renderer can pair
     * it back to a manifest entry even when two docs share a
     * basename (e.g. `subdir1/EcuC.arxml` and `subdir2/EcuC.arxml`).
     */
    readonly docs: readonly {
      readonly rel: string;
      readonly path: string;
      readonly content: string;
    }[];
    /**
     * Sprint A — bundled BSWMDs from IPC `project:open`. Same shape
     * as `docs` (rel + absolute path + content). Optional for
     * back-compat: New project flow passes nothing here today, and
     * tests that pre-date this field must keep working.
     */
    readonly bswmds?: readonly {
      readonly rel: string;
      readonly path: string;
      readonly content: string;
    }[];
  }) => void;
  /**
   * Close the current project. Documents stay in the store (the user
   * might be editing unsaved changes); only `project` and `projectPath`
   * are cleared. Use `clear()` to also drop documents.
   */
  closeProject: () => void;
}

export const createProjectSlice: StateCreator<ArxmlState, [], [], ProjectSlice> = (set, get) => ({
  // Sprint 11 Phase 1 — project state.
  project: null,
  projectPath: null,

  openProject: ({ manifestPath, manifest, docs, bswmds }) => {
    // Phase 1 only parses ARXML docs; BSWMDs are recorded in
    // `manifest.bswmdPaths` but their content is left unparsed (Phase 2
    // wires the BSWMD parser). The renderer pulls BSWMD content from the
    // IPC response in a future phase; for now this keeps the manifest
    // shape round-tripping through save.
    //
    // Sprint A (P0-A2) — parse each BSWMD entry from the IPC bundle
    // and push the result onto `bswmdSchemas` / `bswmdPaths`. Mirrors
    // the dialog-driven `addBswmd` path so consumers (`ProjectPanel`,
    // `ModuleFromBswmdPicker`) see the same shape regardless of how
    // the schema arrived. Pre-Sprint-A this branch silently dropped
    // `bswmds`, leaving the `📋 0/0` chip stuck on zero.
    //
    // Pair by IPC-provided absolute `path` — `manifest.bswmdPaths` is
    // relative, but `state.bswmdPaths` is absolute (the addBswmd
    // contract). Same key shape as the dialog flow so P0-A1's
    // `bswmdKeyFor` lookup in `ProjectPanel` resolves correctly.
    //
    // Best-effort: parse failures surface a localized banner and the
    // bad entry is skipped — good entries still register so a single
    // malformed BSWMD doesn't sink the whole project load.
    //
    // Bug 3 — this loop runs BEFORE the ARXML doc loop below because
    // the ECUC `sourceBswmdPath` hydration needs `bswmdPathsOut` as a
    // lookup target. The order swap is purely local; downstream
    // `set({ bswmdSchemas, bswmdPaths, ... })` keeps the same payload
    // shape so consumers are unaffected.
    const locale = get().locale;
    const bswmdSchemasOut: BswmdDocument[] = [];
    const bswmdPathsOut: string[] = [];
    let lastParseError: string | null = null;
    if (bswmds !== undefined) {
      for (const entry of bswmds) {
        const result = parseBswmd(entry.content);
        if (!result.ok) {
          const message =
            'message' in result.error
              ? result.error.message
              : `unsupported version: ${result.error.version}`;
          lastParseError = t(locale, 'app.error.parseBswmdFailed', { message });
          continue;
        }
        bswmdSchemasOut.push(result.value);
        bswmdPathsOut.push(entry.path);
      }
    }

    // Match by `rel` (the manifest-relative path) — not by basename or
    // absolute path — so two entries that share a basename (e.g.
    // `subdir1/EcuC.arxml` + `subdir2/EcuC.arxml`) pair back to the
    // correct manifest slot. The IPC contract returns the `rel`/`path`
    // pair explicitly for this reason.
    const docsByRel = new Map(docs.map((d) => [d.rel, d] as const));
    const orderedDocuments = [];
    const orderedPaths: string[] = [];
    // Bug 3 — hydrate each ECUC doc's in-memory `sourceBswmdPath`
    // from `manifest.ecucSources[relPath]`. Pre-Bug-3 this was always
    // `undefined` after restart because the field was never
    // serialised; the ProjectPanel chip filter then reported 0/N
    // regardless of how many ECUC docs the user had generated from a
    // BSWMD. The manifest is the source of truth; the in-memory
    // `sourceBswmdPath` is a cache rebuilt here at every openProject.
    const ecucSources = manifest.ecucSources ?? {};
    // The IPC `bswmds` bundle provides absolute paths only (no `rel`
    // for BSWMDs today). The manifest stores BSWMD paths in their
    // manifest-relative form (projectSyncSetEcucSource relativises
    // on write). To rehydrate `sourceBswmdPath` with the absolute
    // form that downstream consumers expect (e.g. `bswmdKeyFor`
    // pair-up in ProjectPanel), build a `rel → abs` lookup by
    // relativising each parsed BSWMD abs path against the manifest
    // directory. The fallback to `recordedSourceRel` honours the
    // manifest string verbatim if no match — preserves a hand-edited
    // manifest where the user stored an absolute source string.
    const manifestDir = sharedDirname(manifestPath);
    const bswmdRelToAbs = new Map<string, string>();
    for (const abs of bswmdPathsOut) {
      const rel = toManifestRelative(manifestDir, abs) ?? abs;
      bswmdRelToAbs.set(rel, abs);
      // Also map the raw abs path so a manifest that stored the
      // source as absolute still resolves.
      bswmdRelToAbs.set(abs, abs);
    }
    for (const relPath of manifest.valueArxmlPaths) {
      const entry = docsByRel.get(relPath);
      if (entry === undefined) continue;
      const parsed = parseArxmlOrThrow(entry.content);
      const recordedSourceRel = ecucSources[relPath];
      let sourceBswmdPath: string | undefined;
      if (recordedSourceRel !== undefined) {
        const abs = bswmdRelToAbs.get(recordedSourceRel);
        sourceBswmdPath = abs ?? recordedSourceRel;
      }
      orderedDocuments.push(
        sourceBswmdPath !== undefined ? { ...parsed, sourceBswmdPath } : parsed,
      );
      orderedPaths.push(entry.path);
    }
    // Documents that came back from IPC but aren't in the manifest
    // (e.g. extra files the user picked alongside) are ignored — the
    // manifest is the source of truth for what's "in" the project.
    const activeDoc = orderedDocuments[0] ?? null;
    const activePath = orderedPaths[0] ?? null;
    const nextDisplayResult = computeDisplayDoc(
      get().viewMode,
      activeDoc,
      orderedDocuments,
      orderedPaths,
      get().bswmdSchemas,
    );

    set({
      documents: orderedDocuments,
      documentPaths: orderedPaths,
      activeDocumentPath: activePath,
      doc: activeDoc,
      filePath: activePath,
      displayDoc: nextDisplayResult?.doc ?? null,
      // Sprint A (P0-A2) — register the freshly-parsed BSWMDs so
      // downstream consumers (`BswmdPickerDialog`, the validation
      // layer, the `ProjectPanel` 0/0 chip) see them. Pre-fix this
      // block populated `bswmdSchemasOut` / `bswmdPathsOut` locals
      // but never wrote them to the store, leaving `bswmdSchemas`
      // permanently empty and the picker resolution returning
      // `no-bswmd-for-module` on every right-click → Add Container.
      // User-reported as "JWQ3399SpiConfig picker is empty / cannot
      // add SpiSequenceRef".
      bswmdSchemas: bswmdSchemasOut,
      bswmdPaths: bswmdPathsOut,
      // Sprint 17c T10 — refresh warnings in combined mode.
      warnings:
        get().viewMode === 'combined' && nextDisplayResult !== null
          ? nextDisplayResult.warnings
          : [],
      selectedPath: null,
      // A freshly-opened project is, by definition, saved on disk; the
      // renderer has not modified anything yet, so all dirty bits clear.
      dirtyPaths: new Set<string>(),
      // Sprint 17b T6 — clear the typed toast alongside `error` so a
      // stale open-failure banner doesn't survive a successful open,
      // UNLESS we hit a BSWMD parse error above (in which case the
      // banner takes priority — the user needs to know the partial
      // load).
      error: lastParseError,
      toast: null,
      project: manifest,
      projectPath: manifestPath,
      validationErrors: validateProjectForRenderer(orderedDocuments, {
        schemaLayer: buildSchemaLayer(get().bswmdSchemas),
      }),
      lastValidatedAt: Date.now(),
    });
  },

  closeProject: () =>
    set({
      project: null,
      projectPath: null,
      // Documents and dirty state are intentionally preserved so the
      // user can keep editing in loose mode without losing unsaved
      // changes. Use `clear()` to also drop documents.
    }),
});
