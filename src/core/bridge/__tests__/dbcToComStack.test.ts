// v1.23.0 T2 — Unit test for the pure DBC→Com-Stack mapper.
//
// Hand-crafted fixtures only — real-OEM round-trip lives in the
// companion file `dbcToComStack.real.test.ts`. The unit test
// isolates the mapper's per-message / per-signal bookkeeping from
// the demo-ecu file shape.
//
// NOTE on fixture shape: the project parser (`buildContainer` in
// `src/core/arxml/parser.ts:418`) reads `<SUB-CONTAINERS>` at the
// top level of each `ECUC-CONTAINER-VALUE`, NOT nested inside
// `<CONTAINERS>`. The minimal fixtures below use that shape so the
// idempotency test can detect a pre-existing EngState. Real BSWMD
// emitters wrap the same content inside `<CONTAINERS>`; the demo-ecu
// fixtures exercise that wrap — the real-OEM test (separate file)
// covers that shape.

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
              <SUB-CONTAINERS></SUB-CONTAINERS>
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
  it('generates add-child patches for ComIPdu (one per DBC message)', () => {
    const plan = dbcToComStack({
      dbc: SAMPLE_DBC_SUMMARY,
      comConfig: MINIMAL_COM_CONFIG,
      canIfConfig: MINIMAL_CANIF_CONFIG,
      pduRConfig: MINIMAL_PDUR_CONFIG,
    });
    // A ComIPdu add-child's parentPath is `/Com/Com/ComConfig/<MsgName>`
    // (4 non-empty segments: Com/Com/ComConfig/MsgName); a ComSignal
    // add-child's parentPath is `/Com/Com/ComConfig/<MsgName>/<SigName>`
    // (5 non-empty segments). Filter ComIPdus by segment count.
    const comIpduAdds = plan.comPatches.filter(
      (p): p is Extract<typeof p, { parentPath: string; shortName: string }> => {
        if (p.op !== 'add-child') return false;
        const segments = p.parentPath.split('/').filter((s) => s.length > 0);
        return segments.length === 4;
      },
    );
    expect(comIpduAdds).toHaveLength(2);
    expect(comIpduAdds[0]?.shortName).toBe('EngState');
    expect(comIpduAdds[1]?.shortName).toBe('TransState');
  });

  it('generates ComSignal patches under each ComIPdu', () => {
    const plan = dbcToComStack({
      dbc: SAMPLE_DBC_SUMMARY,
      comConfig: MINIMAL_COM_CONFIG,
      canIfConfig: MINIMAL_CANIF_CONFIG,
      pduRConfig: MINIMAL_PDUR_CONFIG,
    });
    // ComSignal add-childs have parentPath with 5 non-empty segments
    // (Com/Com/ComConfig/<MsgName>/<SigName>).
    const comSignalAdds = plan.comPatches.filter((p) => {
      if (p.op !== 'add-child') return false;
      const segments = p.parentPath.split('/').filter((s) => s.length > 0);
      return segments.length === 5;
    });
    // 4 signals total, but only those attached to new ComIPdus (no existing ComIPdus)
    expect(comSignalAdds).toHaveLength(4);
  });

  it('generates CanIfTxPduCfg + CanIfRxPduCfg patches', () => {
    const plan = dbcToComStack({
      dbc: SAMPLE_DBC_SUMMARY,
      comConfig: MINIMAL_COM_CONFIG,
      canIfConfig: MINIMAL_CANIF_CONFIG,
      pduRConfig: MINIMAL_PDUR_CONFIG,
    });
    // EngState is Tx from ECM -> CanIfTxPduCfg
    // TransState is Tx from TCM -> CanIfTxPduCfg (transmitter is ECM/TCM = bus-side Tx)
    const canIfAdds = plan.canIfPatches.filter((p) => p.op === 'add-child');
    expect(canIfAdds.length).toBeGreaterThanOrEqual(2);
  });

  it('generates PduRRoutingPath for each ComIPdu', () => {
    const plan = dbcToComStack({
      dbc: SAMPLE_DBC_SUMMARY,
      comConfig: MINIMAL_COM_CONFIG,
      canIfConfig: MINIMAL_CANIF_CONFIG,
      pduRConfig: MINIMAL_PDUR_CONFIG,
    });
    const pduRAdds = plan.pduRPatches.filter((p) => p.op === 'add-child');
    expect(pduRAdds.length).toBeGreaterThanOrEqual(2);
  });

  it('idempotency: re-run on Com_Config already containing EngState skips that message', () => {
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
    });
    // ComIPdus have 4-segment parentPath (Com/Com/ComConfig/MsgName);
    // ComSignals have 5-segment parentPath.
    const comIpduAdds = plan.comPatches.filter(
      (p): p is Extract<typeof p, { parentPath: string; shortName: string }> => {
        if (p.op !== 'add-child') return false;
        const segments = p.parentPath.split('/').filter((s) => s.length > 0);
        return segments.length === 4;
      },
    );
    const engStateAdds = comIpduAdds.filter((p) => p.shortName === 'EngState');
    expect(engStateAdds).toHaveLength(0);
    // TransState still added
    expect(comIpduAdds.find((p) => p.shortName === 'TransState')).toBeDefined();
  });
});
