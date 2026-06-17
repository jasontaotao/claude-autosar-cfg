// AppHeader: slim 40px top bar that consolidates the previous App.tsx h1
// (logo + version) and ArxmlPanel (Open / Save buttons + doc stats) into a
// single borderless strip. The main content area below it now gets the
// full vertical space for Tree / ParamEditor / ValidationPanel.
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

import { useEffect, useState } from 'react';

import { t } from '../../shared/i18n.js';
import { basename } from '../../shared/path.js';
import type { ParseArxmlResponse, ParseError } from '../../shared/types.js';
import { useProjectActions } from '../hooks/useProjectActions';
import { useArxmlStore } from '../store/useArxmlStore';

interface AppHeaderState {
  readonly error: string | null;
  readonly busy: boolean;
}

const INITIAL: AppHeaderState = { error: null, busy: false };

function formatParseError(e: ParseError): string {
  switch (e.kind) {
    case 'xml-malformed':
      return `XML malformed: ${e.message}`;
    case 'missing-root':
      return `Missing root element: ${e.message}`;
    case 'unsupported-version':
      return `Unsupported AUTOSAR version: ${e.version}`;
    case 'invalid-structure':
      return `Invalid structure at ${e.path}: ${e.message}`;
  }
}

export function AppHeader(): JSX.Element {
  const [state, setState] = useState<AppHeaderState>(INITIAL);
  const [appVersion, setAppVersion] = useState<string>('…');
  const doc = useArxmlStore((s) => s.doc);
  const filePath = useArxmlStore((s) => s.filePath);
  const activeDocumentPath = useArxmlStore((s) => s.activeDocumentPath);
  const documentPaths = useArxmlStore((s) => s.documentPaths);
  // isActiveDirty: derived from per-path Set (Sprint 10 #2 dirty refactor).
  const isActiveDirty = useArxmlStore(
    (s) => s.activeDocumentPath !== null && s.dirtyPaths.has(s.activeDocumentPath),
  );
  const addDocument = useArxmlStore((s) => s.addDocument);
  const removeDocument = useArxmlStore((s) => s.removeDocument);
  const setActiveDocument = useArxmlStore((s) => s.setActiveDocument);
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

  useEffect(() => {
    void window.autosarApi.getAppVersion().then(setAppVersion);
  }, []);

  const onOpen = async (): Promise<void> => {
    setState({ error: null, busy: true });
    const result = await window.autosarApi.openArxmlMulti({ title: 'Open AUTOSAR ARXML' });
    switch (result.kind) {
      case 'canceled': {
        setState({ error: null, busy: false });
        return;
      }
      case 'read-failed': {
        setState({
          error: t(locale, 'app.error.openFailed', { message: result.message }),
          busy: false,
        });
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
            lastError = `${basename(file.path)}: ${formatParseError(parsed.error)}`;
            continue;
          }
          addDocument(parsed.value, file.path);
        }
        if (failed.length > 0) {
          lastError = failed.map((f) => `${basename(f.path)}: ${f.message}`).join('; ');
        }
        setState({ error: lastError, busy: false });
        return;
      }
    }
  };

  const onSave = async (): Promise<void> => {
    if (doc === null) return;
    setState({ error: null, busy: true });
    const currentPath = filePath ?? '';
    const defaultName = basename(currentPath) || 'untitled.arxml';
    const saved = await window.autosarApi.saveArxml({ doc, defaultName });
    if (!saved.ok) {
      setState({
        error: t(locale, 'app.error.saveFailed', { message: saved.error.message }),
        busy: false,
      });
      return;
    }
    if (saved.value.canceled) {
      setState({ error: null, busy: false });
      return;
    }
    useArxmlStore.getState().markSaved(saved.value.path ?? currentPath);
    setState({ error: null, busy: false });
  };

  // -----------------------------------------------------------------
  // Sprint 11 Phase 1 — project handlers
  //
  // All three delegate to `useProjectActions` so the IPC + dialog +
  // store-mutate flow lives in one place (shared with ProjectPanel).
  // Each handler funnels its ProjectActionResult into the local error
  // state so the user sees the same "X failed: ..." banner regardless
  // of which button they clicked.
  // -----------------------------------------------------------------

  const onProjectNew = async (): Promise<void> => {
    setState({ error: null, busy: true });
    const r = await newProject();
    setState({
      error: r.kind === 'error' ? r.message : null,
      busy: false,
    });
  };

  const onProjectOpen = async (): Promise<void> => {
    setState({ error: null, busy: true });
    const r = await openProjectFromDialog();
    setState({
      error: r.kind === 'error' ? r.message : null,
      busy: false,
    });
  };

  const onProjectSave = async (): Promise<void> => {
    setState({ error: null, busy: true });
    const r = await saveProject();
    setState({
      error: r.kind === 'error' ? r.message : null,
      busy: false,
    });
  };

  const canSave = doc !== null && !state.busy && isActiveDirty;
  // Sprint 11 Phase 1 (code-review H3): Save Project only persists the
  // manifest JSON. Per-doc ARXML content goes through the existing
  // saveArxml flow. Disable Save Project when any doc is dirty to
  // avoid silently writing a manifest that points at stale on-disk
  // content (data-loss risk).
  const projectDirtyCount = useArxmlStore((s) => s.dirtyPaths.size);
  const canSaveProject = project !== null && !state.busy && projectDirtyCount === 0;
  // Show only the file basename in the header; the full path is in the
  // tooltip so the bar stays compact even for long Windows paths.
  const fileName = filePath !== null ? basename(filePath) : null;
  const docVersion = doc?.version ?? null;

  return (
    <header className="app-header" data-testid="app-header">
      <div className="app-header-left">
        <span className="app-logo" aria-hidden="true">
          ⊟
        </span>
        <span className="app-name">claude-AutosarCfg</span>
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
        {fileName !== null && (
          <span className="app-doc-name" title={filePath ?? ''} data-testid="app-doc-name">
            {isActiveDirty ? t(locale, 'app.docNameDirtyMark') : ''}
            {fileName}
          </span>
        )}
      </div>
      <div className="app-header-actions">
        <button
          type="button"
          onClick={onProjectNew}
          disabled={state.busy}
          className="app-btn"
          data-testid="btn-project-new"
        >
          {t(locale, 'app.project.new')}
        </button>
        <button
          type="button"
          onClick={onProjectOpen}
          disabled={state.busy}
          className="app-btn"
          data-testid="btn-project-open"
        >
          {t(locale, 'app.project.open')}
        </button>
        <button
          type="button"
          onClick={onProjectSave}
          disabled={!canSaveProject}
          className="app-btn app-btn-save"
          data-testid="btn-project-save"
          title={
            projectDirtyCount > 0
              ? // Inline-only message; full key added to Messages below.
                t(locale, 'app.project.saveBlockedDirty', {
                  count: projectDirtyCount,
                })
              : undefined
          }
        >
          {t(locale, 'app.project.save')}
        </button>
        <span className="app-header-sep" aria-hidden="true" />
        <button
          type="button"
          onClick={onOpen}
          disabled={state.busy}
          className="app-btn"
          data-testid="btn-open"
        >
          {t(locale, 'app.open')}
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
      {documentPaths.length > 0 && (
        <div
          className="app-doc-tabs"
          role="tablist"
          aria-label={t(locale, 'app.docTab.ariaLoaded')}
        >
          {documentPaths.map((p) => {
            const isActive = p === activeDocumentPath;
            return (
              <div
                key={p}
                className={`app-doc-tab ${isActive ? 'is-active' : ''}`}
                data-testid={`doc-tab-${p}`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className="app-doc-tab-label"
                  onClick={() => setActiveDocument(p)}
                  title={p}
                >
                  {basename(p)}
                </button>
                <button
                  type="button"
                  className="app-doc-tab-close"
                  aria-label={t(locale, 'app.docTab.closeAria', { name: basename(p) })}
                  onClick={() => removeDocument(p)}
                  data-testid={`doc-tab-close-${p}`}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="app-header-right">
        <button
          type="button"
          className="app-btn app-btn-locale"
          onClick={() => setLocale(locale === 'zh-CN' ? 'en' : 'zh-CN')}
          aria-label={t(locale, 'app.locale.toggleAria')}
          data-testid="btn-locale-toggle"
        >
          {locale === 'zh-CN' ? 'EN' : '中'}
        </button>
        {state.error !== null && (
          <span className="app-header-error" role="alert">
            {state.error}
          </span>
        )}
        {docVersion !== null && (
          <span className="app-doc-version">
            {t(locale, 'app.docVersion', { version: docVersion })}
          </span>
        )}
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
