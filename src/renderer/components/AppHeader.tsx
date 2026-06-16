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

import { useEffect, useState } from 'react';

import type { ParseArxmlResponse, ParseError } from '../../shared/types.js';
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

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
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
        setState({ error: `Open failed: ${result.message}`, busy: false });
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
      setState({ error: `Save failed: ${saved.error.message}`, busy: false });
      return;
    }
    if (saved.value.canceled) {
      setState({ error: null, busy: false });
      return;
    }
    useArxmlStore.getState().markSaved(saved.value.path ?? currentPath);
    setState({ error: null, busy: false });
  };

  const canSave = doc !== null && !state.busy && isActiveDirty;
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
        {fileName !== null && (
          <span className="app-doc-name" title={filePath ?? ''} data-testid="app-doc-name">
            {isActiveDirty ? '● ' : ''}
            {fileName}
          </span>
        )}
      </div>
      <div className="app-header-actions">
        <button
          type="button"
          onClick={onOpen}
          disabled={state.busy}
          className="app-btn"
          data-testid="btn-open"
        >
          Open
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className={`app-btn app-btn-save ${isActiveDirty ? 'is-dirty' : ''}`}
          data-testid="btn-save"
        >
          {isActiveDirty ? 'Save *' : 'Save'}
        </button>
      </div>
      {documentPaths.length > 0 && (
        <div className="app-doc-tabs" role="tablist" aria-label="Loaded documents">
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
                  aria-label={`Close ${basename(p)}`}
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
        {state.error !== null && (
          <span className="app-header-error" role="alert">
            {state.error}
          </span>
        )}
        {docVersion !== null && <span className="app-doc-version">AUTOSAR {docVersion}</span>}
        <span className="app-version" title={`v${appVersion}`}>
          v{appVersion}
        </span>
      </div>
    </header>
  );
}
