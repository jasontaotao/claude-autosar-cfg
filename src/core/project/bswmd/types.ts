// core/project/bswmd/types.ts
// Public type definitions for the BSWMD parser module.
//
// Split from `src/core/project/bswmd.ts` as part of v1.41.x PATCH T1
// (file-size backlog). This file holds ZERO runtime code — every
// declaration here is a type, interface, or type alias that downstream
// callers (`core/index.ts`, `runtimeSchema.ts`, `mutation.ts`,
// `bswmdSlice.ts`, etc.) re-import through the barrel at
// `src/core/project/bswmd/index.ts`.

/**
 * C11 (v1.17.0) — one `<MODULE-REF>` entry collected by
 * `walkPackagesForModuleRefs`.
 *
 * `target` is the text body of `<MODULE-REF>` (the BSWMD-relative path
 * to the referenced module def). `source` is the parent AR-PACKAGE
 * path that carried the `<MODULE-REF>` (for debugging / deduplication).
 *
 * Pre-v1.17.0 these were silently dropped by the parser; now they
 * survive parsing so the renderer tree + future generator work can
 * use them.
 */
export interface ModuleRefEntry {
  readonly target: string;
  readonly source: string;
}

/**
 * Parsed BSWMD document. `warnings` collects non-fatal parse observations
 * (e.g. an unknown ECUC-XXX-DEF tag was encountered) so callers can surface
 * them in the project panel without aborting the parse.
 */
export interface BswmdDocument {
  readonly version: string;
  readonly modules: readonly BswModuleDef[];
  readonly warnings: readonly string[];
  /**
   * Sprint 14 — module shortNames the user has disabled. Default empty
   * (all modules active). The picker filters disabled modules out;
   * `buildSchemaLayer` filters them out before producing the validation
   * layer so disabled modules don't emit spurious `schema-unknown`.
   */
  readonly disabledModules?: ReadonlySet<string>;
  /**
   * C11 (v1.17.0) — explicit `<MODULE-REF>` attachments collected
   * during AR-PACKAGE walk. Pre-v1.17.0 these were silently dropped
   * by the parser; now they survive parsing and are available to
   * the renderer tree + future generator work. OPTIONAL for
   * back-compat — BSWMDs without any `<MODULE-REF>` element parse
   * identically (moduleRefs is `undefined`).
   *
   * Source attribution: `source` is the parent AR-PACKAGE path that
   * carried the `<MODULE-REF>`; `target` is the text body of the
   * `<MODULE-REF>` (the referenced module path).
   */
  readonly moduleRefs?: readonly ModuleRefEntry[] | undefined;
}

/**
 * One BSW module definition. Dialect is decided by the top-level element tag
 * under <ELEMENTS>. Modules under an EB tresos dialect expose
 * `moduleId` + `providedEntries`; modules under the AUTOSAR standard dialect
 * expose `containers` (and recurse through `subContainers`).
 */
export interface BswModuleDef {
  readonly shortName: string;
  readonly path: string;
  readonly dialect: 'bsw-module-description' | 'ecuc-module-def';
  readonly moduleId: number | null;
  readonly containers: readonly ContainerDef[];
  readonly providedEntries: readonly ProvidedEntry[];
  /**
   * v1.37.0 MINOR T3 (H2) — module-level `<PARAMETERS>` block from
   * `<ECUC-MODULE-DEF>`. Carries top-level parameters declared
   * directly on the module (e.g. `EcuC`'s `<ModuleId>`, `<VendorId>`)
   * rather than inside a child container. Mirrors `ContainerDef.parameters`
   * but at the module root. Optional for back-compat — `[]` when the
   * BSWMD omits module-level `<PARAMETERS>` or when constructed by
   * tests / fixtures that pre-date v1.37.0. Consumers must treat
   * `undefined` and `[]` equivalently (use `?? []`).
   *
   * v1.37.0 PATCH only adds the type + mutation-time validation;
   * populating this from the BSWMD parser is a follow-up (T3
   * follow-up task; tracked in v1.37.x PATCH chain).
   */
  readonly parameters?: readonly ParamDef[];
  /**
   * v1.37.0 MINOR T3 (H2) — module-level `<REFERENCES>` block from
   * `<ECUC-MODULE-DEF>`. Carries top-level references declared directly
   * on the module (e.g. `PduR`'s `<PduRBswImplication>`). Mirrors
   * `ContainerDef.references` but at the module root. Optional for
   * back-compat — see `parameters` rationale.
   */
  readonly references?: readonly ReferenceDef[];
  readonly lowerMultiplicity: number;
  readonly upperMultiplicity: number | 'infinite';
  /**
   * v1.4.1 — module-level `<MULTIPLICITY-CONFIG-CLASSES>` block from
   * `<ECUC-MODULE-DEF>`. Mirrors `ContainerDef.multiplicityConfigClasses`
   * but applies to the whole module instance. Optional — see
   * `ContainerDef.multiplicityConfigClasses` for the rationale.
   */
  readonly multiplicityConfigClasses?: readonly MultiplicityConfigClass[];
  /**
   * v1.14.1 PATCH-G (G1) — header path from `<HEADER><SHORT-NAME>`,
   * emitted verbatim as `#include "..."` in dependent Cfg.h. Drives
   * S2+ (cross-module ref auto-#include) and SEC3 wire-up. `undefined`
   * when the BSWMD omits `<HEADER>`; declared with explicit
   * `| undefined` for compatibility with the project's
   * `exactOptionalPropertyTypes: true` setting.
   */
  readonly moduleHeader?: string | undefined;
  /**
   * v1.14.1 PATCH-G (G1) — pre-supplied `#include` list from
   * `<STD-INCLUDES>/<STD-INCLUDE>/<SHORT-NAME>`. Empty array (not
   * `undefined`) when the BSWMD omits `<STD-INCLUDES>` so callers
   * can iterate without nullability checks.
   */
  readonly includes?: readonly string[];
  /**
   * C9 (v1.17.0) — derivation chain via `<DERIVED-FROM>`. When this
   * module extends another base module def, points to the absolute
   * path of the base module def in the BSWMD. Validator consumers
   * branch on this field's presence (BSW-SEC-005). Generator / emit /
   * mutation / slice hooks will wire derivedFrom in v1.18.0 Batch 3
   * (C8 variant engineering). OPTIONAL for back-compat — omitted for
   * the common independent-module case.
   */
  readonly derivedFrom?: string;
}

/**
 * v1.4.1 — one `<ECUC-MULTIPLICITY-CONFIGURATION-CLASS>` row in a
 * `<MULTIPLICITY-CONFIG-CLASSES>` block. Pairs a `CONFIG-CLASS` (e.g.
 * `PRE-COMPILE`, `LINK-TIME`, `POST-BUILD`) with the `CONFIG-VARIANT`
 * (`VARIANT-PRE-COMPILE`, `VARIANT-POST-BUILD`, `VARIANT-LINK-TIME`)
 * that the multiplicity applies to.
 */
export interface MultiplicityConfigClass {
  readonly configClass: string;
  readonly configVariant: string;
}

export interface ContainerDef {
  readonly shortName: string;
  readonly path: string;
  readonly lowerMultiplicity: number;
  readonly upperMultiplicity: number | 'infinite';
  readonly subContainers: readonly ContainerDef[];
  readonly parameters: readonly ParamDef[];
  readonly references: readonly ReferenceDef[];
  readonly choices: readonly ContainerDef[];
  /**
   * v1.7.1 S3 — human-readable documentation text from the BSWMD
   * `<DESC>` element on `<ECUC-PARAM-CONF-CONTAINER-DEF>` /
   * `<ECUC-CHOICE-CONTAINER-DEF>` / `<ECUC-CHOICE-ORIENTED-STRUCTURE-DEF>`.
   * `undefined` when the BSWMD omits `<DESC>` or declares an empty
   * `<DESC></DESC>` (the two cases collapse so downstream UI code does
   * not have to distinguish them).
   *
   * Note: declared with explicit `| undefined` for compatibility with
   * the project's `exactOptionalPropertyTypes: true` setting — the
   * builders write `desc: readDesc(item)` where the helper may return
   * `undefined`, which is rejected by strict-optional unless the
   * property type explicitly allows `undefined`.
   */
  readonly desc?: string | undefined;
  /**
   * v1.4.1 — BSWMD `<MULTIPLICITY-CONFIG-CLASSES>` block from the
   * `<ECUC-PARAM-CONF-CONTAINER-DEF>`. Each entry pins the container
   * multiplicity to a particular `(CONFIG-CLASS, CONFIG-VARIANT)` pair
   * (e.g. PRE-COMPILE / VARIANT-POST-BUILD). Optional — the BSWMD parser
   * always populates it (default empty), but existing test literals and
   * hand-built fixtures don't carry the field. The picker reads it via
   * `def.multiplicityConfigClasses ?? []` so undefined is safe.
   */
  readonly multiplicityConfigClasses?: readonly MultiplicityConfigClass[];
}

/**
 * `function-name` is distinct from `string` — AUTOSAR validates it against
 * an actual function symbol table, not as free text. Sprint 13's editor
 * should render it as a symbol picker; collapsing it to `string` here
 * would let the renderer ship a wrong input shape.
 */
export type ParamKind =
  | 'integer'
  | 'boolean'
  | 'enumeration'
  | 'float'
  | 'string'
  | 'function-name';

export interface ParamDef {
  readonly shortName: string;
  readonly path: string;
  readonly kind: ParamKind;
  readonly defaultValue: string | number | boolean | null;
  readonly minValue: number | null;
  readonly maxValue: number | null;
  readonly minLength: number | null;
  readonly maxLength: number | null;
  readonly enumerationLiterals: readonly string[];
  /**
   * v1.7.1 S3 — human-readable documentation text from the BSWMD
   * `<DESC>` element on the parameter definition. `undefined` when
   * the BSWMD omits `<DESC>` or declares an empty `<DESC></DESC>`.
   *
   * Note: declared with explicit `| undefined` for compatibility with
   * the project's `exactOptionalPropertyTypes: true` setting.
   */
  readonly desc?: string | undefined;
}

export interface ReferenceDef {
  readonly shortName: string;
  readonly path: string;
  readonly destKind: string;
  readonly lowerMultiplicity: number;
  readonly upperMultiplicity: number | 'infinite';
  // C10 (v1.17.0): cross-dialect discriminator — distinguishes
  // which dialect the dest comes from so renderer + generator can
  // route render / emit logic correctly without parsing dest shape.
  // OPTIONAL for back-compat; existing BSWMDs without destDialect
  // continue to parse identically.
  readonly destDialect?: 'P-PORT' | 'R-PORT' | 'SW-C' | 'ECUC-MODULE-DEF';
}

export interface ChoiceDef {
  readonly shortName: string;
  readonly path: string;
  readonly choices: readonly ContainerDef[];
}

/**
 * One entry point a BSW module exposes. Two real-world shapes are supported:
 *
 *  1. AUTOSAR standard / synthetic — `<SHORT-NAME>` on the
 *     `<BSW-MODULE-ENTRY-REF-CONDITIONAL>` wrapper plus `<ENTRY-REF>` with
 *     a `@_DEST` attribute and the target path as text content.
 *  2. EB tresos — wrapper has no `<SHORT-NAME>`; the inner
 *     `<BSW-MODULE-ENTRY-REF>` carries `@_DEST` + the path. The parser
 *     derives `shortName` from the last path segment and records a warning
 *     so the renderer can surface the schema quirk instead of dropping it.
 */
export interface ProvidedEntry {
  readonly shortName: string;
  readonly path: string;
  readonly entryRefPath: string;
  /** `@_DEST` attribute value (`BSW-MODULE-ENTRY` for the common case). */
  readonly entryKind: string;
}

export type BswmdError =
  | { readonly kind: 'xml-malformed'; readonly message: string }
  | { readonly kind: 'missing-root'; readonly message: string }
  | { readonly kind: 'unsupported-version'; readonly version: string }
  | { readonly kind: 'invalid-structure'; readonly path: string; readonly message: string };

/**
 * Recursion depth tracker for the container builder functions. Created
 * once per `parseBswmd` call and threaded through the recursive
 * `buildContainer` / `buildContainerList` / `buildChoiceContainer`
 * chain. The `error` field is set when the depth limit is exceeded;
 * callers up the stack check it on the way back up and abort.
 *
 * Declared in types.ts (rather than parse.ts) because it crosses the
 * parse / validate sub-file boundary — `validate.ts` (sub-file) reads
 * `guard.error` after invoking `buildEcucModule` from parse.ts.
 */
export interface DepthGuard {
  depth: number;
  error: BswmdError | null;
}

/**
 * Sprint 15 — ECUC mutation support. Aggregate a container's direct children
 * (parameters, references, sub-containers) into a single bundle for the
 * add-element picker. The `subContainers` field intentionally unions
 * `subContainers` and `choices` because both are addable sub-containers
 * from the user's perspective; the picker can disambiguate via the
 * `ContainerDef.choices.length > 0` marker on the source definition.
 */
export interface ContainerChildren {
  readonly parameters: readonly ParamDef[];
  readonly references: readonly ReferenceDef[];
  readonly subContainers: readonly ContainerDef[];
}
