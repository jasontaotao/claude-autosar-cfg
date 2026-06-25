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
 * Thresholds for the integer→C-type ladder.
 * Used by `integerToCType` to pick the smallest signed/unsigned N-bit
 * type whose span (max - min + 1) fits the threshold. Centralized so the
 * magic numbers don't drift across `cType` / `typeToCType` / `cTypeForKind`.
 */
export const INTTYPE_THRESHOLDS = {
  INT8_MAX_SPAN: 256, // 2^8
  INT16_MAX_SPAN: 65536, // 2^16
  INT32_MAX_SPAN: 4294967296, // 2^32
  // INT64 = anything larger
} as const;

/**
 * Map an [min, max] integer range onto the smallest C type whose
 * cardinality fits. Picks signed (sint8/16/32/64) when min < 0, unsigned
 * (uint8/16/32/64) otherwise. Used by `cType`, `typeToCType`, and
 * `cTypeForKind` in `ecuc.ts`. Mcu's `cTypeForKind` intentionally
 * bypasses this helper (see `mcu.ts:137`).
 */
export function integerToCType(min: number, max: number): string {
  const unsigned = min >= 0;
  const span = max - min + 1;
  if (!unsigned) {
    if (span <= INTTYPE_THRESHOLDS.INT8_MAX_SPAN) return 'sint8';
    if (span <= INTTYPE_THRESHOLDS.INT16_MAX_SPAN) return 'sint16';
    if (span <= INTTYPE_THRESHOLDS.INT32_MAX_SPAN) return 'sint32';
    return 'sint64';
  }
  if (span <= INTTYPE_THRESHOLDS.INT8_MAX_SPAN) return 'uint8';
  if (span <= INTTYPE_THRESHOLDS.INT16_MAX_SPAN) return 'uint16';
  if (span <= INTTYPE_THRESHOLDS.INT32_MAX_SPAN) return 'uint32';
  return 'uint64';
}

/**
 * Map an ECUC parameter definition onto its C type.
 * Mirrors `typeToCType` in Task 7 — keep the case arms and defaults in sync.
 */
export function cType(def: BswmdParamDef): string {
  switch (def.kind) {
    case 'integer':
      return integerToCType(def.min ?? 0, def.max ?? 0);
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
      const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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

import type { GenerationVariant } from './registry.js';

export type ConfigClass = 'PreCompile' | 'Link' | 'PostBuild';

export interface BswmdAbstractConfigurationClass {
  readonly configVariant: ConfigClass;
  readonly configClass: ConfigClass;
}

export interface HasParamConfigClasses {
  readonly paramConfigClasses: readonly BswmdAbstractConfigurationClass[];
}

/**
 * Pick the configClass for the active variant.
 * Throws if no pair matches (caller should treat as ERROR diagnostic).
 */
export function paramConfigClass(
  def: HasParamConfigClasses,
  variant: GenerationVariant,
): ConfigClass {
  const match = def.paramConfigClasses.find((p) => p.configVariant === variant);
  if (!match) {
    throw new Error(`no configClass for variant=${variant}`);
  }
  return match.configClass;
}

export function bswmdPathOf(instance: { readonly path: readonly string[] }): string {
  return instance.path.join('/');
}

export function partitionName(name: string): string {
  return cIdent(name);
}
