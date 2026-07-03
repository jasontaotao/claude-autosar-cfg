// v1.23.0 T2 — Failure-mode regression tests for the 5 blockers from
// the code-review of commit 8ba6e6d. Each test below asserts ONE
// behavior that the GREEN-phase implementation must satisfy:
//
//   Blocker #1 (CRITICAL) — paths derived from parsed ARXML, not hardcoded.
//   Blocker #2 (HIGH)     — buildContainer reads <CONTAINERS> wrapper.
//   Blocker #3 (HIGH)     — add-child step carries explicit kind discriminator.
//   Blocker #5 (HIGH)     — Rx vs Tx dispatched on msg.transmitter === targetNode.
//
// (Blocker #4 — real-OEM idempotency fidelity — lives in the .real.test.ts
// file because it requires fixture mutation.)

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DbcSummaryWithSignals } from '../../../main/ipc/dbcParseForBridgeHandler.js';
import * as parserModule from '../../arxml/parser.js';
import { parseArxml } from '../../arxml/parser.js';
import type { ArxmlContainer, ArxmlModule } from '../../arxml/types.js';
import { dbcToComStack } from '../dbcToComStack.js';

const REAL_COM = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Com</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>Com</SHORT-NAME>
          <CONTAINERS>
            <ECUC-CONTAINER-VALUE>
              <SHORT-NAME>ComConfig</SHORT-NAME>
              <CONTAINERS>
                <ECUC-CONTAINER-VALUE>
                  <SHORT-NAME>ComIPdu_1</SHORT-NAME>
                </ECUC-CONTAINER-VALUE>
              </CONTAINERS>
            </ECUC-CONTAINER-VALUE>
          </CONTAINERS>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

const REAL_CANIF = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>CanIf</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>CanIf</SHORT-NAME>
          <CONTAINERS>
            <ECUC-CONTAINER-VALUE>
              <SHORT-NAME>CanIfInitCfg</SHORT-NAME>
              <SUB-CONTAINERS></SUB-CONTAINERS>
            </ECUC-CONTAINER-VALUE>
          </CONTAINERS>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

const REAL_PDUR = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>PduR</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>PduR</SHORT-NAME>
          <CONTAINERS>
            <ECUC-CONTAINER-VALUE>
              <SHORT-NAME>PduRRoutingPaths</SHORT-NAME>
              <SUB-CONTAINERS></SUB-CONTAINERS>
            </ECUC-CONTAINER-VALUE>
          </CONTAINERS>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

const SAMPLE_DBC: DbcSummaryWithSignals = {
  version: 'v1',
  nodeCount: 2,
  messageCount: 2,
  nodes: ['ECM', 'TCM'],
  messages: [
    { id: 272, name: 'EngState', dlc: 8, transmitter: 'ECM', signalCount: 1 },
    { id: 544, name: 'TransState', dlc: 8, transmitter: 'TCM', signalCount: 1 },
  ],
  signals: [
    {
      messageId: 272,
      name: 'EngineRPM',
      startBit: 0,
      length: 16,
      byteOrder: 'little-endian',
      valueType: 'unsigned',
      factor: 0.25,
      offset: 0,
      min: 0,
      max: 16383.75,
      unit: 'rpm',
      receivers: ['TCM'],
    },
    {
      messageId: 544,
      name: 'Gear',
      startBit: 0,
      length: 4,
      byteOrder: 'little-endian',
      valueType: 'unsigned',
      factor: 1,
      offset: 0,
      min: 0,
      max: 7,
      unit: '',
      receivers: ['ECM'],
    },
  ],
};

describe('dbcToComStack fixes (T2 blockers)', () => {
  // -------------------------------------------------------------------
  // Blocker #1 (CRITICAL) — paths derived from ARXML, not hardcoded.
  // -------------------------------------------------------------------
  it('#1 CRITICAL: discovers container shortNames from real demo-ecu (CanIfInitCfg / PduRRoutingPaths)', () => {
    const plan = dbcToComStack({
      dbc: SAMPLE_DBC,
      comConfig: REAL_COM,
      canIfConfig: REAL_CANIF,
      pduRConfig: REAL_PDUR,
      targetNode: 'ECM',
    });
    // EngState (transmitter=ECM matches targetNode ECM → Tx) emits a
    // CanIfTxPdu at /CanIf/CanIf/CanIfInitCfg/<...>.
    // TransState (transmitter=TCM != ECM → Rx) emits a CanIfRxPdu at
    // /CanIf/CanIf/CanIfInitCfg/<...>.
    const txAdds = plan.canIfPatches.filter(
      (p): p is Extract<typeof p, { parentPath: string }> =>
        p.op === 'add-child' && p.kind === 'canif-tx-pdu',
    );
    const rxAdds = plan.canIfPatches.filter(
      (p): p is Extract<typeof p, { parentPath: string }> =>
        p.op === 'add-child' && p.kind === 'canif-rx-pdu',
    );
    expect(txAdds.length).toBeGreaterThanOrEqual(1);
    expect(rxAdds.length).toBeGreaterThanOrEqual(1);
    // Confirm the parentPath uses the discovered CanIfInitCfg (not the
    // hardcoded CanIfInitConfig).
    for (const add of txAdds) {
      expect(add.parentPath).toContain('CanIfInitCfg');
      expect(add.parentPath).not.toContain('CanIfInitConfig');
    }
    // Confirm PduRRoutingPaths (not PduRRoutingTables).
    for (const add of plan.pduRPatches) {
      if (add.op === 'add-child') {
        expect(add.parentPath).toContain('PduRRoutingPaths');
        expect(add.parentPath).not.toContain('PduRRoutingTables');
      }
    }
  });

  // -------------------------------------------------------------------
  // Blocker #2 (HIGH) — buildContainer reads <CONTAINERS> wrapper.
  // -------------------------------------------------------------------
  it('#2 HIGH: parser buildContainer enumerates children wrapped in <CONTAINERS>', () => {
    // Parse a doc whose container has children inside <CONTAINERS>
    // (not <SUB-CONTAINERS>) — the real demo-ecu shape.
    const docRes = parseArxml(REAL_COM);
    expect(docRes.ok).toBe(true);
    if (!docRes.ok) return;
    const rootPkg = docRes.value.packages[0];
    expect(rootPkg).toBeDefined();
    if (rootPkg === undefined) return;
    const comModule = rootPkg.elements[0];
    expect(comModule).toBeDefined();
    if (comModule === undefined) return;
    if (comModule.kind !== 'module') return;
    // Com module should have ComConfig container child…
    const comConfig = comModule.children.find(
      (c): c is ArxmlModule | ArxmlContainer =>
        (c.kind === 'module' || c.kind === 'container') && c.shortName === 'ComConfig',
    );
    expect(comConfig).toBeDefined();
    if (comConfig === undefined) return;
    // …and ComConfig should have ComIPdu_1 child (which is wrapped in
    // <CONTAINERS>, not <SUB-CONTAINERS>).
    const comIpdu1 = comConfig.children.find(
      (c): c is ArxmlModule | ArxmlContainer =>
        (c.kind === 'module' || c.kind === 'container') && c.shortName === 'ComIPdu_1',
    );
    expect(comIpdu1).toBeDefined();
  });

  // -------------------------------------------------------------------
  // Blocker #3 (HIGH) — add-child step carries explicit kind discriminator.
  // -------------------------------------------------------------------
  it('#3 HIGH: add-child steps carry kind discriminator; filters work by kind', () => {
    const plan = dbcToComStack({
      dbc: SAMPLE_DBC,
      comConfig: REAL_COM,
      canIfConfig: REAL_CANIF,
      pduRConfig: REAL_PDUR,
      targetNode: 'ECM',
    });
    // ComIPdu adds have kind=com-ipdu; ComSignal adds have kind=com-signal.
    const comIpduAdds = plan.comPatches.filter(
      (p): p is Extract<typeof p, { kind?: string }> =>
        p.op === 'add-child' && (p as { kind?: string }).kind === 'com-ipdu',
    );
    const comSignalAdds = plan.comPatches.filter(
      (p): p is Extract<typeof p, { kind?: string }> =>
        p.op === 'add-child' && (p as { kind?: string }).kind === 'com-signal',
    );
    expect(comIpduAdds.length).toBeGreaterThanOrEqual(2);
    expect(comSignalAdds.length).toBeGreaterThanOrEqual(2);
  });

  // -------------------------------------------------------------------
  // Blocker #5 (HIGH) — Rx vs Tx dispatched on msg.transmitter === targetNode.
  // -------------------------------------------------------------------
  it('#5 HIGH: targetNode=ECM dispatches EngState (tx=ECM) as Tx, TransState (tx=TCM) as Rx', () => {
    const plan = dbcToComStack({
      dbc: SAMPLE_DBC,
      comConfig: REAL_COM,
      canIfConfig: REAL_CANIF,
      pduRConfig: REAL_PDUR,
      targetNode: 'ECM',
    });
    const txAdds = plan.canIfPatches.filter(
      (p): p is Extract<typeof p, { shortName: string }> =>
        p.op === 'add-child' && p.kind === 'canif-tx-pdu',
    );
    const rxAdds = plan.canIfPatches.filter(
      (p): p is Extract<typeof p, { shortName: string }> =>
        p.op === 'add-child' && p.kind === 'canif-rx-pdu',
    );
    const txNames = txAdds.map((p) => p.shortName);
    const rxNames = rxAdds.map((p) => p.shortName);
    expect(txNames).toContain('EngState');
    expect(rxNames).toContain('TransState');
  });

  it('#5 HIGH: targetNode=TCM flips the dispatch (TransState=Tx, EngState=Rx)', () => {
    const plan = dbcToComStack({
      dbc: SAMPLE_DBC,
      comConfig: REAL_COM,
      canIfConfig: REAL_CANIF,
      pduRConfig: REAL_PDUR,
      targetNode: 'TCM',
    });
    const txAdds = plan.canIfPatches.filter(
      (p): p is Extract<typeof p, { shortName: string }> =>
        p.op === 'add-child' && p.kind === 'canif-tx-pdu',
    );
    const rxAdds = plan.canIfPatches.filter(
      (p): p is Extract<typeof p, { shortName: string }> =>
        p.op === 'add-child' && p.kind === 'canif-rx-pdu',
    );
    const txNames = txAdds.map((p) => p.shortName);
    const rxNames = rxAdds.map((p) => p.shortName);
    expect(txNames).toContain('TransState');
    expect(rxNames).toContain('EngState');
  });

  it('#5 HIGH: omitting targetNode falls back to Tx for every message (legacy behavior)', () => {
    const plan = dbcToComStack({
      dbc: SAMPLE_DBC,
      comConfig: REAL_COM,
      canIfConfig: REAL_CANIF,
      pduRConfig: REAL_PDUR,
      // targetNode omitted intentionally
    });
    const rxAdds = plan.canIfPatches.filter(
      (p) => p.op === 'add-child' && p.kind === 'canif-rx-pdu',
    );
    expect(rxAdds).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// v1.23.1 T3 — dead-code cleanups (3 MEDIUMs from T2 fix review).
//
//   MEDIUM #1: pin the empty-DBC edge-case contract (messages:[] and
//              signals:[]). The existing `?.filter ?? []` already
//              handles these defensively; the tests pin the contract.
//
//   MEDIUM #2: extractExistingChildShortNames must surface a
//              console.warn when parseArxml throws (instead of
//              silently returning an empty Set). Tests below cover
//              both the throw path (spy on parseArxml) and the
//              normal-return path (real XML).
//
//   MEDIUM #3: focused walk test for discoverPrimaryContainer with a
//              nested ECUC module structure (Com > Com > ComConfig).
// ---------------------------------------------------------------------

describe('dbCToComStack edge cases (v1.23.1 T3)', () => {
  it('empty DBC (messages: []) returns all-empty plan without throwing', () => {
    const emptyDbc: DbcSummaryWithSignals = {
      version: '',
      nodeCount: 0,
      messageCount: 0,
      nodes: [],
      messages: [],
      signals: [],
    };
    const plan = dbcToComStack({
      dbc: emptyDbc,
      comConfig: REAL_COM,
      canIfConfig: REAL_CANIF,
      pduRConfig: REAL_PDUR,
    });
    expect(plan.comPatches).toHaveLength(0);
    expect(plan.canIfPatches).toHaveLength(0);
    expect(plan.pduRPatches).toHaveLength(0);
  });

  it('empty DBC (signals: [] but messages non-empty) adds ComIPdu without ComSignal children', () => {
    const noSignalsDbc: DbcSummaryWithSignals = {
      version: 'v1',
      nodeCount: 2,
      messageCount: 1,
      nodes: ['ECM', 'TCM'],
      messages: [{ id: 272, name: 'EngState', dlc: 8, transmitter: 'ECM', signalCount: 0 }],
      signals: [],
    };
    const plan = dbcToComStack({
      dbc: noSignalsDbc,
      comConfig: REAL_COM,
      canIfConfig: REAL_CANIF,
      pduRConfig: REAL_PDUR,
    });
    const ipduAdds = plan.comPatches.filter(
      (p): p is Extract<typeof p, { shortName: string }> =>
        p.op === 'add-child' && (p as { kind?: string }).kind === 'com-ipdu',
    );
    const signalAdds = plan.comPatches.filter(
      (p) => p.op === 'add-child' && (p as { kind?: string }).kind === 'com-signal',
    );
    expect(ipduAdds).toHaveLength(1);
    expect(ipduAdds[0]?.shortName).toBe('EngState');
    expect(signalAdds).toHaveLength(0);
  });
});

describe('extractExistingChildShortNames console.warn (v1.23.1 T3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs console.warn when parseArxml throws on the comConfig path', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Force parseArxml to throw — production parseArxml is a Result-returning
    // function that never throws, so we override the export to simulate an
    // unexpected synchronous throw (defensive try/catch is the correct shape).
    vi.spyOn(parserModule, 'parseArxml').mockImplementation(() => {
      throw new Error('forced throw for test');
    });

    dbcToComStack({
      dbc: SAMPLE_DBC,
      comConfig: REAL_COM,
      canIfConfig: REAL_CANIF,
      pduRConfig: REAL_PDUR,
      targetNode: 'ECM',
    });

    expect(warnSpy).toHaveBeenCalled();
    // The warn message must identify which slot failed — the comConfig slot
    // is one of the four ARXML inputs the bridge reads.
    const firstCallArgs = warnSpy.mock.calls[0] ?? [];
    const firstArg = String(firstCallArgs[0] ?? '');
    expect(firstArg).toMatch(/parseArxml|comConfig|com/i);
  });
});

describe('discoverPrimaryContainer focused walk (v1.23.1 T3)', () => {
  it('walks nested ECUC module (Com > Com > ComConfig) and adds both DBC messages as new', () => {
    // Nested ECUC module structure: top-level AR-PACKAGE > ECUC-MODULE-
    // CONFIGURATION-VALUES (shortName=Com) > CONTAINERS > ComConfig.
    const nestedCom = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Com</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>Com</SHORT-NAME>
          <DEFINITION-REF DEST="ECUC-MODULE-DEF">/AUTOSAR/Com</DEFINITION-REF>
          <CONTAINERS>
            <ECUC-CONTAINER-VALUE>
              <SHORT-NAME>ComConfig</SHORT-NAME>
              <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/AUTOSAR/Com/ComConfig</DEFINITION-REF>
            </ECUC-CONTAINER-VALUE>
          </CONTAINERS>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;
    const plan = dbcToComStack({
      dbc: SAMPLE_DBC,
      comConfig: nestedCom,
      canIfConfig: REAL_CANIF,
      pduRConfig: REAL_PDUR,
      targetNode: 'ECM',
    });
    // Both DBC messages (EngState + TransState) must be added as new
    // because the nested ComConfig is empty.
    const ipduAdds = plan.comPatches.filter(
      (p): p is Extract<typeof p, { shortName: string }> =>
        p.op === 'add-child' && (p as { kind?: string }).kind === 'com-ipdu',
    );
    expect(ipduAdds).toHaveLength(2);
    expect(ipduAdds.map((p) => p.shortName).sort()).toEqual(['EngState', 'TransState']);
  });
});
