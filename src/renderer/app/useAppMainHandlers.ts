// src/renderer/app/useAppMainHandlers.ts
// Closure-scoped hook for the App.tsx main handlers (ECUC picker + Generate
// code + Context menu + ScriptPanel toggle). Extracted from
// `src/renderer/App.tsx` as part of v1.42.1 MINOR T1 (per-flow JSX refactor
// for the Round-1 L8 file-size backlog).
//
// Public surface: 9 callbacks + 3 state slots + 4 derived values
// (canSelectEcucModule, viewMode, isImportMerged, projectForGenerate,
// projectPathForGenerate) = 16 return fields total.
//
// Existing consumers (AppHeader, LeftPanel, ContextMenuRoot, etc.) exercise
// this via the App component, not directly — the App shell destructures
// the hook return and passes callbacks as props.
//
// Per-flow scope chosen over bulk extraction (lesson
// `god-component-jsx-refactor-requires-per-signature-analysis-not-bulk-extraction`):
// this T handles 9 callbacks + 3 state slots only; Flows 2-4 remain in
// App.tsx for separate T-level commits (see v1.42.1 plan + T0 spec).

import { useCallback, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import { findFirstEcucModule } from '@core/arxml/path.js';
import type { PickedModule } from '@core/arxml/skeleton.js';
import { t as i18nT } from '@shared/i18n/index.js';

import { openContextMenu } from '../components/ContextMenu';
import type { ContextMenuAction } from '../components/ContextMenu';
import { useCreateEcucFromBswmd } from '../hooks/useCreateEcucFromBswmd';
import type { useDcmConfigLauncher } from '../hooks/useDcmConfigLauncher';
import { useGenerateCode } from '../hooks/useGenerateCode';
import { useProjectActions } from '../hooks/useProjectActions';
import { useRemoveEcucFiles } from '../hooks/useRemoveEcucFiles';
import { useArxmlStore } from '../store/useArxmlStore';

export type DcmLauncher = ReturnType<typeof useDcmConfigLauncher>;

export type AppMainHandlers = {
  // 9 callbacks (verbatim from App.tsx Flow 1)
  handleOpenDcmConfig: () => void;
  handleMenuSelectEcucModule: () => void;
  handleAddEcucFromBswmd: (bswmdPath: string) => void;
  handleCloseEcucPicker: () => void;
  handleConfirmEcucPicker: (picks: readonly PickedModule[]) => Promise<void>;
  handleContextMenu: (
    path: string,
    kind: 'module' | 'container' | 'reference' | 'bswmd',
    e: ReactMouseEvent,
  ) => void;
  handleGenerateClick: () => Promise<void>;
  handleContextMenuAction: (action: ContextMenuAction) => void;
  toggleScriptPanel: () => void;
  // 3 state slots
  ecucPickerOpen: boolean;
  preSelectedBswmdPath: string | undefined;
  scriptPanelOpen: boolean;
  // 1 derived value (canSelectEcucModule stays — used by AppHeader prop)
  canSelectEcucModule: boolean;
  // isImportMerged: not exposed — App.tsx shell still subscribes via
  // `useArxmlStore((s) => s.viewMode)` and computes it. The hook
  // doesn't need it (handleContextMenuAction does not branch on it).
};

export function useAppMainHandlers(args: {
  dcmLauncher: DcmLauncher;
  odxPath: string;
}): AppMainHandlers {
  const { dcmLauncher, odxPath } = args;
  // Sprint 14 / Task 11 — ECUC picker lifecycle. The hook owns the
  // open/close state because it's the single mount point for any
  // entry point that wants to invoke the picker (the AppHeader menu
  // and the ProjectPanel row chips are both descendants of <App />).
  // `preSelectedBswmdPath` is `undefined` for the menu-driven flow
  // (the user picks from scratch) and is the BSWMD path for the row
  // flow (so the user lands directly inside the right BSWMD).
  const [ecucPickerOpen, setEcucPickerOpen] = useState(false);
  const [preSelectedBswmdPath, setPreSelectedBswmdPath] = useState<string | undefined>(undefined);
  // T8 orchestration hook — writes ARXML via IPC, registers the new
  // docs in the store on success, rolls back on partial failure.
  const { create: createEcuc } = useCreateEcucFromBswmd();
  const { remove: removeEcuc } = useRemoveEcucFiles();
  // The picker is gated on BOTH a BSWMD being loaded (otherwise
  // there's nothing to enumerate) AND a project being open (the
  // picker writes into the project's directory). `canSelectEcucModule`
  // is also passed back so the App shell's JSX can use it for the
  // AppHeader's `canSelectEcucModule` prop.
  const canSelectEcucModule = useArxmlStore((s) => s.bswmdSchemas.length > 0 && s.project !== null);
  // `locale`, `setStoreError`, `setInfo`, `projectForGenerate`,
  // `projectPathForGenerate` are intentionally NOT subscribed here
  // — the App shell subscribes once and the callbacks read the live
  // values via `useArxmlStore.getState()` at call time (read-once
  // pattern that handleConfirmEcucPicker and handleGenerateClick
  // already use). This keeps the hook's subscription count low
  // and avoids re-rendering the hook's caller on every store update
  // that only changes locale/error text.

  // v1.31.0 PATCH T7 — handleOpenDcmConfig routes through
  // `promptAndOpen()` (the v1.32.0 T5 top-level entry). The launcher
  // object + odxPath are passed in as args from App.tsx shell (where
  // the launcher is owned for the modal mount + dcmConfigBusy prop).
  // The legacy `dcmLauncher.open({ odxPath, xlsxRows: [] })` is
  // preserved on the ContextMenu path below — it bypasses the picker
  // because the ContextMenu entry is gated on the user right-clicking
  // a BSWMD row, and the right-clicked path is treated as the picker
  // target (xlsxRows placeholder documented at
  // useDcmConfigLauncher.ts:484).
  const handleOpenDcmConfig = useCallback((): void => {
    void dcmLauncher.promptAndOpen();
  }, [dcmLauncher]);
  // Sprint 14 / T13 — viewMode three-state guard. While
  // viewMode === 'import-merged' the import-merged panel mounts in
  // the left column and the Save / Combined UI affordances are
  // `viewMode` is read in App.tsx shell (drives `isImportMerged` for the
  // JSX branch at line ~967). The hook doesn't use viewMode
  // (handleContextMenuAction does not branch on it), so we don't
  // subscribe here.

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
      // Read-once pattern: `locale` + `setStoreError` from the store
      // at call time (avoids the useCallback dep-array capturing
      // stale references and re-renders).
      const { locale, setError: setStoreError } = useArxmlStore.getState();
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
        // Sprint X — nested-package parity. `doc.packages[0]?.elements[0]`
        // returns undefined on vendor-prefix source docs whose ECUC module
        // lives under one or more <AR-PACKAGE> wrappers (e.g. the
        // user-reported `JWQ_CDD_PACK > JWQ_Packet > JWQ3399` shape from
        // C:\Users\13777\Desktop\ClaudeAutosarWorkSpace\ecuc\JWQ3399_EcucValues.arxml).
        // `findFirstEcucModule` walks depth-first across the recursive
        // <AR-PACKAGES> tree so the picker dedup works on both shapes.
        const moduleEl = findFirstEcucModule(doc);
        if (moduleEl === null) continue;
        existingPicks.push({
          bswmdPath: doc.sourceBswmdPath,
          moduleShortName: moduleEl.shortName,
        });
      }
      const pickKey = (p: PickedModule): string => `${p.bswmdPath}::${p.moduleShortName}`;
      const incomingKeys = new Set(picks.map(pickKey));
      const existingKeys = new Set(existingPicks.map(pickKey));
      const toAdd = picks.filter((p) => !existingKeys.has(pickKey(p)));
      const toRemove = existingPicks.filter((p) => !incomingKeys.has(pickKey(p)));

      // -- Add path (unchanged from prior behavior) ---------------
      if (toAdd.length > 0) {
        const result = await createEcuc({ picks: toAdd, projectDir });
        if (result.kind === 'ok') {
          if (result.written.length > 0) {
            setStoreError(i18nT(locale, 'ecuc.fromBswmd.toast', { count: result.written.length }));
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
          case 'partial': {
            // Sprint 16c #3 — when every failed entry is a save-phase
            // failure, the hook already surfaced a localised abort
            // toast (ecuc.fromBswmd.saveFailedAbort) at the moment
            // the save loop broke. Re-toasting here would clobber
            // that with a less-informative generic summary, so we
            // skip in that case. Mixed (save + delete) or pure-delete
            // partials still get the generic summary.
            const hasDeleteFailure = removeResult.failed.some((f) => f.phase === 'delete');
            if (hasDeleteFailure) {
              setStoreError(
                i18nT(locale, 'ecuc.fromBswmd.removeFailed') +
                  ': ' +
                  removeResult.failed
                    .filter((f) => f.phase === 'delete')
                    .map((f) => `${f.filePath}: ${f.message}`)
                    .join('; '),
              );
            }
            break;
          }
          case 'error':
            setStoreError(
              i18nT(locale, 'ecuc.fromBswmd.removeFailed') + ': ' + removeResult.message,
            );
            break;
        }
      }

      setPreSelectedBswmdPath(undefined);
    },
    [createEcuc, removeEcuc],
  );

  // Sprint A X2 — P0-3 wiring. The Tree's onContextMenu fires with
  // (path, kind, e: ReactMouseEvent); we capture the React event so
  // we can read clientX / clientY for menu positioning. The
  // closure here is intentionally thin — all routing logic lives in
  // `handleContextMenuAction` below.
  //
  // Sprint 17 P3 — `kind` is widened to include `'bswmd'` so a
  // Tree module-kind right-click can also route through this host.
  // The Tree-level wiring (T3.2) re-computes the kind from
  // `documents[].sourceBswmdPath` so the menu item set is correct.
  const handleContextMenu = useCallback(
    (
      path: string,
      kind: 'module' | 'container' | 'reference' | 'bswmd',
      e: ReactMouseEvent,
    ): void => {
      // Extract `shortName` from the path's last segment so the
      // menu's delete label can show what is being deleted.
      const shortName = path.split('/').filter(Boolean).pop() ?? '';
      openContextMenu({ path, kind, shortName }, e.clientX, e.clientY);
    },
    [],
  );

  // Sprint A X2 — P0-3 wiring. Routes every action emitted by
  // ContextMenuRoot to the matching store action. Three "add" items
  // open the BSWMD picker (single + Done model from Sprint 15);
  // "delete-container" delegates to `deleteContainer` (which itself
  // handles cascade-confirm internally); "delete-reference" has no
  // dedicated store action today, so we surface a localized info
  // toast and no-op (the reference graph still lacks a remove path
  // — see Sprint A backlog).
  //
  // Store actions are subscribed here (not via getState in callback
  // bodies) because they're stable references — Zustand store action
  // references are immutable across renders, so subscribing vs
  // getState in callback bodies is equivalent.
  const openBswmdPicker = useArxmlStore((s) => s.openBswmdPicker);
  const deleteContainerAction = useArxmlStore((s) => s.deleteContainer);

  // v1.21.0 MINOR T1 — BSW code generator GUI bridge. App owns the
  // `useGenerateCode` hook so the success / failure toasts route
  // through the global ErrorBanner (consistent with every other
  // async action in App). AppHeader just owns the button enabled-
  // state + click forwarding.
  const generate = useGenerateCode();
  const handleGenerateClick = useCallback(async (): Promise<void> => {
    // Read-once pattern: `locale` + `projectPathForGenerate` from
    // the store at call time (avoids stale-closure trap on the
    // `generate` hook object — see v1.21.0 HIGH-1 below).
    const { locale, projectPath: pp, setInfo, setError: setStoreError } = useArxmlStore.getState();
    if (pp === null) {
      setStoreError(i18nT(locale, 'app.generate.needProject'));
      return;
    }
    // v1.21.0 HIGH-1 — dispatch toasts off the Promise the hook
    // resolves, NOT off the React state captured by `generate` in
    // this closure. Reading `generate.state` / `generate.result`
    // inside `.then` hits the stale-closure trap (the IPC reply
    // triggers a rerender that swaps `generate` to a new object;
    // the captured `generate` is the pre-IPC snapshot). The hook
    // resolves with a `GenerateOutcome` that carries the same
    // information synchronously.
    const outcome = await generate.generate(pp);
    if (outcome.kind === 'ok') {
      setInfo(
        i18nT(locale, 'app.generate.success', {
          count: outcome.result.files.length,
          outDir: outcome.result.outDir,
        }),
      );
    } else {
      setStoreError(i18nT(locale, 'app.generate.failure', { message: outcome.message }));
    }
  }, [generate]);
  // Sprint 17 P3 T3.3 — host-side routing for the new
  // `'remove-module'` action. We pull the unified BSWMD-remove
  // hook from `useProjectActions` so the dirty-guard + 4-option
  // dialog (cancel / only / cascade / cascade-and-unlink) stays
  // in one place. Same hook used by the ProjectPanel × button
  // (rewired in T3.4).
  const { removeBswmdWithFullFlow, deleteEcucModuleWithFullFlow } = useProjectActions();
  const handleContextMenuAction = useCallback(
    (action: ContextMenuAction): void => {
      switch (action.type) {
        case 'add-container':
          openBswmdPicker({ parentPath: action.path, kind: 'container' });
          return;
        case 'add-parameter':
          openBswmdPicker({ parentPath: action.path, kind: 'parameter' });
          return;
        case 'add-reference':
          openBswmdPicker({ parentPath: action.path, kind: 'reference' });
          return;
        case 'delete-container':
          deleteContainerAction(action.path);
          return;
        case 'delete-reference':
          // No store action exists today; surface a localized
          // info toast so the user gets feedback without a silent
          // no-op. We reuse the "info" toast because the operation
          // is supported (the menu exposes the item) but its
          // underlying mutation is not yet implemented — see
          // Sprint A backlog. Read `locale` + `setInfo` at call
          // time (avoids useCallback dep-array churn).
          {
            const { locale, setInfo } = useArxmlStore.getState();
            setInfo(i18nT(locale, 'mutation.action.deleteReferenceNotImplemented'));
          }
          return;
        case 'remove-module':
          // Sprint 17 P3 T3.3 — fire-and-forget. The hook returns a
          // Promise<ProjectActionResult> but the result is surfaced
          // through the store (toast / error) by the hook itself;
          // the menu host doesn't need to await. `void` swallows
          // the unawaited promise for ESLint `no-floating-promises`.
          void removeBswmdWithFullFlow(action.path);
          return;
        case 'delete-module':
          // Sprint A+ — fire-and-forget pattern matching remove-module.
          // The hook wraps the store's deleteEcucModule in
          // guardedDirtySwitch so unsaved edits are protected
          // (spec invariant I3). action.name is the human-readable
          // module shortName used in the i18n target interpolation.
          void deleteEcucModuleWithFullFlow(action.path, action.name);
          return;
        case 'generate-dcm-config':
          // v1.31.0 PATCH T7 — ContextMenu "Generate Dcm Config"
          // entry. Mirrors the AppHeader dropdown path: route
          // through the same launcher hook so the success dialog
          // and error toast are owned by a single state machine.
          // The action only fires when the BSWMD path matched the
          // Dcm regex (T6 ContextMenu gate), so we forward
          // action.path verbatim.
          void dcmLauncher.open({ odxPath, xlsxRows: [] });
          return;
        default: {
          // Exhaustiveness — TS will error here if a new action is
          // added without a handler.
          const _exhaustive: never = action;
          void _exhaustive;
        }
      }
    },
    [
      openBswmdPicker,
      deleteContainerAction,
      deleteEcucModuleWithFullFlow,
      removeBswmdWithFullFlow,
      dcmLauncher,
      odxPath,
    ],
  );

  // Sprint 14 / Phase C (T14) — ScriptPanel toggle. The header owns
  // the open/close flag and passes it down via AppHeader. Mounting
  // the panel conditionally keeps the bundle lazy: only when the
  // user opens the panel do we render the CodeMirror editor and its
  // (heavy) language pack. The `panelOpen` flag also gates which
  // toolbar icon shows.
  const [scriptPanelOpen, setScriptPanelOpen] = useState(false);
  const toggleScriptPanel = useCallback((): void => {
    setScriptPanelOpen((v) => !v);
  }, []);

  return {
    // 9 callbacks
    handleOpenDcmConfig,
    handleMenuSelectEcucModule,
    handleAddEcucFromBswmd,
    handleCloseEcucPicker,
    handleConfirmEcucPicker,
    handleContextMenu,
    handleGenerateClick,
    handleContextMenuAction,
    toggleScriptPanel,
    // 3 state slots (read-only — setXxx stays in hook for callback
    // closures; App.tsx shell does not need them as React state)
    ecucPickerOpen,
    preSelectedBswmdPath,
    scriptPanelOpen,
    // 1 derived value (canSelectEcucModule used by AppHeader prop)
    canSelectEcucModule,
  };
}
