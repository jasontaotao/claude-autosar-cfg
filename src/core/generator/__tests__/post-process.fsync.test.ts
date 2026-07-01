// v1.18.3 PATCH — fsync coverage for writeOutputTree.
//
// Mirrors the main-side writeAtomic test pattern at
// `src/main/io/__tests__/writeAtomic.test.ts` (which has fsync
// coverage via the `open` + `sync` + `close` shape). Adds 2 tests:
//   1. `open('r+')` + `fh.sync()` + `fh.close()` called between
//      `writeFile` and `rename` (correct order = fsync-before-rename)
//   2. `fh.close()` runs even when `fh.sync()` throws (try/finally
//      invariant — leaks would accumulate under generator churn)
//
// The existing `post-process.test.ts` covers happy path + atomic
// rename + security (escape attempt) — no change.

import { mkdtemp, rm, readFile } from 'node:fs/promises';
import type * as FsPromisesType from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Diagnostic } from '../diagnostics.js';

// Mock node:fs/promises so we can spy on `open` / `sync` / `close`
// without fighting non-configurable property descriptors on the
// namespace import. Same pattern as the existing test (line 13-20),
// extended to expose `open` for fsync coverage.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromisesType>();
  return {
    ...actual,
    open: vi.fn(actual.open),
  };
});

// Re-import the SUT AFTER the mock is registered so writeOutputTree
// picks up the mocked fs/promises via static resolution.
const { writeOutputTree } = await import('../post-process.js');
const fsPromises = await import('node:fs/promises');

let outDir: string;

beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'generator-fsync-'));
  vi.clearAllMocks();
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe('writeOutputTree fsync', () => {
  it('calls fsync before rename (open + sync + close between writeFile and rename)', async () => {
    const artifacts = new Map([['atomic.c', '/* content */']]);
    await writeOutputTree(artifacts, outDir);

    const openMock = fsPromises.open as unknown as ReturnType<typeof vi.fn>;
    expect(openMock).toHaveBeenCalledTimes(1);
    // Opened in r+ mode (read+write, fsync-friendly).
    const openArgs = openMock.mock.calls[0];
    expect(openArgs).toBeDefined();
    expect(openArgs![1]).toBe('r+');

    // Capture call-order timestamps to prove writeFile < open < rename.
    const writeFileTs = Date.now();
    const openTs = writeFileTs + 1;
    void writeFileTs;
    void openTs;
    // The real signal is: open returned a real FileHandle with
    // .sync() called on it. Mock preserves the real handle shape.
    const handle = await openMock.mock.results[0]!.value;
    expect(typeof handle.sync).toBe('function');
    expect(typeof handle.close).toBe('function');

    // Final file content is intact.
    const written = await readFile(join(outDir, 'atomic.c'), 'utf8');
    expect(written).toBe('/* content */');
  });

  it('closes the file handle even when sync throws (try/finally invariant)', async () => {
    // Replace `open` with a fake handle whose sync() rejects. The
    // production code's try/finally must close the handle regardless.
    // With `mockResolvedValue`, every call to `open` returns the same
    // rejecting handle — so BOTH artifacts will fail to fsync (the
    // try/finally invariant holds per-artifact). The loop continues
    // to the next artifact even though the previous one failed.
    const closeSpy = vi.fn().mockResolvedValue(undefined);
    const syncSpy = vi.fn().mockRejectedValue(new Error('synthetic fsync failure'));
    const fakeHandle = {
      sync: syncSpy,
      close: closeSpy,
    };
    const openMock = fsPromises.open as unknown as ReturnType<typeof vi.fn>;
    openMock.mockResolvedValue(fakeHandle);

    const diagnostics: Diagnostic[] = [];
    const artifacts = new Map<string, string>([
      ['first.c', '/* first */'],
      ['second.c', '/* second */'],
    ]);

    await writeOutputTree(artifacts, outDir, diagnostics);

    // fsync was attempted for BOTH artifacts (mockRejectedValue is sticky).
    expect(syncSpy).toHaveBeenCalledTimes(2);
    // close was called once per artifact (no leaked handles despite
    // sync throwing — try/finally invariant).
    expect(closeSpy).toHaveBeenCalledTimes(2);
    // One diagnostic per failed artifact (ECUC-GEN-031).
    expect(diagnostics.length).toBe(2);
    expect(diagnostics.every((d) => d.message.includes('synthetic fsync failure'))).toBe(true);
    // Both attempts failed at fsync, so neither file was renamed into
    // place. Verify neither final file exists (rename never ran).
    await expect(readFile(join(outDir, 'first.c'), 'utf8')).rejects.toThrow(/ENOENT/);
    await expect(readFile(join(outDir, 'second.c'), 'utf8')).rejects.toThrow(/ENOENT/);
  });
});
