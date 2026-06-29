import { describe, expect, it } from 'vitest';

import {
  headlessRunCommandStub,
  swsValidateCancelStub,
  swsValidateStub,
} from '../headless-stubs.js';

describe('IPC stubs (v1.15.5)', () => {
  it('swsValidateStub returns ValidateResult with stub=true', async () => {
    const r = await swsValidateStub({} as never, {} as never);
    expect(r.stub).toBe(true);
    expect(r.results).toEqual([]);
    expect(r.durationMs).toBe(0);
  });

  it('swsValidateCancelStub is no-op', async () => {
    await expect(swsValidateCancelStub({} as never, {} as never)).resolves.toBeUndefined();
  });

  it('headlessRunCommandStub returns StubHeadlessResult', async () => {
    const r = await headlessRunCommandStub({} as never, {} as never);
    expect(r).toEqual({ ok: true, stub: true });
  });
});
