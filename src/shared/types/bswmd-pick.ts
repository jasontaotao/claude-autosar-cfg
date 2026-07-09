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

