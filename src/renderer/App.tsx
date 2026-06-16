import { AppHeader } from './components/AppHeader';
import { ArxmlPanel } from './components/ArxmlPanel';
import { ValidationPanel } from './components/ValidationPanel';
import { ParamEditor } from './components/editor/ParamEditor';
import { Tree } from './components/tree/Tree';
import { useDebouncedValidation } from './hooks/useDebouncedValidation';
import { useArxmlStore } from './store/useArxmlStore';

export function App(): JSX.Element {
  // Sprint 3: 300ms debounced revalidation safety net.
  // Note: store.updateParam is already sync-revalidating; this hook
  // covers any future async paths (IPC mutations, undo/redo, etc.).
  useDebouncedValidation(300);

  return (
    <div className="app-shell">
      <AppHeader />
      <main className="workspace">
        <div className="left-column">
          <Tree store={useArxmlStore} />
          <ValidationPanel />
        </div>
        <ParamEditor />
      </main>
      <ArxmlPanel />
    </div>
  );
}
