// Validation domain types. All exports are immutable data.
//
// Pure TS, zero react/electron/DOM imports. Designed for both
// renderer-side consumption (via Zustand store) and core-side testing.

/**
 * Validation error kinds.
 * Extend with new kinds as schema rules grow (multiplicity 已加入；Sprint 6 加 'cross-ref' 校验跨容器引用；Sprint 9 #2 加 'ref-dest'；Sprint 9 #3 加 'ref-cycle'；Sprint 12 #2 加 'schema-unknown' — emitted when a `schemaLayer` is provided and a query path is not catalogued by the layer).
 */
export type ValidationErrorKind =
  | 'range'
  | 'enum'
  | 'reference'
  | 'required'
  | 'schema'
  | 'multiplicity'
  | 'cross-ref'
  | 'ref-dest'
  | 'ref-cycle'
  | 'schema-unknown';

/**
 * A single validation violation.
 *
 * `path` is the absolute path to the violating element/param
 * (e.g. "/EcucDefs/EcuC/Pdu/PduLength"). Empty string when document-level.
 *
 * `paramKey` is set when the violation is on a specific param of a container
 * (e.g. "PduLength"). Undefined for element-level violations (e.g. ref DEST).
 */
export interface ValidationError {
  readonly kind: ValidationErrorKind;
  readonly path: string;
  readonly paramKey?: string;
  readonly message: string;
  readonly expected?: string;
  readonly actual?: string;
}

/**
 * Result envelope for validation.
 * Pure-renderer validation has no I/O errors, so the `ok: true` branch
 * carries the errors array. The `ok: false` branch is reserved for
 * future fatal errors (e.g. schema compilation failure).
 */
export type ValidationResult =
  | { readonly ok: true; readonly errors: readonly ValidationError[] }
  | { readonly ok: false; readonly error: string };

/**
 * ECUC parameter type identifiers.
 * Mirrors the DEST attribute values found on ECUC-*PARAM-DEF / VALUE-REF.
 */
export type EcucParamType =
  | 'integer'
  | 'float'
  | 'boolean'
  | 'string'
  | 'enumeration'
  | 'reference';

/**
 * Schema entry describing a single param's constraints.
 *
 * `path` is the absolute param path: container.path + '/' + paramKey
 * (e.g. "/EcucDefs/EcuC/Pdu/PduLength").
 *
 * Constraint fields are type-dependent:
 *   - integer/float: min, max
 *   - string: maxLength
 *   - enumeration: enumLiterals
 *   - reference: refDest (expected DEST attribute on VALUE-REF)
 *
 * `required` indicates the param must be present. Schema entries with
 * required=true but missing from a container produce a 'required' error.
 */
export interface EcucSchemaEntry {
  readonly path: string;
  readonly type: EcucParamType;
  readonly min?: number;
  readonly max?: number;
  readonly maxLength?: number;
  readonly enumLiterals?: readonly string[];
  /** Expected DEST attribute on <VALUE-REF>; e.g. "ECUC-REFERENCE-DEF". */
  readonly refDest?: string;
  readonly required?: boolean;
}

/**
 * Schema entry describing a single ECUC container's multiplicity constraints.
 *
 * `path` is the absolute container path (no trailing param key):
 *   "/EcucDefs/<Module>/<Container>" (e.g. "/EcucDefs/EcuC/EcucPduCollection/Pdu")
 *
 * Direct child container instances (el.children filtered by shortName+kind)
 * must be in [lower, upper]. `upper: 'unbounded'` means infinity (AUTOSAR
 * standard `*` representation).
 *
 * Note: EcucSchemaEntry (param-level) is unchanged — multiplicity lives on a
 * separate type to keep schemas composable and lookup logic simple.
 */
export interface EcucContainerSchemaEntry {
  readonly path: string;
  /** Minimum number of direct child container instances. 0 = optional. */
  readonly lower: number;
  /** Maximum number of direct child container instances. */
  readonly upper: number | 'unbounded';
}

/**
 * Metadata for a single element in the project-wide path index.
 *
 * `path` is the absolute element path matching AUTOSAR ARXML
 * VALUE-REF convention: "/<pkg.shortName>/<module.shortName>/<container.shortName>/...".
 *
 * `kind` mirrors ArxmlElement['kind'] (excluding 'module' nuances we don't index)
 * so callers can later distinguish "ref target is a container" vs. "ref target is itself a reference".
 *
 * `dest` is the ECUC DEST attribute carried on the original element (containers may
 * inherit DEST from <DEFINITION-REF>; references carry their <VALUE-REF DEST="…">).
 */
export interface PathIndexEntry {
  readonly path: string;
  readonly kind: 'module' | 'container' | 'reference';
  readonly shortName: string;
  readonly dest?: string;
}

/**
 * A site where a cross-ref is consumed across the project. Comes from one of
 * three places, distinguished by `paramKey` / `tagName` shape:
 *
 *   1. An ArxmlReference element walked under a container (paramKey undefined,
 *      tagName === the original VALUE-REF / DEFINITION-REF tag string).
 *   2. A container/module param with `value.type === 'reference'` (paramKey set
 *      to the param key, tagName === paramKey for parity with reading code).
 *   3. A module's top-level `references` string array (paramKey undefined,
 *      tagName === 'MODULE-REF').
 *
 * `sourcePath` is the absolute path of the parent element holding the reference,
 * used in error messages so users can locate the consumer.
 *
 * `targetPath` is the raw target string; trailing `/` or empty string is treated
 * as an "unset placeholder" by checkCrossRefs and skipped (those are already
 * covered by the 'required' kind in single-doc validate()).
 */
export interface RefSite {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly targetDest?: string;
  readonly tagName: string;
  readonly paramKey?: string;
}
