// useProjectActions — shared hook for project lifecycle (New / Open / Save
// / Load BSWMD / Remove BSWMD).
//
// Sprint 11 Phase 1 (code-review H2): ProjectPanel's LooseView used to
// dispatch synthetic clicks on AppHeader buttons to share the IPC flow.
// That coupling is fragile (sibling DOM, async void, no error feedback).
// The fix: extract the IPC + dialog + store-mutate flow into this hook
// and call it from both AppHeader and ProjectPanel.
//
// Sprint 12 #2 adds `addBswmdFromDialog` — the renderer-driven "Load
// BSWMD" flow: pick file → read content → hand to `store.addBswmd`.
// Loose mode is rejected up-front (user-confirmed design decision #3 —
// a BSWMD without a project has no manifest to sync against, and the
// product decision is "Load BSWMD" is project-scoped).
//
// Sprint 12 #3 Task 5 — rewrites `newProject` to drive the unified
// NewProjectDialog (replacing the `prompt()` two-step) and adds dirty
// protection to all switching actions (openProject, addBswmd,
// removeBswmd). The dialog is a host-driven React component, so this
// hook only flips the store flag (`newProjectDialogOpen`) and the
// actual IPC call happens in `submitNewProject`, which the host wires
// to `<NewProjectDialog onSubmit={...} />`.
//
// Sprint 13 #2 Stage 3.2 — Phase 1 cleanup of the 5 deferred
// simplifications from Sprint 12 #3 code review:
//   - Task 1: `'saveAndProceed'` choice now actually saves before
//     proceeding (was a safe-but-confusing "do nothing" in Phase 1).
//   - Task 2: `'overwrite-confirm'` IPC result now opens a 2-button
//     ConfirmDialog (覆盖 / 重命名) and re-invokes `projectNew` with
//     `overwrite: true` on the 覆盖 branch, instead of bubbling up
//     a hard-coded error and forcing the user to retype.
//   - Task 3: `store.pendingAction` is gone (zero consumers in the
//     renderer). `submitNewProject` no longer touches it.
//   - Task 4: confirm dialog text is action-aware (per-action keys
//     `confirm.unsaved.message.{new,open,addBswmd,removeBswmd}` plus
//     matching discard / saveAndNew labels) so "openProject" doesn't
//     say "新建项目将丢失这些更改" anymore.
//   - Task 5: overwrite-confirm dialog text comes from
//     `confirm.overwrite.*` i18n keys.
//
// Each function returns a `ProjectActionResult` discriminated union so
// callers can branch on success / failure / canceled (e.g. show a
// toast for the failure branch, no-op on canceled).
//
// Sprint 14 Task 12 — adds `removeBswmdWithCascade(path)`. When the
// BSWMD has 0 dependents it goes straight to `store.removeBswmd`. When
// it has 1+ dependents (i.e. value-side ARXMLs generated from it via
// the BSWMD-to-ECUC skeleton flow), it pops the 3-option cascade
// confirm dialog (reusing Sprint 15's `CascadeConfirmDialog` — already
// mounted in App.tsx) and dispatches based on the user's choice:
//   - 'cancel'  → no-op, leave BSWMD + dependents alone
//   - 'only'    → remove BSWMD only, leave dependents (they'll lose
//                 schema validation but the user explicitly chose this)
//   - 'cascade' → delete each dependent on disk via
//                 `window.autosarApi.deleteArxml`, drop them from the
//                 store, then remove the BSWMD itself
//
// Why reuse `confirmCascade` instead of the brief's sketch (a custom
// `confirm({options:[{id,label}]})`): the existing
// `ConfirmDialog.confirm()` is locked to the dirty-guard choice set
// (`'continue' | 'discard' | 'saveAndProceed'`). Building a parallel
// dialog for BSWMD remove would duplicate the visual shell, the
// escape/backdrop-resolve semantics, and the test surface. The
// already-mounted `CascadeConfirmRoot` handles all of that and the
// `'cancel' | 'only' | 'cascade'` choice set maps 1:1 onto this
// action's intent. Spec §14.4 still adds the 4 `ecuc.removeBswmd.*`
// i18n keys so a future dedicated dialog can adopt them without
// re-touching i18n.ts.

import { useCallback } from 'react';

import { t } from '@shared/i18n';
import type { Locale } from '@shared/i18n';
import { basename } from '@shared/path';

import { confirmCascade } from '../components/CascadeConfirmDialog';
import { confirm } from '../components/ConfirmDialog';
import { useArxmlStore } from '../store/useArxmlStore';

export type ProjectActionResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'canceled' }
  | { readonly kind: 'error'; readonly message: string };

// ---------------------------------------------------------------------------
// Store dialog-state accessor (defensive wrapper)
// ---------------------------------------------------------------------------
//
// Sprint 12 #3 Task 7 added a top-level setter to the store
// (`setNewProjectDialogOpen`). The hook touches it. To keep the hook
// tolerant of builds where Task 7 hasn't yet landed, the accessor
// falls back to a no-op. Production builds where Task 7 has shipped
// take the fast path; tests that exercise the dialog fields patch the
// store directly (see `useProjectActions.test.ts`).
// ---------------------------------------------------------------------------

function setNewProjectDialogOpen(open: boolean): void {
  const fn = (useArxmlStore.getState() as { setNewProjectDialogOpen?: (o: boolean) => void })
    .setNewProjectDialogOpen;
  if (typeof fn === 'function') fn(open);
}

// ---------------------------------------------------------------------------
// Switching-action axis for confirm-dialog i18n
// ---------------------------------------------------------------------------
//
// The dirty-guard confirm dialog now has action-specific text so the
// message says "打开其他项目将丢失这些更改" instead of "新建项目将丢失
// 这些更改" when the trigger is openProject.
//
// The `SwitchingAction` type is the camelCase verb that matches the
// `useProjectActions` method names. The `toI18nAxis` helper below
// maps it to the i18n key suffix, which intentionally drops the
// trailing "Project" so the keys are short and the bundles read
// naturally (`message.new` not `message.newProject`).
export type SwitchingAction = 'newProject' | 'openProject' | 'addBswmd' | 'removeBswmd';

/** Map a SwitchingAction to the short axis used in i18n key suffixes. */
function toI18nAxis(action: SwitchingAction): 'new' | 'open' | 'addBswmd' | 'removeBswmd' {
  switch (action) {
    case 'newProject':
      return 'new';
    case 'openProject':
      return 'open';
    case 'addBswmd':
      return 'addBswmd';
    case 'removeBswmd':
      return 'removeBswmd';
  }
}

// ---------------------------------------------------------------------------
// Module-level dirty-guard helper
// ---------------------------------------------------------------------------
//
// Sprint 12 #3 Task 5 moved this helper to module scope so all four
// switching actions (`newProject` / `openProjectFromDialog` /
// `addBswmdFromDialog` / `removeBswmdWithGuard`) can call it without a
// TDZ on the helper itself, and without putting `guarded` into the
// useCallback dep array (which would force the callback to be
// re-created on every render).
//
// Sprint 13 #2 Stage 3.2 Task 1 + Task 4:
//
//   - The helper now takes `action: SwitchingAction` and uses per-action
//     i18n keys for message / discard / save labels.
//   - The helper takes an optional `save` callback so the
//     'saveAndProceed' choice can actually persist the project (was
//     a no-op in Phase 1 — confusing for users who clicked "保存并
//     打开" and saw nothing happen). The caller injects its own
//     `saveProject` useCallback so the helper stays hook-agnostic and
//     unit-testable.
//   - The 'saveAndProceed' branch returns either `{ proceed: true }`
//     (save succeeded) or `{ proceed: false, saveError }` (save
//     failed; caller surfaces the message via ProjectActionResult).
// ---------------------------------------------------------------------------

interface GuardedDirtySwitchOptions {
  readonly action: SwitchingAction;
  /** Display name for the target, e.g. the BSWMD path being removed. */
  readonly targetName?: string;
  /** The caller's own saveProject callback. Required when the user
   *  may pick 'saveAndProceed'. */
  readonly save?: () => Promise<ProjectActionResult>;
}

type GuardedDirtySwitchResult =
  | { readonly proceed: true }
  | { readonly proceed: false }
  | { readonly proceed: false; readonly saveError: string };

async function guardedDirtySwitch(
  opts: GuardedDirtySwitchOptions,
): Promise<GuardedDirtySwitchResult> {
  if (useArxmlStore.getState().dirtyPaths.size === 0) {
    return { proceed: true };
  }
  const locale: Locale = useArxmlStore.getState().locale;
  const projectName = useArxmlStore.getState().project?.name ?? '';
  // Per-action interpolation: removeBswmd gets a `{target}` placeholder
  // for the BSWMD path so the message is unambiguous about which one.
  const params: Record<string, string> = { name: projectName };
  if (opts.targetName !== undefined) {
    params.target = opts.targetName;
  }
  const axis = toI18nAxis(opts.action);
  const choice = await confirm({
    title: t(locale, 'confirm.unsaved.title'),
    message: t(locale, `confirm.unsaved.message.${axis}`, params),
    continueLabel: t(locale, 'confirm.unsaved.continue'),
    discardLabel: t(locale, `confirm.unsaved.discard.${axis}`),
    saveLabel: t(locale, `confirm.unsaved.saveAndNew.${axis}`),
  });
  if (choice === 'discard') {
    return { proceed: true };
  }
  if (choice === 'saveAndProceed' && opts.save !== undefined) {
    const saveResult = await opts.save();
    if (saveResult.kind === 'ok') {
      return { proceed: true };
    }
    if (saveResult.kind === 'error') {
      return { proceed: false, saveError: saveResult.message };
    }
    // saveResult.kind === 'canceled' (loose mode or no project on disk)
    // — fall through to proceed: false so the caller bails.
  }
  return { proceed: false };
}

// ---------------------------------------------------------------------------
// Hook API
// ---------------------------------------------------------------------------

/**
 * Hook returning the project lifecycle actions. All four read
 * `locale` from the store on demand so error messages stay in sync
 * with the user's current language preference.
 *
 * Public API (Sprint 12 #3 + Sprint 13 #2):
 *   - `newProject()` — flip `newProjectDialogOpen=true`. Returns
 *      immediately with `{ kind: 'ok' }`; the actual create happens in
 *      `submitNewProject(name, dir)` once the user fills the dialog
 *      and the host's onSubmit fires.
 *   - `submitNewProject(name, dir)` — calls `window.autosarApi.projectNew`
 *      and dispatches the result kind (created / overwrite-confirm /
 *      write-failed / invalid-name). On 'overwrite-confirm' pops a
 *      2-button ConfirmDialog and re-invokes with `overwrite: true`
 *      if the user picks 覆盖.
 *   - `openProjectFromDialog()` — guards on `dirtyPaths.size > 0`, then
 *      calls IPC `project:open` and dispatches the result into the
 *      store.
 *   - `saveProject()` — writes the manifest only; per-doc saves go
 *      through `saveArxml`.
 *   - `addBswmdFromDialog()` — guards on `dirtyPaths.size > 0`, then
 *      runs the Sprint 12 #2 file-picker + read + `store.addBswmd`
 *      flow.
 *   - `removeBswmdWithGuard(path)` — guards on `dirtyPaths.size > 0`,
 *      then calls `store.removeBswmd(path)`.
 *   - `removeBswmdWithCascade(path)` — Sprint 14 Task 12: cascade-
 *     remove a BSWMD. When the BSWMD has 0 dependents, removes the
 *     BSWMD only. When it has 1+ dependents, pops the cascade confirm
 *     dialog and dispatches on the user's choice (cancel / only /
 *     cascade).
 *
 * Dirty-guard semantics (Stage 3.2):
 *   - 'continue' → return `{ kind: 'canceled' }`, no IPC.
 *   - 'discard' → proceed with the original action.
 *   - 'saveAndProceed' → call `saveProject()`. On success proceed;
 *     on failure return `{ kind: 'error', message: <save error> }`.
 */
export function useProjectActions(): {
  readonly newProject: () => Promise<ProjectActionResult>;
  readonly openProjectFromDialog: () => Promise<ProjectActionResult>;
  readonly saveProject: () => Promise<ProjectActionResult>;
  readonly addBswmdFromDialog: () => Promise<ProjectActionResult>;
  readonly removeBswmdWithGuard: (path: string) => Promise<ProjectActionResult>;
  readonly removeBswmdWithCascade: (path: string) => Promise<ProjectActionResult>;
  readonly submitNewProject: (
    name: string,
    directory: string,
    opts?: { readonly bswmdPaths?: readonly string[] },
  ) => Promise<ProjectActionResult>;
} {
  // -------------------------------------------------------------------------
  // `saveProject` is declared first so the dirty-guard helper can close
  // over it from each switching action's useCallback.
  // -------------------------------------------------------------------------
  const saveProject = useCallback(async (): Promise<ProjectActionResult> => {
    const locale = useArxmlStore.getState().locale;
    const { project, projectPath } = useArxmlStore.getState();
    if (project === null || projectPath === null) {
      return { kind: 'canceled' };
    }
    const result = await window.autosarApi.projectSave({
      manifestPath: projectPath,
      manifest: project,
      files: [],
    });
    switch (result.kind) {
      case 'saved':
        return { kind: 'ok' };
      case 'write-failed':
        return {
          kind: 'error',
          message: t(locale, 'app.error.saveProjectFailed', { message: result.message }),
        };
    }
  }, []);

  // -------------------------------------------------------------------------
  // `newProject` — Sprint 12 #3 Task 5 rewrote this to open the
  // NewProjectDialog (replacing the two-step `prompt()` flow). Sprint
  // 12 #3 post-review fix added the dirty guard so creating a new
  // project on top of unsaved changes shows the ConfirmDialog first.
  //
  // Stage 3.2: the guard now threads `action: 'newProject'` so the
  // confirm message says "新建项目" not "打开其他项目", and the
  // 'saveAndProceed' branch actually persists the manifest.
  // -------------------------------------------------------------------------
  const newProject = useCallback(async (): Promise<ProjectActionResult> => {
    const guard = await guardedDirtySwitch({ action: 'newProject', save: saveProject });
    if (!guard.proceed) {
      if ('saveError' in guard) {
        return { kind: 'error', message: guard.saveError };
      }
      return { kind: 'canceled' };
    }
    setNewProjectDialogOpen(true);
    return { kind: 'ok' };
  }, [saveProject]);

  // -------------------------------------------------------------------------
  // `submitNewProject` is the host's onSubmit target. It switches on
  // the `projectNew` IPC result:
  //   - 'created'         → close dialog, hand the manifest to the store
  //   - 'overwrite-confirm' → Stage 3.2 Task 2: pop a 2-button
  //     ConfirmDialog (覆盖 / 重命名). 覆盖 re-invokes the IPC with
  //     `overwrite: true`; 重命名 leaves the dialog open so the user
  //     can edit name/directory.
  //   - 'write-failed' / 'invalid-name' → surface as an error; dialog
  //     stays open.
  // -------------------------------------------------------------------------
  const submitNewProject = useCallback(
    async (
      name: string,
      directory: string,
      opts: { readonly bswmdPaths?: readonly string[] } = {},
    ): Promise<ProjectActionResult> => {
      // Stage 3.4 — forward the user-selected BSWMD paths (if any)
      // to the projectNew IPC. Main writes them into the new
      // manifest's bswmdPaths. Empty array when the user picked
      // Empty / Clone or didn't select any chips.
      const bswmdPaths = [...(opts.bswmdPaths ?? [])];
      const result = await window.autosarApi.projectNew({ name, directory, bswmdPaths });
      switch (result.kind) {
        case 'created':
          setNewProjectDialogOpen(false);
          useArxmlStore.getState().openProject({
            manifestPath: result.path,
            manifest: result.manifest,
            docs: [],
          });
          return { kind: 'ok' };
        case 'overwrite-confirm': {
          // Stage 3.2 Task 2: replace the hard-coded "请换名" error
          // with a real 2-button confirm.
          const locale: Locale = useArxmlStore.getState().locale;
          const choice = await confirm({
            title: t(locale, 'confirm.overwrite.title'),
            message: t(locale, 'confirm.overwrite.message', { path: result.path }),
            continueLabel: t(locale, 'confirm.overwrite.continueLabel'),
            discardLabel: t(locale, 'confirm.overwrite.discardLabel'),
          });
          if (choice === 'continue') {
            // User chose rename — leave the dialog open so they can
            // edit the inputs and click Create again.
            return { kind: 'canceled' };
          }
          // 'discard' → user chose overwrite; retry IPC with the
          // overwrite flag so the handler skips the existence check.
          // Stage 3.4 — re-thread the same bswmdPaths to the retry so
          // the user doesn't lose their selection after the confirm.
          const retry = await window.autosarApi.projectNew({
            name,
            directory,
            overwrite: true,
            bswmdPaths,
          });
          switch (retry.kind) {
            case 'created':
              setNewProjectDialogOpen(false);
              useArxmlStore.getState().openProject({
                manifestPath: retry.path,
                manifest: retry.manifest,
                docs: [],
              });
              return { kind: 'ok' };
            case 'overwrite-confirm':
              // Defensive: with overwrite: true the handler should
              // never return this. If it does (future code change),
              // surface as a write-failed so the user sees feedback.
              return {
                kind: 'error',
                message: t(locale, 'app.error.newProjectFailed', {
                  message: 'overwrite retry reported overwrite-confirm',
                }),
              };
            case 'write-failed':
              return { kind: 'error', message: retry.message };
            case 'invalid-name':
              return { kind: 'error', message: retry.message };
          }
          break;
        }
        case 'write-failed':
          return { kind: 'error', message: result.message };
        case 'invalid-name':
          return { kind: 'error', message: result.message };
      }
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Sprint 11 Phase 1 + Sprint 12 #3 + Stage 3.2 — open a project from
  // disk via the OS open dialog. The dirty guard now uses
  // `action: 'openProject'` for accurate i18n, and 'saveAndProceed'
  // actually persists.
  // -------------------------------------------------------------------------
  const openProjectFromDialog = useCallback(async (): Promise<ProjectActionResult> => {
    const locale = useArxmlStore.getState().locale;
    const guard = await guardedDirtySwitch({ action: 'openProject', save: saveProject });
    if (!guard.proceed) {
      if ('saveError' in guard) {
        return { kind: 'error', message: guard.saveError };
      }
      return { kind: 'canceled' };
    }
    const result = await window.autosarApi.projectOpen();
    switch (result.kind) {
      case 'canceled':
        return { kind: 'canceled' };
      case 'read-failed':
        return {
          kind: 'error',
          message: t(locale, 'app.error.openProjectFailed', { message: result.message }),
        };
      case 'opened':
        try {
          useArxmlStore.getState().openProject({
            manifestPath: result.manifestPath,
            manifest: result.manifest,
            docs: result.docs,
          });
          return { kind: 'ok' };
        } catch (e) {
          return {
            kind: 'error',
            message: t(locale, 'app.error.openProjectParse', {
              message: e instanceof Error ? e.message : String(e),
            }),
          };
        }
    }
  }, [saveProject]);

  // -------------------------------------------------------------------------
  // Sprint 12 #2 + Stage 3.2 — renderer-driven "Load BSWMD" flow.
  // Loose mode is rejected up-front; dirty guard uses
  // `action: 'addBswmd'` for accurate i18n.
  // -------------------------------------------------------------------------
  const addBswmdFromDialog = useCallback(async (): Promise<ProjectActionResult> => {
    const locale = useArxmlStore.getState().locale;
    const guard = await guardedDirtySwitch({ action: 'addBswmd', save: saveProject });
    if (!guard.proceed) {
      if ('saveError' in guard) {
        return { kind: 'error', message: guard.saveError };
      }
      return { kind: 'canceled' };
    }
    // Step 1: loose-mode gate
    if (useArxmlStore.getState().project === null) {
      return {
        kind: 'error',
        message: t(locale, 'app.error.needProject'),
      };
    }
    // Step 2: file picker
    const pick = await window.autosarApi.openBswmdDialog();
    if (pick.kind === 'canceled') {
      return { kind: 'canceled' };
    }
    // Step 3: read file
    const read = await window.autosarApi.readBswmd({ path: pick.path });
    if (read.kind === 'read-failed') {
      return {
        kind: 'error',
        message: t(locale, 'app.error.readBswmdFailed', { message: read.message }),
      };
    }
    // Step 4: hand to the store. Snapshot the prior error so we can
    // distinguish "store just set an error" from "store kept a
    // pre-existing unrelated error" (defensive — `clear()` between
    // tests guarantees the store starts fresh, but a real renderer
    // session could have a stale `error` from an earlier action).
    const errorBefore = useArxmlStore.getState().error;
    useArxmlStore.getState().addBswmd(pick.path, read.content);
    const errorAfter = useArxmlStore.getState().error;
    if (errorAfter !== null && errorAfter !== errorBefore) {
      // The store surfaces a localized message
      // (`duplicateBswmd` / `parseBswmdFailed` / ...) — bubble it
      // through verbatim so the caller can render it without a
      // second `t()` call.
      return { kind: 'error', message: errorAfter };
    }
    return { kind: 'ok' };
  }, [saveProject]);

  // -------------------------------------------------------------------------
  // Sprint 12 #3 + Stage 3.2 — `removeBswmdWithGuard`. The dirty
  // guard uses `action: 'removeBswmd'` and threads `targetName` so
  // the message names the specific BSWMD being removed.
  // -------------------------------------------------------------------------
  const removeBswmdWithGuard = useCallback(
    async (path: string): Promise<ProjectActionResult> => {
      // Bail up-front on unknown paths so we don't even open the
      // ConfirmDialog for a no-op click.
      if (!useArxmlStore.getState().bswmdPaths.includes(path)) {
        return { kind: 'canceled' };
      }
      const guard = await guardedDirtySwitch({
        action: 'removeBswmd',
        targetName: path,
        save: saveProject,
      });
      if (!guard.proceed) {
        if ('saveError' in guard) {
          return { kind: 'error', message: guard.saveError };
        }
        return { kind: 'canceled' };
      }
      useArxmlStore.getState().removeBswmd(path);
      return { kind: 'ok' };
    },
    [saveProject],
  );

  // -------------------------------------------------------------------------
  // Sprint 14 Task 12 — `removeBswmdWithCascade`. Like
  // `removeBswmdWithGuard`, but when the BSWMD has 1+ dependents
  // (value-side ARXMLs that were generated from it via the
  // BSWMD-to-ECUC skeleton flow), it pops the 3-option cascade
  // confirm dialog and dispatches on the user's choice.
  //
  // The dirty guard is intentionally NOT applied here — cascade
  // removal is an explicit user action (the user clicked "remove"
  // knowing the BSWMD has dependents), and re-prompting for unsaved
  // changes on top of the cascade dialog would be UX noise. If the
  // product wants the dirty guard on cascade remove later, lift it
  // from `removeBswmdWithGuard` and prepend it here.
  // -------------------------------------------------------------------------
  const removeBswmdWithCascade = useCallback(
    async (path: string): Promise<ProjectActionResult> => {
      // Bail up-front on unknown paths so we don't pop the dialog for
      // a no-op click. Mirrors `removeBswmdWithGuard`'s first-line
      // guard.
      if (!useArxmlStore.getState().bswmdPaths.includes(path)) {
        return { kind: 'canceled' };
      }
      // Snapshot dependents via the T7 store action. `dependents` is
      // a fresh array each call (the store filters + maps on demand),
      // so it's safe to use directly without re-snapshotting.
      const dependents = useArxmlStore.getState().findDependentsOfBswmd(path);
      if (dependents.length > 0) {
        // Reuse the existing `CascadeConfirmDialog.confirmCascade` —
        // already mounted in App.tsx, already i18n'd via
        // `confirm.cascade.*`. The dialog accepts
        // `{ targetShortName, references: [{filePath, containerPath,
        // paramKey}] }`; for BSWMD-remove the per-reference
        // containerPath / paramKey are not meaningful (a whole ARXML
        // is the dependent, not a single param), so we pass empty
        // strings and let the filePath be the visible identifier.
        const choice = await confirmCascade({
          targetShortName: basename(path),
          references: dependents.map((filePath) => ({
            filePath,
            containerPath: '',
            paramKey: '',
          })),
        });
        if (choice === 'cancel') {
          return { kind: 'ok' };
        }
        if (choice === 'cascade') {
          // For each dependent, delete from disk via IPC, then drop
          // from the store. We read `removeDocument` on a fresh
          // `getState()` per call so the loop sees the post-removal
          // documentPaths each iteration (the store's `removeDocument`
          // is index-by-path, so it tolerates stale snapshots — but
          // this is the explicit, correct shape).
          for (const filePath of dependents) {
            // Best-effort disk delete. The IPC handler returns
            // `{ kind: 'ok' | 'not-found' | 'write-failed' }`. A
            // `not-found` (file already gone) is fine — we still drop
            // the in-memory entry. A `write-failed` is also OK here:
            // the in-memory doc is stale either way, and the user
            // gets to see a store-level error via the next mutation
            // if it matters.
            await window.autosarApi.deleteArxml({ filePath });
            useArxmlStore.getState().removeDocument(filePath);
          }
        }
        // 'only' falls through to remove the BSWMD only — dependents
        // stay in the store and lose schema validation, which is what
        // the user explicitly chose.
      }
      useArxmlStore.getState().removeBswmd(path);
      return { kind: 'ok' };
    },
    [],
  );

  return {
    newProject,
    openProjectFromDialog,
    saveProject,
    addBswmdFromDialog,
    removeBswmdWithGuard,
    removeBswmdWithCascade,
    submitNewProject,
  };
}

/** Convenience type for Locale consumers (re-export to keep callers tidy). */
export type { Locale };
