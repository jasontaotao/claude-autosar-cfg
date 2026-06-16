import { AppHeader } from './components/AppHeader';
import { ArxmlPanel } from './components/ArxmlPanel';
import { ProjectPanel } from './components/ProjectPanel';
import { PromptRoot } from './components/PromptDialog';
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
          {/* Sprint 11 Phase 1 — ProjectPanel sits at the top of the
              left column. When a project is open it shows the manifest
              summary; in loose mode it's a compact "no project" hint
              with quick-action buttons. CSS grid auto-rows keep the
              Tree (1fr) + ValidationPanel (auto) below it. */}
          <ProjectPanel />
          <Tree store={useArxmlStore} />
          <ValidationPanel />
        </div>
        <ParamEditor />
      </main>
      <ArxmlPanel />
      <PromptRoot />
    </div>
  );
}
