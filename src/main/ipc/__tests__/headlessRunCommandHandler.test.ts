// v1.19.0 MINOR — headlessRunCommandHandler tests.
//
// Verifies that the new real GUI-mode dispatcher:
//   1. Delegates to `dispatchCommandForGui` for each command kind.
//   2. Emits `MutateAppliedEvent` after a successful mutate command.
//   3. Emits `ValidateResultEvent` after a successful validate command.
//   4. Does NOT emit push events for read / generate commands.
//   5. Returns `{ kind: 'error', failure }` envelope on HeadlessFailureError.
//   6. Returns `{ kind: 'error', failure }` envelope on unexpected throws.
//
// The mock setup mirrors the push-emitters.test.ts pattern:
//   - `vi.hoisted` lifts the mock control surface above the
//     `vi.mock` factories.
//   - `vi.mock('../../window.js', ...)` mocks the main-window accessor.
//   - `vi.mock('../../../cli/command-dispatcher.js', ...)` mocks the
//     CLI dispatcher so we can control what it returns / throws.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  HeadlessRunCommandRequest,
  MutateAppliedEvent,
  ValidateResultEvent,
} from '../../../shared/headless/ipc-contract.js';
import {
  HEADLESS_MUTATE_APPLIED,
  HEADLESS_VALIDATE_RESULT,
} from '../../../shared/headless/ipc-contract.js';

const mocks = vi.hoisted(() => {
  const send = vi.fn();
  const dispatchCommandForGui = vi.fn();
  let currentWindow: unknown = {
    isDestroyed: () => false,
    webContents: { send },
  };
  return {
    send,
    setMainWindowReturn: (v: unknown): void => {
      currentWindow = v;
    },
    getMainWindow: () => currentWindow,
    dispatchCommandForGui,
  };
});

vi.mock('../../window.js', () => ({
  getMainWindow: mocks.getMainWindow,
}));

vi.mock('../../../cli/command-dispatcher.js', () => ({
  dispatchCommandForGui: mocks.dispatchCommandForGui,
  HeadlessFailureError: class HeadlessFailureError extends Error {
    failure: unknown;
    constructor(failure: unknown) {
      super('failure');
      this.failure = failure;
    }
  },
}));

// Import AFTER vi.mock so headlessRunCommandHandler.ts's `dispatchCommandForGui`
// import resolves to the mock above.
const { headlessRunCommandHandler } = await import('../headlessRunCommandHandler.js');

const sampleMutateResult = {
  ok: true as const,
  command: 'mutate' as const,
  projectPath: '/tmp/sample.autosarcfg.json',
  patchId: 'patch-test-001',
  stepsApplied: 3,
  stepsTotal: 5,
  warnings: [],
  durationMs: 42,
};

const sampleValidateResult = {
  ok: true as const,
  command: 'validate' as const,
  projectPath: '/tmp/sample.autosarcfg.json',
  results: [],
  stub: true as const,
  durationMs: 12,
};

const sampleReadResult = {
  ok: true as const,
  command: 'read' as const,
  projectPath: '/tmp/sample.autosarcfg.json',
  summary: {
    arxmlVersion: '4.6',
    moduleCount: 0,
    containerCount: 0,
    parameterCount: 0,
    referenceCount: 0,
  },
  document: null,
  durationMs: 5,
};

beforeEach(() => {
  mocks.send.mockClear();
  mocks.dispatchCommandForGui.mockReset();
  mocks.setMainWindowReturn({
    isDestroyed: () => false,
    webContents: { send: mocks.send },
  });
});

afterEach(() => {
  mocks.setMainWindowReturn(null);
});

describe('headlessRunCommandHandler', () => {
  it('returns the mutate result + emits MutateAppliedEvent when mutate succeeds', async () => {
    mocks.dispatchCommandForGui.mockResolvedValueOnce(sampleMutateResult);

    const req: HeadlessRunCommandRequest = {
      parsedArgs: {
        kind: 'mutate',
        input: {
          projectPath: '/tmp/sample.autosarcfg.json',
          patch: '-',
          format: 'json',
          dryRun: false,
        },
      },
      patchId: 'patch-test-001',
    };

    const result = await headlessRunCommandHandler({} as never, req);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('unreachable');
    expect(result.result).toEqual(sampleMutateResult);
    expect(mocks.dispatchCommandForGui).toHaveBeenCalledWith({
      kind: 'mutate',
      global: {
        projectPath: '/tmp/sample.autosarcfg.json',
        verbose: false,
        quiet: false,
        noColor: false,
      },
      input: { ...req.parsedArgs.input, strict: false, backup: true },
    });

    // MutateAppliedEvent was emitted with the right payload.
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const expectedEvent: MutateAppliedEvent = {
      patchId: 'patch-test-001',
      applied: 3,
      warnings: [],
    };
    expect(mocks.send).toHaveBeenCalledWith(HEADLESS_MUTATE_APPLIED, expectedEvent);
  });

  it('returns the validate result + emits ValidateResultEvent when validate succeeds', async () => {
    mocks.dispatchCommandForGui.mockResolvedValueOnce(sampleValidateResult);

    const req: HeadlessRunCommandRequest = {
      parsedArgs: {
        kind: 'validate',
        input: {
          projectPath: '/tmp/sample.autosarcfg.json',
          format: 'json',
          stub: false,
        },
      },
      patchId: 'patch-test-002',
    };

    const result = await headlessRunCommandHandler({} as never, req);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('unreachable');
    expect(result.result).toEqual(sampleValidateResult);

    expect(mocks.send).toHaveBeenCalledTimes(1);
    const expectedEvent: ValidateResultEvent = sampleValidateResult;
    expect(mocks.send).toHaveBeenCalledWith(HEADLESS_VALIDATE_RESULT, expectedEvent);
  });

  it('does NOT emit push events for read commands (renderer already has the result)', async () => {
    mocks.dispatchCommandForGui.mockResolvedValueOnce(sampleReadResult);

    const req: HeadlessRunCommandRequest = {
      parsedArgs: {
        kind: 'read',
        input: { projectPath: '/tmp/sample.autosarcfg.json', format: 'json' },
      },
      patchId: 'patch-test-003',
    };

    const result = await headlessRunCommandHandler({} as never, req);

    expect(result.kind).toBe('ok');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does NOT emit push events for generate commands (renderer already has the result)', async () => {
    const sampleGenerateResult = {
      ok: true as const,
      command: 'generate' as const,
      projectPath: '/tmp/sample.autosarcfg.json',
      outDir: '/tmp/sample/generated',
      variant: 'PreCompile' as const,
      files: [],
      diagnostics: [],
      durationMs: 100,
    };
    mocks.dispatchCommandForGui.mockResolvedValueOnce(sampleGenerateResult);

    const req: HeadlessRunCommandRequest = {
      parsedArgs: {
        kind: 'generate',
        input: { command: 'generate', projectPath: '/tmp/sample.autosarcfg.json' },
      },
      patchId: 'patch-test-004',
    };

    const result = await headlessRunCommandHandler({} as never, req);

    expect(result.kind).toBe('ok');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('returns error envelope with HeadlessFailure when dispatcher throws HeadlessFailureError', async () => {
    const failure = {
      ok: false as const,
      code: 3 as const,
      error: { kind: 'patch-invalid', reason: 'invalid step' },
      stderr: ['[autosarcfg] invalid patch'],
    };
    // Throw a real HeadlessFailureError so the handler's `instanceof` check matches.
    const { HeadlessFailureError } = await import('../../../cli/command-dispatcher.js');
    mocks.dispatchCommandForGui.mockRejectedValueOnce(
      new (HeadlessFailureError as unknown as new (f: unknown) => Error)(failure),
    );

    const req: HeadlessRunCommandRequest = {
      parsedArgs: {
        kind: 'mutate',
        input: {
          projectPath: '/tmp/sample.autosarcfg.json',
          patch: '-',
          format: 'json',
          dryRun: false,
        },
      },
      patchId: 'patch-test-005',
    };

    const result = await headlessRunCommandHandler({} as never, req);

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') throw new Error('unreachable');
    expect(result.failure).toEqual(failure);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('wraps unexpected throws as internal-error HeadlessFailure', async () => {
    mocks.dispatchCommandForGui.mockRejectedValueOnce(new Error('boom'));

    const req: HeadlessRunCommandRequest = {
      parsedArgs: {
        kind: 'read',
        input: { projectPath: '/tmp/sample.autosarcfg.json', format: 'json' },
      },
      patchId: 'patch-test-006',
    };

    const result = await headlessRunCommandHandler({} as never, req);

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') throw new Error('unreachable');
    expect(result.failure.ok).toBe(false);
    expect(result.failure.code).toBe(1);
    if (result.failure.error.kind !== 'internal-error') throw new Error('unreachable');
    expect(result.failure.error.message).toBe('boom');
  });

  it('skips push emission when the main window is null (CLI mode)', async () => {
    mocks.setMainWindowReturn(null);
    mocks.dispatchCommandForGui.mockResolvedValueOnce(sampleMutateResult);

    const req: HeadlessRunCommandRequest = {
      parsedArgs: {
        kind: 'mutate',
        input: {
          projectPath: '/tmp/sample.autosarcfg.json',
          patch: '-',
          format: 'json',
          dryRun: false,
        },
      },
      patchId: 'patch-test-007',
    };

    const result = await headlessRunCommandHandler({} as never, req);

    // Result still returned (the invoke response is independent of push).
    expect(result.kind).toBe('ok');
    // But no push event was sent (no main window).
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
