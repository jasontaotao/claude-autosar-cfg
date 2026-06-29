// Sprint 17 P1 — `bswmd:delete` IPC handler tests.
//
// Mirrors `projectDeleteArxmlHandler.test.ts` style: real temp fs for
// setup, direct call of the exported handler function (not through
// `ipcMain.handle`), vitest `describe`/`it` blocks, `os.tmpdir()` for
// isolation.
//
// 3 cases that exercise the discriminated-union response shape:
//   1. happy path: BSWMD file exists → deleted → `{ kind: 'ok' }`,
//      file gone
//   2. file does not exist → `{ kind: 'not-found' }` (ENOENT, NOT
//      `write-failed` — important for the cascade flow which must be
//      idempotent against a user-deleted BSWMD file)
//   3. deletion failure → `{ kind: 'write-failed', message }` —
//      easiest cross-platform injection is to point at an existing
//      *directory* instead of a file. `fs.unlink` refuses directories
//      with `EISDIR` on POSIX and `EPERM`/`EACCES` on Windows. Both
//      fall through to `write-failed`.
//
// Difference from `projectDeleteArxmlHandler`: this deletes a SCHEMA-
// side file (BSWMD), not a VALUE-side file (ECUC ARXML). Same
// `fs.unlink` semantics, same error envelope shape (the renderer
// code path reuses the `ProjectDeleteArxmlResult` type for parity).

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// TDD RED: this import MUST fail — the handler file does not exist
// yet. The P1.3 GREEN step creates `bswmdDeleteHandler.ts` in
// `src/main/ipc/`. The error message will be a module-resolution
// failure from vitest's import resolver.
import { bswmdDeleteHandler } from '../bswmdDeleteHandler.js';
import {
  setOpenProjectManifestPath,
  __resetOpenProjectManifestPathForTests,
} from '../project-manifest-state.js';

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'claude-autosarcfg-delete-bswmd-'));
  // v1.15.5 — the handler now enforces path-containment, so we must
  // seed the module-level "open project" state with a manifest whose
  // directory is `workDir`.
  writeFileSync(join(workDir, 'manifest.json'), '{}', 'utf-8');
  setOpenProjectManifestPath(join(workDir, 'manifest.json'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
  __resetOpenProjectManifestPathForTests();
});

describe('bswmd:delete handler (Sprint 17 P1)', () => {
  it('deletes an existing BSWMD file and returns ok', async () => {
    // Arrange
    const p = join(workDir, 'doomed.bswmd.arxml');
    writeFileSync(p, '<doomed/>', 'utf-8');
    expect(existsSync(p)).toBe(true);

    // Act
    const r = await bswmdDeleteHandler({ filePath: p });

    // Assert
    expect(r.kind).toBe('ok');
    expect(existsSync(p)).toBe(false);
  });

  it('returns not-found when the file does not exist (ENOENT)', async () => {
    // Arrange
    const p = join(workDir, 'never-existed.bswmd.arxml');
    expect(existsSync(p)).toBe(false);

    // Act
    const r = await bswmdDeleteHandler({ filePath: p });

    // Assert — ENOENT collapses to `not-found` (not `write-failed`)
    // so the cascade flow is idempotent against a user-deleted file.
    // Same rationale as `projectDeleteArxmlHandler.test.ts`.
    expect(r.kind).toBe('not-found');
  });

  it('returns write-failed when the path is a directory (EISDIR/EPERM)', async () => {
    // Arrange
    const dir = join(workDir, 'looks-like-a-file-but-is-a-dir');
    mkdirSync(dir);

    // Act
    const r = await bswmdDeleteHandler({ filePath: dir });

    // Assert
    expect(r.kind).toBe('write-failed');
    if (r.kind !== 'write-failed') throw new Error('unreachable');
    expect(r.message.length).toBeGreaterThan(0);
    // The directory should still exist — `fs.unlink` does not
    // recursively delete, and refused the directory.
    expect(existsSync(dir)).toBe(true);
  });

  it('returns invalid-path when filePath escapes the project directory (v1.15.5)', async () => {
    // v1.15.5 — path-containment enforced. Pick a path outside workDir.
    const outsideDir = mkdtempSync(join(tmpdir(), 'outside-'));
    const outside = join(outsideDir, 'evil.bswmd.arxml');
    writeFileSync(outside, '<evil/>', 'utf-8');

    const r = await bswmdDeleteHandler({ filePath: outside });

    expect(r.kind).toBe('invalid-path');
    if (r.kind !== 'invalid-path') throw new Error('unreachable');
    expect(r.message).toContain('escapes project directory');

    // The outside file must still exist — refusal is pre-unlink.
    expect(existsSync(outside)).toBe(true);

    rmSync(outsideDir, { recursive: true, force: true });
  });
});
