import { describe, expect, it } from 'vitest';

import type { ReferenceDef } from '../bswmd.js';

describe('ReferenceDef.destDialect (C10)', () => {
  it('accepts ReferenceDef without destDialect (back-compat)', () => {
    const ref: ReferenceDef = {
      shortName: 'Ref',
      path: '/Module/Ref',
      destKind: 'ECUC-REFERENCE-DEF',
      lowerMultiplicity: 0,
      upperMultiplicity: 1,
    };
    expect(ref.destDialect).toBeUndefined();
  });

  it('accepts ReferenceDef with destDialect = P-PORT', () => {
    const ref: ReferenceDef = {
      shortName: 'Ref',
      path: '/PortGroup/Ref',
      destKind: 'ECUC-FOREIGN-REFERENCE-DEF',
      lowerMultiplicity: 0,
      upperMultiplicity: 1,
      destDialect: 'P-PORT',
    };
    expect(ref.destDialect).toBe('P-PORT');
  });

  it('accepts all four destDialect values', () => {
    const dialects: ReadonlyArray<NonNullable<ReferenceDef['destDialect']>> = [
      'P-PORT',
      'R-PORT',
      'SW-C',
      'ECUC-MODULE-DEF',
    ];
    for (const d of dialects) {
      const ref: ReferenceDef = {
        shortName: 'Ref',
        path: '/Ref',
        destKind: 'ECUC-FOREIGN-REFERENCE-DEF',
        lowerMultiplicity: 0,
        upperMultiplicity: 1,
        destDialect: d,
      };
      expect(ref.destDialect).toBe(d);
    }
  });
});
