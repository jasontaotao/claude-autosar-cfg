// v1.56.0 DBC full-import — preload bridge wiring tests (Task 12).
//
// Asserts the two new additive channels + preload methods:
//   1. Channel constants are exactly `dbc:fullImportPreview` /
//      `dbc:fullImportCommit`（IPC 契约字符串 identity）。
//   2. `dbcFullImportPreview` / `dbcFullImportCommit` invoke
//      `ipcRenderer.invoke` with those constants + the request payload.
//   3. Legacy `dbcImportComStack` bridge stays 100% unchanged（Task 14
//      will migrate it later; this test pins its current surface）。
//   4. New request/response DTO types are exportable for renderer use —
//      compile-time enforcement via `import type` + typed usage below
//      (`pnpm type-check` fails if the types stop being exported)。
//
// Mock strategy mirrors `dcmConfigExposure.test.ts` / `index.dbc.test.ts`:
// stub `electron.contextBridge` + `electron.ipcRenderer` BEFORE the
// preload module loads so the top-level `exposeInMainWorld` call doesn't
// throw on missing Electron globals (the test runs in vitest, not
// Electron).

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IPC_CHANNELS } from '../../shared/ipc-contract.js';
import type {
  DbcFullImportCommitRequest,
  DbcFullImportCommitResponse,
  DbcFullImportPreviewRequest,
  DbcFullImportPreviewResponse,
} from '../../shared/types/dbc-import.js';

const invokeCalls: Array<{ channel: string; payload: unknown }> = [];

const mockIpcRenderer = {
  invoke: vi.fn(async (channel: string, payload: unknown) => {
    invokeCalls.push({ channel, payload });
    return { ok: true };
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

beforeEach(async () => {
  invokeCalls.length = 0;
  mockIpcRenderer.invoke.mockClear();
  mockContextBridge.exposeInMainWorld.mockClear();
  // `exposeInMainWorld` runs at module top level → re-import per test
  // so the captured api is always fresh.
  vi.resetModules();
  await import('../index.js');
  api = mockContextBridge.exposeInMainWorld.mock.calls[0]![1] as Record<string, unknown>;
});

describe('preload bridge — DBC full-import preview/commit (Task 12)', () => {
  it('channel constants are exactly dbc:fullImportPreview / dbc:fullImportCommit', () => {
    expect(IPC_CHANNELS.DBC_FULL_IMPORT_PREVIEW).toBe('dbc:fullImportPreview');
    expect(IPC_CHANNELS.DBC_FULL_IMPORT_COMMIT).toBe('dbc:fullImportCommit');
  });

  it('exposes dbcFullImportPreview + dbcFullImportCommit on autosarApi', () => {
    expect(typeof api.dbcFullImportPreview).toBe('function');
    expect(typeof api.dbcFullImportCommit).toBe('function');
  });

  it('dbcFullImportPreview invokes DBC_FULL_IMPORT_PREVIEW with the request payload', async () => {
    // 类型即断言：request/response DTO 必须从 dbc-import 模块导出
    //（import type 失败 → type-check 失败）。
    const req: DbcFullImportPreviewRequest = {
      dbcPath: 'C:/fixtures/vehicle.dbc',
      dirtyDocPaths: [],
      profileId: 'default',
    };
    const preview = api.dbcFullImportPreview as (
      r: DbcFullImportPreviewRequest,
    ) => Promise<DbcFullImportPreviewResponse>;
    await preview(req);
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.DBC_FULL_IMPORT_PREVIEW, req);
    expect(invokeCalls).toHaveLength(1);
    expect(invokeCalls[0]?.channel).toBe(IPC_CHANNELS.DBC_FULL_IMPORT_PREVIEW);
    expect(invokeCalls[0]?.payload).toEqual(req);
  });

  it('dbcFullImportCommit invokes DBC_FULL_IMPORT_COMMIT with the decision payload', async () => {
    const req: DbcFullImportCommitRequest = {
      dbcPath: 'C:/fixtures/vehicle.dbc',
      dirtyDocPaths: [],
      profileId: 'default',
      previewHash: 'abc123def',
      decisions: [{ module: 'Com', path: '/Com/ComConfig', decision: 'keep-local' }],
    };
    const commit = api.dbcFullImportCommit as (
      r: DbcFullImportCommitRequest,
    ) => Promise<DbcFullImportCommitResponse>;
    await commit(req);
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.DBC_FULL_IMPORT_COMMIT, req);
    expect(invokeCalls).toHaveLength(1);
    expect(invokeCalls[0]?.channel).toBe(IPC_CHANNELS.DBC_FULL_IMPORT_COMMIT);
    expect(invokeCalls[0]?.payload).toEqual(req);
  });

  it('legacy dbcImportComStack surface is unchanged (pinned for Task 14)', async () => {
    // 旧契约必须原样保留：方法存在、通道常量未变、invoke 透传不改。
    expect(typeof api.dbcImportComStack).toBe('function');
    expect(IPC_CHANNELS.DBC_IMPORT_COM_STACK).toBe('dbc:importComStack');
    const req = { dbcPath: 'C:/fixtures/legacy.dbc', bswmdPath: 'C:/fw/Can.arxml' };
    const legacy = api.dbcImportComStack as (r: unknown) => Promise<unknown>;
    await legacy(req);
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.DBC_IMPORT_COM_STACK, req);
  });
});
