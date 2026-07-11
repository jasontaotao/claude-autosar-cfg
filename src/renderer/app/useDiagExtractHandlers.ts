// src/renderer/app/useDiagExtractHandlers.ts
// Closure-scoped hook for the App.tsx diagnostic-extract handlers.
// Extracted from `src/renderer/App.tsx` as part of v1.42.1 MINOR T3
// (per-flow JSX refactor for the Round-1 L8 file-size backlog).
//
// Public surface: 2 callbacks + 2 state slots = 4 return fields.
//
// Existing consumers (OdxViewer onExport prop, DiagnosticExtractSuccessDialog
// onClose prop) exercise this via the App component, not directly — the
// App shell destructures the hook return and passes callbacks / state as
// props.
//
// Per-flow scope chosen over bulk extraction (lesson
// `sub-component-extraction-with-N-items-requires-per-flow-analysis-not-bulk-extraction`):
// this T handles 2 callbacks + 2 state for the diag-extract flow only;
// Flow 4 (`useWizardHandlers`) is extracted in a separate T-level commit.
//
// **Cross-flow contract (3rd confirmation for lesson
// `cross-flow-state-reads-must-flow-through-hook-parameters`)**:
// this hook takes `odxModal: OdxModalState` as an arg from Flow 2's
// `useFileViewerHandlers` return. App.tsx shell threads it through:
//   const fileViewers = useFileViewerHandlers();
//   const diagExtract = useDiagExtractHandlers({ odxModal: fileViewers.odxModal });
// The hook reads `odxModal.kind` and `odxModal.path` at call time
// (no subscription — the value is read-once per callback invocation).
// This validates the parameter-passing pattern (not shared module-level
// variable) that prevents stale-closure pitfalls when one flow reads
// state from another.

import { useCallback, useState } from 'react';

import { t } from '@shared/i18n/index.js';

import { useArxmlStore } from '../store/useArxmlStore';

import type { OdxModalState } from './useFileViewerHandlers';

export type DiagExtractModalState =
  | { readonly kind: 'closed' }
  | {
      readonly kind: 'open';
      readonly demPath: string;
      readonly dcmPath: string;
      readonly stats: {
        readonly dtcCount: number;
        readonly didCount: number;
        readonly routineCount: number;
      };
    };

export type DiagExtractHandlers = {
  // 2 callbacks (verbatim from App.tsx Flow 3)
  handleExportOdxDiagnosticExtract: () => Promise<void>;
  closeDiagExtractDialog: () => void;
  // 2 state slots
  diagExtractModal: DiagExtractModalState;
  setDiagExtractModal: (state: DiagExtractModalState) => void;
  diagExtractExporting: boolean;
  setDiagExtractExporting: (busy: boolean) => void;
};

export function useDiagExtractHandlers(args: { odxModal: OdxModalState }): DiagExtractHandlers {
  const { odxModal } = args;
  const [diagExtractModal, setDiagExtractModal] = useState<DiagExtractModalState>({
    kind: 'closed',
  });
  const [diagExtractExporting, setDiagExtractExporting] = useState(false);

  const handleExportOdxDiagnosticExtract = useCallback(async (): Promise<void> => {
    // Read-once pattern: `setStoreError` from the store at call time
    // (avoids useCallback dep-array churn + stale-closure trap).
    const { setError: setStoreError } = useArxmlStore.getState();
    if (odxModal.kind !== 'open') return; // only meaningful while a parsed ODX is loaded
    if (diagExtractExporting) return;
    const api = window.autosarApi;
    if (api === undefined) {
      setStoreError('importDiagnosticExtract API not available');
      return;
    }
    // The outputDir targets a project-relative path. We strip the
    // manifest filename off `projectPath` to derive `projectDir` and
    // then append `samples/arxml/diagnostic-extract/`. The T2 handler
    // creates the Dem_Extract.arxml + Dcm_Extract.arxml inside that
    // directory (or returns read-failed if the dir doesn't exist).
    // Per the brief, a user-selected path is out-of-scope for v1.24.0;
    // the project-relative default is the single source of truth.
    const state = useArxmlStore.getState();
    const projectPath = state.projectPath;
    const locale = state.locale;
    const projectDir = projectPath !== null ? projectPath.replace(/[\\/][^\\/]+$/, '') : '';
    const outputDir =
      projectDir.length > 0
        ? `${projectDir}/samples/arxml/diagnostic-extract`
        : `${odxModal.path.replace(/[\\/][^\\/]+$/, '')}/diagnostic-extract`;
    setDiagExtractExporting(true);
    try {
      const res = await api.importDiagnosticExtract({
        odxPath: odxModal.path,
        outputDir,
      });
      if (res.ok) {
        setDiagExtractModal({ kind: 'open', ...res.value });
        return;
      }
      // Failure path — branched by error kind so the localiser owns
      // every diagnostic string (v1.23.1 T1 L1 i18n-bypass-pattern).
      switch (res.error.kind) {
        case 'read-failed':
          setStoreError(
            t(locale, 'odx.export.diagnosticExtract.error', { error: res.error.message }),
          );
          return;
        case 'write-failed':
          // v1.24.0 T3.1 — 2-key split (rolledBack vs partial) mirrors
          // the v1.23.1 T1 MEDIUM-1 DBC-wizard fix. Each branch is
          // fully translated; no hardcoded English parenthetical
          // (zh-CN users were seeing the English parenthetical
          // concatenated to the translated base message per the
          // v1.23.1 T1 L1 i18n-bypass anti-pattern lesson).
          if (res.error.rolledBack) {
            setStoreError(
              t(locale, 'odx.export.diagnosticExtract.error.write.rolledBack', {
                message: res.error.message,
              }),
            );
          } else {
            setStoreError(
              t(locale, 'odx.export.diagnosticExtract.error.write.partial', {
                message: res.error.message,
              }),
            );
          }
          return;
        default: {
          const _exhaustive: never = res.error;
          void _exhaustive;
        }
      }
    } finally {
      setDiagExtractExporting(false);
    }
  }, [odxModal, diagExtractExporting]);
  const closeDiagExtractDialog = useCallback((): void => {
    setDiagExtractModal({ kind: 'closed' });
  }, []);

  return {
    // 2 callbacks
    handleExportOdxDiagnosticExtract,
    closeDiagExtractDialog,
    // 2 state slots (App.tsx shell does not use the setters — they
    // stay in hook for callback closures)
    diagExtractModal,
    setDiagExtractModal,
    diagExtractExporting,
    setDiagExtractExporting,
  };
}
