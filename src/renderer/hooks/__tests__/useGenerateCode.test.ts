// useGenerateCode hook tests — v1.21.0 MINOR T1.
//
// Drives the IPC bridge mock directly (the hook depends on
// `window.autosarApi.runHeadlessCommand`). Covers 5 paths:
//   1. success → state=ok, result populated, errorMessage null,
//      GenerateOutcome.kind='ok'
//   2. HeadlessFailure → state=error, errorMessage from stderr join,
//      GenerateOutcome.kind='error'
//   3. unexpected throw (IPC bridge itself rejects) → state=error,
//      errorMessage from err.message, GenerateOutcome.kind='error'
//   4. ok:false GenerateResult (engine reported diagnostics) →
//      state=error, errorMessage from first diagnostic, outcome.kind='error'
//   5. concurrent generate() while in-flight is a no-op
//      (re-entrancy gate per v1.21.0 HIGH-2 code-review finding)

// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  GenerateResult,
  HeadlessRunCommandRequest,
  HeadlessRunCommandResult,
} from '@shared/headless/ipc-contract.js';

import { useGenerateCode } from '../useGenerateCode';

// In-memory mock for window.autosarApi.runHeadlessCommand.
// Default implementation is a vi.fn that tests can override per-case.
const runHeadlessCommandMock = vi.fn<
  [HeadlessRunCommandRequest],
  Promise<HeadlessRunCommandResult>
>();

beforeEach(() => {
  runHeadlessCommandMock.mockReset();
  // Default: success envelope with an empty GenerateResult. Each test
  // overrides this when it needs a different shape.
  const okResult: GenerateResult = {
    ok: true,
    command: 'generate',
    projectPath: '/abs/proj.autosarcfg.json',
    outDir: '/abs/generated',
    variant: 'PreCompile',
    files: [],
    diagnostics: [],
    durationMs: 42,
  };
  runHeadlessCommandMock.mockResolvedValue({ kind: 'ok', result: okResult });
  // Assign onto the existing jsdom window — replacing `globalThis.window`
  // with a bare object breaks React's `instanceof window.HTMLElement`
  // checks inside getActiveElementDeep (TypeError: Right-hand side of
  // 'instanceof' is not an object).
  (
    window as unknown as { autosarApi: { runHeadlessCommand: typeof runHeadlessCommandMock } }
  ).autosarApi = {
    runHeadlessCommand: runHeadlessCommandMock,
  };
});

afterEach(() => {
  delete (window as unknown as { autosarApi?: unknown }).autosarApi;
});

describe('useGenerateCode', () => {
  it('starts in idle state with null result and null errorMessage', () => {
    const { result } = renderHook(() => useGenerateCode());
    expect(result.current.state).toBe('idle');
    expect(result.current.result).toBeNull();
    expect(result.current.errorMessage).toBeNull();
    expect(typeof result.current.generate).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('on success: state=ok, result populated, errorMessage null, outcome.kind=ok', async () => {
    const okResult: GenerateResult = {
      ok: true,
      command: 'generate',
      projectPath: '/abs/proj.autosarcfg.json',
      outDir: '/abs/generated',
      variant: 'PreCompile',
      files: [{ path: 'EcuC.h', bytes: 1024 }],
      diagnostics: [],
      durationMs: 100,
    };
    runHeadlessCommandMock.mockResolvedValue({ kind: 'ok', result: okResult });

    const { result } = renderHook(() => useGenerateCode());
    let outcome: { kind: 'ok' | 'error'; message?: string; result?: unknown } | undefined;
    await act(async () => {
      outcome = await result.current.generate('/abs/proj.autosarcfg.json');
    });

    expect(result.current.state).toBe('ok');
    expect(result.current.result).toEqual(okResult);
    expect(result.current.errorMessage).toBeNull();
    expect(outcome).toEqual({ kind: 'ok', result: okResult });

    // Verify the request shape — parsedArgs.kind='generate', patchId
    // is the literal 'generate' sink for the mutate push emitter.
    expect(runHeadlessCommandMock).toHaveBeenCalledWith({
      parsedArgs: {
        kind: 'generate',
        input: { command: 'generate', projectPath: '/abs/proj.autosarcfg.json' },
      },
      patchId: 'generate',
    });
  });

  it('on ok:false GenerateResult (engine errors): state=error, first diagnostic message surfaced', async () => {
    const failed: GenerateResult = {
      ok: false,
      command: 'generate',
      projectPath: '/abs/proj.autosarcfg.json',
      outDir: '/abs/generated',
      variant: 'PreCompile',
      files: [],
      diagnostics: [
        {
          ruleId: 'SWS_ECUC_MULTIPLICITY',
          severity: 'error',
          path: 'EcuC/EcucGeneral',
          message: 'multiplicity exceeded',
        },
      ],
      durationMs: 12,
    };
    runHeadlessCommandMock.mockResolvedValue({ kind: 'ok', result: failed });

    const { result } = renderHook(() => useGenerateCode());
    let outcome: { kind: 'ok' | 'error'; message?: string; result?: unknown } | undefined;
    await act(async () => {
      outcome = await result.current.generate('/abs/proj.autosarcfg.json');
    });

    expect(result.current.state).toBe('error');
    expect(result.current.errorMessage).toBe('multiplicity exceeded');
    expect(result.current.result).toEqual(failed);
    expect(outcome).toEqual({ kind: 'error', message: 'multiplicity exceeded', result: failed });
  });

  it('on HeadlessFailure: state=error, stderr joined into errorMessage', async () => {
    runHeadlessCommandMock.mockResolvedValue({
      kind: 'error',
      failure: {
        ok: false,
        code: 1,
        error: { kind: 'file-not-found', path: '/abs/proj.autosarcfg.json' },
        stderr: ['[autosarcfg] cannot read manifest', '[autosarcfg] generate: exit 1'],
      },
    });

    const { result } = renderHook(() => useGenerateCode());
    await act(async () => {
      await result.current.generate('/abs/proj.autosarcfg.json');
    });

    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.errorMessage).toBe(
      '[autosarcfg] cannot read manifest\n[autosarcfg] generate: exit 1',
    );
    expect(result.current.result).toBeNull();
  });

  it('on HeadlessFailure with empty stderr: falls back to error.kind', async () => {
    runHeadlessCommandMock.mockResolvedValue({
      kind: 'error',
      failure: {
        ok: false,
        code: 1,
        error: { kind: 'internal-error', message: 'oops' },
        stderr: [],
      },
    });

    const { result } = renderHook(() => useGenerateCode());
    await act(async () => {
      await result.current.generate('/abs/proj.autosarcfg.json');
    });

    expect(result.current.state).toBe('error');
    expect(result.current.errorMessage).toBe('Generate failed (internal-error)');
  });

  it('on IPC bridge reject: state=error, error.message is surfaced', async () => {
    runHeadlessCommandMock.mockRejectedValue(new Error('IPC bridge died'));

    const { result } = renderHook(() => useGenerateCode());
    await act(async () => {
      await result.current.generate('/abs/proj.autosarcfg.json');
    });

    expect(result.current.state).toBe('error');
    expect(result.current.errorMessage).toBe('IPC bridge died');
    expect(result.current.result).toBeNull();
  });

  it('on empty projectPath: state=error without calling IPC', async () => {
    const { result } = renderHook(() => useGenerateCode());
    let outcome: { kind: 'ok' | 'error'; message?: string } | undefined;
    await act(async () => {
      outcome = await result.current.generate('');
    });
    expect(result.current.state).toBe('error');
    expect(result.current.errorMessage).toBe('projectPath is empty');
    expect(outcome).toEqual({ kind: 'error', message: 'projectPath is empty', result: null });
    expect(runHeadlessCommandMock).not.toHaveBeenCalled();
  });

  it('reset() returns to idle', async () => {
    runHeadlessCommandMock.mockResolvedValue({
      kind: 'error',
      failure: {
        ok: false,
        code: 1,
        error: { kind: 'internal-error', message: 'x' },
        stderr: ['boom'],
      },
    });
    const { result } = renderHook(() => useGenerateCode());
    await act(async () => {
      await result.current.generate('/abs/proj.autosarcfg.json');
    });
    expect(result.current.state).toBe('error');

    act(() => result.current.reset());
    expect(result.current.state).toBe('idle');
    expect(result.current.result).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  // v1.21.0 HIGH-2 — re-entrancy guard. The UI also disables the
  // button via the `canGenerate`/`generateBusy` prop pair, but the
  // hook is a public export and callable from anywhere (e.g. a future
  // Cmd-K palette shortcut). Two concurrent `generate()` invocations
  // would race the atomic-write path on `outDir` (the second call
  // would clobber the first's generated files), so the hook must
  // enforce single-flight itself.
  it('concurrent generate() while in-flight is a no-op (second call resolves with error)', async () => {
    let resolveFirst!: (value: HeadlessRunCommandResult) => void;
    runHeadlessCommandMock.mockImplementationOnce(
      () =>
        new Promise<HeadlessRunCommandResult>((res) => {
          resolveFirst = res;
        }),
    );
    // Default resolution for the second call (should NOT happen —
    // assertion is below).
    runHeadlessCommandMock.mockResolvedValue({
      kind: 'error',
      failure: {
        ok: false,
        code: 1,
        error: { kind: 'internal-error', message: 'should-not-be-called' },
        stderr: [],
      },
    });

    const { result } = renderHook(() => useGenerateCode());

    // Fire the first call but don't await — it parks on the pending
    // promise above.
    let firstOutcome: { kind: 'ok' | 'error'; message?: string } | undefined;
    const firstPromise = act(async () => {
      firstOutcome = await result.current.generate('/abs/proj.autosarcfg.json');
    });

    // Now fire the second call while the first is still in flight.
    let secondOutcome: { kind: 'ok' | 'error'; message?: string } | undefined;
    await act(async () => {
      secondOutcome = await result.current.generate('/abs/proj.autosarcfg.json');
    });

    // Resolve the first call so the firstOutcome promise settles.
    const okResult: GenerateResult = {
      ok: true,
      command: 'generate',
      projectPath: '/abs/proj.autosarcfg.json',
      outDir: '/abs/generated',
      variant: 'PreCompile',
      files: [],
      diagnostics: [],
      durationMs: 10,
    };
    resolveFirst({ kind: 'ok', result: okResult });
    await firstPromise;

    // The second call should have been short-circuited by the
    // re-entrancy gate, NOT have called IPC a second time.
    expect(runHeadlessCommandMock).toHaveBeenCalledTimes(1);
    expect(secondOutcome).toEqual({
      kind: 'error',
      message: 'generate already in flight',
      result: null,
    });
    // The first call still completes normally.
    expect(firstOutcome).toEqual({ kind: 'ok', result: okResult });
  });
});
