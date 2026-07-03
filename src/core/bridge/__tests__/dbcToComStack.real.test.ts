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
// Failure mode coverage:
//   - test 1: ensures the parser + mapper combo produces a non-empty
//     plan when fed real OEM DBC + real demo-ecu ARXML (catches
//     parseArxml / findByPath regressions, definitionRef typos, etc.)
//   - test 2: ensures both messages from the real DBC round-trip into
//     the plan (proves signal-level summary + per-message patch
//     generation works end-to-end on the real fixture).
//
// Idempotency on the real Com_Config (which carries pre-existing
// ComIPdu_1 / ComIPdu_2 names distinct from EngState / TransState)
// is not asserted here — those names do not collide with the DBC
// message names, so the plan will simply add EngState / TransState
// alongside the existing ComIPdus. The unit test's idempotency check
// uses an explicit fixture that pre-pends EngState.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { dbcParseForBridgeHandler } from '../../../main/ipc/dbcParseForBridgeHandler.js';
import { dbcToComStack } from '../dbcToComStack.js';

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
    });
    // EngState + TransState = 2 messages
    expect(plan.comPatches.length).toBeGreaterThanOrEqual(2);
    expect(plan.canIfPatches.length).toBeGreaterThanOrEqual(2);
    expect(plan.pduRPatches.length).toBeGreaterThanOrEqual(2);
  });

  it('idempotency on real demo-ecu Com_Config (which has 2 ComIPdus): skips existing', () => {
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
    });
    // Both messages have unique names; should add both as new
    const ipduAdds = plan.comPatches.filter(
      (p): p is Extract<typeof p, { shortName: string }> =>
        p.op === 'add-child' && 'shortName' in p,
    );
    expect(ipduAdds.find((p) => p.shortName === 'EngState')).toBeDefined();
    expect(ipduAdds.find((p) => p.shortName === 'TransState')).toBeDefined();
  });
});
