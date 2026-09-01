import { describe, expect, it } from 'vitest';

import type { ArxmlElement } from '@core/arxml/types.js';

import {
  groupSiblingsByShortName,
  groupSiblingsForCollection,
  maxCollectionSize,
} from '../collections.js';

const makeContainer = (shortName: string): ArxmlElement => ({
  kind: 'container',
  tagName: 'ECUC-CONTAINER-VALUE',
  shortName,
  definitionRef: 'AR-PACKAGE/REF',
  params: {},
  children: [],
});

describe('groupSiblingsByShortName', () => {
  it('returns empty Map for empty input', () => {
    expect(groupSiblingsByShortName([]).size).toBe(0);
  });

  it('groups siblings with same shortName', () => {
    const elements = [
      makeContainer('AFECellValidSet'),
      makeContainer('AFECellValidSet_1'),
      makeContainer('AFECellValidSet_2'),
      makeContainer('AFETempValidSet'),
    ];
    const groups = groupSiblingsByShortName(elements);
    expect(groups.size).toBe(2);
    expect(groups.get('AFECellValidSet')?.length).toBe(3);
    expect(groups.get('AFETempValidSet')?.length).toBe(1);
  });

  it('returns shortName without _N suffix as the base key', () => {
    const elements = [makeContainer('Cell'), makeContainer('Cell_1'), makeContainer('Cell_10')];
    const groups = groupSiblingsByShortName(elements);
    expect(groups.size).toBe(1);
    expect(groups.get('Cell')?.length).toBe(3);
  });
});

describe('groupSiblingsForCollection', () => {
  it('groups renamed custom instances by definition identity', () => {
    const definitionRef = '/EAS/EcuCDefs/EcuC/Cell';
    const elements = [
      makeContainer('Cell_1'),
      makeContainer('Cell_2'),
      makeContainer('Cell_A'),
    ].map((element) => (element.kind === 'container' ? { ...element, definitionRef } : element));

    const groups = groupSiblingsForCollection(elements);

    expect(groups.size).toBe(1);
    expect(groups.get('definition:/EAS/EcuCDefs/EcuC/Cell')?.label).toBe('Cell');
    expect(groups.get('definition:/EAS/EcuCDefs/EcuC/Cell')?.elements).toHaveLength(3);
  });

  it('falls back to numeric-suffix grouping when definition-ref is absent', () => {
    const noRef = (shortName: string): ArxmlElement => {
      const element = makeContainer(shortName);
      if (element.kind !== 'container') return element;
      const { definitionRef: _definitionRef, ...rest } = element;
      void _definitionRef;
      return rest;
    };
    const groups = groupSiblingsForCollection([noRef('Cell_1'), noRef('Cell_2'), noRef('Cell_A')]);

    expect(groups.get('name:Cell')?.elements).toHaveLength(2);
    expect(groups.get('name:Cell_A')?.elements).toHaveLength(1);
  });
});

describe('maxCollectionSize', () => {
  it('returns 0 for empty input', () => {
    expect(maxCollectionSize([])).toBe(0);
  });

  it('returns max group size', () => {
    const elements = [
      makeContainer('A'),
      makeContainer('B'),
      makeContainer('B_1'),
      makeContainer('C'),
      makeContainer('C_1'),
      makeContainer('C_2'),
    ];
    expect(maxCollectionSize(elements)).toBe(3);
  });
});
