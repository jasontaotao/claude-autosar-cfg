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

import type {
  ScriptKind,
  ScriptRunResult,
  ScriptSummary,
} from '@main/script/types';

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
  }) => Promise<{ readonly ok: true; readonly id: string } | { readonly ok: false; readonly message: string }>;
  deleteScript: (id: string) => Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>;
  runScript: (id: string, timeoutMs?: number) => Promise<ScriptRunResult | null>;

  // -- run output UX ------------------------------------------------------
  /** Append a progress line received from main via SCRIPT_PROGRESS. */
  appendProgress: (e: ScriptRunProgress) => void;
  /** Replace `runResult` with the run's terminal state. */
  setRunResult: (result: ScriptRunResult | null) => void;
  /** Apply the run's mutations to the open project (commits the run). */
  applyMutation: () => void;
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
      set({ scripts: result.scripts, initialized: true });
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

  saveScript: async (input): Promise<
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

  deleteScript: async (id): Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }> => {
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

  // Sprint 14 #1 Phase C — `applyMutation` is a thin pass-through to
  // the existing `useArxmlStore` mutation pipeline. Phase C ships the
  // UI affordance; Phase D wires the actual mutation replay (the
  // existing `core/arxml/mutation.ts` API accepts set-param / add-child
  // / remove-child — same shape as `ScriptMutation`). For now we mark
  // the run result as consumed so the commit/discard buttons disable.
  applyMutation: (): void => {
    const result = get().runResult;
    if (result === null) return;
    set({
      runResult: { ...result, mutations: [] },
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
      return [
        '// report: read-only — emit logs only',
        'ctx.log.info("report started");',
        '',
      ].join('\n');
    case 'free':
      return [
        '// free: do whatever',
        'ctx.log.info("script started");',
        '',
      ].join('\n');
  }
}