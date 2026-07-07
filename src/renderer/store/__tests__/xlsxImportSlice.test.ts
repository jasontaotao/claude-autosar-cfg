// v1.33.0 MINOR T1 — xlsxImportSlice state + actions.
import { beforeEach, describe, expect, it } from 'vitest';
import type { EcucInstanceRow } from '../../../shared/types.js';
import { useArxmlStore } from '../useArxmlStore.js';

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
