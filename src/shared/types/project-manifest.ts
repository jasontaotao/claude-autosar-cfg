// --- F1 Project manifest IO types (Sprint 11 Phase 1) ----------------------

import type { ParseError } from '../../core/arxml/parser.js';
import type { SerializeError } from '../../core/arxml/serializer.js';
import type { ArxmlDocument, ArxmlElement, ArxmlVersion } from '../../core/arxml/types.js';
import type { ProjectManifest } from '../project.js';

export type { ProjectManifest };

/**
 * Request payload for `PROJECT_NEW` (Sprint 12 #3).
 *
 * The renderer (`NewProjectDialog`) is responsible for collecting both
 * the project name AND the target directory from the user, so the main
 * process no longer pops an OS `showSaveDialog` — it joins
 * `req.directory` with a sanitized filename (`<name>.autosarcfg.json`)
 * and writes directly. This unifies the two-step "prompt name → pick path"
 * flow into a single in-app dialog.
 *
 * - `name` — user-supplied project name. Pre-validated by
 *   `NewProjectDialog` (rejecting empty / path-unsafe chars / >64 chars);
 *   the main handler still applies a defensive sanitization and rejects
 *   names containing `/` or `\` outright.
 * - `directory` — absolute on-disk directory chosen by the user via the
 *   renderer-driven `project:pickDir` IPC. Main will not create the
 *   directory if it doesn't exist; it returns `write-failed` instead so
 *   the renderer can prompt the user to pick another location.
 */
export interface ProjectNewRequest {
  readonly name: string;
  readonly directory: string;
  /**
   * Sprint 13 #2 Stage 3.2 Task 2: when true, the main handler skips
   * the `fs.access` file-exists check and force-writes the manifest.
   * The renderer only sets this on a re-invocation after the user has
   * confirmed the overwrite via the ConfirmDialog (which translates
   * the `overwrite-confirm` IPC result into a "覆盖" / "重命名" choice).
   */
  readonly overwrite?: boolean;
  /**
   * Sprint 13+ Stage 3.4 — absolute paths of BSWMD files the user
   * pre-selected via `BswmdChipRow` in NewProjectDialog. Main writes
   * them into the new manifest's `bswmdPaths`. Empty array when
   * the user picked a template without BSWMDs (Empty / Clone) or
   * didn't select any chips.
   *
   * Paths are kept as-is — main does NOT validate that the files
   * exist on disk. Future work (Stage 3.5+) may copy the referenced
   * files into the project dir; this IPC just records the manifest
   * pointer. Renderer callers must read paths straight from the
   * `templates:list` IPC response.
   */
  readonly bswmdPaths?: readonly string[];
}

/**
 * Response payload for `PROJECT_NEW` (Sprint 12 #3).
 *
 * Discriminated union:
 *   - `{ kind: 'created', path, manifest }` — file written successfully.
 *   - `{ kind: 'overwrite-confirm', path }` — the target file already
 *     exists. The main handler does NOT overwrite; the renderer must
 *     confirm with the user (e.g. via `ConfirmDialog`) and re-invoke
 *     with an explicit overwrite flag (Phase 2) — for now Phase 1
 *     surfaces this as a renderer-side error so the user can pick a
 *     different directory or rename the project.
 *   - `{ kind: 'write-failed', message }` — write failed (directory
 *     missing, permission denied, EISDIR for a non-directory path, etc.).
 *   - `{ kind: 'invalid-name', message }` — defensive guard for names
 *     containing path separators (`/` / `\`). Pre-validated by the
 *     renderer; this is a safety net for a tampered preload bridge.
 *
 * The previous `'canceled'` kind is gone — there is no longer any
 * dialog for the user to cancel.
 */
export type ProjectNewResult =
  | { readonly kind: 'created'; readonly path: string; readonly manifest: ProjectManifest }
  | { readonly kind: 'overwrite-confirm'; readonly path: string }
  | { readonly kind: 'write-failed'; readonly message: string }
  | { readonly kind: 'invalid-name'; readonly message: string };

/**
 * Request payload for `PROJECT_OPEN`. No input — main shows the open
 * dialog. The response carries the manifest + the contents of every
 * referenced ARXML/BSWMD so the renderer can hydrate its store in one
 * round trip.
 *
 * Note: for Phase 1, BSWMDs are loaded but not yet parsed by the core
 * (Phase 2 wires the BSWMD parser into the store). They live in the
 * `bswmds` array so the renderer can hand them off later.
 */
export type ProjectOpenResult =
  | { readonly kind: 'canceled' }
  | {
      readonly kind: 'opened';
      readonly manifestPath: string;
      readonly manifest: ProjectManifest;
      /**
       * Each entry carries the manifest-relative path (`rel`) alongside
       * the absolute on-disk path (`path`) and the file content. The
       * renderer matches by `rel` to avoid basename collisions when
       * the same filename lives in two sub-directories of the project
       * (e.g. `subdir1/EcuC.arxml` and `subdir2/EcuC.arxml`).
       */
      readonly docs: readonly {
        readonly rel: string;
        readonly path: string;
        readonly content: string;
      }[];
      readonly bswmds: readonly {
        readonly rel: string;
        readonly path: string;
        readonly content: string;
      }[];
    }
  | {
      readonly kind: 'read-failed';
      readonly message: string;
    };

/**
 * Result envelope for `PROJECT_CLOSE` (v1.18.2 PATCH). Symmetric
 * counterpart to `ProjectOpenResult`. Currently single-kind — `closed`
 * is returned whether or not a project was open (idempotent close,
 * mirrors Unix `close(2)` semantics). Future failure modes (e.g.
 * cleanup threw) would add a `failed` kind.
 */
export type ProjectCloseResult = { readonly kind: 'closed' };

/**
 * v1.23.0 PATCH (HIGH-1) — `PROJECT_RELOAD` request payload. The
 * non-dialog counterpart to `PROJECT_OPEN`: takes an already-known
 * absolute manifest path and re-reads it + every referenced
 * value-side ARXML + BSWMD from disk. Used by the T4
 * `DBC→Com-Stack` apply handler so the user sees fresh ECUC values
 * immediately after a successful bridge — without popping the OS
 * file picker that `PROJECT_OPEN` requires.
 *
 * Mirrors the same shape as `PROJECT_OPEN`'s read-side payload, minus
 * the dialog-driven `path: string` (already supplied).
 */
export interface ProjectReloadRequest {
  readonly manifestPath: string;
}

/**
 * v1.23.0 PATCH (HIGH-1) — `PROJECT_RELOAD` response envelope.
 *
 * Success: `{ kind: 'ok', manifest, files }` — `manifest` is the
 * parsed `ProjectManifest`; `files` is a flat array of every ARXML +
 * BSWMD the manifest references, each carrying the absolute `path`
 * and the `content` string. The renderer's `useArxmlStore.openProject`
 * action reuses this bundle verbatim (splitting by kind is the
 * store's job).
 *
 * Failure: `{ kind: 'read-failed', message }` — IO error, JSON parse
 * error, path-containment violation, or a referenced file missing
 * from disk.
 */
export type ProjectReloadResponse =
  | {
      readonly kind: 'ok';
      readonly manifest: ProjectManifest;
      readonly files: ReadonlyArray<{
        readonly path: string;
        readonly content: string;
      }>;
    }
  | { readonly kind: 'read-failed'; readonly message: string };

/**
 * Request payload for `PROJECT_SAVE`. The renderer sends the current
 * manifest + any files whose content has changed since the last save.
 * `files` may be empty if only the manifest changed (e.g. added a path
 * without editing the doc).
 *
 * Main writes `files` first (each to its `path` field), then writes the
 * manifest JSON to `manifestPath`. A write failure rolls forward and
 * reports `write-failed`; partial state on disk is acceptable for Phase 1.
 */
export interface ProjectSaveRequest {
  readonly manifestPath: string;
  readonly manifest: ProjectManifest;
  readonly files: readonly { readonly path: string; readonly content: string }[];
}

export type ProjectSaveResult =
  | { readonly kind: 'saved'; readonly path: string }
  | { readonly kind: 'write-failed'; readonly message: string };

export type { ArxmlVersion, ArxmlDocument, ArxmlElement, ParseError, SerializeError };

// --- Sprint 14: BSWMD-to-ECUC skeleton IPC ---

export interface ProjectWriteArxmlBatchRequest {
  readonly files: readonly {
    readonly filePath: string;
    readonly content: string;
  }[];
}

export type ProjectWriteArxmlBatchResult =
  | { readonly kind: 'ok'; readonly written: readonly string[] }
  | {
      readonly kind: 'partial';
      readonly written: readonly string[];
      readonly failed: readonly { readonly filePath: string; readonly message: string }[];
    }
  | { readonly kind: 'write-failed'; readonly message: string }
  | { readonly kind: 'invalid-path'; readonly message: string };

export interface ProjectDeleteArxmlRequest {
  readonly filePath: string;
}

export type ProjectDeleteArxmlResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'write-failed'; readonly message: string }
  | { readonly kind: 'invalid-path'; readonly message: string };

// --- Sprint 17 P1 — `bswmd:delete` IPC types --------------------------------
