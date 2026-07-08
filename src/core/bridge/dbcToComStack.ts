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
import type { ArxmlContainer, ArxmlDocument, ArxmlElement, ArxmlModule } from '../arxml/types.js';
import type { Result } from '../arxml/types.js';
import type { ParseError } from '../arxml/parser.js';

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
 * v1.38.0 MINOR T5 M4 — accepts the pre-parsed `Result` so the bridge
 * parses each input ARXML exactly once instead of re-parsing inside each
 * helper call. Returns null when the parse failed or the module is absent.
 */
function discoverPrimaryContainer(
  parsed: Result<ArxmlDocument, ParseError>,
  moduleName: string,
): string | null {
  if (!parsed.ok) return null;
  const mod = findEcucModuleByShortName(parsed.value, moduleName);
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
 * v1.38.0 MINOR T5 M4 — accepts the pre-parsed `Result`.
 */
function extractExistingChildShortNames(
  parsed: Result<ArxmlDocument, ParseError>,
  moduleName: string,
  primaryContainer: string,
): Set<string> {
  const out = new Set<string>();
  if (!parsed.ok) return out;
  const mod = findEcucModuleByShortName(parsed.value, moduleName);
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
 * v1.38.0 MINOR T5 M4 — accepts the pre-parsed `Result`.
 */
function extractExistingGrandchildShortNames(
  parsed: Result<ArxmlDocument, ParseError>,
  moduleName: string,
  primaryContainer: string,
  subContainer: string,
): Set<string> {
  const out = new Set<string>();
  if (!parsed.ok) return out;
  const mod = findEcucModuleByShortName(parsed.value, moduleName);
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
 * v1.38.0 MINOR T5 M4 — accepts the pre-parsed `Result`.
 */
function extractExistingComIpduNames(
  parsed: Result<ArxmlDocument, ParseError>,
  primaryContainer: string,
): Set<string> {
  return extractExistingChildShortNames(parsed, COM_MODULE, primaryContainer);
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
// v1.38.0 MINOR T5 M3 — vendor-dialect aliases. Real OEM ARXMLs occasionally
// rename the canonical `CanIfTxPduCfgs` / `CanIfRxPduCfgs` sub-containers
// (Vector's `CanIfTxPduCfg` / `CanIfRxPduCfg` singular form, EB tresos's
// `CanIfTxPdu` / `CanIfRxPdu`, etc.). When the canonical name lookup fails,
// the bridge should still recognize the vendor variant so the dedup walk
// reads existing children instead of falling through to the canonical
// default (which would cause a second bridge pass to create duplicate Tx
// containers).
const CANIF_TX_SUBCANONICAL_ALIASES: readonly string[] = ['CanIfTxPduCfg', 'CanIfTxPdu'];
const CANIF_RX_SUBCANONICAL_ALIASES: readonly string[] = ['CanIfRxPduCfg', 'CanIfRxPdu'];

function findCanIfSubChild(
  parent: { children: readonly ArxmlElement[] },
  canonical: string,
  aliases: readonly string[],
): ArxmlModule | ArxmlContainer | undefined {
  const direct = parent.children.find(
    (c): c is ArxmlModule | ArxmlContainer =>
      (c.kind === 'module' || c.kind === 'container') && c.shortName === canonical,
  );
  if (direct !== undefined) return direct;
  for (const alias of aliases) {
    const hit = parent.children.find(
      (c): c is ArxmlModule | ArxmlContainer =>
        (c.kind === 'module' || c.kind === 'container') && c.shortName === alias,
    );
    if (hit !== undefined) return hit;
  }
  return undefined;
}

function discoverCanIfSubContainers(
  parsed: Result<ArxmlDocument, ParseError>,
  primaryContainer: string,
): CanIfSubContainers {
  if (!parsed.ok) {
    return { txSubName: CANIF_TX_SUBCANONICAL, rxSubName: CANIF_RX_SUBCANONICAL };
  }
  const mod = findEcucModuleByShortName(parsed.value, CANIF_MODULE);
  if (mod === null) {
    return { txSubName: CANIF_TX_SUBCANONICAL, rxSubName: CANIF_RX_SUBCANONICAL };
  }
  const primary = findModuleOrContainerByShortName(mod.children, primaryContainer);
  if (primary === null) {
    return { txSubName: CANIF_TX_SUBCANONICAL, rxSubName: CANIF_RX_SUBCANONICAL };
  }
  const txChild = findCanIfSubChild(primary, CANIF_TX_SUBCANONICAL, CANIF_TX_SUBCANONICAL_ALIASES);
  const rxChild = findCanIfSubChild(primary, CANIF_RX_SUBCANONICAL, CANIF_RX_SUBCANONICAL_ALIASES);
  return {
    txSubName: txChild?.shortName ?? CANIF_TX_SUBCANONICAL,
    rxSubName: rxChild?.shortName ?? CANIF_RX_SUBCANONICAL,
  };
}

export function dbcToComStack(input: DbcToComStackInput): DbcBridgePlan {
  // v1.38.0 MINOR T5 M4 — parse each input ARXML exactly once instead of
  // letting every helper re-parse it (pre-M4: 5 parses for canIfConfig
  // alone — discoverCanIfSubContainers + 2× extractExistingGrandchildShortNames
  // for Tx/Rx). On parseArxml throw, surface a warn and fall through to the
  // BSWMD canonical defaults (preserves the v1.23.1 T3 MEDIUM behavior).
  const safeParse = (arxml: string, label: string): Result<ArxmlDocument, ParseError> => {
    try {
      return parseArxml(arxml);
    } catch (e) {
      console.warn(
        `[dbCToComStack] parseArxml failed for ${label}: ${e instanceof Error ? e.message : String(e)}`,
      );
      return { ok: false, error: { kind: 'xml-malformed', message: 'parse threw' } };
    }
  };
  const comParsed = safeParse(input.comConfig, '/Com');
  const canIfParsed = safeParse(input.canIfConfig, '/CanIf');
  const pduRParsed = safeParse(input.pduRConfig, '/PduR');

  // #1 (CRITICAL) — discover container shortNames from the parsed ARXML
  // instead of using hardcoded constants. The fallback to BSWMD
  // canonical names (when the value-side file is empty) keeps the
  // bridge usable on fresh skeletons.
  const comPrimary = discoverPrimaryContainer(comParsed, COM_MODULE) ?? 'ComConfig';
  const canIfPrimary = discoverPrimaryContainer(canIfParsed, CANIF_MODULE) ?? 'CanIfInitCfg';
  const pduRPrimary = discoverPrimaryContainer(pduRParsed, PDUR_MODULE) ?? 'PduRRoutingPaths';
  const canIfSubs = discoverCanIfSubContainers(canIfParsed, canIfPrimary);

  const existingComIpdu = extractExistingComIpduNames(comParsed, comPrimary);
  const existingCanIfTx = extractExistingGrandchildShortNames(
    canIfParsed,
    CANIF_MODULE,
    canIfPrimary,
    canIfSubs.txSubName,
  );
  const existingCanIfRx = extractExistingGrandchildShortNames(
    canIfParsed,
    CANIF_MODULE,
    canIfPrimary,
    canIfSubs.rxSubName,
  );
  const existingPduRRoutes = extractExistingChildShortNames(pduRParsed, PDUR_MODULE, pduRPrimary);

  const comPatches: PatchStep[] = [];
  const canIfPatches: PatchStep[] = [];
  const pduRPatches: PatchStep[] = [];

  for (const msg of input.dbc.messages) {
    const signals = input.dbc.signals?.filter((s) => s.messageId === msg.id) ?? [];

    // ComIPdu (skip if exists)
    if (!existingComIpdu.has(msg.name)) {
      comPatches.push({
        op: 'add-child',
        // v1.23.0 T3 fix — `parentPath` is the path to the EXISTING
        // parent container that the new instance will be added under
        // (mirrors `applyPatchSteps`'s `findParentContainerDef` lookup
        // at src/core/mutation/applyPatchSteps.ts:703-714). The new
        // instance's name lives in `shortName`, NOT in `parentPath`.
        // The pre-T3 mapper appended `msg.name` to `parentPath`, which
        // broke `findParentContainerDef` once `applyPatchSteps` was
        // called with a real `moduleDef` (T1+T2 only call it on the
        // patch PLAN — T3 actually applies the patches).
        parentPath: `/${COM_MODULE}/${COM_MODULE}/${comPrimary}`,
        shortName: msg.name,
        definitionRef: `/AUTOSAR/Com/${comPrimary}/ComIPdu`,
        kind: 'com-ipdu',
      });
      // ComSignal children — same fix: parentPath is the parent
      // container (the new ComIPdu), `shortName` is the new signal.
      for (const sig of signals) {
        comPatches.push({
          op: 'add-child',
          parentPath: `/${COM_MODULE}/${COM_MODULE}/${comPrimary}/${msg.name}`,
          shortName: sig.name,
          definitionRef: `/AUTOSAR/Com/${comPrimary}/ComIPdu/ComSignal`,
          kind: 'com-signal',
        });
      }
    }

    // #5 (HIGH) — Tx vs Rx dispatched on msg.transmitter === targetNode.
    // Legacy fallback (no targetNode): treat every message as Tx.
    // v1.38.0 MINOR T4 (H3) — defensive: when targetNode is defined but
    // msg has no transmitter (empty/undefined), warn the user and default
    // to Tx. Tx is the safer default per AUTOSAR DBC convention; a
    // missing transmitter is more likely a malformed DBC line the user
    // can correct, vs the Rx path which might silently route messages
    // to the wrong side.
    let isTx: boolean;
    if (input.targetNode === undefined) {
      // Legacy fallback: treat every message as Tx
      isTx = true;
    } else if (msg.transmitter === undefined || msg.transmitter === '') {
      // ambiguous: empty/missing transmitter + targetNode defined.
      // Default to Tx (safer) and warn so the user can investigate.
      // eslint-disable-next-line no-console
      console.warn(
        `dbcToComStack: message "${msg.name}" has no transmitter; defaulting to Tx (targetNode="${input.targetNode}")`,
      );
      isTx = true;
    } else {
      isTx = msg.transmitter === input.targetNode;
    }
    if (isTx) {
      if (!existingCanIfTx.has(msg.name)) {
        canIfPatches.push({
          op: 'add-child',
          parentPath: `/${CANIF_MODULE}/${CANIF_MODULE}/${canIfPrimary}/${canIfSubs.txSubName}`,
          shortName: msg.name,
          definitionRef: `/AUTOSAR/CanIf/${canIfPrimary}/${canIfSubs.txSubName}/CanIfTxPduCfg`,
          kind: 'canif-tx-pdu',
        });
      }
    } else {
      if (!existingCanIfRx.has(msg.name)) {
        canIfPatches.push({
          op: 'add-child',
          parentPath: `/${CANIF_MODULE}/${CANIF_MODULE}/${canIfPrimary}/${canIfSubs.rxSubName}`,
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
        parentPath: `/${PDUR_MODULE}/${PDUR_MODULE}/${pduRPrimary}`,
        shortName: msg.name,
        definitionRef: `/AUTOSAR/PduR/${pduRPrimary}/PduRRoutingPath`,
        kind: 'pdur-route',
      });
    }
  }

  return { comPatches, canIfPatches, pduRPatches };
}
