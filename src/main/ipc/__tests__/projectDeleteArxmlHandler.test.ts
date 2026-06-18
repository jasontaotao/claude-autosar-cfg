// Sprint 14 — `project:deleteArxml` IPC handler tests.
//
// Mirrors the `bswmdRead.test.ts` style: real temp fs for setup,
// direct call of the exported handler function (not through
// `ipcMain.handle`), vitest `describe`/`it` blocks, `os.tmpdir()` for
// isolation.
//
// 3 cases that exercise the discriminated-union response shape:
//   1. happy path: file exists → deleted → `{ kind: 'ok' }`, file gone
//   2. file does not exist → `{ kind: 'not-found' }` (ENOENT, NOT
//      `write-failed` — important for the cascade-delete flow which
//      must be idempotent against a user-deleted value-side file)
//   3. deletion failure → `{ kind: 'write-failed', message }`
//      — easiest cross-platform injection is to point at an
//      existing *directory* instead of a file. `fs.unlink` refuses
//      directories with `EISDIR` on POSIX and `EPERM`/`EACCES` on
//      Windows. Both fall through to `write-failed`.

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { projectDeleteArxmlHandler } from '../projectDeleteArxmlHandler.js';

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'claude-autosarcfg-delete-arxml-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('project:deleteArxml handler (Sprint 14 T6)', () => {
  it('deletes an existing file and returns ok', async () => {
    const p = join(workDir, 'doomed.ecuc.arxml');
    writeFileSync(p, '<doomed/>', 'utf-8');
    expect(existsSync(p)).toBe(true);

    const r = await projectDeleteArxmlHandler({ filePath: p });

    expect(r.kind).toBe('ok');
    expect(existsSync(p)).toBe(false);
  });

  it('returns not-found when the file does not exist', async () => {
    const p = join(workDir, 'never-existed.arxml');
    expect(existsSync(p)).toBe(false);

    const r = await projectDeleteArxmlHandler({ filePath: p });

    // ENOENT is NOT an error for the cascade-delete flow: the user
    // may have already deleted the value-side file manually. The
    // handler collapses ENOENT to `not-found` so the cascade is
    // idempotent and the renderer can show "already gone" rather
    // than a scary "write failed" message.
    expect(r.kind).toBe('not-found');
  });

  it('returns write-failed when the path is a directory (not a file)', async () => {
    // `fs.unlink` refuses directories on POSIX (EISDIR) and Windows
    // (EPERM/EACCES). Both codes are NOT ENOENT, so the handler
    // should fall through to `write-failed` with a non-empty
    // message. Cross-platform — no chmod required (which is
    // advisory on Windows anyway).
    const dir = join(workDir, 'looks-like-a-file-but-is-a-dir');
    mkdirSync(dir);

    const r = await projectDeleteArxmlHandler({ filePath: dir });

    expect(r.kind).toBe('write-failed');
    if (r.kind !== 'write-failed') throw new Error('unreachable');
    expect(r.message.length).toBeGreaterThan(0);
    // The directory should still exist — the handler did not delete
    // it (and could not, given fs.unlink semantics).
    expect(existsSync(dir)).toBe(true);
  });
});