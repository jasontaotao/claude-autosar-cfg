// src/renderer/app/useWizardHandlers.ts
// Closure-scoped hook for the App.tsx wizard + tour handlers.
// Extracted from `src/renderer/App.tsx` as part of v1.42.1 MINOR T4a
// (per-flow JSX refactor for the Round-1 L8 file-size backlog).
//
// Public surface: 10 callbacks + 3 state slots + 2 refs.
//
// Existing consumers (DbcImportWizard mount, XlsxBatchWizard mount,
// AppHeader `dbcImportBusy` + `xlsxBatchBusy` props, TourProvider
// mount) exercise this via the App component, not directly — the App
// shell destructures the hook return and passes callbacks / state /
// refs as props.
//
// v1.56.0 Task 13 — the DBC import wizard moved from the 3-step
// host-orchestrated flow (openDbc → parseDbc → `dbcImportComStack`
// onApply) to the wizard-owned 4-step flow (source-target → policy →
// preview → apply). The host now supplies three callbacks instead of
// owning the round-trip:
//   - `pickDbcImportFile`   — openDbc IPC → absolute path or null
//   - `dbcFullImportPreview`— dbcFullImportPreview IPC pass-through
//   - `dbcFullImportCommit` — dbcFullImportCommit IPC + the post-commit
//     project reload + success toast (the legacy App.tsx inline
//     `onApply` block relocated here)
// `DbcImportState` (3-arm union) is replaced by a boolean
// `dbcImportWizardOpen`; the legacy `dbcImportState.kind === 'preview'`
// mount condition disappears with it. The old
// `window.autosarApi.dbcImportComStack` channel stays untouched
// (Task 14 owns migration + compat).

import { useCallback, useRef, useState } from 'react';

import { t as i18nT } from '@shared/i18n/index.js';
import { dirname, toManifestRelative } from '@shared/path';
import type {
  DbcFullImportCommitRequest,
  DbcFullImportCommitResponse,
  DbcFullImportPreviewRequest,
  DbcFullImportPreviewResponse,
} from '@shared/types/dbc-import';

import { useArxmlStore } from '../store/useArxmlStore';

export type WizardHandlers = {
  // 10 callbacks
  openDbcImportWizard: () => Promise<void>;
  closeDbcImportWizard: () => void;
  pickDbcImportFile: () => Promise<string | null>;
  dbcFullImportPreview: (
    request: DbcFullImportPreviewRequest,
  ) => Promise<DbcFullImportPreviewResponse>;
  dbcFullImportCommit: (
    request: DbcFullImportCommitRequest,
  ) => Promise<DbcFullImportCommitResponse>;
  openXlsxBatchWizard: () => Promise<void>;
  closeXlsxBatchWizard: () => void;
  onTourAdvance: () => void;
  onTourBack: () => void;
  onTourSkip: () => void;
  onTourFinish: () => void;
  // 3 state slots (read-only — setters stay in hook for callback
  // closures; App.tsx shell does not need them as React state)
  dbcImportWizardOpen: boolean;
  xlsxBatchWizardOpen: boolean;
  // 2 in-flight refs
  dbcImportInFlight: React.MutableRefObject<boolean>;
  xlsxBatchInFlight: React.MutableRefObject<boolean>;
};

// `tourState` + `tourLocale` are consumed by the App.tsx JSX at
// line ~462+ (TourProvider mount) and are subscribed via
// `useArxmlStore` directly in the App shell — not via this hook.
// Reason: the TourProvider prop signature is `(tourState, locale,
// onAdvance, onBack, onSkip, onFinish)` — passing the tour state
// through this hook would require an extra indirection (hook
// subscribes → returns tourState → shell destructures → passes to
// TourProvider) with no functional benefit. The shell subscribes
// directly, matching the T1 spec note about "viewMode
// isImportMerged" (similar shape — derived value read at JSX level,
// not in a hook).

export function useWizardHandlers(): WizardHandlers {
  // v1.56.0 Task 13 — DBC full-import 4-step wizard open/close flag.
  // The wizard owns its step machine internally; the host only gates
  // the modal mount + supplies the IPC callbacks below. Mirrors the
  // OdxImportWizard / XlsxBatchWizard pattern.
  const [dbcImportWizardOpen, setDbcImportWizardOpen] = useState(false);
  const dbcImportInFlight = useRef(false);
  const openDbcImportWizard = useCallback(async (): Promise<void> => {
    if (dbcImportInFlight.current) return;
    // Read-once: locale + projectPath + setStoreError at call time.
    const { locale, projectPath: projPath, setError: setStoreError } = useArxmlStore.getState();
    if (projPath === null) {
      setStoreError(i18nT(locale, 'app.generate.needProject'));
      return;
    }
    setDbcImportWizardOpen(true);
  }, []);
  const closeDbcImportWizard = useCallback((): void => {
    setDbcImportWizardOpen(false);
  }, []);

  // Select a DBC file via the OS dialog; returns the absolute path or
  // null when the user cancels / the read fails (error toast emitted
  // here so the wizard can treat null as "no file chosen").
  const pickDbcImportFile = useCallback(async (): Promise<string | null> => {
    const api = window.autosarApi;
    if (api === undefined) {
      const { setError: setStoreError } = useArxmlStore.getState();
      setStoreError('openDbc API not available');
      return null;
    }
    dbcImportInFlight.current = true;
    try {
      const opened = await api.openDbc();
      switch (opened.kind) {
        case 'canceled':
          return null;
        case 'read-failed': {
          const { locale, setError: setStoreError } = useArxmlStore.getState();
          setStoreError(i18nT(locale, 'dbc.open.failed', { message: opened.message }));
          return null;
        }
        case 'opened':
          return opened.path;
        default: {
          const _exhaustive: never = opened;
          throw new Error(`Unhandled OpenDbcResult: ${String(_exhaustive)}`);
        }
      }
    } finally {
      dbcImportInFlight.current = false;
    }
  }, []);

  // Preview IPC pass-through — the wizard owns the request shape
  // (discovery omits targetNode; mapping includes it, §10.2.1).
  const dbcFullImportPreview = useCallback(
    async (request: DbcFullImportPreviewRequest): Promise<DbcFullImportPreviewResponse> => {
      const api = window.autosarApi;
      if (api === undefined) {
        return {
          ok: false,
          error: { kind: 'read-failed', message: 'dbcFullImportPreview API not available' },
        };
      }
      return api.dbcFullImportPreview(request);
    },
    [],
  );

  // Commit IPC + post-commit project reload + success toast.
  // Mirrors the legacy App.tsx inline `onApply` block: the 3-file
  // write already succeeded by the time we reload, so a reload failure
  // is surfaced as a warning, never as a commit failure. The response
  // passes through so the wizard can show applied/kept/deleted.
  const dbcFullImportCommit = useCallback(
    async (request: DbcFullImportCommitRequest): Promise<DbcFullImportCommitResponse> => {
      const api = window.autosarApi;
      if (api === undefined) {
        return {
          ok: false,
          error: { kind: 'read-failed', message: 'dbcFullImportCommit API not available' },
        };
      }
      const state = useArxmlStore.getState();
      const projPath = state.projectPath;
      const loc = state.locale;
      if (projPath === null) {
        return {
          ok: false,
          error: { kind: 'read-failed', message: 'No project open' },
        };
      }
      const response = await api.dbcFullImportCommit(request);
      if (!response.ok) return response;

      // Success — reload the project so the store re-parses the
      // freshly-written ARXMLs + BSWMDs. `project:reload` is the
      // non-dialog counterpart to `project:open` (T4 PATCH HIGH-1).
      try {
        const reload = await api.projectReload({ manifestPath: projPath });
        if (reload.kind === 'read-failed') {
          const { setError: setStoreError } = useArxmlStore.getState();
          setStoreError(i18nT(loc, 'app.error.openProjectFailed', { message: reload.message }));
          return response;
        }
        const manifest = useArxmlStore.getState().project;
        if (manifest !== null) {
          const manifestDir = dirname(projPath);
          const docsRelSet = new Set(manifest.valueArxmlPaths);
          const docs: { rel: string; path: string; content: string }[] = [];
          const bswmds: { rel: string; path: string; content: string }[] = [];
          for (const file of reload.files) {
            const rel = toManifestRelative(manifestDir, file.path) ?? file.path;
            if (docsRelSet.has(rel)) docs.push({ rel, path: file.path, content: file.content });
            else bswmds.push({ rel, path: file.path, content: file.content });
          }
          useArxmlStore.getState().openProject({
            manifestPath: projPath,
            manifest: reload.manifest,
            docs,
            bswmds,
          });
        }
      } catch (reloadErr) {
        // Belt-and-braces — a hard reject must not hide that the
        // commit succeeded.
        const { setError: setStoreError } = useArxmlStore.getState();
        setStoreError(
          i18nT(loc, 'app.error.openProjectFailed', {
            message: reloadErr instanceof Error ? reloadErr.message : String(reloadErr),
          }),
        );
        return response;
      }
      const after = useArxmlStore.getState();
      if (response.value.applied > 0) {
        after.setSuccess(i18nT(loc, 'dbc.import.success', { count: response.value.applied }));
      } else {
        after.setWarning(i18nT(loc, 'dbc.import.warning.noChanges'));
      }
      return response;
    },
    [],
  );

  // v1.25.0 T5 — Excel→Com-Stack ECUC batch 3-step wizard. Open/close
  // flag lives here (mirrors the DbcImportWizard / OdxViewer / diag-
  // extract pattern). The wizard owns the 3-IPC round-trip internally;
  // the host only owns open/close + the per-error / per-success
  // toast callbacks + the post-commit `project:reload` flow.
  //
  // The wizard mounts only when `xlsxBatchWizardOpen === true` so the
  // SheetJS bundle stays out of the main bundle (lazy import would
  // land in a future optimization — for v1.25.0 the IPC handlers do
  // the SheetJS work in main, not the renderer).
  const [xlsxBatchWizardOpen, setXlsxBatchWizardOpen] = useState(false);
  const xlsxBatchInFlight = useRef(false);
  const openXlsxBatchWizard = useCallback(async (): Promise<void> => {
    if (xlsxBatchInFlight.current) return;
    // Read-once pattern: `locale` + `setStoreError` + `projectPath`
    // from the store at call time.
    const { locale, projectPath: projPath, setError: setStoreError } = useArxmlStore.getState();
    if (projPath === null) {
      setStoreError(i18nT(locale, 'app.generate.needProject'));
      return;
    }
    setXlsxBatchWizardOpen(true);
  }, []);
  const closeXlsxBatchWizard = useCallback((): void => {
    setXlsxBatchWizardOpen(false);
  }, []);

  // Sprint 16 v1.6.0 W — Onboarding tour wiring. The host reads
  // the tour state + locale from the store and dispatches advance/
  // back/skip/finish actions. The TourProvider renders the overlay
  // inline when `tour.kind === 'running'`. The tour never blocks
  // project work — the overlay's z-index sits above the workspace
  // but below the dialog hosts (PromptRoot / ConfirmRoot).
  //
  // `dispatchTour` is subscribed here (Zustand store action refs are
  // immutable; the 4 useCallback deps arrays need a stable ref).
  // `tourState` + `tourLocale` stay subscribed in the App.tsx shell
  // (consumed by the TourProvider JSX mount at line ~462+; not
  // exposed via this hook return — see WizardHandlers type
  // comment above).
  const dispatchTour = useArxmlStore((s) => s.dispatchTour);
  const onTourAdvance = useCallback((): void => {
    dispatchTour({ type: 'advance' });
  }, [dispatchTour]);
  const onTourBack = useCallback((): void => {
    dispatchTour({ type: 'back' });
  }, [dispatchTour]);
  const onTourSkip = useCallback((): void => {
    dispatchTour({ type: 'skip' });
  }, [dispatchTour]);
  const onTourFinish = useCallback((): void => {
    dispatchTour({ type: 'reset' });
  }, [dispatchTour]);

  return {
    // 10 callbacks
    openDbcImportWizard,
    closeDbcImportWizard,
    pickDbcImportFile,
    dbcFullImportPreview,
    dbcFullImportCommit,
    openXlsxBatchWizard,
    closeXlsxBatchWizard,
    onTourAdvance,
    onTourBack,
    onTourSkip,
    onTourFinish,
    // 3 state slots (read-only)
    dbcImportWizardOpen,
    xlsxBatchWizardOpen,
    // 2 in-flight refs
    dbcImportInFlight,
    xlsxBatchInFlight,
  };
}
