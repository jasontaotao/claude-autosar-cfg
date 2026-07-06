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
import { applyPatchesToExtract } from '../../arxml/extractPatch.js';
import type { BswModuleDef } from '../../project/bswmd.js';
import { dcmConfigPipeline } from '../dcmConfigPipeline.js';
import { DCM_MODULE_SHORT_NAME } from '../dcmConstants.js';
import { parseDemoBswmds } from '../demoBswmdLoader.js';
import { xlsxDcmServicesToEcucBatch } from '../xlsxDcmServicesToEcucBatch.js';

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

// v1.27.5 PATCH — real-OEM end-to-end coverage through the FULL
// pipeline (orchestrator + mapper + mutation engine + serializer).
//
// Pre-v1.27.5, the v1.27.0 T5 cross-vendor invariant was exercised
// at the MAPPER level (`xlsxDcmServicesToEcucBatch.test.ts`
// describe `real-OEM cross-vendor invariant`) — proving the mapper
// emits equivalent patch steps regardless of BSWMD provenance. But
// the orchestrator's link against real-OEM BSWMD, and the mutation
// engine + serializer pipeline against a real-OEM-derived extract
// doc, had no end-to-end test. If any layer silently diverged on
// the real-OEM path (e.g., a BSWMD-side container-path prefix
// mismatch that the unit tests didn't catch), the merged ARXML
// would be structurally wrong.
//
// This test runs the production sequence end-to-end:
//   1. `parseDemoBswmds` against the real-OEM Dcm BSWMD fixture.
//   2. `dcmConfigPipeline` (ODX-Dcm linkage validation + extract).
//   3. `xlsxDcmServicesToEcucBatch` → service PatchSteps.
//   4. `applyPatchSteps` to the extract ARXML document.
//   5. `serializeArxml` → finalXml.
//
// Asserts:
//   (a) Both ODX-derived shortNames (Vbatt / EngTemp / Vin / EraseMemory)
//       AND xlsx service shortNames (ReadVbatt / StartErase) land in
//       the same serialized XML string.
//   (b) The real-OEM BSWMD-derived DEFINITION-REF carries the
//       `/AUTOSAR/...` path prefix (distinguishing real-OEM from
//       demo-ecu in the output).
describe('dcmConfigPipeline — real-OEM end-to-end (v1.27.5)', () => {
  const REAL_OEM_DCM_BSWMD = readFileSync(
    resolve(__dirname, '../../../../samples/comstack-existing-fixture/Dcm.bswmd.arxml'),
    'utf-8',
  );

  function realOemDcmBswmds(): Map<string, BswModuleDef> {
    return new Map(parseDemoBswmds(new Map([[DCM_MODULE_SHORT_NAME, REAL_OEM_DCM_BSWMD]])));
  }

  it('runs the production pipeline end-to-end against real-OEM Dcm BSWMD', async () => {
    const bswmds = realOemDcmBswmds();
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

    // 1. Orchestrator: ODX-Dcm linkage validation + ODX extract.
    const pipeline = await dcmConfigPipeline({
      odx: FIXTURE_ODX,
      xlsxRows,
      bswmds,
    });
    expect(pipeline.odxLinkedDcmDspCount).toBe(3);
    expect(pipeline.odxLinkedRoutineCount).toBe(1);
    // The ODX extract is a standalone ARXML string — it carries the
    // container VALUES (not refs to the original ODX content) so the
    // downstream patch pipeline has a mutable target.
    expect(pipeline.dcmConfigXml).toContain('Vbatt');
    expect(pipeline.dcmConfigXml).toContain('EraseMemory');

    // 2. Mapper: xlsx service PatchSteps against the same real-OEM BSWMD.
    const serviceSteps = xlsxDcmServicesToEcucBatch(xlsxRows, bswmds);
    expect(serviceSteps.length).toBe(4); // 2 add-child + 2 set-param(didRef/routineRef)

    // 3. Stitch phase — call the SAME `applyPatchesToExtract` wrapper
    //    the IPC handler uses (`src/core/arxml/extractPatch.ts`,
    //    promoted from `dcmConfigHandler.ts:125-184` in v1.28.0 MINOR
    //    specifically so this test could import it). Eliminates the
    //    ~10 LoC of inline prefix-strip + serialize-with-sourceArxml
    //    that v1.27.5 PATCH originally had to duplicate.
    const dcmModuleDef = bswmds.get(DCM_MODULE_SHORT_NAME);
    expect(dcmModuleDef).toBeDefined();
    if (dcmModuleDef === undefined) {
      throw new Error('expected real-OEM Dcm BSWMD to be loaded');
    }
    const patched = applyPatchesToExtract(pipeline.dcmConfigXml, serviceSteps, dcmModuleDef);
    expect(patched.ok).toBe(true);
    if (!patched.ok) {
      throw new Error(`applyPatchesToExtract failed: ${patched.error}`);
    }
    const finalXml = patched.value;

    // 4. Asserts — both halves stitched in one ARXML string.
    // (a) ODX-derived shortNames + xlsx service shortNames all present.
    for (const shortName of ['Vbatt', 'EngTemp', 'Vin', 'EraseMemory']) {
      expect(finalXml).toContain(shortName);
    }
    for (const shortName of ['ReadVbatt', 'StartErase']) {
      expect(finalXml).toContain(shortName);
    }
    // (b) Real-OEM BSWMD signature: the DEFINITION-REF for DcmDspDid
    //     carries the `/AUTOSAR/` path prefix that the demo-ecu fixture
    //     uses `/Dcm/` instead. Asserting one expected occurrence is
    //     sufficient to distinguish real-OEM provenance — multiple
    //     would be redundant.
    expect(finalXml).toMatch(/\/AUTOSAR\/Dcm\/DcmDspDid/);
    // (c) Real-OEM routine reference: same AUTOSAR-prefix logic for
    //     DcmDspRoutine. Companion to (b); would have failed pre-fix
    //     because DcmDspRoutine lacked `<REFERENCES>` (v1.27.2
    //     PATCH's partial-fixture-enrichment gap).
    expect(finalXml).toMatch(/\/AUTOSAR\/Dcm\/DcmDspRoutine/);
    // NOTE: We do NOT assert `<DCM-DSP-DID-DATA>` here because
    // `buildDcmContent` only emits that block when the ODX DID
    // carries a `data` field (`odxToDiagnosticExtract.ts:103-104`).
    // The shared `FIXTURE_ODX` used by all describe blocks in this
    // file has DIDs without `data`. The data-block round-trip is
    // independently covered by `odxToDiagnosticExtract.test.ts`'s
    // dedicated shape tests (v1.27.2 PATCH).
  });
});
