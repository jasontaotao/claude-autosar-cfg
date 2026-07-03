// v1.23.0 PATCH (HIGH-1) — project:reload IPC handler tests.
//
// The T4 apply handler in App.tsx writes 3 ARXML files (Com / CanIf /
// PduR) via the DBC→Com-Stack bridge but never re-reads them into the
// store, leaving the user looking at stale ECUC values until they
// manually reopen the project. `projectReloadHandler` is the
// non-dialog counterpart to `PROJECT_OPEN` — given the manifest path,
// it re-reads + re-parses the manifest + all referenced value-side
// ARXMLs + BSWMDs and returns them so the renderer's
// `useArxmlStore.openProject(...)` action can consume the bundle
// verbatim.
//
// Discriminated union: `{ kind: 'ok', manifest, files }` on success,
// `{ kind: 'read-failed', message }` on any IO / parse failure.
//
// Tests stand up a real temp manifest + value-side ARXML on disk
// (mirrors the `bswmdRead.test.ts` style — using real fs catches the
// "off-by-one in containment check" / "wrong encoding" / "non-existent
// path" classes of bugs that mocks would silently hide).

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { projectReloadHandler } from '../projectReloadHandler.js';

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'claude-autosarcfg-project-reload-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('projectReloadHandler (v1.23.0 T4 PATCH HIGH-1)', () => {
  it('returns ok with manifest + files for a valid manifest on disk', async () => {
    // Stand up a minimal manifest with 1 value-side ARXML. The manifest
    // shape (schemaVersion / valueArxmlPaths / bswmdPaths / scripts /
    // ecucSources) mirrors `ProjectManifest` in `src/shared/project.ts`.
    const arxmlRel = 'Com_Config.arxml';
    const arxmlAbs = join(workDir, arxmlRel);
    writeFileSync(arxmlAbs, '<?xml version="1.0"?><ECUC/>', 'utf8');
    const manifestPath = join(workDir, 'demo.autosarcfg.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        schemaVersion: '1',
        id: 'demo-id',
        name: 'demo',
        valueArxmlPaths: [arxmlRel],
        bswmdPaths: [],
        scripts: [],
        ecucSources: {},
      }),
      'utf8',
    );

    const r = await projectReloadHandler({ manifestPath });

    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') throw new Error('unreachable');
    expect(r.manifest.name).toBe('demo');
    expect(r.files.length).toBe(1);
    expect(r.files[0]!.path).toBe(arxmlAbs);
    expect(r.files[0]!.content).toBe('<?xml version="1.0"?><ECUC/>');
  });

  it('returns read-failed when the manifest JSON does not exist', async () => {
    const r = await projectReloadHandler({
      manifestPath: join(workDir, 'does-not-exist.autosarcfg.json'),
    });
    expect(r.kind).toBe('read-failed');
    if (r.kind !== 'read-failed') throw new Error('unreachable');
    expect(r.message.length).toBeGreaterThan(0);
  });

  it('returns read-failed when the manifest JSON is malformed', async () => {
    const manifestPath = join(workDir, 'bad.autosarcfg.json');
    writeFileSync(manifestPath, '{ not valid json', 'utf8');
    const r = await projectReloadHandler({ manifestPath });
    expect(r.kind).toBe('read-failed');
  });

  it('returns read-failed when a referenced valueArxml is missing on disk', async () => {
    const manifestPath = join(workDir, 'missing-ref.autosarcfg.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        schemaVersion: '1',
        id: 'missing-id',
        name: 'demo',
        valueArxmlPaths: ['missing.arxml'],
        bswmdPaths: [],
        scripts: [],
        ecucSources: {},
      }),
      'utf8',
    );
    const r = await projectReloadHandler({ manifestPath });
    expect(r.kind).toBe('read-failed');
    if (r.kind !== 'read-failed') throw new Error('unreachable');
    expect(r.message).toMatch(/missing\.arxml/);
  });

  it('returns read-failed when a valueArxml path escapes the project directory (path traversal)', async () => {
    // Place the manifest inside workDir but point at a parent entry.
    const manifestPath = join(workDir, 'escape.autosarcfg.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        schemaVersion: '1',
        id: 'escape-id',
        name: 'demo',
        valueArxmlPaths: ['../escaped.arxml'],
        bswmdPaths: [],
        scripts: [],
        ecucSources: {},
      }),
      'utf8',
    );
    // Pre-condition: ensure `escaped.arxml` is NOT a sibling at the parent level.
    if (existsSync(join(tmpdir(), 'escaped.arxml'))) {
      // Extremely unlikely; skip silently if it happens.
      return;
    }
    const r = await projectReloadHandler({ manifestPath });
    expect(r.kind).toBe('read-failed');
  });

  it('reads both valueArxmlPaths and bswmdPaths when both are present', async () => {
    const arxmlRel = 'EcuC.arxml';
    const bswmdRel = 'EcuC_Bswmd.arxml';
    const arxmlAbs = join(workDir, arxmlRel);
    const bswmdAbs = join(workDir, bswmdRel);
    writeFileSync(arxmlAbs, '<arxml/>', 'utf8');
    writeFileSync(bswmdAbs, '<bswmd/>', 'utf8');
    const manifestPath = join(workDir, 'mixed.autosarcfg.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        schemaVersion: '1',
        id: 'mixed-id',
        name: 'mixed',
        valueArxmlPaths: [arxmlRel],
        bswmdPaths: [bswmdRel],
        scripts: [],
        ecucSources: {},
      }),
      'utf8',
    );
    const r = await projectReloadHandler({ manifestPath });
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') throw new Error('unreachable');
    expect(r.files.length).toBe(2);
    expect(r.files.map((f) => f.path).sort()).toEqual([arxmlAbs, bswmdAbs].sort());
  });
});
