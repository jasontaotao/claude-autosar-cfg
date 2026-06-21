// Sprint 14 #1 — script engine barrel re-exports.
//
// Phase A exports the 6 core modules; Phase B (this) exposes them as a
// single entry point for the IPC handler (and for future Phase C
// renderer-side imports, if any). Pure re-exports — no logic.

// Public API for the IPC handler.
export { runInSandbox, parseStackLocation, mapErrorLine } from './vm-runner.js';
export { buildScriptCtx, findElementByPath } from './ctx.js';
export { resolveImports, parseImports, hasExport, detectCycles } from './import-resolver.js';
export { classScriptError, validateShortName, ScriptError } from './errors.js';
export type { ScriptErrorKind, ScriptErrorPayload } from './errors.js';

// Types used across the engine + IPC contract.
export type {
  ScriptEntry,
  ScriptKind,
  ScriptLog,
  ScriptMutation,
  ScriptRunResult,
  ScriptSummary,
  ScriptViolation,
  ParamSnapshot,
  ParamValue,
} from './types.js';
