// @ts-check
// v1.25.0 T4 — Builds the 75-row real-OEM `.xlsx` fixture used by the
// ship-blocking regression test. Run once to (re)generate
// `samples/comstack-existing-fixture.xlsx` from the in-tree vector-style
// SHORT-NAMEs and the BSWMDs in `samples/comstack-existing-fixture/`.
//
//   node scripts/build-comstack-fixture.mjs
//
// Idempotent: the same inputs always produce the same output bytes
// (SheetJS writes are deterministic for fixed workbook content). The
// committed `.xlsx` is the source of truth; this script regenerates it
// when the names/params change.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_XLSX = resolve(ROOT, 'samples/comstack-existing-fixture.xlsx');

// ---------------------------------------------------------------------------
// 30 ComIPdu SHORT-NAMEs — Vector CANdelaStudio CamelCase + underscore.
//   Format: Pdu_<Subject>_<Quantity>
// ---------------------------------------------------------------------------
const COM_IPDU_NAMES = [
  'Pdu_Engine_Speed',
  'Pdu_Engine_Temp',
  'Pdu_Brake_Pressure',
  'Pdu_Brake_Temp',
  'Pdu_Vehicle_Speed',
  'Pdu_Wheel_Speed_FL',
  'Pdu_Wheel_Speed_FR',
  'Pdu_Wheel_Speed_RL',
  'Pdu_Wheel_Speed_RR',
  'Pdu_Steering_Angle',
  'Pdu_Steering_Torque',
  'Pdu_Throttle_Position',
  'Pdu_Yaw_Rate',
  'Pdu_Lateral_Accel',
  'Pdu_Longitudinal_Accel',
  'Pdu_Engine_Load',
  'Pdu_Fuel_Level',
  'Pdu_Battery_Voltage',
  'Pdu_Engine_RPM',
  'Pdu_Oil_Pressure',
  'Pdu_Coolant_Temp',
  'Pdu_Transmission_Temp',
  'Pdu_Gear_Position',
  'Pdu_Cruise_Control_State',
  'Pdu_Parking_Brake_State',
  'Pdu_Door_Status',
  'Pdu_Light_Status',
  'Pdu_HVAC_Setpoint',
  'Pdu_Ambient_Temp',
  'Pdu_Humidity',
];

// ---------------------------------------------------------------------------
// 30 ComSignal SHORT-NAMEs.
//   Format: Sig_<Subject>_<Quantity>
// ---------------------------------------------------------------------------
const COM_SIGNAL_NAMES = [
  'Sig_Engine_RPM',
  'Sig_Engine_Temp',
  'Sig_Engine_Load',
  'Sig_Brake_Pressure',
  'Sig_Brake_Temp',
  'Sig_Vehicle_Speed',
  'Sig_Throttle_Position',
  'Sig_Steering_Angle',
  'Sig_Steering_Torque',
  'Sig_Yaw_Rate',
  'Sig_Lateral_Accel',
  'Sig_Longitudinal_Accel',
  'Sig_Wheel_Speed_FL',
  'Sig_Wheel_Speed_FR',
  'Sig_Wheel_Speed_RL',
  'Sig_Wheel_Speed_RR',
  'Sig_Oil_Pressure',
  'Sig_Coolant_Temp',
  'Sig_Transmission_Temp',
  'Sig_Gear_Position',
  'Sig_Fuel_Level',
  'Sig_Battery_Voltage',
  'Sig_Cruise_Control_State',
  'Sig_HVAC_Setpoint',
  'Sig_Ambient_Temp',
  'Sig_Humidity',
  'Sig_Parking_Brake_State',
  'Sig_Door_Status',
  'Sig_Light_Status',
  'Sig_EngState_State',
];

// ---------------------------------------------------------------------------
// 5 CanIfTxPdu / 5 CanIfRxPdu SHORT-NAMEs.
//   Format: TxPdu_<Bus>_ECM / RxPdu_<Bus>_ECM
// ---------------------------------------------------------------------------
const CANIF_TX_PDU_NAMES = [
  'TxPdu_Engine_ECM',
  'TxPdu_Brake_ECM',
  'TxPdu_Chassis_ECM',
  'TxPdu_Body_ECM',
  'TxPdu_HVAC_ECM',
];
const CANIF_RX_PDU_NAMES = [
  'RxPdu_Engine_ECM',
  'RxPdu_Brake_ECM',
  'RxPdu_Chassis_ECM',
  'RxPdu_Body_ECM',
  'RxPdu_HVAC_ECM',
];

// ---------------------------------------------------------------------------
// 5 PduRRoutingPath SHORT-NAMEs.
//   Format: RtePath_<From>_<To>
// ---------------------------------------------------------------------------
const PDUR_ROUTING_PATH_NAMES = [
  'RtePath_ComPdu_CanIfTxPdu',
  'RtePath_ComPdu_CanIfRxPdu',
  'RtePath_CanIfTxPdu_PduR',
  'RtePath_CanIfRxPdu_PduR',
  'RtePath_PduR_ComPdu',
];

// ---------------------------------------------------------------------------
// Build the workbook. Sheet header order MUST match what
// `xlsxEcucBatchWriteBatchTemplateHandler` emits (sanity-checked via
// `samples/comstack-existing-fixture/Com.bswmd.arxml` parameters).
// Each sheet also embeds the canonical `definitionRef` so the T1
// mapper's `findChildDefForAdd` resolves to the right BSWMD child def
// (without it, every row lands as the first subContainer of the parent
// — fine for ComIPdu rows but wrong for ComSignal / CanIfRxPdu rows).
// ---------------------------------------------------------------------------

/**
 * @param {string[]} names
 * @param {Record<string, string>} headers  Header name → BSWMD param shortName
 * @param {string} definitionRef            BSWMD-side child def path (e.g. `/AUTOSAR/Com/ComConfig/ComIPdu`)
 * @param {(name: string, idx: number) => Record<string, number | string>} rowFactory
 */
function buildSheet(names, headers, definitionRef, rowFactory) {
  // Row 0: `shortName | definitionRef | param:<NAME> | ...`
  const header = ['shortName', 'definitionRef', ...Object.keys(headers).map((h) => `param:${h}`)];
  const rows = [header];
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const params = rowFactory(name, i);
    rows.push([name, definitionRef, ...Object.values(headers).map((h) => params[h] ?? '')]);
  }
  return rows;
}

// ComIPdu headers must match `samples/comstack-existing-fixture/Com.bswmd.arxml`
// ComIPdu parameter order: ComHandleId, ComPduId, ComIPduDirection.
const COM_IPDU_HEADERS = {
  ComHandleId: 'ComHandleId',
  ComPduId: 'ComPduId',
  ComIPduDirection: 'ComIPduDirection',
};
function comIPduRow(_name, idx) {
  return {
    ComHandleId: idx,
    ComPduId: idx,
    ComIPduDirection: idx < 24 ? 'SEND' : 'RECEIVE',
  };
}

// ComSignal headers must match ComSignal parameter order: ComHandleId, ComBitPosition, ComBitSize.
const COM_SIGNAL_HEADERS = {
  ComHandleId: 'ComHandleId',
  ComBitPosition: 'ComBitPosition',
  ComBitSize: 'ComBitSize',
};
function comSignalRow(_name, idx) {
  return {
    ComHandleId: idx,
    ComBitPosition: idx % 64,
    ComBitSize: 16,
  };
}

// CanIfTxPdu: CanIfTxPduId, CanIfTxPduCanId, CanIfTxPduDlc.
const CANIF_TX_PDU_HEADERS = {
  CanIfTxPduId: 'CanIfTxPduId',
  CanIfTxPduCanId: 'CanIfTxPduCanId',
  CanIfTxPduDlc: 'CanIfTxPduDlc',
};
function canIfTxPduRow(_name, idx) {
  return {
    CanIfTxPduId: idx,
    CanIfTxPduCanId: 0x100 + idx,
    CanIfTxPduDlc: 8,
  };
}

// CanIfRxPdu: CanIfRxPduId, CanIfRxPduCanId, CanIfRxPduDlc.
const CANIF_RX_PDU_HEADERS = {
  CanIfRxPduId: 'CanIfRxPduId',
  CanIfRxPduCanId: 'CanIfRxPduCanId',
  CanIfRxPduDlc: 'CanIfRxPduDlc',
};
function canIfRxPduRow(_name, idx) {
  return {
    CanIfRxPduId: idx,
    CanIfRxPduCanId: 0x200 + idx,
    CanIfRxPduDlc: 8,
  };
}

// PduRRoutingPath: PduRRoutingPathPriority, PduRSrcPduHandleId, PduRDestPduHandleId.
const PDUR_ROUTING_PATH_HEADERS = {
  PduRRoutingPathPriority: 'PduRRoutingPathPriority',
  PduRSrcPduHandleId: 'PduRSrcPduHandleId',
  PduRDestPduHandleId: 'PduRDestPduHandleId',
};
function pduRRoutingPathRow(_name, idx) {
  return {
    PduRRoutingPathPriority: idx + 1,
    PduRSrcPduHandleId: idx * 2,
    PduRDestPduHandleId: idx * 2 + 1,
  };
}

const wb = XLSX.utils.book_new();
const sheets = [
  {
    name: 'ComIPdu',
    rows: buildSheet(
      COM_IPDU_NAMES,
      COM_IPDU_HEADERS,
      '/AUTOSAR/Com/ComConfig/ComIPdu',
      comIPduRow,
    ),
  },
  {
    name: 'ComSignal',
    rows: buildSheet(
      COM_SIGNAL_NAMES,
      COM_SIGNAL_HEADERS,
      '/AUTOSAR/Com/ComConfig/ComSignal',
      comSignalRow,
    ),
  },
  {
    name: 'CanIfTxPdu',
    rows: buildSheet(
      CANIF_TX_PDU_NAMES,
      CANIF_TX_PDU_HEADERS,
      '/AUTOSAR/CanIf/CanIfConfig/CanIfTxPdu',
      canIfTxPduRow,
    ),
  },
  {
    name: 'CanIfRxPdu',
    rows: buildSheet(
      CANIF_RX_PDU_NAMES,
      CANIF_RX_PDU_HEADERS,
      '/AUTOSAR/CanIf/CanIfConfig/CanIfRxPdu',
      canIfRxPduRow,
    ),
  },
  {
    name: 'PduRRoutingPath',
    rows: buildSheet(
      PDUR_ROUTING_PATH_NAMES,
      PDUR_ROUTING_PATH_HEADERS,
      '/AUTOSAR/PduR/PduRRoutingPaths/PduRRoutingPath',
      pduRRoutingPathRow,
    ),
  },
];

let totalRows = 0;
for (const sheet of sheets) {
  const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
  XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  totalRows += sheet.rows.length - 1; // exclude header
}

const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
mkdirSync(dirname(OUT_XLSX), { recursive: true });
writeFileSync(OUT_XLSX, Buffer.from(bytes));

// Sanity log.
console.log(`Wrote ${OUT_XLSX}`);
console.log(`Total data rows: ${totalRows} (expected 75)`);
if (totalRows !== 75) {
  console.error(`FATAL: expected 75 rows, got ${totalRows}`);
  process.exit(1);
}
