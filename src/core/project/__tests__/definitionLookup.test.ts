import { describe, expect, it } from 'vitest';

import type { BswmdDocument, BswModuleDef, ContainerDef } from '@core/project/bswmd.js';
import { findContainerDefByDefinitionRef } from '@core/project/bswmd.js';

function container(shortName: string, path: string): ContainerDef {
  return {
    shortName,
    path,
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    subContainers: [],
    parameters: [],
    references: [],
    choices: [],
  };
}

function module(containers: readonly ContainerDef[]): BswModuleDef {
  return {
    shortName: 'JWQ3399',
    path: '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399',
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers,
    providedEntries: [],
    lowerMultiplicity: 1,
    upperMultiplicity: 1,
  };
}

const child = container(
  'JWQ3399AFECellValidSet',
  '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet/JWQ3399AFECellValidSet',
);
const configSet = {
  ...container('JWQ3399ConfigSet', '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet'),
  subContainers: [child],
};
const schema: BswmdDocument = {
  version: '4.6',
  modules: [module([configSet])],
  warnings: [],
};

describe('findContainerDefByDefinitionRef', () => {
  it('resolves a nested container definition without using the value instance short name', () => {
    const hit = findContainerDefByDefinitionRef(
      [schema],
      '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet/JWQ3399AFECellValidSet',
    );
    expect(hit?.moduleDef.shortName).toBe('JWQ3399');
    expect(hit?.containerDef).toBe(child);
  });

  it('normalizes a definition ref without a leading slash', () => {
    const hit = findContainerDefByDefinitionRef(
      [schema],
      'JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet/JWQ3399AFECellValidSet',
    );
    expect(hit?.containerDef).toBe(child);
  });

  it('returns null for an empty definition ref', () => {
    expect(findContainerDefByDefinitionRef([schema], '')).toBeNull();
  });

  it('returns null when no definition path matches', () => {
    expect(
      findContainerDefByDefinitionRef(
        [schema],
        '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet/NotADefinedContainer',
      ),
    ).toBeNull();
  });
});
