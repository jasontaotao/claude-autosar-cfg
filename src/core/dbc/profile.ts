/**
 * Mapping Profile（§5）：DBC 事实 → 业务字段 → 厂商 BSWMD 参数 的解耦层。
 * Profile 只描述映射规则，不包含用户本地 ECUC value。
 * 设计来源：docs/superpowers/specs/2026-09-03-dbc-full-import-design.md §5。
 */

import type { DbcImportModule } from './bswmdDefIndex.js';
import type { DbmAttributeValue } from './dbm.js';

export const AUTOSAR_R22_CAN_PROFILE_ID = 'autosar-r22-can';

export interface DbcImportProfile {
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly displayName: string;
  readonly modules: DbcProfileModules;
}

export type DbcProfileModules = {
  readonly Com: ComProfile;
  readonly CanIf: CanIfProfile;
  readonly PduR: PduRProfile;
};

/** 按模块名取 Profile 对应 section（mapper 的 typed 访问入口）。 */
export type DbcProfileSection<M extends DbcImportModule> = M extends 'Com'
  ? ComProfile
  : M extends 'CanIf'
    ? CanIfProfile
    : PduRProfile;

export interface CommonMappingRule {
  readonly containerKey: string;
  readonly definitionKey: string;
  /** 来源类别：dbc→Auto、derived→Derived、policy→Profile-default（§7.1）。 */
  readonly source: 'dbc' | 'policy' | 'derived';
  readonly paramKey?: string;
  readonly referenceKey?: string;
  readonly enumMap?: Readonly<Record<string, string>>;
  readonly valueTransform?:
    | 'identity'
    | 'canId'
    | 'dlc'
    | 'byteSize'
    | 'bitPosition'
    | 'signedType'
    | 'unsignedType'
    | 'floatType'
    | 'endianness';
  readonly fallback?: DbmAttributeValue;
  readonly required: boolean;
}

export interface PduIdPolicy {
  readonly scope: 'perDirection' | 'global';
  readonly txBase: number;
  readonly rxBase: number;
  readonly step: number;
  readonly order: 'document-order' | 'shortName-order';
}

export interface UpperLayerNamingPolicy {
  readonly enabled: boolean;
  readonly txTemplate?: string; // 例如 "{module}_{pdu}_TxConfirmation"
  readonly rxTemplate?: string; // 例如 "{module}_{pdu}_RxIndication"
}

export interface CanIfProfile {
  readonly txPduContainerKeys: readonly string[];
  readonly rxPduContainerKeys: readonly string[];
  readonly parameters: readonly CommonMappingRule[];
  readonly pduIdPolicy: PduIdPolicy;
  readonly upperLayerNaming: UpperLayerNamingPolicy;
}

export interface ComProfile {
  readonly ipduContainerKeys: readonly string[];
  readonly signalContainerKeys: readonly string[];
  readonly parameters: readonly CommonMappingRule[];
  /** §7.7：默认 false；true 时 multiplexed / extended-multiplexed 信号按 plain 导入。 */
  readonly importMultiplexedAsPlain?: boolean;
}

export interface PduRProfile {
  readonly routingPathContainerKeys: readonly string[];
  readonly parameters: readonly CommonMappingRule[];
  readonly sourceReferenceKey?: string;
  readonly destinationReferenceKey?: string;
  /**
   * §7.6 扁平 HandleId 布局：source / destination 建模为 routing path 的直接参数
   * （无 PduRSrcPdu / PduRDestPdu 子容器）时的 HandleId 参数 spine key。
   * 子容器缺失时 mapper 降级用此 key 直接挂 route 实例。
   */
  readonly sourceHandleKey?: string;
  readonly destinationHandleKey?: string;
}

export const DEFAULT_PDU_ID_POLICY: PduIdPolicy = {
  scope: 'perDirection',
  txBase: 0x0000,
  rxBase: 0x1000,
  step: 1,
  order: 'document-order',
};

export const DEFAULT_UPPER_LAYER_NAMING: UpperLayerNamingPolicy = {
  enabled: false,
};

export const DEFAULT_COM_TX_MODE_ENUM_MAP = {
  CYCLIC: 'PERIODIC',
  EVENT: 'DIRECT',
  EVENT_AND_CYCLIC: 'MIXED',
  NONE: 'DIRECT',
} as const;

interface RuleOptions {
  readonly enumMap?: Readonly<Record<string, string>>;
  readonly valueTransform?: CommonMappingRule['valueTransform'];
  readonly fallback?: DbmAttributeValue;
  /** true 时声明为 reference 规则（referenceKey），否则为 parameter 规则（paramKey）。 */
  readonly reference?: boolean;
  readonly required?: boolean;
}

/** 本地规则构造器：paramKey / referenceKey 由 containerKey + definitionKey 拼出完整 spine key。 */
function rule(
  containerKey: string,
  definitionKey: string,
  source: CommonMappingRule['source'],
  options: RuleOptions = {},
): CommonMappingRule {
  const key = `${containerKey}/${definitionKey}`;
  return {
    containerKey,
    definitionKey,
    source,
    ...(options.reference ? { referenceKey: key } : { paramKey: key }),
    ...(options.enumMap !== undefined && { enumMap: options.enumMap }),
    ...(options.valueTransform !== undefined && { valueTransform: options.valueTransform }),
    ...(options.fallback !== undefined && { fallback: options.fallback }),
    required: options.required ?? false,
  };
}

export const AUTOSAR_R22_CAN_PROFILE: DbcImportProfile = {
  schemaVersion: 1,
  profileId: AUTOSAR_R22_CAN_PROFILE_ID,
  displayName: 'AUTOSAR R22 CAN Default',
  modules: {
    Com: {
      ipduContainerKeys: ['ComConfig/ComIPdu'],
      signalContainerKeys: ['ComConfig/ComIPdu/ComSignal', 'ComConfig/ComSignal'],
      importMultiplexedAsPlain: false,
      parameters: [
        rule('ComConfig/ComIPdu', 'ComIPduDirection', 'derived'),
        rule('ComConfig/ComIPdu', 'IPduDLC', 'dbc', { valueTransform: 'dlc' }),
        rule('ComConfig/ComIPdu', 'ComIPduType', 'policy', { fallback: 'NORMAL' }),
        rule('ComConfig/ComIPdu', 'ComHandleId', 'policy'),
        rule('ComConfig/ComIPdu/ComTxIPdu/ComTxModeTrue/ComTxMode', 'ComTxModeMode', 'dbc', {
          enumMap: DEFAULT_COM_TX_MODE_ENUM_MAP,
        }),
        rule('ComConfig/ComIPdu/ComTxIPdu/ComTxModeTrue/ComTxMode', 'ComTxModeTimePeriod', 'dbc'),
        rule('ComConfig/ComIPdu/ComSignal', 'ComBitPosition', 'dbc', {
          valueTransform: 'bitPosition',
        }),
        rule('ComConfig/ComIPdu/ComSignal', 'ComBitSize', 'dbc'),
        rule('ComConfig/ComIPdu/ComSignal', 'ComSignalEndianness', 'dbc', {
          valueTransform: 'endianness',
        }),
        rule('ComConfig/ComIPdu/ComSignal', 'ComSignalType', 'dbc'),
        rule('ComConfig/ComIPdu/ComSignal', 'ComSignalDataInvalidValue', 'dbc'),
        rule('ComConfig/ComIPdu/ComSignal', 'ComTransferProperty', 'policy', {
          fallback: 'TRIGGERED',
        }),
      ],
    },
    CanIf: {
      txPduContainerKeys: [
        'CanIfInitCfg/CanIfTxPduCfg',
        'CanIfInitCfg/CanIfTxPduCfgs/CanIfTxPduCfg',
        'CanIfConfig/CanIfTxPdu',
      ],
      rxPduContainerKeys: [
        'CanIfInitCfg/CanIfRxPduCfg',
        'CanIfInitCfg/CanIfRxPduCfgs/CanIfRxPduCfg',
        'CanIfConfig/CanIfRxPdu',
      ],
      pduIdPolicy: DEFAULT_PDU_ID_POLICY,
      upperLayerNaming: DEFAULT_UPPER_LAYER_NAMING,
      parameters: [
        rule('CanIfInitCfg/CanIfTxPduCfg', 'CanIfTxPduCanId', 'dbc', {
          valueTransform: 'canId',
        }),
        rule('CanIfInitCfg/CanIfTxPduCfg', 'CanIfTxPduCanIdType', 'dbc'),
        rule('CanIfInitCfg/CanIfTxPduCfg', 'CanIfTxPduDlc', 'dbc', {
          valueTransform: 'dlc',
        }),
        rule('CanIfInitCfg/CanIfTxPduCfg', 'CanIfTxPduId', 'policy'),
        rule('CanIfInitCfg/CanIfTxPduCfg', 'CanIfTxPduType', 'policy', {
          fallback: 'STATIC',
        }),
        rule('CanIfInitCfg/CanIfTxPduCfg', 'CanIfTxPduUserTxConfirmationUL', 'policy'),
        rule('CanIfInitCfg/CanIfRxPduCfg', 'CanIfRxPduCanId', 'dbc', {
          valueTransform: 'canId',
        }),
        rule('CanIfInitCfg/CanIfRxPduCfg', 'CanIfRxPduCanIdType', 'dbc'),
        rule('CanIfInitCfg/CanIfRxPduCfg', 'CanIfRxPduDlc', 'dbc', {
          valueTransform: 'dlc',
        }),
        rule('CanIfInitCfg/CanIfRxPduCfg', 'CanIfRxPduId', 'policy'),
        rule('CanIfInitCfg/CanIfRxPduCfg', 'CanIfRxPduType', 'policy', {
          fallback: 'STATIC',
        }),
        rule('CanIfInitCfg/CanIfRxPduCfg', 'CanIfRxPduUserRxIndicationUL', 'policy'),
      ],
    },
    PduR: {
      routingPathContainerKeys: ['PduRRoutingPaths/PduRRoutingPath'],
      sourceReferenceKey: 'PduRRoutingPaths/PduRRoutingPath/PduRSrcPdu/PduRSrcPduRef',
      destinationReferenceKey: 'PduRRoutingPaths/PduRRoutingPath/PduRDestPdu/PduRDestPduRef',
      // 扁平 HandleId 布局（§7.6 直接参数）：真实 BSWMD（如 demo-ecu / comstack
      // fixture）把 source/destination 建模为 routing path 直接参数，无子容器。
      sourceHandleKey: 'PduRRoutingPaths/PduRRoutingPath/PduRSrcPduHandleId',
      destinationHandleKey: 'PduRRoutingPaths/PduRRoutingPath/PduRDestPduHandleId',
      parameters: [
        rule('PduRRoutingPaths/PduRRoutingPath/PduRSrcPdu', 'PduRSrcPduHandleId', 'policy'),
        rule('PduRRoutingPaths/PduRRoutingPath/PduRDestPdu', 'PduRDestPduHandleId', 'policy'),
        rule('PduRRoutingPaths/PduRRoutingPath/PduRSrcPdu', 'PduRSrcPduRef', 'derived', {
          reference: true,
        }),
        rule('PduRRoutingPaths/PduRRoutingPath/PduRDestPdu', 'PduRDestPduRef', 'derived', {
          reference: true,
        }),
      ],
    },
  },
};

/**
 * 应用 PduId / UL 命名 policy override，返回新的 Profile 对象（immutable）。
 * 未覆盖的嵌套数据原样保留；未提供 override 时对应 section 引用原对象。
 */
export function applyDbcPolicyOverrides(
  profile: DbcImportProfile,
  pduIdPolicy?: Partial<PduIdPolicy>,
  upperLayerNaming?: Partial<UpperLayerNamingPolicy>,
): DbcImportProfile {
  const canIf = profile.modules.CanIf;
  return {
    ...profile,
    modules: {
      ...profile.modules,
      CanIf: {
        ...canIf,
        pduIdPolicy: pduIdPolicy ? { ...canIf.pduIdPolicy, ...pduIdPolicy } : canIf.pduIdPolicy,
        upperLayerNaming: upperLayerNaming
          ? { ...canIf.upperLayerNaming, ...upperLayerNaming }
          : canIf.upperLayerNaming,
      },
    },
  };
}

/** 按 profileId 解析内置 Profile；未知 id 抛错（§12：dbc-profile-not-found）。 */
export function resolveDbcProfile(profileId: string): DbcImportProfile {
  if (profileId === AUTOSAR_R22_CAN_PROFILE_ID) {
    return AUTOSAR_R22_CAN_PROFILE;
  }
  throw new Error(`dbc-profile-not-found: ${profileId}`);
}
