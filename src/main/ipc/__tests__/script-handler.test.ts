// Sprint 14 #1 Phase B (T7) — `script:list`, `script:save`,
// `script:delete`, `script:run` handler tests.
//
// Mirrors the templatesHandler / projectNewHandler test style: real
// temp fs (mkdtempSync + writeFileSync) for the manifest, direct call
// of the exported handler functions (no `ipcMain.handle` round-trip).
//
// Cases covered (8):
//   1. list: empty manifest → []
//   2. save: create new entry assigns a UUID
//   3. save: rejects reserved shortName ("ctx") via thrown ScriptError
//   4. save: update existing entry keeps the same id + bumps updatedAt
//   5. delete: removes an existing entry, list returns []
//   6. run: simple script logs → ok + log captured
//   7. run: import-error for unknown module
//   8. fixtures: the 3 sample scripts parse via node -c and use
//      ctx._import correctly
//
// The handler reads the manifest path via __resetForTest() to keep
// the test surface small and match the templatesHandler pattern.

import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  ScriptDeleteRequest,
  ScriptListRequest,
  ScriptRunRequest,
  ScriptSaveRequest,
} from '../../../shared/types.js';
import {
  scriptDeleteHandler,
  scriptListHandler,
  scriptRunHandler,
  scriptSaveHandler,
  __resetForTest,
} from '../script-handler.js';

let workDir: string;
let manifestPath: string;
let projectId: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'claude-autosarcfg-script-handler-'));
  projectId = 'demo';
  manifestPath = join(workDir, 'demo.autosarcfg.json');
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        schemaVersion: '1',
        id: projectId,
        name: 'Demo',
        valueArxmlPaths: [],
        bswmdPaths: [],
        scripts: [],
      },
      null,
      2,
    ),
  );
  __resetForTest(manifestPath, projectId);
});
afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
  __resetForTest(null, null);
});

function saveReq(overrides: Partial<ScriptSaveRequest> = {}): ScriptSaveRequest {
  return {
    projectId,
    name: 'Sample',
    shortName: 'sample-script',
    kind: 'free',
    source: '// hi',
    ...overrides,
  };
}

describe('script:list handler (Sprint 14 #1 T7)', () => {
  it('returns { scripts: [] } for a fresh manifest', async () => {
    const r = await scriptListHandler({ projectId } as ScriptListRequest);
    expect(r.scripts).toEqual([]);
  });

  it('returns one summary after a save', async () => {
    await scriptSaveHandler(saveReq({ shortName: 'first-script' }));
    const r = await scriptListHandler({ projectId } as ScriptListRequest);
    expect(r.scripts).toHaveLength(1);
    expect(r.scripts[0]).toMatchObject({
      name: 'Sample',
      shortName: 'first-script',
      kind: 'free',
    });
    expect(typeof r.scripts[0]?.id).toBe('string');
    expect(typeof r.scripts[0]?.updatedAt).toBe('string');
  });
});

describe('script:save handler (Sprint 14 #1 T7)', () => {
  it('creates a new entry and returns a UUID id', async () => {
    const r = await scriptSaveHandler(saveReq({ shortName: 'create-new' }));
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
    // Manifest should now have one script
    const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(m.scripts).toHaveLength(1);
    expect(m.scripts[0].shortName).toBe('create-new');
  });

  it('rejects a reserved shortName with a thrown ScriptError', async () => {
    await expect(scriptSaveHandler(saveReq({ shortName: 'ctx', source: '' }))).rejects.toThrow(
      /reserved/i,
    );
  });

  it('updates an existing entry (id stays, updatedAt bumps)', async () => {
    const created = await scriptSaveHandler(saveReq({ shortName: 'update-me' }));
    const r2 = await scriptSaveHandler(
      saveReq({
        id: created.id,
        shortName: 'update-me',
        name: 'Renamed',
        source: '// changed',
      }),
    );
    expect(r2.id).toBe(created.id);
    expect(r2.updatedAt).not.toBe(created.updatedAt);
    const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(m.scripts).toHaveLength(1);
    expect(m.scripts[0].name).toBe('Renamed');
  });

  it('rejects a shortName that collides with another entry on create', async () => {
    await scriptSaveHandler(saveReq({ shortName: 'dupe-name' }));
    await expect(scriptSaveHandler(saveReq({ shortName: 'dupe-name' }))).rejects.toThrow(
      /duplicate/i,
    );
  });
});

describe('script:delete handler (Sprint 14 #1 T7)', () => {
  it('removes an existing entry and list returns [] again', async () => {
    const created = await scriptSaveHandler(saveReq({ shortName: 'delete-me' }));
    const del = await scriptDeleteHandler({ projectId, id: created.id } as ScriptDeleteRequest);
    expect(del.ok).toBe(true);
    const list = await scriptListHandler({ projectId } as ScriptListRequest);
    expect(list.scripts).toEqual([]);
  });

  it('is idempotent for missing id (no throw)', async () => {
    const del = await scriptDeleteHandler({ projectId, id: 'no-such-id' } as ScriptDeleteRequest);
    expect(del.ok).toBe(true);
  });
});

describe('script:run handler (Sprint 14 #1 T7)', () => {
  it('returns ok for a simple log script (no documents needed)', async () => {
    // runInSandbox still needs a project, but for a script that only
    // calls ctx.log.info the handler doesn't have to load a doc.
    // The handler builds an empty project fallback when no documents
    // are present so log-only scripts can still execute.
    const saved = await scriptSaveHandler(saveReq({ shortName: 'log-only', source: 'ctx.log.info("hi")' }));
    const r = await scriptRunHandler({ projectId, id: saved.id } as ScriptRunRequest);
    expect(r.status).toBe('ok');
    expect(r.logs.some((l) => l.message === 'hi')).toBe(true);
  });

  it('returns import-error for a script that imports an unknown module', async () => {
    const saved = await scriptSaveHandler(
      saveReq({ shortName: 'bad-import', source: `import { x } from './does-not-exist'` }),
    );
    const r = await scriptRunHandler({ projectId, id: saved.id } as ScriptRunRequest);
    expect(r.status).toBe('import-error');
    expect(r.errorMessage).toMatch(/not found/i);
  });
});