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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeAll } from 'vitest';

import { EcuCGenerator } from '../modules/ecuc.js';
import { normalizeToTree, type BswmdModuleDefLite } from '../normalize.js';
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
  // v1.13.4 PATCH-B (L3) — populate bswmdParamIndex via the production
  // normalizeToTree path so the L3 structured lookup has the BSWMD
  // metadata it needs (configClass routing). Without this, Mixed-1
  // would not emit EcuC_PBcfg.c because isPostBuild() falls back to
  // `false` when the index is empty (conservative default).
  const tree = normalizeToTree(
    new Map([[ecucDef.shortName, ecucDef as unknown as BswmdModuleDefLite]]),
    new Map(),
  );
  return {
    variant: 'PreCompile',
    bswmdIndex: new Map<string, unknown>([
      ['EcuC', { shortName: 'EcuC', moduleHeader: 'EcuC/EcuC_Cfg.h' }],
      ['Os', { shortName: 'Os', moduleHeader: 'Os/Os_Cfg.h' }],
    ]) as never,
    implByModule: new Map<string, string>(),
    outDir: '/tmp',
    diagnostics: [],
    bswmdParamIndex: tree.bswmdParamIndex,
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

  // v1.14.0 MINOR S1 — integration assertion for module-scoped header
  // guard. The EcuC Cfg.h must use ECUC_CFG_H. The snapshot byte-equal
  // check above already proves this for PreCompile-1; this test makes
  // the contract explicit + survives snapshot regeneration drift.
  it('Cfg.h uses module-scoped header guard ECUC_CFG_H (D-rev2 S1)', () => {
    const g = new EcuCGenerator();
    const out = g.emit(
      ecucDef as unknown as BswmdModuleDef,
      ecucValuesPreCompile as unknown as EcucModuleConfigurationValues,
      makeCtx(),
    );
    const h = out.find((a) => a.path === 'EcuC/EcuC_Cfg.h');
    if (!h) throw new Error('EcuC/EcuC_Cfg.h missing from emit output');
    expect(h.content).toContain('#ifndef ECUC_CFG_H');
    expect(h.content).toContain('#define ECUC_CFG_H');
    expect(h.content).toContain('#endif /* ECUC_CFG_H */');
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
    // v1.14.0 MINOR S2 — the generator now consumes values.references[].
    // Cfg.h grows the cross-module pointer decl
    // `extern CONST(void * const, AUTOMATIC) EcuC_EcuCGeneral_PartitionRef = &Os_OsCore_OsCore_0;`
    // and is no longer byte-identical to PreCompile-1's.
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

  // v1.14.0 MINOR S2 — concrete regression anchor for the reference
  // emit. Replaces the deferred `test.todo` from v1.13.x with a real
  // assertion: the Refs-1 Cfg.h must carry the cross-module pointer
  // decl, AND must differ from PreCompile-1's (which has no refs).
  it('Refs-1 Cfg.h contains the Os_OsCore_OsCore_0 reference decl (D-rev2 S2 closed)', () => {
    const g = new EcuCGenerator();
    const out = g.emit(
      ecucDef as unknown as BswmdModuleDef,
      ecucValuesRefs as unknown as EcucModuleConfigurationValues,
      makeCtx(),
    );
    const h = out.find((a) => a.path === 'EcuC/EcuC_Cfg.h');
    if (!h) throw new Error('Refs-1: Cfg.h missing');
    expect(h.content).toContain(
      'extern CONST(void * const, AUTOMATIC) EcuC_EcuCGeneral_PartitionRef = &Os_OsCore_OsCore_0;',
    );
    // Must differ from PreCompile-1's Cfg.h — Refs-1 now has the
    // pointer decl that PreCompile-1 doesn't.
    expect(h.content).not.toBe(readSnap('PreCompile-1/EcuC_Cfg.h'));
  });

  // v1.14.0 MINOR S2 — the original `test.todo('Refs-1 Cfg.c contains
  // &Mcu_ClockConfig_0 reference emit')` from v1.13.x is removed.
  // Cfg.h now carries the cross-module pointer declaration (asserted
  // above), which is the v1.14.0 scope. Cfg.c reference emit is
  // deferred to a future release.
});
