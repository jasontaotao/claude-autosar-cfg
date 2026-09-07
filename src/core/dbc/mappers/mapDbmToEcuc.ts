/**
 * DBM → ECUC 全流程门面（spec §7）：把一次 DBC 解析的 DBM 完整映射为
 * Com / CanIf / PduR 三个模块的 incoming ECUC 值。
 *
 * 流程（确定性，spec §2.1）：
 * 1. `filterMessagesForTargetNode` 只调用一次（§7.3.1），相关性结果贯穿
 *    Com / CanIf / PduR 与 stats。
 * 2. message 顺序按 PduId policy 的 order 重新排列（document-order 保持 DBM
 *    顺序；shortName-order 按 key 的 code-unit 字典序），保证模块树子节点
 *    顺序与编号空间顺序一致。
 * 3. `assignPduIds` 只调用一次（RULING: directions 必须传入，perDirection
 *    scope 下 Tx/Rx 各自编号），结果同时喂给 CanIf `pduIds`、Com
 *    `ComHandleId`（handleIds）与 PduR HandleId fallback — 三处同源。
 * 4. PduId 存量冲突校验是 **per-module** 语义（§7.4 trigger 2）：生成的 id
 *    落到哪个模块就只与该模块的存量集合比较 —— CanIf 侧由 mapCanIf 对照
 *    CanIf 全量 id 集合检查；Com 侧（ComHandleId）由 mapCom 对照 Com 存量
 *    handleId 集合检查。绝不做跨模块并集检查。
 * 5. PduR 引用的目标路径从**实际生成**的 Com / CanIf 模块树推导
 *    （collectImportContainers），绝不从 BSWMD spine 重推（RULING 10）。
 *
 * 返回：
 * - `modules`：Com / CanIf / PduR 三个 ArxmlModule（immutable）。
 * - `warnings`：mapper warnings（Com → CanIf → PduR 顺序）+ assignPduIds
 *   warnings + `dbm.warnings`（解析期）。合并时按 `(code, elementRef)` 去重
 *   —— 同一 message 的 Com / CanIf 两侧可能各 emit 一条同 code 的 warning，
 *   用户可见只保留第一条。
 * - `stats`：§8.1 — messages/signals 为解析总量；skippedIrrelevantMessages
 *   来自相关性过滤；skippedMultiplexedSignals 用与 Com mapper 相同的规则从
 *   `dbm.signals` 确定性重推（只统计相关 message 中的 muxed 信号）。
 * - `fieldDiffsByModule` / `containerPathByModule`：按模块分组的字段 diff 与
 *   「实例路径 → definition containerKey」映射（merge 层按实例路径分组）。
 *
 * Design source: docs/superpowers/specs/2026-09-03-dbc-full-import-design.md
 * §7 (mapping pipeline) + §8.1 (stats / field diffs)。
 */

import type { DbcImportStats } from '../../../shared/types/dbc-import.js';
import type { ArxmlModule } from '../../arxml/types.js';
import { collectImportContainers } from '../../import/threeWayMerge.js';
import type { DbcImportModule, DbcBswmdDefIndex } from '../bswmdDefIndex.js';
import type { Dbm, DbmMessage, DbmSignal, DbmWarning } from '../dbm.js';
import type { DbcImportProfile } from '../profile.js';

import { filterMessagesForTargetNode, mapCanIf } from './canIfMapper.js';
import { mapCom } from './comMapper.js';
import { mapPduR } from './pduRMapper.js';
import { assignPduIds } from './transforms.js';
import type { DbcMapperContext, MapperFieldDiff } from './types.js';

export interface MapDbmToEcucRequest {
  readonly dbm: Dbm;
  readonly targetNode: string;
  readonly index: DbcBswmdDefIndex;
  readonly profile: DbcImportProfile;
  /**
   * 当前文档中已存在的各模块内 id（Com / CanIf），用于 §7.4 trigger 2 的
   * per-module PduId 冲突检测：CanIf id 对照 CanIf 集合，Com handleId 对照
   * Com 集合，二者绝不并集。
   */
  readonly currentIds: ReadonlyMap<'Com' | 'CanIf', ReadonlySet<number>>;
}

export interface MapDbmToEcucResult {
  readonly modules: ReadonlyMap<DbcImportModule, ArxmlModule>;
  readonly warnings: readonly DbmWarning[];
  readonly stats: DbcImportStats;
  readonly fieldDiffsByModule: ReadonlyMap<DbcImportModule, readonly MapperFieldDiff[]>;
  readonly containerPathByModule: ReadonlyMap<DbcImportModule, ReadonlyMap<string, string>>;
}

/**
 * message key → 模块内该 message 的实例路径。
 * 从实际生成的模块树收集（collectImportContainers 的键，RULING 10），
 * 只包含本次真正生成的实例。
 */
function collectMessageInstances(
  module: ArxmlModule,
  messageKeys: readonly string[],
): ReadonlyMap<string, string> {
  const children = collectImportContainers(module);
  const result = new Map<string, string>();
  // collectImportContainers 按树序插入，后写同一短名实例会覆盖 —— R22 布局下
  // message.key 在模块内唯一，因此覆盖顺序不影响结果；多实例场景按生成序。
  for (const [path, instance] of children) {
    if (messageKeys.includes(instance.shortName)) result.set(instance.shortName, path);
  }
  return result;
}

/** 按 PduId policy 的 order 排列相关 message（§2.1 确定性）。 */
function orderMessages(
  messages: ReadonlyArray<DbmMessage>,
  order: 'document-order' | 'shortName-order',
): ReadonlyArray<DbmMessage> {
  if (order === 'shortName-order') {
    return [...messages].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }
  return messages;
}

/**
 * 把 `dbm.signals`（扁平数组）按 `messageKey` 分组（保持信号文档顺序）。
 */
function groupSignalsByMessageKey(
  signals: ReadonlyArray<DbmSignal>,
): ReadonlyMap<string, ReadonlyArray<DbmSignal>> {
  const groups = new Map<string, DbmSignal[]>();
  for (const signal of signals) {
    const group = groups.get(signal.messageKey);
    if (group === undefined) groups.set(signal.messageKey, [signal]);
    else group.push(signal);
  }
  return groups;
}

/**
 * §8.1：与 Com mapper §7.7 相同的规则，从 `dbm.signals` 确定性重推
 * skippedMultiplexedSignals（只统计相关 message 中的 muxed 信号）。
 * 比聚合 `dbc-multiplexed-signal` warning 更轻且独立于 warning 计数路径。
 */
function countSkippedMultiplexed(
  dbm: Dbm,
  relevantKeys: ReadonlySet<string>,
  importMultiplexedAsPlain: boolean | undefined,
): number {
  let count = 0;
  for (const signal of dbm.signals) {
    if (!relevantKeys.has(signal.messageKey)) continue;
    if (
      signal.multiplex.kind === 'multiplexed' ||
      signal.multiplex.kind === 'extended-multiplexed'
    ) {
      if (importMultiplexedAsPlain !== true) count += 1;
    }
  }
  return count;
}

/** 按模块名把字段 diff 分组（保持原顺序，§8.1 merge 层按实例路径匹配）。 */
function groupFieldDiffsByModule(
  diffs: readonly MapperFieldDiff[],
): ReadonlyMap<DbcImportModule, readonly MapperFieldDiff[]> {
  const groups = new Map<DbcImportModule, MapperFieldDiff[]>();
  for (const diff of diffs) {
    const group = groups.get(diff.moduleName);
    if (group === undefined) groups.set(diff.moduleName, [diff]);
    else group.push(diff);
  }
  return groups;
}

/**
 * DBM → ECUC 全流程入口。同一输入保证产生字节级相同的输出（§2.1）：
 * 所有遍历都基于数组 / 插入序 Map，无 Set 迭代序依赖、无随机性。
 */
export function mapDbmToEcuc(request: MapDbmToEcucRequest): MapDbmToEcucResult {
  const { dbm, targetNode, index, profile } = request;
  const { currentIds } = request;

  // §7.3.1 相关性过滤 —— 恰好一次，结果贯穿所有 mapper。
  const filtered = filterMessagesForTargetNode(dbm, targetNode);
  const relevantMessageKeys = filtered.relevantMessages.map((m) => m.key);
  const orderedMessages = orderMessages(
    filtered.relevantMessages,
    profile.modules.CanIf.pduIdPolicy.order,
  );

  // PduId 编号 —— 恰好一次，perDirection 依赖 directions（RULING）：
  // 缺省退化成全 Tx 编号空间，这里显式传入相关性结果。存量冲突不在
  // assignPduIds 做 —— per-module 检查在各 mapper 消费 id 的位置（§7.4）。
  const assigned = assignPduIds({
    messageKeys: relevantMessageKeys,
    policy: profile.modules.CanIf.pduIdPolicy,
    directions: filtered.directionByMessageKey,
  });

  // 共享上下文：三个 mapper 顺序写入 warnings / fieldDiffs 累积数组。
  const context: DbcMapperContext = {
    dbm,
    targetNode,
    index,
    profile,
    warnings: [],
    fieldDiffs: [],
  };

  const signalsByMessageKey = groupSignalsByMessageKey(dbm.signals);

  const comResult = mapCom(context, {
    relevantMessages: orderedMessages,
    signalsByMessageKey,
    directionByMessageKey: filtered.directionByMessageKey,
    handleIds: assigned.ids,
    existingHandleIds: currentIds.get('Com') ?? EMPTY_ID_SET,
  });

  // R22 module-internal 唯一性：CanIf 全量存量 id 同时作为 Tx 与 Rx 的 existing set。
  const canIfExistingIds = currentIds.get('CanIf') ?? EMPTY_ID_SET;
  const canIfResult = mapCanIf(context, {
    relevantMessages: orderedMessages,
    directionByMessageKey: filtered.directionByMessageKey,
    pduIds: assigned.ids,
    existingTxIds: canIfExistingIds,
    existingRxIds: canIfExistingIds,
  });

  // PduR 引用目标必须解析到实际生成的 Com / CanIf 实例（RULING 10）。
  const comPduPathByMessageKey = collectMessageInstances(comResult.value, relevantMessageKeys);
  const canIfPduPathByMessageKey = collectMessageInstances(canIfResult.value, relevantMessageKeys);
  const pduRResult = mapPduR(context, {
    relevantMessages: orderedMessages,
    directionByMessageKey: filtered.directionByMessageKey,
    comPduPathByMessageKey,
    canIfPduPathByMessageKey,
    pduIds: assigned.ids,
  });

  const modules: MapDbmToEcucResult['modules'] = new Map([
    ['Com', comResult.value],
    ['CanIf', canIfResult.value],
    ['PduR', pduRResult.value],
  ]);

  // containerPathByModule：实例路径 → definition containerKey。key 与
  // collectImportContainers 的实例路径完全对齐（§8.1 preview 行按实例路径
  // 分组），value 是该实例的 spine key 供显示。同 definition 多实例各占一行。
  const containerPathByModule: MapDbmToEcucResult['containerPathByModule'] = new Map([
    ['Com', messageContainerPaths(comResult.value, relevantMessageKeys)],
    ['CanIf', messageContainerPaths(canIfResult.value, relevantMessageKeys)],
    ['PduR', messageContainerPaths(pduRResult.value, relevantMessageKeys)],
  ]);

  const fieldDiffsByModule: MapDbmToEcucResult['fieldDiffsByModule'] = groupFieldDiffsByModule(
    context.fieldDiffs,
  );

  const stats: DbcImportStats = {
    messages: dbm.messages.length,
    signals: dbm.signals.length,
    skippedIrrelevantMessages: filtered.skippedIrrelevantMessages,
    skippedMultiplexedSignals: countSkippedMultiplexed(
      dbm,
      new Set(relevantMessageKeys),
      profile.modules.Com.importMultiplexedAsPlain,
    ),
  };

  // warning 合并规则：mapper warnings（Com → CanIf → PduR）+ assignPduIds
  // warnings + DBM 解析期 warnings，按 `(code, elementRef)` 去重保留第一条。
  // assignPduIds 与 mapCanIf 对同一存量 id 冲突会各 emit 一条
  // `dbc-pdu-id-conflict`，去重后用户可见只出现一次。
  const warnings: readonly DbmWarning[] = dedupeWarnings([
    ...context.warnings,
    ...assigned.warnings,
    ...dbm.warnings,
  ]);

  return {
    modules,
    warnings,
    stats,
    fieldDiffsByModule,
    containerPathByModule,
  };
}

/** 复用的空集合（只读用法；不得修改）。 */
const EMPTY_ID_SET: ReadonlySet<number> = new Set<number>();

/**
 * 按 `(code, elementRef)` 去重 warning，保留首次出现的条目（确定性：依赖输入
 * 顺序）。用于消除不同 mapper 对同一元素同一问题（如同一条 message 的存量
 * id 冲突）的重复 emit。
 */
function dedupeWarnings(warnings: readonly DbmWarning[]): readonly DbmWarning[] {
  const seen = new Set<string>();
  const result: DbmWarning[] = [];
  for (const warning of warnings) {
    const key = `${warning.code}|${warning.elementRef}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(warning);
  }
  return result;
}

/**
 * 模块树中 message 级实例：实例路径 → definition containerKey（spine key）。
 * key 直接取自 collectImportContainers 的实例路径（与 §8.1 merge 层分组 key
 * 完全对齐），value 由 definitionRef 剥离模块根前缀获得。同 definition 的
 * 多个 message 实例（如 EngineMsg / GearMsg 共享 ComConfig/ComIPdu）各占一行，
 * 绝不折叠。
 */
function messageContainerPaths(
  module: ArxmlModule,
  messageKeys: readonly string[],
): ReadonlyMap<string, string> {
  const children = collectImportContainers(module);
  const result = new Map<string, string>();
  for (const [path, instance] of children) {
    if (!messageKeys.includes(instance.shortName)) continue;
    if (instance.definitionRef === undefined) continue;
    // definitionRef = `/AUTOSAR_R22/EcucDefs/<moduleShortName>/<spine…>`；
    // 剥离模块短名前缀后即与 bswmdDefIndex.spineKey 相同的 spine key。
    const moduleSegment = `/${module.shortName}/`;
    const spine = instance.definitionRef.slice(
      instance.definitionRef.lastIndexOf(moduleSegment) + moduleSegment.length,
    );
    result.set(path, spine);
  }
  return result;
}
