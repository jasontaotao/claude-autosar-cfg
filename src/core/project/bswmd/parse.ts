// core/project/bswmd/parse.ts
// BSWMD (BSW Module Description, schema-side) parser. Sprint 12 #1 Task 1.
//
// Split from `src/core/project/bswmd.ts` as part of v1.41.x PATCH T1
// (file-size backlog). Owns: the public `parseBswmd` entry point, the
// EB-tresos dialect builder (`buildEbModule`), the AUTOSAR-standard
// ECUC-MODULE-DEF builder (`buildEcucModule` / `buildContainerList` /
// `buildContainer` / `buildChoiceContainer`), and the parameter /
// reference sub-builders (`buildParamList` / `buildRefList` / `buildParam`
// / `buildRef` / `paramKindFromTag`).
//
// Type-only deps: `./types.js`. Runtime deps: `fast-xml-parser` for
// XML parsing + the shared `Result` discriminated union. No other
// sub-file deps — the lookup helpers live in `./lookup.js`, the
// version detection helpers live in `./validate.ts` (sub-file).
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

import type { Result } from '../../arxml/types.js';

import { walkPackagesForModuleRefs, walkPackagesForModules } from './parse-tree-walker.js';
import type {
  BswModuleDef,
  BswmdDocument,
  BswmdError,
  DepthGuard,
  ModuleRefEntry,
} from './types.js';
import { validateModuleDefaults } from './validate.js';

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

  // C11 (v1.17.0) — walk <MODULE-REF> elements that the existing
  // walkPackagesForModules silently dropped. Same recursion pattern
  // (AR-PACKAGE → ELEMENTS → MODULE-REF children). Targets are the
  // text content of <MODULE-REF>; sources are the parent AR-PACKAGE
  // path for debugging.
  const moduleRefs: ModuleRefEntry[] = [];
  walkPackagesForModuleRefs(arPackages as Record<string, unknown>, '', moduleRefs);

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

  return {
    ok: true,
    value: {
      version,
      modules,
      warnings,
      moduleRefs: moduleRefs.length === 0 ? undefined : moduleRefs,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers (shared with sibling sub-files via `export`)
// ---------------------------------------------------------------------------

export function detectVersion(autosar: Record<string, unknown>): string | null {
  const literal = detectVersionLiteral(autosar);
  if (literal === null) return null;
  return SUPPORTED_VERSIONS.has(literal) ? literal : null;
}

/** Detect the version literal from the namespace, without filtering on support. */
export function detectVersionLiteral(autosar: Record<string, unknown>): string | null {
  const xmlns = typeof autosar['@_xmlns'] === 'string' ? (autosar['@_xmlns'] as string) : '';
  const m = NS_PATTERN.exec(xmlns);
  if (!m || m[1] === undefined) return null;
  return m[1].startsWith('r') ? m[1].slice(1) : m[1];
}

export function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v === undefined || v === null) return [];
  return [v as T];
}

// `readShortName` / `readNumber` / `readBoolean` /
// `readUpperMultiplicity` / `readLowerMultiplicity` moved to
// `./parse-primitives.js` as part of v1.46.0 MINOR T2 (file-size
// backlog closure round-2). They are imported at the top of this file
// from `./parse-primitives.js`.

// `readMultiplicityConfigClasses` moved to `./parse-ecuc-dialect.js`
// in v1.46.0 MINOR T5 (file-size backlog closure round-2). It is
// imported at the top of this file from `./parse-ecuc-dialect.js`.

// ---------------------------------------------------------------------------
// EB tresos dialect — moved to `./parse-eb-dialect.js` (v1.46.0 MINOR T3).
// ---

// ---------------------------------------------------------------------------

// v1.46.0 MINOR T4: walker block moved to `./parse-tree-walker.js`;
// re-export \`findContainerInTree\` here so `lookup.ts:findContainerInTreeByPath`
// (which imports from `./parse.js`) keeps working without a cross-file edit.
export { findContainerInTree } from './parse-tree-walker.js';

// v1.46.0 MINOR T1 (cycle-break): `validateModuleDefaults` moved to
// `./validate.js` to break the v1.41.x PATCH T1 circular re-export
// (`parse.ts` ↔ `validate.ts`). `parseBswmd` still calls it via the
// import above; the implementation + `walkContainerDefaults` walker
// live in `validate.ts`.
