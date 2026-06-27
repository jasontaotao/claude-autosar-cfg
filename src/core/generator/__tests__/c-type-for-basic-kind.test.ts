// src/core/generator/__tests__/c-type-for-basic-kind.test.ts
//
// v1.15.1 PATCH (B-5.4) + v1.15.2 PATCH (M-1.2) — unit tests for
// `cTypeForBasicKind`. The helper covers the 4 named basic-kind arms
// that are byte-identical between EcuC and Mcu generators
// (boolean / string / float / enumeration). v1.15.2 PATCH (M-1.1)
// removed the `default: 'uint8'` arm — unknown-kind semantics now
// live in the unified `cTypeForKind(def, moduleKind)` dispatcher
// (see `c-type-for-kind.test.ts` test 11) and the runtime
// `return 'uint8'` backstop at the bottom of `cTypeForBasicKind`
// is defense-in-depth only.
// The `integer` arm stays per-module via the unified dispatcher
// (EcuC: `integerToCType(min, max)`, Mcu: hardcoded `'uint32'`).
// EcuC's `reference` and `function-name` arms also stay per-module
// (Mcu doesn't model those kinds yet).

import { describe, it, expect } from 'vitest';

import { cTypeForBasicKind } from '../modules/_shared.js';

describe('cTypeForBasicKind (v1.15.1 PATCH B-5)', () => {
  it('boolean → uint8', () => {
    expect(cTypeForBasicKind('boolean')).toBe('uint8');
  });

  it('string → const char*', () => {
    expect(cTypeForBasicKind('string')).toBe('const char*');
  });

  it('float → float32', () => {
    expect(cTypeForBasicKind('float')).toBe('float32');
  });

  it('enumeration → uint8', () => {
    expect(cTypeForBasicKind('enumeration')).toBe('uint8');
  });
});