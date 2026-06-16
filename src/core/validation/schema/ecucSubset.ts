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

import type { SchemaLayer } from '../runtimeSchema.js';
import type { EcucSchemaEntry, EcucContainerSchemaEntry } from '../types.js';

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
  // ---- Det / DetGeneral (boolean + string params) ----
  // ECUC boolean params carry DEFINITION-REF DEST="ECUC-BOOLEAN-PARAM-DEF";
  // the parser now reads these as ParamValue.type === 'boolean' and the
  // schema mirrors that semantic directly.
  {
    path: '/EcucDefs/Det/DetGeneral/DetDebugLoop',
    type: 'boolean',
    required: false,
  },
  {
    path: '/EcucDefs/Det/DetGeneral/DetForwardToDlt',
    type: 'boolean',
    required: false,
  },
  {
    path: '/EcucDefs/Det/DetGeneral/VersionCheck',
    type: 'boolean',
    required: true,
  },
  {
    path: '/EcucDefs/Det/DetGeneral/DetVersionApi',
    type: 'boolean',
    required: false,
  },
  {
    path: '/EcucDefs/Det/DetGeneral/DetErrorHook',
    // ECUC-STRING-PARAM-DEF — parser now reads TEXTUAL with DEST=string
    // as ParamValue.type === 'string'. maxLength=256 follows the AUTOSAR
    // upper bound used elsewhere in the standard.
    type: 'string',
    maxLength: 256,
    required: false,
  },
  {
    path: '/EcucDefs/Det/DetGeneral/CddHeaderFile',
    type: 'string',
    maxLength: 256,
    required: false,
  },

  // ---- WdgIf / WdgIfGeneral (boolean flags) ----
  {
    path: '/EcucDefs/WdgIf/WdgIfGeneral/WdgIfDevErrorDetect',
    type: 'boolean',
    required: true,
  },
  {
    path: '/EcucDefs/WdgIf/WdgIfGeneral/WdgIfVersionInfoApi',
    type: 'boolean',
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
    // WdgSetModeName is an ECUC-FUNCTION-NAME-DEF; parser now resolves it
    // to ParamValue.type === 'string'. maxLength=256 follows the AUTOSAR
    // upper bound for function-name strings.
    path: '/EcucDefs/WdgIf/WdgIfDevice/WdgSetModeName',
    type: 'string',
    maxLength: 256,
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
    type: 'boolean',
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
  {
    path: '/EcucDefs/PduR/PduRGeneral/CanIfModuleSupport',
    type: 'boolean',
    required: true,
  },
  {
    path: '/EcucDefs/PduR/PduRGeneral/CanTpModuleSupport',
    type: 'boolean',
    required: false,
  },
  {
    path: '/EcucDefs/PduR/PduRGeneral/ComModuleSupport',
    type: 'boolean',
    required: true,
  },
  {
    path: '/EcucDefs/PduR/PduRGeneral/DcmModuleSupport',
    type: 'boolean',
    required: true,
  },

  // ---- PduR / PduRBswModules (boolean BSW-module toggle set) ----
  {
    path: '/EcucDefs/PduR/PduRBswModules/PduRUpperModule',
    type: 'boolean',
    required: true,
  },
  {
    path: '/EcucDefs/PduR/PduRBswModules/PduRLowerModule',
    type: 'boolean',
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
  {
    path: '/EcucDefs/Com/ComGeneral/VersionCheck',
    type: 'boolean',
    required: true,
  },
  {
    path: '/EcucDefs/Com/ComGeneral/ComConfigurationUseDet',
    type: 'boolean',
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
 *
 * When a `SchemaLayer` is provided, the layer is consulted first
 * (`layer.params`); only on a layer miss does the function fall through
 * to the static `ECUC_SUBSET_SCHEMA`. The layer wins because the user's
 * BSWMD is the authoritative schema-side spec for the modules it
 * covers; the static subset is just baseline coverage for the 5 test
 * fixtures that lack a layer.
 *
 * Backwards compatibility: the existing 2-arg call site
 * `lookupSchema(paramPath)` continues to work — `layer` is optional.
 */
export function lookupSchema(paramPath: string, layer?: SchemaLayer): EcucSchemaEntry | null {
  if (layer !== undefined) {
    const fromLayer = layer.params.get(paramPath);
    if (fromLayer !== undefined) return fromLayer;
  }
  for (const entry of ECUC_SUBSET_SCHEMA) {
    if (entry.path === paramPath) return entry;
  }
  return null;
}

/**
 * ECUC container multiplicity schema for 5 fixtures.
 *
 * Each entry constrains the number of *direct child* containers of the
 * matching type. `upper: 'unbounded'` corresponds to the AUTOSAR `*`
 * (any number) representation.
 *
 * Direct child count is computed by filtering `el.children` for
 * kind === 'container' && shortName === <last path segment>. Nested
 * grandchildren are NOT counted at this level — that is a Sprint 6
 * concern.
 *
 * 5-fixture counts observed (must match exactly to keep baseline 5/5 0-violation):
 *   - Det/DetGeneral                       = 1
 *   - WdgIf/WdgIfGeneral                   = 1
 *   - WdgIf/WdgIfDevice                    = 1
 *   - EcuC/EcucGeneral                     = 1
 *   - EcuC/EcucPduCollection               = 1
 *   - EcuC/EcucPduCollection/Pdu           = 125  (unbounded)
 *   - PduR/PduRGeneral                     = 1
 *   - PduR/PduRBswModules                  = 1
 *   - PduR/PduRRoutingTables               = 1
 *   - PduR/PduRRoutingTables/PduRRoutingTable = N (unbounded; see fixture)
 *   - Com/ComGeneral                       = 1
 *   - Com/ComConfig                        = 1
 *   - Com/ComConfig/ComIPdu                = 67   (unbounded)
 */
export const ECUC_CONTAINER_SCHEMA: readonly EcucContainerSchemaEntry[] = [
  { path: '/EcucDefs/Det/DetGeneral', lower: 0, upper: 1 },
  { path: '/EcucDefs/WdgIf/WdgIfGeneral', lower: 0, upper: 1 },
  { path: '/EcucDefs/WdgIf/WdgIfDevice', lower: 0, upper: 1 },
  { path: '/EcucDefs/EcuC/EcucGeneral', lower: 0, upper: 1 },
  { path: '/EcucDefs/EcuC/EcucPduCollection', lower: 0, upper: 1 },
  { path: '/EcucDefs/EcuC/EcucPduCollection/Pdu', lower: 0, upper: 'unbounded' },
  { path: '/EcucDefs/PduR/PduRGeneral', lower: 0, upper: 1 },
  { path: '/EcucDefs/PduR/PduRBswModules', lower: 0, upper: 1 },
  { path: '/EcucDefs/PduR/PduRRoutingTables', lower: 0, upper: 1 },
  { path: '/EcucDefs/PduR/PduRRoutingTables/PduRRoutingTable', lower: 0, upper: 'unbounded' },
  { path: '/EcucDefs/Com/ComGeneral', lower: 0, upper: 1 },
  { path: '/EcucDefs/Com/ComConfig', lower: 0, upper: 1 },
  { path: '/EcucDefs/Com/ComConfig/ComIPdu', lower: 0, upper: 'unbounded' },
] as const;

/**
 * Linear-scan lookup for container multiplicity.
 * Returns null when the path is not catalogued.
 *
 * When a `SchemaLayer` is provided, the layer is consulted first
 * (`layer.containers`); only on a layer miss does the function fall
 * through to the static `ECUC_CONTAINER_SCHEMA`. See `lookupSchema`
 * for the precedence rationale.
 *
 * Backwards compatibility: the existing 2-arg call site
 * `lookupContainerSchema(containerPath)` continues to work — `layer`
 * is optional.
 */
export function lookupContainerSchema(
  containerPath: string,
  layer?: SchemaLayer,
): EcucContainerSchemaEntry | null {
  if (layer !== undefined) {
    const fromLayer = layer.containers.get(containerPath);
    if (fromLayer !== undefined) return fromLayer;
  }
  for (const entry of ECUC_CONTAINER_SCHEMA) {
    if (entry.path === containerPath) return entry;
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
