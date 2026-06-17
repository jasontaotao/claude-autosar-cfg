// Sprint 13 #1 — public surface of the templates subsystem.
//
// Re-exports the discover + copy functions and the type shapes that
// downstream code (IPC handlers, future renderer code, tests) needs.
// Keeping this file tiny makes the dependency direction obvious:
// everything outside `src/main/templates/*` imports from here, never
// from the per-file modules directly.

export { discoverBuiltinTemplates, setTemplatesLogger } from './discover.js';
export { copyTemplateFilesToDir } from './copy.js';
export { parseTemplateManifest } from './parse-manifest.js';
export { walkArxml } from './walk-arxml.js';
export { classTemplateError } from './errors.js';
export type { BuiltinTemplate, TemplateManifest, CopyResult } from './types.js';
export type { TemplateError, TemplateErrorKind } from './errors.js';
