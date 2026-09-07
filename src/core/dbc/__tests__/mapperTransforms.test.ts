import { describe, expect, it } from 'vitest';

import type {
  BswModuleDef,
  ContainerDef,
  ParamDef,
  ReferenceDef,
} from '../../project/bswmd/types.js';
import { buildDbcBswmdDefIndex } from '../bswmdDefIndex.js';
import type { Dbm, DbmSignal } from '../dbm.js';
import {
  assignPduIds,
  comSignalType,
  convertComBitPosition,
  resolveContainerKey,
  upperLayerName,
  signalExceedsDlc,
} from '../mappers/transforms.js';
import {
  makeContainer,
  makeParam,
  makeReference,
  type DbcMapperContext,
  type MapperFieldDiff,
} from '../mappers/types.js';
import { AUTOSAR_R22_CAN_PROFILE } from '../profile.js';

// ---------------------------------------------------------------------------
// Fixtures: synthetic R22-style BSWMD for Com / CanIf / PduR.
// ---------------------------------------------------------------------------

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

function reference(shortName: string, containerPath: string, destKind: string): ReferenceDef {
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
  references: readonly ReferenceDef[] = [],
  subContainers: readonly ContainerDef[] = [],
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

const COM_ROOT = '/AUTOSAR_R22/EcucDefs/Com';

const comIpdu = container('ComIPdu', `${COM_ROOT}/ComConfig/ComIPdu`, [
  param('ComIPduDirection', `${COM_ROOT}/ComConfig/ComIPdu`, 'enumeration', ['SEND', 'RECEIVE']),
  param('ComIPduType', `${COM_ROOT}/ComConfig/ComIPdu`, 'enumeration', ['NORMAL', 'TP']),
  param('ComHandleId', `${COM_ROOT}/ComConfig/ComIPdu`, 'integer'),
  param('IPduDLC', `${COM_ROOT}/ComConfig/ComIPdu`, 'integer'),
]);

const comSignal = container('ComSignal', `${COM_ROOT}/ComConfig/ComIPdu/ComSignal`, [
  param('ComBitPosition', `${COM_ROOT}/ComConfig/ComIPdu/ComSignal`, 'integer'),
  param('ComBitSize', `${COM_ROOT}/ComConfig/ComIPdu/ComSignal`, 'integer'),
  param('ComSignalEndianness', `${COM_ROOT}/ComConfig/ComIPdu/ComSignal`, 'enumeration', [
    'LITTLE_ENDIAN',
    'BIG_ENDIAN',
  ]),
  param('ComSignalType', `${COM_ROOT}/ComConfig/ComIPdu/ComSignal`, 'enumeration', [
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
  ]),
  param('ComSignalDataInvalidValue', `${COM_ROOT}/ComConfig/ComIPdu/ComSignal`, 'integer'),
  param('ComSignalUpdateBit', `${COM_ROOT}/ComConfig/ComIPdu/ComSignal`, 'boolean'),
  param('ComSignalDescription', `${COM_ROOT}/ComConfig/ComIPdu/ComSignal`, 'string'),
  param('ComSignalFunction', `${COM_ROOT}/ComConfig/ComIPdu/ComSignal`, 'function-name'),
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

const comModule: BswModuleDef = {
  shortName: 'Com',
  path: COM_ROOT,
  dialect: 'ecuc-module-def',
  moduleId: null,
  containers: [
    container(
      'ComConfig',
      `${COM_ROOT}/ComConfig`,
      [],
      [],
      [
        container(
          'ComIPdu',
          `${COM_ROOT}/ComConfig/ComIPdu`,
          [],
          [],
          [
            comIpdu,
            comSignal,
            container(
              'ComTxIPdu',
              `${COM_ROOT}/ComConfig/ComIPdu/ComTxIPdu`,
              [],
              [],
              [
                container(
                  'ComTxModeTrue',
                  `${COM_ROOT}/ComConfig/ComIPdu/ComTxIPdu/ComTxModeTrue`,
                  [],
                  [],
                  [comTxMode],
                ),
              ],
            ),
          ],
        ),
      ],
    ),
  ],
  providedEntries: [],
  references: [],
  lowerMultiplicity: 1,
  upperMultiplicity: 1,
};

const PDU_R_ROOT = '/AUTOSAR_R22/EcucDefs/PduR';

const pduRDestPdu = container(
  'PduRDestPdu',
  `${PDU_R_ROOT}/PduRRoutingPaths/PduRRoutingPath/PduRDestPdu`,
  [],
  [
    reference(
      'PduRDestPduRef',
      `${PDU_R_ROOT}/PduRRoutingPaths/PduRRoutingPath/PduRDestPdu`,
      'ECUC-CONTAINER-VALUE',
    ),
  ],
);

const pduRModule: BswModuleDef = {
  shortName: 'PduR',
  path: PDU_R_ROOT,
  dialect: 'ecuc-module-def',
  moduleId: null,
  containers: [
    container(
      'PduRRoutingPaths',
      `${PDU_R_ROOT}/PduRRoutingPaths`,
      [],
      [],
      [
        container(
          'PduRRoutingPath',
          `${PDU_R_ROOT}/PduRRoutingPaths/PduRRoutingPath`,
          [],
          [],
          [pduRDestPdu],
        ),
      ],
    ),
  ],
  providedEntries: [],
  references: [],
  lowerMultiplicity: 1,
  upperMultiplicity: 1,
};

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

const index = buildDbcBswmdDefIndex(
  new Map([
    ['Com', comModule],
    ['CanIf', emptyModule('CanIf')],
    ['PduR', pduRModule],
  ]),
);

// ---------------------------------------------------------------------------
// convertComBitPosition — spec §7.2.1 anchor table (verbatim).
// ---------------------------------------------------------------------------

describe('convertComBitPosition', () => {
  it.each([
    [0, 8, 'little-endian', 0],
    [7, 8, 'big-endian', 0],
    [7, 12, 'big-endian', 12],
    [15, 4, 'big-endian', 12],
    [16, 1, 'big-endian', 16],
  ])('converts start %i length %i %s to %i', (start, length, order, expected) => {
    expect(
      convertComBitPosition(
        start as number,
        length as number,
        order as 'little-endian' | 'big-endian',
      ),
    ).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// comSignalType — spec §7.2.2 dispatch table + invalid combinations.
// ---------------------------------------------------------------------------

describe('comSignalType', () => {
  it.each([
    ['unsigned', 1, 'BOOLEAN'],
    ['unsigned', 2, 'UINT8'],
    ['unsigned', 8, 'UINT8'],
    ['unsigned', 9, 'UINT16'],
    ['unsigned', 16, 'UINT16'],
    ['unsigned', 17, 'UINT32'],
    ['unsigned', 32, 'UINT32'],
    ['unsigned', 33, 'UINT64'],
    ['unsigned', 64, 'UINT64'],
    ['signed', 2, 'SINT8'],
    ['signed', 8, 'SINT8'],
    ['signed', 9, 'SINT16'],
    ['signed', 16, 'SINT16'],
    ['signed', 17, 'SINT32'],
    ['signed', 32, 'SINT32'],
    ['signed', 33, 'SINT64'],
    ['signed', 64, 'SINT64'],
    ['float', 32, 'FLOAT32'],
    ['double', 64, 'FLOAT64'],
  ])('dispatches %s length %i to %s', (valueType, length, expected) => {
    expect(comSignalType(valueType as DbmSignal['valueType'], length as number)).toEqual({
      value: expected,
    });
  });

  it.each([
    ['signed', 1],
    ['float', 16],
    ['double', 32],
  ])('rejects unsupported combination %s length %i', (valueType, length) => {
    expect(comSignalType(valueType as DbmSignal['valueType'], length as number)).toEqual({
      warningCode: 'dbc-unsupported-value-type',
    });
  });
});

// ---------------------------------------------------------------------------
// assignPduIds — spec §7.4.
// ---------------------------------------------------------------------------

describe('assignPduIds', () => {
  it('numbers Tx and Rx independently for per-direction scope', () => {
    const { ids } = assignPduIds({
      messageKeys: ['MsgA', 'MsgB', 'MsgC', 'MsgD'],
      policy: {
        scope: 'perDirection',
        txBase: 0,
        rxBase: 0x1000,
        step: 1,
        order: 'document-order',
      },

      directions: new Map([
        ['MsgA', 'SEND'],
        ['MsgB', 'SEND'],
        ['MsgC', 'RECEIVE'],
        ['MsgD', 'RECEIVE'],
      ]),
    });
    expect(ids.get('MsgA')).toBe(0);
    expect(ids.get('MsgB')).toBe(1);
    expect(ids.get('MsgC')).toBe(0x1000);
    expect(ids.get('MsgD')).toBe(0x1001);
  });

  it('ignores rxBase for global scope', () => {
    const { ids } = assignPduIds({
      messageKeys: ['MsgA', 'MsgB'],
      policy: { scope: 'global', txBase: 0, rxBase: 0x1000, step: 1, order: 'document-order' },
    });
    expect(ids.get('MsgA')).toBe(0);
    expect(ids.get('MsgB')).toBe(1);
  });

  it('honours step', () => {
    const { ids } = assignPduIds({
      messageKeys: ['MsgA', 'MsgB', 'MsgC'],
      policy: { scope: 'global', txBase: 10, rxBase: 0, step: 2, order: 'document-order' },
    });
    expect(ids.get('MsgA')).toBe(10);
    expect(ids.get('MsgB')).toBe(12);
    expect(ids.get('MsgC')).toBe(14);
  });

  it('orders by shortName for shortName-order policy', () => {
    const { ids } = assignPduIds({
      messageKeys: ['Zeta', 'Alpha', 'Mid'],
      policy: { scope: 'global', txBase: 0, rxBase: 0, step: 1, order: 'shortName-order' },
    });
    expect(ids.get('Alpha')).toBe(0);
    expect(ids.get('Mid')).toBe(1);
    expect(ids.get('Zeta')).toBe(2);
  });

  it('preserves document order for document-order policy', () => {
    const { ids } = assignPduIds({
      messageKeys: ['Zeta', 'Alpha', 'Mid'],
      policy: { scope: 'global', txBase: 0, rxBase: 0, step: 1, order: 'document-order' },
    });
    expect(ids.get('Zeta')).toBe(0);
    expect(ids.get('Alpha')).toBe(1);
    expect(ids.get('Mid')).toBe(2);
  });

  it('reports intra-generation duplicate conflicts', () => {
    const { ids, warnings } = assignPduIds({
      messageKeys: ['MsgA', 'MsgB', 'MsgC'],
      policy: { scope: 'global', txBase: 0, rxBase: 0, step: 0, order: 'document-order' },
    });
    expect(ids.get('MsgA')).toBe(0);
    expect(ids.get('MsgB')).toBe(0);
    expect(ids.get('MsgC')).toBe(0);
    expect(warnings.filter((warning) => warning.code === 'dbc-pdu-id-conflict')).toHaveLength(2);
  });

  // Per-module semantics (spec §7.4 trigger 2): assignPduIds only detects
  // intra-generation duplicates. Existing-id conflict detection lives at the
  // per-module consumers — mapCanIf checks the CanIf set, mapCom checks the
  // Com set (see comMapper.test.ts / mapDbmToEcuc.test.ts regression tests:
  // existing Com ids + empty CanIf set → NO dbc-pdu-id-conflict for the
  // CanIf pduId assignment).
  it('performs only intra-generation conflict checks (per-module delegation)', () => {
    const { warnings } = assignPduIds({
      messageKeys: ['MsgA', 'MsgB'],
      policy: { scope: 'global', txBase: 0, rxBase: 0, step: 1, order: 'document-order' },
    });
    expect(warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// signalExceedsDlc — spec §7.2.1 DLC-boundary rule.
// ---------------------------------------------------------------------------

describe('signalExceedsDlc', () => {
  it.each([
    // little-endian: linear coverage [startBit, startBit + length).
    [0, 8, 'little-endian', 8, false],
    [0, 8, 'little-endian', 1, false],
    [8, 8, 'little-endian', 2, false],
    [8, 8, 'little-endian', 1, true],
    [0, 16, 'little-endian', 1, true],
    // big-endian: validated on the converted LSB position — the signal occupies
    // the contiguous byte range [floor(startBit/8), floor(comBitPosition/8)]
    // (Motorola sawtooth descends within a byte, rolls up at byte boundaries).
    [7, 8, 'big-endian', 1, false],
    [7, 12, 'big-endian', 2, false],
    [7, 16, 'big-endian', 2, false],
    [7, 16, 'big-endian', 1, true],
    [15, 4, 'big-endian', 2, false],
    [15, 9, 'big-endian', 2, true],
    [16, 1, 'big-endian', 3, false],
    [23, 8, 'big-endian', 2, true],
    [23, 8, 'big-endian', 3, false],
  ])('start %i length %i %s dlc %i → outOfBounds=%j', (start, length, order, dlc, expected) => {
    expect(
      signalExceedsDlc(
        start as number,
        length as number,
        order as 'little-endian' | 'big-endian',
        dlc as number,
      ),
    ).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// upperLayerName — spec §7.5.
// ---------------------------------------------------------------------------

describe('upperLayerName', () => {
  it('renders {module} and {pdu} placeholders', () => {
    expect(
      upperLayerName({ pduShortName: 'EngineMsg', template: '{module}_{pdu}_TxConfirmation' }),
    ).toBe('CanIf_EngineMsg_TxConfirmation');
  });

  it('legalizes the rendered result', () => {
    expect(
      upperLayerName({ pduShortName: 'Bad-Name', template: '{module}_{pdu}_RxIndication' }),
    ).toBe('CanIf_Bad_Name_RxIndication');
  });
});

// ---------------------------------------------------------------------------
// resolveContainerKey — profile candidate resolution.
// ---------------------------------------------------------------------------

describe('resolveContainerKey', () => {
  it('returns the first candidate present in the BSWMD index', () => {
    expect(
      resolveContainerKey(['ComConfig/ComIPdu/ComSignal', 'ComConfig/ComSignal'], index.Com),
    ).toBe('ComConfig/ComIPdu/ComSignal');
  });

  it('returns undefined when no candidate is present', () => {
    expect(resolveContainerKey(['ComConfig/ComSignal'], index.Com)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// makeParam / makeReference / makeContainer — §4.3 validation rules.
// ---------------------------------------------------------------------------

function contextFor(): { context: DbcMapperContext; fieldDiffs: MapperFieldDiff[] } {
  const fieldDiffs: MapperFieldDiff[] = [];
  const context: DbcMapperContext = {
    dbm: undefined as unknown as Dbm,
    targetNode: 'ECM',
    index,
    profile: AUTOSAR_R22_CAN_PROFILE,
    warnings: [],
    fieldDiffs,
  };
  return { context, fieldDiffs };
}

describe('makeParam', () => {
  it('maps integer definitions to integer ParamValues with definitionRef', () => {
    const { context } = contextFor();
    const value = makeParam(context, 'Com', 'ComConfig/ComIPdu/ComHandleId', 7, 'Profile-default');
    expect(value).toEqual({
      type: 'integer',
      value: 7,
      definitionRef: `${COM_ROOT}/ComConfig/ComIPdu/ComHandleId`,
    });
  });

  it('maps float definitions to float ParamValues', () => {
    const { context } = contextFor();
    const value = makeParam(
      context,
      'Com',
      'ComConfig/ComIPdu/ComTxIPdu/ComTxModeTrue/ComTxMode/ComTxModeTimePeriod',
      0.1,
      'Auto',
    );
    expect(value).toEqual({
      type: 'float',
      value: 0.1,
      definitionRef: `${COM_ROOT}/ComConfig/ComIPdu/ComTxIPdu/ComTxModeTrue/ComTxMode/ComTxModeTimePeriod`,
    });
  });

  it('maps boolean definitions to boolean ParamValues', () => {
    const { context } = contextFor();
    const value = makeParam(
      context,
      'Com',
      'ComConfig/ComIPdu/ComSignal/ComSignalUpdateBit',
      true,
      'Auto',
    );
    expect(value).toEqual({
      type: 'boolean',
      value: true,
      definitionRef: `${COM_ROOT}/ComConfig/ComIPdu/ComSignal/ComSignalUpdateBit`,
    });
  });

  it('maps enumeration definitions to enum ParamValues when the literal is present', () => {
    const { context } = contextFor();
    const value = makeParam(
      context,
      'Com',
      'ComConfig/ComIPdu/ComIPduDirection',
      'SEND',
      'Derived',
    );
    expect(value).toEqual({
      type: 'enum',
      value: 'SEND',
      definitionRef: `${COM_ROOT}/ComConfig/ComIPdu/ComIPduDirection`,
    });
  });

  it('maps string definitions to string ParamValues', () => {
    const { context } = contextFor();
    const value = makeParam(
      context,
      'Com',
      'ComConfig/ComIPdu/ComSignal/ComSignalDescription',
      'desc',
      'Unmapped',
    );
    expect(value).toEqual({
      type: 'string',
      value: 'desc',
      definitionRef: `${COM_ROOT}/ComConfig/ComIPdu/ComSignal/ComSignalDescription`,
    });
  });

  it('maps function-name definitions to string ParamValues', () => {
    const { context } = contextFor();
    const value = makeParam(
      context,
      'Com',
      'ComConfig/ComIPdu/ComSignal/ComSignalFunction',
      'Com_Main',
      'Auto',
    );
    expect(value).toEqual({
      type: 'string',
      value: 'Com_Main',
      definitionRef: `${COM_ROOT}/ComConfig/ComIPdu/ComSignal/ComSignalFunction`,
    });
  });

  it('emits dbc-bswmd-def-missing and returns undefined for an unknown definition', () => {
    const { context } = contextFor();
    const value = makeParam(context, 'Com', 'ComConfig/ComIPdu/NoSuchParam', 1, 'Auto');
    expect(value).toBeUndefined();
    expect(context.warnings.map((warning) => warning.code)).toContain('dbc-bswmd-def-missing');
    expect(context.fieldDiffs[0]?.source).toBe('Unmapped');
  });

  it('emits dbc-enum-unmapped and records Error for an enum literal miss', () => {
    const { context } = contextFor();
    const value = makeParam(
      context,
      'Com',
      'ComConfig/ComIPdu/ComIPduType',
      'MISSING_LITERAL',
      'Profile-default',
    );
    expect(value).toBeUndefined();
    expect(context.warnings.map((warning) => warning.code)).toContain('dbc-enum-unmapped');
    expect(context.fieldDiffs[0]?.source).toBe('Error');
  });

  it('emits dbc-param-type-mismatch and records Error for a type mismatch', () => {
    const { context } = contextFor();
    const value = makeParam(
      context,
      'Com',
      'ComConfig/ComIPdu/ComHandleId',
      'not-a-number',
      'Auto',
    );
    expect(value).toBeUndefined();
    expect(context.warnings.map((warning) => warning.code)).toContain('dbc-param-type-mismatch');
    expect(context.fieldDiffs[0]?.source).toBe('Error');
  });

  it('records a field diff for every successful field', () => {
    const { context, fieldDiffs } = contextFor();
    makeParam(context, 'Com', 'ComConfig/ComIPdu/ComHandleId', 7, 'Profile-default');
    expect(fieldDiffs).toHaveLength(1);
    expect(fieldDiffs[0]).toMatchObject({
      moduleName: 'Com',
      paramKey: 'ComConfig/ComIPdu/ComHandleId',
      incoming: 7,
      source: 'Profile-default',
    });
  });
});

describe('makeReference', () => {
  it('creates a reference ParamValue with definitionRef', () => {
    const { context } = contextFor();
    const value = makeReference(
      context,
      'PduR',
      'PduRRoutingPaths/PduRRoutingPath/PduRDestPdu/PduRDestPduRef',
      '/Com/ComConfig/ComIPdu/MsgA',
      'Derived',
    );
    expect(value).toEqual({
      type: 'reference',
      value: '/Com/ComConfig/ComIPdu/MsgA',
      dest: 'ECUC-CONTAINER-VALUE',
      definitionRef: `${PDU_R_ROOT}/PduRRoutingPaths/PduRRoutingPath/PduRDestPdu/PduRDestPduRef`,
    });
  });

  it('emits dbc-bswmd-def-missing and returns undefined for an unknown reference', () => {
    const { context } = contextFor();
    const value = makeReference(
      context,
      'PduR',
      'PduRRoutingPaths/NoSuchRef',
      '/Com/MsgA',
      'Derived',
    );
    expect(value).toBeUndefined();
    expect(context.warnings.map((warning) => warning.code)).toContain('dbc-bswmd-def-missing');
    expect(context.fieldDiffs[0]?.source).toBe('Unmapped');
  });
});

describe('makeContainer', () => {
  it('creates a container with definitionRef', () => {
    const { context } = contextFor();
    const value = makeContainer(context, 'Com', 'ComConfig/ComIPdu', 'EngineMsg');
    expect(value).toMatchObject({
      kind: 'container',
      tagName: 'ECUC-CONTAINER-VALUE',
      shortName: 'EngineMsg',
      definitionRef: `${COM_ROOT}/ComConfig/ComIPdu`,
    });
    expect(value?.params).toEqual({});
    expect(value?.children).toEqual([]);
  });

  it('emits dbc-bswmd-def-missing and returns undefined for an unknown container', () => {
    const { context } = contextFor();
    const value = makeContainer(context, 'Com', 'ComConfig/NoSuchContainer', 'EngineMsg');
    expect(value).toBeUndefined();
    expect(context.warnings.map((warning) => warning.code)).toContain('dbc-bswmd-def-missing');
    expect(context.fieldDiffs[0]?.source).toBe('Unmapped');
  });
});
