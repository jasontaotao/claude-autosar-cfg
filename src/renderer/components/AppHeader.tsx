// AppHeader: slim top bar — EB tresos-style dropdown for low-frequency
// project/file operations, toolbar buttons for high-frequency Save
// actions.
//
// Sprint 13+ — historical features removed (kept as breadcrumbs so the
// file header documents the evolution; the JSX at lines ~552 / ~752 /
// ~798 carries the matching `Sprint 13+ — removed` notes):
//   - Sprint 10 #2 doc-tab strip (app-doc-tabs) + active-doc basename
//     display (app-doc-name) + AUTOSAR-version chip (app-doc-version).
//     Documents are now navigable via the LeftPanel "files" tab
//     (FileListTab); `activeDocumentPath`, `documentPaths`,
//     `setActiveDocument`, and `removeDocument` were dropped from this
//     component as part of the removal.
//   - Sprint 11 Phase 1 project handler bodies (New / Open Project /
//     Save Project). Moved to `useProjectActions()` (Sprint 14+
//     extraction); AppHeader routes clicks through that hook and just
//     owns the project chip × close flow.
//
// Current responsibilities:
//   - EB tresos-style dropdown for low-frequency actions (New / Open
//     Project / Open ARXML / ECUC Module Selection).
//   - Toolbar buttons for high-frequency Save actions (Save Project /
//     Save ARXML / Save All — Sprint 16b T7) and the ScriptPanel
//     toggle (right section, Phase C / T14).
//   - Project chip with × close on the right section.
//   - i18n via `t(locale, key)`; a 中/EN toggle in the header switches
//     `store.locale`.
//   - App version display on the far right (PATCH-B + v1.12.0 D3
//     fallback chain: undefined API → 'dev'; missing method → '?';
//     rejected IPC → '?').
//
// Menu redesign (EB tresos style):
//   - Low-frequency actions moved into a hover-to-open dropdown menu.
//   - High-frequency actions remain as toolbar buttons.
//   - Project chip moved to the right section.

import { useEffect, useState } from 'react';

import { t } from '../../shared/i18n/index.js';
import { useAppHeaderHandlers } from '../app/useAppHeaderHandlers.js';
import { refreshStencilFlag as refreshStencilFlagCache } from '../keyboard/shortcuts/palette.js';
import { useArxmlStore } from '../store/useArxmlStore';

import { AppHeaderActionBar } from './AppHeader/AppHeaderActionBar.js';
import { AppHeaderBrandMenu } from './AppHeader/BrandMenu.js';
import { AppHeaderStatusBadge } from './AppHeader/AppHeaderStatusBadge.js';
import type { AppHeaderProps } from './AppHeader/types.js';
import { Logo } from './Logo.js';
import { StencilWizard } from './StencilWizard/StencilWizard.js';

export type { AppHeaderProps };

export function AppHeader({
  onEcucModuleSelect,
  canSelectEcucModule,
  scriptPanelOpen,
  onToggleScriptPanel,
  onGenerate,
  canGenerate,
  generateBusy,
  onOpenDbc,
  dbcBusy,
  onOpenOdx,
  odxBusy,
  onOpenDbcImport,
  dbcImportBusy,
  onOpenXlsxBatch,
  xlsxBatchBusy,
  onOpenDcmConfig,
  canOpenDcmConfig,
  dcmConfigBusy,
}: AppHeaderProps): JSX.Element {
  // v1.42.3 PATCH T2: 6 async handlers + 1 useCallback + 3 predicates + 11 store
  // selectors extracted to useAppHeaderHandlers hook (T1 commit 65ab91e).
  // The 4 shell useState (appVersion/menuOpen/stencilOpen/stencilFlagOn) +
  // 2 useEffect (feature flag + app version) stay here — they're wired to
  // inline JSX sub-components + StencilWizard mount + IPC fetches.
  const [appVersion, setAppVersion] = useState<string>('…');
  const [menuOpen, setMenuOpen] = useState(false);
  const [stencilOpen, setStencilOpen] = useState(false);
  const [stencilFlagOn, setStencilFlagOn] = useState(false);
  useEffect(() => {
    refreshStencilFlagCache();
    const api = (
      globalThis as { window?: { autosarApi?: { getFeatureFlags?: () => Promise<unknown> } } }
    ).window?.autosarApi;
    if (api === undefined || typeof api.getFeatureFlags !== 'function') return;
    let cancelled = false;
    void api
      .getFeatureFlags()
      .then((reply) => {
        if (cancelled) return;
        const flag = (reply as { experimental?: { stencilWizard?: boolean } } | undefined)
          ?.experimental?.stencilWizard;
        setStencilFlagOn(flag === true);
      })
      .catch(() => {
        if (cancelled) return;
        setStencilFlagOn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  // The Cmd-K palette command dispatches a `stencil:open` CustomEvent
  // on `window`; we listen here so the wizard has a single owner.
  useEffect(() => {
    const handler = (): void => {
      setStencilOpen(true);
    };
    window.addEventListener('stencil:open', handler);
    return () => window.removeEventListener('stencil:open', handler);
  }, []);
  // v1.11.4 PATCH-B — graceful fallback when window.autosarApi
  // is unavailable (e.g. headless E2E harness driving Vite without
  // the Electron preload). Without this guard, the call throws on
  // mount in 9 E2E specs and crashes the React tree before any
  // test assertion can run. Closes v1.11.2 P1 (E2E harness gap).
  useEffect(() => {
    const api = window.autosarApi;
    if (api === undefined) {
      setAppVersion('dev');
      return;
    }
    if (typeof api.getAppVersion !== 'function') {
      setAppVersion('?');
      return;
    }
    let cancelled = false;
    void api
      .getAppVersion()
      .then((v) => {
        if (cancelled) return;
        setAppVersion(v);
      })
      .catch(() => {
        if (cancelled) return;
        setAppVersion('?');
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const {
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
  } = useAppHeaderHandlers();

  return (
    <header className="app-header" data-testid="app-header" data-tour-id="app-header">
      <div className="app-header-left">
        <Logo size={20} />
        <span className="app-name">AutosarCfg</span>
        {/* Sprint 13+ — removed the active-doc basename + dirty marker
            (app-doc-name) and AUTOSAR version chip (app-doc-version)
            because the user considers them "ecuc 内容层级" — noise on
            a menu bar that should only carry functional controls. The
            tree view already names the loaded ECUC module; the menu
            bar should just give the user buttons. */}
      </div>
      <div className="app-header-actions">
        {/* v1.42.x PATCH T4: BrandMenu owns trigger + panel + refs/effects/callbacks;
            menu items live in shell as render-prop children for prop-drilling locality. */}
        <AppHeaderBrandMenu menuOpen={menuOpen} onMenuOpenChange={setMenuOpen}>
          {(api) => (
            <>
              <div className="app-dropdown-group-label">{t(api.locale, 'app.menu.projectManage')}</div>
              <button
                type="button"
                className="app-dropdown-item"
                role="menuitem"
                onClick={() => {
                  api.closeMenu();
                  void onProjectNew();
                }}
                disabled={state.busy}
                data-testid="btn-project-new"
              >
                <span className="app-dropdown-icon" aria-hidden="true">
                  📁
                </span>
                {t(api.locale, 'app.project.new')}
              </button>
              <button
                type="button"
                className="app-dropdown-item"
                role="menuitem"
                onClick={() => {
                  api.closeMenu();
                  void onProjectOpen();
                }}
                disabled={state.busy}
                data-testid="btn-project-open"
              >
                <span className="app-dropdown-icon" aria-hidden="true">
                  📂
                </span>
                {t(api.locale, 'app.project.open')}
              </button>
              <div className="app-dropdown-divider" role="separator" />
              <div className="app-dropdown-group-label">{t(api.locale, 'app.menu.fileOps')}</div>
              <button
                type="button"
                className="app-dropdown-item"
                role="menuitem"
                onClick={() => {
                  api.closeMenu();
                  void onOpen();
                }}
                disabled={state.busy}
                data-testid="btn-open"
              >
                <span className="app-dropdown-icon" aria-hidden="true">
                  📄
                </span>
                {t(api.locale, 'app.open.arxml')}
              </button>
              <button
                type="button"
                className="app-dropdown-item"
                role="menuitem"
                onClick={() => {
                  api.closeMenu();
                  void onOpenDbc();
                }}
                disabled={dbcBusy}
                data-testid="btn-open-dbc"
              >
                <span className="app-dropdown-icon" aria-hidden="true">
                  🗂️
                </span>
                {t(api.locale, 'app.open.dbc')}
              </button>
              <button
                type="button"
                className="app-dropdown-item"
                role="menuitem"
                onClick={() => {
                  api.closeMenu();
                  void onOpenOdx();
                }}
                disabled={odxBusy}
                data-testid="btn-open-odx"
              >
                <span className="app-dropdown-icon" aria-hidden="true">
                  🩺
                </span>
                {t(api.locale, 'app.open.odx')}
              </button>
              <button
                type="button"
                className="app-dropdown-item"
                role="menuitem"
                onClick={() => {
                  api.closeMenu();
                  onOpenDcmConfig();
                }}
                disabled={dcmConfigBusy || !canOpenDcmConfig}
                title={
                  dcmConfigBusy
                    ? t(api.locale, 'app.open.dcmConfig.busy')
                    : !canOpenDcmConfig
                      ? t(api.locale, 'dcmConfig.error.noDcmBswmd')
                      : undefined
                }
                data-testid="btn-open-dcm-config"
              >
                <span className="app-dropdown-icon" aria-hidden="true">
                  ⚙️
                </span>
                {t(api.locale, 'app.open.dcmConfig')}
              </button>
              <button
                type="button"
                className="app-dropdown-item"
                role="menuitem"
                onClick={() => {
                  api.closeMenu();
                  void onOpenDbcImport();
                }}
                disabled={dbcImportBusy}
                data-testid="btn-import-dbc-com"
              >
                <span className="app-dropdown-icon" aria-hidden="true">
                  {t(api.locale, 'dbc.import.menu.icon')}
                </span>
                {t(api.locale, 'dbc.import.menu.label')}
              </button>
              <button
                type="button"
                className="app-dropdown-item"
                role="menuitem"
                onClick={() => {
                  api.closeMenu();
                  void onOpenXlsxBatch();
                }}
                disabled={xlsxBatchBusy}
                data-testid="btn-import-xlsx-batch"
              >
                <span className="app-dropdown-icon" aria-hidden="true">
                  {t(api.locale, 'xlsxBatch.menu.icon')}
                </span>
                {t(api.locale, 'xlsxBatch.menu.label')}
              </button>
              <button
                type="button"
                className="app-dropdown-item"
                role="menuitem"
                onClick={() => {
                  api.closeMenu();
                  onEcucModuleSelect();
                }}
                disabled={!canSelectEcucModule}
                data-testid="btn-ecuc-from-bswmd"
              >
                <span className="app-dropdown-icon" aria-hidden="true">
                  ✨
                </span>
                {t(api.locale, 'ecuc.fromBswmd.menu')}
              </button>
              {stencilFlagOn && (
                <button
                  type="button"
                  className="app-dropdown-item"
                  role="menuitem"
                  onClick={() => {
                    api.closeMenu();
                    setStencilOpen(true);
                  }}
                  data-testid="btn-stencil-new"
                >
                  <span className="app-dropdown-icon" aria-hidden="true">
                    🧩
                  </span>
                  {t(api.locale, 'stencil.title')}
                </button>
              )}
            </>
          )}
        </AppHeaderBrandMenu>

        <span className="app-header-sep" aria-hidden="true" />
        <span className="app-header-sep" aria-hidden="true" />

        {/* v1.42.x PATCH T4: AppHeaderActionBar owns the 3 Save buttons. */}
        <AppHeaderActionBar
          onProjectSave={onProjectSave}
          canSaveProject={canSaveProject}
          projectDirtyCount={projectDirtyCount}
          onSave={onSave}
          canSave={canSave}
          isActiveDirty={isActiveDirty}
          onSaveAll={onSaveAll}
          canSaveAll={canSaveAll}
          locale={locale}
        />
      </div>
      {/* Sprint 13+ — removed the doc-tab strip (app-doc-tabs) that showed
          every loaded ARXML as a tab in the menu bar. User feedback:
          the menu bar should only carry functional controls; the loaded
          doc set is already navigable via FileListTab in the LeftPanel
          (tabbed sidebar) so showing them in the menu bar too was
          redundant decoration. */}
      <div className="app-header-right">
        {/* v1.42.x PATCH T4: AppHeaderStatusBadge owns the project chip +
            scripts toggle + generate + locale + version UI cluster. */}
        <AppHeaderStatusBadge
          project={project}
          projectPath={projectPath}
          onCloseProjectClick={onCloseProjectClick}
          scriptPanelOpen={scriptPanelOpen}
          onToggleScriptPanel={onToggleScriptPanel}
          onGenerate={onGenerate}
          canGenerate={canGenerate}
          generateBusy={generateBusy}
          locale={locale}
          appVersion={appVersion}
        />
      </div>
      {/* v1.8.0 K — Stencil Wizard (Task 7). The modal portals into
          `document.body` from inside `<StencilWizard />` so the
          layout here is unchanged. The `onClose` handler flips our
          `stencilOpen` flag, which removes the modal on the next
          render. The flag-gate at the menu entry is the *only* gate
          (the modal itself is not gated) so manual invocations from
          devtools / future triggers still work in test mode. */}
      {stencilOpen && <StencilWizard onClose={() => setStencilOpen(false)} />}
    </header>
  );
}
