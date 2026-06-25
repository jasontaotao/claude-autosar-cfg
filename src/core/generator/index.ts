// core/generator/index.ts
//
// Public API barrel for the BSW C code generator. Re-exports the
// pipeline orchestrator, the registry primitives, the post-process
// writer, the normalizer, and the diagnostic channel so downstream
// callers (CLI surface, integration tests) only need a single import.
//
// Re-export surface is intentionally narrow — internal helpers (emit/*,
// templates/*) are NOT exposed here. Add to this file only when a new
// integration boundary needs the symbol.

export { runPipeline } from './pipeline.js';
export type { PipelineArgs, PipelineResult } from './pipeline.js';

export {
  registerGenerator,
  getGenerator,
  _resetRegistryForTest,
  type ModuleGenerator,
  type GeneratedArtifact,
  type GenerationContext,
  type GenerationVariant,
} from './registry.js';

export { writeOutputTree } from './post-process.js';

export { normalizeToTree } from './normalize.js';

export {
  DiagnosticSeverity,
  DiagnosticCode,
  type Diagnostic,
  type DiagnosticSeverityValue,
  type DiagnosticCodeValue,
} from './diagnostics.js';
