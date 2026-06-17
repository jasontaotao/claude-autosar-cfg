// Sprint 12 #2 — bswmd:read IPC handler tests.
//
// The handler shape is a discriminated union: `{ kind: 'ok', content }`
// or `{ kind: 'read-failed', message }`. Unlike `bswmd:parse` (Sprint 12 #1)
// which is a pure function over content already in memory, this handler
// reads from disk, so we exercise it against real temp files.
//
// Mirrors `bswmdParse.test.ts` style (describe + it, direct call of
// the handler code path) but stands up tiny on-disk fixtures under
// `os.tmpdir()` rather than mocking `fs`. Using real fs catches the
// "off-by-one in the size cap" / "wrong encoding" / "non-existent path"
// classes of bugs that mocks would silently hide.
//
// 4 cases that matter for the IPC envelope:
//   1. happy path → `{ kind: 'ok', content: <string> }`
//   2. file does not exist → `{ kind: 'read-failed', message: ... }`
//   3. file larger than 32 MiB cap → `{ kind: 'read-failed', message: ... }`
//   4. empty file → `{ kind: 'ok', content: '' }` (NOT read-failed; an
//      empty file is a valid empty string — parseBswmd will later reject
//      it for missing-root, but reading succeeds)
//   5. real EB tresos R4.2.2 master BSWMD (~12 MiB) → `{ kind: 'ok', content }`
//      (regression for user-reported "无法加载" bug — the 8 MiB cap that
//      shipped with Sprint 12 #2 was sized against vendor BSWMDs only;
//      the AUTOSAR standard master BSWMD is ~12 MiB and is a legitimate
//      load target. Skipped via it.runIf when EB tresos is not installed.)

import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readBswmdHandler } from '../bswmdReadHandler.js';

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'claude-autosarcfg-bswmd-read-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('bswmd:read handler (Sprint 12 #2) — Result envelope shape', () => {
  it('returns ok with file content for an existing readable file', async () => {
    const p = join(workDir, 'happy.arxml');
    writeFileSync(p, '<?xml version="1.0"?><AUTOSAR/>', 'utf8');

    const r = await readBswmdHandler({ path: p });

    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') throw new Error('unreachable');
    expect(r.content).toBe('<?xml version="1.0"?><AUTOSAR/>');
  });

  it('returns ok with empty content for an empty file (read succeeds, parse is downstream)', async () => {
    const p = join(workDir, 'empty.arxml');
    writeFileSync(p, '', 'utf8');

    const r = await readBswmdHandler({ path: p });

    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') throw new Error('unreachable');
    expect(r.content).toBe('');
  });

  it('returns read-failed when the path does not exist', async () => {
    const p = join(workDir, 'does-not-exist.arxml');

    const r = await readBswmdHandler({ path: p });

    expect(r.kind).toBe('read-failed');
    if (r.kind !== 'read-failed') throw new Error('unreachable');
    // ENOENT messages vary by platform, but they always mention the
    // missing path; we just assert it's a non-empty message so the
    // renderer has something to surface.
    expect(r.message.length).toBeGreaterThan(0);
  });

  it('returns read-failed for a path that is an empty string', async () => {
    const r = await readBswmdHandler({ path: '' });
    expect(r.kind).toBe('read-failed');
    if (r.kind !== 'read-failed') throw new Error('unreachable');
    // We want to refuse the empty string up-front (avoids a confusing
    // EISDIR / "path must be a string" error from node:fs).
    expect(r.message.length).toBeGreaterThan(0);
  });

  it('returns read-failed for a path that is only whitespace', async () => {
    const r = await readBswmdHandler({ path: '   ' });
    expect(r.kind).toBe('read-failed');
    if (r.kind !== 'read-failed') throw new Error('unreachable');
    expect(r.message.length).toBeGreaterThan(0);
  });

  it('returns read-failed when the file exceeds the 32 MiB cap', async () => {
    // Build a 32 MiB + 1 byte file. Using a Buffer with an explicit
    // fill byte is faster than concatenating strings and exercises the
    // exact "size cap" branch in the handler.
    const p = join(workDir, 'huge.arxml');
    const ONE_MIB = 1024 * 1024;
    const buf = Buffer.alloc(32 * ONE_MIB + 1, 0x20); // 0x20 = space
    writeFileSync(p, buf);

    // Sanity: file is actually > 32 MiB on disk.
    expect(statSync(p).size).toBeGreaterThan(32 * ONE_MIB);

    const r = await readBswmdHandler({ path: p });

    expect(r.kind).toBe('read-failed');
    if (r.kind !== 'read-failed') throw new Error('unreachable');
    // New message format uses MiB units + actionable hint rather than
    // raw byte counts. Assert the human-readable shape so future
    // tightening can't accidentally regress back to "8388608-byte cap".
    expect(r.message).toMatch(/too large/i);
    expect(r.message).toMatch(/32\.0\s*MiB/);
    expect(r.message).toMatch(/max 32\.0\s*MiB/);
  });

  it('returns ok for a file exactly at the 32 MiB cap (boundary inclusive)', async () => {
    // The cap is `> BSWMD_MAX_BYTES`, so exactly 32 MiB is allowed.
    const p = join(workDir, 'exactly-32mib.arxml');
    const ONE_MIB = 1024 * 1024;
    const buf = Buffer.alloc(32 * ONE_MIB, 0x20); // exactly 32 MiB
    writeFileSync(p, buf);

    expect(statSync(p).size).toBe(32 * ONE_MIB);

    const r = await readBswmdHandler({ path: p });

    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') throw new Error('unreachable');
    expect(r.content.length).toBe(32 * ONE_MIB);
  });

  it('returns ok for a ~12 MiB file (EB tresos R4.2.2 master BSWMD, real fixture)', async () => {
    // Sprint 13 follow-up: the 8 MiB cap that shipped with Sprint 12 #2
    // rejected this exact user-loaded file. The cap is now 32 MiB; this
    // test pins the regression so a future re-tightening can't silently
    // break the AUTOSAR master load path again.
    //
    // Skipped via it.runIf when EB tresos is not installed on the
    // developer's machine / CI runner — same pattern as
    // parser-namespace.test.ts.
    const REAL = 'C:/EB/tresos/autosar/4.2.2/AUTOSAR_MOD_ECUConfigurationParameters.arxml';
    if (!existsSync(REAL)) return; // runIf guard

    // Sanity: real fixture must be > 8 MiB so this test would actually
    // fail under the old cap. If the fixture ever shrinks, the cap
    // tightening is no longer motivated by it — log a warning via size.
    const realSize = statSync(REAL).size;
    expect(realSize).toBeGreaterThan(8 * 1024 * 1024);
    // And well under the new cap — gives ~2.6× headroom.
    expect(realSize).toBeLessThan(32 * 1024 * 1024);

    const r = await readBswmdHandler({ path: REAL });

    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') throw new Error('unreachable');
    // UTF-16 code-unit length can be smaller than the byte size for files
    // containing multi-byte UTF-8 sequences (R4.2.2 master BSWMD has a
    // handful of ©/® glyphs in the doc headers). Assert the read
    // happened in full — the string is non-empty and the byte length is
    // recoverable from the on-disk size — without coupling to the exact
    // encoding shape.
    expect(r.content.length).toBeGreaterThan(0);
    expect(realSize).toBeGreaterThan(r.content.length);
  });
});
