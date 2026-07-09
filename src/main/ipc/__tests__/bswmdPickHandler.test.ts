// v1.33.0 MINOR T2 — bswmd:pick IPC handler.
//
// 4 cases pin the handler contract:
//   1. canceled: dialog dismissed → `{ kind: 'canceled' }`
//   2. opened:   user picked a file → `{ kind: 'opened', path, content }`
//   3. read failure: chosen file unreadable → `{ kind: 'canceled' }` + error messagebox
//   4. dialog options: title='Override BSWMD' + .arxml filter
//
// Mirrors `openOdxHandler.ts` discriminated-union shape; the read-failure
// branch collapses to `canceled` (per the IPC v1.33.0 plan) so the
// renderer's picker can show a unified "user-canceled" branch without
// having to distinguish "user dismissed" from "OS read error" — the
// showMessageBox already tells the user the real cause.

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

import { bswmdPickDialog } from '../bswmdPickHandler.js';

describe('bswmdPickDialog (v1.33.0 T2)', () => {
  let workDir: string;
  beforeEach(() => {
    workDir = mkdtempSync(pathResolve(tmpdir(), 'bswmd-pick-'));
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
    const r = await bswmdPickDialog();
    expect(r).toEqual({ kind: 'canceled' });
  });

  it('returns opened with path + content on success', async () => {
    const bswmdPath = pathResolve(workDir, 'Bsw_Dcm_Bswmd.arxml');
    writeFileSync(bswmdPath, '<AR-PACKAGES></AR-PACKAGES>', 'utf-8');
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [bswmdPath],
    });
    const r = await bswmdPickDialog();
    expect(r.kind).toBe('opened');
    if (r.kind === 'opened') {
      expect(r.path).toBe(bswmdPath);
      expect(r.content).toBe('<AR-PACKAGES></AR-PACKAGES>');
    }
  });

  it('returns canceled + shows message on read failure', async () => {
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['/nonexistent/path.arxml'],
    });
    showMessageBox.mockResolvedValueOnce({ response: 0 });
    const r = await bswmdPickDialog();
    expect(r).toEqual({ kind: 'canceled' });
    expect(showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  // v1.40.0 MINOR T1 (H1) — parity test: a file that exceeds the
  // 32 MiB cap must surface the `too-large` condition via the existing
  // `canceled` envelope (per the v1.33.0 MINOR T2 design — the picker
  // collapses all read errors to `canceled`). Verifies the size-cap
  // helper is wired into this path; without it a multi-GB ARXML could
  // OOM main.
  it('returns canceled + shows message when file exceeds the 32 MiB cap (H1)', async () => {
    const hugePath = pathResolve(workDir, 'huge.arxml');
    const ONE_MIB = 1024 * 1024;
    writeFileSync(hugePath, Buffer.alloc(32 * ONE_MIB + 1, 0x20), 'utf-8');
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [hugePath],
    });
    showMessageBox.mockResolvedValueOnce({ response: 0 });
    const r = await bswmdPickDialog();
    expect(r).toEqual({ kind: 'canceled' });
    expect(showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  it('uses title Override BSWMD + .arxml filter', async () => {
    showOpenDialog.mockResolvedValueOnce({
      canceled: true,
      filePaths: [],
    });
    await bswmdPickDialog();
    expect(showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Override BSWMD',
        filters: expect.arrayContaining([
          expect.objectContaining({ name: 'BSWMD', extensions: ['arxml'] }),
        ]),
      }),
    );
  });
});
