/**
 * CanIf mapper + relevance filter — deterministic DBC → CanIf ECUC value
 * generation (spec §7.3 + §7.4 + §7.5).
 *
 * `filterMessagesForTargetNode` implements the normative relevance filter
 * (§7.3.1): `message.transmitter === selectedTargetNode` → Tx,
 * `selectedTargetNode ∈ message.receivers` → Rx, otherwise the message is
 * irrelevant (no container, no row, no warning — counted in
 * `skippedIrrelevantMessages`). `selectedTargetNode` MUST be a DBC node, never
 * an EcuC ECU instance name.
 *
 * `mapCanIf` produces one Tx OR Rx PDU container per relevant message (never
 * both). PduIds arrive pre-assigned from the facade (Task 9 applies the §7.4
 * policy via `assignPduIds`); this mapper only checks the assigned ids against
 * the existing-id sets and emits `dbc-pdu-id-conflict` when they collide.
 *
 * Instance-path convention (RULING 10): the generated tree is
 * `CanIf → <wrapper> → <messageKey>` where the wrapper shortName is the last
 * segment of the PARENT container key (`CanIfInitCfg` for
 * `CanIfInitCfg/CanIfTxPduCfg`). Every field diff's containerPath is that real
 * instance path (matching `collectImportContainers`), never a BSWMD
 * definition-spine path. When the PDU container key has no parent (top-level
 * container) or the parent def is missing, PDUs hang directly off the module
 * and instance paths are `/CanIf/<messageKey>`.
 *
 * Design source: docs/superpowers/specs/2026-09-03-dbc-full-import-design.md
 * §7.3 (CanIf mapping) + §7.4 (PduId) + §7.5 (UL naming).
 */

import type { ArxmlContainer, ArxmlElement, ArxmlModule, ParamValue } from '../../arxml/types.js';
import type { Dbm, DbmMessage } from '../dbm.js';
import type { CanIfProfile } from '../profile.js';

import {
  findRule,
  lastSegment,
  parentKeyOf,
  pushWarning,
  recordUnmappedDiff,
  reconcileFieldDiffRange,
  resultOf,
} from './helpers.js';
import { resolveContainerKey, upperLayerName } from './transforms.js';
import { makeContainer, makeParam, type DbcMapperContext, type MapperResult } from './types.js';

export interface CanIfDirectionResult {
  readonly relevantMessages: readonly DbmMessage[];
  readonly directionByMessageKey: ReadonlyMap<string, 'SEND' | 'RECEIVE'>;
  readonly skippedIrrelevantMessages: number;
}

/**
 * §7.3.1 normative relevance filter. The facade calls this exactly once and
 * threads the result to the Com / CanIf / PduR mappers.
 */
export function filterMessagesForTargetNode(dbm: Dbm, targetNode: string): CanIfDirectionResult {
  const relevantMessages: DbmMessage[] = [];
  const directionByMessageKey = new Map<string, 'SEND' | 'RECEIVE'>();
  let skippedIrrelevantMessages = 0;
  for (const message of dbm.messages) {
    if (message.transmitter === targetNode) {
      relevantMessages.push(message);
      directionByMessageKey.set(message.key, 'SEND');
    } else if (message.receivers.includes(targetNode)) {
      relevantMessages.push(message);
      directionByMessageKey.set(message.key, 'RECEIVE');
    } else {
      skippedIrrelevantMessages += 1;
    }
  }
  return { relevantMessages, directionByMessageKey, skippedIrrelevantMessages };
}

export interface MapCanIfInput {
  readonly relevantMessages: readonly DbmMessage[];
  readonly directionByMessageKey: ReadonlyMap<string, 'SEND' | 'RECEIVE'>;
  readonly pduIds: ReadonlyMap<string, number>;
  readonly existingTxIds: ReadonlySet<number>;
  readonly existingRxIds: ReadonlySet<number>;
}

/** 单方向 PDU 字段名集合（R22 literal，§7.3.2）。 */
interface PduFieldSet {
  readonly canId: string;
  readonly canIdType: string;
  readonly dlc: string;
  readonly id: string;
  readonly type: string;
  readonly ul: string;
  readonly ulTemplateKey: 'txTemplate' | 'rxTemplate';
}

const TX_FIELDS: PduFieldSet = {
  canId: 'CanIfTxPduCanId',
  canIdType: 'CanIfTxPduCanIdType',
  dlc: 'CanIfTxPduDlc',
  id: 'CanIfTxPduId',
  type: 'CanIfTxPduType',
  ul: 'CanIfTxPduUserTxConfirmationUL',
  ulTemplateKey: 'txTemplate',
};

const RX_FIELDS: PduFieldSet = {
  canId: 'CanIfRxPduCanId',
  canIdType: 'CanIfRxPduCanIdType',
  dlc: 'CanIfRxPduDlc',
  id: 'CanIfRxPduId',
  type: 'CanIfRxPduType',
  ul: 'CanIfRxPduUserRxIndicationUL',
  ulTemplateKey: 'rxTemplate',
};

/**
 * 生成单个 message 的 Tx/Rx PDU 实例。字段映射（§7.3.2）：
 * CanId / CanIdType / Dlc 为 Auto；PduId 为 Profile-default（冲突时跳过并
 * 记录 `dbc-pdu-id-conflict`）；Type 取 Profile fallback（STATIC）；
 * UL 字段在 `upperLayerNaming.enabled` 时生成模板名（Profile-default），否则
 * 记录 Unmapped diff 并按方向族聚合发一条 `dbc-policy-unmapped`。
 * 返回 undefined 表示 PDU 容器定义缺失（makeContainer 已告警）。
 */
function mapPdu(
  context: DbcMapperContext,
  input: MapCanIfInput,
  message: DbmMessage,
  containerKey: string,
  fields: PduFieldSet,
  existingIds: ReadonlySet<number>,
  ulWarned: { value: boolean },
  canIfProfile: CanIfProfile,
  instanceBase: string,
): ArxmlContainer | undefined {
  const pdu = makeContainer(context, 'CanIf', containerKey, message.key);
  if (pdu === undefined) return undefined;

  // RULING 10 — 实例路径基座（`/CanIf` 或 `/CanIf/<wrapper.shortName>`）+
  // message key，必须与 collectImportContainers 的实例路径一致。
  const instancePath = `${instanceBase}/${message.key}`;
  const diffStart = context.fieldDiffs.length;
  let params: Record<string, ParamValue> = {};

  const canId = makeParam(
    context,
    'CanIf',
    `${containerKey}/${fields.canId}`,
    message.messageId,
    'Auto',
  );
  if (canId !== undefined) params = { ...params, [fields.canId]: canId };

  const idTypeValue = message.isExtended ? 'EXTENDED_CAN' : 'STANDARD_CAN';
  const canIdType = makeParam(
    context,
    'CanIf',
    `${containerKey}/${fields.canIdType}`,
    idTypeValue,
    'Auto',
  );
  if (canIdType !== undefined) params = { ...params, [fields.canIdType]: canIdType };

  const dlc = makeParam(context, 'CanIf', `${containerKey}/${fields.dlc}`, message.dlc, 'Auto');
  if (dlc !== undefined) params = { ...params, [fields.dlc]: dlc };

  const pduId = input.pduIds.get(message.key);
  if (pduId !== undefined) {
    if (existingIds.has(pduId)) {
      pushWarning(
        context,
        'dbc-pdu-id-conflict',
        message.key,
        `PduId ${pduId} for ${message.key} collides with an existing CanIf PDU id`,
      );
      context.fieldDiffs.push({
        moduleName: 'CanIf',
        containerPath: instancePath,
        paramKey: `${containerKey}/${fields.id}`,
        incoming: pduId,
        source: 'Error',
        warningCodes: ['dbc-pdu-id-conflict'],
      });
    } else {
      const idParam = makeParam(
        context,
        'CanIf',
        `${containerKey}/${fields.id}`,
        pduId,
        'Profile-default',
      );
      if (idParam !== undefined) params = { ...params, [fields.id]: idParam };
    }
  } else {
    recordUnmappedDiff(context, 'CanIf', `${containerKey}/${fields.id}`, undefined);
  }

  const typeRule = findRule(canIfProfile, fields.type);
  if (typeRule?.fallback !== undefined) {
    const typeParam = makeParam(
      context,
      'CanIf',
      `${containerKey}/${fields.type}`,
      String(typeRule.fallback),
      'Profile-default',
    );
    if (typeParam !== undefined) params = { ...params, [fields.type]: typeParam };
  } else {
    recordUnmappedDiff(context, 'CanIf', `${containerKey}/${fields.type}`, undefined);
  }

  const ulKey = `${containerKey}/${fields.ul}`;
  const naming = canIfProfile.upperLayerNaming;
  if (naming.enabled === true) {
    const template = naming[fields.ulTemplateKey];
    if (template !== undefined) {
      // §7.5：{pdu} 展开为 PDU 实例 shortName —— 即 message.key（已合法化并
      // 去重）。用原始 shortName 会让两条同名 message 渲染出相同的 UL 名。
      const ulName = upperLayerName({ pduShortName: message.key, template });
      const ulParam = makeParam(context, 'CanIf', ulKey, ulName, 'Profile-default');
      if (ulParam !== undefined) params = { ...params, [fields.ul]: ulParam };
    } else {
      recordUnmappedDiff(context, 'CanIf', ulKey, undefined);
    }
  } else {
    recordUnmappedDiff(context, 'CanIf', ulKey, undefined);
    if (!ulWarned.value) {
      pushWarning(
        context,
        'dbc-policy-unmapped',
        ulKey,
        `Upper-layer field ${fields.ul} is not generated because upperLayerNaming is disabled`,
      );
      ulWarned.value = true;
    }
  }

  // RULING 10 — 全部字段 diff 锚定到实例路径（`/CanIf/<wrapper>/<messageKey>`）。
  reconcileFieldDiffRange(context, diffStart, context.fieldDiffs.length, instancePath);

  return { ...pdu, params };
}

/** 单个方向（Tx/Rx）的构建配置。 */
interface DirectionGroup {
  readonly dirKey: string | undefined;
  readonly messages: readonly DbmMessage[];
  readonly fields: PduFieldSet;
  readonly existingIds: ReadonlySet<number>;
}

/**
 * 生成 CanIf 模块的 incoming 值。PduId policy 由 facade 在调用前应用
 * （`assignPduIds`），本 mapper 只消费生成的 map 并做存量冲突检查。
 */
export function mapCanIf(
  context: DbcMapperContext,
  input: MapCanIfInput,
): MapperResult<ArxmlModule> {
  const canIfProfile = context.profile.modules.CanIf;
  const txKey = resolveContainerKey(canIfProfile.txPduContainerKeys, context.index.CanIf);
  const rxKey = resolveContainerKey(canIfProfile.rxPduContainerKeys, context.index.CanIf);

  const module: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'CanIf',
    params: {},
    children: [],
    references: [],
  };

  if (txKey === undefined) {
    pushWarning(
      context,
      'dbc-bswmd-def-missing',
      canIfProfile.txPduContainerKeys[0] ?? 'CanIfTxPdu',
      `No CanIf Tx PDU container definition found among: ${canIfProfile.txPduContainerKeys.join(', ')}`,
    );
  }
  if (rxKey === undefined) {
    pushWarning(
      context,
      'dbc-bswmd-def-missing',
      canIfProfile.rxPduContainerKeys[0] ?? 'CanIfRxPdu',
      `No CanIf Rx PDU container definition found among: ${canIfProfile.rxPduContainerKeys.join(', ')}`,
    );
  }

  const txMessages: DbmMessage[] = [];
  const rxMessages: DbmMessage[] = [];
  for (const message of input.relevantMessages) {
    const direction = input.directionByMessageKey.get(message.key) ?? 'SEND';
    if (direction === 'SEND') txMessages.push(message);
    else rxMessages.push(message);
  }

  // 按 parent key 去重的 wrapper 组：R22 布局下 Tx/Rx 共享同一父容器
  // （`CanIfInitCfg` / `CanIfConfig`），只生成一个 wrapper 同时容纳两侧 PDU。
  const wrapperGroups = new Map<string, { wrapper: ArxmlContainer; children: ArxmlContainer[] }>();
  const directChildren: ArxmlContainer[] = [];

  const buildDirection = (group: DirectionGroup): void => {
    const { dirKey, messages, fields, existingIds } = group;
    if (dirKey === undefined || messages.length === 0) return;
    const ulWarned = { value: false };
    const wrapperKey = parentKeyOf(dirKey);
    let instanceBase: string;
    let target: ArxmlContainer[];
    if (wrapperKey === undefined) {
      // 顶层 PDU 容器（无父段）→ 无 wrapper，PDU 直接挂 module 下。
      instanceBase = '/CanIf';
      target = directChildren;
    } else {
      let existing = wrapperGroups.get(wrapperKey);
      if (existing === undefined) {
        const wrapper = makeContainer(context, 'CanIf', wrapperKey, lastSegment(wrapperKey));
        if (wrapper === undefined) {
          // 父容器定义缺失 → 退化为无 wrapper（不崩溃、不留半成品）。
          instanceBase = '/CanIf';
          target = directChildren;
        } else {
          existing = { wrapper, children: [] };
          wrapperGroups.set(wrapperKey, existing);
          instanceBase = `/CanIf/${wrapper.shortName}`;
          target = existing.children;
        }
      } else {
        instanceBase = `/CanIf/${existing.wrapper.shortName}`;
        target = existing.children;
      }
    }
    for (const message of messages) {
      const pdu = mapPdu(
        context,
        input,
        message,
        dirKey,
        fields,
        existingIds,
        ulWarned,
        canIfProfile,
        instanceBase,
      );
      if (pdu !== undefined) target.push(pdu);
    }
  };

  buildDirection({
    dirKey: txKey,
    messages: txMessages,
    fields: TX_FIELDS,
    existingIds: input.existingTxIds,
  });
  buildDirection({
    dirKey: rxKey,
    messages: rxMessages,
    fields: RX_FIELDS,
    existingIds: input.existingRxIds,
  });

  const moduleChildren: readonly ArxmlElement[] = [
    ...directChildren,
    ...[...wrapperGroups.values()].map(({ wrapper, children }) => ({ ...wrapper, children })),
  ];

  return resultOf(context, { ...module, children: moduleChildren });
}
