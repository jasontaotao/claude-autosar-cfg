import { describe, expect, it } from 'vitest';

import { swsValidateCancelStub, swsValidateStub } from '../headless-stubs.js';

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

  // v1.19.0 MINOR — `headlessRunCommandStub` removed; replaced by the
  // real `headlessRunCommandHandler` (src/main/ipc/headlessRunCommandHandler.ts).
  // The handler has its own dedicated test file at
  // `src/main/ipc/__tests__/headlessRunCommandHandler.test.ts`.
});
