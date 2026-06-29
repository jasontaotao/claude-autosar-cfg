// Sprint 14 — `project:writeArxmlBatch` IPC handler tests.
//
// Mirrors the `bswmdRead.test.ts` / `templatesHandler.test.ts` style:
// real temp fs for setup, direct call of the exported handler
// function (not through `ipcMain.handle`), vitest `describe`/`it`
// blocks, and `os.tmpdir()` for isolation.
//
// 5 cases that exercise the discriminated-union response shape and
// the `mkdir -p` semantics:
//   1. happy path: 2 files, both written → `{ kind: 'ok', written: [..] }`
//   2. happy path: deeply nested path that doesn't exist yet →
//      `{ kind: 'ok', written: [..] }` (mkdir -p)
//   3. partial: one file's parent dir is read-only → `{ kind: 'partial', written, failed }`
//   4. all fail: root dir is read-only → `{ kind: 'write-failed', message }`
//   5. empty input: `{ kind: 'ok', written: [] }` (no-op)
//
// Note on Windows file permissions: chmod 0o444 is advisory on Windows
// — the OS still permits writes from the owner. We use a directory
// that we KNOW can't be written to (a non-existent path whose
// missing parent is also non-existent, OR a file used as a parent
// directory — `fs.mkdir` will fail with ENOTDIR/EEXIST). The simplest
// cross-platform failure injection is to point one of the files at a
// path whose parent is an existing regular file (not a directory).
// `fs.mkdir` will refuse that with ENOTDIR/ENOENT reliably on both
// Linux and Windows.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  setOpenProjectManifestPath,
  __resetOpenProjectManifestPathForTests,
} from '../project-manifest-state.js';
import { projectWriteArxmlBatchHandler } from '../projectWriteArxmlBatchHandler.js';

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'claude-autosarcfg-write-batch-'));
  // v1.15.5 — the handler enforces containment against the open
  // project's manifest directory. Seed with `workDir/manifest.json`.
  writeFileSync(join(workDir, 'manifest.json'), '{}', 'utf-8');
  setOpenProjectManifestPath(join(workDir, 'manifest.json'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
  __resetOpenProjectManifestPathForTests();
});

describe('project:writeArxmlBatch handler (Sprint 14 T6)', () => {
  it('writes all files successfully when input is a valid batch', async () => {
    const fileA = join(workDir, 'A.ecuc.arxml');
    const fileB = join(workDir, 'subdir', 'B.ecuc.arxml');
    mkdirSync(join(workDir, 'subdir'), { recursive: true });

    const r = await projectWriteArxmlBatchHandler({
      files: [
        { filePath: fileA, content: '<A/>' },
        { filePath: fileB, content: '<B/>' },
      ],
    });

    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') throw new Error('unreachable');
    expect(r.written.length).toBe(2);
    expect(r.written).toContain(fileA);
    expect(r.written).toContain(fileB);
    expect(readFileSync(fileA, 'utf-8')).toBe('<A/>');
    expect(readFileSync(fileB, 'utf-8')).toBe('<B/>');
  });

  it('creates missing parent directories (mkdir -p)', async () => {
    // Deeply nested path that doesn't exist yet. The handler should
    // create the intermediate dirs without the caller having to
    // mkdir -p first — that's the whole point of this handler vs.
    // a plain fs.writeFile call.
    const deep = join(workDir, 'a', 'b', 'c', 'd', 'deep.ecuc.arxml');

    const r = await projectWriteArxmlBatchHandler({
      files: [{ filePath: deep, content: '<deep/>' }],
    });

    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') throw new Error('unreachable');
    expect(r.written).toEqual([deep]);
    expect(existsSync(deep)).toBe(true);
    expect(readFileSync(deep, 'utf-8')).toBe('<deep/>');
  });

  it('returns partial result when some files fail', async () => {
    const goodFile = join(workDir, 'good.ecuc.arxml');
    // Bad parent: an existing regular file, not a directory. mkdir
    // fails reliably on both POSIX (ENOTDIR) and Windows (ENOENT /
    // EEXIST) when the parent path component is a regular file. This
    // is the cleanest cross-platform way to force a write failure
    // without relying on chmod (which is advisory on Windows).
    const blockingFile = join(workDir, 'blocker');
    writeFileSync(blockingFile, 'I am a file, not a directory');
    const badFile = join(blockingFile, 'cannot-create', 'bad.ecuc.arxml');

    const r = await projectWriteArxmlBatchHandler({
      files: [
        { filePath: goodFile, content: '<good/>' },
        { filePath: badFile, content: '<bad/>' },
      ],
    });

    expect(r.kind).toBe('partial');
    if (r.kind !== 'partial') throw new Error('unreachable');
    expect(r.written).toEqual([goodFile]);
    expect(r.failed.length).toBe(1);
    expect(r.failed[0]?.filePath).toBe(badFile);
    expect(r.failed[0]?.message.length).toBeGreaterThan(0);
    // Good file should exist on disk
    expect(readFileSync(goodFile, 'utf-8')).toBe('<good/>');
  });

  it('returns write-failed when all files fail', async () => {
    // All three paths share the same blocking-file parent — every
    // write must fail, so the handler should collapse to
    // `write-failed` (not `partial`).
    const blocker = join(workDir, 'blocker');
    writeFileSync(blocker, 'I am a file');
    const fail1 = join(blocker, 'no', 'fail1.ecuc.arxml');
    const fail2 = join(blocker, 'no', 'fail2.ecuc.arxml');

    const r = await projectWriteArxmlBatchHandler({
      files: [
        { filePath: fail1, content: '<f1/>' },
        { filePath: fail2, content: '<f2/>' },
      ],
    });

    expect(r.kind).toBe('write-failed');
    if (r.kind !== 'write-failed') throw new Error('unreachable');
    expect(r.message.length).toBeGreaterThan(0);
  });

  it('handles empty files array gracefully', async () => {
    const r = await projectWriteArxmlBatchHandler({ files: [] });
    expect(r).toEqual({ kind: 'ok', written: [] });
  });
});
