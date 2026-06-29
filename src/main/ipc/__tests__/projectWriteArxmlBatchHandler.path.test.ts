import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  setOpenProjectManifestPath,
  __resetOpenProjectManifestPathForTests,
} from '../project-manifest-state.js';
import { projectWriteArxmlBatchHandler } from '../projectWriteArxmlBatchHandler.js';

describe('projectWriteArxmlBatchHandler path-containment (v1.15.5)', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'batch-path-'));
    const manifestPath = join(workDir, 'manifest.json');
    await writeFile(manifestPath, '{}');
    setOpenProjectManifestPath(manifestPath);
  });

  afterEach(() => {
    __resetOpenProjectManifestPathForTests();
  });

  it('rejects filePath escaping manifestDir', async () => {
    const outsideDir = await mkdtemp(join(tmpdir(), 'outside-'));
    const outsideFile = join(outsideDir, 'evil.xml');

    const result = await projectWriteArxmlBatchHandler({
      files: [{ filePath: outsideFile, content: '<x/>' }],
    });

    expect(result.kind).toBe('invalid-path');
    if (result.kind === 'invalid-path') {
      expect(result.message).toContain('escape project directory');
    }
  });

  it('accepts filePath inside manifestDir', async () => {
    const insideFile = join(workDir, 'inside.xml');

    const result = await projectWriteArxmlBatchHandler({
      files: [{ filePath: insideFile, content: '<x/>' }],
    });

    expect(result.kind).not.toBe('invalid-path');
    expect(result.kind).toBe('ok');
  });

  it('rejects all calls when no project is open', async () => {
    __resetOpenProjectManifestPathForTests();
    const insideFile = join(workDir, 'inside.xml');

    const result = await projectWriteArxmlBatchHandler({
      files: [{ filePath: insideFile, content: '<x/>' }],
    });

    expect(result.kind).toBe('invalid-path');
    if (result.kind === 'invalid-path') {
      expect(result.message).toContain('No project is open');
    }
  });
});