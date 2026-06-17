// Sprint 13 #1 — `copyTemplateFilesToDir` tests.
//
// 5 cases:
//   1. empty template (0 files) → 0 copied
//   2. value-only template → value files copied, bswmd dir not touched
//   3. bswmd-only template → bswmd files copied
//   4. value+bswmd mixed template (classic) → both copied, fileCount matches
//   5. source path does not exist on disk → throws file-copy-failed

import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { copyTemplateFilesToDir } from '../copy.js';
import type { BuiltinTemplate } from '../types.js';

let workDir: string;
beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'claude-autosarcfg-copy-'));
});
afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeTemplate(overrides: Partial<BuiltinTemplate>): BuiltinTemplate {
  return {
    id: 't',
    displayNameKey: 'template.t.displayName',
    descriptionKey: 'template.t.description',
    valueArxmlPaths: [],
    bswmdPaths: [],
    fileCount: 0,
    ...overrides,
  };
}

describe('copyTemplateFilesToDir (Sprint 13 #1)', () => {
  it('returns 0 copied files for an empty template', () => {
    const t = makeTemplate({ id: 'empty' });
    const r = copyTemplateFilesToDir(t, workDir, join(workDir, 'dest'));
    expect(r.copiedValueArxml).toEqual([]);
    expect(r.copiedBswmd).toEqual([]);
  });

  it('copies value-side files only', () => {
    const src = join(workDir, 't');
    mkdirSync(join(src, 'bswmd'), { recursive: true });
    mkdirSync(join(src, 'sub'), { recursive: true });
    writeFileSync(join(src, 'a.arxml'), '<A/>');
    writeFileSync(join(src, 'sub', 'b.arxml'), '<B/>');
    const t = makeTemplate({
      id: 't',
      valueArxmlPaths: [resolve(src, 'a.arxml'), resolve(src, 'sub/b.arxml')],
      bswmdPaths: [],
    });
    const dest = join(workDir, 'dest');
    mkdirSync(dest);
    const r = copyTemplateFilesToDir(t, workDir, dest);
    expect(r.copiedValueArxml.length).toBe(2);
    expect(r.copiedBswmd).toEqual([]);
    expect(existsSync(join(dest, 't', 'a.arxml'))).toBe(true);
    expect(existsSync(join(dest, 't', 'sub', 'b.arxml'))).toBe(true);
  });

  it('copies bswmd files only', () => {
    const src = join(workDir, 't');
    mkdirSync(join(src, 'bswmd'), { recursive: true });
    writeFileSync(join(src, 'bswmd', 'c.arxml'), '<C/>');
    const t = makeTemplate({
      id: 't',
      valueArxmlPaths: [],
      bswmdPaths: [resolve(src, 'bswmd', 'c.arxml')],
    });
    const dest = join(workDir, 'dest');
    mkdirSync(dest);
    const r = copyTemplateFilesToDir(t, workDir, dest);
    expect(r.copiedValueArxml).toEqual([]);
    expect(r.copiedBswmd.length).toBe(1);
    expect(existsSync(join(dest, 't', 'bswmd', 'c.arxml'))).toBe(true);
  });

  it('copies value+bswmd together and preserves nested paths', () => {
    const src = join(workDir, 't');
    mkdirSync(join(src, 'bswmd'), { recursive: true });
    writeFileSync(join(src, 'v.arxml'), '<V/>');
    writeFileSync(join(src, 'bswmd', 'm.arxml'), '<M/>');
    const t = makeTemplate({
      id: 't',
      valueArxmlPaths: [resolve(src, 'v.arxml')],
      bswmdPaths: [resolve(src, 'bswmd', 'm.arxml')],
      fileCount: 2,
    });
    const dest = join(workDir, 'dest');
    mkdirSync(dest);
    const r = copyTemplateFilesToDir(t, workDir, dest);
    expect(r.copiedValueArxml.length + r.copiedBswmd.length).toBe(2);
    expect(readFileSync(join(dest, 't', 'v.arxml'), 'utf8')).toBe('<V/>');
    expect(readFileSync(join(dest, 't', 'bswmd', 'm.arxml'), 'utf8')).toBe('<M/>');
  });

  it('throws file-copy-failed when a source path does not exist', () => {
    const t = makeTemplate({
      id: 't',
      valueArxmlPaths: [join(workDir, 't', 'does-not-exist.arxml')],
    });
    const dest = join(workDir, 'dest');
    mkdirSync(dest);
    try {
      copyTemplateFilesToDir(t, workDir, dest);
      throw new Error('expected throw');
    } catch (e) {
      const err = e as { kind?: string; message?: string };
      expect(err.kind).toBe('file-copy-failed');
      expect(err.message).toContain('does-not-exist.arxml');
    }
  });
});
