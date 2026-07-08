// v1.36.0 MINOR T1 — xlsxHistoryStorage unit tests.
//
// Mocks app.getPath('userData') to point at a tmp dir; each test gets
// a clean tmp dir so reads/writes are isolated.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
const { readXlsxHistory, writeXlsxHistory } = await import('../xlsxHistoryStorage.js');

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

  it('round-trips a single record', async () => {
    await writeXlsxHistory(sample);
    expect(readXlsxHistory()).toEqual([sample]);
  });

  it('enforces cap-5 + prepend-first on write', async () => {
    for (let i = 0; i < 7; i++) {
      await writeXlsxHistory({ ...sample, importedAt: 1000 + i });
    }
    const history = readXlsxHistory();
    expect(history).toHaveLength(5);
    expect(history[0]?.importedAt).toBe(1006);
    expect(history[4]?.importedAt).toBe(1002);
  });

  it('returns [] + console.warn on corrupt JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    writeFileSync(join(tmpDir, 'xlsx-import-history.json'), 'not-valid-json{', 'utf-8');
    expect(readXlsxHistory()).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('corrupt or unreadable'));
    warn.mockRestore();
  });
});

// v1.36.1 PATCH T2 — per-record validation in readXlsxHistory.
// Previously the file was read with Array.isArray + `as` cast; a hand-edited
// or older-version-written file with `{ source: 'wizard' }` (no rows) crashed
// the renderer on record.rows.map(). Now each record passes isMainXlsxImportRecord;
// bad records are dropped with console.warn (matches corrupt-file recovery pattern).
describe('v1.36.1 PATCH T2 — readXlsxHistory per-record validation', () => {
  it('drops a record missing rows and returns the valid prefix', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    writeFileSync(
      join(tmpDir, 'xlsx-import-history.json'),
      JSON.stringify([
        // valid — survives
        { rows: [], source: 'wizard', importedAt: 100 },
        // invalid — missing rows, must be dropped
        { source: 'wizard', importedAt: 200 },
      ]),
      'utf-8',
    );

    const records = readXlsxHistory();

    expect(records).toHaveLength(1);
    expect(records[0]?.importedAt).toBe(100);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('dropping record at index 1'));
    warn.mockRestore();
  });

  it('drops a record with bogus source union, returns [] when all bad', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    writeFileSync(
      join(tmpDir, 'xlsx-import-history.json'),
      JSON.stringify([{ rows: [], source: 'bogus', importedAt: 100 }]),
      'utf-8',
    );

    const records = readXlsxHistory();

    expect(records).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('dropping record at index 0'));
    warn.mockRestore();
  });

  it('drops a record where importedAt is a string, not a number', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    writeFileSync(
      join(tmpDir, 'xlsx-import-history.json'),
      JSON.stringify([{ rows: [], source: 'wizard', importedAt: '1700000000000' }]),
      'utf-8',
    );

    const records = readXlsxHistory();

    expect(records).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('dropping record at index 0'));
    warn.mockRestore();
  });
});
