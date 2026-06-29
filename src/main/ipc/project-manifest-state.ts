// v1.15.5 — module-level state for the currently-open project.
//
// `bswmdDeleteHandler` is stateless from the IPC perspective (the
// renderer only sends `filePath`) but path-containment requires knowing
// the manifest's directory. We mirror the `_manifestPath` pattern from
// `script-handler.ts` to expose a tiny getter/setter that
// `projectNewHandler` / `projectOpenHandler` call on entry, and
// `bswmdDeleteHandler` reads when enforcing containment.
//
// This is process-wide state (single main process, single open project).
// It is intentionally NOT a Zustand store — main has no React, and the
// state is only consumed by other main-process modules.

let _openProjectManifestPath: string | null = null;

export function setOpenProjectManifestPath(p: string | null): void {
  _openProjectManifestPath = p;
}

export function getOpenProjectManifestPath(): string | null {
  return _openProjectManifestPath;
}

/**
 * Test-only reset hook. Kept narrow (one function) so the surface is
 * hard to misuse. Production code never calls this; only tests that
 * need a clean slate between cases.
 */
export function __resetOpenProjectManifestPathForTests(): void {
  _openProjectManifestPath = null;
}