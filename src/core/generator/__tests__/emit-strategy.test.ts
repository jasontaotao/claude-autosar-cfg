import { describe, it, expect } from 'vitest';

import { emitConstDecl, emitExternDecl, emitLoaderEntry } from '../emit/strategy.js';
import { cType, cValue } from '../handlebars-helpers.js';

const intDef = { kind: 'integer', min: 0, max: 255 } as const;
const intArrDef = { kind: 'integer', min: 0, max: 255 } as const;

describe('emitConstDecl (PreCompile)', () => {
  it('emits scalar CONST with type and value', () => {
    const s = emitConstDecl({
      ident: 'EcuC_X',
      def: intDef,
      value: 42,
      isArray: false,
      cType: cType(intDef),
      cValue: cValue(42, intDef),
    });
    expect(s).toBe('CONST(uint8, AUTOMATIC) uint8 EcuC_X = 42;');
  });

  it('emits array CONST with brace-enclosed values', () => {
    const s = emitConstDecl({
      ident: 'EcuC_X',
      def: intArrDef,
      value: [1, 2, 3],
      isArray: true,
      cType: cType(intArrDef),
      cValue: cValue(0, intArrDef),
    });
    expect(s).toBe('CONST(uint8, AUTOMATIC) uint8 EcuC_X[3] = { 1, 2, 3 };');
  });
});

describe('emitExternDecl (Link)', () => {
  it('emits scalar extern', () => {
    const s = emitExternDecl({
      ident: 'EcuC_X',
      cType: cType(intDef),
      isArray: false,
    });
    expect(s).toBe('extern CONST(uint8, AUTOMATIC) uint8 EcuC_X;');
  });

  it('emits array extern with size', () => {
    const s = emitExternDecl({
      ident: 'EcuC_X',
      cType: cType(intArrDef),
      isArray: true,
      arrayLen: 3,
    });
    expect(s).toBe('extern CONST(uint8, AUTOMATIC) uint8 EcuC_X[3];');
  });
});

describe('emitLoaderEntry (PostBuild)', () => {
  it('emits scalar static declaration', () => {
    const s = emitLoaderEntry({
      ident: 'EcuC_X',
      cType: cType(intDef),
      isArray: false,
      value: 42,
    });
    expect(s).toBe('static uint8 EcuC_X;');
  });

  it('emits array static with loader entry line', () => {
    const s = emitLoaderEntry({
      ident: 'EcuC_X',
      cType: cType(intArrDef),
      isArray: true,
      arrayLen: 3,
      offset: 0,
      value: 42,
    });
    expect(s).toContain('static uint8 EcuC_X[3];');
    expect(s).toContain('*(uint8*)((uintptr_t)baseAddr + 0x00u) = 42;');
  });
});
