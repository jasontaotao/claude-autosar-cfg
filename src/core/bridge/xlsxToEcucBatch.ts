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

import type { PatchStep } from '../../shared/headless/ipc-contract.js';
import type { EcucInstanceRow } from '../../shared/types.js';
import { lookupContainerDef, type BswModuleDef } from '../project/bswmd.js';

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
    // Strip the BSWMD's package-root segment (`/<docRootPkg>/`). This assumes the
    // BSWMD module's package root matches the runtime value-side doc's package
    // shortName (currently always `AUTOSAR` for demo + real-OEM fixtures). If a
    // future BSWMD lives under a different package root than its value-side doc,
    // this strip will over-strip — defer to v1.27.0 for consolidation.
    // `ContainerDef.path` is BSWMD-absolute (`/AUTOSAR/Com/ComConfig/ComIPdu`);
    // the mutation engine and downstream pipeline expect BSWMD-relative
    // paths (`Com/ComConfig/ComIPdu`). Strip the `/<docRootPkg>/` prefix so
    // T3's `prefixDocRootPath` re-applies it cleanly.
    const relativePath = containerDef.path.replace(/^\/[^/]+\//, '');
    const parentPath = relativePath;

    // buildComIPduStep / buildComSignalStep / etc. are kept as inline branches
    // (no helper file) because their body is 4 lines each and inlining keeps
    // the data flow readable. If v1.25.x PATCH adds per-kind defaults (e.g.,
    // ComIPdu initial ComPduId), this becomes the seam for a helper module.
    const addChildBase = {
      op: 'add-child' as const,
      parentPath,
      shortName: row.shortName,
      ...(row.definitionRef !== undefined && { definitionRef: row.definitionRef }),
    };
    steps.push(addChildBase);

    const containerPath = `${parentPath}/${row.shortName}`;
    for (const [paramName, value] of Object.entries(row.params)) {
      if (value === null || value === undefined) continue;
      steps.push({
        op: 'set-param',
        containerPath,
        paramName,
        value: value as string | number | boolean,
      });
    }
  }
  return steps;
}
