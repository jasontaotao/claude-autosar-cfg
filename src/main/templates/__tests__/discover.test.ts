// Sprint 13 #1 — `discoverBuiltinTemplates` tests.
//
// 9 cases:
//   1. samplesRoot does not exist → []
//   2. 1 valid template → 1 BuiltinTemplate with correct fields
//   3. 3 valid templates → stable alphabetical sort (classic/clone/empty)
//   4. directory without template.json → opt-in skip (no-template-json)
//   5. invalid JSON in template.json → skip (does not crash discovery)
//   6. Zod-style fail (missing displayName in invalid-template) → skip
//   7. id != dirname (id-mismatch) → skip
//   8. hidden directory (`.foo`) → skip
//   9. valueArxmlPaths / bswmdPaths classification correct
//      (classic has 1 EcuExtract.arxml at root + 1 BSWMD in bswmd/)

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { discoverBuiltinTemplates } from '../discover.js';

const FIXTURE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'tests',
  'fixtures',
  'templates',
  'samples-root',
);

let tempRoots: string[] = [];
function makeTempRoot(): string {
  const r = join(
    tmpdir(),
    `claude-autosarcfg-discover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(r, { recursive: true });
  tempRoots.push(r);
  return r;
}
afterEach(() => {
  for (const r of tempRoots) {
    if (existsSync(r)) rmSync(r, { recursive: true, force: true });
  }
  tempRoots = [];
});

describe('discoverBuiltinTemplates (Sprint 13 #1)', () => {
  it('returns [] when samplesRoot does not exist', () => {
    const r = discoverBuiltinTemplates(join(tmpdir(), 'definitely-does-not-exist-xyz'));
    expect(r).toEqual([]);
  });

  it('returns 1 BuiltinTemplate for a single-valid-template fixture', () => {
    const r = discoverBuiltinTemplates(FIXTURE_ROOT);
    // we only check the 'empty' template here, not all 3
    const empty = r.find((t) => t.id === 'empty');
    expect(empty).toBeDefined();
    expect(empty!.displayNameKey).toBe('template.empty.displayName');
    expect(empty!.descriptionKey).toBe('template.empty.description');
    expect(empty!.valueArxmlPaths).toEqual([]);
    expect(empty!.bswmdPaths).toEqual([]);
    expect(empty!.fileCount).toBe(0);
  });

  it('returns 3 templates sorted alphabetically by id', () => {
    const r = discoverBuiltinTemplates(FIXTURE_ROOT);
    expect(r.map((t) => t.id)).toEqual(['classic', 'clone', 'empty']);
  });

  it('skips directories without template.json (opt-in)', () => {
    // no-template-json/ exists with BSWMD inside but no template.json
    // → must NOT appear in result
    const r = discoverBuiltinTemplates(FIXTURE_ROOT);
    expect(r.find((t) => t.id === 'no-template-json')).toBeUndefined();
  });

  it('skips directories with invalid JSON in template.json', () => {
    // Build a temp root with a bad-json dir
    const root = makeTempRoot();
    const bad = join(root, 'bad-json');
    mkdirSync(bad);
    writeFileSync(join(bad, 'template.json'), '{ this is not json');
    const r = discoverBuiltinTemplates(root);
    expect(r.find((t) => t.id === 'bad-json')).toBeUndefined();
  });

  it('skips directories whose template.json fails the type guard (missing displayName)', () => {
    // invalid-template/ is in the fixture and is missing displayName
    const r = discoverBuiltinTemplates(FIXTURE_ROOT);
    expect(r.find((t) => t.id === 'invalid-template')).toBeUndefined();
  });

  it('skips directories whose template.json id does not match dirname', () => {
    // id-mismatch/ has id="different" inside it
    const r = discoverBuiltinTemplates(FIXTURE_ROOT);
    expect(r.find((t) => t.id === 'id-mismatch')).toBeUndefined();
  });

  it('skips hidden directories (names starting with .)', () => {
    const root = makeTempRoot();
    mkdirSync(join(root, '.hidden'));
    writeFileSync(
      join(root, '.hidden', 'template.json'),
      JSON.stringify({ id: '.hidden', displayName: 'h', description: 'h' }),
    );
    const r = discoverBuiltinTemplates(root);
    expect(r.find((t) => t.id === '.hidden')).toBeUndefined();
  });

  it('classifies classic/ EcuExtract.arxml as valueArxmlPaths and classic/bswmd/Can_bswmd.arxml as bswmdPaths', () => {
    const r = discoverBuiltinTemplates(FIXTURE_ROOT);
    const classic = r.find((t) => t.id === 'classic')!;
    expect(classic.fileCount).toBe(2);
    expect(classic.valueArxmlPaths.length).toBe(1);
    expect(classic.valueArxmlPaths[0]).toMatch(/[\\/]classic[\\/]EcuExtract\.arxml$/);
    expect(classic.bswmdPaths.length).toBe(1);
    expect(classic.bswmdPaths[0]).toMatch(/[\\/]classic[\\/]bswmd[\\/]Can_bswmd\.arxml$/);
  });
});
