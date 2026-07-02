// @vitest-environment node
//
// parseDbcHandler — v1.21.0 Bug #5 (HIGH: DBC 解析器装上未接入).
//
// Behaviour pinned by tests (Bug #5 Phase 2 — RED):
//   1. Happy path: minimal DBC string → ok=true with summary
//      (version, nodes[], messages[] with id/name/dlc/signalCount/transmitter).
//   2. Cap exceeded (>32 MiB) → ok=false with kind='dbc-too-large'.
//   3. Malformed input → ok=false with kind='dbc-malformed' (the
//      @dbc-forge/core parser throws on syntax errors; we surface
//      that as the parse failure kind).
//   4. Empty input → ok=false kind='dbc-malformed' (parser throws).
//   5. nodeCount / messageCount match the actual arrays (defensive —
//      a refactor that re-derives them wrong is caught).
//   6. Signals per message are counted correctly (minimal fixture
//      has 1 signal; a 2-signal fixture would catch an off-by-one).

import { describe, expect, it } from 'vitest';

import { parseDbcHandler, DBC_MAX_BYTES } from '../parseDbcHandler.js';

const MINIMAL_DBC = [
  'VERSION ""',
  '',
  'NS_ :',
  '',
  'BS_:',
  '',
  'BU_: ECU1 ECU2',
  '',
  'BO_ 100 Frame_A: 8 ECU1',
  ' SG_ Signal_A : 0|8@1+ (1,0) [0|255] "" Vector__XXX',
  '',
  'BO_ 200 Frame_B: 4 ECU2',
  ' SG_ Signal_B1 : 0|8@1+ (1,0) [0|255] "" Vector__XXX',
  ' SG_ Signal_B2 : 8|8@1+ (1,0) [0|255] "" Vector__XXX',
  '',
].join('\n');

describe('parseDbcHandler (Bug #5)', () => {
  it('exports a 32 MiB cap matching the ARXML handler convention', () => {
    expect(DBC_MAX_BYTES).toBe(32 * 1024 * 1024);
  });

  it('happy path: parses minimal DBC into a renderer-friendly summary', () => {
    const res = parseDbcHandler({ path: '/tmp/min.dbc', content: MINIMAL_DBC });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.version).toBe('');
    // Two ECUs (ECU1, ECU2); @dbc-forge normalises into the `nodes` list.
    expect(res.value.nodeCount).toBe(2);
    expect(res.value.nodes).toContain('ECU1');
    expect(res.value.nodes).toContain('ECU2');
    // Two messages.
    expect(res.value.messageCount).toBe(2);
    expect(res.value.messages).toHaveLength(2);
    const frameA = res.value.messages.find((m) => m.id === 100);
    expect(frameA).toBeDefined();
    expect(frameA?.name).toBe('Frame_A');
    expect(frameA?.dlc).toBe(8);
    expect(frameA?.signalCount).toBe(1);
    expect(frameA?.transmitter).toBe('ECU1');
    const frameB = res.value.messages.find((m) => m.id === 200);
    expect(frameB?.signalCount).toBe(2);
    expect(frameB?.dlc).toBe(4);
  });

  it('cap exceeded: returns ok=false kind="dbc-too-large"', () => {
    // Construct a string one code unit over the cap. We don't need to
    // ship a real 32 MiB DBC — the cap check fires before parsing.
    const tooLarge = 'x'.repeat(DBC_MAX_BYTES + 1);
    const res = parseDbcHandler({ path: '/tmp/big.dbc', content: tooLarge });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('dbc-too-large');
    expect(res.error.message).toMatch(/too large/i);
  });

  it('at-cap is allowed (inclusive boundary)', () => {
    // One under the cap is too large (caught above). Exactly at the
    // cap is allowed by the handler; the parse itself will then fail
    // because 'x' is not valid DBC, so we expect dbc-malformed here.
    const atCap = 'x'.repeat(DBC_MAX_BYTES);
    const res = parseDbcHandler({ path: '/tmp/at.dbc', content: atCap });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('dbc-malformed');
  });

  it('malformed DBC: returns ok=false kind="dbc-malformed"', () => {
    const garbage = 'this is not a valid DBC file';
    const res = parseDbcHandler({ path: '/tmp/bad.dbc', content: garbage });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('dbc-malformed');
    expect(res.error.message.length).toBeGreaterThan(0);
  });

  it('empty input: returns ok=false kind="dbc-malformed"', () => {
    const res = parseDbcHandler({ path: '/tmp/empty.dbc', content: '' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('dbc-malformed');
  });

  it('non-string content: returns ok=false kind="dbc-malformed"', () => {
    // Mirrors parseArxmlHandler.ts:49-57 — defensive against a
    // tampered preload bridge. The renderer should always send a
    // string but we still guard.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = parseDbcHandler({ path: '/tmp/x.dbc', content: 42 as any });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('dbc-malformed');
  });
});
