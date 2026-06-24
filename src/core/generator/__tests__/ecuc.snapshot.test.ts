// core/generator/__tests__/ecuc.snapshot.test.ts
//
// Byte-identical snapshot tests for the EcuC generator (Task 17).
//
// The golden files under `testdata/generator/ecuc-expected/` were
// captured by running `EcuCGenerator.emit()` once against the fixtures
// in `test-fixtures/ecuc.ts` and writing the artifacts to disk. Each
// scenario captures the generator's current output — Task 17's goal is
// regression detection (any future change to the generator that would
// alter emitted C must update the goldens deliberately).
//
// If a snapshot fails, the canonical recovery is:
//   1. Verify the generator change is intentional
//   2. Re-run the capture script (`scripts/__capture__/...`) to refresh
//      the goldens
//   3. Review the diff in the PR
//
// Notes on T16 deferred issues that the goldens currently bake in
// (intentional per "capture initial output" instruction):
//   - `shortNameFromDef()` always returns `'Param'`, so the container
//     walk emits two identical identifiers `EcuC_EcuCGeneral_Param`
//     (one per def parameter) and never matches the value paths by
//     shortName. PreCompile/Mixed/Refs Cfg.c all show this.
//   - `isPostBuild()` substring heuristic drives the PBcfg.c emission;
//     Mixed-1 fires it for `PostBuildParam`.
//   - `cTypeForKind({kind:'integer'})` with no min/max returns `uint8`,
//     so the PBcfg.c loader entry uses `uint8` instead of `uint32`.
//   - The Refs-1 fixture's `references[]` is not consumed by the
//     generator yet — its Cfg.c is byte-identical to PreCompile-1.

import { describe, it, expect, test, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EcuCGenerator } from '../modules/ecuc.js';
import { _resetRegistryForTest, registerGenerator, type GenerationContext } from '../registry.js';
import {
  ecucDef,
  ecucValuesPreCompile,
  ecucValuesMixed,
  ecucValuesRefs,
  type BswmdModuleDef,
  type EcucModuleConfigurationValues,
} from './test-fixtures/ecuc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSnap(relPath: string): string {
  return readFileSync(
    join(__dirname, '..', '..', '..', '..', 'testdata', 'generator', 'ecuc-expected', relPath),
    'utf8',
  );
}

function makeCtx(): GenerationContext {
  return {
    variant: 'PreCompile',
    bswmdIndex: new Map<string, unknown>(),
    implByModule: new Map<string, string>(),
    outDir: '/tmp',
    diagnostics: [],
  };
}

beforeAll(() => {
  _resetRegistryForTest();
  registerGenerator(new EcuCGenerator());
});

describe('EcuC snapshot', () => {
  it('PreCompile-1 Cfg.c matches', () => {
    const g = new EcuCGenerator();
    const out = g.emit(
      ecucDef as unknown as BswmdModuleDef, // type-erase: TS hand-typed fixture deliberately uses loose types
      ecucValuesPreCompile as unknown as EcucModuleConfigurationValues, // type-erase: TS hand-typed fixture deliberately uses loose types
      makeCtx(),
    );
    const c = out.find((a) => a.path === 'EcuC/EcuC_Cfg.c');
    if (!c) throw new Error('EcuC_Cfg.c missing from emit output');
    expect(c.content).toBe(readSnap('PreCompile-1/EcuC_Cfg.c'));
  });

  it('PreCompile-1 Cfg.h matches', () => {
    const g = new EcuCGenerator();
    const out = g.emit(
      ecucDef as unknown as BswmdModuleDef, // type-erase: TS hand-typed fixture deliberately uses loose types
      ecucValuesPreCompile as unknown as EcucModuleConfigurationValues, // type-erase: TS hand-typed fixture deliberately uses loose types
      makeCtx(),
    );
    const h = out.find((a) => a.path === 'EcuC/EcuC_Cfg.h');
    if (!h) throw new Error('EcuC_Cfg.h missing from emit output');
    expect(h.content).toBe(readSnap('PreCompile-1/EcuC_Cfg.h'));
  });

  it('Mixed-1 emits Cfg.c, Cfg.h, PBcfg.c (byte-identical)', () => {
    const g = new EcuCGenerator();
    const out = g.emit(
      ecucDef as unknown as BswmdModuleDef, // type-erase: TS hand-typed fixture deliberately uses loose types
      ecucValuesMixed as unknown as EcucModuleConfigurationValues, // type-erase: TS hand-typed fixture deliberately uses loose types
      makeCtx(),
    );
    for (const f of ['EcuC/EcuC_Cfg.c', 'EcuC/EcuC_Cfg.h', 'EcuC/EcuC_PBcfg.c']) {
      const a = out.find((x) => x.path === f);
      if (!a) throw new Error(`${f} missing from emit output`);
      const expectedPath = f.replace('EcuC/', 'Mixed-1/');
      expect(a.content).toBe(readSnap(expectedPath));
    }
  });

  it('Refs-1 emits Cfg.c + Cfg.h (byte-identical)', () => {
    // Note: the current generator does not consume `references[]` — the
    // Refs-1 Cfg.c is byte-identical to PreCompile-1's. The fixture
    // still serves as the regression anchor once reference emit lands.
    const g = new EcuCGenerator();
    const out = g.emit(
      ecucDef as unknown as BswmdModuleDef, // type-erase: TS hand-typed fixture deliberately uses loose types
      ecucValuesRefs as unknown as EcucModuleConfigurationValues, // type-erase: TS hand-typed fixture deliberately uses loose types
      makeCtx(),
    );
    const c = out.find((a) => a.path === 'EcuC/EcuC_Cfg.c');
    const h = out.find((a) => a.path === 'EcuC/EcuC_Cfg.h');
    if (!c || !h) throw new Error('Refs-1: missing Cfg.c or Cfg.h');
    expect(c.content).toBe(readSnap('Refs-1/EcuC_Cfg.c'));
    expect(h.content).toBe(readSnap('Refs-1/EcuC_Cfg.h'));
  });

  // TODO: once the EcuC generator emits `<Reference>` entries into Cfg.c,
  // assert that Refs-1's Cfg.c content contains the expected
  // `&Mcu_ClockConfig_0` symbol so the deferred reference-emission work
  // has a concrete regression anchor. The current generator ignores
  // `references[]` and emits a byte-identical Cfg.c to PreCompile-1.
  test.todo('Refs-1 Cfg.c contains &Mcu_ClockConfig_0 reference emit');
});
