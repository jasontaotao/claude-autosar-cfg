// collections.ts — helpers for grouping Tree siblings by shortName.
//
// Used by Tree.renderChildren() to decide whether to render a "collection
// header" row above a group of same-shortName siblings. See:
//   docs/superpowers/specs/2026-07-13-multi-instance-tree-ui-design.md

import type { ArxmlElement, ParamValue } from '@core/arxml/types.js';

/**
 * Group siblings by their "base" shortName (stripping any trailing `_<digits>`
 * suffix that the BSWMD auto-suffix mechanism produces — see
 * `coreAddContainer` at src/core/arxml/mutation/container-ops.ts:98-103).
 *
 * Returns a Map keyed by base shortName; values preserve original input order.
 */
export function groupSiblingsByShortName(
  siblings: readonly ArxmlElement[],
): Map<string, ArxmlElement[]> {
  const groups = new Map<string, ArxmlElement[]>();
  for (const sibling of siblings) {
    const baseName = stripSuffix(getShortName(sibling));
    const existing = groups.get(baseName) ?? [];
    existing.push(sibling);
    groups.set(baseName, existing);
  }
  return groups;
}

export interface SiblingCollectionGroup {
  /** Stable grouping key; definition identity wins over lexical suffix. */
  readonly key: string;
  /** User-visible definition name for the collection header. */
  readonly label: string;
  /** Normalized definition-ref when the sibling carries one. */
  readonly definitionRef?: string;
  elements: ArxmlElement[];
}

/**
 * Group siblings for collection rendering.
 *
 * ECUC SHORT-NAME is an instance name and may be customized, so a numeric
 * suffix is not a reliable type identity. When a container carries
 * DEFINITION-REF, group by that full schema identity. Legacy values without
 * a definition-ref keep the old _N suffix grouping.
 */
export function groupSiblingsForCollection(
  siblings: readonly ArxmlElement[],
): Map<string, SiblingCollectionGroup> {
  const groups = new Map<string, SiblingCollectionGroup>();

  for (const sibling of siblings) {
    const definitionRef = sibling.kind === 'container' ? sibling.definitionRef : undefined;
    const normalizedRef =
      definitionRef === undefined || definitionRef === ''
        ? undefined
        : '/' + definitionRef.split('/').filter(Boolean).join('/');
    const key =
      normalizedRef === undefined
        ? 'name:' + stripSuffix(getShortName(sibling))
        : 'definition:' + normalizedRef;
    const existing = groups.get(key);
    if (existing !== undefined) {
      existing.elements = [...existing.elements, sibling];
      continue;
    }

    groups.set(key, {
      key,
      label:
        normalizedRef === undefined
          ? stripSuffix(getShortName(sibling))
          : (normalizedRef.split('/').filter(Boolean).pop() ?? getShortName(sibling)),
      ...(normalizedRef === undefined ? {} : { definitionRef: normalizedRef }),
      elements: [sibling],
    });
  }

  return groups;
}

/**
 * Return the size of the largest same-baseName group in the input. 0 for empty.
 * Used to drive view-density decisions (collapsing default, future virtual
 * scroll trigger).
 */
export function maxCollectionSize(siblings: readonly ArxmlElement[]): number {
  let max = 0;
  for (const group of groupSiblingsByShortName(siblings).values()) {
    if (group.length > max) max = group.length;
  }
  return max;
}

/** Strip trailing `_<digits>` from a shortName. */
export function stripSuffix(name: string): string {
  return name.replace(/_[0-9]+$/, '');
}

/**
 * Compare shortNames by base name, then by numeric suffix ascending.
 * An unsuffixed name sorts before all suffixed instances.
 */
export function compareSuffix(a: string, b: string): number {
  const aBase = stripSuffix(a);
  const bBase = stripSuffix(b);
  if (aBase !== bBase) return aBase.localeCompare(bBase);
  return extractSuffix(a) - extractSuffix(b);
}

function extractSuffix(name: string): number {
  const match = name.match(/_([0-9]+)$/);
  return match === null ? -1 : Number.parseInt(match[1]!, 10);
}

/** Get the canonical shortName for any ArxmlElement kind. */
function getShortName(element: ArxmlElement): string {
  if (element.kind === 'reference') return element.shortName ?? element.value;
  if (element.kind === 'unknown') return element.tagName;
  return element.shortName;
}

// ---------------------------------------------------------------------------
// Collection table view helpers
// ---------------------------------------------------------------------------

/** Prefix marking a selectedPath as a synthetic collection (not a real node). */
export const COLLECTION_PATH_PREFIX = 'collection:';

export interface ParsedCollectionKey {
  /** Tree path of the container whose children hold the collection group. */
  readonly parentPath: string;
  /** Group key as produced by groupSiblingsForCollection (`definition:<ref>` / `name:<base>`). */
  readonly groupKey: string;
}

/**
 * Inverse of the collectionKey built in Tree.renderChildren
 * (`'collection:' + parentPath + '/' + groupKey`). shortNames cannot contain
 * ':' so the `/definition:` / `/name:` markers are unambiguous split points.
 * Returns null when the key is malformed.
 */
export function parseCollectionKey(key: string): ParsedCollectionKey | null {
  if (!key.startsWith(COLLECTION_PATH_PREFIX)) return null;
  const rest = key.slice(COLLECTION_PATH_PREFIX.length);
  const defIdx = rest.indexOf('/definition:');
  if (defIdx >= 0) {
    return { parentPath: rest.slice(0, defIdx), groupKey: rest.slice(defIdx + 1) };
  }
  const nameIdx = rest.indexOf('/name:');
  if (nameIdx >= 0) {
    return { parentPath: rest.slice(0, nameIdx), groupKey: rest.slice(nameIdx + 1) };
  }
  return null;
}

/** One column of the collection table: a param key plus the type of its first occurrence. */
export interface CollectionColumn {
  readonly key: string;
  readonly type: ParamValue['type'];
}

/**
 * Union of param keys across collection instances, in first-seen order.
 * Value-typed columns come before reference-typed columns, mirroring the
 * single-instance ParamEditor's value/reference grouping. Instances in a
 * definition-based group share the same ECUC definition, so the union is
 * normally the full parameter set; optional params simply leave "—" cells
 * on instances that don't instantiate them.
 */
export function collectUnionColumns(
  elements: readonly ArxmlElement[],
): readonly CollectionColumn[] {
  const byKey = new Map<string, ParamValue['type']>();
  for (const element of elements) {
    if (element.kind !== 'module' && element.kind !== 'container') continue;
    for (const [key, value] of Object.entries(element.params)) {
      if (!byKey.has(key)) byKey.set(key, value.type);
    }
  }
  const valueColumns: CollectionColumn[] = [];
  const referenceColumns: CollectionColumn[] = [];
  for (const [key, type] of byKey) {
    const column: CollectionColumn = { key, type };
    if (type === 'reference') referenceColumns.push(column);
    else valueColumns.push(column);
  }
  return [...valueColumns, ...referenceColumns];
}
