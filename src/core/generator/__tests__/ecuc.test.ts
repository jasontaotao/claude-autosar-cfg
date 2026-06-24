// core/generator/__tests__/ecuc.test.ts
//
// Happy-path tests for the EcuCGenerator (Task 16). Four scenarios:
//   1. moduleShortName is "EcuC"
//   2. PreCompile variant emits exactly 2 artifacts (Cfg.h + Cfg.c)
//   3. Mixed (PreCompile + PostBuild) variant emits 3 artifacts
//      (adds EcuC_PBcfg.c)
//   4. Throws when the BSWMD module def is undefined
//
// The fixtures live in `test-fixtures/ecuc.ts` and are hand-typed TS
// constants — ARXML parsing is out of MVP scope per the Task 16 brief.

import { describe, it, expect, beforeEach } from 'vitest';

import { EcuCGenerator } from '../modules/ecuc.js';
import {
  _resetRegistryForTest,
  registerGenerator,
  getGenerator,
  type GenerationContext,
} from '../registry.js';
import type { Diagnostic } from '../diagnostics.js';
import {
  ecucDef,
  ecucValuesPreCompile,
  ecucValuesMixed,
  type BswmdModuleDef,
  type EcucModuleConfigurationValues,
} from './test-fixtures/ecuc.js';

function makeCtx(variant: 'PreCompile' | 'Link' | 'PostBuild'): GenerationContext {
  return {
    variant,
    bswmdIndex: new Map<string, unknown>(),
    implByModule: new Map<string, string>(),
    outDir: '/tmp',
    diagnostics: [] as Diagnostic[],
  };
}

describe('EcuCGenerator', () => {
  beforeEach(() => {
    _resetRegistryForTest();
  });

  it('is registered with moduleShortName "EcuC"', () => {
    const g = new EcuCGenerator();
    expect(g.moduleShortName).toBe('EcuC');
  });

  it('emits 2 artifacts (Cfg.c, Cfg.h) for PreCompile variant', () => {
    registerGenerator(new EcuCGenerator());
    const g = getGenerator('EcuC');
    if (!g) throw new Error('generator not registered');

    const out = g.emit(
      ecucDef as unknown as BswmdModuleDef,
      ecucValuesPreCompile as unknown as EcucModuleConfigurationValues,
      makeCtx('PreCompile'),
    );
    const paths = out.map(a => a.path).sort();
    expect(paths).toEqual(['EcuC/EcuC_Cfg.c', 'EcuC/EcuC_Cfg.h']);
  });

  it('emits 3 artifacts including PBcfg.c when any PostBuild element', () => {
    registerGenerator(new EcuCGenerator());
    const g = getGenerator('EcuC');
    if (!g) throw new Error('generator not registered');

    const out = g.emit(
      ecucDef as unknown as BswmdModuleDef,
      ecucValuesMixed as unknown as EcucModuleConfigurationValues,
      makeCtx('PreCompile'),
    );
    const paths = out.map(a => a.path).sort();
    expect(paths).toEqual([
      'EcuC/EcuC_Cfg.c',
      'EcuC/EcuC_Cfg.h',
      'EcuC/EcuC_PBcfg.c',
    ]);
  });

  it('throws on undefined module def (sanity)', () => {
    const g = new EcuCGenerator();
    expect(() =>
      g.emit(
        undefined as never,
        ecucValuesPreCompile as unknown as EcucModuleConfigurationValues,
        makeCtx('PreCompile'),
      ),
    ).toThrow();
  });
});
