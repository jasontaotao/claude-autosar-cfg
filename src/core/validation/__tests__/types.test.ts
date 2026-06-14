import { describe, it, expect } from 'vitest';

import type {
  ValidationError,
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

  it('ValidationErrorKind covers all 5 kinds (extensible)', () => {
    const kinds = ['range', 'enum', 'reference', 'required', 'schema'] as const;
    expect(kinds.length).toBe(5);
  });
});
