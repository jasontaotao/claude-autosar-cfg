// shared/types/app.ts
// App-level IPC types. Split from `src/shared/types.ts` as part of
// v1.41.x PATCH T4 (file-size backlog). Public surface: AppInfo,
// PingResponse. Zero cross-re-exports — the other type domains
// (arxml / odx / dbc / etc.) own their own re-exports of the
// arxml / parser / serializer cross-cuts.

export interface AppInfo {
  readonly name: string;
  readonly version: string;
  readonly coreVersion: string;
  readonly electronVersion: string;
  readonly nodeVersion: string;
  readonly platform: NodeJS.Platform;
}

export interface PingResponse {
  readonly ok: boolean;
  readonly ts: number;
}
