/**
 * DBC mapper deterministic transforms: bit-position conversion, signal-type
 * dispatch, PduId numbering, UL naming, and container-key resolution.
 *
 * All functions are pure and deterministic — same input always yields the
 * same output (spec §2.1).
 *
 * Design source: docs/superpowers/specs/2026-09-03-dbc-full-import-design.md
 * §7.2.1 (ComBitPosition anchor table) + §7.2.2 (ComSignalType dispatch) +
 * §7.4 (PduId numbering) + §7.5 (UL naming).
 */

import { legalizeShortName } from '../../odx/shortName.js';
import type { ModuleBswmdDefIndex } from '../bswmdDefIndex.js';
import type { DbmSignal, DbmWarning, DbcWarningCode } from '../dbm.js';
import type { PduIdPolicy } from '../profile.js';

function linearBit(bit: number): { readonly byte: number; readonly bitInByte: number } {
  return { byte: Math.floor(bit / 8), bitInByte: bit % 8 };
}

/**
 * DBC startBit → AUTOSAR ComBitPosition（§7.2.1）。
 * little-endian 恒等；big-endian（Motorola）从 MSB sawtooth 沿 Motorola 链
 * 走 `length - 1` 步得到 LSB 的线性位位置。
 */
export function convertComBitPosition(
  startBit: number,
  length: number,
  byteOrder: 'little-endian' | 'big-endian',
): number {
  if (byteOrder === 'little-endian') return startBit;
  let current = startBit;
  for (let step = 0; step < length - 1; step += 1) {
    const { bitInByte } = linearBit(current);
    current = bitInByte > 0 ? current - 1 : current + 15;
  }
  return current;
}

/**
 * §7.2.1 DLC 边界校验：信号位覆盖超出实际 PDU 容量（`dlc * 8` 位）时为越界，
 * 报 `dbc-invalid-dlc`。
 *
 * - little-endian：线性覆盖 `[startBit, startBit + length)`，越界判定为
 *   `startBit + length > dlc * 8`。
 * - big-endian：在换算**之后**校验。Motorola sawtooth 逐位下行、逢字节边界
 *   上卷到下一字节 MSB，因此信号实际占据
 *   `[floor(startBit / 8), floor(comBitPosition / 8)]` 的**连续字节区间**
 *   （换算后的 ComBitPosition 是 LSB 线性位），越界判定为 LSB 所在字节
 *   `>= dlc`。绝不用 `[lsb, lsb + length)` 近似 —— 那会把"在 DLC 内合法回卷"
 *   的 Motorola 信号（如 dlc=2 下 startBit=7/length=16）误报为越界。
 */
export function signalExceedsDlc(
  startBit: number,
  length: number,
  byteOrder: 'little-endian' | 'big-endian',
  dlc: number,
): boolean {
  if (dlc < 0 || length <= 0 || startBit < 0) return true;
  if (byteOrder === 'little-endian') return startBit + length > dlc * 8;
  const comBitPosition = convertComBitPosition(startBit, length, byteOrder);
  return Math.floor(comBitPosition / 8) >= dlc;
}

/**
 * valueType + length → R22 ComSignalType literal（§7.2.2 分派表）。
 * 未覆盖组合返回 `warningCode: 'dbc-unsupported-value-type'` 且不带 value。
 */
export function comSignalType(
  valueType: DbmSignal['valueType'],
  length: number,
): { readonly value?: string; readonly warningCode?: DbcWarningCode } {
  if (valueType === 'unsigned') {
    if (length === 1) return { value: 'BOOLEAN' };
    if (length >= 2 && length <= 8) return { value: 'UINT8' };
    if (length >= 9 && length <= 16) return { value: 'UINT16' };
    if (length >= 17 && length <= 32) return { value: 'UINT32' };
    if (length >= 33 && length <= 64) return { value: 'UINT64' };
    return { warningCode: 'dbc-unsupported-value-type' };
  }
  if (valueType === 'signed') {
    if (length >= 2 && length <= 8) return { value: 'SINT8' };
    if (length >= 9 && length <= 16) return { value: 'SINT16' };
    if (length >= 17 && length <= 32) return { value: 'SINT32' };
    if (length >= 33 && length <= 64) return { value: 'SINT64' };
    return { warningCode: 'dbc-unsupported-value-type' };
  }
  if (valueType === 'float') {
    if (length === 32) return { value: 'FLOAT32' };
    return { warningCode: 'dbc-unsupported-value-type' };
  }
  if (valueType === 'double') {
    if (length === 64) return { value: 'FLOAT64' };
    return { warningCode: 'dbc-unsupported-value-type' };
  }
  return { warningCode: 'dbc-unsupported-value-type' };
}

export interface AssignPduIdsArgs {
  readonly messageKeys: readonly string[];
  readonly policy: PduIdPolicy;
  /**
   * 每条 message 的方向（§7.3.1）。perDirection scope 下 Tx 走 txBase、
   * Rx 走 rxBase；global scope 忽略方向，全部从 txBase 连续编号。
   * 缺省时全部 key 视为同一编号空间（从 txBase 起）。
   */
  readonly directions?: ReadonlyMap<string, 'SEND' | 'RECEIVE'>;
}

/**
 * 按 §7.4 PduId policy 给 message 分配 PduId。
 *
 * - `scope: 'perDirection'`：Tx / Rx 各自独立编号（txBase / rxBase）。
 * - `scope: 'global'`：同一编号空间，起点 txBase，rxBase 被忽略。
 * - `order`：document-order 保持输入顺序；shortName-order 按 key 字典序。
 * - 冲突检测（§7.4 trigger 1）：本次生成内部 —— 同一编号空间内两条 message
 *   分到相同 id。
 * - §7.4 trigger 2（与存量 id 的冲突）是**per-module**语义：生成的 id 落到
 *   哪个目标模块，就只与该模块当前值文件的存量 id 比较。因此不在本函数做
 *   —— CanIf 侧由 `mapCanIf` 对照 CanIf 存量集合检查，Com 侧（ComHandleId）
 *   由 `mapCom` 对照 Com 存量集合检查。绝不把多个模块的存量集合并集后检查
 *   （会把 A 模块的存量 id 误报到 B 模块头上）。
 */
export function assignPduIds(args: AssignPduIdsArgs): {
  readonly ids: ReadonlyMap<string, number>;
  readonly warnings: readonly DbmWarning[];
} {
  const { policy } = args;
  const warnings: DbmWarning[] = [];
  const ids = new Map<string, number>();

  const global = policy.scope === 'global';
  const txKeys: string[] = [];
  const rxKeys: string[] = [];
  if (global || !args.directions) {
    txKeys.push(...args.messageKeys);
  } else {
    for (const key of args.messageKeys) {
      if (args.directions.get(key) === 'RECEIVE') rxKeys.push(key);
      else txKeys.push(key);
    }
  }

  // shortName-order 用 code-unit 字典序（`<`/`>` 比较），保证跨平台 deterministic
  // （spec §2.1）；`localeCompare` 依赖宿主 locale，可能在不同平台上产生不同顺序。
  const ordered = (keys: readonly string[]): readonly string[] =>
    policy.order === 'shortName-order'
      ? [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      : [...keys];

  const assignNamespace = (keys: readonly string[], base: number): void => {
    const namespaceTaken = new Set<number>();
    let index = 0;
    for (const key of ordered(keys)) {
      const id = base + index * policy.step;
      index += 1;
      if (namespaceTaken.has(id)) {
        warnings.push({
          code: 'dbc-pdu-id-conflict',
          elementRef: key,
          message: `PduId ${id} for ${key} duplicates another id in the same numbering space`,
        });
      }
      namespaceTaken.add(id);
      ids.set(key, id);
    }
  };

  assignNamespace(txKeys, policy.txBase);
  assignNamespace(rxKeys, global ? policy.txBase : policy.rxBase);

  return { ids, warnings };
}

/**
 * 按 UL 命名模板渲染 UL 字段名（§7.5）。
 * `{module}` 占位符展开为 `CanIf`；`{pdu}` 展开为 PDU shortName。
 * 渲染结果必须经过 short-name legalization。
 */
export function upperLayerName(args: {
  readonly pduShortName: string;
  readonly template: string;
}): string {
  const rendered = args.template
    .replaceAll('{module}', 'CanIf')
    .replaceAll('{pdu}', args.pduShortName);
  return legalizeShortName(rendered, args.pduShortName);
}

/**
 * 从候选 definition spine key 列表取**第一个在 BSWMD index 中存在**的 key
 * （§5.2 containerKeys 语义）。全部候选均不命中时返回 `undefined`，
 * 由调用方按 §4.3 失败规则处理（`dbc-bswmd-def-missing`）。
 */
export function resolveContainerKey(
  candidates: readonly string[],
  index: ModuleBswmdDefIndex,
): string | undefined {
  for (const candidate of candidates) {
    if (index.containerPath.has(candidate)) return candidate;
  }
  return undefined;
}
