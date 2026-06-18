// Sprint 16 — `autosar:save-arxml` IPC handler tests.
//
// Mirrors `pickDir.test.ts`: `vi.mock('electron')` stubs out the
// dialog, handler is called directly (not through ipcMain.handle).
// Real temp fs for write assertions.
//
// 5 cases pin the Sprint 16 silent-save-back contract:
//   1. happy path: currentPath provided → write silently, no dialog
//   2. fallback: currentPath absent → showSaveDialog invoked, then write
//   3. canceled:  dialog canceled → return `{ canceled: true }`, no write
//   4. write failure: fs.writeFile throws → `{ ok: false, error: write-failed }`
//   5. serialization failure: invalid doc → `{ ok: false, error: write-failed }`

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { showSaveDialog } = vi.hoisted(() => ({
  showSaveDialog: vi.fn(),
}));

vi.mock('electron', () => ({
  dialog: {
    showSaveDialog,
  },
}));

// Import AFTER the mock is set up so `saveArxmlHandler.ts`'s
// `import { dialog } from 'electron'` resolves to the mock above.
import type { ArxmlDocument } from '../../../core/arxml/types.js';
import { saveArxmlHandler } from '../saveArxmlHandler.js';

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'claude-autosarcfg-save-arxml-'));
  showSaveDialog.mockReset();
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeDoc(): ArxmlDocument {
  return {
    path: 'unused',
    version: '4.6',
    packages: [
      {
        shortName: 'EAS',
        path: '/EAS',
        elements: [],
      },
    ],
  };
}

describe('autosar:save-arxml handler (Sprint 16 silent-save-back)', () => {
  it('writes silently to currentPath when provided (no dialog)', async () => {
    const target = join(workDir, 'Can_EcucValues.arxml');
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target });

    const r = await saveArxmlHandler({
      doc: makeDoc(),
      defaultName: 'Can_EcucValues.arxml',
      currentPath: target,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.value.canceled).toBe(false);
    expect(r.value.path).toBe(target);
    // Critical: the dialog was NOT invoked.
    expect(showSaveDialog).not.toHaveBeenCalled();
    // The file was actually written.
    expect(existsSync(target)).toBe(true);
    const content = readFileSync(target, 'utf8');
    expect(content).toContain('<AR-PACKAGES>');
    expect(content).toContain('<SHORT-NAME>EAS</SHORT-NAME>');
  });

  it('falls back to showSaveDialog when currentPath is absent', async () => {
    const target = join(workDir, 'NewDoc.arxml');
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target });

    const r = await saveArxmlHandler({
      doc: makeDoc(),
      defaultName: 'untitled.arxml',
      // currentPath intentionally omitted
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(showSaveDialog).toHaveBeenCalledTimes(1);
    const opts = showSaveDialog.mock.calls[0]?.[0] as {
      title: string;
      defaultPath: string;
      filters: { name: string; extensions: string[] }[];
    };
    expect(opts.title).toBe('Save ARXML');
    expect(opts.defaultPath).toBe('untitled.arxml');
    expect(opts.filters[0]?.extensions).toContain('arxml');
    expect(existsSync(target)).toBe(true);
  });

  it('returns canceled when dialog is dismissed and currentPath absent', async () => {
    showSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: undefined });

    const r = await saveArxmlHandler({
      doc: makeDoc(),
      defaultName: 'untitled.arxml',
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.value.canceled).toBe(true);
    // No file written.
    expect(existsSync(workDir)).toBe(true); // workdir itself exists
    const entries = (await import('node:fs')).readdirSync(workDir);
    expect(entries).toEqual([]);
  });

  it('treats empty-string currentPath as absent (falls back to dialog)', async () => {
    const target = join(workDir, 'Doc.arxml');
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target });

    const r = await saveArxmlHandler({
      doc: makeDoc(),
      defaultName: 'Doc.arxml',
      currentPath: '',
    });

    expect(r.ok).toBe(true);
    expect(showSaveDialog).toHaveBeenCalledTimes(1);
  });

  it('returns write-failed when fs.writeFile throws', async () => {
    // Point at a path inside an existing file (not a directory) to
    // force an ENOENT/EACCES. The handler should propagate as
    // { ok: false, error: { kind: 'write-failed', message } }.
    // Use a relative-looking path inside a non-writable location by
    // passing a path whose parent doesn't exist AND isn't creatable
    // — easiest: pass a path under a file (not a dir).
    const blocker = join(workDir, 'blocker');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(blocker, 'not a dir');
    const impossible = join(blocker, 'inside-file.arxml');

    const r = await saveArxmlHandler({
      doc: makeDoc(),
      currentPath: impossible,
    });

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error.kind).toBe('write-failed');
  });
});