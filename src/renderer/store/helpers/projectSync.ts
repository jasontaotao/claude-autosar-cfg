// src/renderer/store/helpers/projectSync.ts
// Project-sync helpers (Sprint 11 Phase 1) + BSWMD manifest sync (Sprint
// 12 #2) + revalidate-with-BSWMD + parseArxmlOrThrow. Extracted from
// useArxmlStore.ts in PR(5) — pure refactor.

import { parseArxml } from '@core/arxml/parser';
import type { ArxmlDocument } from '@core/arxml/types';
import type { BswmdDocument } from '@core/project/bswmd.js';
import { buildSchemaLayer, validateProjectForRenderer } from '@core/validation';
import type { ValidationError } from '@core/validation';
import { toManifestRelative } from '@shared/path';
import type { ProjectManifest } from '@shared/project';

/**
 * Return a new manifest with `path` appended to valueArxmlPaths, or the
 * unchanged `m` if `m === null` (loose mode) or the path is already
 * present. Pure — produces a new manifest reference only when needed.
 *
 * Sprint 16b T6 — `manifestDir` is the directory of the saved manifest
 * (the parent of `state.projectPath`). When supplied, `path` is
 * relativised against `manifestDir` before being stored so the on-disk
 * manifest stays valid (classifyBadPath rejects absolute paths).
 * `toManifestRelative` returns `null` when the path is on a different
 * drive / outside the manifest dir; in that case we fall back to the
 * raw absolute path so the next save round-trip surfaces an
 * 'invalid-path' / 'absolute' error and the user notices the mistake.
 */
export function projectSyncAddPath(
  m: ProjectManifest | null,
  path: string,
  manifestDir: string | null,
): ProjectManifest | null {
  if (m === null) return m;
  const rel = manifestDir !== null ? (toManifestRelative(manifestDir, path) ?? path) : path;
  if (m.valueArxmlPaths.includes(rel)) return m;
  return { ...m, valueArxmlPaths: [...m.valueArxmlPaths, rel] };
}

/**
 * Return a new manifest with `path` removed from valueArxmlPaths, or the
 * unchanged `m` if `m === null` (loose mode) or the path isn't present.
 *
 * Sprint 16b T6 — try both the relativised form and the raw absolute
 * form so removing a doc by its absolute filePath also drops the
 * relative manifest entry that was written by `projectSyncAddPath`.
 */
export function projectSyncRemovePath(
  m: ProjectManifest | null,
  path: string,
  manifestDir: string | null,
): ProjectManifest | null {
  if (m === null) return m;
  const rel = manifestDir !== null ? (toManifestRelative(manifestDir, path) ?? path) : path;
  if (!m.valueArxmlPaths.includes(rel) && !m.valueArxmlPaths.includes(path)) {
    return m;
  }
  return {
    ...m,
    valueArxmlPaths: m.valueArxmlPaths.filter((p) => p !== rel && p !== path),
  };
}

/**
 * Sprint 12 #2 — BSWMD counterpart of `projectSyncAddPath`. Returns a
 * new manifest with `path` appended to `bswmdPaths`, or the unchanged
 * `m` if `m === null` (loose mode) or the path is already present.
 * Pure — produces a new manifest reference only when needed.
 *
 * Sprint 16b T6 — `manifestDir` mirrors `projectSyncAddPath`. The
 * relativisation contract is identical (null on cross-drive, fall back
 * to absolute).
 */
export function projectSyncAddBswmdPath(
  m: ProjectManifest | null,
  path: string,
  manifestDir: string | null,
): ProjectManifest | null {
  if (m === null) return m;
  const rel = manifestDir !== null ? (toManifestRelative(manifestDir, path) ?? path) : path;
  if (m.bswmdPaths.includes(rel)) return m;
  return { ...m, bswmdPaths: [...m.bswmdPaths, rel] };
}

/**
 * Sprint 12 #2 — BSWMD counterpart of `projectSyncRemovePath`. Returns
 * a new manifest with `path` removed from `bswmdPaths`, or the
 * unchanged `m` if `m === null` (loose mode) or the path isn't
 * present.
 *
 * Sprint 16b T6 — try both the relativised form and the raw absolute
 * form so removing a BSWMD by its absolute filePath also drops the
 * relative manifest entry that was written by `projectSyncAddBswmdPath`.
 */
export function projectSyncRemoveBswmdPath(
  m: ProjectManifest | null,
  path: string,
  manifestDir: string | null,
): ProjectManifest | null {
  if (m === null) return m;
  const rel = manifestDir !== null ? (toManifestRelative(manifestDir, path) ?? path) : path;
  if (!m.bswmdPaths.includes(rel) && !m.bswmdPaths.includes(path)) {
    return m;
  }
  return {
    ...m,
    bswmdPaths: m.bswmdPaths.filter((p) => p !== rel && p !== path),
  };
}

/**
 * Bug 3 — record provenance for an ECUC doc that was generated from a
 * BSWMD via the BSWMD-to-ECUC skeleton flow. Returns a new manifest
 * with `ecucSources[ecucRel] = bswmdRel` set; the unchanged `m` when
 * `m === null` (loose mode) or the pair is already recorded.
 *
 * Both keys are stored in the same manifest-relative POSIX form as
 * `valueArxmlPaths` / `bswmdPaths`. The caller is responsible for
 * providing the relativised paths (the IPC flow in
 * `useCreateEcucFromBswmd` does the relativisation once and then
 * hands both ends to this helper).
 */
export function projectSyncSetEcucSource(
  m: ProjectManifest | null,
  ecucRel: string,
  bswmdRel: string,
): ProjectManifest | null {
  if (m === null) return m;
  const existing = m.ecucSources ?? {};
  if (existing[ecucRel] === bswmdRel) return m;
  return {
    ...m,
    ecucSources: { ...existing, [ecucRel]: bswmdRel },
  };
}

/**
 * Bug 3 — drop the provenance record for an ECUC doc that has been
 * removed from the project. Returns a new manifest without the key
 * when it was present; the unchanged `m` when `m === null` (loose
 * mode) or the key was already absent. Pure — does not mutate.
 */
export function projectSyncRemoveEcucSource(
  m: ProjectManifest | null,
  ecucRel: string,
): ProjectManifest | null {
  if (m === null) return m;
  const existing = m.ecucSources ?? {};
  if (!(ecucRel in existing)) return m;
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(existing)) {
    if (k !== ecucRel) next[k] = v;
  }
  return { ...m, ecucSources: next };
}

/**
 * Sprint 12 #2 — re-validate the current document set against the given
 * BSWMD schema set. Shared by `addBswmd` (post-add) and `removeBswmd`
 * (post-remove) so the build-layer / dispatch / timestamp trio is
 * kept consistent. Pure — only reads its inputs, returns a partial
 * state object for the caller to spread into `set()`.
 */
export function revalidateWithBswmd(
  documents: readonly ArxmlDocument[],
  schemas: readonly BswmdDocument[],
): { readonly validationErrors: readonly ValidationError[]; readonly lastValidatedAt: number } {
  return {
    validationErrors: validateProjectForRenderer(documents, {
      schemaLayer: buildSchemaLayer(schemas),
    }),
    lastValidatedAt: Date.now(),
  };
}

/**
 * Parse ARXML content synchronously. Wraps `parseArxml` (which returns a
 * `Result`) so the store can fail-fast on a corrupt entry returned by
 * the IPC handler. Throws on parse failure — the IPC layer is supposed
 * to surface bad files as `read-failed`, not deliver garbage.
 */
export function parseArxmlOrThrow(content: string): ArxmlDocument {
  const result = parseArxml(content);
  if (!result.ok) {
    throw new Error(`openProject: ARXML parse failed: ${result.error.kind}`);
  }
  return result.value;
}
