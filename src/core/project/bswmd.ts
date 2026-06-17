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
}

export interface ReferenceDef {
  readonly shortName: string;
  readonly path: string;
  readonly destKind: string;
  readonly lowerMultiplicity: number;
  readonly upperMultiplicity: number | 'infinite';
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
  const moduleError = walkPackagesForModules(
    arPackages as Record<string, unknown>,
    '',
    modules,
    warnings,
  );
  if (moduleError !== null) {
    return { ok: false, error: moduleError };
  }

  return { ok: true, value: { version, modules, warnings } };
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
): BswmdError | null {
  for (const pkg of asArray<Record<string, unknown>>(node['AR-PACKAGE'])) {
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
      );
      if (err !== null) return err;
    }
    const nestedRaw = pkg['AR-PACKAGES'];
    if (typeof nestedRaw === 'object' && nestedRaw !== null) {
      const err = walkPackagesForModules(nestedRaw as Record<string, unknown>, path, out, warnings);
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
): BswmdError | null {
  for (const [tagName, raw] of Object.entries(node)) {
    if (tagName.startsWith('@_') || tagName === '#text') continue;
    for (const item of asArray<Record<string, unknown>>(raw)) {
      if (tagName === 'BSW-MODULE-DESCRIPTION') {
        const mod = buildEbModule(item, parentPath, warnings);
        if (mod !== null) {
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
        const mod = buildEcucModule(item, parentPath, warnings);
        if (mod !== null) {
          out.push(mod);
        } else {
          return {
            kind: 'invalid-structure',
            path: parentPath,
            message: `ECUC-MODULE-DEF at ${parentPath} is missing <SHORT-NAME>`,
          };
        }
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
): BswModuleDef | null {
  const shortName = readShortName(item);
  if (shortName === undefined) return null;
  const path = `${parentPath}/${shortName}`;
  const containersRaw = item['CONTAINERS'];
  const containers: ContainerDef[] = [];
  if (typeof containersRaw === 'object' && containersRaw !== null) {
    containers.push(
      ...buildContainerList(containersRaw as Record<string, unknown>, path, warnings),
    );
  }
  return {
    shortName,
    path,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers,
    providedEntries: [],
    lowerMultiplicity: readLowerMultiplicity(item),
    upperMultiplicity: readUpperMultiplicity(item),
  };
}

function buildContainerList(
  node: Record<string, unknown>,
  parentPath: string,
  warnings?: string[],
): ContainerDef[] {
  const out: ContainerDef[] = [];
  for (const [tagName, raw] of Object.entries(node)) {
    if (tagName.startsWith('@_') || tagName === '#text') continue;
    for (const item of asArray<Record<string, unknown>>(raw)) {
      if (tagName === 'ECUC-PARAM-CONF-CONTAINER-DEF') {
        out.push(buildContainer(item, parentPath));
        continue;
      }
      if (tagName === 'ECUC-CHOICE-ORIENTED-STRUCTURE-DEF') {
        out.push(buildChoiceContainer(item, parentPath));
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

function buildContainer(item: Record<string, unknown>, parentPath: string): ContainerDef {
  const shortName = readShortName(item) ?? '<unnamed>';
  const path = `${parentPath}/${shortName}`;
  const subContainers: ContainerDef[] = [];
  const subRaw = item['SUB-CONTAINERS'];
  if (typeof subRaw === 'object' && subRaw !== null) {
    subContainers.push(...buildContainerList(subRaw as Record<string, unknown>, path));
  }
  const parameters: ParamDef[] = [];
  const paramsRaw = item['PARAMETERS'];
  if (typeof paramsRaw === 'object' && paramsRaw !== null) {
    parameters.push(...buildParamList(paramsRaw as Record<string, unknown>, path));
  }
  const references: ReferenceDef[] = [];
  const refsRaw = item['REFERENCES'];
  if (typeof refsRaw === 'object' && refsRaw !== null) {
    references.push(...buildRefList(refsRaw as Record<string, unknown>, path));
  }
  return {
    shortName,
    path,
    lowerMultiplicity: readLowerMultiplicity(item),
    upperMultiplicity: readUpperMultiplicity(item),
    subContainers,
    parameters,
    references,
    choices: [],
  };
}

function buildChoiceContainer(item: Record<string, unknown>, parentPath: string): ContainerDef {
  // ECUC-CHOICE-ORIENTED-STRUCTURE-DEF is structurally a container with
  // a `<CHOICES>` block of nested ECUC-PARAM-CONF-CONTAINER-DEF. We surface
  // the choices as a separate `choices` field on the same ContainerDef so
  // the lookup helpers can find them; `subContainers` stays empty because
  // choice branches are not nested sub-containers in the ECUC sense.
  const shortName = readShortName(item) ?? '<unnamed>';
  const path = `${parentPath}/${shortName}`;
  const choicesRaw = item['CHOICES'];
  const choices: ContainerDef[] = [];
  if (typeof choicesRaw === 'object' && choicesRaw !== null) {
    choices.push(...buildContainerList(choicesRaw as Record<string, unknown>, path));
  }
  return {
    shortName,
    path,
    lowerMultiplicity: readLowerMultiplicity(item),
    upperMultiplicity: readUpperMultiplicity(item),
    subContainers: [],
    parameters: [],
    references: [],
    choices,
  };
}

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

function buildParamList(node: Record<string, unknown>, parentPath: string): ParamDef[] {
  const out: ParamDef[] = [];
  for (const [tagName, raw] of Object.entries(node)) {
    if (tagName.startsWith('@_') || tagName === '#text') continue;
    const kind = paramKindFromTag(tagName);
    if (kind === null) continue;
    for (const item of asArray<Record<string, unknown>>(raw)) {
      out.push(buildParam(item, parentPath, kind));
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
    if (tagName !== 'ECUC-REFERENCE-DEF' && tagName !== 'ECUC-FOREIGN-REFERENCE-DEF') continue;
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
