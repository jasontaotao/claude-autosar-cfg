// v1.23.0 T2 — Pure DBC→Com-Stack mapper.
//
// Input:  DbcSummaryWithSignals + 3 ECUC value-side ARXML strings
// Output: PatchStep[] per file (comPatches, canIfPatches, pduRPatches)
//
// Idempotency: dedup by container shortName in each ECUC file. Re-running
// on an already-bridged project MUST NOT duplicate instances.
//
// v1.23.0 T2 fix-brief — the 5 blockers from the 8ba6e6d code review:
//
//   #1 (CRITICAL) — paths to CanIfTxPduCfgs / CanIfRxPduCfgs / PduRRoutingPath
//       are no longer hardcoded. They are derived from the parsed ARXML
//       at the start of each call by walking the ECUC module's
//       top-level container list (the canonical shortName comes from
//       the BSWMD, but the bridge never needs the BSWMD — it just reads
//       the value-side file's first child of the module's container
//       subtree). This makes the bridge work against both `CanIfInitCfg`
//       (real demo-ecu) and `CanIfInitConfig` (hand-crafted fixtures)
//       without modification.
//
//   #2 (HIGH) — parser.ts:418 `buildContainer` now reads <CONTAINERS>
//       in addition to <SUB-CONTAINERS>, mirroring `buildModule`.
//
//   #3 (HIGH) — add-child PatchStep carries an optional `kind`
//       discriminator (`com-ipdu` | `com-signal` | `canif-tx-pdu` |
//       `canif-rx-pdu` | `pdur-route`). The mutation engine ignores
//       `kind` — it is purely advisory metadata for plan consumers.
//
//   #4 (HIGH) — handled in the real-OEM test (separate file) by
//       mutating the fixture.
//
//   #5 (HIGH) — `targetNode: string` parameter dispatches Tx vs Rx:
//       `msg.transmitter === targetNode` → Tx, otherwise Rx. If
//       `targetNode` is omitted the bridge falls back to the legacy
//       "treat every message as Tx" behavior (documented in JSDoc).

import type { DbcSummaryWithSignals } from '../../main/ipc/dbcParseForBridgeHandler.js';
import type { PatchStep } from '../../shared/headless/ipc-contract.js';
import { parseArxml } from '../arxml/parser.js';
import { findEcucModuleByShortName } from '../arxml/path.js';
import type { ArxmlContainer, ArxmlElement, ArxmlModule } from '../arxml/types.js';

const COM_MODULE = 'Com';
const CANIF_MODULE = 'CanIf';
const PDUR_MODULE = 'PduR';

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
  /**
   * v1.23.0 T2 fix #5 — node name (matches DBC node shortName) that
   * identifies THIS ECU. Messages whose `transmitter` equals
   * `targetNode` are dispatched as Tx; others as Rx. If omitted, the
   * bridge falls back to the legacy "treat every message as Tx"
   * behavior — used by the bridge's pre-fix callers and the legacy
   * migration path. New callers MUST pass `targetNode`.
   */
  readonly targetNode?: string;
}

/**
 * Walk the parsed ARXML to find the ECUC module's primary container's
 * shortName. The ECUC value-side file convention is:
 *
 *   /<PkgName>/<ModuleName>/<PrimaryContainer>/<Instance>...
 *
 * where `<PrimaryContainer>` is the first (and typically only) child
 * of `<ModuleName>`'s `ECUC-MODULE-CONFIGURATION-VALUES` element.
 * Examples:
 *   /Com/Com/ComConfig
 *   /CanIf/CanIf/CanIfInitCfg   ← real demo-ecu
 *   /PduR/PduR/PduRRoutingPaths ← real demo-ecu
 *
 * @returns the discovered `<PrimaryContainer>` shortName, or null if
 *   the file is unparseable / malformed / module-not-found.
 */
function discoverPrimaryContainer(arxml: string, moduleName: string): string | null {
  const docRes = parseArxml(arxml);
  if (!docRes.ok) return null;
  const mod = findEcucModuleByShortName(docRes.value, moduleName);
  if (mod === null) return null;
  // First child is conventionally the primary container (ComConfig,
  // CanIfInitCfg, PduRRoutingPaths). Fall back to scanning all
  // children if the first is missing.
  for (const c of mod.children) {
    if (c.kind === 'module' || c.kind === 'container') return c.shortName;
  }
  return null;
}

/**
 * Walk the parsed ARXML to enumerate direct child shortNames of
 * `<ModuleName>/<PrimaryContainer>`. Used for idempotency dedup.
 */
function extractExistingChildShortNames(
  arxml: string,
  moduleName: string,
  primaryContainer: string,
): Set<string> {
  const out = new Set<string>();
  const docRes = parseArxml(arxml);
  if (!docRes.ok) return out;
  const mod = findEcucModuleByShortName(docRes.value, moduleName);
  if (mod === null) return out;
  const primary = findModuleOrContainerByShortName(mod.children, primaryContainer);
  if (primary === null) return out;
  for (const child of primary.children) {
    if (child.kind === 'reference' || child.kind === 'unknown') continue;
    if (child.shortName === undefined) continue;
    out.add(child.shortName);
  }
  return out;
}

/**
 * Walk the parsed ARXML to enumerate grandchild shortNames of
 * `<ModuleName>/<PrimaryContainer>` (i.e. children of the first
 * sub-container — for Com/ComConfig/ComIPdu we want the existing
 * ComIPdu names; for CanIf/CanIfInitCfg/CanIfTxPduCfgs we want the
 * existing CanIfTxPduCfg names, etc.).
 */
function extractExistingGrandchildShortNames(
  arxml: string,
  moduleName: string,
  primaryContainer: string,
  subContainer: string,
): Set<string> {
  const out = new Set<string>();
  const docRes = parseArxml(arxml);
  if (!docRes.ok) return out;
  const mod = findEcucModuleByShortName(docRes.value, moduleName);
  if (mod === null) return out;
  const primary = findModuleOrContainerByShortName(mod.children, primaryContainer);
  if (primary === null) return out;
  const sub = findModuleOrContainerByShortName(primary.children, subContainer);
  if (sub === null) return out;
  for (const child of sub.children) {
    if (child.kind === 'reference' || child.kind === 'unknown') continue;
    if (child.shortName === undefined) continue;
    out.add(child.shortName);
  }
  return out;
}

/**
 * Type-narrowed lookup: find the first child of `parent` whose
 * `shortName` matches `name` AND whose `kind` is `module` or
 * `container` (so `shortName` is guaranteed non-optional and
 * `children` is guaranteed present). Returns `null` on miss.
 */
function findModuleOrContainerByShortName(
  parent: readonly ArxmlElement[],
  name: string,
): ArxmlModule | ArxmlContainer | null {
  for (const c of parent) {
    if (c.kind !== 'module' && c.kind !== 'container') continue;
    if (c.shortName === name) return c;
  }
  return null;
}

/**
 * The Com primary container (`ComConfig`) directly holds ComIPdu
 * children — single-level walk.
 */
function extractExistingComIpduNames(arxml: string, primaryContainer: string): Set<string> {
  return extractExistingChildShortNames(arxml, COM_MODULE, primaryContainer);
}

/**
 * Walk the parsed ARXML to find the shortNames of the two CanIf
 * sub-containers under `CanIfInitCfg`:
 *
 *   <CanIfInitCfg>/<CanIfTxPduCfgs>/<CanIfTxPduCfg_0>
 *   <CanIfInitCfg>/<CanIfRxPduCfgs>/<CanIfRxPduCfg_0>
 *
 * The two sub-container names come from the BSWMD but the bridge
 * reads them from the value-side file (the value-side file always
 * has them present once at least one instance exists). If neither is
 * present (empty CanIfInitCfg), both names default to the BSWMD
 * canonical names so the dedup walk still works for new files.
 */
interface CanIfSubContainers {
  readonly txSubName: string;
  readonly rxSubName: string;
}

const CANIF_TX_SUBCANONICAL = 'CanIfTxPduCfgs';
const CANIF_RX_SUBCANONICAL = 'CanIfRxPduCfgs';

function discoverCanIfSubContainers(arxml: string, primaryContainer: string): CanIfSubContainers {
  const docRes = parseArxml(arxml);
  if (!docRes.ok) return { txSubName: CANIF_TX_SUBCANONICAL, rxSubName: CANIF_RX_SUBCANONICAL };
  const mod = findEcucModuleByShortName(docRes.value, CANIF_MODULE);
  if (mod === null) return { txSubName: CANIF_TX_SUBCANONICAL, rxSubName: CANIF_RX_SUBCANONICAL };
  const primary = findModuleOrContainerByShortName(mod.children, primaryContainer);
  if (primary === null) {
    return { txSubName: CANIF_TX_SUBCANONICAL, rxSubName: CANIF_RX_SUBCANONICAL };
  }
  const txChild = primary.children.find(
    (c): c is ArxmlModule | ArxmlContainer =>
      (c.kind === 'module' || c.kind === 'container') && c.shortName === CANIF_TX_SUBCANONICAL,
  );
  const rxChild = primary.children.find(
    (c): c is ArxmlModule | ArxmlContainer =>
      (c.kind === 'module' || c.kind === 'container') && c.shortName === CANIF_RX_SUBCANONICAL,
  );
  return {
    txSubName: txChild?.shortName ?? CANIF_TX_SUBCANONICAL,
    rxSubName: rxChild?.shortName ?? CANIF_RX_SUBCANONICAL,
  };
}

export function dbcToComStack(input: DbcToComStackInput): DbcBridgePlan {
  // #1 (CRITICAL) — discover container shortNames from the parsed ARXML
  // instead of using hardcoded constants. The fallback to BSWMD
  // canonical names (when the value-side file is empty) keeps the
  // bridge usable on fresh skeletons.
  const comPrimary = discoverPrimaryContainer(input.comConfig, COM_MODULE) ?? 'ComConfig';
  const canIfPrimary = discoverPrimaryContainer(input.canIfConfig, CANIF_MODULE) ?? 'CanIfInitCfg';
  const pduRPrimary = discoverPrimaryContainer(input.pduRConfig, PDUR_MODULE) ?? 'PduRRoutingPaths';
  const canIfSubs = discoverCanIfSubContainers(input.canIfConfig, canIfPrimary);

  const existingComIpdu = extractExistingComIpduNames(input.comConfig, comPrimary);
  const existingCanIfTx = extractExistingGrandchildShortNames(
    input.canIfConfig,
    CANIF_MODULE,
    canIfPrimary,
    canIfSubs.txSubName,
  );
  const existingCanIfRx = extractExistingGrandchildShortNames(
    input.canIfConfig,
    CANIF_MODULE,
    canIfPrimary,
    canIfSubs.rxSubName,
  );
  const existingPduRRoutes = extractExistingChildShortNames(
    input.pduRConfig,
    PDUR_MODULE,
    pduRPrimary,
  );

  const comPatches: PatchStep[] = [];
  const canIfPatches: PatchStep[] = [];
  const pduRPatches: PatchStep[] = [];

  for (const msg of input.dbc.messages) {
    const signals = input.dbc.signals?.filter((s) => s.messageId === msg.id) ?? [];

    // ComIPdu (skip if exists)
    if (!existingComIpdu.has(msg.name)) {
      comPatches.push({
        op: 'add-child',
        parentPath: `/${COM_MODULE}/${COM_MODULE}/${comPrimary}/${msg.name}`,
        shortName: msg.name,
        definitionRef: `/AUTOSAR/Com/${comPrimary}/ComIPdu`,
        kind: 'com-ipdu',
      });
      // ComSignal children
      for (const sig of signals) {
        comPatches.push({
          op: 'add-child',
          parentPath: `/${COM_MODULE}/${COM_MODULE}/${comPrimary}/${msg.name}/${sig.name}`,
          shortName: sig.name,
          definitionRef: `/AUTOSAR/Com/${comPrimary}/ComIPdu/ComSignal`,
          kind: 'com-signal',
        });
      }
    }

    // #5 (HIGH) — Tx vs Rx dispatched on msg.transmitter === targetNode.
    // Legacy fallback (no targetNode): treat every message as Tx.
    const isTx = input.targetNode === undefined || msg.transmitter === input.targetNode;
    if (isTx) {
      if (!existingCanIfTx.has(msg.name)) {
        canIfPatches.push({
          op: 'add-child',
          parentPath: `/${CANIF_MODULE}/${CANIF_MODULE}/${canIfPrimary}/${canIfSubs.txSubName}/${msg.name}`,
          shortName: msg.name,
          definitionRef: `/AUTOSAR/CanIf/${canIfPrimary}/${canIfSubs.txSubName}/CanIfTxPduCfg`,
          kind: 'canif-tx-pdu',
        });
      }
    } else {
      if (!existingCanIfRx.has(msg.name)) {
        canIfPatches.push({
          op: 'add-child',
          parentPath: `/${CANIF_MODULE}/${CANIF_MODULE}/${canIfPrimary}/${canIfSubs.rxSubName}/${msg.name}`,
          shortName: msg.name,
          definitionRef: `/AUTOSAR/CanIf/${canIfPrimary}/${canIfSubs.rxSubName}/CanIfRxPduCfg`,
          kind: 'canif-rx-pdu',
        });
      }
    }

    // PduR routing path
    if (!existingPduRRoutes.has(msg.name)) {
      pduRPatches.push({
        op: 'add-child',
        parentPath: `/${PDUR_MODULE}/${PDUR_MODULE}/${pduRPrimary}/${msg.name}`,
        shortName: msg.name,
        definitionRef: `/AUTOSAR/PduR/${pduRPrimary}/PduRRoutingPath`,
        kind: 'pdur-route',
      });
    }
  }

  return { comPatches, canIfPatches, pduRPatches };
}
