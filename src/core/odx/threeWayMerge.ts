// ODX three-way merge — thin re-export of the generalized core/import module.
//
// The three-way merge logic moved to `src/core/import/threeWayMerge.ts` so the
// DBC full import can reuse it (spec forbids a second copy). This module keeps
// the ODX public surface stable, including `ImportDecision` (imported by the
// shared DBC IPC DTOs) and the `OdxImportRow` compatibility alias.

export {
  hashContainerForProvenance,
  classifyImportRows,
  collectImportContainers,
  mergeModuleThreeWay,
} from '../import/threeWayMerge.js';
export type {
  ImportDecision,
  ImportCategory,
  ImportManifestEntry,
  OdxImportRow,
} from '../import/threeWayMerge.js';
