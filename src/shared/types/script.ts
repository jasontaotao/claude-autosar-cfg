// --- Sprint 17 P1 — `bswmd:delete` IPC types --------------------------------

import type {
  ScriptKind,
  ScriptLog,
  ScriptRunResult,
  ScriptSummary,
} from '../../main/script/types.js';
//
// Mirrors `ProjectDeleteArxmlRequest/Result` for parity. The shape is
// identical (delete a file by absolute path, return
// ok / not-found / write-failed) but the names are kept distinct so
// the type system is honest about which channel the value flows
// through. Future divergence (e.g. a size cap or a path-containment
// check on BSWMD deletes) is easier to land in a non-shared type.

export interface ProjectDeleteBswmdRequest {
  readonly filePath: string;
}

export type ProjectDeleteBswmdResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'write-failed'; readonly message: string }
  | { readonly kind: 'invalid-path'; readonly message: string };

// --- Sprint 14 #1 — script engine IPC types --------------------------------
//
// The renderer drives script CRUD through 4 invoke channels and consumes
// one main→renderer push channel for live progress events. See
// `src/shared/ipc-contract.ts` for the channel names and direction.

/**
 * Request payload for `SCRIPT_LIST`. The main handler reads the project
 * manifest and returns lightweight summaries (no `source` field) so the
 * script library UI can render without paying the cost of shipping every
 * source string across the IPC boundary.
 */
export interface ScriptListRequest {
  readonly projectId: string;
}

/** Response payload for `SCRIPT_LIST`. */
export interface ScriptListResponse {
  readonly scripts: readonly ScriptSummary[];
}

/**
 * Request payload for `SCRIPT_SAVE`.
 *
 * - When `id` is omitted, the handler generates a new UUID and rejects
 *   duplicate `shortName` against existing entries.
 * - When `id` is provided, the handler overwrites the matching entry's
 *   `name` / `shortName` / `kind` / `source` / `imports` and bumps
 *   `updatedAt`.
 */
export interface ScriptSaveRequest {
  readonly projectId: string;
  /** Omit to create a new entry. */
  readonly id?: string;
  readonly name: string;
  readonly shortName: string;
  readonly kind: ScriptKind;
  readonly source: string;
}

/** Response payload for `SCRIPT_SAVE`. */
export interface ScriptSaveResponse {
  readonly id: string;
  readonly updatedAt: string;
}

/**
 * Request payload for `SCRIPT_DELETE`. The handler filters the entry
 * out of `manifest.scripts[]` and returns the (idempotent) success
 * marker. Missing-id is treated as a no-op success.
 */
export interface ScriptDeleteRequest {
  readonly projectId: string;
  readonly id: string;
}

/** Response payload for `SCRIPT_DELETE`. */
export interface ScriptDeleteResponse {
  readonly ok: true;
}

/**
 * Request payload for `SCRIPT_RUN`. `timeoutMs` is the post-hoc
 * timeout budget (spec § 8.2); when omitted the handler falls back to
 * the default (5000 ms in the vm-runner).
 */
export interface ScriptRunRequest {
  readonly projectId: string;
  readonly id: string;
  readonly timeoutMs?: number;
}

/** Response payload for `SCRIPT_RUN`. */
export type ScriptRunResponse = ScriptRunResult;

/**
 * Main → renderer progress event for `SCRIPT_PROGRESS`. Carries one log
 * line emitted by `ctx.log.*` during a run. The renderer appends each
 * event to the script output panel so the user sees progress before
 * the final `ScriptRunResult` lands.
 */
export interface ScriptProgressEvent {
  readonly runId: string;
  readonly level: ScriptLog['level'];
  readonly message: string;
  readonly ts: number;
}
