// v1.36.0 MINOR T1 — xlsxHistoryStorage unit tests.
//
// Mocks app.getPath('userData') to point at a tmp dir; each test gets
// a clean tmp dir so reads/writes are isolated.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'xlsx-history-test-'));

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return tmpDir;
      throw new Error(`unexpected getPath: ${name}`);
    },
  },
}));

// Import AFTER mock setup so the storage module picks up the mocked app.
const { readXlsxHistory, writeXlsxHistory } = await import(
  '../xlsxHistoryStorage.js'
);

beforeEach(() => {
  rmSync(join(tmpDir, 'xlsx-import-history.json'), { force: true });
});

afterEach(() => {
  rmSync(join(tmpDir, 'xlsx-import-history.json'), { force: true });
});

describe('xlsxHistoryStorage', () => {
  const sample = {
    rows: [],
    source: 'wizard' as const,
    importedAt: 1000,
  };

  it('returns [] when the file does not exist (first-run)', () => {
    expect(readXlsxHistory()).toEqual([]);
  });

  it('round-trips a single record', () => {
    writeXlsxHistory(sample);
    expect(readXlsxHistory()).toEqual([sample]);
  });

  it('enforces cap-5 + prepend-first on write', () => {
    for (let i = 0; i < 7; i++) {
      writeXlsxHistory({ ...sample, importedAt: 1000 + i });
    }
    const history = readXlsxHistory();
    expect(history).toHaveLength(5);
    expect(history[0]?.importedAt).toBe(1006);
    expect(history[4]?.importedAt).toBe(1002);
  });

  it('returns [] + console.warn on corrupt JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    writeFileSync(
      join(tmpDir, 'xlsx-import-history.json'),
      'not-valid-json{',
      'utf-8',
    );
    expect(readXlsxHistory()).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('corrupt or unreadable'),
    );
    warn.mockRestore();
  });
});
