// src/renderer/store/slices/ecucSlice.ts
// ECUC document state slice: multi-doc state + selectedPath + dirtyPaths
// + validationErrors + lastValidatedAt + doc/filePath back-compat
// aliases + actions (addDocument, removeDocument, setActiveDocument,
// setDoc, select, updateParam, markSaved, validate, clear).
// Extracted from useArxmlStore.ts in PR(5). Pure refactor — bodies
// copied verbatim, only the imports changed.

import type { StateCreator } from 'zustand';

import type { ArxmlDocument, ParamValue } from '@core/arxml/types';
import type { ValidationError } from '@core/validation';
import { buildSchemaLayer, validateProjectForRenderer } from '@core/validation';
import { dirname as sharedDirname } from '@shared/path';

import {
  computeDisplayDoc,
  resolveContainerTarget,
  stripCombinedPrefix,
} from '../helpers/combinedDoc.js';
import { addToDirty, dropFromDirty } from '../helpers/dirty.js';
import { applyParamUpdate } from '../helpers/paramUpdate.js';
import { projectSyncAddPath, projectSyncRemovePath } from '../helpers/projectSync.js';
import type { ArxmlState } from '../useArxmlStore.js';

export interface EcucSlice {
  // Multi-doc state (canonical)
  readonly documents: readonly ArxmlDocument[];
  readonly documentPaths: readonly string[];
  readonly activeDocumentPath: string | null;

  // Back-compat single-doc aliases (derived from active)
  /** @deprecated use `documents` + `activeDocumentPath` instead. */
  readonly doc: ArxmlDocument | null;
  /** @deprecated use `documentPaths` + `activeDocumentPath` instead. */
  readonly filePath: string | null;

  // Per-renderer UI state
  readonly selectedPath: string | null;
  /**
   * Per-document dirty state. Each entry is the filePath of a document
   * that has unpersisted mutations. Consumers computing "is the active
   * doc dirty" should read this set against `activeDocumentPath`:
   *
   *   const isActiveDirty =
   *     activeDocumentPath !== null && dirtyPaths.has(activeDocumentPath);
   *
   * Pre-Sprint 10 #2, this was a single `boolean` representing the
   * project-wide dirty state. That semantic broke in the multi-doc
   * world (saving doc B would clear dirty even if doc A was still
   * dirty). The Set is the correct per-path representation.
   */
  readonly dirtyPaths: ReadonlySet<string>;
  readonly validationErrors: readonly ValidationError[];
  readonly lastValidatedAt: number | null;
  // v1.8.0 K Stencil Task 10 — per-document "is this a template" flag.
  // A doc is marked as a template when it was loaded from an existing
  // .arxml on disk via File → Open (any .arxml is a template per
  // the KISS design). The FileListTab renders a "Template" badge for
  // every path in this set. Newly created docs (Stencil Wizard
  // output, blank docs) are NOT in this set — only opened ones.
  readonly templatePaths: ReadonlySet<string>;

  // Multi-doc actions (Sprint 10 #2)
  addDocument: (doc: ArxmlDocument, filePath: string, options?: { readonly template?: boolean }) => void;
  removeDocument: (filePath: string) => void;
  setActiveDocument: (filePath: string | null) => void;

  // Back-compat single-doc action. Since Sprint 10 #2, `setDoc` is
  // equivalent to `addDocument`: it appends the doc if `filePath` is new,
  // or replaces the existing entry if `filePath` is already loaded, and
  // sets the active doc to `filePath`. New code should call `addDocument`
  // directly; this is kept only because every existing call site (renderer
  // tests, fixture setup) uses it and we don't want to migrate them yet.
  setDoc: (doc: ArxmlDocument, filePath: string) => void;

  // Other actions
  select: (path: string | null) => void;
  updateParam: (containerPath: string, paramKey: string, value: ParamValue) => void;
  markSaved: (filePath: string) => void;
  validate: () => void;
  clear: () => void;
}

export const createEcucSlice: StateCreator<ArxmlState, [], [], EcucSlice> = (set, get) => ({
  documents: [],
  documentPaths: [],
  activeDocumentPath: null,
  doc: null,
  filePath: null,
  selectedPath: null,
  dirtyPaths: new Set<string>(),
  validationErrors: [],
  lastValidatedAt: null,
  // v1.8.0 K Stencil Task 10 — set of filePaths marked as templates.
  // Empty by default; populated by the File → Open flow passing
  // `options.template: true` to addDocument.
  templatePaths: new Set<string>(),

  addDocument: (doc, filePath, options) => {
    const state = get();
    const existingIdx = state.documentPaths.indexOf(filePath);
    let nextDocuments: readonly ArxmlDocument[];
    if (existingIdx === -1) {
      nextDocuments = [...state.documents, doc];
    } else {
      nextDocuments = state.documents.map((d, i) => (i === existingIdx ? doc : d));
    }
    // Project-sync: when a project is open, also append the new path to
    // the manifest's valueArxmlPaths so the next Save Project persists it.
    // Sprint 16b T6 — relativise the absolute filePath against the
    // manifest's directory so the on-disk manifest stays valid
    // (classifyBadPath rejects absolute paths). `toManifestRelative`
    // returns null on cross-drive Windows / sibling POSIX paths; in
    // that case we keep the absolute path and the next save round-trip
    // will surface an 'invalid-path' / 'absolute' error so the user
    // notices the mistake.
    const nextProject = projectSyncAddPath(
      state.project,
      filePath,
      state.projectPath !== null ? sharedDirname(state.projectPath) : null,
    );
    const nextPaths = state.documentPaths.includes(filePath)
      ? state.documentPaths
      : [...state.documentPaths, filePath];
    const nextDisplayResult = computeDisplayDoc(state.viewMode, doc, nextDocuments, nextPaths);
    set({
      documents: nextDocuments,
      documentPaths: nextPaths,
      activeDocumentPath: filePath,
      doc,
      filePath,
      // Sprint 17c T10 — displayDoc may be null when the build
      // can't run (no source documents); the rest of the state
      // changes still commit so the action's side effects
      // (validation, dirty reset) take effect.
      displayDoc: nextDisplayResult?.doc ?? null,
      // Sprint 17c T10 — thread dedup warnings into the store
      // (single-mode changes leave warnings untouched, combined-
      // mode updates replace the slice with the fresh build).
      warnings:
        state.viewMode === 'combined' && nextDisplayResult !== null
          ? nextDisplayResult.warnings
          : state.warnings,
      selectedPath: null,
      // Newly loaded doc is fresh; other docs' dirty state is preserved.
      dirtyPaths: dropFromDirty(state.dirtyPaths, filePath),
      // Sprint 17b T6 — successful doc load clears both the legacy
      // `error` field and the typed `toast` so a stale banner from a
      // previous open-failure doesn't linger.
      error: null,
      toast: null,
      project: nextProject,
      validationErrors: validateProjectForRenderer(nextDocuments, {
        schemaLayer: buildSchemaLayer(get().bswmdSchemas),
      }),
      lastValidatedAt: Date.now(),
      // v1.8.0 K Stencil Task 10 — add the loaded path to
      // templatePaths when the caller opts in. The File → Open flow
      // passes `options.template = true` so any opened .arxml is
      // treated as a template (KISS: no separate "template" concept).
      // Newly created docs (Stencil Wizard output) do not pass this
      // option and stay out of the set. Re-loading an existing path
      // is idempotent (Set semantics).
      templatePaths:
        options?.template === true
          ? new Set([...state.templatePaths, filePath])
          : state.templatePaths,
    });
  },

  removeDocument: (filePath) => {
    const state = get();
    const idx = state.documentPaths.indexOf(filePath);
    if (idx === -1) return;
    const nextPaths = state.documentPaths.filter((_, i) => i !== idx);
    const nextDocuments = state.documents.filter((_, i) => i !== idx);
    // If we removed the active doc, promote the first remaining (or null).
    const wasActive = state.activeDocumentPath === filePath;
    const nextActive = wasActive ? (nextPaths[0] ?? null) : state.activeDocumentPath;
    const activeIdx = nextActive === null ? -1 : nextPaths.indexOf(nextActive);
    const nextActiveDoc = activeIdx === -1 ? null : (nextDocuments[activeIdx] ?? null);
    // Project-sync: when a project is open, also drop the path from
    // the manifest so Save Project doesn't resurrect a deleted file.
    // Sprint 16b T6 — match the path-shape that was stored by
    // addDocument: try the relativised form first, then the raw
    // absolute path. Removing a doc by its absolute filePath therefore
    // also drops the relative manifest entry.
    const nextProject = projectSyncRemovePath(
      state.project,
      filePath,
      state.projectPath !== null ? sharedDirname(state.projectPath) : null,
    );
    const nextDisplayResult = computeDisplayDoc(
      state.viewMode,
      nextActiveDoc,
      nextDocuments,
      nextPaths,
    );
    set({
      documents: nextDocuments,
      documentPaths: nextPaths,
      activeDocumentPath: nextActive,
      doc: nextActiveDoc,
      filePath: nextActive,
      // Sprint 17c T10 — displayDoc may be null when the build
      // can't run; the rest of the state changes still commit.
      displayDoc: nextDisplayResult?.doc ?? null,
      // Sprint 17c T10 — refresh warnings in combined mode.
      warnings:
        state.viewMode === 'combined' && nextDisplayResult !== null
          ? nextDisplayResult.warnings
          : state.warnings,
      // The removed doc's dirty bit is dropped; other docs' dirty state
      // is preserved.
      dirtyPaths: dropFromDirty(state.dirtyPaths, filePath),
      // v1.8.0 K Stencil Task 10 — also drop the removed path from
      // templatePaths so a removed doc's badge doesn't linger. The
      // Set re-build is cheap (typical N ≤ a handful of paths).
      templatePaths: (() => {
        if (!state.templatePaths.has(filePath)) return state.templatePaths;
        const next = new Set(state.templatePaths);
        next.delete(filePath);
        return next;
      })(),
      project: nextProject,
      validationErrors: validateProjectForRenderer(nextDocuments, {
        schemaLayer: buildSchemaLayer(get().bswmdSchemas),
      }),
      lastValidatedAt: Date.now(),
    });
  },

  setActiveDocument: (filePath) => {
    const state = get();
    if (filePath === null) {
      const nextDisplayResult = computeDisplayDoc(
        state.viewMode,
        null,
        state.documents,
        state.documentPaths,
      );
      if (nextDisplayResult === null) return;
      set({
        activeDocumentPath: null,
        doc: null,
        filePath: null,
        displayDoc: nextDisplayResult?.doc ?? null,
        // Sprint 17c T10 — refresh warnings in combined mode.
        warnings:
          state.viewMode === 'combined' && nextDisplayResult !== null
            ? nextDisplayResult.warnings
            : state.warnings,
      });
      return;
    }
    const idx = state.documentPaths.indexOf(filePath);
    if (idx === -1) return; // unknown path → no-op
    const nextDoc = state.documents[idx] ?? null;
    const nextDisplayResult = computeDisplayDoc(
      state.viewMode,
      nextDoc,
      state.documents,
      state.documentPaths,
    );
    set({
      activeDocumentPath: filePath,
      doc: nextDoc,
      filePath,
      displayDoc: nextDisplayResult?.doc ?? null,
      // Sprint 17c T10 — refresh warnings in combined mode.
      warnings:
        state.viewMode === 'combined' && nextDisplayResult !== null
          ? nextDisplayResult.warnings
          : state.warnings,
    });
  },

  setDoc: (doc, filePath) => {
    get().addDocument(doc, filePath);
  },

  select: (path) => set({ selectedPath: path }),

  updateParam: (containerPath, paramKey, value) => {
    const state = get();
    if (state.documents.length === 0) return;
    // Combined-mode routing (Sprint 13 Stage 3.5): when viewMode is
    // 'combined', the selectedPath is prefixed with the source file's
    // basename. Resolve it back to the source document via
    // resolveContainerTarget (which delegates to findByPathMultiDoc)
    // and mutate THAT document, not the active one. In 'single' mode,
    // containerPath is a regular path inside the active doc and we
    // keep the legacy route.
    if (state.viewMode === 'combined') {
      const target = resolveContainerTarget(state, containerPath);
      if (target === null) return;
      const { doc: sourceDoc, filePath: sourcePath } = target;
      const sourceIdx = state.documentPaths.indexOf(sourcePath);
      if (sourceIdx === -1) return;
      // The source's own path doesn't carry the basename prefix, so
      // we strip it for the underlying applyParamUpdate.
      const innerPath = stripCombinedPrefix(containerPath, sourcePath);
      if (innerPath === null) return;
      const nextSourceDoc = applyParamUpdate(sourceDoc, innerPath, paramKey, value);
      if (nextSourceDoc === sourceDoc) return;
      const nextDocuments = state.documents.map((d, i) => (i === sourceIdx ? nextSourceDoc : d));
      const nextActiveDoc = state.activeDocumentPath === sourcePath ? nextSourceDoc : state.doc;
      const nextDisplayResult = computeDisplayDoc(
        state.viewMode,
        nextActiveDoc,
        nextDocuments,
        state.documentPaths,
      );
      if (nextDisplayResult === null) return;
      set({
        documents: nextDocuments,
        doc: nextActiveDoc,
        displayDoc: nextDisplayResult?.doc ?? null,
        dirtyPaths: addToDirty(state.dirtyPaths, sourcePath),
        validationErrors: validateProjectForRenderer(nextDocuments, {
          schemaLayer: buildSchemaLayer(get().bswmdSchemas),
        }),
        lastValidatedAt: Date.now(),
        // Sprint 17c T10 — refresh warnings in combined mode (the
        // source-doc content changed; the dedup result may differ).
        warnings:
          state.viewMode === 'combined' && nextDisplayResult !== null
            ? nextDisplayResult.warnings
            : state.warnings,
      });
      return;
    }
    // Legacy single-mode path.
    if (state.activeDocumentPath === null || state.doc === null) return;
    const activeIdx = state.documentPaths.indexOf(state.activeDocumentPath);
    if (activeIdx === -1) return;
    const activeDoc = state.documents[activeIdx]!;
    const nextActiveDoc = applyParamUpdate(activeDoc, containerPath, paramKey, value);
    if (nextActiveDoc === activeDoc) return;
    const nextDocuments = state.documents.map((d, i) => (i === activeIdx ? nextActiveDoc : d));
    const nextDisplayResult = computeDisplayDoc(
      state.viewMode,
      nextActiveDoc,
      nextDocuments,
      state.documentPaths,
    );
    set({
      documents: nextDocuments,
      doc: nextActiveDoc,
      displayDoc: nextDisplayResult?.doc ?? null,
      dirtyPaths: addToDirty(state.dirtyPaths, state.activeDocumentPath),
      validationErrors: validateProjectForRenderer(nextDocuments, {
        schemaLayer: buildSchemaLayer(get().bswmdSchemas),
      }),
      lastValidatedAt: Date.now(),
      // Sprint 17c T10 — single-mode path. The combined-mode
      // branch above already exited with its own warnings slice;
      // this branch is reached only when viewMode is 'single',
      // so the warnings slice is preserved as-is.
    });
  },

  markSaved: (filePath) =>
    set({
      // Clear the dirty bit for the saved doc only. Other dirty docs are
      // preserved (per-path Set).
      dirtyPaths: dropFromDirty(get().dirtyPaths, filePath),
    }),

  validate: () => {
    const state = get();
    set({
      validationErrors: validateProjectForRenderer(state.documents, {
        schemaLayer: buildSchemaLayer(get().bswmdSchemas),
      }),
      lastValidatedAt: Date.now(),
    });
  },

  clear: () =>
    set({
      documents: [],
      documentPaths: [],
      activeDocumentPath: null,
      doc: null,
      filePath: null,
      displayDoc: null,
      selectedPath: null,
      dirtyPaths: new Set<string>(),
      error: null,
      // Sprint 17b T6 — toast slice; cleared alongside the legacy
      // `error` field so a fresh project doesn't reopen a stale
      // banner.
      toast: null,
      // v1.8.0 K Stencil Task 10 — templatePaths slice; cleared
      // alongside the document set so a fresh load doesn't carry
      // badges from a prior project.
      templatePaths: new Set<string>(),
      validationErrors: [],
      // Sprint 17c T10 — combined-doc warnings; cleared alongside
      // the document set so a fresh load doesn't see stale
      // dedup warnings.
      warnings: [],
      lastValidatedAt: null,
      project: null,
      projectPath: null,
      // Sprint 12 #2 — BSWMD state. clear() drops loaded schemas and
      // paths so a fresh load doesn't see stale schema-side coverage.
      bswmdSchemas: [],
      bswmdPaths: [],
      // Sprint 12 #3 Task 7 — dialog state. clear() also closes any
      // open dialogs so a fresh project doesn't re-open a stale
      // ConfirmDialog / NewProjectDialog.
      newProjectDialogOpen: false,
      confirmDialogOpen: false,
      // Sprint 15 Phase 2 — picker + cascade state. clear() also
      // closes the picker and drops any pending delete so a fresh
      // project doesn't reopen a stale CascadeConfirmDialog.
      bswmdPicker: { open: false, parentPath: null, kind: null },
      pendingDelete: null,
      // Sprint 13 Stage 3.5 — view mode reset. clear() returns to
      // 'single' so a fresh project doesn't open in combined mode by
      // accident; the user re-opens the combined view explicitly.
      viewMode: 'single',
      // Sprint 14 — clear the ImportSession slice + lastCommitSnapshot
      // so a fresh project doesn't reopen a stale import dialog or
      // accidentally offer undoLastCommit from a prior commit.
      importSession: null,
      lastCommitSnapshot: null,
      // Sprint 17 P1 — clear the BSWMD remove snapshot so a fresh
      // project doesn't accidentally offer undoLastRemoveBswmd
      // from a prior project. Single-level undo; cleared the same
      // way as lastCommitSnapshot.
      lastRemoveSnapshot: null,
      // Locale is a user preference — clear() resets docs but keeps
      // the language setting. Use setLocale() explicitly to change.
    }),
});
