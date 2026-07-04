// xlsxToEcucBatch — pure mapper unit tests (v1.25.0 T1).
//
// Tests pin the contract: given an array of EcucInstanceRow (the
// shape T2 will fold into shared/types), produce one add-child +
// N set-param PatchSteps per row. T1 is purely pure — no SheetJS,
// no IO. T2's IPC handlers will call this mapper after parsing
// the .xlsx bytes.

import { describe, expect, it } from 'vitest';

import type { EcucInstanceRow } from '../xlsxToEcucBatch.js';
import { xlsxToEcucBatch } from '../xlsxToEcucBatch.js';

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
    const steps = xlsxToEcucBatch(rows);
    expect(steps[0]).toEqual({
      op: 'add-child',
      parentPath: 'Com/ComConfig/ComIpdu',
      shortName: 'Pdu_Engine',
    });
    expect(steps.filter((s) => s.op === 'set-param').length).toBe(3);
    expect(steps).toContainEqual({
      op: 'set-param',
      containerPath: 'Com/ComConfig/ComIpdu/Pdu_Engine',
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
    expect(() => xlsxToEcucBatch(rows)).toThrow(/MysteryContainer|unrecognized sheet/);
  });

  it('throws when shortName is missing', () => {
    const rows = [{ sheet: 'ComIPdu', shortName: '', params: {} }] as EcucInstanceRow[];
    expect(() => xlsxToEcucBatch(rows)).toThrow(/shortName|empty/);
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
    const steps = xlsxToEcucBatch(rows);
    expect(steps[0]).toEqual({
      op: 'add-child',
      parentPath: 'CanIf/CanIfConfig/CanIfTxPdu',
      shortName: 'TxPdu_Foo',
      definitionRef: '/AUTOSAR/EcuCDefs/CanIf/CanIfTxPdu',
    });
  });
});
