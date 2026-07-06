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
import { DCM_MODULE_SHORT_NAME } from '../dcmConstants.js';
import { parseDemoBswmds } from '../demoBswmdLoader.js';
import { xlsxDcmServicesToEcucBatch } from '../xlsxDcmServicesToEcucBatch.js';

const DEMO_BSWMD_DIR = resolve(__dirname, '../../../../samples/arxml/demo-ecu/bswmd');
function loadDcmBswmd(): string {
  return readFileSync(resolve(DEMO_BSWMD_DIR, 'Bsw_Dcm_Bswmd.arxml'), 'utf-8');
}
function dcmBswmds(): Map<string, BswModuleDef> {
  const map = parseDemoBswmds(new Map([[DCM_MODULE_SHORT_NAME, loadDcmBswmd()]]));
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
      // v1.27.2 PATCH — module-level add with definitionRef pointing at
      // the canonical AUTOSAR container definition. Pre-patch emitted
      // `parentPath: 'Dcm/DcmDspClearDTC'` (leaf-parent add).
      parentPath: DCM_MODULE_SHORT_NAME,
      definitionRef: '/Dcm/Dcm/DcmDspClearDTC',
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
      parentPath: DCM_MODULE_SHORT_NAME,
      definitionRef: '/Dcm/Dcm/DcmDspReadDTCInformation',
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
      parentPath: DCM_MODULE_SHORT_NAME,
      definitionRef: '/Dcm/Dcm/DcmDspDid',
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
      parentPath: DCM_MODULE_SHORT_NAME,
      definitionRef: '/Dcm/Dcm/DcmDspDid',
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
    expect(steps[0]).toMatchObject({
      op: 'add-child',
      shortName: 'EraseMemory',
      parentPath: DCM_MODULE_SHORT_NAME,
      definitionRef: '/Dcm/Dcm/DcmDspRoutine',
    });
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
// v1.27.x PATCH — bug-guard: parentPath must be BSWMD-relative (no
// leading `/`), so the handler-side `prefixDocRootPath` can re-apply
// the extract-doc's package root cleanly. Pre-patch, the mapper emitted
// the BSWMD-absolute path (`/Dcm/...`), which produced a doubled prefix
// (`/DiagExtract//Dcm/...`) at apply time → `path-not-found`. The
// existing `stringContaining(...)` assertions masked the bug because
// they only check the suffix substring.
describe('xlsxDcmServicesToEcucBatch — module-level add + definitionRef invariant', () => {
  const cases: readonly {
    sheet: string;
    shortName: string;
    expectedDefinitionRef: string;
  }[] = [
    {
      sheet: 'DcmClearDTC',
      shortName: 'ClearOne',
      expectedDefinitionRef: '/Dcm/Dcm/DcmDspClearDTC',
    },
    {
      sheet: 'DcmReadDTC',
      shortName: 'ReadOne',
      expectedDefinitionRef: '/Dcm/Dcm/DcmDspReadDTCInformation',
    },
    {
      sheet: 'DcmReadDataById',
      shortName: 'ReadDidOne',
      expectedDefinitionRef: '/Dcm/Dcm/DcmDspDid',
    },
    {
      sheet: 'DcmWriteDataById',
      shortName: 'WriteDidOne',
      expectedDefinitionRef: '/Dcm/Dcm/DcmDspDid',
    },
    {
      sheet: 'DcmRoutineControl',
      shortName: 'RoutineOne',
      expectedDefinitionRef: '/Dcm/Dcm/DcmDspRoutine',
    },
  ];
  for (const c of cases) {
    it(`emits module-level add + definitionRef for ${c.sheet}`, () => {
      const rows = [
        { sheet: c.sheet, shortName: c.shortName, params: {} },
      ] as unknown as readonly EcucInstanceRow[];
      const steps = xlsxDcmServicesToEcucBatch(rows, dcmBswmds());
      const addChild = steps.find((s) => s.op === 'add-child');
      expect(addChild).toBeDefined();
      const child = addChild as { parentPath: string; definitionRef: string };
      // Module-level add: parentPath is the module shortName, NOT a
      // BSWMD-relative container path. The mutation engine's
      // `findParentContainerDef` has a synthetic-parent fallback for
      // 1-segment paths anchored to the module shortName
      // (`applyPatchSteps.ts:706-722`).
      expect(child.parentPath).toBe(DCM_MODULE_SHORT_NAME);
      expect(child.parentPath.startsWith('/')).toBe(false);
      // definitionRef points at the BSWMD-side container definition so
      // `findChildDefForAdd` can resolve the leaf child via the
      // `definitionRef` branch.
      expect(child.definitionRef).toBe(c.expectedDefinitionRef);
    });
  }
});

describe('xlsxDcmServicesToEcucBatch — real-OEM cross-vendor invariant', () => {
  const REAL_OEM_BSWMD_PATH = resolve(
    __dirname,
    '../../../../samples/comstack-existing-fixture/Dcm.bswmd.arxml',
  );

  function realOemDcmBswmds(): Map<string, BswModuleDef> {
    const xml = readFileSync(REAL_OEM_BSWMD_PATH, 'utf-8');
    const parsed = parseDemoBswmds(new Map([[DCM_MODULE_SHORT_NAME, xml]]));
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
      // v1.27.2 PATCH — module-level add with definitionRef pointing
      // at the canonical container def. The real-OEM BSWMD uses the
      // AUTOSAR root package (`/AUTOSAR/Dcm/...`), so the prefix differs
      // from the demo-ecu's `Dcm` package root, but the leaf
      // `DcmDspDid` shortName is canonical.
      parentPath: DCM_MODULE_SHORT_NAME,
      definitionRef: expect.stringMatching(/\/DcmDspDid$/),
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
      // v1.27.2 PATCH — cross-vendor invariant now asserts that the
      // `definitionRef` carries the canonical container shortName, not
      // the `parentPath` (which is module-level `'Dcm'` in both BSWMDs).
      // The full prefix differs (demo uses package name `'Dcm'`, real-
      // OEM uses the AUTOSAR root package `'AUTOSAR'`); the leaf
      // container shortName is the canonical AUTOSAR spell — that is
      // what must match across vendors.
      const demoAddChild = demoSteps.find(
        (s): s is Extract<typeof s, { definitionRef: string }> => s.op === 'add-child',
      );
      const realAddChild = realSteps.find(
        (s): s is Extract<typeof s, { definitionRef: string }> => s.op === 'add-child',
      );
      // TypeScript narrowing needs the full step shape (not just
      // definitionRef), otherwise `?.definitionRef` resolves to `never`.
      expect(
        demoAddChild &&
          (demoAddChild as { parentPath: string; definitionRef: string }).definitionRef,
      ).toMatch(new RegExp(`/${c.canonicalContainer}$`));
      expect(
        realAddChild &&
          (realAddChild as { parentPath: string; definitionRef: string }).definitionRef,
      ).toMatch(new RegExp(`/${c.canonicalContainer}$`));
      // Both add-child steps should be module-level (parentPath === 'Dcm').
      expect(demoAddChild && (demoAddChild as { parentPath: string }).parentPath).toBe(
        DCM_MODULE_SHORT_NAME,
      );
      expect(realAddChild && (realAddChild as { parentPath: string }).parentPath).toBe(
        DCM_MODULE_SHORT_NAME,
      );
    }
  });
});
