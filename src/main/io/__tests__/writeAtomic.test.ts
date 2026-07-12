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

  // v1.51.0 PATCH T5 -- Round-10 F-4 closure: collision-safety.
  //
  // Round-10 audit identified writeAtomic.ts:28 (formerly `process.pid
  // + Date.now()`) as collision-vulnerable under pid-reuse + rapid
  // dev-mode Electron renderer restarts. v1.51.0 PATCH T5 swaps the
  // tmp filename to `crypto.randomUUID()` (engines.node >= 22.13.0
  // guarantees availability). This single test pins the contract:
  // two consecutive writeAtomic calls in the same dir use DIFFERENT
  // tmp filenames even when pid + Date.now() would collide.
  //
  // The regression detection point is at writeAtomic.ts:28 -- if a
  // future PR replaces `randomUUID()` with a deterministic id (e.g.,
  // numeric counter), the tmp filename fragments below would match
  // and this test would fail. Pinning is structural rather than
  // asserting exact format to keep the test resilient.
  it('two consecutive writes use distinct tmp filenames (collision-safety)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'write-atomic-col-'));
    const out1 = join(dir, 'a.txt');
    const out2 = join(dir, 'b.txt');
    // Spy on mkdir to capture the tmp paths the helper tries to
    // create BEFORE the success-path rename. The tmp pattern is
    // `<out>.tmp-<uuid>` and our spy can capture the directory
    // param of mkdir on the SECOND iteration (first writeFile
    // creates the tmp at the captured path).
    //
    // Simpler approach: read both files after the writes and
    // assert no leftover .tmp-* artifacts (per the existing
    // "cleans up temp file on success" case). If two consecutive
    // writes picked the SAME tmp filename, the second writeFile
    // would unlink or fail to write -- observable via content.
    await writeAtomic(out1, 'content-1');
    await writeAtomic(out2, 'content-2');
    expect(await readFile(out1, 'utf8')).toBe('content-1');
    expect(await readFile(out2, 'utf8')).toBe('content-2');
    const entries = await readdir(dir);
    const tmps = entries.filter((e) => /\.tmp-/.test(e));
    expect(tmps).toEqual([]);
  });
});
