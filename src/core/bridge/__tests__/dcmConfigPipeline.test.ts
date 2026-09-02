// dcmConfigPipeline — DIM-based orchestrator tests (2026-09-02 migration).
// The old OdxSummary mapper is replaced by the full-import DIM layer.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import type { EcucInstanceRow } from '../../../shared/types.js';
import { applyPatchesToExtract } from '../../arxml/extractPatch.js';
import type { BswModuleDef } from '../../project/bswmd.js';
import { buildBswmdDefIndex } from '../../odx/bswmdDefIndex.js';
import type { Dim, DimService } from '../../odx/dim.js';
import { dcmConfigPipeline } from '../dcmConfigPipeline.js';
import { DCM_MODULE_SHORT_NAME } from '../dcmConstants.js';
import { parseDemoBswmds } from '../demoBswmdLoader.js';
import { xlsxDcmServicesToEcucBatch } from '../xlsxDcmServicesToEcucBatch.js';

const DEMO_DCM_BSWMD = readFileSync(
  resolve(__dirname, '../../../../samples/arxml/demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml'),
  'utf-8',
);
const REAL_OEM_DCM_BSWMD = readFileSync(
  resolve(__dirname, '../../../../samples/comstack-existing-fixture/Dcm.bswmd.arxml'),
  'utf-8',
);

function makeDcmBswmds(content = DEMO_DCM_BSWMD): Map<string, BswModuleDef> {
  return new Map(parseDemoBswmds(new Map([[DCM_MODULE_SHORT_NAME, content]])));
}

function service(
  odxId: string,
  shortName: string,
  serviceClass: DimService['serviceClass'],
  identifier?: string,
): DimService {
  return {
    odxId,
    shortName,
    serviceClass,
    sid: 0x22,
    request: identifier
      ? [{ name: 'DID', semantic: 'ID', codedValue: identifier, bytePosition: 0 }]
      : [],
    posResponses: [],
    negResponseCodes: [],
    sdgAnnotations: {},
    sessionRefs: [],
    securityRefs: [],
  };
}

const FIXTURE_DIM: Dim = {
  meta: {
    sourcePath: '/tmp/input.odx-d',
    modelVersion: '1.0',
    variant: { kind: 'BASE-VARIANT', odxId: 'base', shortName: 'Variant' },
  },
  services: [
    service('svc-read-1', 'ReadVbatt', 'ReadDataByIdentifier', '0x0102'),
    service('svc-read-2', 'ReadEngTemp', 'ReadDataByIdentifier', '0x0103'),
    service('svc-read-3', 'ReadVin', 'ReadDataByIdentifier', '0x0104'),
    service('svc-write-1', 'WriteVin', 'WriteDataByIdentifier', '0x0104'),
    service('svc-routine-1', 'EraseMemory', 'RoutineControl', '0x0200'),
  ],
  dataObjects: [
    {
      odxId: 'DID_Vbatt',
      shortName: 'Vbatt',
      codedType: { kind: 'standard', bitLength: 16 },
      baseDataType: 'A_UINT32',
      encoding: 'NONE',
    },
    {
      odxId: 'DID_EngTemp',
      shortName: 'EngTemp',
      codedType: { kind: 'standard', bitLength: 16 },
      baseDataType: 'A_UINT32',
      encoding: 'NONE',
    },
    {
      odxId: 'DID_Vin',
      shortName: 'Vin',
      codedType: { kind: 'standard', bitLength: 16 },
      baseDataType: 'A_UINT32',
      encoding: 'NONE',
    },
  ],
  dtcs: [],
  sessions: [],
  securityLevels: [],
  warnings: [],
};

describe('dcmConfigPipeline', () => {
  it('merges DIM-derived Dcm extract with services and counts service kinds', async () => {
    const bswmds = makeDcmBswmds();
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
      dim: FIXTURE_DIM,
      xlsxRows,
      bswmds,
      bswmdIndex: buildBswmdDefIndex(bswmds),
    });

    expect(result.odxLinkedDcmDspCount).toBe(3);
    expect(result.odxLinkedRoutineCount).toBe(1);
    expect(result.serviceCounts.DcmReadDataById).toBe(1);
    expect(result.serviceCounts.DcmRoutineControl).toBe(1);
    expect(result.dcmConfigXml).toContain('Vbatt');
    expect(result.dcmConfigXml).toContain('EraseMemory');
  });

  it('throws ODX-Dcm linkage broken when xlsx references a missing DID', async () => {
    const xlsxRows = [
      {
        sheet: 'DcmReadDataById',
        shortName: 'ReadGhost',
        params: { didRef: 'NotInOdx' },
      },
    ] as unknown as readonly EcucInstanceRow[];

    await expect(
      dcmConfigPipeline({
        dim: FIXTURE_DIM,
        xlsxRows,
        bswmds: makeDcmBswmds(),
        bswmdIndex: buildBswmdDefIndex(makeDcmBswmds()),
      }),
    ).rejects.toThrow(/ODX-Dcm linkage broken:.*'NotInOdx'/);
  });

  it('throws when the Dcm BSWMD map is missing', async () => {
    await expect(
      dcmConfigPipeline({
        dim: FIXTURE_DIM,
        xlsxRows: [],
        bswmds: new Map(),
        bswmdIndex: buildBswmdDefIndex(new Map()),
      }),
    ).rejects.toThrow(/BSWMD map missing module 'Dcm'/);
  });
});

describe('dcmConfigPipeline — real-OEM end-to-end', () => {
  it('runs DIM mapping, xlsx patches, and serialization against a real-OEM Dcm BSWMD', async () => {
    const bswmds = makeDcmBswmds(REAL_OEM_DCM_BSWMD);
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

    const pipeline = await dcmConfigPipeline({
      dim: FIXTURE_DIM,
      xlsxRows,
      bswmds,
      bswmdIndex: buildBswmdDefIndex(bswmds),
    });
    expect(pipeline.odxLinkedDcmDspCount).toBe(3);
    expect(pipeline.odxLinkedRoutineCount).toBe(1);
    expect(pipeline.dcmConfigXml).toContain('Vbatt');
    expect(pipeline.dcmConfigXml).toContain('EraseMemory');

    const serviceSteps = xlsxDcmServicesToEcucBatch(xlsxRows, bswmds);
    expect(serviceSteps.length).toBe(4);
    const dcmModuleDef = bswmds.get(DCM_MODULE_SHORT_NAME);
    expect(dcmModuleDef).toBeDefined();
    if (dcmModuleDef === undefined) throw new Error('expected real-OEM Dcm BSWMD to be loaded');

    const patched = applyPatchesToExtract(pipeline.dcmConfigXml, serviceSteps, dcmModuleDef);
    expect(patched.ok).toBe(true);
    if (!patched.ok) throw new Error(`applyPatchesToExtract failed: ${patched.error}`);

    expect(patched.value).toContain('ReadVbatt');
    expect(patched.value).toContain('StartErase');
    expect(patched.value).toMatch(/DcmDspDid/);
    expect(patched.value).toMatch(/DcmDspRoutine/);
  });
});
