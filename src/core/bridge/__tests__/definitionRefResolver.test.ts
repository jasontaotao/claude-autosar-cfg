import { describe, expect, it } from 'vitest';

import { resolveDefinitionRef } from '../definitionRefResolver.js';
import type { BswModuleDef, ContainerDef, ParamDef } from '../../project/bswmd/types.js';

function container(shortName: string, path: string, over: Partial<ContainerDef> = {}): ContainerDef {
  return {
    shortName,
    path,
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    subContainers: [],
    parameters: [],
    references: [],
    choices: [],
    ...over,
  };
}

function intParam(shortName: string, path: string): ParamDef {
  return {
    shortName,
    path,
    kind: 'integer',
    defaultValue: null,
    minValue: null,
    maxValue: null,
    minLength: null,
    maxLength: null,
    enumerationLiterals: [],
  };
}

const dcmDspDid = container(
  'DcmDspDid',
  '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspDid',
  {
    parameters: [
      intParam(
        'DcmDspDidIdentifier',
        '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidIdentifier',
      ),
    ],
  },
);

const dcmBswmd: BswModuleDef = {
  shortName: 'Dcm',
  path: '/AUTOSAR_R22/EcucDefs/Dcm',
  dialect: 'ecuc-module-def',
  moduleId: null,
  containers: [
    container('/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet', '', {
      shortName: 'DcmConfigSet',
      path: '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet',
      subContainers: [
        container('DcmDsp', '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp', {
          subContainers: [dcmDspDid],
        }),
      ],
    }),
  ],
  providedEntries: [],
  lowerMultiplicity: 1,
  upperMultiplicity: 1,
};

describe('resolveDefinitionRef', () => {
  it('resolves a nested container path via the BSWMD tree walk', () => {
    expect(
      resolveDefinitionRef('Dcm', ['DcmConfigSet', 'DcmDsp', 'DcmDspDid'], dcmBswmd),
    ).toBe('/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspDid');
  });

  it('resolves a parameter leaf against its owning container', () => {
    expect(
      resolveDefinitionRef(
        'Dcm',
        ['DcmConfigSet', 'DcmDsp', 'DcmDspDid', 'DcmDspDidIdentifier'],
        dcmBswmd,
      ),
    ).toBe('/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidIdentifier');
  });

  it('resolves the module itself for an empty container path', () => {
    expect(resolveDefinitionRef('Dcm', [], dcmBswmd)).toBe('/AUTOSAR_R22/EcucDefs/Dcm');
  });

  it('uses the standard R22 fallback when no BSWMD is threaded', () => {
    expect(
      resolveDefinitionRef('Dcm', ['DcmConfigSet', 'DcmDsp', 'DcmDspDid']),
    ).toBe('/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspDid');
  });

  it('falls back and reports a miss when a threaded BSWMD cannot resolve the path', () => {
    const misses: unknown[] = [];
    const ref = resolveDefinitionRef(
      'Dcm',
      ['DcmConfigSet', 'MissingContainer'],
      dcmBswmd,
      (miss) => misses.push(miss),
    );
    expect(ref).toBe('/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/MissingContainer');
    expect(misses).toEqual([
      { moduleName: 'Dcm', containerPath: ['DcmConfigSet', 'MissingContainer'] },
    ]);
  });
});
