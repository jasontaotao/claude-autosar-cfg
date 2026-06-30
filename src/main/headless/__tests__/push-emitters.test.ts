// v1.18.1 PATCH — Headless push channel emitter tests.
//
// Verifies that `emitMutateApplied` and `emitValidateResult` in
// `src/main/headless/push-emitters.ts` send to `webContents.send`
// when the main window is available, and skip (no-op) when the
// window is null or destroyed.
//
// The mock setup mirrors `src/main/ipc/__tests__/script-progress-emit.test.ts`
// (SCRIPT_PROGRESS push channel emitter, v1.17.0 MINOR T5):
//   - `vi.hoisted` lifts the mock control surface above the
//     `vi.mock` factory (which runs before the module-import block).
//   - `vi.mock('../../window.js', ...)` redirects the `getMainWindow`
//     import in push-emitters.ts to our injected fake.
//   - Per-test, `setMainWindowReturn(null | obj)` swaps the fake so
//     we can exercise the null-window fallback and the
//     `isDestroyed` defensive guard.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  MutateAppliedEvent,
  ValidateResultEvent,
} from '../../../shared/headless/ipc-contract.js';
import {
  HEADLESS_MUTATE_APPLIED,
  HEADLESS_VALIDATE_RESULT,
} from '../../../shared/headless/ipc-contract.js';

// vi.hoisted lifts the mock control surface above the vi.mock factory
// (which runs before the module-import block).
const mocks = vi.hoisted(() => {
  const send = vi.fn();
  let current: unknown = {
    isDestroyed: () => false,
    webContents: { send },
  };
  return {
    send,
    setMainWindowReturn: (v: unknown): void => {
      current = v;
    },
    getMainWindow: () => current,
  };
});

vi.mock('../../window.js', () => ({
  getMainWindow: mocks.getMainWindow,
}));

// Import AFTER vi.mock so push-emitters.ts's `import { getMainWindow }
// from '../window.js'` resolves to the mock above.
const { emitMutateApplied, emitValidateResult } = await import('../push-emitters.js');

const sampleMutateEvent: MutateAppliedEvent = {
  patchId: 'patch-2026-06-30T00:00:00.000Z',
  applied: 3,
  warnings: [],
};

const sampleValidateEvent: ValidateResultEvent = {
  ok: true,
  command: 'validate',
  projectPath: '/tmp/sample.arxml',
  results: [],
  stub: true,
  durationMs: 12,
};

beforeEach(() => {
  mocks.send.mockClear();
  mocks.setMainWindowReturn({
    isDestroyed: () => false,
    webContents: { send: mocks.send },
  });
});

afterEach(() => {
  mocks.setMainWindowReturn(null);
});

describe('emitMutateApplied', () => {
  it('sends the payload to webContents when the main window is open', () => {
    emitMutateApplied(sampleMutateEvent);

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith(HEADLESS_MUTATE_APPLIED, sampleMutateEvent);
  });

  it('skips sending when the main window is null (CLI mode)', () => {
    mocks.setMainWindowReturn(null);

    emitMutateApplied(sampleMutateEvent);

    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('skips sending when the main window is destroyed', () => {
    mocks.setMainWindowReturn({
      isDestroyed: () => true,
      webContents: { send: mocks.send },
    });

    emitMutateApplied(sampleMutateEvent);

    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe('emitValidateResult', () => {
  it('sends the payload to webContents when the main window is open', () => {
    emitValidateResult(sampleValidateEvent);

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith(HEADLESS_VALIDATE_RESULT, sampleValidateEvent);
  });

  it('skips sending when the main window is null (CLI mode)', () => {
    mocks.setMainWindowReturn(null);

    emitValidateResult(sampleValidateEvent);

    expect(mocks.send).not.toHaveBeenCalled();
  });
});
