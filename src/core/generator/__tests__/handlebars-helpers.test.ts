import { describe, it, expect } from 'vitest';

import { cIdent } from '../handlebars-helpers.js';

describe('cIdent', () => {
  it('joins slash-separated path with underscores', () => {
    expect(cIdent('Mcu/Clock/ClockDivider')).toBe('Mcu_Clock_ClockDivider');
  });

  it('replaces dashes with underscores', () => {
    expect(cIdent('EcuC-PartitionConfig')).toBe('EcuC_PartitionConfig');
  });

  it('replaces dots with underscores', () => {
    expect(cIdent('Mcu.Clock.Divider')).toBe('Mcu_Clock_Divider');
  });

  it('strips leading/trailing whitespace', () => {
    expect(cIdent('  EcuC  ')).toBe('EcuC');
  });

  it('preserves already-valid identifiers unchanged', () => {
    expect(cIdent('EcuC_Partition_0')).toBe('EcuC_Partition_0');
  });
});
