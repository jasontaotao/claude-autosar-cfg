import { describe, expect, it } from 'vitest';

import type { ArxmlContainer, ArxmlElement } from '@core/arxml/types.js';
import type { BswModuleDef, BswmdDocument, ContainerDef } from '@core/project/bswmd.js';

import { findMissingOptionalSiblings } from '../optionalContainers.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Build a value-side `ECUC-CONTAINER-VALUE` child with the given shortName. */
const makeChild = (shortName: string): ArxmlContainer => ({
  kind: 'container',
  tagName: 'ECUC-CONTAINER-VALUE',
  shortName,
  params: {},
  children: [],
});

/** Build a `ContainerDef` for a BSWMD sub-container. */
const makeContainerDef = (
  shortName: string,
  lowerMultiplicity: number,
  upperMultiplicity: number | 'infinite' = 1,
): ContainerDef => ({
  shortName,
  path: `/EAS/EcuC/EcuCGeneral/${shortName}`,
  lowerMultiplicity,
  upperMultiplicity,
  subContainers: [],
  parameters: [],
  references: [],
  choices: [],
});

/**
 * Build the standard `EAS > EcuC > EcuCGeneral` BSWMD module used by
 * both contract tests below. The `EcuCGeneral` parent exposes three
 * optional sub-containers so we can probe each return-field branch.
 */
function makeBswmd(params: {
  readonly cellUpper: number | 'infinite';
  readonly tempUpper: number;
}): readonly BswmdDocument[] {
  const ecuGeneralDef: ContainerDef = {
    shortName: 'EcuCGeneral',
    path: '/EAS/EcuC/EcuCGeneral',
    lowerMultiplicity: 1,
    upperMultiplicity: 1,
    subContainers: [
      makeContainerDef('Cell', 0, params.cellUpper),
      makeContainerDef('AFETempValidSet', 0, params.tempUpper),
      makeContainerDef('NeverOptional', 1, 1),
    ],
    parameters: [],
    references: [],
    choices: [],
  };
  const ecuModuleDef: BswModuleDef = {
    shortName: 'EcuC',
    path: '/EAS/EcuC',
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [ecuGeneralDef],
    providedEntries: [],
    lowerMultiplicity: 1,
    upperMultiplicity: 1,
  };
  return [{ version: '4.6', modules: [ecuModuleDef], warnings: [] }];
}

const PARENT_PATH = '/EAS/EcuC/EcuCGeneral';

// ---------------------------------------------------------------------------
// Contract tests for MissingOptionalSibling fields
// ---------------------------------------------------------------------------

describe('findMissingOptionalSiblings — definition identity', () => {
  it('does not surface an optional placeholder when custom instances already exist', () => {
    const definitionRef = '/EAS/EcuC/EcuCGeneral/Cell';
    const existingChildren = ['Cell_1', 'Cell_2', 'Cell_A'].map((shortName) => ({
      ...makeChild(shortName),
      definitionRef,
    }));
    const bswmd = makeBswmd({ cellUpper: 'infinite', tempUpper: 1 });

    const result = findMissingOptionalSiblings(bswmd, PARENT_PATH, existingChildren);

    expect(result.find((entry) => entry.cd.shortName === 'Cell')).toBeUndefined();
  });
});

describe('findMissingOptionalSiblings — MissingOptionalSibling fields', () => {
  it('suppresses missing placeholder when suffixed instances already exist', () => {
    // Existing value-tree children carry only the suffixed siblings
    // `Cell_1`, `Cell_2`, `Cell_3` — the bare `Cell` is absent. The
    // BSWMD declares `Cell` with lowerMultiplicity=0, so the cd IS
    // surfaced (the exact-shortName dedup misses on `Cell`). With
    // base-name grouping, all three suffixed siblings fold into the
    // `Cell` collection, so `currentCount === 3`.
    const existingChildren: readonly ArxmlElement[] = [
      makeChild('Cell_1'),
      makeChild('Cell_2'),
      makeChild('Cell_3'),
    ];
    const bswmd = makeBswmd({ cellUpper: 'infinite', tempUpper: 1 });

    const result = findMissingOptionalSiblings(bswmd, PARENT_PATH, existingChildren);
    expect(result.find((m) => m.cd.shortName === 'Cell')).toBeUndefined();
  });

  it('upperMultiplicity mirrors the BSWMD-declared upper bound (finite + infinite)', () => {
    // No existing children → `currentCount` for both entries is 0;
    // focus the assertion on the upper-bound round-trip.
    const existingChildren: readonly ArxmlElement[] = [];
    const bswmd = makeBswmd({ cellUpper: 'infinite', tempUpper: 1 });

    const result = findMissingOptionalSiblings(bswmd, PARENT_PATH, existingChildren);
    const cellEntry = result.find((m) => m.cd.shortName === 'Cell');
    const tempEntry = result.find((m) => m.cd.shortName === 'AFETempValidSet');

    expect(cellEntry).toBeDefined();
    expect(cellEntry?.upperMultiplicity).toBe('infinite');
    expect(tempEntry).toBeDefined();
    expect(tempEntry?.upperMultiplicity).toBe(1);
  });
});
