import { describe, it, expect } from 'vitest';

import type {
  ValidationError,
  ValidationErrorKind,
  ValidationResult,
  EcucSchemaEntry,
  EcucParamType,
} from '../types.js';

describe('validation types', () => {
  it('ValidationError carries kind/path/message and optional fields', () => {
    const e: ValidationError = {
      kind: 'range',
      path: '/EcucDefs/EcuC/Pdu/PduLength',
      paramKey: 'PduLength',
      message: 'Value 9 above max 8',
      expected: '<= 8',
      actual: '9',
    };
    expect(e.kind).toBe('range');
    expect(e.path).toBe('/EcucDefs/EcuC/Pdu/PduLength');
    expect(e.paramKey).toBe('PduLength');
    expect(e.message).toMatch(/above max/);
  });

  it('ValidationError works without optional fields (element-level ref error)', () => {
    const e: ValidationError = {
      kind: 'reference',
      path: '/EAS/PduR/Routing/RoutingTable',
      message: 'DEST mismatch',
    };
    expect(e.paramKey).toBeUndefined();
    expect(e.expected).toBeUndefined();
  });

  it('ValidationResult discriminated union branches on ok', () => {
    const ok: ValidationResult = { ok: true, errors: [] };
    const err: ValidationResult = { ok: false, error: 'schema compile failed' };
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.errors).toEqual([]);
    expect(err.ok).toBe(false);
    if (!err.ok) expect(err.error).toMatch(/compile/);
  });

  it('EcucSchemaEntry accepts all 6 ECUC types with type-specific fields', () => {
    const types: EcucParamType[] = [
      'integer',
      'float',
      'boolean',
      'string',
      'enumeration',
      'reference',
    ];
    expect(types.length).toBe(6);

    const intEntry: EcucSchemaEntry = {
      path: '/EcucDefs/EcuC/Pdu/PduLength',
      type: 'integer',
      min: 0,
      max: 8,
      required: true,
    };
    expect(intEntry.min).toBe(0);
    expect(intEntry.max).toBe(8);

    const enumEntry: EcucSchemaEntry = {
      path: '/EcucDefs/EcuC/Pdu/PduType',
      type: 'enumeration',
      enumLiterals: ['STANDARD_CAN', 'STANDARD_CAN_FD'],
    };
    expect(enumEntry.enumLiterals).toContain('STANDARD_CAN');

    const refEntry: EcucSchemaEntry = {
      path: '/EcucDefs/EcuC/Pdu/PduRef',
      type: 'reference',
      refDest: 'ECUC-REFERENCE-DEF',
    };
    expect(refEntry.refDest).toBe('ECUC-REFERENCE-DEF');
  });

  it('ValidationErrorKind union enumerates every kind declared in types.ts', () => {
    // The canonical source of truth is `types.ts:ValidationErrorKind`.
    // Keep this list in lockstep when adding a new kind; the check
    // makes the contract explicit so the compiler complains on drift.
    // As of Sprint 9 #2 the union has 8 members:
    //   range, enum, reference, required, schema, multiplicity,
    //   cross-ref, ref-dest
    const kinds: readonly ValidationErrorKind[] = [
      'range',
      'enum',
      'reference',
      'required',
      'schema',
      'multiplicity',
      'cross-ref',
      'ref-dest',
    ];
    expect(kinds.length).toBe(8);
  });
});
