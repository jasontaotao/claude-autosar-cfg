import { describe, it, expect } from 'vitest';
import { loadChoiceMacros } from '../choices-loader.js';

describe('loadChoiceMacros', () => {
  it('returns the macro map for a known module', () => {
    const macros = loadChoiceMacros('EcuC');
    expect(macros).toBeDefined();
    expect(typeof macros).toBe('object');
    expect(macros).toEqual({ EcucPartitionChoice: 'EcuC_USE_OS_PARTITION' });
  });

  it('returns empty object for unknown module', () => {
    const macros = loadChoiceMacros('NotRegistered');
    expect(macros).toEqual({});
  });
});
