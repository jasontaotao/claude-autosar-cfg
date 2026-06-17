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
// hook only flips the store flag (`newProjectDialogOpen` +
// `pendingAction`) and the actual IPC call happens in `submitNewProject`,
// which the host wires to `<NewProjectDialog onSubmit={...} />`.
//
// Each function returns a `ProjectActionResult` discriminated union so
// callers can branch on success / failure / canceled (e.g. show a
// toast for the failure branch, no-op on canceled).

import { useCallback } from 'react';

import { t } from '@shared/i18n';
import type { Locale } from '@shared/i18n';

import { confirm } from '../components/ConfirmDialog';
import { useArxmlStore } from '../store/useArxmlStore';

export type ProjectActionResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'canceled' }
  | { readonly kind: 'error'; readonly message: string };

// ---------------------------------------------------------------------------
// Store dialog-state accessors (defensive wrappers)
// ---------------------------------------------------------------------------
//
// Sprint 12 #3 Task 7 added three top-level setters to the store
// (`setNewProjectDialogOpen`, `setConfirmDialogOpen`,
// `setPendingAction`) plus a corresponding read state. The hook
// touches all three. To keep the hook tolerant of builds where Task 7
// hasn't yet landed (or where the store only exposes a subset), each
// accessor falls back to a no-op. Production builds where Task 7 has
// shipped take the fast path; tests that exercise the dialog fields
// patch the store directly (see `useProjectActions.test.ts`).
// ---------------------------------------------------------------------------

function setNewProjectDialogOpen(open: boolean): void {
  const fn = (useArxmlStore.getState() as { setNewProjectDialogOpen?: (o: boolean) => void })
    .setNewProjectDialogOpen;
  if (typeof fn === 'function') fn(open);
}

function setPendingAction(action: unknown): void {
  const fn = (useArxmlStore.getState() as { setPendingAction?: (a: unknown) => void })
    .setPendingAction;
  if (typeof fn === 'function') fn(action);
}

/**
 * Sprint 12 #3 Task 5 — module-level dirty-guard helper. Lives at
 * module scope (not inside the hook) so all four switching actions
 * (`newProject` / `openProjectFromDialog` / `addBswmdFromDialog` /
 * `removeBswmdWithGuard`) can call it without a TDZ on the helper
 * itself, and without putting `guarded` into the useCallback dep
 * array (which would force the callback to be re-created on every
 * render). Phase 1 collapses the three confirm choices into two:
 * 'continue' / 'saveAndProceed' both cancel, 'discard' proceeds.
 * Phase 2 will add a real saveProject branch for 'saveAndProceed'.
 */
async function guardedDirtySwitch(): Promise<
  { readonly proceed: true } | { readonly proceed: false }
> {
  const locale: Locale = useArxmlStore.getState().locale;
  if (useArxmlStore.getState().dirtyPaths.size === 0) {
    return { proceed: true };
  }
  const projectName = useArxmlStore.getState().project?.name ?? '';
  const choice = await confirm({
    title: t(locale, 'confirm.unsaved.title'),
    message: t(locale, 'confirm.unsaved.message', { name: projectName }),
    continueLabel: t(locale, 'confirm.unsaved.continue'),
    discardLabel: t(locale, 'confirm.unsaved.discard'),
    saveLabel: t(locale, 'confirm.unsaved.saveAndNew'),
  });
  if (choice === 'discard') {
    return { proceed: true };
  }
  // 'continue' (user backed out) or 'saveAndProceed' (Phase 1 TODO —
  // will run saveProject then re-call proceed in Phase 2): both
  // cancel for now.
  return { proceed: false };
}

/**
 * Hook returning the project lifecycle actions. All four read
 * `locale` from the store on demand so error messages stay in sync
 * with the user's current language preference.
 *
 * Public API (Sprint 12 #3):
 *   - `newProject()` — flip `newProjectDialogOpen=true` + record a
 *      `pendingAction = { kind: 'newProject' }`. Returns immediately
 *      with `{ kind: 'ok' }`; the actual create happens in
 *      `submitNewProject(name, dir)` once the user fills the dialog
 *      and the host's onSubmit fires.
 *   - `submitNewProject(name, dir)` — calls `window.autosarApi.projectNew`
 *      and dispatches the result kind (created / overwrite-confirm /
 *      write-failed / invalid-name).
 *   - `openProjectFromDialog()` — guards on `dirtyPaths.size > 0`, then
 *      calls IPC `project:open` and dispatches the result into the
 *      store.
 *   - `saveProject()` — unchanged from Sprint 11 Phase 1 (writes the
 *      manifest only; per-doc saves go through `saveArxml`).
 *   - `addBswmdFromDialog()` — guards on `dirtyPaths.size > 0`, then
 *      runs the Sprint 12 #2 file-picker + read + `store.addBswmd`
 *      flow.
 *   - `removeBswmdWithGuard(path)` — guards on `dirtyPaths.size > 0`,
 *      then calls `store.removeBswmd(path)`.
 *
 * Dirty-guard semantics (Phase 1):
 *   - 'continue' → return `{ kind: 'canceled' }`, no IPC.
 *   - 'discard' → proceed with the original action.
 *   - 'saveAndProceed' → return `{ kind: 'canceled' }`. Phase 2 will
 *     run `saveProject()` first; Phase 1 simplification is the safe
 *     "do nothing" default so we never silently drop user data.
 */
export function useProjectActions(): {
  readonly newProject: () => Promise<ProjectActionResult>;
  readonly openProjectFromDialog: () => Promise<ProjectActionResult>;
  readonly saveProject: () => Promise<ProjectActionResult>;
  readonly addBswmdFromDialog: () => Promise<ProjectActionResult>;
  readonly removeBswmdWithGuard: (path: string) => Promise<ProjectActionResult>;
  readonly submitNewProject: (name: string, directory: string) => Promise<ProjectActionResult>;
} {
  // -------------------------------------------------------------------------
  // Sprint 12 #3 Task 5 — `newProject` opens the unified NewProjectDialog.
  //
  // The two-step `prompt() → IPC projectNew` flow is replaced: the
  // dialog collects `{name, directory}` and the host wires its
  // `onSubmit(name, dir)` to `submitNewProject` below. We no longer
  // touch IPC here — the dialog renders, the user types, and the
  // actual create happens once `submitNewProject` runs.
  //
  // Sprint 12 #3 (post-review fix): `newProject` also runs the
  // dirty-guard so it matches the "all switching actions" rule
  // (newProject / openProject / addBswmd / removeBswmd all gate on
  // `isDirty`). Without this, a user could create a new project on top
  // of unsaved ARXML changes and silently lose the in-flight edits.
  // -------------------------------------------------------------------------
  const newProject = useCallback(async (): Promise<ProjectActionResult> => {
    const guard = await guardedDirtySwitch();
    if (!guard.proceed) {
      return { kind: 'canceled' };
    }
    setNewProjectDialogOpen(true);
    setPendingAction({ kind: 'newProject' });
    return { kind: 'ok' };
  }, []);

  // -------------------------------------------------------------------------
  // Sprint 12 #3 Task 5 — `submitNewProject` is the host's onSubmit
  // target. It switches on the `projectNew` IPC result:
  //   - 'created'         → close dialog, hand the manifest to the store
  //   - 'overwrite-confirm' → Phase 1 simplification: surface as an
  //     error so the user can pick a different name / directory; the
  //     dialog stays open. (Phase 2 will add a real overwrite-confirm
  //     flow.)
  //   - 'write-failed' / 'invalid-name' → surface as an error; dialog
  //     stays open.
  // -------------------------------------------------------------------------
  const submitNewProject = useCallback(
    async (name: string, directory: string): Promise<ProjectActionResult> => {
      const result = await window.autosarApi.projectNew({ name, directory });
      switch (result.kind) {
        case 'created':
          setNewProjectDialogOpen(false);
          setPendingAction(null);
          useArxmlStore.getState().openProject({
            manifestPath: result.path,
            manifest: result.manifest,
            docs: [],
          });
          return { kind: 'ok' };
        case 'overwrite-confirm':
          // Phase 1: bubble the conflict path as an error. The dialog
          // stays open so the user can rename or pick another dir.
          return {
            kind: 'error',
            message: `文件已存在: ${result.path} — 请换一个项目名或目录`,
          };
        case 'write-failed':
          return { kind: 'error', message: result.message };
        case 'invalid-name':
          return { kind: 'error', message: result.message };
      }
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Dirty-guard helper (Phase 1).
  //
  // Returns `{ proceed: true }` when the caller may proceed, or
  // `{ proceed: false }` when the user backed out. Phase 1 collapses
  // the three confirm choices into two: 'continue' / 'saveAndProceed'
  // both cancel, 'discard' proceeds. Phase 2 will add a real
  // saveProject branch for 'saveAndProceed'.
  //
  // The dirty-guard helper (`guardedDirtySwitch`) lives at module
  // scope above so it can be called from any of the four switching
  // actions without a TDZ and without forcing useCallback re-creation.
  // `dirtyPaths.size > 0` is read directly from the store; the store's
  // `isDirty()` function-on-state getter is exposed for external
  // consumers but the hook reads the underlying set to keep this path
  // synchronous (it gates an async IPC call).
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Sprint 11 Phase 1 + Sprint 12 #3 dirty-guard — open a project from
  // disk via the OS open dialog.
  // -------------------------------------------------------------------------
  const openProjectFromDialog = useCallback(async (): Promise<ProjectActionResult> => {
    const locale = useArxmlStore.getState().locale;
    const guard = await guardedDirtySwitch();
    if (!guard.proceed) {
      setPendingAction(null);
      return { kind: 'canceled' };
    }
    const result = await window.autosarApi.projectOpen();
    switch (result.kind) {
      case 'canceled':
        setPendingAction(null);
        return { kind: 'canceled' };
      case 'read-failed':
        setPendingAction(null);
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
          setPendingAction(null);
          return { kind: 'ok' };
        } catch (e) {
          setPendingAction(null);
          return {
            kind: 'error',
            message: t(locale, 'app.error.openProjectParse', {
              message: e instanceof Error ? e.message : String(e),
            }),
          };
        }
    }
  }, []);

  // -------------------------------------------------------------------------
  // Sprint 11 Phase 1 — save the current project's manifest. Per-doc
  // saves go through `saveArxml`; Project Save writes only the
  // manifest in Phase 1. Future phases may collect dirty docs here
  // for atomic save.
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
  // Sprint 12 #2 + Sprint 12 #3 Task 5 dirty-guard — renderer-driven
  // "Load BSWMD" flow. Sprint 12 #2 docstring below covers the full
  // step list; Phase 1 here just adds the dirty-guard wrapper at the
  // top so a dirty switching action shows the ConfirmDialog before
  // the OS file picker pops.
  // -------------------------------------------------------------------------
  // Sprint 12 #2 — "Load BSWMD" flow. Steps:
  //   1. Guard: project must be open. Loose mode is rejected with a
  //      localized `needProject` message WITHOUT touching IPC or the
  //      store (user-confirmed design decision #3 — the schema-side
  //      has no project to mirror to, and product decided BSWMD load
  //      is project-scoped). Short-circuit preserves the existing
  //      loose-mode behaviour where the renderer can keep using the
  //      other three actions (new/open/save) without an open project.
  //   2. Ask main to show the BSWMD open-file dialog (single-file
  //      picker filtered to .arxml/.xml). If the user dismisses, the
  //      IPC returns `canceled` and we forward that.
  //   3. Read the chosen file via `bswmd:read`. The handler applies
  //      the 32 MiB cap and returns either the raw string or a
  //      single-line `read-failed` message; we surface the latter
  //      through `app.error.readBswmdFailed`.
  //   4. Hand the content to `store.addBswmd`. The store itself is
  //      responsible for dedupe-by-path and parse-error formatting —
  //      the hook just inspects the resulting `error` state. On
  //      success the store clears any prior `error`; on failure the
  //      store sets a localized error (`duplicateBswmd` or
  //      `parseBswmdFailed`). We mirror that error into the
  //      `ProjectActionResult` so the caller can show a toast.
  // Sprint 12 #3 Task 5 — wraps step 1 with the dirty guard so a
  // dirty switching action shows ConfirmDialog before the OS picker.
  const addBswmdFromDialog = useCallback(async (): Promise<ProjectActionResult> => {
    const locale = useArxmlStore.getState().locale;
    // Step 0 (Sprint 12 #3): dirty guard. When the project has unsaved
    // changes we surface ConfirmDialog and bail if the user picks
    // 'continue' / 'saveAndProceed'.
    const guard = await guardedDirtySwitch();
    if (!guard.proceed) {
      setPendingAction(null);
      return { kind: 'canceled' };
    }
    // Step 1: loose-mode gate
    if (useArxmlStore.getState().project === null) {
      setPendingAction(null);
      return {
        kind: 'error',
        message: t(locale, 'app.error.needProject'),
      };
    }
    // Step 2: file picker
    const pick = await window.autosarApi.openBswmdDialog();
    if (pick.kind === 'canceled') {
      setPendingAction(null);
      return { kind: 'canceled' };
    }
    // Step 3: read file
    const read = await window.autosarApi.readBswmd({ path: pick.path });
    if (read.kind === 'read-failed') {
      setPendingAction(null);
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
    setPendingAction(null);
    if (errorAfter !== null && errorAfter !== errorBefore) {
      // The store surfaces a localized message
      // (`duplicateBswmd` / `parseBswmdFailed` / ...) — bubble it
      // through verbatim so the caller can render it without a
      // second `t()` call.
      return { kind: 'error', message: errorAfter };
    }
    return { kind: 'ok' };
  }, []);

  // -------------------------------------------------------------------------
  // Sprint 12 #3 Task 5 — `removeBswmdWithGuard`. Wraps the store's
  // `removeBswmd` (already public) with a dirty-guard so removing a
  // BSWMD from the project doesn't silently drop unsaved doc changes.
  // The store's own `removeBswmd` is a no-op on unknown paths; we
  // forward `{ kind: 'canceled' }` to mirror the same semantics at
  // the hook layer (so callers don't have to special-case "the click
  // missed").
  // -------------------------------------------------------------------------
  const removeBswmdWithGuard = useCallback(async (path: string): Promise<ProjectActionResult> => {
    // Bail up-front on unknown paths so we don't even open the
    // ConfirmDialog for a no-op click.
    if (!useArxmlStore.getState().bswmdPaths.includes(path)) {
      return { kind: 'canceled' };
    }
    const guard = await guardedDirtySwitch();
    if (!guard.proceed) {
      setPendingAction(null);
      return { kind: 'canceled' };
    }
    useArxmlStore.getState().removeBswmd(path);
    setPendingAction(null);
    return { kind: 'ok' };
  }, []);

  return {
    newProject,
    openProjectFromDialog,
    saveProject,
    addBswmdFromDialog,
    removeBswmdWithGuard,
    submitNewProject,
  };
}

/** Convenience type for Locale consumers (re-export to keep callers tidy). */
export type { Locale };
