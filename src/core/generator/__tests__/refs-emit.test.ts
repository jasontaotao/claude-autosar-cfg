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

  // v1.14.2 PATCH-H (H2) — the BSWMD's own `<STD-INCLUDES>` paths
  // are emitted as `#include` directives alongside cross-ref
  // includes. Self-includes come FIRST in the Cfg.h `#include`
  // block, deduped against cross-refs via the shared `refIncludes`
  // Set. The fixture here has both: a self-include of
  // `Dem/Dem_Cfg.h` and a cross-ref to `Os` (which adds
  // `Os/Os_Cfg.h`).
  it('v1.14.2 H2 — emits self-includes from BSWMD <STD-INCLUDES>', () => {
    const g = new EcuCGenerator();
    const bswmdIndex = new Map([
      [
        'EcuC',
        {
          shortName: 'EcuC',
          moduleHeader: 'EcuC/EcuC_Cfg.h',
          includes: ['Dem/Dem_Cfg.h'],
        },
      ],
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
    expect(h.content).toContain('#include "Dem/Dem_Cfg.h"');
    // Self-include appears before the cross-ref (H2 ordering).
    const demIdx = h.content.indexOf('#include "Dem/Dem_Cfg.h"');
    const osIdx = h.content.indexOf('#include "Os/Os_Cfg.h"');
    expect(demIdx).toBeGreaterThan(-1);
    expect(osIdx).toBeGreaterThan(-1);
    expect(demIdx).toBeLessThan(osIdx);
  });

  // v1.14.2 PATCH-H (H2) — when a self-include duplicates a
  // cross-ref, only one `#include` is emitted (Set-based dedup).
  it('v1.14.2 H2 — dedupes self-include against cross-ref to same path', () => {
    const g = new EcuCGenerator();
    const bswmdIndex = new Map([
      [
        'EcuC',
        {
          shortName: 'EcuC',
          moduleHeader: 'EcuC/EcuC_Cfg.h',
          includes: ['Os/Os_Cfg.h'],
        },
      ],
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
    // Exactly one occurrence of the Os include.
    const matches = h.content.match(/#include "Os\/Os_Cfg\.h"/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});
