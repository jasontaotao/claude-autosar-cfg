// IPC channel name constants. Shared across main, preload, renderer.
export const IPC_CHANNELS = {
  PING: 'app:ping',
  GET_APP_VERSION: 'app:get-version',
  OPEN_ARXML: 'arxml:open',
  OPEN_ARXML_MULTI: 'arxml:open-multi',
  PARSE_ARXML: 'arxml:parse',
  SAVE_ARXML: 'arxml:save',
  // Sprint 11 Phase 1 — project manifest IO
  PROJECT_NEW: 'project:new',
  PROJECT_OPEN: 'project:open',
  PROJECT_SAVE: 'project:save',
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
  TEMPLATES_LIST: 'templates:list',
  // Sprint 13 #1 — copy a template's files into a chosen directory.
  // Returns the relative paths of copied value-side and schema-side
  // files. Renderer does not call this in Sprint 13 #1; it is exposed
  // here so the IPC contract is complete and the handler is testable.
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
  SWS_VALIDATE: 'sws-validator:run:v1',
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
  HEADLESS_RUN_COMMAND: 'headless:run-command:v1',
  HEADLESS_MUTATE_APPLIED: 'headless:mutate-applied:v1',
  HEADLESS_VALIDATE_RESULT: 'headless:validate-result:v1',
  // v1.8.0 K — Stencil Wizard IPC channel. Generates a minimal valid
  // ECUC module skeleton (.arxml) for one of 4 families (Com, ComM,
  // PduR, EcuC). Channel name follows the v1.6.0 A+C §6 versioning
  // policy (`:v1` suffix; breaking changes introduce `:v2`). Gated by
  // `experimental.stencilWizard` feature flag (default OFF).
  STENCIL_GENERATE_V1: 'stencil:generate:v1',
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

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
