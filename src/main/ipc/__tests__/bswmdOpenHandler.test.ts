// v1.53.0 PATCH T1 -- `bswmd:open` IPC handler tests.
//
// 3 cases pin the handler contract:
//   1. canceled: dialog dismissed -> `{ kind: 'canceled' }`
//   2. opened:   user picked a file -> `{ kind: 'ok', path }`
//   3. dialog options: title='Load BSWMD' + .arxml/.xml/* filters
//
// Mirrors the `openDbcHandler.test.ts` pattern but with the BSWMD
// semantics: path-only picker (no read inline), pairs with
// `bswmd:read` which applies the 32 MiB cap + BSWMD shape
// validation. Pre-v1.53.0 the handler shipped as an inline
// `ipcMain.handle(...)` block at `register.ts:429-443` with no
// direct unit test; this file closes that coverage gap.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { showOpenDialog } = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
}));

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog,
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

import { openBswmdDialog } from '../bswmdOpenHandler.js';

describe('openBswmdDialog (v1.53.0 PATCH T1)', () => {
  beforeEach(() => {
    showOpenDialog.mockReset();
  });
  afterEach(() => {
    showOpenDialog.mockReset();
  });

  it('returns canceled when dialog canceled', async () => {
    // Arrange
    showOpenDialog.mockResolvedValueOnce({
      canceled: true,
      filePaths: [],
    });
    // Act
    const r = await openBswmdDialog();
    // Assert
    expect(r).toEqual({ kind: 'canceled' });
  });

  it('returns ok with picked path on success', async () => {
    // Arrange -- mock the dialog to return a synthetic BSWMD path.
    // The handler does NOT read the file (path-only contract), so no
    // fs mock is needed.
    const picked = '/abs/path/to/sample.arxml';
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [picked],
    });
    // Act
    const r = await openBswmdDialog();
    // Assert
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.path).toBe(picked);
    }
  });

  it('treats empty filePaths as canceled (defensive guard)', async () => {
    // Some Electron versions return `canceled: false` with an empty
    // `filePaths` array in edge cases (e.g. dialog dismissed via
    // system menu). The handler MUST treat this as canceled to match
    // the renderer's no-change branch.
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [],
    });
    const r = await openBswmdDialog();
    expect(r).toEqual({ kind: 'canceled' });
  });

  it('uses title "Load BSWMD" + .arxml / .xml / * filters', async () => {
    // Arrange
    showOpenDialog.mockResolvedValueOnce({
      canceled: true,
      filePaths: [],
    });
    // Act
    await openBswmdDialog();
    // Assert -- pins the dialog contract so future filter changes
    // surface in code review rather than as silent renderer drift.
    expect(showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Load BSWMD',
        properties: expect.arrayContaining(['openFile']),
        filters: expect.arrayContaining([
          expect.objectContaining({ name: 'BSWMD', extensions: ['arxml'] }),
          expect.objectContaining({ name: 'XML', extensions: ['xml'] }),
          expect.objectContaining({ name: 'All', extensions: ['*'] }),
        ]),
      }),
    );
  });
});
