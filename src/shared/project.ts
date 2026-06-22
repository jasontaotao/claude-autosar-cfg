// Project manifest — Sprint 11 Phase 1.
//
// A project bundles together the value-side ARXMLs and BSWMDs that the user
// is currently working on. Persisted as a JSON file co-located with the
// ARXMLs (paths are relative to the manifest's directory).
//
// Design choices:
// - Identity = UUID + user-chosen name. NOT content hash — EB tresos
//   re-saves would otherwise force user-visible project renames.
// - Empty arrays are allowed (a freshly-created project has 0 docs / 0
//   BSWMDs until the user adds them).
// - Paths are stored as POSIX-style relative strings (use forward slashes
//   even on Windows so manifests are portable across machines).
// - `schemaVersion` starts at "1". Unknown fields are tolerated on read
//   to keep older clients from breaking on newer manifests.

import type { ScriptEntry } from '../main/script/types.js';

/** Current manifest schema version. Bump when shape changes incompatibly. */
export const MANIFEST_SCHEMA_VERSION = '1' as const;
export type ManifestSchemaVersion = typeof MANIFEST_SCHEMA_VERSION;

/**
 * On-disk project manifest.
 *
 * `id` is generated at `ProjectManifest` creation time and never mutated.
 * `name` is editable by the user (shown in the AppHeader / ProjectPanel).
 *
 * `valueArxmlPaths` and `bswmdPaths` are paths relative to the manifest's
 * directory. The main process resolves + reads them at project-open time.
 */
export interface ProjectManifest {
  readonly schemaVersion: ManifestSchemaVersion;
  readonly id: string;
  readonly name: string;
  readonly valueArxmlPaths: readonly string[];
  readonly bswmdPaths: readonly string[];

  /**
   * Bug 3 — provenance map for ECUC docs that were generated from a
   * BSWMD via the BSWMD-to-ECUC skeleton flow. Key is a
   * valueArxmlPaths entry (manifest-relative POSIX form); value is a
   * bswmdPaths entry (also manifest-relative). The field is optional
   * for backward compatibility with pre-Bug-3 manifests: when absent,
   * `loadManifest` normalises to `{}` and `openProject` hydrates each
   * ECUC doc's in-memory `sourceBswmdPath` against an empty map (which
   * matches the pre-fix behaviour — docs with no recorded source).
   *
   * The map is the on-disk source of truth for `sourceBswmdPath`; the
   * in-memory `ArxmlDocument.sourceBswmdPath` field is a cache that
   * `openProject` rehydrates from this map at project-open time.
   * Without this round-trip the chip count in `ProjectPanel` reads 0/N
   * after every restart even though the user created N ECUC docs from
   * a BSWMD — `sourceBswmdPath` was previously never serialised.
   */
  readonly ecucSources?: Readonly<Record<string, string>>;

  /**
   * Sprint 14 #1 — embedded scripts library. Optional for backward
   * compatibility with v1.0.0/v1.1.x manifests that predate the script
   * engine. When absent on disk, `loadManifest` normalises to `[]`.
   *
   * Each entry is the full source + metadata for a single user-authored
   * script (validator / transformer / report / free). The script
   * engine's `import-resolver` walks `imports[]` to build a DAG.
   */
  readonly scripts?: ReadonlyArray<ScriptEntry>;
}

/**
 * Sentinel used when the renderer is in "loose mode" (no project open).
 * Distinct from `ProjectManifest` so the store can use `project: ProjectManifest | null`
 * without ambiguity.
 */
export type LooseMode = null;
