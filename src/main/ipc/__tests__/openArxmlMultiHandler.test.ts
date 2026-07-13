// v1.54.1 PATCH T4 (F-A5-12 closure) -- `arxml:open-multi` IPC
// handler tests.
//
// 4 cases pin the handler contract:
//   1. canceled: dialog dismissed --> `{ kind: 'canceled' }`
//   2. all-opened: all files read successfully --> `{ kind: 'opened', results }`
//   3. all-failed: every file fails to read --> `{ kind: 'read-failed' }`
//   4. partial: some succeed, some fail --> `{ kind: 'partial', opened, failed }`
//
// Mirrors `openDbcHandler.test.ts` style (Round-11 v1.53.0 T1
// pattern). Pre-v1.54.1 the handler shipped as an inline
// `ipcMain.handle(...)` block at `register.ts:217-260` with no
// direct unit test -- Round-11 F-A5-12 deferred + Round-12
// re-verified the deferral was intact. This file closes the gap.

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

import { openArxmlMultiDialog } from '../openArxmlMultiHandler.js';

describe('openArxmlMultiDialog (v1.54.1 PATCH T4)', () => {
  let workDir: string;
  beforeEach(() => {
    workDir = mkdtempSync(pathResolve(tmpdir(), 'arxml-multi-'));
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
    const r = await openArxmlMultiDialog();
    expect(r).toEqual({ kind: 'canceled' });
  });

  it('returns opened with all paths + content when every read succeeds', async () => {
    const aPath = pathResolve(workDir, 'a.arxml');
    const bPath = pathResolve(workDir, 'b.arxml');
    writeFileSync(aPath, '<arxml>A</arxml>', 'utf-8');
    writeFileSync(bPath, '<arxml>B</arxml>', 'utf-8');
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [aPath, bPath],
    });
    const r = await openArxmlMultiDialog();
    expect(r.kind).toBe('opened');
    if (r.kind === 'opened') {
      expect(r.results).toHaveLength(2);
      expect(r.results[0]?.path).toBe(aPath);
      expect(r.results[0]?.content).toContain('<arxml>A');
      expect(r.results[1]?.path).toBe(bPath);
      expect(r.results[1]?.content).toContain('<arxml>B');
    }
  });

  it('returns read-failed when ALL files fail to read', async () => {
    // Two non-existent paths -- both fail readFileWithCap.
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [
        pathResolve(workDir, 'does-not-exist-1.arxml'),
        pathResolve(workDir, 'does-not-exist-2.arxml'),
      ],
    });
    const r = await openArxmlMultiDialog();
    expect(r.kind).toBe('read-failed');
    if (r.kind === 'read-failed') {
      // Message must list BOTH failed paths so the renderer can
      // surface which slot failed.
      expect(r.message).toContain('does-not-exist-1.arxml');
      expect(r.message).toContain('does-not-exist-2.arxml');
    }
  });

  it('returns partial when SOME files succeed and SOME fail', async () => {
    const goodPath = pathResolve(workDir, 'good.arxml');
    writeFileSync(goodPath, '<arxml>OK</arxml>', 'utf-8');
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [goodPath, pathResolve(workDir, 'bad.arxml')],
    });
    const r = await openArxmlMultiDialog();
    expect(r.kind).toBe('partial');
    if (r.kind === 'partial') {
      expect(r.opened).toHaveLength(1);
      expect(r.opened[0]?.path).toBe(goodPath);
      expect(r.failed).toHaveLength(1);
      expect(r.failed[0]?.path).toBe(pathResolve(workDir, 'bad.arxml'));
    }
  });
});
