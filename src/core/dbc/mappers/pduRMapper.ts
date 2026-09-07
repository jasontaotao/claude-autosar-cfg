/**
 * PduR mapper — deterministic DBC → PduR ECUC value generation (spec §7.6).
 *
 * One `PduRRoutingPath` instance per RELEVANT message (shortName = message.key),
 * hanging under the wrapper container built from the PARENT of the resolved
 * routing-path container key (`PduRRoutingPaths` for `PduRRoutingPaths/
 * PduRRoutingPath`) — mirroring the comMapper / canIfMapper wrapper pattern, so
 * instance paths are `/PduR/PduRRoutingPaths/<key>` (RULING 10, verbatim
 * example). Source / destination sides are modeled as `PduRSrcPdu` /
 * `PduRDestPdu` sub-container instances (R22 normative shape); a
 * profile-declared direct reference key whose parent is the routing path
 * itself hangs the reference directly on the route instance (spec §7.6:
 * "以 Profile 的 sourceReferenceKey / destinationReferenceKey 声明为准").
 *
 * Flat HandleId layout (§7.6 direct-param shape): when the BSWMD has no
 * `PduRSrcPdu` / `PduRDestPdu` sub-container defs but declares the `*HandleId`
 * params directly under `PduRRoutingPath`, the profile's `sourceHandleKey` /
 * `destinationHandleKey` supply the flat HandleId spine keys and the mapper
 * hangs those params on the route instance instead of a sub-container.
 * Discriminator: `containerPath.has(refParentKey)` → sub-container layout;
 * else flat handle key declared → flat fallback; else whole-side skip.
 *
 * Reference topology (normative): Tx → SrcRef = the generated Com IPdu
 * instance path, DestRef = the generated CanIf Tx PDU instance path; Rx →
 * swapped. Target paths arrive from the FACADE, derived from the ACTUAL
 * generated Com / CanIf module trees (via collectImportContainers), never
 * re-derived from BSWMD spines.
 *
 * Validation (spec §7.6 + §4.3): a reference is emitted only when
 * 1) the ReferenceDef exists (makeReference handles missing defs: Unmapped),
 * 2) the reference's destKind matches the ECUC container-value space
 *    (`ECUC-CONTAINER-VALUE`, the DEST the serializer writes for VALUE-REFs),
 * 3) the target container actually exists in the generated trees.
 * Violations are never a silent success:
 * - destKind outside the ECUC container-value space (EcuC PduCollection
 *   boundary) → reference omitted + `dbc-reference-missing` + field diff
 *   `source: 'Unmapped'` (user completes later in the EcuC layer, §7.6).
 * - missing target container (real resolve failure) → reference omitted +
 *   `dbc-reference-missing` + field diff `source: 'Error'`.
 *
 * HandleId fallback (§7.6): when the reference defs are absent but the
 * `PduRSrcPduHandleId` / `PduRDestPduHandleId` params are declared, handle
 * ids come from the SAME shared pduIds map the facade passed to CanIf /
 * Com (`ComHandleId`); the omitted reference keeps its Unmapped diff.
 *
 * Design source: docs/superpowers/specs/2026-09-03-dbc-full-import-design.md
 * §7.6 (PduR mapping) + §8.1 (field diffs).
 */

import type { ArxmlContainer, ArxmlElement, ArxmlModule, ParamValue } from '../../arxml/types.js';
import type { DbmMessage } from '../dbm.js';
import type { CommonMappingRule, PduRProfile } from '../profile.js';

import {
  findRule,
  lastSegment,
  parentKeyOf,
  pushWarning,
  reconcileFieldDiffRange,
  recordUnmappedDiff,
  resultOf,
} from './helpers.js';
import { resolveContainerKey } from './transforms.js';
import {
  makeContainer,
  makeParam,
  makeReference,
  type DbcMapperContext,
  type MapperFieldDiff,
  type MapperResult,
} from './types.js';

/** facade 输入：参考目标路径必须来自实际生成的 Com / CanIf 模块树。 */
export interface MapPduRInput {
  readonly relevantMessages: readonly DbmMessage[];
  readonly directionByMessageKey: ReadonlyMap<string, 'SEND' | 'RECEIVE'>;
  /** message.key → Com IPdu 实例路径（不含 = 生成的 Com 树中没有该实例）。 */
  readonly comPduPathByMessageKey: ReadonlyMap<string, string>;
  /** message.key → CanIf PDU 实例路径（不含 = 生成的 CanIf 树中没有该实例）。 */
  readonly canIfPduPathByMessageKey: ReadonlyMap<string, string>;
  /** assignPduIds 的共享结果：CanIf pduIds / Com ComHandleId / PduR HandleId 同源。 */
  readonly pduIds: ReadonlyMap<string, number>;
}

/** 对 ECUC container value 引用的合法 DEST（serializer <VALUE-REF DEST="..."> 形状）。 */
const ECUC_CONTAINER_VALUE_DEST = 'ECUC-CONTAINER-VALUE';

type RefSource = MapperFieldDiff['source'];

/** 单侧（src/dest）生成结果。 */
interface SideResult {
  /** 子容器布局：PduRSrcPdu / PduRDestPdu 实例；直接引用布局为 undefined。 */
  readonly container?: ArxmlContainer;
  /** 子容器布局下的实例路径（调用方用它锚定该侧字段 diff）。 */
  readonly containerPath?: string;
  /** 直接引用布局：并入 route 实例的 params。 */
  readonly params: Record<string, ParamValue>;
}

/**
 * 从 Profile 规则声明里查找某个 reference 的完整 spine key
 * （`sourceReferenceKey` / `destinationReferenceKey` 缺席时的兜底）。
 * 按 `definitionKey`（短名）匹配，如 `PduRSrcPduRef`。
 */
function refKeyFromRules(pduRProfile: PduRProfile, refShortName: string): string | undefined {
  for (const rule of pduRProfile.parameters) {
    if (rule.definitionKey === refShortName && rule.referenceKey !== undefined) {
      return rule.referenceKey;
    }
  }
  return undefined;
}

/** 方向 × 侧 → 目标容器实例路径（Tx: src=Com, dest=CanIf；Rx 对调，§7.6）。 */
function sideTargetPath(
  input: MapPduRInput,
  message: DbmMessage,
  direction: 'SEND' | 'RECEIVE',
  side: 'src' | 'dest',
): string | undefined {
  if (side === 'src') {
    return direction === 'SEND'
      ? input.comPduPathByMessageKey.get(message.key)
      : input.canIfPduPathByMessageKey.get(message.key);
  }
  return direction === 'SEND'
    ? input.canIfPduPathByMessageKey.get(message.key)
    : input.comPduPathByMessageKey.get(message.key);
}

/**
 * 生成单个 HandleId 参数（共享实现）：handleKey 缺失 → 跳过；handleId 缺失 →
 * 记 Unmapped diff；否则 makeParam(Profile-default) 按 `lastSegment` 存。
 * buildSideValue.pushHandle 与 buildFlatHandleValue 共用此逻辑。
 */
function makeHandleParam(
  context: DbcMapperContext,
  handleKey: string | undefined,
  handleId: number | undefined,
  params: Record<string, ParamValue>,
): Record<string, ParamValue> {
  if (handleKey === undefined) return params;
  if (handleId === undefined) {
    recordUnmappedDiff(context, 'PduR', handleKey, undefined);
    return params;
  }
  const handleParam = makeParam(context, 'PduR', handleKey, handleId, 'Profile-default');
  if (handleParam === undefined) return params;
  return { ...params, [lastSegment(handleKey)]: handleParam };
}

/**
 * 依据 ReferenceDef 与目标路径生成 src/dest 侧的值（spec §7.6 校验链）。
 * 失败时尝试 HandleId fallback：引用省略 + 共享 pduIds 生成 handle id。
 */
function buildSideValue(
  context: DbcMapperContext,
  refKey: string,
  targetPath: string | undefined,
  handleKey: string | undefined,
  handleId: number | undefined,
  refSource: RefSource,
): Record<string, ParamValue> {
  const definition = context.index.PduR.referenceDef.get(refKey);
  const refShortName = lastSegment(refKey);
  let params: Record<string, ParamValue> = {};

  const pushHandle = (): void => {
    params = makeHandleParam(context, handleKey, handleId, params);
  };

  if (definition === undefined) {
    // 引用定义缺失：makeReference 记录 dbc-bswmd-def-missing + Unmapped diff。
    // §7.6 HandleId fallback：*HandleId 参数存在时用共享 pduIds 生成。
    void makeReference(context, 'PduR', refKey, targetPath ?? '', refSource);
    pushHandle();
    return params;
  }
  if (targetPath === undefined) {
    // §7.6 解析失败：目标容器不在生成的模块树中 → Error diff，不写引用。
    context.fieldDiffs.push({
      moduleName: 'PduR',
      containerPath: parentKeyOf(refKey) ?? '',
      paramKey: refKey,
      source: 'Error',
      warningCodes: ['dbc-reference-missing'],
    });
    pushWarning(
      context,
      'dbc-reference-missing',
      refShortName,
      `PduR reference ${refKey} has no generated target container (missing Com/CanIf instance)`,
    );
    pushHandle();
    return params;
  }
  if (definition.destKind !== ECUC_CONTAINER_VALUE_DEST) {
    // destKind 不在 ECUC container value 域（EcuC PduCollection 边界，§7.6）→
    // 省略，字段标 Unmapped（用户后续 EcuC 层手工补齐），非解析失败。
    context.fieldDiffs.push({
      moduleName: 'PduR',
      containerPath: parentKeyOf(refKey) ?? '',
      paramKey: refKey,
      incoming: targetPath,
      source: 'Unmapped',
      warningCodes: ['dbc-reference-missing'],
    });
    pushWarning(
      context,
      'dbc-reference-missing',
      refShortName,
      `PduR reference ${refKey} has destKind ${definition.destKind}, expected ${ECUC_CONTAINER_VALUE_DEST} (EcuC Pdu references are not generated)`,
    );
    pushHandle();
    return params;
  }
  // 主路径：引用生成；handle id 字段保持未生成（不猜测，R22 语义）。
  const param = makeReference(context, 'PduR', refKey, targetPath, refSource);
  // makeReference 已处理 def 缺失；此处 def 存在 → 返回值必然非 undefined。
  params = { ...params, [refShortName]: param! };
  return params;
}

/** §7.6 扁平 HandleId 布局：HandleId 参数直接挂 route 实例（无子容器）。 */
function buildFlatHandleValue(
  context: DbcMapperContext,
  handleKey: string | undefined,
  handleId: number | undefined,
): Record<string, ParamValue> {
  return makeHandleParam(context, handleKey, handleId, {});
}

/**
 * 生成单个 routing path 的 source 或 destination 侧：
 * - 子容器布局（refKey 有父段且子容器定义存在）：`PduRSrcPdu` / `PduRDestPdu`
 *   实例，内含 reference（或 fallback 的 handle id）。
 * - 扁平 HandleId 布局（refKey 有父段但子容器缺失，Profile 声明了扁平 handle
 *   key）：HandleId 参数直接并入 routing path 实例（§7.6 直接参数布局，不报
 *   def-missing——缺失是预期布局）。
 * - 直接引用布局（refKey 无父段，Profile 声明为准）：reference 直接并入
 *   routing path 实例。
 * 子容器缺失且无扁平回退 key 时整侧省略（makeContainer 报 def-missing）。
 */
function mapSide(
  context: DbcMapperContext,
  input: MapPduRInput,
  message: DbmMessage,
  direction: 'SEND' | 'RECEIVE',
  side: 'src' | 'dest',
  refKey: string,
  handleRule: CommonMappingRule | undefined,
  refSource: RefSource,
  flatHandleKey: string | undefined,
  routePath: string,
): SideResult | undefined {
  const targetPath = sideTargetPath(input, message, direction, side);

  const refParentKey = parentKeyOf(refKey);
  if (refParentKey !== undefined) {
    // 子容器存在 → 子容器布局。先探测再 makeContainer：子容器缺失时若是扁平
    // 布局（Profile 声明了扁平 handle key）直接回退，不产生 def-missing 警告
    // （缺失是预期布局，非数据错误）。
    const hasSubContainer = context.index.PduR.containerPath.has(refParentKey);
    if (!hasSubContainer) {
      if (flatHandleKey === undefined) {
        // 无扁平回退 key：维持原行为 —— makeContainer 报 def-missing 并整侧省略。
        makeContainer(context, 'PduR', refParentKey, lastSegment(refParentKey));
        return undefined;
      }
      // §7.6 扁平 HandleId 布局：HandleId 参数并入 route 实例，不再整侧省略。
      return {
        params: buildFlatHandleValue(context, flatHandleKey, input.pduIds.get(message.key)),
      };
    }

    const container = makeContainer(context, 'PduR', refParentKey, lastSegment(refParentKey));
    if (container === undefined) return undefined;

    const containerPath = `${routePath}/${lastSegment(refParentKey)}`;
    const params = buildSideValue(
      context,
      refKey,
      targetPath,
      handleRule?.paramKey,
      input.pduIds.get(message.key),
      refSource,
    );
    return { container: { ...container, params }, containerPath, params };
  }
  // 直接引用布局：无子容器，参数并入 route 实例；diff 由 route 级 reconcile 统一锚定。
  return {
    params: buildSideValue(
      context,
      refKey,
      targetPath,
      handleRule?.paramKey,
      input.pduIds.get(message.key),
      refSource,
    ),
  };
}

/**
 * 生成 PduR 模块的 incoming 值。每条相关 message 一个 PduRRoutingPath 实例，
 * 内部按 R22 布局生成 PduRSrcPdu / PduRDestPdu 子容器（或按 Profile 声明的
 * 直接引用 key 布局）。
 */
export function mapPduR(context: DbcMapperContext, input: MapPduRInput): MapperResult<ArxmlModule> {
  const pduRProfile = context.profile.modules.PduR;
  const routingKey = resolveContainerKey(pduRProfile.routingPathContainerKeys, context.index.PduR);

  const module: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'PduR',
    params: {},
    children: [],
    references: [],
  };

  if (routingKey === undefined) {
    pushWarning(
      context,
      'dbc-bswmd-def-missing',
      pduRProfile.routingPathContainerKeys[0] ?? 'PduRRoutingPath',
      `No PduR routing-path container definition found among: ${pduRProfile.routingPathContainerKeys.join(', ')}`,
    );
    return resultOf(context, module);
  }

  // 参考 key：Profile 显式声明优先（§7.6），否则回退到 parameters 规则声明。
  const srcRefKey = pduRProfile.sourceReferenceKey ?? refKeyFromRules(pduRProfile, 'PduRSrcPduRef');
  const destRefKey =
    pduRProfile.destinationReferenceKey ?? refKeyFromRules(pduRProfile, 'PduRDestPduRef');

  // HandleId fallback 用规则（§7.6）。
  const srcHandleRule = findRule(pduRProfile, 'PduRSrcPduHandleId');
  const destHandleRule = findRule(pduRProfile, 'PduRDestPduHandleId');

  const wrapperKey = parentKeyOf(routingKey);
  const wrapper =
    input.relevantMessages.length > 0 && wrapperKey !== undefined
      ? makeContainer(context, 'PduR', wrapperKey, lastSegment(wrapperKey))
      : undefined;
  // 实例路径基座：wrapper 存在时为 `/PduR/<wrapper.shortName>`，否则 `/PduR`。
  const instanceBase = wrapper === undefined ? '/PduR' : `/PduR/${wrapper.shortName}`;

  let wrapperChildren: readonly ArxmlElement[] = [];
  let directChildren: readonly ArxmlElement[] = [];

  for (const message of input.relevantMessages) {
    const direction = input.directionByMessageKey.get(message.key) ?? 'SEND';
    const route = makeContainer(context, 'PduR', routingKey, message.key);
    if (route === undefined) continue;
    const routePath = `${instanceBase}/${message.key}`;
    const routeDiffStart = context.fieldDiffs.length;

    const srcSide =
      srcRefKey === undefined
        ? undefined
        : mapSide(
            context,
            input,
            message,
            direction,
            'src',
            srcRefKey,
            srcHandleRule,
            'Derived',
            pduRProfile.sourceHandleKey,
            routePath,
          );
    // 区间语义：[routeDiffStart, srcStart) = src 侧 diff；[srcStart, destStart) = dest 侧 diff。
    const srcStart = context.fieldDiffs.length;
    const destSide =
      destRefKey === undefined
        ? undefined
        : mapSide(
            context,
            input,
            message,
            direction,
            'dest',
            destRefKey,
            destHandleRule,
            'Derived',
            pduRProfile.destinationHandleKey,
            routePath,
          );
    const destStart = context.fieldDiffs.length;

    // 子容器布局：PduRSrcPdu / PduRDestPdu 挂 route 下；直接引用布局：参数并入 route。
    const srcContainer = srcSide?.container;
    const destContainer = destSide?.container;

    let routeChildren: readonly ArxmlElement[] = [];
    let routeParams: Record<string, ParamValue> = {};
    if (srcContainer !== undefined) routeChildren = [...routeChildren, srcContainer];
    else if (srcSide !== undefined) routeParams = { ...routeParams, ...srcSide.params };
    if (destContainer !== undefined) routeChildren = [...routeChildren, destContainer];
    else if (destSide !== undefined) routeParams = { ...routeParams, ...destSide.params };

    // RULING 10 — 两阶段锚定：先全量 route 路径（覆盖 route 自身 diff 与直接引用
    // 布局参数），再按子容器实例路径覆盖更精确的区间（src/dest 侧 diff）。
    reconcileFieldDiffRange(context, routeDiffStart, context.fieldDiffs.length, routePath);
    if (srcSide?.containerPath !== undefined) {
      // src 侧区间：[routeDiffStart, srcStart) → PduRSrcPdu 实例路径。
      reconcileFieldDiffRange(context, routeDiffStart, srcStart, srcSide.containerPath);
    }
    if (destSide?.containerPath !== undefined) {
      // dest 侧区间：[srcStart, destStart) → PduRDestPdu 实例路径。
      reconcileFieldDiffRange(context, srcStart, destStart, destSide.containerPath);
    }

    const built: ArxmlContainer = { ...route, params: routeParams, children: routeChildren };
    if (wrapper !== undefined) wrapperChildren = [...wrapperChildren, built];
    else directChildren = [...directChildren, built];
  }

  const moduleChildren =
    wrapper !== undefined ? [{ ...wrapper, children: wrapperChildren }] : directChildren;

  return resultOf(context, { ...module, children: moduleChildren });
}
