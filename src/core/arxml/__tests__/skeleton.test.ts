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

import type { BswModuleDef, ContainerDef } from '../../project/bswmd.js';
import { generateEcucSkeleton, resolveCollisionFilename } from '../skeleton.js';
import type { ArxmlContainer, ArxmlModule } from '../types.js';

// ---------------------------------------------------------------------------
// Hand-built fixtures
// ---------------------------------------------------------------------------

function makeBswContainer(
  shortName: string,
  subContainers: readonly ContainerDef[] = [],
): ContainerDef {
  return {
    shortName,
    path: `/Module/${shortName}`,
    lowerMultiplicity: 0,
    upperMultiplicity: 1,
    subContainers,
    parameters: [],
    references: [],
    choices: [],
  };
}

function makeBswModule(
  shortName: string,
  containers: readonly ContainerDef[] = [],
): BswModuleDef {
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
    expect(child.tagName).toBe('ECUC-CONFIGURATION-CONTAINER');
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
// resolveCollisionFilename (T3 signature + body, T3 tests land in T3)
// ---------------------------------------------------------------------------

describe('resolveCollisionFilename (T3 stub surface)', () => {
  // These assertions are intentionally minimal — T3 owns the full test
  // contract. They exist here only to confirm T2 ships a callable function
  // with the right signature, so T3 can build on top of it without having to
  // re-touch the file.

  it('is exported and callable with an empty pick set', () => {
    const result = resolveCollisionFilename([], 'C:/proj');
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });
});
