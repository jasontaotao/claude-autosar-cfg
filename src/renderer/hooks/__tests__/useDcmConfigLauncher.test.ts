// @vitest-environment jsdom
//
// useDcmConfigLauncher — v1.31.0 PATCH T3.
//
// Pinned behaviours:
//   1. Initial state is idle
//   2. open() transitions to pending, then success on IPC ok
//   3. open() transitions to error on IPC fail; error is classified
//      by regex prefix into 1 of 6 DcmConfigErrorClass
//   4. classifyError unit cases: 6 prefixes map to 6 classes
//   5. Re-entrancy guard: open() while pending is a no-op
//   6. closeDialog / dismissToast return to idle

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDcmConfigLauncher } from '../useDcmConfigLauncher.js';

// Stub the window.autosarApi bridge so the hook can call into it
// without a real Electron context. Each test sets `invokeResult`
// before invoking `open` to control the outcome.
const invokeMock = vi.fn();
beforeEach(() => {
  invokeMock.mockReset();
  (window as unknown as { autosarApi: { dcmConfig: typeof invokeMock } }).autosarApi = {
    dcmConfig: invokeMock,
  };
});
afterEach(() => {
  delete (window as unknown as { autosarApi?: unknown }).autosarApi;
});

describe('useDcmConfigLauncher (v1.31.0 PATCH T3)', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useDcmConfigLauncher());
    expect(result.current.state.mode).toBe('idle');
    expect(result.current.state.dialogOpen).toBe(false);
    expect(result.current.state.toastVisible).toBe(false);
    expect(result.current.state.result).toBeNull();
    expect(result.current.state.error).toBeNull();
  });

  it('transitions idle → pending → success on IPC ok', async () => {
    const okResult = {
      ok: true as const,
      value: {
        dcmConfigXml: '<arxml/>',
        odxLinkedDcmDspCount: 1,
        odxLinkedRoutineCount: 1,
        serviceCounts: {
          DcmClearDTC: 0,
          DcmReadDTC: 0,
          DcmReadDataById: 1,
          DcmWriteDataById: 0,
          DcmRoutineControl: 0,
        },
        outputPath: '/out/Dcm_Config.arxml',
        appliedStepCount: 1,
      },
    };
    invokeMock.mockResolvedValue(okResult);

    const { result } = renderHook(() => useDcmConfigLauncher());
    await act(async () => {
      await result.current.open({ odxPath: '/x.odx', xlsxRows: [] });
    });

    expect(result.current.state.mode).toBe('success');
    expect(result.current.state.dialogOpen).toBe(true);
    expect(result.current.state.toastVisible).toBe(false);
    expect(result.current.state.result).toEqual(okResult.value);
  });

  it('transitions idle → pending → error on IPC fail with bswmdUnreadable class', async () => {
    invokeMock.mockResolvedValue({
      ok: false,
      error: { message: 'BSWMD file unreadable: ENOENT: no such file' },
    });

    const { result } = renderHook(() => useDcmConfigLauncher());
    await act(async () => {
      await result.current.open({ odxPath: '/x.odx', xlsxRows: [] });
    });

    expect(result.current.state.mode).toBe('error');
    expect(result.current.state.dialogOpen).toBe(false);
    expect(result.current.state.toastVisible).toBe(true);
    expect(result.current.state.error?.classKey).toBe('bswmdUnreadable');
  });

  it.each([
    ['BSWMD file unreadable: x', 'bswmdUnreadable'],
    ['ODX file unreadable: x', 'odxUnreadable'],
    ['ODX parse failed: x', 'odxParseFailed'],
    ["BSWMD map missing module 'Dcm'", 'bswmdMapMissing'],
    ['Atomic write failed: x', 'atomicWriteFailed'],
    ['Some unknown error', 'unexpected'],
  ] as const)('classifyError maps %s to %s', async (message, expected) => {
    const { result } = renderHook(() => useDcmConfigLauncher());
    // classifyError is an internal helper — exercise it via the
    // error state path: invoke with the message, then read
    // state.error.classKey.
    invokeMock.mockResolvedValue({ ok: false, error: { message } });
    await act(async () => {
      await result.current.open({ odxPath: '/x.odx', xlsxRows: [] });
    });
    expect(result.current.state.error?.classKey).toBe(expected);
  });

  it('re-entrancy guard: open() while pending is a no-op', async () => {
    let resolveInvoke: (value: unknown) => void = () => undefined;
    invokeMock.mockReturnValue(
      new Promise((resolve) => {
        resolveInvoke = resolve;
      }),
    );

    const { result } = renderHook(() => useDcmConfigLauncher());
    act(() => {
      void result.current.open({ odxPath: '/a.odx', xlsxRows: [] });
    });
    expect(result.current.state.mode).toBe('pending');

    act(() => {
      void result.current.open({ odxPath: '/b.odx', xlsxRows: [] });
    });
    // Second open() ignored; invoke still called only once.
    expect(invokeMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInvoke({ ok: true, value: result.current.state.result });
      // The first invoke resolves with a falsy result; that's fine —
      // we just need to clean up the promise to avoid leakage.
    });
  });

  it('closeDialog returns to idle from success', async () => {
    invokeMock.mockResolvedValue({
      ok: true,
      value: {
        dcmConfigXml: '',
        odxLinkedDcmDspCount: 0,
        odxLinkedRoutineCount: 0,
        serviceCounts: {
          DcmClearDTC: 0,
          DcmReadDTC: 0,
          DcmReadDataById: 0,
          DcmWriteDataById: 0,
          DcmRoutineControl: 0,
        },
        outputPath: '',
        appliedStepCount: 0,
      },
    });

    const { result } = renderHook(() => useDcmConfigLauncher());
    await act(async () => {
      await result.current.open({ odxPath: '/x.odx', xlsxRows: [] });
    });
    expect(result.current.state.mode).toBe('success');
    act(() => {
      result.current.closeDialog();
    });
    expect(result.current.state.mode).toBe('idle');
    expect(result.current.state.dialogOpen).toBe(false);
  });

  it('dismissToast returns to idle from error', async () => {
    invokeMock.mockResolvedValue({
      ok: false,
      error: { message: 'Atomic write failed: x' },
    });

    const { result } = renderHook(() => useDcmConfigLauncher());
    await act(async () => {
      await result.current.open({ odxPath: '/x.odx', xlsxRows: [] });
    });
    expect(result.current.state.mode).toBe('error');
    act(() => {
      result.current.dismissToast();
    });
    expect(result.current.state.mode).toBe('idle');
    expect(result.current.state.toastVisible).toBe(false);
  });
});
