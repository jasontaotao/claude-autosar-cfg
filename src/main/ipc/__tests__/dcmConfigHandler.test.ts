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

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

    expect(result.ok).toBe(true);
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error('handler failed:', result.error);
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
});
