// Sprint 12 #2 — IPC channel + type contract tests.
//
// Verifies that the `IPC_CHANNELS` constant has the new `BSWMD_READ`
// channel name, that `IpcChannel` (derived from `IPC_CHANNELS`) includes
// it, and that the new request/response types are structurally what the
// main + preload + renderer sides will agree on.

import { describe, expect, it } from 'vitest';

import { IPC_CHANNELS, type IpcChannel } from '../ipc-contract.js';
import type {
  ReadBswmdRequest,
  ReadBswmdResponse,
} from '../types.js';

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