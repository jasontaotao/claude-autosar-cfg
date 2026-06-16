// IPC channel name constants. Shared across main, preload, renderer.
export const IPC_CHANNELS = {
  PING: 'app:ping',
  GET_APP_VERSION: 'app:get-version',
  OPEN_ARXML: 'arxml:open',
  OPEN_ARXML_MULTI: 'arxml:open-multi',
  PARSE_ARXML: 'arxml:parse',
  SAVE_ARXML: 'arxml:save',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
