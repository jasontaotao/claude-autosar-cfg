import { describe, expect, it } from 'vitest';

import { assertDefinitionRefsResolve } from '../assertDefinitionRefsResolve.js';
import type { BswModuleDef, ContainerDef } from '../../project/bswmd/types.js';

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

const dcmBswmd: BswModuleDef = {
  shortName: 'Dcm',
  path: '/AUTOSAR/Dcm',
  dialect: 'ecuc-module-def',
  moduleId: null,
  containers: [
    container('DcmDspDid', '/AUTOSAR/Dcm/DcmDspDid', {
      parameters: [{
        shortName: 'DcmDspDidIdentifier',
        path: '/AUTOSAR/Dcm/DcmDspDid/DcmDspDidIdentifier',
        kind: 'integer',
        defaultValue: null,
        minValue: null,
        maxValue: null,
        minLength: null,
        maxLength: null,
        enumerationLiterals: [],
      }],
    }),
  ],
  providedEntries: [],
  lowerMultiplicity: 1,
  upperMultiplicity: 1,
};

describe('assertDefinitionRefsResolve', () => {
  it('returns no unresolved refs when every generated ref is known', () => {
    const xml = `
      <DEFINITION-REF DEST="ECUC-MODULE-DEF">/AUTOSAR/Dcm</DEFINITION-REF>
      <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/AUTOSAR/Dcm/DcmDspDid</DEFINITION-REF>
      <DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/AUTOSAR/Dcm/DcmDspDid/DcmDspDidIdentifier</DEFINITION-REF>
    `;
    expect(assertDefinitionRefsResolve(xml, new Map([['Dcm', dcmBswmd]]))).toEqual([]);
  });

  it('returns the unresolved refs for a hand-broken document', () => {
    const xml = `
      <DEFINITION-REF DEST="ECUC-MODULE-DEF">/AUTOSAR/Dcm</DEFINITION-REF>
      <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/Invented/Root/Missing</DEFINITION-REF>
    `;
    expect(assertDefinitionRefsResolve(xml, new Map([['Dcm', dcmBswmd]]))).toEqual([
      '/Invented/Root/Missing',
    ]);
  });
});
