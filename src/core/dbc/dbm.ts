/**
 * DBM（DBC 中间模型）：DBC 文件的业务事实模型。
 * 不包含任何具体 ECUC 参数名；字段映射由 Mapping Profile 完成。
 * 设计来源：docs/superpowers/specs/2026-09-03-dbc-full-import-design.md §3。
 */

import type { Network } from '@dbc-forge/core';

/**
 * Warning closed set（§11）。所有新增 warning code 必须来自此集合。
 */
export const DBC_WARNING_CODES = [
  'dbc-duplicate-message-name',
  'dbc-duplicate-signal-name',
  'dbc-invalid-can-id',
  'dbc-invalid-dlc',
  'dbc-message-missing-transmitter',
  'dbc-unsupported-byte-order',
  'dbc-unsupported-value-type',
  'dbc-attribute-unavailable',
  'dbc-bswmd-def-missing',
  'dbc-param-type-mismatch',
  'dbc-enum-unmapped',
  'dbc-reference-missing',
  'dbc-policy-default-used',
  'dbc-policy-unmapped',
  'dbc-pdu-id-conflict',
  'dbc-short-name-legalized',
  'dbc-multiplexed-signal',
  'dbc-manifest-ignored',
] as const;

export type DbcWarningCode = (typeof DBC_WARNING_CODES)[number];

/** DBM 顶层模型：nodes / messages / signals / warnings。 */
export interface Dbm {
  readonly meta: DbmMeta;
  readonly nodes: readonly DbmNode[];
  readonly messages: readonly DbmMessage[];
  readonly signals: readonly DbmSignal[];
  readonly warnings: readonly DbmWarning[];
}

export interface DbmMeta {
  readonly sourcePath: string;
  readonly dbcVersion?: string;
  /**
   * DBC 无可靠的 CAN FD 自描述字段；FD 判定属于 Profile 职责（见 §7.3）。
   * 29-bit CAN ID 以普通数值（≤ 0x1fffffff）进入 messageId；`isExtended` 来自
   * dbc-forge 的 `id > 0x7ff` 判定。仅处理 Vector CANdb++ 的 bit-31 扩展标志：
   * 解析层把 `0x80000000 | id` 归一化为真实 29-bit id（见 dbmBuilder）。
   */
  readonly protocol: 'CAN' | 'UNKNOWN';
  readonly sourceHash: string; // sha256 hex，与 ODX provenance 的 sourceHash 对齐
}

export interface DbmNode {
  readonly name: string;
  readonly comments: Readonly<Record<string, string>>;
  /** 从 network.attributeAssignments 按 node target 归组的 attribute（key = attribute 名）。 */
  readonly attributes: Readonly<Record<string, DbmAttributeValue>>;
}

export interface DbmMessage {
  readonly key: string; // 稳定 key：legalized shortName，冲突时后缀 _2 起（见 §3.2）
  readonly shortName: string; // 原始 message name，未合法化
  readonly messageId: number; // 归一化 Vector bit-31 扩展标志后的真实 CAN ID（见 canId.ts）
  readonly isExtended: boolean;
  readonly dlc: number;
  readonly transmitter?: string;
  /** 由所属 signals[].receivers 聚合（DBC 的 receiver 只存在于 SG_ 行尾），builder 负责归组去重。 */
  readonly receivers: readonly string[];
  readonly attributes: Readonly<Record<string, DbmAttributeValue>>;
  readonly comments: Readonly<Record<string, string>>;
}

/** DBC SG_ 的 multiplex 事实。dbc-forge `Signal.multiplexed` 4 态的直接投影。 */
export type DbmMultiplex =
  | { readonly kind: 'plain' }
  | { readonly kind: 'multiplexor' }
  | { readonly kind: 'multiplexed'; readonly switchValue: number }
  | { readonly kind: 'extended-multiplexed'; readonly switchValue: number };

export interface DbmSignal {
  readonly key: string; // 稳定 key：所属 message scope 内去重后的 legalized signalName
  readonly messageKey: string;
  readonly shortName: string;
  readonly startBit: number; // DBC 原始语义：BE 信号为 MSB（sawtooth 计数）
  readonly length: number;
  readonly byteOrder: 'little-endian' | 'big-endian';
  readonly valueType: 'signed' | 'unsigned' | 'float' | 'double';
  readonly factor: number;
  readonly offset: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly unit?: string;
  readonly receivers: readonly string[];
  readonly multiplex: DbmMultiplex;
  readonly attributes: Readonly<Record<string, DbmAttributeValue>>;
  readonly valueTable?: readonly DbmValueTableEntry[];
}

export type DbmAttributeValue = string | number | boolean;

export interface DbmValueTableEntry {
  readonly value: number;
  readonly label: string;
}

export interface DbmWarning {
  readonly code: DbcWarningCode;
  readonly elementRef: string;
  readonly message: string;
}

/** DBC 文档包装：原始文本的 sourceHash + dbc-forge 解析出的 Network。 */
export interface DbmDocument {
  readonly sourcePath: string;
  readonly sourceHash: string;
  readonly network: Network;
}
