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

import { themeLight } from 'dockview';
import { DockviewReact } from 'dockview-react';
import type { DockviewApi, DockviewReadyEvent, IDockviewPanelProps } from 'dockview-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import 'dockview/dist/styles/dockview.css';

import { t } from '@shared/i18n/index.js';
import { dirname, toManifestRelative } from '@shared/path';

import { useAppMainHandlers } from './app/useAppMainHandlers';
import { useDiagExtractHandlers } from './app/useDiagExtractHandlers';
import { useFileViewerHandlers } from './app/useFileViewerHandlers';
import { useWizardHandlers } from './app/useWizardHandlers';
import { AppHeader } from './components/AppHeader';
import { ArxmlPanel } from './components/ArxmlPanel';
import { DbcImportWizard } from './components/DbcImportWizard';
import { DbcViewer } from './components/DbcViewer';
import { DiagnosticExtractSuccessDialog } from './components/DiagnosticExtractSuccessDialog';
import { DiffTable } from './components/DiffTable';
import { ErrorBanner } from './components/ErrorBanner';
import { ModuleSelectionPanel } from './components/ModuleSelectionPanel';
import type { NewProjectSubmitOpts } from './components/NewProjectDialog';
import { OdxViewer } from './components/OdxViewer';
import { PanelErrorBoundary } from './components/PanelErrorBoundary';
import { ScriptPanel } from './components/ScriptPanel';
import { XlsxBatchWizard } from './components/XlsxBatchWizard';
import { ParamEditor } from './components/editor/ParamEditor';
import { AppShell } from './hooks/useAppShell';
import { useBswmdHasDcm } from './hooks/useBswmdHasDcm';
import { useDcmConfigLauncher } from './hooks/useDcmConfigLauncher';
import { useDebouncedValidation } from './hooks/useDebouncedValidation';
import { useGenerateCode } from './hooks/useGenerateCode';
import { useProjectActions } from './hooks/useProjectActions';
import { useSwsValidatorRunner } from './hooks/useSwsValidatorRunner';
import { TourProvider } from './onboarding/TourProvider.js';
import { WorkspaceContext } from './panels/WorkspaceContext.js';
import { PANEL_REGISTRY, getPanelDef } from './panels/registry.js';
import type { PanelId } from './panels/registry.js';
import { loadLayout, saveLayout, clearLayout } from './panels/useDockLayout.js';
import { useArxmlStore } from './store/useArxmlStore';
import { attachXlsxHistoryBootstrap } from './store/xlsxImportHistoryBootstrap.js';
import { attachXlsxImportListener } from './store/xlsxImportListener.js';

function buildDefaultLayout(api: DockviewApi): void {
  // P4 default layout: left 30% vertical split (tabs top, tree bottom) + right param-editor
  api.addPanel({ id: 'project', component: 'project' });
  api.addPanel({
    id: 'files',
    component: 'files',
    position: { referencePanel: 'project', direction: 'within' },
  });
  api.addPanel({
    id: 'validation',
    component: 'validation',
    position: { referencePanel: 'project', direction: 'within' },
  });
  api.addPanel({
    id: 'arxml-tree',
    component: 'arxml-tree',
    position: { referencePanel: 'project', direction: 'below' },
  });
  api.addPanel({
    id: 'param-editor',
    component: 'param-editor',
    position: { referencePanel: 'project', direction: 'right' },
  });
}

const panelComponents: Record<string, React.FunctionComponent<IDockviewPanelProps>> = {};
for (const def of PANEL_REGISTRY) {
  panelComponents[def.id] = def.component as React.FunctionComponent<IDockviewPanelProps>;
}

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

  // P3 Dock 工作台 (spec §5) — dockview replaces react-resizable-panels
  // for the main workspace split. Layout persists to localStorage via
  // useDockLayout (autosarcfg.layout.v1, schema version 1, 500ms debounce).
  const dockApiRef = useRef<DockviewApi | null>(null);

  const handleDockReady = useCallback((event: DockviewReadyEvent): void => {
    const api = event.api;
    dockApiRef.current = api;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedSave = (): void => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        saveLayout(api.toJSON() as unknown as Record<string, unknown>);
        debounceTimer = null;
      }, 500);
    };
    api.onDidLayoutChange(() => debouncedSave());
    // Register listener BEFORE building/restoring layout so the initial
    // addPanel / fromJSON events are captured by the debounce.
    const stored = loadLayout();
    if (stored) {
      try {
        api.fromJSON(stored as never);
      } catch {
        console.warn('[dock-layout] fromJSON failed, building default layout');
        buildDefaultLayout(api);
      }
    } else {
      buildDefaultLayout(api);
    }
    const flushOnUnload = (): void => {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        saveLayout(api.toJSON() as unknown as Record<string, unknown>);
      }
    };
    window.addEventListener('beforeunload', flushOnUnload);
  }, []);

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
  const { submitNewProject, newProject, openProjectFromDialog } = useProjectActions();
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

  // v1.42.1 MINOR T3 — extract diag-extract handlers. The hook
  // takes `odxModal` as an arg from Flow 2's `useFileViewerHandlers`
  // return (cross-flow parameter pattern per lesson
  // `cross-flow-state-reads-must-flow-through-hook-parameters`).
  // This is the 3rd confirmation for that lesson (1st: T1 used
  // dcmLauncher + odxPath as args; 2nd: T2 set up the contract for
  // T3 to consume odxModal as arg; 3rd: T3 actually consumes it).
  const {
    // 2 callbacks (Flow 3: ODX→Diagnostic Extract)
    handleExportOdxDiagnosticExtract,
    closeDiagExtractDialog,
    // 2 read-only state slots (consumed by OdxViewer onExport prop
    // + DiagnosticExtractSuccessDialog mount)
    diagExtractModal,
    diagExtractExporting,
  } = useDiagExtractHandlers({ odxModal });
  const workspaceCtx = useMemo(
    () => ({
      handleAddEcucFromBswmd,
      handleContextMenu: handleContextMenu as never,
      openProjectFromDialog,
      newProject,
      dbcOpen: dbcModal.kind !== 'closed',
      dbcPath: dbcModal.kind === 'open' ? dbcModal.path : '',
      dbcSummary: dbcModal.kind === 'open' ? dbcModal.summary : null,
      dbcOnClose: closeDbcViewer,
      odxOpen: odxModal.kind !== 'closed',
      odxPath: odxModal.kind === 'open' ? odxModal.path : '',
      odxSummary: odxModal.kind === 'open' ? odxModal.summary : null,
      odxOnClose: closeOdxViewer,
      odxOnExport: handleExportOdxDiagnosticExtract,
      odxExporting: diagExtractExporting,
    }),
    [
      handleAddEcucFromBswmd,
      handleContextMenu,
      openProjectFromDialog,
      newProject,
      dbcModal,
      closeDbcViewer,
      odxModal,
      closeOdxViewer,
      handleExportOdxDiagnosticExtract,
      diagExtractExporting,
    ],
  );

  const handleTogglePanel = useCallback(
    (panelId: PanelId): void => {
      const api = dockApiRef.current;
      if (!api) return;
      const existing = api.getPanel(panelId);
      if (existing) {
        existing.api.setActive();
        return;
      }
      const def = getPanelDef(panelId);
      if (!def) return;
      if (def.defaultGroup === 'viewer' || def.defaultGroup === 'center') {
        const paramEditor = api.getPanel('param-editor');
        if (paramEditor) {
          api.addPanel({
            id: panelId,
            component: panelId,
            title: t(locale, def.titleKey as Parameters<typeof t>[1]),
            position: { referencePanel: 'param-editor', direction: 'within' },
          });
          return;
        }
      }
      if (def.defaultGroup === 'bottom') {
        const scriptPanel = api.getPanel('script-panel');
        if (scriptPanel) {
          api.addPanel({
            id: panelId,
            component: panelId,
            title: t(locale, def.titleKey as Parameters<typeof t>[1]),
            position: { referencePanel: 'script-panel', direction: 'within' },
          });
          return;
        }
        const paramEditor = api.getPanel('param-editor');
        if (paramEditor) {
          api.addPanel({
            id: panelId,
            component: panelId,
            title: t(locale, def.titleKey as Parameters<typeof t>[1]),
            position: { referencePanel: 'param-editor', direction: 'below' },
          });
          return;
        }
      }
      api.addPanel({
        id: panelId,
        component: panelId,
        title: t(locale, def.titleKey as Parameters<typeof t>[1]),
      });
    },
    [locale],
  );

  const handleResetLayout = useCallback((): void => {
    clearLayout();
    const api = dockApiRef.current;
    if (!api) return;
    api.clear();
    buildDefaultLayout(api);
  }, []);

  // v1.24.0 MINOR T3 — ODX→Diagnostic Extract export state machine.
  //
  // Mirrors the v1.23.0 T4 DBC wizard / v1.22.0 T3 ODX viewer pattern:
  // a discriminated union for the success dialog state (closed /
  // v1.24.0 MINOR T3 — ODX→Diagnostic Extract export state machine.
  // The `useDiagExtractHandlers` hook (defined in
  // `src/renderer/app/useDiagExtractHandlers.ts`) owns:
  //   - the `diagExtractModal` (closed / open-with-payload) state
  //   - the `diagExtractExporting` flag (useState, NOT useRef, so
  //     the OdxViewer button can read its live value and re-render
  //     the disabled label — button text switches to "Exporting…" /
  //     "导出中…"; the button's own disabled-when-exporting gate is
  //     the in-flight guard; the ref-based `odxInFlight` (Flow 2) only
  //     protects the upstream ODX-parse round-trip, not this export
  //     leg)
  //   - the 3 response branches (mirrors the T2 envelope):
  //     1. ok: true → open success dialog with demPath/dcmPath/stats
  //     2. ok: false + kind: 'read-failed' → store error toast
  //     3. ok: false + kind: 'write-failed' → store error toast
  //        (with rolledBack split per the v1.23.1 T1 L1 i18n-bypass
  //        pattern lesson — localiser owns the diagnostic text)
  // `useDiagExtractHandlers({ odxModal })` was called above (line
  // ~310) and returned `handleExportOdxDiagnosticExtract`,
  // `closeDiagExtractDialog`, and `diagExtractExporting` — all
  // consumed by JSX at line ~660 (OdxViewer onExport +
  // DiagnosticExtractSuccessDialog onClose + exporting prop).

  // v1.42.1 MINOR T4a — extract wizard + tour handlers into a
  // closure-scoped hook. 8 callbacks + 2 state slots + 2 in-flight
  // refs, all previously inlined in App.tsx. The hook preserves all
  // closure dependencies (useCallback deps arrays unchanged where
  // applicable) and all store subscription semantics (read-once via
  // getState() for ephemeral reads; subscribe for stable store
  // action refs).
  //
  // `tourState` + `tourLocale` are NOT exposed via the hook return —
  // they stay subscribed in the App.tsx shell because the
  // TourProvider JSX mount at line ~462+ consumes them directly.
  // This matches the T1 spec note about "viewMode isImportMerged"
  // (similar shape — derived value read at JSX level, not in a
  // hook).
  //
  // **The DbcImportWizard `onApply` callback is INLINE in JSX
  // (line ~660+ in App.tsx) and stays in App.tsx shell** per the
  // plan's T4a spec note — it reads from `useArxmlStore.getState()`
  // directly, is defined inline in JSX (not `const handler =
  // useCallback(...)`), and is called only by the JSX (single
  // caller). It does not need extraction.
  const {
    // 4 wizard callbacks
    openDbcImportWizard,
    closeDbcImportWizard,
    openXlsxBatchWizard,
    closeXlsxBatchWizard,
    // 4 tour callbacks
    onTourAdvance,
    onTourBack,
    onTourSkip,
    onTourFinish,
    // 2 read-only state slots
    dbcImportState,
    xlsxBatchWizardOpen,
    // 2 in-flight refs
    dbcImportInFlight,
    xlsxBatchInFlight,
  } = useWizardHandlers();

  // tour state + locale subscribed in shell (consumed by TourProvider
  // JSX mount at line ~462+; not exposed via the hook return).
  const tourState = useArxmlStore((s) => s.tour);
  const tourLocale = useArxmlStore((s) => s.locale);

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
          onTogglePanel={handleTogglePanel}
          onResetLayout={handleResetLayout}
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
          {isImportMerged ? (
            <div
              className="app-import-merged-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(280px, 30%) 1fr',
                height: '100%',
              }}
            >
              <div className="app-import-merged-column" data-testid="app-import-merged-column">
                <ModuleSelectionPanel />
                <DiffTable />
              </div>
              <div data-tour-id="right-pane-content">
                <PanelErrorBoundary panel="param-editor" locale={locale}>
                  <ParamEditor onOpenProject={openProjectFromDialog} onNewProject={newProject} />
                </PanelErrorBoundary>
              </div>
            </div>
          ) : (
            <WorkspaceContext.Provider value={workspaceCtx}>
              <div style={{ height: '100%', width: '100%' }}>
                <DockviewReact
                  components={panelComponents}
                  onReady={handleDockReady}
                  theme={themeLight}
                />
              </div>
            </WorkspaceContext.Provider>
          )}
        </main>
        {scriptPanelOpen && (
          // Sprint 14 / Phase C (T14) — ScriptPanel sits below the
          // resizable workspace as a fixed-height strip; lazy-rendered
          // so CodeMirror is only loaded when the user explicitly opens
          // the panel (the panel toggle is in AppHeader).
          <div className="app-script-panel-host" data-testid="app-script-panel-host">
            <PanelErrorBoundary panel="script-panel" locale={locale}>
              <ScriptPanel />
            </PanelErrorBoundary>
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
                  // Bug 6 FIX — toManifestRelative expects a manifest
                  // DIRECTORY, not a manifest file path. Passing
                  // projPath (the manifest file) caused toManifestRelative
                  // to fail on every docs entry: the file path's
                  // prefix includes `111.autosarcfg.json` which
                  // never matches the docs prefix `ecuc/...`, so the
                  // docs round-trip dropped to bswmds and state.documents
                  // came back empty (manifest showed "project open"
                  // because state.project != null, but Tree was empty
                  // because no doc hydrated). User confirmed via
                  // window.alert at commit 025a015.
                  const manifestDir = dirname(projPath);
                  const docs: { rel: string; path: string; content: string }[] = [];
                  const bswmds: { rel: string; path: string; content: string }[] = [];
                  const docsRelSet = new Set(proj.valueArxmlPaths);
                  for (const f of reload.files) {
                    const rel = toManifestRelative(manifestDir, f.path) ?? f.path;
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
              const totalAdded =
                res.value.addedCounts.com +
                res.value.addedCounts.canIf +
                res.value.addedCounts.pduR;
              const afterState = useArxmlStore.getState();
              afterState.setSuccess(t(loc, 'dbc.import.success', { count: totalAdded }));
              const diag =
                `proj=${afterState.project !== null ? 'YES' : 'NULL'} ` +
                `projPath=${afterState.projectPath !== null ? 'YES' : 'NULL'} ` +
                `docs=${afterState.documents.length} ` +
                `paths=${afterState.documentPaths.length} ` +
                `viewMode=${afterState.viewMode} ` +
                `displayDoc.pkg=${afterState.displayDoc?.packages.length ?? 0}`;
              afterState.appendDiagnostic({
                level: 'debug',
                source: 'dbc-import',
                message: 'Bug6 post-apply store state',
                detail: diag,
                correlationId: 'bug6',
              });
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
                          // Bug 6 fix — same dirname normalisation as
                          // the dBC apply path above; toManifestRelative
                          // expects the manifest directory, not the
                          // manifest file path.
                          const xlsxManifestDir = dirname(projPath);
                          const docs: { rel: string; path: string; content: string }[] = [];
                          const bswmds: { rel: string; path: string; content: string }[] = [];
                          const docsRelSet = new Set(proj.valueArxmlPaths);
                          for (const f of reload.files) {
                            const rel = toManifestRelative(xlsxManifestDir, f.path) ?? f.path;
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

        {/* v1.46.1 PATCH T2 — Dialog hosts extracted into AppShell component
          (clipped VERBATIM per lesson
          `function-extract-must-clip-verbatim-not-reimplement` 2/3).
          See src/renderer/hooks/useAppShell.tsx for the 117-LoC dialog
          block that previously lived here. Mount order preserved:
          ConfirmRoot before NewProjectDialog. */}
        <AppShell
          locale={locale}
          ecucPickerOpen={ecucPickerOpen}
          preSelectedBswmdPath={preSelectedBswmdPath}
          handleConfirmEcucPicker={handleConfirmEcucPicker}
          handleCloseEcucPicker={handleCloseEcucPicker}
          handleContextMenuAction={handleContextMenuAction}
          handleNewProjectSubmit={handleNewProjectSubmit}
          dcmLauncher={dcmLauncher}
          bswmdHasDcm={{ dcmBswmdPath: bswmdHasDcm.dcmBswmdPath }}
        />
      </div>
    </TourProvider>
  );
}
