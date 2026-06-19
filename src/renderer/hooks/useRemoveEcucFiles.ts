// useRemoveEcucFiles — Sprint 16 / T5.
//
// Companion to `useCreateEcucFromBswmd`. The BSWMD-to-ECUC picker
// (ModuleFromBswmdPicker) now operates as a SET: it pre-seeds its
// checkbox state from the project's existing ECUCs and, on Confirm,
// computes a diff:
//
//   - newly-checked modules → useCreateEcucFromBswmd.create()
//   - newly-unchecked modules → useRemoveEcucFiles.remove()
//
// `remove()` resolves each pick to a (filePath, moduleShortName)
// tuple inside the store. If ANY target is dirty, a ConfirmDialog
// pops once with a list of the affected modules and three choices:
//   - 'continue'   → cancel the entire removal (return canceled)
//   - 'discard'    → proceed without saving dirty edits
//   - 'saveAndProceed' → silently save each dirty target via the
//                        T2 silent-save-back path, then proceed
//
// After the dirty-guard, each target's on-disk file is deleted via
// `window.autosarApi.deleteArxml` and the in-memory document is
// removed via `store.removeDocument`. Partial failures are
// surfaced in the result so the host can show a toast.
//
// Pure orchestration hook; no React state of its own beyond a
// memoised `remove` callback.

import { useCallback } from 'react';

import type { PickedModule } from '@core/arxml/skeleton.js';
import type { ProjectDeleteArxmlResult } from '@shared/types.js';
import { t } from '@shared/i18n.js';

import { confirm } from '../components/ConfirmDialog.js';
import { useArxmlStore } from '../store/useArxmlStore.js';

export interface RemoveEcucTarget {
  readonly filePath: string;
  readonly moduleShortName: string;
  readonly bswmdPath: string;
  readonly isDirty: boolean;
}

export type RemoveEcucResult =
  | {
      readonly kind: 'ok';
      readonly removed: readonly string[];
    }
  | {
      readonly kind: 'partial';
      readonly removed: readonly string[];
      readonly failed: readonly { readonly filePath: string; readonly message: string }[];
    }
  | { readonly kind: 'canceled' }
  | { readonly kind: 'error'; readonly message: string };

export function useRemoveEcucFiles(): {
  readonly remove: (picks: readonly PickedModule[]) => Promise<RemoveEcucResult>;
} {
  const remove = useCallback(
    async (picks: readonly PickedModule[]): Promise<RemoveEcucResult> => {
      if (picks.length === 0) {
        return { kind: 'ok', removed: [] };
      }
      const state = useArxmlStore.getState();
      const locale = state.locale;

      // -- 1. Resolve each pick to a concrete target file ----------
      //
      // Walk every loaded document; a target is a doc whose
      // `sourceBswmdPath` matches the pick's `bswmdPath` AND whose
      // top-level module shortName matches the pick's
      // `moduleShortName`. Skeleton-generated ECUCs are 1-module docs
      // (see buildModule in skeleton.ts), so packages[0].elements[0]
      // is the module.
      const targets: RemoveEcucTarget[] = [];
      for (const pick of picks) {
        const doc = state.documents.find((d) => {
          if (d.sourceBswmdPath !== pick.bswmdPath) return false;
          const moduleEl = d.packages[0]?.elements[0];
          return moduleEl?.kind === 'module' && moduleEl.shortName === pick.moduleShortName;
        });
        if (doc === undefined) continue;
        targets.push({
          filePath: doc.path,
          moduleShortName: pick.moduleShortName,
          bswmdPath: pick.bswmdPath,
          isDirty: state.dirtyPaths.has(doc.path),
        });
      }
      if (targets.length === 0) {
        return { kind: 'ok', removed: [] };
      }

      // -- 2. Dirty-guard ------------------------------------------
      //
      // The dirty-guard is per-target (not project-wide): only the
      // ECUCs the user wants to remove are surfaced, not every dirty
      // doc in the project. This matches the user's mental model —
      // they are excluding specific modules, not closing the project.
      const dirtyTargets = targets.filter((t) => t.isDirty);
      if (dirtyTargets.length > 0) {
        const names = dirtyTargets.map((t) => t.moduleShortName).join(', ');
        const choice = await confirm({
          title: t(locale, 'ecuc.fromBswmd.excludeTitle'),
          message: t(locale, 'ecuc.fromBswmd.excludeMessage', { names }),
          discardLabel: t(locale, 'confirm.unsaved.discard.excludeEcuc'),
          saveLabel: t(locale, 'confirm.unsaved.saveAndNew.excludeEcuc'),
        });
        if (choice === 'continue') {
          return { kind: 'canceled' };
        }
        if (choice === 'saveAndProceed') {
          // Sprint 16 T2 — silent-save-back via the same handler the
          // Save button uses. We feed each dirty target's on-disk
          // path as `currentPath` so the IPC skips the dialog.
          for (const target of dirtyTargets) {
            const doc = state.documents.find((d) => d.path === target.filePath);
            if (doc === undefined) continue;
            const saveResult = await window.autosarApi.saveArxml({
              doc,
              currentPath: target.filePath,
            });
            if (saveResult.ok && !saveResult.value.canceled) {
              useArxmlStore
                .getState()
                .markSaved(saveResult.value.path ?? target.filePath);
            }
            // Save failures here are non-fatal: the user picked
            // "save & exclude" but a save may have failed silently
            // (e.g. EACCES). We still proceed to remove the in-memory
            // document and delete the on-disk file; partial failures
            // surface in the result so the caller can toast.
          }
        }
        // 'discard' falls through: proceed without saving.
      }

      // -- 3. Delete + remove --------------------------------------
      const removed: string[] = [];
      const failed: { filePath: string; message: string }[] = [];
      for (const target of targets) {
        const del: ProjectDeleteArxmlResult = await window.autosarApi.deleteArxml({
          filePath: target.filePath,
        });
        if (del.kind === 'ok' || del.kind === 'not-found') {
          useArxmlStore.getState().removeDocument(target.filePath);
          removed.push(target.filePath);
        } else {
          failed.push({ filePath: target.filePath, message: del.message });
        }
      }
      if (failed.length === 0) {
        return { kind: 'ok', removed };
      }
      if (removed.length === 0) {
        const first = failed[0];
        return {
          kind: 'error',
          message: first !== undefined ? first.message : 'unknown delete failure',
        };
      }
      return { kind: 'partial', removed, failed };
    },
    [],
  );

  return { remove };
}