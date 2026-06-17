// App shell — Sprint 12 #3 Task 8 part 2.
//
// Mounts the three dialog hosts at the root level so any descendant
// component (or module-level API) can open them:
//
//   - `<PromptRoot />`        — Sprint 12 #2 housekeeping: the
//                               Electron-safe replacement for
//                               `window.prompt()`. Module-level
//                               externalSetState API.
//
//   - `<NewProjectDialog />`  — Sprint 12 #3 Phase 1 Task 1+2: the
//                               unified "new project" modal. Store-
//                               driven visibility
//                               (`newProjectDialogOpen`). The host
//                               wires `onSubmit` to
//                               `useProjectActions().submitNewProject`
//                               (Task 5) which is responsible for the
//                               dirty-protection gate (Phase 1 Task 7
//                               `pendingAction` + ConfirmDialog) and
//                               the IPC `project:new` round-trip.
//
//   - `<ConfirmRoot />`       — Sprint 12 #3 Phase 1 Task 6: the
//                               unsaved-changes confirmation modal.
//                               Module-level externalSetState API.
//
// Mount order matters for the module-level hosts: `<ConfirmRoot />`
// must mount BEFORE `<NewProjectDialog />` because Task 5's
// `submitNewProject` calls `confirm({...})` from inside the
// NewProjectDialog's `onSubmit` handler. The dialog portals all
// render to `document.body` so DOM placement order is irrelevant;
// what matters is that the `useEffect` that wires `externalSetState`
// has flushed before any other component calls `confirm()`.
//
// z-index is owned by each dialog's CSS file (NewProjectDialog 9999,
// ConfirmDialog 9998, PromptDialog 9997) so this component is
// intentionally agnostic about stacking — the mount order in the
// return statement documents the dependency graph, not the z-order.

import { t } from '@shared/i18n';

import { AppHeader } from './components/AppHeader';
import { ArxmlPanel } from './components/ArxmlPanel';
import { ConfirmRoot } from './components/ConfirmDialog';
import { ErrorBanner } from './components/ErrorBanner';
import { NewProjectDialog } from './components/NewProjectDialog';
import { ProjectPanelInfo } from './components/ProjectPanel';
import { PromptRoot } from './components/PromptDialog';
import { ValidationPanel } from './components/ValidationPanel';
import { ParamEditor } from './components/editor/ParamEditor';
import { Tree } from './components/tree/Tree';
import { useDebouncedValidation } from './hooks/useDebouncedValidation';
import { useProjectActions } from './hooks/useProjectActions';
import { useArxmlStore } from './store/useArxmlStore';

export function App(): JSX.Element {
  // Sprint 3: 300ms debounced revalidation safety net.
  // Note: store.updateParam is already sync-revalidating; this hook
  // covers any future async paths (IPC mutations, undo/redo, etc.).
  useDebouncedValidation(300);

  // Sprint 12 #3 Phase 1 Task 5 — `submitNewProject` is the dirty-
  // guarded submitter for `<NewProjectDialog />`. When the user clicks
  // Create inside the dialog, the host passes `{name, dir}` back to
  // this handler, which is responsible for:
  //
  //   1. Reading `isDirty()` from the store and, if true, opening
  //      ConfirmDialog via the module-level `confirm({...})` API.
  //   2. On `discard` / `saveAndProceed`, calling
  //      `window.autosarApi.projectNew({ name, directory })`.
  //   3. On `'created'`, dispatching `store.openProject(...)` and
  //      closing the dialog via `setNewProjectDialogOpen(false)`.
  //   4. On `'overwrite-confirm'` / `'invalid-name'` /
  //      `'write-failed'`, surfacing the error inline (the dialog
  //      stays open so the user can correct the input).
  //
  // Task 5 owns the implementation; we just plumb the prop here.
  //
  // The wrapper discards the `ProjectActionResult` because
  // `<NewProjectDialog onSubmit>` is typed as
  // `(name, dir) => void | Promise<void>`. The hook itself surfaces
  // the result via the store's `error` field (Task 7) so the dialog
  // can read it back on the next render — the return value is
  // redundant at the mount site.
  const { submitNewProject, addBswmdFromDialog, removeBswmdWithGuard } = useProjectActions();
  const handleNewProjectSubmit = (name: string, directory: string): void => {
    void submitNewProject(name, directory);
  };

  // Sprint 13 refactor — ProjectPanel was split into ProjectPanelInfo
  // (presentational, props-only) so it can be mounted inside LeftPanel's
  // tabbed layout (see LeftPanel.tsx). App.tsx temporarily mounts the
  // open-mode variant here while LeftPanel integration is still WIP; the
  // loose-mode UI (no-project banner + quick actions) was removed in
  // commit 1de85c0 along with the split. To keep this path functional
  // we gate on `project !== null` and pass the props ProjectPanelInfo
  // needs. The `LeftPanel` WIP file in the repo is the long-term
  // replacement and supersedes this block once its TypeScript surface
  // is complete.
  const locale = useArxmlStore((s) => s.locale);
  const project = useArxmlStore((s) => s.project);
  const projectPath = useArxmlStore((s) => s.projectPath);
  const closeProject = useArxmlStore((s) => s.closeProject);
  const removeDocument = useArxmlStore((s) => s.removeDocument);

  return (
    <div className="app-shell">
      <AppHeader />
      {/* Sprint 13+ — full-width error strip below the header. Reads
          store.error; AppHeader no longer renders the inline corner
          span. Clicking the message opens <ErrorViewerModal /> for
          the "view 窗口" affordance when the banner itself overflows. */}
      <ErrorBanner />
      <main className="workspace">
        <div className="left-column">
          {/* Sprint 13 refactor — ProjectPanel was split into
              ProjectPanelInfo (presentational, props-only). App.tsx
              mounts:
                - ProjectPanelInfo when a project is open
                - a compact LooseView banner (text + New/Open) otherwise
              The original LooseView was deleted in commit 1de85c0; this
              block restores the loose-mode UX so the top of the left
              column is never empty. CSS grid auto-rows keep the Tree
              (1fr) + ValidationPanel (auto) below it. */}
          {project !== null && projectPath !== null ? (
            <ProjectPanelInfo
              locale={locale}
              manifest={project}
              manifestPath={projectPath}
              onClose={closeProject}
              onRemoveArxml={removeDocument}
              onAddBswmd={() => void addBswmdFromDialog()}
              onRemoveBswmd={(path) => void removeBswmdWithGuard(path)}
            />
          ) : (
            // Sprint 13+ follow-up: user removed the New/Open quick
            // actions here because they duplicated the AppHeader
            // project menu. The banner is now a text-only hint that
            // complements (does not repeat) the menu bar controls.
            <div className="project-panel project-panel-loose" data-testid="project-panel-loose">
              <span className="project-panel-loose-text">
                {t(locale, 'projectPanel.loose.text')}
              </span>
            </div>
          )}
          <Tree store={useArxmlStore} />
          <ValidationPanel />
        </div>
        <ParamEditor />
      </main>
      <ArxmlPanel />

      {/* Dialog hosts (Sprint 12 #2 + Sprint 12 #3). Mounted at the
          root so their portals (rendering into document.body) sit on
          top of every workspace layer. */}
      <PromptRoot />
      {/* ConfirmRoot BEFORE NewProjectDialog: ConfirmRoot installs the
          module-level externalSetState handle used by `confirm()`;
          submitNewProject (Task 5) calls `confirm()` from inside
          NewProjectDialog.onSubmit, so ConfirmRoot must mount first. */}
      <ConfirmRoot />
      <NewProjectDialog onSubmit={handleNewProjectSubmit} />
    </div>
  );
}
