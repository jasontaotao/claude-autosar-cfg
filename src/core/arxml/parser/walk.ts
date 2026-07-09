// core/arxml/parser/walk.ts
// Package walker + classify + read helpers. Split from
// `src/core/arxml/parser.ts` as part of v1.41.x PATCH T4 (file-size
// backlog).
//
// Internal helpers: asArray, readShortName, readLongName,
// walkPackages, walkPackagesAtDepth, findAnyModuleInPackages,
// findAnyDefInPackages, walkElements, classifyElement, MAX_ARPKG_DEPTH.

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ArxmlPackage,
  ArxmlReference,
} from '../types.js';
import { buildModule, buildContainer, buildReference } from './build.js';

export function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v === undefined || v === null) return [];
  return [v as T];
}

export function readShortName(elem: Record<string, unknown>): string | undefined {
  const sn = elem['SHORT-NAME'];
  if (typeof sn === 'string') return sn;
  if (typeof sn === 'object' && sn !== null) {
    const t = (sn as Record<string, unknown>)['#text'];
    if (typeof t === 'string') return t;
  }
  return undefined;
}

export function readLongName(elem: Record<string, unknown>): string | undefined {
  const ln = elem['LONG-NAME'];
  if (typeof ln === 'string') return ln;
  if (typeof ln === 'object' && ln !== null) {
    const l4 = (ln as Record<string, unknown>)['L-4'];
    if (typeof l4 === 'string') return l4;
  }
  return undefined;
}

/**
 * Sprint 9 #12 (review M-1): maximum AR-PACKAGE nesting depth. Real R21/R22 BSW
 * files top out at 3-4 levels; the ceiling is generous so vendor quirks never
 * hit it, while adversarial / malformed XML cannot blow the V8 stack. On
 * overflow the deeper packages are silently dropped (same contract as missing
 * AR-PACKAGES) rather than throwing — parseArxml should never throw.
 */
const MAX_ARPKG_DEPTH = 16;

/**
 * v1.38.0 MINOR T2 (H1) — collision detector for param shortName keys.
 * Two distinct BSWMD DEFINITION-REF paths (e.g. `/Mod/A/CommonParam` and
 * `/Mod/B/CommonParam`) that share the same shortName tail would silently
 * overwrite each other when keyed by shortName. The walk records the
 * first such collision in a mutable collector so the top-level parser
 * can convert it into a structured `invalid-structure` ParseError. The
 * shortName key shape is preserved everywhere else — only collisions
 * are flagged, leaving the no-collision path byte-identical to pre-T2.
 */
interface ParamKeyCollision {
  readonly shortName: string;
  readonly firstDefPath: string;
  readonly secondDefPath: string;
  readonly containerPath: string;
}
export interface CollisionCollector {
  collision: ParamKeyCollision | undefined;
}

export function walkPackages(
  node: Record<string, unknown>,
  parentPath: string,
  collector: CollisionCollector,
): ArxmlPackage[] {
  return walkPackagesAtDepth(node, parentPath, 0, collector);
}

export function walkPackagesAtDepth(
  node: Record<string, unknown>,
  parentPath: string,
  depth: number,
  collector: CollisionCollector,
): ArxmlPackage[] {
  if (depth > MAX_ARPKG_DEPTH) {
    // Pathological / adversarial nesting — truncate at the limit. Parser
    // contract stays intact (ok: true with truncated tree); the validation
    // pipeline still surfaces the truncation through missing path-index
    // entries for any deeper references.
    return [];
  }
  const arr = asArray<Record<string, unknown>>(node['AR-PACKAGE']);
  return arr.map((pkg, idx) => {
    const shortName = readShortName(pkg) ?? `<unnamed-${idx}>`;
    const path = `${parentPath}/${shortName}`;
    const elementsRaw = pkg['ELEMENTS'];
    const elements = walkElements(
      typeof elementsRaw === 'object' && elementsRaw !== null
        ? (elementsRaw as Record<string, unknown>)
        : {},
      path,
      collector,
    );
    // Sprint 9 #12: recurse into nested <AR-PACKAGES>. R21/R22 BSW files use a
    // 2+ level hierarchy (e.g. AUTOSAR_R22 > EcucDefs > <module>); before this
    // change the outer package's elements were silently dropped because the
    // walker only looked at pkg['ELEMENTS'].
    const nestedPackagesRaw = pkg['AR-PACKAGES'];
    const nested = walkPackagesAtDepth(
      typeof nestedPackagesRaw === 'object' && nestedPackagesRaw !== null
        ? (nestedPackagesRaw as Record<string, unknown>)
        : {},
      path,
      depth + 1,
      collector,
    );
    // Sprint 9 #12 (review M-2): bind readLongName once instead of calling it
    // twice in the spread conditional.
    const longName = readLongName(pkg);
    return {
      shortName,
      ...(longName !== undefined ? { longName } : {}),
      path,
      elements,
      ...(nested.length > 0 ? { packages: nested } : {}),
    };
  });
}

/**
 * Walk a package subtree looking for any module element
 * (ECUC-MODULE-CONFIGURATION-VALUES that survived classifyElement's
 * 'module' branch). Used to distinguish value files from pure schema files.
 */
export function findAnyModuleInPackages(packages: readonly ArxmlPackage[]): boolean {
  for (const pkg of packages) {
    if (pkg.elements.some((e) => e.kind === 'module')) return true;
    if (pkg.packages !== undefined && findAnyModuleInPackages(pkg.packages)) {
      return true;
    }
  }
  return false;
}

/**
 * Walk a package subtree looking for any element whose original tagName
 * ends in '-DEF' (i.e. schema definition). Pure-BSWMD files contain only
 * such elements; mixed files contain at least one module element.
 */
export function findAnyDefInPackages(packages: readonly ArxmlPackage[]): boolean {
  for (const pkg of packages) {
    if (pkg.elements.some((e) => e.tagName.endsWith('-DEF'))) return true;
    if (pkg.packages !== undefined && findAnyDefInPackages(pkg.packages)) {
      return true;
    }
  }
  return false;
}

export function walkElements(
  node: Record<string, unknown>,
  parentPath: string,
  collector: CollisionCollector,
): ArxmlElement[] {
  const out: ArxmlElement[] = [];
  for (const [tagName, raw] of Object.entries(node)) {
    if (tagName.startsWith('@_') || tagName === '#text') continue;
    for (const item of asArray<Record<string, unknown>>(raw)) {
      const elem = classifyElement(tagName, item, parentPath, collector);
      if (elem) out.push(elem);
    }
  }
  return out;
}

export function classifyElement(
  tagName: string,
  item: Record<string, unknown>,
  parentPath: string,
  collector: CollisionCollector,
): ArxmlElement | null {
  if (tagName === 'ECUC-MODULE-CONFIGURATION-VALUES') {
    return buildModule(tagName, item, parentPath, collector);
  }
  if (tagName === 'ECUC-CONTAINER-VALUE') {
    return buildContainer(tagName, item, parentPath, collector);
  }
  // Generic containers (any other ECUC-* tag) treated as container if has SHORT-NAME
  if (tagName.startsWith('ECUC-')) {
    if (readShortName(item) !== undefined) {
      return buildContainer(tagName, item, parentPath, collector);
    }
    return null;
  }
  // Skip TEXTUAL-DEF-CONDITION etc. (not needed for F1)
  if (tagName === 'DEFINITION-REF' || tagName === 'REFERENCE' || tagName === 'VALUE-REF') {
    return buildReference(tagName, item);
  }
  // v1.4.0 trust sprint — 17c. Catch-all for any tag the parser does not
  // classify as module / container / reference (vendor extensions such as
  // SERVICE-NEEDS, EXCLUSIVE-AREA, /EAS/ namespaced elements). The original
  // fast-xml-parser node is captured verbatim and re-emitted by the
  // serializer without string re-parsing.
  return { kind: 'unknown', tagName, parsed: item };
}
