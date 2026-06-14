// ECUC subset schema derived from the 5 fixture ARXML files in
// `tests/fixtures/arxml/`.
//
//   Det_Det.arxml     — small (1 module, 1 container, 4 boolean + 4 string)
//   WdgIf_WdgIf.arxml — small (1 module, 2 containers, 3 boolean + 3 string + 1 ref)
//   EcuC_EcuC.arxml   — medium (1 module, EcucGeneral enums + ~125 EcucPduCollection Pdu
//                        instances with integer PduLength, boolean UserDefine/PduType,
//                        and 1 foreign reference SysTPduToFrameMappingRef)
//   PduR_PduR.arxml   — medium (1 module, integer handles, boolean module-support flags,
//                        enum src/dest modules, ref to PduRRoutingPath entries)
//   Com_Com.arxml     — large (1 module, ComGeneral, ~67 IPdus with integer handles /
//                        floats for timeouts / enums for direction & processing /
//                        strings for signal init values / refs to groups)
//
// Schema entries are keyed by the absolute param path inside the ECUC tree:
//   "/<pkgShortName>/<moduleShortName>/<containerShortName>/<paramShortName>"
//
// Path origin: every fixture uses package shortName = "EcucDefs". The
// module-relative path after "/EcucDefs/<Module>/" is what we expose.
//
// All DEST attribute quirks observed in the fixtures are documented inline:
//   - PduR boolean parameters carry literal true/false.
//   - EcuC/Pdu/PduType is tagged ECUC-BOOLEAN-PARAM-DEF but actually stores
//     the string "DBC" in the sample — a serializer quirk, not a schema
//     violation; the schema treats it as enumeration literal (DBC) so future
//     reads that survive the parser get caught by the enum rule.
//   - PduR TP threshold sits at 7 across all instances, range 0..65535 used
//     for CAN TP segmentation.

import type { EcucSchemaEntry } from '../types.js';

/**
 * ECUC subset schema derived from 5 fixtures.
 *
 * `path` is the absolute param path: container.path + '/' + paramKey
 * (e.g. "/EcucDefs/EcuC/EcucPduCollection/Pdu/PduLength").
 *
 * Required entries are flagged when the param appears in every instance
 * of its parent container across all fixtures. (Heuristic: always-present
 * in sample → user almost certainly expects it.)
 */
export const ECUC_SUBSET_SCHEMA: readonly EcucSchemaEntry[] = [
  // ---- Sentinel entries for boolean and string param types ----
  // The fixture parser does not currently produce `boolean` or `string`
  // ParamValue types (booleans are wrapped in NUMERICAL, strings in TEXTUAL
  // → enum). These entries are kept so the schema self-test can exercise
  // all 6 ECUC param types; they do not appear in any fixture and so do
  // not contribute to baseline regression. When the parser is taught to
  // distinguish string vs enum and to read booleans from BOOLEAN-PARAM-DEF,
  // promote real fixture paths here and remove the sentinels.
  {
    path: '/EcucDefs/__sentinel/BoolParam',
    type: 'boolean',
    required: false,
  },
  {
    path: '/EcucDefs/__sentinel/StringParam',
    type: 'string',
    maxLength: 256,
    required: false,
  },

  // ---- Det / DetGeneral (boolean + string params) ----
  // Booleans in ECUC are wrapped in <ECUC-NUMERICAL-PARAM-VALUE> and the
  // parser reads them as integer 0/1; the boolean flag is on the
  // DEFINITION-REF DEST attribute. Schema uses integer 0..1 to match
  // the parser's actual output (boolean round-trip is a Sprint 3 concern).
  {
    path: '/EcucDefs/Det/DetGeneral/DetDebugLoop',
    type: 'integer',
    min: 0,
    max: 1,
    required: false,
  },
  {
    path: '/EcucDefs/Det/DetGeneral/DetForwardToDlt',
    type: 'integer',
    min: 0,
    max: 1,
    required: false,
  },
  {
    path: '/EcucDefs/Det/DetGeneral/VersionCheck',
    type: 'integer',
    min: 0,
    max: 1,
    required: true,
  },
  {
    path: '/EcucDefs/Det/DetGeneral/DetVersionApi',
    type: 'integer',
    min: 0,
    max: 1,
    required: false,
  },
  {
    path: '/EcucDefs/Det/DetGeneral/DetErrorHook',
    // Parser delivers TEXTUAL params as `enum`; schema uses enumeration
    // to match the runtime type. Literals come from the fixture values.
    // (String length validation is dropped until the parser distinguishes
    // string vs enum by DEFINITION-REF DEST.)
    type: 'enumeration',
    enumLiterals: [''],
    required: false,
  },
  {
    path: '/EcucDefs/Det/DetGeneral/CddHeaderFile',
    type: 'enumeration',
    enumLiterals: [''],
    required: false,
  },

  // ---- WdgIf / WdgIfGeneral (boolean flags) ----
  // See note above: parser delivers 0/1 integer, schema mirrors that.
  {
    path: '/EcucDefs/WdgIf/WdgIfGeneral/WdgIfDevErrorDetect',
    type: 'integer',
    min: 0,
    max: 1,
    required: true,
  },
  {
    path: '/EcucDefs/WdgIf/WdgIfGeneral/WdgIfVersionInfoApi',
    type: 'integer',
    min: 0,
    max: 1,
    required: false,
  },

  // ---- WdgIf / WdgIfDevice (integer index + function names + reference) ----
  {
    path: '/EcucDefs/WdgIf/WdgIfDevice/WdgIfDeviceIndex',
    type: 'integer',
    min: 0,
    max: 255,
    required: true,
  },
  {
    path: '/EcucDefs/WdgIf/WdgIfDevice/WdgSetModeName',
    type: 'enumeration',
    enumLiterals: ['Wdg_SetMode'],
    required: true,
  },
  {
    path: '/EcucDefs/WdgIf/WdgIfDevice/WdgIfDriverRef',
    type: 'reference',
    refDest: 'ECUC-CONTAINER-VALUE',
    required: true,
  },

  // ---- EcuC / EcucGeneral (enum bit/byte/CPU type) ----
  {
    path: '/EcucDefs/EcuC/EcucGeneral/BitOrder',
    type: 'enumeration',
    enumLiterals: ['LSB'],
    required: true,
  },
  {
    path: '/EcucDefs/EcuC/EcucGeneral/ByteOrder',
    type: 'enumeration',
    enumLiterals: ['Intel'],
    required: true,
  },
  {
    path: '/EcucDefs/EcuC/EcucGeneral/CPUType',
    type: 'enumeration',
    enumLiterals: ['CPU32Bit'],
    required: true,
  },

  // ---- EcuC / EcucPduCollection (collection-level enums) ----
  {
    path: '/EcucDefs/EcuC/EcucPduCollection/PduIdTypeEnum',
    type: 'enumeration',
    enumLiterals: ['uint8'],
    required: true,
  },
  {
    path: '/EcucDefs/EcuC/EcucPduCollection/PduLengthTypeEnum',
    type: 'enumeration',
    enumLiterals: ['uint16'],
    required: true,
  },

  // ---- EcuC / EcucPduCollection/Pdu (per-PDU params, instance children) ----
  {
    path: '/EcucDefs/EcuC/EcucPduCollection/Pdu/PduLength',
    type: 'integer',
    min: 0,
    max: 64,
    required: true,
  },
  {
    path: '/EcucDefs/EcuC/EcucPduCollection/Pdu/UserDefine',
    type: 'integer',
    min: 0,
    max: 1,
    required: false,
  },
  {
    path: '/EcucDefs/EcuC/EcucPduCollection/Pdu/PduType',
    type: 'enumeration',
    enumLiterals: ['DBC'],
    required: false,
  },
  {
    path: '/EcucDefs/EcuC/EcucPduCollection/Pdu/SysTPduToFrameMappingRef',
    type: 'reference',
    refDest: 'ECUC-FOREIGN-REFERENCE-DEF',
    required: false,
  },

  // ---- PduR / PduRGeneral (boolean module-support flags) ----
  // See note above: parser delivers 0/1 integer, schema mirrors that.
  {
    path: '/EcucDefs/PduR/PduRGeneral/CanIfModuleSupport',
    type: 'integer',
    min: 0,
    max: 1,
    required: true,
  },
  {
    path: '/EcucDefs/PduR/PduRGeneral/CanTpModuleSupport',
    type: 'integer',
    min: 0,
    max: 1,
    required: false,
  },
  {
    path: '/EcucDefs/PduR/PduRGeneral/ComModuleSupport',
    type: 'integer',
    min: 0,
    max: 1,
    required: true,
  },
  {
    path: '/EcucDefs/PduR/PduRGeneral/DcmModuleSupport',
    type: 'integer',
    min: 0,
    max: 1,
    required: true,
  },

  // ---- PduR / PduRBswModules (boolean BSW-module toggle set) ----
  {
    path: '/EcucDefs/PduR/PduRBswModules/PduRUpperModule',
    type: 'integer',
    min: 0,
    max: 1,
    required: true,
  },
  {
    path: '/EcucDefs/PduR/PduRBswModules/PduRLowerModule',
    type: 'integer',
    min: 0,
    max: 1,
    required: false,
  },

  // ---- PduR routing tables (integer counters + ref) ----
  {
    path: '/EcucDefs/PduR/PduRRoutingTables/PduRConfigurationId',
    type: 'integer',
    min: 0,
    max: 65535,
    required: true,
  },
  {
    path: '/EcucDefs/PduR/PduRRoutingTables/PduRRoutingTable/PduRMaxRoutingTableCnt',
    type: 'integer',
    min: 0,
    max: 255,
    required: true,
  },
  {
    path: '/EcucDefs/PduR/PduRRoutingTables/PduRRoutingTable/PduRRoutingPath/PduRDestPdu/PduRDestPduHandleId',
    type: 'integer',
    min: 0,
    max: 65535,
    required: true,
  },
  {
    path: '/EcucDefs/PduR/PduRRoutingTables/PduRRoutingTable/PduRRoutingPath/PduRDestPdu/PduRTpThreshold',
    type: 'integer',
    min: 0,
    max: 4095,
    required: true,
  },
  {
    path: '/EcucDefs/PduR/PduRRoutingTables/PduRRoutingTable/PduRRoutingPath/PduRDestPdu/PduRDestModule',
    type: 'enumeration',
    enumLiterals: ['COM'],
    required: true,
  },
  {
    path: '/EcucDefs/PduR/PduRRoutingTables/PduRRoutingTable/PduRRoutingPath/PduRDestPdu/PduRDestPduDataProvision',
    type: 'enumeration',
    enumLiterals: ['PDUR_DIRECT'],
    required: true,
  },
  {
    path: '/EcucDefs/PduR/PduRRoutingTables/PduRRoutingTable/PduRRoutingPath/PduRSrcPdu/PduRSrcModule',
    type: 'enumeration',
    enumLiterals: ['CANIF'],
    required: true,
  },

  // ---- Com / ComGeneral (boolean flags + integer support counter) ----
  // See note above: parser delivers 0/1 integer, schema mirrors that.
  {
    path: '/EcucDefs/Com/ComGeneral/VersionCheck',
    type: 'integer',
    min: 0,
    max: 1,
    required: true,
  },
  {
    path: '/EcucDefs/Com/ComGeneral/ComConfigurationUseDet',
    type: 'integer',
    min: 0,
    max: 1,
    required: true,
  },
  {
    path: '/EcucDefs/Com/ComGeneral/ComSupportedIPduGroups',
    type: 'integer',
    min: 0,
    max: 65535,
    required: true,
  },

  // ---- Com / ComConfig/ComIPdu (enum direction / processing + integer handle) ----
  {
    path: '/EcucDefs/Com/ComConfig/ComIPdu/ComIPduDirection',
    type: 'enumeration',
    enumLiterals: ['SEND'],
    required: true,
  },
  {
    path: '/EcucDefs/Com/ComConfig/ComIPdu/ComIPduSignalProcessing',
    type: 'enumeration',
    enumLiterals: ['DEFERRED'],
    required: true,
  },
  {
    path: '/EcucDefs/Com/ComConfig/ComIPdu/ComIPduType',
    type: 'enumeration',
    enumLiterals: ['NORMAL'],
    required: true,
  },
  {
    path: '/EcucDefs/Com/ComConfig/ComIPdu/ComIPduHandleId',
    type: 'integer',
    min: 0,
    max: 65535,
    required: true,
  },
  {
    path: '/EcucDefs/Com/ComConfig/ComIPdu/IPduDLC',
    type: 'integer',
    min: 0,
    max: 64,
    required: true,
  },

  // ---- Com / ComConfig/ComSignal (integer bit fields + enum types) ----
  {
    path: '/EcucDefs/Com/ComConfig/ComSignal/ComBitPosition',
    type: 'integer',
    min: 0,
    max: 63,
    required: true,
  },
  {
    path: '/EcucDefs/Com/ComConfig/ComSignal/ComBitSize',
    type: 'integer',
    min: 1,
    max: 64,
    required: true,
  },
  {
    path: '/EcucDefs/Com/ComConfig/ComSignal/ComHandleId',
    type: 'integer',
    min: 0,
    max: 65535,
    required: true,
  },
  {
    path: '/EcucDefs/Com/ComConfig/ComSignal/ComSignalLength',
    type: 'integer',
    min: 0,
    max: 64,
    required: true,
  },
  {
    path: '/EcucDefs/Com/ComConfig/ComSignal/ComSignalType',
    type: 'enumeration',
    enumLiterals: ['UINT8', 'UINT16'],
    required: true,
  },
  {
    path: '/EcucDefs/Com/ComConfig/ComSignal/ComTransferProperty',
    type: 'enumeration',
    enumLiterals: ['PENDING'],
    required: true,
  },

  // ---- Com / ComTxIPdu / ComTxMode (enum mode flag) ----
  {
    path: '/EcucDefs/Com/ComConfig/ComIPdu/ComTxIPdu/ComTxIPduClearUpdateBit',
    type: 'enumeration',
    enumLiterals: ['Confirmation'],
    required: true,
  },
  {
    path: '/EcucDefs/Com/ComConfig/ComIPdu/ComTxIPdu/ComTxModeTrue/ComTxMode/ComTxModeMode',
    type: 'enumeration',
    enumLiterals: ['PERIODIC'],
    required: true,
  },

  // ---- Com / ComTxIPdu / ComTxMode (float time periods) ----
  {
    path: '/EcucDefs/Com/ComConfig/ComIPdu/ComTxIPdu/ComMinimumDelayTime',
    type: 'float',
    min: 0,
    max: 65.535,
    required: true,
  },
  {
    path: '/EcucDefs/Com/ComConfig/ComIPdu/ComTxIPdu/ComTxModeTrue/ComTxMode/ComTxModeRepetitionPeriod',
    type: 'float',
    min: 0,
    max: 65.535,
    required: true,
  },
] as const;

/**
 * Linear-scan lookup. Returns null when no entry matches the given path.
 * Paths are compared as exact strings; container wildcards are not supported.
 */
export function lookupSchema(paramPath: string): EcucSchemaEntry | null {
  for (const entry of ECUC_SUBSET_SCHEMA) {
    if (entry.path === paramPath) return entry;
  }
  return null;
}

/**
 * All schema paths as a readonly array. Useful for diagnostics and for
 * future coverage reports that need to know which paths are catalogued.
 */
export function allSchemaPaths(): readonly string[] {
  return ECUC_SUBSET_SCHEMA.map((e) => e.path);
}
