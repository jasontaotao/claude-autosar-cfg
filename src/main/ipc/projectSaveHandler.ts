// Sprint 11 Phase 1 — `project:save` IPC handler.
//
// The renderer sends the current manifest + any files whose content has
// changed since the last save. `files` may be empty if only the manifest
// changed (e.g. added a path without editing the doc).
//
// Main writes `files` first (each to its `path` field), then writes the
// manifest JSON to `manifestPath`. A write failure rolls forward and
// reports `write-failed`; partial state on disk is acceptable for
// Phase 1.
//
// Sprint 17b (H8) — pre-flight path-traversal check. Reject any path
// containing a `..` parent-traversal segment BEFORE touching the
// filesystem. This closes the renderer-forged-path CVE-shaped vector
// (`f.path = '../../etc/passwd'` would otherwise be written verbatim).
// We deliberately do NOT do full `isPathInside(manifestDir)` containment
// here because that would break the loose-mode back-compat contract
// documented below — users can open ARXMLs from anywhere and save
// back to the same path. Full containment is deferred to v1.5+.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { saveManifest } from '../../core/project/manifest.js';
import type { ProjectSaveRequest, ProjectSaveResult } from '../../shared/types.js';

/**
 * Atomic file write helper — Sprint v1.5.1 PR(4).
 *
 * Writes `content` to a unique temp file under the same directory as
 * `file`, fsyncs the temp, then `fs.rename`s it over the target. The
 * rename is atomic on POSIX and uses `MoveFileEx` with
 * `MOVEFILE_REPLACE_EXISTING` on Windows (Node delegates to the OS),
 * so readers always see either the old or the new content — never a
 * partial write.
 *
 * On any failure, the temp file is unlinked and the original `file`
 * (if any) is left untouched. The temp filename includes `pid` and a
 * monotonic timestamp to avoid collisions across concurrent writers
 * in the same directory.
 *
 * The trust-sprint invariant (v1.4.0) — "never partial-write a user's
 * project file" — is enforced here. Callers (project save handler,
 * script engine commit path) MUST route all ARXML / manifest writes
 * through this helper rather than calling `fs.writeFile` directly.
 *
 * @param file Absolute path of the target file.
 * @param content UTF-8 string content to write.
 */
export async function writeAtomic(file: string, content: string): Promise<void> {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(tmp, content, 'utf-8');
    // fsync the temp before rename so the bytes survive a crash. We
    // open the temp a second time in r+ (read+write) so the sync call
    // has a file descriptor to operate on — writeFile alone does not
    // surface the descriptor it used.
    const fh = await fs.open(tmp, 'r+');
    try {
      await fh.sync();
    } finally {
      await fh.close();
    }
    await fs.rename(tmp, file);
  } catch (err) {
    // Best-effort cleanup of the temp; ignore ENOENT (writeFile
    // failed before creating anything) and any other unlink failure.
    try {
      await fs.unlink(tmp);
    } catch {
      // intentional no-op
    }
    throw err;
  }
}

export async function projectSaveHandler(req: ProjectSaveRequest): Promise<ProjectSaveResult> {
  // Pre-flight: reject `..` parent-traversal segments in any write
  // path. The check uses `path.normalize(...).includes('..')` which
  // is the right primitive here — we want to refuse any path that,
  // when normalized, still contains a `..` segment (Windows drive
  // boundaries and mixed separators are handled by `path.normalize`).
  // The `isPathInside` helper in `register.ts` requires a fixed
  // `parent` argument we don't have in PROJECT_SAVE, so we can't
  // reuse it here.
  for (const f of req.files) {
    if (path.normalize(f.path).includes('..')) {
      return {
        kind: 'write-failed',
        message: `File path contains parent traversal: ${f.path}`,
      };
    }
  }
  if (path.normalize(req.manifestPath).includes('..')) {
    return {
      kind: 'write-failed',
      message: `Manifest path contains parent traversal: ${req.manifestPath}`,
    };
  }

  // Phase 1: files are written verbatim to their declared paths. We
  // don't constrain them to manifestDir because the renderer may have
  // intentionally captured an "Open ARXML" file that's elsewhere on
  // disk (the loose-mode back-compat contract). Path containment is
  // enforced on PROJECT_OPEN, not PROJECT_SAVE.
  for (const f of req.files) {
    try {
      await fs.writeFile(f.path, f.content, 'utf8');
    } catch (e) {
      return {
        kind: 'write-failed',
        message: `Failed to write ${f.path}: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }
  try {
    await fs.writeFile(req.manifestPath, saveManifest(req.manifest), 'utf8');
    return { kind: 'saved', path: req.manifestPath };
  } catch (e) {
    return {
      kind: 'write-failed',
      message: `Failed to write manifest: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
