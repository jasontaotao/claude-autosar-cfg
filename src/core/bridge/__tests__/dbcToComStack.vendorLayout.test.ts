import { describe, expect, it } from 'vitest';

import type { DbcSummaryWithSignals } from '../../../main/ipc/dbcParseForBridgeHandler.js';
import { dbcToComStack } from '../dbcToComStack.js';

const VENDOR_COM = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>AUTOSAR_R22</SHORT-NAME>
      <AR-PACKAGES>
        <AR-PACKAGE>
          <SHORT-NAME>EcucDefs</SHORT-NAME>
          <ELEMENTS>
            <ECUC-MODULE-CONFIGURATION-VALUES>
              <SHORT-NAME>Com</SHORT-NAME>
              <CONTAINERS>
                <ECUC-CONTAINER-VALUE>
                  <SHORT-NAME>ComConfig</SHORT-NAME>
                  <SUB-CONTAINERS></SUB-CONTAINERS>
                </ECUC-CONTAINER-VALUE>
              </CONTAINERS>
            </ECUC-MODULE-CONFIGURATION-VALUES>
          </ELEMENTS>
        </AR-PACKAGE>
      </AR-PACKAGES>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

const VENDOR_CANIF = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>AUTOSAR_R22</SHORT-NAME>
      <AR-PACKAGES>
        <AR-PACKAGE>
          <SHORT-NAME>EcucDefs</SHORT-NAME>
          <ELEMENTS>
            <ECUC-MODULE-CONFIGURATION-VALUES>
              <SHORT-NAME>CanIf</SHORT-NAME>
              <CONTAINERS>
                <ECUC-CONTAINER-VALUE>
                  <SHORT-NAME>CanIfCtrlDrvCfg</SHORT-NAME>
                </ECUC-CONTAINER-VALUE>
                <ECUC-CONTAINER-VALUE>
                  <SHORT-NAME>CanIfInitCfg</SHORT-NAME>
                  <SUB-CONTAINERS></SUB-CONTAINERS>
                </ECUC-CONTAINER-VALUE>
              </CONTAINERS>
            </ECUC-MODULE-CONFIGURATION-VALUES>
          </ELEMENTS>
        </AR-PACKAGE>
      </AR-PACKAGES>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

const VENDOR_PDUR = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>AUTOSAR_R22</SHORT-NAME>
      <AR-PACKAGES>
        <AR-PACKAGE>
          <SHORT-NAME>EcucDefs</SHORT-NAME>
          <ELEMENTS>
            <ECUC-MODULE-CONFIGURATION-VALUES>
              <SHORT-NAME>PduR</SHORT-NAME>
              <CONTAINERS>
                <ECUC-CONTAINER-VALUE>
                  <SHORT-NAME>PduRBswModules</SHORT-NAME>
                </ECUC-CONTAINER-VALUE>
                <ECUC-CONTAINER-VALUE>
                  <SHORT-NAME>PduRRoutingPaths</SHORT-NAME>
                </ECUC-CONTAINER-VALUE>
              </CONTAINERS>
            </ECUC-MODULE-CONFIGURATION-VALUES>
          </ELEMENTS>
        </AR-PACKAGE>
      </AR-PACKAGES>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

const DBC: DbcSummaryWithSignals = {
  version: 'v1',
  nodeCount: 2,
  messageCount: 2,
  nodes: ['BMS', 'VCU'],
  messages: [
    { id: 256, name: 'BmsState', dlc: 8, transmitter: 'BMS', isExtended: false, signalCount: 1 },
    { id: 512, name: 'VcuCmd', dlc: 8, transmitter: 'VCU', isExtended: false, signalCount: 1 },
  ],
  signals: [
    { messageId: 256, name: 'BmsVoltage', startBit: 0, length: 16, byteOrder: 'little-endian', valueType: 'unsigned', factor: 1, offset: 0, min: 0, max: 0, unit: '', receivers: [] },
    { messageId: 512, name: 'VcuMode', startBit: 0, length: 8, byteOrder: 'little-endian', valueType: 'unsigned', factor: 1, offset: 0, min: 0, max: 0, unit: '', receivers: [] },
  ],
};

describe('dbcToComStack vendor document layouts', () => {
  it('uses the real nested module path instead of assuming /Module/Module', () => {
    const plan = dbcToComStack({
      dbc: DBC,
      comConfig: VENDOR_COM,
      canIfConfig: VENDOR_CANIF,
      pduRConfig: VENDOR_PDUR,
      targetNode: 'BMS',
      canIfDirectPdu: true,
      comSignalDirect: true,
    });

    expect(plan.comPatches.some(
      (p) => p.op === 'add-child' && p.parentPath === '/AUTOSAR_R22/EcucDefs/Com/ComConfig',
    )).toBe(true);
    expect(plan.comPatches.some(
      (p) => p.op === 'add-child' && p.kind === 'com-signal' &&
        p.parentPath === '/AUTOSAR_R22/EcucDefs/Com/ComConfig',
    )).toBe(true);
    expect(plan.pduRPatches.some(
      (p) => p.op === 'add-child' && p.parentPath === '/AUTOSAR_R22/EcucDefs/PduR/PduRRoutingPaths',
    )).toBe(true);
  });

  it('supports R22 CanIf Tx/Rx PDU definitions directly under CanIfInitCfg', () => {
    const plan = dbcToComStack({
      dbc: DBC,
      comConfig: VENDOR_COM,
      canIfConfig: VENDOR_CANIF,
      pduRConfig: VENDOR_PDUR,
      targetNode: 'BMS',
      canIfDirectPdu: true,
      comSignalDirect: true,
    });

    expect(plan.canIfPatches.some(
      (p) => p.op === 'add-child' && p.kind === 'canif-tx-pdu' &&
        p.parentPath === '/AUTOSAR_R22/EcucDefs/CanIf/CanIfInitCfg',
    )).toBe(true);
    expect(plan.canIfPatches.some(
      (p) => p.op === 'add-child' && p.kind === 'canif-rx-pdu' &&
        p.parentPath === '/AUTOSAR_R22/EcucDefs/CanIf/CanIfInitCfg',
    )).toBe(true);
  });
});
