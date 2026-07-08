// v1.37.0 MINOR T1 (C1) — ref-equality contract tests for the
// `core/project/setters.ts` mutation helpers.
//
// The C1 review finding was that `setParamInDocument` /
// `addChildInDocument` / `removeChildInDocument` mutated
// `doc.packages[].elements[]` in place via the legacy
// `spliceContainer` helper. The post-fix contract is: every helper
// returns a NEW `ArxmlDocument` reference, leaving the caller's
// source tree untouched. Reference-equality (`next !== doc`) is the
// authoritative "did anything change?" signal.
//
// These tests pin that contract by:
//   1. Asserting the returned ref differs from the input on a real
//      mutation.
//   2. Asserting the input doc tree is unchanged after the call.
//   3. Asserting the new doc reflects the requested mutation.
//   4. `removeChildInDocument` also has a no-op short-circuit (same
//      ref when nothing matched) — pinned via a third test.
//
// Hand-built fixtures (no parser / fs I/O) keep the tests focused on
// the helpers under test. The fixture mirrors the 2-layer
// `pkg.elements` + `pkg.packages[*].elements` shape that
// `findContainerByPath` walks.

import { describe, it, expect } from 'vitest';

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ArxmlPackage,
  ParamValue,
} from '../../arxml/types.js';
import {
  setParamInDocument,
  addChildInDocument,
  removeChildInDocument,
} from '../setters.js';

// ---------------------------------------------------------------------------
// Fixture — minimal 2-layer doc: 1 top-level pkg → 1 sub-pkg → 1
// module → 1 container → 1 integer param. Path to the container is
// `/EcucDefs/Can/CanConfigSet/CanGeneral`.
// ---------------------------------------------------------------------------

const PARAM_NAME = 'CanBusSpeed';
const ORIGINAL_VALUE = 500000;

function makeParam(type: ParamValue['type'], value: ParamValue['value']): ParamValue {
  if (type === 'integer') return { type, value: value as number };
  if (type === 'float') return { type, value: value as number };
  if (type === 'boolean') return { type, value: value as boolean };
  return { type, value: value as string };
}

function makeModule(shortName: string, children: readonly ArxmlElement[]): ArxmlModule {
  return {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName,
    params: {},
    children,
    references: [],
  };
}

function makeContainer(
  shortName: string,
  children: readonly ArxmlElement[] = [],
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

const TARGET_CONTAINER = makeContainer('CanGeneral', [], {
  [PARAM_NAME]: makeParam('integer', ORIGINAL_VALUE),
});

const ROOT_MODULE = makeModule('CanConfigSet', [TARGET_CONTAINER]);
const INNER_PKG: ArxmlPackage = {
  shortName: 'Can',
  path: '/EcucDefs/Can',
  elements: [ROOT_MODULE],
};
const OUTER_PKG: ArxmlPackage = {
  shortName: 'EcucDefs',
  path: '/EcucDefs',
  elements: [],
  packages: [INNER_PKG],
};

function loadFixture(): ArxmlDocument {
  return {
    path: '',
    version: '4.0',
    packages: [OUTER_PKG],
  };
}

/**
 * Drill into the fixture and return the CanGeneral container.
 * The fixture shape is hand-built (`EcucDefs > Can > CanConfigSet >
 * CanGeneral`), so the cast is safe — but we narrow at each step
 * to keep TypeScript happy with the `ArxmlElement` union.
 */
function findTargetContainer(
  doc: ArxmlDocument,
): ArxmlContainer {
  const inner = doc.packages[0]?.packages?.[0];
  if (inner === undefined) throw new Error('fixture missing inner package');
  const moduleEl = inner.elements[0];
  if (moduleEl === undefined || moduleEl.kind !== 'module') {
    throw new Error('fixture missing module');
  }
  const container = moduleEl.children[0];
  if (container === undefined || container.kind !== 'container') {
    throw new Error('fixture missing target container');
  }
  return container;
}

const CONTAINER_PATH = '/EcucDefs/Can/CanConfigSet/CanGeneral';

// ---------------------------------------------------------------------------
// T1 (C1) — ref-equality contract tests
// ---------------------------------------------------------------------------

describe('v1.37.0 MINOR T1 (C1) — setParamInDocument immutability', () => {
  it('returns a NEW doc ref; source tree untouched; mutation visible in new doc', () => {
    // Arrange
    const doc = loadFixture();
    const originalRef = doc;
    const sourceContainer = findTargetContainer(doc);
    expect(sourceContainer.params[PARAM_NAME]?.value).toBe(ORIGINAL_VALUE);

    // Act
    const next = setParamInDocument(doc, CONTAINER_PATH, PARAM_NAME, {
      type: 'integer',
      value: 1000000,
    });

    // Assert — return is a different reference
    expect(next).not.toBe(originalRef);

    // Assert — source doc's params unchanged (same container ref
    // + same param value)
    const sourceContainerAfter = findTargetContainer(doc);
    expect(sourceContainerAfter).toBe(sourceContainer);
    expect(sourceContainerAfter.params[PARAM_NAME]?.value).toBe(ORIGINAL_VALUE);

    // Assert — mutation is visible in the new doc
    const nextContainer = findTargetContainer(next);
    expect(nextContainer.params[PARAM_NAME]?.value).toBe(1000000);
  });
});

describe('v1.37.0 MINOR T1 (C1) — addChildInDocument immutability', () => {
  it('returns a NEW doc ref; source tree untouched; new child present in new doc', () => {
    // Arrange
    const doc = loadFixture();
    const originalRef = doc;
    const shortName = `NewChild_${Date.now()}`;
    const sourceContainer = findTargetContainer(doc);
    const originalChildren = sourceContainer.children;
    const originalLen = originalChildren.length;
    expect(originalLen).toBe(0);

    // Act
    const next = addChildInDocument(doc, CONTAINER_PATH, shortName);

    // Assert
    expect(next).not.toBe(originalRef);
    // source doc's container children array ref is unchanged
    expect(findTargetContainer(doc).children).toBe(originalChildren);
    expect(originalChildren.length).toBe(0);

    // Assert — new doc has the child
    const nextChildren = findTargetContainer(next).children;
    expect(nextChildren.length).toBe(1);
    const firstChild = nextChildren[0];
    expect(firstChild).toBeDefined();
    if (firstChild === undefined || firstChild.kind === 'reference' || firstChild.kind === 'unknown') {
      throw new Error('expected a non-reference child container');
    }
    expect(firstChild.shortName).toBe(shortName);
  });
});

describe('v1.37.0 MINOR T1 (C1) — removeChildInDocument ref-equality contract', () => {
  it('returns a NEW doc ref when the child was removed; source tree untouched', () => {
    // Arrange — add a child, then remove it
    const doc = loadFixture();
    const shortName = `RemovableChild_${Date.now()}`;
    const withChild = addChildInDocument(doc, CONTAINER_PATH, shortName);
    const beforeChildren = findTargetContainer(withChild).children;
    expect(beforeChildren.length).toBe(1);

    // Act
    const afterRemove = removeChildInDocument(withChild, CONTAINER_PATH, shortName);

    // Assert
    expect(afterRemove).not.toBe(withChild);
    // withChild is unchanged (children array ref preserved)
    expect(findTargetContainer(withChild).children).toBe(beforeChildren);
    expect(beforeChildren.length).toBe(1);
    // afterRemove has the child removed
    expect(findTargetContainer(afterRemove).children.length).toBe(0);
  });

  it('returns the SAME doc ref when the target child does not exist (no-op short-circuit)', () => {
    // Arrange
    const doc = loadFixture();

    // Act — remove a non-existent child
    const next = removeChildInDocument(doc, CONTAINER_PATH, '__no_such_child__');

    // Assert — same ref preserved for short-circuit
    expect(next).toBe(doc);
  });
});