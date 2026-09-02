import { describe, expect, it } from 'vitest';

import type { BswModuleDef, ContainerDef } from '../../project/bswmd/types.js';
import type { Dim } from '../dim.js';
import { buildBswmdDefIndex } from '../bswmdDefIndex.js';
import { mapDimToEcuc } from '../mapDimToEcuc.js';

function module(shortName: string): BswModuleDef {
  const container: ContainerDef = {
    shortName: `${shortName}ConfigSet`,
    path: `/AUTOSAR_R22/EcucDefs/${shortName}/${shortName}ConfigSet`,
    lowerMultiplicity: 1,
    upperMultiplicity: 1,
    subContainers: [],
    parameters: [],
    references: [],
    choices: [],
  };
  return {
    shortName,
    path: `/AUTOSAR_R22/EcucDefs/${shortName}`,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [container],
    providedEntries: [],
    lowerMultiplicity: 1,
    upperMultiplicity: 1,
  };
}

const emptyIndex = {
  containerPath: new Map(),
  paramPath: new Map(),
  refPath: new Map(),
  paramDef: new Map(),
};
const index = buildBswmdDefIndex(
  new Map([
    ['Dcm', module('Dcm')],
    ['Dem', module('Dem')],
  ]),
);
const dim: Dim = {
  meta: {
    sourcePath: 'test',
    modelVersion: '1.0',
    variant: { kind: 'BASE-VARIANT', odxId: '_v', shortName: 'Variant' },
  },
  services: [],
  dataObjects: [],
  dtcs: [],
  sessions: [],
  securityLevels: [],
  warnings: [],
};

describe('mapDimToEcuc', () => {
  it('always produces Dcm and Dem modules deterministically', () => {
    const result = mapDimToEcuc({ dim, bswmdIndex: index });
    expect(result.modules.map((module) => module.shortName)).toEqual(['Dcm', 'Dem']);
    expect(JSON.stringify(mapDimToEcuc({ dim, bswmdIndex: index }).modules)).toEqual(
      JSON.stringify(mapDimToEcuc({ dim, bswmdIndex: index }).modules),
    );
  });

  it('throws when either BSWMD spine is unavailable', () => {
    expect(() => mapDimToEcuc({ dim, bswmdIndex: emptyIndex })).toThrowError(
      /odx-bswmd-not-loaded/,
    );
  });
});
