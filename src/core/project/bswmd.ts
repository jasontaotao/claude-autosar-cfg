// core/project/bswmd.ts
// BSWMD (BSW Module Description, schema-side) parser. Sprint 12 #1 Task 1.
//
// Two dialects are recognised:
//   1. EB tresos BSW-MODULE-DESCRIPTION — top-level <BSW-MODULE-DESCRIPTION> with
//      <MODULE-ID> + <PROVIDED-ENTRYS>. The actual container/param schema is
//      not present here (it lives in a vendor-private ECUC-MODULE-DEF sibling),
//      so we read SHORT-NAME + MODULE-ID + PROVIDED-ENTRYS only.
//   2. AUTOSAR standard ECUC-MODULE-DEF — top-level <ECUC-MODULE-DEF> with
//      <CONTAINERS>/<SUB-CONTAINERS>/<PARAMETERS>/<REFERENCES>/<CHOICES>.
//      Each <ECUC-XXX-PARAM-DEF> / <ECUC-XXX-REFERENCE-DEF> is fully expanded.
//
// Reference: AUTOSAR TPS_StandardizationTemplate (r4.x), ECUC parameter
// definition shape. EB tresos shape matches what we have in real fixtures
// (r4.0 namespace; tresos tool tag is 4-0-3.xsd).
//
// Zero react/electron/fs deps — same constraint as src/core/arxml/parser.ts.

import { XMLParser, XMLValidator } from 'fast-xml-parser';

import type { Result } from '../arxml/types.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const NS_PATTERN = /\/schema\/(r\d+\.\d+|\d{5,6})/;

/** Versions we accept. r3.x is rejected with `unsupported-version`. The
 *  numeric-form entries are the AUTOSAR release namespace digits (`00046`
 *  ≡ R4.6, `00005` ≡ R5.0, `00006` ≡ R6.0). The regex returns either form;
 *  we list both so the supported set covers the long and short shapes. */
const SUPPORTED_VERSIONS = new Set([
  '4.0',
  '4.2',
  '4.4',
  '4.6',
  '4.7',
  '5.0',
  '00005',
  '00006',
  '00046',
  '00051',
]);

export function parseBswmd(xml: string): Result<BswmdDocument, BswmdError> {
  // Explicit XML well-formedness check — fast-xml-parser is lenient and
  // would otherwise turn unclosed tags into a partially-populated object
  // and report unsupported-version for invalid input.
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    const message =
      typeof validation === 'object' && validation !== null && 'err' in validation
        ? (validation as { err: { msg: string; line?: number; col?: number } }).err.msg
        : 'XML is not well-formed';
    return { ok: false, error: { kind: 'xml-malformed', message } };
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    removeNSPrefix: false,
    processEntities: true,
    trimValues: false,
    // Sprint 13 Stage 5.D — bump the default `maxNestedTags` (100) so
    // our 64-level defensive depth check can fire first on pathological
    // input. The fast-xml-parser default trips at 100 nested tags; a
    // 65-level ECUC-MODULE-DEF produces 65*2-1 = 129 nested tags
    // (container + SUB-CONTAINERS per level). 200 leaves comfortable
    // headroom for the legitimate 64-level cap (128 tags) plus the
    // outer AUTOSAR/AR-PACKAGE/ECUC-MODULE-DEF wrapping.
    maxNestedTags: 200,
  });

  let raw: unknown;
  try {
    raw = parser.parse(xml);
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: 'xml-malformed',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  if (typeof raw !== 'object' || raw === null) {
    return {
      ok: false,
      error: { kind: 'missing-root', message: 'parsed result is not an object' },
    };
  }

  const root = raw as Record<string, unknown>;
  const autosar = root['AUTOSAR'];
  if (typeof autosar !== 'object' || autosar === null) {
    return {
      ok: false,
      error: { kind: 'missing-root', message: '<AUTOSAR> root not found' },
    };
  }

  const version = detectVersion(autosar as Record<string, unknown>);
  if (version === null) {
    // Detect the literal version string even when unsupported so the caller
    // can show "r3.5" / "4.6" in the error message rather than a generic
    // "unknown" — useful when the user pastes an old AUTOSAR 3.x BSWMD.
    const literal = detectVersionLiteral(autosar as Record<string, unknown>);
    return {
      ok: false,
      error: { kind: 'unsupported-version', version: literal ?? 'unknown' },
    };
  }

  const arPackages = (autosar as Record<string, unknown>)['AR-PACKAGES'];
  if (typeof arPackages !== 'object' || arPackages === null) {
    return {
      ok: false,
      error: { kind: 'missing-root', message: '<AR-PACKAGES> not found' },
    };
  }

  const warnings: string[] = [];
  const modules: BswModuleDef[] = [];
  // Sprint 13 Stage 5.D — depth guard for the recursive container builder.
  // Created here, threaded through walkPackagesForModules → walkElementsForModules
  // → buildEcucModule → buildContainerList → buildContainer. If a pathological
  // BSWMD nests deeper than `MAX_CONTAINER_DEPTH`, the builder sets
  // `guard.error` and the walk unwinds. The error is surfaced as a fatal
  // `invalid-structure` BswmdError below.
  const guard: DepthGuard = { depth: 0, error: null };
  const moduleError = walkPackagesForModules(
    arPackages as Record<string, unknown>,
    '',
    modules,
    warnings,
    guard,
  );
  if (moduleError !== null) {
    return { ok: false, error: moduleError };
  }
  if (guard.error !== null) {
    return { ok: false, error: guard.error };
  }

  // Sprint 13 Stage 5.D — default-value cross-check against enumerationLiterals.
  //
  // AUTOSAR allows a `<DEFAULT-VALUE>` outside its declared `<LITERALS>` set
  // (a vendor tool that does this produces a BSWMD the renderer can load but
  // the user can't reliably set the default to). We surface this as a
  // non-fatal warning — same surface as the `unknown container kind` warning
  // above — so the project panel can show a degraded-state banner without
  // rejecting the file.
  //
  // Runs AFTER `walkPackagesForModules` so all containers + sub-containers +
  // choice branches are populated.
  validateModuleDefaults(modules, warnings);

  return { ok: true, value: { version, modules, warnings } };
}

/**
 * Walk every module and emit a warning when an enumeration param's
 * `<DEFAULT-VALUE>` is not in its declared `<LITERALS>` set.
 *
 * Sprint 13 Stage 5.D — non-fatal cross-check. The vendor-tool failure
 * mode this guards against is: BSWMD declares LITERALS=[A,B] but
 * DEFAULT-VALUE=C. The renderer's default-value editor can't
 * roundtrip this — the value "C" would not be valid for the dropdown.
 * A warning lets the project panel surface a degraded-state banner.
 *
 * Scope: only enumeration params (other kinds are bounded by MIN/MAX
 * and validated in the schema layer, not by literal set). Walks
 * `subContainers` and `choices` recursively — same traversal pattern
 * as `findContainerInTree`.
 */
function validateModuleDefaults(modules: readonly BswModuleDef[], warnings: string[]): void {
  for (const mod of modules) {
    for (const c of mod.containers) {
      walkContainerDefaults(c, warnings);
    }
  }
}

function walkContainerDefaults(container: ContainerDef, warnings: string[]): void {
  for (const p of container.parameters) {
    // Only enumeration params carry a literal set. Other kinds are out
    // of scope: integer/float are bounded by MIN/MAX, string/function-name
    // by length constraints, boolean is two-valued.
    if (p.kind !== 'enumeration') continue;
    if (typeof p.defaultValue !== 'string') continue;
    if (p.enumerationLiterals.length === 0) continue;
    if (p.enumerationLiterals.includes(p.defaultValue)) continue;
    warnings.push(
      `DEFAULT-VALUE '${p.defaultValue}' for enumeration param '${p.path}' is not in declared literals [${p.enumerationLiterals.join(', ')}]`,
    );
  }
  for (const sub of container.subContainers) {
    walkContainerDefaults(sub, warnings);
  }
  for (const choice of container.choices) {
    walkContainerDefaults(choice, warnings);
  }
}

export function findModuleByPath(doc: BswmdDocument, modulePath: string): BswModuleDef | null {
  return doc.modules.find((m) => m.path === modulePath) ?? null;
}

export function lookupContainerDef(mod: BswModuleDef, shortName: string): ContainerDef | null {
  return findContainerInTree(mod.containers, shortName);
}

export function lookupParamDef(container: ContainerDef, shortName: string): ParamDef | null {
  return container.parameters.find((p) => p.shortName === shortName) ?? null;
}

export function lookupReferenceDef(
  container: ContainerDef,
  shortName: string,
): ReferenceDef | null {
  return container.references.find((r) => r.shortName === shortName) ?? null;
}

/**
 * Sprint 15 — ECUC mutation support. Resolve a `ContainerDef` by relative
 * sub-path (slash-separated short names) within a module. Walks the module's
 * top-level containers, then descends into each match's `subContainers` and
 * `choices` (treating them as one search space) until every segment has
 * been consumed. Returns the matching `ContainerDef`, or `null` if any
 * segment is missing.
 *
 * Examples:
 *   `getContainerDefByPath(canMod, 'CanGeneral')` → top-level container.
 *   `getContainerDefByPath(canMod, 'CanConfigSet/CanController/CanControllerConfig')`
 *   `getContainerDefByPath(canIfMod, 'CanIfBufferCfg/CanIfMailbox')` → choice branch.
 *
 * The function is intentionally path-shaped (not shortName-shaped like
 * `lookupContainerDef`) so callers can hand it the path the user sees in
 * the tree without first splitting it themselves.
 */
export function getContainerDefByPath(
  moduleDef: BswModuleDef,
  subPath: string,
): ContainerDef | null {
  const segments = subPath.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  const [head, ...tail] = segments;
  if (head === undefined) return null;
  const first = moduleDef.containers.find((c) => c.shortName === head);
  if (first === undefined) return null;
  if (tail.length === 0) return first;
  return findContainerInTreeByPath(first, tail);
}

function findContainerInTreeByPath(
  parent: ContainerDef,
  segments: readonly string[],
): ContainerDef | null {
  if (segments.length === 0) return parent;
  const [head, ...tail] = segments;
  if (head === undefined) return null;
  // Choices are surfaced as a separate `choices` field on the parent (see
  // `buildChoiceContainer`) but logically a choice branch is a container
  // you can descend into, so the search space at every level is
  // `subContainers ∪ choices`.
  const candidates = [...parent.subContainers, ...parent.choices];
  const found = candidates.find((c) => c.shortName === head);
  if (found === undefined) return null;
  if (tail.length === 0) return found;
  return findContainerInTreeByPath(found, tail);
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

export function listContainerChildren(containerDef: ContainerDef): ContainerChildren {
  return {
    parameters: containerDef.parameters,
    references: containerDef.references,
    subContainers: [...containerDef.subContainers, ...containerDef.choices],
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function detectVersion(autosar: Record<string, unknown>): string | null {
  const literal = detectVersionLiteral(autosar);
  if (literal === null) return null;
  return SUPPORTED_VERSIONS.has(literal) ? literal : null;
}

/** Detect the version literal from the namespace, without filtering on support. */
function detectVersionLiteral(autosar: Record<string, unknown>): string | null {
  const xmlns = typeof autosar['@_xmlns'] === 'string' ? (autosar['@_xmlns'] as string) : '';
  const m = NS_PATTERN.exec(xmlns);
  if (!m || m[1] === undefined) return null;
  return m[1].startsWith('r') ? m[1].slice(1) : m[1];
}

function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v === undefined || v === null) return [];
  return [v as T];
}

function readShortName(elem: Record<string, unknown>): string | undefined {
  const sn = elem['SHORT-NAME'];
  if (typeof sn === 'string') return sn;
  if (typeof sn === 'object' && sn !== null) {
    const t = (sn as Record<string, unknown>)['#text'];
    if (typeof t === 'string') return t;
  }
  return undefined;
}

function readNumber(node: unknown): number | null {
  if (typeof node === 'number' && Number.isFinite(node)) return node;
  if (typeof node === 'string') {
    const n = Number(node);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readBoolean(node: unknown): boolean | null {
  if (typeof node === 'boolean') return node;
  if (typeof node === 'string') {
    const s = node.trim().toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0') return false;
  }
  return null;
}

/**
 * Read a multiplicity: returns the literal number, or 'infinite' when the
 * companion `<UPPER-MULTIPLICITY-INFINITE>true</UPPER-MULTIPLICITY-INFINITE>`
 * is set. Missing upper is treated as 'infinite' because that matches the
 * ECUC spec default (most container/choice upper bounds are unbounded).
 */
function readUpperMultiplicity(node: Record<string, unknown>): number | 'infinite' {
  const inf = readBoolean(node['UPPER-MULTIPLICITY-INFINITE']);
  if (inf === true) return 'infinite';
  const n = readNumber(node['UPPER-MULTIPLICITY']);
  return n === null ? 'infinite' : n;
}

function readLowerMultiplicity(node: Record<string, unknown>): number {
  const n = readNumber(node['LOWER-MULTIPLICITY']);
  return n === null ? 0 : n;
}

/**
 * v1.4.1 — read the `<MULTIPLICITY-CONFIG-CLASSES>` block.
 *
 * Each `<ECUC-MULTIPLICITY-CONFIGURATION-CLASS>` child contributes one
 * `(CONFIG-CLASS, CONFIG-VARIANT)` row. Missing or empty block → empty
 * array. Missing sub-fields default to empty string — the consumer can
 * distinguish "no constraint declared" via `length === 0`.
 *
 * Per AUTOSAR TPS_StandardizationTemplate the values are restricted
 * literals; we keep them as plain strings here so callers can format /
 * validate however they like.
 */
function readMultiplicityConfigClasses(
  node: Record<string, unknown>,
): readonly MultiplicityConfigClass[] {
  const block = node['MULTIPLICITY-CONFIG-CLASSES'];
  if (typeof block !== 'object' || block === null) return [];
  const rows = asArray<Record<string, unknown>>(
    (block as Record<string, unknown>)['ECUC-MULTIPLICITY-CONFIGURATION-CLASS'],
  );
  const out: MultiplicityConfigClass[] = [];
  for (const row of rows) {
    const configClass = readElementText(row['CONFIG-CLASS']);
    const configVariant = readElementText(row['CONFIG-VARIANT']);
    if (configClass === '' && configVariant === '') continue;
    out.push({ configClass, configVariant });
  }
  return out;
}

function findContainerInTree(
  containers: readonly ContainerDef[],
  shortName: string,
): ContainerDef | null {
  for (const c of containers) {
    if (c.shortName === shortName) return c;
    const nested = findContainerInTree(c.subContainers, shortName);
    if (nested !== null) return nested;
    const inChoice = findContainerInTree(c.choices, shortName);
    if (inChoice !== null) return inChoice;
  }
  return null;
}

/**
 * Walk AR-PACKAGES at any depth, dispatching each module child element to
 * the dialect-specific builder. Returns a fatal BswmdError if a top-level
 * module definition is missing its required SHORT-NAME (the module would be
 * unreachable by path lookup anyway). Non-fatal issues (unknown inner kinds)
 * are accumulated in `warnings`.
 */
function walkPackagesForModules(
  node: Record<string, unknown>,
  parentPath: string,
  out: BswModuleDef[],
  warnings: string[],
  guard?: DepthGuard,
): BswmdError | null {
  for (const pkg of asArray<Record<string, unknown>>(node['AR-PACKAGE'])) {
    // Stop walking more packages once the depth guard has tripped.
    if (guard?.error !== null && guard?.error !== undefined) return guard.error;
    const shortName = readShortName(pkg);
    if (shortName === undefined) continue;
    const path = `${parentPath}/${shortName}`;
    const elementsRaw = pkg['ELEMENTS'];
    if (typeof elementsRaw === 'object' && elementsRaw !== null) {
      const err = walkElementsForModules(
        elementsRaw as Record<string, unknown>,
        path,
        out,
        warnings,
        guard,
      );
      if (err !== null) return err;
    }
    const nestedRaw = pkg['AR-PACKAGES'];
    if (typeof nestedRaw === 'object' && nestedRaw !== null) {
      const err = walkPackagesForModules(
        nestedRaw as Record<string, unknown>,
        path,
        out,
        warnings,
        guard,
      );
      if (err !== null) return err;
    }
  }
  return null;
}

function walkElementsForModules(
  node: Record<string, unknown>,
  parentPath: string,
  out: BswModuleDef[],
  warnings: string[],
  guard?: DepthGuard,
): BswmdError | null {
  // Short-circuit if the guard has already tripped (the depth check in
  // buildContainer set the error). Returning the same error keeps the
  // unwind symmetric — no more recursion happens, no more modules are
  // emitted.
  if (guard?.error !== null && guard?.error !== undefined) return guard.error;
  // Sprint 13+ Q6 — duplicate module shortName detection. We keep both
  // modules in `out` (existing behaviour) but emit a warning so the
  // BswmdPanel can flag the file. Per-scope: this set is fresh for each
  // <ELEMENTS> block we walk, so it catches sibling <ECUC-MODULE-DEF> /
  // <BSW-MODULE-DESCRIPTION> collisions inside the same parent AR-PACKAGE.
  const seenModuleShortNames = new Set<string>();
  for (const [tagName, raw] of Object.entries(node)) {
    if (tagName.startsWith('@_') || tagName === '#text') continue;
    for (const item of asArray<Record<string, unknown>>(raw)) {
      if (tagName === 'BSW-MODULE-DESCRIPTION') {
        const mod = buildEbModule(item, parentPath, warnings);
        if (mod !== null) {
          if (seenModuleShortNames.has(mod.shortName)) {
            warnings.push(
              `Duplicate module definition "${mod.shortName}" at ${mod.path} — first-wins, later copy retained but shadowed by the first lookup`,
            );
          }
          seenModuleShortNames.add(mod.shortName);
          out.push(mod);
        } else {
          // Missing SHORT-NAME at the module level is fatal: the module
          // would have an empty path and the lookup helpers would never
          // find it. Better to fail loud than to silently produce an
          // unreachable module.
          return {
            kind: 'invalid-structure',
            path: parentPath,
            message: `BSW-MODULE-DESCRIPTION at ${parentPath} is missing <SHORT-NAME>`,
          };
        }
        continue;
      }
      if (tagName === 'ECUC-MODULE-DEF') {
        const mod = buildEcucModule(item, parentPath, warnings, guard);
        if (mod !== null) {
          if (seenModuleShortNames.has(mod.shortName)) {
            warnings.push(
              `Duplicate module definition "${mod.shortName}" at ${mod.path} — first-wins, later copy retained but shadowed by the first lookup`,
            );
          }
          seenModuleShortNames.add(mod.shortName);
          out.push(mod);
        } else {
          return {
            kind: 'invalid-structure',
            path: parentPath,
            message: `ECUC-MODULE-DEF at ${parentPath} is missing <SHORT-NAME>`,
          };
        }
        // After each module build, check whether the depth guard tripped
        // (the recursion has already unwound by this point). Returning
        // the error from the walk stops further module processing.
        if (guard?.error !== null && guard?.error !== undefined) return guard.error;
        continue;
      }
      // Unknown top-level module kind — record and skip without aborting.
      //
      // Design note: we deliberately do NOT promote these to
      // `invalid-structure`. Real EB tresos BSWMD files place value-side
      // and implementation-side siblings inside the same `<ELEMENTS>`
      // block as the schema-side `<BSW-MODULE-DESCRIPTION>` — for example
      // `<BSW-MODULE-ENTRY>` (entry definition) and `<BSW-IMPLEMENTATION>`
      // (implementation metadata) appear under sibling `<AR-PACKAGE>`
      // nodes. Bumping these to errors would reject valid vendor files
      // (tests/fixtures/bswmd/Can_Bswmd.arxml currently records 3 such
      // warnings). The schema-side validator (Sprint 13) only needs to
      // look up `ECUC-MODULE-DEF` / `BSW-MODULE-DESCRIPTION` by path —
      // unknown kinds are unreachable to that lookup anyway, so
      // warning-and-skip is the correct surface. The `warnings` array is
      // the renderer's signal to display a degraded-state banner.
      warnings.push(`Unknown module kind '${tagName}' at ${parentPath}`);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// EB tresos dialect
// ---------------------------------------------------------------------------

function buildEbModule(
  item: Record<string, unknown>,
  parentPath: string,
  warnings?: string[],
): BswModuleDef | null {
  const shortName = readShortName(item);
  if (shortName === undefined) return null;
  const path = `${parentPath}/${shortName}`;
  const moduleId = readNumber(item['MODULE-ID']);
  const provided = buildProvidedEntries(item, path, warnings);
  return {
    shortName,
    path,
    dialect: 'bsw-module-description',
    moduleId,
    containers: [],
    providedEntries: provided,
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    // EB tresos BSW-MODULE-DESCRIPTION dialect has no
    // <MULTIPLICITY-CONFIG-CLASSES> on the module-level shape;
    // info lives in the vendor-private ECUC-MODULE-DEF sibling.
    multiplicityConfigClasses: [],
  };
}

/** Read text content of a (possibly attribute-bearing) XML element. */
function readElementText(node: unknown): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'object' && node !== null) {
    const text = (node as Record<string, unknown>)['#text'];
    if (typeof text === 'string') return text;
  }
  return '';
}

/**
 * v1.7.1 S3 — read the `<DESC>` element body from a BSWMD node.
 *
 * Returns `undefined` when the field is absent OR present but empty
 * (e.g. `<DESC></DESC>`) — the two cases collapse to the same value
 * so downstream UI code does not have to distinguish "no
 * description declared" from "explicitly empty description".
 *
 * Reuses `readElementText` so the same string-extraction rules apply
 * (handles attribute-bearing elements and `<DESC>` with mixed
 * whitespace / line breaks).
 */
function readDesc(item: Record<string, unknown>): string | undefined {
  const text = readElementText(item['DESC']);
  return text === '' ? undefined : text;
}

/** Read the `@_DEST` attribute from an element node (or empty string). */
function readDestAttr(node: unknown): string {
  if (typeof node !== 'object' || node === null) return '';
  const dest = (node as Record<string, unknown>)['@_DEST'];
  return typeof dest === 'string' ? dest : '';
}

/** Last `/`-separated segment of an AUTOSAR reference path. */
function lastPathSegment(path: string): string {
  if (path === '') return '';
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

function buildProvidedEntries(
  module: Record<string, unknown>,
  modulePath: string,
  warnings?: string[],
): readonly ProvidedEntry[] {
  const provided = module['PROVIDED-ENTRYS'];
  if (typeof provided !== 'object' || provided === null) return [];
  const out: ProvidedEntry[] = [];
  for (const wrapper of asArray<Record<string, unknown>>(
    (provided as Record<string, unknown>)['BSW-MODULE-ENTRY-REF-CONDITIONAL'],
  )) {
    // Path 1 — AUTOSAR standard: SHORT-NAME + ENTRY-REF on the wrapper.
    // Wrapper SHORT-NAME wins over any inferred name when present.
    let shortName: string | undefined = readShortName(wrapper);
    let entryRefPath = '';
    let entryKind = '';
    const entryRef = wrapper['ENTRY-REF'];
    if (typeof entryRef === 'string' || (typeof entryRef === 'object' && entryRef !== null)) {
      entryRefPath = readElementText(entryRef);
      entryKind = readDestAttr(entryRef);
    }

    // Path 2 — EB tresos fallback: BSW-MODULE-ENTRY-REF inside the wrapper,
    // with no SHORT-NAME on the wrapper. We synthesise shortName from the
    // last path segment so lookup helpers and round-trip tests still see
    // the entry. Surface a warning so the project panel can flag it.
    if (shortName === undefined) {
      const inner = wrapper['BSW-MODULE-ENTRY-REF'];
      if (typeof inner === 'string' || (typeof inner === 'object' && inner !== null)) {
        entryRefPath = readElementText(inner);
        if (entryKind === '') entryKind = readDestAttr(inner);
      }
      if (entryRefPath !== '') {
        shortName = lastPathSegment(entryRefPath);
        if (warnings !== undefined) {
          warnings.push(
            `${modulePath}: provided entry omits wrapper <SHORT-NAME>; derived '${shortName}' from <BSW-MODULE-ENTRY-REF>`,
          );
        }
      }
    }

    if (shortName === undefined || shortName === '') {
      if (warnings !== undefined) {
        warnings.push(
          `${modulePath}: provided entry has no <SHORT-NAME> and no usable entry ref; skipped`,
        );
      }
      continue;
    }
    out.push({
      shortName,
      path: `${modulePath}/${shortName}`,
      entryRefPath,
      entryKind,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// AUTOSAR standard ECUC-MODULE-DEF dialect
// ---------------------------------------------------------------------------

function buildEcucModule(
  item: Record<string, unknown>,
  parentPath: string,
  warnings?: string[],
  guard?: DepthGuard,
): BswModuleDef | null {
  const shortName = readShortName(item);
  if (shortName === undefined) return null;
  const path = `${parentPath}/${shortName}`;
  const containersRaw = item['CONTAINERS'];
  const containers: ContainerDef[] = [];
  if (typeof containersRaw === 'object' && containersRaw !== null) {
    containers.push(
      ...buildContainerList(containersRaw as Record<string, unknown>, path, warnings, guard),
    );
  }
  // v1.14.1 PATCH-G (G1) — extract <HEADER><SHORT-NAME> and
  // <STD-INCLUDES>/<STD-INCLUDE>/<SHORT-NAME>. fast-xml-parser
  // collapses single child to a string and multiple children to
  // an array; `asArray` normalizes both.
  const headerRaw = asArray<Record<string, unknown>>(item['HEADER'])[0];
  const moduleHeader = headerRaw ? readShortName(headerRaw) : undefined;
  const stdIncludesEl = asArray<Record<string, unknown>>(item['STD-INCLUDES'])[0];
  // v1.14.2 PATCH-H (H1) — empty `<STD-INCLUDE><SHORT-NAME>` is kept
  // as `''` in `includes[]` so the SEC3 validator
  // (`validateModuleHeaderPaths` in `core/generator/modules/_shared.ts`)
  // can push `BSW-SEC-003` for it. The v1.14.1 PATCH-G string warning
  // is removed — the validator owns the channel now and exposes the
  // strict-mode upgrade path the v1.14.1 spec promised (line 168:
  // "`strict: true` (CLI flag) promotes `BSW-SEC-003` from WARN →
  // ERROR"). The shape change is additive for callers that filter
  // falsy entries (the H2 `buildSelfIncludes` helper does so
  // explicitly) and a 1-line `inc === ''` branch in the validator.
  const includes: string[] = stdIncludesEl
    ? asArray<Record<string, unknown>>(stdIncludesEl['STD-INCLUDE']).flatMap((si) => {
        const name = readShortName(si);
        return name === undefined ? [''] : [name];
      })
    : [];
  return {
    shortName,
    path,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers,
    providedEntries: [],
    lowerMultiplicity: readLowerMultiplicity(item),
    upperMultiplicity: readUpperMultiplicity(item),
    multiplicityConfigClasses: readMultiplicityConfigClasses(item),
    moduleHeader,
    includes,
  };
}

function buildContainerList(
  node: Record<string, unknown>,
  parentPath: string,
  warnings?: string[],
  guard?: DepthGuard,
): ContainerDef[] {
  const out: ContainerDef[] = [];
  // Sprint 13+ Q6 — per-parent duplicate container detection. A
  // module / container with two `<ECUC-PARAM-CONF-CONTAINER-DEF>`
  // sharing the same `<SHORT-NAME>` is a schema conflict; the second
  // copy gets retained (existing behaviour) but flagged.
  const seenContainerShortNames = new Set<string>();
  for (const [tagName, raw] of Object.entries(node)) {
    if (tagName.startsWith('@_') || tagName === '#text') continue;
    for (const item of asArray<Record<string, unknown>>(raw)) {
      if (tagName === 'ECUC-PARAM-CONF-CONTAINER-DEF') {
        const c = buildContainer(item, parentPath, warnings, guard);
        if (seenContainerShortNames.has(c.shortName) && warnings !== undefined) {
          warnings.push(
            `Duplicate container definition "${c.shortName}" at ${c.path} — first-wins, later copy retained but shadowed by the first lookup`,
          );
        }
        seenContainerShortNames.add(c.shortName);
        out.push(c);
        continue;
      }
      if (tagName === 'ECUC-CHOICE-ORIENTED-STRUCTURE-DEF') {
        out.push(buildChoiceContainer(item, parentPath, warnings, guard));
        continue;
      }
      // Bug — Vector/EB tresos dialect BSWMDs use the shorter
      // `ECUC-CHOICE-CONTAINER-DEF` tag for choice containers instead
      // of the AUTOSAR-standard `ECUC-CHOICE-ORIENTED-STRUCTURE-DEF`.
      // Both have an identical `<CHOICES>` block of nested
      // `ECUC-PARAM-CONF-CONTAINER-DEF` branches, so the same builder
      // handles either tag. Before this branch was added the parser
      // fell through to the "Unknown container kind" warning and the
      // choice subtree was silently dropped — user-reported as
      // "JWQ3399SpiConfig comes back empty even though BSWMD
      // declares CommonContainer and ChoiceContainer".
      if (tagName === 'ECUC-CHOICE-CONTAINER-DEF') {
        out.push(buildChoiceContainer(item, parentPath, warnings, guard));
        continue;
      }
      // Unknown inner container kind — surface as a non-fatal warning so
      // the project panel can flag the file without aborting the whole parse.
      if (warnings !== undefined) {
        warnings.push(`Unknown container kind '${tagName}' at ${parentPath}`);
      }
    }
  }
  return out;
}

/**
 * Maximum allowed container-nesting depth. Generous enough to cover any
 * real AUTOSAR schema (typically < 20 levels even for deeply-nested
 * modules like EcuC) but small enough to short-circuit pathological
 * BSWMDs that would otherwise blow the V8 call stack.
 *
 * Sprint 13 Stage 5.D — defensive limit. Tripping the limit produces
 * an `invalid-structure` `BswmdError` so the renderer can show a clean
 * message ("Container nesting depth exceeds 64") instead of crashing
 * the main process.
 */
export const MAX_CONTAINER_DEPTH = 64;

/**
 * Recursion depth tracker for the container builder functions. Created
 * once per `parseBswmd` call and threaded through the recursive
 * `buildContainer` / `buildContainerList` / `buildChoiceContainer`
 * chain. The `error` field is set when the depth limit is exceeded;
 * callers up the stack check it on the way back up and abort.
 */
interface DepthGuard {
  depth: number;
  error: BswmdError | null;
}

function buildContainer(
  item: Record<string, unknown>,
  parentPath: string,
  warnings?: string[],
  guard?: DepthGuard,
): ContainerDef {
  const shortName = readShortName(item) ?? '<unnamed>';
  const path = `${parentPath}/${shortName}`;
  // Increment depth at the start of each container build. If we've
  // crossed the cap, set the guard's error and return a stub so the
  // recursion can unwind without further work. The parseBswmd caller
  // will see the error and surface it as a fatal Result.
  if (guard !== undefined) {
    guard.depth += 1;
    if (guard.depth > MAX_CONTAINER_DEPTH) {
      if (guard.error === null) {
        guard.error = {
          kind: 'invalid-structure',
          path,
          message: `Container nesting depth exceeds ${MAX_CONTAINER_DEPTH} (path: ${path})`,
        };
      }
      return {
        shortName,
        path,
        lowerMultiplicity: readLowerMultiplicity(item),
        upperMultiplicity: readUpperMultiplicity(item),
        subContainers: [],
        parameters: [],
        references: [],
        choices: [],
        desc: readDesc(item),
        multiplicityConfigClasses: readMultiplicityConfigClasses(item),
      };
    }
  }
  const subContainers: ContainerDef[] = [];
  const subRaw = item['SUB-CONTAINERS'];
  if (typeof subRaw === 'object' && subRaw !== null) {
    subContainers.push(
      ...buildContainerList(subRaw as Record<string, unknown>, path, warnings, guard),
    );
  }
  const parameters: ParamDef[] = [];
  const paramsRaw = item['PARAMETERS'];
  if (typeof paramsRaw === 'object' && paramsRaw !== null) {
    parameters.push(...buildParamList(paramsRaw as Record<string, unknown>, path, warnings));
  }
  const references: ReferenceDef[] = [];
  const refsRaw = item['REFERENCES'];
  if (typeof refsRaw === 'object' && refsRaw !== null) {
    references.push(...buildRefList(refsRaw as Record<string, unknown>, path));
  }
  const result: ContainerDef = {
    shortName,
    path,
    lowerMultiplicity: readLowerMultiplicity(item),
    upperMultiplicity: readUpperMultiplicity(item),
    subContainers,
    parameters,
    references,
    choices: [],
    desc: readDesc(item),
    multiplicityConfigClasses: readMultiplicityConfigClasses(item),
  };
  if (guard !== undefined) {
    guard.depth -= 1;
  }
  return result;
}

function buildChoiceContainer(
  item: Record<string, unknown>,
  parentPath: string,
  warnings?: string[],
  guard?: DepthGuard,
): ContainerDef {
  // ECUC-CHOICE-ORIENTED-STRUCTURE-DEF is structurally a container with
  // a `<CHOICES>` block of nested ECUC-PARAM-CONF-CONTAINER-DEF. We surface
  // the choices as a separate `choices` field on the same ContainerDef so
  // the lookup helpers can find them; `subContainers` stays empty because
  // choice branches are not nested sub-containers in the ECUC sense.
  const shortName = readShortName(item) ?? '<unnamed>';
  const path = `${parentPath}/${shortName}`;
  // Choice containers count toward the depth limit too: a deeply-nested
  // CHOICES tree is the same SOF risk as a deeply-nested SUB-CONTAINERS.
  if (guard !== undefined) {
    guard.depth += 1;
    if (guard.depth > MAX_CONTAINER_DEPTH) {
      if (guard.error === null) {
        guard.error = {
          kind: 'invalid-structure',
          path,
          message: `Container nesting depth exceeds ${MAX_CONTAINER_DEPTH} (path: ${path})`,
        };
      }
      return {
        shortName,
        path,
        lowerMultiplicity: readLowerMultiplicity(item),
        upperMultiplicity: readUpperMultiplicity(item),
        subContainers: [],
        parameters: [],
        references: [],
        choices: [],
        desc: readDesc(item),
        multiplicityConfigClasses: readMultiplicityConfigClasses(item),
      };
    }
  }
  const choicesRaw = item['CHOICES'];
  const choices: ContainerDef[] = [];
  if (typeof choicesRaw === 'object' && choicesRaw !== null) {
    choices.push(
      ...buildContainerList(choicesRaw as Record<string, unknown>, path, warnings, guard),
    );
  }
  const result: ContainerDef = {
    shortName,
    path,
    lowerMultiplicity: readLowerMultiplicity(item),
    upperMultiplicity: readUpperMultiplicity(item),
    subContainers: [],
    parameters: [],
    references: [],
    choices,
    desc: readDesc(item),
    multiplicityConfigClasses: readMultiplicityConfigClasses(item),
  };
  if (guard !== undefined) {
    guard.depth -= 1;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

function buildParamList(
  node: Record<string, unknown>,
  parentPath: string,
  warnings?: string[],
): ParamDef[] {
  const out: ParamDef[] = [];
  // Sprint 13+ Q6 — per-container duplicate parameter detection.
  const seenParamShortNames = new Set<string>();
  for (const [tagName, raw] of Object.entries(node)) {
    if (tagName.startsWith('@_') || tagName === '#text') continue;
    const kind = paramKindFromTag(tagName);
    if (kind === null) continue;
    for (const item of asArray<Record<string, unknown>>(raw)) {
      const p = buildParam(item, parentPath, kind);
      if (seenParamShortNames.has(p.shortName) && warnings !== undefined) {
        warnings.push(
          `Duplicate parameter "${p.shortName}" at ${parentPath}/${p.shortName} — first-wins, later copy retained but shadowed by the first lookup`,
        );
      }
      seenParamShortNames.add(p.shortName);
      out.push(p);
    }
  }
  return out;
}

function paramKindFromTag(tag: string): ParamKind | null {
  switch (tag) {
    case 'ECUC-INTEGER-PARAM-DEF':
      return 'integer';
    case 'ECUC-BOOLEAN-PARAM-DEF':
      return 'boolean';
    case 'ECUC-ENUMERATION-PARAM-DEF':
      return 'enumeration';
    case 'ECUC-FLOAT-PARAM-DEF':
      return 'float';
    case 'ECUC-STRING-PARAM-DEF':
      return 'string';
    case 'ECUC-FUNCTION-NAME-DEF':
      return 'function-name';
    default:
      return null;
  }
}

function buildParam(item: Record<string, unknown>, parentPath: string, kind: ParamKind): ParamDef {
  const shortName = readShortName(item) ?? '<unnamed>';
  const path = `${parentPath}/${shortName}`;
  const minValue = kind === 'integer' || kind === 'float' ? readNumber(item['MIN']) : null;
  const maxValue = kind === 'integer' || kind === 'float' ? readNumber(item['MAX']) : null;
  // `function-name` shares `string`'s length constraints per AUTOSAR TPS —
  // symbol names are bounded strings — so apply the same MIN/MAX-LENGTH.
  const minLength =
    kind === 'string' || kind === 'function-name' ? readNumber(item['MIN-LENGTH']) : null;
  const maxLength =
    kind === 'string' || kind === 'function-name' ? readNumber(item['MAX-LENGTH']) : null;
  const enumerationLiterals = kind === 'enumeration' ? readEnumerationLiterals(item) : [];
  const defaultValue = readDefaultValue(item, kind);
  return {
    shortName,
    path,
    kind,
    defaultValue,
    minValue,
    maxValue,
    minLength,
    maxLength,
    enumerationLiterals,
    desc: readDesc(item),
  };
}

function readEnumerationLiterals(item: Record<string, unknown>): readonly string[] {
  const literals = item['LITERALS'];
  if (typeof literals !== 'object' || literals === null) return [];
  const out: string[] = [];
  for (const lit of asArray<Record<string, unknown>>(
    (literals as Record<string, unknown>)['ECUC-ENUMERATION-LITERAL-DEF'],
  )) {
    const name = readShortName(lit);
    if (name !== undefined) out.push(name);
  }
  return out;
}

function readDefaultValue(
  item: Record<string, unknown>,
  kind: ParamKind,
): string | number | boolean | null {
  const raw = item['DEFAULT-VALUE'];
  switch (kind) {
    case 'integer': {
      const n = readNumber(raw);
      return n === null ? null : Math.trunc(n);
    }
    case 'float': {
      const n = readNumber(raw);
      return n;
    }
    case 'boolean': {
      const b = readBoolean(raw);
      return b;
    }
    case 'enumeration':
    case 'string':
    case 'function-name':
      if (typeof raw === 'string') return raw;
      if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
      return null;
  }
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

function buildRefList(node: Record<string, unknown>, parentPath: string): ReferenceDef[] {
  const out: ReferenceDef[] = [];
  for (const [tagName, raw] of Object.entries(node)) {
    if (tagName.startsWith('@_') || tagName === '#text') continue;
    // Bug — `ECUC-CHOICE-REFERENCE-DEF` is the standard AUTOSAR way
    // to declare a reference whose target can be any of several
    // alternative container kinds (e.g. CanIf / Arti / Com picking
    // between different `DESTINATION-REF`s). Vector / EB tresos
    // BSWMDs use it ~80 times across the canonical ECUConfiguration
    // fixture (see samples/arxml/AUTOSAR_MOD_ECUConfigurationParameters.arxml
    // — CanIf/Arti/Com all carry these). Before this branch was
    // added the parser silently skipped the entire `<REFERENCES>`
    // block on any container that mixed choice references with plain
    // ones — the user could not add the reference via the picker
    // and the validator's DEST_KIND_MAP had no entry.
    //
    // The destKind field falls back to the tagName itself when
    // `<DESTINATION-REF>` is absent, mirroring the plain-reference
    // default. A future task may parse the multi-target
    // `<DESTINATION-REFS>` block for round-trip fidelity — see
    // validate.ts:DEST_KIND_MAP for the downstream consumer.
    if (
      tagName !== 'ECUC-REFERENCE-DEF' &&
      tagName !== 'ECUC-FOREIGN-REFERENCE-DEF' &&
      tagName !== 'ECUC-CHOICE-REFERENCE-DEF'
    ) {
      continue;
    }
    for (const item of asArray<Record<string, unknown>>(raw)) {
      out.push(buildRef(item, parentPath, tagName));
    }
  }
  return out;
}

function buildRef(
  item: Record<string, unknown>,
  parentPath: string,
  tagName: string,
): ReferenceDef {
  const shortName = readShortName(item) ?? '<unnamed>';
  const path = `${parentPath}/${shortName}`;
  const dest = item['DESTINATION-REF'];
  let destKind = tagName;
  if (typeof dest === 'object' && dest !== null) {
    const d = (dest as Record<string, unknown>)['@_DEST'];
    if (typeof d === 'string') destKind = d;
  }
  return {
    shortName,
    path,
    destKind,
    lowerMultiplicity: readLowerMultiplicity(item),
    upperMultiplicity: readUpperMultiplicity(item),
  };
}

/**
 * Sprint 14 — return the subset of `doc.modules` whose shortName is NOT
 * in `doc.disabledModules`. Treats missing `disabledModules` as empty.
 */
export function getActiveModules(doc: BswmdDocument): readonly BswModuleDef[] {
  const disabled = doc.disabledModules ?? new Set<string>();
  return doc.modules.filter((m) => !disabled.has(m.shortName));
}
