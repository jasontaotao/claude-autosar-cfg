// v1.40.0 MINOR T3 (M3) — manifest shape probe test.
//
// The `projectSaveHandler` M3 fix is a defense-in-depth probe: it runs
// the serialized manifest through `loadManifest(saveManifest(req.manifest))`
// BEFORE the disk write. A tampered preload bridge that hands us a
// `ProjectManifest` missing required fields (id / name / path arrays)
// now gets rejected with `{ kind: 'write-failed', message: 'Manifest
// invalid: ...' }` instead of silently persisting a corrupt file.
//
// The handler is typed as taking a fully-formed `ProjectManifest`, so
// producing a "tampered" input requires a cast through `unknown` to
// simulate a future caller (or hand-rolled renderer) that violates
// the invariant.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ProjectSaveRequest } from '../../../shared/types.js';
import { projectSaveHandler } from '../projectSaveHandler.js';

let workDir: string;
let manifestPath: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'claude-autosarcfg-project-save-m3-'));
  manifestPath = join(workDir, 'demo.autosarcfg.json');
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function baseReq(overrides: Partial<ProjectSaveRequest> = {}): ProjectSaveRequest {
  return {
    manifestPath,
    manifest: {
      schemaVersion: '1',
      id: 'demo',
      name: 'Demo',
      valueArxmlPaths: [],
      bswmdPaths: [],
    },
    files: [],
    ...overrides,
  };
}

describe('projectSaveHandler (v1.40.0 MINOR T3 M3 — manifest shape probe)', () => {
  it('accepts a well-formed manifest and writes the file to disk', async () => {
    const r = await projectSaveHandler(baseReq());
    expect(r.kind).toBe('saved');
    expect(readFileSync(manifestPath, 'utf-8')).toContain('"id": "demo"');
  });

  it('rejects a tampered manifest missing the `id` field (M3)', async () => {
    // Cast through unknown to simulate a tampered preload bridge that
    // sends an object that LOOKS like a manifest but is missing the
    // required `id` field. The shape probe must reject it BEFORE
    // the disk write.
    const tampered = {
      schemaVersion: '1' as const,
      name: 'Demo',
      valueArxmlPaths: [] as readonly string[],
      bswmdPaths: [] as readonly string[],
    };
    const r = await projectSaveHandler(
      baseReq({ manifest: tampered as unknown as ProjectSaveRequest['manifest'] }),
    );
    expect(r.kind).toBe('write-failed');
    if (r.kind !== 'write-failed') return;
    expect(r.message).toMatch(/Manifest invalid/);
    // Disk must not have been written.
    expect(() => readFileSync(manifestPath, 'utf-8')).toThrow();
  });

  it('rejects a tampered manifest missing the `name` field (M3)', async () => {
    const tampered = {
      schemaVersion: '1' as const,
      id: 'demo',
      valueArxmlPaths: [] as readonly string[],
      bswmdPaths: [] as readonly string[],
    };
    const r = await projectSaveHandler(
      baseReq({ manifest: tampered as unknown as ProjectSaveRequest['manifest'] }),
    );
    expect(r.kind).toBe('write-failed');
    if (r.kind !== 'write-failed') return;
    expect(r.message).toMatch(/Manifest invalid/);
  });

  it('does not overwrite a pre-existing manifest when the probe fails (M3)', async () => {
    // Seed the file with a known-good manifest.
    const original = JSON.stringify(
      {
        schemaVersion: '1',
        id: 'original',
        name: 'Original',
        valueArxmlPaths: [],
        bswmdPaths: [],
      },
      null,
      2,
    );
    writeFileSync(manifestPath, original, 'utf-8');

    const tampered = {
      schemaVersion: '1' as const,
      // `id` missing — probe will reject.
      name: 'Tampered',
      valueArxmlPaths: [] as readonly string[],
      bswmdPaths: [] as readonly string[],
    };
    const r = await projectSaveHandler(
      baseReq({ manifest: tampered as unknown as ProjectSaveRequest['manifest'] }),
    );
    expect(r.kind).toBe('write-failed');

    // Original file is untouched.
    const onDisk = readFileSync(manifestPath, 'utf-8');
    expect(onDisk).toBe(original);
  });
});
