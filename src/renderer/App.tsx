import { useEffect, useState } from 'react';

import { HelloPanel } from './components/HelloPanel';

export function App(): JSX.Element {
  const [appVersion, setAppVersion] = useState<string>('...');
  const [pingTs, setPingTs] = useState<number | null>(null);

  useEffect(() => {
    void window.autosarApi.getAppVersion().then(setAppVersion);
    void window.autosarApi.ping().then((r) => setPingTs(r.ts));
  }, []);

  return (
    <main className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold">claude-AutosarCfg</h1>
      <p className="text-slate-500">v{appVersion} — Sprint 0 scaffold</p>
      <HelloPanel pingTs={pingTs} />
    </main>
  );
}