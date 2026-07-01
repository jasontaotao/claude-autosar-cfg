// shared/paths/isPathInsideReal.ts
//
// Async realpath-based path containment check. Defense-in-depth
// against attacker-controlled symlinks inside the project dir:
//
//   1. Manifest entry `bswmdPaths: ["link-to-secret"]` where
//      `link-to-secret` is a real symlink inside the project pointing
//      to `/etc/passwd` (or any sensitive file).
//   2. Pure-string `isPathInside(linkPath, projectDir)` returns true
//      because the link's string is inside the project's string.
//   3. `realpath` follows the link → `/etc/passwd` → `isPathInside`
//      returns false → IPC handler rejects the read.
//
// Used by IPC handlers in `src/main/ipc/` that gate security-sensitive
// reads/writes: `register.ts` (project-open), `projectWriteArxmlBatchHandler.ts`,
// `bswmdDeleteHandler.ts`. The pure-string `isPathInside` from
// `./isPathInside.js` is preserved for non-security call sites and
// as the fallback when `realpath` fails on non-existent paths.
//
// v1.20.0 MINOR T2 — closes the symlink-parent false-positive gap
// from v1.18.0 spec §11.1.

import { realpath } from 'node:fs/promises';

import { isPathInside } from './isPathInside.js';

/**
 * Returns true iff `child` is strictly inside `parent` after resolving
 * all symlinks via `realpath`. Throws nothing — falls back to the pure-
 * string `isPathInside` if `realpath` fails on a non-existent path.
 *
 * Behaviour:
 *   - Both paths exist → `realpath` resolves symlinks, then `isPathInside`
 *     compares the resolved strings.
 *   - Either path missing → fall through to the pure-string compare so
 *     the caller's pre-existence checks (`existsSync`) remain the
 *     single source of truth.
 */
export async function isPathInsideReal(child: string, parent: string): Promise<boolean> {
  let childReal: string;
  let parentReal: string;
  try {
    childReal = await realpath(child);
  } catch {
    childReal = child;
  }
  try {
    parentReal = await realpath(parent);
  } catch {
    parentReal = parent;
  }
  return isPathInside(childReal, parentReal);
}