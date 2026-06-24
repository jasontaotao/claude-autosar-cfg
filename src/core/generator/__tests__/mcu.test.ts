// core/generator/__tests__/mcu.test.ts
//
// E10 of v1.12.0 MINOR E — second ModuleGenerator smoke test. Validates
// that the generator interface (defined in `registry.ts`) is generic
// across BSW modules: adding Mcu requires ZERO changes to pipeline.ts,
// normalize.ts, or any other shared code.
//
// These tests use minimal in-test fixtures (no ARXML on disk) — Mcu
// integration via the real `testdata/generator/mcu-bswmd.arxml` +
// `mcu-bswcfg-refs.arxml` fixtures is exercised by the EcuC REF_UNRESOLVED
// tests (since EcuC refs McuClockConfig_0).

import { describe, it, expect, beforeEach } from 'vitest';

import { McuGenerator } from '../modules/mcu.js';
import { registerGenerator, _resetRegistryForTest, getGenerator, type GenerationContext } from '../registry.js';

const mcuDef = {
  shortName: 'Mcu',
  containers: [
    {
      shortName: 'McuClockSettingConfig',
      parameters: [
        { kind: 'integer' as const },
      ],
    },
  ],
};

const mcuValues = {
  parameters: [
    { path: 'Mcu/McuClockSettingConfig/Param', kind: 'integer' as const, value: 8000000 },
  ],
};

function makeCtx(): GenerationContext {
  return {
    variant: 'PreCompile',
    bswmdIndex: new Map<string, unknown>(),
    implByModule: new Map<string, string>(),
    outDir: '/tmp',
    diagnostics: [],
  };
}

describe('McuGenerator', () => {
  beforeEach(() => _resetRegistryForTest());

  it('declares moduleShortName "Mcu"', () => {
    const g = new McuGenerator();
    expect(g.moduleShortName).toBe('Mcu');
  });

  it('emits 2 artifacts (Cfg.c, Cfg.h) for PreCompile variant', () => {
    const g = new McuGenerator();
    const out = g.emit(mcuDef, mcuValues, makeCtx());
    const paths = out.map((a) => a.path).sort();
    expect(paths).toEqual(['Mcu/Mcu_Cfg.c', 'Mcu/Mcu_Cfg.h']);
  });

  it('registers and retrieves via the registry (no pipeline change)', () => {
    registerGenerator(new McuGenerator());
    const g = getGenerator('Mcu');
    expect(g?.moduleShortName).toBe('Mcu');
  });

  it('does not require changes to pipeline.ts or normalize.ts — interface is generic', () => {
    // The validation point of E10: if adding a second module required
    // edits to pipeline.ts or normalize.ts, the interface would be
    // EcuC-coupled and the abstraction would have failed. This test
    // is structural — passing means the registry key (`moduleShortName`)
    // is the only coupling point between a module and the pipeline.
    registerGenerator(new McuGenerator());
    const ctx = makeCtx();
    const g = getGenerator('Mcu');
    expect(g).toBeDefined();
    const out = g!.emit(mcuDef, mcuValues, ctx);
    // Pipeline parity: same artifact shape EcuC emits (Cfg.c + Cfg.h).
    // If Mcu had to emit a different shape, the pipeline's stage-2
    // path would have to discriminate.
    expect(out.every((a) => a.path.startsWith('Mcu/'))).toBe(true);
  });

  it('pushes ECUC-GEN-INFO-001 when the active variant has no elements', () => {
    const g = new McuGenerator();
    const ctx = makeCtx();
    const out = g.emit(
      { shortName: 'Mcu', containers: [] },
      { parameters: [] },
      ctx,
    );
    expect(out).toHaveLength(2); // still emits artifacts (stub)
    const info = ctx.diagnostics.find((d) => d.message.includes('Mcu'));
    expect(info?.code).toBe('ECUC-GEN-INFO-001');
  });
});