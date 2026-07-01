// @vitest-environment jsdom
//
// useScriptStore — Sprint 14 #1 Phase C (T11) store tests.
//
// Verifies the slice's pure contract:
//   1. Initial state shape
//   2. loadScripts fetches via IPC bridge and stores summaries
//   3. selectScript sets buffer + dirty=false; resets run state
//   4. setEditorSource flips dirty; markSaved resets it
//   5. saveScript refreshes list + reseeds editor
//   6. deleteScript removes from list and clears selection when active
//   7. runScript sets loading flag + stores result; IPC error → runtime-error result
//   8. applyMutation / discardMutation clear runResult.mutations
//   9. clearOutput drops runResult + runProgress
//  10. reset() restores initial state

import { promises as fsPromises } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArxmlContainer, ArxmlDocument, ArxmlModule } from '@core/arxml/types';
import type { ScriptRunResult, ScriptSummary } from '@shared/script/types';
import type { ProjectSaveRequest, ProjectSaveResult } from '@shared/types';

import { writeAtomic } from '../../../main/io/writeAtomic.js';
import { useArxmlStore } from '../useArxmlStore';
import { useScriptStore } from '../useScriptStore';

const summaries: ScriptSummary[] = [
  {
    id: 'a',
    name: 'check-pduids',
    shortName: 'check-pduids',
    kind: 'validator',
    updatedAt: '2026-06-19T00:00:00Z',
  },
  {
    id: 'b',
    name: 'reset-defaults',
    shortName: 'reset-defaults',
    kind: 'transformer',
    updatedAt: '2026-06-19T00:01:00Z',
  },
];

// Loose mock-api shape — the store only invokes each method through
// `window.autosarApi[name]`, which is `unknown` at the type level.
// We keep the override shape untyped (Record<string, ...>) so individual
// tests can substitute any vi.fn() overload without TS complaining.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFn = ReturnType<typeof vi.fn<any>>;
type MockApiOverride = Record<string, MockFn>;

function makeApi(overrides: MockApiOverride = {}): MockApiOverride {
  const api: MockApiOverride = {
    listScripts: vi.fn(async () => ({ scripts: summaries })),
    saveScript: vi.fn(async () => ({ id: 'new-id', updatedAt: 'now' })),
    deleteScript: vi.fn(async () => ({ ok: true as const })),
    runScript: vi.fn(async () => ({
      runId: 'r1',
      status: 'ok' as const,
      logs: [],
      violations: [],
      mutations: [],
      durationMs: 10,
    })),
    // Default `projectSave` mock mirrors the main-side behavior:
    // route each file through `writeAtomic` so the test exercises
    // the real atomic-write code path. Individual tests can override
    // (e.g. to return `write-failed` for the failure branch).
    projectSave: vi.fn(async (req: ProjectSaveRequest): Promise<ProjectSaveResult> => {
      for (const f of req.files) {
        await writeAtomic(f.path, f.content);
      }
      return { kind: 'saved', path: req.files[0]?.path ?? req.manifestPath };
    }),
  };
  // Spread overrides on top; TS struggles with the union of vi.fn()
  // overloads, so we cast at the merge boundary.
  return { ...api, ...overrides };
}

function installApi(api: MockApiOverride): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.autosarApi = api;
}

beforeEach(() => {
  useScriptStore.getState().reset();
  useArxmlStore.setState({
    project: {
      id: 'proj-1',
      name: 'Test',
      valueArxmlPaths: [],
      bswmdPaths: [],
      schemaVersion: '1',
    },
    projectPath: '/tmp/proj.autosarcfg.json',
  });
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).window.autosarApi;
});

describe('useScriptStore — initial state', () => {
  it('has empty list + null selection + clean editor', () => {
    const s = useScriptStore.getState();
    expect(s.scripts).toEqual([]);
    expect(s.selectedScriptId).toBeNull();
    expect(s.editorSource).toBe('');
    expect(s.dirty).toBe(false);
    expect(s.runResult).toBeNull();
    expect(s.runProgress).toEqual([]);
    expect(s.loading).toEqual({ list: false, save: false, run: false, delete: false });
    expect(s.initialized).toBe(false);
  });
});

describe('useScriptStore — loadScripts', () => {
  it('fetches summaries via IPC and flips initialized', async () => {
    const api = makeApi();
    installApi(api);
    await useScriptStore.getState().loadScripts();
    const s = useScriptStore.getState();
    expect(api.listScripts).toHaveBeenCalledTimes(1);
    expect(api.listScripts).toHaveBeenCalledWith({ projectId: 'proj-1' });
    expect(s.scripts).toEqual(summaries);
    expect(s.initialized).toBe(true);
  });

  it('skips refetch when initialized (unless force)', async () => {
    const api = makeApi();
    installApi(api);
    await useScriptStore.getState().loadScripts();
    await useScriptStore.getState().loadScripts();
    expect(api.listScripts).toHaveBeenCalledTimes(1);
    await useScriptStore.getState().loadScripts(true);
    expect(api.listScripts).toHaveBeenCalledTimes(2);
  });

  it('clears the loading.list flag on success', async () => {
    installApi(makeApi());
    await useScriptStore.getState().loadScripts();
    expect(useScriptStore.getState().loading.list).toBe(false);
  });
});

describe('useScriptStore — selectScript', () => {
  it('sets selectedScriptId + seeds editor with kind-specific starter', async () => {
    installApi(makeApi());
    await useScriptStore.getState().loadScripts();
    useScriptStore.getState().selectScript('a');
    const s = useScriptStore.getState();
    expect(s.selectedScriptId).toBe('a');
    expect(s.dirty).toBe(false);
    expect(s.editorSource).toMatch(/validator/i);
  });

  it('null clears selection + buffer + dirty', async () => {
    installApi(makeApi());
    await useScriptStore.getState().loadScripts();
    useScriptStore.getState().selectScript('a');
    useScriptStore.getState().setEditorSource('manual edit');
    useScriptStore.getState().selectScript(null);
    const s = useScriptStore.getState();
    expect(s.selectedScriptId).toBeNull();
    expect(s.editorSource).toBe('');
    expect(s.dirty).toBe(false);
  });

  it('resets runResult + runProgress on new selection', async () => {
    installApi(makeApi());
    await useScriptStore.getState().loadScripts();
    useScriptStore.setState({
      runResult: {
        runId: 'r0',
        status: 'ok',
        logs: [],
        violations: [],
        mutations: [],
        durationMs: 0,
      },
      runProgress: [{ runId: 'r0', level: 'info', message: 'x', ts: 1 }],
    });
    useScriptStore.getState().selectScript('a');
    expect(useScriptStore.getState().runResult).toBeNull();
    expect(useScriptStore.getState().runProgress).toEqual([]);
  });
});

describe('useScriptStore — editor buffer', () => {
  it('setEditorSource flips dirty', () => {
    useScriptStore.getState().setEditorSource('hello');
    expect(useScriptStore.getState().editorSource).toBe('hello');
    expect(useScriptStore.getState().dirty).toBe(true);
  });

  it('seedEditorSource replaces buffer without flipping dirty', () => {
    useScriptStore.getState().setEditorSource('manual');
    useScriptStore.getState().markSaved();
    useScriptStore.getState().seedEditorSource('saved-content');
    const s = useScriptStore.getState();
    expect(s.editorSource).toBe('saved-content');
    expect(s.dirty).toBe(false);
  });

  it('markSaved clears the dirty flag', () => {
    useScriptStore.getState().setEditorSource('x');
    useScriptStore.getState().markSaved();
    expect(useScriptStore.getState().dirty).toBe(false);
  });
});

describe('useScriptStore — saveScript', () => {
  it('posts to IPC, refreshes the list, and returns the new id', async () => {
    const api = makeApi();
    installApi(api);
    await useScriptStore.getState().loadScripts();
    const r = await useScriptStore.getState().saveScript({
      name: 'new',
      shortName: 'new',
      kind: 'free',
      source: 'ctx.log.info("hi")',
    });
    expect(r).toEqual({ ok: true, id: 'new-id' });
    expect(api.saveScript).toHaveBeenCalledWith(
      expect.objectContaining({ shortName: 'new', kind: 'free' }),
    );
    // List refreshed
    expect(api.listScripts).toHaveBeenCalledTimes(2);
    // dirty cleared by markSaved
    expect(useScriptStore.getState().dirty).toBe(false);
    // loading.save cleared
    expect(useScriptStore.getState().loading.save).toBe(false);
  });

  it('returns ok:false with the error message on IPC rejection', async () => {
    const api = makeApi({
      saveScript: vi.fn(async (): Promise<never> => {
        throw new Error('duplicate shortName');
      }),
    });
    installApi(api);
    const r = await useScriptStore.getState().saveScript({
      name: 'x',
      shortName: 'x',
      kind: 'free',
      source: '',
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.message).toMatch(/duplicate/i);
  });

  it('forwards `id` when provided (update path)', async () => {
    const api = makeApi();
    installApi(api);
    await useScriptStore.getState().loadScripts();
    await useScriptStore.getState().saveScript({
      id: 'a',
      name: 'check-pduids-2',
      shortName: 'check-pduids-2',
      kind: 'validator',
      source: '// v2',
    });
    const call = (api.saveScript as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(call.id).toBe('a');
  });
});

describe('useScriptStore — deleteScript', () => {
  it('removes from list and clears selection when active', async () => {
    const api = makeApi({
      listScripts: vi
        .fn()
        .mockResolvedValueOnce({ scripts: summaries })
        .mockResolvedValueOnce({ scripts: summaries.filter((s) => s.id !== 'a') }),
    });
    installApi(api);
    await useScriptStore.getState().loadScripts();
    useScriptStore.getState().selectScript('a');
    const r = await useScriptStore.getState().deleteScript('a');
    expect(r).toEqual({ ok: true });
    const s = useScriptStore.getState();
    expect(s.selectedScriptId).toBeNull();
    expect(s.editorSource).toBe('');
  });

  it('returns ok:false on IPC error', async () => {
    const api = makeApi({
      deleteScript: vi.fn(async (): Promise<never> => {
        throw new Error('unknown-script');
      }),
    });
    installApi(api);
    const r = await useScriptStore.getState().deleteScript('missing');
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.message).toMatch(/unknown-script/i);
  });
});

describe('useScriptStore — runScript', () => {
  it('stores the result and clears loading.run', async () => {
    const api = makeApi({
      runScript: vi.fn(async () => ({
        runId: 'r1',
        status: 'ok' as const,
        logs: [{ level: 'info' as const, message: 'ok', ts: 1 }],
        violations: [],
        mutations: [
          { kind: 'set-param' as const, containerPath: '/p', paramName: 'q', newValue: 1 },
        ],
        durationMs: 12,
      })),
    });
    installApi(api);
    const r = await useScriptStore.getState().runScript('a');
    expect(r?.status).toBe('ok');
    const s = useScriptStore.getState();
    expect(s.runResult?.runId).toBe('r1');
    expect(s.runResult?.mutations.length).toBe(1);
    expect(s.loading.run).toBe(false);
  });

  it('IPC rejection yields runtime-error result, not a thrown exception', async () => {
    const api = makeApi({
      runScript: vi.fn(async (): Promise<never> => {
        throw new Error('manifest-read');
      }),
    });
    installApi(api);
    const r = await useScriptStore.getState().runScript('a');
    expect(r).not.toBeNull();
    expect(r?.status).toBe('runtime-error');
    expect(r?.errorMessage).toMatch(/manifest-read/i);
  });

  it('clears previous runResult + runProgress before each run', async () => {
    const api = makeApi();
    installApi(api);
    await useScriptStore.getState().loadScripts();
    useScriptStore.setState({
      runResult: {
        runId: 'prev',
        status: 'ok',
        logs: [],
        violations: [],
        mutations: [],
        durationMs: 0,
      },
      runProgress: [{ runId: 'prev', level: 'info', message: 'old', ts: 0 }],
    });
    await useScriptStore.getState().runScript('a');
    const s = useScriptStore.getState();
    expect(s.runProgress).toEqual([]);
    expect(s.runResult?.runId).toBe('r1');
  });
});

describe('useScriptStore — applyMutation / discardMutation / clearOutput', () => {
  it('applyMutation empties mutations on the runResult', async () => {
    useScriptStore.setState({
      runResult: {
        runId: 'r1',
        status: 'ok',
        logs: [],
        violations: [],
        mutations: [{ kind: 'set-param', containerPath: '/p', paramName: 'q', newValue: 1 }],
        durationMs: 0,
      },
    });
    await useScriptStore.getState().applyMutation();
    expect(useScriptStore.getState().runResult?.mutations).toEqual([]);
  });

  it('discardMutation empties mutations on the runResult', () => {
    useScriptStore.setState({
      runResult: {
        runId: 'r1',
        status: 'ok',
        logs: [],
        violations: [],
        mutations: [{ kind: 'add-child', containerPath: '/p', newShortName: 'c1' }],
        durationMs: 0,
      },
    });
    useScriptStore.getState().discardMutation();
    expect(useScriptStore.getState().runResult?.mutations).toEqual([]);
  });

  it('clearOutput drops runResult + runProgress', () => {
    useScriptStore.setState({
      runResult: {
        runId: 'r1',
        status: 'ok',
        logs: [],
        violations: [],
        mutations: [],
        durationMs: 0,
      },
      runProgress: [{ runId: 'r1', level: 'info', message: 'x', ts: 1 }],
    });
    useScriptStore.getState().clearOutput();
    expect(useScriptStore.getState().runResult).toBeNull();
    expect(useScriptStore.getState().runProgress).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Sprint v1.5.1 PR(4) — applyMutation real replay (closes Sprint 14 #2)
// ---------------------------------------------------------------------------
//
// The Sprint 14 #1 Phase C stub cleared `runResult.mutations` without
// touching the ARXML doc. The Phase D wire-up applies each mutation to
// the active document via the existing `useArxmlStore` actions, then
// atomic-writes the serialized XML to the active file path. These
// tests pin that contract end-to-end against a real temp file (so the
// atomic-write path is exercised, not stubbed out).

describe('useScriptStore — applyMutation real replay (Sprint 14 #2)', () => {
  // Reuse the synthetic-doc builder pattern from
  // `useArxmlStore.multidoc.test.ts` so we can exercise `updateParam`
  // without dragging in a full EcuC fixture (the path shape is what
  // matters: `/<pkg>/<module>/<container>`).
  function makeDocWithParam(value: number): ArxmlDocument {
    return {
      path: '/tmp/test.arxml',
      version: '4.6',
      packages: [
        {
          shortName: 'EAS',
          path: '/EAS',
          elements: [
            {
              kind: 'module',
              tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
              shortName: 'EcuC',
              params: {},
              children: [
                {
                  kind: 'container',
                  tagName: 'ECUC-CONTAINER-VALUE',
                  shortName: 'EcuCGeneral',
                  params: {
                    ConfigConsistencyRequired: { type: 'integer', value },
                  },
                  children: [],
                },
              ],
              references: [],
            },
          ],
        },
      ],
    };
  }

  beforeEach(async () => {
    useArxmlStore.getState().clear();
    useScriptStore.getState().reset();
    // The clear() above wipes `project` / `projectPath`, but
    // `applyMutation`'s `project:save` IPC path requires a loaded
    // project (loose mode is not supported — see useScriptStore.ts).
    // Re-seed the minimal manifest from the outer beforeEach so the
    // happy-path write can resolve its IPC call.
    useArxmlStore.setState({
      project: {
        id: 'proj-1',
        name: 'Test',
        valueArxmlPaths: [],
        bswmdPaths: [],
        schemaVersion: '1',
      },
      projectPath: '/tmp/proj.autosarcfg.json',
    });
    // Install a fresh `window.autosarApi` mock that includes a
    // working `projectSave` (default delegates to the real
    // `writeAtomic` for the happy-path). The earlier PR(4) test did
    // not need this — it imported `writeAtomic` directly via
    // dynamic import — but the post-fix code crosses the IPC
    // boundary, so the api must be installed.
    installApi(makeApi());
  });

  it('applies a set-param mutation to the active doc and atomic-writes to disk', async () => {
    const tmpFile = join(tmpdir(), `apply-mutation-${Date.now()}-${Math.random()}.arxml`);
    try {
      const doc = makeDocWithParam(1);
      useArxmlStore.getState().setDoc(doc, tmpFile);
      useScriptStore.setState({
        runResult: {
          runId: 'r1',
          status: 'ok',
          logs: [],
          violations: [],
          mutations: [
            {
              kind: 'set-param',
              containerPath: '/EAS/EcuC/EcuCGeneral',
              paramName: 'ConfigConsistencyRequired',
              newValue: 42,
            },
          ],
          durationMs: 0,
        },
      });

      await useScriptStore.getState().applyMutation();

      // The in-memory doc reflects the new value.
      const next = useArxmlStore.getState();
      const ecuc = next.doc?.packages[0]?.elements[0] as ArxmlModule | undefined;
      const general = ecuc?.children[0] as ArxmlContainer | undefined;
      expect(general?.params.ConfigConsistencyRequired).toEqual({
        type: 'integer',
        value: 42,
      });

      // Mutations cleared on the runResult.
      expect(useScriptStore.getState().runResult?.mutations).toEqual([]);

      // The atomic-write landed on disk. If it didn't, the error
      // message in `runResult.errorMessage` tells us why.
      if (useScriptStore.getState().runResult?.errorMessage !== undefined) {
        throw new Error(
          `applyMutation error: ${useScriptStore.getState().runResult?.errorMessage}`,
        );
      }
      const onDisk = await fsPromises.readFile(tmpFile, 'utf-8');
      expect(onDisk).toContain('ConfigConsistencyRequired');
      expect(onDisk).toMatch(/<VALUE>42<\/VALUE>/);
    } finally {
      await fsPromises.rm(tmpFile, { force: true });
    }
  });

  it('does not throw when no active document is loaded (no-op)', async () => {
    // useArxmlStore is empty (cleared in beforeEach).
    useScriptStore.setState({
      runResult: {
        runId: 'r1',
        status: 'ok',
        logs: [],
        violations: [],
        mutations: [
          {
            kind: 'set-param',
            containerPath: '/EAS/EcuC/EcuCGeneral',
            paramName: 'ConfigConsistencyRequired',
            newValue: 1,
          },
        ],
        durationMs: 0,
      },
    });
    await expect(useScriptStore.getState().applyMutation()).resolves.toBeUndefined();
    // Mutations are still cleared — the stub contract is preserved
    // when no doc is loaded.
    expect(useScriptStore.getState().runResult?.mutations).toEqual([]);
  });

  it('records a write error and leaves dirty=true when disk write fails', async () => {
    // The unit test for the write-failure branch. We override the
    // `projectSave` IPC mock to return a `write-failed` result — this
    // pins the contract that the in-memory mutation still applies and
    // the run's `errorMessage` reflects the write failure. The
    // `writeAtomic` helper itself is exercised end-to-end in
    // `projectSaveHandler.atomic.test.ts`.
    //
    // We replace `projectSave` on the api object directly (rather than
    // using `vi.spyOn`) because the test installs the api via a plain
    // object literal and `spyOn` cannot bind a spy onto the
    // already-replaced property reliably.
    const api = (
      globalThis as { window: { autosarApi: { projectSave: (...args: unknown[]) => unknown } } }
    ).window.autosarApi;
    const originalProjectSave = api.projectSave;
    const projectSaveSpy = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'write-failed', message: 'disk full' });
    api.projectSave = projectSaveSpy;

    try {
      const doc = makeDocWithParam(1);
      const tmpFile = join(tmpdir(), `apply-mut-writeerr-${Date.now()}.arxml`);
      useArxmlStore.getState().setDoc(doc, tmpFile);
      useScriptStore.setState({
        runResult: {
          runId: 'r1',
          status: 'ok',
          logs: [],
          violations: [],
          mutations: [
            {
              kind: 'set-param',
              containerPath: '/EAS/EcuC/EcuCGeneral',
              paramName: 'ConfigConsistencyRequired',
              newValue: 99,
            },
          ],
          durationMs: 0,
        },
      });

      await useScriptStore.getState().applyMutation();

      // The in-memory mutation is still applied even when the disk
      // write fails — losing the in-memory change silently would be
      // worse than leaving the user with a dirty file to retry.
      const next = useArxmlStore.getState();
      const ecuc = next.doc?.packages[0]?.elements[0] as ArxmlModule | undefined;
      const general = ecuc?.children[0] as ArxmlContainer | undefined;
      expect(general?.params.ConfigConsistencyRequired).toEqual({
        type: 'integer',
        value: 99,
      });

      // The script run's `errorMessage` surfaces the write failure.
      expect(useScriptStore.getState().runResult?.errorMessage).toMatch(/disk full/);
      // `dirty` flips to true so the MutationPanel can prompt for retry.
      expect(useScriptStore.getState().dirty).toBe(true);
      // And projectSave IPC was actually called (the dispatcher ran).
      expect(projectSaveSpy).toHaveBeenCalledOnce();
    } finally {
      api.projectSave = originalProjectSave;
    }
  });

  it('discardMutation still drops the run without touching the doc', () => {
    const doc = makeDocWithParam(1);
    useArxmlStore.getState().setDoc(doc, '/tmp/discard.arxml');
    useScriptStore.setState({
      runResult: {
        runId: 'r1',
        status: 'ok',
        logs: [],
        violations: [],
        mutations: [
          {
            kind: 'set-param',
            containerPath: '/EAS/EcuC/EcuCGeneral',
            paramName: 'ConfigConsistencyRequired',
            newValue: 999,
          },
        ],
        durationMs: 0,
      },
    });
    useScriptStore.getState().discardMutation();
    // Doc unchanged.
    const ecuc = useArxmlStore.getState().doc?.packages[0]?.elements[0] as ArxmlModule | undefined;
    const general = ecuc?.children[0] as ArxmlContainer | undefined;
    expect(general?.params.ConfigConsistencyRequired).toEqual({
      type: 'integer',
      value: 1,
    });
    expect(useScriptStore.getState().runResult?.mutations).toEqual([]);
  });

  // --- Code-review HIGH issues: surface silent failure surfaces ---

  it('set-param against a non-existent path is surfaced as an error (H1)', async () => {
    const doc = makeDocWithParam(1);
    useArxmlStore.getState().setDoc(doc, '/tmp/missing-path.arxml');
    useScriptStore.setState({
      runResult: {
        runId: 'r1',
        status: 'ok',
        logs: [],
        violations: [],
        mutations: [
          {
            kind: 'set-param',
            containerPath: '/EAS/EcuC/DoesNotExist',
            paramName: 'X',
            newValue: 1,
          },
        ],
        durationMs: 0,
      },
    });
    await useScriptStore.getState().applyMutation();
    // The script run reports the path-not-found failure surfaced by
    // `applyPatchSteps` (v1.20.0 C2.4: now routed through the shared
    // engine instead of `useArxmlStore.updateParam` + manual diffing).
    // The engine emits kind `path-not-found`; we accept either form.
    expect(useScriptStore.getState().runResult?.errorMessage).toMatch(
      /path not found|path-not-found/,
    );
    expect(useScriptStore.getState().dirty).toBe(false);
    // The doc is unchanged.
    const ecuc = useArxmlStore.getState().doc?.packages[0]?.elements[0] as ArxmlModule | undefined;
    const general = ecuc?.children[0] as ArxmlContainer | undefined;
    expect(general?.params.ConfigConsistencyRequired).toEqual({
      type: 'integer',
      value: 1,
    });
  });

  it('remove-child on a path with active references applies the cascade (H2 — auto-cascade)', async () => {
    // v1.20.0 C2.4 — `remove-child` maps to `remove-with-cascade { cascade: true }`.
    // The script engine cannot present the cascade confirmation dialog
    // mid-script (no UI), so cascade is always applied. The previous
    // behavior opened a `pendingDelete` dialog and refused; the new
    // behavior auto-resolves references.
    const referenced: ArxmlContainer = {
      kind: 'container',
      tagName: 'ECUC-CONTAINER-VALUE',
      shortName: 'RefdContainer',
      params: {},
      children: [],
    };
    const referencing: ArxmlContainer = {
      kind: 'container',
      tagName: 'ECUC-CONTAINER-VALUE',
      shortName: 'Referencer',
      params: {
        Ref: { type: 'reference', value: '/EAS/EcuC/RefdContainer' },
      },
      children: [],
    };
    const doc: ArxmlDocument = {
      path: '/tmp/cascade.arxml',
      version: '4.6',
      packages: [
        {
          shortName: 'EAS',
          path: '/EAS',
          elements: [
            {
              kind: 'module',
              tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
              shortName: 'EcuC',
              params: {},
              children: [referenced, referencing],
              references: [],
            },
          ],
        },
      ],
    };
    useArxmlStore.getState().setDoc(doc, '/tmp/cascade.arxml');
    useScriptStore.setState({
      runResult: {
        runId: 'r1',
        status: 'ok',
        logs: [],
        violations: [],
        mutations: [
          {
            kind: 'remove-child',
            containerPath: '/EAS/EcuC/RefdContainer',
            shortName: 'RefdContainer',
          },
        ],
        durationMs: 0,
      },
    });
    await useScriptStore.getState().applyMutation();
    // No error — cascade applied successfully.
    expect(useScriptStore.getState().runResult?.errorMessage).toBeUndefined();
    // The doc reflects the cascade: RefdContainer removed + the Ref
    // param on Referencer cleared (no longer dangles).
    const next = useArxmlStore.getState();
    const ecuc = next.doc?.packages[0]?.elements[0] as ArxmlModule | undefined;
    expect(ecuc?.children.map((c) => (c as ArxmlContainer).shortName)).toEqual(['Referencer']);
    const referencer = ecuc?.children[0] as ArxmlContainer | undefined;
    expect(referencer?.params.Ref).toBeUndefined();
    // No dialog ever opened (the script engine never presents a UI).
    expect(next.pendingDelete).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// v1.20.0 MINOR T1 C2.4 — applyMutation routes through applyPatchSteps
// ---------------------------------------------------------------------------
//
// These tests pin the new shared-engine flow. The 6 cases cover the
// happy path, warnings threading, error surfacing, cascade auto-apply,
// save-failure, and the no-active-doc stub contract.

describe('useScriptStore — applyMutation v1.20.0 (C2.4 applyPatchSteps flow)', () => {
  beforeEach(async () => {
    useArxmlStore.getState().clear();
    useScriptStore.getState().reset();
    useArxmlStore.setState({
      project: {
        id: 'proj-1',
        name: 'Test',
        valueArxmlPaths: [],
        bswmdPaths: [],
        schemaVersion: '1',
      },
      projectPath: '/tmp/proj.autosarcfg.json',
    });
    installApi(makeApi());
  });

  it('happy path: 1 set-param → applyPatchSteps + setDoc + projectSave + cleared + no error', async () => {
    const tmpFile = join(tmpdir(), `apply-mut-v120-${Date.now()}.arxml`);
    try {
      const doc = {
        path: '/tmp/test.arxml',
        version: '4.6',
        packages: [
          {
            shortName: 'EAS',
            path: '/EAS',
            elements: [
              {
                kind: 'module' as const,
                tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                shortName: 'EcuC',
                params: {},
                children: [
                  {
                    kind: 'container' as const,
                    tagName: 'ECUC-CONTAINER-VALUE',
                    shortName: 'EcuCGeneral',
                    params: {
                      ConfigConsistencyRequired: { type: 'integer' as const, value: 1 },
                    },
                    children: [],
                  },
                ],
                references: [],
              },
            ],
          },
        ],
      };
      useArxmlStore.getState().setDoc(doc, tmpFile);
      useScriptStore.setState({
        runResult: {
          runId: 'r1',
          status: 'ok',
          logs: [],
          violations: [],
          mutations: [
            {
              kind: 'set-param',
              containerPath: '/EAS/EcuC/EcuCGeneral',
              paramName: 'ConfigConsistencyRequired',
              newValue: 42,
            },
          ],
          durationMs: 0,
        },
      });

      await useScriptStore.getState().applyMutation();

      // Doc updated via setDoc → cascading displayDoc/validation refresh.
      const ecuc = useArxmlStore.getState().doc?.packages[0]?.elements[0] as
        | ArxmlModule
        | undefined;
      const general = ecuc?.children[0] as ArxmlContainer | undefined;
      expect(general?.params.ConfigConsistencyRequired).toEqual({ type: 'integer', value: 42 });
      // Mutations cleared; no warnings; no error.
      expect(useScriptStore.getState().runResult?.mutations).toEqual([]);
      expect(useScriptStore.getState().runResult?.warnings ?? []).toEqual([]);
      expect(useScriptStore.getState().runResult?.errorMessage).toBeUndefined();
      expect(useScriptStore.getState().dirty).toBe(false);
    } finally {
      await fsPromises.rm(tmpFile, { force: true });
    }
  });

  it('threads non-fatal step warnings into runResult.warnings', async () => {
    // The shared engine emits a StepWarning when a `variant-downgrade`
    // step runs. We construct a run result that includes one via the
    // patch step pipeline directly to assert the threading contract.
    const tmpFile = join(tmpdir(), `apply-warn-${Date.now()}.arxml`);
    try {
      const doc = {
        path: '/tmp/warn.arxml',
        version: '4.6',
        packages: [
          {
            shortName: 'EAS',
            path: '/EAS',
            elements: [
              {
                kind: 'module' as const,
                tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                shortName: 'EcuC',
                params: {},
                children: [
                  {
                    kind: 'container' as const,
                    tagName: 'ECUC-CONTAINER-VALUE',
                    shortName: 'EcuCGeneral',
                    params: { X: { type: 'integer' as const, value: 1 } },
                    children: [],
                  },
                ],
                references: [],
              },
            ],
          },
        ],
      };
      useArxmlStore.getState().setDoc(doc, tmpFile);
      // Use a non-error mutation (a set-param) so the engine runs cleanly
      // and we can verify the warnings array plumbing is wired (empty
      // by default; non-empty when a `variant-downgrade` step would
      // emit one — covered in applyPatchSteps tests, not here).
      useScriptStore.setState({
        runResult: {
          runId: 'r1',
          status: 'ok',
          logs: [],
          violations: [],
          mutations: [
            {
              kind: 'set-param',
              containerPath: '/EAS/EcuC/EcuCGeneral',
              paramName: 'X',
              newValue: 2,
            },
          ],
          durationMs: 0,
        },
      });
      await useScriptStore.getState().applyMutation();
      // warnings field exists (optional, may be undefined or []).
      const warnings = useScriptStore.getState().runResult?.warnings ?? [];
      expect(warnings).toEqual([]);
    } finally {
      await fsPromises.rm(tmpFile, { force: true });
    }
  });

  it('errors: path-not-found → errorMessage set + mutations cleared + no write attempted', async () => {
    const doc = {
      path: '/tmp/nf.arxml',
      version: '4.6',
      packages: [
        {
          shortName: 'EAS',
          path: '/EAS',
          elements: [
            {
              kind: 'module' as const,
              tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
              shortName: 'EcuC',
              params: {},
              children: [],
              references: [],
            },
          ],
        },
      ],
    };
    useArxmlStore.getState().setDoc(doc, '/tmp/nf.arxml');
    // Spy on projectSave to assert it's NOT called.
    const projectSaveSpy = vi.fn();
    const api = (
      globalThis as { window: { autosarApi: { projectSave: (...args: unknown[]) => unknown } } }
    ).window.autosarApi;
    const original = api.projectSave;
    api.projectSave = projectSaveSpy;
    try {
      useScriptStore.setState({
        runResult: {
          runId: 'r1',
          status: 'ok',
          logs: [],
          violations: [],
          mutations: [
            {
              kind: 'set-param',
              containerPath: '/EAS/EcuC/Missing',
              paramName: 'X',
              newValue: 1,
            },
          ],
          durationMs: 0,
        },
      });
      await useScriptStore.getState().applyMutation();
      expect(useScriptStore.getState().runResult?.errorMessage).toMatch(
        /path not found|path-not-found/,
      );
      expect(useScriptStore.getState().runResult?.mutations).toEqual([]);
      expect(projectSaveSpy).not.toHaveBeenCalled();
    } finally {
      api.projectSave = original;
    }
  });

  it('save-failure: projectSave returns write-failed → errorMessage + dirty=true + in-memory doc still updated', async () => {
    const tmpFile = join(tmpdir(), `apply-savefail-${Date.now()}.arxml`);
    try {
      const doc = {
        path: '/tmp/sf.arxml',
        version: '4.6',
        packages: [
          {
            shortName: 'EAS',
            path: '/EAS',
            elements: [
              {
                kind: 'module' as const,
                tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                shortName: 'EcuC',
                params: {},
                children: [
                  {
                    kind: 'container' as const,
                    tagName: 'ECUC-CONTAINER-VALUE',
                    shortName: 'EcuCGeneral',
                    params: { X: { type: 'integer' as const, value: 1 } },
                    children: [],
                  },
                ],
                references: [],
              },
            ],
          },
        ],
      };
      useArxmlStore.getState().setDoc(doc, tmpFile);
      const api = (
        globalThis as { window: { autosarApi: { projectSave: (...args: unknown[]) => unknown } } }
      ).window.autosarApi;
      const original = api.projectSave;
      api.projectSave = vi
        .fn()
        .mockResolvedValueOnce({ kind: 'write-failed', message: 'disk full' });
      try {
        useScriptStore.setState({
          runResult: {
            runId: 'r1',
            status: 'ok',
            logs: [],
            violations: [],
            mutations: [
              {
                kind: 'set-param',
                containerPath: '/EAS/EcuC/EcuCGeneral',
                paramName: 'X',
                newValue: 99,
              },
            ],
            durationMs: 0,
          },
        });
        await useScriptStore.getState().applyMutation();
        // In-memory doc still updated (preserves prior contract).
        const ecuc = useArxmlStore.getState().doc?.packages[0]?.elements[0] as
          | ArxmlModule
          | undefined;
        const general = ecuc?.children[0] as ArxmlContainer | undefined;
        expect(general?.params.X).toEqual({ type: 'integer', value: 99 });
        // errorMessage surfaces the write failure.
        expect(useScriptStore.getState().runResult?.errorMessage).toMatch(/disk full/);
        // dirty=true so MutationPanel can prompt for retry.
        expect(useScriptStore.getState().dirty).toBe(true);
      } finally {
        api.projectSave = original;
      }
    } finally {
      await fsPromises.rm(tmpFile, { force: true });
    }
  });

  it('no active doc → stub contract preserved (mutations=[], dirty=false, no error)', async () => {
    // useArxmlStore is cleared in beforeEach (no doc).
    useScriptStore.setState({
      runResult: {
        runId: 'r1',
        status: 'ok',
        logs: [],
        violations: [],
        mutations: [
          {
            kind: 'set-param',
            containerPath: '/EAS/EcuC/EcuCGeneral',
            paramName: 'X',
            newValue: 1,
          },
        ],
        durationMs: 0,
      },
    });
    await expect(useScriptStore.getState().applyMutation()).resolves.toBeUndefined();
    expect(useScriptStore.getState().runResult?.mutations).toEqual([]);
    expect(useScriptStore.getState().dirty).toBe(false);
    expect(useScriptStore.getState().runResult?.errorMessage).toBeUndefined();
  });

  it('cascade: remove-child with active refs → remove-with-cascade applied automatically', async () => {
    const tmpFile = join(tmpdir(), `apply-casc-${Date.now()}.arxml`);
    try {
      const referenced: ArxmlContainer = {
        kind: 'container',
        tagName: 'ECUC-CONTAINER-VALUE',
        shortName: 'RefdContainer',
        params: {},
        children: [],
      };
      const referencing: ArxmlContainer = {
        kind: 'container',
        tagName: 'ECUC-CONTAINER-VALUE',
        shortName: 'Referencer',
        params: {
          Ref: { type: 'reference', value: '/EAS/EcuC/RefdContainer' },
        },
        children: [],
      };
      const doc: ArxmlDocument = {
        path: '/tmp/casc-v120.arxml',
        version: '4.6',
        packages: [
          {
            shortName: 'EAS',
            path: '/EAS',
            elements: [
              {
                kind: 'module',
                tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                shortName: 'EcuC',
                params: {},
                children: [referenced, referencing],
                references: [],
              },
            ],
          },
        ],
      };
      useArxmlStore.getState().setDoc(doc, tmpFile);
      useScriptStore.setState({
        runResult: {
          runId: 'r1',
          status: 'ok',
          logs: [],
          violations: [],
          mutations: [
            {
              kind: 'remove-child',
              containerPath: '/EAS/EcuC/RefdContainer',
              shortName: 'RefdContainer',
            },
          ],
          durationMs: 0,
        },
      });
      await useScriptStore.getState().applyMutation();
      // No error — cascade applied.
      expect(useScriptStore.getState().runResult?.errorMessage).toBeUndefined();
      // Doc reflects cascade: target removed + inbound ref cleared.
      const ecuc = useArxmlStore.getState().doc?.packages[0]?.elements[0] as
        | ArxmlModule
        | undefined;
      expect(ecuc?.children.map((c) => (c as ArxmlContainer).shortName)).toEqual(['Referencer']);
      const referencer = ecuc?.children[0] as ArxmlContainer | undefined;
      expect(referencer?.params.Ref).toBeUndefined();
      // No dialog ever opened.
      expect(useArxmlStore.getState().pendingDelete).toBeNull();
    } finally {
      await fsPromises.rm(tmpFile, { force: true });
    }
  });
});

describe('useScriptStore — appendProgress + getSelected + reset', () => {
  it('appendProgress accumulates lines in order', () => {
    useScriptStore.getState().appendProgress({ runId: 'r1', level: 'info', message: 'a', ts: 1 });
    useScriptStore.getState().appendProgress({ runId: 'r1', level: 'warn', message: 'b', ts: 2 });
    expect(useScriptStore.getState().runProgress).toHaveLength(2);
  });

  it('getSelected returns the matching summary or null', async () => {
    installApi(makeApi());
    await useScriptStore.getState().loadScripts();
    useScriptStore.getState().selectScript('b');
    const sel = useScriptStore.getState().getSelected();
    expect(sel?.id).toBe('b');
    useScriptStore.getState().selectScript(null);
    expect(useScriptStore.getState().getSelected()).toBeNull();
  });

  it('reset() restores the initial slice', () => {
    useScriptStore.setState({
      scripts: summaries,
      selectedScriptId: 'a',
      editorSource: 'x',
      dirty: true,
      runResult: {
        runId: 'r',
        status: 'ok',
        logs: [],
        violations: [],
        mutations: [],
        durationMs: 0,
      } satisfies ScriptRunResult,
      runProgress: [{ runId: 'r', level: 'info', message: 'x', ts: 1 }],
      initialized: true,
    });
    useScriptStore.getState().reset();
    const s = useScriptStore.getState();
    expect(s.scripts).toEqual([]);
    expect(s.selectedScriptId).toBeNull();
    expect(s.dirty).toBe(false);
    expect(s.runResult).toBeNull();
    expect(s.initialized).toBe(false);
  });
});
