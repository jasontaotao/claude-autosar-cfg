import { create } from 'zustand';

import { parseArxml } from '@core/arxml/parser';
import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ParamValue,
} from '@core/arxml/types';
import type { ProjectManifest } from '@shared/project';
import { DEFAULT_LOCALE } from '@shared/i18n';
import type { Locale } from '@shared/i18n';
import type { ValidationError } from '@core/validation';
import { validateProjectForRenderer } from '@core/validation';

/**
 * Renderer-side state for the open ARXML document set.
 *
 * Sprint 10 #2 widened the store from single-doc to multi-doc. The
 * canonical state is the (documents, documentPaths, activeDocumentPath)
 * triple; the legacy single-doc fields (doc, filePath) are derived
 * from the active document and kept for back-compat with the existing
 * renderer consumers (AppHeader, ArxmlPanel, ParamEditor, etc.).
 *
 * @deprecated `doc` and `filePath` are derived from `activeDocumentPath`.
 *             New code should read `documents` + `activeDocumentPath`
 *             directly. The legacy fields will be removed in v1.0 once
 *             every consumer migrates to a per-document model.
 *
 * Holds:
 *   - `documents` / `documentPaths` — the loaded document set; parallel
 *     arrays (one ArxmlDocument per filePath), insertion-ordered.
 *   - `activeDocumentPath` — the path of the document currently shown
 *     in the tree / ParamEditor; null when nothing is open.
 *   - `doc` / `filePath` — back-compat aliases of the active doc/path.
 *   - `selectedPath` — element path currently highlighted in the tree
 *   - `dirty` — true if any loaded doc has unpersisted mutations
 *   - `error` — last displayable error string (parser/save)
 *   - `validationErrors` — latest validation results across ALL loaded
 *     documents (Sprint 10 #2: was single-doc only, now project-level
 *     via `validateProjectForRenderer(documents)`)
 *   - `lastValidatedAt` — `Date.now()` timestamp of the last validation
 *     run, or null when no doc is loaded
 *   - `project` / `projectPath` — Sprint 11 Phase 1: `null` means
 *     "loose mode" (today's behavior, all 329 prior tests rely on this).
 *     When non-null, `addDocument` / `removeDocument` also keep the
 *     manifest's `valueArxmlPaths` in sync so the next Save Project
 *     writes the current open set.
 *
 * Actions mutate state immutably: `updateParam` produces a new doc
 * reference only when the value actually changes, preserving reference
 * equality for downstream `useStore(selector)` consumers.
 */
export interface ArxmlState {
  // Multi-doc state (canonical)
  readonly documents: readonly ArxmlDocument[];
  readonly documentPaths: readonly string[];
  readonly activeDocumentPath: string | null;

  // Back-compat single-doc aliases (derived from active)
  /** @deprecated use `documents` + `activeDocumentPath` instead. */
  readonly doc: ArxmlDocument | null;
  /** @deprecated use `documentPaths` + `activeDocumentPath` instead. */
  readonly filePath: string | null;

  // Per-renderer UI state
  readonly selectedPath: string | null;
  /**
   * Per-document dirty state. Each entry is the filePath of a document
   * that has unpersisted mutations. Consumers computing "is the active
   * doc dirty" should read this set against `activeDocumentPath`:
   *
   *   const isActiveDirty =
   *     activeDocumentPath !== null && dirtyPaths.has(activeDocumentPath);
   *
   * Pre-Sprint 10 #2, this was a single `boolean` representing the
   * project-wide dirty state. That semantic broke in the multi-doc
   * world (saving doc B would clear dirty even if doc A was still
   * dirty). The Set is the correct per-path representation.
   */
  readonly dirtyPaths: ReadonlySet<string>;
  readonly error: string | null;
  readonly validationErrors: readonly ValidationError[];
  readonly lastValidatedAt: number | null;

  // Sprint 11 Phase 1 — project manifest state.
  // `project === null` ⇒ loose mode (pre-Sprint-11 behavior, back-compat
  // for the 329-test baseline). When non-null, mutating actions keep
  // `project.valueArxmlPaths` in sync with `documentPaths`.
  readonly project: ProjectManifest | null;
  /** Absolute on-disk path of the project manifest. Null in loose mode. */
  readonly projectPath: string | null;

  // Sprint 11 Phase 1 (Option A) — i18n. Default zh-CN per user request.
  // `setLocale` is the only mutator; the locale is read by t() inside
  // each component on every render so it re-renders automatically.
  readonly locale: Locale;

  // Multi-doc actions (Sprint 10 #2)
  addDocument: (doc: ArxmlDocument, filePath: string) => void;
  removeDocument: (filePath: string) => void;
  setActiveDocument: (filePath: string | null) => void;

  // Back-compat single-doc action. Since Sprint 10 #2, `setDoc` is
  // equivalent to `addDocument`: it appends the doc if `filePath` is new,
  // or replaces the existing entry if `filePath` is already loaded, and
  // sets the active doc to `filePath`. New code should call `addDocument`
  // directly; this is kept only because every existing call site (renderer
  // tests, fixture setup) uses it and we don't want to migrate them yet.
  setDoc: (doc: ArxmlDocument, filePath: string) => void;

  // Other actions
  select: (path: string | null) => void;
  updateParam: (containerPath: string, paramKey: string, value: ParamValue) => void;
  markSaved: (filePath: string) => void;
  setError: (msg: string | null) => void;
  validate: () => void;
  clear: () => void;

  // Sprint 11 Phase 1 — project actions.
  /**
   * Open a project from disk. Replaces the in-memory document set with
   * the bundle returned by IPC `project:open`. `manifest.bswmdPaths`
   * is recorded but the actual BSWMD contents are NOT parsed in
   * Phase 1 — that wires up in Phase 2 once `parseBswmd` lands.
   */
  openProject: (input: {
    readonly manifestPath: string;
    readonly manifest: ProjectManifest;
    /**
     * Bundled docs. Each entry carries the manifest-relative path
     * (`rel`) alongside the absolute path so the renderer can pair
     * it back to a manifest entry even when two docs share a
     * basename (e.g. `subdir1/EcuC.arxml` and `subdir2/EcuC.arxml`).
     */
    readonly docs: readonly { readonly rel: string; readonly path: string; readonly content: string }[];
  }) => void;
  /**
   * Close the current project. Documents stay in the store (the user
   * might be editing unsaved changes); only `project` and `projectPath`
   * are cleared. Use `clear()` to also drop documents.
   */
  closeProject: () => void;
  /**
   * Phase 1 stub. Phase 2 will parse `content` via `parseBswmd`,
   * register the resulting schema layer, and update `project.bswmdPaths`.
   * For now this is a no-op kept only so the IPC handler doesn't
   * reference a non-existent action during Phase 1 integration.
   */
  addBswmd: (path: string, content: string) => void;

  // Sprint 11 Phase 1 (Option A) — switch UI language.
  setLocale: (locale: Locale) => void;
}

export const useArxmlStore = create<ArxmlState>((set, get) => ({
  documents: [],
  documentPaths: [],
  activeDocumentPath: null,
  doc: null,
  filePath: null,
  selectedPath: null,
  dirtyPaths: new Set<string>(),
  error: null,
  validationErrors: [],
  lastValidatedAt: null,
  // Sprint 11 Phase 1 — project state.
  project: null,
  projectPath: null,
  // Sprint 11 Phase 1 (Option A) — i18n default.
  locale: DEFAULT_LOCALE,

  addDocument: (doc, filePath) => {
    const state = get();
    const existingIdx = state.documentPaths.indexOf(filePath);
    let nextDocuments: readonly ArxmlDocument[];
    if (existingIdx === -1) {
      nextDocuments = [...state.documents, doc];
    } else {
      nextDocuments = state.documents.map((d, i) => (i === existingIdx ? doc : d));
    }
    // Project-sync: when a project is open, also append the new path to
    // the manifest's valueArxmlPaths so the next Save Project persists it.
    const nextProject = projectSyncAddPath(state.project, filePath);
    set({
      documents: nextDocuments,
      documentPaths: state.documentPaths.includes(filePath)
        ? state.documentPaths
        : [...state.documentPaths, filePath],
      activeDocumentPath: filePath,
      doc,
      filePath,
      selectedPath: null,
      // Newly loaded doc is fresh; other docs' dirty state is preserved.
      dirtyPaths: dropFromDirty(state.dirtyPaths, filePath),
      error: null,
      project: nextProject,
      validationErrors: validateProjectForRenderer(nextDocuments),
      lastValidatedAt: Date.now(),
    });
  },

  removeDocument: (filePath) => {
    const state = get();
    const idx = state.documentPaths.indexOf(filePath);
    if (idx === -1) return;
    const nextPaths = state.documentPaths.filter((_, i) => i !== idx);
    const nextDocuments = state.documents.filter((_, i) => i !== idx);
    // If we removed the active doc, promote the first remaining (or null).
    const wasActive = state.activeDocumentPath === filePath;
    const nextActive = wasActive
      ? (nextPaths[0] ?? null)
      : state.activeDocumentPath;
    const activeIdx = nextActive === null ? -1 : nextPaths.indexOf(nextActive);
    const nextActiveDoc = activeIdx === -1 ? null : (nextDocuments[activeIdx] ?? null);
    // Project-sync: when a project is open, also drop the path from
    // the manifest so Save Project doesn't resurrect a deleted file.
    const nextProject = projectSyncRemovePath(state.project, filePath);
    set({
      documents: nextDocuments,
      documentPaths: nextPaths,
      activeDocumentPath: nextActive,
      doc: nextActiveDoc,
      filePath: nextActive,
      // The removed doc's dirty bit is dropped; other docs' dirty state
      // is preserved.
      dirtyPaths: dropFromDirty(state.dirtyPaths, filePath),
      project: nextProject,
      validationErrors: validateProjectForRenderer(nextDocuments),
      lastValidatedAt: Date.now(),
    });
  },

  setActiveDocument: (filePath) => {
    const state = get();
    if (filePath === null) {
      set({ activeDocumentPath: null, doc: null, filePath: null });
      return;
    }
    const idx = state.documentPaths.indexOf(filePath);
    if (idx === -1) return; // unknown path → no-op
    const nextDoc = state.documents[idx] ?? null;
    set({
      activeDocumentPath: filePath,
      doc: nextDoc,
      filePath,
    });
  },

  setDoc: (doc, filePath) => {
    get().addDocument(doc, filePath);
  },

  select: (path) => set({ selectedPath: path }),

  updateParam: (containerPath, paramKey, value) => {
    const state = get();
    if (state.activeDocumentPath === null || state.doc === null) return;
    const activeIdx = state.documentPaths.indexOf(state.activeDocumentPath);
    if (activeIdx === -1) return;
    const activeDoc = state.documents[activeIdx]!;
    const nextActiveDoc = applyParamUpdate(activeDoc, containerPath, paramKey, value);
    if (nextActiveDoc === activeDoc) return;
    const nextDocuments = state.documents.map((d, i) => (i === activeIdx ? nextActiveDoc : d));
    set({
      documents: nextDocuments,
      doc: nextActiveDoc,
      // Mark only the active doc as dirty; other docs' dirty state is
      // preserved (per-path Set, not project-wide boolean).
      dirtyPaths: addToDirty(state.dirtyPaths, state.activeDocumentPath),
      validationErrors: validateProjectForRenderer(nextDocuments),
      lastValidatedAt: Date.now(),
    });
  },

  markSaved: (filePath) =>
    set({
      // Clear the dirty bit for the saved doc only. Other dirty docs are
      // preserved (per-path Set).
      dirtyPaths: dropFromDirty(get().dirtyPaths, filePath),
    }),

  setError: (msg) => set({ error: msg }),

  validate: () => {
    const state = get();
    set({
      validationErrors: validateProjectForRenderer(state.documents),
      lastValidatedAt: Date.now(),
    });
  },

  clear: () =>
    set({
      documents: [],
      documentPaths: [],
      activeDocumentPath: null,
      doc: null,
      filePath: null,
      selectedPath: null,
      dirtyPaths: new Set<string>(),
      error: null,
      validationErrors: [],
      lastValidatedAt: null,
      project: null,
      projectPath: null,
      // Locale is a user preference — clear() resets docs but keeps
      // the language setting. Use setLocale() explicitly to change.
    }),

  openProject: ({ manifestPath, manifest, docs }) => {
    // Phase 1 only parses ARXML docs; BSWMDs are recorded in
    // `manifest.bswmdPaths` but their content is left unparsed (Phase 2
    // wires the BSWMD parser). The renderer pulls BSWMD content from the
    // IPC response in a future phase; for now this keeps the manifest
    // shape round-tripping through save.
    //
    // Match by `rel` (the manifest-relative path) — not by basename or
    // absolute path — so two entries that share a basename (e.g.
    // `subdir1/EcuC.arxml` + `subdir2/EcuC.arxml`) pair back to the
    // correct manifest slot. The IPC contract returns the `rel`/`path`
    // pair explicitly for this reason.
    const docsByRel = new Map(docs.map((d) => [d.rel, d] as const));
    const orderedDocuments: ArxmlDocument[] = [];
    const orderedPaths: string[] = [];
    for (const relPath of manifest.valueArxmlPaths) {
      const entry = docsByRel.get(relPath);
      if (entry === undefined) continue;
      const parsed = parseArxmlOrThrow(entry.content);
      orderedDocuments.push(parsed);
      orderedPaths.push(entry.path);
    }
    // Documents that came back from IPC but aren't in the manifest
    // (e.g. extra files the user picked alongside) are ignored — the
    // manifest is the source of truth for what's "in" the project.
    const activeDoc = orderedDocuments[0] ?? null;
    const activePath = orderedPaths[0] ?? null;
    set({
      documents: orderedDocuments,
      documentPaths: orderedPaths,
      activeDocumentPath: activePath,
      doc: activeDoc,
      filePath: activePath,
      selectedPath: null,
      // A freshly-opened project is, by definition, saved on disk; the
      // renderer has not modified anything yet, so all dirty bits clear.
      dirtyPaths: new Set<string>(),
      error: null,
      project: manifest,
      projectPath: manifestPath,
      validationErrors: validateProjectForRenderer(orderedDocuments),
      lastValidatedAt: Date.now(),
    });
  },

  closeProject: () =>
    set({
      project: null,
      projectPath: null,
      // Documents and dirty state are intentionally preserved so the
      // user can keep editing in loose mode without losing unsaved
      // changes. Use `clear()` to also drop documents.
    }),

  addBswmd: (_path, _content) => {
    // Phase 1 stub. Phase 2 will:
    //   1. parseBswmd(content) → Result<BswmdDefinitions, BswmdParseError>
    //   2. merge into `bswmdSchemas` (Phase 2 state field)
    //   3. append path to `project.bswmdPaths` when project is open
    //   4. re-trigger validate() so the new schema takes effect
    //
    // For Phase 1 we no-op silently. The IPC `project:open` handler
    // already returns BSWMD content in its payload but the store
    // ignores it until Phase 2 lands.
  },

  setLocale: (locale) => set({ locale }),
}));

// ---------------------------------------------------------------------------
// Project-sync helpers (Sprint 11 Phase 1)
// ---------------------------------------------------------------------------

/**
 * Return a new manifest with `path` appended to valueArxmlPaths, or the
 * unchanged `m` if `m === null` (loose mode) or the path is already
 * present. Pure — produces a new manifest reference only when needed.
 */
function projectSyncAddPath(m: ProjectManifest | null, path: string): ProjectManifest | null {
  if (m === null) return null;
  if (m.valueArxmlPaths.includes(path)) return m;
  return { ...m, valueArxmlPaths: [...m.valueArxmlPaths, path] };
}

/**
 * Return a new manifest with `path` removed from valueArxmlPaths, or the
 * unchanged `m` if `m === null` (loose mode) or the path isn't present.
 */
function projectSyncRemovePath(m: ProjectManifest | null, path: string): ProjectManifest | null {
  if (m === null) return null;
  if (!m.valueArxmlPaths.includes(path)) return m;
  return { ...m, valueArxmlPaths: m.valueArxmlPaths.filter((p) => p !== path) };
}

/**
 * Parse ARXML content synchronously. Wraps `parseArxml` (which returns a
 * `Result`) so the store can fail-fast on a corrupt entry returned by
 * the IPC handler. Throws on parse failure — the IPC layer is supposed
 * to surface bad files as `read-failed`, not deliver garbage.
 */
function parseArxmlOrThrow(content: string): ArxmlDocument {
  const result = parseArxml(content);
  if (!result.ok) {
    throw new Error(`openProject: ARXML parse failed: ${result.error.kind}`);
  }
  return result.value;
}

// ---------------------------------------------------------------------------
// ReadonlySet helpers — pure, allocation-free when the entry is already
// present (addToDirty) or already absent (dropFromDirty).
// ---------------------------------------------------------------------------

function addToDirty(set: ReadonlySet<string>, path: string): ReadonlySet<string> {
  if (set.has(path)) return set;
  const next = new Set(set);
  next.add(path);
  return next;
}

function dropFromDirty(set: ReadonlySet<string>, path: string): ReadonlySet<string> {
  if (!set.has(path)) return set;
  const next = new Set(set);
  next.delete(path);
  return next;
}

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
