// src/renderer/app/useAppHeaderHandlers.ts
// Closure-scoped hook for AppHeader.tsx handler cluster.
//
// Extracted from `src/renderer/components/AppHeader.tsx` as part of
// v1.42.3 PATCH (per-flow handler extraction following the v1.42.1
// T1-T4a pattern). AppHeader.tsx is the only consumer; the hook
// returns a 22-field bundle that AppHeader.tsx destructures once at
// the top and propagates to its 3 sub-components (BrandMenu +
// ActionBar + StatusBadge).
//
// Public surface: 6 async handlers + 1 useCallback + 3 derived
// predicates + 1 state slot + 11 store selectors = 22 return fields.
//
// **Per-flow scope chosen over bulk extraction** (lesson
// `per-flow-jsx-refactor-needs-prerequisite-analysis-deliverable` +
// `cross-flow-state-reads-must-flow-through-hook-parameters`): this
// hook handles the AppHeader file's handler cluster (6 file ops +
// 3 project ops + close-project confirm flow). Other handlers in
// the renderer (App.tsx flows 1-4) were already extracted in
// v1.42.1 MINOR T1-T4a (`useAppMainHandlers` / `useFileViewerHandlers`
// / `useDiagExtractHandlers` / `useWizardHandlers`).
//
// **The 6 `const` async handlers are NOT useCallback** (per v1.42.1
// critical-honesty flag in devlog — silent deviation from the
// plan template). They are re-created on every render but the
// 4 sub-component mounts in AppHeader.tsx are not memoized with
// `React.memo`, so useCallback would add dep-array overhead without
// preventing any re-render. The single useCallback in this hook
// (`onCloseProjectClick`) DOES use useCallback because its dep
// array is small + it's passed to `<AppHeaderStatusBadge>` which
// does not have memoization — keeping the dep array explicit helps
// future memoization surface the correct deps.
//
// i18n: handlers call `t(locale, ...)` using the `locale` from the
// store subscription. The `confirm()` dialog is imported from the
// shared dialog host (passed in as a side-effect import, not via
// hook return — it's a global singleton).

import { useCallback, useState } from 'react';

import { t, type Locale } from '@shared/i18n/index.js';

import type { ArxmlDocument } from '../../core/arxml/types.js';
import { basename } from '../../shared/path.js';
import type { ParseArxmlResponse } from '../../shared/types.js';
import type { ProjectManifest } from '../../shared/types/project-manifest.js';
import { useProjectActions } from '../hooks/useProjectActions';
import { useArxmlStore } from '../store/useArxmlStore';

import { INITIAL, type AppHeaderState } from '../components/AppHeader/types.js';
import { confirm } from '../components/ConfirmDialog.js';
import { formatParseError, saveAllDirty } from '../components/AppHeader/helpers.js';

export type AppHeaderHandlers = {
  // 6 async handlers (`const` pattern, not useCallback — per v1.42.1
  // critical-honesty flag in devlog)
  onOpen: () => Promise<void>;
  onSave: () => Promise<void>;
  onSaveAll: () => Promise<void>;
  onProjectNew: () => Promise<void>;
  onProjectOpen: () => Promise<void>;
  onProjectSave: () => Promise<void>;
  // 1 useCallback
  onCloseProjectClick: () => Promise<void>;
  // 3 derived predicates
  canSave: boolean;
  canSaveAll: boolean;
  canSaveProject: boolean;
  // 1 state slot (read-only)
  state: AppHeaderState;
  // 11 store selectors (read-only — Zustand subscriptions)
  doc: ArxmlDocument | null;
  filePath: string | null;
  isActiveDirty: boolean;
  addDocument: (doc: ArxmlDocument, filePath: string, options?: { readonly template?: boolean }) => void;
  setStoreError: (msg: string | null) => void;
  project: ProjectManifest | null;
  projectPath: string | null;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  dirtyPaths: ReadonlySet<string>;
  projectDirtyCount: number;
};

export function useAppHeaderHandlers(): AppHeaderHandlers {
  // v1.42.3 PATCH T1 — internal state (stays in hook for closure-locality
  // with the handlers that set busy).
  const [state, setState] = useState<AppHeaderState>(INITIAL);
  // useProjectActions returns the 3 project action async functions
  // (newProject / openProjectFromDialog / saveProject). These are
  // already closure-stable (Zustand store action refs are immutable).
  const { newProject, openProjectFromDialog, saveProject } = useProjectActions();

  // 11 store subscriptions. Zustand selectors return primitives or
  // stable references, so the dep-array churn is minimal. Selectors
  // for Set/Object (dirtyPaths) return the same reference between
  // renders unless the Set is replaced — diff is cheap.
  const doc = useArxmlStore((s) => s.doc);
  const filePath = useArxmlStore((s) => s.filePath);
  const isActiveDirty = useArxmlStore(
    (s) => s.activeDocumentPath !== null && s.dirtyPaths.has(s.activeDocumentPath),
  );
  const addDocument = useArxmlStore((s) => s.addDocument);
  const setStoreError = useArxmlStore((s) => s.setError);
  const project = useArxmlStore((s) => s.project);
  const projectPath = useArxmlStore((s) => s.projectPath);
  const locale = useArxmlStore((s) => s.locale);
  const setLocale = useArxmlStore((s) => s.setLocale);
  const dirtyPaths = useArxmlStore((s) => s.dirtyPaths);
  const projectDirtyCount = useArxmlStore((s) => s.dirtyPaths.size);

  // 6 async handlers (`const` pattern per v1.42.1 critical-honesty flag).
  // Re-created on every render — but the 4 sub-component mounts in
  // AppHeader.tsx are not memoized, so useCallback would add dep-array
  // overhead without preventing re-renders.

  const onOpen = async (): Promise<void> => {
    setState({ busy: true });
    setStoreError(null);
    const result = await window.autosarApi.openArxmlMulti({ title: 'Open AUTOSAR ARXML' });
    switch (result.kind) {
      case 'canceled': {
        setState({ busy: false });
        return;
      }
      case 'read-failed': {
        setState({ busy: false });
        setStoreError(t(locale, 'app.error.openFailed', { message: result.message }));
        return;
      }
      case 'opened':
      case 'partial': {
        const opened = result.kind === 'opened' ? result.results : result.opened;
        const failed = result.kind === 'partial' ? result.failed : [];
        let lastError: string | null = null;
        for (const file of opened) {
          const parsed: ParseArxmlResponse = await window.autosarApi.parseArxml({
            path: file.path,
            content: file.content,
          });
          if (!parsed.ok) {
            lastError = `${basename(file.path)}: ${formatParseError(parsed.error, locale)}`;
            continue;
          }
          addDocument(parsed.value, file.path, { template: true });
        }
        if (failed.length > 0) {
          lastError = failed.map((f) => `${basename(f.path)}: ${f.message}`).join('; ');
        }
        setState({ busy: false });
        setStoreError(lastError);
        return;
      }
    }
  };

  const onSave = async (): Promise<void> => {
    if (doc === null) return;
    setState({ busy: true });
    setStoreError(null);
    const currentPath = filePath ?? '';
    const defaultName = basename(currentPath) || 'untitled.arxml';
    // Sprint 16 — pass `currentPath` so the main-process handler can
    // silent-save back to the on-disk path. Skips the OS save-as
    // dialog when the doc already has a known location. For a brand-
    // new untitled doc (`filePath === null`), `currentPath` stays
    // undefined and the handler falls back to the dialog.
    const saved = await window.autosarApi.saveArxml({
      doc,
      defaultName,
      currentPath: filePath ?? undefined,
    });
    if (!saved.ok) {
      setState({ busy: false });
      // Sprint 17b T7 — dispatch a localized toast per typed kind.
      // `setError` routes through the new `toast: { kind: 'error',
      // message }` slice so the banner shows the correct color and
      // stays manual-dismiss (errors always demand explicit ack).
      // The legacy `app.error.saveFailed` key is retained for
      // callers that predate the typed FileError union.
      const kind = saved.error.kind;
      // Narrow to the six save-error kinds. The other two FileError
      // members (`read-failed` / `dialog-failed`) cannot reach this
      // branch from `saveArxml`, but the union type still includes
      // them; fall through to a generic Save-failed line for those
      // rare paths so we never index the lookup table with an
      // unknown key.
      const message = (
        kind === 'read-failed' || kind === 'dialog-failed'
          ? t(locale, 'app.save.error.unknown', { message: saved.error.message })
          : t(locale, `app.save.error.${kind}` as const, { message: saved.error.message })
      ) as string;
      setStoreError(message);
      return;
    }
    if (saved.value.canceled) {
      setState({ busy: false });
      return;
    }
    useArxmlStore.getState().markSaved(saved.value.path ?? currentPath);
    setState({ busy: false });
  };

  // -----------------------------------------------------------------
  // Sprint 16b T7 — Save All toolbar button. Loops over every entry
  // in `dirtyPaths`, resolves each to its ArxmlDocument, and calls
  // saveArxml with `currentPath = path` so the main process silent-
  // saves (reuses the T2 contract; no dialog per file). v1.12.0
  // PATCH D2 — heavy lift (loop + busy + leading setStoreError(null))
  // moves to `saveAllDirty`; this handler keeps its leading guards
  // and locale-bound toast so the two callers don't diverge again.
  // -----------------------------------------------------------------
  const onSaveAll = async (): Promise<void> => {
    if (state.busy) return;
    if (useArxmlStore.getState().dirtyPaths.size === 0) return;
    const { saved, failed } = await saveAllDirty(setStoreError, (b) => setState({ busy: b }));
    setStoreError(
      failed.length === 0
        ? t(locale, 'app.saveAllDone', { count: saved })
        : t(locale, 'app.saveAllPartial', {
            saved,
            failed: failed.length,
            firstError: failed[0] ?? '',
          }),
    );
  };

  // -----------------------------------------------------------------
  // Project chip × button — close + clear (Sprint X+ T...)
  // -----------------------------------------------------------------
  //
  // User-reported "tree still has content after closing project". The
  // previous behaviour was `closeProject` only, which preserves
  // documents for the loose-mode contract; the chip × now dispatches
  // `closeProjectAndDiscard` so the Tree collapses to its empty-hint
  // placeholder. When the project has unsaved changes, the click
  // surfaces a 3-button Save / Discard / Cancel dialog first.
  //
  // - No dirty docs  → close immediately
  // - saveAndProceed → save all dirty ARXML, then close (abort on
  //                   partial failure so the user can fix and retry)
  // - discard        → close without saving
  // - continue       → no-op (user changed their mind)
  //
  // useCallback dep array tracks state.busy + locale + setStoreError.
  // setStoreError is a stable Zustand action ref. locale changes only
  // when setLocale is invoked (rare; user-driven). state.busy flips
  // during async IPC round-trips — re-evaluation is intended.
  const onCloseProjectClick = useCallback(async (): Promise<void> => {
    if (state.busy) return;
    const storeState = useArxmlStore.getState();

    if (storeState.dirtyPaths.size === 0) {
      storeState.closeProjectAndDiscard();
      return;
    }

    const choice = await confirm({
      title: t(locale, 'confirm.closeProject.title'),
      message: t(locale, 'confirm.closeProject.message', {
        count: storeState.dirtyPaths.size,
      }),
      continueLabel: t(locale, 'confirm.closeProject.cancel'),
      discardLabel: t(locale, 'confirm.closeProject.discard'),
      saveLabel: t(locale, 'confirm.closeProject.save'),
    });

    switch (choice) {
      case 'continue':
        return;
      case 'discard':
        storeState.closeProjectAndDiscard();
        return;
      case 'saveAndProceed': {
        // v1.12.0 PATCH D2 — same `saveAllDirty` helper `onSaveAll`
        // uses, so the two paths can never drift apart again. On full
        // success we close the project; on any failure we mirror the
        // `app.saveAllPartial` toast so the user sees the same
        // "Saved N, M failed: firstError" message and can retry.
        const { saved, failed } = await saveAllDirty(setStoreError, (b) => setState({ busy: b }));
        if (failed.length === 0) {
          useArxmlStore.getState().closeProjectAndDiscard();
        } else {
          setStoreError(
            t(locale, 'app.saveAllPartial', {
              saved,
              failed: failed.length,
              firstError: failed[0] ?? '',
            }),
          );
        }
        return;
      }
    }
  }, [state.busy, locale, setStoreError]);

  // -----------------------------------------------------------------
  // Sprint 11 Phase 1 — project handlers
  // -----------------------------------------------------------------

  const onProjectNew = async (): Promise<void> => {
    setState({ busy: true });
    setStoreError(null);
    const r = await newProject();
    setState({ busy: false });
    if (r.kind === 'error') setStoreError(r.message);
  };

  const onProjectOpen = async (): Promise<void> => {
    setState({ busy: true });
    setStoreError(null);
    const r = await openProjectFromDialog();
    setState({ busy: false });
    if (r.kind === 'error') setStoreError(r.message);
  };

  const onProjectSave = async (): Promise<void> => {
    setState({ busy: true });
    setStoreError(null);
    const r = await saveProject();
    setState({ busy: false });
    if (r.kind === 'error') setStoreError(r.message);
  };

  // 3 derived predicates — computed inline each render (cheap; no useMemo
  // because the sub-components receiving these are not memoized).
  const canSave = doc !== null && !state.busy && isActiveDirty;
  // Sprint 16b T7 — Save All enable predicate. The button is live when
  // at least one dirty doc exists AND no other action is in-flight. We
  // re-read `dirtyPaths.size` instead of `projectDirtyCount` so the
  // button tracks the per-doc Set directly (projectDirtyCount was
  // introduced for the Save Project tooltip). Both end up the same
  // value, but naming them separately keeps each predicate's intent
  // obvious at the call site.
  const canSaveAll = !state.busy && dirtyPaths.size > 0;
  const canSaveProject = project !== null && !state.busy && projectDirtyCount === 0;

  return {
    // 6 async handlers
    onOpen,
    onSave,
    onSaveAll,
    onProjectNew,
    onProjectOpen,
    onProjectSave,
    // 1 useCallback
    onCloseProjectClick,
    // 3 derived predicates
    canSave,
    canSaveAll,
    canSaveProject,
    // 1 state slot (read-only)
    state,
    // 11 store selectors (read-only)
    doc,
    filePath,
    isActiveDirty,
    addDocument,
    setStoreError,
    project,
    projectPath,
    locale,
    setLocale,
    dirtyPaths,
    projectDirtyCount,
  };
}