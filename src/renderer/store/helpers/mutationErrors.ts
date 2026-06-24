// src/renderer/store/helpers/mutationErrors.ts
// Mutation error/result helpers used by addContainer / deleteContainer /
// addParameter / addReference / deleteParameter / confirmDeleteContainer.
// Pure — no store closure. Extracted from useArxmlStore.ts in PR(5).

import type { MutationError } from '@core/arxml/mutation.js';
import type { ArxmlDocument } from '@core/arxml/types';
import { validateProjectForRenderer } from '@core/validation';
import { t } from '@shared/i18n';
import type { Locale } from '@shared/i18n';

import type { ArxmlState } from '../useArxmlStore.js';

import { computeDisplayDoc } from './combinedDoc.js';
import type { CombinedDocumentWarning } from './combinedDoc.js';
import { addToDirty } from './dirty.js';

/**
 * Translate a `MutationError` into a localized message via the i18n
 * bundle. The 6 kinds map 1:1 onto the `mutation.error.<kind>` keys
 * (see `i18n.ts` § Sprint 15). The function is pure and synchronous
 * — callers always feed it the current `locale` from the store
 * state so the message reflects the user's chosen language.
 */
export function mutationErrorToI18n(locale: Locale, error: MutationError): string {
  switch (error.kind) {
    case 'path-not-found':
      return t(locale, 'mutation.error.path-not-found');
    case 'name-conflict':
      return t(locale, 'mutation.error.name-conflict', { shortName: error.shortName });
    case 'multiplicity-exceeded':
      return t(locale, 'mutation.error.multiplicity-exceeded', {
        current: error.current,
        max: error.upper,
      });
    case 'multiplicity-floor':
      return t(locale, 'mutation.error.multiplicity-floor', {
        current: error.current,
        min: error.lower,
      });
    case 'no-bswmd-for-module':
      return t(locale, 'mutation.error.no-bswmd-for-module');
    case 'invalid-param-type':
      return t(locale, 'mutation.error.invalid-param-type', { key: error.key });
  }
}

/**
 * Localised error-set helper used by the addContainer / addParameter /
 * deleteContainer actions. Centralised here so the action bodies
 * stay focused on the path-resolution / core-call flow.
 */
export function setErrorWithKind(
  set: (partial: Partial<ArxmlState>) => void,
  locale: Locale,
  error: MutationError,
): void {
  set({ error: mutationErrorToI18n(locale, error) });
}

/**
 * Apply a successful mutation result to a SOURCE document in combined
 * mode. The source may or may not be the active document; the
 * `displayDoc` is rebuilt accordingly and the source path is marked
 * dirty. This is the combined-mode equivalent of
 * `applyMutationResultToActive` and shares the same reference-
 * equality short-circuit semantics.
 */
export function applyMutationResultToSource(
  set: (partial: Partial<ArxmlState>) => void,
  state: ArxmlState,
  sourceIdx: number,
  nextSourceDoc: ArxmlDocument,
  sourceFilePath: string,
): void {
  if (state.documents[sourceIdx] === nextSourceDoc) return;
  const nextDocuments = state.documents.map((d, i) => (i === sourceIdx ? nextSourceDoc : d));
  const nextActiveDoc = state.activeDocumentPath === sourceFilePath ? nextSourceDoc : state.doc;
  // v1.9.0 Sprint X (HIGH #1) — thread `state.bswmdSchemas` to
  // computeDisplayDoc so the post-mutation fold uses the same BSWMD
  // whitelist as pre-mutation. Without this, the fold falls back to
  // the heuristic prefix-only path and the displayDoc shape drifts
  // (e.g. a 3-layer vendor prefix that should fold to one shortName
  // leaves an intermediate wrapper behind) — forcing a Tree re-render
  // and visually showing the user a layout different from the one
  // they were editing.
  const nextDisplayResult = computeDisplayDoc(
    state.viewMode,
    nextActiveDoc,
    nextDocuments,
    state.documentPaths,
    state.bswmdSchemas,
  );
  if (nextDisplayResult === null) return;
  const nextWarnings: readonly CombinedDocumentWarning[] =
    state.viewMode === 'combined' && nextDisplayResult !== null
      ? nextDisplayResult.warnings
      : state.warnings;
  set({
    documents: nextDocuments,
    doc: nextActiveDoc,
    displayDoc: nextDisplayResult?.doc ?? null,
    dirtyPaths: addToDirty(state.dirtyPaths, sourceFilePath),
    validationErrors: validateProjectForRenderer(nextDocuments),
    lastValidatedAt: Date.now(),
    // Sprint 17c T10 — refresh warnings in combined mode.
    warnings: nextWarnings,
  });
}

/**
 * Apply a successful mutation result to the ACTIVE document in
 * single mode. Mirrors the post-mutation block of `updateParam`:
 * update the documents array, derive the back-compat `doc` alias,
 * recompute `displayDoc`, mark the active path dirty, and re-run
 * validation.
 */
export function applyMutationResultToActive(
  set: (partial: Partial<ArxmlState>) => void,
  state: ArxmlState,
  activeIdx: number,
  nextActiveDoc: ArxmlDocument,
  activeFilePath: string | null,
): void {
  if (state.documents[activeIdx] === nextActiveDoc) return;
  const nextDocuments = state.documents.map((d, i) => (i === activeIdx ? nextActiveDoc : d));
  // v1.9.0 Sprint X (HIGH #1) — see the matching block in
  // `applyMutationResultToSource`. Threading bswmdSchemas keeps the
  // post-mutation vendor fold shape stable.
  const nextDisplayResult = computeDisplayDoc(
    state.viewMode,
    nextActiveDoc,
    nextDocuments,
    state.documentPaths,
    state.bswmdSchemas,
  );
  if (nextDisplayResult === null) return;
  const nextWarnings: readonly CombinedDocumentWarning[] =
    state.viewMode === 'combined' && nextDisplayResult !== null
      ? nextDisplayResult.warnings
      : state.warnings;
  set({
    documents: nextDocuments,
    doc: nextActiveDoc,
    displayDoc: nextDisplayResult?.doc ?? null,
    // v1.11.0 — `activeFilePath` is nullable for delete-style mutations
    // whose active doc may not be in the documents array (e.g. stale
    // activeDocumentPath after a removed doc). The pre-refactor inline
    // code skipped addToDirty in that case to avoid polluting
    // `dirtyPaths` with a phantom path; we preserve that contract.
    dirtyPaths:
      activeFilePath === null ? state.dirtyPaths : addToDirty(state.dirtyPaths, activeFilePath),
    validationErrors: validateProjectForRenderer(nextDocuments),
    lastValidatedAt: Date.now(),
    // Sprint 17c T10 — refresh warnings in combined mode.
    warnings: nextWarnings,
  });
}

/**
 * Apply a successful module deletion to the ACTIVE document. The post-
 * mutation pipeline is identical to `applyMutationResultToActive` (the
 * `nextActiveDoc` is the source-of-truth after `removeModuleFromDoc`),
 * so we delegate to the shared helper to keep the bswmdSchemas threading
 * in one place. Without this delegation `deleteEcucModule` would have
 * to inline the post-mutation block, and the next refactor that touches
 * the vendor-fold wiring (e.g. another v1.9.0-style fix) would need to
 * patch two call sites — the same DRY violation that re-introduced
 * v1.9.0 HIGH #1 in v1.10.2 (the inline copy dropped the 5th arg).
 */
export function applyModuleDeleteToActive(
  set: (partial: Partial<ArxmlState>) => void,
  state: ArxmlState,
  activeIdx: number,
  nextActiveDoc: ArxmlDocument,
  activeFilePath: string | null,
): void {
  applyMutationResultToActive(set, state, activeIdx, nextActiveDoc, activeFilePath);
}
