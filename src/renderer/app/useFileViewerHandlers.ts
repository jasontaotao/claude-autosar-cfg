// src/renderer/app/useFileViewerHandlers.ts
// Closure-scoped hook for the App.tsx file-viewer handlers (DBC viewer
// + ODX viewer). Extracted from `src/renderer/App.tsx` as part of
// v1.42.1 MINOR T2 (per-flow JSX refactor for the Round-1 L8 file-size
// backlog).
//
// Public surface: 4 callbacks + 2 state slots + 2 refs = 8 return fields.
//
// Existing consumers (DbcViewer modal mount, OdxViewer modal mount,
// AppHeader `dbcBusy` + `odxBusy` props) exercise this via the App
// component, not directly — the App shell destructures the hook return
// and passes callbacks / state / refs as props.
//
// Per-flow scope chosen over bulk extraction (lesson
// `sub-component-extraction-with-N-items-requires-per-flow-analysis-not-bulk-extraction`):
// this T handles 4 callbacks + 2 state + 2 refs for the DBC + ODX
// viewers only; Flows 1, 3, 4 are extracted in separate T-level commits
// (T1 = useAppMainHandlers, T3 = useDiagExtractHandlers, T4a = useWizardHandlers).
//
// Cross-flow contract: `odxPath` is passed in as an arg from App.tsx
// shell. Flow 3 (`useDiagExtractHandlers`) will read `odxModal` from
// Flow 2's return via the same parameter pattern (lesson
// `cross-flow-state-reads-must-flow-through-hook-parameters` 2/3
// confirmations today; T3 will give the 3rd).

import { useCallback, useRef, useState } from 'react';

import { t } from '@shared/i18n/index.js';

import type { DbcSummary, OdxSummary } from '../../shared/types';
import { useArxmlStore } from '../store/useArxmlStore';

export type DbcModalState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'open'; readonly path: string; readonly summary: DbcSummary }
  | { readonly kind: 'error'; readonly message: string };

export type OdxModalState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'open'; readonly path: string; readonly summary: OdxSummary }
  | { readonly kind: 'error'; readonly message: string };

export type FileViewerHandlers = {
  // 4 callbacks (verbatim from App.tsx Flow 2)
  openDbcViewer: () => Promise<void>;
  closeDbcViewer: () => void;
  openOdxViewer: () => Promise<OdxModalState>;
  closeOdxViewer: () => void;
  // 2 state slots
  dbcModal: DbcModalState;
  setDbcModal: (state: DbcModalState) => void;
  odxModal: OdxModalState;
  setOdxModal: (state: OdxModalState) => void;
  // 2 in-flight refs
  dbcInFlight: React.MutableRefObject<boolean>;
  odxInFlight: React.MutableRefObject<boolean>;
};

export function useFileViewerHandlers(): FileViewerHandlers {
  // v1.21.0 Bug #5 — DBC viewer state machine. The 3-state shape
  // (closed / open / error) replaces the earlier 4-state draft that
  // included a 'loading' arm: post-code-review MEDIUM found the
  // loading branch rendered as a broken empty error banner. The pick
  // + parse IPC is fast enough that we just transition closed → open
  // / error directly; double-click is guarded by an in-flight ref
  // because useState's value is stale inside an awaited callback
  // (see the closure fix in `useGenerateCode` / Bug #2 HIGH-1).
  const [dbcModal, setDbcModal] = useState<DbcModalState>({ kind: 'closed' });
  // In-flight ref — survives across the awaited IPC round-trip so a
  // concurrent click cannot race the in-flight call. Closes the
  // re-entrancy gap that the `dbcModal.kind` guard left open.
  const dbcInFlight = useRef(false);
  const openDbcViewer = useCallback(async (): Promise<void> => {
    if (dbcInFlight.current) return;
    dbcInFlight.current = true;
    try {
      const api = window.autosarApi;
      if (api === undefined) {
        setDbcModal({ kind: 'error', message: 'openDbc API not available' });
        return;
      }
      const locale = useArxmlStore.getState().locale;
      const opened = await api.openDbc();
      // Discriminated-union switch with exhaustive narrowing — adding
      // a new variant to `OpenDbcResult` will fail the `never` arm
      // and force the caller to handle it.
      switch (opened.kind) {
        case 'canceled':
          setDbcModal({ kind: 'closed' });
          return;
        case 'read-failed':
          setDbcModal({
            kind: 'error',
            message: t(locale, 'dbc.open.failed', { message: opened.message }),
          });
          return;
        case 'opened':
          break;
        default: {
          const _exhaustive: never = opened;
          throw new Error(`Unhandled OpenDbcResult: ${String(_exhaustive)}`);
        }
      }
      // 2nd IPC: parse the in-memory content. The handler caps at
      // 32 MiB (mirroring parseArxmlHandler); the result envelope
      // is `{ ok, value } | { ok, error: { kind, message } }`.
      const parsed = await api.parseDbc({
        path: opened.path,
        content: opened.content,
      });
      if (!parsed.ok) {
        setDbcModal({
          kind: 'error',
          message: t(locale, 'dbc.parse.failed', { message: parsed.error.message }),
        });
        return;
      }
      setDbcModal({ kind: 'open', path: opened.path, summary: parsed.value });
    } finally {
      dbcInFlight.current = false;
    }
  }, []);
  const closeDbcViewer = useCallback((): void => {
    setDbcModal({ kind: 'closed' });
  }, []);

  // v1.22.0 T3 — ODX viewer state machine. Mirrors the v1.21.0 T4
  // DBC pattern line-for-line (separate modal state, separate
  // in-flight ref, discriminated-union switch with exhaustive
  // narrowing). Decoupled from the DBC state so a slow DBC parse
  // does not block ODX import (and vice versa).
  const [odxModal, setOdxModal] = useState<OdxModalState>({ kind: 'closed' });
  // In-flight ref — survives across the awaited IPC round-trip so a
  // concurrent click cannot race the in-flight call.
  const odxInFlight = useRef(false);
  const openOdxViewer = useCallback(async (): Promise<OdxModalState> => {
    if (odxInFlight.current) return { kind: 'closed' };
    odxInFlight.current = true;
    try {
      const api = window.autosarApi;
      if (api === undefined) {
        const unavailable: OdxModalState = { kind: 'error', message: 'openOdx API not available' };
        setOdxModal(unavailable);
        return unavailable;
      }
      const locale = useArxmlStore.getState().locale;
      const opened = await api.openOdx();
      switch (opened.kind) {
        case 'canceled': {
          const canceled: OdxModalState = { kind: 'closed' };
          setOdxModal(canceled);
          return canceled;
        }
        case 'read-failed': {
          const openFailed: OdxModalState = {
            kind: 'error',
            message: t(locale, 'odx.open.failed', { message: opened.message }),
          };
          setOdxModal(openFailed);
          return openFailed;
        }
        case 'opened':
          break;
        default: {
          const _exhaustive: never = opened;
          throw new Error(`Unhandled OpenOdxResult: ${String(_exhaustive)}`);
        }
      }
      const parsed = await api.parseOdx({
        path: opened.path,
        content: opened.content,
      });
      if (!parsed.ok) {
        const parseFailed: OdxModalState = {
          kind: 'error',
          message: t(locale, 'odx.parse.failed', { message: parsed.error.message }),
        };
        setOdxModal(parseFailed);
        return parseFailed;
      }
      const openedState: OdxModalState = { kind: 'open', path: opened.path, summary: parsed.value };
      setOdxModal(openedState);
      return openedState;
    } finally {
      odxInFlight.current = false;
    }
  }, []);
  const closeOdxViewer = useCallback((): void => {
    setOdxModal({ kind: 'closed' });
  }, []);

  return {
    // 4 callbacks
    openDbcViewer,
    closeDbcViewer,
    openOdxViewer,
    closeOdxViewer,
    // 2 state slots
    dbcModal,
    setDbcModal,
    odxModal,
    setOdxModal,
    // 2 in-flight refs
    dbcInFlight,
    odxInFlight,
  };
}
