// Sprint 17b (H8) — `PROJECT_SAVE` path-containment tests.
//
// The handler at `projectSaveHandler.ts` must reject any write path
// that contains a `..` parent-traversal segment. The renderer (or a
// compromised preload bridge) could otherwise forge a path like
// `../../etc/passwd` and the main process would happily write to it.
// We deliberately do NOT do full `isPathInside(manifestDir)` containment
// here because that would break the loose-mode back-compat contract
// (users can open ARXMLs from anywhere and save back to the same path).
//
// 4 cases pin the rejection contract:
//   1. rejects `f.path = '../../etc/passwd'` with `write-failed`
//   2. rejects `req.manifestPath = '/tmp/../etc/passwd'`
//   3. accepts normal absolute paths (current behavior preserved)
//   4. accepts normal sub-directory paths under workDir (loose-mode)

import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ProjectSaveRequest } from '../../../shared/types.js';
import { projectSaveHandler } from '../projectSaveHandler.js';

let workDir: string;
let manifestPath: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'claude-autosarcfg-project-save-'));
  manifestPath = join(workDir, 'demo.autosarcfg.json');
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeReq(overrides: Partial<ProjectSaveRequest> = {}): ProjectSaveRequest {
  return {
    manifestPath,
    manifest: {
      schemaVersion: '1',
      id: 'demo',
      name: 'Demo',
      valueArxmlPaths: [],
      bswmdPaths: [],
      scripts: [],
    },
    files: [],
    ...overrides,
  };
}

describe('PROJECT_SAVE handler (Sprint 17b H8 — path containment)', () => {
  it('rejects f.path with a parent-traversal segment', async () => {
    const r = await projectSaveHandler(
      makeReq({ files: [{ path: '../../etc/passwd', content: 'pwn' }] }),
    );
    expect(r.kind).toBe('write-failed');
    if (r.kind !== 'write-failed') throw new Error('unreachable');
    expect(r.message).toMatch(/parent traversal/i);
    expect(r.message).toContain('../../etc/passwd');
    // Manifest was NOT written either.
    expect(existsSync(manifestPath)).toBe(false);
  });

  it('rejects manifestPath with a parent-traversal segment', async () => {
    // The path '/tmp/../etc/passwd' normalizes to '/etc/passwd' which
    // has no `..` segment. We use a path that retains a `..` segment
    // after normalization, like 'foo/../../etc/passwd' → '../etc/passwd'.
    const r = await projectSaveHandler(makeReq({ manifestPath: 'foo/../../etc/passwd' }));
    expect(r.kind).toBe('write-failed');
    if (r.kind !== 'write-failed') throw new Error('unreachable');
    expect(r.message).toMatch(/manifest path/i);
  });

  it('accepts a normal absolute file path (loose-mode preserved)', async () => {
    const filePath = join(workDir, 'Can_EcucValues.arxml');
    const r = await projectSaveHandler(
      makeReq({ files: [{ path: filePath, content: '<AR-PACKAGES/>' }] }),
    );
    expect(r.kind).toBe('saved');
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf8')).toBe('<AR-PACKAGES/>');
    // Manifest written too.
    expect(existsSync(manifestPath)).toBe(true);
  });

  it('accepts a normal sub-directory path (loose-mode preserved)', async () => {
    const subdir = join(workDir, 'sub');
    mkdirSync(subdir, { recursive: true });
    const filePath = join(subdir, 'doc.arxml');
    const r = await projectSaveHandler(
      makeReq({ files: [{ path: filePath, content: 'ok' }] }),
    );
    expect(r.kind).toBe('saved');
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf8')).toBe('ok');
    expect(existsSync(manifestPath)).toBe(true);
  });
});
