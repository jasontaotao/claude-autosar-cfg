// collections.ts — helpers for grouping Tree siblings by shortName.
//
// Used by Tree.renderChildren() to decide whether to render a "collection
// header" row above a group of same-shortName siblings. See:
//   docs/superpowers/specs/2026-07-13-multi-instance-tree-ui-design.md

import type { ArxmlElement } from '@core/arxml/types.js';

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
function stripSuffix(name: string): string {
  return name.replace(/_[0-9]+$/, '');
}

/** Get the canonical shortName for any ArxmlElement kind. */
function getShortName(element: ArxmlElement): string {
  if (element.kind === 'reference') return element.shortName ?? element.value;
  if (element.kind === 'unknown') return element.tagName;
  return element.shortName;
}
