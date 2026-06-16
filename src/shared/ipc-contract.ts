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
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
