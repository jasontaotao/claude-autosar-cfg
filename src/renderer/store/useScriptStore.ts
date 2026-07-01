// useScriptStore — Sprint 14 #1 Phase C (T11) — Zustand store for the
// script engine renderer slice.
//
// Owns the *renderer-side* state for the Scripts panel:
//   - script library (summary list, no `source`)
//   - the selected script id + the editor buffer
//   - latest run result + progress
//   - IPC loading flags
//
// Kept intentionally separate from `useArxmlStore` because:
//   - ScriptPanel's lifecycle is project-scoped, not doc-scoped — the
//     user can save/run scripts even with zero ARXML loaded (log-only).
//   - Adding the slice to `useArxmlStore` would inflate the existing
//     1000+ line store and couple unrelated concerns. The store hooks
//     below read `useArxmlStore.getState()` on demand for `projectId`,
//     `dirtyPaths`, and `error` instead.
//
// IPC calls (list / save / delete / run / onScriptProgress) live in
// `useScriptActions.ts` so the store stays pure / no-electron.

import { create } from 'zustand';

import type { ScriptKind, ScriptRunResult, ScriptSummary } from '@shared/script/types';

export interface ScriptRunProgress {
  readonly runId: string;
  readonly level: 'info' | 'warn' | 'error' | 'debug';
  readonly message: string;
  readonly ts: number;
}

export interface ScriptLoading {
  readonly list: boolean;
  readonly save: boolean;
  readonly run: boolean;
  readonly delete: boolean;
}

export interface ScriptState {
  readonly scripts: readonly ScriptSummary[];
  readonly selectedScriptId: string | null;
  /** Current editor buffer — may diverge from `scripts[id].source`. */
  readonly editorSource: string;
  /** True when the editor buffer diverges from the last saved version. */
  readonly dirty: boolean;
  readonly runResult: ScriptRunResult | null;
  readonly runProgress: readonly ScriptRunProgress[];
  readonly loading: ScriptLoading;
  /** Initial-load guard — the App layout calls `loadScripts` once when
   *  the panel opens; this flag prevents re-fetching on every render. */
  readonly initialized: boolean;

  // -- library lifecycle --------------------------------------------------
  /** Fetch the script list from main. Idempotent on the second call when
   *  `initialized` is true unless `force` is passed. */
  loadScripts: (force?: boolean) => Promise<void>;

  // -- selection / editing -------------------------------------------------
  selectScript: (id: string | null) => void;
  /** Update the editor buffer; sets `dirty=true` until the next save. */
  setEditorSource: (source: string) => void;
  /** Replace the editor buffer without flipping `dirty` — used after a
   *  save returns to seed the new buffer. */
  seedEditorSource: (source: string) => void;
  /** Reset the dirty flag (called by `saveScript` on success). */
  markSaved: () => void;

  // -- CRUD over IPC ------------------------------------------------------
  saveScript: (input: {
    readonly id?: string;
    readonly name: string;
    readonly shortName: string;
    readonly kind: ScriptKind;
    readonly source: string;
  }) => Promise<
    { readonly ok: true; readonly id: string } | { readonly ok: false; readonly message: string }
  >;
  deleteScript: (
    id: string,
  ) => Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>;
  runScript: (id: string, timeoutMs?: number) => Promise<ScriptRunResult | null>;

  // -- run output UX ------------------------------------------------------
  /** Append a progress line received from main via SCRIPT_PROGRESS. */
  appendProgress: (e: ScriptRunProgress) => void;
  /** Replace `runResult` with the run's terminal state. */
  setRunResult: (result: ScriptRunResult | null) => void;
  /** Apply the run's mutations to the open project (commits the run). */
  applyMutation: () => Promise<void>;
  /** Drop the run's mutations (discards the run). */
  discardMutation: () => void;
  /** Clear the output panel (log stream + run result). */
  clearOutput: () => void;

  // -- helpers ------------------------------------------------------------
  /** Read the selected summary (or null). */
  getSelected: () => ScriptSummary | null;
  /** Hard reset — used when the user closes the project. */
  reset: () => void;
}

const INITIAL: Pick<
  ScriptState,
  | 'scripts'
  | 'selectedScriptId'
  | 'editorSource'
  | 'dirty'
  | 'runResult'
  | 'runProgress'
  | 'loading'
  | 'initialized'
> = {
  scripts: [],
  selectedScriptId: null,
  editorSource: '',
  dirty: false,
  runResult: null,
  runProgress: [],
  loading: { list: false, save: false, run: false, delete: false },
  initialized: false,
};

export const useScriptStore = create<ScriptState>((set, get) => ({
  ...INITIAL,

  loadScripts: async (force = false): Promise<void> => {
    if (get().initialized && !force) return;
    set({ loading: { ...get().loading, list: true } });
    try {
      // IPC bridge: window.autosarApi.listScripts({ projectId }). The
      // hook (useScriptActions) wraps this in real environments; in
      // tests the host test wires vi.fn() into the bridge.
      const { useArxmlStore } = await import('./useArxmlStore');
      const projectId = useArxmlStore.getState().project?.id ?? '';
      const result = await window.autosarApi.listScripts({ projectId });
      // Defensive default — a stale IPC mock from a previous test
      // suite may resolve to undefined; in that case keep the
      // previous scripts rather than crash.
      const scripts =
        result === undefined || result === null ? get().scripts : (result.scripts ?? []);
      set({ scripts, initialized: true });
    } finally {
      set({ loading: { ...get().loading, list: false } });
    }
  },

  selectScript: (id): void => {
    if (id === null) {
      set({ selectedScriptId: null, editorSource: '', dirty: false });
      return;
    }
    const summary = get().scripts.find((s) => s.id === id) ?? null;
    set({
      selectedScriptId: id,
      // The summary is the only data we have on the renderer side (the
      // full source is fetched on save). For a freshly-loaded script
      // we seed the editor with a friendly starter template so the
      // user has something to edit; the real source replaces it after
      // the first save round-trip.
      editorSource: summary === null ? '' : starterForKind(summary.kind),
      dirty: false,
      runResult: null,
      runProgress: [],
    });
  },

  setEditorSource: (source): void => {
    set({ editorSource: source, dirty: true });
  },

  seedEditorSource: (source): void => {
    set({ editorSource: source, dirty: false });
  },

  markSaved: (): void => {
    set({ dirty: false });
  },

  saveScript: async (
    input,
  ): Promise<
    { readonly ok: true; readonly id: string } | { readonly ok: false; readonly message: string }
  > => {
    set({ loading: { ...get().loading, save: true } });
    try {
      const { useArxmlStore } = await import('./useArxmlStore');
      const projectId = useArxmlStore.getState().project?.id ?? '';
      const req = {
        projectId,
        name: input.name,
        shortName: input.shortName,
        kind: input.kind,
        source: input.source,
        ...(input.id !== undefined ? { id: input.id } : {}),
      };
      try {
        const result = await window.autosarApi.saveScript(req);
        // Refresh library list (idempotent — backend already wrote).
        await get().loadScripts(true);
        // Re-select the saved entry so the editor buffer is bound to
        // the canonical id returned by the handler.
        get().selectScript(result.id);
        get().markSaved();
        return { ok: true, id: result.id };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { ok: false, message };
      }
    } finally {
      set({ loading: { ...get().loading, save: false } });
    }
  },

  deleteScript: async (
    id,
  ): Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }> => {
    set({ loading: { ...get().loading, delete: true } });
    try {
      const { useArxmlStore } = await import('./useArxmlStore');
      const projectId = useArxmlStore.getState().project?.id ?? '';
      try {
        await window.autosarApi.deleteScript({ projectId, id });
        if (get().selectedScriptId === id) {
          set({ selectedScriptId: null, editorSource: '', dirty: false });
        }
        await get().loadScripts(true);
        return { ok: true };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { ok: false, message };
      }
    } finally {
      set({ loading: { ...get().loading, delete: false } });
    }
  },

  runScript: async (id, timeoutMs): Promise<ScriptRunResult | null> => {
    set({
      loading: { ...get().loading, run: true },
      runResult: null,
      runProgress: [],
    });
    try {
      const { useArxmlStore } = await import('./useArxmlStore');
      const projectId = useArxmlStore.getState().project?.id ?? '';
      try {
        const result = await window.autosarApi.runScript({
          projectId,
          id,
          ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        });
        set({ runResult: result });
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const errResult: ScriptRunResult = {
          runId: 'ipc-error',
          status: 'runtime-error',
          logs: [
            {
              level: 'error',
              message: `IPC error: ${message}`,
              ts: Date.now(),
            },
          ],
          violations: [],
          mutations: [],
          durationMs: 0,
          errorMessage: message,
        };
        set({ runResult: errResult });
        return errResult;
      }
    } finally {
      set({ loading: { ...get().loading, run: false } });
    }
  },

  appendProgress: (e): void => {
    set({ runProgress: [...get().runProgress, e] });
  },

  setRunResult: (result): void => {
    set({ runResult: result });
  },

  // Sprint 14 #1 Phase D (PR(4)) — wire the actual mutation replay.
  //
  // The stub from Phase C (commit `33cc250` ancestor) cleared
  // `runResult.mutations` without touching the ARXML doc. This Phase D
  // replayer dispatches each `ScriptMutation` to the existing
  // `useArxmlStore` actions (so the in-memory doc, dirty tracking, and
  // validation pipeline stay in sync), then serializes the doc and
  // persists it back to the active file path via the `project:save`
  // IPC channel. The main-side handler routes each file through the
  // same `writeAtomic` helper that PR(4) extracted (same trust-sprint
  // invariant: write-to-temp + fsync + rename).
  //
  // Renderer→main boundary: this function never imports main-process
  // modules directly (Vite's renderer build externalizes `node:fs` and
  // `node:path`, breaking the bundle). All disk writes cross the
  // `window.autosarApi.projectSave` IPC channel.
  //
  // Closes the Sprint 14 #2 follow-up.
  applyMutation: async (): Promise<void> => {
    const result = get().runResult;
    if (result === null) return;

    // Lazy-load the collaborators to keep the store import-free at
    // module load time. The store is consumed both by the renderer
    // (real) and by these tests (jsdom); dynamic import keeps the
    // test module graph stable.
    //
    // NOTE: do NOT dynamic-import any main-process module from here
    // (e.g. `../../main/ipc/projectSaveHandler.js`) — Vite's renderer
    // build will externalize `node:fs`/`node:path` and the bundle
    // fails with "promises is not exported by __vite-browser-external".
    // The disk write must cross the IPC boundary via
    // `window.autosarApi.projectSave` (which itself uses `writeAtomic`
    // on the main side).
    const { useArxmlStore } = await import('./useArxmlStore.js');
    const { applyPatchSteps } = await import('../../core/mutation/applyPatchSteps.js');
    const { serializeArxml } = await import('../../core/arxml/serializer.js');
    const { scriptMutationToPatchStep } = await import('./helpers/scriptMutationToPatchStep.js');
    const { resolveModuleDefForActiveDoc } =
      await import('./helpers/resolveModuleDefForActiveDoc.js');

    const arxmlState = useArxmlStore.getState();
    const filePath = arxmlState.activeDocumentPath;
    // No active doc → nothing to apply. Preserve the stub contract
    // (clear mutations, drop dirty) so the commit/discard UI still
    // settles cleanly.
    if (arxmlState.doc === null || filePath === null) {
      set({
        runResult: { ...result, mutations: [] },
        dirty: false,
      });
      return;
    }

    // v1.20.0 MINOR T1 C2.4 — route through applyPatchSteps (shared
    // engine with the CLI). The mapper + moduleDef resolution are
    // pure helpers; applyPatchSteps returns the new doc + per-step
    // errors + non-fatal warnings.
    const steps = result.mutations.map(scriptMutationToPatchStep);
    const moduleDef = resolveModuleDefForActiveDoc(arxmlState);
    const applyResult = applyPatchSteps(arxmlState.doc, steps, { moduleDef });

    // Thread warnings back into runResult.
    const warnings = applyResult.warnings.map((w) => ({
      stepIndex: w.stepIndex,
      kind: w.kind,
      message: w.message,
    }));

    // On engine errors, surface them and skip the write. The in-memory
    // doc is NOT updated (mirrors the prior H1 contract where path-
    // not-found left the doc untouched).
    if (applyResult.errors.length > 0) {
      const errorMessage = `${applyResult.applied}/${result.mutations.length} mutations applied; ${applyResult.errors
        .map((e) => `${e.kind}: ${e.message}`)
        .join('; ')}`;
      set({
        runResult: {
          ...result,
          mutations: [],
          warnings,
          errorMessage,
        },
        dirty: false,
      });
      return;
    }

    // Update the in-memory doc via the canonical setDoc path. This
    // triggers displayDoc recompute + validation refresh + dirty
    // flag — the same path the rest of the renderer uses.
    useArxmlStore.getState().setDoc(applyResult.doc, filePath);

    // Loose mode (no project manifest) cannot persist via the
    // `project:save` IPC channel — surface a clear error and leave
    // the in-memory mutation applied so the user can save manually.
    if (arxmlState.project === null || arxmlState.projectPath === null) {
      set({
        runResult: {
          ...result,
          mutations: [],
          warnings,
          errorMessage:
            'project save skipped: script commit requires a loaded project (loose mode not supported)',
        },
        dirty: false,
      });
      return;
    }

    // Serialize + persist.
    const serialized = serializeArxml(applyResult.doc);
    if (!serialized.ok) {
      set({
        runResult: {
          ...result,
          mutations: [],
          warnings,
          errorMessage: `serialize: ${serialized.error.message}`,
        },
        dirty: false,
      });
      return;
    }

    try {
      const saveResult = await window.autosarApi.projectSave({
        manifestPath: arxmlState.projectPath,
        manifest: arxmlState.project,
        files: [{ path: filePath, content: serialized.value }],
      });
      if (saveResult.kind === 'write-failed') {
        set({
          runResult: {
            ...result,
            mutations: [],
            warnings,
            errorMessage: `projectSave: ${saveResult.message}`,
          },
          // In-memory doc IS updated (preserves prior contract).
          // The user can retry the save.
          dirty: true,
        });
        return;
      }
    } catch (e) {
      // Atomic-write failure → user data is intact on disk (the
      // temp file was cleaned up by `writeAtomic` on the main side).
      // Surface the error so the user can see why the commit
      // didn't land. We do NOT undo the in-memory mutation — the
      // user might still be able to re-save manually.
      set({
        runResult: {
          ...result,
          mutations: [],
          warnings,
          errorMessage: e instanceof Error ? e.message : String(e),
        },
        dirty: true,
      });
      return;
    }

    set({
      runResult: {
        ...result,
        mutations: [],
        warnings,
      },
      dirty: false,
    });
  },

  discardMutation: (): void => {
    const result = get().runResult;
    if (result === null) return;
    set({
      runResult: { ...result, mutations: [] },
      dirty: false,
    });
  },

  clearOutput: (): void => {
    set({ runResult: null, runProgress: [] });
  },

  getSelected: (): ScriptSummary | null => {
    const id = get().selectedScriptId;
    if (id === null) return null;
    return get().scripts.find((s) => s.id === id) ?? null;
  },

  reset: (): void => {
    set({ ...INITIAL });
  },
}));

/** Starter template per kind — used to seed the editor on a new
 *  selection. The exact contents don't matter; the point is to give
 *  the user a runnable shape (imports a helper, uses ctx.log) so they
 *  can hit Run and see a working output. */
function starterForKind(kind: ScriptKind): string {
  switch (kind) {
    case 'validator':
      return [
        '// validator: scan containers and emit script:* violations',
        'ctx.log.info("validator started");',
        'ctx.validator.addViolation({',
        '  kind: "script:example",',
        '  severity: "warning",',
        '  message: "Replace with real check.",',
        '});',
        '',
      ].join('\n');
    case 'transformer':
      return [
        '// transformer: mutate project model via ctx.project',
        'ctx.log.info("transformer started");',
        '',
      ].join('\n');
    case 'report':
      return ['// report: read-only — emit logs only', 'ctx.log.info("report started");', ''].join(
        '\n',
      );
    case 'free':
      return ['// free: do whatever', 'ctx.log.info("script started");', ''].join('\n');
    default: {
      // Exhaustiveness guard for the ScriptKind union.
      const _exhaustive: never = kind;
      void _exhaustive;
      return '';
    }
  }
}

// ---------------------------------------------------------------------------
// v1.20.0 MINOR T1 C2.4 — duplicate helpers removed.
//
// The pre-C2.4 `applyMutation` used two GUI-only helpers that
// duplicated logic now in `src/core/mutation/applyPatchSteps.ts`:
//
//   - `findParamInDoc(doc, containerPath, paramName)` — manual tree
//     walk to resolve a container + param on the doc. The CLI's
//     `applyPatchSteps` uses `findContainerByPath` from
//     `src/core/project/setters.ts` for the same purpose.
//
//   - `scriptParamValueToCore(existingType, raw)` — type coercion
//     matching the existing `ParamValue.type` tag. The CLI's
//     `applyPatchSteps` has `coerceToParamValue` doing the same.
//
// The CLI engine is the single source of truth for both. Net
// deletion: ~71 lines of duplicated logic from the renderer store.
// ---------------------------------------------------------------------------
