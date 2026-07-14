import { describe, expect, it } from 'vitest';

import type { ArxmlElement } from '@core/arxml/types.js';

import { groupSiblingsByShortName, maxCollectionSize } from '../collections.js';

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
