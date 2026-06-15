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
} from './validate.js';

export { ECUC_SUBSET_SCHEMA, lookupSchema, allSchemaPaths } from './schema/ecucSubset.js';
