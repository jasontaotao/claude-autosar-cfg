// v1.25.0 T1 — pure mapper from user `.xlsx` rows to AUTOSAR mutation steps.
//
// Sheet → ECUC parent path (one-entry-per-sheet for v1.25.0; deferred
// Dem/Dcm kinds are explicitly out of scope):
//   ComIPdu         → Com/ComConfig/ComIpdu
//   ComSignal       → Com/ComConfig/ComSignal
//   CanIfTxPdu      → CanIf/CanIfConfig/CanIfTxPdu
//   CanIfRxPdu      → CanIf/CanIfConfig/CanIfRxPdu
//   PduRRoutingPath → PduR/PduRRoutingTables/PduRRoutingPath
//
// One row → one `add-child` + zero-or-more `set-param` steps.
// Throws on unrecognized sheet (YAGNI guard) or empty shortName.

import type { PatchStep } from '../../shared/headless/ipc-contract.js';
import type { EcucInstanceRow } from '../../shared/types.js';

export type { EcucInstanceRow };

const SHEET_TO_PARENT_PATH = {
  ComIPdu: 'Com/ComConfig/ComIpdu',
  ComSignal: 'Com/ComConfig/ComSignal',
  CanIfTxPdu: 'CanIf/CanIfConfig/CanIfTxPdu',
  CanIfRxPdu: 'CanIf/CanIfConfig/CanIfRxPdu',
  PduRRoutingPath: 'PduR/PduRRoutingPaths/PduRRoutingPath',
} as const;

export function xlsxToEcucBatch(rows: readonly EcucInstanceRow[]): PatchStep[] {
  const steps: PatchStep[] = [];
  for (const row of rows) {
    if (!row.shortName || row.shortName.length === 0) {
      throw new Error(`EcucInstanceRow missing shortName (sheet=${row.sheet})`);
    }
    if (!(row.sheet in SHEET_TO_PARENT_PATH)) {
      throw new Error(
        `Unrecognized sheet name: '${row.sheet}' (allowed: ${Object.keys(SHEET_TO_PARENT_PATH).join(', ')})`,
      );
    }
    const parentPath = SHEET_TO_PARENT_PATH[row.sheet];

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
