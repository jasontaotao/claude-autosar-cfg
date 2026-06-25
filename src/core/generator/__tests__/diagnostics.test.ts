// core/generator/__tests__/diagnostics.test.ts
// Pin the contract of the Diagnostic channel: severity, code, and shape.

import { describe, expect, it } from 'vitest';

import { DiagnosticSeverity, DiagnosticCode, type Diagnostic } from '../diagnostics.js';

describe('DiagnosticSeverity', () => {
  it('exposes ERROR / WARNING / INFO', () => {
    expect(DiagnosticSeverity.ERROR).toBe('ERROR');
    expect(DiagnosticSeverity.WARNING).toBe('WARNING');
    expect(DiagnosticSeverity.INFO).toBe('INFO');
  });
});

describe('DiagnosticCode', () => {
  it('exposes the 12 documented codes', () => {
    expect(DiagnosticCode.ECUC_GEN_NO_SCHEMA).toBe('ECUC-GEN-001');
    expect(DiagnosticCode.ECUC_GEN_NO_GENERATOR).toBe('ECUC-GEN-002');
    expect(DiagnosticCode.ECUC_GEN_THROW).toBe('ECUC-GEN-003');
    expect(DiagnosticCode.ECUC_GEN_REF_UNRESOLVED).toBe('ECUC-GEN-010');
    expect(DiagnosticCode.ECUC_GEN_MULTIPLICITY).toBe('ECUC-GEN-011');
    expect(DiagnosticCode.ECUC_GEN_TYPE_MISMATCH).toBe('ECUC-GEN-012');
    expect(DiagnosticCode.ECUC_GEN_RANGE).toBe('ECUC-GEN-013');
    expect(DiagnosticCode.ECUC_GEN_ORDERING).toBe('ECUC-GEN-020');
    expect(DiagnosticCode.ECUC_GEN_DUPLICATE_SHORTNAME).toBe('ECUC-GEN-021');
    expect(DiagnosticCode.ECUC_GEN_TEMPLATE_RENDER).toBe('ECUC-GEN-030');
    expect(DiagnosticCode.ECUC_GEN_OUTPUT_WRITE).toBe('ECUC-GEN-031');
    expect(DiagnosticCode.ECUC_GEN_INFO_EMPTY_VARIANT).toBe('ECUC-GEN-INFO-001');
  });
});

describe('Diagnostic', () => {
  it('is constructible with required fields only', () => {
    const d: Diagnostic = {
      severity: DiagnosticSeverity.ERROR,
      code: DiagnosticCode.ECUC_GEN_THROW,
      message: 'oops',
    };
    expect(d.severity).toBe('ERROR');
    expect(d.code).toBe('ECUC-GEN-003');
    expect(d.moduleShortName).toBeUndefined();
    expect(d.bswmdPath).toBeUndefined();
    expect(d.ecucPath).toBeUndefined();
    expect(d.line).toBeUndefined();
  });
});
