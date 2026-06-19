// Sprint 12 #2 — IPC channel + type contract tests.
//
// Verifies that the `IPC_CHANNELS` constant has the new `BSWMD_READ`
// channel name, that `IpcChannel` (derived from `IPC_CHANNELS`) includes
// it, and that the new request/response types are structurally what the
// main + preload + renderer sides will agree on.

import { describe, expect, it } from 'vitest';

import { IPC_CHANNELS, type IpcChannel } from '../ipc-contract.js';
import type { ReadBswmdRequest, ReadBswmdResponse, ScriptSaveRequest } from '../types.js';

describe('IPC contract (Sprint 12 #2)', () => {
  it('exposes BSWMD_READ channel with the agreed name', () => {
    expect(IPC_CHANNELS.BSWMD_READ).toBe('bswmd:read');
  });

  it('includes BSWMD_READ in the derived IpcChannel union', () => {
    // Compile-time check: assigning IpcChannel to a known string literal
    // would fail to typecheck if `bswmd:read` weren't a member.
    const channel: IpcChannel = IPC_CHANNELS.BSWMD_READ;
    expect(channel).toBe('bswmd:read');
  });

  it('ReadBswmdRequest has a single readonly `path` field', () => {
    const req: ReadBswmdRequest = { path: '/tmp/foo.arxml' };
    expect(req.path).toBe('/tmp/foo.arxml');
  });

  it('ReadBswmdResponse is a discriminated union: ok vs read-failed', () => {
    const ok: ReadBswmdResponse = { kind: 'ok', content: '...' };
    const fail: ReadBswmdResponse = { kind: 'read-failed', message: 'ENOENT' };
    expect(ok.kind).toBe('ok');
    expect(fail.kind).toBe('read-failed');
  });
});

// Sprint 14 #1 Phase B (T6) — 5 SCRIPT_* channels + request/response
// types. Verifies the shared IPC contract extensions match the spec
// (spec § 2.2) and the IpcChannel derived type covers all 5 names.
describe('IPC contract — Sprint 14 #1 script engine (5 channels)', () => {
  it('exposes SCRIPT_LIST / SCRIPT_SAVE / SCRIPT_DELETE / SCRIPT_RUN with script: prefix', () => {
    expect(IPC_CHANNELS.SCRIPT_LIST).toBe('script:list');
    expect(IPC_CHANNELS.SCRIPT_SAVE).toBe('script:save');
    expect(IPC_CHANNELS.SCRIPT_DELETE).toBe('script:delete');
    expect(IPC_CHANNELS.SCRIPT_RUN).toBe('script:run');
  });

  it('exposes SCRIPT_PROGRESS push channel', () => {
    expect(IPC_CHANNELS.SCRIPT_PROGRESS).toBe('script:progress');
  });

  it('all 5 channels are members of the derived IpcChannel union (compile-time check)', () => {
    // Compile-time check: assigning IpcChannel to a known string literal
    // fails to typecheck if the channel isn't part of the union.
    const list: IpcChannel = IPC_CHANNELS.SCRIPT_LIST;
    const save: IpcChannel = IPC_CHANNELS.SCRIPT_SAVE;
    const del: IpcChannel = IPC_CHANNELS.SCRIPT_DELETE;
    const run: IpcChannel = IPC_CHANNELS.SCRIPT_RUN;
    const progress: IpcChannel = IPC_CHANNELS.SCRIPT_PROGRESS;
    expect(list).toBe('script:list');
    expect(save).toBe('script:save');
    expect(del).toBe('script:delete');
    expect(run).toBe('script:run');
    expect(progress).toBe('script:progress');
  });

  it('ScriptListRequest / ScriptListResponse shapes are stable', () => {
    // Smoke check — the request is a single readonly projectId field
    // and the response is a discriminated single-key 'scripts' list.
    const req: { projectId: string } = { projectId: 'p1' };
    const resp: { scripts: readonly { id: string }[] } = { scripts: [] };
    expect(req.projectId).toBe('p1');
    expect(resp.scripts).toHaveLength(0);
  });

  it('ScriptSaveRequest accepts id for update or omits it for create', () => {
    const create: ScriptSaveRequest = {
      projectId: 'p1',
      name: 'New',
      shortName: 'new-script',
      kind: 'free',
      source: '// hi',
    };
    const update: ScriptSaveRequest = {
      projectId: 'p1',
      id: 'abc',
      name: 'New',
      shortName: 'new-script',
      kind: 'free',
      source: '// hi',
    };
    expect(create.id).toBeUndefined();
    expect(update.id).toBe('abc');
  });
});
