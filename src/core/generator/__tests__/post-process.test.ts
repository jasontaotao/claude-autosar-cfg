import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeOutputTree } from '../post-process.js';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let outDir: string;

beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'generator-post-'));
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe('writeOutputTree', () => {
  it('writes each artifact to its path under outDir', async () => {
    const artifacts = new Map([
      ['EcuC/EcuC_Cfg.c', '/* cfg.c */'],
      ['EcuC/EcuC_Cfg.h', '/* cfg.h */'],
    ]);
    await writeOutputTree(artifacts, outDir);
    const c = await readFile(join(outDir, 'EcuC/EcuC_Cfg.c'), 'utf8');
    const h = await readFile(join(outDir, 'EcuC/EcuC_Cfg.h'), 'utf8');
    expect(c).toBe('/* cfg.c */');
    expect(h).toBe('/* cfg.h */');
  });

  it('creates subdirectories as needed', async () => {
    const artifacts = new Map([
      ['Deep/Nested/Path/file.c', '/* nested */'],
    ]);
    await writeOutputTree(artifacts, outDir);
    const f = await readFile(join(outDir, 'Deep/Nested/Path/file.c'), 'utf8');
    expect(f).toBe('/* nested */');
  });

  it('writes atomically via temp-file + rename', async () => {
    const artifacts = new Map([['atomic.c', '/* content */']]);
    await writeOutputTree(artifacts, outDir);
    // No leftover temp files
    const entries = await readdir(outDir);
    expect(entries.filter((e) => e.includes('.tmp'))).toEqual([]);
  });
});