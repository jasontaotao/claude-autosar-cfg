// src/renderer/app/useWizardHandlers.ts
// Closure-scoped hook for the App.tsx wizard + tour handlers.
// Extracted from `src/renderer/App.tsx` as part of v1.42.1 MINOR T4a
// (per-flow JSX refactor for the Round-1 L8 file-size backlog).
//
// Public surface: 8 callbacks + 2 state slots + 2 refs = 12 return fields.
//
// Existing consumers (DbcImportWizard mount, XlsxBatchWizard mount,
// AppHeader `dbcImportBusy` + `xlsxBatchBusy` props, TourProvider
// mount) exercise this via the App component, not directly — the App
// shell destructures the hook return and passes callbacks / state /
// refs as props.
//
// Per-flow scope chosen over bulk extraction (lesson
// `per-flow-jsx-refactor-needs-prerequisite-analysis-deliverable`):
// this T handles 8 callbacks + 2 state + 2 refs for the DBC import
// wizard + XLSX batch wizard + onboarding tour only; this is Flow 4
// (the last flow) in App.tsx. After T4a, all 4 App.tsx flow groups
// are extracted; remaining LoC is JSX shell + top-level hooks.
//
// **The DbcImportWizard `onApply` callback is INLINE in JSX (line
// ~660+ in App.tsx) and stays in App.tsx shell** — it reads from
// `useArxmlStore.getState()` directly, is defined inline in JSX (not
// `const handler = useCallback(...)`), and is called only by the
// JSX (single caller). It does not need extraction per the
// plan's T4a spec note.

import { useCallback, useRef, useState } from 'react';

import { t as i18nT, t } from '@shared/i18n/index.js';

import type { DbcSummary } from '../../shared/types';
import { useArxmlStore } from '../store/useArxmlStore';

export type DbcImportState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'pick' }
  | {
      readonly kind: 'preview';
      readonly summary: DbcSummary;
      readonly content: string;
      readonly correlationId: string;
    };

export type WizardHandlers = {
  // 8 callbacks
  openDbcImportWizard: () => Promise<void>;
  closeDbcImportWizard: () => void;
  openXlsxBatchWizard: () => Promise<void>;
  closeXlsxBatchWizard: () => void;
  onTourAdvance: () => void;
  onTourBack: () => void;
  onTourSkip: () => void;
  onTourFinish: () => void;
  // 2 state slots (read-only — setters stay in hook for callback
  // closures; App.tsx shell does not need them as React state)
  dbcImportState: DbcImportState;
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
  // v1.23.0 T4 — DBC→Com-Stack 3-step wizard state machine. Mirrors
  // the v1.21.0 T4 DBC + v1.22.0 T3 ODX pattern line-for-line
  // (separate modal state, separate in-flight ref). The wizard's
  // state is a 3-arm union: closed (not mounted), pick (Step 1
  // — user picks a DBC file), and preview (Step 2 + 3 — the host
  // has the parsed DBC summary and passes it down as `initialDbc`).
  // The 'pick' arm hosts the openDbc → parseDbc round-trip so the
  // wizard can present a single button that drives the entire
  // upstream flow.
  const [dbcImportState, setDbcImportState] = useState<DbcImportState>({ kind: 'closed' });
  const dbcImportInFlight = useRef(false);
  const openDbcImportWizard = useCallback(async (): Promise<void> => {
    if (dbcImportInFlight.current) return;
    dbcImportInFlight.current = true;
    try {
      const api = window.autosarApi;
      if (api === undefined) {
        // Read-once pattern: `setStoreError` from the store at call
        // time (avoids useCallback dep-array churn).
        const { setError: setStoreError } = useArxmlStore.getState();
        setStoreError('openDbc API not available');
        return;
      }
      const locale = useArxmlStore.getState().locale;
      const correlationId = `dbc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const opened = await api.openDbc();
      switch (opened.kind) {
        case 'canceled':
          // User dismissed the dialog — do not open the wizard at all.
          // The T4 brief calls for a 3-step wizard that ONLY appears
          // after a successful DBC pick; if the user cancels at the
          // OS dialog, we return to the workspace with no modal.
          return;
        case 'read-failed': {
          const { setError: setStoreError } = useArxmlStore.getState();
          setStoreError(t(locale, 'dbc.open.failed', { message: opened.message }));
          return;
        }
        case 'opened':
          useArxmlStore.getState().appendDiagnostic({
            level: 'debug',
            source: 'dbc-import',
            message: 'DBC file opened',
            detail: `path=${opened.path} bytes=${opened.content.length}`,
            correlationId,
          });
          break;
        default: {
          const _exhaustive: never = opened;
          throw new Error(`Unhandled OpenDbcResult: ${String(_exhaustive)}`);
        }
      }
      const parsed = await api.parseDbc({
        path: opened.path,
        content: opened.content,
      });
      if (!parsed.ok) {
        const { setError: setStoreError } = useArxmlStore.getState();
        useArxmlStore.getState().appendDiagnostic({
          level: 'error',
          source: 'dbc-import',
          message: 'DBC parse failed',
          detail: parsed.error.message,
          correlationId,
        });
        setStoreError(t(locale, 'dbc.parse.failed', { message: parsed.error.message }));
        return;
      }
      if (parsed.value.messages.length === 0) {
        const message = t(locale, 'dbc.import.error.noMessages');
        useArxmlStore.getState().appendDiagnostic({
          level: 'warn',
          source: 'dbc-import',
          message,
          detail: `nodes=${parsed.value.nodeCount}`,
          correlationId,
        });
        useArxmlStore.getState().setError(message);
        return;
      }
      useArxmlStore.getState().appendDiagnostic({
        level: 'debug',
        source: 'dbc-import',
        message: 'DBC parsed',
        detail: `nodes=${parsed.value.nodeCount} messages=${parsed.value.messageCount}`,
        correlationId,
      });
      // Transition to the 'preview' arm — the wizard lands directly
      // on Step 2 (Preview) because the host has already done the
      // open + parse round-trip. The DbcSummary is the source of
      // truth for the targetNode dropdown; we keep the raw content
      // in the state so the Apply handler can ship it to the IPC.
      setDbcImportState({
        kind: 'preview',
        summary: parsed.value,
        content: opened.content,
        correlationId,
      });
    } finally {
      dbcImportInFlight.current = false;
    }
  }, []);
  const closeDbcImportWizard = useCallback((): void => {
    setDbcImportState({ kind: 'closed' });
  }, []);

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
    // 8 callbacks
    openDbcImportWizard,
    closeDbcImportWizard,
    openXlsxBatchWizard,
    closeXlsxBatchWizard,
    onTourAdvance,
    onTourBack,
    onTourSkip,
    onTourFinish,
    // 2 state slots (read-only)
    dbcImportState,
    xlsxBatchWizardOpen,
    // 2 in-flight refs
    dbcImportInFlight,
    xlsxBatchInFlight,
  };
}
