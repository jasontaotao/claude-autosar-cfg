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

import { buildEbModule, readElementText } from './parse-eb-dialect.js';
import { buildEcucModule } from './parse-ecuc-dialect.js';
import { readShortName } from './parse-primitives.js';
import type {
  BswModuleDef,
  BswmdDocument,
  BswmdError,
  ContainerDef,
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

export function findContainerInTree(
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

/**
 * C11 (v1.17.0) — walk AR-PACKAGES to collect `<MODULE-REF>` elements.
 *
 * Mirrors `walkPackagesForModules` recursion: descends into nested
 * AR-PACKAGES and walks ELEMENTS at each level, but instead of building
 * module defs it extracts `<MODULE-REF>` children. Each `<MODULE-REF>`
 * carries a target path (text body) and is attributed to the parent
 * AR-PACKAGE for debugging.
 *
 * AR-PACKAGES are bounded by tree depth (typically < 10 levels), so no
 * DepthGuard is needed — moduleRefs walking only recurses into
 * AR-PACKAGES, never into ELEMENTS / container sub-trees that drove the
 * depth-guard rationale for `walkPackagesForModules`.
 *
 * Empty AR-PACKAGES (no `<MODULE-REF>` children anywhere) → no entries
 * appended; the caller decides whether to surface an empty array vs.
 * `undefined` at the document level.
 */
function walkPackagesForModuleRefs(
  node: Record<string, unknown>,
  parentPath: string,
  out: ModuleRefEntry[],
): void {
  for (const pkg of asArray<Record<string, unknown>>(node['AR-PACKAGE'])) {
    const shortName = readShortName(pkg);
    if (shortName === undefined) continue;
    const path = `${parentPath}/${shortName}`;
    const elementsRaw = pkg['ELEMENTS'];
    if (typeof elementsRaw === 'object' && elementsRaw !== null) {
      const moduleRefRaw = (elementsRaw as Record<string, unknown>)['MODULE-REF'];
      if (moduleRefRaw !== undefined) {
        for (const item of asArray<Record<string, unknown>>(moduleRefRaw)) {
          const target = readElementText(item);
          if (target !== '') {
            out.push({ target, source: path });
          }
        }
      }
    }
    const nestedRaw = pkg['AR-PACKAGES'];
    if (typeof nestedRaw === 'object' && nestedRaw !== null) {
      walkPackagesForModuleRefs(nestedRaw as Record<string, unknown>, path, out);
    }
  }
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
// EB tresos dialect — moved to `./parse-eb-dialect.js` (v1.46.0 MINOR T3).
// ---

// ---------------------------------------------------------------------------

// v1.46.0 MINOR T1 (cycle-break): `validateModuleDefaults` moved to
// `./validate.js` to break the v1.41.x PATCH T1 circular re-export
// (`parse.ts` ↔ `validate.ts`). `parseBswmd` still calls it via the
// import above; the implementation + `walkContainerDefaults` walker
// live in `validate.ts`.
