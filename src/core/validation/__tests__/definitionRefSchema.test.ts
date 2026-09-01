import { describe, expect, it } from 'vitest';

import type { ArxmlContainer, ArxmlDocument, ArxmlPackage } from '@core/arxml/types.js';
import type { BswModuleDef, BswmdDocument, ContainerDef } from '@core/project/bswmd.js';

import { buildSchemaLayer } from '../runtimeSchema.js';
import { validateProject } from '../validate/index.js';

const definitionPath = '/EcucDefs/Can/ValidSet';

const containerDef: ContainerDef = {
  shortName: 'ValidSet',
  path: definitionPath,
  lowerMultiplicity: 2,
  upperMultiplicity: 2,
  subContainers: [],
  parameters: [],
  references: [],
  choices: [],
};

const moduleDef: BswModuleDef = {
  shortName: 'Can',
  path: '/EcucDefs/Can',
  dialect: 'ecuc-module-def',
  moduleId: 1,
  containers: [containerDef],
  providedEntries: [],
  lowerMultiplicity: 1,
  upperMultiplicity: 1,
};

const schema: BswmdDocument = {
  version: '4.6',
  modules: [moduleDef],
  warnings: [],
};

function makeDoc(): ArxmlDocument {
  const child: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'FrontValidSet',
    definitionRef: definitionPath,
    params: {},
    children: [],
  };
  const pkg: ArxmlPackage = {
    shortName: 'EcucDefs',
    path: '/EcucDefs',
    elements: [
      {
        kind: 'module',
        tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
        shortName: 'Can',
        params: {},
        children: [child],
        references: [],
      },
    ],
  };
  return { path: '/EcucDefs', version: '4.6', packages: [pkg] };
}

describe('validation with custom ECUC instance names', () => {
  it('resolves container multiplicity by definition-ref instead of instance path', () => {
    const layer = buildSchemaLayer([schema]);
    const errors = validateProject([makeDoc()], layer);

    expect(errors.filter((error) => error.kind === 'schema-unknown')).toEqual([]);
    expect(errors).toEqual([
      expect.objectContaining({
        kind: 'multiplicity',
        path: '/EcucDefs/Can/FrontValidSet',
        expected: '>= 2',
        actual: '1',
      }),
    ]);
  });
});
