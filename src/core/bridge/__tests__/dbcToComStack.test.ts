// v1.23.0 T2 — Unit test for the pure DBC→Com-Stack mapper.
//
// Hand-crafted fixtures only — real-OEM round-trip lives in the
// companion file `dbcToComStack.real.test.ts`. The unit test
// isolates the mapper's per-message / per-signal bookkeeping from
// the demo-ecu file shape.
//
// NOTE on fixture shape: real OEM BSWMD-derived value-side ARXMLs
// (including `samples/arxml/demo-ecu/`) wrap child containers in
// `<CONTAINERS>` rather than `<SUB-CONTAINERS>`. The hand-crafted
// fixtures below intentionally use the legacy `<SUB-CONTAINERS>`
// shape so this file stays focused on the mapper's bookkeeping;
// the real-OEM test (separate file) exercises the `<CONTAINERS>`
// wrap + parser's CONTAINERS-walker.

import { describe, expect, it } from 'vitest';

import type { DbcSummaryWithSignals } from '../../../main/ipc/dbcParseForBridgeHandler.js';
import { dbcToComStack } from '../dbcToComStack.js';

const MINIMAL_COM_CONFIG = `<?xml version="1.0" encoding="UTF-8"?>
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
              <SUB-CONTAINERS></SUB-CONTAINERS>
            </ECUC-CONTAINER-VALUE>
          </CONTAINERS>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>
`;

const MINIMAL_CANIF_CONFIG = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>CanIf</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>CanIf</SHORT-NAME>
          <DEFINITION-REF DEST="ECUC-MODULE-DEF">/AUTOSAR/CanIf</DEFINITION-REF>
          <CONTAINERS>
            <ECUC-CONTAINER-VALUE>
              <SHORT-NAME>CanIfInitConfig</SHORT-NAME>
              <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/AUTOSAR/CanIf/CanIfInitConfig</DEFINITION-REF>
              <SUB-CONTAINERS>
                <ECUC-CONTAINER-VALUE>
                  <SHORT-NAME>CanIfTxPduCfgs</SHORT-NAME>
                  <SUB-CONTAINERS></SUB-CONTAINERS>
                </ECUC-CONTAINER-VALUE>
                <ECUC-CONTAINER-VALUE>
                  <SHORT-NAME>CanIfRxPduCfgs</SHORT-NAME>
                  <SUB-CONTAINERS></SUB-CONTAINERS>
                </ECUC-CONTAINER-VALUE>
              </SUB-CONTAINERS>
            </ECUC-CONTAINER-VALUE>
          </CONTAINERS>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>
`;

const MINIMAL_PDUR_CONFIG = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>PduR</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>PduR</SHORT-NAME>
          <DEFINITION-REF DEST="ECUC-MODULE-DEF">/AUTOSAR/PduR</DEFINITION-REF>
          <CONTAINERS>
            <ECUC-CONTAINER-VALUE>
              <SHORT-NAME>PduRRoutingTables</SHORT-NAME>
              <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/AUTOSAR/PduR/PduRRoutingTables</DEFINITION-REF>
              <SUB-CONTAINERS></SUB-CONTAINERS>
            </ECUC-CONTAINER-VALUE>
          </CONTAINERS>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>
`;

const SAMPLE_DBC_SUMMARY: DbcSummaryWithSignals = {
  version: 'v1',
  nodeCount: 2,
  messageCount: 2,
  nodes: ['ECM', 'TCM'],
  messages: [
    { id: 272, name: 'EngState', dlc: 8, transmitter: 'ECM', signalCount: 2 },
    { id: 544, name: 'TransState', dlc: 8, transmitter: 'TCM', signalCount: 2 },
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
      messageId: 272,
      name: 'ThrottlePos',
      startBit: 16,
      length: 8,
      byteOrder: 'little-endian',
      valueType: 'unsigned',
      factor: 0.392157,
      offset: 0,
      min: 0,
      max: 100,
      unit: '%',
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
    {
      messageId: 544,
      name: 'OilTemp',
      startBit: 8,
      length: 8,
      byteOrder: 'little-endian',
      valueType: 'signed',
      factor: 1,
      offset: -40,
      min: -40,
      max: 215,
      unit: 'degC',
      receivers: ['ECM'],
    },
  ],
};

describe('dbcToComStack (T2 unit)', () => {
  it('generates com-ipdu add-child patches (one per DBC message)', () => {
    const plan = dbcToComStack({
      dbc: SAMPLE_DBC_SUMMARY,
      comConfig: MINIMAL_COM_CONFIG,
      canIfConfig: MINIMAL_CANIF_CONFIG,
      pduRConfig: MINIMAL_PDUR_CONFIG,
      targetNode: 'ECM',
    });
    // #3 (HIGH) — filter by `kind`, not by parentPath segment count.
    const comIpduAdds = plan.comPatches.filter(
      (p): p is Extract<typeof p, { kind?: string }> =>
        p.op === 'add-child' && (p as { kind?: string }).kind === 'com-ipdu',
    );
    expect(comIpduAdds).toHaveLength(2);
    expect(comIpduAdds[0]?.shortName).toBe('EngState');
    expect(comIpduAdds[1]?.shortName).toBe('TransState');
  });

  it('generates com-signal add-child patches under each com-ipdu', () => {
    const plan = dbcToComStack({
      dbc: SAMPLE_DBC_SUMMARY,
      comConfig: MINIMAL_COM_CONFIG,
      canIfConfig: MINIMAL_CANIF_CONFIG,
      pduRConfig: MINIMAL_PDUR_CONFIG,
      targetNode: 'ECM',
    });
    const comSignalAdds = plan.comPatches.filter(
      (p): p is Extract<typeof p, { kind?: string }> =>
        p.op === 'add-child' && (p as { kind?: string }).kind === 'com-signal',
    );
    // 4 signals total (2 per message × 2 messages)
    expect(comSignalAdds).toHaveLength(4);
  });

  it('generates CanIfTxPduCfg + CanIfRxPduCfg patches based on targetNode', () => {
    const plan = dbcToComStack({
      dbc: SAMPLE_DBC_SUMMARY,
      comConfig: MINIMAL_COM_CONFIG,
      canIfConfig: MINIMAL_CANIF_CONFIG,
      pduRConfig: MINIMAL_PDUR_CONFIG,
      targetNode: 'ECM',
    });
    // EngState (transmitter=ECM) → Tx; TransState (transmitter=TCM) → Rx.
    const txAdds = plan.canIfPatches.filter(
      (p): p is Extract<typeof p, { shortName: string }> =>
        p.op === 'add-child' && p.kind === 'canif-tx-pdu',
    );
    const rxAdds = plan.canIfPatches.filter(
      (p): p is Extract<typeof p, { shortName: string }> =>
        p.op === 'add-child' && p.kind === 'canif-rx-pdu',
    );
    expect(txAdds).toHaveLength(1);
    expect(txAdds[0]?.shortName).toBe('EngState');
    expect(rxAdds).toHaveLength(1);
    expect(rxAdds[0]?.shortName).toBe('TransState');
  });

  it('generates PduRRoutingPath for each ComIPdu', () => {
    const plan = dbcToComStack({
      dbc: SAMPLE_DBC_SUMMARY,
      comConfig: MINIMAL_COM_CONFIG,
      canIfConfig: MINIMAL_CANIF_CONFIG,
      pduRConfig: MINIMAL_PDUR_CONFIG,
      targetNode: 'ECM',
    });
    const pduRAdds = plan.pduRPatches.filter(
      (p): p is Extract<typeof p, { shortName: string }> => p.op === 'add-child',
    );
    expect(pduRAdds).toHaveLength(2);
    expect(pduRAdds.map((p) => p.shortName).sort()).toEqual(['EngState', 'TransState']);
  });

  it('idempotency: pre-existing EngState in ComConfig is skipped', () => {
    const comConfigWithExisting = MINIMAL_COM_CONFIG.replace(
      '<SUB-CONTAINERS></SUB-CONTAINERS>',
      `<SUB-CONTAINERS>
        <ECUC-CONTAINER-VALUE>
          <SHORT-NAME>EngState</SHORT-NAME>
          <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/AUTOSAR/Com/ComConfig/ComIPdu</DEFINITION-REF>
        </ECUC-CONTAINER-VALUE>
      </SUB-CONTAINERS>`,
    );
    const plan = dbcToComStack({
      dbc: SAMPLE_DBC_SUMMARY,
      comConfig: comConfigWithExisting,
      canIfConfig: MINIMAL_CANIF_CONFIG,
      pduRConfig: MINIMAL_PDUR_CONFIG,
      targetNode: 'ECM',
    });
    const comIpduAdds = plan.comPatches.filter(
      (p): p is Extract<typeof p, { kind?: string; shortName: string }> =>
        p.op === 'add-child' && (p as { kind?: string }).kind === 'com-ipdu',
    );
    const engStateAdds = comIpduAdds.filter((p) => p.shortName === 'EngState');
    expect(engStateAdds).toHaveLength(0);
    // TransState still added
    expect(comIpduAdds.find((p) => p.shortName === 'TransState')).toBeDefined();
  });

  it('discovers legacy shortNames (CanIfInitConfig / PduRRoutingTables) from the value-side file', () => {
    // #1 (CRITICAL) — the bridge reads container shortNames from the
    // parsed ARXML, not from hardcoded constants. The legacy
    // CanIfInitConfig / PduRRoutingTables hand-crafted shape must be
    // discovered too.
    const plan = dbcToComStack({
      dbc: SAMPLE_DBC_SUMMARY,
      comConfig: MINIMAL_COM_CONFIG,
      canIfConfig: MINIMAL_CANIF_CONFIG,
      pduRConfig: MINIMAL_PDUR_CONFIG,
      targetNode: 'ECM',
    });
    // parentPath must use the discovered shortName, not a hardcoded one.
    const txAdd = plan.canIfPatches.find(
      (p): p is Extract<typeof p, { parentPath: string }> =>
        p.op === 'add-child' && p.kind === 'canif-tx-pdu',
    );
    const txParent = txAdd?.parentPath;
    expect(txParent).toContain('CanIfInitConfig');
    expect(txParent).not.toContain('CanIfInitCfg');
    const pduRAdd = plan.pduRPatches.find(
      (p): p is Extract<typeof p, { parentPath: string }> => p.op === 'add-child',
    );
    const pduRParent = pduRAdd?.parentPath;
    if (pduRParent !== undefined) {
      expect(pduRParent).toContain('PduRRoutingTables');
      expect(pduRParent).not.toContain('PduRRoutingPaths');
    } else {
      // Confirm the first pduR patch exists (parentPath is add-child specific).
      expect(plan.pduRPatches.length).toBeGreaterThan(0);
    }
  });
});
