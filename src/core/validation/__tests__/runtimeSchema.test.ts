// Unit tests for the runtime SchemaLayer (Sprint 12 #2).
//
// Pins the contract that downstream layers (validator, renderer store)
// depend on:
//   - `buildSchemaLayer` builds flat path-indexed maps keyed exactly as
//     the validator expects (`/<pkg>/<module>/<container>/<param>` for
//     params, `/<pkg>/<module>/<container>` for containers).
//   - `sourcePaths` is the union of every param + container path the
//     BSWMD declares, regardless of whether a constraint entry exists.
//   - Collision policy is last-write-wins (BSWMD-1 then BSWMD-2
//     declaring the same path → BSWMD-2's entry is the one that lands
//     in the layer).
//   - `findModuleForPath` attributes an absolute path to its containing
//     module root by reading the layer's container index.
//
// We build a small synthetic BswmdDocument — no parser, no fixtures —
// because the contract being pinned here is the *index shape*, not the
// parser's understanding of ECUC-MODULE-DEF XML. The parser test
// (validateProject.fixtures.test.ts + BSWMD round-trip) already covers
// the parser side; this file is the layer contract surface.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import type {
  BswModuleDef,
  BswmdDocument,
  ContainerDef,
  ParamDef,
  ReferenceDef,
} from '../../project/bswmd.js';
import { parseBswmd } from '../../project/bswmd.js';
import {
  buildSchemaLayer,
  findModuleForPath,
  lookupContainerSchemaAcrossModuleRoots,
  lookupSchemaAcrossModuleRoots,
  type SchemaLayer,
} from '../runtimeSchema.js';

// ---------------------------------------------------------------------------
// Synthetic BSWMD builders
// ---------------------------------------------------------------------------

function param(overrides: Partial<ParamDef> & Pick<ParamDef, 'shortName' | 'path'>): ParamDef {
  return {
    shortName: overrides.shortName,
    path: overrides.path,
    kind: overrides.kind ?? 'integer',
    defaultValue: overrides.defaultValue ?? null,
    minValue: overrides.minValue ?? null,
    maxValue: overrides.maxValue ?? null,
    minLength: overrides.minLength ?? null,
    maxLength: overrides.maxLength ?? null,
    enumerationLiterals: overrides.enumerationLiterals ?? [],
  };
}

function reference(
  overrides: Partial<ReferenceDef> & Pick<ReferenceDef, 'shortName' | 'path'>,
): ReferenceDef {
  return {
    shortName: overrides.shortName,
    path: overrides.path,
    destKind: overrides.destKind ?? 'ECUC-REFERENCE-DEF',
    lowerMultiplicity: overrides.lowerMultiplicity ?? 0,
    upperMultiplicity: overrides.upperMultiplicity ?? 1,
  };
}

function container(
  overrides: Partial<ContainerDef> & Pick<ContainerDef, 'shortName' | 'path'>,
): ContainerDef {
  return {
    shortName: overrides.shortName,
    path: overrides.path,
    lowerMultiplicity: overrides.lowerMultiplicity ?? 0,
    upperMultiplicity: overrides.upperMultiplicity ?? 1,
    subContainers: overrides.subContainers ?? [],
    parameters: overrides.parameters ?? [],
    references: overrides.references ?? [],
    choices: overrides.choices ?? [],
    multiplicityConfigClasses: overrides.multiplicityConfigClasses ?? [],
  };
}

function module(
  overrides: Partial<BswModuleDef> & Pick<BswModuleDef, 'shortName' | 'path'>,
): BswModuleDef {
  return {
    shortName: overrides.shortName,
    path: overrides.path,
    dialect: overrides.dialect ?? 'ecuc-module-def',
    moduleId: overrides.moduleId ?? null,
    containers: overrides.containers ?? [],
    providedEntries: overrides.providedEntries ?? [],
    lowerMultiplicity: overrides.lowerMultiplicity ?? 0,
    upperMultiplicity: overrides.upperMultiplicity ?? 1,
    multiplicityConfigClasses: overrides.multiplicityConfigClasses ?? [],
  };
}

function makeDoc(modules: readonly BswModuleDef[]): BswmdDocument {
  return { version: '4.6', modules, warnings: [] };
}

// ---------------------------------------------------------------------------
// buildSchemaLayer — empty input
// ---------------------------------------------------------------------------

describe('buildSchemaLayer — empty input', () => {
  it('returns an empty layer when given no documents', () => {
    const layer = buildSchemaLayer([]);
    expect(layer.params.size).toBe(0);
    expect(layer.containers.size).toBe(0);
    expect(layer.sourcePaths.size).toBe(0);
  });

  it('returns an empty layer when given a document with no modules', () => {
    const doc = makeDoc([]);
    const layer = buildSchemaLayer([doc]);
    expect(layer.params.size).toBe(0);
    expect(layer.containers.size).toBe(0);
    expect(layer.sourcePaths.size).toBe(0);
  });

  it('returns an empty layer when modules have no containers', () => {
    const doc = makeDoc([module({ shortName: 'CanIf', path: '/EcucDefs/CanIf' })]);
    const layer = buildSchemaLayer([doc]);
    // Module root is itself indexed as a container; verify the container
    // entry for the module path is recorded (and the params map is empty
    // because there are no parameters / references to walk).
    expect(layer.containers.has('/EcucDefs/CanIf')).toBe(true);
    expect(layer.containers.size).toBe(1);
    expect(layer.params.size).toBe(0);
    expect(layer.sourcePaths.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildSchemaLayer — indexing contract
// ---------------------------------------------------------------------------

describe('buildSchemaLayer — indexing contract', () => {
  // Synthetic CanIf-like module: one container with two integer params
  // and one reference. Used to verify path keys + sourcePaths union.
  const canIfGeneral = container({
    shortName: 'CanIfGeneral',
    path: '/EcucDefs/CanIf/CanIfGeneral',
    parameters: [
      param({
        shortName: 'CanIfDevErrorDetect',
        path: '/EcucDefs/CanIf/CanIfGeneral/CanIfDevErrorDetect',
        kind: 'boolean',
      }),
      param({
        shortName: 'CanIfVersionInfoApi',
        path: '/EcucDefs/CanIf/CanIfGeneral/CanIfVersionInfoApi',
        kind: 'boolean',
      }),
    ],
    references: [
      reference({
        shortName: 'CanIfTrcvDrvRef',
        path: '/EcucDefs/CanIf/CanIfGeneral/CanIfTrcvDrvRef',
        destKind: 'ECUC-REFERENCE-DEF',
      }),
    ],
  });
  const canIfInit = container({
    shortName: 'CanIfInitConfiguration',
    path: '/EcucDefs/CanIf/CanIfInitConfiguration',
    parameters: [
      param({
        shortName: 'CanIfInitConfigSet',
        path: '/EcucDefs/CanIf/CanIfInitConfiguration/CanIfInitConfigSet',
        kind: 'integer',
        minValue: 0,
        maxValue: 65535,
      }),
    ],
  });
  const canIf = module({
    shortName: 'CanIf',
    path: '/EcucDefs/CanIf',
    containers: [canIfGeneral, canIfInit],
  });

  const layer: SchemaLayer = buildSchemaLayer([makeDoc([canIf])]);

  it('indexes every container (module root + top-level + nested) under its absolute path', () => {
    expect(layer.containers.has('/EcucDefs/CanIf')).toBe(true);
    expect(layer.containers.has('/EcucDefs/CanIf/CanIfGeneral')).toBe(true);
    expect(layer.containers.has('/EcucDefs/CanIf/CanIfInitConfiguration')).toBe(true);
    expect(layer.containers.size).toBe(3);
  });

  it('indexes every param under its absolute path with the right kind', () => {
    // 3 params + 1 reference = 4 entries in the params map.
    expect(layer.params.size).toBe(4);
    const devErr = layer.params.get('/EcucDefs/CanIf/CanIfGeneral/CanIfDevErrorDetect');
    expect(devErr).toBeDefined();
    expect(devErr!.type).toBe('boolean');
    expect(devErr!.path).toBe('/EcucDefs/CanIf/CanIfGeneral/CanIfDevErrorDetect');
    const handleId = layer.params.get('/EcucDefs/CanIf/CanIfInitConfiguration/CanIfInitConfigSet');
    expect(handleId).toBeDefined();
    expect(handleId!.type).toBe('integer');
    expect(handleId!.min).toBe(0);
    expect(handleId!.max).toBe(65535);
  });

  it('indexes references with type=reference and refDest', () => {
    const ref = layer.params.get('/EcucDefs/CanIf/CanIfGeneral/CanIfTrcvDrvRef');
    expect(ref).toBeDefined();
    expect(ref!.type).toBe('reference');
    expect(ref!.refDest).toBe('ECUC-REFERENCE-DEF');
  });

  it('sourcePaths contains every param + container path (the union set)', () => {
    // 3 containers (module root + 2 sub) + 3 params + 1 reference = 7 paths.
    expect(layer.sourcePaths.size).toBe(7);
    for (const p of [
      '/EcucDefs/CanIf',
      '/EcucDefs/CanIf/CanIfGeneral',
      '/EcucDefs/CanIf/CanIfInitConfiguration',
      '/EcucDefs/CanIf/CanIfGeneral/CanIfDevErrorDetect',
      '/EcucDefs/CanIf/CanIfGeneral/CanIfVersionInfoApi',
      '/EcucDefs/CanIf/CanIfGeneral/CanIfTrcvDrvRef',
      '/EcucDefs/CanIf/CanIfInitConfiguration/CanIfInitConfigSet',
    ]) {
      expect(layer.sourcePaths.has(p)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// buildSchemaLayer — collision policy
// ---------------------------------------------------------------------------

describe('buildSchemaLayer — collision policy', () => {
  it('last-write-wins when two BSWMDs declare the same module path', () => {
    const v1General = container({
      shortName: 'CanIfGeneral',
      path: '/EcucDefs/CanIf/CanIfGeneral',
      parameters: [
        param({
          shortName: 'CanIfDevErrorDetect',
          path: '/EcucDefs/CanIf/CanIfGeneral/CanIfDevErrorDetect',
          kind: 'boolean',
          // BSWMD v1 says "no upper bound"
        }),
      ],
    });
    const v1 = module({
      shortName: 'CanIf',
      path: '/EcucDefs/CanIf',
      containers: [v1General],
    });

    const v2General = container({
      shortName: 'CanIfGeneral',
      path: '/EcucDefs/CanIf/CanIfGeneral',
      parameters: [
        param({
          shortName: 'CanIfDevErrorDetect',
          path: '/EcucDefs/CanIf/CanIfGeneral/CanIfDevErrorDetect',
          kind: 'integer', // BSWMD v2 changes the type — should win
          minValue: 0,
          maxValue: 1,
        }),
      ],
    });
    const v2 = module({
      shortName: 'CanIf',
      path: '/EcucDefs/CanIf',
      containers: [v2General],
    });

    const layer = buildSchemaLayer([makeDoc([v1]), makeDoc([v2])]);
    const entry = layer.params.get('/EcucDefs/CanIf/CanIfGeneral/CanIfDevErrorDetect');
    expect(entry).toBeDefined();
    expect(entry!.type).toBe('integer');
    expect(entry!.min).toBe(0);
    expect(entry!.max).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// findModuleForPath
// ---------------------------------------------------------------------------

describe('findModuleForPath', () => {
  const canIfGeneral = container({
    shortName: 'CanIfGeneral',
    path: '/EcucDefs/CanIf/CanIfGeneral',
    parameters: [
      param({
        shortName: 'CanIfDevErrorDetect',
        path: '/EcucDefs/CanIf/CanIfGeneral/CanIfDevErrorDetect',
        kind: 'boolean',
      }),
    ],
  });
  const canIf = module({
    shortName: 'CanIf',
    path: '/EcucDefs/CanIf',
    containers: [canIfGeneral],
  });
  const com = module({
    shortName: 'Com',
    path: '/EcucDefs/Com',
  });
  const layer: SchemaLayer = buildSchemaLayer([makeDoc([canIf, com])]);

  it('returns the module path for a 4-segment param path under a known module', () => {
    expect(findModuleForPath(layer, '/EcucDefs/CanIf/CanIfGeneral/CanIfDevErrorDetect')).toBe(
      '/EcucDefs/CanIf',
    );
  });

  it('returns the module path for a 3-segment container path under a known module', () => {
    expect(findModuleForPath(layer, '/EcucDefs/CanIf/CanIfGeneral')).toBe('/EcucDefs/CanIf');
  });

  it('returns null for a path under a module the layer does not index', () => {
    // /EcucDefs/EcuC/* — EcuC is not in the synthetic doc
    expect(findModuleForPath(layer, '/EcucDefs/EcuC/EcucGeneral/BitOrder')).toBeNull();
  });

  it('returns null for a path with fewer than 2 segments', () => {
    expect(findModuleForPath(layer, '/EcucDefs')).toBeNull();
    expect(findModuleForPath(layer, '/EcucDefs/')).toBeNull();
  });

  it('returns null for malformed input (empty, no leading /)', () => {
    expect(findModuleForPath(layer, '')).toBeNull();
    expect(findModuleForPath(layer, 'EcucDefs/CanIf/CanIfGeneral/CanIfDevErrorDetect')).toBeNull();
  });

  it('returns null for an empty layer (no modules)', () => {
    const empty = buildSchemaLayer([]);
    expect(findModuleForPath(empty, '/EcucDefs/CanIf/CanIfGeneral/CanIfDevErrorDetect')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildSchemaLayer — choices and maxLength (Wave 4.B branch coverage)
// ---------------------------------------------------------------------------

describe('buildSchemaLayer — choices indexing', () => {
  it('recursively indexes params/containers inside <CHOICES> branches', () => {
    // A <CHOICES> container holds alternative sub-containers. The indexer
    // walks each choice branch with the same recursive helper, so a param
    // declared inside a choice branch must appear in the layer's `params`
    // map AND in `sourcePaths` (line 126-128 of runtimeSchema.ts).
    const choiceBranch = container({
      shortName: 'CanIfTxBufferCfg',
      path: '/EcucDefs/CanIf/CanIfInitConfiguration/CanIfBufferCfg/CanIfTxBufferCfg',
      parameters: [
        param({
          shortName: 'CanIfTxBufferSize',
          path: '/EcucDefs/CanIf/CanIfInitConfiguration/CanIfBufferCfg/CanIfTxBufferCfg/CanIfTxBufferSize',
          kind: 'integer',
        }),
      ],
    });
    const parentWithChoice = container({
      shortName: 'CanIfBufferCfg',
      path: '/EcucDefs/CanIf/CanIfInitConfiguration/CanIfBufferCfg',
      choices: [choiceBranch],
    });
    const canIf = module({
      shortName: 'CanIf',
      path: '/EcucDefs/CanIf',
      containers: [parentWithChoice],
    });
    const layer = buildSchemaLayer([makeDoc([canIf])]);

    // The choice-branch container is indexed in containers.
    expect(
      layer.containers.has(
        '/EcucDefs/CanIf/CanIfInitConfiguration/CanIfBufferCfg/CanIfTxBufferCfg',
      ),
    ).toBe(true);
    // The choice-branch param is indexed in params.
    const entry = layer.params.get(
      '/EcucDefs/CanIf/CanIfInitConfiguration/CanIfBufferCfg/CanIfTxBufferCfg/CanIfTxBufferSize',
    );
    expect(entry).toBeDefined();
    expect(entry!.type).toBe('integer');
    // Both the choice-branch container and its param show up in sourcePaths.
    expect(
      layer.sourcePaths.has(
        '/EcucDefs/CanIf/CanIfInitConfiguration/CanIfBufferCfg/CanIfTxBufferCfg',
      ),
    ).toBe(true);
    expect(
      layer.sourcePaths.has(
        '/EcucDefs/CanIf/CanIfInitConfiguration/CanIfBufferCfg/CanIfTxBufferCfg/CanIfTxBufferSize',
      ),
    ).toBe(true);
  });

  it('maps maxLength into the schema entry when the param has a maxLength constraint', () => {
    // When a ParamDef has maxLength != null, paramDefToSchemaEntry sets
    // entry.maxLength (line 161-163). This test pins the contract.
    const stringParam = param({
      shortName: 'CanIfWakeupSrc',
      path: '/EcucDefs/CanIf/CanIfInitConfiguration/CanIfWakeupSrc',
      kind: 'string',
      maxLength: 32,
    });
    const canIfInit = container({
      shortName: 'CanIfInitConfiguration',
      path: '/EcucDefs/CanIf/CanIfInitConfiguration',
      parameters: [stringParam],
    });
    const canIf = module({
      shortName: 'CanIf',
      path: '/EcucDefs/CanIf',
      containers: [canIfInit],
    });
    const layer = buildSchemaLayer([makeDoc([canIf])]);
    const entry = layer.params.get('/EcucDefs/CanIf/CanIfInitConfiguration/CanIfWakeupSrc');
    expect(entry).toBeDefined();
    expect(entry!.maxLength).toBe(32);
  });

  it('maps enumerationLiterals into the schema entry when present', () => {
    // The 4-branch switch in paramDefToSchemaEntry (lines 155-166) covers
    // min/max/maxLength/enumLiterals. Pin the enumLiterals mapping.
    const enumParam = param({
      shortName: 'BitOrder',
      path: '/EcucDefs/EcuC/EcucGeneral/BitOrder',
      kind: 'enumeration',
      enumerationLiterals: ['LSB', 'MSB'],
    });
    const ecucGeneral = container({
      shortName: 'EcucGeneral',
      path: '/EcucDefs/EcuC/EcucGeneral',
      parameters: [enumParam],
    });
    const eucC = module({
      shortName: 'EcuC',
      path: '/EcucDefs/EcuC',
      containers: [ecucGeneral],
    });
    const layer = buildSchemaLayer([makeDoc([eucC])]);
    const entry = layer.params.get('/EcucDefs/EcuC/EcucGeneral/BitOrder');
    expect(entry).toBeDefined();
    expect(entry!.enumLiterals).toEqual(['LSB', 'MSB']);
  });
});

// ---------------------------------------------------------------------------
// Sprint 17d follow-up — vendor CDD namespace-mismatch lookup helpers.
// ---------------------------------------------------------------------------
//
// Real-world vendor CDD BSWMDs (e.g. 经纬恒润 Intewell's `/JWQ_CDD_PACK/
// JWQ_Packet/...` chain) publish modules under a vendor package prefix
// while the value-side ECUC values live under a shorter path. The
// layer indexer's `resolveTargetPath` only collapses `/EAS` and
// `/AUTOSAR_R<NN>/EcucDefs` namespaces — the vendor prefix isn't on
// that list (and shouldn't be, because it's a BSWMD publisher choice
// not an AUTOSAR standard). The cross-module-root helpers bridge the
// gap by trying each loaded BSWMD's module root as a prefix candidate.

const VENDOR_CDD_BSWMD_XML = readFileSync(
  resolve(__dirname, '../../../../tests/fixtures/bswmd/JWQ3399_bswmd.arxml'),
  'utf8',
);

function vendorCddLayer(): { layer: SchemaLayer; moduleRoot: string } {
  const result = parseBswmd(VENDOR_CDD_BSWMD_XML);
  if (!result.ok) {
    throw new Error(`Failed to parse JWQ3399 fixture: ${result.error.kind}`);
  }
  const layer = buildSchemaLayer([result.value]);
  // BSWMD publishes the JWQ3399 module under the vendor package chain
  // /JWQ_CDD_PACK/JWQ_Packet/JWQ3399.
  const moduleRoot = '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399';
  if (!layer.containers.has(moduleRoot)) {
    throw new Error(
      `Expected layer to index the vendor-CDD module root at ${moduleRoot}; ` +
        `actual roots: ${[...layer.containers.keys()].filter((k) => k.endsWith('/JWQ3399')).join(', ')}`,
    );
  }
  return { layer, moduleRoot };
}

describe('lookupSchemaAcrossModuleRoots — vendor CDD fallback (param side)', () => {
  it('returns the param entry when the value-side query matches a vendor-CDD module root by shortName', () => {
    const { layer, moduleRoot } = vendorCddLayer();
    // Value-side path the renderer would build from a containerPath like
    // /JWQ3399/JWQ3399/JWQ3399General with paramKey JWQ3399CommArch.
    // BSWMD-side key is /JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399General/JWQ3399CommArch.
    const valueSideParamPath = '/JWQ3399/JWQ3399/JWQ3399General/JWQ3399CommArch';

    // Direct lookup MUST miss (layer key has the vendor prefix).
    expect(layer.params.has(valueSideParamPath)).toBe(false);

    // Cross-module-root lookup MUST hit.
    const entry = lookupSchemaAcrossModuleRoots(valueSideParamPath, layer, [moduleRoot]);
    expect(entry).not.toBeNull();
    expect(entry!.type).toBe('enumeration');
    expect(entry!.enumLiterals).toEqual(
      expect.arrayContaining(['CommArchWithBridge', 'CommArchWithOutBridge']),
    );
  });

  it('returns null when the query is under a module shortName no BSWMD declares', () => {
    // Sprint 18 hotfix — the relaxed algorithm locates the module
    // shortName anywhere in the query AND suffix-trims the lead.
    // `NotARealModule` at segments[1] is therefore a no-op for the
    // resolution — the suffix-trim drops it. This is the desired
    // behaviour for the user's vendor-CDD project where the value
    // tree nests `JWQ3399General` inside `JWQ3399ConfigSet` while
    // the BSWMD declares them as siblings.
    //
    // The "unknown module shortName" guard that this test used to pin
    // no longer fires because the algorithm falls back to suffix-trim
    // before giving up. We re-purpose this test to assert the
    // NEW contract: when ALL possible candidates miss (no BSWMD
    // entry has a suffix that matches the post-trim path), the
    // helper returns null. The original `NotARealModule` shape now
    // hits `JWQ3399General/JWQ3399CommArch` because that is a real
    // BSWMD entry; we assert that and add a separate query (with a
    // path that does NOT match any real entry) to confirm the
    // miss path still works.
    const { layer, moduleRoot } = vendorCddLayer();
    const unknownModulePath = '/JWQ3399/NotARealModule/JWQ3399General/JWQ3399CommArch';
    // Suffix-trim drops `NotARealModule` and finds the real entry.
    const hit = lookupSchemaAcrossModuleRoots(unknownModulePath, layer, [moduleRoot]);
    expect(hit).not.toBeNull();
    expect(hit!.enumLiterals).toEqual(
      expect.arrayContaining(['CommArchWithBridge', 'CommArchWithOutBridge']),
    );
    // A truly bogus tail still misses.
    const trulyBogus = '/JWQ3399/NotARealModule/NotARealContainer/NotARealParam';
    expect(lookupSchemaAcrossModuleRoots(trulyBogus, layer, [moduleRoot])).toBeNull();
  });

  it('returns the entry via direct lookup when the query already uses the schema-side namespace', () => {
    // The cross-module-root helper degrades to a direct `layer.params.get`
    // for paths that already match the schema-side key — no fallback needed.
    const { layer, moduleRoot } = vendorCddLayer();
    const schemaSidePath = '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399General/JWQ3399CommArch';
    const direct = lookupSchemaAcrossModuleRoots(schemaSidePath, layer, [moduleRoot]);
    expect(direct).not.toBeNull();
    expect(direct!.enumLiterals).toEqual(
      expect.arrayContaining(['CommArchWithBridge', 'CommArchWithOutBridge']),
    );
  });

  it('returns null when moduleRoots is empty (mirrors lookupSchema)', () => {
    const { layer } = vendorCddLayer();
    const valueSideParamPath = '/JWQ3399/JWQ3399/JWQ3399General/JWQ3399CommArch';
    expect(lookupSchemaAcrossModuleRoots(valueSideParamPath, layer, [])).toBeNull();
  });

  it('returns null for the 2-segment module-level path (params map is container-only)', () => {
    // Symmetric to the container-side 2-segment test: the helper
    // builds `candidate = /JWQ_CDD_PACK/JWQ_Packet/JWQ3399` (no
    // trailing slash) when `segments.slice(2)` is empty, but the
    // `params` map does not index the module root as a param (only
    // `containers` does). So a param-side 2-segment query should
    // return `null` even with the empty-suffix fix.
    const { layer, moduleRoot } = vendorCddLayer();
    const moduleLevelPath = '/JWQ3399/JWQ3399';
    expect(lookupSchemaAcrossModuleRoots(moduleLevelPath, layer, [moduleRoot])).toBeNull();
  });

  it('finds the entry for the post-fold 3-segment compressed shape (renderer output after foldVendorPackages)', () => {
    // Sprint 18 hotfix — REVERSES the previous contract. The renderer
    // emits `containerPath = '/<moduleShortName>/<container>/...'`
    // after `foldVendorPackages` collapses the vendor wrapper chain
    // (Sprint X T7). The previous algorithm pinned this shape as
    // "NOT covered — caller must use resolveModuleAndParentContainer";
    // that pinned contract caused the user's vendor-CDD project to
    // render every enum param as a free-form text input. The new
    // algorithm locates the module shortName at segments[0] and
    // rebuilds the candidate as `<moduleRoot>/<container>/<param>`,
    // which hits the BSWMD-side layer key directly.
    const { layer, moduleRoot } = vendorCddLayer();
    const compressed3SegPath = '/JWQ3399/JWQ3399General/JWQ3399CommArch';
    const entry = lookupSchemaAcrossModuleRoots(compressed3SegPath, layer, [moduleRoot]);
    expect(entry).not.toBeNull();
    expect(entry!.type).toBe('enumeration');
    expect(entry!.enumLiterals).toEqual(
      expect.arrayContaining(['CommArchWithBridge', 'CommArchWithOutBridge']),
    );
  });

  // Sprint 18 hotfix — value-tree structural divergence. The user
  // project at C:\Users\13777\Desktop\ClaudeAutosarWorkSpace\
  // test.autosarcfg.json nests `JWQ3399General` inside
  // `JWQ3399ConfigSet` in the value tree, while the BSWMD declares
  // both as siblings directly under the module. The two lookups
  // above miss this because both sides share the same
  // `/<pkg>/<module>` prefix. The leading-prefix + suffix-trim
  // fallback must catch it so the EnumEditor renders the dropdown
  // instead of a free-form text input.
  it('finds the enum literals when the value tree wraps a BSWMD top-level container in an extra sub-container', () => {
    const { layer, moduleRoot } = vendorCddLayer();
    // Value-tree path the renderer builds when the user navigates
    // into JWQ3399General (which the user's ECUC value file nests
    // under JWQ3399ConfigSet) and then looks up JWQ3399CommArch.
    const valueSidePath =
      '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet/JWQ3399General/JWQ3399CommArch';

    // Direct + namespace fallbacks both miss (same `/<pkg>/<module>`
    // prefix on both sides).
    expect(layer.params.has(valueSidePath)).toBe(false);

    // Leading-prefix + suffix-trim fallback MUST hit by trimming
    // `JWQ3399ConfigSet/` off the front of the suffix.
    const entry = lookupSchemaAcrossModuleRoots(valueSidePath, layer, [moduleRoot]);
    expect(entry).not.toBeNull();
    expect(entry!.type).toBe('enumeration');
    expect(entry!.enumLiterals).toEqual(
      expect.arrayContaining(['CommArchWithBridge', 'CommArchWithOutBridge']),
    );
  });
});

describe('lookupContainerSchemaAcrossModuleRoots — vendor CDD fallback (container side)', () => {
  it('returns the container entry when the value-side query matches a vendor-CDD module root', () => {
    const { layer, moduleRoot } = vendorCddLayer();
    // Value-side container path. BSWMD-side key is
    // /JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399General.
    const valueSideContainerPath = '/JWQ3399/JWQ3399/JWQ3399General';

    // Direct lookup MUST miss.
    expect(layer.containers.has(valueSideContainerPath)).toBe(false);

    // Cross-module-root lookup MUST hit. The fixture's JWQ3399General
    // is a required container (lower=1, upper=1) — see the
    // <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY> at line 694 of
    // tests/fixtures/bswmd/JWQ3399_bswmd.arxml.
    const entry = lookupContainerSchemaAcrossModuleRoots(valueSideContainerPath, layer, [
      moduleRoot,
    ]);
    expect(entry).not.toBeNull();
    expect(entry!.lower).toBe(1);
    expect(entry!.upper).toBe(1);
  });

  it('returns the module root itself when the value-side query is the module-level path', () => {
    // The /JWQ3399/JWQ3399 path is a 2-segment value-side path that
    // corresponds to the BSWMD-side module root. The cross-module-root
    // helper should rebuild the candidate and return the module's own
    // multiplicity entry (lower=1, upper=1 for JWQ3399).
    const { layer, moduleRoot } = vendorCddLayer();
    const moduleLevelPath = '/JWQ3399/JWQ3399';
    const entry = lookupContainerSchemaAcrossModuleRoots(moduleLevelPath, layer, [moduleRoot]);
    expect(entry).not.toBeNull();
    expect(entry!.lower).toBe(1);
    expect(entry!.upper).toBe(1);
  });

  it('falls through to a real BSWMD container even when an intermediate segment is unknown', () => {
    // Sprint 18 hotfix — same contract change as the param-side
    // counterpart: the suffix-trim pass drops intermediate segments
    // that are not in the BSWMD, so a query like
    // `/JWQ3399/NotARealModule/JWQ3399General` falls through to the
    // real `JWQ3399General` entry. This is the desired behaviour
    // for the user's vendor-CDD project where the value tree nests
    // `JWQ3399General` inside an extra container not declared by the
    // BSWMD.
    const { layer, moduleRoot } = vendorCddLayer();
    const entry = lookupContainerSchemaAcrossModuleRoots(
      '/JWQ3399/NotARealModule/JWQ3399General',
      layer,
      [moduleRoot],
    );
    expect(entry).not.toBeNull();
    expect(entry!.lower).toBe(1);
    expect(entry!.upper).toBe(1);
    // Truly bogus tails still miss.
    expect(
      lookupContainerSchemaAcrossModuleRoots('/JWQ3399/NotARealModule/NotARealContainer', layer, [
        moduleRoot,
      ]),
    ).toBeNull();
  });

  it('returns null when moduleRoots is empty', () => {
    const { layer } = vendorCddLayer();
    expect(
      lookupContainerSchemaAcrossModuleRoots('/JWQ3399/JWQ3399/JWQ3399General', layer, []),
    ).toBeNull();
  });

  it('returns null for malformed input (empty, no leading slash, fewer than 2 segments)', () => {
    const { layer, moduleRoot } = vendorCddLayer();
    expect(lookupContainerSchemaAcrossModuleRoots('', layer, [moduleRoot])).toBeNull();
    expect(
      lookupContainerSchemaAcrossModuleRoots('JWQ3399/General', layer, [moduleRoot]),
    ).toBeNull();
    expect(lookupContainerSchemaAcrossModuleRoots('/JWQ3399', layer, [moduleRoot])).toBeNull();
  });

  // Sprint 18 hotfix — value-tree structural divergence (mirror of
  // the param-side test above). The container helper must also
  // resolve when the value tree wraps a BSWMD top-level container
  // in an extra sub-container.
  it('finds the container entry when the value tree wraps a BSWMD top-level container in an extra sub-container', () => {
    const { layer, moduleRoot } = vendorCddLayer();
    // Value-tree path to JWQ3399General via the user's JWQ3399ConfigSet wrapper.
    const valueSideContainerPath =
      '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet/JWQ3399General';

    // Direct + namespace fallbacks both miss.
    expect(layer.containers.has(valueSideContainerPath)).toBe(false);

    // Leading-prefix + suffix-trim fallback MUST hit.
    const entry = lookupContainerSchemaAcrossModuleRoots(valueSideContainerPath, layer, [
      moduleRoot,
    ]);
    expect(entry).not.toBeNull();
    expect(entry!.lower).toBe(1);
    expect(entry!.upper).toBe(1);
  });
});
