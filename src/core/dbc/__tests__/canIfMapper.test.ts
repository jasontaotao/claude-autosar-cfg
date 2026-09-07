/**
 * CanIf mapper + relevance filter tests — spec
 * docs/superpowers/specs/2026-09-03-dbc-full-import-design.md §7.3 (CanIf
 * mapping) + §7.4 (PduId) + §7.5 (UL naming). Synthetic R22-style CanIf
 * BSWMD fixtures; assertions follow the task-8 brief verbatim.
 *
 * Instance-path convention (RULING 10): every field diff's containerPath is
 * a real path in the generated module tree (`/CanIf/<wrapper>/<messageKey>`),
 * matching collectImportContainers keys. The wrapper shortName is the last
 * segment of the PARENT container key (`CanIfInitCfg` for
 * `CanIfInitCfg/CanIfTxPduCfg`), mirroring comMapper's parent-key wrapper.
 */

import { describe, expect, it } from 'vitest';

import type { ArxmlContainer, ArxmlModule, ParamValue } from '../../arxml/types.js';
import type { BswModuleDef, ContainerDef, ParamDef } from '../../project/bswmd/types.js';
import { buildDbcBswmdDefIndex, type DbcBswmdDefIndex } from '../bswmdDefIndex.js';
import type { Dbm, DbmMessage } from '../dbm.js';
import { filterMessagesForTargetNode, mapCanIf } from '../mappers/canIfMapper.js';
import type { DbcMapperContext, MapperResult } from '../mappers/types.js';
import {
  applyDbcPolicyOverrides,
  AUTOSAR_R22_CAN_PROFILE,
  type DbcImportProfile,
} from '../profile.js';

// ---------------------------------------------------------------------------
// Fixtures: synthetic R22-style CanIf BSWMD.
// ---------------------------------------------------------------------------

const CANIF_ROOT = '/AUTOSAR_R22/EcucDefs/CanIf';

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

function canIdTypeParam(path: string, literals: readonly string[]): ParamDef {
  return param('CanIfTxPduCanIdType', path, 'enumeration', literals);
}

function rxCanIdTypeParam(path: string, literals: readonly string[]): ParamDef {
  return param('CanIfRxPduCanIdType', path, 'enumeration', literals);
}

/**
 * Default fixture — declares only the `CanIfConfig/CanIfTxPdu` /
 * `CanIfConfig/CanIfRxPdu` candidates (third in each profile candidate
 * array). resolveContainerKey therefore resolves to `CanIfConfig/CanIfTxPdu`,
 * whose PARENT is `CanIfConfig` — one wrapper `CanIfConfig` holds both Tx and
 * Rx PDU instances, with instance paths `/CanIf/CanIfConfig/<Msg>` (RULING 10).
 */
function buildCanIfModule(overrides: { readonly omitExtendedCan?: boolean } = {}): BswModuleDef {
  const txLiterals =
    overrides.omitExtendedCan === true ? ['STANDARD_CAN'] : ['STANDARD_CAN', 'EXTENDED_CAN'];
  const rxLiterals =
    overrides.omitExtendedCan === true ? ['STANDARD_CAN'] : ['STANDARD_CAN', 'EXTENDED_CAN'];
  const txPdu = container('CanIfTxPdu', `${CANIF_ROOT}/CanIfConfig/CanIfTxPdu`, [
    param('CanIfTxPduCanId', `${CANIF_ROOT}/CanIfConfig/CanIfTxPdu`, 'integer'),
    canIdTypeParam(`${CANIF_ROOT}/CanIfConfig/CanIfTxPdu`, txLiterals),
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
    rxCanIdTypeParam(`${CANIF_ROOT}/CanIfConfig/CanIfRxPdu`, rxLiterals),
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

/**
 * Candidate-selection fixture — declares BOTH the first candidate layout
 * (`CanIfInitCfg/CanIfTxPduCfg`) and the `CanIfConfig/CanIfTxPdu` layout.
 * resolveContainerKey must pick the first candidate present.
 */
function buildCandidateCanIfModule(): BswModuleDef {
  const txPduInit = container('CanIfTxPduCfg', `${CANIF_ROOT}/CanIfInitCfg/CanIfTxPduCfg`, [
    param('CanIfTxPduCanId', `${CANIF_ROOT}/CanIfInitCfg/CanIfTxPduCfg`, 'integer'),
    canIdTypeParam(`${CANIF_ROOT}/CanIfInitCfg/CanIfTxPduCfg`, ['STANDARD_CAN', 'EXTENDED_CAN']),
    param('CanIfTxPduDlc', `${CANIF_ROOT}/CanIfInitCfg/CanIfTxPduCfg`, 'integer'),
    param('CanIfTxPduId', `${CANIF_ROOT}/CanIfInitCfg/CanIfTxPduCfg`, 'integer'),
    param('CanIfTxPduType', `${CANIF_ROOT}/CanIfInitCfg/CanIfTxPduCfg`, 'enumeration', [
      'STATIC',
      'DYNAMIC',
    ]),
    param('CanIfTxPduUserTxConfirmationUL', `${CANIF_ROOT}/CanIfInitCfg/CanIfTxPduCfg`, 'string'),
  ]);
  const rxPduInit = container('CanIfRxPduCfg', `${CANIF_ROOT}/CanIfInitCfg/CanIfRxPduCfg`, [
    param('CanIfRxPduCanId', `${CANIF_ROOT}/CanIfInitCfg/CanIfRxPduCfg`, 'integer'),
    rxCanIdTypeParam(`${CANIF_ROOT}/CanIfInitCfg/CanIfRxPduCfg`, ['STANDARD_CAN', 'EXTENDED_CAN']),
    param('CanIfRxPduDlc', `${CANIF_ROOT}/CanIfInitCfg/CanIfRxPduCfg`, 'integer'),
    param('CanIfRxPduId', `${CANIF_ROOT}/CanIfInitCfg/CanIfRxPduCfg`, 'integer'),
    param('CanIfRxPduType', `${CANIF_ROOT}/CanIfInitCfg/CanIfRxPduCfg`, 'enumeration', [
      'STATIC',
      'DYNAMIC',
    ]),
    param('CanIfRxPduUserRxIndicationUL', `${CANIF_ROOT}/CanIfInitCfg/CanIfRxPduCfg`, 'string'),
  ]);
  const txPduConfig = container('CanIfTxPdu', `${CANIF_ROOT}/CanIfConfig/CanIfTxPdu`, [
    param('CanIfTxPduCanId', `${CANIF_ROOT}/CanIfConfig/CanIfTxPdu`, 'integer'),
  ]);
  const rxPduConfig = container('CanIfRxPdu', `${CANIF_ROOT}/CanIfConfig/CanIfRxPdu`, [
    param('CanIfRxPduCanId', `${CANIF_ROOT}/CanIfConfig/CanIfRxPdu`, 'integer'),
  ]);
  return {
    shortName: 'CanIf',
    path: CANIF_ROOT,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [
      container('CanIfInitCfg', `${CANIF_ROOT}/CanIfInitCfg`, [], [txPduInit, rxPduInit]),
      container('CanIfConfig', `${CANIF_ROOT}/CanIfConfig`, [], [txPduConfig, rxPduConfig]),
    ],
    providedEntries: [],
    references: [],
    lowerMultiplicity: 1,
    upperMultiplicity: 1,
  };
}

/**
 * Top-level fixture — PDU containers declared directly under the module root
 * (single-segment spine keys, no parent). Used with a profile whose
 * containerKeys are single-segment to lock the no-parent fallback: PDUs hang
 * directly off the module and instance paths are `/CanIf/<messageKey>`.
 */
function buildFlatCanIfModule(): BswModuleDef {
  const txPdu = container('CanIfTxPduCfg', `${CANIF_ROOT}/CanIfTxPduCfg`, [
    param('CanIfTxPduCanId', `${CANIF_ROOT}/CanIfTxPduCfg`, 'integer'),
    canIdTypeParam(`${CANIF_ROOT}/CanIfTxPduCfg`, ['STANDARD_CAN', 'EXTENDED_CAN']),
    param('CanIfTxPduDlc', `${CANIF_ROOT}/CanIfTxPduCfg`, 'integer'),
    param('CanIfTxPduId', `${CANIF_ROOT}/CanIfTxPduCfg`, 'integer'),
    param('CanIfTxPduType', `${CANIF_ROOT}/CanIfTxPduCfg`, 'enumeration', ['STATIC', 'DYNAMIC']),
    param('CanIfTxPduUserTxConfirmationUL', `${CANIF_ROOT}/CanIfTxPduCfg`, 'string'),
  ]);
  const rxPdu = container('CanIfRxPduCfg', `${CANIF_ROOT}/CanIfRxPduCfg`, [
    param('CanIfRxPduCanId', `${CANIF_ROOT}/CanIfRxPduCfg`, 'integer'),
    rxCanIdTypeParam(`${CANIF_ROOT}/CanIfRxPduCfg`, ['STANDARD_CAN', 'EXTENDED_CAN']),
    param('CanIfRxPduDlc', `${CANIF_ROOT}/CanIfRxPduCfg`, 'integer'),
    param('CanIfRxPduId', `${CANIF_ROOT}/CanIfRxPduCfg`, 'integer'),
    param('CanIfRxPduType', `${CANIF_ROOT}/CanIfRxPduCfg`, 'enumeration', ['STATIC', 'DYNAMIC']),
    param('CanIfRxPduUserRxIndicationUL', `${CANIF_ROOT}/CanIfRxPduCfg`, 'string'),
  ]);
  return {
    shortName: 'CanIf',
    path: CANIF_ROOT,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [txPdu, rxPdu],
    providedEntries: [],
    references: [],
    lowerMultiplicity: 1,
    upperMultiplicity: 1,
  };
}

/** Profile 变体：Tx/Rx PDU 容器候选为单段 key（顶层容器，无 parent）。 */
function flatProfile(): DbcImportProfile {
  return {
    ...AUTOSAR_R22_CAN_PROFILE,
    modules: {
      ...AUTOSAR_R22_CAN_PROFILE.modules,
      CanIf: {
        ...AUTOSAR_R22_CAN_PROFILE.modules.CanIf,
        txPduContainerKeys: ['CanIfTxPduCfg'],
        rxPduContainerKeys: ['CanIfRxPduCfg'],
      },
    },
  };
}

const index = buildDbcBswmdDefIndex(
  new Map([
    ['Com', emptyModule('Com')],
    ['CanIf', buildCanIfModule()],
    ['PduR', emptyModule('PduR')],
  ]),
);

// ---------------------------------------------------------------------------
// DBM fixtures + mapper harness.
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

function makeDbm(messages: readonly DbmMessage[]): Dbm {
  return {
    meta: { sourcePath: 'test.dbc', protocol: 'CAN', sourceHash: 'hash' },
    nodes: [],
    messages,
    signals: [],
    warnings: [],
  };
}

function makeContext(
  indexOverride: DbcBswmdDefIndex = index,
  profile: DbcImportProfile = AUTOSAR_R22_CAN_PROFILE,
): DbcMapperContext {
  return {
    dbm: makeDbm([]),
    targetNode: 'ECM',
    index: indexOverride,
    profile,
    warnings: [],
    fieldDiffs: [],
  };
}

function run(
  messages: readonly DbmMessage[],
  directions: ReadonlyMap<string, 'SEND' | 'RECEIVE'>,
  pduIds: ReadonlyMap<string, number> = new Map(),
  existingTxIds: ReadonlySet<number> = new Set(),
  existingRxIds: ReadonlySet<number> = new Set(),
  profile: DbcImportProfile = AUTOSAR_R22_CAN_PROFILE,
  indexOverride: DbcBswmdDefIndex = index,
): MapperResult<ArxmlModule> {
  const context = makeContext(indexOverride, profile);
  return mapCanIf(context, {
    relevantMessages: messages,
    directionByMessageKey: directions,
    pduIds,
    existingTxIds,
    existingRxIds,
  });
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

function wrapperOf(result: MapperResult<ArxmlModule>, wrapperName: string): ArxmlContainer {
  const wrapper = findChild(result.value, wrapperName);
  if (wrapper === undefined) throw new Error(`CanIf wrapper ${wrapperName} missing`);
  return wrapper;
}

function pduOf(
  result: MapperResult<ArxmlModule>,
  wrapperName: string,
  messageKey: string,
): ArxmlContainer {
  const pdu = findChild(wrapperOf(result, wrapperName), messageKey);
  if (pdu === undefined) throw new Error(`CanIf PDU ${wrapperName}/${messageKey} missing`);
  return pdu;
}

function paramOf(containerEl: ArxmlContainer, name: string): ParamValue | undefined {
  return containerEl.params[name];
}

// ---------------------------------------------------------------------------
// Tests — task-8 brief assertions 1..11.
// ---------------------------------------------------------------------------

describe('filterMessagesForTargetNode', () => {
  it('classifies transmitter as Tx, receiver as Rx, and drops unrelated messages', () => {
    const dbm = makeDbm([
      message('EngineMsg', 'ECM', []),
      message('GearMsg', 'TCM', ['ECM']),
      message('UnrelatedMsg', 'TCM', []),
    ]);
    const result = filterMessagesForTargetNode(dbm, 'ECM');
    expect(result.relevantMessages.map((m) => m.key)).toEqual(['EngineMsg', 'GearMsg']);
    expect(result.directionByMessageKey.get('EngineMsg')).toBe('SEND');
    expect(result.directionByMessageKey.get('GearMsg')).toBe('RECEIVE');
    expect(result.directionByMessageKey.get('UnrelatedMsg')).toBeUndefined();
    expect(result.skippedIrrelevantMessages).toBe(1);
  });

  it('counts every unrelated message in skippedIrrelevantMessages', () => {
    const dbm = makeDbm([
      message('EngineMsg', 'ECM', []),
      message('GearMsg', 'TCM', ['ECM']),
      message('Unrelated1', 'TCM', []),
      message('Unrelated2', 'ABS', ['TCU']),
    ]);
    const result = filterMessagesForTargetNode(dbm, 'ECM');
    expect(result.skippedIrrelevantMessages).toBe(2);
    expect(result.relevantMessages.map((m) => m.key)).toEqual(['EngineMsg', 'GearMsg']);
  });

  it('does not create containers for irrelevant messages and emits no warnings for them', () => {
    const filtered = filterMessagesForTargetNode(
      makeDbm([message('EngineMsg', 'ECM', []), message('UnrelatedMsg', 'TCM', [])]),
      'ECM',
    );
    const result = run(
      filtered.relevantMessages,
      filtered.directionByMessageKey,
      new Map([['EngineMsg', 0]]),
    );
    expect(findChild(result.value, 'UnrelatedMsg')).toBeUndefined();
    expect(result.warnings.some((w) => w.elementRef === 'UnrelatedMsg')).toBe(false);
  });
});

describe('mapCanIf — Tx PDU fields', () => {
  it('maps messageId / isExtended / dlc / pduId to the CanIfTxPdu* fields', () => {
    const msg = message('EngineMsg', 'ECM', [], {
      messageId: 0x123,
      isExtended: false,
      dlc: 8,
    });
    const result = run([msg], new Map([['EngineMsg', 'SEND']]), new Map([['EngineMsg', 7]]));
    const pdu = pduOf(result, 'CanIfConfig', 'EngineMsg');
    expect(paramOf(pdu, 'CanIfTxPduCanId')).toEqual({
      type: 'integer',
      value: 0x123,
      definitionRef: `${CANIF_ROOT}/CanIfConfig/CanIfTxPdu/CanIfTxPduCanId`,
    });
    expect(paramOf(pdu, 'CanIfTxPduCanIdType')).toMatchObject({
      type: 'enum',
      value: 'STANDARD_CAN',
    });
    expect(paramOf(pdu, 'CanIfTxPduDlc')).toMatchObject({ type: 'integer', value: 8 });
    expect(paramOf(pdu, 'CanIfTxPduId')).toMatchObject({ type: 'integer', value: 7 });
  });

  it('maps isExtended=true to EXTENDED_CAN and false to STANDARD_CAN', () => {
    const ext = message('ExtMsg', 'ECM', [], { isExtended: true });
    const std = message('StdMsg', 'ECM', [], { isExtended: false });
    const result = run(
      [ext, std],
      new Map([
        ['ExtMsg', 'SEND'],
        ['StdMsg', 'SEND'],
      ]),
      new Map([
        ['ExtMsg', 0],
        ['StdMsg', 1],
      ]),
    );
    expect(paramOf(pduOf(result, 'CanIfConfig', 'ExtMsg'), 'CanIfTxPduCanIdType')).toMatchObject({
      value: 'EXTENDED_CAN',
    });
    expect(paramOf(pduOf(result, 'CanIfConfig', 'StdMsg'), 'CanIfTxPduCanIdType')).toMatchObject({
      value: 'STANDARD_CAN',
    });
  });

  it('leaves CanIdType unset with dbc-enum-unmapped when the BSWMD enum lacks the literal', () => {
    const omitIndex = buildDbcBswmdDefIndex(
      new Map([
        ['Com', emptyModule('Com')],
        ['CanIf', buildCanIfModule({ omitExtendedCan: true })],
        ['PduR', emptyModule('PduR')],
      ]),
    );
    const msg = message('ExtMsg', 'ECM', [], { isExtended: true });
    const result = run(
      [msg],
      new Map([['ExtMsg', 'SEND']]),
      new Map([['ExtMsg', 0]]),
      new Set(),
      new Set(),
      AUTOSAR_R22_CAN_PROFILE,
      omitIndex,
    );
    expect(paramOf(pduOf(result, 'CanIfConfig', 'ExtMsg'), 'CanIfTxPduCanIdType')).toBeUndefined();
    expect(
      result.warnings.some(
        (w) =>
          w.code === 'dbc-enum-unmapped' &&
          w.elementRef === 'CanIfConfig/CanIfTxPdu/CanIfTxPduCanIdType',
      ),
    ).toBe(true);
  });

  it('maps DLC exactly for 0 through 8', () => {
    for (let dlc = 0; dlc <= 8; dlc += 1) {
      const msg = message(`Msg${dlc}`, 'ECM', [], { dlc });
      const result = run([msg], new Map([[`Msg${dlc}`, 'SEND']]), new Map([[`Msg${dlc}`, dlc]]));
      expect(paramOf(pduOf(result, 'CanIfConfig', `Msg${dlc}`), 'CanIfTxPduDlc')).toMatchObject({
        type: 'integer',
        value: dlc,
      });
    }
  });

  it('applies the CanIfTxPduType profile fallback STATIC', () => {
    const msg = message('EngineMsg', 'ECM', []);
    const result = run([msg], new Map([['EngineMsg', 'SEND']]), new Map([['EngineMsg', 0]]));
    expect(paramOf(pduOf(result, 'CanIfConfig', 'EngineMsg'), 'CanIfTxPduType')).toEqual({
      type: 'enum',
      value: 'STATIC',
      definitionRef: `${CANIF_ROOT}/CanIfConfig/CanIfTxPdu/CanIfTxPduType`,
    });
  });
});

describe('mapCanIf — Rx PDU fields', () => {
  it('maps messageId / isExtended / dlc / pduId to the CanIfRxPdu* fields', () => {
    const msg = message('GearMsg', 'TCM', ['ECM'], {
      messageId: 0x456,
      isExtended: true,
      dlc: 4,
    });
    const result = run([msg], new Map([['GearMsg', 'RECEIVE']]), new Map([['GearMsg', 0x1000]]));
    const pdu = pduOf(result, 'CanIfConfig', 'GearMsg');
    expect(paramOf(pdu, 'CanIfRxPduCanId')).toEqual({
      type: 'integer',
      value: 0x456,
      definitionRef: `${CANIF_ROOT}/CanIfConfig/CanIfRxPdu/CanIfRxPduCanId`,
    });
    expect(paramOf(pdu, 'CanIfRxPduCanIdType')).toMatchObject({
      type: 'enum',
      value: 'EXTENDED_CAN',
    });
    expect(paramOf(pdu, 'CanIfRxPduDlc')).toMatchObject({ type: 'integer', value: 4 });
    expect(paramOf(pdu, 'CanIfRxPduId')).toMatchObject({ type: 'integer', value: 0x1000 });
  });

  it('creates exactly one container per relevant message, never both directions', () => {
    const txMsg = message('EngineMsg', 'ECM', []);
    const rxMsg = message('GearMsg', 'TCM', ['ECM']);
    const result = run(
      [txMsg, rxMsg],
      new Map([
        ['EngineMsg', 'SEND'],
        ['GearMsg', 'RECEIVE'],
      ]),
      new Map([
        ['EngineMsg', 0],
        ['GearMsg', 0x1000],
      ]),
    );
    // 单个 `CanIfConfig` wrapper 同时容纳 Tx/Rx PDU；每条 message 只有一个实例，
    // 方向由 definitionRef 区分（Tx → CanIfTxPduCfg def，Rx → CanIfRxPduCfg def）。
    const wrapper = wrapperOf(result, 'CanIfConfig');
    expect(wrapper.children).toHaveLength(2);
    expect(findChild(wrapper, 'EngineMsg')?.definitionRef).toBe(
      `${CANIF_ROOT}/CanIfConfig/CanIfTxPdu`,
    );
    expect(findChild(wrapper, 'GearMsg')?.definitionRef).toBe(
      `${CANIF_ROOT}/CanIfConfig/CanIfRxPdu`,
    );
  });
});

describe('mapCanIf — upper-layer naming policy', () => {
  it('records Unmapped UL diffs and emits grouped dbc-policy-unmapped once per family when disabled', () => {
    const txA = message('EngineMsg', 'ECM', []);
    const txB = message('GearMsg', 'ECM', []);
    const rx = message('SpeedMsg', 'TCM', ['ECM']);
    const result = run(
      [txA, txB, rx],
      new Map([
        ['EngineMsg', 'SEND'],
        ['GearMsg', 'SEND'],
        ['SpeedMsg', 'RECEIVE'],
      ]),
      new Map([
        ['EngineMsg', 0],
        ['GearMsg', 1],
        ['SpeedMsg', 0x1000],
      ]),
    );
    const txUlDiffs = result.fieldDiffs.filter(
      (d) => d.paramKey === 'CanIfConfig/CanIfTxPdu/CanIfTxPduUserTxConfirmationUL',
    );
    expect(txUlDiffs).toHaveLength(2);
    expect(txUlDiffs.map((d) => d.containerPath).sort()).toEqual([
      '/CanIf/CanIfConfig/EngineMsg',
      '/CanIf/CanIfConfig/GearMsg',
    ]);
    for (const diff of txUlDiffs) {
      expect(diff.source).toBe('Unmapped');
    }
    const rxUlDiffs = result.fieldDiffs.filter(
      (d) => d.paramKey === 'CanIfConfig/CanIfRxPdu/CanIfRxPduUserRxIndicationUL',
    );
    expect(rxUlDiffs).toHaveLength(1);
    expect(rxUlDiffs[0]?.source).toBe('Unmapped');
    expect(rxUlDiffs[0]?.containerPath).toBe('/CanIf/CanIfConfig/SpeedMsg');
    const txWarnings = result.warnings.filter(
      (w) =>
        w.code === 'dbc-policy-unmapped' && w.elementRef.includes('CanIfTxPduUserTxConfirmationUL'),
    );
    expect(txWarnings).toHaveLength(1);
    const rxWarnings = result.warnings.filter(
      (w) =>
        w.code === 'dbc-policy-unmapped' && w.elementRef.includes('CanIfRxPduUserRxIndicationUL'),
    );
    expect(rxWarnings).toHaveLength(1);
  });

  it('generates template names and legalizes the result when UL naming is enabled', () => {
    const ulProfile = applyDbcPolicyOverrides(AUTOSAR_R22_CAN_PROFILE, undefined, {
      enabled: true,
      txTemplate: '{module}_{pdu}_TxConfirmation',
      rxTemplate: '{module}_{pdu}_RxIndication',
    });
    const txMsg = message('EngineMsg', 'ECM', []);
    const rxMsg = message('GearMsg', 'TCM', ['ECM']);
    const result = run(
      [txMsg, rxMsg],
      new Map([
        ['EngineMsg', 'SEND'],
        ['GearMsg', 'RECEIVE'],
      ]),
      new Map([
        ['EngineMsg', 0],
        ['GearMsg', 0x1000],
      ]),
      new Set(),
      new Set(),
      ulProfile,
    );
    expect(
      paramOf(pduOf(result, 'CanIfConfig', 'EngineMsg'), 'CanIfTxPduUserTxConfirmationUL'),
    ).toEqual({
      type: 'string',
      value: 'CanIf_EngineMsg_TxConfirmation',
      definitionRef: `${CANIF_ROOT}/CanIfConfig/CanIfTxPdu/CanIfTxPduUserTxConfirmationUL`,
    });
    expect(
      paramOf(pduOf(result, 'CanIfConfig', 'GearMsg'), 'CanIfRxPduUserRxIndicationUL'),
    ).toEqual({
      type: 'string',
      value: 'CanIf_GearMsg_RxIndication',
      definitionRef: `${CANIF_ROOT}/CanIfConfig/CanIfRxPdu/CanIfRxPduUserRxIndicationUL`,
    });
    expect(result.warnings.some((w) => w.code === 'dbc-policy-unmapped')).toBe(false);
  });

  it('legalizes a non-legal shortName in the generated UL name', () => {
    const ulProfile = applyDbcPolicyOverrides(AUTOSAR_R22_CAN_PROFILE, undefined, {
      enabled: true,
      txTemplate: '{module}_{pdu}_TxConfirmation',
    });
    const msg = message('Bad_Name', 'ECM', [], { shortName: 'Bad-Name' });
    const result = run(
      [msg],
      new Map([['Bad_Name', 'SEND']]),
      new Map([['Bad_Name', 0]]),
      new Set(),
      new Set(),
      ulProfile,
    );
    expect(
      paramOf(pduOf(result, 'CanIfConfig', 'Bad_Name'), 'CanIfTxPduUserTxConfirmationUL'),
    ).toMatchObject({
      value: 'CanIf_Bad_Name_TxConfirmation',
    });
  });

  // Regression (spec §7.5): the {pdu} placeholder expands to the PDU instance
  // shortName — the legalized AND deduped message.key — so two messages with
  // the same raw name must render distinct UL names.
  it('uses the deduped instance key so same-shortName messages get distinct UL names', () => {
    const ulProfile = applyDbcPolicyOverrides(AUTOSAR_R22_CAN_PROFILE, undefined, {
      enabled: true,
      txTemplate: '{module}_{pdu}_TxConfirmation',
    });
    const msgA = message('Engine_Msg', 'ECM', [], { shortName: 'Engine Msg' });
    const msgB = message('Engine_Msg_2', 'ECM', [], { shortName: 'Engine Msg' });
    const result = run(
      [msgA, msgB],
      new Map([
        ['Engine_Msg', 'SEND'],
        ['Engine_Msg_2', 'SEND'],
      ]),
      new Map([
        ['Engine_Msg', 0],
        ['Engine_Msg_2', 1],
      ]),
      new Set(),
      new Set(),
      ulProfile,
    );
    const ulA = paramOf(
      pduOf(result, 'CanIfConfig', 'Engine_Msg'),
      'CanIfTxPduUserTxConfirmationUL',
    );
    const ulB = paramOf(
      pduOf(result, 'CanIfConfig', 'Engine_Msg_2'),
      'CanIfTxPduUserTxConfirmationUL',
    );
    expect(ulA).toMatchObject({ value: 'CanIf_Engine_Msg_TxConfirmation' });
    expect(ulB).toMatchObject({ value: 'CanIf_Engine_Msg_2_TxConfirmation' });
    expect(ulA).not.toEqual(ulB);
  });
});

describe('mapCanIf — PduId conflict policy', () => {
  it('emits dbc-pdu-id-conflict and does not assign a conflicting id', () => {
    const msg = message('EngineMsg', 'ECM', []);
    const result = run(
      [msg],
      new Map([['EngineMsg', 'SEND']]),
      new Map([['EngineMsg', 5]]),
      new Set([5]),
    );
    const pdu = pduOf(result, 'CanIfConfig', 'EngineMsg');
    expect(paramOf(pdu, 'CanIfTxPduId')).toBeUndefined();
    expect(
      result.warnings.some((w) => w.code === 'dbc-pdu-id-conflict' && w.elementRef === 'EngineMsg'),
    ).toBe(true);
    const conflictDiff = result.fieldDiffs.find(
      (d) => d.paramKey === 'CanIfConfig/CanIfTxPdu/CanIfTxPduId',
    );
    expect(conflictDiff?.source).toBe('Error');
    expect(conflictDiff?.warningCodes).toContain('dbc-pdu-id-conflict');
    expect(conflictDiff?.containerPath).toBe('/CanIf/CanIfConfig/EngineMsg');
  });

  it('checks the Rx existing-id set for RECEIVE messages', () => {
    const msg = message('GearMsg', 'TCM', ['ECM']);
    const result = run(
      [msg],
      new Map([['GearMsg', 'RECEIVE']]),
      new Map([['GearMsg', 0x1000]]),
      new Set(),
      new Set([0x1000]),
    );
    expect(paramOf(pduOf(result, 'CanIfConfig', 'GearMsg'), 'CanIfRxPduId')).toBeUndefined();
    expect(
      result.warnings.some((w) => w.code === 'dbc-pdu-id-conflict' && w.elementRef === 'GearMsg'),
    ).toBe(true);
  });

  it('records an Unmapped diff when a relevant message has no assigned PduId', () => {
    const msg = message('EngineMsg', 'ECM', []);
    const result = run([msg], new Map([['EngineMsg', 'SEND']]));
    expect(paramOf(pduOf(result, 'CanIfConfig', 'EngineMsg'), 'CanIfTxPduId')).toBeUndefined();
    const idDiff = result.fieldDiffs.find(
      (d) => d.paramKey === 'CanIfConfig/CanIfTxPdu/CanIfTxPduId',
    );
    expect(idDiff?.source).toBe('Unmapped');
  });
});

describe('mapCanIf — container candidate selection', () => {
  it('resolves the first candidate key present in the BSWMD', () => {
    const candidateIndex = buildDbcBswmdDefIndex(
      new Map([
        ['Com', emptyModule('Com')],
        ['CanIf', buildCandidateCanIfModule()],
        ['PduR', emptyModule('PduR')],
      ]),
    );
    const msg = message('EngineMsg', 'ECM', []);
    const result = run(
      [msg],
      new Map([['EngineMsg', 'SEND']]),
      new Map([['EngineMsg', 0]]),
      new Set(),
      new Set(),
      AUTOSAR_R22_CAN_PROFILE,
      candidateIndex,
    );
    // 第一个存在的候选 `CanIfInitCfg/CanIfTxPduCfg` 命中 → wrapper 是其 parent。
    const wrapper = wrapperOf(result, 'CanIfInitCfg');
    expect(wrapper.definitionRef).toBe(`${CANIF_ROOT}/CanIfInitCfg`);
    const pdu = findChild(wrapper, 'EngineMsg');
    expect(pdu?.definitionRef).toBe(`${CANIF_ROOT}/CanIfInitCfg/CanIfTxPduCfg`);
    expect(paramOf(pdu!, 'CanIfTxPduCanId')).toMatchObject({ type: 'integer', value: 0x100 });
  });

  it('emits dbc-bswmd-def-missing and returns an empty module when no Tx/Rx container exists', () => {
    const emptyIndex = buildDbcBswmdDefIndex(
      new Map([
        ['Com', emptyModule('Com')],
        ['CanIf', emptyModule('CanIf')],
        ['PduR', emptyModule('PduR')],
      ]),
    );
    const msg = message('EngineMsg', 'ECM', []);
    const result = run(
      [msg],
      new Map([['EngineMsg', 'SEND']]),
      new Map([['EngineMsg', 0]]),
      new Set(),
      new Set(),
      AUTOSAR_R22_CAN_PROFILE,
      emptyIndex,
    );
    expect(result.value.children).toHaveLength(0);
    expect(result.warnings.filter((w) => w.code === 'dbc-bswmd-def-missing')).toHaveLength(2);
  });

  it('falls back to no wrapper when the PDU container key has no parent', () => {
    const flatIndex = buildDbcBswmdDefIndex(
      new Map([
        ['Com', emptyModule('Com')],
        ['CanIf', buildFlatCanIfModule()],
        ['PduR', emptyModule('PduR')],
      ]),
    );
    const msg = message('EngineMsg', 'ECM', []);
    const result = run(
      [msg],
      new Map([['EngineMsg', 'SEND']]),
      new Map([['EngineMsg', 0]]),
      new Set(),
      new Set(),
      flatProfile(),
      flatIndex,
    );
    // 无 wrapper：PDU 直接挂在 module 下，instance path = `/CanIf/<messageKey>`。
    const pdu = findChild(result.value, 'EngineMsg');
    expect(pdu).toBeDefined();
    expect(pdu?.definitionRef).toBe(`${CANIF_ROOT}/CanIfTxPduCfg`);
    expect(findChild(result.value, 'CanIfTxPduCfg')).toBeUndefined();
    const canIdDiff = result.fieldDiffs.find((d) => d.paramKey === 'CanIfTxPduCfg/CanIfTxPduCanId');
    expect(canIdDiff?.containerPath).toBe('/CanIf/EngineMsg');
  });
});

describe('mapCanIf — field-diff instance paths', () => {
  it('anchors every generated field diff to the instance path', () => {
    const msg = message('EngineMsg', 'ECM', [], { messageId: 0x123, dlc: 8 });
    const result = run([msg], new Map([['EngineMsg', 'SEND']]), new Map([['EngineMsg', 7]]));
    const canIdDiff = result.fieldDiffs.find(
      (d) => d.paramKey === 'CanIfConfig/CanIfTxPdu/CanIfTxPduCanId',
    );
    expect(canIdDiff?.containerPath).toBe('/CanIf/CanIfConfig/EngineMsg');
    const dlcDiff = result.fieldDiffs.find(
      (d) => d.paramKey === 'CanIfConfig/CanIfTxPdu/CanIfTxPduDlc',
    );
    expect(dlcDiff?.containerPath).toBe('/CanIf/CanIfConfig/EngineMsg');
  });
});
