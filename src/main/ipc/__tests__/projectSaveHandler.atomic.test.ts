// Sprint v1.5.1 PR(4) — atomic write helper tests.
//
// `writeAtomic` is the single point of truth for project file persistence
// (trust-sprint invariant v1.4.0). The contract is:
//
//   1. Content lands in the final path on success.
//   2. The temp file is cleaned up on success — only the target remains.
//   3. Parent directories are created as needed.
//   4. On any failure (invalid path, fs error), the temp file is cleaned
//      up and the original file (if any) is left untouched.
//   5. Subsequent writes to the same path overwrite atomically.
//
// Windows semantics: `fs.rename` on modern Node uses `MoveFileEx` with
// `MOVEFILE_REPLACE_EXISTING`, so the second write replaces the first
// without leaving a `.tmp-*` artifact. The 'cleans up temp' assertion is
// therefore cross-platform — we list the directory and expect ONLY the
// target file.

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeAtomic } from '../../io/writeAtomic.js';

describe('writeAtomic', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(join(tmpdir(), 'write-atomic-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('writes content to the target file', async () => {
    const file = join(testDir, 'out.txt');
    await writeAtomic(file, 'hello world');
    const got = await fs.readFile(file, 'utf-8');
    expect(got).toBe('hello world');
  });

  it('overwrites an existing file atomically', async () => {
    const file = join(testDir, 'out.txt');
    await writeAtomic(file, 'first');
    await writeAtomic(file, 'second');
    const got = await fs.readFile(file, 'utf-8');
    expect(got).toBe('second');
  });

  it('creates parent directories as needed', async () => {
    const file = join(testDir, 'nested', 'deep', 'out.txt');
    await writeAtomic(file, 'hi');
    const got = await fs.readFile(file, 'utf-8');
    expect(got).toBe('hi');
  });

  it('cleans up the temp file on success', async () => {
    const file = join(testDir, 'out.txt');
    await writeAtomic(file, 'ok');
    const entries = (await fs.readdir(testDir)).sort();
    // Only the target file remains; no .tmp-* leftovers.
    expect(entries).toEqual(['out.txt']);
  });

  it('leaves the original file untouched when the new write fails', async () => {
    const file = join(testDir, 'out.txt');
    await writeAtomic(file, 'original');
    // Now try to write to a path whose parent is a FILE, not a directory.
    // mkdir(recursive:true) on a path whose parent is a file will fail
    // — this is the cross-platform failure path. The pre-existing file
    // at `file` must NOT be modified.
    const blocked = join(file, 'subdir', 'out.txt');
    await expect(writeAtomic(blocked, 'new')).rejects.toBeDefined();
    const still = await fs.readFile(file, 'utf-8');
    expect(still).toBe('original');
  });

  it('writes utf-8 content correctly', async () => {
    const file = join(testDir, 'utf8.txt');
    const content = '中文 + 日本語 + émojis 🎉\nline2';
    await writeAtomic(file, content);
    const got = await fs.readFile(file, 'utf-8');
    expect(got).toBe(content);
  });
});
