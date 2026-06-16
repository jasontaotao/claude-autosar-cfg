// useProjectActions — shared hook for project lifecycle (New / Open / Save).
//
// Sprint 11 Phase 1 (code-review H2): ProjectPanel's LooseView used to
// dispatch synthetic clicks on AppHeader buttons to share the IPC flow.
// That coupling is fragile (sibling DOM, async void, no error feedback).
// The fix: extract the IPC + dialog + store-mutate flow into this hook
// and call it from both AppHeader and ProjectPanel.
//
// Each function returns a `ProjectActionResult` discriminated union so
// callers can branch on success / failure / canceled (e.g. show a
// toast for the failure branch, no-op on canceled).

import { useCallback } from 'react';

import { t } from '@shared/i18n';
import type { Locale } from '@shared/i18n';

import { useArxmlStore } from '../store/useArxmlStore';

export type ProjectActionResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'canceled' }
  | { readonly kind: 'error'; readonly message: string };

/**
 * Hook returning the three project lifecycle actions. All three read
 * `locale` from the store on demand so error messages stay in sync
 * with the user's current language preference.
 */
export function useProjectActions(): {
  readonly newProject: () => Promise<ProjectActionResult>;
  readonly openProjectFromDialog: () => Promise<ProjectActionResult>;
  readonly saveProject: () => Promise<ProjectActionResult>;
} {
  const newProject = useCallback(async (): Promise<ProjectActionResult> => {
    const locale = useArxmlStore.getState().locale;
    const name = window.prompt(
      t(locale, 'app.prompt.projectName'),
      useArxmlStore.getState().project?.name ?? t(locale, 'app.prompt.defaultName'),
    );
    if (name === null || name.trim().length === 0) {
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

  return { newProject, openProjectFromDialog, saveProject };
}

/** Convenience type for Locale consumers (re-export to keep callers tidy). */
export type { Locale };
