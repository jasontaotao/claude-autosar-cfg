/**
 * Com mapper — deterministic DBC → Com ECUC value generation (spec §7.2 + §7.7).
 *
 * Consumes `ComMapperInput` (relevance / direction / handle ids computed by the
 * facade) and produces the incoming `Com` module: one `ComIPdu` per relevant
 * message, `ComSignal` containers per signal, and the `ComTxMode` chain for Tx
 * messages. Every generated ParamValue goes through `makeParam` so it carries a
 * BSWMD `definitionRef` (spec §4.3).
 *
 * Design source: docs/superpowers/specs/2026-09-03-dbc-full-import-design.md
 * §7.2 (Com mapping) + §7.7 (multiplex policy).
 */

import type { ArxmlContainer, ArxmlElement, ArxmlModule, ParamValue } from '../../arxml/types.js';
import type { DbmMessage, DbmSignal } from '../dbm.js';
import type { ComProfile } from '../profile.js';
import { DEFAULT_COM_TX_MODE_ENUM_MAP } from '../profile.js';

import {
  findRule,
  lastSegment,
  parentKeyOf,
  pushWarning,
  recordUnmappedDiff,
  reconcileFieldDiffRange,
  resultOf,
} from './helpers.js';
import {
  comSignalType,
  convertComBitPosition,
  resolveContainerKey,
  signalExceedsDlc,
} from './transforms.js';
import {
  makeContainer,
  makeParam,
  type DbcMapperContext,
  type MapperFieldDiff,
  type MapperResult,
} from './types.js';

export interface ComMapperInput {
  readonly relevantMessages: readonly DbmMessage[];
  readonly signalsByMessageKey: ReadonlyMap<string, readonly DbmSignal[]>;
  readonly directionByMessageKey: ReadonlyMap<string, 'SEND' | 'RECEIVE'>;
  readonly handleIds: ReadonlyMap<string, number>;
  /**
   * 当前值文件中已存在的 Com handleId 集合（§7.4 trigger 2 per-module 语义）：
   * ComHandleId 只与 Com 存量集合比较，绝不与 CanIf 存量并集比较。
   */
  readonly existingHandleIds: ReadonlySet<number>;
}

/** ComTxMode chain spine keys relative to the resolved IPdu container key. */
const TX_MODE_CHAIN_KEYS = [
  'ComTxIPdu',
  'ComTxIPdu/ComTxModeTrue',
  'ComTxIPdu/ComTxModeTrue/ComTxMode',
] as const;

/** GenMsgCycleTime（DBC 毫秒）→ 秒。缺失 / 非有限 / 负数返回 undefined。 */
function computePeriodSeconds(message: DbmMessage): number | undefined {
  const cycleTime = message.attributes['GenMsgCycleTime'];
  const numeric =
    typeof cycleTime === 'number'
      ? cycleTime
      : typeof cycleTime === 'string'
        ? Number(cycleTime)
        : Number.NaN;
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  return numeric / 1000;
}

/**
 * 构建单个 signal 的 ComSignal 容器。multiplex 策略（§7.7）在字段映射前应用；
 * 返回 undefined 表示该信号被跳过（multiplexed 且未开启 plain 导入）。
 * `dlc` 是所属 message 的 DLC（§7.2.1）：信号位覆盖超出 PDU 容量时发
 * `dbc-invalid-dlc` 并跳过 ComBitPosition / ComBitSize（镜像其他校验失败
 * 路径 —— warning + Unmapped diff，容器与其余字段照常生成）。
 */
function mapSignal(
  context: DbcMapperContext,
  signalKey: string,
  signal: DbmSignal,
  comProfile: ComProfile,
  dlc: number,
  signalBasePath: string,
): { readonly container: ArxmlContainer } | undefined {
  if (signal.multiplex.kind === 'multiplexed' || signal.multiplex.kind === 'extended-multiplexed') {
    pushWarning(
      context,
      'dbc-multiplexed-signal',
      signal.key,
      `Multiplexed signal ${signal.key} is not modeled as a multiplexed signal (AUTOSAR COM cannot express DBC dynamic multiplexing)`,
    );
    if (comProfile.importMultiplexedAsPlain !== true) return undefined;
  }

  const signalContainer = makeContainer(context, 'Com', signalKey, signal.key);
  if (signalContainer === undefined) return undefined;

  const diffStart = context.fieldDiffs.length;
  let params: Record<string, ParamValue> = {};

  const bitPosition = convertComBitPosition(signal.startBit, signal.length, signal.byteOrder);
  if (signalExceedsDlc(signal.startBit, signal.length, signal.byteOrder, dlc)) {
    pushWarning(
      context,
      'dbc-invalid-dlc',
      signal.key,
      `Signal ${signal.key} (${signal.length} bits at start bit ${signal.startBit}, ${signal.byteOrder}) exceeds the ${dlc}-byte PDU capacity`,
    );
    recordUnmappedDiff(context, 'Com', `${signalKey}/ComBitPosition`, bitPosition);
    recordUnmappedDiff(context, 'Com', `${signalKey}/ComBitSize`, signal.length);
  } else {
    const bitPositionParam = makeParam(
      context,
      'Com',
      `${signalKey}/ComBitPosition`,
      bitPosition,
      'Auto',
    );
    if (bitPositionParam !== undefined) params = { ...params, ComBitPosition: bitPositionParam };

    const bitSizeParam = makeParam(
      context,
      'Com',
      `${signalKey}/ComBitSize`,
      signal.length,
      'Auto',
    );
    if (bitSizeParam !== undefined) params = { ...params, ComBitSize: bitSizeParam };
  }

  const endiannessValue = signal.byteOrder === 'little-endian' ? 'LITTLE_ENDIAN' : 'BIG_ENDIAN';
  const endiannessParam = makeParam(
    context,
    'Com',
    `${signalKey}/ComSignalEndianness`,
    endiannessValue,
    'Auto',
  );
  if (endiannessParam !== undefined) {
    params = { ...params, ComSignalEndianness: endiannessParam };
  }

  const typeResult = comSignalType(signal.valueType, signal.length);
  if (typeResult.value !== undefined) {
    const typeParam = makeParam(
      context,
      'Com',
      `${signalKey}/ComSignalType`,
      typeResult.value,
      'Auto',
    );
    if (typeParam !== undefined) params = { ...params, ComSignalType: typeParam };
  } else if (typeResult.warningCode !== undefined) {
    pushWarning(
      context,
      typeResult.warningCode,
      signal.key,
      `Unsupported signal type ${signal.valueType}/${signal.length}`,
    );
    recordUnmappedDiff(context, 'Com', `${signalKey}/ComSignalType`, undefined);
  }

  const inactiveValue = signal.attributes['GenSigInactiveValue'];
  if (inactiveValue !== undefined) {
    const invalidParam = makeParam(
      context,
      'Com',
      `${signalKey}/ComSignalDataInvalidValue`,
      inactiveValue,
      'Auto',
    );
    if (invalidParam !== undefined) {
      params = { ...params, ComSignalDataInvalidValue: invalidParam };
    }
  } else {
    recordUnmappedDiff(context, 'Com', `${signalKey}/ComSignalDataInvalidValue`, undefined);
  }

  const transferRule = findRule(comProfile, 'ComTransferProperty');
  if (transferRule?.fallback !== undefined) {
    const transferParam = makeParam(
      context,
      'Com',
      `${signalKey}/ComTransferProperty`,
      String(transferRule.fallback),
      'Profile-default',
    );
    if (transferParam !== undefined) params = { ...params, ComTransferProperty: transferParam };
  }

  // 标准 R22 ComSignal 参数集不含物理转换参数（§7.2.3）：记录 Unmapped diff，不告警。
  recordUnmappedDiff(context, 'Com', `${signalKey}/factor`, signal.factor);
  recordUnmappedDiff(context, 'Com', `${signalKey}/offset`, signal.offset);
  if (signal.minimum !== undefined) {
    recordUnmappedDiff(context, 'Com', `${signalKey}/minimum`, signal.minimum);
  }
  if (signal.maximum !== undefined) {
    recordUnmappedDiff(context, 'Com', `${signalKey}/maximum`, signal.maximum);
  }
  if (signal.unit !== undefined) {
    recordUnmappedDiff(context, 'Com', `${signalKey}/unit`, signal.unit);
  }

  reconcileFieldDiffRange(
    context,
    diffStart,
    context.fieldDiffs.length,
    `${signalBasePath}/${signal.key}`,
  );

  return { container: { ...signalContainer, params } };
}

/**
 * 构建 Tx IPdu 的 ComTxMode 子容器链。仅当链上每个 container definition 都存在
 * 时生成；任一缺失则发一条 `dbc-bswmd-def-missing` 并整链跳过（spec §7.2）。
 */
function mapTxModeChain(
  context: DbcMapperContext,
  ipduKey: string,
  message: DbmMessage,
  comProfile: ComProfile,
  ipduInstancePath: string,
): ArxmlContainer | undefined {
  const chainKeys = TX_MODE_CHAIN_KEYS.map((suffix) => `${ipduKey}/${suffix}`);
  const missing = chainKeys.find((key) => !context.index.Com.containerPath.has(key));
  if (missing !== undefined) {
    pushWarning(
      context,
      'dbc-bswmd-def-missing',
      message.key,
      `ComTxMode chain container definition is missing: ${missing}`,
    );
    return undefined;
  }

  const diffStart = context.fieldDiffs.length;

  const txIpdu = makeContainer(context, 'Com', chainKeys[0]!, 'ComTxIPdu');
  const txModeTrue = makeContainer(context, 'Com', chainKeys[1]!, 'ComTxModeTrue');
  const txMode = makeContainer(context, 'Com', chainKeys[2]!, 'ComTxMode');
  if (txIpdu === undefined || txModeTrue === undefined || txMode === undefined) return undefined;

  const modeKey = `${chainKeys[2]}/ComTxModeMode`;
  const sendType = message.attributes['GenMsgSendType'];
  const mappedMode =
    typeof sendType === 'string'
      ? DEFAULT_COM_TX_MODE_ENUM_MAP[sendType as keyof typeof DEFAULT_COM_TX_MODE_ENUM_MAP]
      : undefined;
  const modeRule = findRule(comProfile, 'ComTxModeMode');

  let modeLiteral: string | undefined;
  let modeSource: MapperFieldDiff['source'] = 'Auto';
  let modeParams: Record<string, ParamValue> = {};

  if (mappedMode !== undefined) {
    modeLiteral = mappedMode;
    modeSource = 'Auto';
  } else if (modeRule?.fallback !== undefined) {
    modeLiteral = String(modeRule.fallback);
    modeSource = 'Profile-default';
  } else {
    recordUnmappedDiff(context, 'Com', modeKey, sendType);
  }

  if (modeLiteral !== undefined) {
    const modeParam = makeParam(context, 'Com', modeKey, modeLiteral, modeSource);
    if (modeParam !== undefined) modeParams = { ...modeParams, ComTxModeMode: modeParam };
  }

  if (modeLiteral === 'PERIODIC' || modeLiteral === 'MIXED') {
    const period = computePeriodSeconds(message);
    if (period !== undefined) {
      const periodParam = makeParam(
        context,
        'Com',
        `${chainKeys[2]}/ComTxModeTimePeriod`,
        period,
        'Auto',
      );
      if (periodParam !== undefined)
        modeParams = { ...modeParams, ComTxModeTimePeriod: periodParam };
    } else {
      pushWarning(
        context,
        'dbc-attribute-unavailable',
        message.key,
        'GenMsgCycleTime is missing or invalid for a periodic Tx mode; ComTxModeTimePeriod left Unmapped',
      );
      recordUnmappedDiff(context, 'Com', `${chainKeys[2]}/ComTxModeTimePeriod`, undefined);
    }
  }

  const chainInstancePath = `${ipduInstancePath}/ComTxIPdu/ComTxModeTrue/ComTxMode`;
  reconcileFieldDiffRange(context, diffStart, context.fieldDiffs.length, chainInstancePath);

  return {
    ...txIpdu,
    children: [{ ...txModeTrue, children: [{ ...txMode, params: modeParams }] }],
  };
}

/**
 * 构建单个 message 的 ComIPdu 实例（参数 + TxMode 链 + 嵌套信号）。
 * 返回 undefined 表示 IPdu 容器定义缺失（makeContainer 已告警）。
 */
function mapMessage(
  context: DbcMapperContext,
  input: ComMapperInput,
  ipduKey: string,
  signalKey: string | undefined,
  message: DbmMessage,
  comProfile: ComProfile,
  instanceBase: string,
): ArxmlContainer | undefined {
  const ipdu = makeContainer(context, 'Com', ipduKey, message.key);
  if (ipdu === undefined) return undefined;

  const ipduInstancePath = `${instanceBase}/${message.key}`;
  const ipduDiffStart = context.fieldDiffs.length;

  let params: Record<string, ParamValue> = {};
  let children: readonly ArxmlElement[] = [];

  const direction = input.directionByMessageKey.get(message.key) ?? 'SEND';
  const directionParam = makeParam(
    context,
    'Com',
    `${ipduKey}/ComIPduDirection`,
    direction,
    'Derived',
  );
  if (directionParam !== undefined) params = { ...params, ComIPduDirection: directionParam };

  const typeRule = findRule(comProfile, 'ComIPduType');
  if (typeRule?.fallback !== undefined) {
    const typeParam = makeParam(
      context,
      'Com',
      `${ipduKey}/ComIPduType`,
      String(typeRule.fallback),
      'Profile-default',
    );
    if (typeParam !== undefined) params = { ...params, ComIPduType: typeParam };
  } else {
    recordUnmappedDiff(context, 'Com', `${ipduKey}/ComIPduType`, undefined);
  }

  const handleId = input.handleIds.get(message.key);
  if (handleId !== undefined) {
    if (input.existingHandleIds.has(handleId)) {
      // §7.4 trigger 2（per-module）：ComHandleId 只与 Com 存量集合比较。
      pushWarning(
        context,
        'dbc-pdu-id-conflict',
        message.key,
        `ComHandleId ${handleId} for ${message.key} collides with an existing Com handle id`,
      );
      context.fieldDiffs.push({
        moduleName: 'Com',
        containerPath: ipduInstancePath,
        paramKey: `${ipduKey}/ComHandleId`,
        incoming: handleId,
        source: 'Error',
        warningCodes: ['dbc-pdu-id-conflict'],
      });
    } else {
      const handleParam = makeParam(
        context,
        'Com',
        `${ipduKey}/ComHandleId`,
        handleId,
        'Profile-default',
      );
      if (handleParam !== undefined) params = { ...params, ComHandleId: handleParam };
    }
  } else {
    recordUnmappedDiff(context, 'Com', `${ipduKey}/ComHandleId`, undefined);
  }

  // IPduDLC 只在 Profile 规则声明时生成（未声明不告警，仅无该字段）。
  if (findRule(comProfile, 'IPduDLC') !== undefined) {
    const dlcParam = makeParam(context, 'Com', `${ipduKey}/IPduDLC`, message.dlc, 'Auto');
    if (dlcParam !== undefined) params = { ...params, IPduDLC: dlcParam };
  }

  const txModeStart = context.fieldDiffs.length;
  if (direction === 'SEND') {
    const chain = mapTxModeChain(context, ipduKey, message, comProfile, ipduInstancePath);
    if (chain !== undefined) children = [...children, chain];
  }
  // IPdu 自身参数的 diff 锚定到 IPdu 实例路径（TxMode 链内部已自行锚定）。
  reconcileFieldDiffRange(context, ipduDiffStart, txModeStart, ipduInstancePath);

  const nestedSignals = signalKey !== undefined && signalKey.startsWith(`${ipduKey}/`);
  if (nestedSignals) {
    for (const signal of input.signalsByMessageKey.get(message.key) ?? []) {
      const built = mapSignal(
        context,
        signalKey,
        signal,
        comProfile,
        message.dlc,
        ipduInstancePath,
      );
      if (built !== undefined) children = [...children, built.container];
    }
  }

  return { ...ipdu, params, children };
}

/**
 * 生成 Com 模块的 incoming 值。multiplexed 信号的跳过数通过
 * `dbc-multiplexed-signal` warning 暴露（每条一个，elementRef = signal key），
 * facade 聚合 warning 计数即可得到 stats.skippedMultiplexedSignals（§8.1）。
 */
export function mapCom(
  context: DbcMapperContext,
  input: ComMapperInput,
): MapperResult<ArxmlModule> {
  const comProfile = context.profile.modules.Com;
  const ipduKey = resolveContainerKey(comProfile.ipduContainerKeys, context.index.Com);
  const signalKey = resolveContainerKey(comProfile.signalContainerKeys, context.index.Com);

  const module: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'Com',
    params: {},
    children: [],
    references: [],
  };

  if (ipduKey === undefined) {
    pushWarning(
      context,
      'dbc-bswmd-def-missing',
      comProfile.ipduContainerKeys[0] ?? 'ComIPdu',
      `No ComIPdu container definition found among: ${comProfile.ipduContainerKeys.join(', ')}`,
    );
    return resultOf(context, module);
  }

  if (signalKey === undefined) {
    pushWarning(
      context,
      'dbc-bswmd-def-missing',
      comProfile.signalContainerKeys[0] ?? 'ComSignal',
      `No ComSignal container definition found among: ${comProfile.signalContainerKeys.join(', ')}`,
    );
  }

  const wrapperKey = parentKeyOf(ipduKey);
  const wrapper =
    input.relevantMessages.length > 0 && wrapperKey !== undefined
      ? makeContainer(context, 'Com', wrapperKey, lastSegment(wrapperKey))
      : undefined;
  // 实例路径基座：wrapper 存在时为 `/Com/<wrapper.shortName>`，否则 `/Com`。
  // 字段 diff 的 containerPath 必须与 collectImportContainers 的实例路径一致
  // （RULING 10），不能嵌入 BSWMD definition spine 段。
  const instanceBase = wrapper === undefined ? '/Com' : `/Com/${wrapper.shortName}`;

  let wrapperChildren: readonly ArxmlElement[] = [];
  for (const message of input.relevantMessages) {
    const ipdu = mapMessage(context, input, ipduKey, signalKey, message, comProfile, instanceBase);
    if (ipdu !== undefined) wrapperChildren = [...wrapperChildren, ipdu];
  }

  // 候选 signal 容器不在 IPdu 之下（direct-signal 布局）时，信号挂在 wrapper / module 层。
  if (signalKey !== undefined && !signalKey.startsWith(`${ipduKey}/`)) {
    for (const message of input.relevantMessages) {
      for (const signal of input.signalsByMessageKey.get(message.key) ?? []) {
        const built = mapSignal(context, signalKey, signal, comProfile, message.dlc, instanceBase);
        if (built !== undefined) wrapperChildren = [...wrapperChildren, built.container];
      }
    }
  }

  const moduleChildren =
    wrapper !== undefined ? [{ ...wrapper, children: wrapperChildren }] : wrapperChildren;

  return resultOf(context, { ...module, children: moduleChildren });
}
