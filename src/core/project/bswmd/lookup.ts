// core/project/bswmd/lookup.ts
// BSWMD lookup helpers — Sprint 15 ECUC mutation support.
//
// Split from `src/core/project/bswmd.ts` as part of v1.41.x PATCH T1
// (file-size backlog). Pure lookups: find modules / containers /
// params / references by path or shortName. Owns `findModuleByPath`,
// `lookupContainerDef`, `lookupParamDef`, `lookupReferenceDef`,
// `getContainerDefByPath`, `listContainerChildren`, and the internal
// recursive helper `findContainerInTreeByPath`.
//
// Single runtime dep on the sibling `parse.js` for
// `findContainerInTree` (the recursive tree walker that descent
// through subContainers + choices uses). No other sub-file imports.
// All types come from `./types.js`.

import { findContainerInTree } from './parse.js';
import type { BswModuleDef, BswmdDocument, ContainerDef, ParamDef, ReferenceDef } from './types.js';

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

export function listContainerChildren(containerDef: ContainerDef): {
  readonly parameters: readonly ParamDef[];
  readonly references: readonly ReferenceDef[];
  readonly subContainers: readonly ContainerDef[];
} {
  return {
    parameters: containerDef.parameters,
    references: containerDef.references,
    subContainers: [...containerDef.subContainers, ...containerDef.choices],
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
