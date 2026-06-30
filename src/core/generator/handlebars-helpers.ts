/**
 * Convert an ECUC-style path into a legal C identifier.
 * - Whitelist: `[A-Za-z0-9_]` (the C-identifier alphabet)
 * - Any other char (incl. `/`, `-`, `.`, `:`, `#`, `$`, `@`, `*`, `?`,
 *   shell-meta, non-ASCII) → `_`
 * - Trims whitespace
 * - Collapses runs of `_`
 * - Strips leading/trailing `_`
 * - Prefix with `_` if the result starts with a digit (C identifiers
 *   may not begin with a digit)
 *
 * v1.13.5 PATCH-F (SEC2) — D-rev2 Security finding. The previous
 * `replace(/[/\-.:]/g, '_')` allowed `#`/`$`/`@`/`*`/`?` and any
 * leading digit through unchanged, letting a malicious BSWMD
 * shortName smuggle characters that break generated C compilation
 * or break out of header guards.
 */
export function cIdent(path: string): string {
  const cleaned = path
    .trim()
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  // Prefix `_` if the cleaned result begins with a digit — invalid C
  // identifiers. Preserves the original semantics (path → ident) for
  // already-valid input like `EcuC_Partition_0`.
  return /^\d/.test(cleaned) ? `_${cleaned}` : cleaned;
}

/**
 * v1.13.5 PATCH-F (SEC3) — D-rev2 Security finding: `moduleHeader` and
 * every `includes[]` entry land verbatim inside `#include "..."` in
 * the generated C source. Without validation, a malicious BSWMD could
 * include path-traversal (`..`), absolute paths (`/etc/...`), quote
 * escape (`"`), or shell-meta (`` ` ``, `$(...)`) to read arbitrary
 * files at compile time or smuggle content into the generated output.
 *
 * Whitelist: must be non-empty AND match `^[A-Za-z0-9_./-]+$` (no `..`
 * substring either — that would slip through the character class
 * without the `..` ban).
 */
const HEADER_PATH_OK = /^[A-Za-z0-9_./-]+$/;
export function validateHeaderPath(s: string): boolean {
  if (s.length === 0) return false;
  if (s.startsWith('/')) return false; // absolute paths forbidden
  if (s.includes('..')) return false; // path-traversal forbidden
  return HEADER_PATH_OK.test(s);
}

/**
 * BSWMD parameter definition variants consumed by EcuC templates.
 * Task 7 will mirror this union on the TS side as `typeToCType` — keep
 * the kinds in sync with the parser's `paramType` field.
 */
export interface BswmdIntegerParamDef {
  readonly kind: 'integer';
  // v1.13.4 PATCH-B (M5) — real BSWMD shortName replaces the hardcoded
  // 'Param' literal in generator emission. Optional here for backward
  // compat with fixtures that only model kind/min/max.
  readonly shortName?: string;
  // v1.13.4 PATCH-B (L3) — per-variant configClass. Optional here for
  // backward compat with fixtures that don't model configClass routing.
  readonly paramConfigClasses?: readonly {
    readonly configClass: 'PRE-COMPILE' | 'POST-BUILD' | 'LINK';
    readonly configVariant: 'VARIANT-PRE-COMPILE' | 'VARIANT-POST-BUILD';
  }[];
  readonly min?: number;
  readonly max?: number;
}
export interface BswmdBooleanParamDef {
  readonly kind: 'boolean';
  readonly shortName?: string;
  readonly paramConfigClasses?: readonly {
    readonly configClass: 'PRE-COMPILE' | 'POST-BUILD' | 'LINK';
    readonly configVariant: 'VARIANT-PRE-COMPILE' | 'VARIANT-POST-BUILD';
  }[];
}
export interface BswmdStringParamDef {
  readonly kind: 'string';
  readonly shortName?: string;
  readonly paramConfigClasses?: readonly {
    readonly configClass: 'PRE-COMPILE' | 'POST-BUILD' | 'LINK';
    readonly configVariant: 'VARIANT-PRE-COMPILE' | 'VARIANT-POST-BUILD';
  }[];
}
export interface BswmdFloatParamDef {
  readonly kind: 'float';
  readonly shortName?: string;
  readonly paramConfigClasses?: readonly {
    readonly configClass: 'PRE-COMPILE' | 'POST-BUILD' | 'LINK';
    readonly configVariant: 'VARIANT-PRE-COMPILE' | 'VARIANT-POST-BUILD';
  }[];
}
export interface BswmdEnumerationParamDef {
  readonly kind: 'enumeration';
  readonly shortName?: string;
  readonly paramConfigClasses?: readonly {
    readonly configClass: 'PRE-COMPILE' | 'POST-BUILD' | 'LINK';
    readonly configVariant: 'VARIANT-PRE-COMPILE' | 'VARIANT-POST-BUILD';
  }[];
  readonly typeName: string;
}
export interface BswmdReferenceParamDef {
  readonly kind: 'reference';
  readonly shortName?: string;
  readonly paramConfigClasses?: readonly {
    readonly configClass: 'PRE-COMPILE' | 'POST-BUILD' | 'LINK';
    readonly configVariant: 'VARIANT-PRE-COMPILE' | 'VARIANT-POST-BUILD';
  }[];
  readonly targetType: string;
}
export interface BswmdFunctionNameDef {
  readonly kind: 'function-name';
  readonly shortName?: string;
  readonly paramConfigClasses?: readonly {
    readonly configClass: 'PRE-COMPILE' | 'POST-BUILD' | 'LINK';
    readonly configVariant: 'VARIANT-PRE-COMPILE' | 'VARIANT-POST-BUILD';
  }[];
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
  // C10 (v1.17.0): no destDialect impact in current scope.
  // Future v1.18.0 generator work will branch on this discriminator
  // to route P-PORT / R-PORT / SW-C / ECUC-MODULE-DEF dest shapes.
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
  // C10 (v1.17.0): no destDialect impact in current scope.
  // Future v1.18.0 generator work will branch on this discriminator
  // to route P-PORT / R-PORT / SW-C / ECUC-MODULE-DEF dest shapes.
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
