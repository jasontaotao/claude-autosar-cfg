// core/arxml/__tests__/defaultValue.test.ts
// Pin the contract of the shared default-value builder.

import { describe, expect, it } from 'vitest';

import type { ContainerDef, ParamDef } from '../../project/bswmd.js';
import { buildDefaultValue, fillParamsFromBswmd } from '../defaultValue.js';

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
    expect(buildDefaultValue(pd('enumeration', 'POLLING'))).toEqual({
      type: 'enum',
      value: 'POLLING',
    });
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
    expect(buildDefaultValue(pd('function-name', 'MyFn'))).toEqual({
      type: 'string',
      value: 'MyFn',
    });
  });
});

// ---------------------------------------------------------------------------
// Sprint X Phase 1 — fillParamsFromBswmd shared helper
// ---------------------------------------------------------------------------
//
// Extracted from skeleton.ts (v1.9.0) into a shared module so mutation
// layer and skeleton can both call the same default-fill logic. The
// signature is `Record<string, ParamValue>` keyed by the param shortName;
// each cell carries the BSWMD-side path on `definitionRef` so the
// serializer can emit a `<DEFINITION-REF DEST="ECUC-XXX-PARAM-DEF">`
// pointing at the schema definition rather than the synthesized
// `/__synthesized__/<shortName>` placeholder.

describe('fillParamsFromBswmd', () => {
  it('returns a typed ParamValue cell with definitionRef for each parameter', () => {
    const def: ContainerDef = {
      shortName: 'C',
      path: '/Module/C',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [
        {
          shortName: 'SampleValidBitSet',
          path: '/Module/C/SampleValidBitSet',
          kind: 'integer',
          defaultValue: 0,
          minValue: 0,
          maxValue: 255,
          minLength: null,
          maxLength: null,
          enumerationLiterals: [],
        },
      ],
      references: [],
      choices: [],
    };
    const out = fillParamsFromBswmd(def);
    expect(out.SampleValidBitSet).toBeDefined();
    expect(out.SampleValidBitSet).toEqual({
      type: 'integer',
      value: 0,
      definitionRef: '/Module/C/SampleValidBitSet',
    });
  });

  it('returns an empty record for a container with no parameters', () => {
    const def: ContainerDef = {
      shortName: 'Empty',
      path: '/Module/Empty',
      lowerMultiplicity: 0,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [],
      references: [],
      choices: [],
    };
    expect(fillParamsFromBswmd(def)).toEqual({});
  });

  it('produces a string placeholder for null-default string / enum params', () => {
    // Pre-S2 code only filled non-null defaults; S2 introduced the empty
    // string placeholder so the user gets an editable cell in the
    // ParamEditor. This pins that contract for the shared helper.
    const def: ContainerDef = {
      shortName: 'C',
      path: '/Module/C',
      lowerMultiplicity: 0,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [
        {
          shortName: 'NoDefaultString',
          path: '/Module/C/NoDefaultString',
          kind: 'string',
          defaultValue: null,
          minValue: null,
          maxValue: null,
          minLength: null,
          maxLength: null,
          enumerationLiterals: [],
        },
        {
          shortName: 'NoDefaultEnum',
          path: '/Module/C/NoDefaultEnum',
          kind: 'enumeration',
          defaultValue: null,
          minValue: null,
          maxValue: null,
          minLength: null,
          maxLength: null,
          enumerationLiterals: ['A', 'B'],
        },
      ],
      references: [],
      choices: [],
    };
    const out = fillParamsFromBswmd(def);
    expect(out.NoDefaultString).toEqual({
      type: 'string',
      value: '',
      definitionRef: '/Module/C/NoDefaultString',
    });
    expect(out.NoDefaultEnum).toEqual({
      type: 'enum',
      value: '',
      definitionRef: '/Module/C/NoDefaultEnum',
    });
  });
});
