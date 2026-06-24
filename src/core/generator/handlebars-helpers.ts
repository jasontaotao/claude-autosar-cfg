/**
 * Convert an ECUC-style path into a legal C identifier.
 * - `/`, `-`, `.`, `:` → `_`
 * - Trims whitespace
 * - Collapses runs of `_`
 * Returns '' for empty input.
 */
export function cIdent(path: string): string {
  return path
    .trim()
    .replace(/[/\-.:]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * BSWMD parameter definition variants consumed by EcuC templates.
 * Task 7 will mirror this union on the TS side as `typeToCType` — keep
 * the kinds in sync with the parser's `paramType` field.
 */
export interface BswmdIntegerParamDef {
  readonly kind: 'integer';
  readonly min?: number;
  readonly max?: number;
}
export interface BswmdBooleanParamDef {
  readonly kind: 'boolean';
}
export interface BswmdStringParamDef {
  readonly kind: 'string';
}
export interface BswmdFloatParamDef {
  readonly kind: 'float';
}
export interface BswmdEnumerationParamDef {
  readonly kind: 'enumeration';
  readonly typeName: string;
}
export interface BswmdReferenceParamDef {
  readonly kind: 'reference';
  readonly targetType: string;
}
export interface BswmdFunctionNameDef {
  readonly kind: 'function-name';
  readonly signature: string;
}
export type BswmdParamDef =
  | BswmdIntegerParamDef
  | BswmdBooleanParamDef
  | BswmdStringParamDef
  | BswmdFloatParamDef
  | BswmdEnumerationParamDef
  | BswmdReferenceParamDef
  | BswmdFunctionNameDef;

/**
 * Map an ECUC parameter definition onto its C type.
 * Mirrors `typeToCType` in Task 7 — keep the case arms and defaults in sync.
 */
export function cType(def: BswmdParamDef): string {
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

/**
 * Render an ECUC value as a C literal that matches `cType(def)`.
 * Same switch shape as `cType` — Task 7 will mirror the literal half too.
 */
export function cValue(value: unknown, def: BswmdParamDef): string {
  switch (def.kind) {
    case 'integer':
      return String(value);
    case 'boolean':
      return value ? '1' : '0';
    case 'string': {
      const escaped = String(value)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
      return `"${escaped}"`;
    }
    case 'float':
      return `${(value as number).toFixed(6)}f`;
    case 'enumeration':
      return String(value);
    case 'reference':
      return String(value);
    case 'function-name':
      return String(value);
    default:
      return '0';
  }
}
