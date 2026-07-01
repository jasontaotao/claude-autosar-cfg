// v1.16.0 — Script types re-exported for renderer access.
//
// The canonical definition lives in `src/main/script/types.ts` (it's
// co-located with the runner / handler that produces / consumes these
// shapes, and was authored there pre-renderer). Renderer code historically
// reached across the layer boundary via `@main/script/types`, which
// violates the README's "renderer must not import @main directly"
// invariant — even though every use was `import type`, the path alias
// lets ESLint / Vite resolve `@main` for non-type imports, so any
// future accidental runtime cross is one mistake away.
//
// This file re-exports the types under `@shared/script/types` so the
// renderer side has a sanctioned access path. The main side continues
// to import from its local copy (no change there). Type-only imports
// are stripped at compile time so this re-export costs zero runtime
// bytes in either bundle.
//
// Source-of-truth: `src/main/script/types.ts`. When extending these
// shapes, edit the original and let the re-export pick up the change.

export type {
  ScriptKind,
  ScriptEntry,
  ScriptSummary,
  ScriptLog,
  ScriptViolation,
  ScriptMutation,
  ScriptRunResult,
  ScriptStepWarning,
  ParamSnapshot,
  ParamValue,
} from '../../main/script/types.js';
