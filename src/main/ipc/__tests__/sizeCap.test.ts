// v1.40.0 MINOR T1 — readFileWithCap helper tests.
//
// 3 cases that pin the helper contract:
//   1. happy path: 1-byte file → `{ ok: true, content: 'X' }`
//   2. too-large:  33 MiB file → `{ ok: false, kind: 'too-large' }`
//   3. read-failed: non-existent path → `{ ok: false, kind: 'read-failed' }`
//
// The 33 MiB test allocates a real `Buffer.alloc(33 MiB + 1)` and
// `writeFileSync` to disk (same pattern as `bswmdRead.test.ts`'s
// 32 MiB + 1 byte fixture). This exercises the actual `stat` +
// `readFile` paths the helper uses in production rather than mocking
// `fs` — see `bswmdRead.test.ts:7-12` for the rationale ("Using real
// fs catches the 'off-by-one in the size cap' / 'wrong encoding' /
// 'non-existent path' classes of bugs that mocks would silently
// hide.").

import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve as pathResolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_FILE_CAP_BYTES,
  readFileWithCap,
} from '../sizeCap.js';

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(pathResolve(tmpdir(), 'size-cap-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('readFileWithCap (v1.40.0 MINOR T1)', () => {
  it('returns ok with content for a 1-byte file', async () => {
    const p = pathResolve(workDir, 'tiny.txt');
    writeFileSync(p, 'X', 'utf-8');

    const r = await readFileWithCap(p);

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.content).toBe('X');
  });

  it('returns too-large when the file exceeds the default 32 MiB cap', async () => {
    const p = pathResolve(workDir, 'huge.bin');
    const ONE_MIB = 1024 * 1024;
    // 32 MiB + 1 byte: exactly 1 byte over the cap.
    const buf = Buffer.alloc(32 * ONE_MIB + 1, 0x20); // 0x20 = space
    writeFileSync(p, buf);

    // Sanity: file is actually > 32 MiB on disk.
    expect(statSync(p).size).toBeGreaterThan(DEFAULT_FILE_CAP_BYTES);

    const r = await readFileWithCap(p);

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.kind).toBe('too-large');
    if (r.kind === 'too-large') {
      // Message must surface the actual size + cap so the renderer
      // can present actionable text (the `bswmdReadHandler` lesson
      // — human-readable MiB units beat raw byte counts).
      expect(r.message).toContain(p);
      expect(r.message).toContain(String(32 * ONE_MIB + 1));
      expect(r.message).toContain(String(DEFAULT_FILE_CAP_BYTES));
    }
  });

  it('returns read-failed for a non-existent path', async () => {
    const p = pathResolve(workDir, 'does-not-exist.txt');

    const r = await readFileWithCap(p);

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.kind).toBe('read-failed');
    if (r.kind === 'read-failed') {
      // ENOENT messages vary by platform, but they always mention the
      // missing path; we just assert it's a non-empty message so the
      // renderer has something to surface.
      expect(r.message.length).toBeGreaterThan(0);
    }
  });
});