// Validation domain types. All exports are immutable data.
//
// Pure TS, zero react/electron/DOM imports. Designed for both
// renderer-side consumption (via Zustand store) and core-side testing.

/**
 * Validation error kinds.
 * Extend with new kinds as schema rules grow (e.g. 'cardinality', 'duplicate').
 */
export type ValidationErrorKind = 'range' | 'enum' | 'reference' | 'required' | 'schema';

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
