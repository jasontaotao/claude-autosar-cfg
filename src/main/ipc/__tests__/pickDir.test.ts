// Sprint 12 #3 — `project:pickDir` IPC handler tests.
//
// The handler shape is a discriminated union:
//   - `{ kind: 'picked', dirPath: <string> }` — user picked a directory
//   - `{ kind: 'canceled' }` — user dismissed the dialog
//
// We use `vi.mock('electron')` to stub out `dialog.showOpenDialog` so
// we can drive every branch deterministically (picked, canceled,
// non-directory path, defaultPath passthrough). The handler is
// extracted to `pickDirHandler.ts` (same pattern as
// `bswmdReadHandler.ts` in Sprint 12 #2) so we can import it directly
// under ESM (no `require()` in module-type projects).
//
// The 6 cases that matter for the IPC envelope:
//   1. happy path: user picks a directory → `{ kind: 'picked', dirPath }`
//   2. canceled:   user dismisses     → `{ kind: 'canceled' }`
//   3. canceled=true with stale filePaths still treated as canceled
//   4. defaultPath passed through to `dialog.showOpenDialog` options
//   5. defaultPath omitted → handler forwards `undefined`, OS picks default
//   6. trust-OS contract: a non-directory path is still returned as
//      `picked` verbatim (we don't silently coerce). The dialog was
//      opened with `properties: ['openDirectory']`, so a real OS can
//      never return a file — this guards against a future regression
//      that widens the dialog properties.

import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mock so we can both:
//   - capture the `defaultPath` the handler passes to showOpenDialog
//   - drive the return value of showOpenDialog per test
//
// `vi.hoisted` is required because `vi.mock` factory bodies are
// hoisted to the top of the file before any other code runs, so a
// top-level `const showOpenDialog = vi.fn()` would be `undefined` at
// the time the factory runs. `vi.hoisted` lifts the mock fn to the
// same hoisted scope.
const { showOpenDialog } = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
}));

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: showOpenDialog,
  },
}));

// Import AFTER the mock is set up so `pickDirHandler.ts`'s
// `import { dialog } from 'electron'` resolves to the mock above.
import { pickDirHandler } from '../pickDirHandler.js';

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'claude-autosarcfg-pickdir-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

beforeEach(() => {
  showOpenDialog.mockReset();
});

describe('project:pickDir handler (Sprint 12 #3) — Result envelope shape', () => {
  it('returns picked with dirPath when the user selects a directory', async () => {
    const chosen = join(workDir, 'project-a');
    mkdirSync(chosen);
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [chosen],
    });

    const r = await pickDirHandler({});

    expect(r.kind).toBe('picked');
    if (r.kind !== 'picked') throw new Error('unreachable');
    expect(r.dirPath).toBe(chosen);
    // Sanity: the chosen path actually exists on disk — guards against
    // a future change that fabricates a path instead of returning the
    // OS-supplied one.
    expect(statSync(r.dirPath).isDirectory()).toBe(true);
  });

  it('returns canceled when the user dismisses the dialog', async () => {
    showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });

    const r = await pickDirHandler({});

    expect(r.kind).toBe('canceled');
  });

  it('returns canceled when the dialog reports canceled=true even with filePaths', async () => {
    // Some platforms return both `canceled: true` AND a stale
    // `filePaths: [<last>]` entry. The handler should still treat it
    // as canceled. (Mirrors the bswmd:open handler behavior.)
    const stale = join(workDir, 'stale');
    showOpenDialog.mockResolvedValueOnce({
      canceled: true,
      filePaths: [stale],
    });

    const r = await pickDirHandler({});

    expect(r.kind).toBe('canceled');
  });

  it('forwards defaultPath to dialog.showOpenDialog when provided', async () => {
    const defaultPath = join(workDir, 'starting-point');
    mkdirSync(defaultPath);
    showOpenDialog.mockResolvedValueOnce({
      canceled: true,
      filePaths: [],
    });

    await pickDirHandler({ defaultPath });

    expect(showOpenDialog).toHaveBeenCalledTimes(1);
    const opts = showOpenDialog.mock.calls[0]?.[0] as {
      properties: string[];
      defaultPath: string;
    };
    expect(opts.properties).toContain('openDirectory');
    expect(opts.defaultPath).toBe(defaultPath);
  });

  it('renders the dialog title in zh-CN when locale is "zh-CN" (Sprint 13+ Stage 4 M7)', async () => {
    showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });

    await pickDirHandler({ locale: 'zh-CN' });

    expect(showOpenDialog).toHaveBeenCalledTimes(1);
    const opts = showOpenDialog.mock.calls[0]?.[0] as {
      title: string;
      properties: string[];
    };
    expect(opts.title).toBe('选择项目目录');
    expect(opts.properties).toContain('openDirectory');
  });

  it('renders the dialog title in en when locale is "en" (Sprint 13+ Stage 4 M7)', async () => {
    showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });

    await pickDirHandler({ locale: 'en' });

    expect(showOpenDialog).toHaveBeenCalledTimes(1);
    const opts = showOpenDialog.mock.calls[0]?.[0] as {
      title: string;
      properties: string[];
    };
    expect(opts.title).toBe('Choose Project Directory');
    expect(opts.properties).toContain('openDirectory');
  });

  it('falls back to en title when locale is omitted (Sprint 13+ Stage 4 M7)', async () => {
    showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });

    await pickDirHandler({});

    expect(showOpenDialog).toHaveBeenCalledTimes(1);
    const opts = showOpenDialog.mock.calls[0]?.[0] as { title: string };
    // Backward-compatible default — the original hard-coded English
    // title. Older callers that don't pass `locale` get the same UX
    // they did before Stage 4 M7.
    expect(opts.title).toBe('Choose Project Directory');
  });

  it('still calls dialog.showOpenDialog when defaultPath is omitted (OS picks default)', async () => {
    showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });

    await pickDirHandler({});

    expect(showOpenDialog).toHaveBeenCalledTimes(1);
    const opts = showOpenDialog.mock.calls[0]?.[0] as {
      properties: string[];
      defaultPath?: string;
    };
    expect(opts.properties).toContain('openDirectory');
    // defaultPath is forwarded as-is — if the renderer didn't pass one,
    // we don't synthesize one. Letting the OS decide is the contract
    // documented in the handler.
    expect(opts.defaultPath).toBeUndefined();
  });

  it('returns picked with a directory path even when the path is a file (trust OS property=openDirectory)', async () => {
    // We document this as "OS-trust" behavior: the dialog was opened
    // with `properties: ['openDirectory']`, so on a real OS it cannot
    // return a file. This test guards against accidentally widening
    // the dialog properties in the future — if the handler ever sees
    // a non-directory path, it should still return `picked` with the
    // path verbatim, NOT silently coerce to canceled.
    const filePath = join(workDir, 'looks-like-a-file.arxml');
    writeFileSync(filePath, '<AUTOSAR/>', 'utf8');
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [filePath],
    });

    const r = await pickDirHandler({});

    expect(r.kind).toBe('picked');
    if (r.kind !== 'picked') throw new Error('unreachable');
    expect(r.dirPath).toBe(filePath);
    // Note: we DO NOT validate `statSync(r.dirPath).isDirectory()` here
    // — the trust-OS contract is that we surface what the dialog gave
    // us. A separate test (renderer side) can reject non-directories
    // before calling this IPC; this handler is dialog-only.
  });
});
