// core/generator/__tests__/refs-emit.test.ts
//
// v1.14.0 MINOR S2 — regression tests for EcuC reference emission
// (D-rev2 Senior S2 / Refs-1 backlog). The EcuCGenerator must consume
// the `references[]` array from values and emit one
// `CONST(void * const, AUTOMATIC) <sourceIdent> = &<targetIdent>;`
// declaration per reference into the generated Cfg.h.

import { describe, it, expect, beforeAll } from 'vitest';

import { EcuCGenerator } from '../modules/ecuc.js';
import { normalizeToTree, type BswmdModuleDefLite } from '../normalize.js';
import { _resetRegistryForTest, registerGenerator, type GenerationContext } from '../registry.js';

import { ecucDef, ecucValuesRefs } from './test-fixtures/ecuc.js';

beforeAll(() => {
  _resetRegistryForTest();
  registerGenerator(new EcuCGenerator());
});

function makeCtx(): GenerationContext {
  const tree = normalizeToTree(
    new Map([[ecucDef.shortName, ecucDef as unknown as BswmdModuleDefLite]]),
    new Map(),
  );
  return {
    variant: 'PreCompile',
    bswmdIndex: new Map<string, unknown>(),
    implByModule: new Map<string, string>(),
    outDir: '/tmp',
    diagnostics: [],
    bswmdParamIndex: tree.bswmdParamIndex,
  };
}

describe('EcuCGenerator reference emit (D-rev2 S2)', () => {
  it('renders a CONST pointer declaration for each reference into Cfg.h', () => {
    const g = new EcuCGenerator();
    const out = g.emit(ecucDef as never, ecucValuesRefs as never, makeCtx());
    const h = out.find((a) => a.path === 'EcuC/EcuC_Cfg.h');
    if (!h) throw new Error('Cfg.h missing from emit output');
    // PartitionRef (path='EcuC/EcuCGeneral/PartitionRef',
    // target='Os/OsCore/OsCore_0') → cIdent converts slashes to
    // underscores. Source ident: EcuC_EcuCGeneral_PartitionRef.
    // Target ident: Os_OsCore_OsCore_0.
    // cTypeForKind({kind:'reference'}) with no targetType → 'void'.
    expect(h.content).toContain(
      'CONST(void * const, AUTOMATIC) EcuC_EcuCGeneral_PartitionRef = &Os_OsCore_OsCore_0;',
    );
  });

  it('emits no referenceDecls when references[] is empty', () => {
    const g = new EcuCGenerator();
    const out = g.emit(ecucDef as never, { ...ecucValuesRefs, references: [] } as never, makeCtx());
    const h = out.find((a) => a.path === 'EcuC/EcuC_Cfg.h');
    if (!h) throw new Error('Cfg.h missing from emit output');
    expect(h.content).not.toContain('CONST(void * const, AUTOMATIC)');
  });

  it('emits no referenceDecls when values has no references field at all', () => {
    const g = new EcuCGenerator();
    const out = g.emit(
      ecucDef as never,
      { parameters: ecucValuesRefs.parameters } as never,
      makeCtx(),
    );
    const h = out.find((a) => a.path === 'EcuC/EcuC_Cfg.h');
    if (!h) throw new Error('Cfg.h missing from emit output');
    expect(h.content).not.toContain('CONST(void * const, AUTOMATIC)');
  });

  // v1.14.1 PATCH-G (G2) — closes v1.14.0 S2 deferred finding:
  // emitted `&Os_OsCore_OsCore_0` requires `Os/Os_Cfg.h` to be
  // `#include`d before `EcuC_Cfg.h` so the pointer type resolves.
  // The template's `{{#each includes}}` is wired; the data has to
  // be derived from each ref's `targetModule` BSWMD `moduleHeader`.
  it('v1.14.1 G2 — auto-includes target module header in Cfg.h', () => {
    const g = new EcuCGenerator();
    const bswmdIndex = new Map([
      ['EcuC', { shortName: 'EcuC', moduleHeader: 'EcuC/EcuC_Cfg.h' }],
      ['Os', { shortName: 'Os', moduleHeader: 'Os/Os_Cfg.h' }],
    ] as never);
    const out = g.emit(ecucDef as never, ecucValuesRefs as never, {
      variant: 'PreCompile',
      bswmdIndex: bswmdIndex as never,
      implByModule: new Map(),
      outDir: '/tmp',
      diagnostics: [],
      bswmdParamIndex: new Map(),
    });
    const h = out.find((a) => a.path === 'EcuC/EcuC_Cfg.h');
    if (!h) throw new Error('Cfg.h missing');
    expect(h.content).toContain('#include "Os/Os_Cfg.h"');
  });
});
