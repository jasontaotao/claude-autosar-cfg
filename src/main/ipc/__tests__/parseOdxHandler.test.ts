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
          <DTC ID="DTC_001_001" TROUBLE-CODE="0x123456" SHORT-NAME="P0123" TEXT="Engine coolant temperature too high"/>
        </DTC-DOP>
        <DTC-DOP ID="DTC_002" SHORT-NAME="DTC_BatteryLow">
          <DTC ID="DTC_002_001" TROUBLE-CODE="0xABCDEF" SHORT-NAME="P0562" TEXT="System voltage low"/>
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
    expect(dtc?.id).toBe('DTC_001_001');
    // T4 real-fixture fix: the parser now prefers the `<DTC>`'s own
    // SHORT-NAME over the DTC-DOP's. The hand-crafted T1 fixture
    // puts `SHORT-NAME="P0123"` on the DTC element (the SAE J2012
    // code) and the DOP-name on the DTC-DOP; the real Vector
    // export does the same. Assert the SAE J2012 form is surfaced.
    expect(dtc?.shortName).toBe('P0123');
    // Trouble code: parser preserves the raw wire value (0x123456
    // in the hand-crafted fixture, decimal in the real Vector
    // export — both forms supported via the child-element fallback).
    expect(dtc?.troubleCode).toBe('0x123456');
    // displayCode is now the SAE J2012 form from
    // <DISPLAY-TROUBLE-CODE>; the hand-crafted fixture has none
    // so the field is empty (real Vector files populate it).
    expect(dtc?.displayCode).toBe('');
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

// New fixture: ODX-D with a 0x22 REQUEST that has DIAG-CODED-TYPE.
const ODX_WITH_DID_DATA = `<?xml version="1.0" encoding="UTF-8"?>
<ODX MODEL-VERSION="2.2.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <DIAG-LAYER-CONTAINER>
    <DIAG-LAYER ID="DL_Base" SHORT-NAME="BaseVariant">
      <DTC-DOPS/>
      <DID-OBJECTS/>
      <REQUESTS>
        <REQUEST ID="REQ_RDBI" SHORT-NAME="RDBI_DID_F186">
          <PARAMS>
            <PARAM SEMANTIC="SERVICE-ID" BYTE-POSITION="0">
              <CODED-VALUE>34</CODED-VALUE>
              <DIAG-CODED-TYPE BASE-DATA-TYPE="A_UINT32" xsi:type="STANDARD-LENGTH-TYPE">
                <BIT-LENGTH>8</BIT-LENGTH>
              </DIAG-CODED-TYPE>
            </PARAM>
            <PARAM SEMANTIC="DATA-PARAM" BYTE-POSITION="1">
              <CODED-VALUE>61446</CODED-VALUE>
              <DIAG-CODED-TYPE BASE-TYPE-ENCODING="NONE" BASE-DATA-TYPE="A_UINT32" xsi:type="STANDARD-LENGTH-TYPE">
                <BIT-LENGTH>16</BIT-LENGTH>
              </DIAG-CODED-TYPE>
            </PARAM>
          </PARAMS>
        </REQUEST>
        <REQUEST ID="REQ_NOSVC" SHORT-NAME="Routine_Check">
          <PARAMS>
            <PARAM SEMANTIC="DATA-ID" BYTE-POSITION="0"/>
          </PARAMS>
        </REQUEST>
      </REQUESTS>
    </DIAG-LAYER>
  </DIAG-LAYER-CONTAINER>
</ODX>
`;

describe('parseOdxHandler (v1.24.x PATCH — ODX-INSTANCE DID data)', () => {
  it('surfaces DIAG-CODED-TYPE from 0x22 REQUEST DID-value PARAM', () => {
    const res = parseOdxHandler({ path: '/x.odx-d', content: ODX_WITH_DID_DATA });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // The 0x22 REQUEST (SERVICE-ID CODED-VALUE=34) is classified as a DID.
    // Expect exactly 1 DID with data populated.
    const didsWithData = res.value.dids.filter((d) => d.data !== undefined);
    expect(didsWithData.length).toBe(1);
    expect(didsWithData[0]!.data).toEqual({
      dataType: 'A_UINT32',
      encoding: 'NONE',
      bitLength: 16,
    });
  });

  it('falls back gracefully when 0x22 REQUEST has no DIAG-CODED-TYPE', () => {
    // Custom fixture with a 0x22 REQUEST that has only SERVICE-ID PARAM
    // (no DID-value PARAM with DIAG-CODED-TYPE).
    const ODX_NO_DID_DATA = `<?xml version="1.0"?>
<ODX>
  <DIAG-LAYER-CONTAINER>
    <DIAG-LAYER ID="DL" SHORT-NAME="B">
      <DTC-DOPS/>
      <DID-OBJECTS/>
      <REQUESTS>
        <REQUEST ID="R" SHORT-NAME="R">
          <PARAMS>
            <PARAM SEMANTIC="SERVICE-ID">
              <CODED-VALUE>34</CODED-VALUE>
            </PARAM>
          </PARAMS>
        </REQUEST>
      </REQUESTS>
    </DIAG-LAYER>
  </DIAG-LAYER-CONTAINER>
</ODX>
`;
    const res = parseOdxHandler({ path: '/x.odx-d', content: ODX_NO_DID_DATA });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // 1 DID (the 0x22 REQUEST), but data is undefined.
    expect(res.value.dids.length).toBe(1);
    expect(res.value.dids[0]!.data).toBeUndefined();
  });

  it('handles DIDs from <DID-OBJECT> (legacy spec shape) without DIAG-CODED-TYPE', () => {
    // Reuse the existing MINIMAL_ODX fixture from the T1 describe block.
    // It has 1 DID (DID_VIN_Read) from <DID-OBJECT>; data should be undefined.
    const res = parseOdxHandler({ path: '/tmp/min.odx', content: MINIMAL_ODX });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.dids.length).toBe(1);
    expect(res.value.dids[0]!.shortName).toBe('DID_VIN_Read');
    expect(res.value.dids[0]!.data).toBeUndefined();
  });

  it('classifies 0x22 REQUEST as DID (not Routine) and surfaces data', () => {
    // ODX_WITH_DID_DATA has 1 DID (0x22 REQUEST) + 1 Routine (no SERVICE-ID).
    // Total: didCount=1, routineCount=1.
    const res = parseOdxHandler({ path: '/x.odx-d', content: ODX_WITH_DID_DATA });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.didCount).toBe(1);
    expect(res.value.routineCount).toBe(1);
    expect(res.value.routines[0]!.shortName).toBe('Routine_Check');
  });
});

describe('parseOdxHandler (numeric identifier extraction)', () => {
  const ODX_WITH_IDENTIFIERS = `<?xml version="1.0" encoding="UTF-8"?>
<ODX>
  <DIAG-LAYER-CONTAINER>
    <DIAG-LAYER ID="DL" SHORT-NAME="BaseVariant">
      <DTC-DOPS/>
      <DID-OBJECTS/>
      <REQUESTS>
        <REQUEST ID="DID_REQ" SHORT-NAME="RQ_CellVolt_JG_Read">
          <PARAMS>
            <PARAM SEMANTIC="SERVICE-ID"><CODED-VALUE>34</CODED-VALUE></PARAM>
            <PARAM SEMANTIC="ID" SHORT-NAME="RecordDataIdentifier"><CODED-VALUE>258</CODED-VALUE></PARAM>
          </PARAMS>
        </REQUEST>
        <REQUEST ID="ROUTINE_REQ" SHORT-NAME="RQ_checkProgrammingPreconditions_Start">
          <PARAMS>
            <PARAM SEMANTIC="SERVICE-ID"><CODED-VALUE>49</CODED-VALUE></PARAM>
            <PARAM SEMANTIC="ID" SHORT-NAME="RoutineIdentifier"><CODED-VALUE>515</CODED-VALUE></PARAM>
          </PARAMS>
        </REQUEST>
        <REQUEST ID="ROUTINE_NO_ID" SHORT-NAME="Routine_NoCodedValue">
          <PARAMS>
            <PARAM SEMANTIC="ID" SHORT-NAME="RoutineIdentifier"/>
          </PARAMS>
        </REQUEST>
      </REQUESTS>
    </DIAG-LAYER>
  </DIAG-LAYER-CONTAINER>
</ODX>
`;

  it('extracts numeric identifiers from SEMANTIC=ID params', () => {
    const res = parseOdxHandler({ content: ODX_WITH_IDENTIFIERS });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.dids.find((d) => d.shortName === 'RQ_CellVolt_JG_Read')?.identifier).toBe(258);
    expect(
      res.value.routines.find((r) => r.shortName === 'RQ_checkProgrammingPreconditions_Start')
        ?.identifier,
    ).toBe(515);
  });

  it('leaves identifier undefined when the ID param has no CODED-VALUE', () => {
    const res = parseOdxHandler({ content: ODX_WITH_IDENTIFIERS });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(
      res.value.routines.find((r) => r.shortName === 'Routine_NoCodedValue')?.identifier,
    ).toBeUndefined();
  });
});
