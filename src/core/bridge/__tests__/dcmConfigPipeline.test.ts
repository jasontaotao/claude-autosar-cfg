// v1.27.0 — Dcm config pipeline orchestrator + ODX-Dcm linkage validation.
//
// Mirrors v1.24.0's odxToDiagnosticExtract (ODX half) with v1.26.0's
// BSWMD-driven mapper infrastructure (xlsx service half), plus a NEW
// cross-document linkage check that ensures every xlsx didRef /
// routineRef resolves to a shortName present in the ODX extract.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import type { EcucInstanceRow, OdxSummary } from '../../../shared/types.js';
import { type BswModuleDef } from '../../project/bswmd.js';
import { dcmConfigPipeline } from '../dcmConfigPipeline.js';
import { DCM_MODULE_SHORT_NAME } from '../dcmConstants.js';
import { parseDemoBswmds } from '../demoBswmdLoader.js';

const DEMO_DCM_BSWMD = readFileSync(
  resolve(__dirname, '../../../../samples/arxml/demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml'),
  'utf-8',
);

function makeDcmBswmds(): Map<string, BswModuleDef> {
  return new Map(parseDemoBswmds(new Map([[DCM_MODULE_SHORT_NAME, DEMO_DCM_BSWMD]])));
}

// Minimal OdxSummary fixture with 3 DIDs + 1 Routine, matching the
// shape in src/shared/types.ts: OdxSummary uses flat dtcs/dids/routines
// arrays (not nested variants). See odxToDiagnosticExtract.ts:60-103
// for the consumer-side iteration pattern this mirrors.
const FIXTURE_ODX: OdxSummary = {
  dtcCount: 0,
  didCount: 3,
  routineCount: 1,
  dtcs: [],
  dids: [
    { id: 'DID_Vbatt', shortName: 'Vbatt' },
    { id: 'DID_EngTemp', shortName: 'EngTemp' },
    { id: 'DID_Vin', shortName: 'Vin' },
  ],
  routines: [{ id: 'REQ_EraseMemory', shortName: 'EraseMemory' }],
};

describe('dcmConfigPipeline', () => {
  it('merges ODX extract with Dcm services and counts service kinds', async () => {
    const xlsxRows = [
      {
        sheet: 'DcmReadDataById',
        shortName: 'ReadVbatt',
        params: { didRef: 'Vbatt' },
      },
      {
        sheet: 'DcmRoutineControl',
        shortName: 'StartErase',
        params: { routineRef: 'EraseMemory' },
      },
    ] as unknown as readonly EcucInstanceRow[];

    const result = await dcmConfigPipeline({
      odx: FIXTURE_ODX,
      xlsxRows,
      bswmds: makeDcmBswmds(),
    });

    // ODX-derived DID + Routine counts come from the ODX extract.
    expect(result.odxLinkedDcmDspCount).toBe(3);
    expect(result.odxLinkedRoutineCount).toBe(1);

    // Service-kind counts come from the xlsx rows (per-kind tally).
    expect(result.serviceCounts.DcmClearDTC).toBe(0);
    expect(result.serviceCounts.DcmReadDTC).toBe(0);
    expect(result.serviceCounts.DcmReadDataById).toBe(1);
    expect(result.serviceCounts.DcmWriteDataById).toBe(0);
    expect(result.serviceCounts.DcmRoutineControl).toBe(1);

    // The ODX extract (dcmContent from v1.24.0) carries the DID +
    // Routine shortNames; T4 stitches the xlsx service add-children on
    // top, but T3 surfaces the ODX half as dcmConfigXml.
    expect(result.dcmConfigXml).toContain('Vbatt');
    expect(result.dcmConfigXml).toContain('EraseMemory');
  });

  it('throws ODX-Dcm linkage broken when xlsx references missing DID', async () => {
    const xlsxRows = [
      {
        sheet: 'DcmReadDataById',
        shortName: 'ReadGhost',
        params: { didRef: 'NotInOdx' },
      },
    ] as unknown as readonly EcucInstanceRow[];

    await expect(
      dcmConfigPipeline({
        odx: FIXTURE_ODX,
        xlsxRows,
        bswmds: makeDcmBswmds(),
      }),
    ).rejects.toThrow(/ODX-Dcm linkage broken:.*'NotInOdx'/);
  });

  it('throws when BSWMD map missing module Dcm', async () => {
    await expect(
      dcmConfigPipeline({
        odx: FIXTURE_ODX,
        xlsxRows: [],
        bswmds: new Map(), // missing Dcm
      }),
    ).rejects.toThrow(/BSWMD map missing module 'Dcm'/);
  });
});
