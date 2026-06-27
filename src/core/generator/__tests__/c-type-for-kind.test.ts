// src/core/generator/__tests__/c-type-for-kind.test.ts
//
// v1.15.2 PATCH (B-3.2) — direct unit tests for the unified
// `cTypeForKind(def, moduleKind)` that replaces the per-module
// functions in ecuc.ts:148 and mcu.ts:125. 11 cases lock:
//   - EcuC integer arm (min/max-aware via integerToCType)
//   - Mcu integer arm (hardcoded 'uint32')
//   - EcuC reference arm (def.targetType-aware)
//   - Mcu reference arm (fallback 'uint8')
//   - EcuC function-name arm (def.signature-aware)
//   - Mcu function-name arm (fallback 'uint8')
//   - Shared boolean/string arms (delegate to cTypeForBasicKind)
//   - Unknown kind (per-module fail-safe 'uint8')

import { describe, it, expect } from 'vitest';

import { cTypeForKind } from '../modules/_shared.js';

describe('cTypeForKind (v1.15.2 PATCH B-3 unified)', () => {
  it('EcuC integer with min=0, max=65535 → integerToCType(0, 65535)', () => {
    expect(cTypeForKind({ kind: 'integer', min: 0, max: 65535 }, 'EcuC')).toBe('uint16'); // span=65536, unsigned, fits uint16
  });

  it('EcuC integer with no min/max → integerToCType(0, 0)', () => {
    // Mirrors ecuc.ts:154 behavior: `def.min ?? 0, def.max ?? 0`
    expect(cTypeForKind({ kind: 'integer' }, 'EcuC')).toBe('uint8'); // span=1, unsigned
  });

  it('Mcu integer → uint32 (hardcoded for clock ref points)', () => {
    expect(cTypeForKind({ kind: 'integer', min: 0, max: 100 }, 'Mcu')).toBe('uint32');
    expect(cTypeForKind({ kind: 'integer' }, 'Mcu')).toBe('uint32');
  });

  it('EcuC reference with targetType → `const ${targetType} * const`', () => {
    expect(cTypeForKind({ kind: 'reference', targetType: 'McuClockConfig' }, 'EcuC')).toBe(
      'const McuClockConfig * const',
    );
  });

  it('EcuC reference with no targetType → `const void * const`', () => {
    expect(cTypeForKind({ kind: 'reference' }, 'EcuC')).toBe('const void * const');
  });

  it('Mcu reference (no current BSWMD subset) → uint8 (safe Mcu default)', () => {
    expect(cTypeForKind({ kind: 'reference' }, 'Mcu')).toBe('uint8');
  });

  it('EcuC function-name with signature → that signature', () => {
    expect(cTypeForKind({ kind: 'function-name', signature: 'void(uint8)' }, 'EcuC')).toBe(
      'void(uint8)',
    );
  });

  it('EcuC function-name with no signature → void', () => {
    expect(cTypeForKind({ kind: 'function-name' }, 'EcuC')).toBe('void');
  });

  it('Mcu function-name (no current BSWMD subset) → uint8 (safe Mcu default)', () => {
    expect(cTypeForKind({ kind: 'function-name' }, 'Mcu')).toBe('uint8');
  });

  it('boolean / string (both modules) → uint8 / const char*', () => {
    expect(cTypeForKind({ kind: 'boolean' }, 'EcuC')).toBe('uint8');
    expect(cTypeForKind({ kind: 'boolean' }, 'Mcu')).toBe('uint8');
    expect(cTypeForKind({ kind: 'string' }, 'EcuC')).toBe('const char*');
    expect(cTypeForKind({ kind: 'string' }, 'Mcu')).toBe('const char*');
  });

  it('unknown kind (both modules) → uint8 (per-module fail-safe)', () => {
    // The fail-safe branch must accept any string for defense-in-depth.
    // We use a `satisfies` cast that keeps the production type narrow at
    // the call sites but widens to `{ kind: string }` here so the unknown
    // kind is exercised without an `as 'integer'` lie. The final
    // `as unknown as Parameters<typeof cTypeForKind>[0]` double-cast
    // makes the type-system intent explicit ("the production signature
    // is narrow; this is an exception") without misleading the reader.
    const unknownDef = { kind: 'unknown-kind' } satisfies { kind: string };
    const castForFailSafe = unknownDef as unknown as Parameters<typeof cTypeForKind>[0];
    expect(cTypeForKind(castForFailSafe, 'EcuC')).toBe('uint8');
    expect(cTypeForKind(castForFailSafe, 'Mcu')).toBe('uint8');
  });
});