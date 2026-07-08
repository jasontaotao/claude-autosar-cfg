// v1.36.0 MINOR T2 — xlsxHistoryLoadHandler unit tests.
//
// Mocks readXlsxHistory (T1) and verifies the IPC envelope shape.

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainXlsxImportRecord } from '../../xlsxHistoryStorage.js';

vi.mock('../../xlsxHistoryStorage.js', () => ({
  readXlsxHistory: vi.fn(),
}));

const { readXlsxHistory } = await import('../../xlsxHistoryStorage.js');
const { xlsxHistoryLoadHandler } = await import('../xlsxHistoryLoadHandler.js');

afterEach(() => {
  vi.resetAllMocks();
});

describe('xlsxHistoryLoadHandler', () => {
  it('returns ok with empty array when no history exists', () => {
    vi.mocked(readXlsxHistory).mockReturnValue([]);
    const res = xlsxHistoryLoadHandler();
    expect(res).toEqual({ ok: true, value: [] });
  });

  it('returns ok with records when history exists', () => {
    const records: MainXlsxImportRecord[] = [
      { rows: [], source: 'wizard', importedAt: 2000 },
      { rows: [], source: 'manual', importedAt: 1000 },
    ];
    vi.mocked(readXlsxHistory).mockReturnValue(records);
    const res = xlsxHistoryLoadHandler();
    expect(res).toEqual({ ok: true, value: records });
  });

  it('returns ok:false read-failed when readXlsxHistory throws', () => {
    vi.mocked(readXlsxHistory).mockImplementation(() => {
      throw new Error('disk error');
    });
    const res = xlsxHistoryLoadHandler();
    expect(res).toEqual({
      ok: false,
      error: { kind: 'read-failed', message: 'disk error' },
    });
  });
});
