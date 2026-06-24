import { describe, it, expect } from 'vitest';
import { typeToCType } from '../emit/types.js';

describe('typeToCType', () => {
  it('matches cType() for integer ranges', () => {
    expect(typeToCType({ kind: 'integer', min: 0, max: 255 })).toBe('uint8');
    expect(typeToCType({ kind: 'integer', min: 0, max: 65535 })).toBe('uint16');
    expect(typeToCType({ kind: 'integer', min: 0, max: 4294967295 })).toBe('uint32');
    expect(typeToCType({ kind: 'integer', min: 0, max: 4294967296 })).toBe('uint64');
    expect(typeToCType({ kind: 'integer', min: -128, max: 127 })).toBe('sint8');
  });

  it('handles boolean, string, float, enumeration, reference, function-name', () => {
    expect(typeToCType({ kind: 'boolean' })).toBe('uint8');
    expect(typeToCType({ kind: 'string' })).toBe('const char*');
    expect(typeToCType({ kind: 'float' })).toBe('float32');
    expect(typeToCType({ kind: 'enumeration', typeName: 'EcuC_StateType' })).toBe('uint8');
    expect(typeToCType({ kind: 'reference', targetType: 'Mcu_ClockConfigType' }))
      .toBe('const Mcu_ClockConfigType * const');
    expect(typeToCType({ kind: 'function-name', signature: 'void (*)(void)' }))
      .toBe('void (*)(void)');
  });

  it('matches cType() thresholds exactly (max - min + 1 cardinality)', () => {
    // span = max - min + 1
    // span 256 → uint8 boundary
    expect(typeToCType({ kind: 'integer', min: 0, max: 255 })).toBe('uint8');     // span 256
    expect(typeToCType({ kind: 'integer', min: 0, max: 256 })).toBe('uint16');    // span 257
    // span 65536 → uint16 boundary
    expect(typeToCType({ kind: 'integer', min: 0, max: 65535 })).toBe('uint16');  // span 65536
    expect(typeToCType({ kind: 'integer', min: 0, max: 65536 })).toBe('uint32');  // span 65537
    // signed boundaries
    expect(typeToCType({ kind: 'integer', min: -128, max: 127 })).toBe('sint8');  // span 256
    expect(typeToCType({ kind: 'integer', min: -128, max: 128 })).toBe('sint16'); // span 257
  });
});
