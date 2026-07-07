// @vitest-environment jsdom
//
// useDcmConfigLauncher — v1.31.0 PATCH T3 + v1.32.0 MINOR T2.
//
// Pinned behaviours:
//   1. Initial state is idle
//   2. open() transitions to pending, then success on IPC ok
//   3. open() transitions to error on IPC fail; error is classified
//      by regex prefix into 1 of 6 DcmConfigErrorClass
//   4. classifyError unit cases: 6 prefixes map to 6 classes
//   5. Re-entrancy guard: open() while pending is a no-op
//   6. closeDialog / dismissToast return to idle
//
// v1.32.0 MINOR T2 additions:
//   7. classifyError reads DcmConfigError.kind FIRST
//   8. classifyErrorByRegex preserves v1.31.x 6-prefix regex behaviour
//   9. classifyError falls back to regex when kind is absent
//      (pre-v1.32.0 IPC handler payloads — 1-release compat window)

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DcmConfigError, DcmConfigErrorKind } from '../../../shared/types.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';
import {
  classifyError,
  classifyErrorByRegex,
  useDcmConfigLauncher,
} from '../useDcmConfigLauncher.js';

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

  // v1.31.1 PATCH — defensive IPC try/catch (T4 whole-branch Minor
  // plan-mandated). If the bridge throws (rejected promise), the
  // hook must surface an `unexpected` toast + release the
  // re-entrancy ref so a subsequent open() can proceed.
  it('surfaces unexpected toast when IPC bridge throws', async () => {
    invokeMock.mockRejectedValue(new Error('IPC bridge exploded'));

    const { result } = renderHook(() => useDcmConfigLauncher());
    await act(async () => {
      await result.current.open({ odxPath: '/x.odx', xlsxRows: [] });
    });

    expect(result.current.state.mode).toBe('error');
    expect(result.current.state.toastVisible).toBe(true);
    expect(result.current.state.dialogOpen).toBe(false);
    expect(result.current.state.error?.classKey).toBe('unexpected');
    expect(result.current.state.error?.message).toContain('IPC bridge exploded');

    // Re-entrancy ref released — a fresh open() can fire.
    invokeMock.mockResolvedValue({
      ok: true,
      value: result.current.state.result ?? {
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
    await act(async () => {
      await result.current.open({ odxPath: '/y.odx', xlsxRows: [] });
    });
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});

// v1.32.0 MINOR T2 — classifyError reads kind FIRST; legacy regex fallback
// preserves behavior for pre-v1.32.0 IPC handler payloads.
describe('classifyError (v1.32.0 T2) — kind-first', () => {
  it.each<[DcmConfigErrorKind, string]>([
    ['odx-unreadable', 'ODX_FILE_UNREADABLE'],
    ['odx-parse-failed', 'ODX_PARSE_FAILED'],
    ['bswmd-unreadable', 'BSWMD_FILE_UNREADABLE'],
    ['odx-dcm-linkage', 'ODX_DCM_LINKAGE'],
    ['dcm-module-missing', 'DCM_MODULE_MISSING'],
    ['container-not-found', 'CONTAINER_NOT_FOUND'],
    ['patch-failed', 'PATCH_FAILED'],
    ['atomic-write-failed', 'ATOMIC_WRITE_FAILED'],
    ['unknown', 'UNKNOWN'],
  ])('maps kind=%s to class=%s', (kind, expectedClass) => {
    const error: DcmConfigError = { kind, message: 'irrelevant' };
    expect(classifyError(error)).toBe(expectedClass);
  });
});

describe('classifyErrorByRegex (v1.32.0 T2) — legacy fallback', () => {
  it.each<[string, string]>([
    ['ODX file unreadable: ENOENT', 'ODX_FILE_UNREADABLE'],
    ['ODX parse failed: ...', 'ODX_PARSE_FAILED'],
    ['BSWMD file unreadable: ENOENT', 'BSWMD_FILE_UNREADABLE'],
    ['ODX-Dcm linkage broken: ...', 'ODX_DCM_LINKAGE'],
    ['BSWMD map missing module ...', 'DCM_MODULE_MISSING'],
    ['Container "DcmDspDid" not found ...', 'CONTAINER_NOT_FOUND'],
    ['Patch application failed ...', 'PATCH_FAILED'],
    ['Atomic write failed: ...', 'ATOMIC_WRITE_FAILED'],
    ['Some unexpected message', 'UNKNOWN'],
  ])('regex maps %s to %s', (message, expectedClass) => {
    expect(classifyErrorByRegex(message)).toBe(expectedClass);
  });
});

describe('classifyError backward-compat (v1.32.0 T2) — missing kind', () => {
  it('falls back to regex when kind is absent (pre-v1.32.0 handler payload)', () => {
    // Legacy payload shape — no kind field.
    const legacy = { message: 'ODX-Dcm linkage broken: ...' } as unknown as DcmConfigError;
    expect(classifyError(legacy)).toBe('ODX_DCM_LINKAGE');
  });
});

// ---------------------------------------------------------------------------
// v1.32.0 MINOR T5 — state machine extensions.
//
// Pinned behaviours (T5):
//   1. promptAndOpen() with no active ODX transitions to mode='picking-odx'
//      when the project has a Dcm BSWMD (detected via the T4 parse-based
//      gate). App.tsx renders <DcmConfigPicker/> on top of this state.
//   2. promptAndOpen() with activeDocumentPath ending in .odx skips the
//      picker (`isActiveOdx` shortcut) and calls open() directly.
//   3. open() (the underlying IPC entry) autofills bswmdPath from
//      bswmdHasDcm.dcmBswmdPath so the handler doesn't fall through to
//      sample-fixture walk-up.
//   4. handlePickerCancel() returns the launcher's mode to 'idle'.
//      (Folded into 'picking-odx transition' test — single PICKER→IDLE
//      transition assertion guards both facets.)
//
// Stub strategy: window.autosarApi.readBswmd returns a tiny BSWMD ARXML
// blob whose <SHORT-NAME> includes 'Dcm' so T4's parse-based gate
// resolves `hasDcm=true, dcmBswmdPath=<path>`. Tests that don't need
// BSWMD parsing skip the stub and rely on the auto-set bswmdHasDcm state
// shape via `useArxmlStore.setState` to drive `promptAndOpen` into the
// correct branch.
// ---------------------------------------------------------------------------

const DCM_BSWMD_TEMPLATE = (path: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>${path}</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Dcm</SHORT-NAME>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

/**
 * Stub `window.autosarApi.readBswmd` so findDcmBswmd (T4) can resolve
 * the configured paths and set bswmdHasDcm.hasDcm=true on the first
 * path that contains a module <SHORT-NAME>Dcm</SHORT-NAME>. Tests that
 * need a non-Dcm BSWMD should pass `{ hasDcm: false }` to skip the
 * XML payload entirely.
 */
function installReadBswmdStub(opts: { readonly pathToInclude: string }): void {
  const api = (
    window as unknown as {
      autosarApi: {
        dcmConfig: typeof invokeMock;
        readBswmd: (req: { path: string }) => Promise<{
          ok: boolean;
          value?: { content: string };
          error?: { kind: string; message: string };
        }>;
      };
    }
  ).autosarApi;
  api.readBswmd = async (req) => {
    if (req.path === opts.pathToInclude) {
      return { ok: true, value: { content: DCM_BSWMD_TEMPLATE('DcmModule') } };
    }
    return { ok: true, value: { content: DCM_BSWMD_TEMPLATE('OtherModule') } };
  };
}

const dcmBswmdPath = '/proj/bswmd/Dcm_v2.arxml';

beforeEach(() => {
  // Reset the store to a clean slate so each T5 test can seed its
  // own project/activeDocumentPath without leaking into siblings.
  useArxmlStore.setState({
    project: null,
    activeDocumentPath: null,
  } as never);
});

describe('useDcmConfigLauncher (v1.32.0 T5) — state machine extensions', () => {
  it('promptAndOpen transitions to picking-odx when no active ODX and project has Dcm BSWMD', async () => {
    // Seed: project has Dcm BSWMD path; activeDocumentPath is undefined
    // so the isActiveOdx shortcut does NOT fire.
    useArxmlStore.setState({
      project: { bswmdPaths: [dcmBswmdPath] } as never,
      activeDocumentPath: null,
    });
    // Stub readBswmd so the T4 parse gate resolves to hasDcm=true.
    installReadBswmdStub({ pathToInclude: dcmBswmdPath });
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
    // Wait for the parse-based bswmdHasDcm gate to resolve hasDcm=true
    // before invoking promptAndOpen — the gate is async (T4 reads via
    // IPC), and promptAndOpen is a no-op when hasDcm=false.
    await waitFor(() => expect(result.current.bswmdHasDcm.hasDcm).toBe(true));
    await act(async () => {
      await result.current.promptAndOpen();
    });

    expect(result.current.state.mode).toBe('picking-odx');
    // The hook should NOT have advanced to pending (no user-driven ODX
    // resolve has happened yet).
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('promptAndOpen skips picker when activeDocumentPath ends with .odx (isActiveOdx shortcut)', async () => {
    // Seed: project has Dcm BSWMD AND an active .odx document.
    const odxPath = '/proj/input/DcmData.odx';
    useArxmlStore.setState({
      project: { bswmdPaths: [dcmBswmdPath] } as never,
      activeDocumentPath: odxPath,
    });
    installReadBswmdStub({ pathToInclude: dcmBswmdPath });
    invokeMock.mockResolvedValue({
      ok: true,
      value: {
        dcmConfigXml: '',
        odxLinkedDcmDspCount: 1,
        odxLinkedRoutineCount: 0,
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
    });

    const { result } = renderHook(() => useDcmConfigLauncher());
    await waitFor(() => expect(result.current.bswmdHasDcm.hasDcm).toBe(true));
    await act(async () => {
      await result.current.promptAndOpen();
    });

    // Picker bypassed → state goes straight to pending, then to
    // success (NOT through picking-odx).
    expect(result.current.state.mode).toBe('success');
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('autofills bswmdPath from bswmdHasDcm.dcmBswmdPath into dcmConfig IPC args', async () => {
    // Seed: project has Dcm BSWMD and active .odx (so the shortcut
    // path fires and we can inspect the IPC arg shape directly).
    const odxPath = '/proj/input/DcmData.odx';
    useArxmlStore.setState({
      project: { bswmdPaths: [dcmBswmdPath] } as never,
      activeDocumentPath: odxPath,
    });
    installReadBswmdStub({ pathToInclude: dcmBswmdPath });
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
    await waitFor(() => expect(result.current.bswmdHasDcm.hasDcm).toBe(true));
    await act(async () => {
      await result.current.promptAndOpen();
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const call = invokeMock.mock.calls[0]![0] as {
      odxPath: string;
      xlsxRows: unknown[];
      bswmdPath?: string;
    };
    // Autofill: the open() invocation pipes bswmdHasDcm.dcmBswmdPath
    // into the dcmConfig IPC payload so the handler skips its
    // sample-fixture walk-up fallback.
    expect(call.odxPath).toBe(odxPath);
    expect(call.bswmdPath).toBe(dcmBswmdPath);
  });

  // v1.32.0 MINOR T5 fix — reviewer flagged that handlePickerCancel
  // dropped the cancel silently (no status message). Brief Step 5.1
  // listed 4 tests; this is the 4th — guards the cancel→idle +
  // statusMessage i18n key contract end-to-end.
  it('handlePickerCancel returns to idle and surfaces cancelled status toast key', async () => {
    // Seed: project has Dcm BSWMD, no active .odx, so promptAndOpen
    // routes to the picker substate (mode='picking-odx'). Then we
    // invoke handlePickerCancel and assert the brief's contract:
    //   - mode returns to 'idle'
    //   - statusMessage carries the i18n key 'dcmConfig.picker.cancelled'
    //     so App.tsx can render a localized toast (T7 ships the key).
    useArxmlStore.setState({
      project: { bswmdPaths: [dcmBswmdPath] } as never,
      activeDocumentPath: null,
    });
    installReadBswmdStub({ pathToInclude: dcmBswmdPath });
    // promptAndOpen does NOT call dcmConfig when entering picker, so
    // we still stub invokeMock for safety (cancel path must be a no-op
    // for the IPC).
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
    await waitFor(() => expect(result.current.bswmdHasDcm.hasDcm).toBe(true));
    await act(async () => {
      await result.current.promptAndOpen();
    });
    // We are now in the picker substate.
    expect(result.current.state.mode).toBe('picking-odx');

    act(() => {
      result.current.handlePickerCancel();
    });

    // Brief Step 5.1 contract: cancel returns to idle + surfaces the
    // cancelled-toast i18n key (App.tsx renders the localized toast).
    expect(result.current.state.mode).toBe('idle');
    expect(result.current.state.statusMessage).toBe('dcmConfig.picker.cancelled');
    // Cancel must NOT have fired the IPC.
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
