// v1.23.0 T2 — Real-OEM round-trip test for the pure DBC→Com-Stack
// mapper.
//
// The hand-crafted fixtures in `dbcToComStack.test.ts` cover the
// mapper's bookkeeping in isolation; this file exercises the SAME
// mapper against the real `powertrain-typical.dbc` from dbc-forge
// and the real `samples/arxml/demo-ecu/` Com-stack files. Per the
// `vendor-format-parser-needs-real-fixture-pre-ship` PKM permanent
// note, hand-crafted fixtures alone are insufficient for shipping a
// bridge that will face real OEM DBC / ECUC shapes.
//
// v1.23.0 T2 fix-brief #4 — the demo-ecu `Com_Config.arxml` fixture
// now carries a pre-existing `EngState` ComIPdu (matching the
// powertrain-typical.dbc `EngState` message) so idempotency is
// actually exercised against real files.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { dbcParseForBridgeHandler } from '../../../main/ipc/dbcParseForBridgeHandler.js';
import { dbcToComStack } from '../dbcToComStack.js';
import { assertDefinitionRefsResolve } from '../assertDefinitionRefsResolve.js';
import { parseBswmd } from '../../project/bswmd.js';
import type { BswModuleDef } from '../../project/bswmd.js';

const DBC_PATH = join(process.cwd(), 'samples/dbc/powertrain-typical.dbc');
const COM_CONFIG = readFileSync(
  join(process.cwd(), 'samples/arxml/demo-ecu/Com_Config.arxml'),
  'utf-8',
);
const CANIF_CONFIG = readFileSync(
  join(process.cwd(), 'samples/arxml/demo-ecu/CanIf_Config.arxml'),
  'utf-8',
);
const PDUR_CONFIG = readFileSync(
  join(process.cwd(), 'samples/arxml/demo-ecu/PduR_Config.arxml'),
  'utf-8',
);

describe('dbcToComStack real-OEM definition-ref guard', () => {
  function loadBswmd(path: string, shortName: string): BswModuleDef {
    const result = parseBswmd(readFileSync(path, 'utf-8'));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(String(result.error));
    const moduleDef = result.value.modules.find((mod) => mod.shortName === shortName);
    expect(moduleDef).toBeDefined();
    return moduleDef!;
  }

  it('resolves Com and PduR refs against the real demo BSWMDs', () => {
    const dbcRes = dbcParseForBridgeHandler({
      path: DBC_PATH,
      content: readFileSync(DBC_PATH, 'utf-8'),
    });
    expect(dbcRes.ok).toBe(true);
    if (!dbcRes.ok) return;
    const bswmds = new Map<string, BswModuleDef>([
      ['Com', loadBswmd(join(process.cwd(), 'samples/arxml/demo-ecu/bswmd/Bsw_Com_Bswmd.arxml'), 'Com')],
      ['PduR', loadBswmd(join(process.cwd(), 'samples/arxml/demo-ecu/bswmd/Bsw_PduR_Bswmd.arxml'), 'PduR')],
    ]);
    const plan = dbcToComStack({
      dbc: dbcRes.value,
      comConfig: COM_CONFIG,
      canIfConfig: CANIF_CONFIG,
      pduRConfig: PDUR_CONFIG,
      targetNode: 'ECM',
      comSignalDirect: true,
      bswmds,
    });
    const refs = [...plan.comPatches, ...plan.pduRPatches]
      .filter((p): p is Extract<typeof p, { op: 'add-child' }> => p.op === 'add-child')
      .map((p) => p.definitionRef ?? '')
      .filter((ref) => ref !== '');
    const generatedXml = refs.map((ref) => `<DEFINITION-REF>${ref}</DEFINITION-REF>`).join('\n');
    expect(assertDefinitionRefsResolve(generatedXml, bswmds)).toEqual([]);
  });
});

describe('dbcToComStack (T2 real-OEM)', () => {
  it('powertrain-typical.dbc + demo-ecu ARXML: produces non-empty plan', () => {
    const dbcRes = dbcParseForBridgeHandler({
      path: DBC_PATH,
      content: readFileSync(DBC_PATH, 'utf-8'),
    });
    expect(dbcRes.ok).toBe(true);
    if (!dbcRes.ok) return;
    const plan = dbcToComStack({
      dbc: dbcRes.value,
      comConfig: COM_CONFIG,
      canIfConfig: CANIF_CONFIG,
      pduRConfig: PDUR_CONFIG,
      targetNode: 'ECM',
    });
    // At least the unique TransState message produces ComIPdu + signal
    // patches (EngState is skipped due to idempotency).
    expect(plan.comPatches.length).toBeGreaterThanOrEqual(1);
    expect(plan.canIfPatches.length).toBeGreaterThanOrEqual(1);
    expect(plan.pduRPatches.length).toBeGreaterThanOrEqual(1);
  });

  it('idempotency on real demo-ecu Com_Config: pre-existing EngState is skipped', () => {
    const dbcRes = dbcParseForBridgeHandler({
      path: DBC_PATH,
      content: readFileSync(DBC_PATH, 'utf-8'),
    });
    expect(dbcRes.ok).toBe(true);
    if (!dbcRes.ok) return;
    const plan = dbcToComStack({
      dbc: dbcRes.value,
      comConfig: COM_CONFIG,
      canIfConfig: CANIF_CONFIG,
      pduRConfig: PDUR_CONFIG,
      targetNode: 'ECM',
    });
    // #4 (HIGH) — assert EngState is NOT in the add-child plan (the
    // demo-ecu Com_Config fixture pre-carries an EngState ComIPdu,
    // added in the v1.23.0 T2 fix-brief).
    const ipduAdds = plan.comPatches.filter(
      (p): p is Extract<typeof p, { shortName: string }> =>
        p.op === 'add-child' && 'shortName' in p,
    );
    const engStateAdds = ipduAdds.filter((p) => p.shortName === 'EngState');
    expect(engStateAdds).toHaveLength(0);
    // TransState still added (no collision in the fixture).
    const transStateAdds = ipduAdds.filter((p) => p.shortName === 'TransState');
    expect(transStateAdds.length).toBeGreaterThanOrEqual(1);
  });
});
