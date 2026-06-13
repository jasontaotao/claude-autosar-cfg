// IPC channel name constants. Shared across main, preload, renderer.
export const IPC_CHANNELS = {
  PING: 'app:ping',
  GET_APP_VERSION: 'app:get-version',
  // F1 (Sprint 1) channels will be added here:
  // OPEN_ARXML: 'arxml:open',
  // PARSE_ARXML: 'arxml:parse',
  // SAVE_ARXML: 'arxml:save',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];