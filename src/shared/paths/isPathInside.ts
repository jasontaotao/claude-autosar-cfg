// shared/paths/isPathInside.ts
// Pure path-containment check. Returns true iff `child` is strictly
// inside `parent` (i.e. `child !== parent`). Hardened against:
//   - path traversal via `..` segments
//   - trailing slashes
//   - Windows case-insensitivity
//   - UNC paths (\\server\share\...)
//   - current-directory marker (.)
//   - double-slash normalization
//
// Used by `src/main/ipc/register.ts` (project-save handler) and
// available to core/ for future use (e.g. resource scoping).

import { isAbsolute, relative, sep } from 'node:path';

/**
 * Returns true iff `child` is strictly inside `parent`.
 * Both paths are normalized before comparison.
 */
export function isPathInside(child: string, parent: string): boolean {
  // Normalize trailing slashes
  const normChild = stripTrailingSep(child);
  const normParent = stripTrailingSep(parent);

  // Different drive on Windows → path.relative returns absolute path
  const rel = relative(normParent, normChild);

  // Empty rel means child === parent
  if (rel === '') return false;

  // Absolute rel means different drive (Windows) → not inside
  if (isAbsolute(rel)) return false;

  // Path traversal: starts with .. (with platform separator) → not inside
  if (rel === '..' || rel.startsWith(`..${sep}`)) return false;

  return true;
}

function stripTrailingSep(p: string): string {
  if (p.length === 0) return p;
  const last = p.charAt(p.length - 1);
  // Both POSIX (/) and Windows (\) separators
  if (last === '/' || last === '\\') {
    return p.slice(0, -1);
  }
  return p;
}
