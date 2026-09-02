import { describe, expect, it } from 'vitest';

import type { ArxmlContainer } from '../../arxml/types.js';
import type { BswModuleDef, ContainerDef, ParamDef } from '../../project/bswmd/types.js';
import type { BswmdDefIndex } from '../bswmdDefIndex.js';
import type { Dim, DimService } from '../dim.js';
import { buildBswmdDefIndex } from '../bswmdDefIndex.js';
import { mapDcm } from '../dcmMapper.js';

function p(
  shortName: string,
  path: string,
  kind: ParamDef['kind'],
  defaultValue: ParamDef['defaultValue'],
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
    enumerationLiterals: [],
  };
}

function c(
  shortName: string,
  path: string,
  children: readonly ContainerDef[] = [],
  parameters: readonly ParamDef[] = [],
): ContainerDef {
  return {
    shortName,
    path,
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    subContainers: children,
    parameters,
    references: [],
    choices: [],
  };
}

function service(overrides: Partial<DimService>): DimService {
  return {
    odxId: overrides.odxId ?? '_svc',
    shortName: overrides.shortName ?? 'Service',
    serviceClass: overrides.serviceClass ?? 'ReadDataByIdentifier',
    sid: overrides.sid ?? 0x22,
    request: overrides.request ?? [
      { name: 'SID', semantic: 'SERVICE-ID', codedValue: '34', bytePosition: 0 },
      { name: 'DID', semantic: 'ID', codedValue: '0xF186', bytePosition: 1 },
    ],
    posResponses: overrides.posResponses ?? [],
    negResponseCodes: overrides.negResponseCodes ?? [],
    sdgAnnotations: overrides.sdgAnnotations ?? {},
    sessionRefs: overrides.sessionRefs ?? [],
    securityRefs: overrides.securityRefs ?? [],
  };
}

function buildIndex(): BswmdDefIndex {
  const didParams = [
    p('DcmDspDidUsed', '/Dcm/DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidUsed', 'boolean', true),
    p(
      'DcmDspDidIdentifier',
      '/Dcm/DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidIdentifier',
      'integer',
      0,
    ),
    p(
      'DcmDspDidUsePort',
      '/Dcm/DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidUsePort',
      'enumeration',
      'USE_DATA_ELEMENT_SPECIFIC_INTERFACES',
    ),
  ];
  const dcm: BswModuleDef = {
    shortName: 'Dcm',
    path: '/AUTOSAR_R22/EcucDefs/Dcm',
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [
      c('DcmConfigSet', '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet', [
        c('DcmDsp', '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp', [
          c('DcmDspDid', '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspDid', [], didParams),
          c('DcmDspDidInfo', '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspDidInfo'),
          c('DcmDspData', '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspData'),
          c(
            'DcmDspRoutine',
            '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspRoutine',
            [],
            [
              p(
                'DcmDspRoutineUsed',
                '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspRoutine/DcmDspRoutineUsed',
                'boolean',
                true,
              ),
              p(
                'DcmDspRoutineUsePort',
                '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspRoutine/DcmDspRoutineUsePort',
                'boolean',
                true,
              ),
              p(
                'DcmDspRoutineIdentifier',
                '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspRoutine/DcmDspRoutineIdentifier',
                'integer',
                0,
              ),
              p(
                'DcmDspRoutineFncSignature',
                '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspRoutine/DcmDspRoutineFncSignature',
                'enumeration',
                'ROUTINE_FNC_NORMAL',
              ),
            ],
          ),
          c('DcmDspSession', '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspSession', [
            c(
              'DcmDspSessionRow',
              '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspSession/DcmDspSessionRow',
            ),
          ]),
          c('DcmDspSecurity', '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspSecurity', [
            c(
              'DcmDspSecurityRow',
              '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspSecurity/DcmDspSecurityRow',
            ),
          ]),
          c('DcmDspClearDTC', '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspClearDTC'),
          c('DcmDspComControl', '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspComControl'),
          c(
            'DcmDspControlDTCSetting',
            '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspControlDTCSetting',
          ),
          c('DcmDspEcuReset', '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspEcuReset', [
            c(
              'DcmDspEcuResetRow',
              '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspEcuReset/DcmDspEcuResetRow',
            ),
          ]),
        ]),
        c('DcmDsd', '/AUTOSAR_R22/EcucDefs/Dcm/DcmDsd', [
          c('DcmDsdServiceTable', '/AUTOSAR_R22/EcucDefs/Dcm/DcmDsd/DcmDsdServiceTable', [
            c('DcmDsdService', '/AUTOSAR_R22/EcucDefs/Dcm/DcmDsd/DcmDsdServiceTable/DcmDsdService'),
          ]),
        ]),
      ]),
    ],
    providedEntries: [],
    lowerMultiplicity: 1,
    upperMultiplicity: 1,
  };
  return buildBswmdDefIndex(new Map([['Dcm', dcm]]));
}

function containers(element: ArxmlContainer): ArxmlContainer[] {
  return element.children.flatMap((child) => (child.kind === 'container' ? [child] : []));
}

describe('mapDcm', () => {
  it('pools DID services and creates one service row per SID', () => {
    const dim: Dim = {
      meta: {
        sourcePath: 'test',
        modelVersion: '1.0',
        variant: { kind: 'BASE-VARIANT', odxId: '_v', shortName: 'Variant' },
      },
      services: [
        service({ odxId: '_read', shortName: 'ReadF186', sid: 0x22 }),
        service({
          odxId: '_write',
          shortName: 'WriteF186',
          sid: 0x2e,
          request: [
            { name: 'SID', semantic: 'SERVICE-ID', codedValue: '46', bytePosition: 0 },
            { name: 'DID', semantic: 'ID', codedValue: '61830', bytePosition: 1 },
          ],
        }),
      ],
      dataObjects: [],
      dtcs: [],
      sessions: [{ name: 'DefaultSession', value: 1 }],
      securityLevels: [{ name: 'Level1', level: 1 }],
      warnings: [],
    };
    const result = mapDcm(dim, buildIndex());
    const configSet = result.module.children.find(
      (child): child is ArxmlContainer =>
        child.kind === 'container' && child.shortName === 'DcmConfigSet',
    )!;
    const dsp = containers(configSet).find((child) => child.shortName === 'DcmDsp')!;
    const did = containers(dsp).find(
      (child) => child.definitionRef?.endsWith('/DcmDspDid') && child.shortName === 'DID_F186',
    );

    expect(did?.params.DcmDspDidIdentifier).toMatchObject({ type: 'integer', value: 0xf186 });
    expect(
      result.warnings.some(
        (warning) =>
          warning.code === 'odx-bswmd-def-missing' &&
          warning.elementRef.endsWith('DcmDspDidIdentifier'),
      ),
    ).toBe(false);
  });

  it('creates session/security shells and warns for unmapped memory services and unknown services', () => {
    const dim: Dim = {
      meta: {
        sourcePath: 'test',
        modelVersion: '1.0',
        variant: { kind: 'BASE-VARIANT', odxId: '_v', shortName: 'Variant' },
      },
      services: [
        service({
          odxId: '_memory',
          shortName: 'Download',
          serviceClass: 'RequestDownload',
          sid: 0x34,
        }),
        service({ odxId: '_unknown', shortName: 'Unknown', serviceClass: 'Unknown', sid: 0xff }),
      ],
      dataObjects: [],
      dtcs: [],
      sessions: [{ name: 'DefaultSession', value: 1 }],
      securityLevels: [{ name: 'Level1', level: 1, seedBytes: 4, keyBytes: 4 }],
      warnings: [],
    };
    const result = mapDcm(dim, buildIndex());
    const configSet = result.module.children.find(
      (child): child is ArxmlContainer =>
        child.kind === 'container' && child.shortName === 'DcmConfigSet',
    )!;
    const dsp = containers(configSet).find((child) => child.shortName === 'DcmDsp')!;

    expect(
      containers(dsp)
        .flatMap(containers)
        .find((child) => child.definitionRef?.endsWith('/DcmDspSecurityRow')),
    ).toBeDefined();
    expect(
      result.warnings.some((warning) => warning.code === 'odx-memory-service-not-mapped'),
    ).toBe(true);
    expect(result.warnings.some((warning) => warning.code === 'odx-unknown-service-class')).toBe(
      true,
    );
  });
});

it('sorts generated routine containers by numeric identifier', () => {
  const dim: Dim = {
    meta: {
      sourcePath: 'test',
      modelVersion: '1.0',
      variant: { kind: 'BASE-VARIANT', odxId: '_v', shortName: 'Variant' },
    },
    services: [
      service({
        odxId: '_routine_2',
        shortName: 'RoutineTwo',
        serviceClass: 'RoutineControl',
        sid: 0x31,
        request: [
          { name: 'SID', semantic: 'SERVICE-ID', codedValue: '49', bytePosition: 0 },
          { name: 'RID', semantic: 'ID', codedValue: '2', bytePosition: 1 },
        ],
      }),
      service({
        odxId: '_routine_1',
        shortName: 'RoutineOne',
        serviceClass: 'RoutineControl',
        sid: 0x31,
        request: [
          { name: 'SID', semantic: 'SERVICE-ID', codedValue: '49', bytePosition: 0 },
          { name: 'RID', semantic: 'ID', codedValue: '1', bytePosition: 1 },
        ],
      }),
    ],
    dataObjects: [],
    dtcs: [],
    sessions: [{ name: 'DefaultSession', value: 1 }],
    securityLevels: [{ name: 'Level1', level: 1 }],
    warnings: [],
  };
  const result = mapDcm(dim, buildIndex());
  const dsp = containers(
    containers(result.module.children[0] as ArxmlContainer).find(
      (child) => child.shortName === 'DcmDsp',
    )!,
  );
  const identifiers = dsp
    .filter((child) => child.definitionRef?.endsWith('/DcmDspRoutine'))
    .map((child) => child.params.DcmDspRoutineIdentifier?.value);
  expect(identifiers).toEqual([1, 2]);
});
