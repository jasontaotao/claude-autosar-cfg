import { describe, it, expect } from 'vitest';

import { selectParamMode } from '../modes.js';

describe('selectParamMode', () => {
  it('returns "string" for plain string param', () => {
    const v = { type: 'string', value: 'hello' } as const;
    expect(selectParamMode(v, 'Name')).toBe('string');
  });

  it('returns "multiline" for string param whose key contains "Comment"', () => {
    const v = { type: 'string', value: 'note' } as const;
    expect(selectParamMode(v, 'Comment')).toBe('multiline');
    expect(selectParamMode(v, 'PreComment')).toBe('multiline');
    expect(selectParamMode(v, 'UserComment')).toBe('multiline');
  });

  it('returns "multiline" for string param whose key starts with "Description"', () => {
    const v = { type: 'string', value: 'long text' } as const;
    expect(selectParamMode(v, 'Description')).toBe('multiline');
    expect(selectParamMode(v, 'Description_2')).toBe('multiline');
  });

  it('returns "integer" for integer param', () => {
    const v = { type: 'integer', value: 42 } as const;
    expect(selectParamMode(v, 'Count')).toBe('integer');
  });

  it('returns "float" for float param', () => {
    const v = { type: 'float', value: 3.14 } as const;
    expect(selectParamMode(v, 'Ratio')).toBe('float');
  });

  it('returns "boolean" for boolean param', () => {
    const v = { type: 'boolean', value: true } as const;
    expect(selectParamMode(v, 'Enabled')).toBe('boolean');
  });

  it('returns "enum" for enum param', () => {
    const v = { type: 'enum', value: 'STD_ON' } as const;
    expect(selectParamMode(v, 'Mode')).toBe('enum');
  });

  it('returns "reference" for reference param', () => {
    const v = { type: 'reference', value: '/EAS/Sig' } as const;
    expect(selectParamMode(v, 'SignalRef')).toBe('reference');
  });
});
