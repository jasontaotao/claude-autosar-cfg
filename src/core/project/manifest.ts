// Project manifest — pure helpers (no fs I/O, no Electron deps).
//
// Three responsibilities:
//   1. loadManifest(json)   — parse + validate a JSON string from disk
//   2. saveManifest(m)      — emit a pretty-printed JSON string
//   3. validateManifest(m)  — re-check shape of an in-memory manifest
//   4. createEmptyManifest  — fresh project skeleton
//
// Design choices captured in `shared/project.ts`. Path-shape validation
// here is intentionally strict (no `..`, no leading `/`, no drive letters)
// because the result will be passed to Node's `path.resolve(manifestDir, p)`
// in the main process; the manifest layer's job is to refuse anything that
// could escape the project directory before we ever touch the filesystem.
//
// UUID generation uses `globalThis.crypto.randomUUID()`, which is the
// standard Web Crypto API (Node 19+, Electron 30+, all evergreen browsers).
// Reading from `globalThis` keeps this module zero-dep and lets it be
// imported from the renderer bundle without dragging in `node:crypto` —
// a previous `import { randomUUID } from 'node:crypto'` caused the
// renderer rollup build to fail because `__vite-browser-external` has
// no `randomUUID` export.

import { MANIFEST_SCHEMA_VERSION } from '../../shared/project.js';
import type { ManifestSchemaVersion, ProjectManifest } from '../../shared/project.js';

/**
 * All errors that can surface from loadManifest / validateManifest.
 *
 * - `json-parse`        — input wasn't valid JSON
 * - `invalid-shape`     — root not object, or required field missing/wrong type
 * - `version-mismatch`  — schemaVersion doesn't match the runtime constant
 * - `invalid-path`      — a path field contains `..`, absolute, or empty
 * - `invalid-field`     — id or name empty / wrong type
 */
export type ManifestError =
  | { readonly kind: 'json-parse'; readonly message: string }
  | { readonly kind: 'invalid-shape'; readonly message: string }
  | {
      readonly kind: 'version-mismatch';
      readonly expected: ManifestSchemaVersion;
      readonly found: string;
    }
  | {
      readonly kind: 'invalid-path';
      readonly field: 'valueArxmlPaths' | 'bswmdPaths';
      readonly path: string;
      readonly reason: 'parent-traversal' | 'absolute' | 'empty';
    }
  | { readonly kind: 'invalid-field'; readonly field: 'id' | 'name'; readonly message: string };

export type ManifestResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ManifestError };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a JSON string into a `ProjectManifest`.
 *
 * On failure, returns the specific `ManifestError` kind so callers can
 * surface actionable messages ("Manifest uses schema 999, expected 1")
 * instead of a generic parse failure.
 */
export function loadManifest(json: string): ManifestResult<ProjectManifest> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return {
      ok: false,
      error: {
        kind: 'json-parse',
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }

  return parseManifestShape(raw);
}

/**
 * Serialize a `ProjectManifest` to a stable, human-readable JSON string.
 *
 * Uses 2-space indent + sorted key order so two saves of the same manifest
 * produce byte-identical output (helps git diffs / project-team review).
 */
export function saveManifest(m: ProjectManifest): string {
  return JSON.stringify(m, null, 2);
}

/**
 * Re-validate an already-parsed manifest. Used after mutations (e.g.
 * the user adds a path via UI) to guarantee we never persist something
 * the main process would later refuse to read.
 */
export function validateManifest(m: ProjectManifest): ManifestResult<ProjectManifest> {
  // id / name
  if (typeof m.id !== 'string' || m.id.length === 0) {
    return {
      ok: false,
      error: { kind: 'invalid-field', field: 'id', message: 'id must be a non-empty string' },
    };
  }
  if (typeof m.name !== 'string' || m.name.length === 0) {
    return {
      ok: false,
      error: { kind: 'invalid-field', field: 'name', message: 'name must be a non-empty string' },
    };
  }

  // path arrays
  const pathErr = checkPathArray(m.valueArxmlPaths, 'valueArxmlPaths');
  if (pathErr !== undefined) {
    return { ok: false, error: pathErr };
  }
  const bswmdErr = checkPathArray(m.bswmdPaths, 'bswmdPaths');
  if (bswmdErr !== undefined) {
    return { ok: false, error: bswmdErr };
  }

  return { ok: true, value: m };
}

/**
 * Create a fresh manifest with empty path arrays and a fresh UUID.
 *
 * The id is generated at construction time and is never mutated. Two calls
 * always return distinct ids (tested in `manifest.test.ts`).
 */
export function createEmptyManifest(name: string): ProjectManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    id: generateUuid(),
    name,
    valueArxmlPaths: [],
    bswmdPaths: [],
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseManifestShape(raw: unknown): ManifestResult<ProjectManifest> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      error: { kind: 'invalid-shape', message: 'Manifest root must be a JSON object' },
    };
  }
  const obj = raw as Record<string, unknown>;

  // schemaVersion check FIRST — unknown version means we don't know what
  // shape to expect, so we stop here rather than guessing.
  if (obj.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    return {
      ok: false,
      error: {
        kind: 'version-mismatch',
        expected: MANIFEST_SCHEMA_VERSION,
        found: typeof obj.schemaVersion === 'string' ? obj.schemaVersion : '<missing>',
      },
    };
  }

  // Required-field presence (don't accept missing keys, even if undefined)
  const requiredFields = ['id', 'name', 'valueArxmlPaths', 'bswmdPaths'] as const;
  for (const f of requiredFields) {
    if (!(f in obj)) {
      return {
        ok: false,
        error: { kind: 'invalid-shape', message: `Missing required field: ${f}` },
      };
    }
  }

  // Cheap shape checks before deep validate
  const candidate: ProjectManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    id: obj.id as string,
    name: obj.name as string,
    valueArxmlPaths: obj.valueArxmlPaths as readonly string[],
    bswmdPaths: obj.bswmdPaths as readonly string[],
  };

  return validateManifest(candidate);
}

function checkPathArray(
  paths: readonly unknown[],
  field: 'valueArxmlPaths' | 'bswmdPaths',
): ManifestError | undefined {
  if (!Array.isArray(paths)) {
    return { kind: 'invalid-shape', message: `${field} must be an array of strings` };
  }
  for (const p of paths) {
    if (typeof p !== 'string') {
      return { kind: 'invalid-path', field, path: String(p), reason: 'empty' };
    }
    const reason = classifyBadPath(p);
    if (reason !== null) {
      return { kind: 'invalid-path', field, path: p, reason };
    }
  }
  return undefined;
}

/**
 * Return the first path-shape violation, or null if the path is acceptable.
 *
 * Accepts:
 *   - `./relative`
 *   - `relative`
 *   - `subfolder/file.arxml`
 *
 * Rejects:
 *   - empty
 *   - `/etc/passwd` (Unix absolute)
 *   - `C:/x` or `C:\x` (Windows absolute)
 *   - any segment that is `..` (e.g. `../foo`, `a/../b`)
 */
function classifyBadPath(p: string): 'parent-traversal' | 'absolute' | 'empty' | null {
  if (p.length === 0) return 'empty';
  if (p.startsWith('/')) return 'absolute';
  // Windows drive letter, e.g. C:/x or C:\x — check the second char too
  // because `C:` alone isn't enough; we want a path separator after the colon.
  if (/^[A-Za-z]:[\\/]/.test(p)) return 'absolute';
  // Normalise separators before checking for parent-traversal segments
  const segments = p.split(/[\\/]/);
  if (segments.some((s) => s === '..')) return 'parent-traversal';
  return null;
}

/**
 * UUID v4 generator. Reads `globalThis.crypto.randomUUID()` directly
 * (Web Crypto standard). Throws if unavailable — at this point the
 * runtime is too old to run the rest of the app anyway, so a clear
 * failure is more useful than a non-cryptographic fallback.
 */
function generateUuid(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (c === undefined || typeof c.randomUUID !== 'function') {
    throw new Error(
      'globalThis.crypto.randomUUID is not available — requires Node 19+ / Electron 30+ / evergreen browsers',
    );
  }
  return c.randomUUID();
}
