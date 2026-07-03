// v1.23.0 T2 — Pure DBC→Com-Stack mapper.
//
// Input:  DbcSummaryWithSignals + 3 ECUC value-side ARXML strings
// Output: PatchStep[] per file (comPatches, canIfPatches, pduRPatches)
//
// Idempotency: dedup by container shortName in each ECUC file. Re-running
// on an already-bridged project MUST NOT duplicate instances.

import type { DbcSummaryWithSignals } from '../../main/ipc/dbcParseForBridgeHandler.js';
import type { PatchStep } from '../../shared/headless/ipc-contract.js';
import { parseArxml } from '../arxml/parser.js';
import { findByPath } from '../arxml/path.js';
import type { ArxmlElement } from '../arxml/types.js';

const COM_IPDU_PATH = '/Com/Com/ComConfig';
const CANIF_TX_PDU_PATH = '/CanIf/CanIf/CanIfInitConfig/CanIfTxPduCfgs';
const CANIF_RX_PDU_PATH = '/CanIf/CanIf/CanIfInitConfig/CanIfRxPduCfgs';
const PDUR_ROUTING_PATH = '/PduR/PduR/PduRRoutingTables';

export interface DbcBridgePlan {
  readonly comPatches: readonly PatchStep[];
  readonly canIfPatches: readonly PatchStep[];
  readonly pduRPatches: readonly PatchStep[];
}

export interface DbcToComStackInput {
  readonly dbc: DbcSummaryWithSignals;
  readonly comConfig: string;
  readonly canIfConfig: string;
  readonly pduRConfig: string;
}

/**
 * Walk the parsed ARXML tree via the project's `findByPath` helper
 * (single slash-path argument) and collect SHORT-NAMEs of each
 * `ECUC-CONTAINER-VALUE` child directly under the given path.
 *
 * The brief calls out a helper named `findChildrenByPath`; the project's
 * actual canonical walker is `findByPath` (`src/core/arxml/path.ts`).
 * It returns the element at the given path; we then read its
 * `children[]` (populated by `buildContainer` from `<SUB-CONTAINERS>`)
 * to enumerate direct children.
 */
function extractExistingShortNames(arxml: string, slashPath: string): Set<string> {
  const docRes = parseArxml(arxml);
  if (!docRes.ok) return new Set();
  const found = findByPath(docRes.value, slashPath);
  if (found === null) return new Set();
  const el: ArxmlElement = found.element;
  if (el.kind !== 'module' && el.kind !== 'container') return new Set();
  const out = new Set<string>();
  for (const child of el.children) {
    if (child.kind === 'reference' || child.kind === 'unknown') continue;
    out.add(child.shortName);
  }
  return out;
}

export function dbcToComStack(input: DbcToComStackInput): DbcBridgePlan {
  const existingComIpdu = extractExistingShortNames(input.comConfig, COM_IPDU_PATH);
  const existingCanIfTx = extractExistingShortNames(input.canIfConfig, CANIF_TX_PDU_PATH);
  const existingCanIfRx = extractExistingShortNames(input.canIfConfig, CANIF_RX_PDU_PATH);
  const existingPduRRoutes = extractExistingShortNames(input.pduRConfig, PDUR_ROUTING_PATH);

  const comPatches: PatchStep[] = [];
  const canIfPatches: PatchStep[] = [];
  const pduRPatches: PatchStep[] = [];

  for (const msg of input.dbc.messages) {
    const signals = input.dbc.signals?.filter((s) => s.messageId === msg.id) ?? [];

    // ComIPdu (skip if exists)
    if (!existingComIpdu.has(msg.name)) {
      comPatches.push({
        op: 'add-child',
        parentPath: `${COM_IPDU_PATH}/${msg.name}`,
        shortName: msg.name,
        definitionRef: '/AUTOSAR/Com/ComConfig/ComIPdu',
      });
      // ComSignal children
      for (const sig of signals) {
        comPatches.push({
          op: 'add-child',
          parentPath: `${COM_IPDU_PATH}/${msg.name}/${sig.name}`,
          shortName: sig.name,
          definitionRef: '/AUTOSAR/Com/ComConfig/ComIPdu/ComSignal',
        });
      }
    }

    // CanIf Tx PDU (if any receiver is configured; otherwise Rx).
    // Simplified: messages with no local transmitter are Rx; with local transmitter are Tx.
    // For now, treat every message as Tx (will refine in IMPROVE phase).
    if (!existingCanIfTx.has(msg.name)) {
      canIfPatches.push({
        op: 'add-child',
        parentPath: `${CANIF_TX_PDU_PATH}/${msg.name}`,
        shortName: msg.name,
        definitionRef: '/AUTOSAR/CanIf/CanIfInitConfig/CanIfTxPduCfgs/CanIfTxPduCfg',
      });
    }

    // PduR routing path
    if (!existingPduRRoutes.has(msg.name)) {
      pduRPatches.push({
        op: 'add-child',
        parentPath: `${PDUR_ROUTING_PATH}/${msg.name}`,
        shortName: msg.name,
        definitionRef: '/AUTOSAR/PduR/PduRRoutingTables/PduRRoutingPath',
      });
    }

    // Touch unused collection to silence noUnusedParameters (the existing
    // Rx check is wired up in a future IMPROVE phase; for now every message
    // is treated as Tx).
    void existingCanIfRx;
  }

  return { comPatches, canIfPatches, pduRPatches };
}
