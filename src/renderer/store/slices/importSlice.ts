// src/renderer/store/slices/importSlice.ts
// Sprint 14 ECUC ARXML Import — ImportSession slice.
// Extracted from useArxmlStore.ts in PR(5). Pure refactor — bodies
// copied verbatim, only the imports changed.

import type { StateCreator } from 'zustand';

import type { ArxmlDocument, Result } from '@core/arxml/types';
import { applyPatchesToDocument, compileResolutionToPatches } from '@core/import/patch.js';
import type {
  ImportError,
  ImportPatchOp,
  ImportResolution,
  ImportSession,
  ModuleResolution,
  ModuleSelection,
} from '@core/import/types.js';

import { addToDirty, dropFromDirty } from '../helpers/dirty.js';
import {
  collectModules,
  findOwningTargetPath,
  findTargetModuleForShortName,
  opTargetsModule,
} from '../helpers/importHelpers.js';
import { revalidateWithBswmd } from '../helpers/projectSync.js';
import type { ArxmlState } from '../useArxmlStore.js';

export interface ImportSlice {
  // Sprint 14 ECUC ARXML Import — ImportSession slice (Phase 3).
  // viewMode widens to a 3-state machine: 'single' | 'combined' |
  // 'import-merged'. The 'import-merged' state is set by startImport
  // and cleared by cancelImport / commitImport; while active, the
  // Combined View entry is hidden and Save is blocked (the user must
  // commit or cancel before persisting).
  //
  // - importSession: the running session (incoming docs + selections +
  //   resolutions + undo stack). `null` when no import is in progress.
  // - lastCommitSnapshot: Map<filePath, ArxmlDocument> capturing the
  //   pre-commit state of every sourceFilesTouched file, so
  //   undoLastCommit can restore the documents array. Cleared on the
  //   next commit or save.
  // - isDirty() widens to also return true when importSession !== null
  //   so the app-close path treats an in-flight import as unsaved.
  readonly importSession: ImportSession | null;
  readonly lastCommitSnapshot: ReadonlyMap<string, ArxmlDocument> | null;
  startImport: (incomingDocs: readonly ArxmlDocument[], originalPaths: readonly string[]) => void;
  selectModule: (mergedPath: string, selected: boolean) => void;
  resolveModule: (
    mergedPath: string,
    resolution: ImportResolution,
    containerResolutions?: ReadonlyMap<string, ImportResolution>,
  ) => void;
  openDiff: (mergedPath: string) => void;
  closeDiff: () => void;
  undoInternal: () => void;
  commitImport: () => Result<{ readonly sourceFilesTouched: readonly string[] }, ImportError>;
  cancelImport: () => void;
  undoLastCommit: () => void;
}

export const createImportSlice: StateCreator<ArxmlState, [], [], ImportSlice> = (set, get) => ({
  // Sprint 14 — ImportSession slice defaults. No import in flight,
  // no last-commit snapshot.
  importSession: null,
  lastCommitSnapshot: null,

  // -------------------------------------------------------------------
  // Sprint 14 ECUC ARXML Import — actions
  //
  // The import slice sits on top of the existing multi-doc state
  // without mutating `documents` until `commitImport` succeeds.
  // startImport snapshots incoming docs into `importSession`; the
  // subsequent T7/T8/T9 actions (selectModule / resolveModule /
  // commitImport / cancelImport / undoLastCommit) build on top of
  // this state. T6 ships just `startImport` so the foundation
  // (state shape + viewMode 3-state) is in place.
  // -------------------------------------------------------------------

  startImport: (incomingDocs, originalPaths) => {
    // Build a flat list of selections — one row per module across
    // every incoming document. The merged path uses the
    // `[import:N]` segment naming (see core/import/merge.ts).
    const selections: ModuleSelection[] = [];
    for (let docIdx = 0; docIdx < incomingDocs.length; docIdx += 1) {
      const doc = incomingDocs[docIdx]!;
      for (const pkg of doc.packages) {
        for (const el of pkg.elements) {
          collectModules(el, (m) => {
            const mergedPath = `/[import:${docIdx}]${pkg.path}/${m.shortName}`;
            const targetHit = findTargetModuleForShortName(get().documents, m.shortName);
            selections.push({
              mergedModulePath: mergedPath,
              sourceDocIndex: docIdx,
              moduleShortName: m.shortName,
              selected: true,
              collidesWithTarget: targetHit !== null,
              targetModulePath: targetHit,
            });
            return undefined;
          });
        }
      }
    }
    const session: ImportSession = {
      id: `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      incomingDocs,
      originalPaths,
      selections,
      resolutions: [],
      activeModuleForDiff: null,
      createdAt: Date.now(),
      undoStack: [],
    };
    set({
      importSession: session,
      viewMode: 'import-merged',
      // Clear lastCommitSnapshot — a previous commit is no longer
      // "the last commit" once a new session starts.
      lastCommitSnapshot: null,
    });
  },

  // -------------------------------------------------------------------
  // Sprint 14 ECUC ARXML Import — T7 actions.
  //
  // `selectModule` flips the `selected` flag on a single
  // `ModuleSelection` row. `resolveModule` records a per-module
  // decision in the `resolutions` map (overwrites an existing entry
  // for the same merged path so the UI can re-toggle freely).
  // `openDiff` / `closeDiff` toggle `activeModuleForDiff` — the
  // store does NOT compute the diff itself; the DiffTable component
  // reads `activeModuleForDiff` and calls `buildModuleDiff` from
  // core/import/diff.ts directly. `undoInternal` pops the most
  // recent snapshot from `undoStack` (≤20 entries), restoring the
  // previous `resolutions` array. `undoStack` is captured inside
  // `resolveModule` (one snapshot per call) so `undoInternal` can
  // step back one decision at a time.
  // -------------------------------------------------------------------

  selectModule: (mergedPath, selected) => {
    const state = get();
    if (state.importSession === null) return;
    const nextSelections = state.importSession.selections.map((s) =>
      s.mergedModulePath === mergedPath ? { ...s, selected } : s,
    );
    set({
      importSession: { ...state.importSession, selections: nextSelections },
    });
  },

  resolveModule: (mergedPath, resolution, containerResolutions) => {
    const state = get();
    if (state.importSession === null) return;
    // Snapshot the previous resolutions for undoInternal.
    const undoStack = state.importSession.undoStack;
    const nextUndoStack = [...undoStack, state.importSession.resolutions].slice(-20);
    const existingIdx = state.importSession.resolutions.findIndex(
      (r) => r.mergedModulePath === mergedPath,
    );
    const newResolution: ModuleResolution = {
      mergedModulePath: mergedPath,
      resolution,
      ...(containerResolutions !== undefined ? { containerResolutions } : {}),
    };
    const nextResolutions: ModuleResolution[] =
      existingIdx === -1
        ? [...state.importSession.resolutions, newResolution]
        : state.importSession.resolutions.map((r, i) => (i === existingIdx ? newResolution : r));
    set({
      importSession: {
        ...state.importSession,
        resolutions: nextResolutions,
        undoStack: nextUndoStack,
      },
    });
  },

  openDiff: (mergedPath) => {
    const state = get();
    if (state.importSession === null) return;
    set({
      importSession: { ...state.importSession, activeModuleForDiff: mergedPath },
    });
  },

  closeDiff: () => {
    const state = get();
    if (state.importSession === null) return;
    set({
      importSession: { ...state.importSession, activeModuleForDiff: null },
    });
  },

  undoInternal: () => {
    const state = get();
    if (state.importSession === null) return;
    const stack = state.importSession.undoStack;
    if (stack.length === 0) return;
    const last = stack[stack.length - 1]!;
    const nextStack = stack.slice(0, -1);
    set({
      importSession: {
        ...state.importSession,
        resolutions: last,
        undoStack: nextStack,
      },
    });
  },

  // -------------------------------------------------------------------
  // Sprint 14 ECUC ARXML Import — T8 commitImport.
  //
  // All-or-nothing commit (spec §7.3):
  //   1. Compile the session into per-source-file ImportPatch[] via
  //      `compileResolutionToPatches`. Filter out 'skip' /
  //      'keep-existing' resolutions — they produce no ops.
  //   2. Snapshot only the TARGET files that will be modified
  //      (`sourceFilesTouched` is the set of target filePaths, not
  //      incoming paths). The patch compiler keys by incoming
  //      sourceFile, so we re-key per selection here.
  //   3. Apply patches one target file at a time, immutable. If
  //      any `applyPatchesToDocument` throws, return the failure
  //      WITHOUT calling set() — the snapshot is the implicit
  //      rollback (we never wrote it back).
  //   4. After all patches succeed, set() the full update: new
  //      documents, dirtyPaths += sourceFilesTouched, importSession
  //      cleared, viewMode='single', lastCommitSnapshot saved,
  //      revalidation trio (validationErrors + lastValidatedAt).
  // -------------------------------------------------------------------

  commitImport: () => {
    const state = get();
    if (state.importSession === null) {
      return {
        ok: false,
        error: { kind: 'no-modules-selected' },
      } satisfies Result<{ readonly sourceFilesTouched: readonly string[] }, ImportError>;
    }
    const selectedCount = state.importSession.selections.filter((s) => s.selected).length;
    if (selectedCount === 0) {
      return {
        ok: false,
        error: { kind: 'no-modules-selected' },
      } satisfies Result<{ readonly sourceFilesTouched: readonly string[] }, ImportError>;
    }
    const patches = compileResolutionToPatches(state.importSession, state.documents);
    // The compiled patches are keyed by INCOMING sourceFile. Spec
    // §6.1 step 8 groups by TARGET file (the doc being modified), so
    // we re-key here: for every selected row we determine which
    // target document it should land in and filter the patch ops
    // down to those that target the selection's module shortName.
    const activeTargetPath = state.filePath ?? state.documentPaths[0] ?? null;
    const patchesByTarget = new Map<string, ImportPatchOp[]>();
    for (const sel of state.importSession.selections) {
      if (!sel.selected) continue;
      // Default resolution: 'overwrite' for un-opened diffs
      // (spec §6.1 step 7). The patch compiler uses the same
      // default so we mirror it here when computing the per-
      // target patch list.
      const resolution =
        state.importSession.resolutions.find((r) => r.mergedModulePath === sel.mergedModulePath)
          ?.resolution ?? 'overwrite';
      if (resolution === 'keep-existing' || resolution === 'skip') {
        continue;
      }
      const targetPath =
        sel.targetModulePath !== null
          ? (findOwningTargetPath(state.documents, state.documentPaths, sel.targetModulePath) ??
            activeTargetPath)
          : activeTargetPath;
      if (targetPath === null) continue;
      const list = patchesByTarget.get(targetPath) ?? [];
      for (const p of patches) {
        if (p.sourceFile !== state.importSession.originalPaths[sel.sourceDocIndex]) continue;
        for (const op of p.ops) {
          if (opTargetsModule(op, sel.moduleShortName)) {
            list.push(op);
          }
        }
      }
      patchesByTarget.set(targetPath, list);
    }
    const sourceFilesTouched = new Set(patchesByTarget.keys());
    // Step 1: snapshot only the sourceFilesTouched documents.
    const snapshots = new Map<string, ArxmlDocument>();
    for (const filePath of sourceFilesTouched) {
      const idx = state.documentPaths.indexOf(filePath);
      if (idx !== -1) {
        snapshots.set(filePath, state.documents[idx]!);
      }
    }
    // Step 2: apply patches. On any throw → return error WITHOUT
    // mutating state (the snapshot is the implicit rollback —
    // we simply don't set()).
    let nextDocuments: readonly ArxmlDocument[] = state.documents;
    try {
      for (const [filePath, ops] of patchesByTarget) {
        if (ops.length === 0) continue;
        const idx = state.documentPaths.indexOf(filePath);
        if (idx === -1) continue;
        const newDoc = applyPatchesToDocument(state.documents[idx]!, ops);
        nextDocuments = nextDocuments.map((d, i) => (i === idx ? newDoc : d));
      }
    } catch (err) {
      // patch-apply-failed — importSession preserved, documents
      // unchanged. We don't set() so the store remains at its
      // pre-attempt state.
      const message = err instanceof Error ? err.message : String(err);
      const firstSource = [...sourceFilesTouched][0] ?? '';
      return {
        ok: false,
        error: {
          kind: 'patch-apply-failed',
          sourceFile: firstSource,
          moduleShortName: '',
          message,
        },
      };
    }
    // Step 3: commit. documents / dirtyPaths / importSession /
    // viewMode / lastCommitSnapshot / validationErrors /
    // lastValidatedAt all move together.
    let nextDirty = state.dirtyPaths;
    for (const filePath of sourceFilesTouched) {
      nextDirty = addToDirty(nextDirty, filePath);
    }
    const { validationErrors, lastValidatedAt } = revalidateWithBswmd(
      nextDocuments,
      state.bswmdSchemas,
    );
    set({
      documents: nextDocuments,
      dirtyPaths: nextDirty,
      importSession: null,
      viewMode: 'single',
      lastCommitSnapshot: snapshots,
      validationErrors,
      lastValidatedAt,
    });
    return {
      ok: true,
      value: { sourceFilesTouched: [...sourceFilesTouched] },
    };
  },

  // -------------------------------------------------------------------
  // Sprint 14 ECUC ARXML Import — T9 actions.
  //
  // `cancelImport` discards the in-flight session WITHOUT
  // confirmation (spec §6.3: "退出不弹 confirm"). Source
  // documents and dirty paths are untouched. Used by the
  // ModuleSelectionPanel's [Cancel] button and by the AppHeader
  // guard that blocks Save while viewMode === 'import-merged'.
  //
  // `undoLastCommit` reverses the most recent successful commit
  // by restoring the `lastCommitSnapshot` documents and dropping
  // the snapshot entries from `dirtyPaths`. The snapshot is
  // cleared so a second `undoLastCommit` is a no-op (we only
  // support one level of undo per spec §7.4).
  // -------------------------------------------------------------------

  cancelImport: () => {
    const state = get();
    if (state.importSession === null) return;
    set({
      importSession: null,
      viewMode: 'single',
      // activeModuleForDiff is nested inside importSession; once
      // the session is null there is no diff to display. The
      // setter would be a no-op anyway; we just make the intent
      // explicit.
    });
  },

  undoLastCommit: () => {
    const state = get();
    const snapshot = state.lastCommitSnapshot;
    if (snapshot === null) return;
    // Restore the documents for every snapshot entry, leaving
    // all other docs unchanged. Also clear the dirty bit for
    // each restored file (we're undoing the commit that dirtied
    // them).
    const nextDocuments = state.documents.map((d, i) => {
      const filePath = state.documentPaths[i];
      if (filePath === undefined) return d;
      const snap = snapshot.get(filePath);
      return snap ?? d;
    });
    let nextDirty = state.dirtyPaths;
    for (const filePath of snapshot.keys()) {
      nextDirty = dropFromDirty(nextDirty, filePath);
    }
    const { validationErrors, lastValidatedAt } = revalidateWithBswmd(
      nextDocuments,
      state.bswmdSchemas,
    );
    set({
      documents: nextDocuments,
      dirtyPaths: nextDirty,
      lastCommitSnapshot: null,
      validationErrors,
      lastValidatedAt,
    });
  },
});

// Local wrapper removed — addToDirty is imported from helpers/dirty.ts.
