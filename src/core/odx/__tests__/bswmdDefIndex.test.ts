import { describe, expect, it } from 'vitest';

import type { BswModuleDef, ContainerDef, ParamDef } from '../../project/bswmd/types.js';
import { buildBswmdDefIndex } from '../bswmdDefIndex.js';

function param(shortName: string, path: string): ParamDef {
  return {
    shortName,
    path,
    kind: 'integer',
    defaultValue: 0,
    minValue: null,
    maxValue: null,
    minLength: null,
    maxLength: null,
    enumerationLiterals: [],
  };
}

function container(
  shortName: string,
  path: string,
  subContainers: readonly ContainerDef[] = [],
  parameters: readonly ParamDef[] = [],
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

function module(
  shortName: string,
  path: string,
  containers: readonly ContainerDef[],
): BswModuleDef {
  return {
    shortName,
    path,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers,
    providedEntries: [],
    lowerMultiplicity: 1,
    upperMultiplicity: 1,
  };
}

describe('buildBswmdDefIndex', () => {
  it('keys containers and parameters by their spine after the module prefix', () => {
    const dcm = module('Dcm', '/AUTOSAR_R22/EcucDefs/Dcm', [
      container('DcmConfigSet', '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet', [
        container('DcmDsp', '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp', [
          container(
            'DcmDspDid',
            '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspDid',
            [],
            [
              param(
                'DcmDspDidIdentifier',
                '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidIdentifier',
              ),
            ],
          ),
        ]),
      ]),
    ]);

    const index = buildBswmdDefIndex(new Map([['Dcm', dcm]]));
    const key = 'DcmConfigSet/DcmDsp/DcmDspDid';

    expect(index.containerPath.get(key)).toBe(
      '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspDid',
    );
    expect(index.paramPath.get(`${key}/DcmDspDidIdentifier`)).toBe(
      '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidIdentifier',
    );
    expect(index.paramDef.get(`${key}/DcmDspDidIdentifier`)?.shortName).toBe('DcmDspDidIdentifier');
  });

  it('does not overwrite same-named leaf containers under different spines', () => {
    const containerDef = container('Leaf', '/AUTOSAR_R22/EcucDefs/Dcm/Parent/Leaf');
    const sibling = container('Leaf', '/AUTOSAR_R22/EcucDefs/Dcm/Other/Leaf');
    const dcm = module('Dcm', '/AUTOSAR_R22/EcucDefs/Dcm', [
      container('Parent', '/AUTOSAR_R22/EcucDefs/Dcm/Parent', [containerDef]),
      container('Other', '/AUTOSAR_R22/EcucDefs/Dcm/Other', [sibling]),
    ]);
    const index = buildBswmdDefIndex(new Map([['Dcm', dcm]]));

    expect(index.containerPath.get('Parent/Leaf')).toBe(containerDef.path);
    expect(index.containerPath.get('Other/Leaf')).toBe(sibling.path);
  });
});
