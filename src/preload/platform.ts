// src/preload/platform.ts
// v1.6.0 Cluster U — expose `process.platform` to the renderer.
//
// Imported by `src/preload/index.ts` and added to the autosarApi
// bridge. The renderer reads this once to normalize `Mod` ↔
// `Cmd`/`Ctrl` for shortcut bindings (per U spec §6.4 + A+C §17 Q8
// — single SoT for cross-platform modifier resolution).
//
// Pure passthrough; no IPC round-trip required. The Electron
// contextBridge serializes primitives verbatim so a string round-trip
// works without per-call overhead.

/** Returns the host Node.js platform ('win32' | 'darwin' | 'linux' | ...).
 *  Mirrors `process.platform` verbatim. */
export function getRendererPlatform(): NodeJS.Platform {
  return process.platform;
}