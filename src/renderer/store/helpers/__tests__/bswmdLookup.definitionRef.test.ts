import { describe, expect, it } from 'vitest';

import type { BswmdDocument, BswModuleDef, ContainerDef } from '@core/project/bswmd.js';

import { resolveContainerDefinitionContext } from '../bswmdLookup.js';

function container(
  shortName: string,
  path: string,
  subContainers: readonly ContainerDef[] = [],
): ContainerDef {
  return {
    shortName,
    path,
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    subContainers: [...subContainers],
    parameters: [],
    references: [],
    choices: [],
  };
}

const validSet = container('ValidSet', '/Schema/JWQ3399/JWQ3399ConfigSet/ValidSet');
const configSet = container(
  '/Schema/JWQ3399/JWQ3399ConfigSet'.split('/').at(-1)!,
  '/Schema/JWQ3399/JWQ3399ConfigSet',
  [validSet],
);
const moduleDef: BswModuleDef = {
  shortName: 'JWQ3399',
  path: '/Schema/JWQ3399',
  dialect: 'ecuc-module-def',
  moduleId: null,
  containers: [configSet],
  providedEntries: [],
  lowerMultiplicity: 1,
  upperMultiplicity: 1,
};
const schemas: readonly BswmdDocument[] = [{ version: '4.6', modules: [moduleDef], warnings: [] }];

describe('resolveContainerDefinitionContext', () => {
  it('prefers definition identity over a custom ECUC instance short name', () => {
    const hit = resolveContainerDefinitionContext(
      schemas,
      '/JWQ3399/JWQ3399ConfigSet/FrontValidSet',
      '/Schema/JWQ3399/JWQ3399ConfigSet/ValidSet',
    );
    expect(hit?.moduleDef).toBe(moduleDef);
    expect(hit?.parentContainerDef).toBe(validSet);
  });

  it('falls back to path lookup when definition ref is undefined', () => {
    const hit = resolveContainerDefinitionContext(schemas, '/JWQ3399/JWQ3399ConfigSet', undefined);
    expect(hit?.parentContainerDef).toBe(configSet);
  });

  it('falls back to path lookup when a stale definition ref cannot resolve', () => {
    const hit = resolveContainerDefinitionContext(
      schemas,
      '/JWQ3399/JWQ3399ConfigSet',
      '/Schema/JWQ3399/Removed',
    );
    expect(hit?.parentContainerDef).toBe(configSet);
  });
});
