// src/renderer/store/slices/mutationSlice.ts
// Sprint 15 Phase 2 — ECUC add/delete mutation actions.
// Extracted from useArxmlStore.ts in PR(5). Pure refactor — bodies
// copied verbatim, only the imports changed.

import type { StateCreator } from 'zustand';

import {
  addContainer as coreAddContainer,
  addParameter as coreAddParameter,
  addReference as coreAddReference,
  coreBulkRemove,
  findReferencesTo,
  removeContainer as coreRemoveContainer,
  removeModuleFromDoc,
  removeParameter as coreRemoveParameter,
} from '@core/arxml/mutation.js';
import { findByPath } from '@core/arxml/path.js';
import type { ArxmlContainer, ArxmlDocument, ArxmlElement } from '@core/arxml/types';
import { validateProjectForRenderer } from '@core/validation';
import { t } from '@shared/i18n/index.js';

import { compareSuffix, stripSuffix } from '../../components/tree/collections.js';
import type { resolveParamDefForPath, resolveReferenceDefForPath } from '../helpers/bswmdLookup.js';
import {
  findChildContainerDef,
  findModuleDefForPath,
  resolveContainerDefinitionContext,
  resolveModuleAndParentContainer,
} from '../helpers/bswmdLookup.js';
import {
  computeDisplayDoc,
  resolveContainerTarget,
  stripCombinedPrefix,
} from '../helpers/combinedDoc.js';
import { addToDirty } from '../helpers/dirty.js';
import {
  applyModuleDeleteToActive,
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
  duplicateContainer: (parentPath: string, baseShortName: string) => void;
  sortSiblings: (parentPath: string) => void;
  bulkDelete: (parentPath: string, baseShortName: string) => void;
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
      const lookup = resolveSchemaContextForMutation(sourceDoc, innerPath, state.bswmdSchemas);
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
    const lookup = resolveSchemaContextForMutation(state.doc, parentPath, state.bswmdSchemas);
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

  duplicateContainer: (parentPath, baseShortName) => {
    mutateParentChildren(set, get(), parentPath, (doc, innerPath, parent) => {
      const siblings = matchingContainers(parent.children, baseShortName).sort((a, b) =>
        compareSuffix(a.shortName, b.shortName),
      );
      const source = siblings.at(-1);
      if (source === undefined) return doc;
      const lookup = resolveSchemaContextForMutation(doc, innerPath, get().bswmdSchemas);
      if (lookup === null) return doc;
      const childDef = findChildContainerDef(
        lookup.moduleDef,
        lookup.parentContainerDef,
        baseShortName,
      );
      if (childDef === null) return doc;
      const added = coreAddContainer(doc, innerPath, baseShortName, lookup.moduleDef, childDef);
      if (!added.ok) return doc;
      return replaceLastMatchingParams(added.value, innerPath, baseShortName, source.params);
    });
  },

  sortSiblings: (parentPath) => {
    mutateParentChildren(set, get(), parentPath, (doc, innerPath, parent) =>
      replaceParentChildren(
        doc,
        innerPath,
        [...parent.children].sort((a, b) => compareSuffix(shortNameOf(a), shortNameOf(b))),
      ),
    );
  },

  bulkDelete: (parentPath, baseShortName) => {
    const state = get();
    const moduleDef = findModuleDefForPath(state.bswmdSchemas, parentPath);
    // Resolve the parent + matched siblings once BEFORE entering the
    // mutation-pipeline helper. `coreBulkRemove` needs the resolved
    // shortName list for both the multiplicity-floor pre-check AND
    // the error-surfacing branch — the `mutateParentChildren` callback
    // shape (where the old reducer lived) cannot reach an
    // `applyMutationResult*` helper nor surface a `setErrorWithKind`
    // error envelope, so we resolve here and commit the result
    // ourselves.
    const target = resolveContainerTarget(state, parentPath);
    const sourceDoc = target === null ? state.doc : target.doc;
    const resolvedParentPath = ((): string | null => {
      if (state.viewMode === 'combined') {
        if (target === null) return null;
        return stripCombinedPrefix(parentPath, target.filePath);
      }
      return parentPath;
    })();
    if (sourceDoc === null || resolvedParentPath === null) return;
    const located = findByPath(sourceDoc, resolvedParentPath);
    if (located === null || located.element.kind !== 'container') return;
    const matched = matchingContainers(located.element.children, baseShortName);
    // Empty-match is a no-op. Returning early (instead of dispatching
    // through `coreBulkRemove` with an empty list) avoids the
    // `applyMutationResult*` reference-equality short-circuit and keeps
    // the call site free of unnecessary store churn.
    if (matched.length === 0) return;
    const childShortNames = matched.map((child) => child.shortName);
    const result = coreBulkRemove(sourceDoc, resolvedParentPath, childShortNames, moduleDef);
    if (!result.ok) {
      // P2 reviewer finding — the previous reducer swallowed per-call
      // failures via `removed.ok ? removed.value : working`. We now
      // surface the envelope error to the UI via the existing
      // mutation-error helper so the user sees a localized toast.
      setErrorWithKind(set, state.locale, result.error);
      return;
    }
    // All-or-nothing atomicity: `coreBulkRemove` returns the
    // post-removal doc when every shortName was successfully dropped
    // (its pre-validation guarantees no floor violation can fire
    // mid-sequence). When the batch removes zero siblings (caller
    // passed `[]`), the doc is the input by reference and we skip the
    // commit.
    if (result.value.doc === sourceDoc) return;
    if (state.viewMode === 'combined' && target !== null) {
      const sourceIdx = state.documentPaths.indexOf(target.filePath);
      if (sourceIdx === -1) return;
      applyMutationResultToSource(set, state, sourceIdx, result.value.doc, target.filePath);
      return;
    }
    // Single-mode dispatch.
    if (state.activeDocumentPath === null) return;
    const activeIdx = state.documentPaths.indexOf(state.activeDocumentPath);
    if (activeIdx === -1) return;
    applyMutationResultToActive(set, state, activeIdx, result.value.doc, state.activeDocumentPath);
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
      const lookup = resolveParamContextForMutation(
        sourceDoc,
        innerPath,
        state.bswmdSchemas,
        paramShortName,
      );
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
    const lookup = resolveParamContextForMutation(
      state.doc,
      containerPath,
      state.bswmdSchemas,
      paramShortName,
    );
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
      const lookup = resolveReferenceContextForMutation(
        sourceDoc,
        innerPath,
        state.bswmdSchemas,
        refShortName,
      );
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
    const lookup = resolveReferenceContextForMutation(
      state.doc,
      containerPath,
      state.bswmdSchemas,
      refShortName,
    );
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
    // HIGH-4 (v1.11.2) — track per-ref failures so we can surface them
    // as a warning toast. The cascade contract promises every reference
    // gets cleaned up; silently skipping an unresolvable one is a
    // contract violation that left dangling references invisible to
    // the user. We still apply the deletes we can — the primary
    // container delete is not rolled back — but the count surfaces.
    const failedRefs: {
      readonly filePath: string;
      readonly containerPath: string;
      readonly paramKey: string;
    }[] = [];
    if (choice === 'cascade') {
      for (const ref of pending.references) {
        const refDocIdx = state.documentPaths.indexOf(ref.filePath);
        if (refDocIdx === -1) {
          failedRefs.push(ref);
          continue;
        }
        // Use the latest in-progress edit if we have already touched
        // this doc, otherwise pull the current document.
        const refDoc = docEdits.get(refDocIdx) ?? state.documents[refDocIdx];
        if (refDoc === undefined) {
          failedRefs.push(ref);
          continue;
        }
        const r2 = coreRemoveParameter(refDoc, ref.containerPath, ref.paramKey);
        if (r2.ok) {
          docEdits.set(refDocIdx, r2.value);
        } else {
          failedRefs.push(ref);
        }
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

    // HIGH-4 (v1.11.2) — surface cascade partial-failure count. Called
    // after the main set() so the validation trio is already in
    // place. We set the typed `toast` slot directly instead of going
    // through `setWarning` because the latter writes BOTH the
    // legacy `error` field AND the typed `toast` slot — the
    // cascade partial-failure is NOT an error in the cascade
    // contract sense (the primary delete succeeded for the
    // resolvable refs; only some refs were unresolvable), so
    // clobbering `error` would also stomp any unrelated prior
    // error a previous mutation may have left in the store. The
    // typed `toast` slot is the canonical surface for non-error
    // diagnostic notifications per the uiSlice comment block.
    if (failedRefs.length > 0) {
      const message = t(state.locale, 'mutation.warning.cascadePartial', {
        count: failedRefs.length,
      });
      set({
        toast: { kind: 'warning', message, autoDismissMs: 5000 },
      });
    }
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
      get().setError(t(state.locale, 'mutation.error.module-not-found', { path: modulePath }));
      return;
    }
    const wasSourceBacked = state.doc.sourceBswmdPath !== undefined;
    const moduleShortName = moduleEl.element.shortName;
    const nextDoc = removeModuleFromDoc(state.doc, modulePath);
    // No-op guard — `removeModuleFromDoc` preserves the same doc
    // reference when the target is already gone. Only commit a
    // mutation + toast when the call actually changed the doc.
    if (nextDoc === state.doc) {
      get().setError(t(state.locale, 'mutation.error.module-not-found', { path: modulePath }));
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
    // always patch the active doc's slot. If the active path isn't in
    // documentPaths (e.g. a stale activeDocumentPath after a removed
    // doc), activeIdx is -1 and the helper's `state.documents.map(...)`
    // becomes a no-op — preserving the pre-refactor behaviour where the
    // displayDoc/validationErrors/warnings refresh still runs and the
    // success toast still fires.
    const activeIdx =
      state.activeDocumentPath !== null
        ? state.documentPaths.indexOf(state.activeDocumentPath)
        : -1;
    // Delegate the post-mutation pipeline (rebuild displayDoc +
    // revalidate + lastValidatedAt + dirtyPaths + warnings) to the
    // shared helper so `state.bswmdSchemas` is threaded in one place
    // — v1.9.0 HIGH #1 (vendor-fold regression) and the DRY class
    // that re-introduced it in v1.10.2 (inline copy dropped the 5th
    // arg) cannot recur here.
    applyModuleDeleteToActive(
      set,
      state,
      activeIdx,
      nextDocWithoutSource,
      state.activeDocumentPath,
    );
    get().setInfo(
      t(
        state.locale,
        wasSourceBacked ? 'mutation.info.ecucModuleUnlinked' : 'mutation.info.ecucModuleDeleted',
        { name: moduleShortName },
      ),
    );
  },
});

type SliceSet = Parameters<StateCreator<ArxmlState, [], [], MutationSlice>>[0];

function mutateParentChildren(
  set: SliceSet,
  state: ArxmlState,
  parentPath: string,
  mutate: (doc: ArxmlDocument, innerPath: string, parent: ArxmlContainer) => ArxmlDocument,
): void {
  const target =
    state.viewMode === 'combined'
      ? resolveContainerTarget(state, parentPath)
      : state.doc === null || state.activeDocumentPath === null
        ? null
        : { doc: state.doc, filePath: state.activeDocumentPath };
  if (target === null) return;
  const index = state.documentPaths.indexOf(target.filePath);
  if (index === -1) return;
  const innerPath =
    state.viewMode === 'combined' ? stripCombinedPrefix(parentPath, target.filePath) : parentPath;
  if (innerPath === null) return;
  const located = findByPath(target.doc, innerPath);
  if (located === null || located.element.kind !== 'container') return;
  const nextDoc = mutate(target.doc, innerPath, located.element);
  if (nextDoc === target.doc) return;
  if (state.viewMode === 'combined') {
    applyMutationResultToSource(set, state, index, nextDoc, target.filePath);
  } else {
    applyMutationResultToActive(set, state, index, nextDoc, target.filePath);
  }
}

function matchingContainers(
  children: readonly ArxmlElement[],
  baseShortName: string,
): ArxmlContainer[] {
  return children.filter(
    (child): child is ArxmlContainer =>
      child.kind === 'container' && stripSuffix(child.shortName) === baseShortName,
  );
}

function shortNameOf(element: ArxmlElement): string {
  if (element.kind === 'reference') return element.shortName ?? element.value;
  if (element.kind === 'unknown') return element.tagName;
  return element.shortName;
}

function replaceParentChildren(
  doc: ArxmlDocument,
  parentPath: string,
  children: readonly ArxmlElement[],
): ArxmlDocument {
  const located = findByPath(doc, parentPath);
  if (located === null || located.element.kind !== 'container') return doc;
  return replaceElement(doc, located.element, { ...located.element, children: [...children] });
}

function replaceLastMatchingParams(
  doc: ArxmlDocument,
  parentPath: string,
  baseShortName: string,
  params: ArxmlContainer['params'],
): ArxmlDocument {
  const located = findByPath(doc, parentPath);
  if (located === null || located.element.kind !== 'container') return doc;
  const added = matchingContainers(located.element.children, baseShortName).at(-1);
  if (added === undefined) return doc;
  return replaceParentChildren(
    doc,
    parentPath,
    located.element.children.map((child) =>
      child === added ? { ...added, params: { ...params } } : child,
    ),
  );
}

function replaceElement(
  doc: ArxmlDocument,
  target: ArxmlElement,
  replacement: ArxmlElement,
): ArxmlDocument {
  const replaceChildren = (children: readonly ArxmlElement[]): ArxmlElement[] =>
    children.map((child) => {
      if (child === target) return replacement;
      if (child.kind !== 'module' && child.kind !== 'container') return child;
      const nextChildren = replaceChildren(child.children);
      return nextChildren.some((nested, index) => nested !== child.children[index])
        ? { ...child, children: nextChildren }
        : child;
    });
  return {
    ...doc,
    packages: doc.packages.map((pkg) => ({ ...pkg, elements: replaceChildren(pkg.elements) })),
  };
}
function resolveSchemaContextForMutation(
  doc: ArxmlDocument | null,
  containerPath: string,
  schemas: Parameters<typeof resolveContainerDefinitionContext>[0],
): ReturnType<typeof resolveModuleAndParentContainer> {
  const located = doc === null ? null : findByPath(doc, containerPath);
  if (located?.element.kind === 'container') {
    const byDefinition = resolveContainerDefinitionContext(
      schemas,
      containerPath,
      located.element.definitionRef,
    );
    if (byDefinition !== null) return byDefinition;
  }
  return resolveModuleAndParentContainer(schemas, containerPath);
}

function resolveParamContextForMutation(
  doc: ArxmlDocument | null,
  containerPath: string,
  schemas: Parameters<typeof resolveContainerDefinitionContext>[0],
  paramShortName: string,
): ReturnType<typeof resolveParamDefForPath> {
  const context = resolveSchemaContextForMutation(doc, containerPath, schemas);
  if (context === null) return null;
  const paramDef =
    context.parentContainerDef === null
      ? null
      : (context.parentContainerDef.parameters.find((p) => p.shortName === paramShortName) ?? null);
  return { moduleDef: context.moduleDef, paramDef };
}

function resolveReferenceContextForMutation(
  doc: ArxmlDocument | null,
  containerPath: string,
  schemas: Parameters<typeof resolveContainerDefinitionContext>[0],
  refShortName: string,
): ReturnType<typeof resolveReferenceDefForPath> {
  const context = resolveSchemaContextForMutation(doc, containerPath, schemas);
  if (context === null) return null;
  const refDef =
    context.parentContainerDef === null
      ? null
      : (context.parentContainerDef.references.find((r) => r.shortName === refShortName) ?? null);
  return { moduleDef: context.moduleDef, refDef };
}
