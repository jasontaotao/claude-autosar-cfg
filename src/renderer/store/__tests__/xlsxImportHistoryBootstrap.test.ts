// @vitest-environment jsdom
//
// v1.36.0 MINOR T3 — attachXlsxHistoryBootstrap unit tests.
//
// Mocks window.autosarApi.xlsxHistoryLoad; verifies that the
// hydrate action is called on success and silently no-ops on failure.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { attachXlsxHistoryBootstrap } from '../xlsxImportHistoryBootstrap.js';
import { useArxmlStore } from '../useArxmlStore.js';

const loadMock = vi.fn();

beforeEach(() => {
  useArxmlStore.setState({
    xlsxLastImport: null,
    xlsxImportHistory: [],
  });
  (
    window as unknown as { autosarApi: { xlsxHistoryLoad: typeof loadMock } }
  ).autosarApi = {
    xlsxHistoryLoad: loadMock,
  };
  loadMock.mockReset();
});

afterEach(() => {
  delete (window as unknown as { autosarApi?: unknown }).autosarApi;
});

describe('attachXlsxHistoryBootstrap', () => {
  it('hydrates xlsxImportHistory on load success', async () => {
    loadMock.mockResolvedValue({
      ok: true,
      value: [{ rows: [], source: 'wizard' as const, importedAt: 1000 }],
    });
    const cleanup = attachXlsxHistoryBootstrap();
    // Wait for the resolved promise chain to flush.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useArxmlStore.getState().xlsxImportHistory).toHaveLength(1);
    cleanup();
  });

  it('console.warns and leaves history empty on load failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    loadMock.mockResolvedValue({
      ok: false,
      error: { kind: 'read-failed', message: 'disk error' },
    });
    const cleanup = attachXlsxHistoryBootstrap();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useArxmlStore.getState().xlsxImportHistory).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('load failed'));
    warn.mockRestore();
    cleanup();
  });

  it('returns a no-op cleanup when the bridge is missing (defensive)', () => {
    delete (window as unknown as { autosarApi?: unknown }).autosarApi;
    const cleanup = attachXlsxHistoryBootstrap();
    // No throw; cleanup is callable
    expect(typeof cleanup).toBe('function');
    cleanup();
  });
});
