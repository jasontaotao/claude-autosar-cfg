// App shell — Sprint 12 #3 Task 8 part 2.
//
// Mounts the three dialog hosts at the root level so any descendant
// component (or module-level API) can open them:
//
//   - `<PromptRoot />`        — Sprint 12 #2 housekeeping: the
//                               Electron-safe replacement for
//                               `window.prompt()`. Module-level
//                               externalSetState API.
//
//   - `<NewProjectDialog />`  — Sprint 12 #3 Phase 1 Task 1+2: the
//                               unified "new project" modal. Store-
//                               driven visibility
//                               (`newProjectDialogOpen`). The host
//                               wires `onSubmit` to
//                               `useProjectActions().submitNewProject`
//                               (Task 5) which is responsible for the
//                               dirty-protection gate (Phase 1 Task 7
//                               `pendingAction` + ConfirmDialog) and
//                               the IPC `project:new` round-trip.
//
//   - `<ConfirmRoot />`       — Sprint 12 #3 Phase 1 Task 6: the
//                               unsaved-changes confirmation modal.
//                               Module-level externalSetState API.
//
// Mount order matters for the module-level hosts: `<ConfirmRoot />`
// must mount BEFORE `<NewProjectDialog />` because Task 5's
// `submitNewProject` calls `confirm({...})` from inside the
// NewProjectDialog's `onSubmit` handler. The dialog portals all
// render to `document.body` so DOM placement order is irrelevant;
// what matters is that the `useEffect` that wires `externalSetState`
// has flushed before any other component calls `confirm()`.
//
// z-index is owned by each dialog's CSS file (NewProjectDialog 9999,
// ConfirmDialog 9998, PromptDialog 9997) so this component is
// intentionally agnostic about stacking — the mount order in the
// return statement documents the dependency graph, not the z-order.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';

import { t as i18nT, t } from '@shared/i18n/index.js';
import { toManifestRelative } from '@shared/path';

import type { DbcSummary } from '../shared/types';

import { AppHeader } from './components/AppHeader';
import { useAppMainHandlers } from './app/useAppMainHandlers';
import { useFileViewerHandlers } from './app/useFileViewerHandlers';
import { ArxmlPanel } from './components/ArxmlPanel';
import { BswmdPickerRoot } from './components/BswmdPickerDialog';
import { CascadeConfirmRoot } from './components/CascadeConfirmDialog';
import { ConfirmRoot } from './components/ConfirmDialog';
import { ConfirmRoot2 } from './components/ConfirmDialog2.js';
import { ContextMenuRoot } from './components/ContextMenu';
import { DbcImportWizard } from './components/DbcImportWizard';
import { DbcViewer } from './components/DbcViewer';
import { DiagnosticExtractSuccessDialog } from './components/DiagnosticExtractSuccessDialog';
import { DiffTable } from './components/DiffTable';
import { ErrorBanner } from './components/ErrorBanner';
import { LeftPanel } from './components/LeftPanel';
import { ModuleFromBswmdPicker } from './components/ModuleFromBswmdPicker';
import { ModuleSelectionPanel } from './components/ModuleSelectionPanel';
import { NewProjectDialog } from './components/NewProjectDialog';
import type { NewProjectSubmitOpts } from './components/NewProjectDialog';
import { OdxViewer } from './components/OdxViewer';
import { PromptRoot } from './components/PromptDialog';
import { RemoveModuleConfirmRoot } from './components/RemoveModuleConfirmDialog';
import { ScriptPanel } from './components/ScriptPanel';
import { XlsxBatchWizard } from './components/XlsxBatchWizard';
import { DcmConfigErrorToast } from './components/dcmConfig/DcmConfigErrorToast';
import { DcmConfigPicker } from './components/dcmConfig/DcmConfigPicker';
import { DcmConfigSuccessDialog } from './components/dcmConfig/DcmConfigSuccessDialog';
import { ParamEditor } from './components/editor/ParamEditor';
import { useBswmdHasDcm } from './hooks/useBswmdHasDcm';
import { useDcmConfigLauncher } from './hooks/useDcmConfigLauncher';
import { useDebouncedValidation } from './hooks/useDebouncedValidation';
import { useGenerateCode } from './hooks/useGenerateCode';
import { useProjectActions } from './hooks/useProjectActions';
import { useSwsValidatorRunner } from './hooks/useSwsValidatorRunner';
import { TourProvider } from './onboarding/TourProvider.js';
import { useArxmlStore } from './store/useArxmlStore';
import { attachXlsxHistoryBootstrap } from './store/xlsxImportHistoryBootstrap.js';
import { attachXlsxImportListener } from './store/xlsxImportListener.js';

export function App(): JSX.Element {
  // Sprint 3: 300ms debounced revalidation safety net.
  // Note: store.updateParam is already sync-revalidating; this hook
  // covers any future async paths (IPC mutations, undo/redo, etc.).
  useDebouncedValidation(300);

  // v1.6.0 Cluster G — SWS Validator runner. Same 300ms debounce so
  // rapid edits don't fire N rule suites. Skips when the feature flag
  // is OFF (per G spec §2 G5). Independent from `useDebouncedValidation`
  // so the legacy schema validator and the SWS validator stay decoupled.
  useSwsValidatorRunner(300);

  // v1.36.0 MINOR T3 — mount the two xlsx-import IPC listeners.
  //   - attachXlsxImportListener: closes the v1.33.0 spec gap — the
  //     listener was exported but never called, so the entire
  //     xlsx:import-complete push channel was dead code. main pushes
  //     the applied rows; this writes them to XlsxImportSlice so
  //     DcmConfigSuccessDialog's `xlsxImportHistory` populates
  //     immediately after the wizard commits.
  //   - attachXlsxHistoryBootstrap: hydrates the session-scope
  //     xlsxImportHistory from <userData>/xlsx-import-history.json
  //     so the timeline survives app restarts. Independent of the
  //     push; both listeners stay for the app's lifetime.
  // Both return cleanup fns; the effect returns `undefined` because
  // we don't need to manually unregister on hot-reload (the IPC
  // bridge handles its own listener removal via the returned fn).
  useEffect(() => {
    const offImport = attachXlsxImportListener();
    const offBootstrap = attachXlsxHistoryBootstrap();
    return () => {
      offImport();
      offBootstrap();
    };
  }, []);

  // Sprint 13+ Stage 4 Q1 — react-resizable-panels v4 has no
  // `autoSaveId` prop (verified in node_modules/.../dist/.d.ts:60-142
  // and confirmed by code-reviewer HIGH finding on the C4 commit).
  // The library expects callers to wire `useDefaultLayout({ groupId })`
  // for localStorage persistence: the hook returns a `defaultLayout`
  // (read from storage on mount, falls back to `undefined` first time)
  // and an `onLayoutChanged` callback that writes the new layout to
  // storage. We thread both into the `<Group>` below so the splitter
  // position survives page reloads.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    groupId: 'workspace',
  });
  const fallbackLayout = { 'workspace-left': 30 } as const;

  // Sprint 12 #3 Phase 1 Task 5 — `submitNewProject` is the dirty-
  // guarded submitter for `<NewProjectDialog />`. When the user clicks
  // Create inside the dialog, the host passes `{name, dir, opts?}` back
  // to this handler, which is responsible for:
  //
  //   1. Reading `isDirty()` from the store and, if true, opening
  //      ConfirmDialog via the module-level `confirm({...})` API.
  //   2. On `discard` / `saveAndProceed`, calling
  //      `window.autosarApi.projectNew({ name, directory, bswmdPaths })`.
  //   3. On `'created'`, dispatching `store.openProject(...)` and
  //      closing the dialog via `setNewProjectDialogOpen(false)`.
  //   4. On `'overwrite-confirm'` / `'invalid-name'` /
  //      `'write-failed'`, surfacing the error inline (the dialog
  //      stays open so the user can correct the input).
  //
  // Task 5 owns the implementation; we just plumb the prop here.
  //
  // The wrapper discards the `ProjectActionResult` because
  // `<NewProjectDialog onSubmit>` is typed as
  // `(name, dir, opts?) => void | Promise<void>`. The hook itself
  // surfaces the result via the store's `error` field (Task 7) so
  // the dialog can read it back on the next render — the return
  // value is redundant at the mount site.
  //
  // Sprint 13+ Stage 3.4 — `opts` is the new third argument carrying
  // `bswmdPaths` (the absolute paths the user pre-selected via the
  // BSWMD chip row). We forward it verbatim to the hook.
  const { submitNewProject } = useProjectActions();
  const handleNewProjectSubmit = (
    name: string,
    directory: string,
    opts?: NewProjectSubmitOpts,
  ): void => {
    void submitNewProject(name, directory, opts);
  };

  // v1.31.0 PATCH T7 — App.tsx wiring for the dcm:config renderer UX.
  // The launcher hook owns the in-flight ref + state machine + error
  // classifier. App.tsx (shell) owns the launcher + the derived
  // gate values because the JSX (line ~606 + line ~1328) consumes
  // both `dcmLauncher.state.mode` (for `dcmConfigBusy` prop) and
  // `canOpenDcmConfig` (for the menu entry disabled state). These
  // stay in App.tsx shell for T1 and will be extracted to
  // useFileViewerHandlers (Flow 2) in T2.
  //
  // 3 gates (kept in App.tsx shell):
  //   1. `odxPath` — active document path. coerce null → ''.
  //   2. `odxLoaded` — derived from `odxPath`. Cheap filename check.
  //   3. `hasDcmBswmd` — derived from `manifest.bswmdPaths`. Regex
  //      match on filename (D4: no BSWMD parse in the renderer).
  const dcmLauncher = useDcmConfigLauncher();
  const odxPath = useArxmlStore((s) => s.activeDocumentPath ?? '');
  const odxLoaded = odxPath.toLowerCase().endsWith('.odx');
  // v1.32.0 MINOR T8 — read the project's parse-based Dcm gate via
  // the new `useBswmdHasDcm` selector. Replaces the v1.31.x filename
  // regex (`isDcmBswmdPath`); the helper at `dcmConfig/regex.ts` is
  // deleted as part of this MINOR.
  const bswmdHasDcm = useBswmdHasDcm();
  const hasDcmBswmd = bswmdHasDcm.hasDcm;
  const canOpenDcmConfig = odxLoaded && hasDcmBswmd;

  // `setStoreError` is consumed by Flows 2/3/4 (DBC viewer, ODX viewer,
  // diag extract, DBC import wizard, XLSX batch wizard) — stays in
  // App.tsx shell for T1. Will be moved to the relevant Flow hooks in
  // T2-T4.
  const setStoreError = useArxmlStore((s) => s.setError);

  // v1.42.1 MINOR T1 — extract main handlers (ECUC picker + Generate
  // code + Context menu + ScriptPanel toggle) into a closure-scoped
  // hook. 9 callbacks + 3 read-only state slots + 1 derived value
  // (`canSelectEcucModule`), all previously inlined in App.tsx. The
  // hook preserves all closure dependencies (useCallback deps arrays
  // unchanged where applicable) and all store subscription semantics
  // (read-once via getState() for ephemeral reads, subscribe for
  // stable references). Behavior identical: existing AppHeader /
  // LeftPanel / ContextMenuRoot consume the same callbacks as
  // before; 3124 + 7 SKIP / 0 fail pre = post expected.
  //
  // `dcmLauncher` + `odxPath` are passed in as args (cross-flow
  // parameter pattern per lesson
  // `cross-flow-state-reads-must-flow-through-hook-parameters`):
  // they are owned by App.tsx shell because the JSX (line ~606 +
  // line ~1328) consumes `dcmLauncher.state.mode` and `odxPath` for
  // other concerns. Flow 2 (T2) will move them to the file-viewer
  // hook; Flow 3 (T3) will read `odxModal` from Flow 2 via parameter.
  const {
    // 9 callbacks
    handleOpenDcmConfig,
    handleMenuSelectEcucModule,
    handleAddEcucFromBswmd,
    handleCloseEcucPicker,
    handleConfirmEcucPicker,
    handleContextMenu,
    handleGenerateClick,
    handleContextMenuAction,
    toggleScriptPanel,
    // 3 state slots (read-only)
    ecucPickerOpen,
    preSelectedBswmdPath,
    scriptPanelOpen,
    // 1 derived value
    canSelectEcucModule,
  } = useAppMainHandlers({ dcmLauncher, odxPath });

  // v1.21.0 MINOR T1 — BSW code generator GUI bridge. App owns the
  // `useGenerateCode` hook so the success / failure toasts route
  // through the global ErrorBanner (consistent with every other
  // async action in App). AppHeader just owns the button enabled-
  // state + click forwarding. The hook wraps `generate.generate()`
  // via closure but the launcher object stays in shell for the
  // `generate.state === 'running'` -> `generateBusy` prop.
  const generate = useGenerateCode();

  // Store subscriptions owned by App.tsx shell (not in the hook):
  // `viewMode` → drives `isImportMerged` (used by JSX line ~967);
  // `project` + `projectPath` → drive `canGenerate` (used by
  // AppHeader prop line ~635); `locale` + `setInfo` → used by Flow
  // 4 inline callbacks (stay in shell) and by DbcImportWizard onApply
  // (also inline in JSX). The hook reads its own ephemeral values
  // via `useArxmlStore.getState()` inside callback bodies.
  const viewMode = useArxmlStore((s) => s.viewMode);
  const isImportMerged = viewMode === 'import-merged';
  const projectForGenerate = useArxmlStore((s) => s.project);
  const projectPathForGenerate = useArxmlStore((s) => s.projectPath);
  const locale = useArxmlStore((s) => s.locale);
  const setInfo = useArxmlStore((s) => s.setInfo);

  // v1.42.1 MINOR T2 — extract file-viewer handlers (DBC viewer +
  // ODX viewer) into a closure-scoped hook. 4 callbacks + 2 state
  // slots + 2 in-flight refs, all previously inlined in App.tsx.
  // The hook preserves all closure dependencies (useCallback deps
  // arrays unchanged) and all store subscription semantics (read-once
  // via getState() for ephemeral locale reads; subscribe for the
  // dbcModal/odxModal state).
  //
  // `odxPath` is NOT passed as an arg because DBC + ODX viewers don't
  // read it (they read `activeDocumentPath ?? ''` themselves). The
  // App.tsx shell retains `odxPath` for Flow 3 (`useDiagExtractHandlers`)
  // which will consume it from Flow 2's `odxModal` return value via
  // the cross-flow parameter pattern (T3).
  const {
    // 4 callbacks
    openDbcViewer,
    closeDbcViewer,
    openOdxViewer,
    closeOdxViewer,
    // 2 state slots (read-only — setDbcModal/setOdxModal stay in hook
    // for callback closures; App.tsx shell does not need them as
    // React state)
    dbcModal,
    odxModal,
    // 2 in-flight refs
    dbcInFlight,
    odxInFlight,
  } = useFileViewerHandlers();

  // v1.24.0 MINOR T3 — ODX→Diagnostic Extract export state machine.
  //
  // Mirrors the v1.23.0 T4 DBC wizard / v1.22.0 T3 ODX viewer pattern:
  // a discriminated union for the success dialog state (closed /
  // open-with-payload), plus a separate `diagExtractExporting` ref
  // that survives across the awaited IPC round-trip so a concurrent
  // click cannot race the in-flight call.
  //
  // The "exporting" flag is a useState (not useRef) so the OdxViewer
  // button can read its live value and re-render the disabled label
  // (button text switches to "Exporting…" / "导出中…"). The button's
  // own disabled-when-exporting gate is the in-flight guard; the
  // ref-based `odxInFlight` only protects the upstream ODX-parse
  // round-trip, not this export leg.
  //
  // Three response branches (mirrors the T2 envelope):
  //   1. ok: true → open success dialog with demPath/dcmPath/stats
  //   2. ok: false + kind: 'read-failed' → store error toast
  //   3. ok: false + kind: 'write-failed' → store error toast (with
  //      rolledBack split per the v1.23.1 T1 L1 i18n-bypass-pattern
  //      lesson — localiser owns the diagnostic text)
  type DiagExtractModalState =
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
  const [diagExtractModal, setDiagExtractModal] = useState<DiagExtractModalState>({
    kind: 'closed',
  });
  const [diagExtractExporting, setDiagExtractExporting] = useState(false);
  const handleExportOdxDiagnosticExtract = useCallback(async (): Promise<void> => {
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
  }, [odxModal, diagExtractExporting, setStoreError]);
  const closeDiagExtractDialog = useCallback((): void => {
    setDiagExtractModal({ kind: 'closed' });
  }, []);

  // v1.23.0 T4 — DBC→Com-Stack 3-step wizard state machine. Mirrors
  // the v1.21.0 T4 DBC + v1.22.0 T3 ODX pattern line-for-line
  // (separate modal state, separate in-flight ref). The wizard's
  // state is a 3-arm union: closed (not mounted), pick (Step 1
  // — user picks a DBC file), and preview (Step 2 + 3 — the host
  // has the parsed DBC summary and passes it down as `initialDbc`).
  // The 'pick' arm hosts the openDbc → parseDbc round-trip so the
  // wizard can present a single button that drives the entire
  // upstream flow.
  type DbcImportState =
    | { readonly kind: 'closed' }
    | { readonly kind: 'pick' }
    | {
        readonly kind: 'preview';
        readonly summary: DbcSummary;
        readonly content: string;
      };
  const [dbcImportState, setDbcImportState] = useState<DbcImportState>({ kind: 'closed' });
  const dbcImportInFlight = useRef(false);
  const openDbcImportWizard = useCallback(async (): Promise<void> => {
    if (dbcImportInFlight.current) return;
    dbcImportInFlight.current = true;
    try {
      const api = window.autosarApi;
      if (api === undefined) {
        setStoreError('openDbc API not available');
        return;
      }
      const locale = useArxmlStore.getState().locale;
      const opened = await api.openDbc();
      switch (opened.kind) {
        case 'canceled':
          // User dismissed the dialog — do not open the wizard at all.
          // The T4 brief calls for a 3-step wizard that ONLY appears
          // after a successful DBC pick; if the user cancels at the
          // OS dialog, we return to the workspace with no modal.
          return;
        case 'read-failed':
          setStoreError(t(locale, 'dbc.open.failed', { message: opened.message }));
          return;
        case 'opened':
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
        setStoreError(t(locale, 'dbc.parse.failed', { message: parsed.error.message }));
        return;
      }
      // Transition to the 'preview' arm — the wizard lands directly
      // on Step 2 (Preview) because the host has already done the
      // open + parse round-trip. The DbcSummary is the source of
      // truth for the targetNode dropdown; we keep the raw content
      // in the state so the Apply handler can ship it to the IPC.
      setDbcImportState({
        kind: 'preview',
        summary: parsed.value,
        content: opened.content,
      });
    } finally {
      dbcImportInFlight.current = false;
    }
  }, [setStoreError]);
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
    const state = useArxmlStore.getState();
    const projPath = state.projectPath;
    if (projPath === null) {
      setStoreError(i18nT(locale, 'app.generate.needProject'));
      return;
    }
    setXlsxBatchWizardOpen(true);
  }, [locale, setStoreError]);
  const closeXlsxBatchWizard = useCallback((): void => {
    setXlsxBatchWizardOpen(false);
  }, []);

  // Sprint 16 v1.6.0 W — Onboarding tour wiring. The host reads
  // the tour state + locale from the store and dispatches advance/
  // back/skip/finish actions. The TourProvider renders the overlay
  // inline when `tour.kind === 'running'`. The tour never blocks
  // project work — the overlay's z-index sits above the workspace
  // but below the dialog hosts (PromptRoot / ConfirmRoot).
  const tourState = useArxmlStore((s) => s.tour);
  const dispatchTour = useArxmlStore((s) => s.dispatchTour);
  const tourLocale = useArxmlStore((s) => s.locale);
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

  return (
    <TourProvider
      tourState={tourState}
      locale={tourLocale}
      onAdvance={onTourAdvance}
      onBack={onTourBack}
      onSkip={onTourSkip}
      onFinish={onTourFinish}
    >
      <div className="app-shell">
        <AppHeader
          onEcucModuleSelect={handleMenuSelectEcucModule}
          canSelectEcucModule={canSelectEcucModule}
          scriptPanelOpen={scriptPanelOpen}
          onToggleScriptPanel={toggleScriptPanel}
          onGenerate={handleGenerateClick}
          canGenerate={projectForGenerate !== null && projectPathForGenerate !== null}
          generateBusy={generate.state === 'running'}
          onOpenDbc={openDbcViewer}
          dbcBusy={dbcInFlight.current}
          onOpenOdx={openOdxViewer}
          odxBusy={odxInFlight.current}
          onOpenDbcImport={openDbcImportWizard}
          dbcImportBusy={dbcImportInFlight.current}
          onOpenXlsxBatch={openXlsxBatchWizard}
          xlsxBatchBusy={xlsxBatchInFlight.current}
          onOpenDcmConfig={handleOpenDcmConfig}
          canOpenDcmConfig={canOpenDcmConfig}
          dcmConfigBusy={dcmLauncher.state.mode === 'pending'}
        />
        {/* Sprint 13+ — full-width error strip below the header. Reads
          store.error; AppHeader no longer renders the inline corner
          span. Clicking the message opens <ErrorViewerModal /> for
          the "view 窗口" affordance when the banner itself overflows. */}
        <ErrorBanner />
        <main className="workspace">
          {/* Sprint 13+ Stage 4 Q1 — resizable left/right column.
            `react-resizable-panels` replaces the previous fixed
            `minmax(280px, 30%) 1fr` grid in styles.css with a PanelGroup
            whose column widths the user can drag. Persistence is
            wired via `useDefaultLayout({ groupId: 'workspace' })`
            above (v4 has no `autoSaveId` prop). The Separator element
            is the drag handle — it carries the
            `data-testid="workspace-resize-h"` selector the workspace
            tests target. */}
          <Group
            orientation="horizontal"
            id="workspace"
            defaultLayout={defaultLayout ?? fallbackLayout}
            onLayoutChanged={onLayoutChanged}
          >
            <Panel id="workspace-left" minSize="20%" defaultSize="30%">
              {isImportMerged ? (
                <div className="app-import-merged-column" data-testid="app-import-merged-column">
                  <ModuleSelectionPanel />
                  <DiffTable />
                </div>
              ) : (
                // Sprint A X2 — wire handleContextMenu so a right-click
                // on a Tree row opens the global ContextMenu, which in
                // turn routes back through handleContextMenuAction.
                <LeftPanel
                  onAddEcucFromBswmd={handleAddEcucFromBswmd}
                  onContextMenu={handleContextMenu}
                />
              )}
            </Panel>
            <Separator className="workspace-resize-h" data-testid="workspace-resize-h" />
            <Panel id="workspace-right" data-tour-id="right-pane-content">
              <ParamEditor />
            </Panel>
          </Group>
        </main>
        {scriptPanelOpen && (
          // Sprint 14 / Phase C (T14) — ScriptPanel sits below the
          // resizable workspace as a fixed-height strip; lazy-rendered
          // so CodeMirror is only loaded when the user explicitly opens
          // the panel (the panel toggle is in AppHeader).
          <div className="app-script-panel-host" data-testid="app-script-panel-host">
            <ScriptPanel />
          </div>
        )}
        <ArxmlPanel />

        {/* v1.21.0 Bug #5 — DBC viewer. Mounted at the root so the
            backdrop + modal sit above every workspace layer (same
            z-index strategy as the dialog hosts below). The modal is
            only in the DOM when `dbcModal.kind` is 'open' or 'error'. */}
        {dbcModal.kind !== 'closed' && (
          <DbcViewer
            open
            path={dbcModal.kind === 'open' ? dbcModal.path : ''}
            summary={dbcModal.kind === 'open' ? dbcModal.summary : null}
            error={dbcModal.kind === 'error' ? dbcModal.message : undefined}
            locale={useArxmlStore.getState().locale}
            onClose={closeDbcViewer}
          />
        )}

        {/* v1.22.0 T3 — ODX viewer. Mirrors the DBC viewer mount:
            root-level (backdrop above all workspace layers), z-index
            9996 inside the modal CSS, modal only in DOM when
            `odxModal.kind` is 'open' or 'error'. Decoupled state
            machine from DBC so a slow DBC parse does not block ODX
            import (and vice versa). */}
        {odxModal.kind !== 'closed' && (
          <OdxViewer
            open
            path={odxModal.kind === 'open' ? odxModal.path : ''}
            summary={odxModal.kind === 'open' ? odxModal.summary : null}
            error={odxModal.kind === 'error' ? odxModal.message : undefined}
            locale={useArxmlStore.getState().locale}
            onClose={closeOdxViewer}
            onExport={handleExportOdxDiagnosticExtract}
            exporting={diagExtractExporting}
          />
        )}

        {/* v1.24.0 MINOR T3 — Diagnostic Extract success dialog.
            Mounted at the root so its z-index 9997 sits above the
            OdxViewer (9996). Only in DOM while `diagExtractModal.kind`
            is 'open' — the dialog is dismissable via the close
            button, Escape, or backdrop-click (mirrors OdxViewer
            a11y pattern). */}
        {diagExtractModal.kind === 'open' && (
          <DiagnosticExtractSuccessDialog
            open
            demPath={diagExtractModal.demPath}
            dcmPath={diagExtractModal.dcmPath}
            stats={diagExtractModal.stats}
            locale={useArxmlStore.getState().locale}
            onClose={closeDiagExtractDialog}
          />
        )}

        {/* v1.23.0 T4 — DBC→Com-Stack 3-step wizard. Mounted at the
            root so the backdrop + modal sit above every workspace
            layer (z-index 9998 inside the wizard CSS). The wizard
            lands directly on the Preview step (Step 2) because the
            host (App.tsx) already completed the openDbc → parseDbc
            round-trip in `openDbcImportWizard` before transitioning
            the state. The Apply handler calls the v1.23.0 T3 IPC
            and reloads the project on success so the updated
            Com/CanIf/PduR ARXMLs are re-parsed into the store. */}
        {dbcImportState.kind === 'preview' && (
          <DbcImportWizard
            onClose={closeDbcImportWizard}
            initialDbc={dbcImportState.summary}
            dbcContent={dbcImportState.content}
            locale={useArxmlStore.getState().locale}
            onApply={async (dbcContent: string, targetNode: string): Promise<void> => {
              const api = window.autosarApi;
              if (api === undefined) {
                throw new Error('dbcImportComStack API not available');
              }
              // Re-read project / projectPath at apply time (not
              // subscribed) so a stale closure never ships a stale
              // manifest to the IPC. The store is the SoT.
              const state = useArxmlStore.getState();
              const proj = state.project;
              const projPath = state.projectPath;
              const loc = state.locale;
              if (proj === null || projPath === null) {
                throw new Error('No project open');
              }
              const res = await api.dbcImportComStack({
                dbcContent,
                projectManifestPath: projPath,
                manifest: proj,
                targetNode,
              });
              if (!res.ok) {
                // Map the typed error kind to a localized toast key.
                const key =
                  res.error.kind === 'bridge-failed'
                    ? 'dbc.import.error.bridge'
                    : res.error.kind === 'write-failed'
                      ? 'dbc.import.error.write'
                      : 'dbc.import.error.read';
                const baseMessage = t(loc, key, { message: res.error.message });
                // v1.23.1 T1 — the 2-phase write reports `rolledBack` so
                // the user knows whether the project is in a clean
                // state (rolledBack=true) or partially-bridged
                // (rolledBack=false — they need to check git status).
                // The localiser owns the diagnostic text via 2
                // dedicated keys (code-review MEDIUM-1: previously a
                // hardcoded English template-string concatenation).
                if (res.error.kind === 'write-failed') {
                  setStoreError(
                    res.error.rolledBack
                      ? t(loc, 'dbc.import.error.write.rolledBack', { message: res.error.message })
                      : t(loc, 'dbc.import.error.write.partial', { message: res.error.message }),
                  );
                } else {
                  setStoreError(baseMessage);
                }
                throw new Error(res.error.message);
              }
              // Success — surface a confirmation toast AND reload the
              // project so the store re-parses the 3 freshly-written
              // ARXMLs + any BSWMDs. Without the reload, the user
              // sees stale ECUC values until they manually reopen
              // the project. `project:reload` is the non-dialog
              // counterpart to `project:open` (T4 PATCH HIGH-1):
              // takes the already-known manifest path and re-reads
              // the bundle in one round-trip.
              //
              // Split the response's flat `files[]` back into docs
              // vs BSWMDs so `useArxmlStore.openProject` can consume
              // it in the same shape `useProjectActions.openProject`
              // supplies (matches by manifest-relative `rel` for docs,
              // by absolute path for BSWMDs).
              try {
                const reload = await api.projectReload({ manifestPath: projPath });
                if (reload.kind === 'read-failed') {
                  // Don't fail the apply — the 3-file write already
                  // succeeded. Surface the reload failure as a
                  // localized warning so the user knows the in-memory
                  // store is stale and can manually reopen.
                  setStoreError(t(loc, 'app.error.openProjectFailed', { message: reload.message }));
                } else {
                  const docs: { rel: string; path: string; content: string }[] = [];
                  const bswmds: { rel: string; path: string; content: string }[] = [];
                  const docsRelSet = new Set(proj.valueArxmlPaths);
                  for (const f of reload.files) {
                    const rel = toManifestRelative(projPath, f.path) ?? f.path;
                    if (docsRelSet.has(rel)) {
                      docs.push({ rel, path: f.path, content: f.content });
                    } else {
                      bswmds.push({ rel, path: f.path, content: f.content });
                    }
                  }
                  useArxmlStore.getState().openProject({
                    manifestPath: projPath,
                    manifest: reload.manifest,
                    docs,
                    bswmds,
                  });
                }
              } catch (reloadErr) {
                // Belt-and-braces — `projectReload` is async + IPC;
                // a hard reject (channel missing, etc.) should not
                // sink the apply-success toast.
                setStoreError(
                  t(loc, 'app.error.openProjectFailed', {
                    message: reloadErr instanceof Error ? reloadErr.message : String(reloadErr),
                  }),
                );
              }
              // HIGH-2 (v1.23.0 PATCH) — total added counts across all
              // 3 ECUC files (Com / CanIf / PduR). The Preview step
              // shows "N messages will be imported" using
              // `dbc.messages.length`; matching the success toast to
              // the same total (not just `com`) keeps the contract
              // honest if the bridge drops a message at CanIf/PduR.
              const totalAdded =
                res.value.addedCounts.com +
                res.value.addedCounts.canIf +
                res.value.addedCounts.pduR;
              setInfo(t(loc, 'dbc.import.success', { count: totalAdded }));
              closeDbcImportWizard();
            }}
          />
        )}

        {/* v1.25.0 T5 — Excel→Com-Stack ECUC batch 3-step wizard.
            Mounted at the root so the backdrop + modal sit above
            every workspace layer (z-index 9997 inside the wizard
            CSS — sits below DbcImportWizard at 9998 so an unfinished
            import cannot block a DBC import click). The wizard
            owns the 3-IPC round-trip internally (writeBatchTemplate
            / parseBatch / commitBatch); the host only owns
            open/close + per-error / per-success toasts + the
            post-commit project reload (mirrors the v1.23.0 T4 DBC
            wizard pattern). */}
        {xlsxBatchWizardOpen && (
          <XlsxBatchWizard
            onClose={closeXlsxBatchWizard}
            projectManifestPath={useArxmlStore.getState().projectPath ?? ''}
            locale={useArxmlStore.getState().locale}
            onError={(message: string): void => {
              setStoreError(message);
            }}
            onSuccess={(summary: string): void => {
              setInfo(summary);
              // Post-commit project reload — mirrors the v1.23.0 T4
              // DBC wizard's reload flow so the store re-parses the
              // freshly-written Com / CanIf / PduR ARXMLs. Without
              // the reload, the user sees stale ECUC values until
              // they manually reopen the project.
              const api = window.autosarApi;
              if (api !== undefined) {
                const projPath = useArxmlStore.getState().projectPath;
                if (projPath !== null) {
                  void api
                    .projectReload({ manifestPath: projPath })
                    .then((reload) => {
                      if (reload.kind === 'read-failed') {
                        setStoreError(
                          t(useArxmlStore.getState().locale, 'app.error.openProjectFailed', {
                            message: reload.message,
                          }),
                        );
                      } else {
                        const proj = useArxmlStore.getState().project;
                        if (proj !== null) {
                          const docs: { rel: string; path: string; content: string }[] = [];
                          const bswmds: { rel: string; path: string; content: string }[] = [];
                          const docsRelSet = new Set(proj.valueArxmlPaths);
                          for (const f of reload.files) {
                            const rel = toManifestRelative(projPath, f.path) ?? f.path;
                            if (docsRelSet.has(rel)) {
                              docs.push({ rel, path: f.path, content: f.content });
                            } else {
                              bswmds.push({ rel, path: f.path, content: f.content });
                            }
                          }
                          useArxmlStore.getState().openProject({
                            manifestPath: projPath,
                            manifest: reload.manifest,
                            docs,
                            bswmds,
                          });
                        }
                      }
                    })
                    .catch((reloadErr: unknown) => {
                      setStoreError(
                        t(useArxmlStore.getState().locale, 'app.error.openProjectFailed', {
                          message:
                            reloadErr instanceof Error ? reloadErr.message : String(reloadErr),
                        }),
                      );
                    });
                }
              }
            }}
          />
        )}

        {/* Dialog hosts (Sprint 12 #2 + Sprint 12 #3). Mounted at the
          root so their portals (rendering into document.body) sit on
          top of every workspace layer. */}
        <PromptRoot />
        {/* ConfirmRoot BEFORE NewProjectDialog: ConfirmRoot installs the
          module-level externalSetState handle used by `confirm()`;
          submitNewProject (Task 5) calls `confirm()` from inside
          NewProjectDialog.onSubmit, so ConfirmRoot must mount first. */}
        <ConfirmRoot />
        {/* v1.36.0 MINOR T4 — 2-button destructive confirm modal
            (separate from <ConfirmRoot /> which is the 3-button
            unsaved-changes modal). Mounted as a sibling; the
            module-level confirmDestructive() API resolves with
            'confirm' or 'cancel'. */}
        <ConfirmRoot2 />
        {/* Sprint 15 / Phase 3.3 — CascadeConfirmRoot hosts the 3-option
          cascade confirm dialog shown when the user requests a
          delete-container on a node with 1+ incoming references. It
          installs its own module-level `externalSetState` handle used
          by `confirmCascade()` (called from useArxmlStore.deleteContainer
          — see Phase 2). Mounted last because it depends on no other
          dialog; no cross-mount ordering requirement. */}
        <CascadeConfirmRoot />
        {/* Sprint 17 P2 — RemoveModuleConfirmRoot hosts the 4-option
          BSWMD-remove confirm dialog (cancel / only / cascade /
          cascade-and-unlink). The 4th option unlinks the BSWMD file
          from disk on top of cascade — fired by
          `confirmRemoveBswmd()` from `useProjectActions.removeBswmdWithFullFlow`.
          Distinct from CascadeConfirmDialog (3-option) because the
          4th option's semantics have no ECUC analog. */}
        <RemoveModuleConfirmRoot />
        <NewProjectDialog onSubmit={handleNewProjectSubmit} />
        {/* Sprint 14 / Task 11 — ECUC picker. Hosted at App.tsx so any
          sibling entry point (AppHeader menu / ProjectPanel row chip)
          can flip its `open` flag. Renders into document.body via
          its own portal (z-index 9994) so it sits above the workspace
          but below the confirm dialogs. The picker reads BSWMD state
          from the store; we only own open/close + pre-selection. */}
        <ModuleFromBswmdPicker
          open={ecucPickerOpen}
          projectDir={(() => {
            const pp = useArxmlStore.getState().projectPath;
            return pp !== null ? pp.replace(/[\\/][^\\/]+$/, '') : '';
          })()}
          preSelectedBswmdPath={preSelectedBswmdPath}
          onConfirm={handleConfirmEcucPicker}
          onClose={handleCloseEcucPicker}
        />
        {/* Sprint A X2 — P0-3 wiring. Mount the two dialog hosts that
          back the Tree right-click flow:
            - <BswmdPickerRoot /> (z-index 9995): subscribes to
              useArxmlStore.bswmdPicker; opens when the menu emits an
              'add-*' action. The host action handles Done → close.
            - <ContextMenuRoot onAction={handleContextMenuAction} /> (z-index 9998):
              module-level externalSetState API; opens when
              openContextMenu() is called from TreeNode.onContextMenu.
              Note: ContextMenuRoot sits at a HIGHER z-index than
              BswmdPickerRoot so a click on the picker closes the menu
              without overlap collisions.
          The two hosts share no internal state; App.tsx is the single
          router between them (handleContextMenuAction), keeping each
          component decoupled from the other's update path. */}
        <BswmdPickerRoot />
        <ContextMenuRoot onAction={handleContextMenuAction} locale={locale} />
        {/* v1.31.0 PATCH T7 — Dcm config renderer UX. Both components
            are presentational; the launcher hook owns the state
            machine. The success dialog is unconditionally mounted
            but the component itself early-returns null when `open`
            is false (see T2 DcmConfigSuccessDialog.tsx:55), so the
            non-null assertion on `launcher.state.result!` is safe —
            see the state machine invariant note above. The error
            toast follows the same pattern (T1 DcmConfigErrorToast.tsx
            returns null when error is null). */}
        <DcmConfigSuccessDialog
          open={dcmLauncher.state.dialogOpen}
          result={dcmLauncher.state.result!}
          locale={locale}
          onClose={dcmLauncher.closeDialog}
          onGenerateNew={dcmLauncher.handleGenerateNew}
          history={useArxmlStore((s) => s.xlsxImportHistory)}
          onReuseFromHistory={(importedAt) => useArxmlStore.getState().reuseFromHistory(importedAt)}
        />
        <DcmConfigErrorToast
          error={dcmLauncher.state.error}
          locale={locale}
          onDismiss={dcmLauncher.dismissToast}
        />
        {/* v1.32.0 MINOR T8 — ODX picker thin wrapper (T6). Mounts
            only while the launcher's state is `picking-odx`; the
            component itself returns null so DOM-wise it is a ghost.
            The locale + resolve/cancel callbacks come straight off
            the launcher hook (T5's `handlePickerResolve` /
            `handlePickerCancel`).
            v1.33.0 MINOR T7 — `defaultPath` is the project root
            directory (parent of the manifest file), or the parent
            directory of the resolved Dcm BSWMD path when no project
            is open. The split handles both / and \\ so Windows paths
            are stripped correctly. The picker forwards this to the
            `odx:open-with-default` IPC (v1.33.0 T3) so the OS
            dialog opens at a meaningful starting location. We use
            `useArxmlStore.getState()` instead of subscribing so a
            re-render is not forced on every projectPath change
            (matches the picker-host convention at line 1258). */}
        {dcmLauncher.state.mode === 'picking-odx' && (
          <DcmConfigPicker
            locale={locale === 'zh-CN' ? 'zh-CN' : 'en'}
            defaultPath={(() => {
              const pp = useArxmlStore.getState().projectPath;
              if (pp !== null) {
                return pp.replace(/[\\/][^\\/]+$/, '');
              }
              return bswmdHasDcm.dcmBswmdPath?.split(/[/\\]/).slice(0, -1).join('/');
            })()}
            onResolve={dcmLauncher.handlePickerResolve}
            onCancel={dcmLauncher.handlePickerCancel}
          />
        )}
      </div>
    </TourProvider>
  );
}
