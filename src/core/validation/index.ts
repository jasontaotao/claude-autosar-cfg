// Validation barrel — public API for the validation module.
// Renderer consumes from '@core/validation'; core internal code
// imports directly from submodules for tighter coupling.

export * from './types.js';
export {
  validate,
  validateProject,
  buildPathIndex,
  extractReferences,
  checkCrossRefs,
  checkRefDests,
  checkRefCycles,
  normalizePath,
  tryStripTypeSegment,
  resolveTargetPath,
  tryResolveByShortName,
  tryResolveByShortNameWithIndex,
  buildShortNameIndex,
} from './validate.js';

export { validateProjectForRenderer } from './dispatch.js';
export type { ValidationLevel, DispatchOptions } from './dispatch.js';

export { ECUC_CONTAINER_SCHEMA, lookupSchema, lookupContainerSchema } from './schema/ecucSubset.js';

// Sprint 12 #2 — expose the runtime BSWMD-derived schema layer so the
// renderer can build a layer from loaded BSWMD files and pass it into
// validateProjectForRenderer / validateProject / validate without
// importing internal submodules.
export {
  buildSchemaLayer,
  findModuleForPath,
  lookupSchemaAcrossModuleRoots,
  lookupContainerSchemaAcrossModuleRoots,
} from './runtimeSchema.js';
export type { SchemaLayer } from './runtimeSchema.js';
