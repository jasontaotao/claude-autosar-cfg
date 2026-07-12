// v1.50.0 PATCH T2 — IPC handler `odx:open` regression test.
//
// Closes Round-9 audit F-2 HIGH: `src/main/ipc/openOdxHandler.ts`
// (file is wired into `register.ts` at line 76) but had no dedicated
// test file. Sibling `openDbcHandler.test.ts` covers the parallel
// `dbc:open` handler; asymmetry was oversight, not design.
//
// 4 cases pin the contract (mirroring `openDbcHandler.test.ts`):
//   1. canceled: dialog dismissed → `{ kind: 'canceled' }`
//   2. opened:   user picked a valid .odx file → `{ kind: 'opened', path, content }`
//   3. read-failed: chosen file unreadable → `{ kind: 'read-failed', message }` + messagebox
//   4. dialog options: title='Open ODX' + .odx filter

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

import { openOdxDialog } from '../openOdxHandler.js';

describe('openOdxDialog (v1.50.0 PATCH T2 -- Round-9 F-2 closure)', () => {
  let workDir: string;
  beforeEach(() => {
    workDir = mkdtempSync(pathResolve(tmpdir(), 'odx-open-'));
    showOpenDialog.mockReset();
    showMessageBox.mockReset();
  });
  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('returns canceled when dialog is dismissed', async () => {
    showOpenDialog.mockResolvedValueOnce({
      canceled: true,
      filePaths: [],
    });
    const result = await openOdxDialog();
    expect(result).toEqual({ kind: 'canceled' });
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it('returns opened with path + content when file is readable', async () => {
    const filePath = pathResolve(workDir, 'sample.odx');
    writeFileSync(filePath, '<ODX>content</ODX>');
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [filePath],
    });
    const result = await openOdxDialog();
    expect(result.kind).toBe('opened');
    if (result.kind === 'opened') {
      expect(result.path).toBe(filePath);
      expect(result.content).toBe('<ODX>content</ODX>');
    }
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it('returns read-failed + shows messagebox when chosen file is unreadable', async () => {
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [pathResolve(workDir, 'does-not-exist.odx')],
    });
    const result = await openOdxDialog();
    expect(result.kind).toBe('read-failed');
    expect(showMessageBox).toHaveBeenCalledOnce();
    const call = showMessageBox.mock.calls[0]?.[0] as {
      type?: string;
      title?: string;
    };
    expect(call.type).toBe('error');
    expect(call.title).toBe('Failed to read ODX');
  });

  it('dialog options: title="Open ODX" + .odx filter', async () => {
    showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    await openOdxDialog();
    const call = showOpenDialog.mock.calls[0]?.[0] as {
      title?: string;
      filters?: Array<{ name?: string; extensions?: readonly string[] }>;
    };
    expect(call.title).toBe('Open ODX');
    expect(call.filters).toEqual([
      { name: 'ODX', extensions: ['odx'] },
      { name: 'All', extensions: ['*'] },
    ]);
  });
});
