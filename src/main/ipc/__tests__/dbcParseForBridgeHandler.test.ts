// @vitest-environment node
//
// dbcParseForBridgeHandler — v1.23.0 T1 (Extended DBC parser with signals).
//
// Parallel IPC handler that re-parses a DBC file and returns a
// signal-level-extended summary. The existing `parseDbcHandler`
// returns `DbcSummary` WITHOUT signal detail (see comment block at
// `src/shared/types.ts:131-145`). For the Com-stack bridge we need
// per-signal metadata (startBit, length, byteOrder, valueType, factor,
// offset, min, max, unit, receivers). The viewer-side
// `parseDbcHandler.ts` stays unchanged.
//
// Behaviour pinned by tests (RED):
//   1. Happy path: returns ok=true with extended summary including
//      `messages` AND a flat `signals` list.
//   2. signal fields populated (name, startBit, length, byteOrder,
//      valueType, factor, offset, unit, receivers).
//   3. Sign a signed signal correctly (OilTemp @1-).
//   4. Cap exceeded: returns ok=false kind="dbc-too-large".
//   5. Malformed: returns ok=false kind="dbc-malformed".

import { describe, expect, it } from 'vitest';

import { dbcParseForBridgeHandler } from '../dbcParseForBridgeHandler.js';

const MINIMAL_DBC_WITH_SIGNALS = `VERSION "v1"
NS_ :

BS_:

BU_: ECM TCM

BO_ 272 EngState: 8 ECM
 SG_ EngineRPM : 0|16@1+ (0.25,0) [0|16383.75] "rpm" TCM
 SG_ ThrottlePos : 16|8@1+ (0.392157,0) [0|100] "%" TCM

BO_ 544 TransState: 8 TCM
 SG_ Gear : 0|4@1+ (1,0) [0|7] "" ECM
 SG_ OilTemp : 8|8@1- (1,-40) [-40|215] "degC" ECM
`;

describe('dbcParseForBridgeHandler (T1)', () => {
  it('returns ok=true with extended summary including signals', () => {
    const res = dbcParseForBridgeHandler({
      path: '/tmp/p.dbc',
      content: MINIMAL_DBC_WITH_SIGNALS,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.messages).toHaveLength(2);
    expect(res.value.signals).toHaveLength(4);
  });

  it('signal fields populated: name, startBit, length, byteOrder, valueType, factor, offset', () => {
    const res = dbcParseForBridgeHandler({
      path: '/tmp/p.dbc',
      content: MINIMAL_DBC_WITH_SIGNALS,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const sig = res.value.signals[0];
    expect(sig).toBeDefined();
    expect(sig?.messageId).toBe(272);
    expect(sig?.name).toBe('EngineRPM');
    expect(sig?.startBit).toBe(0);
    expect(sig?.length).toBe(16);
    expect(sig?.byteOrder).toBe('little-endian');
    expect(sig?.valueType).toBe('unsigned');
    expect(sig?.factor).toBeCloseTo(0.25);
    expect(sig?.offset).toBe(0);
    expect(sig?.unit).toBe('rpm');
    expect(sig?.receivers).toEqual(['TCM']);
  });

  it('signs a signed signal correctly (OilTemp @1-)', () => {
    const res = dbcParseForBridgeHandler({
      path: '/tmp/p.dbc',
      content: MINIMAL_DBC_WITH_SIGNALS,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const oilTemp = res.value.signals.find((s) => s.name === 'OilTemp');
    expect(oilTemp?.valueType).toBe('signed');
    expect(oilTemp?.offset).toBe(-40);
  });

  it('cap exceeded: returns ok=false kind="dbc-too-large"', () => {
    const tooLarge = 'x'.repeat(33 * 1024 * 1024);
    const res = dbcParseForBridgeHandler({ path: '/tmp/big.dbc', content: tooLarge });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('dbc-too-large');
  });

  it('malformed: returns ok=false kind="dbc-malformed"', () => {
    const res = dbcParseForBridgeHandler({ path: '/tmp/bad.dbc', content: 'not a dbc' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('dbc-malformed');
  });
});
