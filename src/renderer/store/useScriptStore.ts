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

import type { ScriptKind, ScriptRunResult, ScriptSummary } from '@main/script/types';

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ParamValue,
} from '../../core/arxml/types.js';

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
    const { serializeArxml } = await import('../../core/arxml/serializer.js');

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

    const writeErrors: string[] = [];
    let applied = 0;
    for (const m of result.mutations) {
      const before = useArxmlStore.getState();
      if (before.doc === null) continue;
      // Snapshot the diagnostics the store uses to surface action
      // failures. Comparing before/after lets us detect when an
      // action took the failure branch (e.g. BSWMD missing,
      // references exist for cascade-delete) without conflating
      // pre-existing state. The diff is cleared in the catch
      // block below so the next mutation starts clean.
      const errBefore = before.error;
      const pendingDeleteBefore = before.pendingDelete;
      switch (m.kind) {
        case 'set-param': {
          // Map the script ParamValue to a typed core ParamValue.
          // The store's `updateParam` reads the existing param's type
          // tag, so we just have to forward the raw value + a fresh
          // type tag mirroring whatever the user wrote.
          const existing = findParamInDoc(before.doc, m.containerPath, m.paramName);
          if (existing === null) {
            // Path not found — record it as a mutation error so the
            // user sees the failure instead of a silent no-op
            // (code-review H1).
            writeErrors.push(`set-param: path not found ${m.containerPath}/${m.paramName}`);
            continue;
          }
          const newValue = scriptParamValueToCore(existing.type, m.newValue);
          before.updateParam(m.containerPath, m.paramName, newValue);
          break;
        }
        case 'add-child': {
          // `addContainer` requires a BSWMD-derived `childDef`; the
          // script engine does not have one. The action writes a
          // localized error to `useArxmlStore.error` on failure —
          // we diff that and forward into `writeErrors` so the
          // script run reports a real status (code-review H1).
          before.addContainer(m.containerPath, m.newShortName);
          break;
        }
        case 'remove-child': {
          // `deleteContainer` opens the cascade dialog (sets
          // `pendingDelete`) when references point at the target —
          // the doc is NOT mutated in that branch. We detect the
          // cascade short-circuit and surface a clear error so
          // the script run does not silently claim success
          // (code-review H2).
          before.deleteContainer(m.containerPath);
          break;
        }
      }
      // Capture any new arxmlStore-level error / pending-delete
      // surfaced by the action, then clear it so the next iteration
      // starts from a clean slate. The user's view of the action
      // failure lives in `runResult.errorMessage` (script run), not
      // in the unrelated `useArxmlStore.error` toast.
      const after = useArxmlStore.getState();
      if (after.error !== null && after.error !== errBefore) {
        writeErrors.push(`${m.kind} ${m.containerPath}: ${after.error}`);
        useArxmlStore.setState({ error: null });
      }
      if (after.pendingDelete !== null && after.pendingDelete !== pendingDeleteBefore) {
        // Cascade dialog would normally pop up here; for a script
        // commit we abort the dialog and surface the reason.
        writeErrors.push(
          `remove-child ${m.containerPath}: cascade confirmation needed (${after.pendingDelete.references.length} inbound reference(s)) — script commits cannot present the dialog; rerun via the UI or pre-resolve the references`,
        );
        useArxmlStore.setState({ pendingDelete: null });
      }
      // Only count a mutation as applied when the doc reference
      // actually changed (the store's no-op contract returns the same
      // `ArxmlDocument` reference when a path can't be resolved).
      if (after.doc !== before.doc) {
        applied += 1;
      }
    }

    // Atomic-write the serialized doc to the active file path. We
    // always serialize — even when `applied === 0` — because a future
    // set-param on a stale doc may still have flipped the dirty bit.
    // Skipping the write when no mutation landed is fine too: we just
    // persist the in-memory doc as-is.
    //
    // We deliberately do NOT pass `sourceArxml` to the serializer here
    // — the in-memory doc IS the new source of truth, and rewriting
    // it in source order would silently re-introduce the very changes
    // the script just applied. The PR(2) preserveSourceOrder pass is
    // reserved for hand-edit round-trips (the user loads, edits, saves
    // without applying any script), where the order is meaningful.
    try {
      const latest = useArxmlStore.getState();
      // Loose mode (no project manifest) cannot persist via the
      // `project:save` IPC channel — surface a clear error and leave
      // the in-memory mutation applied so the user can save manually.
      // Scripts are usually run inside a project; this is a
      // defensive branch.
      if (latest.project === null || latest.projectPath === null) {
        writeErrors.push(
          'project save skipped: script commit requires a loaded project (loose mode not supported)',
        );
      } else if (latest.doc !== null) {
        const result2 = serializeArxml(latest.doc);
        if (result2.ok) {
          // Cross the IPC boundary to the main process. The main-side
          // `project:save` handler routes each file through the same
          // `writeAtomic` helper that PR(4) extracted (same trust-
          // sprint invariant: write-to-temp + fsync + rename).
          const saveResult = await window.autosarApi.projectSave({
            manifestPath: latest.projectPath,
            manifest: latest.project,
            files: [{ path: filePath, content: result2.value }],
          });
          if (saveResult.kind === 'write-failed') {
            writeErrors.push(`projectSave: ${saveResult.message}`);
          }
        } else {
          writeErrors.push(`serialize: ${result2.error.message}`);
        }
      }
    } catch (e) {
      // Atomic-write failure → user data is intact on disk (the
      // temp file was cleaned up by `writeAtomic` on the main side).
      // Surface the error in the run log so the user can see why
      // the commit didn't land. We do NOT undo the in-memory
      // mutation — the user might still be able to re-save manually.
      writeErrors.push(e instanceof Error ? e.message : String(e));
    }

    // Surface write errors via the script error channel (the
    // renderer's MutationPanel reads `runResult.errorMessage` to
    // decide whether to keep the dirty flag).
    const errorMessage =
      writeErrors.length > 0
        ? `${applied}/${result.mutations.length} mutations applied; write failed: ${writeErrors.join('; ')}`
        : undefined;
    set({
      runResult: {
        ...result,
        mutations: [],
        ...(errorMessage !== undefined ? { errorMessage } : {}),
      },
      // The store is dirty whenever the in-memory doc diverges from
      // disk. The script engine doesn't track its own dirty flag —
      // the user-facing "save again?" hint comes from
      // `useArxmlStore.dirtyPaths`. We mirror the contract here:
      // dirty when a write failed (so the UI prompts for retry) OR
      // when the user has since re-edited (we don't know; default
      // to false on a clean write).
      dirty: writeErrors.length > 0,
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
// applyMutation helpers
// ---------------------------------------------------------------------------

/**
 * Locate a parameter on the doc tree at `containerPath`. Returns the
 * existing `ParamValue` so the caller can reuse its `type` tag (the
 * store's `updateParam` keys off the type to keep the typed value
 * representation stable). Returns `null` when the path does not
 * resolve OR the leaf is not a module / container (reference /
 * unknown have no params).
 */
function findParamInDoc(
  doc: ArxmlDocument,
  containerPath: string,
  paramName: string,
): ParamValue | null {
  const segments = containerPath.split('/').filter((s) => s.length > 0);
  if (segments.length < 1) return null;
  // Walk into `doc.packages` first, then into the module / container
  // children. Reference and unknown leaves are skipped — they have
  // no `params` to query.
  const pkgName = segments[0];
  if (pkgName === undefined) return null;
  const rootPkg = doc.packages.find((p) => p.shortName === pkgName);
  if (rootPkg === undefined) return null;
  let cursor: ArxmlElement | null = null;
  for (const el of rootPkg.elements) {
    if (el.kind === 'reference' || el.kind === 'unknown') continue;
    if (el.shortName === segments[1]) {
      cursor = el;
      break;
    }
  }
  if (cursor === null) return null;
  for (let i = 2; i < segments.length; i += 1) {
    const seg = segments[i];
    if (seg === undefined || cursor === null) return null;
    if (cursor.kind !== 'module' && cursor.kind !== 'container') return null;
    const cursorNode: ArxmlModule | ArxmlContainer = cursor;
    const child: ArxmlElement | undefined = cursorNode.children.find(
      (c) => c.kind !== 'reference' && c.kind !== 'unknown' && c.shortName === seg,
    );
    if (child === undefined) return null;
    cursor = child;
  }
  if (cursor === null) return null;
  if (cursor.kind !== 'module' && cursor.kind !== 'container') return null;
  return cursor.params[paramName] ?? null;
}

/**
 * Convert the script engine's `ParamValue` (loose union — see
 * `ScriptMutation['newValue']` in `main/script/types.ts`) to a typed
 * `core/arxml/types.ts` `ParamValue`. We preserve the existing
 * param's `type` tag so a `set-param` cannot accidentally widen a
 * string into a number — the script engine's loose union is a UX
 * nicety for user scripts, but on the way in we keep the type stable.
 */
function scriptParamValueToCore(
  existingType: ParamValue['type'],
  raw: number | string | boolean | { readonly value: string; readonly dest?: string },
): ParamValue {
  // Reference params: the script's `{ value, dest? }` shape is the
  // canonical reference value. Forward dest when present, otherwise
  // drop it (the existing tag is `reference` so the dest is optional
  // — see `ArxmlReference`).
  if (existingType === 'reference' && typeof raw === 'object' && raw !== null && 'value' in raw) {
    const refValue = raw as { readonly value: string; readonly dest?: string };
    return refValue.dest !== undefined
      ? { type: 'reference', value: refValue.value, dest: refValue.dest }
      : { type: 'reference', value: refValue.value };
  }
  // Primitive passthrough: number / string / boolean are valid for
  // the matching ParamValue kinds. We coerce to the existing type's
  // expectations — for 'integer' / 'float' the value MUST be a
  // number; for 'boolean' a boolean; for 'string' / 'enum' a string.
  // The store's `updateParam` re-validates on assignment so a bad
  // script value surfaces as a localized error rather than a silent
  // type-coerce.
  if (existingType === 'integer' || existingType === 'float') {
    return { type: existingType, value: typeof raw === 'number' ? raw : Number(raw) };
  }
  if (existingType === 'boolean') {
    return { type: 'boolean', value: Boolean(raw) };
  }
  if (existingType === 'string' || existingType === 'enum') {
    return { type: existingType, value: String(raw) };
  }
  // Fallback: keep the existing type and stringify the value.
  return { type: existingType, value: String(raw) };
}
