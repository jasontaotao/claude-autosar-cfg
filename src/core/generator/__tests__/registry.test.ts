import { describe, it, expect, beforeEach } from 'vitest';

import {
  registerGenerator,
  getGenerator,
  _resetRegistryForTest,
  type ModuleGenerator,
  type GeneratedArtifact,
} from '../registry.js';

class StubGen implements ModuleGenerator {
  readonly moduleShortName: string;
  constructor(name: string) {
    this.moduleShortName = name;
  }
  emit(): readonly GeneratedArtifact[] {
    return [];
  }
}

beforeEach(() => {
  _resetRegistryForTest();
});

describe('registerGenerator / getGenerator', () => {
  it('registers and retrieves a generator by shortName', () => {
    registerGenerator(new StubGen('EcuC'));
    const g = getGenerator('EcuC');
    expect(g).toBeDefined();
    expect(g!.moduleShortName).toBe('EcuC');
  });

  it('returns undefined for unknown shortName', () => {
    expect(getGenerator('NotRegistered')).toBeUndefined();
  });

  it('throws when registering duplicate shortName', () => {
    registerGenerator(new StubGen('Dup'));
    expect(() => registerGenerator(new StubGen('Dup'))).toThrow(/already registered/);
  });
});
