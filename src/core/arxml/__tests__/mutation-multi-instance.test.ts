// v1.8.4 Bug 2 — addContainer must allow multi-instance containers.
//
// Previously mutation.ts:145-147 unconditionally rejected any 2nd
// sibling with the same shortName via `name-conflict`, even when the
// BSWMD declared `upperMultiplicity: 'infinite'` (or any value > 1).
// AUTOSAR ECUC spec permits multiple instances of any container with
// `upper > 1` or `upper = infinite` — examples include multiple `Pdu`
// under one `Com`, or multiple `DemEventParameter` under one
// `DemEventSet`. The check was overzealous.
//
// Fix: drop Step 3 name-conflict guard for containers. When a sibling
// with the same shortName already exists, auto-suffix the new container
// with `_${n}` where `n` starts at 1 and walks up until no collision.
// This matches Vector CANdb++ default naming. Multiplicity-ceiling
// (Step 2) still fires first when `current >= upper`, so the suffix loop
// never produces more instances than the BSWMD allows.
//
// Note: parameter uniqueness is preserved by `addParameter` (separate
// code path) — parameter shortNames MUST be unique within a container.

import { describe, it, expect } from 'vitest';

import {
  addContainer,
} from '../mutation.js';
import type { BswModuleDef, ContainerDef, ParamDef, ReferenceDef } from '../../project/bswmd.js';
import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlModule,
  ParamValue,
} from '../types.js';

// ---------------------------------------------------------------------------
// Hand-built fixtures (mirror the helpers in mutation.test.ts but
// kept inline to keep this regression file self-contained)
// ---------------------------------------------------------------------------

function makeDoc(
  moduleShortName: string,
  containers: readonly ArxmlContainer[] = [],
): ArxmlDocument {
  const moduleEl: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: moduleShortName,
    params: {} as Readonly<Record<string, ParamValue>>,
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

function makeContainer(shortName: string): ArxmlContainer {
  return {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName,
    params: {} as Readonly<Record<string, ParamValue>>,
    children: [],
  };
}

function makeBswContainer(
  shortName: string,
  opts: {
    lower?: number;
    upper?: number | 'infinite';
  } = {},
): ContainerDef {
  return {
    shortName,
    path: `/Module/${shortName}`,
    lowerMultiplicity: opts.lower ?? 0,
    upperMultiplicity: opts.upper ?? 'infinite',
    subContainers: [],
    parameters: [] as readonly ParamDef[],
    references: [] as readonly ReferenceDef[],
    choices: [],
    multiplicityConfigClasses: [],
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
    multiplicityConfigClasses: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('addContainer multi-instance (v1.8.4 Bug 2 fix)', () => {
  it('appends a 2nd sibling with the same shortName as `_1` when upper=infinite', () => {
    // Arrange
    const childDef = makeBswContainer('Pdu');
    const doc = makeDoc('Com', [makeContainer('Pdu')]);
    const moduleDef = makeBswModule('Com', [
      makeBswContainer('Pdu'),
    ]);

    // Act
    const r = addContainer(doc, '/EAS/Com', 'Pdu', moduleDef, childDef);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rootModule = r.value.packages[0]!.elements[0] as ArxmlModule;
    const children = rootModule.children.filter(
      (c): c is ArxmlContainer => c.kind === 'container',
    );
    expect(children.map((c) => c.shortName)).toEqual(['Pdu', 'Pdu_1']);
  });

  it('appends a 3rd sibling as `_2` after `_1` is already taken', () => {
    // Arrange
    const childDef = makeBswContainer('Pdu');
    const doc = makeDoc('Com', [makeContainer('Pdu'), makeContainer('Pdu_1')]);
    const moduleDef = makeBswModule('Com', [makeBswContainer('Pdu')]);

    // Act
    const r = addContainer(doc, '/EAS/Com', 'Pdu', moduleDef, childDef);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rootModule = r.value.packages[0]!.elements[0] as ArxmlModule;
    const children = rootModule.children.filter(
      (c): c is ArxmlContainer => c.kind === 'container',
    );
    expect(children.map((c) => c.shortName)).toEqual(['Pdu', 'Pdu_1', 'Pdu_2']);
  });

  it('returns multiplicity-exceeded (NOT name-conflict) when finite upper is exhausted', () => {
    // Arrange: upper=2, two 'CanController' siblings already exist; adding
    // a 3rd must hit Step 2 multiplicity ceiling, NOT the (now-removed)
    // name-conflict. The fixture constructs 2 literal 'CanController'
    // children directly (the test runs against the now-permitted
    // multi-instance behaviour).
    const childDef = makeBswContainer('CanController', { upper: 2 });
    const doc = makeDoc('Can', [makeContainer('CanController'), makeContainer('CanController')]);
    const moduleDef = makeBswModule('Can', [makeBswContainer('CanController', { upper: 2 })]);

    // Act
    const r = addContainer(doc, '/EAS/Can', 'CanController', moduleDef, childDef);

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('multiplicity-exceeded');
  });

  it('appends the suffixed `_1` even when the user picked an already-colliding shortName', () => {
    // Regression for the case where the picker resolves to a shortName
    // that already exists in the parent (e.g. user clicks Add Container
    // twice for the same def in the BSWMD picker). The store action must
    // not throw — the core layer guarantees a unique path via suffix.
    const childDef = makeBswContainer('CanIfRxPduCfg');
    const doc = makeDoc('Can', [makeContainer('CanConfigSet'), makeContainer('CanIfRxPduCfg')]);
    const moduleDef = makeBswModule('Can', [
      makeBswContainer('CanConfigSet', { subContainers: [childDef] }),
    ]);

    const r = addContainer(doc, '/EAS/Can', 'CanIfRxPduCfg', moduleDef, childDef);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rootModule = r.value.packages[0]!.elements[0] as ArxmlModule;
    const child = rootModule.children[2]!;
    expect(child.kind).toBe('container');
    if (child.kind === 'container') {
      expect(child.shortName).toBe('CanIfRxPduCfg_1');
    }
  });
});