// Sprint 13 #1 — `templates:list` and `templates:copy` IPC handlers.
//
// Mirrors the Sprint 12 #1 #2 #3 style: real temp fs for setup, direct
// call of the exported handler function (not through `ipcMain.handle`),
// vitest `describe`/`it` blocks.
//
// 6 cases:
//   1. list: happy path → returns 1-template array
//   2. list: empty cache → returns `{ templates: [] }`
//   3. copy: happy path → returns relative paths of copied files
//   4. copy: unknown templateId → throws unknown-template
//   5. copy: destDir does not exist → throws dest-dir-missing
//   6. copy: file-copy-failed when source file is missing on disk

import { mkdirSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BuiltinTemplate } from '../../templates/types.js';
import {
  __setTestCache,
  __setTestResolveSamplesRoot,
  templatesListHandler,
  templatesCopyHandler,
} from '../templatesHandler.js';

let workDir: string;
let samplesRoot: string;
beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'claude-autosarcfg-templates-handler-'));
  // The handler's `resolveSamplesRoot` is overridable for tests
  // (see `__setTestResolveSamplesRoot`). We point it at a real dir
  // under the temp workDir so the happy-path copy test's `relative()`
  // computation matches the expected output.
  samplesRoot = join(workDir, 'samples');
  __setTestResolveSamplesRoot(samplesRoot);
});
afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
  __setTestCache(null);
  __setTestResolveSamplesRoot(null);
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

describe('templates:list handler (Sprint 13 #1)', () => {
  it('returns the cached templates summary', async () => {
    __setTestCache([
      makeTemplate({ id: 'empty', fileCount: 0 }),
      makeTemplate({ id: 'classic', fileCount: 2 }),
    ]);
    const r = await templatesListHandler({});
    expect(r.templates.length).toBe(2);
    expect(r.templates[0]).toEqual({
      id: 'empty',
      displayNameKey: 'template.empty.displayName',
      descriptionKey: 'template.empty.description',
      fileCount: 0,
      bswmdPaths: [],
    });
    expect(r.templates[1]?.fileCount).toBe(2);
  });

  it('returns { templates: [] } when the cache is empty', async () => {
    __setTestCache([]);
    const r = await templatesListHandler({});
    expect(r).toEqual({ templates: [] });
  });

  it('exposes bswmdPaths in the list response (Sprint 13+ Stage 3.4)', async () => {
    __setTestCache([
      makeTemplate({
        id: 'classic',
        bswmdPaths: ['/samples/classic/bswmd/Can.arxml'],
      }),
    ]);
    const r = await templatesListHandler({});
    expect(r.templates[0]?.bswmdPaths).toEqual(['/samples/classic/bswmd/Can.arxml']);
  });
});

describe('templates:copy handler (Sprint 13 #1)', () => {
  it('copies the template files into destDir and returns relative paths', async () => {
    // Build a real template on disk under workDir
    const tmplDir = join(samplesRoot, 'classic');
    mkdirSync(join(tmplDir, 'bswmd'), { recursive: true });
    writeFileSync(join(tmplDir, 'V.arxml'), '<V/>');
    writeFileSync(join(tmplDir, 'bswmd', 'M.arxml'), '<M/>');

    __setTestCache([
      makeTemplate({
        id: 'classic',
        valueArxmlPaths: [join(tmplDir, 'V.arxml')],
        bswmdPaths: [join(tmplDir, 'bswmd', 'M.arxml')],
        fileCount: 2,
      }),
    ]);

    const destDir = join(workDir, 'dest');
    mkdirSync(destDir);
    const r = await templatesCopyHandler({ templateId: 'classic', destDir });
    expect(r.copiedValueArxml).toEqual(['classic/V.arxml']);
    expect(r.copiedBswmd).toEqual(['classic/bswmd/M.arxml']);
    expect(existsSync(join(destDir, 'classic', 'V.arxml'))).toBe(true);
    expect(existsSync(join(destDir, 'classic', 'bswmd', 'M.arxml'))).toBe(true);
  });

  it('throws unknown-template when the cache has no such id', async () => {
    __setTestCache([makeTemplate({ id: 'empty' })]);
    const destDir = join(workDir, 'dest');
    mkdirSync(destDir);
    try {
      await templatesCopyHandler({ templateId: 'classic', destDir });
      throw new Error('expected throw');
    } catch (e) {
      const err = e as { kind?: string };
      expect(err.kind).toBe('unknown-template');
    }
  });

  it('throws dest-dir-missing when destDir does not exist', async () => {
    __setTestCache([makeTemplate({ id: 'empty' })]);
    const destDir = join(workDir, 'does-not-exist');
    try {
      await templatesCopyHandler({ templateId: 'empty', destDir });
      throw new Error('expected throw');
    } catch (e) {
      const err = e as { kind?: string };
      expect(err.kind).toBe('dest-dir-missing');
    }
  });

  it('throws file-copy-failed when a source file is missing on disk', async () => {
    __setTestCache([
      makeTemplate({
        id: 'empty',
        valueArxmlPaths: [join(workDir, 'truly-missing.arxml')],
      }),
    ]);
    const destDir = join(workDir, 'dest');
    mkdirSync(destDir);
    try {
      await templatesCopyHandler({ templateId: 'empty', destDir });
      throw new Error('expected throw');
    } catch (e) {
      const err = e as { kind?: string; message?: string };
      expect(err.kind).toBe('file-copy-failed');
      expect(err.message).toContain('truly-missing.arxml');
    }
  });
});
