// v1.33.0 MINOR T1 — xlsxImportSlice state + actions.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EcucInstanceRow } from '../../../shared/types.js';
import { useArxmlStore } from '../useArxmlStore.js';
import type { XlsxImportRecord } from '../slices/xlsxImportSlice.js';

const SAMPLE_ROWS: readonly EcucInstanceRow[] = [
  { sheet: 'ComIPdu', shortName: 'ComIPdu_Vbatt', params: { length: 8 } },
];

describe('xlsxImportSlice (v1.33.0 T1)', () => {
  beforeEach(() => {
    useArxmlStore.setState({
      xlsxLastImport: null,
      xlsxImportHistory: [],
    });
  });

  it('default state: xlsxLastImport null, xlsxImportHistory empty', () => {
    const s = useArxmlStore.getState();
    expect(s.xlsxLastImport).toBeNull();
    expect(s.xlsxImportHistory).toEqual([]);
  });

  it('setXlsxLastImport(record) populates lastImport and prepends to history', () => {
    useArxmlStore.getState().setXlsxLastImport({
      rows: SAMPLE_ROWS,
      source: 'wizard',
      importedAt: 1000,
    });
    const s = useArxmlStore.getState();
    expect(s.xlsxLastImport).toEqual({
      rows: SAMPLE_ROWS,
      source: 'wizard',
      importedAt: 1000,
    });
    expect(s.xlsxImportHistory).toHaveLength(1);
    expect(s.xlsxImportHistory[0]).toEqual(s.xlsxLastImport);
  });

  it('setXlsxLastImport(null) clears both', () => {
    useArxmlStore.getState().setXlsxLastImport({
      rows: SAMPLE_ROWS,
      source: 'wizard',
      importedAt: 1000,
    });
    useArxmlStore.getState().setXlsxLastImport(null);
    const s = useArxmlStore.getState();
    expect(s.xlsxLastImport).toBeNull();
    expect(s.xlsxImportHistory).toEqual([]);
  });

  it('history caps at 5 entries (older entries dropped)', () => {
    for (let i = 0; i < 7; i += 1) {
      useArxmlStore.getState().setXlsxLastImport({
        rows: SAMPLE_ROWS,
        source: 'manual',
        importedAt: 1000 + i,
      });
    }
    expect(useArxmlStore.getState().xlsxImportHistory).toHaveLength(5);
    // Most recent first.
    expect(useArxmlStore.getState().xlsxImportHistory[0]?.importedAt).toBe(1006);
  });

  it('history reflects insertion order (most recent first)', () => {
    useArxmlStore.getState().setXlsxLastImport({
      rows: SAMPLE_ROWS,
      source: 'wizard',
      importedAt: 1,
    });
    useArxmlStore.getState().setXlsxLastImport({
      rows: SAMPLE_ROWS,
      source: 'manual',
      importedAt: 2,
    });
    const h = useArxmlStore.getState().xlsxImportHistory;
    expect(h[0]?.importedAt).toBe(2);
    expect(h[1]?.importedAt).toBe(1);
  });
});

// v1.34.0 MINOR T1 — reuseFromHistory action.
const HISTORY_A: XlsxImportRecord = {
  rows: [{ sheet: 'DcmReadDataById', shortName: 'A', params: {} } as never],
  source: 'manual',
  importedAt: 1000,
};
const HISTORY_B: XlsxImportRecord = {
  rows: [{ sheet: 'DcmDspDid', shortName: 'B', params: {} } as never],
  source: 'wizard',
  importedAt: 2000,
};
const HISTORY_C: XlsxImportRecord = {
  rows: [{ sheet: 'DcmRoutine', shortName: 'C', params: {} } as never],
  source: 'wizard',
  importedAt: 3000,
};

describe('reuseFromHistory (v1.34.0 T1)', () => {
  beforeEach(() => {
    useArxmlStore.setState({
      xlsxLastImport: null,
      xlsxImportHistory: [HISTORY_C, HISTORY_B, HISTORY_A], // most-recent first
    });
  });

  it('sets xlsxLastImport to the matching entry when importedAt is found', () => {
    useArxmlStore.getState().reuseFromHistory(2000);
    const s = useArxmlStore.getState();
    expect(s.xlsxLastImport).toEqual(HISTORY_B);
  });

  it('is no-op (with console.warn) when importedAt is not in history', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    useArxmlStore.getState().reuseFromHistory(9999); // not in history
    const s = useArxmlStore.getState();
    expect(s.xlsxLastImport).toBeNull(); // unchanged
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('9999'));
  });

  it('does not mutate xlsxImportHistory (history stays cap-5 + prepend-first invariant)', () => {
    useArxmlStore.getState().reuseFromHistory(2000);
    const s = useArxmlStore.getState();
    expect(s.xlsxImportHistory).toEqual([HISTORY_C, HISTORY_B, HISTORY_A]);
    expect(s.xlsxImportHistory).toHaveLength(3); // unchanged
  });
});
