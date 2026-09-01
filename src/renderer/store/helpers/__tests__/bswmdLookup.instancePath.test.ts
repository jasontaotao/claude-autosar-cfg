import { describe, expect, it } from 'vitest';

import type { BswmdDocument, ContainerDef } from '@core/project/bswmd.js';

import { resolveContainerDefBySubPath, resolveModuleAndParentContainer } from '../bswmdLookup.js';

function container(shortName: string, subContainers: readonly ContainerDef[] = []): ContainerDef {
  return {
    shortName,
    path: `/Schema/JWQ3399/${shortName}`,
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    subContainers: [...subContainers],
    parameters: [],
    references: [],
    choices: [],
  };
}

const configSet = container('JWQ3399ConfigSet', [
  container('JWQ3399AFECellValidSet'),
  container('JWQ3399AFETempValidSet'),
]);
const schema: BswmdDocument = {
  version: '4.6',
  modules: [
    {
      shortName: 'JWQ3399',
      path: '/Schema/JWQ3399',
      dialect: 'ecuc-module-def',
      moduleId: null,
      containers: [configSet],
      providedEntries: [],
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
    },
  ],
  warnings: [],
};

describe('BSWMD lookup — auto-suffixed container instances', () => {
  it('resolves a suffixed collection member back to its unsuffixed definition', () => {
    expect(
      resolveContainerDefBySubPath(schema.modules[0]!, 'JWQ3399ConfigSet/JWQ3399AFECellValidSet_1')
        ?.shortName,
    ).toBe('JWQ3399AFECellValidSet');
  });

  it('resolves the parent container for a suffixed collection member path', () => {
    const lookup = resolveModuleAndParentContainer(
      [schema],
      '/JWQ3399/JWQ3399ConfigSet/JWQ3399AFECellValidSet_1',
    );
    expect(lookup?.moduleDef.shortName).toBe('JWQ3399');
    expect(lookup?.parentContainerDef?.shortName).toBe('JWQ3399AFECellValidSet');
  });
});
