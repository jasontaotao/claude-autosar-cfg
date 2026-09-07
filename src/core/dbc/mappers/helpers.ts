/**
 * DBC mapper shared helper block — extracted from comMapper.ts (Task 7) so the
 * Com / CanIf / PduR mappers do not duplicate it (spec §2.1, DRY).
 *
 * All helpers are pure and operate only on the mutable `DbcMapperContext`
 * accumulators (`warnings` / `fieldDiffs`) or on plain strings — the context
 * itself is never exposed past the mapper boundary.
 */

import type { ArxmlModule } from '../../arxml/types.js';
import type { DbcImportModule } from '../bswmdDefIndex.js';
import type { DbcWarningCode } from '../dbm.js';
import type { CommonMappingRule } from '../profile.js';

import type { DbcMapperContext, MapperResult } from './types.js';

/**
 * 把 context 的 mutable `warnings` / `fieldDiffs` 打包成不可变 `MapperResult`。
 * 绝不把 context 本身暴露出去。
 */
export function resultOf(
  context: DbcMapperContext,
  module: ArxmlModule,
): MapperResult<ArxmlModule> {
  return {
    value: module,
    warnings: [...context.warnings],
    fieldDiffs: [...context.fieldDiffs],
  };
}

export function pushWarning(
  context: DbcMapperContext,
  code: DbcWarningCode,
  elementRef: string,
  message: string,
): void {
  context.warnings.push({ code, elementRef, message });
}

/** definitionKey 的容器部分（BSWMD spine 语义，§4.2）。 */
export function containerPart(definitionKey: string): string {
  const slash = definitionKey.lastIndexOf('/');
  return slash === -1 ? definitionKey : definitionKey.slice(0, slash);
}

/**
 * 记录一条 source=Unmapped 的字段 diff（无 warning）。用于 BSWMD 未声明 /
 * 无法映射的字段（§7.2.3 物理转换参数、缺失 attribute 的声明字段等）。
 */
export function recordUnmappedDiff(
  context: DbcMapperContext,
  moduleName: DbcImportModule,
  definitionKey: string,
  incoming: string | number | boolean | undefined,
): void {
  context.fieldDiffs.push({
    moduleName,
    containerPath: containerPart(definitionKey),
    paramKey: definitionKey,
    ...(incoming !== undefined && { incoming }),
    source: 'Unmapped',
  });
}

/**
 * 把 `[fromIndex, toIndex)` 区间内的字段 diff 的 containerPath 重写到实例路径。
 * makeParam 记录的 containerPath 是 definition 级路径（Task 6 约定）；mapper
 * 在生成每个实例容器后调用此函数，使 diff 锚定到实例路径
 * （如 `/CanIf/CanIfTxPdu/EngineMsg`）。
 */
export function reconcileFieldDiffRange(
  context: DbcMapperContext,
  fromIndex: number,
  toIndex: number,
  instancePath: string,
): void {
  for (let i = fromIndex; i < toIndex; i += 1) {
    const diff = context.fieldDiffs[i];
    if (diff !== undefined) {
      context.fieldDiffs[i] = { ...diff, containerPath: instancePath };
    }
  }
}

/** key 的父级 spine key：`ComConfig/ComIPdu` → `ComConfig`；无斜杠返回 undefined。 */
export function parentKeyOf(key: string): string | undefined {
  const slash = key.lastIndexOf('/');
  return slash === -1 ? undefined : key.slice(0, slash);
}

export function lastSegment(key: string): string {
  const slash = key.lastIndexOf('/');
  return slash === -1 ? key : key.slice(slash + 1);
}

/** 按 definitionKey 找 Profile 规则（Profile 内 definitionKey 唯一）。 */
export function findRule(
  profile: { readonly parameters: readonly CommonMappingRule[] },
  definitionKey: string,
): CommonMappingRule | undefined {
  return profile.parameters.find((rule) => rule.definitionKey === definitionKey);
}
