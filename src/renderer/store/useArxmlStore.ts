import { create } from 'zustand';

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ParamValue,
} from '@core/arxml/types';

/**
 * Renderer-side state for the currently-open ARXML document.
 *
 * Holds:
 *   - `doc` — parsed ArxmlDocument (immutable)
 *   - `filePath` — origin path on disk
 *   - `selectedPath` — element path currently highlighted in the tree
 *   - `dirty` — true if doc has unpersisted mutations
 *   - `error` — last displayable error string (parser/save)
 *
 * Actions mutate state immutably: `updateParam` produces a new doc
 * reference only when the value actually changes, preserving reference
 * equality for downstream `useStore(selector)` consumers.
 */
export interface ArxmlState {
  readonly doc: ArxmlDocument | null;
  readonly filePath: string | null;
  readonly selectedPath: string | null;
  readonly dirty: boolean;
  readonly error: string | null;

  setDoc: (doc: ArxmlDocument, filePath: string) => void;
  select: (path: string | null) => void;
  updateParam: (containerPath: string, paramKey: string, value: ParamValue) => void;
  markSaved: (filePath: string) => void;
  setError: (msg: string | null) => void;
  clear: () => void;
}

export const useArxmlStore = create<ArxmlState>((set, get) => ({
  doc: null,
  filePath: null,
  selectedPath: null,
  dirty: false,
  error: null,

  setDoc: (doc, filePath) => set({ doc, filePath, selectedPath: null, dirty: false, error: null }),

  select: (path) => set({ selectedPath: path }),

  updateParam: (containerPath, paramKey, value) => {
    const state = get();
    if (state.doc === null) return;
    const next = applyParamUpdate(state.doc, containerPath, paramKey, value);
    if (next === state.doc) return;
    set({ doc: next, dirty: true });
  },

  markSaved: (filePath) => set({ dirty: false, filePath }),

  setError: (msg) => set({ error: msg }),

  clear: () => set({ doc: null, filePath: null, selectedPath: null, dirty: false, error: null }),
}));

// ---------------------------------------------------------------------------
// Immutable param update — produces a new doc only when the param value
// actually differs from the current one (preserves reference equality).
// ---------------------------------------------------------------------------

function applyParamUpdate(
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
      if (el.kind === 'module') {
        const updated: ArxmlModule = {
          ...el,
          params: { ...el.params, [paramKey]: value },
        };
        return updated;
      }
      const updated: ArxmlContainer = {
        ...el,
        params: { ...el.params, [paramKey]: value },
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

function paramValueEquals(a: ParamValue, b: ParamValue): boolean {
  if (a.type !== b.type) return false;
  return a.value === b.value;
}

function shortName(e: ArxmlElement): string {
  if (e.kind === 'reference') return e.shortName ?? e.value;
  return e.shortName;
}
