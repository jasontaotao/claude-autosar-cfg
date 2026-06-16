import type { ParseError } from '../core/arxml/parser.js';
import type { SerializeError } from '../core/arxml/serializer.js';
import type { ArxmlDocument, ArxmlElement, ArxmlVersion, Result } from '../core/arxml/types.js';
import type { BswmdDocument, BswmdError } from '../core/project/bswmd.js';

import type { ProjectManifest } from './project.js';

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

// Result envelope is defined in core/arxml/types.ts and re-exported here
// to preserve the core → shared layer direction (shared consumes core, not vice versa).
export type { Result };

// --- F1 ARXML IO types -----------------------------------------------------

export type FileError =
  | { readonly kind: 'read-failed'; readonly message: string }
  | { readonly kind: 'write-failed'; readonly message: string }
  | { readonly kind: 'dialog-failed'; readonly message: string };

export interface OpenArxmlResult {
  readonly canceled: boolean;
  readonly path?: string;
  readonly content?: string;
}

/**
 * Sprint 10 #2 — multi-file open result.
 *
 * The user picks N files (N ≥ 0) in a single dialog. The main process
 * reads each one and groups the outcome into a discriminated union so
 * the renderer can distinguish "user canceled" from "all opened" from
 * "some opened, some failed" from "OS-level read error".
 *
 * - `{ kind: 'canceled' }` — user dismissed the dialog (or selected 0 files)
 * - `{ kind: 'opened'; results: [{ path, content }, ...] }` — every
 *   selected file read successfully
 * - `{ kind: 'partial'; opened: [...]; failed: [{ path, message }, ...] }`
 *   — at least one read failed; the renderer can still consume `opened`
 *   and surface a per-file error for `failed`
 * - `{ kind: 'read-failed'; message: string }` — every read failed (or
 *   the dialog itself errored out); renderer surfaces a single error
 *
 * The shape replaces the silent "treat read-failure as cancel" pattern
 * flagged by the silent-failure-hunter in the Sprint 10 panel review.
 */
export type OpenArxmlMultiResult =
  | { readonly kind: 'canceled' }
  | {
      readonly kind: 'opened';
      readonly results: readonly { readonly path: string; readonly content: string }[];
    }
  | {
      readonly kind: 'partial';
      readonly opened: readonly { readonly path: string; readonly content: string }[];
      readonly failed: readonly { readonly path: string; readonly message: string }[];
    }
  | { readonly kind: 'read-failed'; readonly message: string };

export interface SaveArxmlResult {
  readonly canceled: boolean;
  readonly path?: string;
}

export interface ParseArxmlRequest {
  readonly path: string;
  readonly content: string;
}

export type ParseArxmlResponse = Result<ArxmlDocument, ParseError>;

export interface SaveArxmlRequest {
  readonly doc: ArxmlDocument;
  readonly defaultName?: string;
}

export type SaveArxmlResponse = Result<SaveArxmlResult, FileError>;

// --- Sprint 12 #1 — BSWMD parser IPC types ---------------------------------

/**
 * Request payload for `BSWMD_PARSE`. The renderer passes the raw XML
 * string (already read from disk by `project:open` — the handler does
 * NOT touch the filesystem). `path` is optional debug context.
 */
export interface ParseBswmdRequest {
  readonly content: string;
  readonly path?: string;
}

export type ParseBswmdResponse = Result<BswmdDocument, BswmdError>;

// --- Sprint 12 #2 — BSWMD file reader IPC types ----------------------------

/**
 * Request payload for `BSWMD_READ`. The renderer passes the absolute
 * path to a `.arxml` file (chosen via `dialog.showOpenDialog` upstream
 * in `useProjectActions.addBswmdFromDialog`); the main process reads
 * it and returns either the content or a single-line error message.
 *
 * The handler does NOT do any path-containment check — the renderer is
 * trusted to pass absolute paths the user explicitly picked, and the
 * file is read-only here. (Manifest-driven loads — where a tampered
 * manifest could point at `/etc/passwd` — go through `PROJECT_OPEN`,
 * which DOES enforce containment.)
 */
export interface ReadBswmdRequest {
  readonly path: string;
}

/**
 * Response payload for `BSWMD_READ`. Discriminated union:
 *   - `{ kind: 'ok', content }` — file read successfully; `content` is
 *     the raw UTF-8 string. An empty file is reported as `ok` with
 *     `content: ''` (the downstream `parseBswmd` will reject it later
 *     with `missing-root` / `xml-malformed`).
 *   - `{ kind: 'read-failed', message }` — file could not be read. The
 *     message is a single human-readable line suitable for surfacing
 *     in the renderer's error toast.
 */
export type ReadBswmdResponse =
  | { readonly kind: 'ok'; readonly content: string }
  | { readonly kind: 'read-failed'; readonly message: string };

/**
 * Response payload for `BSWMD_OPEN`. Discriminated union:
 *   - `{ kind: 'canceled }` — user dismissed the dialog (or selected 0 files)
 *   - `{ kind: 'ok', path }` — user picked a file; `path` is its
 *     absolute on-disk path. Renderer hands it straight to
 *     `BSWMD_READ` (`{ path }`).
 *
 * Mirrors the `OPEN_ARXML` single-file picker shape (just without the
 * `content` field — `BSWMD_OPEN` is dialog-only; the renderer asks the
 * main process to read the content in a second IPC call so the size cap
 * and read-failure handling stay consistent with `BSWMD_READ`).
 */
export type OpenBswmdResult =
  | { readonly kind: 'canceled' }
  | { readonly kind: 'ok'; readonly path: string };

// --- F1 Project manifest IO types (Sprint 11 Phase 1) ----------------------

/**
 * Request payload for `PROJECT_NEW`. The user provides the project name;
 * the main process picks the save location via a dialog and writes an
 * empty manifest skeleton (empty valueArxmlPaths / bswmdPaths).
 */
export interface ProjectNewRequest {
  readonly name: string;
}

export type ProjectNewResult =
  | { readonly kind: 'canceled' }
  | { readonly kind: 'created'; readonly path: string; readonly manifest: ProjectManifest }
  | { readonly kind: 'write-failed'; readonly message: string };

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
