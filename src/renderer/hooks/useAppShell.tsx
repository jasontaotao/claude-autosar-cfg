// useAppShell -- v1.46.1 PATCH T2 clip-verbatim extraction from App.tsx.
//
// Mounts the 8 dialog hosts + DcmConfig success/error/picker components
// at the App.tsx root level so any descendant component (or module-level
// API) can open them:
//
//   - `<PromptRoot />`        -- Sprint 12 #2 housekeeping: the
//                                Electron-safe replacement for
//                                `window.prompt()`. Module-level
//                                externalSetState API.
//
//   - `<NewProjectDialog />`  -- Sprint 12 #3 Phase 1 Task 1+2: the
//                                unified "new project" modal. Store-
//                                driven visibility
//                                (`newProjectDialogOpen`). The host
//                                wires `onSubmit` to
//                                `useProjectActions().submitNewProject`
//                                (Task 5) which is responsible for the
//                                dirty-protection gate (Phase 1 Task 7
//                                `pendingAction` + ConfirmDialog) and
//                                the IPC `project:new` round-trip.
//
//   - `<ConfirmRoot />`       -- Sprint 12 #3 Phase 1 Task 6: the
//                                unsaved-changes confirmation modal.
//                                Module-level externalSetState API.
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
// intentionally agnostic about stacking -- the mount order in the
// return statement documents the dependency graph, not the z-order.
//
// v1.46.1 PATCH T2 extraction: the 117-LoC dialog-host block from
// App.tsx lines 720-836 was clipped VERBATIM per lesson
// `function-extract-must-clip-verbatim-not-reimplement` (2/3
// confirmations: v1.46.0 T5 ecuc-dialect + this T2 App.tsx shell).
// Only change: imports relocated + the JSX is wrapped in a fragment
// so it composes into App.tsx's outer `<div>` at the dialog-host
// position. NO logic reimplemented.

import type { ReactNode } from 'react';

import type { PickedModule } from '../../core/arxml/skeleton';
import { BswmdPickerRoot } from '../components/BswmdPickerDialog';
import { CascadeConfirmRoot } from '../components/CascadeConfirmDialog';
import { ConfirmRoot } from '../components/ConfirmDialog';
import { ConfirmRoot2 } from '../components/ConfirmDialog2.js';
import type { ContextMenuAction } from '../components/ContextMenu';
import { ContextMenuRoot } from '../components/ContextMenu';
import { ModuleFromBswmdPicker } from '../components/ModuleFromBswmdPicker';
import type { NewProjectSubmitOpts } from '../components/NewProjectDialog';
import { NewProjectDialog } from '../components/NewProjectDialog';
import { PromptRoot } from '../components/PromptDialog';
import { RemoveModuleConfirmRoot } from '../components/RemoveModuleConfirmDialog';
import { DcmConfigErrorToast } from '../components/dcmConfig/DcmConfigErrorToast';
import { DcmConfigPicker } from '../components/dcmConfig/DcmConfigPicker';
import { DcmConfigSuccessDialog } from '../components/dcmConfig/DcmConfigSuccessDialog';
import { useArxmlStore } from '../store/useArxmlStore';

import type { DcmConfigLauncher } from './useDcmConfigLauncher';

export interface AppShellProps {
  locale: ReturnType<typeof useArxmlStore.getState>['locale'];
  ecucPickerOpen: boolean;
  preSelectedBswmdPath: string | undefined;
  handleConfirmEcucPicker: (picks: readonly PickedModule[]) => Promise<void>;
  handleCloseEcucPicker: () => void;
  handleContextMenuAction: (action: ContextMenuAction) => void;
  handleNewProjectSubmit: (name: string, directory: string, opts?: NewProjectSubmitOpts) => void;
  dcmLauncher: DcmConfigLauncher;
  bswmdHasDcm: { dcmBswmdPath: string | undefined };
}

export function AppShell(props: AppShellProps): ReactNode {
  const {
    locale,
    ecucPickerOpen,
    preSelectedBswmdPath,
    handleConfirmEcucPicker,
    handleCloseEcucPicker,
    handleContextMenuAction,
    handleNewProjectSubmit,
    dcmLauncher,
    bswmdHasDcm,
  } = props;

  return (
    <>
      {/* Dialog hosts (Sprint 12 #2 + Sprint 12 #3). Mounted at the
        root so their portals (rendering into document.body) sit on
        top of every workspace layer. */}
      <PromptRoot />
      {/* ConfirmRoot BEFORE NewProjectDialog: ConfirmRoot installs the
        module-level externalSetState handle used by `confirm()`;
        submitNewProject (Task 5) calls `confirm()` from inside
        NewProjectDialog.onSubmit, so ConfirmRoot must mount first. */}
      <ConfirmRoot />
      {/* v1.36.0 MINOR T4 -- 2-button destructive confirm modal
          (separate from <ConfirmRoot /> which is the 3-button
          unsaved-changes modal). Mounted as a sibling; the
          module-level confirmDestructive() API resolves with
          'confirm' or 'cancel'. */}
      <ConfirmRoot2 />
      {/* Sprint 15 / Phase 3.3 -- CascadeConfirmRoot hosts the 3-option
        cascade confirm dialog shown when the user requests a
        delete-container on a node with 1+ incoming references. It
        installs its own module-level `externalSetState` handle used
        by `confirmCascade()` (called from useArxmlStore.deleteContainer
        -- see Phase 2). Mounted last because it depends on no other
        dialog; no cross-mount ordering requirement. */}
      <CascadeConfirmRoot />
      {/* Sprint 17 P2 -- RemoveModuleConfirmRoot hosts the 4-option
        BSWMD-remove confirm dialog (cancel / only / cascade /
        cascade-and-unlink). The 4th option unlinks the BSWMD file
        from disk on top of cascade -- fired by
        `confirmRemoveBswmd()` from `useProjectActions.removeBswmdWithFullFlow`.
        Distinct from CascadeConfirmDialog (3-option) because the
        4th option's semantics have no ECUC analog. */}
      <RemoveModuleConfirmRoot />
      <NewProjectDialog onSubmit={handleNewProjectSubmit} />
      {/* Sprint 14 / Task 11 -- ECUC picker. Hosted at App.tsx so any
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
      {/* Sprint A X2 -- P0-3 wiring. Mount the two dialog hosts that
        back the Tree right-click flow:
          - <BswmdPickerRoot /> (z-index 9995): subscribes to
            useArxmlStore.bswmdPicker; opens when the menu emits an
            'add-*' action. The host action handles Done -> close.
          - <ContextMenuRoot onAction={handleContextMenuAction} /> (z-index 9998):
            module-level externalSetState API; opens when
            openContextMenu() is called from TreeNode.onContextMenu.
            Note: ContextMenuRoot sits at a HIGHER z-index than
            BswmdPickerRoot so a click on the picker closes the menu
            without overlap collisions.
        The two hosts share no internal state; App.tsx is the single
        router between them (handleContextMenuAction), keeping each
        component decoupled from the other's update path. */}
      <BswmdPickerRoot />
      <ContextMenuRoot onAction={handleContextMenuAction} locale={locale} />
      {/* v1.31.0 PATCH T7 -- Dcm config renderer UX. Both components
          are presentational; the launcher hook owns the state
          machine. The success dialog is unconditionally mounted
          but the component itself early-returns null when `open`
          is false (see T2 DcmConfigSuccessDialog.tsx:55), so the
          non-null assertion on `launcher.state.result!` is safe --
          see the state machine invariant note above. The error
          toast follows the same pattern (T1 DcmConfigErrorToast.tsx
          returns null when error is null). */}
      <DcmConfigSuccessDialog
        open={dcmLauncher.state.dialogOpen}
        result={dcmLauncher.state.result!}
        locale={locale}
        onClose={dcmLauncher.closeDialog}
        onGenerateNew={dcmLauncher.handleGenerateNew}
        history={useArxmlStore((s) => s.xlsxImportHistory)}
        onReuseFromHistory={(importedAt) => useArxmlStore.getState().reuseFromHistory(importedAt)}
      />
      <DcmConfigErrorToast
        error={dcmLauncher.state.error}
        locale={locale}
        onDismiss={dcmLauncher.dismissToast}
      />
      {/* v1.32.0 MINOR T8 -- ODX picker thin wrapper (T6). Mounts
          only while the launcher's state is `picking-odx`; the
          component itself returns null so DOM-wise it is a ghost.
          The locale + resolve/cancel callbacks come straight off
          the launcher hook (T5's `handlePickerResolve` /
          `handlePickerCancel`).
          v1.33.0 MINOR T7 -- `defaultPath` is the project root
          directory (parent of the manifest file), or the parent
          directory of the resolved Dcm BSWMD path when no project
          is open. The split handles both / and \\ so Windows paths
          are stripped correctly. The picker forwards this to the
          `odx:open-with-default` IPC (v1.33.0 T3) so the OS
          dialog opens at a meaningful starting location. We use
          `useArxmlStore.getState()` instead of subscribing so a
          re-render is not forced on every projectPath change
          (matches the picker-host convention at line 1258). */}
      {dcmLauncher.state.mode === 'picking-odx' && (
        <DcmConfigPicker
          locale={locale === 'zh-CN' ? 'zh-CN' : 'en'}
          defaultPath={(() => {
            const pp = useArxmlStore.getState().projectPath;
            if (pp !== null) {
              return pp.replace(/[\\/][^\\/]+$/, '');
            }
            return bswmdHasDcm.dcmBswmdPath?.split(/[/\\]/).slice(0, -1).join('/');
          })()}
          onResolve={dcmLauncher.handlePickerResolve}
          onCancel={dcmLauncher.handlePickerCancel}
        />
      )}
    </>
  );
}
