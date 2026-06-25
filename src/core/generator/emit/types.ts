// src/core/generator/emit/types.ts
//
// Same logic as `cType()` in handlebars-helpers.ts but callable from
// TypeScript code (not templates). Keep in sync with cType().

import type { BswmdParamDef } from '../handlebars-helpers.js';

export function typeToCType(def: BswmdParamDef): string {
  switch (def.kind) {
    case 'integer': {
      const min = def.min ?? 0;
      const max = def.max ?? 0;
      const unsigned = min >= 0;
      // Cardinality: how many distinct values fit in [min, max].
      // sint8: 256 values, sint16: 65536, sint32: 2^32, sint64: 2^64.
      // uintN: 256 / 65536 / 2^32 / 2^64.
      const span = max - min + 1;
      if (!unsigned) {
        if (span <= 256) return 'sint8';
        if (span <= 65536) return 'sint16';
        if (span <= 4294967296) return 'sint32';
        return 'sint64';
      }
      if (span <= 256) return 'uint8';
      if (span <= 65536) return 'uint16';
      if (span <= 4294967296) return 'uint32';
      return 'uint64';
    }
    case 'boolean':
      return 'uint8';
    case 'string':
      return 'const char*';
    case 'float':
      return 'float32';
    case 'enumeration':
      return 'uint8';
    case 'reference':
      return `const ${def.targetType} * const`;
    case 'function-name':
      return def.signature;
    default:
      return '??';
  }
}
