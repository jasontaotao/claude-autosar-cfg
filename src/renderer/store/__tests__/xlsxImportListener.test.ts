// @vitest-environment jsdom
//
// v1.36.1 PATCH T1 — attachXlsxImportListener unit tests.
//
// M1 fix: xlsxImportListener no longer stamps its own Date.now();
// it reads importedAt verbatim from the push payload. Main is the
// single source-of-truth for the timestamp (computed once, threaded
// into both the broadcast payload and the xlsxHistorySave call).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useArxmlStore } from '../useArxmlStore.js';
import { attachXlsxImportListener } from '../xlsxImportListener.js';

type CapturedHandler = (payload: unknown) => void;

const SAMPLE_ROWS = [
  { sheet: 'ComIPdu', shortName: 'ComIPdu_Vbatt', params: { length: 8 } },
] as const;

let captured: CapturedHandler | null = null;
let cleanup: (() => void) | null = null;

beforeEach(() => {
  useArxmlStore.setState({
    xlsxLastImport: null,
    xlsxImportHistory: [],
  });
  captured = null;
  cleanup = null;
  // v1.54.0 PATCH T7 (F-A4-01 closure) — spy on the unsubscribe fn
  // returned by the bridge so unmount-cleanup assertions can verify
  // it was actually invoked (not just thrown away by the caller).
  (
    window as unknown as {
      autosarApi: {
        onXlsxImportComplete: (h: CapturedHandler) => () => void;
      };
    }
  ).autosarApi = {
    onXlsxImportComplete: (h) => {
      captured = h;
      const unsubscribeSpy = vi.fn();
      (
        window as unknown as { __xlsxImportUnsubscribeSpy: ReturnType<typeof vi.fn> }
      ).__xlsxImportUnsubscribeSpy = unsubscribeSpy;
      return unsubscribeSpy;
    },
  };
});

afterEach(() => {
  if (cleanup !== null) {
    cleanup();
  }
  cleanup = null;
  captured = null;
  delete (window as unknown as { autosarApi?: unknown }).autosarApi;
  delete (window as unknown as { __xlsxImportUnsubscribeSpy?: unknown }).__xlsxImportUnsubscribeSpy;
});

describe('attachXlsxImportListener (v1.36.1 PATCH T1 M1)', () => {
  it('returns a no-op cleanup when the bridge is missing (defensive)', () => {
    delete (window as unknown as { autosarApi?: unknown }).autosarApi;
    const fn = attachXlsxImportListener();
    expect(typeof fn).toBe('function');
    fn();
  });

  it('uses payload.importedAt verbatim, not Date.now()', () => {
    // Arrange — pin a deterministic timestamp so we can assert verbatim.
    const FIXED_TS = 1_700_000_000_000;
    const receivedAt = Date.now();
    cleanup = attachXlsxImportListener();
    expect(captured).not.toBeNull();

    // Act — push a payload with FIXED_TS in the SAME session the
    // test started (so we can prove listener didn't re-stamp it).
    captured!({
      rows: [...SAMPLE_ROWS],
      source: 'wizard',
      importedAt: FIXED_TS,
    });

    // Assert — stored record's importedAt is FIXED_TS verbatim.
    const stored = useArxmlStore.getState().xlsxLastImport;
    expect(stored).not.toBeNull();
    expect(stored!.importedAt).toBe(FIXED_TS);
    // And it must NOT equal the ambient timestamp captured before the
    // push (would prove listener re-stamped).
    expect(stored!.importedAt).not.toBe(receivedAt);
  });

  it('forwards rows and source verbatim to setXlsxLastImport', () => {
    cleanup = attachXlsxImportListener();
    expect(captured).not.toBeNull();
    captured!({
      rows: [...SAMPLE_ROWS],
      source: 'manual',
      importedAt: 42,
    });
    const stored = useArxmlStore.getState().xlsxLastImport;
    expect(stored).not.toBeNull();
    expect(stored!.rows).toEqual(SAMPLE_ROWS);
    expect(stored!.source).toBe('manual');
    expect(stored!.importedAt).toBe(42);
  });

  it('console.warns via no-op fallback: bridge missing leaves xlsxLastImport null', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    delete (window as unknown as { autosarApi?: unknown }).autosarApi;
    const fn = attachXlsxImportListener();
    fn();
    // No throw; xlsxLastImport unchanged.
    expect(useArxmlStore.getState().xlsxLastImport).toBeNull();
    warn.mockRestore();
  });

  // v1.54.0 PATCH T7 (F-A4-01 closure) — unmount cleanup path. The
  // bridge returns an unsubscribe fn from `onXlsxImportComplete`. If
  // the listener drops this fn on the floor (forgets to invoke it
  // on cleanup), each React StrictMode double-mount or app re-load
  // leaks a real Electron `ipcRenderer.on(...)` subscription. This
  // test pins that the returned unsubscribe fn is invoked when the
  // caller's cleanup runs.
  it('invokes the bridge unsubscribe fn when the listener cleanup runs', () => {
    cleanup = attachXlsxImportListener();
    const spy = (window as unknown as { __xlsxImportUnsubscribeSpy?: ReturnType<typeof vi.fn> })
      .__xlsxImportUnsubscribeSpy;
    expect(spy).toBeDefined();
    expect(spy!).not.toHaveBeenCalled();
    // The afterEach calls `cleanup()` for us, but we explicitly
    // null it out so the assertion below verifies the EXACT behavior
    // we care about: that cleanup invokes the spy.
    cleanup!();
    cleanup = null;
    expect(spy!).toHaveBeenCalledTimes(1);
  });
});
