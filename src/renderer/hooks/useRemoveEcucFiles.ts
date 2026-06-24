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
// Sprint 16c #3 — save-then-delete race fix. When the user picks
// `saveAndProceed` and the FIRST save in the loop fails (e.g.
// EACCES, disk full), the loop BREAKS instead of silently
// continuing. The failed target is held back from the delete
// loop so its dirty edits are preserved (not silently lost). The
// caller surfaces the abort via `setError` with a localised
// toast. The result's `failed[]` carries `phase: 'save'` entries
// so the caller can distinguish save failures from delete
// failures.
//
// Pure orchestration hook; no React state of its own beyond a
// memoised `remove` callback.

import { useCallback } from 'react';

import { findEcucModuleByShortName } from '@core/arxml/path.js';
import type { PickedModule } from '@core/arxml/skeleton.js';
import { t } from '@shared/i18n.js';
import type { ProjectDeleteArxmlResult } from '@shared/types.js';

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
      readonly failed: readonly {
        readonly filePath: string;
        readonly moduleShortName: string;
        readonly message: string;
        readonly phase: 'save' | 'delete';
      }[];
    }
  | { readonly kind: 'canceled' }
  | { readonly kind: 'error'; readonly message: string };

export function useRemoveEcucFiles(): {
  readonly remove: (picks: readonly PickedModule[]) => Promise<RemoveEcucResult>;
} {
  const remove = useCallback(async (picks: readonly PickedModule[]): Promise<RemoveEcucResult> => {
    if (picks.length === 0) {
      return { kind: 'ok', removed: [] };
    }
    const state = useArxmlStore.getState();
    const locale = state.locale;

    // -- 1. Resolve each pick to a concrete target file ----------
    //
    // Walk every loaded document; a target is a doc whose
    // `sourceBswmdPath` matches the pick's `bswmdPath` AND whose
    // (possibly nested) ECUC module shortName matches the pick's
    // `moduleShortName`. Skeleton-generated ECUCs are 1-module docs
    // (see buildModule in skeleton.ts), but vendor-prefix source docs
    // can nest the ECUC module under one or more <AR-PACKAGE>
    // wrappers (e.g. `JWQ_CDD_PACK > JWQ_Packet > JWQ3399`); use
    // `findEcucModuleByShortName` so the lookup walks the recursive
    // <AR-PACKAGES> tree instead of only checking
    // `d.packages[0]?.elements[0]`.
    let targets: RemoveEcucTarget[] = [];
    for (const pick of picks) {
      const doc = state.documents.find((d) => {
        if (d.sourceBswmdPath !== pick.bswmdPath) return false;
        const moduleEl = findEcucModuleByShortName(d, pick.moduleShortName);
        return moduleEl !== null;
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
    //
    // `failedAll` aggregates every failure across BOTH phases:
    // `phase: 'save'` from the silent-save-back loop and
    // `phase: 'delete'` from the delete loop. The save phase
    // aborts on the first failure and filters the failed target
    // out of the delete loop.
    type FailedEntry = {
      readonly filePath: string;
      readonly moduleShortName: string;
      readonly message: string;
      readonly phase: 'save' | 'delete';
    };
    const failedAll: FailedEntry[] = [];
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
        //
        // Sprint 16c #3 — race fix: if the FIRST save fails we
        // BREAK the loop instead of silently continuing. The
        // failed target's dirty edits are still in memory; if we
        // proceeded to delete it, those edits would be lost
        // (deleteArxml's `not-found` branch + removeDocument
        // would drop the in-memory copy too). The failed entry
        // is also filtered out of the delete loop below.
        for (const target of dirtyTargets) {
          const doc = state.documents.find((d) => d.path === target.filePath);
          if (doc === undefined) continue;
          const saveResult = await window.autosarApi.saveArxml({
            doc,
            currentPath: target.filePath,
          });
          if (saveResult.ok && !saveResult.value.canceled) {
            useArxmlStore.getState().markSaved(saveResult.value.path ?? target.filePath);
            continue;
          }
          // Failure path — first save that fails aborts the loop.
          const message = saveResult.ok ? 'save canceled by user' : saveResult.error.message;
          failedAll.push({
            filePath: target.filePath,
            moduleShortName: target.moduleShortName,
            message,
            phase: 'save',
          });
          // Surface a localised partial-failure toast. We toast
          // here (before the delete loop) because the abort is
          // the dominant user-facing signal: a save failed and
          // the deletion was skipped for that module.
          useArxmlStore.getState().setError(
            t(locale, 'ecuc.fromBswmd.saveFailedAbort', {
              name: target.moduleShortName,
              message,
            }),
          );
          // Filter the failed target out of the delete loop. Any
          // targets BEFORE this one in the save loop already
          // committed their state and are safe to remove.
          const failedPath = target.filePath;
          targets = targets.filter((t) => t.filePath !== failedPath);
          break;
        }
      }
      // 'discard' falls through: proceed without saving.
    }

    // -- 3. Delete + remove --------------------------------------
    //
    // Each target's on-disk file is deleted via the IPC bridge and
    // the in-memory document is removed from the store. Save-phase
    // failures (above) already filtered out the affected targets;
    // any remaining failure here is a delete-phase failure.
    const removed: string[] = [];
    for (const target of targets) {
      const del: ProjectDeleteArxmlResult = await window.autosarApi.deleteArxml({
        filePath: target.filePath,
      });
      if (del.kind === 'ok' || del.kind === 'not-found') {
        useArxmlStore.getState().removeDocument(target.filePath);
        removed.push(target.filePath);
      } else {
        failedAll.push({
          filePath: target.filePath,
          moduleShortName: target.moduleShortName,
          message: del.message,
          phase: 'delete',
        });
      }
    }
    const failed: readonly FailedEntry[] = failedAll;
    if (failed.length === 0) {
      return { kind: 'ok', removed };
    }
    // Sprint 16c #3 — distinguish save-phase failures from
    // delete-phase failures. An 'error' result is only meaningful
    // when the deletion layer (the user's primary intent —
    // "remove these modules from disk") failed completely with
    // zero removals. Save-phase failures are operational / I/O
    // hiccups surfaced via the abort toast; they pair with an
    // empty `removed` array and should still return 'partial' so
    // the caller can decide whether to surface additional UI.
    const hasDeleteFailure = failed.some((f) => f.phase === 'delete');
    if (removed.length === 0 && hasDeleteFailure) {
      const first = failed.find((f) => f.phase === 'delete');
      return {
        kind: 'error',
        message: first !== undefined ? first.message : 'unknown delete failure',
      };
    }
    return { kind: 'partial', removed, failed };
  }, []);

  return { remove };
}
