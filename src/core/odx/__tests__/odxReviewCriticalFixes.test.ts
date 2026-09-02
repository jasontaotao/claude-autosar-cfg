import { describe, expect, it } from 'vitest';

import type { ArxmlContainer } from '../../arxml/types.js';
import type {
  BswModuleDef,
  ContainerDef,
  ParamDef,
  ReferenceDef,
} from '../../project/bswmd/types.js';
import type { Dim, DimDataObject, DimService } from '../dim.js';
import { buildBswmdDefIndex } from '../bswmdDefIndex.js';
import { mapDcm } from '../dcmMapper.js';
import { mapDem } from '../demMapper.js';
import { mergeModuleThreeWay } from '../threeWayMerge.js';

function p(
  shortName: string,
  path: string,
  kind: ParamDef['kind'],
  defaultValue: ParamDef['defaultValue'] = null,
  enumerationLiterals: readonly string[] = [],
): ParamDef {
  return {
    shortName,
    path,
    kind,
    defaultValue,
    minValue: null,
    maxValue: null,
    minLength: null,
    maxLength: null,
    enumerationLiterals,
  };
}

function r(shortName: string, path: string): ReferenceDef {
  return {
    shortName,
    path,
    destKind: 'ECUC-CONTAINER-VALUE',
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
  };
}

function c(
  shortName: string,
  path: string,
  children: readonly ContainerDef[] = [],
  parameters: readonly ParamDef[] = [],
  references: readonly ReferenceDef[] = [],
): ContainerDef {
  return {
    shortName,
    path,
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    subContainers: children,
    parameters,
    references,
    choices: [],
  };
}

const didPrefix = '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp';

function buildDcmIndex(): ReturnType<typeof buildBswmdDefIndex> {
  const dcm: BswModuleDef = {
    shortName: 'Dcm',
    path: '/AUTOSAR_R22/EcucDefs/Dcm',
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [
      c('DcmConfigSet', '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet', [
        c(`${'DcmDsp'}`, '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp', [
          c(
            'DcmDspDid',
            `${didPrefix}/DcmDspDid`,
            [],
            [
              p('DcmDspDidUsed', `${didPrefix}/DcmDspDid/DcmDspDidUsed`, 'boolean', true),
              p('DcmDspDidIdentifier', `${didPrefix}/DcmDspDid/DcmDspDidIdentifier`, 'integer', 0),
              p(
                'DcmDspDidUsePort',
                `${didPrefix}/DcmDspDid/DcmDspDidUsePort`,
                'enumeration',
                'USE_DATA_ELEMENT_SPECIFIC_INTERFACES',
              ),
              p('DcmDspDidSize', `${didPrefix}/DcmDspDid/DcmDspDidSize`, 'integer', 0),
            ],
            [
              r('DcmDspDidInfoRef', `${didPrefix}/DcmDspDid/DcmDspDidInfoRef`),
              r('DcmDspDidRef', `${didPrefix}/DcmDspDid/DcmDspDidRef`),
            ],
          ),
          c(
            'DcmDspDidInfo',
            `${didPrefix}/DcmDspDidInfo`,
            [
              c(
                'DcmDspDidRead',
                `${didPrefix}/DcmDspDidInfo/DcmDspDidRead`,
                [],
                [],
                [
                  r(
                    'DcmDspDidReadSessionRef',
                    `${didPrefix}/DcmDspDidInfo/DcmDspDidRead/DcmDspDidReadSessionRef`,
                  ),
                  r(
                    'DcmDspDidReadSecurityLevelRef',
                    `${didPrefix}/DcmDspDidInfo/DcmDspDidRead/DcmDspDidReadSecurityLevelRef`,
                  ),
                ],
              ),
              c(
                'DcmDspDidWrite',
                `${didPrefix}/DcmDspDidInfo/DcmDspDidWrite`,
                [],
                [],
                [
                  r(
                    'DcmDspDidWriteSessionRef',
                    `${didPrefix}/DcmDspDidInfo/DcmDspDidWrite/DcmDspDidWriteSessionRef`,
                  ),
                  r(
                    'DcmDspDidWriteSecurityLevelRef',
                    `${didPrefix}/DcmDspDidInfo/DcmDspDidWrite/DcmDspDidWriteSecurityLevelRef`,
                  ),
                ],
              ),
              c(
                'DcmDspDidControl',
                `${didPrefix}/DcmDspDidInfo/DcmDspDidControl`,
                [],
                [
                  p(
                    'DcmDspDidFreezeCurrentState',
                    `${didPrefix}/DcmDspDidInfo/DcmDspDidControl/DcmDspDidFreezeCurrentState`,
                    'boolean',
                    true,
                  ),
                  p(
                    'DcmDspDidResetToDefault',
                    `${didPrefix}/DcmDspDidInfo/DcmDspDidControl/DcmDspDidResetToDefault`,
                    'boolean',
                    true,
                  ),
                  p(
                    'DcmDspDidShortTermAdjustment',
                    `${didPrefix}/DcmDspDidInfo/DcmDspDidControl/DcmDspDidShortTermAdjustment`,
                    'boolean',
                    true,
                  ),
                  p(
                    'DcmDspDidControlMask',
                    `${didPrefix}/DcmDspDidInfo/DcmDspDidControl/DcmDspDidControlMask`,
                    'enumeration',
                    'DCM_CONTROLMASK_NO',
                  ),
                ],
              ),
            ],
            [
              p(
                'DcmDspDidDynamicallyDefined',
                `${didPrefix}/DcmDspDidInfo/DcmDspDidDynamicallyDefined`,
                'boolean',
                false,
              ),
            ],
          ),
          c(
            'DcmDspData',
            `${didPrefix}/DcmDspData`,
            [],
            [
              p(
                'DcmDspDataType',
                `${didPrefix}/DcmDspData/DcmDspDataType`,
                'enumeration',
                'UINT8',
                ['BOOLEAN', 'UINT8', 'UINT16', 'UINT32'],
              ),
              p('DcmDspDataByteSize', `${didPrefix}/DcmDspData/DcmDspDataByteSize`, 'integer', 0),
              p(
                'DcmDspDataUsePort',
                `${didPrefix}/DcmDspData/DcmDspDataUsePort`,
                'enumeration',
                'USE_DATA_SYNCH_CLIENT_SERVER',
              ),
            ],
          ),
          c('DcmDspSession', `${didPrefix}/DcmDspSession`, [
            c(
              'DcmDspSessionRow',
              `${didPrefix}/DcmDspSession/DcmDspSessionRow`,
              [],
              [
                p(
                  'DcmDspSessionLevel',
                  `${didPrefix}/DcmDspSession/DcmDspSessionRow/DcmDspSessionLevel`,
                  'integer',
                  0,
                ),
                p(
                  'DcmDspSessionP2ServerMax',
                  `${didPrefix}/DcmDspSession/DcmDspSessionRow/DcmDspSessionP2ServerMax`,
                  'float',
                  0.05,
                ),
                p(
                  'DcmDspSessionP2StarServerMax',
                  `${didPrefix}/DcmDspSession/DcmDspSessionRow/DcmDspSessionP2StarServerMax`,
                  'float',
                  5,
                ),
                p(
                  'DcmDspSessionForBoot',
                  `${didPrefix}/DcmDspSession/DcmDspSessionRow/DcmDspSessionForBoot`,
                  'enumeration',
                  'DCM_NO_BOOT',
                ),
              ],
            ),
          ]),
          c(
            'DcmDspSecurity',
            `${didPrefix}/DcmDspSecurity`,
            [
              c(
                'DcmDspSecurityRow',
                `${didPrefix}/DcmDspSecurity/DcmDspSecurityRow`,
                [],
                [
                  p(
                    'DcmDspSecurityLevel',
                    `${didPrefix}/DcmDspSecurity/DcmDspSecurityRow/DcmDspSecurityLevel`,
                    'integer',
                    0,
                  ),
                  p(
                    'DcmDspSecuritySeedSize',
                    `${didPrefix}/DcmDspSecurity/DcmDspSecurityRow/DcmDspSecuritySeedSize`,
                    'integer',
                    4,
                  ),
                  p(
                    'DcmDspSecurityKeySize',
                    `${didPrefix}/DcmDspSecurity/DcmDspSecurityRow/DcmDspSecurityKeySize`,
                    'integer',
                    4,
                  ),
                  p(
                    'DcmDspSecurityDelayTime',
                    `${didPrefix}/DcmDspSecurity/DcmDspSecurityRow/DcmDspSecurityDelayTime`,
                    'float',
                    10,
                  ),
                  p(
                    'DcmDspSecurityDelayTimeOnBoot',
                    `${didPrefix}/DcmDspSecurity/DcmDspSecurityRow/DcmDspSecurityDelayTimeOnBoot`,
                    'float',
                    10,
                  ),
                  p(
                    'DcmDspSecurityAttemptCounterEnabled',
                    `${didPrefix}/DcmDspSecurity/DcmDspSecurityRow/DcmDspSecurityAttemptCounterEnabled`,
                    'boolean',
                    false,
                  ),
                  p(
                    'DcmDspSecurityUsePort',
                    `${didPrefix}/DcmDspSecurity/DcmDspSecurityRow/DcmDspSecurityUsePort`,
                    'enumeration',
                    'USE_ASYNCH_FNC',
                  ),
                ],
              ),
            ],
            [
              p(
                'DcmDspSecurityMaxAttemptCounterReadoutTime',
                `${didPrefix}/DcmDspSecurity/DcmDspSecurityMaxAttemptCounterReadoutTime`,
                'float',
                0,
              ),
            ],
          ),
        ]),
      ]),
    ],
    providedEntries: [],
    lowerMultiplicity: 1,
    upperMultiplicity: 1,
  };
  return buildBswmdDefIndex(new Map([['Dcm', dcm]]));
}

function service(overrides: Partial<DimService> = {}): DimService {
  return {
    odxId: '_read',
    shortName: 'ReadF186',
    serviceClass: 'ReadDataByIdentifier',
    sid: 0x22,
    request: [{ name: 'DID', semantic: 'ID', codedValue: '61830', bytePosition: 0 }],
    posResponses: [
      [
        {
          name: 'Value',
          semantic: 'VALUE',
          codedValue: '0',
          bytePosition: 0,
          dataObjectRef: 'DOP_Vbatt',
        },
      ],
    ],
    negResponseCodes: [],
    sdgAnnotations: {},
    sessionRefs: [1],
    securityRefs: [1],
    ...overrides,
  };
}

const dataObject: DimDataObject = {
  odxId: 'DOP_Vbatt',
  shortName: 'Vbatt',
  codedType: { kind: 'standard', bitLength: 16 },
  baseDataType: 'A_UINT32',
  encoding: 'NONE',
};

const dim: Dim = {
  meta: { sourcePath: 'test', modelVersion: '1.0', variant: { kind: 'BASE-VARIANT', odxId: '_v', shortName: 'Variant' } },
  services: [service()],
  dataObjects: [dataObject],
  dtcs: [],
  sessions: [{ name: 'DefaultSession', value: 1 }],
  securityLevels: [{ name: 'Level1', level: 1 }],
  warnings: [],
};

function child(name: string, parent: ArxmlContainer): ArxmlContainer | undefined {
  return parent.children.find(
    (entry): entry is ArxmlContainer => entry.kind === 'container' && entry.shortName === name,
  );
}

describe('review critical fixes', () => {
  it('creates linked Dcm DID, info, DOP data and conditional access containers', () => {
    const result = mapDcm(dim, buildDcmIndex());
    const dsp = child('DcmDsp', result.module.children[0] as ArxmlContainer)!;
    const did = child('DID_F186', dsp)!;
    const info = child('DID_F186_Info', dsp)!;
    const data = child('Vbatt', dsp)!;

    expect(did.params.DcmDspDidSize).toMatchObject({ type: 'integer', value: 2 });
    expect(did.params.DcmDspDidInfoRef).toMatchObject({
      type: 'reference',
      value: '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspDidInfo/DID_F186_Info',
    });
    expect(did.params.DcmDspDidRef).toMatchObject({
      type: 'reference',
      value: '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspData/Vbatt',
    });
    expect(data.params.DcmDspDataType).toMatchObject({ type: 'enum', value: 'UINT16' });
    expect(data.params.DcmDspDataByteSize).toMatchObject({ type: 'integer', value: 2 });
    expect(child('DID_F186_Read', info)).toBeDefined();
    expect(child('DID_F186_Read', info)?.params.DcmDspDidReadSessionRef).toMatchObject({
      type: 'reference',
    });
    expect(child('DID_F186_Write', info)).toBeUndefined();
    expect(child('DID_F186_Control', info)).toBeUndefined();
  });

  it('adds required Dcm session/security defaults', () => {
    const result = mapDcm(dim, buildDcmIndex());
    const dsp = child('DcmDsp', result.module.children[0] as ArxmlContainer)!;
    const session = child('DcmDspSession', dsp)!;
    const security = child('DcmDspSecurity', dsp)!;
    const row = child('DefaultSession', session)!;

    expect(row.params.DcmDspSessionForBoot).toMatchObject({ type: 'enum', value: 'DCM_NO_BOOT' });
    expect(security.params.DcmDspSecurityMaxAttemptCounterReadoutTime).toMatchObject({
      type: 'float',
      value: 0,
    });
    expect(result.warnings.some((warning) => warning.code === 'odx-default-param-used')).toBe(true);
  });

  it('skips BSWMD-missing parameters instead of emitting unanchored values', () => {
    const base = buildDcmIndex();
    const paramPath = new Map(base.paramPath);
    const paramDef = new Map(base.paramDef);
    paramPath.delete('DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidIdentifier');
    paramDef.delete('DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidIdentifier');
    const index = { ...base, paramPath, paramDef };
    const result = mapDcm(dim, index);
    const dsp = child('DcmDsp', result.module.children[0] as ArxmlContainer)!;
    const did = child('DID_F186', dsp)!;
    expect(did.params.DcmDspDidIdentifier).toBeUndefined();
    expect(result.warnings.some((warning) => warning.code === 'odx-bswmd-def-missing')).toBe(true);
  });

  it('links Dem events to DTCs and creates a valid operation cycle', () => {
    const prefix = '/AUTOSAR_R22/EcucDefs/Dem';
    const dem: BswModuleDef = {
      shortName: 'Dem',
      path: prefix,
      dialect: 'ecuc-module-def',
      moduleId: null,
      containers: [
        c('DemConfigSet', `${prefix}/DemConfigSet`, [
          c(
            'DemEventParameter',
            `${prefix}/DemConfigSet/DemEventParameter`,
            [],
            [p('DemEventId', `${prefix}/DemConfigSet/DemEventParameter/DemEventId`, 'integer', 0)],
            [
              r('DemDTCRef', `${prefix}/DemConfigSet/DemEventParameter/DemDTCRef`),
              r(
                'DemOperationCycleRef',
                `${prefix}/DemConfigSet/DemEventParameter/DemOperationCycleRef`,
              ),
            ],
          ),
          c(
            'DemDTC',
            `${prefix}/DemConfigSet/DemDTC`,
            [],
            [
              p('DemDtcValue', `${prefix}/DemConfigSet/DemDTC/DemDtcValue`, 'integer', 0),
              p(
                'DemDTCSeverity',
                `${prefix}/DemConfigSet/DemDTC/DemDTCSeverity`,
                'enumeration',
                null,
                ['DEM_SEVERITY_CHECK_CONTROL'],
              ),
            ],
          ),
        ]),
        c('DemGeneral', `${prefix}/DemGeneral`, [
          c(
            'DemOperationCycle',
            `${prefix}/DemGeneral/DemOperationCycle`,
            [],
            [
              p(
                'DemOperationCycleId',
                `${prefix}/DemGeneral/DemOperationCycle/DemOperationCycleId`,
                'integer',
                1,
              ),
            ],
          ),
        ]),
      ],
      providedEntries: [],
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
    };
    const result = mapDem(
      {
        ...dim,
        dtcs: [{ odxId: '_dtc', shortName: 'DTC_A', troubleCode: 1, severity: 'CHECK_CONTROL' }],
      },
      buildBswmdDefIndex(new Map([['Dem', dem]])),
    );
    const configSet = result.module.children[0] as ArxmlContainer;
    const event = child('DTC_A', child('DemEventParameter', configSet)! as ArxmlContainer)!;
    expect(event.params.DemDTCRef).toMatchObject({
      type: 'reference',
      value: '/AUTOSAR_R22/EcucDefs/Dem/DemConfigSet/DemDTC/DTC_A',
    });
    const dtc = child('DTC_A', child('DemDTC', configSet)! as ArxmlContainer)!;
    expect(dtc.params.DemDTCSeverity).toMatchObject({
      type: 'enum',
      value: 'DEM_SEVERITY_CHECK_CONTROL',
    });
    const general = result.module.children[1] as ArxmlContainer;
    const cycle = child('DemOperationCycle_1', general)!;
    expect(cycle.params.DemOperationCycleId).toMatchObject({ type: 'integer', value: 1 });
  });

  it('applies delete and child decisions without silently ignoring decisions', () => {
    const module = (children: readonly ArxmlContainer[]) => ({
      kind: 'module' as const,
      tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
      shortName: 'Dcm',
      params: {},
      children,
      references: [],
    });
    const container = (name: string, children: readonly ArxmlContainer[] = []): ArxmlContainer => ({
      kind: 'container',
      tagName: 'ECUC-CONTAINER-VALUE',
      shortName: name,
      params: {},
      children,
    });
    const existing = module([container('Config', [container('Local'), container('KeepMe')])]);
    const incoming = module([container('Config', [container('Incoming'), container('KeepMe')])]);
    const merged = mergeModuleThreeWay({
      existing,
      incoming,
      decisions: new Map([
        ['/Dcm/Config', 'keep-local'],
        ['/Dcm/Config/Local', 'delete'],
        ['/Dcm/Config/Incoming', 'import'],
      ]),
    });
    const config = merged.children[0] as ArxmlContainer;
    const names = config.children.map((child) =>
      child.kind === 'container' ? child.shortName : '',
    );
    expect(names).toEqual(['KeepMe', 'Incoming']);

    const deleted = mergeModuleThreeWay({
      existing: module([container('Config')]),
      incoming: module([container('Config')]),
      decisions: new Map([['/Dcm/Config', 'delete']]),
    });
    expect(deleted.children).toHaveLength(0);
  });
});

