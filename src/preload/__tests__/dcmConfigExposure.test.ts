// v1.30.0 MINOR — smoke test asserting `autosarApi.dcmConfig`
// is exposed on the renderer's window via the preload bridge.
// Catches a regression where the bridge object loses the new key
// (e.g. accidental `Object.assign` overwrite, Vite tree-shake misuse).
//
// Pattern mirrors the existing `index.test.ts`: vi.mock('electron')
// stubs `contextBridge` and `ipcRenderer` BEFORE the bridge module
// loads so the `contextBridge.exposeInMainWorld()` call inside
// `src/preload/index.ts:285` doesn't throw on the missing
// Electron globals (the test runs in vitest, not Electron).

import { describe, expect, it, beforeEach, vi } from 'vitest';

import { IPC_CHANNELS } from '../../shared/ipc-contract.js';

const mockInvoke = vi.fn();
const mockContextBridge = {
  exposeInMainWorld: vi.fn(),
};

vi.mock('electron', () => ({
  contextBridge: mockContextBridge,
  ipcRenderer: {
    invoke: mockInvoke,
    on: vi.fn(),
    off: vi.fn(),
  },
}));

beforeEach(() => {
  mockInvoke.mockReset();
  mockContextBridge.exposeInMainWorld.mockReset();
});

describe('preload — dcmConfig bridge exposure (v1.30.0)', () => {
  it('IPC_CHANNELS.DCM_CONFIG is the literal "dcm:config"', () => {
    expect(IPC_CHANNELS.DCM_CONFIG).toBe('dcm:config');
  });

  it('dcmConfig is registered on the bridge with the right channel', async () => {
    // Importing the module triggers the `contextBridge.exposeInMainWorld`
    // call with the `api` object as its 2nd arg. Capture `api` via the
    // mock so we can introspect it.
    await import('../index.js');
    expect(mockContextBridge.exposeInMainWorld).toHaveBeenCalledTimes(1);
    const [name, api] = mockContextBridge.exposeInMainWorld.mock.calls[0]!;
    expect(name).toBe('autosarApi');
    expect(typeof api.dcmConfig).toBe('function');

    // Invoke the captured function to verify the bridge forwards to
    // `ipcRenderer.invoke` with the right channel + payload.
    mockInvoke.mockResolvedValue({ ok: true, value: { appliedStepCount: 0 } });
    const req = { odxPath: '/x.odx-d', xlsxRows: [], bswmdPath: undefined };
    await api.dcmConfig(req as unknown as never);
    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.DCM_CONFIG, req);
  });
});
