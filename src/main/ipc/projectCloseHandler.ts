// v1.18.2 PATCH — PROJECT_CLOSE IPC handler.
//
// Symmetric counterpart to PROJECT_OPEN (`src/main/ipc/register.ts:214-300`).
// Resets the open-project manifest path state to null so subsequent
// path-containment checks (BSWMD_DELETE, PROJECT_WRITE_ARXML_BATCH)
// do not enforce containment against a stale path.
//
// Idempotent: calling close when no project is open is a no-op and
// still returns `{ kind: 'closed' }`. Mirrors Unix `close(2)` semantics
// and avoids the renderer needing to track "is a project open" state.
//
// The renderer (when it integrates PROJECT_CLOSE in v1.19.0 MINOR) can
// always call close without a guard.
//
// Extracted to its own module (mirrors `bswmdDeleteHandler.ts` pattern)
// so the pure-function handler is directly unit-testable without the
// full ipcMain round-trip.

import type { ProjectCloseResult } from '../../shared/types.js';

import { setOpenProjectManifestPath } from './project-manifest-state.js';

/**
 * Reset the open-project manifest path state to null. Returns the
 * canonical `closed` envelope. Pure function (no IO) — the `electron`
 * mock seam is only required at the register.ts handler-wrapping site.
 */
export function projectCloseHandler(): ProjectCloseResult {
  setOpenProjectManifestPath(null);
  return { kind: 'closed' };
}
