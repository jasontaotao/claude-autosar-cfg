// core/arxml/__tests__/skeleton.test.ts
// Sprint 14 — generateEcucSkeleton() pure-function contract.
//
// Tests are TDD-first: this file is the contract; skeleton.ts is the
// implementation. Each test constructs a minimal BswmdDocument by hand so
// the assertion focuses on skeleton-shape behaviour, not on the parser.
//
// Adaptations from the original plan brief (`task-2-brief.md`):
//   1. The brief assumed a pre-Sprint-12 root-based data model (`ArxmlDocument.root`
//      with free-form `{ tagName, attributes, children, text? }` children). The
//      repo has since moved to a discriminated-union model (`packages` +
//      `ArxmlModule | ArxmlContainer | ArxmlReference`). These tests assert
//      against the post-Sprint-12 model — see src/core/arxml/types.ts.
//   2. The brief's test "emits MODULE-REF with DEST=ECUC-MODULE-DEF and the
//      module path" cannot be satisfied: the discriminated-union model has
//      no MODULE-REF element. Module identity is encoded as (package path,
//      module shortName, sourceBswmdPath on the document). We replace it
//      with an assertion that the module's path is reachable through
//      packages[0].path and that sourceBswmdPath is undefined on the
//      generated doc (caller attaches it).

import { describe, it, expect } from 'vitest';

import type { BswmdDocument, BswModuleDef, ContainerDef, ParamDef } from '../../project/bswmd.js';
import { generateEcucSkeleton, resolveCollisionFilename } from '../skeleton.js';
import type { PickedModule } from '../skeleton.js';
import type { ArxmlContainer, ArxmlModule } from '../types.js';

// ---------------------------------------------------------------------------
// Hand-built fixtures
// ---------------------------------------------------------------------------

function makeBswContainer(
  shortName: string,
  subContainers: readonly ContainerDef[] = [],
  lowerMultiplicity = 1,
): ContainerDef {
  return {
    shortName,
    path: `/Module/${shortName}`,
    lowerMultiplicity,
    upperMultiplicity: 1,
    subContainers,
    parameters: [],
    references: [],
    choices: [],
    multiplicityConfigClasses: [],
  };
}

function makeBswModule(shortName: string, containers: readonly ContainerDef[] = []): BswModuleDef {
  return {
    shortName,
    path: `/${shortName}`,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers,
    providedEntries: [],
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    multiplicityConfigClasses: [],
  };
}

function makeBswmd(modules: readonly BswModuleDef[]) {
  return { version: '4.6', modules, warnings: [] as string[] };
}

// ---------------------------------------------------------------------------
// generateEcucSkeleton
// ---------------------------------------------------------------------------

describe('generateEcucSkeleton', () => {
  it('produces a single package containing a module with ECUC-MODULE-CONFIGURATION-VALUES tagName', () => {
    // Arrange
    const can = makeBswModule('Can');
    const doc = makeBswmd([can]);

    // Act
    const ar = generateEcucSkeleton(doc, 'Can');

    // Assert — brief test 1, adapted to the packages + discriminated-union model.
    expect(ar.packages).toHaveLength(1);
    expect(ar.packages[0]!.elements).toHaveLength(1);
    const mod = ar.packages[0]!.elements[0]! as ArxmlModule;
    expect(mod.kind).toBe('module');
    expect(mod.tagName).toBe('ECUC-MODULE-CONFIGURATION-VALUES');
  });

  it('sets module shortName', () => {
    // Arrange
    const can = makeBswModule('Can');
    const doc = makeBswmd([can]);

    // Act
    const ar = generateEcucSkeleton(doc, 'Can');

    // Assert — brief test 2, adapted.
    const mod = ar.packages[0]!.elements[0]! as ArxmlModule;
    expect(mod.shortName).toBe('Can');
  });

  it('emits empty params and references at module level', () => {
    // Arrange
    const can = makeBswModule('Can');
    const doc = makeBswmd([can]);

    // Act
    const ar = generateEcucSkeleton(doc, 'Can');

    // Assert — replaces brief test 3 (MODULE-REF). The discriminated-union
    // model has no MODULE-REF element; the empty params + references are the
    // observable contract for a fresh skeleton that the user fills in via
    // ParamEditor. Module identity comes from (packages[0].path,
    // module.shortName, doc.sourceBswmdPath attached by the caller).
    const mod = ar.packages[0]!.elements[0]! as ArxmlModule;
    expect(mod.params).toEqual({});
    expect(mod.references).toEqual([]);
  });

  it('emits one ArxmlContainer per BSWMD top-level container, with correct tagName + shortName', () => {
    // Arrange
    const canConfigSet = makeBswContainer('CanConfigSet');
    const can = makeBswModule('Can', [canConfigSet]);
    const doc = makeBswmd([can]);

    // Act
    const ar = generateEcucSkeleton(doc, 'Can');

    // Assert — brief test 4, adapted. The skeleton module's children are the
    // generated ArxmlContainers (one per BSWMD top-level container).
    const mod = ar.packages[0]!.elements[0]! as ArxmlModule;
    expect(mod.children).toHaveLength(1);
    const child = mod.children[0]! as ArxmlContainer;
    expect(child.kind).toBe('container');
    expect(child.tagName).toBe('ECUC-CONTAINER-VALUE');
    expect(child.shortName).toBe('CanConfigSet');
    expect(child.params).toEqual({});
  });

  it('throws if module shortName not in BSWMD', () => {
    // Arrange
    const can = makeBswModule('Can');
    const doc = makeBswmd([can]);

    // Act + Assert — brief test 5, verbatim.
    expect(() => generateEcucSkeleton(doc, 'Missing')).toThrow(/not found/i);
  });

  it('returns document with empty path and no sourceBswmdPath', () => {
    // Arrange
    const can = makeBswModule('Can');
    const doc = makeBswmd([can]);

    // Act
    const ar = generateEcucSkeleton(doc, 'Can');

    // Assert — brief test 6, verbatim. The caller is responsible for attaching
    // `path` and `sourceBswmdPath`; the skeleton factory returns a bare
    // document.
    expect(ar.path).toBe('');
    expect(ar.sourceBswmdPath).toBeUndefined();
  });

  it('recursively expands subContainers into nested ArxmlContainer children', () => {
    // Bonus test (not in the brief) — the brief's `subContainers.map(buildContainer)`
    // sketch implies recursion; pin it down so future refactors don't flatten it.
    // Arrange
    const canController = makeBswContainer('CanController');
    const canConfigSet = makeBswContainer('CanConfigSet', [canController]);
    const can = makeBswModule('Can', [canConfigSet]);
    const doc = makeBswmd([can]);

    // Act
    const ar = generateEcucSkeleton(doc, 'Can');

    // Assert
    const mod = ar.packages[0]!.elements[0]! as ArxmlModule;
    const canConfigSetValue = mod.children[0]! as ArxmlContainer;
    expect(canConfigSetValue.children).toHaveLength(1);
    const canControllerValue = canConfigSetValue.children[0]! as ArxmlContainer;
    expect(canControllerValue.kind).toBe('container');
    expect(canControllerValue.shortName).toBe('CanController');
  });

  it('sets package shortName + path to the module shortName', () => {
    // Arrange — bonus. The brief said the path is `caller-set`, but we still
    // choose a sensible default for the package shortName + path so the
    // caller doesn't have to fabricate them.
    const can = makeBswModule('Can');
    const doc = makeBswmd([can]);

    // Act
    const ar = generateEcucSkeleton(doc, 'Can');

    // Assert
    expect(ar.packages[0]!.shortName).toBe('Can');
    expect(ar.packages[0]!.path).toBe('/Can');
  });
});

// ---------------------------------------------------------------------------
// resolveCollisionFilename (T3 — full collision-resolution contract)
// ---------------------------------------------------------------------------
//
// Note: the original T3 brief specified the Map key as
// `${moduleShortName}/${bswmdPath}`. T2's stub shipped
// `${bswmdPath}::${moduleShortName}` and was accepted by the reviewer;
// we keep the stub shape (less churn, no `/` vs path-separator
// confusion in logs). The brief's 5 tests are ported verbatim below
// with only the key shape adjusted to match the implemented contract.

describe('resolveCollisionFilename', () => {
  const PROJECT_DIR = 'D:/proj';
  // Helper: build a key in the implemented `::` shape from the brief's
  // (moduleShortName, bswmdPath) tuple.
  const k = (moduleShortName: string, bswmdPath: string): string =>
    `${bswmdPath}::${moduleShortName}`;

  it('returns single-Cfg.arxml for a single pick', () => {
    const picks: PickedModule[] = [{ bswmdPath: 'D:/bswmd/Can.arxml', moduleShortName: 'Can' }];
    const m = resolveCollisionFilename(picks, PROJECT_DIR);
    expect(m.size).toBe(1);
    expect(m.get(k('Can', 'D:/bswmd/Can.arxml'))).toBe(`${PROJECT_DIR}/ecuc/Can_EcucValues.arxml`);
  });

  it('Sprint 16: emitted filename uses AUTOSAR _EcucValues.arxml suffix (no collision)', () => {
    // Pin the new naming convention explicitly. The default-fill test
    // above already exercises this via fixture strings, but this case
    // exists to make the naming intent self-documenting.
    const m = resolveCollisionFilename(
      [{ bswmdPath: '/BSWMD/Can.arxml', moduleShortName: 'Can' }],
      '/proj',
    );
    expect(m.get('/BSWMD/Can.arxml::Can')).toBe('/proj/ecuc/Can_EcucValues.arxml');
  });

  it('Sprint 16: vendor collision suffix still uses _EcucValues.arxml', () => {
    const m = resolveCollisionFilename(
      [
        { bswmdPath: '/BSWMD/Can_v1.arxml', moduleShortName: 'Can' },
        { bswmdPath: '/BSWMD/Can_v2.arxml', moduleShortName: 'Can' },
      ],
      '/proj',
    );
    expect(m.get('/BSWMD/Can_v1.arxml::Can')).toBe('/proj/ecuc/Can_EcucValues.arxml');
    expect(m.get('/BSWMD/Can_v2.arxml::Can')).toBe('/proj/ecuc/Can__can_v2_EcucValues.arxml');
  });

  it('returns multiple non-colliding Cfg.arxml files for multi-pick from one BSWMD', () => {
    const picks: PickedModule[] = [
      { bswmdPath: 'D:/bswmd/Can.arxml', moduleShortName: 'Can' },
      { bswmdPath: 'D:/bswmd/Can.arxml', moduleShortName: 'CanIf' },
    ];
    const m = resolveCollisionFilename(picks, PROJECT_DIR);
    expect(m.size).toBe(2);
    expect(m.get(k('Can', 'D:/bswmd/Can.arxml'))).toBe(`${PROJECT_DIR}/ecuc/Can_EcucValues.arxml`);
    expect(m.get(k('CanIf', 'D:/bswmd/Can.arxml'))).toBe(
      `${PROJECT_DIR}/ecuc/CanIf_EcucValues.arxml`,
    );
  });

  it('suffixes vendor key when same module shortName across two BSWMDs (different basenames)', () => {
    const picks: PickedModule[] = [
      { bswmdPath: 'D:/bswmd/Can_Bswmd.arxml', moduleShortName: 'Can' },
      { bswmdPath: 'D:/bswmd/Intewell_Can.arxml', moduleShortName: 'Can' },
    ];
    const m = resolveCollisionFilename(picks, PROJECT_DIR);
    expect(m.size).toBe(2);
    expect(m.get(k('Can', 'D:/bswmd/Can_Bswmd.arxml'))).toBe(
      `${PROJECT_DIR}/ecuc/Can_EcucValues.arxml`,
    );
    expect(m.get(k('Can', 'D:/bswmd/Intewell_Can.arxml'))).toBe(
      `${PROJECT_DIR}/ecuc/Can__intewell_can_EcucValues.arxml`,
    );
  });

  it('falls back to numeric suffix when basenames collide', () => {
    const picks: PickedModule[] = [
      { bswmdPath: 'D:/a/Can.arxml', moduleShortName: 'Can' },
      { bswmdPath: 'D:/b/Can.arxml', moduleShortName: 'Can' },
    ];
    const m = resolveCollisionFilename(picks, PROJECT_DIR);
    expect(m.size).toBe(2);
    expect(m.get(k('Can', 'D:/a/Can.arxml'))).toBe(`${PROJECT_DIR}/ecuc/Can_EcucValues.arxml`);
    expect(m.get(k('Can', 'D:/b/Can.arxml'))).toBe(
      `${PROJECT_DIR}/ecuc/Can__can_1_EcucValues.arxml`,
    );
  });

  it('handles empty picks gracefully', () => {
    const m = resolveCollisionFilename([], PROJECT_DIR);
    expect(m).toBeInstanceOf(Map);
    expect(m.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// generateEcucSkeleton — default param fill (post-v1.0.0)
// ---------------------------------------------------------------------------
//
// Skeleton emits BSWMD `defaultValue` into top-level containers via the
// shared `buildDefaultValue` (core/arxml/defaultValue.ts). Module-level
// params stay empty because `BswModuleDef` has no `parameters` field today
// (rare in practice). Sub-containers are NOT filled — they are empty
// shells; the user instanceiates them on demand.
//
// Type-map behaviour:
//   integer / float / boolean — default required; null default => SKIP
//   enumeration / string / function-name — null default => empty string

describe('generateEcucSkeleton — default param fill (post-v1.0.0)', () => {
  function buildBswmdWithContainers(...containers: ContainerDef[]): BswmdDocument {
    return {
      version: '4.6',
      modules: [
        {
          shortName: 'Can',
          path: '/Can',
          dialect: 'ecuc-module-def',
          moduleId: 1,
          containers,
          providedEntries: [],
          lowerMultiplicity: 1,
          upperMultiplicity: 1,
        },
      ],
      warnings: [],
    };
  }

  it('emits integer param with default', () => {
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('integer', 'CanBusOffProcessing', 0)],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const gen = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    expect(gen.kind).toBe('container');
    if (gen.kind !== 'container') throw new Error('guard');
    expect(gen.params['CanBusOffProcessing']).toEqual({
      type: 'integer',
      value: 0,
      definitionRef: '/CanBusOffProcessing',
    });
  });

  it('Sprint 16: attaches definitionRef from BSWMD path on integer param with default', () => {
    // The skeleton must carry the BSWMD-side definition path so the
    // serializer can write a real DEFINITION-REF instead of the
    // '/__synthesized__/<shortName>' placeholder.
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [
        {
          ...mkParam('integer', 'CanBusOffProcessing', 0),
          path: '/AUTOSAR/EcucDefs/Can/CanGeneral/CanBusOffProcessing',
        },
      ],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const gen = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    if (gen.kind !== 'container') throw new Error('guard');
    expect(gen.params['CanBusOffProcessing']).toEqual({
      type: 'integer',
      value: 0,
      definitionRef: '/AUTOSAR/EcucDefs/Can/CanGeneral/CanBusOffProcessing',
    });
  });

  it('Sprint 16: attaches definitionRef on text-shaped fallback (empty string placeholder)', () => {
    // String / enum params with null default still get a definitionRef so
    // the empty placeholder row renders with the real BSWMD path.
    const cont: ContainerDef = {
      shortName: 'CanIfInitCfg',
      path: '/CanIf/CanIfInitCfg',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [
        {
          ...mkParam('string', 'CanIfInitCfgSet', null),
          path: '/AUTOSAR/EcucDefs/CanIf/CanIfInitCfg/CanIfInitCfgSet',
        },
      ],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const gen = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    if (gen.kind !== 'container') throw new Error('guard');
    expect(gen.params['CanIfInitCfgSet']).toEqual({
      type: 'string',
      value: '',
      definitionRef: '/AUTOSAR/EcucDefs/CanIf/CanIfInitCfg/CanIfInitCfgSet',
    });
  });

  it('emits float param with default', () => {
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('float', 'CanMainFunctionRWPeriod', 0.0)],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const gen = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    if (gen.kind !== 'container') throw new Error('guard');
    expect(gen.params['CanMainFunctionRWPeriod']).toEqual({
      type: 'float',
      value: 0.0,
      definitionRef: '/CanMainFunctionRWPeriod',
    });
  });

  it('emits boolean param with default true', () => {
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('boolean', 'CanDevErrorDetect', true)],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const gen = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    if (gen.kind !== 'container') throw new Error('guard');
    expect(gen.params['CanDevErrorDetect']).toEqual({
      type: 'boolean',
      value: true,
      definitionRef: '/CanDevErrorDetect',
    });
  });

  it('emits enum param with default literal', () => {
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('enumeration', 'CanBusOffProcessing', 'POLLING')],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const gen = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    if (gen.kind !== 'container') throw new Error('guard');
    expect(gen.params['CanBusOffProcessing']).toEqual({
      type: 'enum',
      value: 'POLLING',
      definitionRef: '/CanBusOffProcessing',
    });
  });

  it('emits string param with default', () => {
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('string', 'CanImplementation', 'FLEXC')],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const gen = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    if (gen.kind !== 'container') throw new Error('guard');
    expect(gen.params['CanImplementation']).toEqual({
      type: 'string',
      value: 'FLEXC',
      definitionRef: '/CanImplementation',
    });
  });

  it('skips integer with null default', () => {
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('integer', 'CanBusOffProcessing', null)],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const gen = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    if (gen.kind !== 'container') throw new Error('guard');
    expect(gen.params['CanBusOffProcessing']).toBeUndefined();
  });

  it('emits empty string for string with null default', () => {
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('string', 'CanImplementation', null)],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const gen = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    if (gen.kind !== 'container') throw new Error('guard');
    expect(gen.params['CanImplementation']).toEqual({
      type: 'string',
      value: '',
      definitionRef: '/CanImplementation',
    });
  });

  it('skips reference params (use addReference separately)', () => {
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [],
      references: [
        {
          shortName: 'CanIf',
          path: '/Can/CanGeneral/CanIf',
          destKind: 'ECUC-MODULE-CONFIGURATION-VALUES',
          lowerMultiplicity: 0,
          upperMultiplicity: 1,
        },
      ],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const gen = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    if (gen.kind !== 'container') throw new Error('guard');
    expect(Object.keys(gen.params)).toEqual([]);
    // Note: ArxmlContainer has no `references` field in the
    // discriminated-union model; reference wiring is handled by a
    // separate editor flow, not by the skeleton factory.
  });

  it('does not fill sub-container params (top-layer only per spec)', () => {
    const sub: ContainerDef = {
      shortName: 'CanSub',
      path: '/Can/CanGeneral/CanSub',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('integer', 'SubParam', 5)],
      references: [],
      choices: [],
    };
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [sub],
      parameters: [],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const gen = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    if (gen.kind !== 'container') throw new Error('guard');
    const subInst = gen.children[0]!;
    if (subInst.kind !== 'container') throw new Error('guard');
    expect(subInst.params['SubParam']).toBeUndefined();
  });
});

describe('resolveCollisionFilename — ecuc/ subfolder (post-v1.0.0)', () => {
  it('single pick uses <proj>/ecuc/ prefix', () => {
    const map = resolveCollisionFilename(
      [{ bswmdPath: '/BSWMD/Can.arxml', moduleShortName: 'Can' }],
      '/proj',
    );
    expect(map.size).toBe(1);
    expect(map.get('/BSWMD/Can.arxml::Can')).toBe('/proj/ecuc/Can_EcucValues.arxml');
  });

  it('cross-BSWMD name collision produces one canonical + one vendor-suffixed in subfolder', () => {
    const map = resolveCollisionFilename(
      [
        { bswmdPath: '/BSWMD/Can_v1.arxml', moduleShortName: 'Can' },
        { bswmdPath: '/BSWMD/Can_v2.arxml', moduleShortName: 'Can' },
      ],
      '/proj',
    );
    expect(map.size).toBe(2);
    expect(map.get('/BSWMD/Can_v1.arxml::Can')).toBe('/proj/ecuc/Can_EcucValues.arxml');
    expect(map.get('/BSWMD/Can_v2.arxml::Can')).toBe('/proj/ecuc/Can__can_v2_EcucValues.arxml');
  });

  it('handles projectDir with trailing slash without doubling', () => {
    const map = resolveCollisionFilename(
      [{ bswmdPath: '/BSWMD/Can.arxml', moduleShortName: 'Can' }],
      '/proj/',
    );
    // resolveCollisionFilename normalizes a trailing '/' on projectDir
    // via `.replace(/\/+$/, '')`, so '/proj/' and '/proj' produce the
    // same path shape ('/proj/ecuc/...') instead of '/proj//ecuc/...'.
    expect(map.get('/BSWMD/Can.arxml::Can')).toBe('/proj/ecuc/Can_EcucValues.arxml');
  });
});

function mkParam(
  kind: ParamDef['kind'],
  shortName: string,
  defaultValue: ParamDef['defaultValue'],
): ParamDef {
  return {
    shortName,
    path: `/${shortName}`,
    kind,
    defaultValue,
    minValue: null,
    maxValue: null,
    minLength: null,
    maxLength: null,
    enumerationLiterals: [],
  };
}
