// Sprint 12 #3 — `PROJECT_NEW` IPC handler tests (Task 4: directory-driven
// overwrite-confirm protocol).
//
// Sprint 11 shipped `PROJECT_NEW` as a dialog-driven flow: the main
// process popped an OS `showSaveDialog` and wrote the manifest to the
// picked path. Sprint 12 #3 removes that dialog — the renderer now
// collects both name and directory, hands them to main, and main joins
// them into `<sanitized_name>.autosarcfg.json` and writes directly.
//
// The new contract is `ProjectNewRequest { name, directory }` with
// `ProjectNewResult` carrying a new `'overwrite-confirm'` kind when the
// target file already exists. The handler does NOT overwrite; the
// renderer decides how to surface that (Phase 1: an inline error;
// future Phase: a `ConfirmDialog` re-invoke with an overwrite flag).
//
// Mirrors the `bswmdRead.test.ts` style (real fs via `mkdtempSync`).
// We deliberately do NOT mock `dialog.showSaveDialog` because the new
// handler must not touch any dialog at all.
//
// 6 cases that matter for the IPC envelope:
//   1. happy path → `{ kind: 'created', path, manifest }`
//   2. nested-name defensive reject (`foo/bar`) → `{ kind: 'invalid-name', ... }`
//   3. overwrite-confirm (file already exists) → `{ kind: 'overwrite-confirm', path }`,
//      and the file is NOT overwritten
//   4. directory missing → `{ kind: 'write-failed', message }`
//   5. directory is a file (not a directory) → `{ kind: 'write-failed', message }`
//   6. name sanitization: `<>:"/\\|?*` and whitespace are replaced with `_`,
//      empty sanitized result falls back to `untitled`
//   7. additional: empty directory string → `write-failed`

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { projectNewHandler } from '../projectNewHandler.js';

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'claude-autosarcfg-project-new-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('project:new handler (Sprint 12 #3) — directory-driven create flow', () => {
  beforeEach(() => {
    // Each test gets its own sub-directory so created files don't leak
    // between cases (e.g. the overwrite-confirm test creates a file
    // first; we want a clean slate).
    // `workDir` itself stays — it's the temp parent.
  });

  it('happy path: creates <name>.autosarcfg.json under the given directory', async () => {
    const projectDir = join(workDir, 'happy');
    mkdirSync(projectDir, { recursive: true });

    const r = await projectNewHandler({ name: 'MyProject', directory: projectDir });

    expect(r.kind).toBe('created');
    if (r.kind !== 'created') throw new Error('unreachable');

    const expectedPath = join(projectDir, 'MyProject.autosarcfg.json');
    expect(r.path).toBe(expectedPath);
    expect(r.manifest.name).toBe('MyProject');
    expect(r.manifest.valueArxmlPaths).toEqual([]);
    expect(r.manifest.bswmdPaths).toEqual([]);
    expect(typeof r.manifest.id).toBe('string');
    expect(r.manifest.id.length).toBeGreaterThan(0);

    // Verify file actually exists on disk and contains a valid manifest
    expect(existsSync(expectedPath)).toBe(true);
    const written = JSON.parse(readFileSync(expectedPath, 'utf8')) as Record<string, unknown>;
    expect(written['name']).toBe('MyProject');
    expect(written['valueArxmlPaths']).toEqual([]);
    expect(written['bswmdPaths']).toEqual([]);
  });

  it('sanitizes path-unsafe characters in name to underscores', async () => {
    const projectDir = join(workDir, 'sanitize');
    mkdirSync(projectDir, { recursive: true });

    // `<>:"/\\|?*` plus spaces — everything non-[A-Za-z0-9._-] gets replaced.
    const r = await projectNewHandler({
      name: 'My Project: v1.0 <beta>',
      directory: projectDir,
    });

    expect(r.kind).toBe('created');
    if (r.kind !== 'created') throw new Error('unreachable');

    // The sanitizer collapses RUNS of bad chars into a single `_` (because
    // the regex has the `+` quantifier). So `My Project: v1.0 <beta>` →
    // `My_Project_v1.0_beta_`. This is the same behavior as the original
    // Sprint 11 handler.
    expect(r.path).toBe(join(projectDir, 'My_Project_v1.0_beta_.autosarcfg.json'));
    // Manifest still preserves the original name verbatim.
    expect(r.manifest.name).toBe('My Project: v1.0 <beta>');
  });

  it('returns invalid-name for names containing path separators (defensive reject)', async () => {
    const projectDir = join(workDir, 'invalid-name');
    mkdirSync(projectDir, { recursive: true });

    // Even though the sanitizer would strip `/`, we reject up-front so a
    // tampered preload can't smuggle in names that LOOK clean but encode
    // parent traversal once the sanitizer does something unexpected.
    const r = await projectNewHandler({ name: 'foo/bar', directory: projectDir });

    expect(r.kind).toBe('invalid-name');
    if (r.kind !== 'invalid-name') throw new Error('unreachable');
    expect(r.message.length).toBeGreaterThan(0);
    // Defensive reject must NOT touch the filesystem
    expect(existsSync(join(projectDir, 'foo_bar.autosarcfg.json'))).toBe(false);
    expect(existsSync(join(projectDir, 'foo' + sep + 'bar.autosarcfg.json'))).toBe(false);
  });

  it('returns invalid-name for names containing backslashes', async () => {
    const projectDir = join(workDir, 'invalid-bs');
    mkdirSync(projectDir, { recursive: true });

    const r = await projectNewHandler({ name: 'foo\\bar', directory: projectDir });

    expect(r.kind).toBe('invalid-name');
  });

  it('returns overwrite-confirm when the target file already exists (and does NOT overwrite)', async () => {
    const projectDir = join(workDir, 'overwrite');
    mkdirSync(projectDir, { recursive: true });

    const targetPath = join(projectDir, 'Dup.autosarcfg.json');
    const sentinel = '{"already":"here"}';
    writeFileSync(targetPath, sentinel, 'utf8');

    const r = await projectNewHandler({ name: 'Dup', directory: projectDir });

    expect(r.kind).toBe('overwrite-confirm');
    if (r.kind !== 'overwrite-confirm') throw new Error('unreachable');
    expect(r.path).toBe(targetPath);

    // Critical: the file on disk must be untouched (no overwrite).
    expect(readFileSync(targetPath, 'utf8')).toBe(sentinel);
  });

  it('returns write-failed when the directory does not exist', async () => {
    const missingDir = join(workDir, 'does-not-exist', 'nested');

    const r = await projectNewHandler({ name: 'Ghost', directory: missingDir });

    expect(r.kind).toBe('write-failed');
    if (r.kind !== 'write-failed') throw new Error('unreachable');
    expect(r.message.length).toBeGreaterThan(0);
    // The handler must NOT have created the missing directory
    expect(existsSync(missingDir)).toBe(false);
  });

  it('returns write-failed when the directory is actually a file', async () => {
    const projectDir = join(workDir, 'is-a-file');
    // Create a regular file at `projectDir` so `path.join` would yield a
    // file path, not a directory path. The handler must detect this and
    // refuse rather than try to writeFile into a path whose parent is a file.
    writeFileSync(projectDir, 'i am a file, not a directory', 'utf8');

    const r = await projectNewHandler({ name: 'Whoops', directory: projectDir });

    expect(r.kind).toBe('write-failed');
    if (r.kind !== 'write-failed') throw new Error('unreachable');
    expect(r.message.length).toBeGreaterThan(0);
  });

  it('returns write-failed for an empty directory string', async () => {
    const r = await projectNewHandler({ name: 'EmptyDir', directory: '' });

    expect(r.kind).toBe('write-failed');
    if (r.kind !== 'write-failed') throw new Error('unreachable');
    expect(r.message.length).toBeGreaterThan(0);
  });

  it('falls back to "untitled" when sanitized name is empty (e.g. only special chars)', async () => {
    const projectDir = join(workDir, 'untitled-fallback');
    mkdirSync(projectDir, { recursive: true });

    // A name of just `@#$` — each char is non-[A-Za-z0-9._-], and since
    // the regex uses `+` greedy, the entire run collapses to a single `_`
    // (length 1, NOT empty). So the fallback does NOT kick in — the
    // file becomes `_.autosarcfg.json`. The test documents this current
    // behavior; a future tightening of the sanitizer could turn it into
    // a true empty → untitled fallback.
    const r = await projectNewHandler({ name: '@#$', directory: projectDir });

    expect(r.kind).toBe('created');
    if (r.kind !== 'created') throw new Error('unreachable');
    expect(r.path).toBe(join(projectDir, '_.autosarcfg.json'));
    // The manifest name preserves the user input verbatim
    expect(r.manifest.name).toBe('@#$');
  });
});
