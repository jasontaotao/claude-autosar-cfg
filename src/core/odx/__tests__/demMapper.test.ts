import { describe, expect, it } from 'vitest';

import type { ArxmlContainer } from '../../arxml/types.js';
import type { BswModuleDef, ContainerDef, ParamDef } from '../../project/bswmd/types.js';
import type { Dim } from '../dim.js';
import { buildBswmdDefIndex } from '../bswmdDefIndex.js';
import { mapDem } from '../demMapper.js';

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

const dem: BswModuleDef = {
  shortName: 'Dem',
  path: '/AUTOSAR_R22/EcucDefs/Dem',
  dialect: 'ecuc-module-def',
  moduleId: null,
  containers: [
    c('DemConfigSet', '/AUTOSAR_R22/EcucDefs/Dem/DemConfigSet', [
      c(
        'DemEventParameter',
        '/AUTOSAR_R22/EcucDefs/Dem/DemConfigSet/DemEventParameter',
        [],
        [
          p(
            'DemEventId',
            '/AUTOSAR_R22/EcucDefs/Dem/DemConfigSet/DemEventParameter/DemEventId',
            'integer',
            0,
          ),
        ],
      ),
      c(
        'DemDTC',
        '/AUTOSAR_R22/EcucDefs/Dem/DemConfigSet/DemDTC',
        [],
        [
          p(
            'DemDtcValue',
            '/AUTOSAR_R22/EcucDefs/Dem/DemConfigSet/DemDTC/DemDtcValue',
            'integer',
            0,
          ),
        ],
      ),
    ]),
    c('DemGeneral', '/AUTOSAR_R22/EcucDefs/Dem/DemGeneral', [
      c('DemOperationCycle', '/AUTOSAR_R22/EcucDefs/Dem/DemGeneral/DemOperationCycle'),
    ]),
  ],
  providedEntries: [],
  lowerMultiplicity: 1,
  upperMultiplicity: 1,
};

describe('mapDem', () => {
  it('maps each DTC to an event/DTC pair with deterministic event ids', () => {
    const dim: Dim = {
      meta: {
        sourcePath: 'test',
        modelVersion: '1.0',
        variant: { kind: 'BASE-VARIANT', odxId: '_v' },
      },
      services: [],
      dataObjects: [],
      dtcs: [
        { odxId: '_dtc2', shortName: 'DTC_B', troubleCode: 2 },
        { odxId: '_dtc1', shortName: 'DTC_A', troubleCode: 1 },
      ],
      sessions: [],
      securityLevels: [],
      warnings: [],
    };
    const result = mapDem(dim, buildBswmdDefIndex(new Map([['Dem', dem]])));
    const configSet = result.module.children.find(
      (child): child is ArxmlContainer =>
        child.kind === 'container' && child.shortName === 'DemConfigSet',
    )!;
    const events = configSet.children.find(
      (child): child is ArxmlContainer =>
        child.kind === 'container' && child.shortName === 'DemEventParameter',
    )!;
    const dtcs = configSet.children.find(
      (child): child is ArxmlContainer =>
        child.kind === 'container' && child.shortName === 'DemDTC',
    )!;

    expect(
      events.children.map((child) =>
        child.kind === 'container' ? child.params.DemEventId?.value : undefined,
      ),
    ).toEqual([1, 2]);
    expect(
      dtcs.children.map((child) =>
        child.kind === 'container' ? child.params.DemDtcValue?.value : undefined,
      ),
    ).toEqual([1, 2]);
  });
});
