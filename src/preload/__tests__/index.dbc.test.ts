// @vitest-environment jsdom
//
// Preload bridge — Bug #5 (HIGH: DBC 解析器装上未接入).
//
// Verifies that `openDbc` and `parseDbc` are exposed on the
// preload's `autosarApi` and round-trip to the correct IPC channels.
// Uses the same mock-strategy as `src/preload/__tests__/index.test.ts`
// (stub `electron.contextBridge` + `electron.ipcRenderer`).
//
// ESM caches the preload module after first import — top-level
// `contextBridge.exposeInMainWorld` runs exactly once. We therefore
// import in `beforeAll` (not `beforeEach`) and reuse the cached api.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { IPC_CHANNELS } from '../../shared/ipc-contract.js';

const invokeCalls: Array<{ channel: string; payload: unknown }> = [];

const mockIpcRenderer = {
  invoke: vi.fn(async (channel: string, payload: unknown) => {
    invokeCalls.push({ channel, payload });
    return { kind: 'canceled' };
  }),
  on: vi.fn(),
  off: vi.fn(),
};

const mockContextBridge = {
  exposeInMainWorld: vi.fn(),
};

vi.mock('electron', () => ({
  contextBridge: mockContextBridge,
  ipcRenderer: mockIpcRenderer,
}));

let api: Record<string, unknown>;

beforeAll(async () => {
  await import('../index.js');
  // The preload runs `contextBridge.exposeInMainWorld('autosarApi', api)`
  // at top level. The api is the second arg of the first call.
  api = mockContextBridge.exposeInMainWorld.mock.calls[0]![1] as Record<string, unknown>;
});

beforeEach(() => {
  invokeCalls.length = 0;
  mockIpcRenderer.invoke.mockClear();
});

describe('preload bridge — DBC (Bug #5)', () => {
  it('exposes openDbc + parseDbc on autosarApi', () => {
    expect(typeof api.openDbc).toBe('function');
    expect(typeof api.parseDbc).toBe('function');
  });

  it('openDbc invokes DBC_OPEN channel', async () => {
    await (api.openDbc as () => Promise<unknown>)();
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.DBC_OPEN);
  });

  it('parseDbc invokes DBC_PARSE channel with the request payload', async () => {
    const req = { path: '/tmp/foo.dbc', content: 'VERSION ""\n' };
    await (api.parseDbc as (r: unknown) => Promise<unknown>)(req);
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.DBC_PARSE, req);
  });
});
