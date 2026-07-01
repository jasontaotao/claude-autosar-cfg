// v1.20.0 MINOR T2 — isPathInsideReal tests.
//
// Symlink defense: the pure-string `isPathInside` returns true for
// `isPathInside('/etc/passwd', '/project')` if `/etc/passwd` happens
// to share a string-prefix with `/project`. More importantly, an
// attacker can place a symlink INSIDE the project dir that points to
// `/etc/passwd`. The string `isPathInside(symlinkPath, projectDir)`
// returns true (the symlink string is inside the project string),
// but the resolved real path (`/etc/passwd`) is OUTSIDE the project.
// `isPathInsideReal` follows symlinks via `realpath` first, then
// delegates to the string compare.

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isPathInsideReal } from '../isPathInsideReal.js';

// Windows requires admin or Developer Mode for file symlinks; directory
// junctions work without elevation. `realpath` follows both, so the
// behavioral tests are identical. Use junction for directories, file
// symlink for files (and skip on Windows when neither works).
const IS_WINDOWS = process.platform === 'win32';

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'isPathInsideReal-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('isPathInsideReal — happy path', () => {
  it('returns true for a non-existent child inside an existing parent (fallback)', async () => {
    const parent = join(workDir, 'project');
    mkdirSync(parent);
    const child = join(parent, 'sub', 'file.txt');
    // child doesn't exist → realpath(child) throws → fallback to string compare
    expect(await isPathInsideReal(child, parent)).toBe(true);
  });

  it('returns true for an existing child file (both real)', async () => {
    const parent = join(workDir, 'project');
    mkdirSync(parent);
    const child = join(parent, 'file.txt');
    writeFileSync(child, 'data');
    expect(await isPathInsideReal(child, parent)).toBe(true);
  });
});

describe('isPathInsideReal — symlink child escapes parent', () => {
  it.skipIf(IS_WINDOWS)('returns false when a child symlink points outside the parent', async () => {
    const parent = join(workDir, 'project');
    mkdirSync(parent);
    const other = join(workDir, 'other', 'secret.txt');
    mkdirSync(join(workDir, 'other'), { recursive: true });
    writeFileSync(other, 'top secret');
    // symlink INSIDE parent → points to OUTSIDE file
    const linkPath = join(parent, 'innocent-looking');
    symlinkSync(other, linkPath);

    // Pure-string compare: linkPath string is inside parent string → true (vulnerable)
    // realpath compare: linkPath real is /workDir/other/secret.txt → outside → false (safe)
    expect(await isPathInsideReal(linkPath, parent)).toBe(false);
  });

  it.skipIf(IS_WINDOWS)('returns true for a symlink child that points INSIDE the parent (real path still inside)', async () => {
    const parent = join(workDir, 'project');
    mkdirSync(parent);
    const target = join(parent, 'real-file.txt');
    writeFileSync(target, 'data');
    const linkPath = join(parent, 'symlink');
    symlinkSync(target, linkPath);

    // realpath(target) === realpath(linkPath) === target → inside parent
    expect(await isPathInsideReal(linkPath, parent)).toBe(true);
  });
});

describe('isPathInsideReal — symlinked parent', () => {
  it.skipIf(IS_WINDOWS)('returns true for a child inside a parent that IS a symlink to a different tree', async () => {
    const realParentDir = join(workDir, 'real-project');
    mkdirSync(realParentDir);
    const symlinkedParent = join(workDir, 'project');
    symlinkSync(realParentDir, symlinkedParent);
    const child = join(realParentDir, 'file.txt');
    writeFileSync(child, 'data');

    // Caller passes the symlinked path. realpath(symlinkedParent) === realParentDir.
    // realpath(child) === child. child string is inside realParentDir string → true.
    expect(await isPathInsideReal(child, symlinkedParent)).toBe(true);
  });
});

describe('isPathInsideReal — nested symlinks', () => {
  it.skipIf(IS_WINDOWS)('returns false for a 2-hop symlink chain escaping the parent', async () => {
    const parent = join(workDir, 'project');
    mkdirSync(parent);
    const target = join(workDir, 'secret.txt');
    writeFileSync(target, 'x');
    // a → b → target (where b is inside parent)
    const b = join(parent, 'b');
    const a = join(parent, 'a');
    symlinkSync(target, b); // b → outside (target)
    symlinkSync(b, a); // a → b → target

    // a's realpath is target → outside parent → false
    expect(await isPathInsideReal(a, parent)).toBe(false);
  });
});

describe('isPathInsideReal — non-existent paths fall back to string compare', () => {
  it('returns true when both child and parent do not exist (string compare)', async () => {
    // Pure string: /a/b/c is inside /a/b → true. realpath fails on both → fall back.
    expect(await isPathInsideReal('/a/b/c', '/a/b')).toBe(true);
  });

  it('returns false when non-existent sibling is passed as child', async () => {
    expect(await isPathInsideReal('/a/x', '/a/b')).toBe(false);
  });
});