import { useEffect, useState } from 'react';

import { ArxmlPanel } from './components/ArxmlPanel';
import { ParamEditor } from './components/editor/ParamEditor';
import { Tree } from './components/tree/Tree';
import { useArxmlStore } from './store/useArxmlStore';

export function App(): JSX.Element {
  const [appVersion, setAppVersion] = useState<string>('...');

  useEffect(() => {
    void window.autosarApi.getAppVersion().then(setAppVersion);
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>
          claude-AutosarCfg <span className="version">v{appVersion}</span> — F2 Tree + Editor
        </h1>
      </header>
      <ArxmlPanel />
      <main className="workspace">
        <Tree store={useArxmlStore} />
        <ParamEditor />
      </main>
    </div>
  );
}