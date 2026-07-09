// v1.21.0 Bug #5 — `dbc:open` IPC handler tests.
//
// 4 cases pin the handler contract:
//   1. canceled: dialog dismissed → `{ kind: 'canceled' }`
//   2. opened:   user picked a file → `{ kind: 'opened', path, content }`
//   3. read failure: chosen file unreadable → `{ kind: 'read-failed' }` + error messagebox
//   4. dialog options: title='Open DBC' + .dbc filter
//
// Mirrors `openOdxHandler.ts` line-for-line (DBC + ODX are both
// read-only diagnostic-format importers, so the dialog mechanics are
// identical). v1.40.0 MINOR T1 (H1) adds a 5th case for the size-cap
// parity test.
//
// Note: this file was created in v1.40.0 MINOR T1; pre-v1.40.0 the
// `openDbcHandler` shipped without a dedicated test file — the IPC
// contract was exercised indirectly via the renderer's `DbcViewer`
// E2E. We add the unit tests now to pin the size-cap wiring.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve as pathResolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { showOpenDialog, showMessageBox } = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
  showMessageBox: vi.fn(),
}));

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog,
    showMessageBox,
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

import { openDbcDialog } from '../openDbcHandler.js';

describe('openDbcDialog (v1.21.0 Bug #5)', () => {
  let workDir: string;
  beforeEach(() => {
    workDir = mkdtempSync(pathResolve(tmpdir(), 'dbc-open-'));
    showOpenDialog.mockReset();
    showMessageBox.mockReset();
  });
  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('returns canceled when dialog canceled', async () => {
    showOpenDialog.mockResolvedValueOnce({
      canceled: true,
      filePaths: [],
    });
    const r = await openDbcDialog();
    expect(r).toEqual({ kind: 'canceled' });
  });

  it('returns opened with path + content on success', async () => {
    const dbcPath = pathResolve(workDir, 'sample.dbc');
    writeFileSync(dbcPath, 'VERSION "x"\n\nNS_ :\n\nBS_:\n\n', 'utf-8');
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [dbcPath],
    });
    const r = await openDbcDialog();
    expect(r.kind).toBe('opened');
    if (r.kind === 'opened') {
      expect(r.path).toBe(dbcPath);
      expect(r.content).toContain('VERSION');
    }
  });

  it('returns read-failed + shows message on read error', async () => {
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['/nonexistent/path.dbc'],
    });
    showMessageBox.mockResolvedValueOnce({ response: 0 });
    const r = await openDbcDialog();
    expect(r.kind).toBe('read-failed');
    if (r.kind === 'read-failed') {
      expect(r.message.length).toBeGreaterThan(0);
    }
    expect(showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  // v1.40.0 MINOR T1 (H1) — parity test: a file that exceeds the
  // 32 MiB cap must surface the `too-large` condition via the existing
  // `read-failed` envelope. Verifies the size-cap helper is wired
  // into this path; without it a multi-GB DBC could OOM main.
  it('returns read-failed when file exceeds the 32 MiB cap (H1)', async () => {
    const hugePath = pathResolve(workDir, 'huge.dbc');
    const ONE_MIB = 1024 * 1024;
    writeFileSync(hugePath, Buffer.alloc(32 * ONE_MIB + 1, 0x20), 'utf-8');
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [hugePath],
    });
    showMessageBox.mockResolvedValueOnce({ response: 0 });
    const r = await openDbcDialog();
    expect(r.kind).toBe('read-failed');
    if (r.kind === 'read-failed') {
      // The helper message includes the path + the size + the cap.
      expect(r.message).toContain(hugePath);
      expect(r.message).toContain('cap');
    }
    expect(showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  it('uses title Open DBC + .dbc filter', async () => {
    showOpenDialog.mockResolvedValueOnce({
      canceled: true,
      filePaths: [],
    });
    await openDbcDialog();
    expect(showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Open DBC',
        filters: expect.arrayContaining([
          expect.objectContaining({ name: 'DBC', extensions: ['dbc'] }),
        ]),
      }),
    );
  });
});
