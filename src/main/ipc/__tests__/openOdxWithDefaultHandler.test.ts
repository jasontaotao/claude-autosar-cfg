// v1.33.0 MINOR T3 — odx:open-with-default IPC handler.
//
// 4 cases pin the handler contract:
//   1. canceled: dialog dismissed → `{ kind: 'canceled' }`
//   2. opened:   user picked a file → `{ kind: 'opened', path, content }`
//   3. defaultPath forwarding: renderer-supplied defaultPath reaches showOpenDialog
//   4. read failure: chosen file unreadable → `{ kind: 'read-failed', message }`
//                                            + dialog.showMessageBox invoked
//
// Mirrors `bswmdPickDialog` (v1.33.0 T2) for the dialog mechanics; the
// IPC envelope is additive (lesson additive-ipc-channels-over-extending-args)
// so the v1.22.0 `odx:open` channel contract is preserved.

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

import { openOdxWithDefaultDialog } from '../openOdxWithDefaultHandler.js';

describe('openOdxWithDefaultDialog (v1.33.0 T3)', () => {
  let workDir: string;
  beforeEach(() => {
    workDir = mkdtempSync(pathResolve(tmpdir(), 'odx-with-default-'));
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
    const r = await openOdxWithDefaultDialog({});
    expect(r).toEqual({ kind: 'canceled' });
  });

  it('returns opened with path + content on success', async () => {
    const odxPath = pathResolve(workDir, 'input.odx');
    writeFileSync(odxPath, '<ODX></ODX>', 'utf-8');
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [odxPath],
    });
    const r = await openOdxWithDefaultDialog({ defaultPath: workDir });
    expect(r.kind).toBe('opened');
    if (r.kind === 'opened') {
      expect(r.path).toBe(odxPath);
      expect(r.content).toBe('<ODX></ODX>');
    }
  });

  it('passes defaultPath to showOpenDialog', async () => {
    showOpenDialog.mockResolvedValueOnce({
      canceled: true,
      filePaths: [],
    });
    await openOdxWithDefaultDialog({ defaultPath: '/some/default/path' });
    expect(showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: '/some/default/path' }),
    );
  });

  it('returns read-failed + shows message on read error', async () => {
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['/nonexistent.odx'],
    });
    showMessageBox.mockResolvedValueOnce({ response: 0 });
    const r = await openOdxWithDefaultDialog({});
    expect(r.kind).toBe('read-failed');
    if (r.kind === 'read-failed') {
      expect(r.message).toContain('ENOENT');
    }
    expect(showMessageBox).toHaveBeenCalled();
  });
});