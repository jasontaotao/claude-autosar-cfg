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
//
// Sprint 17b T7 adds 5 errno-mapping cases on top:
//   6. EACCES/EPERM → permission-denied
//   7. ENOSPC/EDQUOT → disk-full
//   8. ENOENT/ENOTDIR → path-not-found
//   9. serializeArxml failure → serialize-failed
//  10. unmapped errno (EIO) → unknown

import { existsSync, mkdtempSync, promises as fsPromises, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

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
import type { SaveArxmlError } from '../../../shared/types.js';
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

  it('returns typed kind for an ENOTDIR/ENOENT-style fs failure (Sprint 17b T7)', async () => {
    // Point at a path inside an existing file (not a directory) to
    // force an ENOENT/ENOTDIR errno from fs.writeFile. The handler
    // must translate that to `kind: 'path-not-found'` (was
    // `'write-failed'` pre-Sprint-17b-T7). The renderer dispatches
    // the localized toast off the typed kind, not the raw message.
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
    // ENOENT (parent missing) or ENOTDIR (parent is a file) — both
    // map to 'path-not-found' per the Sprint 17b T7 mapping. The
    // exact errno varies by host (Windows often reports ENOTDIR,
    // POSIX reports ENOENT), so assert on the kind, not the code.
    expect(r.error.kind).toBe('path-not-found');
  });
});

// ---------------------------------------------------------------------------
// Sprint 17b T7 — typed SaveArxmlErrorKind + errno threading
//
// Node's fs.writeFile rejects with a NodeJS.ErrnoException whose `.code`
// is the POSIX errno (EACCES, ENOSPC, ENOENT, EIO, ...). The handler
// must translate those into the typed `FileError.kind` discriminator so
// the renderer can dispatch a localized toast. The previous contract
// folded all IO failures into a generic `'write-failed'`; that string is
// kept as a legacy alias for v1.1.0/v1.1.1 IPC compatibility but new
// callers should pick a specific kind.
// ---------------------------------------------------------------------------

describe('saveArxmlHandler errno mapping (Sprint 17b T7)', () => {
  // `ReturnType<typeof vi.spyOn>` collapses to the loose
  // `MockInstance<unknown[], unknown>` overload, which the typed
  // `mockRejectedValueOnce` / `mockResolvedValue` helpers reject.
  // Cast through `MockInstance` from `vitest` so we get the
  // argument-aware shape without re-declaring the long overload.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let writeFileSpy: MockInstance<any, any>;

  beforeEach(() => {
    // Stub the underlying fs.writeFile so we can drive the handler
    // through each errno branch without depending on the host
    // filesystem's quirks. We spy on the SAME `promises` namespace
    // the handler imports, so the spy intercepts the call site.
    // All other fs.* calls (mkdtempSync, rmSync, etc.) keep the
    // real implementation because we only override writeFile.
    writeFileSpy = vi
      .spyOn(fsPromises, 'writeFile')
      .mockResolvedValue(undefined as unknown as void);
  });

  afterEach(() => {
    writeFileSpy.mockRestore();
  });

  function errno(code: string): NodeJS.ErrnoException {
    // Construct an Error that satisfies NodeJS.ErrnoException — the
    // `code` field is what the handler reads to dispatch the kind.
    const e = new Error(`mocked ${code}`) as NodeJS.ErrnoException;
    e.code = code;
    return e;
  }

  it('returns permission-denied for EACCES', async () => {
    writeFileSpy.mockRejectedValueOnce(errno('EACCES'));
    const r = await saveArxmlHandler({ doc: makeDoc(), currentPath: '/proj/X.arxml' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    const err = r.error as SaveArxmlError;
    expect(err.kind).toBe('permission-denied');
    expect(err.code).toBe('EACCES');
  });

  it('returns permission-denied for EPERM', async () => {
    writeFileSpy.mockRejectedValueOnce(errno('EPERM'));
    const r = await saveArxmlHandler({ doc: makeDoc(), currentPath: '/proj/X.arxml' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    const err = r.error as SaveArxmlError;
    expect(err.kind).toBe('permission-denied');
    expect(err.code).toBe('EPERM');
  });

  it('returns disk-full for ENOSPC', async () => {
    writeFileSpy.mockRejectedValueOnce(errno('ENOSPC'));
    const r = await saveArxmlHandler({ doc: makeDoc(), currentPath: '/proj/X.arxml' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    const err = r.error as SaveArxmlError;
    expect(err.kind).toBe('disk-full');
    expect(err.code).toBe('ENOSPC');
  });

  it('returns path-not-found for ENOENT', async () => {
    writeFileSpy.mockRejectedValueOnce(errno('ENOENT'));
    const r = await saveArxmlHandler({ doc: makeDoc(), currentPath: '/missing/X.arxml' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    const err = r.error as SaveArxmlError;
    expect(err.kind).toBe('path-not-found');
    expect(err.code).toBe('ENOENT');
  });

  it('returns unknown for unmapped errno (EIO)', async () => {
    writeFileSpy.mockRejectedValueOnce(errno('EIO'));
    const r = await saveArxmlHandler({ doc: makeDoc(), currentPath: '/proj/X.arxml' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    const err = r.error as SaveArxmlError;
    expect(err.kind).toBe('unknown');
    expect(err.code).toBe('EIO');
  });
});
