// src/renderer/store/helpers/paramUpdate.ts
// Immutable param update helpers. Pure — no store closure, no I/O.
// Extracted from useArxmlStore.ts in PR(5) — pure refactor.

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ParamValue,
} from '@core/arxml/types';

/**
 * Sprint 16 — return `incoming` merged with `current.definitionRef` when
 * `incoming.definitionRef` is absent. The renderer mutates params via
 * `applyParamUpdate` (called by `updateParam`, `addParameter`, etc.),
 * and the serializer needs the BSWMD-side path to write a real
 * DEFINITION-REF. Without this helper the path would be silently lost
 * on the first user edit, regressing to the
 * `/__synthesized__/<shortName>` placeholder.
 *
 * Pure helper; no closure / no store access.
 */
export function withDefinitionRefPreserved(
  incoming: ParamValue,
  current: ParamValue | undefined,
): ParamValue {
  if (current === undefined) return incoming;
  if (incoming.definitionRef !== undefined) return incoming;
  if (current.definitionRef === undefined) return incoming;
  // Narrow: only spread when both sides are the same ParamValue
  // variant (the union's tagged `type` carries type-safety — a
  // mismatched type would be a logic bug elsewhere).
  if (current.type !== incoming.type) return incoming;
  return { ...incoming, definitionRef: current.definitionRef } as ParamValue;
}

/**
 * Apply a single param edit inside a container at `containerPath`.
 * Returns a new ArxmlDocument with the edit applied, or the input
 * `doc` reference verbatim when no element matches (preserves
 * reference equality for downstream selectors).
 */
export function applyParamUpdate(
  doc: ArxmlDocument,
  containerPath: string,
  paramKey: string,
  value: ParamValue,
): ArxmlDocument {
  const segments = containerPath.split('/').filter(Boolean);
  const [pkgName, ...rest] = segments;
  if (pkgName === undefined) return doc;

  let changed = false;
  const nextPackages = doc.packages.map((p) => {
    if (p.shortName !== pkgName) return p;
    const nextElements = updateElements(p.elements, rest, paramKey, value);
    if (nextElements === p.elements) return p;
    changed = true;
    return { ...p, elements: nextElements };
  });

  if (!changed) return doc;
  return { ...doc, packages: nextPackages };
}

function updateElements(
  elements: readonly ArxmlElement[],
  segments: readonly string[],
  paramKey: string,
  value: ParamValue,
): readonly ArxmlElement[] {
  if (segments.length === 0) return elements;
  const [head, ...tail] = segments;
  if (head === undefined) return elements;

  let changed = false;
  const next = elements.map((el): ArxmlElement => {
    if (shortName(el) !== head) return el;
    // tail.length === 0 means this node IS the target container.
    if (tail.length === 0) {
      if (el.kind !== 'module' && el.kind !== 'container') return el;
      const current = el.params[paramKey];
      if (current !== undefined && paramValueEquals(current, value)) return el;
      changed = true;
      // Sprint 16 — preserve the existing param's `definitionRef` when
      // the incoming value doesn't carry one. The serializer needs the
      // BSWMD-side path to write a real DEFINITION-REF; losing it on
      // edit would silently regress to the `/__synthesized__/...`
      // placeholder.
      const incoming = withDefinitionRefPreserved(value, current);
      if (el.kind === 'module') {
        const updated: ArxmlModule = {
          ...el,
          params: { ...el.params, [paramKey]: incoming },
        };
        return updated;
      }
      const updated: ArxmlContainer = {
        ...el,
        params: { ...el.params, [paramKey]: incoming },
      };
      return updated;
    }
    // Recurse into children
    if (el.kind === 'module' || el.kind === 'container') {
      const nextChildren = updateElements(el.children, tail, paramKey, value);
      if (nextChildren === el.children) return el;
      changed = true;
      if (el.kind === 'module') {
        const updated: ArxmlModule = { ...el, children: nextChildren };
        return updated;
      }
      const updated: ArxmlContainer = { ...el, children: nextChildren };
      return updated;
    }
    return el;
  });

  if (!changed) return elements;
  return next;
}

export function paramValueEquals(a: ParamValue, b: ParamValue): boolean {
  if (a.type !== b.type) return false;
  return a.value === b.value;
}

export function shortName(e: ArxmlElement): string {
  if (e.kind === 'reference') return e.shortName ?? e.value;
  // v1.4.0 trust sprint — 17c. Unknown elements have no SHORT-NAME;
  // surface the captured tagName so debug logs stay readable.
  if (e.kind === 'unknown') return e.tagName;
  return e.shortName;
}
