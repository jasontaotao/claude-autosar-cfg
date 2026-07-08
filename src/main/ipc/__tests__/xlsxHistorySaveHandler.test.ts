// v1.36.0 MINOR T2 — xlsxHistorySaveHandler unit tests.
// T-fix HIGH-2: writeXlsxHistory is now async (writeAtomic). Mock
// implementations must return Promise.resolve(undefined).

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

  it('returns ok when writeXlsxHistory succeeds', async () => {
    vi.mocked(writeXlsxHistory).mockResolvedValue(undefined);
    const res = await xlsxHistorySaveHandler(sample);
    expect(res).toEqual({ ok: true });
    expect(writeXlsxHistory).toHaveBeenCalledWith(sample);
  });

  it('returns ok:false write-failed when writeXlsxHistory rejects', async () => {
    vi.mocked(writeXlsxHistory).mockRejectedValue(new Error('disk full'));
    const res = await xlsxHistorySaveHandler(sample);
    expect(res).toEqual({
      ok: false,
      error: { kind: 'write-failed', message: 'disk full' },
    });
  });

  it('passes the record through verbatim (no transformation)', async () => {
    vi.mocked(writeXlsxHistory).mockResolvedValue(undefined);
    const record: MainXlsxImportRecord = {
      rows: [],
      source: 'manual',
      importedAt: 9999,
    };
    await xlsxHistorySaveHandler(record);
    expect(writeXlsxHistory).toHaveBeenCalledWith(record);
  });
});
