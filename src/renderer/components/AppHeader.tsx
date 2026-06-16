// AppHeader: slim 40px top bar that consolidates the previous App.tsx h1
// (logo + version) and ArxmlPanel (Open / Save buttons + doc stats) into a
// single borderless strip. The main content area below it now gets the
// full vertical space for Tree / ParamEditor / ValidationPanel.
//
// Layout (left → right, single row, h-10 = 40px):
//   [logo] [app-name]    [doc-name]    [Open] [Save]    [doc stats] [v0.9.5]
//
// File actions moved here from ArxmlPanel so the "ARXML I/O" card no longer
// occupies a full content row. ArxmlPanel now only owns the slim status
// footer (parse error + busy indicator) that sits below the workspace.

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

export function AppHeader(): JSX.Element {
  const [state, setState] = useState<AppHeaderState>(INITIAL);
  const [appVersion, setAppVersion] = useState<string>('…');
  const doc = useArxmlStore((s) => s.doc);
  const filePath = useArxmlStore((s) => s.filePath);
  const dirty = useArxmlStore((s) => s.dirty);

  useEffect(() => {
    void window.autosarApi.getAppVersion().then(setAppVersion);
  }, []);

  const onOpen = async (): Promise<void> => {
    setState({ error: null, busy: true });
    const opened = await window.autosarApi.openArxml({ title: 'Open AUTOSAR ARXML' });
    if (opened.canceled || opened.content === undefined || opened.path === undefined) {
      setState({ error: null, busy: false });
      return;
    }
    const parsed: ParseArxmlResponse = await window.autosarApi.parseArxml({
      path: opened.path,
      content: opened.content,
    });
    if (!parsed.ok) {
      setState({ error: `Parse failed: ${formatParseError(parsed.error)}`, busy: false });
      return;
    }
    useArxmlStore.getState().setDoc(parsed.value, opened.path);
    setState({ error: null, busy: false });
  };

  const onSave = async (): Promise<void> => {
    if (doc === null) return;
    setState({ error: null, busy: true });
    const currentPath = filePath ?? '';
    const defaultName = currentPath.split(/[\\/]/).pop() ?? 'untitled.arxml';
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

  const canSave = doc !== null && !state.busy && dirty;
  // Show only the file basename in the header; the full path is in the
  // tooltip so the bar stays compact even for long Windows paths.
  const fileName = filePath?.split(/[\\/]/).pop() ?? null;
  const docVersion = doc?.version ?? null;

  return (
    <header className="app-header" data-testid="app-header">
      <div className="app-header-left">
        <span className="app-logo" aria-hidden="true">
          ⊟
        </span>
        <span className="app-name">claude-AutosarCfg</span>
        {fileName !== null && (
          <span className="app-doc-name" title={filePath ?? ''}>
            {dirty ? '● ' : ''}
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
          className={`app-btn app-btn-save ${dirty ? 'is-dirty' : ''}`}
          data-testid="btn-save"
        >
          {dirty ? 'Save *' : 'Save'}
        </button>
      </div>
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
