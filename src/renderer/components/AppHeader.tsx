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
  /**
   * Sprint 14 / Phase C (T14) — ScriptPanel toggle. The parent owns
   * the open flag so it can keep `ScriptPanel` mount conditional
   * (lazy CodeMirror bundle). The button below flips it.
   */
  readonly scriptPanelOpen: boolean;
  readonly onToggleScriptPanel: () => void;
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
  scriptPanelOpen,
  onToggleScriptPanel,
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
  // saves (reuses the T2 contract; no dialog per file). On success
  // markSaved drops the path from `dirtyPaths`; on failure the path
  // stays dirty and the error is collected into a per-failure list.
  // Final toast reports either N saved (all good) or "Saved X, Y
  // failed: firstError" when at least one save errored.
  // -----------------------------------------------------------------
  const onSaveAll = async (): Promise<void> => {
    if (state.busy) return;
    const storeState = useArxmlStore.getState();
    const dirty = Array.from(storeState.dirtyPaths);
    if (dirty.length === 0) return;
    setState({ busy: true });
    setStoreError(null);
    let saved = 0;
    const failed: string[] = [];
    for (const path of dirty) {
      // Resolve the path to its ArxmlDocument via the parallel-array
      // index. `documents[i]` corresponds to `documentPaths[i]` (the
      // contract `addDocument` enforces); we cannot match by
      // `doc.path` because docs carry their OWN in-memory path
      // (`/in-memory` in tests, the source path in production) rather
      // than the filePath keying the documentPaths set.
      const idx = storeState.documentPaths.indexOf(path);
      if (idx === -1) continue;
      const docEntry = storeState.documents[idx];
      if (docEntry === undefined) continue;
      const r = await window.autosarApi.saveArxml({
        doc: docEntry,
        defaultName: basename(path) || 'untitled.arxml',
        currentPath: path,
      });
      if (r.ok && !r.value.canceled) {
        useArxmlStore.getState().markSaved(r.value.path ?? path);
        saved += 1;
      } else if (!r.ok) {
        failed.push(r.error.message);
      }
    }
    setState({ busy: false });
    if (failed.length === 0) {
      setStoreError(t(locale, 'app.saveAllDone', { count: saved }));
    } else {
      setStoreError(
        t(locale, 'app.saveAllPartial', {
          saved,
          failed: failed.length,
          firstError: failed[0] ?? '',
        }),
      );
    }
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
        {/* Sprint 16b T7 — Save All. Loops dirty paths silently (no
            per-file dialog). Label previews the count when N>0 so the
            user can see how many files will be touched; tooltip
            matches. Disabled when the set is empty OR another action
            is in-flight (`state.busy` is set during the loop). Placed
            immediately right of `btn-save` per the "高频按钮常驻工具栏"
            UX rule. */}
        <button
          type="button"
          onClick={() => {
            void onSaveAll();
          }}
          disabled={!canSaveAll}
          className={`app-btn app-btn-save-all ${dirtyPaths.size > 0 ? 'is-dirty' : ''}`}
          data-testid="btn-save-all"
          title={
            dirtyPaths.size > 0
              ? t(locale, 'app.saveAllDirtyTitle', { count: dirtyPaths.size })
              : t(locale, 'app.saveAllTitle')
          }
        >
          {dirtyPaths.size > 0
            ? t(locale, 'app.saveAllDirty', { count: dirtyPaths.size })
            : t(locale, 'app.saveAll')}
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
          className={`app-btn app-btn-scripts ${scriptPanelOpen ? 'is-active' : ''}`}
          onClick={onToggleScriptPanel}
          aria-pressed={scriptPanelOpen}
          aria-label={t(locale, 'script.panel.toggle')}
          title={t(locale, 'script.panel.toggle')}
          data-testid="btn-scripts-toggle"
        >
          {t(locale, 'script.panel.title')}
        </button>
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
