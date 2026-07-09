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

  // v1.39.0 MINOR T5 (H2) — registerGenerator is now idempotent. The
  // previous throw-on-duplicate behavior broke the renderer's
  // "Generate" button on the second click (generate.ts:96 calls
  // `registerGenerator(new EcuCGenerator())` per invocation; tests
  // masked the throw via `_resetRegistryForTest()`). Silent overwrite
  // (delete + set) is the fix.
  it('silently overwrites on duplicate shortName (no throw, latest binding wins)', () => {
    const first = new StubGen('EcuC');
    const second = new StubGen('EcuC');
    registerGenerator(first);
    expect(() => registerGenerator(second)).not.toThrow();
    const g = getGenerator('EcuC');
    expect(g).toBe(second);
    expect(g).not.toBe(first);
  });
});
