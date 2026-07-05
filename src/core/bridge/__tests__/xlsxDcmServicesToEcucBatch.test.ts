// v1.27.0 — Dcm service mapper (BSWMD-driven, mirrors v1.26.0 xlsx mapper).
//
// Maps user-facing xlsx sheet names (DcmClearDTC / DcmReadDTC /
// DcmReadDataById / DcmWriteDataById / DcmRoutineControl) to AUTOSAR
// mutation PatchSteps using the demo-ecu Dcm BSWMD as the source of
// truth for container paths.
//
// Note: the `EcucInstanceRow.sheet` union in src/shared/types.ts is
// scoped to Com/CanIf/PduR kinds (the v1.25.x Com-stack handlers key
// off the narrow union). The Dcm mapper accepts these rows via a
// narrow cast at the call site — T3/T4 widen to a Dcm-specific input
// shape via the IPC boundary, so the production types stay scoped.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import type { EcucInstanceRow } from '../../../shared/types.js';
import { type BswModuleDef } from '../../project/bswmd.js';
import { parseDemoBswmds } from '../demoBswmdLoader.js';
import { xlsxDcmServicesToEcucBatch } from '../xlsxDcmServicesToEcucBatch.js';

const DEMO_BSWMD_DIR = resolve(__dirname, '../../../../samples/arxml/demo-ecu/bswmd');
function loadDcmBswmd(): string {
  return readFileSync(resolve(DEMO_BSWMD_DIR, 'Bsw_Dcm_Bswmd.arxml'), 'utf-8');
}
function dcmBswmds(): Map<string, BswModuleDef> {
  const map = parseDemoBswmds(new Map([['Dcm', loadDcmBswmd()]]));
  return new Map(map);
}

describe('xlsxDcmServicesToEcucBatch', () => {
  it('emits add-child for DcmClearDTC', () => {
    const rows = [
      { sheet: 'DcmClearDTC', shortName: 'ClearEmissions', params: {} },
    ] as unknown as readonly EcucInstanceRow[];
    const steps = xlsxDcmServicesToEcucBatch(rows, dcmBswmds());
    expect(steps.length).toBe(1);
    expect(steps[0]).toMatchObject({
      op: 'add-child',
      shortName: 'ClearEmissions',
      parentPath: expect.stringContaining('DcmDspClearDTC'), // canonical AUTOSAR container
    });
  });

  it('emits add-child for DcmReadDTC', () => {
    const rows = [
      { sheet: 'DcmReadDTC', shortName: 'ReadAllDTC', params: {} },
    ] as unknown as readonly EcucInstanceRow[];
    const steps = xlsxDcmServicesToEcucBatch(rows, dcmBswmds());
    expect(steps[0]).toMatchObject({
      op: 'add-child',
      shortName: 'ReadAllDTC',
      parentPath: expect.stringContaining('DcmDspReadDTCInformation'), // canonical AUTOSAR container
    });
  });

  it('emits add-child for DcmReadDataById with didRef param', () => {
    const rows = [
      {
        sheet: 'DcmReadDataById',
        shortName: 'ReadVbatt',
        params: { didRef: 'Vbatt' },
      },
    ] as unknown as readonly EcucInstanceRow[];
    const steps = xlsxDcmServicesToEcucBatch(rows, dcmBswmds());
    expect(steps.length).toBe(2); // add-child + set-param(didRef)
    expect(steps[0]).toMatchObject({
      op: 'add-child',
      shortName: 'ReadVbatt',
      parentPath: expect.stringContaining('DcmDspDid'), // canonical AUTOSAR parent (shared by 0x22 + 0x2E)
    });
    expect(steps[1]).toMatchObject({
      op: 'set-param',
      paramName: 'didRef',
      value: 'Vbatt',
    });
  });

  it('emits add-child for DcmWriteDataById (shares DcmDspDid parent with 0x22)', () => {
    const rows = [
      { sheet: 'DcmWriteDataById', shortName: 'WriteVin', params: {} },
    ] as unknown as readonly EcucInstanceRow[];
    const steps = xlsxDcmServicesToEcucBatch(rows, dcmBswmds());
    expect(steps[0]).toMatchObject({
      op: 'add-child',
      shortName: 'WriteVin',
      // Canonical AUTOSAR uses DcmDspDid as the SHARED parent for both 0x22
      // and 0x2E; differentiation happens via per-row definitionRef, not
      // container shortName. See plan Step 2.1 + SHEET_TO_CONTAINER_SHORT_NAME.
      parentPath: expect.stringContaining('DcmDspDid'),
    });
  });

  it('emits add-child for DcmRoutineControl with routineRef param', () => {
    const rows = [
      {
        sheet: 'DcmRoutineControl',
        shortName: 'EraseMemory',
        params: { routineRef: 'EraseMemory' },
      },
    ] as unknown as readonly EcucInstanceRow[];
    const steps = xlsxDcmServicesToEcucBatch(rows, dcmBswmds());
    expect(steps.length).toBe(2);
    expect(steps[1]).toMatchObject({
      op: 'set-param',
      paramName: 'routineRef',
      value: 'EraseMemory',
    });
  });
});

describe('xlsxDcmServicesToEcucBatch — fail-fast errors', () => {
  it('throws when sheet is unrecognized', () => {
    const rows = [
      { sheet: 'NotADcmSheet', shortName: 'X', params: {} },
    ] as unknown as readonly EcucInstanceRow[];
    expect(() => xlsxDcmServicesToEcucBatch(rows, dcmBswmds())).toThrow(
      /Unrecognized sheet name: 'NotADcmSheet'/,
    );
  });

  it('throws when BSWMD map missing module Dcm', () => {
    const rows = [
      { sheet: 'DcmClearDTC', shortName: 'X', params: {} },
    ] as unknown as readonly EcucInstanceRow[];
    expect(() => xlsxDcmServicesToEcucBatch(rows, new Map())).toThrow(
      /BSWMD map missing module 'Dcm'/,
    );
  });
});

// v1.27.0 T5 — Real-OEM cross-vendor invariant.
//
// The mapper emits the same `parentPath` for the same row.sheet whether
// the BSWMD comes from the demo-ecu (`samples/arxml/demo-ecu/...`) or
// from a real-OEM-style fixture (`samples/comstack-existing-fixture/...`).
// This guards the SHEET_TO_CONTAINER_SHORT_NAME seam against accidental
// vendor-specific drift — the canonical AUTOSAR container shortNames in
// the seam must resolve identically in every vendor's BSWMD that
// declares them (per the claude-autosarcfg-canonical-autosar-pdur-paths-not-tables
// lesson learned at v1.25.2 PATCH T1).
describe('xlsxDcmServicesToEcucBatch — real-OEM cross-vendor invariant', () => {
  const REAL_OEM_BSWMD_PATH = resolve(
    __dirname,
    '../../../../samples/comstack-existing-fixture/Dcm.bswmd.arxml',
  );

  function realOemDcmBswmds(): Map<string, BswModuleDef> {
    const xml = readFileSync(REAL_OEM_BSWMD_PATH, 'utf-8');
    const parsed = parseDemoBswmds(new Map([['Dcm', xml]]));
    return new Map(parsed);
  }

  it('resolves DcmReadDataById against the real-OEM Dcm BSWMD to the same canonical parent', () => {
    const rows = [
      {
        sheet: 'DcmReadDataById',
        shortName: 'ReadBattery',
        params: { didRef: 'Vbatt' },
      },
    ] as unknown as readonly EcucInstanceRow[];
    const steps = xlsxDcmServicesToEcucBatch(rows, realOemDcmBswmds());
    expect(steps.length).toBe(2);
    expect(steps[0]).toMatchObject({
      op: 'add-child',
      shortName: 'ReadBattery',
      parentPath: expect.stringContaining('DcmDspDid'), // canonical AUTOSAR parent shared by 0x22 + 0x2E
    });
    expect(steps[1]).toMatchObject({
      op: 'set-param',
      paramName: 'didRef',
      value: 'Vbatt',
    });
  });

  it('emits equivalent parentPath for all 5 abstracted sheet kinds on the real-OEM BSWMD', () => {
    // Cross-vendor invariant: same row.sheet → same canonical container
    // parent (after SHEET_TO_CONTAINER_SHORT_NAME seam), regardless of
    // whether the BSWMD comes from demo-ecu or real-OEM. The full path
    // prefix differs (demo uses package name 'Dcm'; real-OEM uses the
    // AUTOSAR root package 'AUTOSAR'); the leaf container shortName is
    // the canonical AUTOSAR spell — that is what must match.
    const demo = dcmBswmds();
    const realOem = realOemDcmBswmds();
    const cases: readonly { sheet: string; shortName: string; canonicalContainer: string }[] = [
      { sheet: 'DcmClearDTC', shortName: 'ClearOne', canonicalContainer: 'DcmDspClearDTC' },
      { sheet: 'DcmReadDTC', shortName: 'ReadOne', canonicalContainer: 'DcmDspReadDTCInformation' },
      { sheet: 'DcmReadDataById', shortName: 'ReadDidOne', canonicalContainer: 'DcmDspDid' },
      { sheet: 'DcmWriteDataById', shortName: 'WriteDidOne', canonicalContainer: 'DcmDspDid' },
      { sheet: 'DcmRoutineControl', shortName: 'RoutineOne', canonicalContainer: 'DcmDspRoutine' },
    ];
    for (const c of cases) {
      const rows = [
        { sheet: c.sheet, shortName: c.shortName, params: {} },
      ] as unknown as readonly EcucInstanceRow[];
      const demoSteps = xlsxDcmServicesToEcucBatch(rows, demo);
      const realSteps = xlsxDcmServicesToEcucBatch(rows, realOem);
      // Both parentPaths must end with the canonical container shortName
      // — that is the cross-vendor invariant under test. Narrow the
      // PatchStep union to the 'add-child' variant before reading
      // parentPath (other variants carry no parentPath field).
      const demoAddChild = demoSteps.find(
        (s): s is Extract<typeof s, { parentPath: string }> => s.op === 'add-child',
      );
      const realAddChild = realSteps.find(
        (s): s is Extract<typeof s, { parentPath: string }> => s.op === 'add-child',
      );
      expect(demoAddChild?.parentPath).toMatch(new RegExp(`/${c.canonicalContainer}$`));
      expect(realAddChild?.parentPath).toMatch(new RegExp(`/${c.canonicalContainer}$`));
    }
  });
});
