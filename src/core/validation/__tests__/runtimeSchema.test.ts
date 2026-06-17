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

import { describe, it, expect } from 'vitest';

import type {
  BswModuleDef,
  BswmdDocument,
  ContainerDef,
  ParamDef,
  ReferenceDef,
} from '../../project/bswmd.js';
import { buildSchemaLayer, findModuleForPath, type SchemaLayer } from '../runtimeSchema.js';

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
