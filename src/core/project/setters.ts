// Pure setter helpers used by script transaction commit.
// Wraps the existing core element tree with shape adapters for
// mutation records produced by `ctx.*.setValue` / `addChild` /
// `removeChild` during a script run.
//
// We work directly on the parsed `ArxmlDocument.packages[].elements[]`
// tree (module + container nodes). The store already mutates this
// shape via `setParamInArxml` / `addContainerInArxml` / etc.; here we
// provide a minimal script-friendly adapter that operates on
// `containerPath` (e.g. '/EcucDefs/Com/ComConfig/.../ComTxIPdu') and
// `paramName`.
//
// Path matching: the parser does NOT set `path` on module/container
// elements (it's a local variable inside the parser). The script
// ctx synthesizes a path as `/<pkg.shortName>/<child.shortName>/...`
// (the same convention the parser uses internally). We match by
// reconstructing the path during traversal.
//
// Pure: no fs, no electron. Callers (transaction.commit) own the
// rollback policy.
//
// v1.37.0 MINOR T1 (C1) — mutation engine purity. The 3 helpers below
// (`setParamInDocument` / `addChildInDocument` /
// `removeChildInDocument`) now return a NEW `ArxmlDocument` reference
// instead of mutating the caller's doc in place. Reference equality
// (`next === doc`) is preserved for no-op short-circuits (e.g.
// `removeChildInDocument` with a non-matching shortName) so callers
// can use `if (next === doc) return` to skip downstream work.

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ArxmlPackage,
  ParamValue,
} from '../arxml/types.js';

interface ModuleOrContainer {
  readonly kind: 'module' | 'container';
  readonly shortName: string;
  readonly path: string;
  readonly params: Readonly<Record<string, ParamValue>>;
  readonly children: readonly ArxmlElement[];
}

/**
 * Walk an `ArxmlDocument`'s packages/elements tree and return the
 * module/container whose synthesised `path` matches the given string.
 *
 * The path is the slash-joined shortName chain (e.g.
 * '/EcucDefs/Com/CanConfigSet/.../ComTxIPdu'). This matches the
 * convention the parser uses when assigning `path` to local
 * variables during traversal.
 */
export function findContainerByPath(
  doc: ArxmlDocument,
  path: string,
): ArxmlModule | ArxmlContainer | null {
  function walk(
    elements: readonly ArxmlElement[],
    parentPath: string,
  ): ArxmlModule | ArxmlContainer | null {
    for (const el of elements) {
      if (el.kind === 'reference') continue;
      // v1.4.0 trust sprint — 17c. Unknown vendor extensions are leaves
      // with no SHORT-NAME and no children. Skip them in path lookup.
      if (el.kind === 'unknown') continue;
      const myPath = `${parentPath}/${el.shortName}`;
      if (myPath === path) {
        if (el.kind === 'module' || el.kind === 'container') return el;
        return null;
      }
      const found = walk(el.children, myPath);
      if (found) return found;
    }
    return null;
  }
  for (const pkg of doc.packages) {
    const found = walk(pkg.elements, `/${pkg.shortName}`);
    if (found) return found;
    if (pkg.packages) {
      for (const sub of pkg.packages) {
        const inner = walk(sub.elements, `/${pkg.shortName}/${sub.shortName}`);
        if (inner) return inner;
      }
    }
  }
  return null;
}

/**
 * Set a parameter value at the given container path.
 *
 * Returns a new `ArxmlDocument` with the param updated; the input
 * `doc` is unchanged. Throws if the container path is not found or
 * the param does not exist.
 */
export function setParamInDocument(
  doc: ArxmlDocument,
  containerPath: string,
  paramName: string,
  newValue: ParamValue,
): ArxmlDocument {
  const target = findContainerByPath(doc, containerPath);
  if (target === null) {
    throw new Error(`setParam: container ${containerPath} not found`);
  }
  if (!(paramName in target.params)) {
    throw new Error(`setParam: param "${paramName}" not found at ${containerPath}`);
  }
  const nextParams: Record<string, ParamValue> = { ...target.params };
  const existing = nextParams[paramName]!;
  if (typeof newValue === 'object' && newValue !== null && 'value' in newValue) {
    const refIn = newValue as { value: string; dest?: string };
    nextParams[paramName] = {
      ...existing,
      value: refIn.value,
      ...(refIn.dest ? { dest: refIn.dest } : {}),
    } as ParamValue;
  } else {
    nextParams[paramName] = { ...existing, value: newValue } as ParamValue;
  }
  return replaceContainer(doc, containerPath, { ...target, params: nextParams });
}

/**
 * Add a sub-container with the given `newShortName` under the
 * container at `containerPath`.
 *
 * Returns a new `ArxmlDocument` with the child appended; the input
 * `doc` is unchanged. Throws if the container path is not found or
 * the shortName already exists among non-reference / non-unknown
 * siblings.
 */
export function addChildInDocument(
  doc: ArxmlDocument,
  containerPath: string,
  newShortName: string,
): ArxmlDocument {
  const target = findContainerByPath(doc, containerPath);
  if (target === null) {
    throw new Error(`addChild: container ${containerPath} not found`);
  }
  if (
    target.children.some(
      // v1.4.0 trust sprint — 17c. Unknown elements have no SHORT-NAME so
      // they cannot clash by name; skip them in the duplicate check.
      (c) => c.kind !== 'reference' && c.kind !== 'unknown' && c.shortName === newShortName,
    )
  ) {
    throw new Error(`addChild: shortName "${newShortName}" already exists at ${containerPath}`);
  }
  const newChild: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: newShortName,
    params: {},
    children: [],
  };
  const nextChildren: readonly ArxmlElement[] = [...target.children, newChild];
  return replaceContainer(doc, containerPath, { ...target, children: nextChildren });
}

/**
 * Remove a direct child with the given `shortName` from the container
 * at `containerPath`.
 *
 * Returns:
 *   - the SAME `doc` reference when the container path is not found
 *     (no-op short-circuit);
 *   - the SAME `doc` reference when no child matched (no-op
 *     short-circuit — preserves ref-equality for callers that rely
 *     on `next === doc` as the "did anything change?" signal);
 *   - a NEW `ArxmlDocument` with the matching child removed
 *     otherwise.
 */
export function removeChildInDocument(
  doc: ArxmlDocument,
  containerPath: string,
  shortName: string,
): ArxmlDocument {
  const target = findContainerByPath(doc, containerPath);
  if (target === null) return doc;
  const nextChildren: readonly ArxmlElement[] = target.children.filter(
    // v1.4.0 trust sprint — 17c. Unknown elements have no SHORT-NAME so
    // they cannot match the removal key; pass through untouched.
    (c) => c.kind === 'reference' || c.kind === 'unknown' || c.shortName !== shortName,
  );
  if (nextChildren.length === target.children.length) return doc;
  return replaceContainer(doc, containerPath, { ...target, children: nextChildren });
}

/**
 * Replace the container at `path` with `container` and return a new
 * `ArxmlDocument`. The original document is untouched — every node
 * along the ancestor chain is rebuilt via spread, mirroring the
 * `replaceElement` immutable-rebuild pattern in
 * `core/arxml/mutation.ts`.
 *
 * The walk matches the 2-layer depth of `findContainerByPath` above
 * (`pkg.elements` + first-level `pkg.packages[*].elements`). Deeper
 * vendor-package nesting is out of scope for v1.37.0 (deferred to
 * the L2 PATCH chain).
 *
 * Throws if `path` is not reachable from the document root. The 2
 * callers (`applySetParam` + `applyReplaceOp` in
 * `core/mutation/applyPatchSteps.ts` + the script transaction
 * commit) pre-flight with `findContainerByPath`, so the throw is a
 * defensive guard, not a hot path.
 */
function replaceContainer(
  doc: ArxmlDocument,
  path: string,
  container: ArxmlModule | ArxmlContainer,
): ArxmlDocument {
  for (const pkg of doc.packages) {
    const nextPkg = rebuildPackage(pkg, `/${pkg.shortName}`, path, container);
    if (nextPkg !== pkg) {
      const nextPackages = doc.packages.map((p) => (p === pkg ? nextPkg : p));
      return { ...doc, packages: nextPackages };
    }
    if (pkg.packages) {
      for (const sub of pkg.packages) {
        const nextSub = rebuildPackage(sub, `/${pkg.shortName}/${sub.shortName}`, path, container);
        if (nextSub !== sub) {
          const nextSubs = (pkg.packages as readonly ArxmlPackage[]).map((p) =>
            p === sub ? nextSub : p,
          );
          const nextPkg: ArxmlPackage = { ...pkg, packages: nextSubs };
          const nextPackages = doc.packages.map((p) => (p === pkg ? nextPkg : p));
          return { ...doc, packages: nextPackages };
        }
      }
    }
  }
  throw new Error(`replaceContainer: path ${path} not reachable from document root`);
}

/**
 * Walk `pkg.elements` looking for the element whose synthesised path
 * equals `targetPath`. Returns:
 *   - the SAME `pkg` reference when no element matched;
 *   - a NEW `pkg` (rebuilt via spread with the matched element
 *     replaced by `replacement`) when a direct match was found;
 *   - a NEW `pkg` (rebuilt via spread, with one ancestor rebuilt to
 *     host the replacement in its children list) when the match
 *     lives below a module/container ancestor.
 */
function rebuildPackage(
  pkg: ArxmlPackage,
  pkgPath: string,
  targetPath: string,
  replacement: ArxmlModule | ArxmlContainer,
): ArxmlPackage {
  const nextElements = rebuildElements(pkg.elements, pkgPath, targetPath, replacement);
  if (nextElements === pkg.elements) return pkg;
  return { ...pkg, elements: nextElements };
}

function rebuildElements(
  elements: readonly ArxmlElement[],
  parentPath: string,
  targetPath: string,
  replacement: ArxmlModule | ArxmlContainer,
): readonly ArxmlElement[] {
  let changed = false;
  const out: ArxmlElement[] = [];
  for (const el of elements) {
    if (el.kind === 'reference' || el.kind === 'unknown') {
      // v1.4.0 trust sprint — 17c. Unknown vendor extensions are
      // leaves with no children to descend into; treat like
      // references here — push through untouched.
      out.push(el);
      continue;
    }
    const myPath = `${parentPath}/${el.shortName}`;
    if (myPath === targetPath) {
      out.push(replacement);
      changed = true;
      continue;
    }
    const nextChildren = rebuildElements(el.children, myPath, targetPath, replacement);
    if (nextChildren === el.children) {
      out.push(el);
    } else if (el.kind === 'module') {
      out.push({ ...el, children: nextChildren });
      changed = true;
    } else {
      // container
      out.push({ ...el, children: nextChildren });
      changed = true;
    }
  }
  return changed ? out : elements;
}

// Backwards-compat aliases (the plan's `setters.ts` exported
// `setParamInProject` / etc.). Keep the names so future refactors
// don't need to thread a new binding.
export const setParamInProject = setParamInDocument;
export const addChildInProject = addChildInDocument;
export const removeChildInProject = removeChildInDocument;

// Internal helper exposed for tests; avoid spreading to the wider API.
export { findContainerByPath as _findContainerByPath, type ModuleOrContainer };
