// xlsxToEcucBatch — pure mapper unit tests (v1.25.0 T1 → v1.26.0 T2).
//
// Tests pin the contract: given an array of EcucInstanceRow (the
// shape T2 folds into shared/types) + a BSWMD map, produce one
// add-child + N set-param PatchSteps per row.
//
// v1.26.0 T2 refactor: parent paths come from BSWMD-driven
// `lookupContainerDef`, not from a hardcoded const. Tests load the
// demo-ecu BSWMDs as a fixture (real container paths) and assert
// structurally (toContain('/Com/'), etc.) so they remain decoupled
// from BSWMD internal path layout.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseDemoBswmds } from '../demoBswmdLoader.js';
import { xlsxToEcucBatch, type EcucInstanceRow } from '../xlsxToEcucBatch.js';

const DEMO_BSWMD_DIR = resolve(__dirname, '../../../../samples/arxml/demo-ecu/bswmd');

function demoBswmds(): ReadonlyMap<string, ReturnType<typeof parseDemoBswmds> extends ReadonlyMap<string, infer V> ? V : never> {
  return parseDemoBswmds(
    new Map([
      ['Com', readFileSync(resolve(DEMO_BSWMD_DIR, 'Bsw_Com_Bswmd.arxml'), 'utf-8')],
      ['CanIf', readFileSync(resolve(DEMO_BSWMD_DIR, 'Bsw_CanIf_Bswmd.arxml'), 'utf-8')],
      ['PduR', readFileSync(resolve(DEMO_BSWMD_DIR, 'Bsw_PduR_Bswmd.arxml'), 'utf-8')],
    ]),
  ) as ReadonlyMap<string, ReturnType<typeof parseDemoBswmds> extends ReadonlyMap<string, infer V> ? V : never>;
}

describe('xlsxToEcucBatch (v1.25.0 T1 — pure mapper)', () => {
  it('emits one add-child + N set-param from a ComIPdu row with 3 params', () => {
    const rows: EcucInstanceRow[] = [
      {
        sheet: 'ComIPdu',
        shortName: 'Pdu_Engine',
        params: {
          ComHandleId: '0',
          ComIPduDirection: 'SEND',
          ComIPduType: 'NORMAL',
        },
      },
    ];
    const steps = xlsxToEcucBatch(rows, demoBswmds());
    expect(steps[0]).toMatchObject({
      op: 'add-child',
      parentPath: expect.stringContaining('Com/'),
      shortName: 'Pdu_Engine',
    });
    // structural: container is in Com module and ends with ComIPdu
    const addChild = steps[0]!;
    if (addChild.op !== 'add-child') throw new Error('expected add-child');
    expect(addChild.parentPath).toContain('ComIPdu');
    expect(steps.filter((s) => s.op === 'set-param').length).toBe(3);
    expect(steps).toContainEqual({
      op: 'set-param',
      containerPath: expect.stringContaining('/ComIPdu/Pdu_Engine'),
      paramName: 'ComHandleId',
      value: '0',
    });
  });

  it('throws on unrecognized sheet name', () => {
    const rows = [
      {
        sheet: 'MysteryContainer' as never,
        shortName: 'X',
        params: {},
      },
    ];
    expect(() => xlsxToEcucBatch(rows, demoBswmds())).toThrow(
      /Unrecognized sheet name: 'MysteryContainer'/,
    );
  });

  it('throws when shortName is missing', () => {
    const rows = [{ sheet: 'ComIPdu', shortName: '', params: {} }] as EcucInstanceRow[];
    expect(() => xlsxToEcucBatch(rows, demoBswmds())).toThrow(/missing shortName/);
  });

  it('emits definitionRef override in the add-child when row has one', () => {
    const rows: EcucInstanceRow[] = [
      {
        sheet: 'CanIfTxPdu',
        shortName: 'TxPdu_Foo',
        definitionRef: '/AUTOSAR/EcuCDefs/CanIf/CanIfTxPdu',
        params: { CanIfTxPduId: '42' },
      },
    ];
    const steps = xlsxToEcucBatch(rows, demoBswmds());
    expect(steps[0]).toMatchObject({
      op: 'add-child',
      parentPath: expect.stringContaining('CanIf/'),
      shortName: 'TxPdu_Foo',
      definitionRef: '/AUTOSAR/EcuCDefs/CanIf/CanIfTxPdu',
    });
    const addChild = steps[0]!;
    if (addChild.op !== 'add-child') throw new Error('expected add-child');
    expect(addChild.parentPath).toContain('CanIfTxPdu');
  });
});