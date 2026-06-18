// AppHeader: slim top bar — EB tresos-style dropdown for low-frequency
// project/file operations, toolbar buttons for high-frequency Save actions.
//
// Sprint 10 #2 changes:
//   - Open flow now uses `openArxmlMulti` (multi-select dialog) and feeds
//     each result through `addDocument` (was `setDoc`).
//   - New "doc-tab strip" between the actions and the right-side stats
//     shows every loaded document (basename) with the active one
//     highlighted; click to switch, × to close.
//   - The store now owns the loaded-document set (`documents[]` +
//     `activeDocumentPath`); `doc` and `filePath` remain as back-compat
//     derived aliases for the existing single-doc renderer consumers.
//
// Sprint 11 Phase 1 changes:
//   - Three project buttons (New / Open Project / Save Project) join the
//     existing Open / Save. The active project name is rendered as a
//     chip between the logo and the actions (hidden in loose mode).
//   - Project handlers call window.autosarApi.projectNew / projectOpen /
//     projectSave; success flows through `useArxmlStore.openProject`.
//   - Save Project writes only the manifest JSON. Per-doc ARXML saves
//     continue to use the existing `saveArxml` flow (the doc's editor
//     remains the source of truth for its on-disk content).
//
// Sprint 11 Phase 1 (Option A) i18n changes:
//   - Every user-facing string is rendered through t(locale, key).
//   - A 中/EN toggle in the header switches `store.locale`; all
//     t()-consuming components re-render.
//
// Menu redesign (EB tresos style):
//   - Low-frequency actions (New Project / Open Project / Open ARXML)
//     moved into a hover-to-open dropdown menu.
//   - High-frequency actions (Save Project / Save ARXML) remain as
//     toolbar buttons.
//   - Project chip moved to the right section.

import { useCallback, useEffect, useRef, useState } from 'react';

import { t, type Locale } from '../../shared/i18n.js';
import { basename } from '../../shared/path.js';
import type { ParseArxmlResponse, ParseError } from '../../shared/types.js';
import { useProjectActions } from '../hooks/useProjectActions';
import { useArxmlStore } from '../store/useArxmlStore';

interface AppHeaderState {
  readonly busy: boolean;
}

const INITIAL: AppHeaderState = { busy: false };

/**
 * Sprint 14 / Task 11 — props for `AppHeader` (the menu dropdown trigger).
 *
 * The `onEcucModuleSelect` callback is invoked when the user clicks the new
 * "ECUC Module Selection…" entry under the `fileOps` group (T11). The host
 * (App.tsx) owns the picker open/close state and the `useCreateEcucFromBswmd`
 * orchestration — AppHeader only flips the menu closed and forwards the
 * intent. `canSelectEcucModule` is the disabled-state predicate (BSWMD
 * loaded AND a project is open) sourced from the store by the parent.
 *
 * Rationale: explicit props keep this component testable in isolation
 * (matches the existing `useProjectActions` injection pattern in `ProjectPanel`)
 * and avoid coupling AppHeader to the ECUC-picker state machine.
 */
export interface AppHeaderProps {
  readonly onEcucModuleSelect: () => void;
  readonly canSelectEcucModule: boolean;
}

// Sprint 13+ Stage 4 M8 — route ParseError rendering through the shared
// i18n helper. Caller passes the current `locale` so the user sees the
// same language in the error toast they see in the rest of the header.
function formatParseError(e: ParseError, locale: Locale): string {
  switch (e.kind) {
    case 'xml-malformed':
      return t(locale, 'parserError.xmlMalformed', { message: e.message });
    case 'missing-root':
      return t(locale, 'parserError.missingRoot', { message: e.message });
    case 'unsupported-version':
      return t(locale, 'parserError.unsupportedVersion', { version: e.version });
    case 'invalid-structure':
      return t(locale, 'parserError.invalidStructure', {
        path: e.path,
        message: e.message,
      });
  }
}

export function AppHeader({
  onEcucModuleSelect,
  canSelectEcucModule,
}: AppHeaderProps): JSX.Element {
  const [state, setState] = useState<AppHeaderState>(INITIAL);
  const [appVersion, setAppVersion] = useState<string>('…');
  // 项目下拉菜单状态
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const closeProject = useArxmlStore((s) => s.closeProject);
  // Sprint 11 Phase 1 (Option A) — i18n
  const locale = useArxmlStore((s) => s.locale);
  const setLocale = useArxmlStore((s) => s.setLocale);
  // Sprint 11 Phase 1 (H2 fix) — shared project actions; same hook
  // ProjectPanel.LooseView uses, so no synthetic-click coupling.
  const { newProject, openProjectFromDialog, saveProject } = useProjectActions();

  // unmount 时清理关闭定时器，避免泄漏
  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    void window.autosarApi.getAppVersion().then(setAppVersion);
  }, []);

  // 下拉菜单：点击外部关闭
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent): void => {
      if (menuRef.current !== null && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // 下拉菜单：Escape 关闭
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [menuOpen]);

  const openMenu = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setMenuOpen(true);
  }, []);

  const scheduleClose = useCallback(() => {
    closeTimerRef.current = setTimeout(() => {
      setMenuOpen(false);
      closeTimerRef.current = null;
    }, 150);
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
          addDocument(parsed.value, file.path);
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
    const saved = await window.autosarApi.saveArxml({ doc, defaultName });
    if (!saved.ok) {
      setState({ busy: false });
      setStoreError(t(locale, 'app.error.saveFailed', { message: saved.error.message }));
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
  const projectDirtyCount = useArxmlStore((s) => s.dirtyPaths.size);
  const canSaveProject = project !== null && !state.busy && projectDirtyCount === 0;

  return (
    <header className="app-header" data-testid="app-header">
      <div className="app-header-left">
        <span className="app-logo" aria-hidden="true">
          ⊟
        </span>
        <span className="app-name">claude-AutosarCfg</span>
        {/* Sprint 13+ — removed the active-doc basename + dirty marker
            (app-doc-name) and AUTOSAR version chip (app-doc-version)
            because the user considers them "ecuc 内容层级" — noise on
            a menu bar that should only carry functional controls. The
            tree view already names the loaded ECUC module; the menu
            bar should just give the user buttons. */}
      </div>
      <div className="app-header-actions">
        {/* 项目下拉菜单（EB tresos 风格）：低频操作收进菜单 */}
        <div
          className="app-menu-trigger"
          ref={menuRef}
          onMouseEnter={openMenu}
          onMouseLeave={scheduleClose}
          data-testid="menu-project-trigger"
        >
          <button
            type="button"
            className={`app-menu-btn ${menuOpen ? 'is-open' : ''}`}
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            {t(locale, 'app.menu.project')}
            <svg
              className="app-menu-chevron"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z" />
            </svg>
          </button>
          {menuOpen && (
            <div
              className="app-dropdown"
              role="menu"
              onMouseEnter={openMenu}
              onMouseLeave={scheduleClose}
            >
              <div className="app-dropdown-group-label">{t(locale, 'app.menu.projectManage')}</div>
              <button
                type="button"
                className="app-dropdown-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void onProjectNew();
                }}
                disabled={state.busy}
                data-testid="btn-project-new"
              >
                <span className="app-dropdown-icon" aria-hidden="true">
                  📁
                </span>
                {t(locale, 'app.project.new')}
              </button>
              <button
                type="button"
                className="app-dropdown-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void onProjectOpen();
                }}
                disabled={state.busy}
                data-testid="btn-project-open"
              >
                <span className="app-dropdown-icon" aria-hidden="true">
                  📂
                </span>
                {t(locale, 'app.project.open')}
              </button>
              <div className="app-dropdown-divider" role="separator" />
              <div className="app-dropdown-group-label">{t(locale, 'app.menu.fileOps')}</div>
              <button
                type="button"
                className="app-dropdown-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void onOpen();
                }}
                disabled={state.busy}
                data-testid="btn-open"
              >
                <span className="app-dropdown-icon" aria-hidden="true">
                  📄
                </span>
                {t(locale, 'app.open.arxml')}
              </button>
              {/* Sprint 14 / Task 11 — BSWMD-to-ECUC entry point. Lives
                  under the fileOps group (matches "Open ARXML" — both
                  add a new file/asset). Disabled when no BSWMD is loaded
                  OR no project is open; the predicate is computed by the
                  parent (App.tsx) and passed in as `canSelectEcucModule`.
                  Forward the click to the host so it can flip picker
                  state and pre-select the BSWMD when the row's chip
                  triggered the entry instead. */}
              <button
                type="button"
                className="app-dropdown-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onEcucModuleSelect();
                }}
                disabled={!canSelectEcucModule}
                data-testid="btn-ecuc-from-bswmd"
              >
                <span className="app-dropdown-icon" aria-hidden="true">
                  ✨
                </span>
                {t(locale, 'ecuc.fromBswmd.menu')}
              </button>
            </div>
          )}
        </div>

        <span className="app-header-sep" aria-hidden="true" />

        {/* 高频操作：保存按钮常驻工具栏 */}
        <button
          type="button"
          onClick={onProjectSave}
          disabled={!canSaveProject}
          className="app-btn app-btn-save"
          data-testid="btn-project-save"
          title={
            projectDirtyCount > 0
              ? t(locale, 'app.project.saveBlockedDirty', {
                  count: projectDirtyCount,
                })
              : undefined
          }
        >
          {t(locale, 'app.project.save')}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className={`app-btn app-btn-save ${isActiveDirty ? 'is-dirty' : ''}`}
          data-testid="btn-save"
        >
          {isActiveDirty ? t(locale, 'app.saveDirty') : t(locale, 'app.save')}
        </button>
      </div>
      {/* Sprint 13+ — removed the doc-tab strip (app-doc-tabs) that showed
          every loaded ARXML as a tab in the menu bar. User feedback:
          the menu bar should only carry functional controls; the loaded
          doc set is already navigable via FileListTab in the LeftPanel
          (tabbed sidebar) so showing them in the menu bar too was
          redundant decoration. */}
      <div className="app-header-right">
        {project !== null && (
          <span
            className="app-project-chip"
            title={projectPath ?? ''}
            data-testid="app-project-chip"
          >
            <span className="app-project-chip-label">{t(locale, 'app.project.chipLabel')}</span>
            <span className="app-project-chip-name">{project.name}</span>
            <button
              type="button"
              className="app-project-chip-close"
              aria-label={t(locale, 'app.project.closeAria', { name: project.name })}
              onClick={closeProject}
              data-testid="btn-project-close"
            >
              ×
            </button>
          </span>
        )}
        <button
          type="button"
          className="app-btn app-btn-locale"
          onClick={() => setLocale(locale === 'zh-CN' ? 'en' : 'zh-CN')}
          aria-label={t(locale, 'app.locale.toggleAria')}
          data-testid="btn-locale-toggle"
        >
          {locale === 'zh-CN' ? 'EN' : '中'}
        </button>
        {/* Sprint 13+ — removed the doc-version chip (e.g. "AUTOSAR 4.2")
            because the menu bar should only carry functional controls.
            The tree / status bar already surfaces the active doc's
            AUTOSAR version when the user is editing it. */}
        <span
          className="app-version"
          title={t(locale, 'app.versionLabel', { version: appVersion })}
        >
          {t(locale, 'app.versionLabel', { version: appVersion })}
        </span>
      </div>
    </header>
  );
}
