/**
 * Com mapper tests — spec docs/superpowers/specs/2026-09-03-dbc-full-import-design.md
 * §7.2 (Com mapping) + §7.7 (multiplex policy). Synthetic R22-style Com BSWMD
 * fixtures; assertions follow the task-7 brief verbatim.
 */

import { describe, expect, it } from 'vitest';

import type { ArxmlContainer, ArxmlModule, ParamValue } from '../../arxml/types.js';
import type { BswModuleDef, ContainerDef, ParamDef } from '../../project/bswmd/types.js';
import { buildDbcBswmdDefIndex, type DbcBswmdDefIndex } from '../bswmdDefIndex.js';
import type { DbmAttributeValue, DbmMessage, DbmSignal } from '../dbm.js';
import { mapCom, type ComMapperInput } from '../mappers/comMapper.js';
import type { DbcMapperContext, MapperFieldDiff, MapperResult } from '../mappers/types.js';
import { AUTOSAR_R22_CAN_PROFILE, type DbcImportProfile } from '../profile.js';

// ---------------------------------------------------------------------------
// Fixtures: synthetic R22-style Com BSWMD.
// ---------------------------------------------------------------------------

const COM_ROOT = '/AUTOSAR_R22/EcucDefs/Com';

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

function container(
  shortName: string,
  path: string,
  parameters: readonly ParamDef[] = [],
  subContainers: readonly ContainerDef[] = [],
): ContainerDef {
  return {
    shortName,
    path,
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    subContainers,
    parameters,
    references: [],
    choices: [],
  };
}

function emptyModule(shortName: string): BswModuleDef {
  return {
    shortName,
    path: `/AUTOSAR_R22/EcucDefs/${shortName}`,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [],
    providedEntries: [],
    references: [],
    lowerMultiplicity: 1,
    upperMultiplicity: 1,
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

function standardSignalParams(): ParamDef[] {
  return [
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
  ];
}

function buildComModule(signalParams: readonly ParamDef[], includeTxChain = true): BswModuleDef {
  const comSignal = container('ComSignal', `${COM_ROOT}/ComConfig/ComIPdu/ComSignal`, signalParams);
  const comTxChain = includeTxChain
    ? [
        container(
          'ComTxIPdu',
          `${COM_ROOT}/ComConfig/ComIPdu/ComTxIPdu`,
          [],
          [
            container(
              'ComTxModeTrue',
              `${COM_ROOT}/ComConfig/ComIPdu/ComTxIPdu/ComTxModeTrue`,
              [],
              [
                container(
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
                ),
              ],
            ),
          ],
        ),
      ]
    : [];
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
    [comSignal, ...comTxChain],
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

/** Direct-signal layout: ComSignal hangs off ComConfig, not off ComIPdu. */
function buildDirectSignalComModule(): BswModuleDef {
  const comIpdu = container('ComIPdu', `${COM_ROOT}/ComConfig/ComIPdu`, [
    param('ComIPduDirection', `${COM_ROOT}/ComConfig/ComIPdu`, 'enumeration', ['SEND', 'RECEIVE']),
    param('ComIPduType', `${COM_ROOT}/ComConfig/ComIPdu`, 'enumeration', ['NORMAL', 'TP']),
    param('ComHandleId', `${COM_ROOT}/ComConfig/ComIPdu`, 'integer'),
  ]);
  const comSignal = container('ComSignal', `${COM_ROOT}/ComConfig/ComSignal`, [
    param('ComBitPosition', `${COM_ROOT}/ComConfig/ComSignal`, 'integer'),
    param('ComBitSize', `${COM_ROOT}/ComConfig/ComSignal`, 'integer'),
    param('ComSignalEndianness', `${COM_ROOT}/ComConfig/ComSignal`, 'enumeration', [
      'LITTLE_ENDIAN',
      'BIG_ENDIAN',
    ]),
    param('ComSignalType', `${COM_ROOT}/ComConfig/ComSignal`, 'enumeration', [
      ...SIGNAL_TYPE_LITERALS,
    ]),
    param('ComSignalDataInvalidValue', `${COM_ROOT}/ComConfig/ComSignal`, 'integer'),
    param('ComTransferProperty', `${COM_ROOT}/ComConfig/ComSignal`, 'enumeration', ['TRIGGERED']),
  ]);
  return {
    shortName: 'Com',
    path: COM_ROOT,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [container('ComConfig', `${COM_ROOT}/ComConfig`, [], [comIpdu, comSignal])],
    providedEntries: [],
    references: [],
    lowerMultiplicity: 1,
    upperMultiplicity: 1,
  };
}

const index = buildDbcBswmdDefIndex(
  new Map([
    ['Com', buildComModule(standardSignalParams())],
    ['CanIf', emptyModule('CanIf')],
    ['PduR', emptyModule('PduR')],
  ]),
);

// ---------------------------------------------------------------------------
// DBM fixtures + mapper harness.
// ---------------------------------------------------------------------------

function message(
  key: string,
  _direction: 'SEND' | 'RECEIVE',
  attributes: Readonly<Record<string, DbmAttributeValue>> = {},
  overrides: Partial<DbmMessage> = {},
): DbmMessage {
  return {
    key,
    shortName: key,
    messageId: 0x100,
    isExtended: false,
    dlc: 8,
    transmitter: 'ECM',
    receivers: [],
    attributes,
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

function makeContext(
  indexOverride: DbcBswmdDefIndex = index,
  profile: DbcImportProfile = AUTOSAR_R22_CAN_PROFILE,
): DbcMapperContext {
  return {
    dbm: {
      meta: { sourcePath: 'test.dbc', protocol: 'CAN', sourceHash: 'hash' },
      nodes: [],
      messages: [],
      signals: [],
      warnings: [],
    },
    targetNode: 'ECM',
    index: indexOverride,
    profile,
    warnings: [],
    fieldDiffs: [],
  };
}

function withMultiplexOverride(importMultiplexedAsPlain: boolean): DbcImportProfile {
  return {
    ...AUTOSAR_R22_CAN_PROFILE,
    modules: {
      ...AUTOSAR_R22_CAN_PROFILE.modules,
      Com: { ...AUTOSAR_R22_CAN_PROFILE.modules.Com, importMultiplexedAsPlain },
    },
  };
}

function run(
  messages: readonly DbmMessage[],
  signals: readonly DbmSignal[] = [],
  directions: ReadonlyMap<string, 'SEND' | 'RECEIVE'> = new Map(),
  handleIds: ReadonlyMap<string, number> = new Map(),
  profile: DbcImportProfile = AUTOSAR_R22_CAN_PROFILE,
  existingHandleIds: ReadonlySet<number> = new Set(),
): MapperResult<ArxmlModule> {
  const signalsByMessageKey = new Map<string, readonly DbmSignal[]>();
  for (const s of signals) {
    signalsByMessageKey.set(s.messageKey, [...(signalsByMessageKey.get(s.messageKey) ?? []), s]);
  }
  const context = makeContext(index, profile);
  const input: ComMapperInput = {
    relevantMessages: messages,
    signalsByMessageKey,
    directionByMessageKey: directions,
    handleIds,
    existingHandleIds,
  };
  return mapCom(context, input);
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

function comConfigOf(result: MapperResult<ArxmlModule>): ArxmlContainer {
  const config = findChild(result.value, 'ComConfig');
  if (config === undefined) throw new Error('ComConfig wrapper missing');
  return config;
}

function ipduOf(result: MapperResult<ArxmlModule>, messageKey: string): ArxmlContainer {
  const found = findChild(comConfigOf(result), messageKey);
  if (found === undefined) throw new Error(`IPdu ${messageKey} missing`);
  return found;
}

function signalOf(
  result: MapperResult<ArxmlModule>,
  messageKey: string,
  signalKey: string,
): ArxmlContainer {
  const found = findChild(ipduOf(result, messageKey), signalKey);
  if (found === undefined) throw new Error(`Signal ${messageKey}/${signalKey} missing`);
  return found;
}

function txModeOf(
  result: MapperResult<ArxmlModule>,
  messageKey: string,
): ArxmlContainer | undefined {
  const txIpdu = findChild(ipduOf(result, messageKey), 'ComTxIPdu');
  const modeTrue = txIpdu === undefined ? undefined : findChild(txIpdu, 'ComTxModeTrue');
  return modeTrue === undefined ? undefined : findChild(modeTrue, 'ComTxMode');
}

function paramOf(containerEl: ArxmlContainer | undefined, name: string): ParamValue | undefined {
  return containerEl?.params[name];
}

function collectDefinitionRefs(module: ArxmlModule, refs: string[]): void {
  for (const child of module.children) {
    if (child.kind === 'container') collectContainerRefs(child, refs);
  }
}

function collectContainerRefs(containerEl: ArxmlContainer, refs: string[]): void {
  for (const value of Object.values(containerEl.params)) {
    if (value.definitionRef !== undefined) refs.push(value.definitionRef);
  }
  for (const child of containerEl.children) {
    if (child.kind === 'container') collectContainerRefs(child, refs);
  }
}

// ---------------------------------------------------------------------------
// Tests — task-7 brief assertions 1..10.
// ---------------------------------------------------------------------------

describe('mapCom', () => {
  it('creates one ComIPdu per relevant message named by the DBM key', () => {
    const result = run(
      [message('MsgA', 'SEND'), message('MsgB', 'RECEIVE')],
      [],
      new Map([
        ['MsgA', 'SEND'],
        ['MsgB', 'RECEIVE'],
      ]),
      new Map([
        ['MsgA', 1],
        ['MsgB', 2],
      ]),
    );
    const config = comConfigOf(result);
    expect(
      config.children
        .filter((child): child is ArxmlContainer => child.kind === 'container')
        .map((child) => child.shortName),
    ).toEqual(['MsgA', 'MsgB']);
  });

  it('maps a SEND message to ComIPduDirection=SEND with Derived source', () => {
    const result = run(
      [message('MsgA', 'SEND')],
      [],
      new Map([['MsgA', 'SEND']]),
      new Map([['MsgA', 1]]),
    );
    expect(paramOf(ipduOf(result, 'MsgA'), 'ComIPduDirection')).toEqual({
      type: 'enum',
      value: 'SEND',
      definitionRef: `${COM_ROOT}/ComConfig/ComIPdu/ComIPduDirection`,
    });
    const diff = result.fieldDiffs.find((d) => d.paramKey === 'ComConfig/ComIPdu/ComIPduDirection');
    expect(diff?.source).toBe('Derived');
  });

  it('maps a RECEIVE message to ComIPduDirection=RECEIVE with no ComTxMode chain', () => {
    const result = run(
      [message('MsgB', 'RECEIVE')],
      [],
      new Map([['MsgB', 'RECEIVE']]),
      new Map([['MsgB', 0x1000]]),
    );
    expect(paramOf(ipduOf(result, 'MsgB'), 'ComIPduDirection')).toMatchObject({
      type: 'enum',
      value: 'RECEIVE',
    });
    expect(findChild(ipduOf(result, 'MsgB'), 'ComTxIPdu')).toBeUndefined();
    expect(result.warnings).toHaveLength(0);
  });

  it('builds the ComTxMode chain for a CYCLIC Tx message with period', () => {
    const msgA = message('MsgA', 'SEND', { GenMsgSendType: 'CYCLIC', GenMsgCycleTime: 100 });
    const result = run([msgA], [], new Map([['MsgA', 'SEND']]), new Map([['MsgA', 1]]));
    const ipdu = ipduOf(result, 'MsgA');
    const txIpdu = findChild(ipdu, 'ComTxIPdu');
    expect(txIpdu).toBeDefined();
    const modeTrue = findChild(txIpdu!, 'ComTxModeTrue');
    expect(modeTrue).toBeDefined();
    const txMode = findChild(modeTrue!, 'ComTxMode');
    expect(txMode).toBeDefined();
    expect(paramOf(txMode, 'ComTxModeMode')).toEqual({
      type: 'enum',
      value: 'PERIODIC',
      definitionRef: `${COM_ROOT}/ComConfig/ComIPdu/ComTxIPdu/ComTxModeTrue/ComTxMode/ComTxModeMode`,
    });
    expect(paramOf(txMode, 'ComTxModeTimePeriod')).toEqual({
      type: 'float',
      value: 0.1,
      definitionRef: `${COM_ROOT}/ComConfig/ComIPdu/ComTxIPdu/ComTxModeTrue/ComTxMode/ComTxModeTimePeriod`,
    });
  });

  it('maps EVENT to DIRECT and EVENT_AND_CYCLIC to MIXED', () => {
    const result = run(
      [
        message('MsgE', 'SEND', { GenMsgSendType: 'EVENT' }),
        message('MsgM', 'SEND', { GenMsgSendType: 'EVENT_AND_CYCLIC' }),
      ],
      [],
      new Map([
        ['MsgE', 'SEND'],
        ['MsgM', 'SEND'],
      ]),
      new Map([
        ['MsgE', 1],
        ['MsgM', 2],
      ]),
    );
    expect(paramOf(txModeOf(result, 'MsgE'), 'ComTxModeMode')).toMatchObject({ value: 'DIRECT' });
    expect(paramOf(txModeOf(result, 'MsgE'), 'ComTxModeTimePeriod')).toBeUndefined();
    expect(paramOf(txModeOf(result, 'MsgM'), 'ComTxModeMode')).toMatchObject({ value: 'MIXED' });
  });

  it('maps NONE to DIRECT via the default enum map with Auto source', () => {
    const result = run(
      [message('MsgN', 'SEND', { GenMsgSendType: 'NONE' })],
      [],
      new Map([['MsgN', 'SEND']]),
      new Map([['MsgN', 1]]),
    );
    expect(paramOf(txModeOf(result, 'MsgN'), 'ComTxModeMode')).toEqual({
      type: 'enum',
      value: 'DIRECT',
      definitionRef: `${COM_ROOT}/ComConfig/ComIPdu/ComTxIPdu/ComTxModeTrue/ComTxMode/ComTxModeMode`,
    });
    const diff = result.fieldDiffs.find((d) => d.paramKey.endsWith('ComTxModeMode'));
    expect(diff?.source).toBe('Auto');
  });

  it('keeps the ComTxMode chain hollow and records an Unmapped diff when GenMsgSendType is missing', () => {
    const result = run(
      [message('MsgX', 'SEND')],
      [],
      new Map([['MsgX', 'SEND']]),
      new Map([['MsgX', 1]]),
    );
    const txMode = txModeOf(result, 'MsgX');
    expect(txMode).toBeDefined();
    expect(paramOf(txMode, 'ComTxModeMode')).toBeUndefined();
    expect(
      result.fieldDiffs.some(
        (d) =>
          d.paramKey === 'ComConfig/ComIPdu/ComTxIPdu/ComTxModeTrue/ComTxMode/ComTxModeMode' &&
          d.source === 'Unmapped',
      ),
    ).toBe(true);
  });

  it('leaves ComTxModeTimePeriod Unmapped with a warning when cycle time is missing for PERIODIC/MIXED', () => {
    const result = run(
      [message('MsgC', 'SEND', { GenMsgSendType: 'CYCLIC' })],
      [],
      new Map([['MsgC', 'SEND']]),
      new Map([['MsgC', 1]]),
    );
    expect(paramOf(txModeOf(result, 'MsgC'), 'ComTxModeMode')).toMatchObject({ value: 'PERIODIC' });
    expect(paramOf(txModeOf(result, 'MsgC'), 'ComTxModeTimePeriod')).toBeUndefined();
    expect(
      result.warnings.some(
        (w) => w.code === 'dbc-attribute-unavailable' && w.elementRef === 'MsgC',
      ),
    ).toBe(true);
    expect(
      result.fieldDiffs.some(
        (d) =>
          d.paramKey ===
            'ComConfig/ComIPdu/ComTxIPdu/ComTxModeTrue/ComTxMode/ComTxModeTimePeriod' &&
          d.source === 'Unmapped',
      ),
    ).toBe(true);
  });

  it('maps ComSignal fields deterministically', () => {
    const msgA = message('MsgA', 'SEND');
    const signals = [
      signal('Speed', 'MsgA', {
        startBit: 7,
        length: 12,
        byteOrder: 'big-endian',
        valueType: 'unsigned',
      }),
      signal('Size16', 'MsgA', {
        startBit: 0,
        length: 16,
        byteOrder: 'little-endian',
        valueType: 'unsigned',
      }),
      signal('Real', 'MsgA', {
        startBit: 0,
        length: 32,
        byteOrder: 'little-endian',
        valueType: 'float',
      }),
    ];
    const result = run([msgA], signals, new Map([['MsgA', 'SEND']]), new Map([['MsgA', 1]]));
    const speed = signalOf(result, 'MsgA', 'Speed');
    expect(paramOf(speed, 'ComBitPosition')).toEqual({
      type: 'integer',
      value: 12,
      definitionRef: `${COM_ROOT}/ComConfig/ComIPdu/ComSignal/ComBitPosition`,
    });
    expect(paramOf(speed, 'ComBitSize')).toMatchObject({ value: 12 });
    expect(paramOf(speed, 'ComSignalEndianness')).toMatchObject({ value: 'BIG_ENDIAN' });
    expect(paramOf(speed, 'ComSignalType')).toMatchObject({ value: 'UINT16' });
    const size16 = signalOf(result, 'MsgA', 'Size16');
    expect(paramOf(size16, 'ComBitPosition')).toMatchObject({ type: 'integer', value: 0 });
    expect(paramOf(size16, 'ComBitSize')).toMatchObject({ value: 16 });
    expect(paramOf(size16, 'ComSignalEndianness')).toMatchObject({ value: 'LITTLE_ENDIAN' });
    expect(paramOf(size16, 'ComSignalType')).toMatchObject({ value: 'UINT16' });
    const real = signalOf(result, 'MsgA', 'Real');
    expect(paramOf(real, 'ComSignalType')).toMatchObject({ value: 'FLOAT32' });
  });

  it('nests signals under the IPdu when the signal container candidate is a subcontainer of the IPdu', () => {
    const result = run(
      [message('MsgA', 'SEND')],
      [signal('Speed', 'MsgA')],
      new Map([['MsgA', 'SEND']]),
      new Map([['MsgA', 1]]),
    );
    const sig = findChild(ipduOf(result, 'MsgA'), 'Speed');
    expect(sig).toBeDefined();
    expect(sig?.definitionRef).toBe(`${COM_ROOT}/ComConfig/ComIPdu/ComSignal`);
  });

  it('nests signals under the ComConfig wrapper for a direct-signal BSWMD layout', () => {
    const altIndex = buildDbcBswmdDefIndex(
      new Map([
        ['Com', buildDirectSignalComModule()],
        ['CanIf', emptyModule('CanIf')],
        ['PduR', emptyModule('PduR')],
      ]),
    );
    const context = makeContext(altIndex);
    const msgA = message('MsgA', 'SEND');
    const input: ComMapperInput = {
      relevantMessages: [msgA],
      signalsByMessageKey: new Map([['MsgA', [signal('Speed', 'MsgA')]]]),
      directionByMessageKey: new Map([['MsgA', 'SEND']]),
      handleIds: new Map([['MsgA', 1]]),
      existingHandleIds: new Set(),
    };
    const result = mapCom(context, input);
    const config = comConfigOf(result);
    const sig = findChild(config, 'Speed');
    expect(sig).toBeDefined();
    expect(sig?.definitionRef).toBe(`${COM_ROOT}/ComConfig/ComSignal`);
    expect(findChild(ipduOf(result, 'MsgA'), 'Speed')).toBeUndefined();
    // RULING 10: direct-signal field diffs anchor to the instance path.
    const directionDiff = result.fieldDiffs.find(
      (d) => d.paramKey === 'ComConfig/ComIPdu/ComIPduDirection',
    );
    expect(directionDiff?.containerPath).toBe('/Com/ComConfig/MsgA');
    const bitPositionDiff = result.fieldDiffs.find(
      (d) => d.paramKey === 'ComConfig/ComSignal/ComBitPosition',
    );
    expect(bitPositionDiff?.containerPath).toBe('/Com/ComConfig/Speed');
  });

  it('skips multiplexed signals with one warning each unless the profile opts into plain import', () => {
    const msgM = message('MsgM', 'SEND');
    const muxed = [
      signal('MuxSel', 'MsgM', { multiplex: { kind: 'multiplexor' } }),
      signal('SigA', 'MsgM', { multiplex: { kind: 'multiplexed', switchValue: 0 } }),
      signal('SigB', 'MsgM', { multiplex: { kind: 'extended-multiplexed', switchValue: 1 } }),
    ];
    const result = run([msgM], muxed, new Map([['MsgM', 'SEND']]), new Map([['MsgM', 1]]));
    const ipdu = ipduOf(result, 'MsgM');
    expect(findChild(ipdu, 'MuxSel')).toBeDefined();
    expect(findChild(ipdu, 'SigA')).toBeUndefined();
    expect(findChild(ipdu, 'SigB')).toBeUndefined();
    const multiplexedWarnings = result.warnings.filter((w) => w.code === 'dbc-multiplexed-signal');
    expect(multiplexedWarnings).toHaveLength(2);
    expect(multiplexedWarnings.map((w) => w.elementRef)).toEqual(['SigA', 'SigB']);
  });

  it('imports multiplexed signals as plain when the profile opts in but still warns', () => {
    const msgM = message('MsgM', 'SEND');
    const muxed = [signal('SigA', 'MsgM', { multiplex: { kind: 'multiplexed', switchValue: 0 } })];
    const result = run(
      [msgM],
      muxed,
      new Map([['MsgM', 'SEND']]),
      new Map([['MsgM', 1]]),
      withMultiplexOverride(true),
    );
    const ipdu = ipduOf(result, 'MsgM');
    expect(findChild(ipdu, 'SigA')).toBeDefined();
    expect(result.warnings.filter((w) => w.code === 'dbc-multiplexed-signal')).toHaveLength(1);
  });

  it('records Unmapped field diffs for factor/offset/min/max/unit without warnings', () => {
    const msgA = message('MsgA', 'SEND');
    const sig = signal('Speed', 'MsgA', {
      factor: 2,
      offset: 1,
      minimum: 0,
      maximum: 100,
      unit: 'km/h',
    });
    const result = run([msgA], [sig], new Map([['MsgA', 'SEND']]), new Map([['MsgA', 1]]));
    const unmapped = result.fieldDiffs.filter(
      (d): d is MapperFieldDiff & { source: 'Unmapped' } =>
        d.source === 'Unmapped' && d.warningCodes === undefined,
    );
    const keys = unmapped.map((d) => d.paramKey);
    expect(keys).toContain('ComConfig/ComIPdu/ComSignal/factor');
    expect(keys).toContain('ComConfig/ComIPdu/ComSignal/offset');
    expect(keys).toContain('ComConfig/ComIPdu/ComSignal/minimum');
    expect(keys).toContain('ComConfig/ComIPdu/ComSignal/maximum');
    expect(keys).toContain('ComConfig/ComIPdu/ComSignal/unit');
    expect(result.warnings).toHaveLength(0);
  });

  it('gives every generated param a definitionRef and writes nothing when the BSWMD definition is missing', () => {
    const msgA = message('MsgA', 'SEND', { GenMsgSendType: 'CYCLIC', GenMsgCycleTime: 100 });
    const result = run(
      [msgA],
      [signal('Speed', 'MsgA')],
      new Map([['MsgA', 'SEND']]),
      new Map([['MsgA', 1]]),
    );
    const refs: string[] = [];
    collectDefinitionRefs(result.value, refs);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref).toMatch(/^\/AUTOSAR_R22\/EcucDefs\/Com\//);
    }

    const brokenIndex = buildDbcBswmdDefIndex(
      new Map([
        [
          'Com',
          buildComModule(standardSignalParams().filter((p) => p.shortName !== 'ComSignalType')),
        ],
        ['CanIf', emptyModule('CanIf')],
        ['PduR', emptyModule('PduR')],
      ]),
    );
    const context = makeContext(brokenIndex);
    const input: ComMapperInput = {
      relevantMessages: [msgA],
      signalsByMessageKey: new Map([['MsgA', [signal('Speed', 'MsgA')]]]),
      directionByMessageKey: new Map([['MsgA', 'SEND']]),
      handleIds: new Map([['MsgA', 1]]),
      existingHandleIds: new Set(),
    };
    const result2 = mapCom(context, input);
    expect(paramOf(signalOf(result2, 'MsgA', 'Speed'), 'ComSignalType')).toBeUndefined();
    expect(result2.warnings.some((w) => w.code === 'dbc-bswmd-def-missing')).toBe(true);
  });

  it('emits one dbc-bswmd-def-missing warning and no partial ComTxMode chain when a chain container is missing', () => {
    const brokenIndex = buildDbcBswmdDefIndex(
      new Map([
        ['Com', buildComModule(standardSignalParams(), false)],
        ['CanIf', emptyModule('CanIf')],
        ['PduR', emptyModule('PduR')],
      ]),
    );
    const context = makeContext(brokenIndex);
    const msgA = message('MsgA', 'SEND', { GenMsgSendType: 'CYCLIC', GenMsgCycleTime: 100 });
    const input: ComMapperInput = {
      relevantMessages: [msgA],
      signalsByMessageKey: new Map(),
      directionByMessageKey: new Map([['MsgA', 'SEND']]),
      handleIds: new Map([['MsgA', 1]]),
      existingHandleIds: new Set(),
    };
    const result = mapCom(context, input);
    expect(findChild(ipduOf(result, 'MsgA'), 'ComTxIPdu')).toBeUndefined();
    expect(result.warnings.filter((w) => w.code === 'dbc-bswmd-def-missing')).toHaveLength(1);
  });

  it('anchors field diffs to instance paths', () => {
    const msgA = message('MsgA', 'SEND', { GenMsgSendType: 'CYCLIC', GenMsgCycleTime: 100 });
    const result = run(
      [msgA],
      [signal('Speed', 'MsgA', { startBit: 7, length: 12, byteOrder: 'big-endian' })],
      new Map([['MsgA', 'SEND']]),
      new Map([['MsgA', 1]]),
    );
    const directionDiff = result.fieldDiffs.find(
      (d) => d.paramKey === 'ComConfig/ComIPdu/ComIPduDirection',
    );
    expect(directionDiff?.containerPath).toBe('/Com/ComConfig/MsgA');
    const bitPositionDiff = result.fieldDiffs.find(
      (d) => d.paramKey === 'ComConfig/ComIPdu/ComSignal/ComBitPosition',
    );
    expect(bitPositionDiff?.containerPath).toBe('/Com/ComConfig/MsgA/Speed');
    const modeDiff = result.fieldDiffs.find((d) => d.paramKey.endsWith('ComTxModeMode'));
    expect(modeDiff?.containerPath).toBe('/Com/ComConfig/MsgA/ComTxIPdu/ComTxModeTrue/ComTxMode');
  });

  // Regression: per-module PduId conflict semantics (spec §7.4 trigger 2).
  // Com-destined handleIds are checked against the Com existing-id set only;
  // assignPduIds no longer unions Com + CanIf sets.
  it('emits dbc-pdu-id-conflict and skips ComHandleId when the id collides with the existing Com set', () => {
    const msgA = message('MsgA', 'SEND');
    const result = run(
      [msgA],
      [],
      new Map([['MsgA', 'SEND']]),
      new Map([['MsgA', 5]]),
      AUTOSAR_R22_CAN_PROFILE,
      new Set([5]),
    );
    expect(paramOf(ipduOf(result, 'MsgA'), 'ComHandleId')).toBeUndefined();
    expect(
      result.warnings.some((w) => w.code === 'dbc-pdu-id-conflict' && w.elementRef === 'MsgA'),
    ).toBe(true);
    const conflictDiff = result.fieldDiffs.find(
      (d) => d.paramKey === 'ComConfig/ComIPdu/ComHandleId',
    );
    expect(conflictDiff?.source).toBe('Error');
    expect(conflictDiff?.warningCodes).toContain('dbc-pdu-id-conflict');
    expect(conflictDiff?.containerPath).toBe('/Com/ComConfig/MsgA');
  });

  it('assigns ComHandleId normally when the id is absent from the existing Com set', () => {
    const msgA = message('MsgA', 'SEND');
    const result = run(
      [msgA],
      [],
      new Map([['MsgA', 'SEND']]),
      new Map([['MsgA', 5]]),
      AUTOSAR_R22_CAN_PROFILE,
      new Set([0, 1, 2, 3, 4]),
    );
    expect(paramOf(ipduOf(result, 'MsgA'), 'ComHandleId')).toMatchObject({ value: 5 });
    expect(result.warnings.some((w) => w.code === 'dbc-pdu-id-conflict')).toBe(false);
  });

  // Regression: signal-level DLC-boundary validation (spec §7.2.1).
  it('emits dbc-invalid-dlc and skips ComBitPosition/ComBitSize for a little-endian signal crossing the DLC boundary', () => {
    const msgA = message('MsgA', 'SEND', {}, { dlc: 1 });
    const sig = signal('Overflow', 'MsgA', { startBit: 8, length: 8, byteOrder: 'little-endian' });
    const result = run([msgA], [sig], new Map([['MsgA', 'SEND']]), new Map([['MsgA', 1]]));
    expect(
      result.warnings.some((w) => w.code === 'dbc-invalid-dlc' && w.elementRef === 'Overflow'),
    ).toBe(true);
    const overflow = signalOf(result, 'MsgA', 'Overflow');
    expect(paramOf(overflow, 'ComBitPosition')).toBeUndefined();
    expect(paramOf(overflow, 'ComBitSize')).toBeUndefined();
    // 其余字段照常生成（§4.3：只跳过越界字段，不做半成品容器丢弃）。
    expect(paramOf(overflow, 'ComSignalEndianness')).toMatchObject({ value: 'LITTLE_ENDIAN' });
    const bitPosDiff = result.fieldDiffs.find(
      (d) => d.paramKey === 'ComConfig/ComIPdu/ComSignal/ComBitPosition',
    );
    expect(bitPosDiff?.source).toBe('Unmapped');
  });

  it('emits dbc-invalid-dlc for a big-endian signal crossing the DLC boundary (validated after conversion)', () => {
    const msgA = message('MsgA', 'SEND', {}, { dlc: 1 });
    const sig = signal('OverflowBE', 'MsgA', { startBit: 7, length: 16, byteOrder: 'big-endian' });
    const result = run([msgA], [sig], new Map([['MsgA', 'SEND']]), new Map([['MsgA', 1]]));
    expect(
      result.warnings.some((w) => w.code === 'dbc-invalid-dlc' && w.elementRef === 'OverflowBE'),
    ).toBe(true);
    const overflow = signalOf(result, 'MsgA', 'OverflowBE');
    expect(paramOf(overflow, 'ComBitPosition')).toBeUndefined();
    expect(paramOf(overflow, 'ComBitSize')).toBeUndefined();
  });

  it('keeps a big-endian signal that wraps within the DLC in bounds and unmodified', () => {
    // 16-bit Motorola 信号 MSB 在 byte0.bit7，占满 dlc=2 的两个字节 —— 合法：
    // 换算后 LSB 位 8，所在字节 1 < dlc，绝不误报（§7.2.1 越界语义）。
    const msgA = message('MsgA', 'SEND', {}, { dlc: 2 });
    const sig = signal('Full16', 'MsgA', { startBit: 7, length: 16, byteOrder: 'big-endian' });
    const result = run([msgA], [sig], new Map([['MsgA', 'SEND']]), new Map([['MsgA', 1]]));
    expect(result.warnings.some((w) => w.code === 'dbc-invalid-dlc')).toBe(false);
    const full = signalOf(result, 'MsgA', 'Full16');
    expect(paramOf(full, 'ComBitPosition')).toMatchObject({ type: 'integer', value: 8 });
    expect(paramOf(full, 'ComBitSize')).toMatchObject({ value: 16 });
  });

  it('leaves an in-bounds little-endian signal unchanged with no warning', () => {
    const msgA = message('MsgA', 'SEND', {}, { dlc: 2 });
    const sig = signal('Edge', 'MsgA', { startBit: 8, length: 8, byteOrder: 'little-endian' });
    const result = run([msgA], [sig], new Map([['MsgA', 'SEND']]), new Map([['MsgA', 1]]));
    expect(result.warnings.some((w) => w.code === 'dbc-invalid-dlc')).toBe(false);
    const edge = signalOf(result, 'MsgA', 'Edge');
    expect(paramOf(edge, 'ComBitPosition')).toMatchObject({ type: 'integer', value: 8 });
    expect(paramOf(edge, 'ComBitSize')).toMatchObject({ value: 8 });
  });
});
