// src/core/generator/__tests__/c-type-for-basic-kind.test.ts
//
// v1.15.1 PATCH (B-5.4) — unit tests for `cTypeForBasicKind`.
// The helper covers the 5 arms that are byte-identical
// between EcuC and Mcu generators. Per v1.14.3 PATCH-I C-2
// fix, the default arm returns `'uint8'` (same as EcuC +
// Mcu). The `integer` arm stays per-module (EcuC uses
// `integerToCType(min, max)`, Mcu hardcodes `'uint32'`).
// EcuC's `reference` and `function-name` arms also stay
// per-module (Mcu doesn't model those kinds yet).

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
