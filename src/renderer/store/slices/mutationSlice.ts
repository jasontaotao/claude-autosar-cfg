// src/renderer/store/slices/mutationSlice.ts
// Sprint 15 Phase 2 — ECUC add/delete mutation actions.
// Extracted from useArxmlStore.ts in PR(5). Pure refactor — bodies
// copied verbatim, only the imports changed.

import type { StateCreator } from 'zustand';

import {
  addContainer as coreAddContainer,
  addParameter as coreAddParameter,
  addReference as coreAddReference,
  findReferencesTo,
  removeContainer as coreRemoveContainer,
  removeModuleFromDoc,
  removeParameter as coreRemoveParameter,
} from '@core/arxml/mutation.js';
import { findByPath } from '@core/arxml/path.js';
import type { ArxmlDocument } from '@core/arxml/types';
import { validateProjectForRenderer } from '@core/validation';
import { t } from '@shared/i18n';

import {
  findChildContainerDef,
  findModuleDefForPath,
  resolveModuleAndParentContainer,
  resolveParamDefForPath,
  resolveReferenceDefForPath,
} from '../helpers/bswmdLookup.js';
import {
  computeDisplayDoc,
  resolveContainerTarget,
  stripCombinedPrefix,
} from '../helpers/combinedDoc.js';
import { addToDirty } from '../helpers/dirty.js';
import {
  applyMutationResultToActive,
  applyMutationResultToSource,
  mutationErrorToI18n,
  setErrorWithKind,
} from '../helpers/mutationErrors.js';
import type { ArxmlState } from '../useArxmlStore.js';

export interface MutationSlice {
  // Sprint 15 Phase 2 — ECUC add/delete mutation actions. Each one
  // mirrors the combined-mode dispatch pattern from `updateParam`:
  //   1. In 'combined' view mode the path is basename-prefixed, so the
  //      action routes via `findByPathMultiDoc` + `stripCombinedPrefix`
  //      and mutates the SOURCE document.
  //   2. In 'single' mode the action mutates the active document.
  //   3. On Result.ok: set() with new documents + dirtyPaths + the
  //      revalidation trio (validationErrors + lastValidatedAt).
  //   4. On Result.fail: setError() with a localized message keyed by
  //      the MutationError kind.
  addContainer: (parentPath: string, shortName: string) => void;
  deleteContainer: (containerPath: string) => void;
  addParameter: (containerPath: string, paramShortName: string) => void;
  addReference: (containerPath: string, refShortName: string) => void;
  deleteParameter: (containerPath: string, paramKey: string) => void;
  confirmDeleteContainer: (choice: 'cancel' | 'only' | 'cascade') => void;
  /**
   * Sprint A+ — delete the entire ECUC module (the
   * `<ECUC-MODULE-CONFIGURATION-VALUES>` element) at the given
   * post-fold path. For source-backed docs the BSWMD link is cleared
   * in the same step so the ProjectPanel chip no longer dangles.
   * No-op + error toast when the path does not resolve to a module.
   */
  deleteEcucModule: (modulePath: string) => void;
}

export const createMutationSlice: StateCreator<ArxmlState, [], [], MutationSlice> = (set, get) => ({
  addContainer: (parentPath, shortName) => {
    const state = get();
    if (state.viewMode === 'combined') {
      // Combined-mode dispatch: route to the source document.
      const target = resolveContainerTarget(state, parentPath);
      if (target === null) {
        setErrorWithKind(set, state.locale, { kind: 'path-not-found', path: parentPath });
        return;
      }
      const { doc: sourceDoc, filePath: sourcePath } = target;
      const sourceIdx = state.documentPaths.indexOf(sourcePath);
      if (sourceIdx === -1) {
        setErrorWithKind(set, state.locale, { kind: 'path-not-found', path: parentPath });
        return;
      }
      const innerPath = stripCombinedPrefix(parentPath, sourcePath);
      if (innerPath === null) {
        setErrorWithKind(set, state.locale, { kind: 'path-not-found', path: parentPath });
        return;
      }
      const lookup = resolveModuleAndParentContainer(state.bswmdSchemas, innerPath);
      if (lookup === null) {
        set({ error: t(state.locale, 'mutation.error.no-bswmd-for-module') });
        return;
      }
      const { moduleDef, parentContainerDef } = lookup;
      // Find the child container def under the parent (or top-level if
      // parent is the module root). Returns null when the BSWMD does
      // not declare this child — surface as `no-bswmd-for-module` per
      // the spec (BSWMD is the source of truth; an undeclared child
      // is the same failure class as a missing module).
      const childDef = findChildContainerDef(moduleDef, parentContainerDef, shortName);
      if (childDef === null) {
        set({ error: t(state.locale, 'mutation.error.no-bswmd-for-module') });
        return;
      }
      const result = coreAddContainer(sourceDoc, innerPath, shortName, moduleDef, childDef);
      if (!result.ok) {
        set({ error: mutationErrorToI18n(state.locale, result.error) });
        return;
      }
      applyMutationResultToSource(set, state, sourceIdx, result.value, sourcePath);
      return;
    }
    // Single-mode dispatch — the active document.
    if (state.activeDocumentPath === null || state.doc === null) return;
    const activeIdx = state.documentPaths.indexOf(state.activeDocumentPath);
    if (activeIdx === -1) return;
    const lookup = resolveModuleAndParentContainer(state.bswmdSchemas, parentPath);
    if (lookup === null) {
      set({ error: t(state.locale, 'mutation.error.no-bswmd-for-module') });
      return;
    }
    const { moduleDef, parentContainerDef } = lookup;
    const childDef = findChildContainerDef(moduleDef, parentContainerDef, shortName);
    if (childDef === null) {
      set({ error: t(state.locale, 'mutation.error.no-bswmd-for-module') });
      return;
    }
    const result = coreAddContainer(state.doc, parentPath, shortName, moduleDef, childDef);
    if (!result.ok) {
      set({ error: mutationErrorToI18n(state.locale, result.error) });
      return;
    }
    applyMutationResultToActive(set, state, activeIdx, result.value, state.activeDocumentPath);
  },

  deleteContainer: (containerPath) => {
    const state = get();
    if (state.viewMode === 'combined') {
      // Combined-mode: resolve to the source doc.
      const target = resolveContainerTarget(state, containerPath);
      if (target === null) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const { doc: sourceDoc, filePath: sourcePath } = target;
      const sourceIdx = state.documentPaths.indexOf(sourcePath);
      if (sourceIdx === -1) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const innerPath = stripCombinedPrefix(containerPath, sourcePath);
      if (innerPath === null) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      // Reverse-reference scan over all loaded documents.
      const refBundle = state.documents.map((d, i) => ({
        doc: d,
        filePath: state.documentPaths[i] ?? '',
      }));
      const refs = findReferencesTo(refBundle, innerPath);
      if (refs.length === 0) {
        // HIGH-2: pass moduleDef so the core can enforce multiplicity-floor.
        const moduleDef = findModuleDefForPath(state.bswmdSchemas, sourceDoc.path);
        const result = coreRemoveContainer(sourceDoc, innerPath, false, moduleDef);
        if (!result.ok) {
          set({ error: mutationErrorToI18n(state.locale, result.error) });
          return;
        }
        applyMutationResultToSource(set, state, sourceIdx, result.value, sourcePath);
        return;
      }
      // Defer to the cascade dialog via pendingDelete.
      set({ pendingDelete: { path: innerPath, references: refs } });
      return;
    }
    // Single-mode.
    if (state.activeDocumentPath === null || state.doc === null) return;
    const activeIdx = state.documentPaths.indexOf(state.activeDocumentPath);
    if (activeIdx === -1) return;
    const refBundle = state.documents.map((d, i) => ({
      doc: d,
      filePath: state.documentPaths[i] ?? '',
    }));
    const refs = findReferencesTo(refBundle, containerPath);
    if (refs.length === 0) {
      // HIGH-2: pass moduleDef so the core can enforce multiplicity-floor.
      const moduleDef = findModuleDefForPath(state.bswmdSchemas, state.doc.path);
      const result = coreRemoveContainer(state.doc, containerPath, false, moduleDef);
      if (!result.ok) {
        set({ error: mutationErrorToI18n(state.locale, result.error) });
        return;
      }
      applyMutationResultToActive(set, state, activeIdx, result.value, state.activeDocumentPath);
      return;
    }
    set({ pendingDelete: { path: containerPath, references: refs } });
  },

  addParameter: (containerPath, paramShortName) => {
    const state = get();
    if (state.viewMode === 'combined') {
      const target = resolveContainerTarget(state, containerPath);
      if (target === null) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const { doc: sourceDoc, filePath: sourcePath } = target;
      const sourceIdx = state.documentPaths.indexOf(sourcePath);
      if (sourceIdx === -1) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const innerPath = stripCombinedPrefix(containerPath, sourcePath);
      if (innerPath === null) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const lookup = resolveParamDefForPath(state.bswmdSchemas, innerPath, paramShortName);
      if (lookup === null) {
        set({ error: t(state.locale, 'mutation.error.no-bswmd-for-module') });
        return;
      }
      const { moduleDef, paramDef } = lookup;
      if (paramDef === null) {
        // BSWMD does not declare this param on the parent container.
        // Spec § 7.2 maps this to the `invalid-param-type` i18n key.
        set({
          error: t(state.locale, 'mutation.error.invalid-param-type', { key: paramShortName }),
        });
        return;
      }
      const result = coreAddParameter(sourceDoc, innerPath, paramDef, moduleDef);
      if (!result.ok) {
        set({ error: mutationErrorToI18n(state.locale, result.error) });
        return;
      }
      applyMutationResultToSource(set, state, sourceIdx, result.value, sourcePath);
      return;
    }
    if (state.activeDocumentPath === null || state.doc === null) return;
    const activeIdx = state.documentPaths.indexOf(state.activeDocumentPath);
    if (activeIdx === -1) return;
    const lookup = resolveParamDefForPath(state.bswmdSchemas, containerPath, paramShortName);
    if (lookup === null) {
      set({ error: t(state.locale, 'mutation.error.no-bswmd-for-module') });
      return;
    }
    const { moduleDef, paramDef } = lookup;
    if (paramDef === null) {
      set({
        error: t(state.locale, 'mutation.error.invalid-param-type', { key: paramShortName }),
      });
      return;
    }
    const result = coreAddParameter(state.doc, containerPath, paramDef, moduleDef);
    if (!result.ok) {
      set({ error: mutationErrorToI18n(state.locale, result.error) });
      return;
    }
    applyMutationResultToActive(set, state, activeIdx, result.value, state.activeDocumentPath);
  },

  // Sprint 15 — add a reference-typed parameter. Mirrors `addParameter` but
  // looks up the BSWMD `ReferenceDef` (not `ParamDef`) and constructs a
  // `{ type: 'reference', value: '', dest }` ParamValue. The dest comes
  // from `refDef.destKind`; the user fills the value via `ReferenceEditor`
  // after the pick.
  addReference: (containerPath, refShortName) => {
    const state = get();
    if (state.viewMode === 'combined') {
      const target = resolveContainerTarget(state, containerPath);
      if (target === null) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const { doc: sourceDoc, filePath: sourcePath } = target;
      const sourceIdx = state.documentPaths.indexOf(sourcePath);
      if (sourceIdx === -1) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const innerPath = stripCombinedPrefix(containerPath, sourcePath);
      if (innerPath === null) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const lookup = resolveReferenceDefForPath(state.bswmdSchemas, innerPath, refShortName);
      if (lookup === null) {
        set({ error: t(state.locale, 'mutation.error.no-bswmd-for-module') });
        return;
      }
      const { moduleDef, refDef } = lookup;
      if (refDef === null) {
        set({
          error: t(state.locale, 'mutation.error.invalid-param-type', { key: refShortName }),
        });
        return;
      }
      const result = coreAddReference(sourceDoc, innerPath, refDef, moduleDef);
      if (!result.ok) {
        set({ error: mutationErrorToI18n(state.locale, result.error) });
        return;
      }
      applyMutationResultToSource(set, state, sourceIdx, result.value, sourcePath);
      return;
    }
    if (state.activeDocumentPath === null || state.doc === null) return;
    const activeIdx = state.documentPaths.indexOf(state.activeDocumentPath);
    if (activeIdx === -1) return;
    const lookup = resolveReferenceDefForPath(state.bswmdSchemas, containerPath, refShortName);
    if (lookup === null) {
      set({ error: t(state.locale, 'mutation.error.no-bswmd-for-module') });
      return;
    }
    const { moduleDef, refDef } = lookup;
    if (refDef === null) {
      set({
        error: t(state.locale, 'mutation.error.invalid-param-type', { key: refShortName }),
      });
      return;
    }
    const result = coreAddReference(state.doc, containerPath, refDef, moduleDef);
    if (!result.ok) {
      set({ error: mutationErrorToI18n(state.locale, result.error) });
      return;
    }
    applyMutationResultToActive(set, state, activeIdx, result.value, state.activeDocumentPath);
  },

  deleteParameter: (containerPath, paramKey) => {
    const state = get();
    if (state.viewMode === 'combined') {
      const target = resolveContainerTarget(state, containerPath);
      if (target === null) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const { doc: sourceDoc, filePath: sourcePath } = target;
      const sourceIdx = state.documentPaths.indexOf(sourcePath);
      if (sourceIdx === -1) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const innerPath = stripCombinedPrefix(containerPath, sourcePath);
      if (innerPath === null) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const result = coreRemoveParameter(sourceDoc, innerPath, paramKey);
      if (!result.ok) {
        set({ error: mutationErrorToI18n(state.locale, result.error) });
        return;
      }
      applyMutationResultToSource(set, state, sourceIdx, result.value, sourcePath);
      return;
    }
    if (state.activeDocumentPath === null || state.doc === null) return;
    const activeIdx = state.documentPaths.indexOf(state.activeDocumentPath);
    if (activeIdx === -1) return;
    const result = coreRemoveParameter(state.doc, containerPath, paramKey);
    if (!result.ok) {
      set({ error: mutationErrorToI18n(state.locale, result.error) });
      return;
    }
    applyMutationResultToActive(set, state, activeIdx, result.value, state.activeDocumentPath);
  },

  // Sprint 15 Phase 2 — consume `pendingDelete` and dispatch the
  // actual remove. `cancel` is a no-op (just clears the flag);
  // `only` runs `removeContainer` without touching references;
  // `cascade` also iterates the pending references and removes
  // each one with `removeParameter`.
  confirmDeleteContainer: (choice) => {
    const state = get();
    const pending = state.pendingDelete;
    if (pending === null) return;

    if (choice === 'cancel') {
      set({ pendingDelete: null });
      return;
    }

    // Find the doc that contains the target. The cascade scan above
    // stored the inner path (single-mode) or the inner path from
    // the combined-mode dispatch. We rebuild the document resolution
    // here: try the active doc first, fall back to combined-mode
    // resolution. This keeps the action's contract simple — the
    // pending path is always an inner path (already stripped of the
    // combined prefix by `deleteContainer`).
    const activeDoc = state.doc;
    if (activeDoc === null || state.activeDocumentPath === null) {
      set({ pendingDelete: null });
      return;
    }
    const activeIdx = state.documentPaths.indexOf(state.activeDocumentPath);
    if (activeIdx === -1) {
      set({ pendingDelete: null });
      return;
    }

    let workingDoc: ArxmlDocument = activeDoc;
    let workingIdx: number = activeIdx;
    let workingPath: string = state.activeDocumentPath;

    // Combined-mode: the target path may live in a different file.
    if (state.viewMode === 'combined') {
      const target = resolveContainerTarget(state, pending.path);
      if (target !== null) {
        const inner = stripCombinedPrefix(pending.path, target.filePath);
        if (inner !== null) {
          workingDoc = target.doc;
          workingIdx = state.documentPaths.indexOf(target.filePath);
          workingPath = target.filePath;
        }
      }
    } else {
      // Single-mode: pending.path IS the inner path on the active doc.
      // No rewriting needed.
    }

    // 1. Remove the container. Pass `moduleDef` so the core can
    //    enforce the BSWMD multiplicity-floor (HIGH-2).
    const moduleDef = findModuleDefForPath(state.bswmdSchemas, workingPath);
    const result = coreRemoveContainer(workingDoc, pending.path, false, moduleDef);
    if (!result.ok) {
      set({
        error: mutationErrorToI18n(state.locale, result.error),
        pendingDelete: null,
      });
      return;
    }
    workingDoc = result.value;

    // 2. Cascade: for each reference hit, apply removeParameter on the
    //    doc that owns the reference. We track per-file doc mutations
    //    in `docEdits` so the final commit covers all modified files
    //    (HIGH-3 — the previous version silently dropped refs on other
    //    files, leaving dangling references the user was promised
    //    would be cleaned up).
    const docEdits = new Map<number, ArxmlDocument>();
    docEdits.set(workingIdx, workingDoc);
    if (choice === 'cascade') {
      for (const ref of pending.references) {
        const refDocIdx = state.documentPaths.indexOf(ref.filePath);
        if (refDocIdx === -1) continue;
        // Use the latest in-progress edit if we have already touched
        // this doc, otherwise pull the current document.
        const refDoc = docEdits.get(refDocIdx) ?? state.documents[refDocIdx];
        if (refDoc === undefined) continue;
        const r2 = coreRemoveParameter(refDoc, ref.containerPath, ref.paramKey);
        if (r2.ok) {
          docEdits.set(refDocIdx, r2.value);
        }
        // If `r2` failed (e.g. the ref was already gone) we silently
        // skip — the user's intent is satisfied either way.
      }
    }

    // 3. Commit: rebuild `documents` from the per-file edits, mark
    //    every modified file as dirty, re-validate.
    let nextDirty = state.dirtyPaths;
    for (const [idx, edited] of docEdits.entries()) {
      if (idx < 0 || idx >= state.documents.length) continue;
      if (state.documents[idx] !== edited) {
        const filePath = state.documentPaths[idx];
        if (filePath !== undefined) {
          nextDirty = addToDirty(nextDirty, filePath);
        }
      }
    }
    const nextDocuments = state.documents.map((d, i) => docEdits.get(i) ?? d);
    const nextActiveDoc =
      state.activeDocumentPath === workingPath
        ? (docEdits.get(workingIdx) ?? workingDoc)
        : state.doc;
    const nextDisplayResult = computeDisplayDoc(
      state.viewMode,
      nextActiveDoc,
      nextDocuments,
      state.documentPaths,
      get().bswmdSchemas,
    );
    set({
      documents: nextDocuments,
      doc: nextActiveDoc,
      displayDoc: nextDisplayResult?.doc ?? null,
      dirtyPaths: nextDirty,
      pendingDelete: null,
      validationErrors: validateProjectForRenderer(nextDocuments),
      lastValidatedAt: Date.now(),
      // Sprint 17c T10 — refresh warnings in combined mode.
      warnings:
        state.viewMode === 'combined' && nextDisplayResult !== null
          ? nextDisplayResult.warnings
          : state.warnings,
    });
  },

  // Sprint A+ — delete the ECUC module at `modulePath` from the active
  // document. The BSWMD link is cleared in the same step when the
  // document was generated from a skeleton (otherwise the
  // `sourceBswmdPath` dangles and the ProjectPanel chip reports a
  // stale count). A localized toast is emitted on both success and
  // not-found; the not-found path is a no-op (the doc reference is
  // preserved) per the reference-equality convention in the rest of
  // the mutation surface.
  //
  // Combined-mode note: the tree's module-root right-click fires on
  // the post-fold display path. We resolve via `state.doc` (the
  // source) because `displayDoc` is the combined view; the spec
  // doesn't require combined-mode special handling for v1.10.1
  // (consistent with `updateParam`).
  deleteEcucModule: (modulePath) => {
    const state = get();
    if (state.doc === null) return;
    const moduleEl = findByPath(state.doc, modulePath);
    if (moduleEl === null || moduleEl.element.kind !== 'module') {
      get().setError(
        t(state.locale, 'mutation.error.module-not-found', { path: modulePath }),
      );
      return;
    }
    const wasSourceBacked = state.doc.sourceBswmdPath !== undefined;
    const moduleShortName = moduleEl.element.shortName;
    const nextDoc = removeModuleFromDoc(state.doc, modulePath);
    // No-op guard — `removeModuleFromDoc` preserves the same doc
    // reference when the target is already gone. Only commit a
    // mutation + toast when the call actually changed the doc.
    if (nextDoc === state.doc) {
      get().setError(
        t(state.locale, 'mutation.error.module-not-found', { path: modulePath }),
      );
      return;
    }
    // Clear the BSWMD link when the doc was source-backed so the
    // ProjectPanel chip doesn't dangle ("0 modules covered by BSWMD"
    // with no module). The guard keeps the side effect aligned with
    // spec invariant I2 ("For source-backed modules, the link is
    // cleared on deletion").
    //
    // `exactOptionalPropertyTypes` rejects `sourceBswmdPath:
    // undefined` on the spread (the declared type is `?: string`,
    // not `?: string | undefined`); delete the key instead so the
    // doc shape is the canonical "no source" form without forcing
    // `undefined` into the field.
    const nextDocWithoutSource: ArxmlDocument = { ...nextDoc };
    if (wasSourceBacked) {
      delete (nextDocWithoutSource as { sourceBswmdPath?: string }).sourceBswmdPath;
    }
    // Mirror the mutation into the `documents` array so the source-
    // of-truth is consistent with the back-compat `doc` alias. For
    // single-mode the active doc IS the document in the array, so we
    // patch the matching slot. For combined-mode the active doc may
    // be a different file from the source we're mutating — but the
    // spec doesn't require combined-mode handling for v1.10.1, so we
    // always patch the active doc's slot.
    const activeIdx =
      state.activeDocumentPath !== null
        ? state.documentPaths.indexOf(state.activeDocumentPath)
        : -1;
    const nextDocuments =
      activeIdx >= 0
        ? state.documents.map((d, i) => (i === activeIdx ? nextDocWithoutSource : d))
        : state.documents;
    // Track dirty state via `dirtyPaths` (the Set) rather than the
    // function-getter `isDirty` — the same convention as the other
    // mutation actions. Only mark dirty if the active doc was
    // actually mutated (activeIdx >= 0).
    const nextDirtyPaths =
      activeIdx >= 0 ? addToDirty(state.dirtyPaths, state.activeDocumentPath!) : state.dirtyPaths;
    // Rebuild `displayDoc` after the mutation so the combined view
    // reflects the removed module. Re-run validation so the panel
    // doesn't show stale errors referencing the deleted path.
    // Mirrors the post-mutation block of `applyMutationResultToActive`.
    const nextDisplayResult = computeDisplayDoc(
      state.viewMode,
      nextDocWithoutSource,
      nextDocuments,
      state.documentPaths,
    );
    const nextDisplayDoc =
      nextDisplayResult !== null ? nextDisplayResult.doc : state.displayDoc;
    const nextWarnings =
      state.viewMode === 'combined' && nextDisplayResult !== null
        ? nextDisplayResult.warnings
        : state.warnings;
    set({
      documents: nextDocuments,
      doc: nextDocWithoutSource,
      displayDoc: nextDisplayDoc,
      dirtyPaths: nextDirtyPaths,
      validationErrors: validateProjectForRenderer(nextDocuments),
      lastValidatedAt: Date.now(),
      warnings: nextWarnings,
    });
    get().setInfo(
      t(
        state.locale,
        wasSourceBacked
          ? 'mutation.info.ecucModuleUnlinked'
          : 'mutation.info.ecucModuleDeleted',
        { name: moduleShortName },
      ),
    );
  },
});
