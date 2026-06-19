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
  /**
   * Sprint 16 — when present, the handler skips the OS save-as dialog
   * and writes directly to this path. Used by the renderer's "Save"
   * button after edit, where the document already has a known on-disk
   * location (loaded from project or generated via BSWMD-to-ECUC).
   * Empty string is treated as absent.
   */
  readonly currentPath?: string;
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

// --- Sprint 12 #3 — `project:pickDir` IPC types ----------------------------

/**
 * Request payload for `PICK_DIR`. `defaultPath` is optional and is
 * forwarded to `dialog.showOpenDialog` as-is — when omitted, the OS
 * picks the default starting location.
 *
 * `locale` (Sprint 13+ Stage 4 M7) is the renderer's current i18n
 * locale; main uses it to render the dialog title via the shared
 * `t(locale, key)` helper. When omitted, main falls back to `'en'`
 * (the hard-coded English title) — this is a defensive default for
 * older callers and the IPC contract is backward-compatible.
 */
export interface PickDirRequest {
  readonly defaultPath?: string;
  readonly locale?: 'zh-CN' | 'en';
}

/**
 * Response payload for `PICK_DIR`. Discriminated union:
 *   - `{ kind: 'picked', dirPath }` — user picked a directory;
 *     `dirPath` is its absolute on-disk path. The renderer hands it
 *     straight to the NewProjectDialog form (and eventually
 *     `PROJECT_NEW.directory` in Phase 1 Task 4).
 *   - `{ kind: 'canceled' }` — user dismissed the dialog (or selected
 *     0 directories).
 *
 * We deliberately do NOT validate that `dirPath` is a directory here:
 * the dialog was opened with `properties: ['openDirectory']`, so a
 * real OS can never return a file. The renderer is the right place to
 * double-check before committing a project to the path.
 */
export type PickDirResult =
  | { readonly kind: 'picked'; readonly dirPath: string }
  | { readonly kind: 'canceled' };

// --- Sprint 13 #1 — built-in template IPC types ---------------------------

export interface TemplateListRequest {
  // No fields. Reserved for future filters (e.g. vendor dialect).
  readonly _placeholder?: never;
}

export interface TemplateListResponse {
  readonly templates: ReadonlyArray<{
    readonly id: string;
    readonly displayNameKey: string;
    readonly descriptionKey: string;
    readonly fileCount: number;
    /**
     * Sprint 13+ Stage 3.4 — absolute on-disk paths of schema-side
     * BSWMD files within the template's `bswmd/` subdirectory. The
     * renderer surfaces them as multi-select chips in
     * `NewProjectDialog` (Classic template). Empty for templates
     * without a `bswmd/` dir (e.g. `empty`, `clone`).
     *
     * Absolute paths are exposed because the renderer cannot
     * import `node:path` to resolve `process.resourcesPath`
     * itself, and the chip row needs the full path to thread
     * back to the `projectNew` IPC. The renderer treats them
     * as opaque strings (basename for display, full path for
     * IPC); it does not read, write, or evaluate the path.
     */
    readonly bswmdPaths: readonly string[];
  }>;
}

export interface TemplateCopyRequest {
  readonly templateId: string;
  /** Absolute path of the target directory. Main has already shown a
   *  directory picker; renderer forwards the chosen path verbatim. */
  readonly destDir: string;
}

export interface TemplateCopyResponse {
  readonly copiedValueArxml: readonly string[];
  readonly copiedBswmd: readonly string[];
}

// --- F1 Project manifest IO types (Sprint 11 Phase 1) ----------------------

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
  | { readonly kind: 'write-failed'; readonly message: string };

export interface ProjectDeleteArxmlRequest {
  readonly filePath: string;
}

export type ProjectDeleteArxmlResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'write-failed'; readonly message: string };
