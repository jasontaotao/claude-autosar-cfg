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
} as const;

// Sprint 14 — top-level re-exports kept as aliases for source-level
// readability (call sites can use either `IPC_CHANNELS.PROJECT_WRITE_ARXML_BATCH`
// or `PROJECT_WRITE_ARXML_BATCH`; both compile to the same string).
// The canonical source of truth is `IPC_CHANNELS` so the `IpcChannel`
// derived type below stays exhaustive.
export const PROJECT_WRITE_ARXML_BATCH = IPC_CHANNELS.PROJECT_WRITE_ARXML_BATCH;
export const PROJECT_DELETE_ARXML = IPC_CHANNELS.PROJECT_DELETE_ARXML;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
