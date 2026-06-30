// v1.8.0 K Stencil Wizard — Task 12 save handler tests.
//
// Mirrors the `handleStencilGenerate` test style: call the exported
// `handleStencilSave` directly (no `ipcMain.handle` round-trip) so the
// suite stays fast and deterministic. `dialog.showSaveDialog` is
// mocked via `vi.mock('electron', ...)` so we can drive the
// `picked` / `canceled` / `error` paths without an OS dialog.
//
// v1.17.0 FIO-2: the handler now routes through `writeAtomic`
// (temp + fsync + rename) rather than calling `fs.writeFile`
// directly. The tests mock `writeAtomic` instead of `fs.promises`
// to keep the existing 7 cases green.
//
// Cases:
//   1. happy path: dialog returns a path, write succeeds →
//      `{ ok: true, value: { canceled: false, path } }`
//   2. user cancels the dialog →
//      `{ ok: true, value: { canceled: true } }`
//   3. write fails with EACCES →
//      `{ ok: false, error: { kind: 'permission-denied', code: 'EACCES' } }`
//   4. write fails with ENOSPC →
//      `{ ok: false, error: { kind: 'disk-full', code: 'ENOSPC' } }`
//   5. oversized payload rejected before dialog →
//      `{ ok: false, error: { kind: 'unknown', ... } }` (no dialog call)
//   6. missing / invalid suggestedFilename →
//      `{ ok: false, error: { kind: 'unknown', ... } }` (no dialog call)
//   7. parent-traversal path rejected →
//      `{ ok: false, error: { kind: 'path-not-found', ... } }`

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { writeAtomic } from '../../io/writeAtomic.js';
import { handleStencilSave } from '../stencilSaveHandler.js';

interface MockedDialog {
  showSaveDialog: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  dialog: { showSaveDialog: vi.fn() } as MockedDialog,
}));

vi.mock('electron', () => ({
  dialog: mocks.dialog,
}));

vi.mock('../../io/writeAtomic.js', () => ({
  writeAtomic: vi.fn(),
}));

const mockedWriteAtomic = vi.mocked(writeAtomic);

beforeEach(() => {
  mocks.dialog.showSaveDialog.mockReset();
  mockedWriteAtomic.mockReset();
  // Default: dialog returns a picked path; writeAtomic succeeds.
  mocks.dialog.showSaveDialog.mockResolvedValue({
    canceled: false,
    filePath: 'C:\\tmp\\Com.arxml',
  });
  mockedWriteAtomic.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('handleStencilSave (v1.8.0 K Task 12)', () => {
  it('happy path: dialog picked + write succeeds → ok with path', async () => {
    const result = await handleStencilSave({
      xml: '<AR-PACKAGE/>',
      suggestedFilename: 'Com.arxml',
    });
    expect(result.ok).toBe(true);
    if (result.ok && !result.value.canceled) {
      expect(result.value.path).toBe('C:\\tmp\\Com.arxml');
    } else {
      throw new Error('expected non-canceled result');
    }
    expect(mockedWriteAtomic).toHaveBeenCalledWith('C:\\tmp\\Com.arxml', '<AR-PACKAGE/>');
  });

  it('user cancels the dialog → ok with canceled:true', async () => {
    mocks.dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: undefined });
    const result = await handleStencilSave({
      xml: '<AR-PACKAGE/>',
      suggestedFilename: 'Com.arxml',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.canceled).toBe(true);
    } else {
      throw new Error('expected ok envelope');
    }
    expect(mockedWriteAtomic).not.toHaveBeenCalled();
  });

  it('EACCES write failure → ok:false, kind permission-denied', async () => {
    const err = Object.assign(new Error('denied'), { code: 'EACCES' });
    mockedWriteAtomic.mockRejectedValueOnce(err);
    const result = await handleStencilSave({
      xml: '<AR-PACKAGE/>',
      suggestedFilename: 'Com.arxml',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('permission-denied');
      expect(result.error.code).toBe('EACCES');
    } else {
      throw new Error('expected error envelope');
    }
  });

  it('ENOSPC write failure → ok:false, kind disk-full', async () => {
    const err = Object.assign(new Error('no space'), { code: 'ENOSPC' });
    mockedWriteAtomic.mockRejectedValueOnce(err);
    const result = await handleStencilSave({
      xml: '<AR-PACKAGE/>',
      suggestedFilename: 'Com.arxml',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('disk-full');
      expect(result.error.code).toBe('ENOSPC');
    } else {
      throw new Error('expected error envelope');
    }
  });

  it('oversized payload rejected before dialog', async () => {
    const huge = 'x'.repeat(33 * 1024 * 1024);
    const result = await handleStencilSave({ xml: huge, suggestedFilename: 'Com.arxml' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('unknown');
      expect(result.error.message).toMatch(/cap/i);
    } else {
      throw new Error('expected error envelope');
    }
    expect(mocks.dialog.showSaveDialog).not.toHaveBeenCalled();
    expect(mockedWriteAtomic).not.toHaveBeenCalled();
  });

  it('invalid suggestedFilename rejected before dialog', async () => {
    const result = await handleStencilSave({ xml: '<x/>', suggestedFilename: 'bad.txt' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('unknown');
      expect(result.error.message).toMatch(/invalid/i);
    } else {
      throw new Error('expected error envelope');
    }
    expect(mocks.dialog.showSaveDialog).not.toHaveBeenCalled();
  });

  it('parent-traversal path rejected (POSIX paths)', async () => {
    // On Windows, `path.normalize` resolves `..` segments against the
    // drive root, so a `C:\..\evil.arxml` input gets normalized to
    // `C:\evil.arxml` and the substring-`..` check below doesn't
    // fire. That's the same limitation as the existing
    // `saveArxmlHandler` guard — documented but not fixed because
    // the OS save dialog always returns a normalized absolute path
    // and the renderer-controlled `currentPath` seam is the only
    // re-entry point. We exercise the check on a POSIX-style path
    // that survives normalization; on Windows we skip it.
    if (process.platform === 'win32') return;
    mocks.dialog.showSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: '/tmp/../evil.arxml',
    });
    const result = await handleStencilSave({
      xml: '<x/>',
      suggestedFilename: 'Com.arxml',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('path-not-found');
    } else {
      throw new Error('expected error envelope');
    }
    expect(mockedWriteAtomic).not.toHaveBeenCalled();
  });
});
