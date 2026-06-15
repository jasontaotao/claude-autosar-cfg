// Unit tests for Sprint 9 #3 — `resolveTargetPath` pure helper.
//
// Extracted in Sprint 9 #3 to be the *single source of truth* for the
// cross-ref path-resolution pipeline used by `checkCrossRefs`,
// `checkRefDests`, and `checkRefCycles`. This file pins the helper's
// contract independently of caller behavior so future refactors (e.g.
// adding a third operation) cannot silently break the composition.

import { describe, it, expect } from 'vitest';

import { resolveTargetPath } from '../index.js';

describe('resolveTargetPath', () => {
  it("passes through the empty string unchanged (placeholder filter is the caller's job)", () => {
    expect(resolveTargetPath('')).toBe('');
  });

  it('rewrites /EAS/ to /EcucDefs/ (namespace normalisation)', () => {
    expect(resolveTargetPath('/EAS/EcuC/SomeContainer/P1')).toBe('/EcucDefs/EcuC/SomeContainer/P1');
  });

  it('passes through /EcucDefs/ unchanged (already value-side)', () => {
    expect(resolveTargetPath('/EcucDefs/EcuC/SomeContainer/P1')).toBe(
      '/EcucDefs/EcuC/SomeContainer/P1',
    );
  });

  it('strips a /Pdu/ type segment (schema-side type-strip)', () => {
    expect(resolveTargetPath('/EcucDefs/EcuC/EcucPduCollection/Pdu/P1')).toBe(
      '/EcucDefs/EcuC/EcucPduCollection/P1',
    );
  });

  it('applies both operations in sequence: /EAS + /Pdu/ → /EcucDefs without /Pdu/', () => {
    // Combined: namespace rewrite first, then type-segment strip.
    expect(resolveTargetPath('/EAS/EcuC/EcucPduCollection/Pdu/P1')).toBe(
      '/EcucDefs/EcuC/EcucPduCollection/P1',
    );
  });

  it('is case-sensitive: lowercase /pdu/ is NOT stripped (ECUC type segments are uppercase)', () => {
    expect(resolveTargetPath('/EcucDefs/EcuC/EcucPduCollection/pdu/P1')).toBe(
      '/EcucDefs/EcuC/EcucPduCollection/pdu/P1',
    );
  });

  it('passes through paths with no known type segment and no namespace mismatch', () => {
    expect(resolveTargetPath('/EcucDefs/Com/ComConfig/SomeContainer')).toBe(
      '/EcucDefs/Com/ComConfig/SomeContainer',
    );
  });

  it('strips all four known type segments (Pdu / ComIPdu / ComSignal / ComIPduGroup)', () => {
    const known = ['Pdu', 'ComIPdu', 'ComSignal', 'ComIPduGroup'];
    for (const seg of known) {
      expect(resolveTargetPath(`/EcucDefs/Com/Parent/${seg}/Child`)).toBe(
        `/EcucDefs/Com/Parent/Child`,
      );
    }
  });
});
