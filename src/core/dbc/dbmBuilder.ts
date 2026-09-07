/**
 * DBM builder：把 DBC 文本解析为 DbmDocument，再投影为 DBM 业务事实模型。
 * 解析使用 @dbc-forge/core 的 parseDbc；short-name 合法化/去重复用
 * src/core/odx/shortName.ts（禁止第二份实现）。
 */

import { createHash } from 'node:crypto';

import { parseDbc } from '@dbc-forge/core';
import type { Comment, Multiplexed, Network } from '@dbc-forge/core';

import { dedupeShortName, legalizeShortName } from '../odx/shortName.js';

import { normalizeCanId } from './canId.js';
import type {
  Dbm,
  DbmAttributeValue,
  DbmDocument,
  DbmMessage,
  DbmMultiplex,
  DbmNode,
  DbmSignal,
  DbmValueTableEntry,
  DbmWarning,
} from './dbm.js';

/**
 * 解析 DBC 文本并包装为 DbmDocument。
 * 解析失败统一包装为 `Error('dbc-malformed: ...')`（§12 hard error closed set）。
 * sourceHash 是原始文本的 sha256（与 ODX provenance 的 sourceHash 对齐）。
 */
export function createDbmDocument(sourcePath: string, xml: string): DbmDocument {
  let network: Network;
  try {
    network = parseDbc(xml);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`dbc-malformed: ${detail}`);
  }
  const sourceHash = `sha256:${createHash('sha256').update(xml).digest('hex')}`;
  return { sourcePath, sourceHash, network };
}

/** 把 DbmDocument 投影为 DBM（nodes / messages / signals / warnings）。 */
export function buildDbm(document: DbmDocument): Dbm {
  const { sourcePath, sourceHash, network } = document;
  const warnings: DbmWarning[] = [];
  // 消息 key 的去重 taken 集合（全局）。
  const messageTaken = new Set<string>();

  const nodes: DbmNode[] = network.nodes.map((node) => ({
    name: node.name,
    comments: commentsFor(
      network.comments,
      (c) => c.scope.kind === 'node' && c.scope.nodeName === node.name,
    ),
    attributes: collectAttributes(network, (a) => {
      if (a.target.kind !== 'node') return false;
      return a.target.nodeName === node.name;
    }),
  }));

  const messages: DbmMessage[] = [];
  const signals: DbmSignal[] = [];

  for (const message of network.messages) {
    const messageKey = projectMessageKey(message.name, messageTaken, warnings);

    // Vector bit-31 标志剥离见 normalizeCanId（canId.ts）。
    // attribute/comments 匹配继续用原始 message.id（dbc-forge 的 attributeAssignments 也是原始 id）。
    const canId = normalizeCanId(message.id);

    if (canId < 0 || canId > 0x1fffffff) {
      warnings.push({
        code: 'dbc-invalid-can-id',
        elementRef: messageKey,
        message: `Message '${messageKey}' has invalid CAN id ${canId}`,
      });
    }
    if (message.dlc < 0 || message.dlc > 8) {
      warnings.push({
        code: 'dbc-invalid-dlc',
        elementRef: messageKey,
        message: `Message '${messageKey}' has invalid DLC ${message.dlc}`,
      });
    }
    if (!message.transmitter) {
      warnings.push({
        code: 'dbc-message-missing-transmitter',
        elementRef: messageKey,
        message: `Message '${messageKey}' has no transmitter`,
      });
    }

    const msgAttrs = collectAttributes(network, (a) => {
      if (a.target.kind !== 'message') return false;
      return a.target.messageId === message.id;
    });

    const msgSignals: DbmSignal[] = [];
    // 信号 key 去重在所属 message scope 内进行（§3.2），每条 message 一个独立 taken 集合。
    const signalTaken = new Set<string>();
    for (const signal of message.signals) {
      const signalKey = projectSignalKey(signal.name, signalTaken, warnings);
      const sigAttrs = collectAttributes(network, (a) => {
        if (a.target.kind !== 'signal') return false;
        return a.target.messageId === message.id && a.target.signalName === signal.name;
      });
      const valueTable = resolveValueTable(network, signal.valueTable);

      msgSignals.push({
        key: signalKey,
        messageKey,
        shortName: signal.name,
        startBit: signal.startBit,
        length: signal.length,
        byteOrder: signal.byteOrder,
        valueType: signal.valueType,
        factor: signal.factor,
        offset: signal.offset,
        minimum: signal.min,
        maximum: signal.max,
        unit: signal.unit,
        receivers: signal.receivers,
        multiplex: projectMultiplex(signal.multiplexed),
        attributes: sigAttrs,
        ...(valueTable !== undefined ? { valueTable } : {}),
      });
    }
    signals.push(...msgSignals);

    messages.push({
      key: messageKey,
      shortName: message.name,
      messageId: canId,
      isExtended: message.isExtended,
      dlc: message.dlc,
      ...(message.transmitter ? { transmitter: message.transmitter } : {}),
      // DBC 的 receiver 只存在于 SG_ 行尾；从信号 receivers 聚合，去重并保持文档顺序。
      receivers: aggregateReceivers(message.signals.map((s) => s.receivers)),
      attributes: msgAttrs,
      comments: commentsFor(network.comments, (c) => {
        if (c.scope.kind !== 'message') return false;
        return c.scope.messageId === message.id;
      }),
    });
  }

  return {
    meta: {
      sourcePath,
      ...(network.version !== '' ? { dbcVersion: network.version } : {}),
      protocol: 'CAN',
      sourceHash,
    },
    nodes,
    messages,
    signals,
    warnings,
  };
}

/** 消息 key：legalize + dedupe（冲突后缀 _2 起）。 */
function projectMessageKey(rawName: string, taken: Set<string>, warnings: DbmWarning[]): string {
  const legalized = legalizeShortName(rawName, rawName);
  const key = dedupeShortName(legalized, taken);
  taken.add(key);
  if (legalized !== rawName) {
    warnings.push({
      code: 'dbc-short-name-legalized',
      elementRef: key,
      message: `Message name '${rawName}' legalized to '${legalized}'`,
    });
  }
  if (key !== legalized) {
    warnings.push({
      code: 'dbc-duplicate-message-name',
      elementRef: key,
      message: `Duplicate message name '${rawName}' deduplicated to '${key}'`,
    });
  }
  return key;
}

/** 信号 key：legalize + dedupe（key 不含 messageKey 前缀）。 */
function projectSignalKey(rawName: string, taken: Set<string>, warnings: DbmWarning[]): string {
  const legalized = legalizeShortName(rawName, rawName);
  const key = dedupeShortName(legalized, taken);
  taken.add(key);
  if (legalized !== rawName) {
    warnings.push({
      code: 'dbc-short-name-legalized',
      elementRef: key,
      message: `Signal name '${rawName}' legalized to '${legalized}'`,
    });
  }
  if (key !== legalized) {
    warnings.push({
      code: 'dbc-duplicate-signal-name',
      elementRef: key,
      message: `Duplicate signal name '${rawName}' deduplicated to '${key}'`,
    });
  }
  return key;
}

/** 从 network.attributeAssignments 按 target 归组 attribute（key = attribute 名）。 */
function collectAttributes(
  network: Network,
  match: (assignment: Network['attributeAssignments'][number]) => boolean,
): Readonly<Record<string, DbmAttributeValue>> {
  const result: Record<string, DbmAttributeValue> = {};
  for (const assignment of network.attributeAssignments) {
    if (match(assignment)) result[assignment.name] = assignment.value;
  }
  return result;
}

/** 通过 network.valueTables 解析 Signal.valueTable（value table 名）为条目列表。 */
function resolveValueTable(
  network: Network,
  name: string | undefined,
): readonly DbmValueTableEntry[] | undefined {
  if (name === undefined) return undefined;
  const table = network.valueTables.find((v) => v.name === name);
  if (table === undefined) return undefined;
  return table.entries.map((entry) => ({ value: entry.raw, label: entry.name }));
}

/** 投影 dbc-forge `Signal.multiplexed` 4 态为 DBM multiplex 事实。 */
function projectMultiplex(multiplexed: Multiplexed): DbmMultiplex {
  switch (multiplexed.kind) {
    case 'Plain':
      return { kind: 'plain' };
    case 'Multiplexor':
      return { kind: 'multiplexor' };
    case 'Muxed':
      return { kind: 'multiplexed', switchValue: multiplexed.value };
    case 'ExtendedMuxed':
      return { kind: 'extended-multiplexed', switchValue: multiplexed.value };
  }
}

/** 从 network.comments 收集匹配实体的注释（key 固定为 'EN'）。 */
function commentsFor(
  comments: readonly Comment[],
  match: (comment: Comment) => boolean,
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const comment of comments) {
    if (match(comment)) result.EN = comment.text;
  }
  return result;
}

/** 聚合多个接收者列表：去重并保持文档顺序。 */
function aggregateReceivers(lists: ReadonlyArray<readonly string[]>): readonly string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const receiver of list) {
      if (!seen.has(receiver)) {
        seen.add(receiver);
        result.push(receiver);
      }
    }
  }
  return result;
}
