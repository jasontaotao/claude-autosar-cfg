import { describe, expect, it } from 'vitest';

import type { BswModuleDef, ContainerDef, ReferenceDef } from '../../project/bswmd/types.js';
import { buildDbcBswmdDefIndex } from '../bswmdDefIndex.js';

const reference: ReferenceDef = {
  shortName: 'PduRDestPduRef',
  path: '/AUTOSAR_R22/EcucDefs/PduR/PduRRoutingPaths/PduRRoutingPath/PduRDestPdu/PduRDestPduRef',
  destKind: 'ECUC-CONTAINER-VALUE',
  lowerMultiplicity: 0,
  upperMultiplicity: 1,
};

const destContainer: ContainerDef = {
  shortName: 'PduRDestPdu',
  path: '/AUTOSAR_R22/EcucDefs/PduR/PduRRoutingPaths/PduRRoutingPath/PduRDestPdu',
  lowerMultiplicity: 0,
  upperMultiplicity: 'infinite',
  subContainers: [],
  parameters: [],
  references: [reference],
  choices: [],
};

const routingPath: ContainerDef = {
  shortName: 'PduRRoutingPath',
  path: '/AUTOSAR_R22/EcucDefs/PduR/PduRRoutingPaths/PduRRoutingPath',
  lowerMultiplicity: 0,
  upperMultiplicity: 'infinite',
  subContainers: [destContainer],
  parameters: [],
  references: [],
  choices: [],
};

const routingPaths: ContainerDef = {
  shortName: 'PduRRoutingPaths',
  path: '/AUTOSAR_R22/EcucDefs/PduR/PduRRoutingPaths',
  lowerMultiplicity: 1,
  upperMultiplicity: 1,
  subContainers: [routingPath],
  parameters: [],
  references: [],
  choices: [],
};

const pduR: BswModuleDef = {
  shortName: 'PduR',
  path: '/AUTOSAR_R22/EcucDefs/PduR',
  dialect: 'ecuc-module-def',
  moduleId: null,
  containers: [routingPaths],
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

describe('buildDbcBswmdDefIndex', () => {
  it('uses module-relative spine keys and indexes reference definitions', () => {
    const index = buildDbcBswmdDefIndex(
      new Map([
        ['Com', emptyModule('Com')],
        ['CanIf', emptyModule('CanIf')],
        ['PduR', pduR],
      ]),
    );
    const moduleIndex = index.PduR;
    expect(moduleIndex.moduleShortName).toBe('PduR');
    expect(moduleIndex.containerPath.get('PduRRoutingPaths/PduRRoutingPath/PduRDestPdu')).toBe(
      destContainer.path,
    );
    expect(
      moduleIndex.referenceDef.get('PduRRoutingPaths/PduRRoutingPath/PduRDestPdu/PduRDestPduRef')
        ?.destKind,
    ).toBe('ECUC-CONTAINER-VALUE');
  });
});
