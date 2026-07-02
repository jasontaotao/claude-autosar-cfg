// @vitest-environment node
//
// parseOdxHandler — v1.22.0 T1 (HIGH: ODX 完全没做).
//
// Behaviour pinned by tests (T1 Phase 2 — RED):
//   1. Happy path: minimal ODX-D string → ok=true with summary
//      (dtc[] with id+name+troubleCode; did[] with id+name;
//      routine[] with id+name). Counts pre-derived.
//   2. Cap exceeded (>32 MiB) → ok=false with kind='odx-too-large'.
//   3. Malformed XML → ok=false kind='odx-malformed' (XML parse fails).
//   4. Empty input → ok=false kind='odx-malformed'.
//   5. Non-string content → ok=false kind='odx-malformed'.
//   6. Missing <ODX> root → ok=false kind='odx-malformed'.
//   7. DTC / DID / Routine counts match the actual arrays (defensive).
//
// ODX-D structure pinned by fixture:
//   <ODX> root → <DIAG-LAYER-CONTAINER> → <DIAG-LAYER> (BASE-VARIANT)
//     → <DTC-DOPS> containing N × <DTC-DOP>
//     → <DATA-OBJECT-PROPS> containing N × <DID> (or DOP-DATA-OBJECT-PROP)
//     → <REQUESTS> + <POS-RESPONSES> for services
//
// For T1 we extract the minimum surface that the v1.22.0 T2 viewer
// needs: DTC list, DID list, Routine list. The full DIAG-LAYER state
// chart + env-data + functional-group are NOT extracted (T1 = minimum
// viable backend; deeper shape deferred to v1.22.x follow-up if a
// future T wants cross-ref).

import { describe, expect, it } from 'vitest';

import { parseOdxHandler, ODX_MAX_BYTES } from '../parseOdxHandler.js';

const MINIMAL_ODX = `<?xml version="1.0" encoding="UTF-8"?>
<ODX MODEL-VERSION="2.2.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <DIAG-LAYER-CONTAINER>
    <DIAG-LAYER ID="DL_BaseVariant" SHORT-NAME="BaseVariant">
      <DTC-DOPS>
        <DTC-DOP ID="DTC_001" SHORT-NAME="DTC_EngineOverheat">
          <DTC TROUBLE-CODE="0x123456" SHORT-NAME="P0123" TEXT="Engine coolant temperature too high"/>
        </DTC-DOP>
        <DTC-DOP ID="DTC_002" SHORT-NAME="DTC_BatteryLow">
          <DTC TROUBLE-CODE="0xABCDEF" SHORT-NAME="P0562" TEXT="System voltage low"/>
        </DTC-DOP>
      </DTC-DOPS>
      <DATA-OBJECT-PROPS>
        <DOP-BASE-DATA-OBJECT-PROP ID="DOP_DID_001" SHORT-NAME="DID_VIN">
          <DATA-OBJECT-PROP-REF ID-REF="DID_001"/>
        </DOP-BASE-DATA-OBJECT-PROP>
      </DATA-OBJECT-PROPS>
      <DID-OBJECTS>
        <DID-OBJECT ID="DID_001" SHORT-NAME="DID_VIN_Read">
          <DATA-OBJECT-PROP-REF ID-REF="DOP_DID_001"/>
        </DID-OBJECT>
      </DID-OBJECTS>
      <REQUESTS>
        <REQUEST ID="REQ_001" SHORT-NAME="Routine_Check_Req">
          <PARAMS>
            <PARAM SHORT-NAME="RoutineId" SEMANTIC="DATA-ID" BYTE-POSITION="0"/>
          </PARAMS>
        </REQUEST>
      </REQUESTS>
      <POS-RESPONSES>
        <POS-RESPONSE ID="PR_001" SHORT-NAME="Routine_Check_Resp">
          <PARAMS>
            <PARAM SHORT-NAME="Status" SEMANTIC="DATA-ID" BYTE-POSITION="0"/>
          </PARAMS>
        </POS-RESPONSE>
      </POS-RESPONSES>
    </DIAG-LAYER>
  </DIAG-LAYER-CONTAINER>
</ODX>
`;

describe('parseOdxHandler (T1)', () => {
  it('exports a 32 MiB cap matching the DBC / ARXML / BSWMD convention', () => {
    expect(ODX_MAX_BYTES).toBe(32 * 1024 * 1024);
  });

  it('happy path: parses minimal ODX-D into a renderer-friendly summary', () => {
    const res = parseOdxHandler({ path: '/tmp/min.odx', content: MINIMAL_ODX });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.dtcCount).toBe(2);
    expect(res.value.didCount).toBe(1);
    expect(res.value.routineCount).toBe(1);
    expect(res.value.dtcs).toHaveLength(2);
    expect(res.value.dids).toHaveLength(1);
    expect(res.value.routines).toHaveLength(1);
  });

  it('happy path: DTC fields populated (id, shortName, troubleCode, displayCode)', () => {
    const res = parseOdxHandler({ path: '/tmp/min.odx', content: MINIMAL_ODX });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const dtc = res.value.dtcs[0];
    expect(dtc).toBeDefined();
    expect(dtc?.id).toBe('DTC_001');
    expect(dtc?.shortName).toBe('DTC_EngineOverheat');
    // Trouble code: parser preserves raw (0x123456) and renders a
    // hex-without-prefix display value.
    expect(dtc?.troubleCode).toBe('0x123456');
    expect(dtc?.displayCode).toBe('123456');
  });

  it('happy path: DID fields populated (id, shortName)', () => {
    const res = parseOdxHandler({ path: '/tmp/min.odx', content: MINIMAL_ODX });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const did = res.value.dids[0];
    expect(did?.id).toBe('DID_001');
    expect(did?.shortName).toBe('DID_VIN_Read');
  });

  it('happy path: Routine fields populated (id, shortName)', () => {
    const res = parseOdxHandler({ path: '/tmp/min.odx', content: MINIMAL_ODX });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const routine = res.value.routines[0];
    expect(routine?.id).toBe('REQ_001');
    expect(routine?.shortName).toBe('Routine_Check_Req');
  });

  it('cap exceeded: returns ok=false kind="odx-too-large"', () => {
    const tooLarge = 'x'.repeat(ODX_MAX_BYTES + 1);
    const res = parseOdxHandler({ path: '/tmp/big.odx', content: tooLarge });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('odx-too-large');
    expect(res.error.message).toMatch(/too large/i);
  });

  it('at-cap is allowed (inclusive boundary; parse will fail as malformed)', () => {
    const atCap = 'x'.repeat(ODX_MAX_BYTES);
    const res = parseOdxHandler({ path: '/tmp/at.odx', content: atCap });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('odx-malformed');
  });

  it('malformed XML: returns ok=false kind="odx-malformed"', () => {
    const garbage = 'this is not a valid ODX file';
    const res = parseOdxHandler({ path: '/tmp/bad.odx', content: garbage });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('odx-malformed');
    expect(res.error.message.length).toBeGreaterThan(0);
  });

  it('empty input: returns ok=false kind="odx-malformed"', () => {
    const res = parseOdxHandler({ path: '/tmp/empty.odx', content: '' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('odx-malformed');
  });

  it('non-string content: returns ok=false kind="odx-malformed"', () => {
    // Defensive against a tampered preload bridge.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = parseOdxHandler({ path: '/tmp/x.odx', content: 42 as any });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('odx-malformed');
  });

  it('missing <ODX> root: returns ok=false kind="odx-malformed"', () => {
    const noOdxRoot = '<?xml version="1.0"?><OTHER>not odx</OTHER>';
    const res = parseOdxHandler({ path: '/tmp/no-root.odx', content: noOdxRoot });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('odx-malformed');
  });
});
