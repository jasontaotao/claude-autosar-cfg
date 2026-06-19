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

import { useCallback, useState } from 'react';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';

import type { PickedModule } from '@core/arxml/skeleton.js';
import { t as i18nT } from '@shared/i18n';

import { AppHeader } from './components/AppHeader';
import { ArxmlPanel } from './components/ArxmlPanel';
import { CascadeConfirmRoot } from './components/CascadeConfirmDialog';
import { ConfirmRoot } from './components/ConfirmDialog';
import { ErrorBanner } from './components/ErrorBanner';
import { LeftPanel } from './components/LeftPanel';
import { ModuleFromBswmdPicker } from './components/ModuleFromBswmdPicker';
import { NewProjectDialog } from './components/NewProjectDialog';
import type { NewProjectSubmitOpts } from './components/NewProjectDialog';
import { PromptRoot } from './components/PromptDialog';
import { ParamEditor } from './components/editor/ParamEditor';
import { useCreateEcucFromBswmd } from './hooks/useCreateEcucFromBswmd';
import { useDebouncedValidation } from './hooks/useDebouncedValidation';
import { useProjectActions } from './hooks/useProjectActions';
import { useRemoveEcucFiles } from './hooks/useRemoveEcucFiles';
import { useArxmlStore } from './store/useArxmlStore';

export function App(): JSX.Element {
  // Sprint 3: 300ms debounced revalidation safety net.
  // Note: store.updateParam is already sync-revalidating; this hook
  // covers any future async paths (IPC mutations, undo/redo, etc.).
  useDebouncedValidation(300);

  // Sprint 13+ Stage 4 Q1 — react-resizable-panels v4 has no
  // `autoSaveId` prop (verified in node_modules/.../dist/.d.ts:60-142
  // and confirmed by code-reviewer HIGH finding on the C4 commit).
  // The library expects callers to wire `useDefaultLayout({ groupId })`
  // for localStorage persistence: the hook returns a `defaultLayout`
  // (read from storage on mount, falls back to `undefined` first time)
  // and an `onLayoutChanged` callback that writes the new layout to
  // storage. We thread both into the `<Group>` below so the splitter
  // position survives page reloads.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    groupId: 'workspace',
  });
  const fallbackLayout = { 'workspace-left': 30 } as const;

  // Sprint 12 #3 Phase 1 Task 5 — `submitNewProject` is the dirty-
  // guarded submitter for `<NewProjectDialog />`. When the user clicks
  // Create inside the dialog, the host passes `{name, dir, opts?}` back
  // to this handler, which is responsible for:
  //
  //   1. Reading `isDirty()` from the store and, if true, opening
  //      ConfirmDialog via the module-level `confirm({...})` API.
  //   2. On `discard` / `saveAndProceed`, calling
  //      `window.autosarApi.projectNew({ name, directory, bswmdPaths })`.
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
  // `(name, dir, opts?) => void | Promise<void>`. The hook itself
  // surfaces the result via the store's `error` field (Task 7) so
  // the dialog can read it back on the next render — the return
  // value is redundant at the mount site.
  //
  // Sprint 13+ Stage 3.4 — `opts` is the new third argument carrying
  // `bswmdPaths` (the absolute paths the user pre-selected via the
  // BSWMD chip row). We forward it verbatim to the hook.
  const { submitNewProject } = useProjectActions();
  const handleNewProjectSubmit = (
    name: string,
    directory: string,
    opts?: NewProjectSubmitOpts,
  ): void => {
    void submitNewProject(name, directory, opts);
  };

  // Sprint 14 / Task 11 — ECUC picker lifecycle. App.tsx owns the
  // open/close state because it's the single mount point for any
  // entry point that wants to invoke the picker (the AppHeader menu
  // and the ProjectPanel row chips are both descendants of <App />).
  // `preSelectedBswmdPath` is `undefined` for the menu-driven flow
  // (the user picks from scratch) and is the BSWMD path for the row
  // flow (so the user lands directly inside the right BSWMD).
  const [ecucPickerOpen, setEcucPickerOpen] = useState(false);
  const [preSelectedBswmdPath, setPreSelectedBswmdPath] = useState<
    string | undefined
  >(undefined);
  // T8 orchestration hook — writes ARXML via IPC, registers the new
  // docs in the store on success, rolls back on partial failure.
  const { create: createEcuc } = useCreateEcucFromBswmd();
  const { remove: removeEcuc } = useRemoveEcucFiles();
  // The picker is gated on BOTH a BSWMD being loaded (otherwise
  // there's nothing to enumerate) AND a project being open (the
  // picker writes into the project's directory).
  const canSelectEcucModule = useArxmlStore(
    (s) => s.bswmdSchemas.length > 0 && s.project !== null,
  );
  const locale = useArxmlStore((s) => s.locale);
  const setStoreError = useArxmlStore((s) => s.setError);

  const handleMenuSelectEcucModule = useCallback((): void => {
    setPreSelectedBswmdPath(undefined);
    setEcucPickerOpen(true);
  }, []);

  const handleAddEcucFromBswmd = useCallback((bswmdPath: string): void => {
    setPreSelectedBswmdPath(bswmdPath);
    setEcucPickerOpen(true);
  }, []);

  const handleCloseEcucPicker = useCallback((): void => {
    setEcucPickerOpen(false);
    setPreSelectedBswmdPath(undefined);
  }, []);

  // `useArxmlStore.getState().projectPath` is read inside the confirm
  // handler (not subscribed via `useStore`) because it's only read
  // once on submit and we don't need the component to re-render when
  // the project path changes (it never changes while the picker is
  // open — `closeProject` would close the dialog via store.error).
  const handleConfirmEcucPicker = useCallback(
    async (picks: readonly PickedModule[]): Promise<void> => {
      setEcucPickerOpen(false);
      const state = useArxmlStore.getState();
      const project = state.project;
      const projectPath = state.projectPath;
      if (project === null || projectPath === null) {
        setStoreError('No project open');
        setPreSelectedBswmdPath(undefined);
        return;
      }
      // Derive `projectDir` from `manifestPath` (strip the trailing
      // file segment). `path.ts` doesn't export dirname, so we split
      // inline — same approach other call sites use for "the
      // directory the project lives in".
      const projectDir = projectPath.replace(/[\\/][^\\/]+$/, '');

      // Sprint 16 — set-semantic confirm. The picker hands us the
      // post-toggle `picks` (newly-checked modules). Diff against the
      // project's currently-loaded ECUC instances to compute
      // (toAdd, toRemove) and dispatch both flows in sequence.
      const existingPicks: PickedModule[] = [];
      for (const doc of state.documents) {
        if (doc.sourceBswmdPath === undefined) continue;
        const moduleEl = doc.packages[0]?.elements[0];
        if (moduleEl?.kind !== 'module') continue;
        existingPicks.push({
          bswmdPath: doc.sourceBswmdPath,
          moduleShortName: moduleEl.shortName,
        });
      }
      const pickKey = (p: PickedModule): string =>
        `${p.bswmdPath}::${p.moduleShortName}`;
      const incomingKeys = new Set(picks.map(pickKey));
      const existingKeys = new Set(existingPicks.map(pickKey));
      const toAdd = picks.filter((p) => !existingKeys.has(pickKey(p)));
      const toRemove = existingPicks.filter((p) => !incomingKeys.has(pickKey(p)));

      // -- Add path (unchanged from prior behavior) ---------------
      if (toAdd.length > 0) {
        const result = await createEcuc({ picks: toAdd, projectDir });
        if (result.kind === 'ok') {
          if (result.written.length > 0) {
            setStoreError(
              i18nT(locale, 'ecuc.fromBswmd.toast', { count: result.written.length }),
            );
          }
        } else {
          const msg =
            result.message !== undefined
              ? result.message
              : result.failed.length > 0
                ? result.failed.map((f) => `${f.filePath}: ${f.message}`).join('; ')
                : 'unknown error';
          setStoreError(msg);
        }
      }

      // -- Remove path (Sprint 16 / T5) ---------------------------
      if (toRemove.length > 0) {
        const removeResult = await removeEcuc(toRemove);
        switch (removeResult.kind) {
          case 'canceled':
            // User backed out at the dirty-guard dialog. The add path
            // already ran (it was uncontested), so we surface no
            // error — the user already knows what they did.
            break;
          case 'ok':
            if (removeResult.removed.length > 0) {
              setStoreError(
                i18nT(locale, 'ecuc.fromBswmd.removed', {
                  count: removeResult.removed.length,
                }),
              );
            }
            break;
          case 'partial':
            setStoreError(
              i18nT(locale, 'ecuc.fromBswmd.removeFailed') +
                ': ' +
                removeResult.failed.map((f) => `${f.filePath}: ${f.message}`).join('; '),
            );
            break;
          case 'error':
            setStoreError(
              i18nT(locale, 'ecuc.fromBswmd.removeFailed') + ': ' + removeResult.message,
            );
            break;
        }
      }

      setPreSelectedBswmdPath(undefined);
    },
    [createEcuc, removeEcuc, locale, setStoreError],
  );

  // Sprint 13 #2 Task 5 — the left column is now a single
  // <LeftPanel /> instance. LeftPanel owns the project / files /
  // validate tab bar, mounts ProjectPanelInfo inside the project tab
  // when a project is open, mounts FileListTab in the files tab,
  // mounts the embedded ValidationPanel in the validate tab, and
  // renders the Tree below the tab content (always visible).
  //
  // The previous stacked layout
  // (ProjectPanelInfo-or-loose-banner / Tree / ValidationPanel) and
  // the `.left-column` CSS grid are no longer mounted here — they
  // were the source of the cramped "ecuc 内容层级" surface and the
  // loose-mode empty-top-of-column bug. The replacement surfaces
  // the same controls in a tabbed layout with a stable Tree footer.

  return (
    <div className="app-shell">
      <AppHeader
        onEcucModuleSelect={handleMenuSelectEcucModule}
        canSelectEcucModule={canSelectEcucModule}
      />
      {/* Sprint 13+ — full-width error strip below the header. Reads
          store.error; AppHeader no longer renders the inline corner
          span. Clicking the message opens <ErrorViewerModal /> for
          the "view 窗口" affordance when the banner itself overflows. */}
      <ErrorBanner />
      <main className="workspace">
        {/* Sprint 13+ Stage 4 Q1 — resizable left/right column.
            `react-resizable-panels` replaces the previous fixed
            `minmax(280px, 30%) 1fr` grid in styles.css with a PanelGroup
            whose column widths the user can drag. Persistence is
            wired via `useDefaultLayout({ groupId: 'workspace' })`
            above (v4 has no `autoSaveId` prop). The Separator element
            is the drag handle — it carries the
            `data-testid="workspace-resize-h"` selector the workspace
            tests target. */}
        <Group
          orientation="horizontal"
          id="workspace"
          defaultLayout={defaultLayout ?? fallbackLayout}
          onLayoutChanged={onLayoutChanged}
        >
          <Panel id="workspace-left" minSize="20%" defaultSize="30%">
            <LeftPanel onAddEcucFromBswmd={handleAddEcucFromBswmd} />
          </Panel>
          <Separator
            className="workspace-resize-h"
            data-testid="workspace-resize-h"
          />
          <Panel id="workspace-right">
            <ParamEditor />
          </Panel>
        </Group>
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
      {/* Sprint 15 / Phase 3.3 — CascadeConfirmRoot hosts the 3-option
          cascade confirm dialog shown when the user requests a
          delete-container on a node with 1+ incoming references. It
          installs its own module-level `externalSetState` handle used
          by `confirmCascade()` (called from useArxmlStore.deleteContainer
          — see Phase 2). Mounted last because it depends on no other
          dialog; no cross-mount ordering requirement. */}
      <CascadeConfirmRoot />
      <NewProjectDialog onSubmit={handleNewProjectSubmit} />
      {/* Sprint 14 / Task 11 — ECUC picker. Hosted at App.tsx so any
          sibling entry point (AppHeader menu / ProjectPanel row chip)
          can flip its `open` flag. Renders into document.body via
          its own portal (z-index 9994) so it sits above the workspace
          but below the confirm dialogs. The picker reads BSWMD state
          from the store; we only own open/close + pre-selection. */}
      <ModuleFromBswmdPicker
        open={ecucPickerOpen}
        projectDir={(() => {
          const pp = useArxmlStore.getState().projectPath;
          return pp !== null ? pp.replace(/[\\/][^\\/]+$/, '') : '';
        })()}
        preSelectedBswmdPath={preSelectedBswmdPath}
        onConfirm={handleConfirmEcucPicker}
        onClose={handleCloseEcucPicker}
      />
    </div>
  );
}
