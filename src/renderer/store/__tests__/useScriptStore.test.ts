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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScriptRunResult, ScriptSummary } from '@main/script/types';

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

interface MockApi {
  listScripts: ReturnType<typeof vi.fn>;
  saveScript: ReturnType<typeof vi.fn>;
  deleteScript: ReturnType<typeof vi.fn>;
  runScript: ReturnType<typeof vi.fn>;
}

function makeApi(overrides: Partial<MockApi> = {}): MockApi {
  return {
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
    ...overrides,
  };
}

function installApi(api: MockApi): void {
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
      runResult: { runId: 'r0', status: 'ok', logs: [], violations: [], mutations: [], durationMs: 0 },
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
      saveScript: vi.fn(async () => {
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
    const call = api.saveScript.mock.calls[0]?.[0] as Record<string, unknown>;
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
      deleteScript: vi.fn(async () => {
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
        logs: [{ level: 'info', message: 'ok', ts: 1 }],
        violations: [],
        mutations: [{ kind: 'set-param', containerPath: '/p', paramName: 'q', newValue: 1 }],
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
      runScript: vi.fn(async () => {
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
      runResult: { runId: 'prev', status: 'ok', logs: [], violations: [], mutations: [], durationMs: 0 },
      runProgress: [{ runId: 'prev', level: 'info', message: 'old', ts: 0 }],
    });
    await useScriptStore.getState().runScript('a');
    const s = useScriptStore.getState();
    expect(s.runProgress).toEqual([]);
    expect(s.runResult?.runId).toBe('r1');
  });
});

describe('useScriptStore — applyMutation / discardMutation / clearOutput', () => {
  it('applyMutation empties mutations on the runResult', () => {
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
    useScriptStore.getState().applyMutation();
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
      runResult: { runId: 'r1', status: 'ok', logs: [], violations: [], mutations: [], durationMs: 0 },
      runProgress: [{ runId: 'r1', level: 'info', message: 'x', ts: 1 }],
    });
    useScriptStore.getState().clearOutput();
    expect(useScriptStore.getState().runResult).toBeNull();
    expect(useScriptStore.getState().runProgress).toEqual([]);
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