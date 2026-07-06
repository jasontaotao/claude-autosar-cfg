// v1.25.0 T1 — pure mapper from user `.xlsx` rows to AUTOSAR mutation steps.
//
// v1.26.0 T2 — BSWMD-driven refactor. Sheet name maps to a module
// shortName; the container path is then resolved at call time via
// `lookupContainerDef` against a runtime-loaded `bswmds` map.
//
// Sheet → BSWMD module shortName (one-entry-per-sheet for v1.26.0;
// deferred Dem/Dcm kinds are explicitly out of scope):
//   ComIPdu         → Com
//   ComSignal       → Com
//   CanIfTxPdu      → CanIf
//   CanIfRxPdu      → CanIf
//   PduRRoutingPath → PduR
//
// One row → one `add-child` + zero-or-more `set-param` steps.
// Throws on unrecognized sheet (YAGNI guard), missing module in BSWMD
// map, missing container in BSWMD module, or empty shortName.
//
// v1.29.0 MINOR — in-line `[add-child + per-param set-param]` emission
// replaced by a single `addChildSiblingStep` call (shared with the Dcm
// mapper at `xlsxDcmServicesToEcucBatch.ts`). Pre-v1.29.0, the Com-stack
// mapper carried its own in-line construction at lines 82-99; v1.29.0
// consolidates the two mappers onto the shared helper per the spec at
// `docs/superpowers/specs/2026-07-06-v1-29-0-minor-com-stack-mapper-shape-alignment-design.md`.

import type { PatchStep } from '../../shared/headless/ipc-contract.js';
import type { EcucInstanceRow } from '../../shared/types.js';
import { lookupContainerDef, type BswModuleDef } from '../project/bswmd.js';

import { addChildSiblingStep } from './addChildSiblingStep.js';
import { stripBswmdPackageRoot } from './pathUtils.js';

export type { EcucInstanceRow };

const SHEET_TO_MODULE = {
  ComIPdu: 'Com',
  ComSignal: 'Com',
  CanIfTxPdu: 'CanIf',
  CanIfRxPdu: 'CanIf',
  PduRRoutingPath: 'PduR',
} as const;

export function xlsxToEcucBatch(
  rows: readonly EcucInstanceRow[],
  bswmds: ReadonlyMap<string, BswModuleDef>,
): PatchStep[] {
  const steps: PatchStep[] = [];
  for (const row of rows) {
    if (!row.shortName || row.shortName.length === 0) {
      throw new Error(`EcucInstanceRow missing shortName (sheet=${row.sheet})`);
    }
    if (!(row.sheet in SHEET_TO_MODULE)) {
      throw new Error(
        `Unrecognized sheet name: '${row.sheet}' (allowed: ${Object.keys(SHEET_TO_MODULE).join(', ')})`,
      );
    }
    const moduleShortName = SHEET_TO_MODULE[row.sheet as keyof typeof SHEET_TO_MODULE];
    const bswmd = bswmds.get(moduleShortName);
    if (bswmd === undefined) {
      throw new Error(
        `BSWMD map missing module '${moduleShortName}' (needed by sheet '${row.sheet}'). ` +
          `Provided modules: ${Array.from(bswmds.keys()).join(', ') || '<empty>'}`,
      );
    }
    const containerDef = lookupContainerDef(bswmd, row.sheet);
    if (containerDef === null) {
      throw new Error(
        `Container '${row.sheet}' not found in BSWMD module '${moduleShortName}'. ` +
          `Verify the BSWMD declares this container shortName.`,
      );
    }
    // Strip the BSWMD's package-root segment (`/<docRootPkg>/`). `ContainerDef.path`
    // is BSWMD-absolute (`/AUTOSAR/Com/ComConfig/ComIPdu`); the mutation engine and
    // downstream pipeline expect BSWMD-relative paths (`Com/ComConfig/ComIPdu`).
    // Strip the `/<docRootPkg>/` prefix so `applyPatchesToExtract`'s
    // `prefixDocRootPath` re-applies it cleanly. v1.28.0 MINOR uses the shared
    // `stripBswmdPackageRoot` helper (`core/bridge/pathUtils.ts`).
    const parentPath = stripBswmdPackageRoot(containerDef.path);

    // v1.29.0 MINOR — emit via the shared helper. Two carry-over semantics:
    //   1. `parentPath` (multi-segment leaf-parent) is provided directly;
    //      the helper does NOT need a `moduleShortName` to derive it.
    //   2. `definitionRef` is conditional — the Com-stack mapper only emits
    //      it when `row.definitionRef !== undefined`. The helper achieves
    //      this by treating `undefined` as "omit the `definitionRef` key".
    steps.push(
      ...addChildSiblingStep({
        parentPath,
        instanceShortName: row.shortName,
        // Conditional-spread idiom: pass `undefined` explicitly so the helper
        // sees `containerDefPath === undefined` and emits without the key.
        containerDefPath: row.definitionRef,
        instanceParams: row.params,
      }),
    );
  }
  return steps;
}
