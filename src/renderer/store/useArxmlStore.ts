import { create } from 'zustand';

import {
  addContainer as coreAddContainer,
  addParameter as coreAddParameter,
  addReference as coreAddReference,
  findReferencesTo,
  removeContainer as coreRemoveContainer,
  removeParameter as coreRemoveParameter,
} from '@core/arxml/mutation.js';
import type { MutationError, ReferenceHit } from '@core/arxml/mutation.js';
import { parseArxml } from '@core/arxml/parser';
import { findByPathMultiDoc } from '@core/arxml/path';
import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ArxmlPackage,
  ParamValue,
  Result,
} from '@core/arxml/types';
import { parseBswmd } from '@core/project/bswmd.js';
import type {
  BswModuleDef,
  BswmdDocument,
  ContainerDef,
  ParamDef,
  ReferenceDef,
} from '@core/project/bswmd.js';
import type { ValidationError } from '@core/validation';
import { buildSchemaLayer, validateProjectForRenderer } from '@core/validation';
import { DEFAULT_LOCALE, t } from '@shared/i18n';
import type { Locale } from '@shared/i18n';
import { dirname as sharedDirname, toManifestRelative } from '@shared/path';
import type { ProjectManifest } from '@shared/project';
// Sprint 14 — ECUC ARXML Import slice.
import { applyPatchesToDocument, compileResolutionToPatches } from '@core/import/patch.js';
import type {
  ImportError,
  ImportPatchOp,
  ImportResolution,
  ImportSession,
  ModuleResolution,
  ModuleSelection,
} from '@core/import/types.js';

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
 *   - `newProjectDialogOpen` / `confirmDialogOpen` — Sprint 12 #3
 *     Task 7: top-level UI state for NewProjectDialog and
 *     ConfirmDialog. The store itself owns the visibility flags; the
 *     hook layer (`useProjectActions`) is responsible for opening
 *     ConfirmDialog on dirty switching actions.
 *
 * Actions mutate state immutably: `updateParam` produces a new doc
 * reference only when the value actually changes, preserving reference
 * equality for downstream `useStore(selector)` consumers.
 */

/**
 * Sprint 13 refactor — left-tab id for the refactored left column. The
 * three tabs are mutually exclusive; the user switches between them via
 * the `setLeftTab` action. The default is `'files'` because the existing
 * UX flow is "open or create a project first" — the project tab only
 * makes sense after a project is open, and the files tab is always
 * visible. Loose-mode consumers hide the project tab entirely; the
 * 'project' id stays in the union for type completeness.
 */
export type LeftTabId = 'project' | 'files' | 'validate';

/**
 * Sprint 17b T6 — toast discriminator. The banner reads the typed
 * `toast` field on the store and renders a different color + dismiss
 * policy per kind. `error` is the only manual-dismiss kind; the other
 * three auto-clear after a per-kind default (3s info/success, 5s
 * warning). The store's `setError` / `setInfo` / `setSuccess` /
 * `setWarning` actions stamp the kind and a sensible default timer.
 */
export type ToastKind = 'error' | 'warning' | 'info' | 'success';

/**
 * Sprint 17b T6 — typed toast envelope. `autoDismissMs === 0` (or
 * undefined for `'error'`) means manual dismiss only. The
 * ErrorBanner's `useEffect` reads this field to schedule the
 * auto-clear; the rest of the renderer treats `toast` as the source
 * of truth (the legacy `error: string | null` field is kept in sync
 * for back-compat with existing selectors and tests).
 */
export interface ToastState {
  readonly kind: ToastKind;
  readonly message: string;
  /**
   * Auto-dismiss timeout in ms. Omit (or 0) for manual dismiss only.
   * The store's `setInfo` / `setSuccess` / `setWarning` defaults are
   * 3000 / 3000 / 5000 respectively; `setError` leaves it undefined
   * because errors demand explicit acknowledgment.
   */
  readonly autoDismissMs?: number;
}

/**
 * Sprint 17c T10 — typed warnings emitted by
 * `buildCombinedDocument` when deduplicating root packages across
 * loaded documents. The combined view collapses root packages
 * with the same `<SHORT-NAME>` (the typical case is two
 * `EAS` roots when two BSWMD-derived ARXML files are loaded).
 *
 * - `duplicate-root-conflict`: a root with the same shortName was
 *   found in 2+ documents AND the contents differ. The first
 *   occurrence is kept; subsequent occurrences are dropped silently
 *   in the rendered tree but the warning is surfaced via the
 *   store's `warnings` slice so the user sees the metric.
 *
 * The shape is a discriminated union so future dedup warnings
 * (e.g. `duplicate-module-collapsed`) can be added without
 * widening the existing consumers.
 */
export type CombinedDocumentWarning = {
  readonly kind: 'duplicate-root-conflict';
  readonly shortName: string;
  /** File path of the document whose root was kept. */
  readonly keptFrom: string;
};

/**
 * Result of `buildCombinedDocument` — the synthesised virtual
 * ArxmlDocument plus any warnings emitted during dedup. Callers
 * thread the warnings into `state.warnings` for status-bar display.
 * `doc` is null when no source documents are available (e.g.
 * single mode with no active doc); callers should treat that as
 * "no display content".
 */
export interface CombinedDocumentResult {
  readonly doc: ArxmlDocument | null;
  readonly warnings: readonly CombinedDocumentWarning[];
}

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
  /**
   * Sprint 17b T6 — typed toast envelope. The ErrorBanner reads this
   * field directly and renders one of four color variants. Kept in
   * sync with the legacy `error: string | null` field so existing
   * selectors and tests still work — `setError` / `setInfo` /
   * `setSuccess` / `setWarning` write BOTH, and `dismissToast` /
   * `setError(null)` clear BOTH.
   */
  readonly toast: ToastState | null;
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

  // Sprint 13 refactor — left-column active tab. Default 'files' (see
  // LeftTabId JSDoc). `setLeftTab` is the only mutator; LeftPanel reads
  // this and renders one of the three tab contents.
  readonly leftTab: LeftTabId;
  setLeftTab: (tab: LeftTabId) => void;

  // Sprint 12 #2 — runtime BSWMD schema state. Mirrors `valueArxmlPaths`
  // semantics: insertion-ordered parallel arrays, with the source of
  // truth being `project.bswmdPaths` when a project is open. In loose
  // mode the store itself owns the path list (no project to mirror to).
  //
  // `bswmdSchemas` is the parsed BswmdDocument set consumed by
  // `buildSchemaLayer` during re-validation. The BswmdDocument type
  // itself carries no source path; we index the path in `bswmdPaths`
  // parallel to it so `addBswmd` / `removeBswmd` can pair them.
  readonly bswmdSchemas: readonly BswmdDocument[];
  readonly bswmdPaths: readonly string[];

  // Sprint 13 Stage 3.5 — Combined Tree View. `viewMode` switches
  // between the legacy single-doc Tree and the synthesised multi-doc
  // view. `displayDoc` is the derived field Tree reads: in single mode
  // it equals `doc`; in combined mode it is a virtual ArxmlDocument
  // whose top-level packages are per-file basenames and whose child
  // paths are prefixed with the source file's basename. `setViewMode`
  // resets `selectedPath` so a stale single-mode path doesn't leak
  // into the combined view (and vice versa).
  // Sprint 14 widens `viewMode` to a 3-state machine so the Import
  // Merged View can sit alongside the Combined View. The setter
  // signature widens too; the Phase 1+2 commit imports still
  // satisfy the original 'single' | 'combined' shape via the
  // broader union.
  readonly viewMode: 'single' | 'combined' | 'import-merged';
  readonly displayDoc: ArxmlDocument | null;
  setViewMode: (mode: 'single' | 'combined' | 'import-merged') => void;

  // Sprint 14 ECUC ARXML Import — ImportSession slice (Phase 3).
  // viewMode widens to a 3-state machine: 'single' | 'combined' |
  // 'import-merged'. The 'import-merged' state is set by startImport
  // and cleared by cancelImport / commitImport; while active, the
  // Combined View entry is hidden and Save is blocked (the user must
  // commit or cancel before persisting).
  //
  // - importSession: the running session (incoming docs + selections +
  //   resolutions + undo stack). `null` when no import is in progress.
  // - lastCommitSnapshot: Map<filePath, ArxmlDocument> capturing the
  //   pre-commit state of every sourceFilesTouched file, so
  //   undoLastCommit can restore the documents array. Cleared on the
  //   next commit or save.
  // - isDirty() widens to also return true when importSession !== null
  //   so the app-close path treats an in-flight import as unsaved.
  readonly importSession: ImportSession | null;
  readonly lastCommitSnapshot: ReadonlyMap<string, ArxmlDocument> | null;
  startImport: (
    incomingDocs: readonly ArxmlDocument[],
    originalPaths: readonly string[],
  ) => void;
  selectModule: (mergedPath: string, selected: boolean) => void;
  resolveModule: (
    mergedPath: string,
    resolution: ImportResolution,
    containerResolutions?: ReadonlyMap<string, ImportResolution>,
  ) => void;
  openDiff: (mergedPath: string) => void;
  closeDiff: () => void;
  undoInternal: () => void;
  commitImport: () => Result<{ readonly sourceFilesTouched: readonly string[] }, ImportError>;
  cancelImport: () => void;
  undoLastCommit: () => void;

  // Sprint 17c T10 — build warnings surfaced from the combined
  // document synthesis. `buildCombinedDocument` now deduplicates root
  // packages across documents and emits a warning per duplicate-root
  // conflict (see `CombinedDocumentWarning` below). The store
  // owns the slice so a status-bar component (UI hook in a
  // follow-up) can subscribe to it without re-deriving from the
  // displayDoc shape. `clearWarnings` resets the slice — called by
  // `clear()` and any mutator that rebuilds the combined doc from
  // a fresh document set.
  readonly warnings: readonly CombinedDocumentWarning[];
  clearWarnings: () => void;

  // Sprint 12 #3 Task 7 — top-level dialog state. The store owns these
  // flags (not local component state) so the `useProjectActions` hook
  // (Task 5) can open/close dialogs from IPC error paths and so the
  // NewProjectDialog / ConfirmDialog roots mounted in `App.tsx` (Task 8)
  // react to the same flag the action mutator flipped.
  //
  // `isDirty` is exposed as a **function on the state** rather than a
  // cached field: it computes `dirtyPaths.size > 0` lazily, so it
  // cannot drift out of sync with the underlying Set. Callers either
  // invoke it directly (`getState().isDirty()`) or via a selector
  // (`useArxmlStore((s) => s.isDirty())`).
  readonly isDirty: () => boolean;
  readonly newProjectDialogOpen: boolean;
  readonly confirmDialogOpen: boolean;
  setNewProjectDialogOpen: (open: boolean) => void;
  setConfirmDialogOpen: (open: boolean) => void;

  // Sprint 15 Phase 2 — BSWMD-driven add-element picker + cascade
  // confirm dialog state. The picker state lives in the store (not in
  // the BswmdPickerDialog component) so a context-menu right-click can
  // open it via `openBswmdPicker` and the dialog root mounted in
  // `App.tsx` reacts via a selector. `pendingDelete` is set by
  // `deleteContainer` when reverse-reference scan finds N>0 hits; the
  // CascadeConfirmDialog reads it, then calls back through
  // `confirmDeleteContainer(choice)` to either commit the delete
  // (only / cascade) or clear the pending state (cancel).
  readonly bswmdPicker: {
    readonly open: boolean;
    readonly parentPath: string | null;
    readonly kind: 'container' | 'parameter' | 'reference' | null;
  };
  readonly pendingDelete: {
    readonly path: string;
    readonly references: readonly ReferenceHit[];
  } | null;
  openBswmdPicker: (target: {
    readonly parentPath: string;
    readonly kind: 'container' | 'parameter' | 'reference';
  }) => void;
  closeBswmdPicker: () => void;
  setPendingDelete: (
    pending: {
      readonly path: string;
      readonly references: readonly ReferenceHit[];
    } | null,
  ) => void;

  // Sprint 15 Phase 2 — ECUC add/delete mutation actions. Each one
  // mirrors the combined-mode dispatch pattern from `updateParam`:
  //   1. In 'combined' view mode the path is basename-prefixed, so the
  //      action routes via `findByPathMultiDoc` + `stripCombinedPrefix`
  //      and mutates the SOURCE document.
  //   2. In 'single' mode the action mutates the active document.
  //   3. On Result.ok: set() with new documents + dirtyPaths + the
  //      revalidation trio (validationErrors + lastValidatedAt).
  //   4. On Result.fail: setError() with a localized message keyed by
  //      the MutationError kind.
  addContainer: (parentPath: string, shortName: string) => void;
  deleteContainer: (containerPath: string) => void;
  addParameter: (containerPath: string, paramShortName: string) => void;
  addReference: (containerPath: string, refShortName: string) => void;
  deleteParameter: (containerPath: string, paramKey: string) => void;
  confirmDeleteContainer: (choice: 'cancel' | 'only' | 'cascade') => void;

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
  /**
   * Sprint 17b T6 — typed toast setters. `setError` is the only one
   * that takes `null` (it's a long-standing public surface that means
   * "clear the error banner"); the three new kinds only ever replace
   * the current toast. Use `dismissToast` to clear without picking a
   * kind — both `setError(null)` and `dismissToast()` reset toast
   * AND the legacy `error` field in one go.
   */
  setError: (msg: string | null) => void;
  setInfo: (message: string, autoDismissMs?: number) => void;
  setSuccess: (message: string, autoDismissMs?: number) => void;
  setWarning: (message: string, autoDismissMs?: number) => void;
  dismissToast: () => void;
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
    readonly docs: readonly {
      readonly rel: string;
      readonly path: string;
      readonly content: string;
    }[];
  }) => void;
  /**
   * Close the current project. Documents stay in the store (the user
   * might be editing unsaved changes); only `project` and `projectPath`
   * are cleared. Use `clear()` to also drop documents.
   */
  closeProject: () => void;
  /**
   * Sprint 12 #2 — load a BSWMD file. Behaviour:
   *
   *   1. If `path` is already in `bswmdPaths`, surface a localized
   *      `'app.error.duplicateBswmd'` error and return without
   *      mutating state. The user must `removeBswmd(path)` first
   *      if they want to reload — a no-replace policy (user-confirmed
   *      design decision Sprint 12 #2).
   *   2. Parse `content` via `parseBswmd`. On failure surface the
   *      parser's error message via `'app.error.parseBswmdFailed'`
   *      and return without mutating state.
   *   3. On success append the new `BswmdDocument` to `bswmdSchemas`,
   *      append `path` to `bswmdPaths`, and (when a project is open)
   *      append `path` to `project.bswmdPaths` so the next Save
   *      Project persists it.
   *   4. Re-run validation with `buildSchemaLayer(bswmdSchemas)` so
   *      the new schema takes effect for the current document set.
   *
   * Loose mode (project === null) is allowed — the store holds
   * `bswmdSchemas` / `bswmdPaths` independently of the manifest.
   * The hook layer (`useProjectActions.addBswmdFromDialog`) is
   * responsible for the "need project" gate at the UI boundary;
   * the store itself stays schema-layer-agnostic.
   */
  addBswmd: (path: string, content: string) => void;
  /**
   * Sprint 12 #2 — unload a BSWMD file. No-op when `path` is unknown
   * (the renderer treats a remove click on a stale id as a silent
   * miss). On success, drops the entry from `bswmdSchemas` and
   * `bswmdPaths` (using index correspondence — the two arrays are
   * insertion-ordered parallels) and re-validates with the updated
   * layer. When a project is open, also drops `path` from
   * `project.bswmdPaths` so the next Save Project doesn't resurrect
   * a deleted file.
   */
  removeBswmd: (path: string) => void;

  /**
   * Sprint 14 — toggle a BSW module's enabled state within a loaded BSWMD
   * schema. `enabled=false` adds `moduleShortName` to the schema's
   * `disabledModules` Set (the picker / `buildSchemaLayer` then treat
   * the module as absent); `enabled=true` removes it. No-op when
   * `bswmdPath` is not in `bswmdPaths` (a stale id from the renderer
   * must not blow up the store). Re-runs validation so disabled
   * modules immediately stop emitting `schema-unknown` errors.
   */
  setBswmdModuleEnabled: (bswmdPath: string, moduleShortName: string, enabled: boolean) => void;

  /**
   * Sprint 14 — return the file paths of every loaded ArxmlDocument
   * whose `sourceBswmdPath` matches the given BSWMD path. Used by the
   * cascade-on-remove flow (Task 12) to find dependents before
   * unloading a BSWMD. Pure read — does not mutate state.
   */
  findDependentsOfBswmd: (bswmdPath: string) => readonly string[];

  /**
   * Sprint 14 — attach `sourceBswmdPath` to a doc, then register it
   * through `addDocument` so the rest of the store pipeline (project
   * sync, dirty reset, validation, displayDoc recompute) runs
   * uniformly. Used by the BSWMD-to-ECUC skeleton flow (Task 8) to
   * record the provenance of the generated ARXML.
   */
  addDocumentWithSource: (doc: ArxmlDocument, sourceBswmdPath: string) => void;

  // Sprint 11 Phase 1 (Option A) — switch UI language.
  setLocale: (locale: Locale) => void;
}

// ---------------------------------------------------------------------------
// Sprint 17c T8 — resolveContainerTarget helper
//
// The store actions (addContainer / addParameter / addReference /
// deleteContainer / deleteParameter / updateParam) all open with a
// "find the source document" block that branches on viewMode. In
// 'combined' mode the path is basename-prefixed and we route via
// `findByPathMultiDoc`; in 'single' mode we use the active document.
// The block was duplicated 7 times — extract it to a single pure
// function so the call sites shrink to a null check + destructure.
//
// Pure: no I/O, no mutation, no closure over the store. The caller
// passes the state snapshot and the path; we return either a resolved
// target (doc + filePath + innerPath) or null when no source can be
// found. innerPath equals the input path for both modes — the
// basename-prefix stripping in combined mode is handled inside
// `findByPathMultiDoc`; callers using the inner path for
// `applyParamUpdate` continue to do so via the explicit
// `stripCombinedPrefix` call they already perform.
// ---------------------------------------------------------------------------

export interface ResolvedContainerTarget {
  readonly doc: ArxmlDocument;
  readonly filePath: string;
  readonly innerPath: string;
}

/**
 * Resolve a container path to its source document + filePath + innerPath.
 *
 * - 'combined' mode: routes via `findByPathMultiDoc` (path may carry a
 *   source file's basename as a prefix; the inner path is identical to
 *   the input because the per-doc lookup inside `findByPathMultiDoc`
 *   already strips the prefix when needed).
 * - 'single' mode: returns the active document; innerPath equals the
 *   input path verbatim.
 * - Returns `null` when the combined-mode lookup misses or the
 *   single-mode store has no active document — callers treat null as
 *   a 'path-not-found' error.
 */
export function resolveContainerTarget(
  state: ArxmlState,
  containerPath: string,
): ResolvedContainerTarget | null {
  if (state.viewMode === 'combined') {
    const hit = findByPathMultiDoc(state.documents, state.documentPaths, containerPath);
    if (hit === null) return null;
    return { doc: hit.doc, filePath: hit.filePath, innerPath: containerPath };
  }
  if (state.doc === null) return null;
  return { doc: state.doc, filePath: state.filePath ?? '', innerPath: containerPath };
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
  // Sprint 17b T6 — typed toast envelope. Both fields default to
  // null; every setter keeps them in sync so the legacy `error`
  // selectors (AppHeader, ErrorBanner, etc.) and the new typed
  // `toast` readers see the same UI state.
  toast: null,
  validationErrors: [],
  // Sprint 17c T10 — combined-doc build warnings. Populated by
  // `buildCombinedDocument` and refreshed on every combined-mode
  // store mutation. Empty in single mode and at initial mount.
  warnings: [],
  lastValidatedAt: null,
  // Sprint 11 Phase 1 — project state.
  project: null,
  projectPath: null,
  // Sprint 11 Phase 1 (Option A) — i18n default.
  locale: DEFAULT_LOCALE,
  // Sprint 13 refactor — left-tab default. 'files' is the post-Sprint-11
  // baseline: the project tab only makes sense when a project is open,
  // and the files tab is always visible. LeftPanel may override the
  // initial active tab visually (hiding 'project' in loose mode) but
  // the store-level default stays 'files'.
  leftTab: 'files',
  // Sprint 12 #2 — BSWMD schema state. Empty by default; populated by
  // addBswmd (file read via IPC) and consumed by revalidateWithBswmd
  // for the project-level validation pass.
  bswmdSchemas: [],
  bswmdPaths: [],
  // Sprint 13 Stage 3.5 — combined view defaults. `viewMode` starts
  // 'single' so the existing 746-test baseline sees no change; the
  // 'combined' mode is opt-in via the [Combined] virtual entry in
  // FileListTab. Sprint 14 widens the union to a 3-state machine
  // ('single' | 'combined' | 'import-merged') so the Import slice
  // can sit alongside Combined View.
  viewMode: 'single',
  displayDoc: null,
  // Sprint 14 — ImportSession slice defaults. No import in flight,
  // no last-commit snapshot.
  importSession: null,
  lastCommitSnapshot: null,
  // Sprint 12 #3 Task 7 — dialog state defaults. Both dialogs start
  // closed; no pending action. The `isDirty` getter is a function on
  // the state (zustand permits functions in state alongside data) so
  // it always reflects the current `dirtyPaths` set.
  isDirty: () => get().dirtyPaths.size > 0 || get().importSession !== null,
  newProjectDialogOpen: false,
  confirmDialogOpen: false,
  // Sprint 15 Phase 2 — picker + cascade confirm defaults. Both
  // start in their "no pending" form: picker closed with no
  // parentPath/kind, and pendingDelete null. The store owns these
  // flags so the dialog roots in `App.tsx` can mount once and react
  // to the same flag the action mutator flipped.
  bswmdPicker: { open: false, parentPath: null, kind: null },
  pendingDelete: null,

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
    // Sprint 16b T6 — relativise the absolute filePath against the
    // manifest's directory so the on-disk manifest stays valid
    // (classifyBadPath rejects absolute paths). `toManifestRelative`
    // returns null on cross-drive Windows / sibling POSIX paths; in
    // that case we keep the absolute path and the next save round-trip
    // will surface an 'invalid-path' / 'absolute' error so the user
    // notices the mistake.
    const nextProject = projectSyncAddPath(
      state.project,
      filePath,
      state.projectPath !== null ? sharedDirname(state.projectPath) : null,
    );
    const nextPaths = state.documentPaths.includes(filePath)
      ? state.documentPaths
      : [...state.documentPaths, filePath];
    const nextDisplayResult = computeDisplayDoc(state.viewMode, doc, nextDocuments, nextPaths);
    set({
      documents: nextDocuments,
      documentPaths: nextPaths,
      activeDocumentPath: filePath,
      doc,
      filePath,
      // Sprint 17c T10 — displayDoc may be null when the build
      // can't run (no source documents); the rest of the state
      // changes still commit so the action's side effects
      // (validation, dirty reset) take effect.
      displayDoc: nextDisplayResult?.doc ?? null,
      // Sprint 17c T10 — thread dedup warnings into the store
      // (single-mode changes leave warnings untouched, combined-
      // mode updates replace the slice with the fresh build).
      warnings:
        state.viewMode === 'combined' && nextDisplayResult !== null
          ? nextDisplayResult.warnings
          : state.warnings,
      selectedPath: null,
      // Newly loaded doc is fresh; other docs' dirty state is preserved.
      dirtyPaths: dropFromDirty(state.dirtyPaths, filePath),
      // Sprint 17b T6 — successful doc load clears both the legacy
      // `error` field and the typed `toast` so a stale banner from a
      // previous open-failure doesn't linger.
      error: null,
      toast: null,
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
    const nextActive = wasActive ? (nextPaths[0] ?? null) : state.activeDocumentPath;
    const activeIdx = nextActive === null ? -1 : nextPaths.indexOf(nextActive);
    const nextActiveDoc = activeIdx === -1 ? null : (nextDocuments[activeIdx] ?? null);
    // Project-sync: when a project is open, also drop the path from
    // the manifest so Save Project doesn't resurrect a deleted file.
    // Sprint 16b T6 — match the path-shape that was stored by
    // addDocument: try the relativised form first, then the raw
    // absolute path. Removing a doc by its absolute filePath therefore
    // also drops the relative manifest entry.
    const nextProject = projectSyncRemovePath(
      state.project,
      filePath,
      state.projectPath !== null ? sharedDirname(state.projectPath) : null,
    );
    const nextDisplayResult = computeDisplayDoc(
      state.viewMode,
      nextActiveDoc,
      nextDocuments,
      nextPaths,
    );
    set({
      documents: nextDocuments,
      documentPaths: nextPaths,
      activeDocumentPath: nextActive,
      doc: nextActiveDoc,
      filePath: nextActive,
      // Sprint 17c T10 — displayDoc may be null when the build
      // can't run; the rest of the state changes still commit.
      displayDoc: nextDisplayResult?.doc ?? null,
      // Sprint 17c T10 — refresh warnings in combined mode.
      warnings:
        state.viewMode === 'combined' && nextDisplayResult !== null
          ? nextDisplayResult.warnings
          : state.warnings,
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
      const nextDisplayResult = computeDisplayDoc(
        state.viewMode,
        null,
        state.documents,
        state.documentPaths,
      );
      if (nextDisplayResult === null) return;
      set({
        activeDocumentPath: null,
        doc: null,
        filePath: null,
        displayDoc: nextDisplayResult?.doc ?? null,
        // Sprint 17c T10 — refresh warnings in combined mode.
        warnings:
          state.viewMode === 'combined' && nextDisplayResult !== null
            ? nextDisplayResult.warnings
            : state.warnings,
      });
      return;
    }
    const idx = state.documentPaths.indexOf(filePath);
    if (idx === -1) return; // unknown path → no-op
    const nextDoc = state.documents[idx] ?? null;
    const nextDisplayResult = computeDisplayDoc(
      state.viewMode,
      nextDoc,
      state.documents,
      state.documentPaths,
    );
    set({
      activeDocumentPath: filePath,
      doc: nextDoc,
      filePath,
      displayDoc: nextDisplayResult?.doc ?? null,
      // Sprint 17c T10 — refresh warnings in combined mode.
      warnings:
        state.viewMode === 'combined' && nextDisplayResult !== null
          ? nextDisplayResult.warnings
          : state.warnings,
    });
  },

  setDoc: (doc, filePath) => {
    get().addDocument(doc, filePath);
  },

  select: (path) => set({ selectedPath: path }),

  updateParam: (containerPath, paramKey, value) => {
    const state = get();
    if (state.documents.length === 0) return;
    // Combined-mode routing (Sprint 13 Stage 3.5): when viewMode is
    // 'combined', the selectedPath is prefixed with the source file's
    // basename. Resolve it back to the source document via
    // resolveContainerTarget (which delegates to findByPathMultiDoc)
    // and mutate THAT document, not the active one. In 'single' mode,
    // containerPath is a regular path inside the active doc and we
    // keep the legacy route.
    if (state.viewMode === 'combined') {
      const target = resolveContainerTarget(state, containerPath);
      if (target === null) return;
      const { doc: sourceDoc, filePath: sourcePath } = target;
      const sourceIdx = state.documentPaths.indexOf(sourcePath);
      if (sourceIdx === -1) return;
      // The source's own path doesn't carry the basename prefix, so
      // we strip it for the underlying applyParamUpdate.
      const innerPath = stripCombinedPrefix(containerPath, sourcePath);
      if (innerPath === null) return;
      const nextSourceDoc = applyParamUpdate(sourceDoc, innerPath, paramKey, value);
      if (nextSourceDoc === sourceDoc) return;
      const nextDocuments = state.documents.map((d, i) => (i === sourceIdx ? nextSourceDoc : d));
      const nextActiveDoc = state.activeDocumentPath === sourcePath ? nextSourceDoc : state.doc;
      const nextDisplayResult = computeDisplayDoc(
        state.viewMode,
        nextActiveDoc,
        nextDocuments,
        state.documentPaths,
      );
      if (nextDisplayResult === null) return;
      set({
        documents: nextDocuments,
        doc: nextActiveDoc,
        displayDoc: nextDisplayResult?.doc ?? null,
        dirtyPaths: addToDirty(state.dirtyPaths, sourcePath),
        validationErrors: validateProjectForRenderer(nextDocuments),
        lastValidatedAt: Date.now(),
        // Sprint 17c T10 — refresh warnings in combined mode (the
        // source-doc content changed; the dedup result may differ).
        warnings:
          state.viewMode === 'combined' && nextDisplayResult !== null
            ? nextDisplayResult.warnings
            : state.warnings,
      });
      return;
    }
    // Legacy single-mode path.
    if (state.activeDocumentPath === null || state.doc === null) return;
    const activeIdx = state.documentPaths.indexOf(state.activeDocumentPath);
    if (activeIdx === -1) return;
    const activeDoc = state.documents[activeIdx]!;
    const nextActiveDoc = applyParamUpdate(activeDoc, containerPath, paramKey, value);
    if (nextActiveDoc === activeDoc) return;
    const nextDocuments = state.documents.map((d, i) => (i === activeIdx ? nextActiveDoc : d));
    const nextDisplayResult = computeDisplayDoc(
      state.viewMode,
      nextActiveDoc,
      nextDocuments,
      state.documentPaths,
    );
    set({
      documents: nextDocuments,
      doc: nextActiveDoc,
      displayDoc: nextDisplayResult?.doc ?? null,
      dirtyPaths: addToDirty(state.dirtyPaths, state.activeDocumentPath),
      validationErrors: validateProjectForRenderer(nextDocuments),
      lastValidatedAt: Date.now(),
      // Sprint 17c T10 — single-mode path. The combined-mode
      // branch above already exited with its own warnings slice;
      // this branch is reached only when viewMode is 'single',
      // so the warnings slice is preserved as-is.
    });
  },

  markSaved: (filePath) =>
    set({
      // Clear the dirty bit for the saved doc only. Other dirty docs are
      // preserved (per-path Set).
      dirtyPaths: dropFromDirty(get().dirtyPaths, filePath),
    }),

  setError: (msg) => {
    // Sprint 17b T6 — `setError` is the long-standing public surface
    // (AppHeader, useProjectActions, useRemoveEcucFiles, etc.). It
    // now writes BOTH the legacy `error: string | null` field AND
    // the new typed `toast: ToastState | null` field. Existing
    // selectors (`s.error`) and the new `s.toast` readers see the
    // same UI state in one render. `null` clears both (this is the
    // "dismiss banner" path); a non-null message becomes a manual-
    // dismiss error toast (no autoDismissMs, role="alert", aria-live
    // "assertive").
    if (msg === null) {
      set({ error: null, toast: null });
      return;
    }
    set({ error: msg, toast: { kind: 'error', message: msg } });
  },

  // Sprint 17b T6 — typed toast setters. Each replaces the current
  // toast (no null overload — use `dismissToast` to clear). The
  // `autoDismissMs` arg is optional; omitting it falls back to the
  // per-kind default (3s info/success, 5s warning). Errors are
  // always manual, so there is no `setError(msg, ms)` overload —
  // the long-standing public surface only ever needs a string.
  setInfo: (message, autoDismissMs = 3000) =>
    set({ error: message, toast: { kind: 'info', message, autoDismissMs } }),
  setSuccess: (message, autoDismissMs = 3000) =>
    set({ error: message, toast: { kind: 'success', message, autoDismissMs } }),
  setWarning: (message, autoDismissMs = 5000) =>
    set({ error: message, toast: { kind: 'warning', message, autoDismissMs } }),
  dismissToast: () => set({ error: null, toast: null }),

  // Sprint 17c T10 — clear the combined-doc warnings slice. Used
  // by the status-bar UI hook (added in a follow-up) when the
  // user dismisses a warning, and by tests that need a clean
  // baseline. The slice is also cleared automatically on
  // `clear()` and when leaving combined mode via `setViewMode`.
  clearWarnings: () => set({ warnings: [] }),

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
      displayDoc: null,
      selectedPath: null,
      dirtyPaths: new Set<string>(),
      error: null,
      // Sprint 17b T6 — toast slice; cleared alongside the legacy
      // `error` field so a fresh project doesn't reopen a stale
      // banner.
      toast: null,
      validationErrors: [],
      // Sprint 17c T10 — combined-doc warnings; cleared alongside
      // the document set so a fresh load doesn't see stale
      // dedup warnings.
      warnings: [],
      lastValidatedAt: null,
      project: null,
      projectPath: null,
      // Sprint 12 #2 — BSWMD state. clear() drops loaded schemas and
      // paths so a fresh load doesn't see stale schema-side coverage.
      bswmdSchemas: [],
      bswmdPaths: [],
      // Sprint 12 #3 Task 7 — dialog state. clear() also closes any
      // open dialogs so a fresh project doesn't re-open a stale
      // ConfirmDialog / NewProjectDialog.
      newProjectDialogOpen: false,
      confirmDialogOpen: false,
      // Sprint 15 Phase 2 — picker + cascade state. clear() also
      // closes the picker and drops any pending delete so a fresh
      // project doesn't reopen a stale CascadeConfirmDialog.
      bswmdPicker: { open: false, parentPath: null, kind: null },
      pendingDelete: null,
      // Sprint 13 Stage 3.5 — view mode reset. clear() returns to
      // 'single' so a fresh project doesn't open in combined mode by
      // accident; the user re-opens the combined view explicitly.
      viewMode: 'single',
      // Sprint 14 — clear the ImportSession slice + lastCommitSnapshot
      // so a fresh project doesn't reopen a stale import dialog or
      // accidentally offer undoLastCommit from a prior commit.
      importSession: null,
      lastCommitSnapshot: null,
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
    const nextDisplayResult = computeDisplayDoc(
      get().viewMode,
      activeDoc,
      orderedDocuments,
      orderedPaths,
    );
    set({
      documents: orderedDocuments,
      documentPaths: orderedPaths,
      activeDocumentPath: activePath,
      doc: activeDoc,
      filePath: activePath,
      displayDoc: nextDisplayResult?.doc ?? null,
      // Sprint 17c T10 — refresh warnings in combined mode.
      warnings:
        get().viewMode === 'combined' && nextDisplayResult !== null
          ? nextDisplayResult.warnings
          : [],
      selectedPath: null,
      // A freshly-opened project is, by definition, saved on disk; the
      // renderer has not modified anything yet, so all dirty bits clear.
      dirtyPaths: new Set<string>(),
      // Sprint 17b T6 — clear the typed toast alongside `error` so a
      // stale open-failure banner doesn't survive a successful open.
      error: null,
      toast: null,
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

  addBswmd: (path, content) => {
    const state = get();
    // Step 1: dedupe. Duplicate path is rejected (user-confirmed design
    // decision #2). The user must call `removeBswmd(path)` first if
    // they want to reload. This is the no-replace policy.
    if (state.bswmdPaths.includes(path)) {
      set({
        error: t(state.locale, 'app.error.duplicateBswmd', { path }),
      });
      return;
    }

    // Step 2: parse. On failure surface the parser's localized error
    // message and leave all state untouched (no partial add, no
    // destructive clear of prior error).
    const result = parseBswmd(content);
    if (!result.ok) {
      // The BswmdError union always carries a `message` for the
      // xml-malformed / missing-root / invalid-structure kinds; the
      // `unsupported-version` kind carries `version` instead, so we
      // fall back to a stable human label for that one branch.
      const message =
        'message' in result.error
          ? result.error.message
          : `unsupported version: ${result.error.version}`;
      set({
        error: t(state.locale, 'app.error.parseBswmdFailed', { message }),
      });
      return;
    }

    // Step 3: commit. Append the schema + path, mirror to the
    // manifest when a project is open, then re-validate using the
    // freshly built layer.
    // Sprint 16b T6 — relativise the BSWMD path against the manifest
    // directory the same way addDocument does, so the on-disk manifest
    // only ever stores relative paths (the absolute path is still
    // tracked in `bswmdPaths` for parser lookup).
    const nextSchemas = [...state.bswmdSchemas, result.value];
    const nextPaths = [...state.bswmdPaths, path];
    const nextProject = projectSyncAddBswmdPath(
      state.project,
      path,
      state.projectPath !== null ? sharedDirname(state.projectPath) : null,
    );
    set({
      bswmdSchemas: nextSchemas,
      bswmdPaths: nextPaths,
      project: nextProject,
      // Sprint 17b T6 — successful BSWMD add clears the typed toast
      // alongside `error` so a stale parse-failure banner doesn't
      // linger once a new schema loads cleanly.
      error: null,
      toast: null,
      ...revalidateWithBswmd(state.documents, nextSchemas),
    });
  },

  removeBswmd: (path) => {
    const state = get();
    const idx = state.bswmdPaths.indexOf(path);
    // No-op on unknown path — a stale id from the renderer shouldn't
    // blow up; it just doesn't match anything we hold.
    if (idx === -1) return;

    // BswmdDocument carries no source path; the parallel arrays
    // guarantee the entry at the same index in bswmdSchemas is the
    // one we're dropping.
    const nextSchemas = state.bswmdSchemas.filter((_, i) => i !== idx);
    const nextPaths = state.bswmdPaths.filter((p) => p !== path);
    // Sprint 16b T6 — match the path-shape that was stored by
    // addBswmd: try the relativised form first, then the raw absolute
    // path. Removing a BSWMD by its absolute filePath also drops the
    // relative manifest entry.
    const nextProject = projectSyncRemoveBswmdPath(
      state.project,
      path,
      state.projectPath !== null ? sharedDirname(state.projectPath) : null,
    );
    set({
      bswmdSchemas: nextSchemas,
      bswmdPaths: nextPaths,
      project: nextProject,
      ...revalidateWithBswmd(state.documents, nextSchemas),
    });
  },

  // Sprint 14 — toggle a module's enabled state. The two arrays
  // (`bswmdPaths` / `bswmdSchemas`) are parallel by construction (see
  // `addBswmd`), so a single index lookup resolves the target
  // schema. We materialise `disabledModules` as a new Set so the
  // existing schema reference stays immutable — downstream
  // `useStore(selector)` consumers comparing by reference still
  // detect the change. Re-validation keeps `validationErrors` in
  // sync: disabling a module drops the `schema-unknown` errors it
  // produced, enabling it restores them.
  setBswmdModuleEnabled: (bswmdPath, moduleShortName, enabled) => {
    const state = get();
    const idx = state.bswmdPaths.indexOf(bswmdPath);
    if (idx === -1) return;
    const oldSchema = state.bswmdSchemas[idx];
    if (oldSchema === undefined) return;

    const disabled = new Set(oldSchema.disabledModules ?? new Set<string>());
    if (enabled) {
      disabled.delete(moduleShortName);
    } else {
      disabled.add(moduleShortName);
    }
    const newSchema = { ...oldSchema, disabledModules: disabled };
    const nextSchemas = state.bswmdSchemas.map((s, i) => (i === idx ? newSchema : s));
    set({
      bswmdSchemas: nextSchemas,
      ...revalidateWithBswmd(state.documents, nextSchemas),
    });
  },

  // Sprint 14 — pure read for cascade-on-remove. Filters by
  // `sourceBswmdPath` and projects to `.path` so the caller (Task 12
  // hook) gets a ready-to-delete list. Documents without a
  // `sourceBswmdPath` are filtered out — the field is optional in
  // `ArxmlDocument`, and only BSWMD-generated docs carry it.
  findDependentsOfBswmd: (bswmdPath) => {
    return get()
      .documents.filter((d) => d.sourceBswmdPath === bswmdPath)
      .map((d) => d.path);
  },

  // Sprint 14 — attach provenance and delegate to `addDocument`. We
  // do NOT reimplement the addDocument body: project sync, dirty
  // reset, displayDoc recompute, validation, and back-compat
  // `doc`/`filePath` updates all live there. Keeping the delegation
  // means the cascade flow and the open-ARXML flow end up at exactly
  // the same final state.
  addDocumentWithSource: (doc, sourceBswmdPath) => {
    const docWithSource: ArxmlDocument = { ...doc, sourceBswmdPath };
    get().addDocument(docWithSource, doc.path);
  },

  setLocale: (locale) => set({ locale }),

  // Sprint 13 refactor — setLeftTab. Single-field set, no side
  // effects. The default 'files' is restored on `clear()` only if
  // the user wants a clean slate; we don't auto-flip the tab on
  // other store events because tabs are pure UI state independent
  // of project lifecycle (e.g. closing a project doesn't force the
  // user back to the files tab).
  setLeftTab: (tab) => set({ leftTab: tab }),

  // Sprint 13 Stage 3.5 — combined view toggle. Resets selectedPath
  // so a path from the previous mode doesn't survive the flip (a
  // single-mode path like `/EAS/Adc/AdcConfig` would not resolve
  // inside the combined view because the combined root is `[Combined]`
  // whose top-level packages are file basenames, not root packages).
  setViewMode: (mode) => {
    const state = get();
    // Sprint 14 — three-state guard. Switching to 'combined' while
    // an import session is in flight is rejected with a viewMode-
    // locked error: the user must commit or cancel the import
    // first. Switching to 'single' / 'import-merged' is always
    // allowed (the import flow owns its own view state).
    if (state.viewMode === 'import-merged' && mode === 'combined') {
      set({
        error: t(state.locale, 'app.import.error.viewModeLocked'),
      });
      return;
    }
    // 'import-merged' is only entered via startImport (never via
    // setViewMode directly) — guard against external misuse.
    if (mode === 'import-merged' && state.importSession === null) {
      return;
    }
    // Sprint 14 — when transitioning OUT of import-merged the
    // displayDoc should be rebuilt from the single-mode set (the
    // import-merged view synthesises its own tree; switching back
    // means re-rendering the active doc).
    const effectiveMode = state.viewMode === 'import-merged' ? 'single' : mode;
    const displayResult = computeDisplayDoc(
      effectiveMode,
      state.doc,
      state.documents,
      state.documentPaths,
    );
    // Sprint 17c T10 — when entering combined mode, populate the
    // warnings slice from the fresh build. When leaving combined
    // mode, clear warnings (they only apply to the combined view).
    // The `displayDoc` is null when there are no documents to
    // render (displayResult === null), but the viewMode flip
    // itself is still meaningful (e.g. tests covering the flip
    // without a loaded doc).
    const nextWarnings: readonly CombinedDocumentWarning[] =
      effectiveMode === 'combined' ? (displayResult?.warnings ?? []) : [];
    set({
      viewMode: mode,
      displayDoc: displayResult?.doc ?? null,
      warnings: nextWarnings,
      selectedPath: null,
    });
  },

  // -------------------------------------------------------------------
  // Sprint 14 ECUC ARXML Import — actions
  //
  // The import slice sits on top of the existing multi-doc state
  // without mutating `documents` until `commitImport` succeeds.
  // startImport snapshots incoming docs into `importSession`; the
  // subsequent T7/T8/T9 actions (selectModule / resolveModule /
  // commitImport / cancelImport / undoLastCommit) build on top of
  // this state. T6 ships just `startImport` so the foundation
  // (state shape + viewMode 3-state) is in place.
  // -------------------------------------------------------------------

  startImport: (incomingDocs, originalPaths) => {
    // Build a flat list of selections — one row per module across
    // every incoming document. The merged path uses the
    // `[import:N]` segment naming (see core/import/merge.ts).
    const selections: ModuleSelection[] = [];
    for (let docIdx = 0; docIdx < incomingDocs.length; docIdx += 1) {
      const doc = incomingDocs[docIdx]!;
      for (const pkg of doc.packages) {
        for (const el of pkg.elements) {
          collectModules(el, (m) => {
            const mergedPath = `/[import:${docIdx}]${pkg.path}/${m.shortName}`;
            const targetHit = findTargetModuleForShortName(
              get().documents,
              m.shortName,
            );
            selections.push({
              mergedModulePath: mergedPath,
              sourceDocIndex: docIdx,
              moduleShortName: m.shortName,
              selected: true,
              collidesWithTarget: targetHit !== null,
              targetModulePath: targetHit,
            });
            return undefined;
          });
        }
      }
    }
    const session: ImportSession = {
      id: `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      incomingDocs,
      originalPaths,
      selections,
      resolutions: [],
      activeModuleForDiff: null,
      createdAt: Date.now(),
      undoStack: [],
    };
    set({
      importSession: session,
      viewMode: 'import-merged',
      // Clear lastCommitSnapshot — a previous commit is no longer
      // "the last commit" once a new session starts.
      lastCommitSnapshot: null,
    });
  },

  // -------------------------------------------------------------------
  // Sprint 14 ECUC ARXML Import — T7 actions.
  //
  // `selectModule` flips the `selected` flag on a single
  // `ModuleSelection` row. `resolveModule` records a per-module
  // decision in the `resolutions` map (overwrites an existing entry
  // for the same merged path so the UI can re-toggle freely).
  // `openDiff` / `closeDiff` toggle `activeModuleForDiff` — the
  // store does NOT compute the diff itself; the DiffTable component
  // reads `activeModuleForDiff` and calls `buildModuleDiff` from
  // core/import/diff.ts directly. `undoInternal` pops the most
  // recent snapshot from `undoStack` (≤20 entries), restoring the
  // previous `resolutions` array. `undoStack` is captured inside
  // `resolveModule` (one snapshot per call) so `undoInternal` can
  // step back one decision at a time.
  // -------------------------------------------------------------------

  selectModule: (mergedPath, selected) => {
    const state = get();
    if (state.importSession === null) return;
    const nextSelections = state.importSession.selections.map((s) =>
      s.mergedModulePath === mergedPath ? { ...s, selected } : s,
    );
    set({
      importSession: { ...state.importSession, selections: nextSelections },
    });
  },

  resolveModule: (mergedPath, resolution, containerResolutions) => {
    const state = get();
    if (state.importSession === null) return;
    // Snapshot the previous resolutions for undoInternal.
    const undoStack = state.importSession.undoStack;
    const nextUndoStack = [...undoStack, state.importSession.resolutions].slice(-20);
    const existingIdx = state.importSession.resolutions.findIndex(
      (r) => r.mergedModulePath === mergedPath,
    );
    const newResolution: ModuleResolution = {
      mergedModulePath: mergedPath,
      resolution,
      ...(containerResolutions !== undefined ? { containerResolutions } : {}),
    };
    const nextResolutions: ModuleResolution[] =
      existingIdx === -1
        ? [...state.importSession.resolutions, newResolution]
        : state.importSession.resolutions.map((r, i) =>
            i === existingIdx ? newResolution : r,
          );
    set({
      importSession: {
        ...state.importSession,
        resolutions: nextResolutions,
        undoStack: nextUndoStack,
      },
    });
  },

  openDiff: (mergedPath) => {
    const state = get();
    if (state.importSession === null) return;
    set({
      importSession: { ...state.importSession, activeModuleForDiff: mergedPath },
    });
  },

  closeDiff: () => {
    const state = get();
    if (state.importSession === null) return;
    set({
      importSession: { ...state.importSession, activeModuleForDiff: null },
    });
  },

  undoInternal: () => {
    const state = get();
    if (state.importSession === null) return;
    const stack = state.importSession.undoStack;
    if (stack.length === 0) return;
    const last = stack[stack.length - 1]!;
    const nextStack = stack.slice(0, -1);
    set({
      importSession: {
        ...state.importSession,
        resolutions: last,
        undoStack: nextStack,
      },
    });
  },

  // -------------------------------------------------------------------
  // Sprint 14 ECUC ARXML Import — T8 commitImport.
  //
  // All-or-nothing commit (spec §7.3):
  //   1. Compile the session into per-source-file ImportPatch[] via
  //      `compileResolutionToPatches`. Filter out 'skip' /
  //      'keep-existing' resolutions — they produce no ops.
  //   2. Snapshot only the TARGET files that will be modified
  //      (`sourceFilesTouched` is the set of target filePaths, not
  //      incoming paths). The patch compiler keys by incoming
  //      sourceFile, so we re-key per selection here.
  //   3. Apply patches one target file at a time, immutable. If
  //      any `applyPatchesToDocument` throws, return the failure
  //      WITHOUT calling set() — the snapshot is the implicit
  //      rollback (we never wrote it back).
  //   4. After all patches succeed, set() the full update: new
  //      documents, dirtyPaths += sourceFilesTouched, importSession
  //      cleared, viewMode='single', lastCommitSnapshot saved,
  //      revalidation trio (validationErrors + lastValidatedAt).
  // -------------------------------------------------------------------

  commitImport: () => {
    const state = get();
    if (state.importSession === null) {
      return {
        ok: false,
        error: { kind: 'no-modules-selected' },
      } satisfies Result<{ readonly sourceFilesTouched: readonly string[] }, ImportError>;
    }
    const selectedCount = state.importSession.selections.filter((s) => s.selected).length;
    if (selectedCount === 0) {
      return {
        ok: false,
        error: { kind: 'no-modules-selected' },
      } satisfies Result<{ readonly sourceFilesTouched: readonly string[] }, ImportError>;
    }
    const patches = compileResolutionToPatches(state.importSession, state.documents);
    // The compiled patches are keyed by INCOMING sourceFile. Spec
    // §6.1 step 8 groups by TARGET file (the doc being modified), so
    // we re-key here: for every selected row we determine which
    // target document it should land in and filter the patch ops
    // down to those that target the selection's module shortName.
    const activeTargetPath = state.filePath ?? state.documentPaths[0] ?? null;
    const patchesByTarget = new Map<string, ImportPatchOp[]>();
    for (const sel of state.importSession.selections) {
      if (!sel.selected) continue;
      // Default resolution: 'overwrite' for un-opened diffs
      // (spec §6.1 step 7). The patch compiler uses the same
      // default so we mirror it here when computing the per-
      // target patch list.
      const resolution =
        state.importSession.resolutions.find(
          (r) => r.mergedModulePath === sel.mergedModulePath,
        )?.resolution ?? 'overwrite';
      if (resolution === 'keep-existing' || resolution === 'skip') {
        continue;
      }
      const targetPath =
        sel.targetModulePath !== null
          ? findOwningTargetPath(state.documents, state.documentPaths, sel.targetModulePath) ??
            activeTargetPath
          : activeTargetPath;
      if (targetPath === null) continue;
      const list = patchesByTarget.get(targetPath) ?? [];
      for (const p of patches) {
        if (p.sourceFile !== state.importSession.originalPaths[sel.sourceDocIndex]) continue;
        for (const op of p.ops) {
          if (opTargetsModule(op, sel.moduleShortName)) {
            list.push(op);
          }
        }
      }
      patchesByTarget.set(targetPath, list);
    }
    const sourceFilesTouched = new Set(patchesByTarget.keys());
    // Step 1: snapshot only the sourceFilesTouched documents.
    const snapshots = new Map<string, ArxmlDocument>();
    for (const filePath of sourceFilesTouched) {
      const idx = state.documentPaths.indexOf(filePath);
      if (idx !== -1) {
        snapshots.set(filePath, state.documents[idx]!);
      }
    }
    // Step 2: apply patches. On any throw → return error WITHOUT
    // mutating state (the snapshot is the implicit rollback —
    // we simply don't set()).
    let nextDocuments: readonly ArxmlDocument[] = state.documents;
    try {
      for (const [filePath, ops] of patchesByTarget) {
        if (ops.length === 0) continue;
        const idx = state.documentPaths.indexOf(filePath);
        if (idx === -1) continue;
        const newDoc = applyPatchesToDocument(state.documents[idx]!, ops);
        nextDocuments = nextDocuments.map((d, i) => (i === idx ? newDoc : d));
      }
    } catch (err) {
      // patch-apply-failed — importSession preserved, documents
      // unchanged. We don't set() so the store remains at its
      // pre-attempt state.
      const message = err instanceof Error ? err.message : String(err);
      const firstSource = [...sourceFilesTouched][0] ?? '';
      return {
        ok: false,
        error: {
          kind: 'patch-apply-failed',
          sourceFile: firstSource,
          moduleShortName: '',
          message,
        },
      };
    }
    // Step 3: commit. documents / dirtyPaths / importSession /
    // viewMode / lastCommitSnapshot / validationErrors /
    // lastValidatedAt all move together.
    const nextDirty = new Set(state.dirtyPaths);
    for (const filePath of sourceFilesTouched) {
      nextDirty.add(filePath);
    }
    set({
      documents: nextDocuments,
      dirtyPaths: nextDirty,
      importSession: null,
      viewMode: 'single',
      lastCommitSnapshot: snapshots,
      validationErrors: validateProjectForRenderer(nextDocuments),
      lastValidatedAt: Date.now(),
    });
    return {
      ok: true,
      value: { sourceFilesTouched: [...sourceFilesTouched] },
    };
  },

  // -------------------------------------------------------------------
  // Sprint 14 ECUC ARXML Import — T9 actions.
  //
  // `cancelImport` discards the in-flight session WITHOUT
  // confirmation (spec §6.3: "退出不弹 confirm"). Source
  // documents and dirty paths are untouched. Used by the
  // ModuleSelectionPanel's [Cancel] button and by the AppHeader
  // guard that blocks Save while viewMode === 'import-merged'.
  //
  // `undoLastCommit` reverses the most recent successful commit
  // by restoring the `lastCommitSnapshot` documents and dropping
  // the snapshot entries from `dirtyPaths`. The snapshot is
  // cleared so a second `undoLastCommit` is a no-op (we only
  // support one level of undo per spec §7.4).
  // -------------------------------------------------------------------

  cancelImport: () => {
    const state = get();
    if (state.importSession === null) return;
    set({
      importSession: null,
      viewMode: 'single',
      // activeModuleForDiff is nested inside importSession — once
      // the session is null there is no diff to display. The
      // setter would be a no-op anyway; we just make the intent
      // explicit.
      activeModuleForDiff: null,
    });
  },

  undoLastCommit: () => {
    const state = get();
    const snapshot = state.lastCommitSnapshot;
    if (snapshot === null) return;
    // Restore the documents for every snapshot entry, leaving
    // all other docs unchanged. Also clear the dirty bit for
    // each restored file (we're undoing the commit that dirtied
    // them).
    const nextDocuments = state.documents.map((d, i) => {
      const filePath = state.documentPaths[i];
      if (filePath === undefined) return d;
      const snap = snapshot.get(filePath);
      return snap ?? d;
    });
    let nextDirty = state.dirtyPaths;
    for (const filePath of snapshot.keys()) {
      nextDirty = dropFromDirty(nextDirty, filePath);
    }
    set({
      documents: nextDocuments,
      dirtyPaths: nextDirty,
      lastCommitSnapshot: null,
      validationErrors: validateProjectForRenderer(nextDocuments),
      lastValidatedAt: Date.now(),
    });
  },

  // Sprint 12 #3 Task 7 — dialog visibility setters. All three setters
  // touch a single field and are intentionally side-effect-free: the
  // store doesn't gate visibility on dirty state, the hook layer
  // (useProjectActions.newProject etc.) does that before calling these
  // setters. This keeps the store simple and makes the dirty-guard
  // testable at the hook layer.
  setNewProjectDialogOpen: (open) => set({ newProjectDialogOpen: open }),
  setConfirmDialogOpen: (open) => set({ confirmDialogOpen: open }),

  // Sprint 15 Phase 2 — picker state setters. Plain field setters; the
  // action layer above is what fans out into the actual mutation. The
  // store owns visibility so the picker root mounted in `App.tsx`
  // reacts to the same flag the action mutator flipped.
  openBswmdPicker: (target) =>
    set({
      bswmdPicker: {
        open: true,
        parentPath: target.parentPath,
        kind: target.kind,
      },
    }),
  closeBswmdPicker: () =>
    set({
      bswmdPicker: { open: false, parentPath: null, kind: null },
    }),
  setPendingDelete: (pending) => set({ pendingDelete: pending }),

  // Sprint 15 Phase 2 — ECUC add/delete mutation actions. See the
  // interface JSDoc for the combined-mode / revalidate / dirtyPaths
  // contract. All four delegate to the pure core/arxml/mutation.ts
  // functions; the store's job is the path resolution, the error
  // envelope translation (MutationError → i18n key), and the state
  // update.
  addContainer: (parentPath, shortName) => {
    const state = get();
    if (state.viewMode === 'combined') {
      // Combined-mode dispatch: route to the source document.
      const target = resolveContainerTarget(state, parentPath);
      if (target === null) {
        setErrorWithKind(set, state.locale, { kind: 'path-not-found', path: parentPath });
        return;
      }
      const { doc: sourceDoc, filePath: sourcePath } = target;
      const sourceIdx = state.documentPaths.indexOf(sourcePath);
      if (sourceIdx === -1) {
        setErrorWithKind(set, state.locale, { kind: 'path-not-found', path: parentPath });
        return;
      }
      const innerPath = stripCombinedPrefix(parentPath, sourcePath);
      if (innerPath === null) {
        setErrorWithKind(set, state.locale, { kind: 'path-not-found', path: parentPath });
        return;
      }
      const lookup = resolveModuleAndParentContainer(state.bswmdSchemas, innerPath);
      if (lookup === null) {
        set({ error: t(state.locale, 'mutation.error.no-bswmd-for-module') });
        return;
      }
      const { moduleDef, parentContainerDef } = lookup;
      // Find the child container def under the parent (or top-level if
      // parent is the module root). Returns null when the BSWMD does
      // not declare this child — surface as `no-bswmd-for-module` per
      // the spec (BSWMD is the source of truth; an undeclared child
      // is the same failure class as a missing module).
      const childDef = findChildContainerDef(moduleDef, parentContainerDef, shortName);
      if (childDef === null) {
        set({ error: t(state.locale, 'mutation.error.no-bswmd-for-module') });
        return;
      }
      const result = coreAddContainer(sourceDoc, innerPath, shortName, moduleDef, childDef);
      if (!result.ok) {
        set({ error: mutationErrorToI18n(state.locale, result.error) });
        return;
      }
      applyMutationResultToSource(set, state, sourceIdx, result.value, sourcePath);
      return;
    }
    // Single-mode dispatch — the active document.
    if (state.activeDocumentPath === null || state.doc === null) return;
    const activeIdx = state.documentPaths.indexOf(state.activeDocumentPath);
    if (activeIdx === -1) return;
    const lookup = resolveModuleAndParentContainer(state.bswmdSchemas, parentPath);
    if (lookup === null) {
      set({ error: t(state.locale, 'mutation.error.no-bswmd-for-module') });
      return;
    }
    const { moduleDef, parentContainerDef } = lookup;
    const childDef = findChildContainerDef(moduleDef, parentContainerDef, shortName);
    if (childDef === null) {
      set({ error: t(state.locale, 'mutation.error.no-bswmd-for-module') });
      return;
    }
    const result = coreAddContainer(state.doc, parentPath, shortName, moduleDef, childDef);
    if (!result.ok) {
      set({ error: mutationErrorToI18n(state.locale, result.error) });
      return;
    }
    applyMutationResultToActive(set, state, activeIdx, result.value, state.activeDocumentPath);
  },

  deleteContainer: (containerPath) => {
    const state = get();
    if (state.viewMode === 'combined') {
      // Combined-mode: resolve to the source doc.
      const target = resolveContainerTarget(state, containerPath);
      if (target === null) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const { doc: sourceDoc, filePath: sourcePath } = target;
      const sourceIdx = state.documentPaths.indexOf(sourcePath);
      if (sourceIdx === -1) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const innerPath = stripCombinedPrefix(containerPath, sourcePath);
      if (innerPath === null) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      // Reverse-reference scan over all loaded documents.
      const refBundle = state.documents.map((d, i) => ({
        doc: d,
        filePath: state.documentPaths[i] ?? '',
      }));
      const refs = findReferencesTo(refBundle, innerPath);
      if (refs.length === 0) {
        // HIGH-2: pass moduleDef so the core can enforce multiplicity-floor.
        const moduleDef = findModuleDefForPath(state.bswmdSchemas, sourceDoc.path);
        const result = coreRemoveContainer(sourceDoc, innerPath, false, moduleDef);
        if (!result.ok) {
          set({ error: mutationErrorToI18n(state.locale, result.error) });
          return;
        }
        applyMutationResultToSource(set, state, sourceIdx, result.value, sourcePath);
        return;
      }
      // Defer to the cascade dialog via pendingDelete.
      set({ pendingDelete: { path: innerPath, references: refs } });
      return;
    }
    // Single-mode.
    if (state.activeDocumentPath === null || state.doc === null) return;
    const activeIdx = state.documentPaths.indexOf(state.activeDocumentPath);
    if (activeIdx === -1) return;
    const refBundle = state.documents.map((d, i) => ({
      doc: d,
      filePath: state.documentPaths[i] ?? '',
    }));
    const refs = findReferencesTo(refBundle, containerPath);
    if (refs.length === 0) {
      // HIGH-2: pass moduleDef so the core can enforce multiplicity-floor.
      const moduleDef = findModuleDefForPath(state.bswmdSchemas, state.doc.path);
      const result = coreRemoveContainer(state.doc, containerPath, false, moduleDef);
      if (!result.ok) {
        set({ error: mutationErrorToI18n(state.locale, result.error) });
        return;
      }
      applyMutationResultToActive(set, state, activeIdx, result.value, state.activeDocumentPath);
      return;
    }
    set({ pendingDelete: { path: containerPath, references: refs } });
  },

  addParameter: (containerPath, paramShortName) => {
    const state = get();
    if (state.viewMode === 'combined') {
      const target = resolveContainerTarget(state, containerPath);
      if (target === null) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const { doc: sourceDoc, filePath: sourcePath } = target;
      const sourceIdx = state.documentPaths.indexOf(sourcePath);
      if (sourceIdx === -1) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const innerPath = stripCombinedPrefix(containerPath, sourcePath);
      if (innerPath === null) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const lookup = resolveParamDefForPath(state.bswmdSchemas, innerPath, paramShortName);
      if (lookup === null) {
        set({ error: t(state.locale, 'mutation.error.no-bswmd-for-module') });
        return;
      }
      const { moduleDef, paramDef } = lookup;
      if (paramDef === null) {
        // BSWMD does not declare this param on the parent container.
        // Spec § 7.2 maps this to the `invalid-param-type` i18n key.
        set({
          error: t(state.locale, 'mutation.error.invalid-param-type', { key: paramShortName }),
        });
        return;
      }
      const result = coreAddParameter(sourceDoc, innerPath, paramDef, moduleDef);
      if (!result.ok) {
        set({ error: mutationErrorToI18n(state.locale, result.error) });
        return;
      }
      applyMutationResultToSource(set, state, sourceIdx, result.value, sourcePath);
      return;
    }
    if (state.activeDocumentPath === null || state.doc === null) return;
    const activeIdx = state.documentPaths.indexOf(state.activeDocumentPath);
    if (activeIdx === -1) return;
    const lookup = resolveParamDefForPath(state.bswmdSchemas, containerPath, paramShortName);
    if (lookup === null) {
      set({ error: t(state.locale, 'mutation.error.no-bswmd-for-module') });
      return;
    }
    const { moduleDef, paramDef } = lookup;
    if (paramDef === null) {
      set({
        error: t(state.locale, 'mutation.error.invalid-param-type', { key: paramShortName }),
      });
      return;
    }
    const result = coreAddParameter(state.doc, containerPath, paramDef, moduleDef);
    if (!result.ok) {
      set({ error: mutationErrorToI18n(state.locale, result.error) });
      return;
    }
    applyMutationResultToActive(set, state, activeIdx, result.value, state.activeDocumentPath);
  },

  // Sprint 15 — add a reference-typed parameter. Mirrors `addParameter` but
  // looks up the BSWMD `ReferenceDef` (not `ParamDef`) and constructs a
  // `{ type: 'reference', value: '', dest }` ParamValue. The dest comes
  // from `refDef.destKind`; the user fills the value via `ReferenceEditor`
  // after the pick.
  addReference: (containerPath, refShortName) => {
    const state = get();
    if (state.viewMode === 'combined') {
      const target = resolveContainerTarget(state, containerPath);
      if (target === null) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const { doc: sourceDoc, filePath: sourcePath } = target;
      const sourceIdx = state.documentPaths.indexOf(sourcePath);
      if (sourceIdx === -1) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const innerPath = stripCombinedPrefix(containerPath, sourcePath);
      if (innerPath === null) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const lookup = resolveReferenceDefForPath(state.bswmdSchemas, innerPath, refShortName);
      if (lookup === null) {
        set({ error: t(state.locale, 'mutation.error.no-bswmd-for-module') });
        return;
      }
      const { moduleDef, refDef } = lookup;
      if (refDef === null) {
        set({
          error: t(state.locale, 'mutation.error.invalid-param-type', { key: refShortName }),
        });
        return;
      }
      const result = coreAddReference(sourceDoc, innerPath, refDef, moduleDef);
      if (!result.ok) {
        set({ error: mutationErrorToI18n(state.locale, result.error) });
        return;
      }
      applyMutationResultToSource(set, state, sourceIdx, result.value, sourcePath);
      return;
    }
    if (state.activeDocumentPath === null || state.doc === null) return;
    const activeIdx = state.documentPaths.indexOf(state.activeDocumentPath);
    if (activeIdx === -1) return;
    const lookup = resolveReferenceDefForPath(state.bswmdSchemas, containerPath, refShortName);
    if (lookup === null) {
      set({ error: t(state.locale, 'mutation.error.no-bswmd-for-module') });
      return;
    }
    const { moduleDef, refDef } = lookup;
    if (refDef === null) {
      set({
        error: t(state.locale, 'mutation.error.invalid-param-type', { key: refShortName }),
      });
      return;
    }
    const result = coreAddReference(state.doc, containerPath, refDef, moduleDef);
    if (!result.ok) {
      set({ error: mutationErrorToI18n(state.locale, result.error) });
      return;
    }
    applyMutationResultToActive(set, state, activeIdx, result.value, state.activeDocumentPath);
  },

  deleteParameter: (containerPath, paramKey) => {
    const state = get();
    if (state.viewMode === 'combined') {
      const target = resolveContainerTarget(state, containerPath);
      if (target === null) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const { doc: sourceDoc, filePath: sourcePath } = target;
      const sourceIdx = state.documentPaths.indexOf(sourcePath);
      if (sourceIdx === -1) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const innerPath = stripCombinedPrefix(containerPath, sourcePath);
      if (innerPath === null) {
        set({ error: t(state.locale, 'mutation.error.path-not-found') });
        return;
      }
      const result = coreRemoveParameter(sourceDoc, innerPath, paramKey);
      if (!result.ok) {
        set({ error: mutationErrorToI18n(state.locale, result.error) });
        return;
      }
      applyMutationResultToSource(set, state, sourceIdx, result.value, sourcePath);
      return;
    }
    if (state.activeDocumentPath === null || state.doc === null) return;
    const activeIdx = state.documentPaths.indexOf(state.activeDocumentPath);
    if (activeIdx === -1) return;
    const result = coreRemoveParameter(state.doc, containerPath, paramKey);
    if (!result.ok) {
      set({ error: mutationErrorToI18n(state.locale, result.error) });
      return;
    }
    applyMutationResultToActive(set, state, activeIdx, result.value, state.activeDocumentPath);
  },

  // Sprint 15 Phase 2 — consume `pendingDelete` and dispatch the
  // actual remove. `cancel` is a no-op (just clears the flag);
  // `only` runs `removeContainer` without touching references;
  // `cascade` also iterates the pending references and removes
  // each one with `removeParameter`.
  confirmDeleteContainer: (choice) => {
    const state = get();
    const pending = state.pendingDelete;
    if (pending === null) return;

    if (choice === 'cancel') {
      set({ pendingDelete: null });
      return;
    }

    // Find the doc that contains the target. The cascade scan above
    // stored the inner path (single-mode) or the inner path from
    // the combined-mode dispatch. We rebuild the document resolution
    // here: try the active doc first, fall back to combined-mode
    // resolution. This keeps the action's contract simple — the
    // pending path is always an inner path (already stripped of the
    // combined prefix by `deleteContainer`).
    const activeDoc = state.doc;
    if (activeDoc === null || state.activeDocumentPath === null) {
      set({ pendingDelete: null });
      return;
    }
    const activeIdx = state.documentPaths.indexOf(state.activeDocumentPath);
    if (activeIdx === -1) {
      set({ pendingDelete: null });
      return;
    }

    let workingDoc: ArxmlDocument = activeDoc;
    let workingIdx: number = activeIdx;
    let workingPath: string = state.activeDocumentPath;

    // Combined-mode: the target path may live in a different file.
    if (state.viewMode === 'combined') {
      const target = resolveContainerTarget(state, pending.path);
      if (target !== null) {
        const inner = stripCombinedPrefix(pending.path, target.filePath);
        if (inner !== null) {
          workingDoc = target.doc;
          workingIdx = state.documentPaths.indexOf(target.filePath);
          workingPath = target.filePath;
        }
      }
    } else {
      // Single-mode: pending.path IS the inner path on the active doc.
      // No rewriting needed.
    }

    // 1. Remove the container. Pass `moduleDef` so the core can
    //    enforce the BSWMD multiplicity-floor (HIGH-2).
    const moduleDef = findModuleDefForPath(state.bswmdSchemas, workingPath);
    const result = coreRemoveContainer(workingDoc, pending.path, false, moduleDef);
    if (!result.ok) {
      set({
        error: mutationErrorToI18n(state.locale, result.error),
        pendingDelete: null,
      });
      return;
    }
    workingDoc = result.value;

    // 2. Cascade: for each reference hit, apply removeParameter on the
    //    doc that owns the reference. We track per-file doc mutations
    //    in `docEdits` so the final commit covers all modified files
    //    (HIGH-3 — the previous version silently dropped refs on other
    //    files, leaving dangling references the user was promised
    //    would be cleaned up).
    const docEdits = new Map<number, ArxmlDocument>();
    docEdits.set(workingIdx, workingDoc);
    if (choice === 'cascade') {
      for (const ref of pending.references) {
        const refDocIdx = state.documentPaths.indexOf(ref.filePath);
        if (refDocIdx === -1) continue;
        // Use the latest in-progress edit if we have already touched
        // this doc, otherwise pull the current document.
        const refDoc = docEdits.get(refDocIdx) ?? state.documents[refDocIdx];
        if (refDoc === undefined) continue;
        const r2 = coreRemoveParameter(refDoc, ref.containerPath, ref.paramKey);
        if (r2.ok) {
          docEdits.set(refDocIdx, r2.value);
        }
        // If `r2` failed (e.g. the ref was already gone) we silently
        // skip — the user's intent is satisfied either way.
      }
    }

    // 3. Commit: rebuild `documents` from the per-file edits, mark
    //    every modified file as dirty, re-validate.
    let nextDirty = state.dirtyPaths;
    for (const [idx, edited] of docEdits.entries()) {
      if (idx < 0 || idx >= state.documents.length) continue;
      if (state.documents[idx] !== edited) {
        const filePath = state.documentPaths[idx];
        if (filePath !== undefined) {
          nextDirty = addToDirty(nextDirty, filePath);
        }
      }
    }
    const nextDocuments = state.documents.map((d, i) => docEdits.get(i) ?? d);
    const nextActiveDoc =
      state.activeDocumentPath === workingPath
        ? (docEdits.get(workingIdx) ?? workingDoc)
        : state.doc;
    const nextDisplayResult = computeDisplayDoc(
      state.viewMode,
      nextActiveDoc,
      nextDocuments,
      state.documentPaths,
    );
    set({
      documents: nextDocuments,
      doc: nextActiveDoc,
      displayDoc: nextDisplayResult?.doc ?? null,
      dirtyPaths: nextDirty,
      pendingDelete: null,
      validationErrors: validateProjectForRenderer(nextDocuments),
      lastValidatedAt: Date.now(),
      // Sprint 17c T10 — refresh warnings in combined mode.
      warnings:
        state.viewMode === 'combined' && nextDisplayResult !== null
          ? nextDisplayResult.warnings
          : state.warnings,
    });
  },
}));

// ---------------------------------------------------------------------------
// Project-sync helpers (Sprint 11 Phase 1)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Sprint 14 — ImportSession helpers.
//
// `collectModules` walks an ArxmlElement subtree and yields every
// module (used by `startImport` to enumerate incoming modules for the
// ModuleSelectionPanel list).
//
// `findTargetModuleForShortName` searches the loaded target documents
// for a module with the given shortName and returns its path inside
// the first matching document (or null when no collision exists).
// ---------------------------------------------------------------------------

function collectModules(
  el: ArxmlElement,
  visit: (m: ArxmlModule) => void,
): void {
  if (el.kind === 'module') {
    visit(el);
    return;
  }
  if (el.kind === 'container') {
    for (const c of el.children) collectModules(c, visit);
  }
}

function findTargetModuleForShortName(
  documents: readonly ArxmlDocument[],
  shortName: string,
): string | null {
  for (const doc of documents) {
    for (const pkg of doc.packages) {
      for (const el of pkg.elements) {
        let foundPath: string | null = null;
        collectModules(el, (m) => {
          if (m.shortName === shortName && foundPath === null) {
            foundPath = `${pkg.path}/${m.shortName}`;
          }
          return undefined;
        });
        if (foundPath !== null) return foundPath;
      }
    }
  }
  return null;
}

/**
 * Given a `targetModulePath` like `/EAS/Can` and the parallel
 * documents/documentPaths arrays, return the filePath of the
 * document that owns that module. Returns null when the path can't
 * be located. Used by `commitImport` to route merge/overwrite
 * ops to the right target file when a module collides across
 * loaded documents.
 */
function findOwningTargetPath(
  documents: readonly ArxmlDocument[],
  documentPaths: readonly string[],
  targetModulePath: string,
): string | null {
  const segments = targetModulePath.split('/').filter(Boolean);
  for (let i = 0; i < documents.length; i += 1) {
    const doc = documents[i]!;
    for (const pkg of doc.packages) {
      if (pkg.shortName !== segments[0]) continue;
      if (segments.length === 2) {
        for (const el of pkg.elements) {
          if (el.kind === 'module' && el.shortName === segments[1]) {
            return documentPaths[i] ?? null;
          }
        }
      }
    }
  }
  return null;
}

/**
 * True when the given patch op targets a module with `shortName`.
 * Used by `commitImport` to split the compiled patch list per
 * selection. rename-incoming is matched on its `originalShortName`
 * — the rename is paired with the next add-module that carries
 * the new name, so capturing the originalShortName pulls both
 * ops together.
 */
function opTargetsModule(op: ImportPatchOp, shortName: string): boolean {
  switch (op.kind) {
    case 'add-module':
      return op.module.shortName === shortName;
    case 'merge-into-module':
    case 'overwrite-module':
      return op.moduleShortName === shortName;
    case 'rename-incoming':
      return op.originalShortName === shortName;
  }
}

/**
 * Return a new manifest with `path` appended to valueArxmlPaths, or the
 * unchanged `m` if `m === null` (loose mode) or the path is already
 * present. Pure — produces a new manifest reference only when needed.
 *
 * Sprint 16b T6 — `manifestDir` is the directory of the saved manifest
 * (the parent of `state.projectPath`). When supplied, `path` is
 * relativised against `manifestDir` before being stored so the on-disk
 * manifest stays valid (classifyBadPath rejects absolute paths).
 * `toManifestRelative` returns `null` when the path is on a different
 * drive / outside the manifest dir; in that case we fall back to the
 * raw absolute path so the next save round-trip surfaces an
 * 'invalid-path' / 'absolute' error and the user notices the mistake.
 */
function projectSyncAddPath(
  m: ProjectManifest | null,
  path: string,
  manifestDir: string | null,
): ProjectManifest | null {
  if (m === null) return m;
  const rel = manifestDir !== null ? (toManifestRelative(manifestDir, path) ?? path) : path;
  if (m.valueArxmlPaths.includes(rel)) return m;
  return { ...m, valueArxmlPaths: [...m.valueArxmlPaths, rel] };
}

/**
 * Return a new manifest with `path` removed from valueArxmlPaths, or the
 * unchanged `m` if `m === null` (loose mode) or the path isn't present.
 *
 * Sprint 16b T6 — try both the relativised form and the raw absolute
 * form so removing a doc by its absolute filePath also drops the
 * relative manifest entry that was written by `projectSyncAddPath`.
 */
function projectSyncRemovePath(
  m: ProjectManifest | null,
  path: string,
  manifestDir: string | null,
): ProjectManifest | null {
  if (m === null) return m;
  const rel = manifestDir !== null ? (toManifestRelative(manifestDir, path) ?? path) : path;
  if (!m.valueArxmlPaths.includes(rel) && !m.valueArxmlPaths.includes(path)) {
    return m;
  }
  return {
    ...m,
    valueArxmlPaths: m.valueArxmlPaths.filter((p) => p !== rel && p !== path),
  };
}

/**
 * Sprint 12 #2 — BSWMD counterpart of `projectSyncAddPath`. Returns a
 * new manifest with `path` appended to `bswmdPaths`, or the unchanged
 * `m` if `m === null` (loose mode) or the path is already present.
 * Pure — produces a new manifest reference only when needed.
 *
 * Sprint 16b T6 — `manifestDir` mirrors `projectSyncAddPath`. The
 * relativisation contract is identical (null on cross-drive, fall back
 * to absolute).
 */
function projectSyncAddBswmdPath(
  m: ProjectManifest | null,
  path: string,
  manifestDir: string | null,
): ProjectManifest | null {
  if (m === null) return m;
  const rel = manifestDir !== null ? (toManifestRelative(manifestDir, path) ?? path) : path;
  if (m.bswmdPaths.includes(rel)) return m;
  return { ...m, bswmdPaths: [...m.bswmdPaths, rel] };
}

/**
 * Sprint 12 #2 — BSWMD counterpart of `projectSyncRemovePath`. Returns
 * a new manifest with `path` removed from `bswmdPaths`, or the
 * unchanged `m` if `m === null` (loose mode) or the path isn't
 * present.
 *
 * Sprint 16b T6 — try both the relativised form and the raw absolute
 * form so removing a BSWMD by its absolute filePath also drops the
 * relative manifest entry that was written by `projectSyncAddBswmdPath`.
 */
function projectSyncRemoveBswmdPath(
  m: ProjectManifest | null,
  path: string,
  manifestDir: string | null,
): ProjectManifest | null {
  if (m === null) return m;
  const rel = manifestDir !== null ? (toManifestRelative(manifestDir, path) ?? path) : path;
  if (!m.bswmdPaths.includes(rel) && !m.bswmdPaths.includes(path)) {
    return m;
  }
  return {
    ...m,
    bswmdPaths: m.bswmdPaths.filter((p) => p !== rel && p !== path),
  };
}

/**
 * Sprint 12 #2 — re-validate the current document set against the given
 * BSWMD schema set. Shared by `addBswmd` (post-add) and `removeBswmd`
 * (post-remove) so the build-layer / dispatch / timestamp trio is
 * kept consistent. Pure — only reads its inputs, returns a partial
 * state object for the caller to spread into `set()`.
 */
function revalidateWithBswmd(
  documents: readonly ArxmlDocument[],
  schemas: readonly BswmdDocument[],
): { readonly validationErrors: readonly ValidationError[]; readonly lastValidatedAt: number } {
  return {
    validationErrors: validateProjectForRenderer(documents, {
      schemaLayer: buildSchemaLayer(schemas),
    }),
    lastValidatedAt: Date.now(),
  };
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
function withDefinitionRefPreserved(
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

function paramValueEquals(a: ParamValue, b: ParamValue): boolean {
  if (a.type !== b.type) return false;
  return a.value === b.value;
}

function shortName(e: ArxmlElement): string {
  if (e.kind === 'reference') return e.shortName ?? e.value;
  return e.shortName;
}

// ---------------------------------------------------------------------------
// Sprint 13 Stage 3.5 — Combined Tree View helpers
// ---------------------------------------------------------------------------

/**
 * Compute `displayDoc` based on the current viewMode and document set.
 * Pure helper extracted so every mutator can recompute consistently
 * without inline branching. In 'single' mode it returns the active
 * `doc`; in 'combined' mode it returns a freshly synthesised virtual
 * document (or null when no docs are loaded).
 */
function computeDisplayDoc(
  mode: 'single' | 'combined',
  activeDoc: ArxmlDocument | null,
  documents: readonly ArxmlDocument[],
  filePaths: readonly string[],
): CombinedDocumentResult | null {
  if (mode === 'single') {
    // Single mode passes through the active doc unchanged; no
    // dedup applies (only one source). The result is still
    // wrapped in a `CombinedDocumentResult` for type uniformity
    // with the combined-mode branch — the empty warnings array
    // is intentional. `doc` may be null when no source documents
    // are loaded; callers treat that as "no display content".
    return { doc: activeDoc, warnings: [] };
  }
  if (documents.length === 0) return null;
  return buildCombinedDocument(documents, filePaths);
}

/**
 * Last segment of a file path (after the last `/` or `\`). Mirrors
 * `@shared/path#basename` but kept inline so the store has no shared
 * dependency (the store is consumed in the renderer; this also keeps
 * the `core/` import graph one-way).
 */
function lastSegment(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/**
 * Sprint 13 Stage 3.5 — Combined Tree View. Synthesise a virtual
 * ArxmlDocument whose top-level packages are the per-file basenames of
 * the loaded documents, and whose child paths are prefixed with the
 * source file's basename (or `[doc:N]` for same-basename duplicates).
 * Used as the `displayDoc` value when `viewMode === 'combined'`. The
 * Tree component reads `displayDoc` instead of `doc` and renders one
 * branch per loaded file.
 *
 * Wrapping is shallow: each package is a fresh object with its
 * `shortName` / `path` rewritten, but the original `elements` array
 * is reused. Mutation through `updateParam` reaches the source
 * document because it routes via `findByPathMultiDoc` rather than
 * mutating the wrapped packages.
 */
function buildCombinedDocument(
  documents: readonly ArxmlDocument[],
  filePaths: readonly string[],
): CombinedDocumentResult {
  // Sprint 16 — smart basename wrapper skip. When no collision exists
  // (basenames all unique AND module shortNames don't overlap across
  // docs), synthesise a flat displayDoc by concatenating the docs'
  // root packages directly. The Tree then renders the docs' own
  // module hierarchy at the top level — no '<filename> package'
  // wrapper. findByPathMultiDoc falls back to per-doc lookup for
  // unprefixed paths (see core/arxml/path.ts).
  //
  // Sprint 17c T10 — root-package dedup runs BEFORE the
  // flat/collision branch, so the result is consistent: a root
  // package with the same `<SHORT-NAME>` is deduped to 1 entry
  // (silent if content matches, kept-first + warning if not).
  // In flat mode this prevents the "two EAS" UX regression
  // (the original bug). In collision mode the wrap step
  // disambiguates the source doc via the basename prefix; the
  // dedup removes the second copy (the one that would have
  // been wrapped under `[doc:1]`), and the warning tells the
  // user why the second file's content didn't make it into the
  // tree.
  const allPackages: { readonly pkg: ArxmlPackage; readonly filePath: string }[] = [];
  for (let i = 0; i < documents.length; i += 1) {
    const filePath = filePaths[i] ?? '';
    for (const pkg of documents[i]?.packages ?? []) {
      allPackages.push({ pkg, filePath });
    }
  }
  const { dedupedPackages, warnings: dedupWarnings } = dedupRootPackages(allPackages);

  if (!detectCombinedCollision(documents, filePaths)) {
    return {
      doc: {
        path: '[Combined]',
        version: '4.6',
        packages: dedupedPackages,
      },
      warnings: dedupWarnings,
    };
  }

  // Collision path — wrap each file's packages under its basename
  // (or [doc:N] for disambiguation). Disambiguate basenames that
  // collide across files. The first file keeps its literal basename;
  // subsequent collisions fall back to `[doc:N]`. This is the inverse
  // of `findByPathMultiDoc`'s index parsing, so a round-trip
  // `select(path)` then `updateParam(path)` resolves back to the
  // same source.
  //
  // Sprint 17c T10 — the dedup pass already ran on the raw
  // packages. Iterate the deduped list and pick the packages
  // whose source file is the current iteration's. Reference
  // equality is the contract: dedup keeps the FIRST occurrence's
  // reference, and the source docs own those references.
  const basenameSeen = new Map<string, number>();
  const combinedPackages: ArxmlPackage[] = [];
  for (let i = 0; i < documents.length; i += 1) {
    const filePath = filePaths[i] ?? '';
    const base = lastSegment(filePath);
    const seen = basenameSeen.get(base) ?? 0;
    basenameSeen.set(base, seen + 1);
    const segmentName = seen === 0 ? base : `[doc:${i}]`;
    for (const pkg of dedupedPackages) {
      let isFromThisFile = false;
      for (const p of documents[i]?.packages ?? []) {
        if (p === pkg) {
          isFromThisFile = true;
          break;
        }
      }
      if (!isFromThisFile) continue;
      combinedPackages.push(wrapPackageUnderSegment(pkg, segmentName));
    }
  }
  return {
    doc: {
      path: '[Combined]',
      // Combined docs share the version of the most-recently-added
      // source — Tree doesn't render the version so this only matters
      // for `app.docVersion` in ArxmlPanel. The footer uses the last
      // loaded doc; carrying a placeholder here is acceptable.
      version: '4.6',
      packages: combinedPackages,
    },
    // Sprint 17c T10 — the dedup pass emitted `dedupWarnings` on
    // the raw packages; surface them in the result so the store's
    // `warnings` slice reflects the dedup outcome even in collision
    // mode.
    warnings: dedupWarnings,
  };
}

/**
 * Sprint 17c T10 — deduplicate root packages across the loaded
 * document set. The combined view used to render BOTH packages
 * when two docs shared a root `<SHORT-NAME>` (e.g. two `EAS`
 * roots from two BSWMD-derived ARXML files) — a "two EAS" UX
 * regression documented in `sprint-16-shipped.md`.
 *
 * Algorithm:
 *   1. Group packages by `shortName` (preserves insertion order).
 *   2. For each group with 2+ entries:
 *      - Compare pairwise against the FIRST entry using
 *        `packagesDeepEqual` (recursive: same shortName, same
 *        elements + nested packages, same param values).
 *      - If all entries equal the first → keep first only
 *        (silent dedup, no warning).
 *      - If any entry differs from the first → keep first only +
 *        emit ONE `duplicate-root-conflict` warning with the
 *        first entry's source filePath as `keptFrom`.
 *   3. For singletons, keep as-is.
 *
 * Pure: produces a new `dedupedPackages` array. The dedup
 * preserves the first occurrence's object reference; only the
 * surrounding list shape is rebuilt.
 */
function dedupRootPackages(
  entries: readonly { readonly pkg: ArxmlPackage; readonly filePath: string }[],
): {
  readonly dedupedPackages: readonly ArxmlPackage[];
  readonly warnings: readonly CombinedDocumentWarning[];
} {
  const deduped: ArxmlPackage[] = [];
  const warnings: CombinedDocumentWarning[] = [];
  // Track first-occurrence (package + filePath) keyed by shortName
  // so subsequent occurrences can be compared against the keeper.
  const firstByShortName = new Map<string, { pkg: ArxmlPackage; filePath: string }>();
  for (const entry of entries) {
    const existing = firstByShortName.get(entry.pkg.shortName);
    if (existing === undefined) {
      firstByShortName.set(entry.pkg.shortName, entry);
      deduped.push(entry.pkg);
      continue;
    }
    // Subsequent occurrence of a shortName we've already seen.
    // If the content matches the first, silent dedup; otherwise
    // emit a conflict warning (only once per shortName).
    if (packagesDeepEqual(existing.pkg, entry.pkg)) {
      // Silent dedup — keep the first (already in `deduped`),
      // drop the duplicate. No warning.
      continue;
    }
    // Content differs — emit a conflict warning. The warning
    // shape is keyed by shortName; suppress duplicates so 3+ docs
    // with the same conflict shortName produce ONE warning, not
    // N-1.
    if (
      !warnings.some(
        (w) => w.kind === 'duplicate-root-conflict' && w.shortName === entry.pkg.shortName,
      )
    ) {
      warnings.push({
        kind: 'duplicate-root-conflict',
        shortName: entry.pkg.shortName,
        keptFrom: existing.filePath,
      });
    }
  }
  return { dedupedPackages: deduped, warnings };
}

/**
 * Sprint 17c T10 — recursive deep-equality on two
 * ArxmlPackage trees. Two packages are "equal" if:
 *   - same `shortName` and `path`
 *   - same `elements` (each element compared via `elementsEqual`)
 *   - same nested `packages` (each compared via recursion)
 *
 * Element comparison: same `kind`, same `shortName`, same
 * `params` (via JSON key-by-key), same `children`, same
 * `references` (modules only), same `value` (references).
 *
 * Pure / allocation-free on the happy path. JSON.stringify on
 * the params dict is acceptable for the dedup use case (small
 * counts — typically 1-2 root packages per doc).
 */
function packagesDeepEqual(a: ArxmlPackage, b: ArxmlPackage): boolean {
  if (a.shortName !== b.shortName) return false;
  if (a.path !== b.path) return false;
  if (a.longName !== b.longName) return false;
  if (a.elements.length !== b.elements.length) return false;
  for (let i = 0; i < a.elements.length; i += 1) {
    const ea = a.elements[i];
    const eb = b.elements[i];
    if (ea === undefined || eb === undefined) return false;
    if (!elementsEqual(ea, eb)) return false;
  }
  const aNested = a.packages ?? [];
  const bNested = b.packages ?? [];
  if (aNested.length !== bNested.length) return false;
  for (let i = 0; i < aNested.length; i += 1) {
    const na = aNested[i];
    const nb = bNested[i];
    if (na === undefined || nb === undefined) return false;
    if (!packagesDeepEqual(na, nb)) return false;
  }
  return true;
}

function elementsEqual(a: ArxmlElement, b: ArxmlElement): boolean {
  if (a.kind !== b.kind) return false;
  if (a.shortName !== b.shortName) return false;
  if (a.kind === 'reference' && b.kind === 'reference') {
    if (a.value !== b.value) return false;
    if (a.dest !== b.dest) return false;
    return true;
  }
  if (
    (a.kind === 'module' || a.kind === 'container') &&
    (b.kind === 'module' || b.kind === 'container')
  ) {
    if (a.tagName !== b.tagName) return false;
    if (!paramsDeepEqual(a.params, b.params)) return false;
    if (a.children.length !== b.children.length) return false;
    for (let i = 0; i < a.children.length; i += 1) {
      const ca = a.children[i];
      const cb = b.children[i];
      if (ca === undefined || cb === undefined) return false;
      if (!elementsEqual(ca, cb)) return false;
    }
    if (a.kind === 'module' && b.kind === 'module') {
      if (a.references.length !== b.references.length) return false;
      for (let i = 0; i < a.references.length; i += 1) {
        if (a.references[i] !== b.references[i]) return false;
      }
    }
    return true;
  }
  return false;
}

function paramsDeepEqual(
  a: Readonly<Record<string, unknown>>,
  b: Readonly<Record<string, unknown>>,
): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false;
  }
  return true;
}

/**
 * Sprint 16 — collision detection for the combined Tree View.
 *
 * Returns true when the per-file basename wrapper is required to
 * disambiguate paths in the combined view. Two collision sources:
 *
 *   1. **Basename collision** — two files share the same basename
 *      (e.g. `/a/Can.arxml` and `/b/Can.arxml`). The wrapper uses
 *      `[doc:N]` for later occurrences, so prefix → source mapping
 *      is unambiguous. Without the wrapper, two source docs would
 *      both contribute identical unprefixed paths.
 *
 *   2. **Module shortName collision** — two files declare a module
 *      with the same `<SHORT-NAME>` (e.g. `Can` from two BSWMDs).
 *      Without the wrapper, both files contribute `…/Can/…` paths
 *      that can't be told apart.
 *
 * When neither collision exists the wrapper is pure noise and
 * `buildCombinedDocument` returns a flat displayDoc.
 */
function detectCombinedCollision(
  documents: readonly ArxmlDocument[],
  filePaths: readonly string[],
): boolean {
  // Module shortName collision: track which filePath owns each module.
  const moduleOwners = new Map<string, string>();
  for (let i = 0; i < documents.length; i += 1) {
    const filePath = filePaths[i] ?? '';
    for (const pkg of documents[i]?.packages ?? []) {
      for (const el of pkg.elements) {
        if (el.kind !== 'module') continue;
        const owner = moduleOwners.get(el.shortName);
        if (owner !== undefined && owner !== filePath) return true;
        moduleOwners.set(el.shortName, filePath);
      }
    }
  }
  // Basename collision.
  const basenameSeen = new Set<string>();
  for (const fp of filePaths) {
    const base = lastSegment(fp);
    if (basenameSeen.has(base)) return true;
    basenameSeen.add(base);
  }
  return false;
}

/**
 * Return a new ArxmlPackage whose `shortName` and `path` are prefixed
 * with the basename segment, with `elements` / nested `packages`
 * shallowly re-wrapped so every descendant path carries the prefix.
 * The original element/param objects are reused (immutable contract);
 * only path-bearing objects are re-created.
 */
function wrapPackageUnderSegment(pkg: ArxmlPackage, segment: string): ArxmlPackage {
  const newPath = `/${segment}${pkg.path}`;
  return {
    ...pkg,
    shortName: segment,
    path: newPath,
    packages: pkg.packages?.map((sp) => wrapNestedPackage(sp, segment)),
    elements: pkg.elements.map((el) => wrapElement(el, newPath)),
  };
}

function wrapNestedPackage(pkg: ArxmlPackage, segment: string): ArxmlPackage {
  const newPath = `/${segment}${pkg.path}`;
  return {
    ...pkg,
    path: newPath,
    packages: pkg.packages?.map((sp) => wrapNestedPackage(sp, segment)),
    elements: pkg.elements.map((el) => wrapElement(el, newPath)),
  };
}

function wrapElement(el: ArxmlElement, parentPath: string): ArxmlElement {
  const childPath = `${parentPath}/${el.shortName}`;
  if (el.kind === 'reference') return { ...el };
  return {
    ...el,
    children: el.children.map((c) => wrapElement(c, childPath)),
  };
}

/**
 * Strip the basename / `[doc:N]` prefix from a combined-mode path so
 * the inner path can be passed to `applyParamUpdate` (which expects a
 * regular path inside the source document). Mirrors
 * `findByPathMultiDoc`'s prefix-parsing logic.
 *
 * Sprint 16 — flat-mode passthrough: when the head segment doesn't
 * match the source file's basename and isn't a `[doc:N]` index, the
 * combined view is using the flat (no-wrapper) shape. Return the
 * path verbatim so `applyParamUpdate` receives the inner path it
 * expects. Returns null only when the path is too short to be a
 * valid inner path (< 2 segments).
 */
function stripCombinedPrefix(combinedPath: string, sourceFilePath: string): string | null {
  const segments = combinedPath.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const [head, ...rest] = segments;
  if (head === undefined) return null;
  // Accept either the literal basename or the [doc:N] index form.
  if (head === lastSegment(sourceFilePath) || /^\[doc:\d+\]$/.test(head)) {
    return `/${rest.join('/')}`;
  }
  // Flat mode: no wrapper in the combined view — the path is already
  // an inner path. Return verbatim.
  return combinedPath;
}

// ---------------------------------------------------------------------------
// Sprint 15 Phase 2 — BSWMD lookup helpers for the mutation actions.
// The store keeps BSWMD schemas in `bswmdSchemas: readonly BswmdDocument[]`;
// the actions need to (1) find the BswModuleDef matching a value-side
// path's module shortName and (2) resolve the parent ContainerDef
// (and the child ContainerDef the picker selected, or the ParamDef the
// picker selected for addParameter).
// ---------------------------------------------------------------------------

/**
 * Sprint 15 HIGH-2 — find the BswModuleDef whose shortName appears in
 * the value-side document path. Returns `null` when no BSWMD is loaded
 * or the path is unparseable. Used by `deleteContainer` to pass the
 * BSWMD context to `coreRemoveContainer` so the multiplicity-floor
 * check can run.
 */
function findModuleDefForPath(
  schemas: readonly BswmdDocument[],
  docPath: string,
): BswModuleDef | null {
  const segments = docPath.split('/').filter(Boolean);
  if (segments.length < 1) return null;
  // The module shortName is the last path segment of a value-side path
  // shaped like `/<AR-PACKAGE>/<MODULE>`. Walk the segments from the
  // back and return the first BSWMD match.
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const candidate = segments[i];
    if (candidate === undefined) continue;
    for (const schema of schemas) {
      for (const mod of schema.modules) {
        if (mod.shortName === candidate) return mod;
      }
    }
  }
  return null;
}

/**
 * Walk all loaded BSWMD schemas and find the module whose shortName
 * matches the second segment of `valuePath`, then resolve the parent
 * container def at the given subPath (everything after the module).
 *
 * The action uses this to look up both `addContainer`'s parent +
 * child container defs. The function returns the module + parent
 * container def (NOT the child) — the action then locates the
 * child via `findChildContainerDef`. This split mirrors the spec
 * (`getContainerDefByPath` + child lookup) and keeps the helper
 * surface narrow.
 */
function resolveModuleAndParentContainer(
  schemas: readonly BswmdDocument[],
  valuePath: string,
): { readonly moduleDef: BswModuleDef; readonly parentContainerDef: ContainerDef | null } | null {
  const segments = valuePath.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const moduleShortName = segments[1];
  if (moduleShortName === undefined) return null;
  for (const schema of schemas) {
    for (const mod of schema.modules) {
      if (mod.shortName !== moduleShortName) continue;
      // subPath: the segments after the module shortName.
      const subSegments = segments.slice(2);
      const subPath = subSegments.join('/');
      const parentContainerDef = subPath === '' ? null : resolveContainerDefBySubPath(mod, subPath);
      return { moduleDef: mod, parentContainerDef };
    }
  }
  return null;
}

/**
 * Variant of `resolveModuleForPath` for the addParameter case. Returns
 * the module def + the matching ParamDef. The value path is the
 * container path; the parameter shortName is supplied separately.
 *
 * The lookup succeeds as long as the BSWMD has a matching module +
 * parent container. When the param shortName isn't declared on the
 * parent container, `paramDef` is null and the caller surfaces a
 * `no-bswmd-for-module` error (BSWMD lookup is the store's job;
 * the cross-check inside the core is defence-in-depth, not the
 * primary error path — the spec says BSWMD is the source of truth).
 */
function resolveParamDefForPath(
  schemas: readonly BswmdDocument[],
  containerPath: string,
  paramShortName: string,
): { readonly moduleDef: BswModuleDef; readonly paramDef: ParamDef | null } | null {
  const segments = containerPath.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const moduleShortName = segments[1];
  if (moduleShortName === undefined) return null;
  for (const schema of schemas) {
    for (const mod of schema.modules) {
      if (mod.shortName !== moduleShortName) continue;
      // subPath: the segments after the module.
      const subSegments = segments.slice(2);
      const subPath = subSegments.join('/');
      const parentDef = subPath === '' ? null : resolveContainerDefBySubPath(mod, subPath);
      if (subPath !== '' && parentDef === null) continue;
      // Module-level parents (subPath === '') have no parameters per
      // current AUTOSAR practice, so the param shortName cannot
      // resolve. Return the module def with a null paramDef so the
      // caller surfaces the proper error.
      if (parentDef === null) return { moduleDef: mod, paramDef: null };
      const paramDef = parentDef.parameters.find((p) => p.shortName === paramShortName);
      return { moduleDef: mod, paramDef: paramDef ?? null };
    }
  }
  return null;
}

/**
 * Sprint 15 — variant of `resolveParamDefForPath` for the addReference
 * case. Looks up the BSWMD `ReferenceDef` for the given container
 * path + ref shortName. Mirrors the same null-handling contract:
 * `moduleDef` is set when the module is found, `refDef` is null when the
 * parent container exists but doesn't declare this ref.
 */
function resolveReferenceDefForPath(
  schemas: readonly BswmdDocument[],
  containerPath: string,
  refShortName: string,
): { readonly moduleDef: BswModuleDef; readonly refDef: ReferenceDef | null } | null {
  const segments = containerPath.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const moduleShortName = segments[1];
  if (moduleShortName === undefined) return null;
  for (const schema of schemas) {
    for (const mod of schema.modules) {
      if (mod.shortName !== moduleShortName) continue;
      const subSegments = segments.slice(2);
      const subPath = subSegments.join('/');
      const parentDef = subPath === '' ? null : resolveContainerDefBySubPath(mod, subPath);
      if (subPath !== '' && parentDef === null) continue;
      if (parentDef === null) return { moduleDef: mod, refDef: null };
      const refDef = parentDef.references.find((r) => r.shortName === refShortName);
      return { moduleDef: mod, refDef: refDef ?? null };
    }
  }
  return null;
}

/**
 * Walk the BswModuleDef's top-level containers, sub-containers, and
 * choice branches to find the ContainerDef matching the given
 * sub-path. Mirrors the shape of `getContainerDefByPath` from
 * core/project/bswmd.ts but is inlined here to avoid widening the
 * store's import surface with a one-off helper.
 */
function resolveContainerDefBySubPath(mod: BswModuleDef, subPath: string): ContainerDef | null {
  const segments = subPath.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  const [head, ...tail] = segments;
  if (head === undefined) return null;
  const first = mod.containers.find((c) => c.shortName === head);
  if (first === undefined) return null;
  if (tail.length === 0) return first;
  return findContainerInTreeByPathLocal(first, tail);
}

function findContainerInTreeByPathLocal(
  parent: ContainerDef,
  segments: readonly string[],
): ContainerDef | null {
  if (segments.length === 0) return parent;
  const [head, ...tail] = segments;
  if (head === undefined) return null;
  const candidates = [...parent.subContainers, ...parent.choices];
  const found = candidates.find((c) => c.shortName === head);
  if (found === undefined) return null;
  if (tail.length === 0) return found;
  return findContainerInTreeByPathLocal(found, tail);
}

/**
 * Find a sub-container def by shortName under a parent. When
 * `parentDef` is null the search starts at the module's top-level
 * containers. Returns the first match.
 */
function findChildContainerDef(
  mod: BswModuleDef,
  parentDef: ContainerDef | null,
  shortName: string,
): ContainerDef | null {
  if (parentDef === null) {
    return mod.containers.find((c) => c.shortName === shortName) ?? null;
  }
  const all = [...parentDef.subContainers, ...parentDef.choices];
  return all.find((c) => c.shortName === shortName) ?? null;
}

/**
 * Translate a `MutationError` into a localized message via the i18n
 * bundle. The 6 kinds map 1:1 onto the `mutation.error.<kind>` keys
 * (see `i18n.ts` § Sprint 15). The function is pure and synchronous
 * — callers always feed it the current `locale` from the store
 * state so the message reflects the user's chosen language.
 */
function mutationErrorToI18n(locale: Locale, error: MutationError): string {
  switch (error.kind) {
    case 'path-not-found':
      return t(locale, 'mutation.error.path-not-found');
    case 'name-conflict':
      return t(locale, 'mutation.error.name-conflict', { shortName: error.shortName });
    case 'multiplicity-exceeded':
      return t(locale, 'mutation.error.multiplicity-exceeded', {
        current: error.current,
        max: error.upper,
      });
    case 'multiplicity-floor':
      return t(locale, 'mutation.error.multiplicity-floor', {
        current: error.current,
        min: error.lower,
      });
    case 'no-bswmd-for-module':
      return t(locale, 'mutation.error.no-bswmd-for-module');
    case 'invalid-param-type':
      return t(locale, 'mutation.error.invalid-param-type', { key: error.key });
  }
}

/**
 * Localised error-set helper used by the addContainer / addParameter
 * / deleteContainer actions. Centralised here so the action bodies
 * stay focused on the path-resolution / core-call flow.
 */
function setErrorWithKind(
  set: (partial: Partial<ArxmlState>) => void,
  locale: Locale,
  error: MutationError,
): void {
  set({ error: mutationErrorToI18n(locale, error) });
}

/**
 * Apply a successful mutation result to a SOURCE document in combined
 * mode. The source may or may not be the active document; the
 * `displayDoc` is rebuilt accordingly and the source path is marked
 * dirty. This is the combined-mode equivalent of
 * `applyMutationResultToActive` and shares the same reference-
 * equality short-circuit semantics.
 */
function applyMutationResultToSource(
  set: (partial: Partial<ArxmlState>) => void,
  state: ArxmlState,
  sourceIdx: number,
  nextSourceDoc: ArxmlDocument,
  sourceFilePath: string,
): void {
  if (state.documents[sourceIdx] === nextSourceDoc) return;
  const nextDocuments = state.documents.map((d, i) => (i === sourceIdx ? nextSourceDoc : d));
  const nextActiveDoc = state.activeDocumentPath === sourceFilePath ? nextSourceDoc : state.doc;
  const nextDisplayResult = computeDisplayDoc(
    state.viewMode,
    nextActiveDoc,
    nextDocuments,
    state.documentPaths,
  );
  if (nextDisplayResult === null) return;
  set({
    documents: nextDocuments,
    doc: nextActiveDoc,
    displayDoc: nextDisplayResult?.doc ?? null,
    dirtyPaths: addToDirty(state.dirtyPaths, sourceFilePath),
    validationErrors: validateProjectForRenderer(nextDocuments),
    lastValidatedAt: Date.now(),
    // Sprint 17c T10 — refresh warnings in combined mode.
    warnings:
      state.viewMode === 'combined' && nextDisplayResult !== null
        ? nextDisplayResult.warnings
        : state.warnings,
  });
}

/**
 * Apply a successful mutation result to the ACTIVE document in
 * single mode. Mirrors the post-mutation block of `updateParam`:
 * update the documents array, derive the back-compat `doc` alias,
 * recompute `displayDoc`, mark the active path dirty, and re-run
 * validation.
 */
function applyMutationResultToActive(
  set: (partial: Partial<ArxmlState>) => void,
  state: ArxmlState,
  activeIdx: number,
  nextActiveDoc: ArxmlDocument,
  activeFilePath: string,
): void {
  if (state.documents[activeIdx] === nextActiveDoc) return;
  const nextDocuments = state.documents.map((d, i) => (i === activeIdx ? nextActiveDoc : d));
  const nextDisplayResult = computeDisplayDoc(
    state.viewMode,
    nextActiveDoc,
    nextDocuments,
    state.documentPaths,
  );
  if (nextDisplayResult === null) return;
  set({
    documents: nextDocuments,
    doc: nextActiveDoc,
    displayDoc: nextDisplayResult?.doc ?? null,
    dirtyPaths: addToDirty(state.dirtyPaths, activeFilePath),
    validationErrors: validateProjectForRenderer(nextDocuments),
    lastValidatedAt: Date.now(),
    // Sprint 17c T10 — refresh warnings in combined mode.
    warnings:
      state.viewMode === 'combined' && nextDisplayResult !== null
        ? nextDisplayResult.warnings
        : state.warnings,
  });
}
