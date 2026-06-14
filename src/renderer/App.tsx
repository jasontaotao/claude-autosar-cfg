import { useEffect, useState } from 'react';

import { ArxmlPanel } from './components/ArxmlPanel';
import { ValidationPanel } from './components/ValidationPanel';
import { ParamEditor } from './components/editor/ParamEditor';
import { Tree } from './components/tree/Tree';
import { useDebouncedValidation } from './hooks/useDebouncedValidation';
import { useArxmlStore } from './store/useArxmlStore';

export function App(): JSX.Element {
  const [appVersion, setAppVersion] = useState<string>('...');

  useEffect(() => {
    void window.autosarApi.getAppVersion().then(setAppVersion);
  }, []);

  // Sprint 3: 300ms debounced revalidation safety net.
  // Note: store.updateParam is already sync-revalidating; this hook
  // covers any future async paths (IPC mutations, undo/redo, etc.).
  useDebouncedValidation(300);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>
          claude-AutosarCfg <span className="version">v{appVersion}</span> — F3 Validation
        </h1>
      </header>
      <ArxmlPanel />
      <main className="workspace">
        <div className="left-column">
          <Tree store={useArxmlStore} />
          <ValidationPanel />
        </div>
        <ParamEditor />
      </main>
    </div>
  );
}
