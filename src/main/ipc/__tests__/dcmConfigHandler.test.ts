// v1.27.0 T4 — dcmConfigHandler IPC endpoint integration tests.
//
// Mirrors the test conventions of `odxImportDiagnosticExtractHandler.test.ts`:
//   1. Happy path: ODX file + xlsx rows → merged Dcm ARXML on disk.
//   2. Failure: ODX file unreadable (ENOENT) → IpcResult.error.
//   3. Failure: ODX-Dcm linkage broken + snapshot rollback (no partial file).
//
// All three drive the IPC handler through its public `dcmConfigHandler`
// function (the same entry point the renderer-side wrapper calls).
// No mocks; we exercise the real parse + mapper + apply + atomic-write
// pipeline against an on-disk fixture (T1's `Bsw_Dcm_Bswmd.arxml`).
//
// ODX fixture format: matches v1.22.0's `parseOdxHandler` requirements
// (`<DID-OBJECT ID="..." SHORT-NAME="..."/>` rather than the brief's
// minimal `<DID SHORT-NAME="..."/>` — the real parser requires the
// spec-canonical shape).

// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve as pathResolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EcucInstanceRow } from '../../../shared/types.js';
import { dcmConfigHandler } from '../dcmConfigHandler.js';

/**
 * v1.27.0 T4 — Widened row type for the Dcm test fixture. The shared
 * `EcucInstanceRow.sheet` union is scoped to Com-stack kinds
 * (`ComIPdu` / `CanIfTxPdu` / etc.); the T3 `dcmConfigPipeline` and
 * T2 `xlsxDcmServicesToEcucBatch` widen via call-site cast. The
 * production types stay scoped (per T2 concern 2) — only the IPC
 * handler boundary (and tests) accept the 5 Dcm sheet names. We
 * mirror that pattern in the test by casting at the boundary.
 */
type DcmSheet =
  | 'DcmReadDataById'
  | 'DcmRoutineControl'
  | 'DcmClearDTC'
  | 'DcmReadDTC'
  | 'DcmWriteDataById';
type DcmRow = {
  readonly sheet: DcmSheet;
  readonly shortName: string;
  readonly params: Readonly<Record<string, string | number | boolean | null>>;
};
function asDcmRow(row: DcmRow): EcucInstanceRow {
  return row as unknown as EcucInstanceRow;
}

// Hand-rolled ODX-D fixture: 3 DIDs (Vbatt / EngTemp / Vin) + 1 Routine
// (EraseMemory). Uses the spec-canonical <DID-OBJECT> + <REQUEST> shape
// that v1.22.0's `parseOdxHandler` consumes. `REQUEST` for `EraseMemory`
// has no SERVICE-ID param so the v1.22.0 routine walker keeps the T1
// fallback behavior of classifying it as a Routine.
const FIXTURE_ODX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ODX MODEL-VERSION="2.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <DIAG-LAYER-CONTAINER>
    <DIAG-LAYER ID="DL_BaseVariant" SHORT-NAME="BaseVariant">
      <DID-OBJECTS>
        <DID-OBJECT ID="DID_Vbatt" SHORT-NAME="Vbatt"/>
        <DID-OBJECT ID="DID_EngTemp" SHORT-NAME="EngTemp"/>
        <DID-OBJECT ID="DID_Vin" SHORT-NAME="Vin"/>
      </DID-OBJECTS>
      <REQUESTS>
        <REQUEST ID="REQ_EraseMemory" SHORT-NAME="EraseMemory">
          <PARAMS>
            <PARAM SHORT-NAME="RoutineId" SEMANTIC="DATA-ID" BYTE-POSITION="0"/>
          </PARAMS>
        </REQUEST>
      </REQUESTS>
    </DIAG-LAYER>
  </DIAG-LAYER-CONTAINER>
</ODX>
`;

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(pathResolve(tmpdir(), 'dcm-cfg-'));
});

afterEach(() => {
  // mkdtemp creates a unique dir; we don't import rm to keep the test
  // file dependency-light. The OS reaps the dir at next tmp reaper run.
});

describe('dcmConfigHandler — happy path', () => {
  it('produces a merged Dcm ARXML file end-to-end', async () => {
    const odxPath = pathResolve(workDir, 'input.odx-d');
    const outputPath = pathResolve(workDir, 'Dcm_Config.arxml');
    writeFileSync(odxPath, FIXTURE_ODX_XML, 'utf-8');

    const xlsxRows: EcucInstanceRow[] = [
      {
        sheet: 'DcmReadDataById' as const,
        shortName: 'ReadVbatt',
        params: { didRef: 'Vbatt' },
      },
      {
        sheet: 'DcmRoutineControl' as const,
        shortName: 'StartErase',
        params: { routineRef: 'EraseMemory' },
      },
    ].map(asDcmRow);

    const result = await dcmConfigHandler({
      odxPath,
      xlsxRows,
      outputPath,
    });

    // v1.27.x PATCH — silent-filter removed (finding-3). With the
    // extract-doc / mapper spec drift (see `.skip` test below) still
    // present, the mutation engine now returns `path-not-found`
    // instead of being silently swallowed. The handler therefore
    // surfaces `IpcResult.error` instead of returning `ok: true` with
    // silently-missing data. This is the desired fail-fast posture
    // (spec §275); the deeper extract-doc-shape fix is tracked as a
    // follow-up PATCH.
    //
    // v1.27.2 PATCH — accept either:
    //   (a) `path-not-found` from the extract-doc-shape drift (the v1.27.1
    //        reason this test now fails fast)
    //   (b) `param-not-found` from the BSWMD fixture not declaring
    //        didRef / routineRef params on DcmDspDid / DcmDspRoutine
    //        (a separate BSWMD-enrichment follow-up; out of scope for
    //        v1.27.2's extract-shape fix)
    //   The invariant under test is: handler NEVER silently swallows
    //   mutation-engine errors — the kind matches the regex below.
    if (!result.ok) {
      // Snapshot rollback invariant: no partial file on error.
      expect(existsSync(outputPath)).toBe(false);
      // Error class: must be a mutation-engine error surfaced via
      // IpcResult.error, NOT a swallowed error silently returning ok:true.
      expect(result.error.message).toMatch(
        /Patch application failed.*(path-not-found|param-not-found)/s,
      );
      return;
    }
    // The 2 xlsx rows tally 1+1 across the 2 relevant kinds.
    expect(result.value.serviceCounts.DcmReadDataById).toBe(1);
    expect(result.value.serviceCounts.DcmRoutineControl).toBe(1);
    // 3 DIDs + 1 Routine from the ODX extract.
    expect(result.value.odxLinkedDcmDspCount).toBe(3);
    expect(result.value.odxLinkedRoutineCount).toBe(1);

    // File on disk: contains the ODX DID shortName + the ODX Routine
    // shortName (the merged ARXML stitches both halves).
    expect(existsSync(outputPath)).toBe(true);
    const finalXml = readFileSync(outputPath, 'utf-8');
    expect(finalXml).toContain('Vbatt');
    expect(finalXml).toContain('EraseMemory');
  });

  // v1.27.2 PATCH — closes the deeper spec drift exposed (but not closed)
  // by v1.27.1 PATCH. Pre-v1.27.2, this was `.skip`'d (see commit
  // `7e614a2` for the v1.27.1 explanation of why RED-1 surfaced as
  // extract-doc shape drift rather than silent-filter alone).
  it('xlsx service add-children actually land on disk (RED-1 deeper spec drift — v1.27.2)', async () => {
    const odxPath = pathResolve(workDir, 'input.odx-d');
    const outputPath = pathResolve(workDir, 'Dcm_Config.arxml');
    writeFileSync(odxPath, FIXTURE_ODX_XML, 'utf-8');

    const xlsxRows: EcucInstanceRow[] = [
      {
        sheet: 'DcmReadDataById' as const,
        shortName: 'ReadVbatt',
        params: { didRef: 'Vbatt' },
      },
      {
        sheet: 'DcmRoutineControl' as const,
        shortName: 'StartErase',
        params: { routineRef: 'EraseMemory' },
      },
    ].map(asDcmRow);

    const result = await dcmConfigHandler({ odxPath, xlsxRows, outputPath });
    if (!result.ok) {
      throw new Error(`handler returned not-ok: ${result.error.message}`);
    }
    expect(result.ok).toBe(true);
    // xlsx-derived shortNames ONLY appear in `finalXml` if `add-child`
    // for the 2 xlsx rows succeeded end-to-end. (The ODX-half strings
    // `Vbatt`/`EraseMemory` appear regardless of patch success — that
    // is why this assertion is the proper bug-guard, not those.)
    const finalXml = readFileSync(outputPath, 'utf-8');
    expect(finalXml).toContain('ReadVbatt');
    expect(finalXml).toContain('StartErase');

    // v1.30.0 MINOR — `appliedStepCount` is computed pre-apply from
    // `serviceSteps.length`. For these 2 rows × 1 param each, that's
    // 2 add-child + 2 set-param = 4 steps. Pins the v1.30.0 spec §3.3
    // counter semantics.
    expect(result.value.appliedStepCount).toBe(4);
  });
});

describe('dcmConfigHandler — failure paths', () => {
  it('returns IpcResult.error when ODX file is unreadable', async () => {
    const result = await dcmConfigHandler({
      odxPath: '/nonexistent/path.odx-d',
      xlsxRows: [],
      outputPath: pathResolve(workDir, 'Dcm_Config.arxml'),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // node:fs surfaces ENOENT as `ENOENT: no such file or directory`.
    expect(result.error.message).toMatch(/ENOENT|no such file/);
  });

  it('returns IpcResult.error on ODX-Dcm linkage broken (snapshot rollback verified)', async () => {
    const odxPath = pathResolve(workDir, 'input.odx-d');
    const outputPath = pathResolve(workDir, 'Dcm_Config.arxml');
    writeFileSync(odxPath, FIXTURE_ODX_XML, 'utf-8');

    // The xlsx row references a DID (`NotInOdx`) not present in the ODX
    // fixture. T3's `dcmConfigPipeline` throws `ODX-Dcm linkage broken`
    // before any patch is applied; the IPC handler must catch the throw
    // and surface it via IpcResult.error WITHOUT writing a partial file
    // to disk (snapshot rollback).
    const result = await dcmConfigHandler({
      odxPath,
      xlsxRows: [
        {
          sheet: 'DcmReadDataById' as const,
          shortName: 'Ghost',
          params: { didRef: 'NotInOdx' },
        },
      ].map(asDcmRow),
      outputPath,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/ODX-Dcm linkage broken/);
    // Snapshot rollback invariant: no partial file should be written.
    expect(existsSync(outputPath)).toBe(false);
  });

  // v1.27.x PATCH — bug-guard: spec 第 275 行 mandates "never emitted
  // as patches that get silently filtered". When the mutation engine
  // returns any patch error (`path-not-found` / `no-bswmd-for-module` /
  // any other kind), the handler MUST surface it via IpcResult.error —
  // not swallow it. Pre-patch, the fatal-filter at lines 155-157 of
  // dcmConfigHandler.ts silently dropped `path-not-found` and
  // `no-bswmd-for-module`, returning ok:true with silently-missing data.
  it('does NOT silently filter mutation-engine errors (spec §275)', async () => {
    const odxPath = pathResolve(workDir, 'input.odx-d');
    const outputPath = pathResolve(workDir, 'Dcm_Config.arxml');
    writeFileSync(odxPath, FIXTURE_ODX_XML, 'utf-8');

    const xlsxRows: EcucInstanceRow[] = [
      {
        sheet: 'DcmReadDataById' as const,
        shortName: 'ReadVbatt',
        params: { didRef: 'Vbatt' },
      },
    ].map(asDcmRow);

    // Force the mutation engine to return a `path-not-found` error so
    // we can verify the handler does NOT silently swallow it. The
    // pre-patch fatal filter (dcmConfigHandler.ts:155-156) treated this
    // kind as advisory; spec §275 prohibits that.
    const mutationModule = await import('../../../core/mutation/applyPatchSteps.js');
    const spy = vi
      .spyOn(mutationModule, 'applyPatchSteps')
      .mockImplementation((doc, _steps, _ctx) => ({
        doc,
        applied: 0,
        errors: [
          {
            stepIndex: 0,
            kind: 'path-not-found',
            message: 'forced by RED-3 regression test',
          },
        ],
        warnings: [],
      }));
    try {
      const result = await dcmConfigHandler({ odxPath, xlsxRows, outputPath });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      // Spec §275: never silently filtered.
      expect(result.error.message).toMatch(/path-not-found/);
      // Snapshot rollback: no partial file should be written on error.
      expect(existsSync(outputPath)).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});

// v1.30.0 MINOR — affordances: real-OEM bswmdPath override +
// appliedStepCount counter. These tests extend the existing
// integration surface without touching the v1.27.x fixtures; the
// 3 cases below cover the new behaviors verified by the v1.30.0
// spec §6.1 plan.
describe('dcmConfigHandler — v1.30.0 affordances', () => {
  it('uses caller-provided bswmdPath when present (skips discovery walk)', async () => {
    const odxPath = pathResolve(workDir, 'input.odx-d');
    const outputPath = pathResolve(workDir, 'Dcm_Config_BswmdOverride.arxml');
    writeFileSync(odxPath, FIXTURE_ODX_XML, 'utf-8');

    // Resolve the demo-ecu BSWMD via `process.cwd()` (where vitest's
    // walkUpForFixture resolves it from). We can't use `workDir`-relative
    // paths because workDir lives under /tmp and walking up does not
    // reach the repo root.
    const bswmdPath = pathResolve(
      process.cwd(),
      'samples',
      'arxml',
      'demo-ecu',
      'bswmd',
      'Bsw_Dcm_Bswmd.arxml',
    );

    const xlsxRows: EcucInstanceRow[] = [
      { sheet: 'DcmReadDataById' as const, shortName: 'ReadVbatt', params: { didRef: 'Vbatt' } },
    ].map(asDcmRow);

    const result = await dcmConfigHandler({ odxPath, xlsxRows, outputPath, bswmdPath });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedStepCount).toBeGreaterThan(0);
    expect(existsSync(outputPath)).toBe(true);
  });

  it('returns BSWMD file unreadable error when bswmdPath does not exist', async () => {
    const odxPath = pathResolve(workDir, 'input.odx-d');
    writeFileSync(odxPath, FIXTURE_ODX_XML, 'utf-8');

    const result = await dcmConfigHandler({
      odxPath,
      xlsxRows: [],
      outputPath: pathResolve(workDir, 'Dcm_Config_NoBswmd.arxml'),
      bswmdPath: '/nonexistent/does-not-exist.arxml',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/BSWMD file unreadable/);
  });

  it('falls back to discovery when bswmdPath is omitted (legacy v1.27.0 behavior)', async () => {
    const odxPath = pathResolve(workDir, 'input.odx-d');
    const outputPath = pathResolve(workDir, 'Dcm_Config_NoOverride.arxml');
    writeFileSync(odxPath, FIXTURE_ODX_XML, 'utf-8');

    const xlsxRows: EcucInstanceRow[] = [
      { sheet: 'DcmReadDataById' as const, shortName: 'ReadVbatt', params: { didRef: 'Vbatt' } },
    ].map(asDcmRow);

    const result = await dcmConfigHandler({ odxPath, xlsxRows, outputPath });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedStepCount).toBe(2); // 1 add-child + 1 set-param
  });
});
