// v1.36.0 MINOR T2 — xlsxHistorySaveHandler unit tests.

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainXlsxImportRecord } from '../../xlsxHistoryStorage.js';

vi.mock('../../xlsxHistoryStorage.js', () => ({
  writeXlsxHistory: vi.fn(),
}));

const { writeXlsxHistory } = await import('../../xlsxHistoryStorage.js');
const { xlsxHistorySaveHandler } = await import('../xlsxHistorySaveHandler.js');

afterEach(() => {
  vi.resetAllMocks();
});

describe('xlsxHistorySaveHandler', () => {
  const sample: MainXlsxImportRecord = {
    rows: [],
    source: 'wizard',
    importedAt: 1000,
  };

  it('returns ok when writeXlsxHistory succeeds', () => {
    vi.mocked(writeXlsxHistory).mockReturnValue(undefined);
    const res = xlsxHistorySaveHandler(sample);
    expect(res).toEqual({ ok: true });
    expect(writeXlsxHistory).toHaveBeenCalledWith(sample);
  });

  it('returns ok:false write-failed when writeXlsxHistory throws', () => {
    vi.mocked(writeXlsxHistory).mockImplementation(() => {
      throw new Error('disk full');
    });
    const res = xlsxHistorySaveHandler(sample);
    expect(res).toEqual({
      ok: false,
      error: { kind: 'write-failed', message: 'disk full' },
    });
  });

  it('passes the record through verbatim (no transformation)', () => {
    vi.mocked(writeXlsxHistory).mockReturnValue(undefined);
    const record: MainXlsxImportRecord = {
      rows: [],
      source: 'manual',
      importedAt: 9999,
    };
    xlsxHistorySaveHandler(record);
    expect(writeXlsxHistory).toHaveBeenCalledWith(record);
  });
});
