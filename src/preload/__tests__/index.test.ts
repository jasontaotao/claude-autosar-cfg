// Sprint 14 #1 Phase B (T8) — preload bridge tests.
//
// Verifies that the `window.autosarApi` surface exposes the 5 new
// script-engine entry points (`listScripts`, `saveScript`,
// `deleteScript`, `runScript`, `onScriptProgress`) and that each
// invoke wrapper threads its request through `ipcRenderer.invoke`
// with the correct channel + payload.
//
// Strategy: stub `electron.contextBridge` + `electron.ipcRenderer`
// to record every call, then assert against the recorded list.

import { describe, expect, it, beforeEach, vi } from 'vitest';

import { IPC_CHANNELS } from '../../shared/ipc-contract.js';

// In-memory record of every ipcRenderer call + on/off subscription.
const invokeCalls: Array<{ channel: string; payload: unknown }> = [];
const onCalls: Array<{ channel: string; handler: (...args: unknown[]) => void }> = [];
const offCalls: Array<{ channel: string; handler: (...args: unknown[]) => void }> = [];

const mockIpcRenderer = {
  invoke: vi.fn(async (channel: string, payload: unknown) => {
    invokeCalls.push({ channel, payload });
    return { ok: true };
  }),
  on: vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
    onCalls.push({ channel, handler });
  }),
  off: vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
    offCalls.push({ channel, handler });
  }),
};

const mockContextBridge = {
  exposeInMainWorld: vi.fn(),
};

vi.mock('electron', () => ({
  contextBridge: mockContextBridge,
  ipcRenderer: mockIpcRenderer,
}));

beforeEach(() => {
  invokeCalls.length = 0;
  onCalls.length = 0;
  offCalls.length = 0;
  mockIpcRenderer.invoke.mockClear();
  mockIpcRenderer.on.mockClear();
  mockIpcRenderer.off.mockClear();
  mockContextBridge.exposeInMainWorld.mockClear();
  // Importing the preload module AFTER the mock is installed ensures
  // `electron` is stubbed at module-load time. We re-import per test
  // because `exposeInMainWorld` runs at top level.
  vi.resetModules();
});

describe('preload bridge — Sprint 14 #1 script engine (T8)', () => {
  it('exposes window.autosarApi with 4 invoke wrappers and 1 progress subscriber', async () => {
    await import('../index.js');
    expect(mockContextBridge.exposeInMainWorld).toHaveBeenCalledTimes(1);
    const [worldName, api] = mockContextBridge.exposeInMainWorld.mock.calls[0]!;
    expect(worldName).toBe('autosarApi');
    const surface = api as Record<string, unknown>;
    expect(typeof surface.listScripts).toBe('function');
    expect(typeof surface.saveScript).toBe('function');
    expect(typeof surface.deleteScript).toBe('function');
    expect(typeof surface.runScript).toBe('function');
    expect(typeof surface.onScriptProgress).toBe('function');
  });

  it('listScripts invokes SCRIPT_LIST with the request payload', async () => {
    await import('../index.js');
    const api = mockContextBridge.exposeInMainWorld.mock.calls[0]![1] as {
      listScripts: (req: unknown) => Promise<unknown>;
    };
    await api.listScripts({ projectId: 'p1' });
    expect(invokeCalls).toHaveLength(1);
    expect(invokeCalls[0]?.channel).toBe(IPC_CHANNELS.SCRIPT_LIST);
    expect(invokeCalls[0]?.payload).toEqual({ projectId: 'p1' });
  });

  it('saveScript / deleteScript / runScript route to their channels', async () => {
    await import('../index.js');
    const api = mockContextBridge.exposeInMainWorld.mock.calls[0]![1] as {
      saveScript: (req: unknown) => Promise<unknown>;
      deleteScript: (req: unknown) => Promise<unknown>;
      runScript: (req: unknown) => Promise<unknown>;
    };
    await api.saveScript({
      projectId: 'p1',
      name: 'X',
      shortName: 'x-script',
      kind: 'free',
      source: '// x',
    });
    await api.deleteScript({ projectId: 'p1', id: 'abc' });
    await api.runScript({ projectId: 'p1', id: 'abc', timeoutMs: 1000 });
    expect(invokeCalls).toHaveLength(3);
    expect(invokeCalls[0]?.channel).toBe(IPC_CHANNELS.SCRIPT_SAVE);
    expect(invokeCalls[1]?.channel).toBe(IPC_CHANNELS.SCRIPT_DELETE);
    expect(invokeCalls[2]?.channel).toBe(IPC_CHANNELS.SCRIPT_RUN);
    expect(invokeCalls[2]?.payload).toEqual({ projectId: 'p1', id: 'abc', timeoutMs: 1000 });
  });

  it('onScriptProgress subscribes via ipcRenderer.on and returns an unsubscribe fn', async () => {
    await import('../index.js');
    const api = mockContextBridge.exposeInMainWorld.mock.calls[0]![1] as {
      onScriptProgress: (cb: (e: unknown) => void) => () => void;
    };
    const cb = (_e: unknown): void => undefined;
    const off = api.onScriptProgress(cb);
    expect(onCalls).toHaveLength(1);
    expect(onCalls[0]?.channel).toBe(IPC_CHANNELS.SCRIPT_PROGRESS);
    // Call the returned unsubscribe
    off();
    expect(offCalls).toHaveLength(1);
    expect(offCalls[0]?.channel).toBe(IPC_CHANNELS.SCRIPT_PROGRESS);
    // The on-handler and off-handler must be the same function reference
    // so ipcRenderer actually removes the listener.
    expect(onCalls[0]?.handler).toBe(offCalls[0]?.handler);
  });
});

// v1.21.0 MINOR T1 — GUI bridge for BSW code generation.
//
// Closes the gap where `autosarcfg generate` worked on the CLI + IPC
// layer (HEADLESS_RUN_COMMAND → headlessRunCommandHandler → CLI
// dispatcher) but the renderer never exposed a way to call it. The
// `runHeadlessCommand` wrapper threads the request payload through
// `ipcRenderer.invoke` on the existing `HEADLESS_RUN_COMMAND` channel
// — we don't add a new channel because the renderer already gets
// the full GenerateResult back through the invoke response (no push
// emitter needed; mutate/validate are the only commands that emit
// pushes, and that's gated on the `result.command === 'mutate'` /
// `'validate'` branches in `headlessRunCommandHandler.ts`).
describe('preload bridge — v1.21.0 MINOR T1 BSW generate GUI entry', () => {
  it('exposes window.autosarApi.runHeadlessCommand as a function', async () => {
    await import('../index.js');
    const api = mockContextBridge.exposeInMainWorld.mock.calls[0]![1] as Record<string, unknown>;
    expect(typeof api.runHeadlessCommand).toBe('function');
  });

  it('runHeadlessCommand invokes HEADLESS_RUN_COMMAND with the request payload', async () => {
    await import('../index.js');
    const api = mockContextBridge.exposeInMainWorld.mock.calls[0]![1] as {
      runHeadlessCommand: (req: unknown) => Promise<unknown>;
    };
    const req = {
      parsedArgs: {
        kind: 'generate',
        input: { command: 'generate', projectPath: '/abs/proj.autosarcfg.json' },
      },
      patchId: 'generate',
    };
    await api.runHeadlessCommand(req);
    expect(invokeCalls).toHaveLength(1);
    expect(invokeCalls[0]?.channel).toBe(IPC_CHANNELS.HEADLESS_RUN_COMMAND);
    expect(invokeCalls[0]?.payload).toEqual(req);
  });
});
