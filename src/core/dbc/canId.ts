/**
 * CAN ID 归一化：处理 Vector CANdb++ 导出的扩展帧 bit-31 标志。
 *
 * Vector 系列工具（CANdb++ / CANoe）导出 DBC 时，对扩展帧的 BO_ id 写
 * `0x80000000 | id`（bit-31 置位）而不是普通 29-bit 数值。@dbc-forge/core
 * 原样透传该数值；本项目在边界统一剥离标志位，恢复真实 CAN ID。
 *
 * 仅当 bit-31 置位时才剥离；无标志的超界 id 原样返回，由调用方判 invalid。
 */

/**
 * 剥离 bit-31 扩展帧标志，返回真实 29-bit CAN ID。标准帧（≤ 0x7ff）原样透传。
 *
 * 负数原样透传：JS 的 `&` 作用于有符号 32-bit，所有负数 bit-31 都置位，
 * 若在此剥离会掩成合法 29-bit id；真实 DBC 的 BO_ id 非负（`\d+`），
 * 负数只来自手构造的 DbmDocument 或未来 parser 变更，交由调用方判 invalid。
 */
export function normalizeCanId(rawId: number): number {
  if (rawId < 0) return rawId;
  // 只剥 bit-31（Vector 扩展标志），保留 bit-29/30：真实 id 若因此超出
  // 29-bit 上界，调用方会判 invalid（strip-then-recheck）。
  return (rawId & 0x80000000) !== 0 ? rawId & 0x7fffffff : rawId;
}
