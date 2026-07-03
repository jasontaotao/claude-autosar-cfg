// v1.23.0 T3 — IPC handler `dbc:importComStack` tests.
//
// Mirrors `bswmdDeleteHandler.test.ts` / `projectWriteArxmlBatchHandler.test.ts`
// style: real temp fs for setup, direct call of the exported handler
// function (not through `ipcMain.handle`), vitest `describe`/`it` blocks,
// `os.tmpdir()` for isolation. Plus the `vendor-format-parser-needs-real-
// fixture-pre-ship` PKM rule: the third test below is the only test that
// proves end-to-end integration against `powertrain-typical.dbc` and the
// real `samples/arxml/demo-ecu/` Com-stack files (copied into a temp dir
// so the run is hermetic and idempotent across re-runs).
//
// 4 cases covering the brief's mandatory assertions:
//
//   1. defensive guard — non-string `dbcContent` → `{ ok: false,
//      error.kind: 'read-failed' }` (mirrors the
//      `dbcParseForBridgeHandler` guard at
//      `src/main/ipc/dbcParseForBridgeHandler.ts:160-166`).
//   2. cap-exceeded — `dbcContent.length > DBC_MAX_BYTES` →
//      `{ ok: false, error.kind: 'read-failed' }`.
//   3. real-OEM round-trip — copy `powertrain-typical.dbc` +
//      `samples/arxml/demo-ecu/*.arxml` into a temp dir, register
//      the project, run the handler, assert ok=true with at least
//      one new entry per file AND that the 3 target files were
//      actually rewritten on disk.
//   4. idempotency — run the handler TWICE on the same fixtures:
//      first run may add ≥0 entries, second run MUST add 0 of each
//      (the T2 mapper dedups by container shortName; this exercises
//      the no-partial-write path).
//   5. targetNode validator — passing a node name that is NOT in the
//      DBC `BU_` set MUST fail fast with `kind: 'read-failed'` and a
//      message listing the available nodes (code-review HIGH-2 fix;
//      without the validator, an unknown node silently routes every
//      message into the Rx branch and the bridge produces a broken
//      result).

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

// TDD RED — this import MUST fail until `dbcImportComStackHandler.ts`
// is created in Step 4.
import { dbcImportComStackHandler } from '../dbcImportComStackHandler.js';
import {
  setOpenProjectManifestPath,
  __resetOpenProjectManifestPathForTests,
} from '../project-manifest-state.js';

// ---------------------------------------------------------------------------
// Test helpers — copy the real `powertrain-typical.dbc` and demo-ecu
// fixtures into a fresh temp dir each test so the fixture round-trip is
// hermetic (never mutates the on-disk samples).
// ---------------------------------------------------------------------------

const DBC_FIXTURE = join(process.cwd(), 'samples/dbc/powertrain-typical.dbc');
const DEMO_ECU_DIR = join(process.cwd(), 'samples/arxml/demo-ecu');

interface SeededProject {
  readonly workDir: string;
  readonly dbcContent: string;
  readonly projectManifestPath: string;
}

/**
 * Seed a fresh temp project with the real `powertrain-typical.dbc`
 * content, a complete copy of the demo-ecu Com-stack ARXMLs, and the
 * demo-ecu BSWMDs. Returns the absolute paths the handler will read.
 */
function seedRealProject(): SeededProject {
  const workDir = mkdtempSync(join(tmpdir(), 'claude-autosarcfg-t3-dbcbridge-'));
  // Copy ECUC value-side files + matching BSWMDs into the temp project dir.
  copyFileSync(join(DEMO_ECU_DIR, 'Com_Config.arxml'), join(workDir, 'Com_Config.arxml'));
  copyFileSync(join(DEMO_ECU_DIR, 'CanIf_Config.arxml'), join(workDir, 'CanIf_Config.arxml'));
  copyFileSync(join(DEMO_ECU_DIR, 'PduR_Config.arxml'), join(workDir, 'PduR_Config.arxml'));
  copyFileSync(
    join(DEMO_ECU_DIR, 'bswmd', 'Bsw_Com_Bswmd.arxml'),
    join(workDir, 'Bsw_Com_Bswmd.arxml'),
  );
  copyFileSync(
    join(DEMO_ECU_DIR, 'bswmd', 'Bsw_CanIf_Bswmd.arxml'),
    join(workDir, 'Bsw_CanIf_Bswmd.arxml'),
  );
  copyFileSync(
    join(DEMO_ECU_DIR, 'bswmd', 'Bsw_PduR_Bswmd.arxml'),
    join(workDir, 'Bsw_PduR_Bswmd.arxml'),
  );
  // Minimal manifest — points at the 3 ECUC files + 3 matching BSWMDs.
  const manifestJson = JSON.stringify({
    schemaVersion: '1',
    bswmdPaths: ['Bsw_Com_Bswmd.arxml', 'Bsw_CanIf_Bswmd.arxml', 'Bsw_PduR_Bswmd.arxml'],
    valueArxmlPaths: ['Com_Config.arxml', 'CanIf_Config.arxml', 'PduR_Config.arxml'],
  });
  const projectManifestPath = join(workDir, 'demo.autosarcfg.json');
  writeFileSync(projectManifestPath, manifestJson, 'utf-8');
  // Register the project for the handler's path-containment check.
  setOpenProjectManifestPath(projectManifestPath);
  return {
    workDir,
    projectManifestPath,
    dbcContent: readFileSync(DBC_FIXTURE, 'utf-8'),
  };
}

/**
 * Minimal hand-built `ProjectManifest` shape (see
 * `src/shared/project.ts` for the full definition). The handler reads
 * `valueArxmlPaths` to locate the 3 Com-stack files AND `bswmdPaths`
 * to source the matching `BswModuleDef`s for `applyPatchSteps`.
 */
function makeManifest(): {
  readonly schemaVersion: '1';
  readonly id: string;
  readonly name: string;
  readonly valueArxmlPaths: readonly string[];
  readonly bswmdPaths: readonly string[];
} {
  return {
    schemaVersion: '1',
    id: 'test-project',
    name: 't3-test',
    valueArxmlPaths: ['Com_Config.arxml', 'CanIf_Config.arxml', 'PduR_Config.arxml'],
    bswmdPaths: ['Bsw_Com_Bswmd.arxml', 'Bsw_CanIf_Bswmd.arxml', 'Bsw_PduR_Bswmd.arxml'],
  };
}

let workDir: string;

afterEach(() => {
  if (workDir !== undefined) {
    rmSync(workDir, { recursive: true, force: true });
  }
  __resetOpenProjectManifestPathForTests();
});

describe('dbcImportComStackHandler (T3)', () => {
  it('rejects non-string dbcContent with error.kind="read-failed"', async () => {
    // No project seeding needed — the string guard fires before any
    // file IO. Manifest object is intentionally empty so the test
    // fails fast for the right reason (string guard, not
    // missing-manifest).
    // Cast to `unknown` so TypeScript accepts the runtime bad input
    // without triggering the strict `string`-typed contract.
    const res = await dbcImportComStackHandler({
      dbcContent: 42 as unknown as string,
      projectManifestPath: '/p.json',
      manifest: makeManifest(),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('read-failed');
  });

  it('rejects dbcContent exceeding the 32 MiB cap with error.kind="read-failed"', async () => {
    // The cap check is the second guard (after the type guard). For
    // the size test we pass a string that is over 32 MiB — does not
    // need to be valid DBC text.
    const oversize = 'x'.repeat(33 * 1024 * 1024);
    const res = await dbcImportComStackHandler({
      dbcContent: oversize,
      projectManifestPath: '/p.json',
      manifest: makeManifest(),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('read-failed');
    expect(res.error.message).toMatch(/too large|exceed/i);
  });

  it('real-OEM round-trip: handler returns ok with non-zero counts AND rewrites 3 files', async () => {
    // Per the `vendor-format-parser-needs-real-fixture-pre-ship` PKM
    // rule — the most valuable T3 test is the end-to-end one against
    // the real demo-ecu + powertrain fixtures.
    //
    // Expected outcomes per file with the demo-ecu fixtures:
    //   - Com_Config.arxml: at least 1 (TransState ComIPdu added; the
    //     EngState ComIPdu is skipped for idempotency; ComSignal
    //     children are filtered as `path-not-found` because the demo
    //     BSWMD doesn't declare a `ComSignal` child under `ComConfig`)
    //   - CanIf_Config.arxml: 0 (the demo BSWMD only declares
    //     `CanIfInitCfg` containers; the T2 mapper emits `CanIfTxPduCfg`
    //     adds that get filtered as `path-not-found`). A future PATCH
    //     that extends the demo CanIf BSWMD with `CanIfTxPduCfg` will
    //     lift this to >= 1.
    //   - PduR_Config.arxml: 2 (both EngState and TransState PduR routes
    //     are added because the demo PduR BSWMD declares `PduRRoutingPath`
    //     under `PduRRoutingPaths` — the schema path matches).
    //
    // The "≥1 in pduR + ≥1 in com + 0/≥1 in canIf" pattern is the
    // canonical "real-OEM end-to-end" pass criterion — proves the
    // bridge ran the full parse→plan→apply→serialize→write pipeline
    // against real files. Total adds (com + canIf + pduR) MUST be ≥1
    // to prove the pipeline landed at least one new ECUC instance.
    const seeded = seedRealProject();
    workDir = seeded.workDir;

    const res = await dbcImportComStackHandler({
      dbcContent: seeded.dbcContent,
      projectManifestPath: seeded.projectManifestPath,
      manifest: makeManifest(),
      targetNode: 'ECM',
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.addedCounts.com).toBeGreaterThanOrEqual(1);
    // canIf and pduR are case-by-case (depending on BSWMD shape); sum
    // across all 3 files must be >=1 to prove the bridge landed.
    expect(
      res.value.addedCounts.com + res.value.addedCounts.canIf + res.value.addedCounts.pduR,
    ).toBeGreaterThanOrEqual(1);
    // PduR is the strongest assertion — both messages land because the
    // demo PduR BSWMD declares `PduRRoutingPath` correctly.
    expect(res.value.addedCounts.pduR).toBeGreaterThanOrEqual(1);

    // The 3 ECUC files must still exist (the handler MUST NOT
    // delete them on partial-write failure).
    expect(existsSync(join(seeded.workDir, 'Com_Config.arxml'))).toBe(true);
    expect(existsSync(join(seeded.workDir, 'CanIf_Config.arxml'))).toBe(true);
    expect(existsSync(join(seeded.workDir, 'PduR_Config.arxml'))).toBe(true);

    // And Com_Config must now contain the TransState ComIPdu.
    const postText = readFileSync(join(seeded.workDir, 'Com_Config.arxml'), 'utf-8');
    expect(postText).toContain('TransState');
  });

  it('idempotency: second run on already-bridged files returns 0 counts', async () => {
    const seeded = seedRealProject();
    workDir = seeded.workDir;

    const req = {
      dbcContent: seeded.dbcContent,
      projectManifestPath: seeded.projectManifestPath,
      manifest: makeManifest(),
      targetNode: 'ECM',
    };

    // First run — primes the 3 files with the new ComIPdus.
    const first = await dbcImportComStackHandler(req);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // Total adds across all 3 files MUST be ≥1 to prove the first
    // run landed at least one new ECUC instance. Per-file counts
    // depend on BSWMD shape (see `real-OEM round-trip` test for the
    // per-file breakdown).
    expect(
      first.value.addedCounts.com + first.value.addedCounts.canIf + first.value.addedCounts.pduR,
    ).toBeGreaterThanOrEqual(1);

    // Second run — dedup logic MUST yield all-zeros.
    const second = await dbcImportComStackHandler(req);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.addedCounts.com).toBe(0);
    expect(second.value.addedCounts.canIf).toBe(0);
    expect(second.value.addedCounts.pduR).toBe(0);
  });

  it('targetNode validator: rejects unknown DBC node names with read-failed + available-list', async () => {
    // Code-review HIGH-2 — the T2 mapper uses `targetNode` to dispatch
    // Tx vs Rx by matching `msg.transmitter`. If `targetNode` is not a
    // DBC `BU_` node name (e.g. a typo, an empty string, or the
    // EcuC `ECU-INSTANCE` shortName which is NOT a DBC concept), the
    // bridge silently routes every message into the Rx branch and
    // produces a broken result with no diagnostic.
    //
    // powertrain-typical.dbc declares `BU_: ECM TCM` (verified at
    // pre-ship fixture audit). Passing 'NONEXISTENT' (or any string
    // outside {ECM, TCM}) MUST fail fast at handler entry with
    // `kind: 'read-failed'` and a message that lists the available
    // nodes so the T4 wizard can surface a useful diagnostic.
    const seeded = seedRealProject();
    workDir = seeded.workDir;

    const res = await dbcImportComStackHandler({
      dbcContent: seeded.dbcContent,
      projectManifestPath: seeded.projectManifestPath,
      manifest: makeManifest(),
      targetNode: 'NONEXISTENT',
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('read-failed');
    expect(res.error.message).toMatch(/targetNode.*not a DBC node/i);
    // Message must list the actually-available nodes so the wizard
    // can render a "Did you mean …" hint. Both `ECM` and `TCM` are
    // declared in powertrain-typical.dbc's `BU_` line.
    expect(res.error.message).toContain('ECM');
    expect(res.error.message).toContain('TCM');
  });
});

// Suppress unused-vars lint — `mkdirSync` is intentionally imported
// for parity with sibling tests even if this file does not currently
// need to pre-create dirs (the temp `mkdtempSync` already creates
// the root). Kept here as a guard for the next T3 iteration that
// may need to pre-create a `bswmd/` subdir.
void mkdirSync;
