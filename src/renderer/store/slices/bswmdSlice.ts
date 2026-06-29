// src/renderer/store/slices/bswmdSlice.ts
// BSWMD schema state slice + all BSWMD mutators (addBswmd,
// removeBswmd, removeBswmdFromDisk, undoLastRemoveBswmd,
// setBswmdModuleEnabled, findDependentsOfBswmd, addDocumentWithSource)
// + the `bswmdModulePaths` memoized selector.
// Extracted from useArxmlStore.ts in PR(5). Pure refactor — bodies
// copied verbatim, only the imports changed.

import type { StateCreator } from 'zustand';

import type { ArxmlDocument } from '@core/arxml/types';
import { parseBswmd } from '@core/project/bswmd.js';
import type { BswmdDocument } from '@core/project/bswmd.js';
import { t } from '@shared/i18n';
import { dirname as sharedDirname, toManifestRelative } from '@shared/path';

import {
  projectSyncAddBswmdPath,
  projectSyncRemoveBswmdPath,
  projectSyncSetEcucSource,
  revalidateWithBswmd,
} from '../helpers/projectSync.js';
import type { ArxmlState, BswmdRemoveSnapshot } from '../useArxmlStore.js';

// Sprint 17d — module-root path cache. Lets the `bswmdModulePaths`
// selector on the store return a stable `readonly string[]` reference
// for a given `bswmdSchemas` reference, so renderer consumers (e.g.
// `EnumEditor`) can subscribe via the standard Zustand selector
// without spurious re-renders on unrelated state changes. Recomputes
// only when `bswmdSchemas` itself is replaced.
let _bswmdSchemasCacheRef: readonly BswmdDocument[] | undefined;
let _bswmdModulePathsCache: readonly string[] = [];

export interface BswmdSlice {
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

  // Sprint 17d — derived view of every BSWMD module's absolute path.
  // The renderer-side schema lookups (`EnumEditor`'s enum-literal
  // resolution; the validator's `lookupSchemaAcrossModuleRoots` /
  // `lookupContainerSchemaAcrossModuleRoots` vendor-CDD fallback) use
  // this list as the candidate pool when the value-side query path
  // and the BSWMD-side module root don't share a package prefix
  // (e.g. ECUC values under `/JWQ3399/...` and BSWMD module under
  // `/JWQ_CDD_PACK/JWQ_Packet/JWQ3399`).
  //
  // Exposed as a function on the state (matching the `isDirty()`
  // pattern) and memoized by `bswmdSchemas` reference so callers can
  // subscribe via `useArxmlStore((s) => s.bswmdModulePaths())`
  // without re-rendering on unrelated state changes — the cached
  // array reference only flips when the underlying schema set
  // actually changes (typically on `addBswmd` / `removeBswmd` /
  // project open).
  readonly bswmdModulePaths: () => readonly string[];

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
   * Sprint 17 P1 — `removeBswmdFromDisk`. Unlinks the BSWMD file
   * from disk via the `bswmd:delete` IPC channel and then drops
   * the matching entry from `bswmdSchemas` / `bswmdPaths` (same
   * `projectSyncRemoveBswmdPath` path as `removeBswmd`). On
   * success, the removed `BswmdDocument` is captured into
   * `lastRemoveSnapshot` so a subsequent `undoLastRemoveBswmd`
   * can put it back. The IPC contract is the same
   * ok / not-found / write-failed union as
   * `project:deleteArxml`; the renderer treats `ok` AND
   * `not-found` as success (the cascade flow must be idempotent
   * against a user-deleted file).
   *
   * Return shape mirrors the hook layer's
   * `ProjectActionResult` so the UI can dispatch on `kind`
   * directly. `kind: 'canceled'` is returned when the path is
   * not in `bswmdPaths` (a stale id from the renderer).
   */
  removeBswmdFromDisk: (
    path: string,
  ) => Promise<
    | { readonly kind: 'ok' }
    | { readonly kind: 'canceled' }
    | { readonly kind: 'write-failed'; readonly message: string }
  >;

  /**
   * Sprint 17 P1 — `undoLastRemoveBswmd`. Restores the most
   * recently removed BSWMD via `lastRemoveSnapshot`. Re-inserts
   * the captured `BswmdDocument` at the end of `bswmdSchemas`,
   * the matching path into `bswmdPaths`, and the relative path
   * back into `project.bswmdPaths` (when a project is open).
   * The snapshot is cleared so a second `undoLastRemoveBswmd`
   * is a no-op (one level of undo, matching
   * `undoLastCommit`). The on-disk file is NOT restored — the
   * BSWMD file is gone; the in-memory schema reappears so the
   * user can keep editing with stale-but-visible schema
   * knowledge until they re-add the file via the dialog.
   */
  undoLastRemoveBswmd: () => void;

  /**
   * Sprint 17 P1 — most recent successful `removeBswmdFromDisk`
   * snapshot. Cleared by `undoLastRemoveBswmd` and by any
   * subsequent `removeBswmdFromDisk` (single-level undo, same
   * constraint as `lastCommitSnapshot`).
   */
  readonly lastRemoveSnapshot: BswmdRemoveSnapshot | null;

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
}

export const createBswmdSlice: StateCreator<ArxmlState, [], [], BswmdSlice> = (set, get) => ({
  // Sprint 12 #2 — BSWMD schema state. Empty by default; populated by
  // addBswmd (file read via IPC) and consumed by revalidateWithBswmd
  // for the project-level validation pass.
  bswmdSchemas: [],
  bswmdPaths: [],
  // Sprint 17d — derived module-root list. Memoized by bswmdSchemas
  // reference via the module-level cache declared above; returns a
  // stable array reference until the schema set itself changes.
  bswmdModulePaths: () => {
    const schemas = get().bswmdSchemas;
    if (schemas !== _bswmdSchemasCacheRef) {
      _bswmdSchemasCacheRef = schemas;
      _bswmdModulePathsCache = schemas.flatMap((doc) => doc.modules.map((m) => m.path));
    }
    return _bswmdModulePathsCache;
  },
  // Sprint 17 P1 — no BSWMD remove in flight at startup.
  lastRemoveSnapshot: null,

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

  // Sprint 17 P1 — `removeBswmdFromDisk`. IPC + in-memory +
  // undo-snapshot in one transaction. The on-disk unlink is the
  // only "risky" step; if it fails with `write-failed` we leave
  // the in-memory state untouched and surface a typed error
  // toast. `ok` and `not-found` are both treated as success
  // (the cascade flow must be idempotent against a user-deleted
  // BSWMD file), and both push a snapshot for undo.
  removeBswmdFromDisk: async (path) => {
    const state = get();
    const idx = state.bswmdPaths.indexOf(path);
    // No-op on unknown path — a stale id from the renderer
    // shouldn't pop the dialog. Mirrors `removeBswmd`'s guard.
    if (idx === -1) return { kind: 'canceled' as const };

    // Capture the schema BEFORE the IPC so undo can re-insert the
    // exact reference (no re-parse needed; the file is going away).
    const schema = state.bswmdSchemas[idx]!;

    // The IPC call. We catch + re-shape into the same
    // ok / write-failed / not-found envelope the handler returns,
    // so the renderer can switch on `kind` uniformly regardless of
    // whether the failure was a thrown exception (defensive) or a
    // returned `write-failed` (normal).
    let ipcResult:
      | { kind: 'ok' }
      | { kind: 'not-found' }
      | { kind: 'write-failed'; message: string }
      | { kind: 'invalid-path'; message: string };
    try {
      ipcResult = await window.autosarApi.deleteBswmd({ filePath: path });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({
        error: t(state.locale, 'app.error.removeBswmdFromDisk', { message }),
      });
      return { kind: 'write-failed' as const, message };
    }

    if (ipcResult.kind === 'write-failed') {
      set({
        error: t(state.locale, 'app.error.removeBswmdFromDisk', {
          message: ipcResult.message,
        }),
      });
      return { kind: 'write-failed' as const, message: ipcResult.message };
    }

    // ok OR not-found — drop the in-memory state and push a
    // snapshot. The schema is restored on undo WITHOUT touching
    // disk (the file is gone, the on-disk side is a separate
    // concern handled by the 4th dialog option "delete BSWMD
    // from disk").
    const nextSchemas = state.bswmdSchemas.filter((_, i) => i !== idx);
    const nextPaths = state.bswmdPaths.filter((p) => p !== path);
    const nextProject = projectSyncRemoveBswmdPath(
      state.project,
      path,
      state.projectPath !== null ? sharedDirname(state.projectPath) : null,
    );
    set({
      bswmdSchemas: nextSchemas,
      bswmdPaths: nextPaths,
      project: nextProject,
      lastRemoveSnapshot: { path, schema, timestamp: Date.now() },
      // Successful remove clears a stale prior error so a user who
      // just retried after a write-failed attempt doesn't see the
      // old banner linger.
      error: null,
      toast: null,
      ...revalidateWithBswmd(state.documents, nextSchemas),
    });
    return { kind: 'ok' as const };
  },

  // Sprint 17 P1 — `undoLastRemoveBswmd`. Mirrors the
  // `undoLastCommit` shape: pop the snapshot, restore the
  // captured schema, re-validate, clear the snapshot. The on-disk
  // file is NOT restored — the BSWMD file is gone; the in-memory
  // schema reappears so the user can keep editing with
  // stale-but-visible schema knowledge until they re-add the file
  // via the dialog. (A future enhancement could write the
  // captured schema back to disk via `writeArxmlBatch`-style
  // IPC, but v1 is in-memory only — the same constraint as
  // `undoLastCommit`.)
  undoLastRemoveBswmd: () => {
    const state = get();
    const snapshot = state.lastRemoveSnapshot;
    if (snapshot === null) return;

    // `addBswmd` has a duplicate-path guard; undo is the inverse
    // — the path was just dropped so the slot is free. We mirror
    // the parallel-array append + project-sync-add path from
    // `addBswmd`'s commit phase, but skip the parse step (we
    // already have the parsed `BswmdDocument`).
    const nextSchemas = [...state.bswmdSchemas, snapshot.schema];
    const nextPaths = [...state.bswmdPaths, snapshot.path];
    const nextProject = projectSyncAddBswmdPath(
      state.project,
      snapshot.path,
      state.projectPath !== null ? sharedDirname(state.projectPath) : null,
    );
    set({
      bswmdSchemas: nextSchemas,
      bswmdPaths: nextPaths,
      project: nextProject,
      lastRemoveSnapshot: null,
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
  //
  // Bug 3 — also record provenance in `project.ecucSources` so the
  // chip-count round-trips through save / reopen. `addDocument` adds
  // the new path to `valueArxmlPaths` via `projectSyncAddPath`; we
  // capture that just-written relative form here to set the source.
  // Without this, the manifest persists the new ECUC doc but loses
  // its source BSWMD link, so the ProjectPanel chip reads 0/N after
  // every restart even though the user just created N ECUC docs.
  addDocumentWithSource: (doc, sourceBswmdPath) => {
    const docWithSource: ArxmlDocument = { ...doc, sourceBswmdPath };
    get().addDocument(docWithSource, doc.path);
    // After addDocument, `project.valueArxmlPaths` includes the new
    // doc's relative path. Find it by matching the just-written
    // absolute `doc.path` (projectSyncAddPath relativises it) and
    // record the (ecucRel → bswmdRel) provenance.
    const state = get();
    if (state.project !== null && state.projectPath !== null) {
      const manifestDir = sharedDirname(state.projectPath);
      const ecucRel = toManifestRelative(manifestDir, doc.path) ?? doc.path;
      const bswmdRel = toManifestRelative(manifestDir, sourceBswmdPath) ?? sourceBswmdPath;
      const nextProject = projectSyncSetEcucSource(state.project, ecucRel, bswmdRel);
      if (nextProject !== state.project) {
        set({ project: nextProject });
      }
    }
  },
});
