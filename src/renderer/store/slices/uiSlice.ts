// src/renderer/store/slices/uiSlice.ts
// UI-only state slice: leftTab, viewMode, displayDoc, dialog visibility,
// picker + pendingDelete state, warnings, typed toast + legacy error
// setters. Extracted from useArxmlStore.ts in PR(5). Pure refactor.

import type { StateCreator } from 'zustand';

import type { ReferenceHit } from '@core/arxml/mutation.js';
import type { ArxmlDocument } from '@core/arxml/types';
import { t } from '@shared/i18n';

import type { CombinedDocumentWarning } from '../helpers/combinedDoc.js';
import { computeDisplayDoc } from '../helpers/combinedDoc.js';
import type { ArxmlState, LeftTabId, ToastKind, ToastState } from '../useArxmlStore.js';

export interface UiSlice {
  // Sprint 17b T6 — typed toast envelope. Both fields default to
  // null; every setter keeps them in sync so the legacy `error`
  // selectors (AppHeader, ErrorBanner, etc.) and the new typed
  // `toast` readers see the same UI state.
  readonly error: string | null;
  readonly toast: ToastState | null;

  // Sprint 13 refactor — left-column active tab. Default 'files' (see
  // LeftTabId JSDoc). `setLeftTab` is the only mutator; LeftPanel reads
  // this and renders one of the three tab contents.
  readonly leftTab: LeftTabId;
  setLeftTab: (tab: LeftTabId) => void;

  // Sprint 13 Stage 3.5 — Combined Tree View. `viewMode` switches
  // between the legacy single-doc Tree and the synthesised multi-doc
  // view. `displayDoc` is the derived field Tree reads: in single mode
  // it equals `doc`; in combined mode it is a virtual ArxmlDocument
  // whose top-level packages are per-file basenames and whose child
  // paths are prefixed with the source file's basename. `setViewMode`
  // resets `selectedPath` so a stale single-mode path doesn't leak
  // into the combined view (and vice versa).
  // Sprint 14 widens `viewMode` to a 3-state machine so the Import
  // Merged View can sit alongside the Combined View. The setter
  // signature widens too; the Phase 1+2 commit imports still
  // satisfy the original 'single' | 'combined' shape via the
  // broader union.
  readonly viewMode: 'single' | 'combined' | 'import-merged';
  readonly displayDoc: ArxmlDocument | null;
  setViewMode: (mode: 'single' | 'combined' | 'import-merged') => void;

  // Sprint 17c T10 — build warnings surfaced from the combined
  // document synthesis. `buildCombinedDocument` now deduplicates root
  // packages across documents and emits a warning per duplicate-root
  // conflict (see `CombinedDocumentWarning` below). The store
  // owns the slice so a status-bar component (UI hook in a
  // follow-up) can subscribe to it without re-deriving from the
  // displayDoc shape. `clearWarnings` resets the slice — called by
  // `clear()` and any mutator that rebuilds the combined doc from
  // a fresh document set.
  readonly warnings: readonly CombinedDocumentWarning[];
  clearWarnings: () => void;

  // Sprint 12 #3 Task 7 — top-level dialog state. The store owns these
  // flags (not local component state) so the `useProjectActions` hook
  // (Task 5) can open/close dialogs from IPC error paths and so the
  // NewProjectDialog / ConfirmDialog roots mounted in `App.tsx` (Task 8)
  // react to the same flag the action mutator flipped.
  //
  // `isDirty` is exposed as a **function on the state** rather than a
  // cached field: it computes `dirtyPaths.size > 0` lazily, so it
  // cannot drift out of sync with the underlying Set. Callers either
  // invoke it directly (`getState().isDirty()`) or via a selector
  // (`useArxmlStore((s) => s.isDirty())`).
  readonly isDirty: () => boolean;
  readonly newProjectDialogOpen: boolean;
  readonly confirmDialogOpen: boolean;
  setNewProjectDialogOpen: (open: boolean) => void;
  setConfirmDialogOpen: (open: boolean) => void;

  // Sprint 15 Phase 2 — BSWMD-driven add-element picker + cascade
  // confirm dialog state. The picker state lives in the store (not in
  // the BswmdPickerDialog component) so a context-menu right-click can
  // open it via `openBswmdPicker` and the dialog root mounted in
  // `App.tsx` reacts via a selector. `pendingDelete` is set by
  // `deleteContainer` when reverse-reference scan finds N>0 hits; the
  // CascadeConfirmDialog reads it, then calls back through
  // `confirmDeleteContainer(choice)` to either commit the delete
  // (only / cascade) or clear the pending state (cancel).
  readonly bswmdPicker: {
    readonly open: boolean;
    readonly parentPath: string | null;
    readonly kind: 'container' | 'parameter' | 'reference' | null;
  };
  readonly pendingDelete: {
    readonly path: string;
    readonly references: readonly ReferenceHit[];
  } | null;
  openBswmdPicker: (target: {
    readonly parentPath: string;
    readonly kind: 'container' | 'parameter' | 'reference';
  }) => void;
  closeBswmdPicker: () => void;
  setPendingDelete: (
    pending: {
      readonly path: string;
      readonly references: readonly ReferenceHit[];
    } | null,
  ) => void;

  /**
   * Sprint 17b T6 — typed toast setters. `setError` is the only one
   * that takes `null` (it's a long-standing public surface that means
   * "clear the error banner"); the three new kinds only ever replace
   * the current toast. Use `dismissToast` to clear without picking a
   * kind — both `setError(null)` and `dismissToast()` reset toast
   * AND the legacy `error` field in one go.
   */
  setError: (msg: string | null) => void;
  setInfo: (message: string, autoDismissMs?: number) => void;
  // Sprint 17 PATCH T3 — optional 3rd `action` arg. Existing callers
  // (AppHeader save errors, StencilWizard save success) use the
  // 2-arg form unchanged; only the cascade-and-unlink branch in
  // `useProjectActions` passes an Undo button.
  setSuccess: (
    message: string,
    autoDismissMs?: number,
    action?: { readonly label: string; readonly onActivate: () => void },
  ) => void;
  setWarning: (message: string, autoDismissMs?: number) => void;
  dismissToast: () => void;
}

export const createUiSlice: StateCreator<ArxmlState, [], [], UiSlice> = (set, get) => ({
  // Sprint 17b T6 — typed toast envelope. Both fields default to
  // null; every setter keeps them in sync so the legacy `error`
  // selectors (AppHeader, ErrorBanner, etc.) and the new typed
  // `toast` readers see the same UI state.
  error: null,
  toast: null,
  // Sprint 13 refactor — left-tab default. 'files' is the post-Sprint-11
  // baseline: the project tab only makes sense when a project is open,
  // and the files tab is always visible. LeftPanel may override the
  // initial active tab visually (hiding 'project' in loose mode) but
  // the store-level default stays 'files'.
  leftTab: 'files',
  // Sprint 13 Stage 3.5 — combined view defaults. `viewMode` starts
  // 'single' so the existing 746-test baseline sees no change; the
  // 'combined' mode is opt-in via the [Combined] virtual entry in
  // FileListTab. Sprint 14 widens the union to a 3-state machine
  // ('single' | 'combined' | 'import-merged') so the Import slice
  // can sit alongside Combined View.
  viewMode: 'single',
  displayDoc: null,
  // Sprint 17c T10 — combined-doc build warnings. Populated by
  // `buildCombinedDocument` and refreshed on every combined-mode
  // store mutation. Empty in single mode and at initial mount.
  warnings: [],
  // Sprint 12 #3 Task 7 — dialog state defaults. Both dialogs start
  // closed; no pending action. The `isDirty` getter is a function on
  // the state (zustand permits functions in state alongside data) so
  // it always reflects the current `dirtyPaths` set.
  isDirty: () => get().dirtyPaths.size > 0 || get().importSession !== null,
  newProjectDialogOpen: false,
  confirmDialogOpen: false,
  // Sprint 15 Phase 2 — picker + cascade confirm defaults. Both
  // start in their "no pending" form: picker closed with no
  // parentPath/kind, and pendingDelete null. The store owns these
  // flags so the dialog roots in `App.tsx` can mount once and react
  // to the same flag the action mutator flipped.
  bswmdPicker: { open: false, parentPath: null, kind: null },
  pendingDelete: null,

  // Sprint 13 refactor — setLeftTab. Single-field set, no side
  // effects. The default 'files' is restored on `clear()` only if
  // the user wants a clean slate; we don't auto-flip the tab on
  // other store events because tabs are pure UI state independent
  // of project lifecycle (e.g. closing a project doesn't force the
  // user back to the files tab).
  setLeftTab: (tab) => set({ leftTab: tab }),

  // Sprint 13 Stage 3.5 — combined view toggle. Resets selectedPath
  // so a path from the previous mode doesn't survive the flip (a
  // single-mode path like `/EAS/Adc/AdcConfig` would not resolve
  // inside the combined view because the combined root is `[Combined]`
  // whose top-level packages are file basenames, not root packages).
  setViewMode: (mode) => {
    const state = get();
    // Sprint 14 — three-state guard. Switching to 'combined' while
    // an import session is in flight is rejected with a viewMode-
    // locked error: the user must commit or cancel the import
    // first. Switching to 'single' / 'import-merged' is always
    // allowed (the import flow owns its own view state).
    if (state.viewMode === 'import-merged' && mode === 'combined') {
      set({
        error: t(state.locale, 'app.import.error.viewModeLocked'),
      });
      return;
    }
    // 'import-merged' is only entered via startImport (never via
    // setViewMode directly) — guard against external misuse.
    if (mode === 'import-merged' && state.importSession === null) {
      return;
    }
    // Sprint 14 — when transitioning OUT of import-merged the
    // displayDoc should be rebuilt from the single-mode set (the
    // import-merged view synthesises its own tree; switching back
    // means re-rendering the active doc).
    const effectiveMode = state.viewMode === 'import-merged' ? 'single' : mode;
    const displayResult = computeDisplayDoc(
      effectiveMode,
      state.doc,
      state.documents,
      state.documentPaths,
    );
    // Sprint 17c T10 — when entering combined mode, populate the
    // warnings slice from the fresh build. When leaving combined
    // mode, clear warnings (they only apply to the combined view).
    // The `displayDoc` is null when there are no documents to
    // render (displayResult === null), but the viewMode flip
    // itself is still meaningful (e.g. tests covering the flip
    // without a loaded doc).
    const nextWarnings: readonly CombinedDocumentWarning[] =
      effectiveMode === 'combined' ? (displayResult?.warnings ?? []) : [];
    set({
      viewMode: mode,
      displayDoc: displayResult?.doc ?? null,
      warnings: nextWarnings,
      selectedPath: null,
    });
  },

  // Sprint 17c T10 — clear the combined-doc warnings slice. Used
  // by the status-bar UI hook (added in a follow-up) when the
  // user dismisses a warning, and by tests that need a clean
  // baseline. The slice is also cleared automatically on
  // `clear()` and when leaving combined mode via `setViewMode`.
  clearWarnings: () => set({ warnings: [] }),

  // Sprint 12 #3 Task 7 — dialog visibility setters. All three setters
  // touch a single field and are intentionally side-effect-free: the
  // store doesn't gate visibility on dirty state, the hook layer
  // (useProjectActions.newProject etc.) does that before calling these
  // setters. This keeps the store simple and makes the dirty-guard
  // testable at the hook layer.
  setNewProjectDialogOpen: (open) => set({ newProjectDialogOpen: open }),
  setConfirmDialogOpen: (open) => set({ confirmDialogOpen: open }),

  // Sprint 15 Phase 2 — picker state setters. Plain field setters; the
  // action layer above is what fans out into the actual mutation. The
  // store owns visibility so the picker root mounted in `App.tsx`
  // reacts to the same flag the action mutator flipped.
  openBswmdPicker: (target) =>
    set({
      bswmdPicker: {
        open: true,
        parentPath: target.parentPath,
        kind: target.kind,
      },
    }),
  closeBswmdPicker: () =>
    set({
      bswmdPicker: { open: false, parentPath: null, kind: null },
    }),
  setPendingDelete: (pending) => set({ pendingDelete: pending }),

  setError: (msg) => {
    // Sprint 17b T6 — `setError` is the long-standing public surface
    // (AppHeader, useProjectActions, useRemoveEcucFiles, etc.). It
    // now writes BOTH the legacy `error: string | null` field AND
    // the new typed `toast: ToastState | null` field. Existing
    // selectors (`s.error`) and the new `s.toast` readers see the
    // same UI state in one render. `null` clears both (this is the
    // "dismiss banner" path); a non-null message becomes a manual-
    // dismiss error toast (no autoDismissMs, role="alert", aria-live
    // "assertive").
    if (msg === null) {
      set({ error: null, toast: null });
      return;
    }
    set({ error: msg, toast: { kind: 'error', message: msg } });
  },

  // Sprint 17b T6 — typed toast setters. Each replaces the current
  // toast (no null overload — use `dismissToast` to clear). The
  // `autoDismissMs` arg is optional; omitting it falls back to the
  // per-kind default (3s info/success, 5s warning). Errors are
  // always manual, so there is no `setError(msg, ms)` overload —
  // the long-standing public surface only ever needs a string.
  setInfo: (message, autoDismissMs = 3000) =>
    set({ error: message, toast: { kind: 'info', message, autoDismissMs } }),
  setSuccess: (message, autoDismissMs = 3000, action) =>
    // `exactOptionalPropertyTypes` rejects `action: undefined`; spread
    // the optional key only when it's actually set so the property is
    // either present or absent (never present-with-undefined).
    set({
      error: message,
      toast: {
        kind: 'success',
        message,
        autoDismissMs,
        ...(action !== undefined ? { action } : {}),
      },
    }),
  setWarning: (message, autoDismissMs = 5000) =>
    set({ error: message, toast: { kind: 'warning', message, autoDismissMs } }),
  dismissToast: () => set({ error: null, toast: null }),
});

// Re-export so consumers can read the toast + warning types from a
// single import path.
export type { ToastKind, ToastState };
