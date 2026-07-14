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

  // Session 238 / Bug 4 — stripSuffix widened from `_[0-9]+$` to
  // `_[^_]+$` so user-renamed ECUC containers (CanIfHrhCfg_A,
  // CanIfHrhCfg_aos, CanIfHrhCfg_v1, etc.) still collapse into the
  // same baseName group as their auto-suffixed siblings. The base
  // key is whatever the user typed before the LAST `_`, which
  // matches the mental model "rename however you want, the part
  // before the last underscore is the group".
  it('groups user-renamed siblings sharing the same base', () => {
    const elements = [
      makeContainer('CanIfHrhCfg'),
      makeContainer('CanIfHrhCfg_1'),
      makeContainer('CanIfHrhCfg_A'),
      makeContainer('CanIfHrhCfg_aos'),
      makeContainer('CanIfHrhCfg_v1'),
    ];
    const groups = groupSiblingsByShortName(elements);
    expect(groups.size).toBe(1);
    expect(groups.get('CanIfHrhCfg')?.length).toBe(5);
  });

  it('treats the LAST underscore as the suffix boundary', () => {
    // My_Cool_Container strips to My_Cool (peel off the trailing
    // `_Container`); My_Cool_Container_1 strips to
    // `My_Cool_Container` (peel off only the trailing `_1`); and
    // `My_Cool_Container_user_renamed` strips to
    // `My_Cool_Container_user`. So these three siblings belong to
    // THREE distinct base groups — the regex matches exactly one
    // trailing segment, never more. That is the correct
    // behaviour: `_<X>` is always the suffix boundary, the part
    // before the last `_` is the base.
    const elements = [
      makeContainer('My_Cool_Container'),
      makeContainer('My_Cool_Container_1'),
      makeContainer('My_Cool_Container_user_renamed'),
    ];
    const groups = groupSiblingsByShortName(elements);
    expect(groups.size).toBe(3);
    expect(groups.get('My_Cool')?.length).toBe(1);
    expect(groups.get('My_Cool_Container')?.length).toBe(1);
    expect(groups.get('My_Cool_Container_user')?.length).toBe(1);
  });

  it('keeps distinct bases separate even when suffixes look similar', () => {
    // CanIfHrhCfg_1 and CanIfHrhCfgBsw_1 must NOT merge — the
    // first's base is `CanIfHrhCfg`, the second's base is
    // `CanIfHrhCfgBsw`. Users rely on this when they rename to
    // make a fresh, intentionally-distinct container.
    const elements = [
      makeContainer('CanIfHrhCfg'),
      makeContainer('CanIfHrhCfg_1'),
      makeContainer('CanIfHrhCfgBsw'),
      makeContainer('CanIfHrhCfgBsw_1'),
    ];
    const groups = groupSiblingsByShortName(elements);
    expect(groups.size).toBe(2);
    expect(groups.get('CanIfHrhCfg')?.length).toBe(2);
    expect(groups.get('CanIfHrhCfgBsw')?.length).toBe(2);
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
