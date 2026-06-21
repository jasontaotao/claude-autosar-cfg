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

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
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
 * Throws if the container path is not found or the param does not exist.
 */
export function setParamInDocument(
  doc: ArxmlDocument,
  containerPath: string,
  paramName: string,
  newValue: ParamValue,
): void {
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
  spliceContainer(doc, containerPath, { ...target, params: nextParams });
}

export function addChildInDocument(
  doc: ArxmlDocument,
  containerPath: string,
  newShortName: string,
): void {
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
  spliceContainer(doc, containerPath, { ...target, children: nextChildren });
}

export function removeChildInDocument(
  doc: ArxmlDocument,
  containerPath: string,
  shortName: string,
): void {
  const target = findContainerByPath(doc, containerPath);
  if (target === null) return;
  const nextChildren: readonly ArxmlElement[] = target.children.filter(
    // v1.4.0 trust sprint — 17c. Unknown elements have no SHORT-NAME so
    // they cannot match the removal key; pass through untouched.
    (c) => c.kind === 'reference' || c.kind === 'unknown' || c.shortName !== shortName,
  );
  if (nextChildren.length === target.children.length) return;
  spliceContainer(doc, containerPath, { ...target, children: nextChildren });
}

/**
 * Rebuild the ancestor chain leading to `path` with the cloned
 * `replacement` as the leaf. All other subtrees keep their identity.
 */
function spliceContainer(
  doc: ArxmlDocument,
  path: string,
  replacement: ArxmlModule | ArxmlContainer,
): void {
  function matchesPath(el: ArxmlElement, parentPath: string): boolean {
    if (el.kind === 'reference') return false;
    // v1.4.0 trust sprint — 17c. Unknown elements have no SHORT-NAME and
    // cannot be the splice target; short-circuit to false.
    if (el.kind === 'unknown') return false;
    return `${parentPath}/${el.shortName}` === path;
  }

  function rebuild(
    elements: readonly ArxmlElement[],
    parentPath: string,
  ): readonly ArxmlElement[] | null {
    let changed = false;
    const out: ArxmlElement[] = [];
    for (const el of elements) {
      if (matchesPath(el, parentPath)) {
        out.push(replacement);
        changed = true;
      } else if (el.kind === 'reference' || el.kind === 'unknown') {
        // v1.4.0 trust sprint — 17c. Unknown vendor extensions are
        // leaves with no children to descend into; treat like references
        // here — push through untouched.
        out.push(el);
      } else {
        const myPath = `${parentPath}/${el.shortName}`;
        const inner = rebuild(el.children, myPath);
        if (inner !== null) {
          out.push({ ...el, children: inner });
          changed = true;
        } else {
          out.push(el);
        }
      }
    }
    return changed ? out : null;
  }

  for (const pkg of doc.packages) {
    const nextElements = rebuild(pkg.elements, `/${pkg.shortName}`);
    if (nextElements !== null) {
      // pkg.elements is typed readonly; cast through the package's
      // mutable array (the parser populates it as a plain array).
      (pkg.elements as ArxmlElement[]).splice(0, pkg.elements.length, ...nextElements);
      return;
    }
    if (pkg.packages) {
      for (const sub of pkg.packages) {
        const inner = rebuild(sub.elements, `/${pkg.shortName}/${sub.shortName}`);
        if (inner !== null) {
          (sub.elements as ArxmlElement[]).splice(0, sub.elements.length, ...inner);
          return;
        }
      }
    }
  }
  throw new Error(`spliceContainer: path ${path} not reachable from document root`);
}

// Backwards-compat aliases (the plan's `setters.ts` exported
// `setParamInProject` / etc.). Keep the names so future refactors
// don't need to thread a new binding.
export const setParamInProject = setParamInDocument;
export const addChildInProject = addChildInDocument;
export const removeChildInProject = removeChildInDocument;

// Internal helper exposed for tests; avoid spreading to the wider API.
export { findContainerByPath as _findContainerByPath, type ModuleOrContainer };
