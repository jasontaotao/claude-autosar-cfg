// Shared schema-layer builder for the validation unit tests.
//
// Mirrors the 46-entry `ECUC_SUBSET_SCHEMA` that used to live in
// `core/validation/schema/ecucSubset.ts`. After subset removal, every
// test that exercised param-level rules (range / enum / reference /
// required / schema / maxLength) needs to wire a layer explicitly —
// the helper below does that translation in one place so the 5
// baseline fixtures still validate with 0 errors and the per-rule
// tests still see their fixtures.
//
// Path convention: every ParamDef / ContainerDef uses absolute AUTOSAR
// paths `/EcucDefs/<Module>/<Container>/<Param>` matching the runtime
// schema layer's path-index. Container multiplicity mirrors the static
// `ECUC_CONTAINER_SCHEMA` table — the layer's `containers` map entries
// here would be redundant with `lookupContainerSchema`'s static
// fallback, but we set them anyway so the layer is self-contained for
// tests that run with `layer` and never touch the static table.

import type {
  BswModuleDef,
  BswmdDocument,
  ContainerDef,
  ParamDef,
  ReferenceDef,
} from '../../project/bswmd.js';
import { buildSchemaLayer, type SchemaLayer } from '../runtimeSchema.js';

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function param(overrides: Partial<ParamDef> & Pick<ParamDef, 'shortName' | 'path'>): ParamDef {
  return {
    shortName: overrides.shortName,
    path: overrides.path,
    kind: overrides.kind ?? 'integer',
    defaultValue: overrides.defaultValue ?? null,
    minValue: overrides.minValue ?? null,
    maxValue: overrides.maxValue ?? null,
    minLength: overrides.minLength ?? null,
    maxLength: overrides.maxLength ?? null,
    enumerationLiterals: overrides.enumerationLiterals ?? [],
  };
}

function ref(overrides: Partial<ReferenceDef> & Pick<ReferenceDef, 'shortName' | 'path'>): ReferenceDef {
  return {
    shortName: overrides.shortName,
    path: overrides.path,
    destKind: overrides.destKind ?? 'ECUC-CONTAINER-VALUE',
    lowerMultiplicity: overrides.lowerMultiplicity ?? 0,
    upperMultiplicity: overrides.upperMultiplicity ?? 'infinite',
  };
}

function container(
  overrides: Partial<ContainerDef> & Pick<ContainerDef, 'shortName' | 'path'>,
): ContainerDef {
  return {
    shortName: overrides.shortName,
    path: overrides.path,
    lowerMultiplicity: overrides.lowerMultiplicity ?? 0,
    upperMultiplicity: overrides.upperMultiplicity ?? 1,
    subContainers: overrides.subContainers ?? [],
    parameters: overrides.parameters ?? [],
    references: overrides.references ?? [],
    choices: overrides.choices ?? [],
    multiplicityConfigClasses: overrides.multiplicityConfigClasses ?? [],
  };
}

function module(
  overrides: Partial<BswModuleDef> & Pick<BswModuleDef, 'shortName' | 'path'>,
): BswModuleDef {
  return {
    shortName: overrides.shortName,
    path: overrides.path,
    dialect: overrides.dialect ?? 'ecuc-module-def',
    moduleId: overrides.moduleId ?? null,
    containers: overrides.containers ?? [],
    providedEntries: overrides.providedEntries ?? [],
    lowerMultiplicity: overrides.lowerMultiplicity ?? 0,
    upperMultiplicity: overrides.upperMultiplicity ?? 1,
    multiplicityConfigClasses: overrides.multiplicityConfigClasses ?? [],
  };
}

function makeDoc(modules: readonly BswModuleDef[]): BswmdDocument {
  return { version: '4.6', modules, warnings: [] };
}

// ---------------------------------------------------------------------------
// 5 modules — Det, WdgIf, EcuC, PduR, Com
//
// These mirror the 46 schema entries that seeded the now-deleted
// ECUC_SUBSET_SCHEMA. The shape here is "just enough to back the
// baseline fixtures + the per-rule unit tests"; unrelated BSWMD
// machinery (provided entries, multiplicityConfigClasses, choices,
// references on per-PDU instances) is intentionally left out.
// ---------------------------------------------------------------------------

const det = module({
  shortName: 'Det',
  path: '/EcucDefs/Det',
  containers: [
    container({
      shortName: 'DetGeneral',
      path: '/EcucDefs/Det/DetGeneral',
      parameters: [
        param({ shortName: 'DetDebugLoop', path: '/EcucDefs/Det/DetGeneral/DetDebugLoop', kind: 'boolean' }),
        param({ shortName: 'DetForwardToDlt', path: '/EcucDefs/Det/DetGeneral/DetForwardToDlt', kind: 'boolean' }),
        param({ shortName: 'VersionCheck', path: '/EcucDefs/Det/DetGeneral/VersionCheck', kind: 'boolean' }),
        param({ shortName: 'DetVersionApi', path: '/EcucDefs/Det/DetGeneral/DetVersionApi', kind: 'boolean' }),
        param({ shortName: 'DetErrorHook', path: '/EcucDefs/Det/DetGeneral/DetErrorHook', kind: 'string', maxLength: 256 }),
        param({ shortName: 'CddHeaderFile', path: '/EcucDefs/Det/DetGeneral/CddHeaderFile', kind: 'string', maxLength: 256 }),
      ],
    }),
  ],
});

const wdgIf = module({
  shortName: 'WdgIf',
  path: '/EcucDefs/WdgIf',
  containers: [
    container({
      shortName: 'WdgIfGeneral',
      path: '/EcucDefs/WdgIf/WdgIfGeneral',
      parameters: [
        param({ shortName: 'WdgIfDevErrorDetect', path: '/EcucDefs/WdgIf/WdgIfGeneral/WdgIfDevErrorDetect', kind: 'boolean' }),
        param({ shortName: 'WdgIfVersionInfoApi', path: '/EcucDefs/WdgIf/WdgIfGeneral/WdgIfVersionInfoApi', kind: 'boolean' }),
      ],
    }),
    container({
      shortName: 'WdgIfDevice',
      path: '/EcucDefs/WdgIf/WdgIfDevice',
      parameters: [
        param({
          shortName: 'WdgIfDeviceIndex',
          path: '/EcucDefs/WdgIf/WdgIfDevice/WdgIfDeviceIndex',
          kind: 'integer',
          minValue: 0,
          maxValue: 255,
        }),
        param({
          shortName: 'WdgSetModeName',
          path: '/EcucDefs/WdgIf/WdgIfDevice/WdgSetModeName',
          kind: 'function-name',
          maxLength: 256,
        }),
      ],
      references: [
        ref({
          shortName: 'WdgIfDriverRef',
          path: '/EcucDefs/WdgIf/WdgIfDevice/WdgIfDriverRef',
          destKind: 'ECUC-CONTAINER-VALUE',
        }),
      ],
    }),
  ],
});

const ecuC = module({
  shortName: 'EcuC',
  path: '/EcucDefs/EcuC',
  containers: [
    container({
      shortName: 'EcucGeneral',
      path: '/EcucDefs/EcuC/EcucGeneral',
      parameters: [
        param({
          shortName: 'BitOrder',
          path: '/EcucDefs/EcuC/EcucGeneral/BitOrder',
          kind: 'enumeration',
          enumerationLiterals: ['LSB'],
        }),
        param({
          shortName: 'ByteOrder',
          path: '/EcucDefs/EcuC/EcucGeneral/ByteOrder',
          kind: 'enumeration',
          enumerationLiterals: ['Intel'],
        }),
        param({
          shortName: 'CPUType',
          path: '/EcucDefs/EcuC/EcucGeneral/CPUType',
          kind: 'enumeration',
          enumerationLiterals: ['CPU32Bit'],
        }),
      ],
    }),
    container({
      shortName: 'EcucPduCollection',
      path: '/EcucDefs/EcuC/EcucPduCollection',
      parameters: [
        param({
          shortName: 'PduIdTypeEnum',
          path: '/EcucDefs/EcuC/EcucPduCollection/PduIdTypeEnum',
          kind: 'enumeration',
          enumerationLiterals: ['uint8'],
        }),
        param({
          shortName: 'PduLengthTypeEnum',
          path: '/EcucDefs/EcuC/EcucPduCollection/PduLengthTypeEnum',
          kind: 'enumeration',
          enumerationLiterals: ['uint16'],
        }),
      ],
      subContainers: [
        container({
          shortName: 'Pdu',
          path: '/EcucDefs/EcuC/EcucPduCollection/Pdu',
          upperMultiplicity: 'infinite',
          parameters: [
            param({
              shortName: 'PduLength',
              path: '/EcucDefs/EcuC/EcucPduCollection/Pdu/PduLength',
              kind: 'integer',
              minValue: 0,
              maxValue: 64,
            }),
            param({
              shortName: 'UserDefine',
              path: '/EcucDefs/EcuC/EcucPduCollection/Pdu/UserDefine',
              kind: 'boolean',
            }),
            param({
              shortName: 'PduType',
              path: '/EcucDefs/EcuC/EcucPduCollection/Pdu/PduType',
              kind: 'enumeration',
              enumerationLiterals: ['DBC'],
            }),
          ],
          references: [
            ref({
              shortName: 'SysTPduToFrameMappingRef',
              path: '/EcucDefs/EcuC/EcucPduCollection/Pdu/SysTPduToFrameMappingRef',
              destKind: 'ECUC-FOREIGN-REFERENCE-DEF',
            }),
          ],
        }),
      ],
    }),
  ],
});

const pduR = module({
  shortName: 'PduR',
  path: '/EcucDefs/PduR',
  containers: [
    container({
      shortName: 'PduRGeneral',
      path: '/EcucDefs/PduR/PduRGeneral',
      parameters: [
        param({ shortName: 'CanIfModuleSupport', path: '/EcucDefs/PduR/PduRGeneral/CanIfModuleSupport', kind: 'boolean' }),
        param({ shortName: 'CanTpModuleSupport', path: '/EcucDefs/PduR/PduRGeneral/CanTpModuleSupport', kind: 'boolean' }),
        param({ shortName: 'ComModuleSupport', path: '/EcucDefs/PduR/PduRGeneral/ComModuleSupport', kind: 'boolean' }),
        param({ shortName: 'DcmModuleSupport', path: '/EcucDefs/PduR/PduRGeneral/DcmModuleSupport', kind: 'boolean' }),
      ],
    }),
    container({
      shortName: 'PduRBswModules',
      path: '/EcucDefs/PduR/PduRBswModules',
      parameters: [
        param({ shortName: 'PduRUpperModule', path: '/EcucDefs/PduR/PduRBswModules/PduRUpperModule', kind: 'boolean' }),
        param({ shortName: 'PduRLowerModule', path: '/EcucDefs/PduR/PduRBswModules/PduRLowerModule', kind: 'boolean' }),
      ],
    }),
    container({
      shortName: 'PduRRoutingTables',
      path: '/EcucDefs/PduR/PduRRoutingTables',
      parameters: [
        param({
          shortName: 'PduRConfigurationId',
          path: '/EcucDefs/PduR/PduRRoutingTables/PduRConfigurationId',
          kind: 'integer',
          minValue: 0,
          maxValue: 65535,
        }),
      ],
      subContainers: [
        container({
          shortName: 'PduRRoutingTable',
          path: '/EcucDefs/PduR/PduRRoutingTables/PduRRoutingTable',
          upperMultiplicity: 'infinite',
          subContainers: [
            container({
              shortName: 'PduRRoutingPath',
              path: '/EcucDefs/PduR/PduRRoutingTables/PduRRoutingTable/PduRRoutingPath',
              subContainers: [
                container({
                  shortName: 'PduRDestPdu',
                  path: '/EcucDefs/PduR/PduRRoutingTables/PduRRoutingTable/PduRRoutingPath/PduRDestPdu',
                  parameters: [
                    param({
                      shortName: 'PduRDestPduHandleId',
                      path: '/EcucDefs/PduR/PduRRoutingTables/PduRRoutingTable/PduRRoutingPath/PduRDestPdu/PduRDestPduHandleId',
                      kind: 'integer',
                      minValue: 0,
                      maxValue: 65535,
                    }),
                    param({
                      shortName: 'PduRTpThreshold',
                      path: '/EcucDefs/PduR/PduRRoutingTables/PduRRoutingTable/PduRRoutingPath/PduRDestPdu/PduRTpThreshold',
                      kind: 'integer',
                      minValue: 0,
                      maxValue: 4095,
                    }),
                    param({
                      shortName: 'PduRDestModule',
                      path: '/EcucDefs/PduR/PduRRoutingTables/PduRRoutingTable/PduRRoutingPath/PduRDestPdu/PduRDestModule',
                      kind: 'enumeration',
                      enumerationLiterals: ['COM'],
                    }),
                    param({
                      shortName: 'PduRDestPduDataProvision',
                      path: '/EcucDefs/PduR/PduRRoutingTables/PduRRoutingTable/PduRRoutingPath/PduRDestPdu/PduRDestPduDataProvision',
                      kind: 'enumeration',
                      enumerationLiterals: ['PDUR_DIRECT'],
                    }),
                  ],
                }),
                container({
                  shortName: 'PduRSrcPdu',
                  path: '/EcucDefs/PduR/PduRRoutingTables/PduRRoutingTable/PduRRoutingPath/PduRSrcPdu',
                  parameters: [
                    param({
                      shortName: 'PduRSrcModule',
                      path: '/EcucDefs/PduR/PduRRoutingTables/PduRRoutingTable/PduRRoutingPath/PduRSrcPdu/PduRSrcModule',
                      kind: 'enumeration',
                      enumerationLiterals: ['CANIF'],
                    }),
                  ],
                }),
              ],
            }),
          ],
          parameters: [
            param({
              shortName: 'PduRMaxRoutingTableCnt',
              path: '/EcucDefs/PduR/PduRRoutingTables/PduRRoutingTable/PduRMaxRoutingTableCnt',
              kind: 'integer',
              minValue: 0,
              maxValue: 255,
            }),
          ],
        }),
      ],
    }),
  ],
});

const com = module({
  shortName: 'Com',
  path: '/EcucDefs/Com',
  containers: [
    container({
      shortName: 'ComGeneral',
      path: '/EcucDefs/Com/ComGeneral',
      parameters: [
        param({ shortName: 'VersionCheck', path: '/EcucDefs/Com/ComGeneral/VersionCheck', kind: 'boolean' }),
        param({ shortName: 'ComConfigurationUseDet', path: '/EcucDefs/Com/ComGeneral/ComConfigurationUseDet', kind: 'boolean' }),
        param({
          shortName: 'ComSupportedIPduGroups',
          path: '/EcucDefs/Com/ComGeneral/ComSupportedIPduGroups',
          kind: 'integer',
          minValue: 0,
          maxValue: 65535,
        }),
      ],
    }),
    container({
      shortName: 'ComConfig',
      path: '/EcucDefs/Com/ComConfig',
      subContainers: [
        container({
          shortName: 'ComIPdu',
          path: '/EcucDefs/Com/ComConfig/ComIPdu',
          upperMultiplicity: 'infinite',
          parameters: [
            param({
              shortName: 'ComIPduDirection',
              path: '/EcucDefs/Com/ComConfig/ComIPdu/ComIPduDirection',
              kind: 'enumeration',
              enumerationLiterals: ['SEND'],
            }),
            param({
              shortName: 'ComIPduSignalProcessing',
              path: '/EcucDefs/Com/ComConfig/ComIPdu/ComIPduSignalProcessing',
              kind: 'enumeration',
              enumerationLiterals: ['DEFERRED'],
            }),
            param({
              shortName: 'ComIPduType',
              path: '/EcucDefs/Com/ComConfig/ComIPdu/ComIPduType',
              kind: 'enumeration',
              enumerationLiterals: ['NORMAL'],
            }),
            param({
              shortName: 'ComIPduHandleId',
              path: '/EcucDefs/Com/ComConfig/ComIPdu/ComIPduHandleId',
              kind: 'integer',
              minValue: 0,
              maxValue: 65535,
            }),
            param({
              shortName: 'IPduDLC',
              path: '/EcucDefs/Com/ComConfig/ComIPdu/IPduDLC',
              kind: 'integer',
              minValue: 0,
              maxValue: 64,
            }),
          ],
          subContainers: [
            container({
              shortName: 'ComTxIPdu',
              path: '/EcucDefs/Com/ComConfig/ComIPdu/ComTxIPdu',
              parameters: [
                param({
                  shortName: 'ComTxIPduClearUpdateBit',
                  path: '/EcucDefs/Com/ComConfig/ComIPdu/ComTxIPdu/ComTxIPduClearUpdateBit',
                  kind: 'enumeration',
                  enumerationLiterals: ['Confirmation'],
                }),
                param({
                  shortName: 'ComMinimumDelayTime',
                  path: '/EcucDefs/Com/ComConfig/ComIPdu/ComTxIPdu/ComMinimumDelayTime',
                  kind: 'float',
                  minValue: 0,
                  maxValue: 65.535,
                }),
              ],
              subContainers: [
                container({
                  shortName: 'ComTxModeTrue',
                  path: '/EcucDefs/Com/ComConfig/ComIPdu/ComTxIPdu/ComTxModeTrue',
                  subContainers: [
                    container({
                      shortName: 'ComTxMode',
                      path: '/EcucDefs/Com/ComConfig/ComIPdu/ComTxIPdu/ComTxModeTrue/ComTxMode',
                      parameters: [
                        param({
                          shortName: 'ComTxModeMode',
                          path: '/EcucDefs/Com/ComConfig/ComIPdu/ComTxIPdu/ComTxModeTrue/ComTxMode/ComTxModeMode',
                          kind: 'enumeration',
                          enumerationLiterals: ['PERIODIC'],
                        }),
                        param({
                          shortName: 'ComTxModeRepetitionPeriod',
                          path: '/EcucDefs/Com/ComConfig/ComIPdu/ComTxIPdu/ComTxModeTrue/ComTxMode/ComTxModeRepetitionPeriod',
                          kind: 'float',
                          minValue: 0,
                          maxValue: 65.535,
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        container({
          shortName: 'ComSignal',
          path: '/EcucDefs/Com/ComConfig/ComSignal',
          parameters: [
            param({
              shortName: 'ComBitPosition',
              path: '/EcucDefs/Com/ComConfig/ComSignal/ComBitPosition',
              kind: 'integer',
              minValue: 0,
              maxValue: 63,
            }),
            param({
              shortName: 'ComBitSize',
              path: '/EcucDefs/Com/ComConfig/ComSignal/ComBitSize',
              kind: 'integer',
              minValue: 1,
              maxValue: 64,
            }),
            param({
              shortName: 'ComHandleId',
              path: '/EcucDefs/Com/ComConfig/ComSignal/ComHandleId',
              kind: 'integer',
              minValue: 0,
              maxValue: 65535,
            }),
            param({
              shortName: 'ComSignalLength',
              path: '/EcucDefs/Com/ComConfig/ComSignal/ComSignalLength',
              kind: 'integer',
              minValue: 0,
              maxValue: 64,
            }),
            param({
              shortName: 'ComSignalType',
              path: '/EcucDefs/Com/ComConfig/ComSignal/ComSignalType',
              kind: 'enumeration',
              enumerationLiterals: ['UINT8', 'UINT16'],
            }),
            param({
              shortName: 'ComTransferProperty',
              path: '/EcucDefs/Com/ComConfig/ComSignal/ComTransferProperty',
              kind: 'enumeration',
              enumerationLiterals: ['PENDING'],
            }),
          ],
        }),
      ],
    }),
  ],
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a `SchemaLayer` that mirrors the 46-entry `ECUC_SUBSET_SCHEMA`
 * that used to back the single-doc baseline + per-rule unit tests.
 *
 * Tests that exercise range / enum / reference / required / schema /
 * maxLength rules should pass the returned layer as the second
 * argument to `validate(doc, layer)` / `validateProject(docs, layer)`.
 * Tests that exercise container multiplicity can rely on the layer's
 * `containers` map or fall through to the static `ECUC_CONTAINER_SCHEMA`.
 */
export function buildSubsetLikeLayer(): SchemaLayer {
  return buildSchemaLayer([makeDoc([det, wdgIf, ecuC, pduR, com])]);
}