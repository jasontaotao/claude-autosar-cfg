// src/core/sws-validator/types.ts
// Cluster G (v1.6.0) — core type definitions for the SWS Validator.
//
// Per G spec §5.1:
//   - `InternalValidatorResult` is the engine-internal shape (NOT the wire shape).
//   - `ValidatorResult` (A+C canonical) is the wire shape — see adapter.ts.
//   - `ValidationContext` is the read-only view passed to each rule.
//   - `ValidatorRule` is the contract every rule must satisfy.
//
// Naming convention for rule ids: `SWS_<MODULE>_<NAME>` (e.g. SWS_COM_PDUID_UNIQUE).

import type { Locale } from '../../shared/i18n.js';
import type {
  NormalizedDocument,
  NormalizedElement,
  NormalizedModule,
} from '../../shared/normalized-document.js';
import type { SchemaLayer } from '../validation/runtimeSchema.js';

/**
 * SWS validator result kinds — stable taxonomy for external tooling
 * (CI / SARIF / IDE integration). Distinct from `ValidationErrorKind`
 * because SWS rules are stable across releases while
 * `ValidationErrorKind` is internal to claude-AutosarCfg's
 * schema-driven validator.
 */
export type SwsValidatorErrorKind =
  | 'duplicate-id'
  | 'unresolved-ref'
  | 'missing-dependency'
  | 'multiplicity-violation'
  | 'routing-incomplete'
  | 'channel-misaligned';

export type Severity = 'error' | 'warning' | 'info';

/**
 * Internal representation used by the G engine. NOT emitted to the wire.
 * Use `toWireResult()` (see adapter.ts) when crossing the IPC boundary.
 */
export interface InternalValidatorResult {
  /** Matches the rule's `id`. Lets external tools map back to docs. */
  readonly ruleId: string;
  readonly severity: Severity;
  /** i18n key in `src/shared/i18n.ts` (zh-CN + en both required). */
  readonly messageKey: string;
  /** Variables for i18n interpolation: { pduName: 'ComIPdu_0', ... }. */
  readonly messageVars?: Readonly<Record<string, string | number>>;
  /** Absolute path of the offending element, if applicable. Empty string = project-level. */
  readonly path: string;
}

/**
 * Read-only view passed to each rule. Built once per `runValidation` call.
 */
export interface ValidationContext {
  readonly project: NormalizedDocument;
  readonly schemaLayer: SchemaLayer | null;
  readonly locale: Locale;
  readonly moduleShortNames: readonly string[];
  /**
   * Tour coordination (per G spec §3.9). When `validationPaused === true`,
   * the engine silently skips rule execution (returns `[]`). Sourced from
   * `useArxmlStore.tour` via the in-process zustand subscription.
   */
  readonly tourState: { readonly validationPaused: boolean };
  /** Helper to dereference a path to its element. Returns undefined on missing path. */
  readAt(path: string): NormalizedElement | undefined;
  /** Helper to find all elements matching a predicate. */
  findAll(predicate: (el: NormalizedElement) => boolean): readonly NormalizedElement[];
  /** Helper to find all modules with a given definitionRef shortName. */
  findModules(shortName: string): readonly NormalizedModule[];
}

/**
 * The contract every rule must satisfy. Pure function: same input ⇒
 * same output. No I/O. No mutation.
 */
export interface ValidatorRule {
  /** Stable id, MUST be unique across all registered rules. Convention: `SWS_<MODULE>_<NAME>`. */
  readonly id: string;
  readonly defaultSeverity: Severity;
  /** Resolvable in `src/shared/i18n.ts` for both zh-CN and en. */
  readonly messageKey: string;
  /** Implementation: read context, return zero or more results. */
  check(ctx: ValidationContext): readonly InternalValidatorResult[];
  /** Optional: rules can declare a target module shortName for filtering. */
  readonly targetModule?: string;
}

/**
 * Input to `runValidation`.
 */
export interface RunInput {
  readonly document: NormalizedDocument;
  readonly schemaLayer: SchemaLayer | null;
}

export interface RunOptions {
  /** Optional subset of rule ids to run. Omit = run all registered. */
  readonly ruleIds?: readonly string[];
  /** Minimum severity to include. Default: 'info' (everything). */
  readonly severityFloor?: Severity;
  /** Wall-clock budget per rule. Default: 5000 ms. */
  readonly timeoutMsPerRule?: number;
  /** Locale for i18n message resolution. Default: DEFAULT_LOCALE. */
  readonly locale?: Locale;
  /** Tour state — when paused, engine silently returns `[]`. Default: { validationPaused: false }. */
  readonly tourState?: { readonly validationPaused: boolean };
}

export interface RunResult {
  readonly results: readonly InternalValidatorResult[];
  readonly durationMs: number;
  readonly rulesRun: number;
  readonly rulesSkipped: number;
  readonly timedOut: readonly string[];
}

/**
 * The canonical wire shape (A+C §4 + C1 fix). G imports this verbatim —
 * see adapter.ts for the `toWireResult()` translator that produces it.
 */
export type { ValidatorResult } from '../../shared/headless/ipc-contract.js';