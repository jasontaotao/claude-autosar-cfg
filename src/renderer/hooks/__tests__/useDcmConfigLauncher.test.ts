// @vitest-environment jsdom
//
// useDcmConfigLauncher — v1.31.0 PATCH T3 + v1.32.0 MINOR T2 + T5 +
// v1.33.0 MINOR T4.
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
//
// v1.33.0 MINOR T4 additions:
//   8. classifyError returns UNKNOWN defensively when kind is absent
//      (typed-cast anomaly only; legacy regex fallback removed because
//      1-release compat window per v1.32.0 spec §5 has expired).

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DCM_MODULE_SHORT_NAME } from '../../../core/bridge/dcmConstants.js';
import type { DcmConfigError, DcmConfigErrorKind } from '../../../shared/types.js';
import { arxmlModuleShortNames } from '../../arxml/arxmlModuleShortNames.js';
import type { XlsxImportRecord } from '../../store/slices/xlsxImportSlice.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';
import {
  classifyError,
  useDcmConfigLauncher,
  type RendererDcmConfigErrorClass,
} from '../useDcmConfigLauncher.js';

// v1.36.0 MINOR T5 — mock confirmDestructive so the launcher's gate
// can be tested without mounting <ConfirmRoot2 />. Hoisted by vitest
// to the top of the file before the useDcmConfigLauncher import so
// the hook sees the mocked module at module-evaluation time.
// Lesson: vi-mock-hoists-doMock-does-not — vi.doMock is module-level
// + runtime; vitest hoists only vi.mock. For cross-file mocks in a
// hook-under-test scenario, prefer vi.mock at file top.
// Lesson: vi-mock-factory-cannot-reference-top-level-consts —
// vi.mock factory bodies run before module-level consts initialize
// (the call is hoisted). Use vi.hoisted() to lift the mock fn
// declaration above the factory.
const { confirmDestructiveMock } = vi.hoisted(() => ({
  confirmDestructiveMock: vi.fn(),
}));
vi.mock('../../components/ConfirmDialog2.js', () => ({
  confirmDestructive: confirmDestructiveMock,
}));

// v1.33.1 PATCH T2 — handleGenerateNew + lastOdxPath wiring.
//
// Fixture content: a tiny BSWMD ARXML carrying only the modules we
// need to sanity-check via arxmlModuleShortNames + DCM_MODULE_SHORT_NAME.
// Used in describe block below.
const DCM_BSWMD_CONTENT = `<AR-PACKAGES><AR-PACKAGE><ELEMENTS><ECUC-MODULE-DEF><SHORT-NAME>${DCM_MODULE_SHORT_NAME}</SHORT-NAME></ECUC-MODULE-DEF></ELEMENTS></AR-PACKAGE></AR-PACKAGES>`;
const NON_DCM_BSWMD_CONTENT =
  '<AR-PACKAGES><AR-PACKAGE><ELEMENTS><ECUC-MODULE-DEF><SHORT-NAME>CanIf</SHORT-NAME></ECUC-MODULE-DEF></ELEMENTS></AR-PACKAGE></AR-PACKAGES>';

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
      // v1.33.0 MINOR T4 — payloads now carry `kind`; legacy regex fallback removed.
      error: { kind: 'bswmd-unreadable', message: 'BSWMD file unreadable: ENOENT: no such file' },
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

  // v1.35.0 MINOR T5 — 9 rows (was 6). 4 NEW kinds each map to
  // their dedicated class (no NEW_CLASS_TO_OLD_KEY collapse).
  it.each([
    [{ kind: 'bswmd-unreadable', message: 'BSWMD file unreadable: x' }, 'bswmdUnreadable'],
    [{ kind: 'odx-unreadable', message: 'ODX file unreadable: x' }, 'odxUnreadable'],
    [{ kind: 'odx-parse-failed', message: 'ODX parse failed: x' }, 'odxParseFailed'],
    [{ kind: 'odx-dcm-linkage', message: 'ODX-Dcm linkage broken' }, 'odxDcmLinkage'],
    [{ kind: 'dcm-module-missing', message: "BSWMD map missing module 'Dcm'" }, 'dcmModuleMissing'],
    [
      { kind: 'container-not-found', message: 'Container X not found in BSWMD' },
      'containerNotFound',
    ],
    [{ kind: 'patch-failed', message: 'Patch step 3 of 5 failed' }, 'patchFailed'],
    [{ kind: 'atomic-write-failed', message: 'Atomic write failed: x' }, 'atomicWriteFailed'],
    [{ kind: 'unknown', message: 'Some unknown error' }, 'unexpected'],
  ] as const)(
    'classifyError maps kind=%s to class=%s (v1.35.0 MINOR T5)',
    async (errorPayload, expected) => {
      const { result } = renderHook(() => useDcmConfigLauncher());
      // classifyError returns the toast class directly (no toToastClassKey
      // adapter). Same path as v1.33.0 T4 but the column 'expected' is now
      // 9-value camelCase.
      invokeMock.mockResolvedValue({ ok: false, error: errorPayload });
      await act(async () => {
        await result.current.open({ odxPath: '/x.odx', xlsxRows: [] });
      });
      expect(result.current.state.error?.classKey).toBe(expected);
    },
  );

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

// v1.32.0 MINOR T2 — classifyError reads kind FIRST.
// v1.35.0 MINOR T3 — values updated to camelCase RendererDcmConfigErrorClass
// (post-collapse deletion). The 9-row mapping is identical in semantics to
// the v1.32.0-v1.33.0 SCREAMING_SNAKE test, just modernized to the new
// post-collapse naming. Same kind-first contract.
describe('classifyError (v1.32.0 T2) — kind-first', () => {
  it.each<[DcmConfigErrorKind, RendererDcmConfigErrorClass]>([
    ['odx-unreadable', 'odxUnreadable'],
    ['odx-parse-failed', 'odxParseFailed'],
    ['bswmd-unreadable', 'bswmdUnreadable'],
    ['odx-dcm-linkage', 'odxDcmLinkage'],
    ['dcm-module-missing', 'dcmModuleMissing'],
    ['container-not-found', 'containerNotFound'],
    ['patch-failed', 'patchFailed'],
    ['atomic-write-failed', 'atomicWriteFailed'],
    ['unknown', 'unexpected'],
  ])('maps kind=%s to class=%s', (kind, expectedClass) => {
    const error: DcmConfigError = { kind, message: 'irrelevant' };
    expect(classifyError(error)).toBe(expectedClass);
  });
});

// v1.33.0 MINOR T4 — defensive fallback when kind discriminator is absent.
// v1.35.0 MINOR T3 — return value updated to camelCase ('unexpected'
// instead of 'UNKNOWN'). Same defensive-no-op semantics: legacy typed-cast
// payloads should never occur in v1.32.0+ production.
describe('classifyError defensive fallback (v1.33.0 T4)', () => {
  it('returns unexpected when kind is absent (defensive — should never happen in v1.32.0+ payloads)', () => {
    const legacy = { message: '...' } as unknown as DcmConfigError;
    expect(classifyError(legacy)).toBe('unexpected');
  });
});

// ---------------------------------------------------------------------------
// v1.33.0 MINOR T5 — xlsxRows wiring.
//
// Pinned behaviours (v1.33.0 T5):
//   1. handlePickerResolve sources xlsxRows from xlsxLastImport.rows
//      (NOT from `[]` placeholder). When the store has a record,
//      invokeMock receives XLSX_RECORD.rows verbatim.
//
// v1.33.1 PATCH — handleOverridePick/handleOverrideClear coverage
// removed (overrides deleted at the hook layer in T1).
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

  // v1.43.0 MINOR — wire `bswmdPaths` (project-manifest BSWMD list)
  // into the dcmConfig IPC payload. The handler scans the array
  // for `Bsw_Dcm_Bswmd.arxml` (case-insensitive basename) and
  // resolves the Dcm BSWMD via manifest when present. Falls
  // through to walk-up if no entry matches.
  it('v1.43.0 — forwards bswmdPaths from project manifest to the dcmConfig IPC payload', async () => {
    const odxPath = '/x.odx';
    const manifestDcmPath = '/path/from/manifest/Bsw_Dcm_Bswmd.arxml';
    useArxmlStore.setState({
      project: { bswmdPaths: [manifestDcmPath] } as never,
      activeDocumentPath: null,
    });
    invokeMock.mockResolvedValue({
      ok: true,
      value: {
        dcmConfigXml: '<arxml/>',
        odxLinkedDcmDspCount: 0,
        odxLinkedRoutineCount: 0,
        serviceCounts: {
          DcmClearDTC: 0,
          DcmReadDTC: 0,
          DcmReadDataById: 0,
          DcmWriteDataById: 0,
          DcmRoutineControl: 0,
        },
        outputPath: '/out/Dcm_Config.arxml',
        appliedStepCount: 0,
      },
    });

    const { result } = renderHook(() => useDcmConfigLauncher());
    await act(async () => {
      await result.current.open({ odxPath, xlsxRows: [] });
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const call = invokeMock.mock.calls[0]![0] as {
      odxPath: string;
      xlsxRows: unknown[];
      bswmdPaths?: readonly string[];
    };
    expect(call.odxPath).toBe(odxPath);
    // The hook must forward the project's bswmdPaths to the IPC
    // payload — without this wire, the handler has no way to
    // resolve the Dcm BSWMD via manifest for real-OEM projects.
    expect(call.bswmdPaths).toEqual([manifestDcmPath]);
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

// ---------------------------------------------------------------------------
// v1.33.0 MINOR T5 — xlsxRows + override wiring (RED — pre-implementation).
//
// These tests pin the contract that:
//   1. promptAndOpen (shortcut path) AND handlePickerResolve source
//      xlsxRows from useArxmlStore.getState().xlsxLastImport?.rows
//      (lesson store-as-source-of-truth-for-async-args). Empty placeholder
//      was the v1.31.x+v1.32.0 debt; v1.33.0 closes it.
//
// v1.33.1 PATCH — override-wiring tests removed (3rd + 4th bullet above).
// The Override UI surface is deleted in T3; handleOverridePick and
// handleOverrideClear no longer exist on the launcher interface.
// ---------------------------------------------------------------------------

const XLSX_RECORD: XlsxImportRecord = {
  rows: [
    {
      sheet: 'DcmReadDataById',
      shortName: 'X',
      params: {},
    } as never,
  ],
  source: 'wizard',
  importedAt: 1000,
};

describe('useDcmConfigLauncher (v1.33.0 T5) — xlsxRows + override wiring', () => {
  beforeEach(() => {
    // Reset the store between v1.33.0 T5 tests so prior seeds don't
    // leak into sibling tests.
    useArxmlStore.setState({
      xlsxLastImport: null,
      project: null,
      activeDocumentPath: null,
    } as never);
  });

  it('sends xlsxRows from xlsxLastImport.rows (not []) when picker resolves', async () => {
    // Seed: xlsxLastImport has a record (T1 wired setXlsxLastImport).
    // Project has a Dcm BSWMD so promptAndOpen enters picking-odx; we
    // then drive the picker→open path via handlePickerResolve.
    useArxmlStore.getState().setXlsxLastImport(XLSX_RECORD);
    useArxmlStore.setState({
      project: { bswmdPaths: [dcmBswmdPath] } as never,
      activeDocumentPath: null,
    } as never);
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
    // Enter picker substate.
    expect(result.current.state.mode).toBe('picking-odx');

    // Drive the picker→open path.
    await act(async () => {
      await result.current.handlePickerResolve('/proj/input/DcmData.odx');
    });

    // Assert: invokeMock was called with xlsxRows === XLSX_RECORD.rows
    // (NOT the [] placeholder). Lesson store-as-source-of-truth-for-async-args:
    // the IPC arg must be sourced from the store, not a hook local.
    expect(invokeMock).toHaveBeenCalledTimes(1);
    const call = invokeMock.mock.calls[0]![0] as {
      odxPath: string;
      xlsxRows: readonly unknown[];
      bswmdPath?: string;
    };
    expect(call.odxPath).toBe('/proj/input/DcmData.odx');
    expect(call.xlsxRows).toBe(XLSX_RECORD.rows);
    expect(call.xlsxRows).not.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// v1.33.1 PATCH T2 — handleGenerateNew + lastOdxPath capture.
//
// Pinned behaviours (T2):
//   1. After a successful open(), state.lastOdxPath captures
//      args.odxPath so the SuccessDialog "Generate New" button
//      (consumes handleGenerateNew in T3) can re-fire dcm:config
//      with the same input.
//   2. handleGenerateNew opens bswmd:pick; on a valid Dcm BSWMD
//      re-fires dcm:config with the captured lastOdxPath (falling
//      back to activeDocumentPath) + new picked bswmdPath.
//   3. handleGenerateNew is a no-op when bswmd:pick returns
//      `canceled` (or a read-failure — folded into canceled).
//   4. handleGenerateNew is a no-op + console.warn when the picked
//      file is not a Dcm BSWMD (arxmlModuleShortNames includes
//      DCM_MODULE_SHORT_NAME sanity check).
//   5. handleGenerateNew is a no-op + console.warn when both
//      lastOdxPath and activeDocumentPath are null/undefined.
// ---------------------------------------------------------------------------

// bswmdPick stub — installed per-test to set the pick outcome.
// Mirrors the DcmConfigOverridePicker fixture pattern.
function installBswmdPickMock(outcome: {
  readonly kind: 'opened';
  readonly path: string;
  readonly content: string;
}): ReturnType<typeof vi.fn>;
function installBswmdPickMock(outcome: { readonly kind: 'canceled' }): ReturnType<typeof vi.fn>;
function installBswmdPickMock(outcome: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue(outcome);
  const api = (
    window as unknown as {
      autosarApi: {
        dcmConfig: typeof invokeMock;
        bswmdPick: ReturnType<typeof vi.fn>;
      };
    }
  ).autosarApi;
  api.bswmdPick = fn;
  return fn;
}

describe('useDcmConfigLauncher (v1.33.1 T2) — handleGenerateNew + lastOdxPath', () => {
  beforeEach(() => {
    // Reset the store between T2 tests so prior seeds don't leak.
    useArxmlStore.setState({
      xlsxLastImport: null,
      project: null,
      activeDocumentPath: null,
    } as never);
  });

  it('lastOdxPath is captured when open() resolves successfully', async () => {
    // Invoke mock returns a success envelope so the open() callback
    // walks the success-path setState that captures lastOdxPath.
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
      await result.current.open({
        odxPath: '/some.odx',
        xlsxRows: [],
        bswmdPath: '/some.bswmd.arxml',
      });
    });

    expect(result.current.state.mode).toBe('success');
    expect(result.current.state.lastOdxPath).toBe('/some.odx');
  });

  it('handleGenerateNew opens bswmd:pick and re-fires dcm:config with new bswmdPath (happy path)', async () => {
    // Seed: capture lastOdxPath via a prior open() success.
    invokeMock.mockResolvedValueOnce({
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
    // Second open() (re-fire) also succeeds.
    invokeMock.mockResolvedValueOnce({
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
        appliedStepCount: 1,
      },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pickMock = installBswmdPickMock({
      kind: 'opened',
      path: '/override.arxml',
      content: DCM_BSWMD_CONTENT,
    });

    const { result } = renderHook(() => useDcmConfigLauncher());
    // Capture lastOdxPath via prior open().
    await act(async () => {
      await result.current.open({
        odxPath: '/some.odx',
        xlsxRows: [],
        bswmdPath: '/autodetected.arxml',
      });
    });
    expect(result.current.state.lastOdxPath).toBe('/some.odx');

    // Reset spy before the action under test (the seed open() path
    // should NOT warn — only handleGenerateNew errors/warns are
    // in scope of this test).
    warn.mockClear();

    // Act: handleGenerateNew. It should open bswmd:pick, validate
    // the picked file is a Dcm BSWMD, then re-fire dcm:config with
    // {odxPath: lastOdxPath, bswmdPath: r.path}.
    await act(async () => {
      await result.current.handleGenerateNew();
    });

    expect(pickMock).toHaveBeenCalledTimes(1);
    // Sanity check on the re-fire IPC payload: same odxPath, picked
    // bswmdPath, xlsxRows sourced from the store (empty fallback
    // here since we cleared xlsxLastImport in beforeEach).
    expect(invokeMock).toHaveBeenCalledTimes(2);
    const secondCall = invokeMock.mock.calls[1]![0] as {
      odxPath: string;
      xlsxRows: readonly unknown[];
      bswmdPath?: string;
    };
    expect(secondCall.odxPath).toBe('/some.odx');
    expect(secondCall.bswmdPath).toBe('/override.arxml');
    expect(Array.isArray(secondCall.xlsxRows)).toBe(true);
    // Happy path: console.warn NOT called.
    expect(warn).not.toHaveBeenCalled();
  });

  it('handleGenerateNew does nothing when bswmd:pick returns canceled', async () => {
    const pickMock = installBswmdPickMock({ kind: 'canceled' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = renderHook(() => useDcmConfigLauncher());
    await act(async () => {
      await result.current.handleGenerateNew();
    });

    expect(pickMock).toHaveBeenCalledTimes(1);
    // Canceled picker → no dcm:config re-fire.
    expect(invokeMock).not.toHaveBeenCalled();
    // Canceled is benign; no warning either.
    expect(warn).not.toHaveBeenCalled();
  });

  it('handleGenerateNew does nothing when picked file is not a Dcm BSWMD', async () => {
    installBswmdPickMock({
      kind: 'opened',
      path: '/not-dcm.arxml',
      content: NON_DCM_BSWMD_CONTENT,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = renderHook(() => useDcmConfigLauncher());
    // Sanity check our fixture (defensive — if the parser contract
    // changes, the test must fail loudly).
    expect(arxmlModuleShortNames(NON_DCM_BSWMD_CONTENT)).not.toContain(DCM_MODULE_SHORT_NAME);

    await act(async () => {
      await result.current.handleGenerateNew();
    });

    // Non-Dcm picked → no dcm:config re-fire.
    expect(invokeMock).not.toHaveBeenCalled();
    // A warn is surfaced with the Dcm BSWMD context (the user gets
    // feedback in the dev console; the UI simply stays on the
    // success dialog for now).
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Dcm BSWMD'));
  });

  it('handleGenerateNew is no-op when lastOdxPath and activeDocumentPath are both null/undefined', async () => {
    // Sanity: ensure both re-fire sources are null/undefined.
    useArxmlStore.setState({
      xlsxLastImport: null,
      project: null,
      activeDocumentPath: null,
    } as never);
    installBswmdPickMock({
      kind: 'opened',
      path: '/override.arxml',
      content: DCM_BSWMD_CONTENT,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = renderHook(() => useDcmConfigLauncher());
    expect(result.current.state.lastOdxPath).toBeNull();

    await act(async () => {
      await result.current.handleGenerateNew();
    });

    // No odxPath → no dcm:config re-fire.
    expect(invokeMock).not.toHaveBeenCalled();
    // Distinct warn string lets the user (and the test) recognise
    // that Generate New was unavailable because nothing was captured.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no lastOdxPath'));
  });
});

// ---------------------------------------------------------------------------
// v1.40.0 MINOR T2 (H3) — handleGenerateNew uses lastOdxPathRef
// (ref-mirror) as the source of truth for the re-fire ODX path,
// not the captured state.lastOdxPath. This test pins the corrected
// behavior: after a successful dcm:config, the captured
// lastOdxPath is still recorded in state (UI affordance), but
// the re-fire uses the *current* activeDocumentPath if the user
// switched docs between success and the next Generate New click.
// ---------------------------------------------------------------------------
describe('useDcmConfigLauncher (v1.40.0 T2 H3) — handleGenerateNew ref-mirror re-fire', () => {
  beforeEach(() => {
    confirmDestructiveMock.mockReset();
    useArxmlStore.setState({
      xlsxLastImport: null,
      project: null,
      activeDocumentPath: null,
    } as never);
  });

  it('re-fire uses current activeDocumentPath (NOT cached state.lastOdxPath) when the user switched docs after success', async () => {
    // Step 1 — Seed: prior open() success captured /old/Odx-A.odx.
    // We seed by running open() against /old/Odx-A.odx (the success
    // branch sets both state.lastOdxPath AND lastOdxPathRef).
    invokeMock.mockResolvedValueOnce({
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
    // Second open() (re-fire) succeeds.
    invokeMock.mockResolvedValueOnce({
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
        appliedStepCount: 1,
      },
    });
    installBswmdPickMock({
      kind: 'opened',
      path: '/new-dcm-bswmd.arxml',
      content: DCM_BSWMD_CONTENT,
    });
    confirmDestructiveMock.mockResolvedValue('confirm' as const);

    const { result } = renderHook(() => useDcmConfigLauncher());

    // Step 2 — Seed activeDocumentPath = /old/Odx-A.odx and capture
    // it as lastOdxPath via a prior open() success.
    useArxmlStore.setState({ activeDocumentPath: '/old/Odx-A.odx' } as never);
    await act(async () => {
      await result.current.open({
        odxPath: '/old/Odx-A.odx',
        xlsxRows: [],
        bswmdPath: '/autodetected.arxml',
      });
    });
    expect(result.current.state.lastOdxPath).toBe('/old/Odx-A.odx');

    // Step 3 — Sanity: the first re-fire uses the active path
    // (activeDocumentPath matches captured lastOdxPath, so the
    // current contract is observable).
    invokeMock.mockClear();
    confirmDestructiveMock.mockClear();
    await act(async () => {
      await result.current.handleGenerateNew();
    });
    const firstRefire = invokeMock.mock.calls[0]![0] as {
      odxPath: string;
    };
    expect(firstRefire.odxPath).toBe('/old/Odx-A.odx');

    // Step 4 — User switches active docs. lastOdxPath (state copy)
    // is NOT cleared (the success path persists). activeDocumentPath
    // is updated to the new doc.
    useArxmlStore.setState({ activeDocumentPath: '/new/Odx-B.odx' } as never);
    // Re-render so the hook rebuilds handleGenerateNew with the new
    // activeDocumentPath in its dep array.
    await act(async () => {
      // No-op await for the re-render; the store update above
      // already triggered a re-render via the activeDocumentPath
      // subscription.
    });
    // Sanity: state.lastOdxPath is still /old/Odx-A.odx (UI mirror
    // preserved), activeDocumentPath is now /new/Odx-B.odx. This
    // is the exact stale-closure scenario H3 fixes.
    expect(result.current.state.lastOdxPath).toBe('/old/Odx-A.odx');

    // Step 5 — Second re-fire. Must use /new/Odx-B.odx (the current
    // active document), NOT /old/Odx-A.odx (the stale state copy).
    invokeMock.mockClear();
    confirmDestructiveMock.mockClear();
    confirmDestructiveMock.mockResolvedValue('confirm' as const);
    await act(async () => {
      await result.current.handleGenerateNew();
    });
    const secondRefire = invokeMock.mock.calls[0]![0] as {
      odxPath: string;
    };
    // v1.40.0 T2 H3 — assertion that pinches the fix.
    expect(secondRefire.odxPath).toBe('/new/Odx-B.odx');
    expect(secondRefire.odxPath).not.toBe('/old/Odx-A.odx');
  });
});

// ---------------------------------------------------------------------------
// v1.36.0 MINOR T5 — handleGenerateNew confirmDestructive gate.
//
// Pinned behaviours (T5):
//   1. When confirmDestructive resolves 'cancel', open() is NOT
//      called — the destructive confirmation gate is enforced.
//   2. When confirmDestructive resolves 'confirm', open() IS called
//      with the freshly-picked bswmdPath.
//
// These tests rely on the file-level vi.mock above (which replaces
// ConfirmDialog2.confirmDestructive with confirmDestructiveMock) so
// the gate can be exercised without mounting <ConfirmRoot2 />.
// Lesson: vi-mock-hoists-doMock-does-not — vi.doMock is module-level
// + runtime; vitest hoists only vi.mock.
// ---------------------------------------------------------------------------
describe('useDcmConfigLauncher (v1.36.0 T5) — handleGenerateNew confirmDestructive gate', () => {
  beforeEach(() => {
    // Reset the mock between T5 tests + clear any seed state.
    confirmDestructiveMock.mockReset();
    useArxmlStore.setState({
      xlsxLastImport: null,
      project: null,
      activeDocumentPath: null,
    } as never);
  });

  it('does not call open() when confirmDestructive returns "cancel"', async () => {
    // Seed: capture lastOdxPath via a prior open() success.
    invokeMock.mockResolvedValueOnce({
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
    installBswmdPickMock({
      kind: 'opened',
      path: '/new-dcm-bswmd.arxml',
      content: DCM_BSWMD_CONTENT,
    });
    // Gate returns 'cancel'.
    confirmDestructiveMock.mockResolvedValue('cancel' as const);

    const { result } = renderHook(() => useDcmConfigLauncher());
    // Capture lastOdxPath via prior open().
    await act(async () => {
      await result.current.open({
        odxPath: '/some.odx',
        xlsxRows: [],
        bswmdPath: '/autodetected.arxml',
      });
    });
    expect(result.current.state.lastOdxPath).toBe('/some.odx');
    // Reset the invokeMock so we can count only the re-fire calls.
    invokeMock.mockClear();

    // Act: handleGenerateNew. The destructive confirm gate returns
    // 'cancel' → no IPC re-fire.
    await act(async () => {
      await result.current.handleGenerateNew();
    });

    // Gate enforced: confirmDestructive called once with title +
    // message; open() (dcmConfig IPC) NOT called.
    expect(confirmDestructiveMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).not.toHaveBeenCalled();
    // lastOdxPath preserved across the cancel path.
    expect(result.current.state.lastOdxPath).toBe('/some.odx');
  });

  it('calls open() with the picked bswmdPath when confirmDestructive returns "confirm"', async () => {
    // Seed: capture lastOdxPath via a prior open() success.
    invokeMock.mockResolvedValueOnce({
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
    // Re-fire (T5 confirm path) succeeds.
    invokeMock.mockResolvedValueOnce({
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
        appliedStepCount: 1,
      },
    });
    installBswmdPickMock({
      kind: 'opened',
      path: '/new-dcm-bswmd.arxml',
      content: DCM_BSWMD_CONTENT,
    });
    // Gate returns 'confirm'.
    confirmDestructiveMock.mockResolvedValue('confirm' as const);

    const { result } = renderHook(() => useDcmConfigLauncher());
    // Capture lastOdxPath via prior open().
    await act(async () => {
      await result.current.open({
        odxPath: '/some.odx',
        xlsxRows: [],
        bswmdPath: '/autodetected.arxml',
      });
    });
    expect(result.current.state.lastOdxPath).toBe('/some.odx');
    invokeMock.mockClear();

    // Act: handleGenerateNew. The destructive confirm gate returns
    // 'confirm' → dcmConfig IPC re-fires with the new bswmdPath.
    await act(async () => {
      await result.current.handleGenerateNew();
    });

    expect(confirmDestructiveMock).toHaveBeenCalledTimes(1);
    // Re-fire IPC invoked once with the picked BSWMD path AND the
    // captured lastOdxPath + the store-derived xlsxRows.
    expect(invokeMock).toHaveBeenCalledTimes(1);
    const call = invokeMock.mock.calls[0]![0] as {
      odxPath: string;
      xlsxRows: readonly unknown[];
      bswmdPath?: string;
    };
    expect(call.odxPath).toBe('/some.odx');
    expect(call.bswmdPath).toBe('/new-dcm-bswmd.arxml');
  });
});
