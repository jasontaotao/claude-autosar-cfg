// core/project/bswmd/parse-eb-dialect.ts
// EB-tresos BSW-MODULE-DESCRIPTION dialect builders + element-text
// helpers.
//
// Split from `src/core/project/bswmd/parse.ts` as part of v1.46.0
// MINOR T3 (file-size backlog closure round-2).
//
// Why these 6 helpers live here vs. in `parse.ts`: they're the
// EB-tresos dialect's shape recognition + element-text readers. They
// don't know about ECUC-MODULE-DEF (autosar-standard) containers /
// choices / parameters — those live in `parse-ecuc-dialect.ts`.
// Splitting the two dialects makes the dialect boundary explicit and
// reduces parse.ts to just the entry function + version detection.
//
// Scope boundary:
//   - `buildEbModule` recognises the EB-tresos dialect shape
//     (`<BSW-MODULE-DESCRIPTION>` + `<MODULE-ID>` +
//     `<PROVIDED-ENTRYS>`).
//   - `buildProvidedEntries` walks the wrapper-element path that
//     EB tresos uses, including the warning surfaces for missing
//     `SHORT-NAME`.
//
// `walkPackagesForModules` (which decides between EB vs AUTOSAR
// dialect and calls `buildEbModule`) lives in `parse-tree-walker.ts`.

import { readNumber, readShortName } from './parse-primitives.js';
import type { BswModuleDef, ProvidedEntry } from './types.js';

/**
 * Read text content of a (possibly attribute-bearing) XML element.
 *
 * fast-xml-parser represents simple text content as a string and
 * attribute-bearing / mixed-content elements as an object — this
 * helper accepts both shapes.
 */
export function readElementText(node: unknown): string {
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
export function readDesc(item: Record<string, unknown>): string | undefined {
  const text = readElementText(item['DESC']);
  return text === '' ? undefined : text;
}

/** Read the `@_DEST` attribute from an element node (or empty string). */
export function readDestAttr(node: unknown): string {
  if (typeof node !== 'object' || node === null) return '';
  const dest = (node as Record<string, unknown>)['@_DEST'];
  return typeof dest === 'string' ? dest : '';
}

/** Last `/`-separated segment of an AUTOSAR reference path. */
export function lastPathSegment(path: string): string {
  if (path === '') return '';
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

/**
 * Build the EB-tresos `<PROVIDED-ENTRYS>` block into a list of
 * `ProvidedEntry`. Walks each `<BSW-MODULE-ENTRY-REF-CONDITIONAL>`
 * wrapper with a 2-path fallback:
 *
 * - Path 1 — AUTOSAR standard: SHORT-NAME + ENTRY-REF on the wrapper.
 *   Wrapper SHORT-NAME wins over any inferred name when present.
 * - Path 2 — EB tresos fallback: BSW-MODULE-ENTRY-REF inside the wrapper,
 *   with no SHORT-NAME on the wrapper. We synthesise shortName from the
 *   last path segment so lookup helpers and round-trip tests still see
 *   the entry. Surface a warning so the project panel can flag it.
 */
export function buildProvidedEntries(
  module: Record<string, unknown>,
  modulePath: string,
  warnings?: string[],
): readonly ProvidedEntry[] {
  const provided = module['PROVIDED-ENTRYS'];
  if (typeof provided !== 'object' || provided === null) return [];
  const out: ProvidedEntry[] = [];
  const wrappers = asArrayLocal<Record<string, unknown>>(
    (provided as Record<string, unknown>)['BSW-MODULE-ENTRY-REF-CONDITIONAL'],
  );
  for (const wrapper of wrappers) {
    let shortName: string | undefined = readShortName(wrapper);
    let entryRefPath = '';
    let entryKind = '';
    const entryRef = wrapper['ENTRY-REF'];
    if (typeof entryRef === 'string' || (typeof entryRef === 'object' && entryRef !== null)) {
      entryRefPath = readElementText(entryRef);
      entryKind = readDestAttr(entryRef);
    }

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

/**
 * Build a `BswModuleDef` from an EB-tresos `<BSW-MODULE-DESCRIPTION>`
 * dialect element. The shape:
 *
 * ```xml
 * <BSW-MODULE-DESCRIPTION>
 *   <SHORT-NAME>Can</SHORT-NAME>
 *   <MODULE-ID>123</MODULE-ID>
 *   <PROVIDED-ENTRYS>...</PROVIDED-ENTRYS>
 * </BSW-MODULE-DESCRIPTION>
 * ```
 *
 * The actual container/param schema is not present here (it lives in
 * a vendor-private ECUC-MODULE-DEF sibling), so the parsed
 * `BswModuleDef` carries no `containers` or `parameters` — only the
 * dialect-specific metadata (`dialect: 'bsw-module-description'`,
 * `moduleId`, `providedEntries`).
 *
 * Returns `null` if the SHORT-NAME is missing (same convention as
 * the ECUC dialect builder).
 */
export function buildEbModule(
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

// ---------------------------------------------------------------------------
// Internal helpers (scoped to this file; not re-exported via index.ts)
// ---------------------------------------------------------------------------

/**
 * Local copy of `asArray` — kept private to this module to avoid a
 * cross-file runtime dep on `parse.ts` for one short-lived call
 * site. Once the ECUC dialect split lands (T5), a shared utility
 * location can host this; until then, duplication is cheaper than
 * the import cycle.
 */
function asArrayLocal<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v === undefined || v === null) return [];
  return [v as T];
}
