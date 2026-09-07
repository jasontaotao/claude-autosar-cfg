# DBC 完整导入设计（DBC Full Import）

**日期**：2026-09-03  
**状态**：Revised v3（review pass；已修正实施歧义，待用户最终确认）

**受众**：实施者。本文档是后续 implementation plan 的 normative 来源；与既有代码冲突时，先按本文档评审确认。

**术语约定**：**必须**=MUST，**不得**=MUST NOT，**可**=MAY。未标注这些词的内容是说明性文字。

**修订记录（2026-09-03 v2）**：对照既有代码完成接口一致性评审，主要修正：

1. AUTOSAR 语义：`GenMsgSendType` 映射目标由错误的 `ComIPduType`/`CanIfTxPduType` 改为 ComTxMode 子容器链；Com 信号表的 factor/offset/min/max 在标准 R22 BSWMD 中不存在，降级为厂商扩展条款；新增 DBC startBit（Motorola MSB）→ `ComBitPosition`（LSB 线性位）的强制换算。
2. 接口一致性：IPC request 补齐 `dirtyDocPaths`（对齐 ODX `OdxImportPreviewRequest`）；补齐 preview/commit response 类型；hard error 集合补 `read-failed`；warning 集合补 `dbc-multiplexed-signal`、`dbc-manifest-ignored`。
3. 架构：三方合并明确为**泛化迁移** `src/core/odx/threeWayMerge.ts` → `src/core/import/`（该文件硬编码 `'Dcm' | 'Dem'`），禁止复制第二份；BSWMD 索引 key 示例与 `spineKey` 实现对齐（不含模块前缀）；Profile 目录名统一为 `profiles/`；修正 §5.4 与 §14 的 Phase 矛盾。
4. 功能：DBM 增加 multiplex 建模与导入策略；新增 message 相关性过滤（避免把全网无关报文导入 Rx）；PduR 引用拓扑按方向 normative 化，并声明不生成 EcuC PduCollection 的边界。
5. Review v3：明确 DBC→fullImportPreview 的 targetNode 两阶段语义、cycle time 单位换算、multiplex override 的 Profile 字段、global PduId 编号语义、初始化值与 stats 口径。

---

## 1. 背景、目标与边界

### 1.1 现状问题

当前 DBC→Com Stack 导入的核心链路是：

```text
DBC 摘要
  → dbcToComStack()
  → Com / CanIf / PduR add-child PatchStep[]
  → 直接应用并写文件
```

它只完成“容器实例骨架导入”，存在以下问题：

1. 不生成 `CAN ID`、`DLC`、`CanIdType` 等确定性字段。
2. 不生成 ComSignal 的 startBit、length、endianness、factor、offset、min/max 等字段。
3. 不补齐 PduR source / destination 引用。
4. `CanIfTxPduType`、`CanIfTxPduUserTxConfirmationUL`、`CanIfRxPduUserRxIndicationUL` 等字段实际来自 BSWMD 默认值或空占位符，而不是 DBC 或用户策略。
5. 导入预览粒度是容器级，用户看不到字段将如何生成。
6. 没有三方合并与 provenance，重复导入时无法安全处理本地修改。
7. Mapping 规则分散在 `dbcToComStack.ts`，难以适配不同厂商 BSWMD。

### 1.2 目标

1. 引入与 ODX `DIM` 类似的 DBC 中间模型 `DBM`。
2. 所有 ECUC 容器和参数生成必须基于 BSWMD definition index，禁止直接写无锚点的 definition-ref。
3. 引入 Mapping Profile，将“DBC 事实 → 业务字段 → 厂商 BSWMD 参数”三层解耦。
4. 确定性字段自动映射；非确定性字段使用 Profile 默认策略，并在预览中显式标注来源。
5. 导入预览展示容器级决策和字段级 diff。
6. 引入三方合并、决策模型与 provenance，支持安全重复导入。
7. 原地升级现有 `DbcImportWizard`，不新增平行入口。
8. **复用并泛化既有 ODX 导入基础设施**（`threeWayMerge.ts`、`hashContainerForProvenance`、`overwrite-module` patch、`odx/shortName.ts`），禁止平行复制第二份实现。

### 1.3 非目标

- 不支持 LIN、FlexRay、Ethernet DBC/ARXML 场景；本设计仅覆盖 CAN。
- 不做 DBC→ARXML 的反向导出。
- 不解析完整 AUTOSAR ECU Extract 或系统描述文件。
- **不生成 EcuC PduCollection / EcuC Pdu 条目**；因此 `ComPduIdRef`、`CanIfTxPduRef` 等 destKind 指向 EcuC Pdu 的引用默认标记 `Unmapped`（见 §7.6）。
- 不对 multiplexed message 做完整 AUTOSAR 建模（AUTOSAR COM 对动态 mux 的支持依赖 System Template，超出 ECUC 值文件范围）；DBM 只识别并保留 multiplex 事实，导入策略见 §7.7。
- 不在本 spec 内定义具体厂商私有 BSWMD 的全部 Profile；只定义 Profile schema 和内置 R22 默认 Profile。
- 不承诺把 DBC 内所有可扩展 attribute 都导入；只导入 Profile 显式声明的 attribute。

---

## 2. 总体架构

```text
DBC 文件
  │
  ▼
① 解析层 src/core/dbc/
   dbmDocument.ts       DBC 文档包装、attribute 归组（dbc-forge
                        Network.attributeAssignments → message/signal 级）、ID/名称索引
   dbmBuilder.ts        构建 DBM + warnings
   │
   ▼
② 中间模型 src/core/dbc/dbm.ts
   DBM：nodes / messages / signals / attributes / warnings
   │
   ▼
③ BSWMD 索引 src/core/dbc/bswmdDefIndex.ts
   Com / CanIf / PduR definition 路径索引
  （在 src/core/odx/bswmdDefIndex.ts 的 BswmdDefIndex 之上扩展
    referenceDef；spine key 规则复用其实现）
   │
   ▼
④ Mapping Profile src/core/dbc/profiles/
   DBC 字段 → ECUC 参数的映射与策略
   │
   ▼
⑤ 映射器 src/core/dbc/mappers/
   comMapper.ts
   canIfMapper.ts
   pduRMapper.ts
   mapDbmToEcuc.ts
   │
   ▼
⑥ 三方合并与导入
   src/core/import/threeWayMerge.ts   ← 由 src/core/odx/threeWayMerge.ts
                                        泛化迁移（module 类型参数化），
                                        ODX 导入改为薄封装，禁止复制第二份
   src/core/import/patch.ts           ← 既有 overwrite-module ImportPatchOp
   preview / commit handlers（src/main/ipc/）
   │
   ▼
⑦ DbcImportWizard
   targetNode / Profile / 字段级预览 / 决策 / commit
```

公共工具复用约束：

- short-name 合法化与去重**必须**复用 `src/core/odx/shortName.ts` 的 `legalizeShortName` / `dedupeShortName`，不得在 `src/core/dbc/` 另写一份。
- 容器内容哈希**必须**复用 `hashContainerForProvenance`（泛化后位于 `src/core/import/`）。

### 2.1 架构约束

- 解析、DBM 构建、BSWMD 索引、Mapping Profile 消费、Mapper、三方合并都必须是纯函数，**不得**包含文件 / 网络 IO。`node:crypto` 的内容哈希不属于 IO（既有 `src/core/odx/threeWayMerge.ts` 已使用该模式），允许出现在 `src/core/`。
- 文件 IO、manifest 读写、provenance 写入、原子提交只能位于 `src/main/ipc/`。
- 所有新增 warning code 必须来自本 spec §11 的 closed set。
- 所有新 IPC 契约必须是 additive。
- 既有 `dbc:importComStack` IPC 在迁移完成前保持兼容；迁移完成后可标记 deprecated，但不得在本 spec 内删除。
- 对同一输入，preview 输出必须 deterministic。
- 正式导入不得生成没有 BSWMD definitionRef 的参数；诊断抽取类 staging 输出不属于本设计。

---

## 3. DBM：DBC 中间模型

新建 `src/core/dbc/dbm.ts`。

DBM 是业务事实模型，不包含任何具体 ECUC 参数名。

### 3.1 类型定义

```typescript
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
   * 解析层只保证 '@' 扩展帧标志位被剥离，不猜测协议变体。
   */
  readonly protocol: 'CAN' | 'UNKNOWN';
  readonly sourceHash: string; // sha256 hex，与 ODX provenance 的 sourceHash 对齐
}

export interface DbmNode {
  readonly name: string;
  readonly comments: Readonly<Record<string, string>>;
}

export interface DbmMessage {
  readonly key: string; // 稳定 key：legalized shortName，冲突时后缀 _2 起（见 §3.2）
  readonly shortName: string; // 原始 message name，未合法化
  readonly messageId: number; // 去掉 extended flag 后的 CAN ID
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
  readonly key: string; // 稳定 key：messageKey + legalized signalName
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
```

### 3.2 key 与 shortName 规则

- `shortName` 保留 DBC 原始名称，用于溯源与展示。
- `key` 必须经过 AUTOSAR short-name legalization，**必须**复用 `src/core/odx/shortName.ts` 的 `legalizeShortName` / `dedupeShortName`（保持与 ODX 导入完全一致的命名行为，禁止第二份实现）。
- 冲突后缀规则与 `dedupeShortName` 实现对齐：首个实例无后缀，冲突实例从 `_2` 起按文档顺序递增（`name`、`name_2`、`name_3`……；**不是** `_1` 起）。
- signal key 冲突去重在所属 message scope 内进行。
- key 生成规则必须与 ECUC 生成时使用的 instance shortName 保持一致：Mapper 生成容器 shortName 时**必须**直接使用 DBM key，不得二次合法化（二次合法化会破坏 preview row path 与 provenance containerPath 的稳定性）。

### 3.3 DBC attribute 解析

attribute 来源是 dbc-forge 的 `Network.attributeDefs` + `Network.attributeAssignments`；`dbmDocument.ts` 负责把 assignment 按 message / signal / node 归组到 DBM 对应实体的 `attributes` map（key = attribute 名）。

DBM 至少要保留以下 attribute 的原始值：

- `GenMsgCycleTime`
- `GenMsgSendType`
- `GenSigInactiveValue`
- 其他 BA* / VAL* 定义的 attribute 可保留在 `attributes` 中

DBM 不得在解析层解释 attribute 的语义；解释由 Mapping Profile 完成。

### 3.4 Multiplex 事实

- builder 必须从 dbc-forge `Signal.multiplexed` 投影 `DbmSignal.multiplex`，不得丢弃。
- multiplexor 信号与其余信号一样进入 DBM；语义解释（是否导入、如何导入）由 §7.7 的策略决定，解析层不处理。

---

## 4. BSWMD Definition Index

新建 `src/core/dbc/bswmdDefIndex.ts`。它在既有 `src/core/odx/bswmdDefIndex.ts`（`BswmdDefIndex` + `buildBswmdDefIndex`）基础上做两件事：

1. **复用其 spine key 计算**（`spineKey` 函数：剥掉 module path 前缀，key 为模块内相对路径）。
2. **扩展 reference 定义面**：既有 `BswmdDefIndex` 只有 `refPath`，没有 `ReferenceDef`；DBC mapper 需要 `destKind` 做引用校验（§4.3 第 5 条），因此 `ModuleBswmdDefIndex` 增加 `referenceDef`。该扩展**可**同步回 `src/core/odx/bswmdDefIndex.ts`（additive 字段，ODX 消费者不受影响），或由 DBC 侧 per-module 索引独立持有——实施时二选一，但不得出现两份 spine key 计算逻辑。

### 4.1 索引结构

```typescript
export interface ModuleBswmdDefIndex {
  readonly moduleShortName: 'Com' | 'CanIf' | 'PduR';
  readonly containerPath: ReadonlyMap<string, string>;
  readonly paramPath: ReadonlyMap<string, string>;
  readonly refPath: ReadonlyMap<string, string>;
  readonly paramDef: ReadonlyMap<string, ParamDef>;
  readonly referenceDef: ReadonlyMap<string, ReferenceDef>;
}

export type DbcBswmdDefIndex = Readonly<Record<'Com' | 'CanIf' | 'PduR', ModuleBswmdDefIndex>>;
```

### 4.2 索引 key

key 使用**模块内** spine path（与既有 `spineKey` 实现一致，**不含**模块自身前缀），例如：

```text
ComConfig/ComIPdu
ComConfig/ComIPdu/ComSignal/ComBitPosition
CanIfInitCfg/CanIfTxPduCfgs/CanIfTxPduCfg/CanIfTxPduCanId
PduRRoutingPaths/PduRRoutingPath/PduRDestPdu/PduRDestPduRef
```

模块区分由 `DbcBswmdDefIndex` 的外层 Record 承担，key 本身**不得**包含 `Com/`、`CanIf/`、`PduR/` 等 module root 前缀；必须基于真实 BSWMD path 计算，不得硬编码。

### 4.3 校验规则

Mapper 生成参数前必须检查：

1. container definition 存在。
2. parameter / reference definition 存在。
3. 参数类型匹配。
4. 枚举值必须命中 BSWMD literal。
5. reference 的 destKind 可解析。

任一校验失败时：

- 正式导入不得写入该项。
- 生成对应 warning。
- 该字段在预览中显示为 `Unmapped` 或 `Error`。

---

## 5. Mapping Profile

### 5.1 Profile 目标

Mapping Profile 是“项目/厂商适配层”，用于隔离 DBC 字段、策略与厂商 BSWMD 差异。

Profile **不得**包含用户本地 ECUC value；只描述映射规则。

### 5.2 Profile schema

```typescript
export interface DbcImportProfile {
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly displayName: string;
  readonly modules: {
    readonly Com: ComProfile;
    readonly CanIf: CanIfProfile;
    readonly PduR: PduRProfile;
  };
}

export interface CommonMappingRule {
  readonly containerKey: string;
  readonly definitionKey: string;
  /** 来源类别：映射到 §7.1 预览来源标记为 dbc→Auto、derived→Derived、policy→Profile-default。 */
  readonly source: 'dbc' | 'policy' | 'derived';
  readonly paramKey?: string;
  readonly referenceKey?: string;
  readonly enumMap?: Readonly<Record<string, string>>;
  readonly valueTransform?:
    | 'identity'
    | 'canId'
    | 'dlc'
    | 'byteSize'
    | 'bitPosition' // DBC startBit（BE=MSB sawtooth）→ ComBitPosition（LSB 线性位），见 §7.2.1
    | 'signedType' // 按 bit length 分派 SINT8/16/32/64，见 §7.2.2
    | 'unsignedType' // 按 bit length 分派 BOOLEAN/UINT8/16/32/64，见 §7.2.2
    | 'floatType' // FLOAT32 / FLOAT64
    | 'endianness'; // little-endian→LITTLE_ENDIAN，big-endian→BIG_ENDIAN
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
}
```

**containerKeys 语义**（`*ContainerKeys` 全部适用）：候选 definition spine key 列表，按数组顺序取**第一个在 BSWMD index 中存在**的 key。这替代了旧 bridge 的 `canIfDirectPdu` / `comSignalDirect` 硬编码 layout flag——厂商布局差异（如 Tx PDU 容器直接在 `CanIfInitCfg` 下 vs 在 `CanIfTxPduCfgs` 分组下）由 Profile 数据表达，不由 mapper 代码表达。全部候选均不命中时按 §4.3 失败规则处理（`dbc-bswmd-def-missing`）。

### 5.3 内置 Profile

必须提供至少一个内置 Profile：

```text
profileId: autosar-r22-can
displayName: AUTOSAR R22 CAN Default
```

该 Profile 的目标 BSWMD 是 R22 EcucDefs 风格。

内置 Profile 必须覆盖：

- Com / CanIf / PduR 的容器路径。
- 本 spec §7 定义的确定性字段。
- PduId 编号策略。
- PduType fallback。
- UL 命名模板，但默认可以 `enabled: false`。

### 5.4 Profile 存储与选择

- 内置 Profile 代码放在 `src/core/dbc/profiles/`。
- 工程级 Profile override 可放在：

```text
.autosarcfg/dbc-import-profile.json
```

- Phase 2 尚无 Profile schema：mapper 直接消费一组**默认策略常量**（与 §7.4 默认值一致），该常量即 Phase 3 内置 Profile 的种子，禁止两处各自维护。
- Phase 3 引入 Profile schema 与内置 R22 Profile，UI 开始显示 `profileId`。
- Phase 3 之后**可**支持工程级 override；override 文件解析失败必须导致 preview 硬失败（`dbc-profile-not-found`），不得回退到未声明规则。
- UI 必须显示当前使用的 `profileId`。

---

## 6. 目标模块与导入形态

### 6.1 目标模块

本设计覆盖：

- `Com`
- `CanIf`
- `PduR`

### 6.2 模块发现

主进程必须从 project manifest 的 `valueArxmlPaths` 中收集模块。发现机制**必须**与 ODX 导入一致：逐个 parse 文档并 `collectModules` 按 ECUC module shortName 匹配；**不得**复用旧 bridge `resolveStackPaths` 的 `<DEFINITION-REF>` 正则 + basename fallback（那是旧链路的权宜之计）。

- 每个 module shortName 在所有 value ARXML 中最多出现一次。
- 如果同一 module 在多个文档中出现，preview 必须返回 `dbc-module-ambiguous`。
- 如果目标文档 dirty，preview 必须返回 `dbc-target-dirty`。
- dirty 判定数据源与 ODX 一致：renderer 在 preview request 的 `dirtyDocPaths` 中传入未保存文档的绝对路径列表（main 进程不持有 dirty 状态）；主进程按 resolve 后的路径比对目标文档。

### 6.3 缺失模块处理

如果 `Com` / `CanIf` / `PduR` 模块不存在：

- Mapper 可以生成 incoming module。
- Commit 可新建（与 ODX `uniqueNewModulePath` 模式一致，重名时追加 `_N` 后缀）：

```text
ecuc/Com_EcucValues.arxml
ecuc/CanIf_EcucValues.arxml
ecuc/PduR_EcucValues.arxml
```

- 新文件路径必须追加到 project manifest（manifest 相对路径，正斜杠）。
- 新文件必须经 `isPathInsideReal` 校验，禁止逃逸工程目录。
- 所有模块仍必须有可用 BSWMD。

### 6.4 导入应用方式

- 已存在模块：使用 module-level three-way merge，然后通过既有 `src/core/import/patch.ts` 的 `overwrite-module` `ImportPatchOp` 应用（与 ODX commit 相同路径）。
- 不存在模块：创建新文档。
- 文件写入必须使用现有 `writeAtomic` + pending-writes 快照回滚机制（`odxImportCommitHandler` 的事务模式：ECUC 文件 → manifest → provenance 顺序写入，任一失败逆序回滚）。
- 不得直接使用旧 `add-child PatchStep[]` 作为正式导入核心路径。

---

## 7. 字段映射规则

### 7.1 来源标记

每个生成字段必须具有来源标记：

| 来源              | 含义                                             |
| ----------------- | ------------------------------------------------ |
| `Auto`            | 从 DBC 确定性推导                                |
| `Derived`         | 由多条 DBC 数据或规则推导                        |
| `Profile-default` | 来自 Profile fallback                            |
| `Unmapped`        | 没有可执行映射或 BSWMD 缺失                      |
| `Error`           | BSWMD 类型不匹配、枚举不命中、reference 无法解析 |

预览必须显示来源标记。Profile schema 的 `source` 三值到预览五值的映射：`dbc`→`Auto`，`derived`→`Derived`，`policy`→`Profile-default`；`Unmapped` / `Error` 是 mapper 运行时产出，不出现在 Profile 声明中。

以下三节的通用前置规则（原 CanIf 节规则，提升为通用）：

> **只有 BSWMD index 中实际存在对应 parameter / reference / container definition 时才生成该项**；未声明的项显示 `Unmapped`（或按 §4.3 显示 `Error`），不得凭空写入无锚点参数。

### 7.2 Com 映射

对每条 DBC message（生成一个 `ComIPdu`）：

| DBC 来源                   | Com ECUC 内容                                               | 来源                    |
| -------------------------- | ----------------------------------------------------------- | ----------------------- |
| message key / shortName    | `ComIPdu` instance shortName                                | Auto                    |
| §7.3 方向判定              | `ComIPduDirection`（`SEND` / `RECEIVE`）                    | Derived                 |
| `GenMsgSendType` + enumMap | `ComTxModeMode`（Tx IPdu 的 ComTxMode 子容器链，见下）      | Auto 或 Profile-default |
| `GenMsgCycleTime`          | `ComTxModeTimePeriod`（DBC 单位 ms，转换成秒）              | Auto（仅周期型）        |
| Profile fallback           | `ComIPduType`（R22 literal 仅 `NORMAL` / `TP`，DBC 无来源） | Profile-default         |
| PduId policy               | `ComHandleId`（DBC 无来源）                                 | Profile-default         |

**关键语义修正**：`GenMsgSendType` **不得**映射到 `ComIPduType`——后者表示传输协议使用（NORMAL/TP），与发送模式无关。发送模式的正确落点是 Tx IPdu 的 `ComTxIPdu/ComTxModeTrue/ComTxMode` 子容器链：

- 内置 Profile enumMap 建议：`CYCLIC`→`PERIODIC`，`EVENT`→`DIRECT`，`EVENT_AND_CYCLIC`→`MIXED`，`NONE`→`DIRECT`；实际 literal 必须命中目标 BSWMD 的 `ComTxModeMode` 枚举（§4.3）。
- `GenMsgCycleTime` 按 DBC attribute 单位毫秒处理；仅 `PERIODIC` / `MIXED` 写 `ComTxModeTimePeriod = value / 1000`。周期型但 attribute 缺失 / 非有限非负数时报 `dbc-attribute-unavailable`，period 字段显示 `Unmapped`。
- ComTxMode 子容器链是否生成取决于 BSWMD index 命中；链中任一 container definition 缺失时整链跳过并报 `dbc-bswmd-def-missing`。

对每条 signal（生成一个 `ComSignal`）：

| DBC 来源                  | Com ECUC 内容                                           | 来源                        |
| ------------------------- | ------------------------------------------------------- | --------------------------- |
| signal key / shortName    | `ComSignal` instance shortName                          | Auto                        |
| `startBit` + `byteOrder`  | `ComBitPosition`（**必须经 §7.2.1 换算**，禁止直接写）  | Auto                        |
| `length`                  | `ComBitSize`                                            | Auto                        |
| `byteOrder`               | `ComSignalEndianness`（`LITTLE_ENDIAN` / `BIG_ENDIAN`） | Auto                        |
| `valueType` + `length`    | `ComSignalType`（§7.2.2 分派表）                        | Auto                        |
| `factor` / `offset`       | **标准 R22 ComSignal 无此参数**，见 §7.2.3 厂商扩展条款 | Unmapped（默认）            |
| `minimum` / `maximum`     | 同上                                                    | Unmapped（默认）            |
| `unit`                    | 同上                                                    | Unmapped（默认）            |
| 无可靠 DBC 来源           | `ComSignalInitValue`                                    | Unmapped（默认）            |
| `GenSigInactiveValue`     | `ComSignalDataInvalidValue`                             | Auto 或 Unmapped            |
| `byteOrder`/`length` 以外 | `ComTransferProperty` 等其余参数                        | Profile-default 或 Unmapped |

#### 7.2.1 `ComBitPosition` 换算（normative）

AUTOSAR 的 `ComBitPosition` 是信号在 I-PDU 内的**线性位位置**（按 SWS_COM 的 little-endian 位计数：PDU 首字节 LSB = bit 0）；DBC 的 `startBit` 对 big-endian（Motorola）信号是 **MSB 的 sawtooth 位置**。直接照抄会把所有 Motorola 信号放错位。

- little-endian：`ComBitPosition = startBit`。
- big-endian：从 `startBit`（MSB）沿 Motorola 链走 `length - 1` 步得到 **LSB** 的线性位位置。链规则：当前位 `b`（线性位号 = `byte*8 + bitInByte`）的下一位是：字节内 `bitInByte > 0` 时 `b - 1`；`bitInByte == 0` 时跳到下一字节最高位 `b + 15`（即 `(byte+1)*8 + 7`）。

换算锚点（单元测试必须覆盖；对 big-endian 的位序是 LSB 解释）：

| DBC startBit | length | byteOrder | ComBitPosition |
| ------------ | ------ | --------- | -------------- |
| 0            | 8      | little    | 0              |
| 7            | 8      | big       | 0              |
| 7            | 12     | big       | 12             |
| 15           | 4      | big       | 12             |
| 16           | 1      | big       | 16             |

**约定锁定**：R22 默认 ComBitPosition 对 big-endian 信号取 LSB 位置；若目标 BSWMD / 厂商生成器采用 **MSB 解释**（big-endian 信号直接写 startBit 的线性位号），则换算改为恒等（sawtooth 位号即线性位号，字节内不翻转）。两种解释的最终取舍**必须**在实施时对照参考 BSWMD 锁定，并体现在 §13 单元测试的锚点表中；spec 不替目标厂商做该决定。

mapper 实现该换算为 `valueTransform: 'bitPosition'`；length > 实际 PDU 容量或跨 DLC 越界时报 `dbc-invalid-dlc`。

#### 7.2.2 `ComSignalType` 分派（normative）

`valueType` + `length` 分派到 R22 literal：

| valueType | length | ComSignalType |
| --------- | ------ | ------------- |
| unsigned  | 1      | `BOOLEAN`     |
| unsigned  | 2–8    | `UINT8`       |
| unsigned  | 9–16   | `UINT16`      |
| unsigned  | 17–32  | `UINT32`      |
| unsigned  | 33–64  | `UINT64`      |
| signed    | 2–8    | `SINT8`       |
| signed    | 9–16   | `SINT16`      |
| signed    | 17–32  | `SINT32`      |
| signed    | 33–64  | `SINT64`      |
| float     | 32     | `FLOAT32`     |
| double    | 64     | `FLOAT64`     |

未覆盖组合（如 signed length 1、float length ≠ 32）报 `dbc-unsupported-value-type`，字段显示 `Unmapped`。literal 必须命中目标 BSWMD 枚举（§4.3）。

#### 7.2.3 物理转换参数（factor / offset / min / max / unit）

标准 AUTOSAR Com 层不做物理值转换（compu 属于 System Template / RTE 层），R22 `ComSignal` 参数集中**没有**这些参数。规则：

- 内置 R22 Profile **不得**声明这些字段的映射规则 → 预览显示 `Unmapped`，**不**产生 warning（这是预期行为，不是缺陷）。
- 厂商 BSWMD 若扩展了对应参数，工程级 Profile **可**显式声明映射；此时来源为 `Auto`。

信号默认生成在其所属 `ComIPdu` 下；如果 BSWMD 布局是 direct signal（`ComSignal` 直接挂在 `ComConfig` 下），由 Profile 的 `signalContainerKeys` 候选命中决定，不在 mapper 硬编码。

### 7.3 CanIf 映射

#### 7.3.1 方向判定与相关性过滤

```text
if message.transmitter === selectedTargetNode:
  direction = Tx        → CanIfTxPduCfg + ComIPduDirection SEND
else if selectedTargetNode ∈ message.receivers:
  direction = Rx        → CanIfRxPduCfg + ComIPduDirection RECEIVE
else:
  不生成任何容器（与本 ECU 无关的报文）
```

`selectedTargetNode` 必须是 DBC node，**不得**使用 EcuC ECU instance 名称替代。

相关性过滤是 normative：整车 DBC 中大量报文与目标 ECU 无关，旧 bridge 的"非 Tx 即 Rx"会把它们全部导入 Rx，污染配置。被过滤的 message 不产生 preview row，也不产生 warning；preview 的 `stats` 必须包含 `skippedIrrelevantMessages` 计数并在 wizard 中显示。

#### 7.3.2 字段映射

对每条相关 message：

| DBC 来源                | CanIf ECUC 内容                                                | 来源                        |
| ----------------------- | -------------------------------------------------------------- | --------------------------- |
| message key / shortName | Tx/Rx PDU instance shortName                                   | Auto                        |
| `messageId`             | `CanIfTxPduCanId` / `CanIfRxPduCanId`                          | Auto                        |
| `isExtended`            | `CanIfTxPduCanIdType` / `CanIfRxPduCanIdType` = `EXTENDED_CAN` | Auto                        |
| `!isExtended`           | 同上 = `STANDARD_CAN`                                          | Auto                        |
| `dlc`                   | `CanIfTxPduDlc` / `CanIfRxPduDlc`                              | Auto                        |
| direction               | Tx PDU or Rx PDU container                                     | Derived                     |
| PduId policy            | `CanIfTxPduId` / `CanIfRxPduId`                                | Profile-default             |
| Profile fallback        | `CanIfTxPduType`                                               | Profile-default             |
| UL naming policy        | UserTxConfirmationUL / UserRxIndicationUL                      | Profile-default 或 Unmapped |

**关键语义修正**：`CanIfTxPduType` 的 R22 literal 是 `STATIC` / `DYNAMIC`（PDU 长度是否可变），**不是**发送模式；DBC 对此无来源，内置 Profile fallback 为 `STATIC`。`GenMsgSendType` **不得**映射到任何 CanIf 参数——发送模式只属于 Com 层（§7.2）。

规则：

- HRH / HTH、software filtering、CAN FD（`STANDARD_FD_CAN` / `EXTENDED_FD_CAN`、`CanIfTxPduCanFdMode` 等）没有可靠 DBC 来源的字段默认不猜，显示 `Unmapped`，除非 Profile 显式声明 fallback。
- CAN FD 相关字段必须由 Profile 显式声明；内置 R22 CAN Profile 不得擅自启用。

### 7.4 PduId 编号规则

默认策略：

```text
scope = perDirection
txBase = 0x0000
rxBase = 0x1000
step = 1
order = document-order
```

规则：

- scope = perDirection 时 Tx 和 Rx 分别独立编号；txBase/rxBase 分段是本工具的默认**策略**（便于人工区分方向），不是 AUTOSAR 约束——R22 对 CanIfTxPduId / CanIfRxPduId 的唯一要求是模块内唯一，工程级 Profile 可改为各自从 0 连续编号。
- `scope = global` 时所有相关 message 使用同一个编号空间，起点是 `txBase`；`rxBase` 被忽略。
- perDirection 下 `txBase` 与 `rxBase` 允许重叠；是否重叠由用户承担，冲突仍按唯一性检查报告。
- perDirection 下 xBase 与
  xBase 允许重叠；是否重叠由用户承担，冲突仍按唯一性检查报告。
- 编号顺序 deterministic（document-order 按 DBC 文档顺序；shortName-order 按 key 字典序）。
- `dbc-pdu-id-conflict` 的触发条件（两者都要检查）：
  1. 本次生成内部：同一编号空间内两条 message 分到相同 id。
  2. 与存量冲突：生成的 id 已存在于目标模块当前值文件的**其他**容器（非本次导入将覆盖的容器）中。
- 用户可在 UI 中覆盖 base / step / order；覆盖值必须写入 preview request 并参与 preview hash。

### 7.5 UL 命名规则

UL 字段只在 Profile 声明 `enabled: true` 时生成。

模板占位符：

- `{module}`：`CanIf` 或工程配置的模块前缀。
- `{pdu}`：legalized PDU shortName。

模板生成结果还必须经过 short-name legalization。  
如果模板未启用，UL 字段显示 `Unmapped`。

### 7.6 PduR 映射

每条**相关** DBC message（§7.3.1 过滤后）生成一个 `PduRRoutingPath`。R22 标准布局是 source / destination 各自建模为 sub-container，这是 normative 默认：

```text
PduRRoutingPaths/PduRRoutingPath/<key>
  ├── PduRSrcPdu        （子容器：PduRSrcPduRef + PduRSrcPduHandleId）
  └── PduRDestPdu       （子容器：PduRDestPduRef + PduRDestPduHandleId）
```

引用拓扑按方向（normative）：

| 方向 | PduRSrcPduRef 指向         | PduRDestPduRef 指向           |
| ---- | -------------------------- | ----------------------------- |
| Tx   | 本次生成的 ComIPdu（SEND） | 本次生成的 CanIfTxPduCfg      |
| Rx   | 本次生成的 CanIfRxPduCfg   | 本次生成的 ComIPdu（RECEIVE） |

规则：

- Reference 的目标路径必须解析到**本次导入生成或已存在**的 Com / CanIf 实例容器；跨模块引用路径使用目标容器的实例绝对路径。
- 引用 definition 的 `ReferenceDef.destKind` 必须与被引容器匹配（§4.3 第 5 条）。
- **EcuC PduCollection 边界**：本设计不生成 EcuC PduCollection / Pdu 条目。若 BSWMD 中某 reference 的 destKind 指向 EcuC Pdu（而非模块内 PDU 容器）——典型如 `ComPduIdRef`、`CanIfTxPduRef`——该字段标记 `Unmapped` 并报 `dbc-reference-missing`，由用户后续在 EcuC 层手工补齐。预览必须如实呈现，不得静默成功。
- **HandleId fallback**：若 BSWMD 只为 PduRSrcPdu / PduRDestPdu 声明了 `*HandleId` 参数而未声明 reference（项目既有 fixture 即此形态），按 PduId policy 生成 handle id，reference 字段显示 `Unmapped`。
- **扁平 HandleId 布局（直接参数）**：部分真实 BSWMD 把 source / destination 建模为 routing path 的**直接参数**——`PduRRoutingPaths/PduRRoutingPath/PduRSrcPduHandleId` / `PduRDestPduHandleId` 直接挂在 route 实例下，没有 `PduRSrcPdu` / `PduRDestPdu` 子容器、没有 reference。此时以 Profile 的 `sourceHandleKey` / `destinationHandleKey` 声明为准（指向上述扁平 HandleId 参数 spine key）。mapper 判定：`containerPath.has(refParentKey)` 为真 → R22 子容器布局；为假且有扁平 handle key → 扁平布局（HandleId 参数并入 route 实例，不报子容器 `dbc-bswmd-def-missing`，因缺失是预期布局）；为假且无扁平 handle key → 维持整侧省略 + def-missing。
- 若 BSWMD 将 source / destination 建模为 routing path 的直接参数而非 sub-container，以 Profile 的 `sourceReferenceKey` / `destinationReferenceKey` 声明为准。

解析失败时：

- 不写该 reference。
- 生成 `dbc-reference-missing`。
- 预览显示 `Error`。

### 7.7 Multiplexed signal 策略

DBM 保留 multiplex 事实（§3.4），但标准 AUTOSAR COM 的 ECUC 层无法表达 DBC 的动态 mux 语义。v1 策略（normative）：

- `multiplexor` 信号：按普通信号导入（它是静态存在的 switch 字段）。
- `multiplexed` / `extended-multiplexed` 信号：**默认跳过不导入**，每条报 `dbc-multiplexed-signal`（elementRef = signal key）。
- Profile **可**声明 `ComProfile.importMultiplexedAsPlain: boolean` 覆盖（§5.2）：为 true 时按普通信号导入并仍报 warning（位重叠风险由用户承担）。
- 任何情况下不得静默丢弃。

---

## 8. 导入预览模型

### 8.1 Preview row

预览仍以 container 为决策单位，但每行必须携带字段级 diff。row / category / decision 模型与既有 ODX 导入（`src/shared/types/odx-import.ts` + 泛化后的 `src/core/import/threeWayMerge.ts`）保持同构：`DbcImportDecision` 复用既有 `ImportDecision`（`'import' | 'keep-local' | 'delete'`）；category 字面量中 ODX 使用 `removed-in-odx`，DBC 使用 `removed-in-dbc`，泛化合并函数通过参数提供该字面量（见 §9.1），不统一改名以免破坏既有 ODX IPC。

```typescript
export type DbcImportDecision = ImportDecision; // 复用，禁止新定义

export type DbcImportCategory =
  | 'added'
  | 'updated'
  | 'locally-modified'
  | 'conflict'
  | 'converged'
  | 'removed-in-dbc';

export interface DbcImportFieldDiff {
  readonly moduleName: 'Com' | 'CanIf' | 'PduR';
  readonly containerPath: string;
  /** BSWMD definition spine key（§4.2），不是实例路径；UI 显示取最后一段。 */
  readonly paramKey: string;
  readonly local?: string | number | boolean;
  readonly incoming?: string | number | boolean;
  readonly source: 'Auto' | 'Derived' | 'Profile-default' | 'Unmapped' | 'Error';
  readonly warningCodes?: readonly DbcWarningCode[];
}

export interface DbcImportRow {
  readonly module: 'Com' | 'CanIf' | 'PduR';
  readonly path: string;
  readonly shortName: string;
  readonly category: DbcImportCategory;
  readonly defaultDecision: DbcImportDecision;
  readonly conflictDetail?: {
    readonly localHash: string;
    readonly incomingHash: string;
  };
  readonly fieldDiffs: readonly DbcImportFieldDiff[];
}

/** Preview 统计。skippedIrrelevantMessages 支撑 §7.3.1 的过滤呈现。 */
export interface DbcImportStats {
  readonly messages: number; // DBC 解析出的全部 message 数，不含相关性过滤
  readonly signals: number; // DBC 解析出的全部 signal 数，不含相关性 / multiplex 过滤
  readonly skippedIrrelevantMessages: number;
  readonly skippedMultiplexedSignals: number; // 仅统计相关 message 中的 muxed 信号
}
```

### 8.2 默认决策

| Category           | 默认决策     |
| ------------------ | ------------ |
| `added`            | `import`     |
| `updated`          | `import`     |
| `locally-modified` | `keep-local` |
| `conflict`         | `keep-local` |
| `converged`        | `import`     |
| `removed-in-dbc`   | `keep-local` |

### 8.3 Preview hash

Preview hash 必须覆盖：

- DBM content hash。
- selected target node。
- selected Profile 内容 hash。
- PduId policy override。
- UL naming policy override。
- 全部 preview rows（顺序必须先按 module、再按 path 排序固定，与 ODX 一致）。
- 当前目标模块状态。

序列化形式与既有 ODX `previewHash` 实现对齐：`sha256(JSON.stringify({...}))`，字段顺序按上述列表固定构造，禁止依赖对象插入序以外的输入。

Commit 时必须用**同一条 mapping pipeline 重算** preview（与 ODX `computeOdxImportMappedModules` 模式一致：commit handler 内部重跑 preview，比对 hash），不一致时返回 `dbc-commit-mismatch`。decisions 中出现 preview rows 之外的 path 也必须返回 `dbc-commit-mismatch`。

---

## 9. 三方合并与 provenance

### 9.1 三方合并（泛化既有实现，禁止复制）

既有 `src/core/odx/threeWayMerge.ts` 已实现完整的分类（`classifyImportRows`）与合并（`mergeModuleThreeWay`）逻辑，但其 `ImportManifestEntry.module`、`classifyImportRows` 参数、`mergeModuleThreeWay` 内部硬编码 `'Dcm' | 'Dem'` union（含 `as 'Dcm' | 'Dem'` 强转）。本设计**必须**按以下方式泛化，**不得**在 `src/core/dbc/` 复制第二份合并逻辑：

1. 将 `threeWayMerge.ts` 迁移到 `src/core/import/threeWayMerge.ts`（该目录已有 `types.ts` / `patch.ts` / `diff.ts`，是通用 import 基础设施的既定位置）。
2. `ImportManifestEntry.module`、`classifyImportRows`、`mergeModuleThreeWay` 的 module 类型从字面量 union 放宽为 `string`（或泛型 `<M extends string>`），消除 `as` 强转。
3. category 中的来源字面量参数化：泛化函数接受 `removedCategoryLabel` 参数（ODX 传 `'removed-in-odx'`，DBC 传 `'removed-in-dbc'`），既有 ODX IPC 行模型不变。
4. `src/core/odx/` 保留 re-export 薄封装，ODX 全部既有测试必须保持绿色（回归门禁）。

合并输入：

- base：上次导入后记录的 container hash（provenance manifest）。
- current：当前 workspace container hash。
- incoming：本次 DBM mapper 生成的 container hash。
- decisions：用户逐条决策。

合并语义（与既有 `classifyImportRows` 实现一致）：

- incoming 新增 → 默认加入（`added` / `import`）。
- incoming 更新且 local 未改 → 默认更新（`updated` / `import`）。
- local 修改且 incoming 未变 → 保留 local（`locally-modified` / `keep-local`）。
- local 修改且 incoming 也变 → conflict，默认 keep-local。
- base 有但 incoming 没有 → `removed-in-dbc`，默认保留 local。
- base 有、current 已删除、incoming 还在 → 按既有实现归为 `locally-modified`（incoming==base）或 `conflict`，默认 keep-local——用户显式删过的容器不得被导入复活。
- 只在 current 存在的容器（手工新增）不产生 row，原样保留。
- 用户选择 `delete` 才删除。

### 9.2 Provenance manifest

新增：

```text
.autosarcfg/dbc-import-manifest.json
```

与 ODX provenance（`.autosarcfg/odx-import-manifest.json`，扁平 `entries`、单 source）的关系：ODX 一个工程只对应一个 ODX 源，而 DBC 导入天然多源（同一工程可先后导入多个 DBC 文件 / 同一文件的不同 targetNode），因此 DBC manifest 采用 `sources[]` 分组结构。两者文件分离、schema 独立，互不影响；读取容错模式一致。

```typescript
export interface DbcProvenanceManifest {
  readonly version: 1;
  readonly sources: readonly DbcProvenanceSource[];
}

export interface DbcProvenanceSource {
  /** sha256(JSON.stringify({sourceFile, sourceHash, targetNode, profileId}))，字段序固定。 */
  readonly sourceId: string;
  readonly sourceFile: string;
  readonly sourceHash: string;
  readonly targetNode: string;
  readonly profileId: string;
  readonly importedAt: string;
  readonly entries: readonly DbcProvenanceEntry[];
}

export interface DbcProvenanceEntry {
  readonly module: 'Com' | 'CanIf' | 'PduR';
  readonly containerPath: string;
  readonly contentHash: string;
}
```

规则：

- `contentHash` **必须**复用泛化后的 `hashContainerForProvenance`（与 ODX base hash 同一算法，保证跨导入源可比）。
- provenance 只记录成功 commit 的容器。
- 同一 container 的 provenance owner 唯一：commit 时按 sourceId 全量替换该 source 的 entries；其他 source 的 entries 不动。
- 如果另一个 DBC source 尝试导入同一 container，且该 container 已属于其他 source，则归类为 `conflict`（base hash 存在但 owner 不同，按"非owner 的 base 视为已修改"处理）。
- manifest 读取容错与 ODX 一致：文件缺失按空处理；JSON malformed / version 不符时忽略整个文件并报 `dbc-manifest-ignored`（warning，不阻断导入）。
- provenance 文件必须与 ECUC 文件 + project manifest 在同一事务边界内写入（pending-writes 列表统一回滚，§6.4）；失败必须回滚。

---

## 10. IPC 与 UI

### 10.1 新 IPC 契约

新增 additive IPC（类型统一定义在新文件 `src/shared/types/dbc-import.ts`，与 `odx-import.ts` 同级）：

```text
dbc:fullImportPreview
dbc:fullImportCommit
```

项目上下文与 ODX 导入一致：handler 从 `getOpenProjectManifestPath()` 取当前打开工程，request **不携带** manifestPath / manifest（区别于旧 `dbc:importComStack` 的请求风格，不对其反向兼容）。

```typescript
export interface DbcFullImportPreviewRequest {
  readonly dbcPath: string;
  /** Step 1 discovery 可省略：返回 nodes / targetModules，rows 为空。mapping 预览必须提供。 */
  readonly targetNode?: string;
  /** renderer 持有的未保存文档绝对路径列表（dirty 判定的唯一数据源，§6.2）。 */
  readonly dirtyDocPaths: readonly string[];
  /** Phase 2 固定为内置默认值常量；Phase 3 起为实际 Profile id。 */
  readonly profileId: string;
  readonly pduIdPolicy?: Partial<PduIdPolicy>;
  readonly upperLayerNaming?: Partial<UpperLayerNamingPolicy>;
}

export interface DbcFullImportPreview {
  readonly nodes: readonly string[]; // DBC BU_ 列表，供 wizard Step 1 选择/校验
  readonly targetModules: Readonly<Record<'Com' | 'CanIf' | 'PduR', DbcTargetModuleInfo>>;
  readonly rows: readonly DbcImportRow[];
  readonly warnings: readonly DbmWarning[];
  readonly stats: DbcImportStats;
  readonly previewHash: string;
}

export interface DbcTargetModuleInfo {
  readonly exists: boolean;
  readonly docPath?: string;
  readonly dirty: boolean;
}

export type DbcFullImportPreviewResponse =
  | { readonly ok: true; readonly value: DbcFullImportPreview }
  | { readonly ok: false; readonly error: DbcImportError };

export interface DbcFullImportCommitRequest extends DbcFullImportPreviewRequest {
  readonly previewHash: string;
  readonly decisions: readonly {
    readonly module: 'Com' | 'CanIf' | 'PduR';
    readonly path: string;
    readonly decision: DbcImportDecision;
  }[];
}

export type DbcFullImportCommitResponse =
  | {
      readonly ok: true;
      readonly value: {
        readonly applied: number;
        readonly kept: number;
        readonly deleted: number;
        readonly manifestPath: string; // provenance 文件路径（与 ODX commit 返回对齐）
      };
    }
  | { readonly ok: false; readonly error: DbcImportError };

/**
 * §12 表的 discriminated union（kind 的 closed set 以 §12 为 normative 来源）；
 * `write-failed` 必须携带 `rolledBack`。与既有 `OdxImportError` 同构。
 */
export type DbcImportError =
  | {
      readonly kind:
        | 'dbc-malformed'
        | 'dbc-too-large'
        | 'dbc-no-messages'
        | 'dbc-target-node-invalid'
        | 'dbc-profile-not-found'
        | 'dbc-bswmd-not-loaded'
        | 'dbc-module-ambiguous'
        | 'dbc-target-dirty'
        | 'dbc-commit-mismatch'
        | 'read-failed';
      readonly message: string;
    }
  | { readonly kind: 'write-failed'; readonly message: string; readonly rolledBack: boolean };
```

旧 `dbc:importComStack` 保持不动。commit 内部必须重跑与 preview 完全相同的 mapping pipeline（`computeDbcFullImportMappedModules`，与 ODX `computeOdxImportMappedModules` 同模式），禁止把 preview 的内存对象透传到 commit。

### 10.2 Wizard 流程

升级现有 `DbcImportWizard`（不新增平行入口）。现有 3 步（select → preview → confirm）升级为 4 步：

1. **Source & Target**
   - 选择 / 显示 DBC 文件。
   - 文件选定后先调用不带 `targetNode` 的 `dbc:fullImportPreview` 做 discovery；选项来自 response 的 `nodes`（DBC `BU_` 列表），禁止使用非 DBC node。
   - 选定 target node 后触发 mapping preview。
2. **Mapping Policy**
   - 显示当前 Profile（`profileId`）。
   - 配置 PduId base / step / order。
   - 配置是否启用 UL 模板。
   - **任何 policy 变更必须重新调 preview**（hash 随之变化），旧 preview 结果立即作废。
3. **Preview & Decisions**
   - 按 Com / CanIf / PduR 分组。
   - 显示 category、container path、shortName。
   - 展开 row 显示字段级 diff。
   - 显示 Auto / Derived / Profile-default / Unmapped / Error。
   - 显示 stats（含 `skippedIrrelevantMessages` / `skippedMultiplexedSignals`）。
4. **Apply**
   - commit 时显示 busy 状态。
   - commit 期间禁止关闭向导（含 Escape 与背景点击）。
   - 成功后触发项目 reload。

**Renderer 受影响面**（实施时必须同步修改）：

- `DbcImportWizard` props：`onApply(dbcContent, targetNode)` 签名废弃，改为 preview / commit 两阶段回调；`initialDbc` 由 preview response 取代。
- host（`App.tsx`）：从"一次 `dbcImportComStack` 调用"改为"preview → decisions → commit"编排，并负责提供 `dirtyDocPaths`。
- `src/preload/index.ts`：新增 `dbcFullImportPreview` / `dbcFullImportCommit` 两个 API（additive）。
- i18n：`dbc.import.*` 新增 key 必须补齐 `zh-CN` 与 `en`；§11 全部 warning code 需要本地化 label。

### 10.3 Warning 呈现

Warning 必须按 code 分组显示：

- localized label。
- count。
- 可展开 elementRef / message。

Warnings 区域必须支持滚动，不得因为内容过长导致 commit 按钮不可见。

---

## 11. Warning closed set

新增 `DbcWarningCode`：

```text
dbc-duplicate-message-name
dbc-duplicate-signal-name
dbc-invalid-can-id
dbc-invalid-dlc
dbc-message-missing-transmitter
dbc-unsupported-byte-order
dbc-unsupported-value-type
dbc-attribute-unavailable
dbc-bswmd-def-missing
dbc-param-type-mismatch
dbc-enum-unmapped
dbc-reference-missing
dbc-policy-default-used
dbc-policy-unmapped
dbc-pdu-id-conflict
dbc-short-name-legalized
dbc-multiplexed-signal
dbc-manifest-ignored
```

约定：

- `dbc-multiplexed-signal`：§7.7 的 multiplexed / extended-multiplexed 信号策略，elementRef = signal key。
- `dbc-manifest-ignored`：provenance manifest 读取容错（§9.2），与 ODX `odx-manifest-ignored` 对齐。
- `dbc-policy-default-used` 为 info 级提示，按 code 分组聚合显示（§10.3），不得逐字段刷屏。

所有 UI 文案必须补齐 `zh-CN` 与 `en`。

---

## 12. Hard error closed set

| kind                      | 触发条件                                                              |
| ------------------------- | --------------------------------------------------------------------- |
| `dbc-malformed`           | DBC 解析失败                                                          |
| `dbc-too-large`           | DBC 超过大小上限（32 MiB，与既有 handler 一致）                       |
| `dbc-no-messages`         | DBC 没有 message                                                      |
| `dbc-target-node-invalid` | commit 的 targetNode 缺失，或 preview 提供的 targetNode 不是 DBC node |
| `dbc-profile-not-found`   | Profile 不存在或 schema 不合法                                        |
| `dbc-bswmd-not-loaded`    | Com / CanIf / PduR BSWMD 缺失或 spine key 缺失                        |
| `dbc-module-ambiguous`    | 同一 module 出现在多个 value ARXML                                    |
| `dbc-target-dirty`        | 目标文档有未保存修改                                                  |
| `dbc-commit-mismatch`     | commit 重算 preview hash 与请求不一致，或 decisions 含未知 path       |
| `read-failed`             | 通用 IO / manifest / ARXML 读取解析失败（与 ODX handler 对齐）        |
| `write-failed`            | 原子写入失败；必须带 `rolledBack`                                     |

---

## 13. 测试与验收

### 13.1 单元测试

必须覆盖：

- DBM 构建：
  - message / signal / node。
  - extended ID。
  - attribute 归组（attributeAssignments → message/signal）。
  - multiplex 4 态投影。
  - duplicate key（后缀 `_2` 起）。
  - malformed input。
- BSWMD index：
  - container / parameter / reference 解析。
  - type mismatch。
  - enum miss。
  - referenceDef / destKind 解析。
- Mapper：
  - Com deterministic fields。
  - **`ComBitPosition` 换算锚点表（§7.2.1 全部 5 行，LE/BE 双向）**。
  - **`ComSignalType` 分派表（§7.2.2 全部行 + 非法组合 warning）**。
  - **ComTxMode 子容器链生成（CYCLIC→PERIODIC + cycleTime → ComTxModeTimePeriod；Rx 不生成）**。
  - CanIf deterministic fields。
  - **Tx/Rx dispatch + 相关性过滤（无关 message 不生成 + stats 计数）**。
  - **multiplex 策略（multiplexor 导入 / muxed 跳过 + warning / Profile override 导入）**。
  - PduId policy（含与存量容器的冲突检测）。
  - UL policy。
  - PduR source/dest reference（Tx / Rx 两个方向的拓扑）+ HandleId fallback。
- Three-way merge：
  - added / updated / locally-modified / conflict / converged / removed-in-dbc。
  - **泛化回归：`src/core/odx/` 全部既有 threeWayMerge / ODX 导入测试必须保持绿色。**
  - 跨 source 容器归属冲突。
- Provenance：
  - sourceId 稳定性（同输入同 id）。
  - 多 source 合并与按 sourceId 替换。
  - malformed manifest 容错（`dbc-manifest-ignored`）。
  - rollback。

### 13.2 IPC 测试

必须覆盖：

- preview 不会写文件。
- target node invalid。
- BSWMD 缺失。
- module ambiguous。
- dirty target。
- preview hash mismatch。
- commit 成功、失败回滚。
- manifest 更新与 provenance 更新。

### 13.3 UI 测试

必须覆盖：

- wizard 步骤流转。
- warning 分组和滚动。
- field diff 展示。
- busy 状态禁止关闭。
- commit 后 reload。

### 13.4 验收命令

每个任务提交前至少运行（统一走 `package.json` scripts，不手写 node 路径）：

```powershell
pnpm type-check                                    # tsc --noEmit -p tsconfig.json && -p tsconfig.web.json
pnpm vitest run <targeted-tests> --reporter=dot
pnpm prettier --write <changed files>
```

阶段完成前运行完整 `pnpm test`（Vitest 全量）。

---

## 14. 实施阶段

### Phase 1：DBM、BSWMD 基础与合并泛化

- 新增 DBM 模型与 builder（含 attribute 归组、multiplex 投影）。
- 新增 Com / CanIf / PduR BSWMD index（含 `referenceDef` 扩展）。
- **泛化迁移 `src/core/odx/threeWayMerge.ts` → `src/core/import/threeWayMerge.ts`**（§9.1），ODX 侧改薄封装，ODX 全部既有测试保持绿色。
- 不改变现有导入行为。

### Phase 2：字段级 Mapper

- 新增 Com / CanIf / PduR mapper（消费默认策略常量，即 Phase 3 内置 Profile 的种子，§5.4）。
- 生成确定性字段（含 §7.2.1 / §7.2.2 换算与分派、ComTxMode 链、相关性过滤、multiplex 策略）。
- 引入 warning closed set。
- PduR source/dest reference 生成。
- 新增 preview IPC，但 UI 可先显示简化结果。

### Phase 3：Mapping Profile

- 实现 Profile schema。
- 内置 R22 Profile（默认策略常量迁移为数据）。
- 支持 PduId / UL policy override。
- Profile 参与 preview hash。
- UI 显示 `profileId`。

### Phase 4：三方合并与完整 UI

- preview / commit 接入泛化后的三方合并。
- 实现 provenance（多 source manifest）。
- 升级 DbcImportWizard（4 步流程）。
- 字段级 diff 与决策 UI。
- 原子 commit / rollback / reload。
- 迁移旧入口到新 IPC。

---

## 15. 明确不做

- 不在本次设计中实现 CAN FD Profile。
- 不自动猜测 HRH / HTH。
- 不自动生成无法从 DBC 或 Profile 推导的 UL 名称。
- 不允许正式导入产生无 BSWMD definitionRef 的参数。
- 不生成 EcuC PduCollection / EcuC Pdu 条目；destKind 指向 EcuC Pdu 的引用（如 `ComPduIdRef`、`CanIfTxPduRef`）一律标记 `Unmapped`，由用户在 EcuC 层手工补齐。
- 不把 factor / offset / min / max / unit 写入标准 R22 ComSignal（标准参数集不存在）；仅当厂商 BSWMD 扩展且 Profile 显式声明时才映射。
- 不对 multiplexed message 做 AUTOSAR 动态 mux 建模；multiplexed 信号默认跳过并告警。
- 不用旧的 `dbcToComStack()` 作为新导入核心路径；该函数仅在旧 IPC 兼容期间保留。
- 不复制第二份三方合并 / shortName / 容器哈希实现；一律泛化复用（§9.1）。
