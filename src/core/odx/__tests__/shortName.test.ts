import { describe, expect, it } from 'vitest';

import { dedupeShortName, legalizeShortName } from '../shortName.js';

describe('legalizeShortName', () => {
  it('replaces invalid characters and prefixes numeric names', () => {
    expect(legalizeShortName('Read DID 0xF1', 'x')).toBe('Read_DID_0xF1');
    expect(legalizeShortName('1ABC', 'x')).toBe('N_1ABC');
    expect(legalizeShortName('', '_abc')).toBe('Unnamed_abc');
    expect(legalizeShortName('x'.repeat(200), 'x')).toHaveLength(128);
  });
});

describe('dedupeShortName', () => {
  it('appends deterministic suffixes', () => {
    expect(dedupeShortName('Foo', new Set())).toBe('Foo');
    expect(dedupeShortName('Foo', new Set(['Foo']))).toBe('Foo_2');
    expect(dedupeShortName('Foo', new Set(['Foo', 'Foo_2']))).toBe('Foo_3');
  });
});
