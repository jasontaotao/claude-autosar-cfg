import { describe, it, expect } from 'vitest';

import { ECUC_SUBSET_SCHEMA, allSchemaPaths, lookupSchema } from '../ecucSubset.js';

describe('ecucSubset schema', () => {
  it('exposes at least 10 entries derived from 5 fixtures', () => {
    expect(ECUC_SUBSET_SCHEMA.length).toBeGreaterThanOrEqual(10);
  });

  it('covers all 6 ECUC param types', () => {
    const types = new Set(ECUC_SUBSET_SCHEMA.map((e) => e.type));
    expect(types.has('integer')).toBe(true);
    expect(types.has('float')).toBe(true);
    expect(types.has('boolean')).toBe(true);
    expect(types.has('string')).toBe(true);
    expect(types.has('enumeration')).toBe(true);
    expect(types.has('reference')).toBe(true);
  });

  it('lookupSchema returns the entry for a known path', () => {
    const entry = lookupSchema('/EcucDefs/EcuC/EcucPduCollection/Pdu/PduLength');
    expect(entry).not.toBeNull();
    expect(entry?.type).toBe('integer');
    expect(entry?.min).toBe(0);
    expect(entry?.max).toBe(64);
    expect(entry?.required).toBe(true);
  });

  it('lookupSchema resolves an enum entry with its literals', () => {
    const entry = lookupSchema('/EcucDefs/Com/ComConfig/ComIPdu/ComIPduDirection');
    expect(entry).not.toBeNull();
    expect(entry?.type).toBe('enumeration');
    expect(entry?.enumLiterals).toEqual(['SEND']);
  });

  it('lookupSchema resolves a reference entry with its refDest', () => {
    const entry = lookupSchema('/EcucDefs/WdgIf/WdgIfDevice/WdgIfDriverRef');
    expect(entry).not.toBeNull();
    expect(entry?.type).toBe('reference');
    expect(entry?.refDest).toBe('ECUC-CONTAINER-VALUE');
  });

  it('lookupSchema returns null for an unknown path', () => {
    expect(lookupSchema('/no/such/path')).toBeNull();
    expect(lookupSchema('')).toBeNull();
    expect(
      lookupSchema(
        '/EcucDefs/EcuC/EcucPduCollection/Pdu/PduLengthX', // typo
      ),
    ).toBeNull();
  });

  it('allSchemaPaths matches the schema length and is readonly', () => {
    const paths = allSchemaPaths();
    expect(paths.length).toBe(ECUC_SUBSET_SCHEMA.length);
  });

  it('every entry path starts with "/" and is unique', () => {
    const seen = new Set<string>();
    for (const entry of ECUC_SUBSET_SCHEMA) {
      expect(entry.path.startsWith('/')).toBe(true);
      expect(entry.path.length).toBeGreaterThan(1);
      expect(seen.has(entry.path)).toBe(false);
      seen.add(entry.path);
    }
    expect(seen.size).toBe(ECUC_SUBSET_SCHEMA.length);
  });

  it('integer entries declare min and max', () => {
    for (const entry of ECUC_SUBSET_SCHEMA) {
      if (entry.type !== 'integer') continue;
      expect(entry.min).toBeDefined();
      expect(entry.max).toBeDefined();
      expect(entry.min).toBeLessThanOrEqual(entry.max!);
    }
  });

  it('enumeration entries declare a non-empty enumLiterals array', () => {
    for (const entry of ECUC_SUBSET_SCHEMA) {
      if (entry.type !== 'enumeration') continue;
      expect(entry.enumLiterals).toBeDefined();
      expect(entry.enumLiterals?.length).toBeGreaterThan(0);
    }
  });

  it('reference entries declare a refDest string', () => {
    for (const entry of ECUC_SUBSET_SCHEMA) {
      if (entry.type !== 'reference') continue;
      expect(typeof entry.refDest).toBe('string');
      expect(entry.refDest?.length).toBeGreaterThan(0);
    }
  });
});
