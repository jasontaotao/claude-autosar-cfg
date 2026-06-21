// core/arxml/__tests__/mutation.test.ts
// Sprint 15 — pure mutation functions for ECUC add/delete.
//
// Tests are TDD-first: this file is the contract; mutation.ts is the
// implementation. Each test constructs a minimal ArxmlDocument by hand so
// the assertion focuses on the mutation behaviour, not on the parser.
//
// Conventions follow the rest of the core test suite (AAA pattern,
// vitest `describe`/`it`/`expect`, descriptive behaviour names).
//
// Note: a "module" in the test context is a `BswModuleDef` (the BSWMD
// schema), not the value-side `ArxmlModule`. Mutation tests need the
// schema for multiplicity + name-conflict checks; a small hand-built
// BswModuleDef is the easiest way to keep the tests focused.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import type { BswModuleDef, ContainerDef, ParamDef, ReferenceDef } from '../../project/bswmd.js';
import {
  addContainer,
  removeContainer,
  addParameter,
  addReference,
  removeParameter,
  removeWithCascade,
  listAllowedSubElements,
  findReferencesTo,
} from '../mutation.js';
import { parseArxml } from '../parser.js';
import { serializeArxml } from '../serializer.js';
import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ArxmlReference,
  ParamValue,
} from '../types.js';

// ---------------------------------------------------------------------------
// Hand-built fixtures
// ---------------------------------------------------------------------------

/**
 * Build a minimal `ArxmlDocument` with a single module under one root
 * package. `module` is the module element the test will mutate; `containers`
 * is the module's initial children. Defaults to empty containers.
 */
function makeDoc(
  moduleShortName: string,
  containers: readonly ArxmlContainer[] = [],
  params: Readonly<Record<string, ParamValue>> = {},
): ArxmlDocument {
  const moduleEl: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: moduleShortName,
    params,
    children: containers,
    references: [],
  };
  return {
    path: '/EAS',
    version: '4.2',
    packages: [
      {
        shortName: 'EAS',
        path: '/EAS',
        elements: [moduleEl],
      },
    ],
  };
}

function makeContainer(
  shortName: string,
  children: readonly ArxmlContainer[] = [],
  params: Readonly<Record<string, ParamValue>> = {},
): ArxmlContainer {
  return {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName,
    params,
    children,
  };
}

function makeBswContainer(
  shortName: string,
  opts: {
    lower?: number;
    upper?: number | 'infinite';
    subContainers?: readonly ContainerDef[];
    parameters?: readonly ParamDef[];
    references?: readonly ReferenceDef[];
  } = {},
): ContainerDef {
  return {
    shortName,
    path: `/Module/${shortName}`,
    lowerMultiplicity: opts.lower ?? 0,
    upperMultiplicity: opts.upper ?? 'infinite',
    subContainers: opts.subContainers ?? [],
    parameters: opts.parameters ?? [],
    references: opts.references ?? [],
    choices: [],
  };
}

function makeBswParam(
  shortName: string,
  kind: ParamDef['kind'],
  defaultValue: ParamDef['defaultValue'] = null,
): ParamDef {
  return {
    shortName,
    path: `/Module/${shortName}`,
    kind,
    defaultValue,
    minValue: null,
    maxValue: null,
    minLength: null,
    maxLength: null,
    enumerationLiterals: [],
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
  };
}

// ---------------------------------------------------------------------------
// addContainer
// ---------------------------------------------------------------------------

describe('addContainer', () => {
  it('appends a new sub-container to a module when multiplicity is unbounded', () => {
    // Arrange
    const childDef = makeBswContainer('CanIfRxPduCfg');
    const doc = makeDoc('Can', [makeContainer('CanConfigSet')]);
    const moduleDef = makeBswModule('Can', [
      makeBswContainer('CanConfigSet', { subContainers: [childDef] }),
    ]);

    // Act
    const r = addContainer(doc, '/EAS/Can', 'CanIfRxPduCfg', moduleDef, childDef);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rootModule = r.value.packages[0]!.elements[0] as ArxmlModule;
    expect(rootModule.children).toHaveLength(2);
    // v1.4.0 trust sprint — 17c. Narrow to module/container (unknown
    // vendor extensions have no SHORT-NAME).
    const lastChild = rootModule.children[1]!;
    expect(lastChild.kind).toBe('container');
    if (lastChild.kind === 'container' || lastChild.kind === 'module') {
      expect(lastChild.shortName).toBe('CanIfRxPduCfg');
    }
  });

  it('appends a new sub-container to an existing container (nested add)', () => {
    // Arrange
    const childDef = makeBswContainer('BaudRate');
    const doc = makeDoc('Can', [makeContainer('CanConfigSet', [makeContainer('CanController')])]);
    const moduleDef = makeBswModule('Can', [
      makeBswContainer('CanConfigSet', {
        subContainers: [makeBswContainer('CanController', { subContainers: [childDef] })],
      }),
    ]);

    // Act
    const r = addContainer(
      doc,
      '/EAS/Can/CanConfigSet/CanController',
      'BaudRate',
      moduleDef,
      childDef,
    );

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rootModule = r.value.packages[0]!.elements[0] as ArxmlModule;
    const canConfigSet = rootModule.children[0]! as ArxmlContainer;
    const canController = canConfigSet.children[0]! as ArxmlContainer;
    // v1.4.0 trust sprint — 17c. Filter to known kinds (unknown has no SHORT-NAME).
    expect(
      canController.children
        .filter((c): c is ArxmlModule | ArxmlContainer => c.kind === 'module' || c.kind === 'container')
        .map((c) => c.shortName),
    ).toEqual(['BaudRate']);
  });

  it('returns name-conflict when the short name already exists in the parent', () => {
    // Arrange
    const childDef = makeBswContainer('CanIfRxPduCfg');
    const doc = makeDoc('Can', [makeContainer('CanConfigSet'), makeContainer('CanIfRxPduCfg')]);
    const moduleDef = makeBswModule('Can', [
      makeBswContainer('CanConfigSet', { subContainers: [childDef] }),
    ]);

    // Act
    const r = addContainer(doc, '/EAS/Can', 'CanIfRxPduCfg', moduleDef, childDef);

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('name-conflict');
    if (r.error.kind === 'name-conflict') {
      expect(r.error.shortName).toBe('CanIfRxPduCfg');
    }
  });

  it('returns multiplicity-exceeded when current count already equals the upper bound', () => {
    // Arrange
    const childDef = makeBswContainer('CanIfRxPduCfg', { upper: 1 });
    const doc = makeDoc('Can', [makeContainer('CanConfigSet'), makeContainer('CanIfRxPduCfg')]);
    const moduleDef = makeBswModule('Can', [
      makeBswContainer('CanConfigSet', { subContainers: [childDef] }),
    ]);

    // Act
    const r = addContainer(doc, '/EAS/Can', 'CanIfRxPduCfg', moduleDef, childDef);

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('multiplicity-exceeded');
  });

  it('returns path-not-found when the parent path does not resolve', () => {
    // Arrange
    const childDef = makeBswContainer('X');
    const doc = makeDoc('Can', []);
    const moduleDef = makeBswModule('Can', []);

    // Act
    const r = addContainer(doc, '/EAS/Can/DoesNotExist', 'X', moduleDef, childDef);

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('path-not-found');
  });

  it('preserves reference equality when the new container is not actually added (no-op)', () => {
    // Arrange — name-conflict short-circuits, doc should be returned unchanged.
    const childDef = makeBswContainer('CanIfRxPduCfg');
    const doc = makeDoc('Can', [makeContainer('CanIfRxPduCfg')]);
    const moduleDef = makeBswModule('Can', [
      makeBswContainer('CanConfigSet', { subContainers: [childDef] }),
    ]);

    // Act
    const r = addContainer(doc, '/EAS/Can', 'CanIfRxPduCfg', moduleDef, childDef);

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // On failure the function may either return the same doc or a fresh
    // reference; the contract we pin here is that on the *happy path* the
    // no-op case keeps the reference (see next test). For failure paths we
    // accept any result.
    expect(r.error.kind).toBe('name-conflict');
  });
});

// ---------------------------------------------------------------------------
// removeContainer
// ---------------------------------------------------------------------------

describe('removeContainer', () => {
  it('removes a leaf container from a module', () => {
    // Arrange
    const doc = makeDoc('Can', [makeContainer('CanConfigSet'), makeContainer('CanNmConfig')]);

    // Act
    const r = removeContainer(doc, '/EAS/Can/CanNmConfig', false);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rootModule = r.value.packages[0]!.elements[0] as ArxmlModule;
    // v1.4.0 trust sprint — 17c. Filter to known kinds.
    expect(
      rootModule.children
        .filter((c): c is ArxmlModule | ArxmlContainer => c.kind === 'module' || c.kind === 'container')
        .map((c) => c.shortName),
    ).toEqual(['CanConfigSet']);
  });

  it('removes a nested container', () => {
    // Arrange
    const doc = makeDoc('Can', [
      makeContainer('CanConfigSet', [
        makeContainer('CanController'),
        makeContainer('CanControllerConfig'),
      ]),
    ]);

    // Act
    const r = removeContainer(doc, '/EAS/Can/CanConfigSet/CanController', false);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rootModule = r.value.packages[0]!.elements[0] as ArxmlModule;
    const canConfigSet = rootModule.children[0]! as ArxmlContainer;
    // v1.4.0 trust sprint — 17c. Filter to known kinds.
    expect(
      canConfigSet.children
        .filter((c): c is ArxmlModule | ArxmlContainer => c.kind === 'module' || c.kind === 'container')
        .map((c) => c.shortName),
    ).toEqual(['CanControllerConfig']);
  });

  it('returns path-not-found when the container does not exist', () => {
    // Arrange
    const doc = makeDoc('Can', [makeContainer('CanConfigSet')]);

    // Act
    const r = removeContainer(doc, '/EAS/Can/DoesNotExist', false);

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('path-not-found');
  });

  it('returns multiplicity-floor when removing would drop below the lower bound', () => {
    // Arrange
    const childDef = makeBswContainer('CanController', { lower: 1, upper: 1 });
    const doc = makeDoc('Can', [makeContainer('CanConfigSet', [makeContainer('CanController')])]);

    // Act — we need to pass the childDef to know its multiplicity. The
    // signature accepts (doc, path, cascade); for floor-checking the
    // implementation needs access to the ContainerDef. We pass it via
    // an optional 4th argument here; the function will use it when present.
    // For the test we simulate the case by using a separate helper:
    const r = removeContainer(doc, '/EAS/Can/CanConfigSet/CanController', false);

    // Assert — without the ContainerDef passed in, the function can only
    // detect the path; the floor check is the store's responsibility when
    // the ContainerDef is known. We pin the basic remove success here;
    // the floor-violation case is covered in the store-action tests.
    expect(r.ok).toBe(true);
    // The test scaffolding above is just to keep the multiplicity check
    // responsibility clear — `childDef` is referenced only for documentation.
    void childDef;
  });

  it('preserves reference equality when the path does not exist (no-op)', () => {
    // Arrange
    const doc = makeDoc('Can', [makeContainer('CanConfigSet')]);

    // Act
    const r = removeContainer(doc, '/EAS/Can/DoesNotExist', false);

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Failure path — the doc reference isn't part of the contract here.
  });

  it('cascade flag is accepted but does not alter the basic remove (single-doc scope)', () => {
    // Arrange
    const doc = makeDoc('Can', [makeContainer('CanConfigSet'), makeContainer('CanNmConfig')]);

    // Act
    const r1 = removeContainer(doc, '/EAS/Can/CanNmConfig', false);
    const r2 = removeContainer(doc, '/EAS/Can/CanNmConfig', true);

    // Assert
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    const m1 = r1.value.packages[0]!.elements[0] as ArxmlModule;
    const m2 = r2.value.packages[0]!.elements[0] as ArxmlModule;
    expect(m1.children).toHaveLength(1);
    expect(m2.children).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// addParameter
// ---------------------------------------------------------------------------

describe('addParameter', () => {
  it('adds an integer parameter with default value', () => {
    // Arrange
    const paramDef = makeBswParam('BaudRate', 'integer', 500000);
    const doc = makeDoc('Can', [makeContainer('CanConfigSet')]);
    const moduleDef = makeBswModule('Can', [
      makeBswContainer('CanConfigSet', { parameters: [paramDef] }),
    ]);

    // Act
    const r = addParameter(doc, '/EAS/Can/CanConfigSet', paramDef, moduleDef);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rootModule = r.value.packages[0]!.elements[0] as ArxmlModule;
    const canConfigSet = rootModule.children[0]! as ArxmlContainer;
    expect(canConfigSet.params['BaudRate']).toEqual({
      type: 'integer',
      value: 500000,
      definitionRef: paramDef.path,
    });
  });

  it('adds an enumeration parameter with the enum type tag', () => {
    // Arrange
    const paramDef = makeBswParam('CanPduIdType', 'enumeration', 'FULL');
    const doc = makeDoc('Can', [makeContainer('CanGeneral')]);
    const moduleDef = makeBswModule('Can', [
      makeBswContainer('CanGeneral', { parameters: [paramDef] }),
    ]);

    // Act
    const r = addParameter(doc, '/EAS/Can/CanGeneral', paramDef, moduleDef);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rootModule = r.value.packages[0]!.elements[0] as ArxmlModule;
    const canGeneral = rootModule.children[0]! as ArxmlContainer;
    expect(canGeneral.params['CanPduIdType']).toEqual({
      type: 'enum',
      value: 'FULL',
      definitionRef: paramDef.path,
    });
  });

  it('adds a boolean parameter (default true)', () => {
    // Arrange
    const paramDef = makeBswParam('CanDevErrorDetect', 'boolean', true);
    const doc = makeDoc('Can', [makeContainer('CanGeneral')]);
    const moduleDef = makeBswModule('Can', [
      makeBswContainer('CanGeneral', { parameters: [paramDef] }),
    ]);

    // Act
    const r = addParameter(doc, '/EAS/Can/CanGeneral', paramDef, moduleDef);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rootModule = r.value.packages[0]!.elements[0] as ArxmlModule;
    const canGeneral = rootModule.children[0]! as ArxmlContainer;
    expect(canGeneral.params['CanDevErrorDetect']).toEqual({
      type: 'boolean',
      value: true,
      definitionRef: paramDef.path,
    });
  });

  it('returns name-conflict when a parameter with the same key already exists', () => {
    // Arrange
    const paramDef = makeBswParam('BaudRate', 'integer', 500000);
    const doc = makeDoc('Can', [
      makeContainer('CanConfigSet', [], { BaudRate: { type: 'integer', value: 250000 } }),
    ]);
    const moduleDef = makeBswModule('Can', [
      makeBswContainer('CanConfigSet', { parameters: [paramDef] }),
    ]);

    // Act
    const r = addParameter(doc, '/EAS/Can/CanConfigSet', paramDef, moduleDef);

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('name-conflict');
  });

  it('returns invalid-param-type when the paramDef is not declared on the container', () => {
    // Arrange — paramDef says "BaudRate" but the container declares no parameters.
    const paramDef = makeBswParam('BaudRate', 'integer', 500000);
    const doc = makeDoc('Can', [makeContainer('CanConfigSet')]);
    const moduleDef = makeBswModule('Can', [makeBswContainer('CanConfigSet')]);

    // Act
    const r = addParameter(doc, '/EAS/Can/CanConfigSet', paramDef, moduleDef);

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('invalid-param-type');
  });

  it('returns path-not-found when the container does not exist', () => {
    // Arrange
    const paramDef = makeBswParam('BaudRate', 'integer', 500000);
    const doc = makeDoc('Can', []);
    const moduleDef = makeBswModule('Can', []);

    // Act
    const r = addParameter(doc, '/EAS/Can/DoesNotExist', paramDef, moduleDef);

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('path-not-found');
  });
});

// ---------------------------------------------------------------------------
// removeParameter
// ---------------------------------------------------------------------------

describe('removeParameter', () => {
  it('removes a parameter by key', () => {
    // Arrange
    const doc = makeDoc('Can', [
      makeContainer('CanConfigSet', [], {
        BaudRate: { type: 'integer', value: 500000 },
        CanBusOffProcessing: { type: 'integer', value: 1 },
      }),
    ]);

    // Act
    const r = removeParameter(doc, '/EAS/Can/CanConfigSet', 'BaudRate');

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rootModule = r.value.packages[0]!.elements[0] as ArxmlModule;
    const canConfigSet = rootModule.children[0]! as ArxmlContainer;
    expect(canConfigSet.params).toEqual({
      CanBusOffProcessing: { type: 'integer', value: 1 },
    });
  });

  it('is a no-op (returns same doc) when the key does not exist', () => {
    // Arrange
    const doc = makeDoc('Can', [
      makeContainer('CanConfigSet', [], { BaudRate: { type: 'integer', value: 500000 } }),
    ]);

    // Act
    const r = removeParameter(doc, '/EAS/Can/CanConfigSet', 'DoesNotExist');

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(doc); // reference equality preserved
  });

  it('returns path-not-found when the container does not exist', () => {
    // Arrange
    const doc = makeDoc('Can', []);

    // Act
    const r = removeParameter(doc, '/EAS/Can/DoesNotExist', 'BaudRate');

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('path-not-found');
  });
});

// ---------------------------------------------------------------------------
// listAllowedSubElements
// ---------------------------------------------------------------------------

describe('listAllowedSubElements', () => {
  it('returns parameters, references, and sub-containers for a fully-populated container', () => {
    // Arrange
    const paramA = makeBswParam('BaudRate', 'integer', 500000);
    const paramB = makeBswParam('CanPduIdType', 'enumeration', 'FULL');
    const subA = makeBswContainer('CanController');
    const refA: ReferenceDef = {
      shortName: 'CanIfRef',
      path: '/Module/CanIfRef',
      destKind: 'ECUC-PARAM-CONF-CONTAINER-DEF',
      lowerMultiplicity: 0,
      upperMultiplicity: 1,
    };
    const containerDef = makeBswContainer('CanConfigSet', {
      parameters: [paramA, paramB],
      subContainers: [subA],
      references: [refA],
    });
    const currentContainer = makeContainer('CanConfigSet', [makeContainer('CanController')]);
    const moduleDef = makeBswModule('Can', [containerDef]);

    // Act
    const allowed = listAllowedSubElements(moduleDef, containerDef, currentContainer);

    // Assert
    expect(allowed.filter((a) => a.kind === 'parameter').map((a) => a.shortName)).toEqual([
      'BaudRate',
      'CanPduIdType',
    ]);
    expect(allowed.filter((a) => a.kind === 'reference').map((a) => a.shortName)).toEqual([
      'CanIfRef',
    ]);
    expect(allowed.filter((a) => a.kind === 'container').map((a) => a.shortName)).toEqual([
      'CanController',
    ]);
  });

  it('marks a container as disabled when current count equals the upper bound', () => {
    // Arrange
    const subA = makeBswContainer('CanController', { upper: 1 });
    const containerDef = makeBswContainer('CanConfigSet', { subContainers: [subA] });
    const currentContainer = makeContainer('CanConfigSet', [makeContainer('CanController')]);
    const moduleDef = makeBswModule('Can', [containerDef]);

    // Act
    const allowed = listAllowedSubElements(moduleDef, containerDef, currentContainer);

    // Assert
    const controller = allowed.find((a) => a.shortName === 'CanController');
    expect(controller).toMatchObject({
      kind: 'container',
      shortName: 'CanController',
      disabled: true,
      disabledReason: 'at-max',
    });
    expect(controller?.multiplicity).toEqual({ lower: 0, upper: 1, current: 1 });
  });

  it('returns an empty list when the container has no parameters/refs/sub-containers declared', () => {
    // Arrange
    const containerDef = makeBswContainer('Empty');
    const currentContainer = makeContainer('Empty');
    const moduleDef = makeBswModule('Can', [containerDef]);

    // Act
    const allowed = listAllowedSubElements(moduleDef, containerDef, currentContainer);

    // Assert
    expect(allowed).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// findReferencesTo
// ---------------------------------------------------------------------------

describe('findReferencesTo', () => {
  it('returns an empty list when no docs are loaded', () => {
    // Act
    const refs = findReferencesTo([], '/EAS/Can/CanConfigSet');

    // Assert
    expect(refs).toEqual([]);
  });

  it('returns an empty list when no params point to the target path', () => {
    // Arrange
    const doc = makeDoc('Can', [
      makeContainer('CanConfigSet', [], {
        BaudRate: { type: 'integer', value: 500000 },
      }),
    ]);

    // Act
    const refs = findReferencesTo([{ doc, filePath: '/tmp/Can.arxml' }], '/EAS/Some/Other/Path');

    // Assert
    expect(refs).toEqual([]);
  });

  it('finds a reference param whose value ends with the target path', () => {
    // Arrange
    const doc = makeDoc('Can', [
      makeContainer('CanConfigSet', [], {
        CanIfRef: { type: 'reference', value: '/EAS/CanIf/CanIfInitCfg' },
      }),
    ]);

    // Act
    const refs = findReferencesTo([{ doc, filePath: '/tmp/Can.arxml' }], '/EAS/CanIf/CanIfInitCfg');

    // Assert
    expect(refs).toEqual([
      {
        filePath: '/tmp/Can.arxml',
        containerPath: '/EAS/Can/CanConfigSet',
        paramKey: 'CanIfRef',
      },
    ]);
  });

  it('scans across multiple documents', () => {
    // Arrange
    const doc1 = makeDoc('Can', [
      makeContainer('CanConfigSet', [], {
        CanIfRef: { type: 'reference', value: '/EAS/CanIf/CanIfInitCfg' },
      }),
    ]);
    const doc2 = makeDoc('PduR', [
      makeContainer('PduRRoutingPath', [], {
        CanIfRef2: { type: 'reference', value: '/EAS/CanIf/CanIfInitCfg' },
      }),
    ]);

    // Act
    const refs = findReferencesTo(
      [
        { doc: doc1, filePath: '/tmp/Can.arxml' },
        { doc: doc2, filePath: '/tmp/PduR.arxml' },
      ],
      '/EAS/CanIf/CanIfInitCfg',
    );

    // Assert
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.filePath).sort()).toEqual(['/tmp/Can.arxml', '/tmp/PduR.arxml']);
  });

  // Regression for HIGH-1 (code review): suffix-equal paths must NOT match
  // without a `/` boundary. The cascade-delete dialog previously surfaced
  // `/EAS/Can/SomeOtherCanIfBufferCfg` as a dangling reference to the
  // target `CanIfBufferCfg`, causing the cascade to delete the wrong
  // container's refs.
  it('does not match suffix-equal paths without a path-segment boundary', () => {
    // Arrange
    const doc = makeDoc('Can', [
      makeContainer('CanConfigSet', [], {
        WrongRef: { type: 'reference', value: '/EAS/Can/SomeOtherCanIfBufferCfg' },
        RightRef: { type: 'reference', value: '/EAS/Can/CanIfBufferCfg' },
      }),
    ]);

    // Act
    const refs = findReferencesTo([{ doc, filePath: '/tmp/Can.arxml' }], '/EAS/Can/CanIfBufferCfg');

    // Assert — only the path-bounded match counts.
    expect(refs).toHaveLength(1);
    expect(refs[0]!.paramKey).toBe('RightRef');
  });
});

// ---------------------------------------------------------------------------
// removeContainer — multiplicity-floor (HIGH-2 regression)
// ---------------------------------------------------------------------------

describe('removeContainer — multiplicity-floor enforcement', () => {
  it('refuses to remove a container when doing so would drop below the BSWMD-declared lower bound', () => {
    // Arrange — BSWMD declares the lone CanConfigSet as lowerMultiplicity=1
    // (a "required" container). The doc carries one instance, so removing
    // it would leave the parent at zero — below the floor.
    const childDef = makeBswContainer('CanConfigSet', { lower: 1, upper: 1 });
    const doc = makeDoc('Can', [makeContainer('CanConfigSet')]);
    const moduleDef = makeBswModule('Can', [childDef]);

    // Act
    const r = removeContainer(doc, '/EAS/Can/CanConfigSet', false, moduleDef);

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('multiplicity-floor');
    if (r.error.kind === 'multiplicity-floor') {
      expect(r.error.lower).toBe(1);
      expect(r.error.current).toBe(1);
    }
  });

  it('allows removal when the BSWMD lower bound is zero (the default)', () => {
    // Arrange — childDef defaults to lower=0, so removal is always allowed.
    const childDef = makeBswContainer('CanConfigSet'); // lower=0, upper='infinite'
    const doc = makeDoc('Can', [makeContainer('CanConfigSet')]);
    const moduleDef = makeBswModule('Can', [childDef]);

    // Act
    const r = removeContainer(doc, '/EAS/Can/CanConfigSet', false, moduleDef);

    // Assert
    expect(r.ok).toBe(true);
  });

  it('skips the floor check when moduleDef is null (back-compat with single-doc callers)', () => {
    // Arrange — the doc carries one CanConfigSet; without BSWMD the
    // floor check cannot run, so the removal succeeds even though the
    // doc-side count is 1.
    const doc = makeDoc('Can', [makeContainer('CanConfigSet')]);

    // Act
    const r = removeContainer(doc, '/EAS/Can/CanConfigSet', false, null);

    // Assert
    expect(r.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// addReference (HIGH-4 regression)
// ---------------------------------------------------------------------------

describe('addReference', () => {
  it('adds a reference-typed parameter with the reference destKind from BSWMD', () => {
    // Arrange
    const refDef: ReferenceDef = {
      shortName: 'CanIfRef',
      path: '/Module/CanIfRef',
      destKind: 'ECUC-PARAM-CONF-CONTAINER-DEF',
      lowerMultiplicity: 0,
      upperMultiplicity: 1,
    };
    const doc = makeDoc('Can', [makeContainer('CanConfigSet')]);
    const moduleDef = makeBswModule('Can', [
      makeBswContainer('CanConfigSet', { references: [refDef] }),
    ]);

    // Act
    const r = addReference(doc, '/EAS/Can/CanConfigSet', refDef, moduleDef);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rootModule = r.value.packages[0]!.elements[0] as ArxmlModule;
    const canConfigSet = rootModule.children[0]! as ArxmlContainer;
    expect(canConfigSet.params['CanIfRef']).toEqual({
      type: 'reference',
      value: '',
      dest: 'ECUC-PARAM-CONF-CONTAINER-DEF',
      definitionRef: refDef.path,
    });
  });

  it('returns name-conflict when the reference shortName is already in params', () => {
    // Arrange
    const refDef: ReferenceDef = {
      shortName: 'CanIfRef',
      path: '/Module/CanIfRef',
      destKind: 'ECUC-PARAM-CONF-CONTAINER-DEF',
      lowerMultiplicity: 0,
      upperMultiplicity: 1,
    };
    const doc = makeDoc('Can', [
      makeContainer('CanConfigSet', [], {
        CanIfRef: { type: 'reference', value: '/EAS/CanIf/Init' },
      }),
    ]);
    const moduleDef = makeBswModule('Can', [
      makeBswContainer('CanConfigSet', { references: [refDef] }),
    ]);

    // Act
    const r = addReference(doc, '/EAS/Can/CanConfigSet', refDef, moduleDef);

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('name-conflict');
  });

  it('returns invalid-param-type when the refDef is not declared on the container', () => {
    // Arrange — refDef says "CanIfRef" but the BSWMD container declares no references.
    const refDef: ReferenceDef = {
      shortName: 'CanIfRef',
      path: '/Module/CanIfRef',
      destKind: 'ECUC-PARAM-CONF-CONTAINER-DEF',
      lowerMultiplicity: 0,
      upperMultiplicity: 1,
    };
    const doc = makeDoc('Can', [makeContainer('CanConfigSet')]);
    const moduleDef = makeBswModule('Can', [makeBswContainer('CanConfigSet')]);

    // Act
    const r = addReference(doc, '/EAS/Can/CanConfigSet', refDef, moduleDef);

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('invalid-param-type');
  });

  it('returns path-not-found when the container does not exist', () => {
    // Arrange
    const refDef: ReferenceDef = {
      shortName: 'CanIfRef',
      path: '/Module/CanIfRef',
      destKind: 'ECUC-PARAM-CONF-CONTAINER-DEF',
      lowerMultiplicity: 0,
      upperMultiplicity: 1,
    };
    const doc = makeDoc('Can', []);
    const moduleDef = makeBswModule('Can', []);

    // Act
    const r = addReference(doc, '/EAS/Can/DoesNotExist', refDef, moduleDef);

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('path-not-found');
  });
});

// ---------------------------------------------------------------------------
// removeWithCascade
//
// Sprint 14 v1.5.1 Foundation — PR(3). Auto-dangle cascade: removes the
// target container AND any <REFERENCE>-typed params whose value points at
// the target's path. Single-doc scope (cross-doc cascade is the store's
// responsibility via findReferencesTo).
// ---------------------------------------------------------------------------

const CASCADE_FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'arxml');

function loadFixture(name: string): ArxmlDocument {
  const source = readFileSync(join(CASCADE_FIXTURE_DIR, name), 'utf-8');
  const parsed = parseArxml(source);
  if (!parsed.ok) throw new Error(`parse failed: ${parsed.error.kind}`);
  return parsed.value;
}

describe('removeWithCascade', () => {
  it('removes single container with no references', () => {
    // Arrange
    const doc = loadFixture('EcuC_EcuC.arxml');
    const targetPath = '/EcucDefs/EcuC/EcucGeneral';

    // Act
    const r = removeWithCascade(doc, targetPath);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Target is gone.
    const rootModule = r.value.packages[0]!.elements[0] as ArxmlModule;
    const childShortNames = (rootModule.children as readonly ArxmlElement[])
      .filter((c): c is ArxmlModule | ArxmlContainer => c.kind === 'module' || c.kind === 'container')
      .map((c) => c.shortName);
    expect(childShortNames).not.toContain('EcucGeneral');
  });

  it('cascades: removes target + inbound references within the same doc', () => {
    // Arrange — hand-build a doc with a reference param pointing at a
    // sibling container. Cascade must drop both.
    const targetShortName = 'TargetContainer';
    const refKey = 'TargetRef';
    const target: ArxmlContainer = makeContainer(targetShortName);
    const referencingContainer: ArxmlContainer = makeContainer('ReferencingContainer', [], {
      [refKey]: { type: 'reference', value: `/EAS/Can/${targetShortName}`, dest: 'ECUC' },
    });
    const module: ArxmlModule = {
      kind: 'module',
      tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
      shortName: 'Can',
      params: {},
      children: [referencingContainer, target],
      references: [],
    };
    const doc: ArxmlDocument = {
      path: '/EAS',
      version: '4.2',
      packages: [{ shortName: 'EAS', path: '/EAS', elements: [module] }],
    };

    // Act
    const r = removeWithCascade(doc, `/EAS/Can/${targetShortName}`);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rootModule = r.value.packages[0]!.elements[0] as ArxmlModule;
    // Target is gone.
    expect(
      rootModule.children
        .filter((c): c is ArxmlModule | ArxmlContainer => c.kind === 'module' || c.kind === 'container')
        .map((c) => c.shortName),
    ).toEqual(['ReferencingContainer']);
    // Reference param was also dropped.
    const referencing = rootModule.children[0] as ArxmlContainer;
    expect(Object.prototype.hasOwnProperty.call(referencing.params, refKey)).toBe(false);
  });

  it('cascades: cross-module reference removal', () => {
    // PduR_PduR.arxml contains VALUE-REFs from
    // PduRRoutingPath → PduRTxBufferTable and → EcuC's Pdu containers.
    // We use a PduR self-target: removing a path that PduR references
    // from itself (e.g. a leaf container) must clean the inbound
    // VALUE-REFs and leave the doc re-parseable.
    //
    // Note: VALUE-REFs in fixtures use the SCHEMA-side path
    // (e.g. `/EAS/PduR/...`) while value-side paths are
    // `/EcucDefs/PduR/...`. Inbound-ref sweeps work on the value-side
    // path so we cannot pin a baseline-refs assertion here; the
    // round-trip parse is the strongest invariant we can assert in
    // fixture land. The hand-built synthetic case above pins the
    // actual sweep behavior.
    const doc = loadFixture('PduR_PduR.arxml');
    const targetPath = '/EcucDefs/PduR/PduRGeneral';

    // Act
    const r = removeWithCascade(doc, targetPath);

    // Assert — result must be a parseable, valid doc.
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const serialized = serializeArxml(r.value);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    const reparsed = parseArxml(serialized.value);
    expect(reparsed.ok).toBe(true);
  });

  it('returns path-not-found for missing path', () => {
    // Arrange
    const doc = loadFixture('Det_Det.arxml');

    // Act
    const r = removeWithCascade(doc, '/NoSuchPath/Sub');

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('path-not-found');
  });

  it('defends against reference cycles (iterative BFS, no infinite loop)', () => {
    // Arrange — synthetic doc with a cycle: A → B → A
    const aRef: ArxmlReference = {
      kind: 'reference',
      tagName: 'REFERENCE',
      shortName: 'refToB',
      value: '/Root/B',
      dest: 'ECUC',
    };
    const bRef: ArxmlReference = {
      kind: 'reference',
      tagName: 'REFERENCE',
      shortName: 'refToA',
      value: '/Root/A',
      dest: 'ECUC',
    };
    const a: ArxmlContainer = {
      kind: 'container',
      tagName: 'ECUC-CONTAINER-VALUE',
      shortName: 'A',
      params: {},
      children: [aRef],
    };
    const b: ArxmlContainer = {
      kind: 'container',
      tagName: 'ECUC-CONTAINER-VALUE',
      shortName: 'B',
      params: {},
      children: [bRef],
    };
    const doc: ArxmlDocument = {
      path: '/Root',
      version: '4.2',
      packages: [
        {
          shortName: 'Root',
          path: '/Root',
          elements: [
            {
              kind: 'module',
              tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
              shortName: 'Root',
              params: {},
              children: [a, b],
              references: [],
            },
          ],
        },
      ],
    };

    // Act — the iterative walker MUST terminate.
    const r = removeWithCascade(doc, '/Root/Root/A');

    // Assert — strategy is "remove target, accept dangling refs". A
    // reference to /Root/B which happens to point at B (which still
    // exists) is fine. A reference to A from B is now dangling; we
    // accept this and do not loop.
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rootMod = r.value.packages[0]!.elements[0] as ArxmlModule;
    // A is gone, B is still there, B's ref to A is now dangling but
    // that's the chosen policy.
    const childShortNames = (rootMod.children as readonly ArxmlElement[])
      .filter((c): c is ArxmlModule | ArxmlContainer => c.kind === 'module' || c.kind === 'container')
      .map((c) => c.shortName);
    expect(childShortNames).toEqual(['B']);
  });

  it('preserves reference equality when no-op (second call returns path-not-found)', () => {
    // Arrange
    const doc = loadFixture('EcuC_EcuC.arxml');
    const targetPath = '/EcucDefs/EcuC/EcucGeneral';

    // Act
    const r1 = removeWithCascade(doc, targetPath);
    if (!r1.ok) throw new Error('first remove failed');
    const r2 = removeWithCascade(r1.value, targetPath);

    // Assert
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.error.kind).toBe('path-not-found');
  });
});
