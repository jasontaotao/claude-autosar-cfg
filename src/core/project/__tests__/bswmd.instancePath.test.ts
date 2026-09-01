import { describe, expect, it } from 'vitest';

import type { BswModuleDef, ContainerDef } from '@core/project/bswmd.js';
import { getContainerDefByPath } from '@core/project/bswmd.js';

function container(shortName: string, subContainers: readonly ContainerDef[] = []): ContainerDef {
  return {
    shortName,
    path: `/Schema/${shortName}`,
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    subContainers: [...subContainers],
    parameters: [],
    references: [],
    choices: [],
  };
}

function module(containers: readonly ContainerDef[]): BswModuleDef {
  return {
    shortName: 'JWQ3399',
    path: '/Schema/JWQ3399',
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [...containers],
    providedEntries: [],
    lowerMultiplicity: 1,
    upperMultiplicity: 1,
  };
}

describe('getContainerDefByPath — multi-instance short names', () => {
  it('maps an auto-suffixed value instance back to its unsuffixed definition', () => {
    const mod = module([container('JWQ3399AFECellValidSet')]);
    expect(getContainerDefByPath(mod, 'JWQ3399AFECellValidSet_1')?.path).toBe(
      '/Schema/JWQ3399AFECellValidSet',
    );
  });

  it('maps nested auto-suffixed instances back to their definitions', () => {
    const mod = module([container('Parent', [container('Child')])]);
    expect(getContainerDefByPath(mod, 'Parent_2/Child_3')?.path).toBe('/Schema/Child');
  });

  it('keeps an explicitly declared suffixed definition more specific than the base fallback', () => {
    const explicit = container('Cell_1');
    const base = container('Cell');
    const mod = module([container('Parent', [explicit, base])]);
    expect(getContainerDefByPath(mod, 'Parent/Cell_1')).toBe(explicit);
  });

  it('still returns null for an unrelated suffix-like name', () => {
    const mod = module([container('Cell')]);
    expect(getContainerDefByPath(mod, 'Controller_1')).toBeNull();
  });
});
