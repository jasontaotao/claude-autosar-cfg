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

import { useCallback, useEffect, useRef, useState } from 'react';

import { t } from '../../shared/i18n/index.js';
import { basename } from '../../shared/path.js';
import type { ParseArxmlResponse } from '../../shared/types.js';
import { useProjectActions } from '../hooks/useProjectActions';
import { refreshStencilFlag as refreshStencilFlagCache } from '../keyboard/shortcuts/palette.js';
import { useArxmlStore } from '../store/useArxmlStore';

import { AppHeaderActionBar } from './AppHeader/AppHeaderActionBar.js';
import { AppHeaderBrandMenu } from './AppHeader/BrandMenu.js';
import { AppHeaderStatusBadge } from './AppHeader/AppHeaderStatusBadge.js';
import { formatParseError, saveAllDirty } from './AppHeader/helpers.js';
import { INITIAL, type AppHeaderProps, type AppHeaderState } from './AppHeader/types.js';
import { confirm } from './ConfirmDialog.js';
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
  const [state, setState] = useState<AppHeaderState>(INITIAL);
  const [appVersion, setAppVersion] = useState<string>('…');
  // v1.42.x PATCH T4: menuOpen state stays in shell (controlled mode);
  // menuRef/closeTimerRef moved to BrandMenu.tsx.
  const [menuOpen, setMenuOpen] = useState(false);
  // v1.8.0 K — Stencil Wizard (Task 7). AppHeader owns the open/close
  // state so the File menu entry, the Cmd-K palette command, and any
  // future trigger (e.g. toolbar button) share a single entry point.
  // The flag check below gates the menu + palette — when the flag is
  // OFF, the entry is rendered with `hidden` so the layout collapses
  // to the existing two-entry `fileOps` group. The flag defaults to
  // OFF (per Task 1 + main-side `stencil/feature-flag.ts`).
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
  const doc = useArxmlStore((s) => s.doc);
  const filePath = useArxmlStore((s) => s.filePath);
  // isActiveDirty: derived from per-path Set (Sprint 10 #2 dirty refactor).
  const isActiveDirty = useArxmlStore(
    (s) => s.activeDocumentPath !== null && s.dirtyPaths.has(s.activeDocumentPath),
  );
  const addDocument = useArxmlStore((s) => s.addDocument);
  // Sprint 13+ — `activeDocumentPath`, `documentPaths`,
  // `setActiveDocument`, and `removeDocument` were dropped here because
  // they only served the doc-tab strip + active-doc name display. Both
  // features were removed; the loaded-doc set is now navigable via
  // the LeftPanel "files" tab (FileListTab) instead.
  // Sprint 13+ — error surface moved to a sibling <ErrorBanner /> that
  // sits below the header. AppHeader now writes its action failures
  // straight to the store via `setError`; the banner picks them up.
  const setStoreError = useArxmlStore((s) => s.setError);
  // Sprint 11 Phase 1 — project state + actions
  const project = useArxmlStore((s) => s.project);
  const projectPath = useArxmlStore((s) => s.projectPath);
  // Sprint 11 Phase 1 (Option A) — i18n
  const locale = useArxmlStore((s) => s.locale);
  const setLocale = useArxmlStore((s) => s.setLocale);
  // Sprint 16b T7 — Save All button. `dirtyPaths` is the per-path Set
  // and `documents` is the parallel ArxmlDocument array; the handler
  // below walks the Set and resolves each path to its ArxmlDocument
  // via `find` before calling saveArxml. We subscribe to the Set
  // directly (not the size) so the button enables/disables on every
  // add/delete, not on selection changes.
  const dirtyPaths = useArxmlStore((s) => s.dirtyPaths);
  // Sprint 11 Phase 1 (H2 fix) — shared project actions; same hook
  // ProjectPanel.LooseView uses, so no synthetic-click coupling.
  const { newProject, openProjectFromDialog, saveProject } = useProjectActions();

  // v1.42.x PATCH T4: 3 menu useEffect (unmount cleanup + click-outside + Escape)
  // + 2 useCallback (openMenu + scheduleClose) moved to BrandMenu.tsx.

  // v1.11.4 PATCH-B — graceful fallback when window.autosarApi
  // is unavailable (e.g. headless E2E harness driving Vite without
  // the Electron preload). Without this guard, the call throws on
  // mount in 9 E2E specs and crashes the React tree before any
  // test assertion can run. Closes v1.11.2 P1 (E2E harness gap).
  //
  // Distinguishes two failure modes (per code-review MEDIUM, v1.11.4):
  //   - autosarApi entirely undefined → 'dev' (E2E harness; expected)
  //   - autosarApi present but getAppVersion missing → '?' (production
  //     anomaly: preload bridge failure, race during Electron startup,
  //     or a future IPC refactor that dropped the channel). Surfaces
  //     the bug instead of silently masking it.
  //
  // v1.12.0 PATCH D3 (M2) — extend the PATCH-B fix to the REJECTED
  // IPC promise path. Without `.catch` + `cancelled`, the much more
  // common "IPC call threw" failure (preload bridge failure, race
  // during Electron startup, future IPC refactor) left the UI stuck
  // on the literal `'…'` placeholder forever — the `?` anomaly signal
  // was reserved for the synchronous "API shape changed" path only.
  // Mirrors the sibling getFeatureFlags effect (lines 120-142 above).
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

  const canSave = doc !== null && !state.busy && isActiveDirty;
  // Sprint 16b T7 — Save All enable predicate. The button is live when
  // at least one dirty doc exists AND no other action is in-flight. We
  // re-read `dirtyPaths.size` instead of `projectDirtyCount` so the
  // button tracks the per-doc Set directly (projectDirtyCount was
  // introduced for the Save Project tooltip). Both end up the same
  // value, but naming them separately keeps each predicate's intent
  // obvious at the call site.
  const canSaveAll = !state.busy && dirtyPaths.size > 0;
  const projectDirtyCount = useArxmlStore((s) => s.dirtyPaths.size);
  const canSaveProject = project !== null && !state.busy && projectDirtyCount === 0;

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
