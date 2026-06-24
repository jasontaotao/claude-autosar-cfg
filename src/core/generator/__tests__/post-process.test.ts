import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import * as fsPromises from 'node:fs/promises';
import type * as FsPromisesType from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock node:fs/promises so we can observe writeFile + rename without
// fighting non-configurable property descriptors on the namespace import.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromisesType>();
  return {
    ...actual,
    writeFile: vi.fn(actual.writeFile),
    rename: vi.fn(actual.rename),
  };
});

// Re-import the SUT AFTER the mock is registered so writeOutputTree picks up
// the mocked fs/promises via static resolution inside the module.
const { writeOutputTree } = await import('../post-process.js');

let outDir: string;

beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'generator-post-'));
  vi.clearAllMocks();
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
    const artifacts = new Map([['Deep/Nested/Path/file.c', '/* nested */']]);
    await writeOutputTree(artifacts, outDir);
    const f = await readFile(join(outDir, 'Deep/Nested/Path/file.c'), 'utf8');
    expect(f).toBe('/* nested */');
  });

  it('writes atomically via temp-file + rename', async () => {
    const artifacts = new Map([['atomic.c', '/* content */']]);
    await writeOutputTree(artifacts, outDir);

    // 1) No leftover temp files on disk after the call returns.
    const entries = await readdir(outDir);
    expect(entries.filter((e) => e.includes('.tmp'))).toEqual([]);

    // 2) Both writeFile and rename were invoked — proves the temp-then-rename
    //    atomicity pattern (a direct writeFile would never call rename).
    const renameMock = fsPromises.rename as unknown as ReturnType<typeof vi.fn>;
    const writeFileMock = fsPromises.writeFile as unknown as ReturnType<typeof vi.fn>;
    expect(renameMock).toHaveBeenCalledTimes(1);
    expect(writeFileMock).toHaveBeenCalledTimes(1);

    // 3) writeFile wrote to a .tmp path, and rename moved it to the final path.
    const writeCall = writeFileMock.mock.calls[0];
    const renameCall = renameMock.mock.calls[0];
    expect(writeCall).toBeDefined();
    expect(renameCall).toBeDefined();
    const tmpPath = writeCall![0] as string;
    const finalPath = renameCall![1] as string;
    expect(tmpPath.endsWith('.tmp')).toBe(true);
    expect(tmpPath).not.toBe(finalPath);
    expect(tmpPath.startsWith(finalPath)).toBe(true);
    expect(finalPath).toBe(join(outDir, 'atomic.c'));
    expect(renameCall![0]).toBe(tmpPath);

    // 4) Final file content is correct.
    const written = await readFile(finalPath, 'utf8');
    expect(written).toBe('/* content */');
  });
});
