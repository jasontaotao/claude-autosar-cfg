/**
 * Facade + PduR mapper tests — spec
 * docs/superpowers/specs/2026-09-03-dbc-full-import-design.md §7.6 (PduR
 * topology) + §8.1 (stats) + §2.1 (determinism). Synthetic R22-style
 * Com / CanIf / PduR BSWMD fixtures; assertions follow the task-9 brief
 * verbatim (1..8).
 *
 * Instance-path convention (RULING 10): reference targets and field-diff
 * containerPath are real paths in the generated module trees
 * (`/Com/ComConfig/<msg>`, `/CanIf/CanIfConfig/<msg>`,
 * `/PduR/PduRRoutingPaths/<msg>`), matching collectImportContainers keys —
 * never BSWMD definition-spine segments.
 */

import { describe, expect, it } from 'vitest';

import type { ArxmlContainer, ArxmlModule, ParamValue } from '../../arxml/types.js';
import { collectImportContainers } from '../../import/threeWayMerge.js';
import type { BswModuleDef, ContainerDef, ParamDef } from '../../project/bswmd/types.js';
import { buildDbcBswmdDefIndex } from '../bswmdDefIndex.js';
import type { Dbm, DbmMessage, DbmSignal, DbmWarning } from '../dbm.js';
import { mapDbmToEcuc, type MapDbmToEcucRequest } from '../mappers/mapDbmToEcuc.js';
import { AUTOSAR_R22_CAN_PROFILE, type DbcImportProfile } from '../profile.js';

// ---------------------------------------------------------------------------
// Fixtures: synthetic R22-style Com / CanIf / PduR BSWMD.
// ---------------------------------------------------------------------------

const COM_ROOT = '/AUTOSAR_R22/EcucDefs/Com';
const CANIF_ROOT = '/AUTOSAR_R22/EcucDefs/CanIf';
const PDUR_ROOT = '/AUTOSAR_R22/EcucDefs/PduR';

function param(
  shortName: string,
  containerPath: string,
  kind: ParamDef['kind'],
  enumerationLiterals: readonly string[] = [],
): ParamDef {
  return {
    shortName,
    path: `${containerPath}/${shortName}`,
    kind,
    defaultValue: null,
    minValue: null,
    maxValue: null,
    minLength: null,
    maxLength: null,
    enumerationLiterals,
  };
}

function ref(
  shortName: string,
  containerPath: string,
  destKind: string,
): ContainerDef['references'][number] {
  return {
    shortName,
    path: `${containerPath}/${shortName}`,
    destKind,
    lowerMultiplicity: 0,
    upperMultiplicity: 1,
  };
}

function container(
  shortName: string,
  path: string,
  parameters: readonly ParamDef[] = [],
  subContainers: readonly ContainerDef[] = [],
  references: ContainerDef['references'] = [],
): ContainerDef {
  return {
    shortName,
    path,
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    subContainers,
    parameters,
    references,
    choices: [],
  };
}

const SIGNAL_TYPE_LITERALS = [
  'BOOLEAN',
  'UINT8',
  'UINT16',
  'UINT32',
  'UINT64',
  'SINT8',
  'SINT16',
  'SINT32',
  'SINT64',
  'FLOAT32',
  'FLOAT64',
] as const;

function buildComModule(): BswModuleDef {
  const comSignal = container('ComSignal', `${COM_ROOT}/ComConfig/ComIPdu/ComSignal`, [
    param('ComBitPosition', `${COM_ROOT}/ComConfig/ComIPdu/ComSignal`, 'integer'),
    param('ComBitSize', `${COM_ROOT}/ComConfig/ComIPdu/ComSignal`, 'integer'),
    param('ComSignalEndianness', `${COM_ROOT}/ComConfig/ComIPdu/ComSignal`, 'enumeration', [
      'LITTLE_ENDIAN',
      'BIG_ENDIAN',
    ]),
    param('ComSignalType', `${COM_ROOT}/ComConfig/ComIPdu/ComSignal`, 'enumeration', [
      ...SIGNAL_TYPE_LITERALS,
    ]),
    param('ComSignalDataInvalidValue', `${COM_ROOT}/ComConfig/ComIPdu/ComSignal`, 'integer'),
    param('ComTransferProperty', `${COM_ROOT}/ComConfig/ComIPdu/ComSignal`, 'enumeration', [
      'PENDING',
      'TRIGGERED',
      'TRIGGERED_ON_CHANGE',
    ]),
  ]);
  const comTxMode = container(
    'ComTxMode',
    `${COM_ROOT}/ComConfig/ComIPdu/ComTxIPdu/ComTxModeTrue/ComTxMode`,
    [
      param(
        'ComTxModeMode',
        `${COM_ROOT}/ComConfig/ComIPdu/ComTxIPdu/ComTxModeTrue/ComTxMode`,
        'enumeration',
        ['PERIODIC', 'DIRECT', 'MIXED'],
      ),
      param(
        'ComTxModeTimePeriod',
        `${COM_ROOT}/ComConfig/ComIPdu/ComTxIPdu/ComTxModeTrue/ComTxMode`,
        'float',
      ),
    ],
  );
  const comTxModeTrue = container(
    'ComTxModeTrue',
    `${COM_ROOT}/ComConfig/ComIPdu/ComTxIPdu/ComTxModeTrue`,
    [],
    [comTxMode],
  );
  const comTxIpdu = container(
    'ComTxIPdu',
    `${COM_ROOT}/ComConfig/ComIPdu/ComTxIPdu`,
    [],
    [comTxModeTrue],
  );
  const comIpdu = container(
    'ComIPdu',
    `${COM_ROOT}/ComConfig/ComIPdu`,
    [
      param('ComIPduDirection', `${COM_ROOT}/ComConfig/ComIPdu`, 'enumeration', [
        'SEND',
        'RECEIVE',
      ]),
      param('ComIPduType', `${COM_ROOT}/ComConfig/ComIPdu`, 'enumeration', ['NORMAL', 'TP']),
      param('ComHandleId', `${COM_ROOT}/ComConfig/ComIPdu`, 'integer'),
      param('IPduDLC', `${COM_ROOT}/ComConfig/ComIPdu`, 'integer'),
    ],
    [comSignal, comTxIpdu],
  );
  return {
    shortName: 'Com',
    path: COM_ROOT,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [container('ComConfig', `${COM_ROOT}/ComConfig`, [], [comIpdu])],
    providedEntries: [],
    references: [],
    lowerMultiplicity: 1,
    upperMultiplicity: 1,
  };
}

function buildCanIfModule(): BswModuleDef {
  const txPdu = container('CanIfTxPdu', `${CANIF_ROOT}/CanIfConfig/CanIfTxPdu`, [
    param('CanIfTxPduCanId', `${CANIF_ROOT}/CanIfConfig/CanIfTxPdu`, 'integer'),
    param('CanIfTxPduCanIdType', `${CANIF_ROOT}/CanIfConfig/CanIfTxPdu`, 'enumeration', [
      'STANDARD_CAN',
      'EXTENDED_CAN',
    ]),
    param('CanIfTxPduDlc', `${CANIF_ROOT}/CanIfConfig/CanIfTxPdu`, 'integer'),
    param('CanIfTxPduId', `${CANIF_ROOT}/CanIfConfig/CanIfTxPdu`, 'integer'),
    param('CanIfTxPduType', `${CANIF_ROOT}/CanIfConfig/CanIfTxPdu`, 'enumeration', [
      'STATIC',
      'DYNAMIC',
    ]),
    param('CanIfTxPduUserTxConfirmationUL', `${CANIF_ROOT}/CanIfConfig/CanIfTxPdu`, 'string'),
  ]);
  const rxPdu = container('CanIfRxPdu', `${CANIF_ROOT}/CanIfConfig/CanIfRxPdu`, [
    param('CanIfRxPduCanId', `${CANIF_ROOT}/CanIfConfig/CanIfRxPdu`, 'integer'),
    param('CanIfRxPduCanIdType', `${CANIF_ROOT}/CanIfConfig/CanIfRxPdu`, 'enumeration', [
      'STANDARD_CAN',
      'EXTENDED_CAN',
    ]),
    param('CanIfRxPduDlc', `${CANIF_ROOT}/CanIfConfig/CanIfRxPdu`, 'integer'),
    param('CanIfRxPduId', `${CANIF_ROOT}/CanIfConfig/CanIfRxPdu`, 'integer'),
    param('CanIfRxPduType', `${CANIF_ROOT}/CanIfConfig/CanIfRxPdu`, 'enumeration', [
      'STATIC',
      'DYNAMIC',
    ]),
    param('CanIfRxPduUserRxIndicationUL', `${CANIF_ROOT}/CanIfConfig/CanIfRxPdu`, 'string'),
  ]);
  return {
    shortName: 'CanIf',
    path: CANIF_ROOT,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [container('CanIfConfig', `${CANIF_ROOT}/CanIfConfig`, [], [txPdu, rxPdu])],
    providedEntries: [],
    references: [],
    lowerMultiplicity: 1,
    upperMultiplicity: 1,
  };
}

/** PduR ref defs live in the PduRSrcPdu / PduRDestPdu sub-containers (R22 shape). */
function buildPduRModule(): BswModuleDef {
  const srcPdu = container(
    'PduRSrcPdu',
    `${PDUR_ROOT}/PduRRoutingPaths/PduRRoutingPath/PduRSrcPdu`,
    [
      param(
        'PduRSrcPduHandleId',
        `${PDUR_ROOT}/PduRRoutingPaths/PduRRoutingPath/PduRSrcPdu`,
        'integer',
      ),
    ],
    [],
    [
      ref(
        'PduRSrcPduRef',
        `${PDUR_ROOT}/PduRRoutingPaths/PduRRoutingPath/PduRSrcPdu`,
        'ECUC-CONTAINER-VALUE',
      ),
    ],
  );
  const destPdu = container(
    'PduRDestPdu',
    `${PDUR_ROOT}/PduRRoutingPaths/PduRRoutingPath/PduRDestPdu`,
    [
      param(
        'PduRDestPduHandleId',
        `${PDUR_ROOT}/PduRRoutingPaths/PduRRoutingPath/PduRDestPdu`,
        'integer',
      ),
    ],
    [],
    [
      ref(
        'PduRDestPduRef',
        `${PDUR_ROOT}/PduRRoutingPaths/PduRRoutingPath/PduRDestPdu`,
        'ECUC-CONTAINER-VALUE',
      ),
    ],
  );
  const routingPath = container(
    'PduRRoutingPath',
    `${PDUR_ROOT}/PduRRoutingPaths/PduRRoutingPath`,
    [],
    [srcPdu, destPdu],
  );
  return {
    shortName: 'PduR',
    path: PDUR_ROOT,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [container('PduRRoutingPaths', `${PDUR_ROOT}/PduRRoutingPaths`, [], [routingPath])],
    providedEntries: [],
    references: [],
    lowerMultiplicity: 1,
    upperMultiplicity: 1,
  };
}

/** destKind 变体：PduRSrcPduRef 声明成 EcuC Pdu 域（不匹配 ECUC container value）。 */
function buildPduRModuleWithBadDestKind(destKind: string): BswModuleDef {
  const module = buildPduRModule();
  const routingPaths = module.containers[0]!;
  const routingPath = routingPaths.subContainers[0]!;
  const srcPdu = routingPath.subContainers[0]!;
  return {
    ...module,
    containers: [
      {
        ...routingPaths,
        subContainers: [
          {
            ...routingPath,
            subContainers: [
              {
                ...srcPdu,
                references: [
                  ref(
                    'PduRSrcPduRef',
                    `${PDUR_ROOT}/PduRRoutingPaths/PduRRoutingPath/PduRSrcPdu`,
                    destKind,
                  ),
                ],
              },
              routingPath.subContainers[1]!,
            ],
          },
        ],
      },
    ],
  };
}

/**
 * HandleId-fallback fixture：PduRSrcPdu / PduRDestPdu 只声明 *HandleId 参数，
 * 不声明 reference（项目既有 fixture 形态，spec §7.6 HandleId fallback）。
 */
function buildPduRHandleOnlyModule(): BswModuleDef {
  const srcPdu = container(
    'PduRSrcPdu',
    `${PDUR_ROOT}/PduRRoutingPaths/PduRRoutingPath/PduRSrcPdu`,
    [
      param(
        'PduRSrcPduHandleId',
        `${PDUR_ROOT}/PduRRoutingPaths/PduRRoutingPath/PduRSrcPdu`,
        'integer',
      ),
    ],
  );
  const destPdu = container(
    'PduRDestPdu',
    `${PDUR_ROOT}/PduRRoutingPaths/PduRRoutingPath/PduRDestPdu`,
    [
      param(
        'PduRDestPduHandleId',
        `${PDUR_ROOT}/PduRRoutingPaths/PduRRoutingPath/PduRDestPdu`,
        'integer',
      ),
    ],
  );
  const routingPath = container(
    'PduRRoutingPath',
    `${PDUR_ROOT}/PduRRoutingPaths/PduRRoutingPath`,
    [],
    [srcPdu, destPdu],
  );
  return {
    shortName: 'PduR',
    path: PDUR_ROOT,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [container('PduRRoutingPaths', `${PDUR_ROOT}/PduRRoutingPaths`, [], [routingPath])],
    providedEntries: [],
    references: [],
    lowerMultiplicity: 1,
    upperMultiplicity: 1,
  };
}

/**
 * 扁平 HandleId 布局 fixture：PduRSrcPduHandleId / PduRDestPduHandleId 直接挂
 * routing path 下，无 PduRSrcPdu / PduRDestPdu 子容器、无 reference（§7.6 直接
 * 参数布局，真实 BSWMD 形态）。
 */
function buildPduRFlatModule(): BswModuleDef {
  const routingPath = container(
    'PduRRoutingPath',
    `${PDUR_ROOT}/PduRRoutingPaths/PduRRoutingPath`,
    [
      param('PduRSrcPduHandleId', `${PDUR_ROOT}/PduRRoutingPaths/PduRRoutingPath`, 'integer'),
      param('PduRDestPduHandleId', `${PDUR_ROOT}/PduRRoutingPaths/PduRRoutingPath`, 'integer'),
    ],
    [],
  );
  return {
    shortName: 'PduR',
    path: PDUR_ROOT,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [container('PduRRoutingPaths', `${PDUR_ROOT}/PduRRoutingPaths`, [], [routingPath])],
    providedEntries: [],
    references: [],
    lowerMultiplicity: 1,
    upperMultiplicity: 1,
  };
}

const R22_INDEX = buildDbcBswmdDefIndex(
  new Map([
    ['Com', buildComModule()],
    ['CanIf', buildCanIfModule()],
    ['PduR', buildPduRModule()],
  ]),
);

/** 扁平布局索引：PduR 用 buildPduRFlatModule，其余同 R22_INDEX。 */
const FLAT_INDEX = buildDbcBswmdDefIndex(
  new Map([
    ['Com', buildComModule()],
    ['CanIf', buildCanIfModule()],
    ['PduR', buildPduRFlatModule()],
  ]),
);

// ---------------------------------------------------------------------------
// DBM fixtures + facade harness.
// ---------------------------------------------------------------------------

function message(
  key: string,
  transmitter: string | undefined,
  receivers: readonly string[],
  overrides: Partial<DbmMessage> = {},
): DbmMessage {
  return {
    key,
    shortName: key,
    messageId: 0x100,
    isExtended: false,
    dlc: 8,
    ...(transmitter !== undefined && { transmitter }),
    receivers,
    attributes: {},
    comments: {},
    ...overrides,
  };
}

function signal(key: string, messageKey: string, overrides: Partial<DbmSignal> = {}): DbmSignal {
  return {
    key,
    messageKey,
    shortName: key,
    startBit: 0,
    length: 8,
    byteOrder: 'little-endian',
    valueType: 'unsigned',
    factor: 1,
    offset: 0,
    receivers: [],
    multiplex: { kind: 'plain' },
    attributes: {},
    ...overrides,
  };
}

function makeDbm(
  messages: readonly DbmMessage[],
  signals: readonly DbmSignal[] = [],
  warnings: readonly DbmWarning[] = [],
): Dbm {
  return {
    meta: { sourcePath: 'test.dbc', protocol: 'CAN', sourceHash: 'hash' },
    nodes: [],
    messages,
    signals,
    warnings,
  };
}

function makeRequest(overrides: Partial<MapDbmToEcucRequest> = {}): MapDbmToEcucRequest {
  return {
    dbm: makeDbm([]),
    targetNode: 'ECM',
    index: R22_INDEX,
    profile: AUTOSAR_R22_CAN_PROFILE,
    currentIds: new Map(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tree helpers.
// ---------------------------------------------------------------------------

function findChild(
  parent: ArxmlContainer | ArxmlModule,
  shortName: string,
): ArxmlContainer | undefined {
  return parent.children.find(
    (child): child is ArxmlContainer => child.kind === 'container' && child.shortName === shortName,
  );
}

function moduleOf(
  result: ReturnType<typeof mapDbmToEcuc>,
  name: 'Com' | 'CanIf' | 'PduR',
): ArxmlModule {
  const module = result.modules.get(name);
  if (module === undefined) throw new Error(`module ${name} missing`);
  return module;
}

function paramOf(containerEl: ArxmlContainer, name: string): ParamValue | undefined {
  return containerEl.params[name];
}

/** 沿实例路径取容器：`/PduR/PduRRoutingPaths/EngineMsg/PduRSrcPdu`。 */
function containerAt(module: ArxmlModule, path: string): ArxmlContainer {
  const segments = path.split('/').filter((s) => s.length > 0);
  let current: ArxmlContainer | ArxmlModule = module;
  for (const segment of segments.slice(1)) {
    const next = findChild(current, segment);
    if (next === undefined) throw new Error(`container ${path} missing at segment ${segment}`);
    current = next;
  }
  if (current.kind === 'container') return current;
  throw new Error(`path ${path} resolves to the module root`);
}

// ---------------------------------------------------------------------------
// Tests — task-9 brief assertions 1..8.
// ---------------------------------------------------------------------------

describe('mapDbmToEcuc — PduR Tx path topology', () => {
  it('creates a routing path per relevant message with src→Com / dest→CanIf refs for Tx', () => {
    const txMsg = message('EngineMsg', 'ECM', [], { messageId: 0x123 });
    const result = mapDbmToEcuc(makeRequest({ dbm: makeDbm([txMsg]) }));

    const route = containerAt(moduleOf(result, 'PduR'), '/PduR/PduRRoutingPaths/EngineMsg');
    expect(route.definitionRef).toBe(`${PDUR_ROOT}/PduRRoutingPaths/PduRRoutingPath`);

    const srcPdu = containerAt(
      moduleOf(result, 'PduR'),
      '/PduR/PduRRoutingPaths/EngineMsg/PduRSrcPdu',
    );
    expect(srcPdu.definitionRef).toBe(`${PDUR_ROOT}/PduRRoutingPaths/PduRRoutingPath/PduRSrcPdu`);
    const srcRef = paramOf(srcPdu, 'PduRSrcPduRef');
    expect(srcRef).toEqual({
      type: 'reference',
      value: '/Com/ComConfig/EngineMsg',
      dest: 'ECUC-CONTAINER-VALUE',
      definitionRef: `${PDUR_ROOT}/PduRRoutingPaths/PduRRoutingPath/PduRSrcPdu/PduRSrcPduRef`,
    });

    const destPdu = containerAt(
      moduleOf(result, 'PduR'),
      '/PduR/PduRRoutingPaths/EngineMsg/PduRDestPdu',
    );
    expect(destPdu.definitionRef).toBe(`${PDUR_ROOT}/PduRRoutingPaths/PduRRoutingPath/PduRDestPdu`);
    const destRef = paramOf(destPdu, 'PduRDestPduRef');
    expect(destRef).toEqual({
      type: 'reference',
      value: '/CanIf/CanIfConfig/EngineMsg',
      dest: 'ECUC-CONTAINER-VALUE',
      definitionRef: `${PDUR_ROOT}/PduRRoutingPaths/PduRRoutingPath/PduRDestPdu/PduRDestPduRef`,
    });
  });

  it('does not emit PduR handle ids while the R22 reference defs exist', () => {
    const txMsg = message('EngineMsg', 'ECM', []);
    const result = mapDbmToEcuc(makeRequest({ dbm: makeDbm([txMsg]) }));
    const srcPdu = containerAt(
      moduleOf(result, 'PduR'),
      '/PduR/PduRRoutingPaths/EngineMsg/PduRSrcPdu',
    );
    const destPdu = containerAt(
      moduleOf(result, 'PduR'),
      '/PduR/PduRRoutingPaths/EngineMsg/PduRDestPdu',
    );
    expect(paramOf(srcPdu, 'PduRSrcPduHandleId')).toBeUndefined();
    expect(paramOf(destPdu, 'PduRDestPduHandleId')).toBeUndefined();
  });
});

describe('mapDbmToEcuc — PduR Rx path topology', () => {
  it('creates src→CanIf / dest→Com refs for Rx messages', () => {
    const rxMsg = message('GearMsg', 'TCM', ['ECM']);
    const result = mapDbmToEcuc(makeRequest({ dbm: makeDbm([rxMsg]) }));

    const srcRef = paramOf(
      containerAt(moduleOf(result, 'PduR'), '/PduR/PduRRoutingPaths/GearMsg/PduRSrcPdu'),
      'PduRSrcPduRef',
    );
    expect(srcRef).toMatchObject({ type: 'reference', value: '/CanIf/CanIfConfig/GearMsg' });

    const destRef = paramOf(
      containerAt(moduleOf(result, 'PduR'), '/PduR/PduRRoutingPaths/GearMsg/PduRDestPdu'),
      'PduRDestPduRef',
    );
    expect(destRef).toMatchObject({ type: 'reference', value: '/Com/ComConfig/GearMsg' });
  });

  it('creates exactly one routing path per relevant message, none for irrelevant ones', () => {
    const dbm = makeDbm([
      message('EngineMsg', 'ECM', []),
      message('GearMsg', 'TCM', ['ECM']),
      message('UnrelatedMsg', 'ABS', []),
    ]);
    const result = mapDbmToEcuc(makeRequest({ dbm }));
    const pduR = moduleOf(result, 'PduR');
    expect(findChild(pduR, 'PduRRoutingPaths')?.children).toHaveLength(2);
    expect(findChild(findChild(pduR, 'PduRRoutingPaths')!, 'UnrelatedMsg')).toBeUndefined();
  });
});

describe('mapDbmToEcuc — reference destKind validation', () => {
  it('emits dbc-reference-missing and omits the reference when destKind mismatches the target space', () => {
    const index = buildDbcBswmdDefIndex(
      new Map([
        ['Com', buildComModule()],
        ['CanIf', buildCanIfModule()],
        ['PduR', buildPduRModuleWithBadDestKind('ECUC-PARAM-CONF-CONTAINER-DEF')],
      ]),
    );
    const txMsg = message('EngineMsg', 'ECM', []);
    const result = mapDbmToEcuc(makeRequest({ dbm: makeDbm([txMsg]), index }));

    const srcPdu = containerAt(
      moduleOf(result, 'PduR'),
      '/PduR/PduRRoutingPaths/EngineMsg/PduRSrcPdu',
    );
    expect(paramOf(srcPdu, 'PduRSrcPduRef')).toBeUndefined();
    expect(
      result.warnings.some(
        (w) => w.code === 'dbc-reference-missing' && w.elementRef === 'PduRSrcPduRef',
      ),
    ).toBe(true);
    const srcRefDiff = result.fieldDiffsByModule
      .get('PduR')
      ?.find((d) => d.paramKey === 'PduRRoutingPaths/PduRRoutingPath/PduRSrcPdu/PduRSrcPduRef');
    // spec §7.6 EcuC-Pdu 边界：destKind 不匹配 → Unmapped（用户 EcuC 层手工补齐）。
    expect(srcRefDiff?.source).toBe('Unmapped');
    expect(srcRefDiff?.warningCodes).toContain('dbc-reference-missing');
    // 同一条 message 的 dest 侧引用不受影响，仍正常生成。
    const destPdu = containerAt(
      moduleOf(result, 'PduR'),
      '/PduR/PduRRoutingPaths/EngineMsg/PduRDestPdu',
    );
    expect(paramOf(destPdu, 'PduRDestPduRef')).toMatchObject({
      value: '/CanIf/CanIfConfig/EngineMsg',
    });
  });

  it('does not generate an EcuC Pdu destKind reference (synthetic ComPduIdRef-style) and emits dbc-reference-missing', () => {
    const index = buildDbcBswmdDefIndex(
      new Map([
        ['Com', buildComModule()],
        ['CanIf', buildCanIfModule()],
        ['PduR', buildPduRModuleWithBadDestKind('COM-IPDU')],
      ]),
    );
    const rxMsg = message('GearMsg', 'TCM', ['ECM']);
    const result = mapDbmToEcuc(makeRequest({ dbm: makeDbm([rxMsg]), index }));

    const srcPdu = containerAt(
      moduleOf(result, 'PduR'),
      '/PduR/PduRRoutingPaths/GearMsg/PduRSrcPdu',
    );
    expect(paramOf(srcPdu, 'PduRSrcPduRef')).toBeUndefined();
    expect(
      result.warnings.some(
        (w) => w.code === 'dbc-reference-missing' && w.elementRef === 'PduRSrcPduRef',
      ),
    ).toBe(true);
    const srcRefDiff = result.fieldDiffsByModule
      .get('PduR')
      ?.find((d) => d.paramKey === 'PduRRoutingPaths/PduRRoutingPath/PduRSrcPdu/PduRSrcPduRef');
    expect(srcRefDiff?.source).toBe('Unmapped');
  });
});

describe('mapDbmToEcuc — PduR HandleId fallback', () => {
  it('generates handle ids from the shared pduIds and marks the omitted refs Unmapped when ref defs are absent', () => {
    const index = buildDbcBswmdDefIndex(
      new Map([
        ['Com', buildComModule()],
        ['CanIf', buildCanIfModule()],
        ['PduR', buildPduRHandleOnlyModule()],
      ]),
    );
    const txMsg = message('EngineMsg', 'ECM', []);
    const rxMsg = message('GearMsg', 'TCM', ['ECM']);
    const result = mapDbmToEcuc(makeRequest({ dbm: makeDbm([txMsg, rxMsg]), index }));

    // Tx base 0x0000：EngineMsg → 0，GearMsg → 0x1000（perDirection）。
    const srcHandle = paramOf(
      containerAt(moduleOf(result, 'PduR'), '/PduR/PduRRoutingPaths/EngineMsg/PduRSrcPdu'),
      'PduRSrcPduHandleId',
    );
    expect(srcHandle).toMatchObject({ type: 'integer', value: 0 });
    const destHandle = paramOf(
      containerAt(moduleOf(result, 'PduR'), '/PduR/PduRRoutingPaths/EngineMsg/PduRDestPdu'),
      'PduRDestPduHandleId',
    );
    expect(destHandle).toMatchObject({ type: 'integer', value: 0 });
    const rxHandle = paramOf(
      containerAt(moduleOf(result, 'PduR'), '/PduR/PduRRoutingPaths/GearMsg/PduRSrcPdu'),
      'PduRSrcPduHandleId',
    );
    expect(rxHandle).toMatchObject({ type: 'integer', value: 0x1000 });

    // 引用的 field diff 为 Unmapped（definition 缺失），reference 值不写。
    const srcPdu = containerAt(
      moduleOf(result, 'PduR'),
      '/PduR/PduRRoutingPaths/EngineMsg/PduRSrcPdu',
    );
    expect(paramOf(srcPdu, 'PduRSrcPduRef')).toBeUndefined();
    const refDiff = result.fieldDiffsByModule
      .get('PduR')
      ?.find((d) => d.paramKey === 'PduRRoutingPaths/PduRRoutingPath/PduRSrcPdu/PduRSrcPduRef');
    expect(refDiff?.source).toBe('Unmapped');
    expect(refDiff?.containerPath).toBe('/PduR/PduRRoutingPaths/EngineMsg/PduRSrcPdu');
  });

  it('falls back to flat HandleId params when the R22 sub-containers are absent', () => {
    // 扁平布局（demo-ecu / comstack fixture 形态）：无 PduRSrcPdu / PduRDestPdu
    // 子容器，HandleId 参数直接挂 routing path 下。默认 R22 profile 已声明扁平
    // handle key → mapSide 应降级为扁平布局而非整侧省略（spec §7.6 直接参数布局）。
    const txMsg = message('EngineMsg', 'ECM', []);
    const rxMsg = message('GearMsg', 'TCM', ['ECM']);
    const result = mapDbmToEcuc(makeRequest({ dbm: makeDbm([txMsg, rxMsg]), index: FLAT_INDEX }));

    // 不再整侧省略：route 实例直接挂 HandleId 参数（无子容器）。
    const txRoute = containerAt(moduleOf(result, 'PduR'), '/PduR/PduRRoutingPaths/EngineMsg');
    expect(paramOf(txRoute, 'PduRSrcPduHandleId')).toMatchObject({ type: 'integer', value: 0 });
    expect(paramOf(txRoute, 'PduRDestPduHandleId')).toMatchObject({ type: 'integer', value: 0 });
    const rxRoute = containerAt(moduleOf(result, 'PduR'), '/PduR/PduRRoutingPaths/GearMsg');
    expect(paramOf(rxRoute, 'PduRSrcPduHandleId')).toMatchObject({
      type: 'integer',
      value: 0x1000,
    });
    expect(paramOf(rxRoute, 'PduRDestPduHandleId')).toMatchObject({
      type: 'integer',
      value: 0x1000,
    });

    // 扁平布局下不产生子容器 def-missing 警告（缺失是预期布局，非数据错误）。
    expect(
      result.warnings.some(
        (w) =>
          w.code === 'dbc-bswmd-def-missing' &&
          w.elementRef === 'PduRRoutingPaths/PduRRoutingPath/PduRSrcPdu',
      ),
    ).toBe(false);
    expect(
      result.warnings.some(
        (w) =>
          w.code === 'dbc-bswmd-def-missing' &&
          w.elementRef === 'PduRRoutingPaths/PduRRoutingPath/PduRDestPdu',
      ),
    ).toBe(false);
  });

  it('reads the flat handle keys from the profile, not hard-coded defaults', () => {
    // 用 FLAT_INDEX 中不存在的 handle key override：若 mapper 从 profile 读取，
    // makeParam 找不到 def → 不生成参数 + def-missing；若硬编码默认 key 则会
    // 生成参数。以此区分读取路径与硬编码。
    const profile = {
      ...AUTOSAR_R22_CAN_PROFILE,
      modules: {
        ...AUTOSAR_R22_CAN_PROFILE.modules,
        PduR: {
          ...AUTOSAR_R22_CAN_PROFILE.modules.PduR,
          sourceHandleKey: 'No/Such/Flat/HandleId',
          destinationHandleKey: 'No/Such/Flat/DestHandleId',
        },
      },
    };
    const txMsg = message('EngineMsg', 'ECM', []);
    const result = mapDbmToEcuc(makeRequest({ dbm: makeDbm([txMsg]), index: FLAT_INDEX, profile }));
    const txRoute = containerAt(moduleOf(result, 'PduR'), '/PduR/PduRRoutingPaths/EngineMsg');
    expect(paramOf(txRoute, 'PduRSrcPduHandleId')).toBeUndefined();
    expect(paramOf(txRoute, 'PduRDestPduHandleId')).toBeUndefined();
    // 不存在的 key 走 makeParam def-missing 路径（而非静默整侧省略）。
    expect(
      result.warnings.some(
        (w) => w.code === 'dbc-bswmd-def-missing' && w.elementRef === 'No/Such/Flat/HandleId',
      ),
    ).toBe(true);
  });
});

describe('mapDbmToEcuc — stats', () => {
  it('reports parsed totals, skipped irrelevant messages, and skipped multiplexed signals', () => {
    const dbm = makeDbm(
      [
        message('EngineMsg', 'ECM', []),
        message('GearMsg', 'TCM', ['ECM']),
        message('UnrelatedMsg', 'ABS', []),
      ],
      [
        // EngineMsg：2 个普通信号。
        signal('EngineSpeed', 'EngineMsg'),
        signal('EngineTemp', 'EngineMsg'),
        // GearMsg：1 个 multiplexed（默认跳过）+ 1 个 multiplexor（照常导入）。
        signal('GearPos', 'GearMsg', { multiplex: { kind: 'multiplexed', switchValue: 1 } }),
        signal('GearMuxSwitch', 'GearMsg', { multiplex: { kind: 'multiplexor' } }),
        // UnrelatedMsg 的 muxed 信号不计入 skippedMultiplexedSignals（§8.1 仅相关 message）。
        signal('UnrelatedMuxed', 'UnrelatedMsg', {
          multiplex: { kind: 'multiplexed', switchValue: 2 },
        }),
      ],
    );
    const result = mapDbmToEcuc(makeRequest({ dbm }));
    expect(result.stats).toEqual({
      messages: 3,
      signals: 5,
      skippedIrrelevantMessages: 1,
      skippedMultiplexedSignals: 1,
    });
  });

  it('imports multiplexed signals as plain and still reports them in stats.skippedMultiplexedSignals when enabled', () => {
    const profile: DbcImportProfile = {
      ...AUTOSAR_R22_CAN_PROFILE,
      modules: {
        ...AUTOSAR_R22_CAN_PROFILE.modules,
        Com: { ...AUTOSAR_R22_CAN_PROFILE.modules.Com, importMultiplexedAsPlain: true },
      },
    };
    const dbm = makeDbm(
      [message('EngineMsg', 'ECM', [])],
      [signal('MuxedSig', 'EngineMsg', { multiplex: { kind: 'multiplexed', switchValue: 1 } })],
    );
    const result = mapDbmToEcuc(makeRequest({ dbm, profile }));
    // 信号仍以 plain 导入（warning 保留），但按 §8.1 语义不算入 skipped。
    expect(result.stats.skippedMultiplexedSignals).toBe(0);
    expect(result.stats.messages).toBe(1);
    expect(result.stats.signals).toBe(1);
  });
});

describe('mapDbmToEcuc — result shape', () => {
  it('returns exactly the Com, CanIf and PduR modules', () => {
    const result = mapDbmToEcuc(makeRequest({ dbm: makeDbm([message('EngineMsg', 'ECM', [])]) }));
    expect([...result.modules.keys()].sort()).toEqual(['CanIf', 'Com', 'PduR']);
    // 三个模块都是非空 ECUC module。
    for (const module of result.modules.values()) {
      expect(module.kind).toBe('module');
      expect(module.tagName).toBe('ECUC-MODULE-CONFIGURATION-VALUES');
    }
  });

  it('threads the single relevance-filter result into stats and keeps irrelevant messages out of every module', () => {
    const dbm = makeDbm([message('EngineMsg', 'ECM', []), message('UnrelatedMsg', 'ABS', [])]);
    const result = mapDbmToEcuc(makeRequest({ dbm }));
    for (const module of result.modules.values()) {
      expect(JSON.stringify(module)).not.toContain('UnrelatedMsg');
    }
    expect(result.stats.skippedIrrelevantMessages).toBe(1);
  });

  it('exposes per-module field diffs and real instance-path container maps', () => {
    const txMsg = message('EngineMsg', 'ECM', [], { messageId: 0x123, dlc: 8 });
    const result = mapDbmToEcuc(makeRequest({ dbm: makeDbm([txMsg]) }));

    expect([...result.fieldDiffsByModule.keys()].sort()).toEqual(['CanIf', 'Com', 'PduR']);
    // containerPathByModule 以实例路径为 key（与 collectImportContainers 对齐）。
    const comContainerPaths = new Set(result.containerPathByModule.get('Com')?.keys());
    expect(comContainerPaths.has('/Com/ComConfig/EngineMsg')).toBe(true);
    const canIfContainerPaths = new Set(result.containerPathByModule.get('CanIf')?.keys());
    expect(canIfContainerPaths.has('/CanIf/CanIfConfig/EngineMsg')).toBe(true);
    const pduRContainerPaths = new Set(result.containerPathByModule.get('PduR')?.keys());
    expect(pduRContainerPaths.has('/PduR/PduRRoutingPaths/EngineMsg')).toBe(true);

    // 每个 field diff 的 containerPath 都是生成树中的真实实例路径（RULING 10）：
    // 用 collectImportContainers 的键（与 merge 层一致）逐模块校验。
    for (const [moduleName, diffs] of result.fieldDiffsByModule) {
      const tree = new Set(collectImportContainers(result.modules.get(moduleName)!).keys());
      for (const diff of diffs) {
        expect(tree.has(diff.containerPath)).toBe(true);
      }
    }
  });

  it('keeps every message instance in containerPathByModule even when they share a definition key', () => {
    const dbm = makeDbm([message('EngineMsg', 'ECM', []), message('GearMsg', 'TCM', ['ECM'])]);
    const result = mapDbmToEcuc(makeRequest({ dbm }));
    // 两条 message 共享同一 ComIPdu / CanIf PDU / PduRRoutingPath 定义，
    // 但各自的实例路径都必须出现在 map 中（§8.1 preview 行按实例路径分组，
    // 不能因 definition spine key 折叠而丢行）。
    const comPaths = new Set(result.containerPathByModule.get('Com')?.keys());
    expect(comPaths.has('/Com/ComConfig/EngineMsg')).toBe(true);
    expect(comPaths.has('/Com/ComConfig/GearMsg')).toBe(true);
    const canIfPaths = new Set(result.containerPathByModule.get('CanIf')?.keys());
    expect(canIfPaths.has('/CanIf/CanIfConfig/EngineMsg')).toBe(true);
    expect(canIfPaths.has('/CanIf/CanIfConfig/GearMsg')).toBe(true);
    const pduRPaths = new Set(result.containerPathByModule.get('PduR')?.keys());
    expect(pduRPaths.has('/PduR/PduRRoutingPaths/EngineMsg')).toBe(true);
    expect(pduRPaths.has('/PduR/PduRRoutingPaths/GearMsg')).toBe(true);
  });

  it('merges mapper, assignPduIds and DBM parse warnings into one ordered list', () => {
    const dbm = makeDbm(
      [message('EngineMsg', 'ECM', [])],
      [],
      [{ code: 'dbc-invalid-can-id', elementRef: 'EngineMsg', message: 'parse warning' }],
    );
    const result = mapDbmToEcuc(makeRequest({ dbm }));
    // dbm.warnings（解析期）作为整体出现在结果中。
    expect(result.warnings).toContainEqual({
      code: 'dbc-invalid-can-id',
      elementRef: 'EngineMsg',
      message: 'parse warning',
    });
    // 每个 warning 都有 closed-set code。
    for (const warning of result.warnings) {
      expect(warning.code).toBeDefined();
    }
  });

  it('respects existing CanIf ids (full per-module set) and emits dbc-pdu-id-conflict on collision', () => {
    const dbm = makeDbm([message('EngineMsg', 'ECM', [])]);
    const currentIds = new Map([['CanIf', new Set([0])]] as const);
    const result = mapDbmToEcuc(makeRequest({ dbm, currentIds }));
    // Tx 编号从 txBase=0 起，与存量 CanIf id 0 冲突 → EngineMsg 无 CanIfTxPduId。
    const pdu = containerAt(moduleOf(result, 'CanIf'), '/CanIf/CanIfConfig/EngineMsg');
    expect(paramOf(pdu, 'CanIfTxPduId')).toBeUndefined();
    expect(result.warnings.some((w) => w.code === 'dbc-pdu-id-conflict')).toBe(true);
    // assignPduIds 与 mapCanIf 都检测同一冲突 → facade 按 (code, elementRef) 去重，
    // 用户可见只出现一次。
    const conflicts = result.warnings.filter(
      (w) => w.code === 'dbc-pdu-id-conflict' && w.elementRef === 'EngineMsg',
    );
    expect(conflicts).toHaveLength(1);
  });

  // Regression: per-module PduId conflict semantics (spec §7.4 trigger 2).
  // Existing Com handleIds + empty CanIf set → the CanIf pduId assignment
  // produces NO dbc-pdu-id-conflict; only the Com-side ComHandleId collides.
  it('checks PduId conflicts per module: existing Com ids do not block CanIf pduIds', () => {
    const dbm = makeDbm([message('EngineMsg', 'ECM', [])]);
    const currentIds: ReadonlyMap<'Com' | 'CanIf', ReadonlySet<number>> = new Map([
      ['Com', new Set([0])],
      ['CanIf', new Set()],
    ]);
    const result = mapDbmToEcuc(makeRequest({ dbm, currentIds }));
    // CanIf 侧：存量集合为空 → pduId 0 正常写入，无冲突。
    const pdu = containerAt(moduleOf(result, 'CanIf'), '/CanIf/CanIfConfig/EngineMsg');
    expect(paramOf(pdu, 'CanIfTxPduId')).toMatchObject({ type: 'integer', value: 0 });
    // Com 侧：ComHandleId 0 与存量 Com 集合冲突 → 跳过并告警。
    const ipdu = containerAt(moduleOf(result, 'Com'), '/Com/ComConfig/EngineMsg');
    expect(paramOf(ipdu, 'ComHandleId')).toBeUndefined();
    const conflicts = result.warnings.filter(
      (w) => w.code === 'dbc-pdu-id-conflict' && w.elementRef === 'EngineMsg',
    );
    expect(conflicts).toHaveLength(1);
    const handleDiff = result.fieldDiffsByModule
      .get('Com')
      ?.find((d) => d.paramKey === 'ComConfig/ComIPdu/ComHandleId');
    expect(handleDiff?.source).toBe('Error');
    expect(handleDiff?.warningCodes).toContain('dbc-pdu-id-conflict');
  });
});

describe('mapDbmToEcuc — determinism', () => {
  it('produces deep-equal modules, warnings, diffs, stats and paths on repeated calls', () => {
    const dbm = makeDbm(
      [
        message('EngineMsg', 'ECM', [], { messageId: 0x123, dlc: 8 }),
        message('GearMsg', 'TCM', ['ECM'], { isExtended: true }),
        message('UnrelatedMsg', 'ABS', []),
      ],
      [
        signal('EngineSpeed', 'EngineMsg'),
        signal('GearMuxed', 'GearMsg', { multiplex: { kind: 'multiplexed', switchValue: 1 } }),
      ],
    );
    const request = makeRequest({ dbm });
    const first = mapDbmToEcuc(request);
    const second = mapDbmToEcuc(request);
    expect(second).toEqual(first);
    // modules 内容深比较（modest 断言：序列化后字节级一致）。
    const serialize = (module: ArxmlModule): string => JSON.stringify(module);
    expect([...second.modules.entries()].map(([k, v]) => [k, serialize(v)])).toEqual(
      [...first.modules.entries()].map(([k, v]) => [k, serialize(v)]),
    );
  });
});
