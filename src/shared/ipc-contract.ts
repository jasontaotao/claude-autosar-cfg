// IPC channel name constants. Shared across main, preload, renderer.
export const IPC_CHANNELS = {
  // v1.53.0 PATCH T3 -- `@deprecated` since 2026-07-12 IPC
  // connectivity audit. No renderer caller exists in `src/renderer/`.
  // Health-check channel was added in early scaffolding; headless
  // CLI may still rely on it via a non-Electron harness, but the
  // renderer-side API surface is dead. Kept to avoid breaking
  // external headless scripts. Removal candidate for v1.55.0 unless
  // a use case emerges before then.
  PING: 'app:ping',
  GET_APP_VERSION: 'app:get-version',
  // v1.51.0 PATCH T2 -- Round-10 F-2 closure: hoist the literal
  // 'feature-flags:get' (was referenced as a string at register.ts:519
  // and preload/index.ts:305) into the canonical IPC_CHANNELS map.
  // Round-9 audit F-4 noted the lone exception; this aligns it with
  // every other 36 channels in the contract.
  FEATURE_FLAGS_GET: 'feature-flags:get',
  OPEN_ARXML: 'arxml:open',
  OPEN_ARXML_MULTI: 'arxml:open-multi',
  PARSE_ARXML: 'arxml:parse',
  SAVE_ARXML: 'arxml:save',
  // Sprint 11 Phase 1 — project manifest IO
  PROJECT_NEW: 'project:new',
  PROJECT_OPEN: 'project:open',
  PROJECT_SAVE: 'project:save',
  // v1.18.2 PATCH — `PROJECT_CLOSE` channel. Symmetric counterpart to
  // `PROJECT_OPEN` (line above). Used by the renderer to reset the
  // open-project manifest path state (e.g. before opening a different
  // project, or to clear the in-memory state on window reload). No `:v1`
  // suffix: this is a state-mutation channel, not a wire-versioned surface
  // (mirrors `SCRIPT_LIST` / `SCRIPT_RUN` convention).
  PROJECT_CLOSE: 'project:close',
  // Sprint 12 #1 — BSWMD schema-side parser
  BSWMD_PARSE: 'bswmd:parse',
  // Sprint 12 #2 — BSWMD file reader (renderer-driven "Load BSWMD")
  BSWMD_READ: 'bswmd:read',
  // Sprint 12 #2 — BSWMD open-dialog. Renderer asks main to show a
  // single-file picker filtered to .arxml/.xml and returns the chosen
  // absolute path (or `canceled`). Used by
  // `useProjectActions.addBswmdFromDialog` before it calls `BSWMD_READ`.
  BSWMD_OPEN: 'bswmd:open',
  // Sprint 12 #3 — directory picker for the New Project flow. Returns
  // either the chosen absolute directory path or `canceled`. Replaces
  // the OS-native `showSaveDialog` path of `PROJECT_NEW` (Phase 1
  // Task 4) so the renderer can pre-fill `<directory>/<name>.autosarcfg.json`
  // before calling `PROJECT_NEW`.
  PICK_DIR: 'project:pickDir',
  // Sprint 13 #1 — built-in template discovery. Renderer calls this
  // to get the list of templates (id + i18n key + fileCount) without
  // leaking absolute paths from the main process. The renderer is
  // expected to translate `displayNameKey` / `descriptionKey` via
  // `t(locale, key)`. Empty `templates` array is a valid response
  // (the samples root may be missing in dev / portable builds).
  //
  // v1.54.1 PATCH T1 (F-A1-02 closure) — `@deprecated` marker
  // removed. Round-12 fresh review caught a Round-11 audit
  // false-negative: NewProjectDialog.tsx:191 actively calls
  // `api.listTemplates()` via a local `api` alias (line 178:
  // `const api = (globalThis as ...).window?.autosarApi`). The
  // Round-11 grep was scoped to `autosarApi.listTemplates` and
  // missed the shadowed call. Test mocks hide the regression
  // because they mock `listTemplates` locally. Channel is alive
  // and must remain registered.
  TEMPLATES_LIST: 'templates:list',
  // Sprint 13 #1 — copy a template's files into a chosen directory.
  // Returns the relative paths of copied value-side and schema-side
  // files. Renderer does not call this in Sprint 13 #1; it is exposed
  // here so the IPC contract is complete and the handler is testable.
  //
  // v1.53.0 PATCH T3 — `@deprecated` since 2026-07-12 IPC
  // connectivity audit (same rationale as `TEMPLATES_LIST` above).
  TEMPLATES_COPY: 'templates:copy',
  // Sprint 14 — BSWMD-to-ECUC skeleton creation.
  //
  // Batch-write a list of ARXML files into the project directory. The
  // renderer computes the destination paths and serializes the ECUC
  // skeleton content (one or more `<ECUC-MODULE-CONFIGURATION-VALUES>`
  // documents, one per picked BSWMD module); main writes them with
  // `mkdir -p` so intermediate directories are created on demand.
  //
  // Return shape is a discriminated union so the renderer can
  // distinguish "all written" from "some written, some failed" from
  // "none written" — important because T7/T8 (store + hook) need to
  // surface the partial-failure case to the user instead of silently
  // dropping the failed files.
  PROJECT_WRITE_ARXML_BATCH: 'project:writeArxmlBatch',
  // Sprint 14 — BSWMD-to-ECUC skeleton creation.
  //
  // Delete a single ARXML file. Used by the cascade-delete flow when
  // removing a BSWMD also requires removing the value-side ARXML(s)
  // generated from it (T12). Returns a discriminated union so the
  // renderer can distinguish "deleted" from "already gone" from
  // "permission error".
  PROJECT_DELETE_ARXML: 'project:deleteArxml',
  // Sprint 17 P1 — `bswmd:delete` IPC. Unlink a single BSWMD file
  // from disk. Used by the `removeBswmdFromDisk` store action when
  // the user picks the 4th option "delete BSWMD from disk" in the
  // RemoveModuleConfirmDialog (P2). Returns the same
  // ok / not-found / write-failed shape as `project:deleteArxml`
  // (ENOTDIR / EACCES / EPERM all fall through to write-failed).
  BSWMD_DELETE: 'bswmd:delete',
  // Sprint 14 #1 — embedded script engine IPC.
  //
  // Four invoke channels + one main→renderer push channel. The script
  // engine stores user scripts inside `manifest.scripts[]` (Phase A
  // T1) and runs them in a `node:vm` sandbox (Phase A T5). Phase B
  // wires the core (types / errors / import-resolver / ctx /
  // transaction / vm-runner) to the outside world via these 5
  // channels:
  //
  // - `script:list`     (R→M)  list summaries for the script library UI
  // - `script:save`     (R→M)  create or update a script entry
  // - `script:delete`   (R→M)  remove a script entry
  // - `script:run`      (R→M)  execute a script in the sandbox; sync
  // - `script:progress` (M→R)  push live log events during a run; the
  //                            renderer accumulates these before the
  //                            final ScriptRunResult arrives
  SCRIPT_LIST: 'script:list',
  SCRIPT_SAVE: 'script:save',
  SCRIPT_DELETE: 'script:delete',
  SCRIPT_RUN: 'script:run',
  SCRIPT_PROGRESS: 'script:progress',
  // v1.6.0 Cluster G — SWS Validator (G spec §4.5).
  // Channels use `:v1` suffix per A+C spec §6 IPC versioning policy
  // (channels frozen at v1.6.0 tag; v1.7.0 introduces `:v2` for breaking changes).
  // Renderer ↔ Main for ValidationPanel + IPC handler. CLI integration
  // is direct (no IPC) per A+C spec NEW-Q-B; these channels exist
  // purely for the GUI ↔ main boundary.
  // v1.15.5: stub registered (see src/main/ipc/headless-stubs.ts).
  // Renderer has no consumer per joint review 2026-06-29.
  SWS_VALIDATE: 'sws-validator:run:v1',
  // v1.15.5: stub registered. No renderer consumer.
  SWS_VALIDATE_CANCEL: 'sws-validator:cancel:v1',
  // v1.6.0 A+C — Headless Config Engine IPC contract (PR(A+C-2)).
  //
  // Path split (by design, clarified Round 3 2026-06-21):
  //   - Wire types (ValidatorResult / HeadlessCommand / HeadlessResult /
  //     HeadlessError / PatchDocument) live in
  //     `src/shared/headless/ipc-contract.ts` (single source of truth for
  //     G / W / U consumers).
  //   - Channel name constants live here, alongside the existing 32 +
  //     2 G channels. Both files are co-owned by A+C.
  //
  // Three new channels (per A+C spec §6 "IPC Contract Reference"):
  //   - HEADLESS_RUN_COMMAND       (R→M invoke; carries HeadlessCommand)
  //   - HEADLESS_MUTATE_APPLIED    (M→R push;   notify GUI to refresh tree)
  //   - HEADLESS_VALIDATE_RESULT   (M→R push;   Cluster G will subscribe)
  //
  // All three use the `:v1` suffix per v1.5.0 convention. They MUST NOT
  // be modified after v1.6.0 tag — breaking changes introduce `:v2`
  // channels (parallel existence; renderer chooses).
  //
  // The CLI binary itself does NOT use IPC in v1.6.0 (it is a
  // standalone Node process). These channels are reserved for the future
  // GUI bridge (v1.7.0+ Cluster U "Run CLI" affordance).
  // v1.15.5: stub registered. No renderer consumer (CLI bridge planned v1.7.0).
  HEADLESS_RUN_COMMAND: 'headless:run-command:v1',
  // v1.15.5: push channel, no listener registered (would cause console noise).
  HEADLESS_MUTATE_APPLIED: 'headless:mutate-applied:v1',
  // v1.15.5: push channel, no listener registered.
  HEADLESS_VALIDATE_RESULT: 'headless:validate-result:v1',
  // v1.8.0 K — Stencil Wizard IPC channel. Generates a minimal valid
  // ECUC module skeleton (.arxml) for one of 4 families (Com, ComM,
  // PduR, EcuC). Channel name follows the v1.6.0 A+C §6 versioning
  // policy (`:v1` suffix; breaking changes introduce `:v2`). Gated by
  // `experimental.stencilWizard` feature flag (default OFF).
  STENCIL_GENERATE_V1: 'stencil:generate:v1',
  // v1.8.0 K — Stencil Wizard save channel (Task 12 polish). Takes a
  // pre-serialized XML string + suggested filename from the renderer,
  // pops the native OS save dialog, and writes the file. Lives in a
  // separate channel from `STENCIL_GENERATE_V1` so the generate path
  // stays pure (returns XML only) and the save path can be re-used by
  // any future feature that needs "write this string to a user-chosen
  // path". Same `:v1` versioning policy.
  STENCIL_SAVE_V1: 'stencil:save:v1',
  // v1.21.0 Bug #5 — DBC file picker. Renderer asks main to show a
  // single-file picker filtered to .dbc and returns the chosen file's
  // path + content (or `canceled`). Mirrors the `OPEN_ARXML` channel
  // shape. The IPC envelope is intentionally narrow — a future
  // "load by path without dialog" use case can introduce a separate
  // channel rather than overloading this one.
  DBC_OPEN: 'dbc:open',
  // v1.21.0 Bug #5 — DBC parse. Renderer feeds the file content
  // already read into memory; main parses via `@dbc-forge/core` and
  // returns a renderer-friendly summary (see `DbcSummary` in
  // `src/shared/types.ts`). No `:v1` suffix because Bug #5 is the
  // first cut; a breaking change here would land before v1.22 anyway.
  DBC_PARSE: 'dbc:parse',
  // v1.22.0 T1 — ODX file picker. Renderer asks main to show a
  // single-file picker filtered to .odx / .pdx and returns the chosen
  // file's path + content (or `canceled`). Mirrors the `dbc:open`
  // channel shape — see `openDbcHandler.ts` for the pattern.
  ODX_OPEN: 'odx:open',
  // v1.22.0 T1 — ODX parse. Renderer feeds the file content already
  // read into memory; main parses the ODX-D XML via
  // `fast-xml-parser` (mirrors `parseArxmlHandler`) and projects a
  // renderer-friendly summary (see `OdxSummary` in
  // `src/shared/types.ts`).
  ODX_PARSE: 'odx:parse',
  // v1.23.0 T3 — DBC→Com-Stack bridge. Orchestrates the full pipeline:
  // re-parse DBC (T1) → pure mapper (T2) → parse each of 3 ECUC
  // ARXMLs → apply patches → write all 3 files via the existing
  // `project:writeArxmlBatch` channel. Renderer supplies the DBC
  // content (already read from disk by `dbc:open`); main reads the
  // 3 ECUC value-side files from the manifest directory. Channel
  // name follows the unsuffixed v1.22.0 ODX/DBC convention (no `:v1`
  // suffix because this is v1.23.0's first cut of the bridge surface;
  // a breaking change would land before v1.24 anyway).
  DBC_IMPORT_COM_STACK: 'dbc:importComStack',
  // v1.24.0 T2 — ODX→Diagnostic Extract bridge. Orchestrates the
  // full pipeline: re-parse .odx-d via v1.22.0's `odx:parse` channel
  // → call the pure T1 mapper (`odxToDiagnosticExtract`) → write 2
  // ARXML files (Dem_Extract.arxml + Dcm_Extract.arxml) atomically.
  // Channel name follows the unsuffixed v1.22.0 ODX / v1.23.0 DBC
  // convention (no `:v1` suffix because this is v1.24.0's first cut
  // of the bridge surface; a breaking change would land before v1.25
  // anyway).
  ODX_IMPORT_DIAGNOSTIC_EXTRACT: 'odx:importDiagnosticExtract',
  // v1.23.0 PATCH (HIGH-1) — project:reload. Non-dialog counterpart
  // to PROJECT_OPEN: takes an already-known absolute manifest path and
  // re-reads the manifest + every referenced ARXML/BSWMD. Used by the
  // T4 DBC→Com-Stack apply handler so the user sees fresh ECUC values
  // immediately after the bridge writes 3 files — without popping the
  // OS file picker that PROJECT_OPEN requires.
  PROJECT_RELOAD: 'project:reload',
  // v1.25.0 T5 — Excel→Com-Stack ECUC batch import. 3-IPC surface:
  //   - xlsx:writeBatchTemplate — emit a BSWMD-derived starter .xlsx
  //                                (renderer saves via a Blob anchor)
  //   - xlsx:parseBatch         — parse the user's filled-in .xlsx
  //                                and report per-row collisions
  //   - xlsx:commitBatch        — apply patches + atomic 3-file write
  //                                with per-row overwrite/skip control
  // Renderer wires these into the XlsxBatchWizard modal (T5). No
  // `:v1` suffix — this is v1.25.0's first cut; a breaking change
  // would land before v1.26 anyway (mirrors the v1.23.0 / v1.24.0
  // DBC/ODX bridge convention).
  XLSX_WRITE_BATCH_TEMPLATE: 'xlsx:writeBatchTemplate',
  XLSX_PARSE_BATCH: 'xlsx:parseBatch',
  XLSX_COMMIT_BATCH: 'xlsx:commitBatch',
  // v1.30.0 MINOR — Dcm config bridge. First channel in a new dcm:*
  // namespace. Wires the v1.27.0 T4 dcmConfigHandler (existing-but-
  // unregistered since v1.27.0) into the IPC bridge so the renderer
  // can drive the ODX + xlsx → Dcm_Config.arxml pipeline. Channel
  // name follows the unsuffixed v1.22.0/v1.23.0/v1.24.0 ODX-bridge
  // convention (no `:v1` suffix — additive on the wire).
  DCM_CONFIG: 'dcm:config',
  // v1.33.0 MINOR T1 — xlsx-import complete push channel. Broadcast-
  // style (M→R): main fires this after xlsxEcucBatchImportHandler
  // succeeds so the renderer can populate XlsxImportSlice with the
  // applied rows + source. Replaces the v1.32.x `xlsxRows: []`
  // placeholder pattern (lesson store-as-source-of-truth-for-async-
  // args). Payload excludes `importedAt`; renderer stamps it.
  XLSX_IMPORT_COMPLETE: 'xlsx:import-complete',
  // v1.36.0 MINOR T2 — xlsxImportHistory persistence IPC surface.
  // xlsxHistory:load — renderer bootstrap calls this on App mount to
  //   hydrate the v1.34.0 session-scope history from disk.
  // xlsxHistory:save — main-internal; xlsxEcucBatchImportHandler calls
  //   this directly (NOT exposed via preload bridge) after the
  //   xlsx:import-complete broadcast succeeds.
  XLSX_HISTORY_LOAD: 'xlsxHistory:load',
  XLSX_HISTORY_SAVE: 'xlsxHistory:save',
  // v1.33.0 MINOR T2 — bswmd:pick IPC. Renderer asks main to show a
  // single-file picker filtered to .arxml, then reads the chosen file
  // into memory. Used by the v1.32.1 PATCH Override UI's Browse
  // button. New additive channel (lesson additive-ipc-channels-over-
  // extending-args) — not extending an existing channel, so future
  // BSWMD open use cases (e.g. multi-BSWMD import) can land
  // independently. Returns a discriminated `BswmdPickResult` (canceled
  // / opened); the read-failure branch is folded into `canceled` after
  // surfacing the error via `dialog.showMessageBox`.
  BSWMD_PICK: 'bswmd:pick',
  // v1.33.0 MINOR T3 — odx:open-with-default IPC. Variant of the
  // v1.22.0 `odx:open` channel that accepts a `defaultPath` hint so
  // the OS dialog opens at the project root (or wherever the renderer
  // pre-computes) instead of `user-home`. Mirrors the
  // `bswmd:pick`-style additive channel pattern (lesson
  // additive-ipc-channels-over-extending-args) — preserves the
  // v1.22.0 `odx:open` contract verbatim; new channel ships
  // independently. Returns the same `{kind: 'opened'|'canceled'|
  // 'read-failed'}` envelope as the v1.22.0 channel.
  ODX_OPEN_WITH_DEFAULT: 'odx:open-with-default',
} as const;

// Sprint 14 — top-level re-exports kept as aliases for source-level
// readability (call sites can use either `IPC_CHANNELS.PROJECT_WRITE_ARXML_BATCH`
// or `PROJECT_WRITE_ARXML_BATCH`; both compile to the same string).
// The canonical source of truth is `IPC_CHANNELS` so the `IpcChannel`
// derived type below stays exhaustive.
export const PROJECT_WRITE_ARXML_BATCH = IPC_CHANNELS.PROJECT_WRITE_ARXML_BATCH;
export const PROJECT_DELETE_ARXML = IPC_CHANNELS.PROJECT_DELETE_ARXML;
// v1.6.0 A+C — re-exports for the 3 new headless IPC channels. Top-level
// aliases (call sites can use either `IPC_CHANNELS.HEADLESS_RUN_COMMAND` or
// `HEADLESS_RUN_COMMAND`; both compile to the same string). Canonical SoT
// remains `IPC_CHANNELS` so `IpcChannel` derived type stays exhaustive.
export const HEADLESS_RUN_COMMAND = IPC_CHANNELS.HEADLESS_RUN_COMMAND;
export const HEADLESS_MUTATE_APPLIED = IPC_CHANNELS.HEADLESS_MUTATE_APPLIED;
export const HEADLESS_VALIDATE_RESULT = IPC_CHANNELS.HEADLESS_VALIDATE_RESULT;
// v1.51.0 PATCH T2 -- top-level alias for FEATURE_FLAGS_GET (mirrors
// the DCM_CONFIG / DBC_IMPORT_COM_STACK convention above).
export const FEATURE_FLAGS_GET = IPC_CHANNELS.FEATURE_FLAGS_GET;
// v1.23.0 T3 — top-level alias for DBC_IMPORT_COM_STACK (mirrors the
// sibling alias convention above). Both compile to the same string.
export const DBC_IMPORT_COM_STACK = IPC_CHANNELS.DBC_IMPORT_COM_STACK;
// v1.18.2 PATCH — top-level alias for PROJECT_CLOSE (mirrors PROJECT_OPEN
// convention at the prior siblings; both compile to the same string).
export const PROJECT_CLOSE = IPC_CHANNELS.PROJECT_CLOSE;
// v1.23.0 PATCH (HIGH-1) — top-level alias for PROJECT_RELOAD (mirrors
// the PROJECT_OPEN / PROJECT_CLOSE alias convention above).
export const PROJECT_RELOAD = IPC_CHANNELS.PROJECT_RELOAD;
// v1.25.0 T5 — top-level aliases for the 3 XLSX batch IPC channels
// (mirrors the DBC_IMPORT_COM_STACK alias convention above).
export const XLSX_WRITE_BATCH_TEMPLATE = IPC_CHANNELS.XLSX_WRITE_BATCH_TEMPLATE;
export const XLSX_PARSE_BATCH = IPC_CHANNELS.XLSX_PARSE_BATCH;
export const XLSX_COMMIT_BATCH = IPC_CHANNELS.XLSX_COMMIT_BATCH;
// v1.30.0 MINOR — top-level re-export alias for DCM_CONFIG.
export const DCM_CONFIG = IPC_CHANNELS.DCM_CONFIG;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
