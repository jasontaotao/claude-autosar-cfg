// useProjectActions — shared hook for project lifecycle (New / Open / Save
// / Load BSWMD).
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
// Each function returns a `ProjectActionResult` discriminated union so
// callers can branch on success / failure / canceled (e.g. show a
// toast for the failure branch, no-op on canceled).

import { useCallback } from 'react';

import { t } from '@shared/i18n';
import type { Locale } from '@shared/i18n';

import { prompt } from '../components/PromptDialog';
import { useArxmlStore } from '../store/useArxmlStore';

export type ProjectActionResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'canceled' }
  | { readonly kind: 'error'; readonly message: string };

/**
 * Hook returning the four project lifecycle actions. All four read
 * `locale` from the store on demand so error messages stay in sync
 * with the user's current language preference.
 */
export function useProjectActions(): {
  readonly newProject: () => Promise<ProjectActionResult>;
  readonly openProjectFromDialog: () => Promise<ProjectActionResult>;
  readonly saveProject: () => Promise<ProjectActionResult>;
  readonly addBswmdFromDialog: () => Promise<ProjectActionResult>;
} {
  const newProject = useCallback(async (): Promise<ProjectActionResult> => {
    const locale = useArxmlStore.getState().locale;
    const name = await prompt({
      message: t(locale, 'app.prompt.projectName'),
      defaultValue:
        useArxmlStore.getState().project?.name ?? t(locale, 'app.prompt.defaultName'),
    });
    if (name === null) {
      return { kind: 'canceled' };
    }
    const result = await window.autosarApi.projectNew({ name: name.trim() });
    switch (result.kind) {
      case 'canceled':
        return { kind: 'canceled' };
      case 'created':
        useArxmlStore.getState().openProject({
          manifestPath: result.path,
          manifest: result.manifest,
          docs: [],
        });
        return { kind: 'ok' };
      case 'write-failed':
        return {
          kind: 'error',
          message: t(locale, 'app.error.newProjectFailed', { message: result.message }),
        };
    }
  }, []);

  const openProjectFromDialog = useCallback(async (): Promise<ProjectActionResult> => {
    const locale = useArxmlStore.getState().locale;
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
  }, []);

  const saveProject = useCallback(async (): Promise<ProjectActionResult> => {
    const locale = useArxmlStore.getState().locale;
    const { project, projectPath } = useArxmlStore.getState();
    if (project === null || projectPath === null) {
      return { kind: 'canceled' };
    }
    const result = await window.autosarApi.projectSave({
      manifestPath: projectPath,
      manifest: project,
      // Phase 1: per-doc saves go through `saveArxml`; Project Save
      // writes only the manifest. Future phases may collect dirty
      // docs here for atomic save.
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
  //      the 8 MiB cap and returns either the raw string or a
  //      single-line `read-failed` message; we surface the latter
  //      through `app.error.readBswmdFailed`.
  //   4. Hand the content to `store.addBswmd`. The store itself is
  //      responsible for dedupe-by-path and parse-error formatting —
  //      the hook just inspects the resulting `error` state. On
  //      success the store clears any prior `error`; on failure the
  //      store sets a localized error (`duplicateBswmd` or
  //      `parseBswmdFailed`). We mirror that error into the
  //      `ProjectActionResult` so the caller can show a toast.
  const addBswmdFromDialog = useCallback(async (): Promise<ProjectActionResult> => {
    const locale = useArxmlStore.getState().locale;
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
  }, []);

  return { newProject, openProjectFromDialog, saveProject, addBswmdFromDialog };
}

/** Convenience type for Locale consumers (re-export to keep callers tidy). */
export type { Locale };
