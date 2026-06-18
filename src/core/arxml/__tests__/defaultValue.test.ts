// core/arxml/__tests__/defaultValue.test.ts
// Pin the contract of the shared default-value builder.

import { describe, expect, it } from 'vitest';

import type { ParamDef } from '../../project/bswmd.js';
import { buildDefaultValue } from '../defaultValue.js';

function pd(kind: ParamDef['kind'], defaultValue: ParamDef['defaultValue']): ParamDef {
  return {
    shortName: 'X',
    path: '/X',
    kind,
    defaultValue,
    minValue: null,
    maxValue: null,
    minLength: null,
    maxLength: null,
    enumerationLiterals: [],
  };
}

describe('buildDefaultValue', () => {
  it('integer with numeric default', () => {
    expect(buildDefaultValue(pd('integer', 42))).toEqual({ type: 'integer', value: 42 });
  });

  it('integer truncates float defaults', () => {
    expect(buildDefaultValue(pd('integer', 3.7))).toEqual({ type: 'integer', value: 3 });
  });

  it('integer accepts finite numeric strings', () => {
    expect(buildDefaultValue(pd('integer', '12'))).toEqual({ type: 'integer', value: 12 });
  });

  it('integer rejects non-finite strings', () => {
    expect(buildDefaultValue(pd('integer', 'abc'))).toBeNull();
  });

  it('float with numeric default', () => {
    expect(buildDefaultValue(pd('float', 0.5))).toEqual({ type: 'float', value: 0.5 });
  });

  it('boolean accepts boolean default', () => {
    expect(buildDefaultValue(pd('boolean', true))).toEqual({ type: 'boolean', value: true });
  });

  it('boolean returns null for numeric default', () => {
    // mutation's contract: caller must normalize upstream; do not silently
    // coerce 0/1 to false/true here.
    expect(buildDefaultValue(pd('boolean', 1))).toBeNull();
  });

  it('enumeration with string default', () => {
    expect(buildDefaultValue(pd('enumeration', 'POLLING'))).toEqual({ type: 'enum', value: 'POLLING' });
  });

  it('enumeration rejects numeric default', () => {
    expect(buildDefaultValue(pd('enumeration', 1))).toBeNull();
  });

  it('string with string default', () => {
    expect(buildDefaultValue(pd('string', 'hello'))).toEqual({ type: 'string', value: 'hello' });
  });

  it('string coerces number to its string form', () => {
    expect(buildDefaultValue(pd('string', 42))).toEqual({ type: 'string', value: '42' });
  });

  it('function-name with string default', () => {
    expect(buildDefaultValue(pd('function-name', 'MyFn'))).toEqual({ type: 'string', value: 'MyFn' });
  });
});
