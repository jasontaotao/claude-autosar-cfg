import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { writeAtomic } from '../writeAtomic.js';

describe('writeAtomic', () => {
  it('writes file with correct content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'write-atomic-'));
    const out = join(dir, 'out.txt');
    await writeAtomic(out, 'hello');
    expect(await readFile(out, 'utf8')).toBe('hello');
  });

  it('overwrites existing file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'write-atomic-'));
    const out = join(dir, 'out.txt');
    await writeAtomic(out, 'v1');
    await writeAtomic(out, 'v2');
    expect(await readFile(out, 'utf8')).toBe('v2');
  });

  it('creates parent directories', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'write-atomic-'));
    const out = join(dir, 'a/b/c/out.txt');
    await writeAtomic(out, 'nested');
    expect(await readFile(out, 'utf8')).toBe('nested');
  });

  it('cleans up temp file on success', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'write-atomic-'));
    const out = join(dir, 'out.txt');
    await writeAtomic(out, 'ok');
    const entries = await readdir(dir);
    expect(entries).toEqual(['out.txt']);
  });

  it('preserves original file on failure', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'write-atomic-'));
    const out = join(dir, 'out.txt');
    await writeAtomic(out, 'original');
    await expect(writeAtomic(out, null as unknown as string)).rejects.toThrow();
    expect(await readFile(out, 'utf8')).toBe('original');
  });

  it('handles UTF-8 content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'write-atomic-'));
    const out = join(dir, 'utf8.txt');
    const content = '中文 + emoji 🚗 + <arxml>&amp;</arxml>';
    await writeAtomic(out, content);
    expect(await readFile(out, 'utf8')).toBe(content);
  });
});
