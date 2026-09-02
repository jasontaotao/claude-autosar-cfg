# ODX-D 完整导入设计（ODX-D Full Import）

**日期**：2026-09-02
**状态**：已评审（用户逐节批准）
**取代**：`docs/superpowers/plans/2026-09-02-odx-diag-extract-correctness.md`（该 plan 的 6 项修复全部被本设计吸收，见 §1.3）
**受众**：实施者。本文档是唯一的 normative 来源；与代码冲突时以本文档为准并提出评审。

**术语约定**：**必须**=MUST，**不得**=MUST NOT，**可**=MAY。未标这些词的是说明性文字。

---

## 1. 背景、目标与废止范围

### 1.1 现状问题

现有 ODX-D 导入（v1.22.0→v1.27.2 演进）是一条"摘要解析 → 字符串拼接 → 落两个 staging 文件"的链路，经真实文件（`samples/odx/Demo_Cdd.odx-d`，Vector CANdelaStudio 15 导出，95 个 DIAG-SERVICE）验证存在三类缺口：

1. **内容缺口**：只提取 0x22 DID / 0x31 Routine / DTC 三类，且只取 id+shortName。0x10 Session、0x27 Security、0x19/0x14 故障记忆、0x2F/0x28/0x11/0x3E/0x34-0x37/0x85 全部丢弃；DOP/COMPU-METHOD/UNIT（文件中 167 个 DOP、169 个 COMPU-METHOD）全部丢弃；PARENT-REF 层继承不解析（本文件的 BASE-VARIANT 就通过 `PARENT-REF xsi:type="PROTOCOL-REF"` 继承 PROTOCOL 层）。
2. **输出形态错误**：生成非标准 `<DEM-EVENT-PARAMETER>`（ARXML 树 `classifyElement` 归为 `unknown`，GUI 不可见）；definition-ref 硬编码 `/Dcm/...`（workspace BSWMD 实际路径为 `/AUTOSAR_R22/EcucDefs/Dcm/...`）；无数值 identifier 参数。
3. **流程缺口**：无预览/审核步骤；无导入报告；全量覆盖写（手工改动被冲掉）；与工程内 Dcm 配置编辑器断开。

### 1.2 目标

1. ODX-D 全内容解析：全部 UDS 服务类 + DOP/COMPU-METHOD/UNIT + PARENT-REF 完整继承链 + 多 ECU-VARIANT 选择。
2. 审核式导入：导入前预览（新增/更新/本地已改/冲突/一致/删除候选六分类），冲突逐条决策，手工改动永不静默丢失。
3. 直接合并进工程内 Dcm/Dem ECUC 配置（复用 Sprint 14 import 管线）；staging 文件降级为可选导出产物。
4. 输出为标准 AUTOSAR ECUC AST（复用 `arxml/types.ts`），definition-ref 全部从工程已加载 BSWMD 反查，不写死路径。

### 1.3 废止与吸收

| 资产 | 处置 |
|---|---|
| `src/core/bridge/odxToDiagnosticExtract.ts` | **删除**（§9 迁移完成后）。功能由 `dimToDiagnosticExtract.ts`（§8）取代 |
| `parseOdxHandler.ts` + `OdxSummary`（`shared/types/odx.ts`） | **保留**，继续服务 OdxViewer 三表摘要。与新解析层双通道并存（§3.4） |
| 2026-09-02 correctness plan | **废止**。其 Task 1/2（数值 identifier）由 §4.2 吸收；Task 3（definition-ref + PARAMETER-VALUES）由 §6 映射器吸收；Task 5（DcmDsdService）由 §6.3.1 吸收；Task 6（Dem ECUC 结构）由 §6.3.4 + §8.1 吸收 |
| `odx:importDiagnosticExtract` IPC | **契约保留**，实现重接到新 emitter（§8.2） |

### 1.4 非目标（Non-goals）

- .pdx（zip 包）解析——维持 v1.22.0 既定边界。
- 反向 ARXML→ODX——维持 v1.24.0 既定约束。
- DcmDsl 协议层配置（CAN ID、P2 定时器等 COMPARAM）：DOCREF 外部 COMPARAM-SUBSET 在独立 .odx-d 中不可解析（§5.1），本 spec 不映射。列为后续工作。
- FUNCTIONAL-GROUP 建模（真实文件为 0 个，YAGNI）。
- OdxViewer 摘要内容扩展（viewer 保持轻量）。

---

## 2. 总体架构

```
ODX-D 文件
  │
  ▼
┌─ ① 解析层 src/core/odx/（新建，纯函数零 IO）─────────────┐
│  odxDocument.ts    全量解析 + 全局 ID 索引               │
│  layerResolver.ts  PARENT-REF 继承链扁平化               │
│  dopResolver.ts    DOP/COMPU-METHOD/UNIT 解析            │
│  dimBuilder.ts     装配 DIM + 收集 warnings              │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─ ② DIM（src/core/odx/dim.ts）───────────────────────────┐
│  诊断中间模型：服务全集 + 数据对象 + DTC + 会话/安全      │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─ ③ 映射器 src/core/odx/mapDimToEcuc.ts ─────────────────┐
│  表驱动 DIM → ArxmlModule[]（Dcm、Dem）                  │
│  definition-ref 全部经 BSWMD 索引反查                    │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─ ④ 三向合并 src/core/odx/threeWayMerge.ts ───────────────┐
│  classifyImportRows  六分类（manifest 三方哈希对比）     │
│  mergeModuleThreeWay 算最终模块 → overwrite-module 提交  │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─ ⑤ IPC + 向导 UI ───────────────────────────────────────┐
│  odx:importPreview / odx:importCommit（重活全在 main）   │
│  OdxImportWizard：选文件→解析→变体→预览→执行             │
└──────────────────────────────────────────────────────────┘

旁路：⑥ staging 导出 dimToDiagnosticExtract.ts（可选产物，§8.1）
      ⑦ xlsx Dcm 管线迁移到 DIM 取数（§8.3）
```

**数据归属**：解析、继承、DIM、映射、三向合并**必须**全部在 main 进程执行。跨 IPC 的只有预览 DTO（行级）和用户决策列表（§7.1 理由）。

---

## 3. Section ①：ODX 解析层（`src/core/odx/`）

### 3.1 `odxDocument.ts` — 全量解析 + ID 索引

**输入**：ODX XML 字符串（已由 IPC 层做过 32 MiB cap，沿用 `ODX_MAX_BYTES`）。
**输出**：`OdxDocument`：

```typescript
export interface OdxDocument {
  /** 全局 ID 索引：ODX `ID` 属性 → 原始元素。继承解析与 DOP 解析的使能器。 */
  readonly idIndex: ReadonlyMap<string, OdxRawElement>;
  /** 全部 DIAG-LAYER（BASE-VARIANT / ECU-VARIANT / PROTOCOL / FUNCTIONAL-GROUP），文档序。 */
  readonly layers: readonly OdxRawElement[];
  /** 可导入变体清单（wizard 变体选择器数据源）。 */
  readonly importableVariants: readonly OdxVariantInfo[];
  readonly modelVersion: string;           // <ODX MODEL-VERSION="...">
  readonly adminRevision?: string;         // 最后一个 DOC-REVISION 的 REVISION-LABEL
}

export interface OdxVariantInfo {
  readonly odxId: string;
  readonly shortName: string;
  readonly kind: 'BASE-VARIANT' | 'ECU-VARIANT';
}

/** fast-xml-parser 原始节点的轻包装：tag 名 + 属性表 + 子节点表。 */
export interface OdxRawElement {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: Readonly<Record<string, readonly OdxRawElement[]>>;
}
```

规则：
- 解析器 **必须** 复用现有 `fast-xml-parser` 配置（`parseOdxHandler.ts:51-59` 同款，`parseTagValue: false`）。
- `OdxRawElement` 是不可变规范形态；`children` 的 key 是 tag 名，value 保持文档序。
- **不得** 在这一层丢弃任何 DIAG-LAYER 子树；选择性提取是 `dimBuilder` 的职责。

### 3.2 `layerResolver.ts` — 继承解析

**输入**：`OdxDocument` + 目标变体 `odxId`。
**输出**：`ResolvedLayer` = 目标变体**自身声明 + 全部祖先层元素**的扁平化集合。

算法（必须严格按此）：
1. 从目标变体沿 `PARENT-REFS/PARENT-REF` 的 `ID-REF` 向上走（经 `idIndex` 解析），DFS 收集链 `[self, parent, grandparent, …]`。成环 → 硬错误 `odx-inheritance-cycle`（附链上路名）。
2. 元素合并优先级：**子层覆盖父层**。同 `ID` 元素以链中更靠前者（更子的层）为准。
3. 排除：`NOT-INHERITED-DIAG-COMMS/NOT-INHERITED-DIAG-COMM/DIAG-COMM-SNREF` 列出的 SHORT-NAME **必须** 从合并结果的 DIAG-SERVICE 集中剔除。
4. `PARENT-REF` 的 `xsi:type` 不限定（PROTOCOL-REF / BASE-VARIANT-REF 均可）；解析不到 `ID-REF` 目标 → warning `odx-unresolved-parent-ref`，该分支跳过（不致命）。

### 3.3 `dopResolver.ts` — DOP/COMPU-METHOD/UNIT

对 `ResolvedLayer` 中每个 `DATA-OBJECT-PROP` / `DTC-DOP` 产出 `DimDataObject`（§4）。COMPU-METHOD 类别支持矩阵：

| CATEGORY | 支持 | DIM 表示 |
|---|---|---|
| `IDENTICAL` | 必须 | `{ kind: 'identical' }` |
| `LINEAR` | 必须 | `{ kind: 'linear', factor, offset }`（`COMPU-NUMERATOR` V0/V1 + `COMPU-DENOMINATOR` V0；分母≠1 → factor 相除） |
| `TEXTTABLE` | 必须 | `{ kind: 'texttable', entries: [{lower, upper, text}] }` |
| `SCALE-LINEAR` | 必须 | `{ kind: 'scale-linear', segments: [{lower, upper, factor, offset}] }` |
| `RAT-FUNC` / `TAB-INTP` / 其他 | 不映射 | warning `odx-unsupported-compu`，`compuMethod` 置 `undefined`（DOP 其余字段保留） |

DIAG-CODED-TYPE 支持矩阵：

| `xsi:type` | 支持 | `codedType` 表示 |
|---|---|---|
| `STANDARD-LENGTH-TYPE` | 必须 | `{ kind: 'standard', bitLength }` |
| `MIN-MAX-LENGTH-TYPE` | 必须 | `{ kind: 'minmax', minBytes, maxBytes, termination }`（取 `MAX-LENGTH` 为长度上限；`TERMINATION` 属性原样保留） |
| `PARAM-LENGTH-INFO-TYPE` / `LEADING-LENGTH-INFO-TYPE` / 无 type | 不映射长度 | warning；`codedType.kind = 'opaque'` |

`BASE-DATA-TYPE` / `BASE-TYPE-ENCODING` 原样保留字符串（映射层负责归一化，§6.5）。

### 3.4 `dimBuilder.ts` — 装配 + warnings

- 从 `ResolvedLayer` 提取：DIAG-SERVICE 全集（关联其 REQUEST-REF / POS-RESPONSE-REFS / NEG-RESPONSE-REFS 到具体参数树）、DTC-DOP 全集、会话/安全推导（§4.4/§4.5）。
- 单元素失败 **不得** 致命：记入 `warnings[]` 继续。warning 结构：`{ code: string; elementRef: string; message: string }`，`code` 取值集合在 §11 统一列出。
- **双通道**：本层与 `parseOdxHandler`（viewer 摘要）互不调用、各自独立解析。viewer 通道保持轻量；导入通道走完整解析。二者数据不得互相 import 类型（`core/odx/` 类型独立定义于 `core/odx/dim.ts`，不进 `shared/types/odx.ts`——viewer 契约不变）。

### 3.5 硬错误集合（新增）

在现有 `odx-malformed` / `odx-too-large` 之外新增：

| kind | 触发 |
|---|---|
| `odx-no-variant` | 文件无 BASE-VARIANT 且无 ECU-VARIANT |
| `odx-variant-not-found` | `importCommit` 传入的 variantId 不存在 |
| `odx-inheritance-cycle` | PARENT-REF 成环 |
| `odx-bswmd-not-loaded` | 映射时 Dcm/Dem BSWMD 索引不可用（§6.2） |
| `odx-target-dirty` | 目标模块文档在 workspace 有未保存修改（§7.3 前置检查） |
| `odx-commit-mismatch` | commit 重算的预览哈希与 preview 返回的不一致（确定性被破坏的信号，防御性） |

---

## 4. Section ②：DIM — 诊断中间模型（`src/core/odx/dim.ts`）

全部字段 `readonly`；模型不可变。以下是**完整**类型定义（实施者按此实现，不得增删字段；确需变更走 spec 评审）：

```typescript
export interface Dim {
  readonly meta: DimMeta;
  readonly services: readonly DimService[];
  readonly dataObjects: readonly DimDataObject[];   // DOP 池，被 DimParam.dataObjectRef 引用
  readonly dtcs: readonly DimDtc[];
  readonly sessions: readonly DimSession[];          // 按 value 升序去重
  readonly securityLevels: readonly DimSecurityLevel[]; // 按 level 升序去重
  readonly warnings: readonly DimWarning[];
}

export interface DimMeta {
  readonly sourcePath: string;        // 导入用；序列化进 manifest
  readonly modelVersion: string;
  readonly variant: OdxVariantInfo;   // 实际解析的变体
  readonly adminRevision?: string;
}

export type DimServiceClass =
  | 'DiagnosticSessionControl'        // 0x10
  | 'ECUReset'                        // 0x11
  | 'ClearDiagnosticInformation'      // 0x14
  | 'ReadDTCInformation'              // 0x19
  | 'ReadDataByIdentifier'            // 0x22
  | 'SecurityAccess'                  // 0x27
  | 'CommunicationControl'            // 0x28
  | 'WriteDataByIdentifier'           // 0x2E
  | 'InputOutputControlByIdentifier'  // 0x2F
  | 'RoutineControl'                  // 0x31
  | 'RequestDownload'                 // 0x34
  | 'RequestUpload'                   // 0x35
  | 'TransferData'                    // 0x36
  | 'RequestTransferExit'             // 0x37
  | 'TesterPresent'                   // 0x3E
  | 'ControlDTCSetting'               // 0x85
  | 'Unknown';

export interface DimService {
  readonly odxId: string;             // DIAG-SERVICE 的 ID —— provenance 锚点
  readonly shortName: string;         // 原始 ODX SHORT-NAME（未合法化）
  readonly longName?: string;
  readonly semantic?: string;         // DIAG-SERVICE SEMANTIC 原值（STOREDDATA 等）
  readonly serviceClass: DimServiceClass;
  readonly sid: number;               // 0-255；提取规则 §4.2
  readonly subFunction?: number;      // 已按 §4.2 屏蔽 0x80 抑制位
  readonly request: readonly DimParam[];        // bytePosition 升序
  readonly posResponses: readonly (readonly DimParam[])[];
  readonly negResponseCodes: readonly string[]; // NRC-CONST 显示值（如 "0x22"），原样
  readonly sdgAnnotations: Readonly<Record<string, string>>; // SDG 拍平：SI → 文本
  readonly sessionRefs: readonly number[];      // 关联会话 value 集（推导 §4.6）；空 = 所有会话可用
  readonly securityRefs: readonly number[];     // 关联安全等级 level 集（推导 §4.6）；空 = 无安全要求
}

export interface DimParam {
  readonly name: string;              // PARAM SHORT-NAME
  readonly semantic?: string;         // SEMANTIC 原值
  readonly codedValue?: string;       // CODED-VALUE 原值（数值化在各消费点做）
  readonly bytePosition: number;      // BYTE-POSITION；缺省按文档序补
  readonly bitPosition?: number;
  readonly dataObjectRef?: string;    // DOP-DATA-OBJECT-PROP-REF → DimDataObject.odxId
}

export interface DimDataObject {
  readonly odxId: string;
  readonly shortName: string;
  readonly codedType: DimCodedType;
  readonly baseDataType: string;      // A_UINT32 / A_ASCIISTRING / …原值
  readonly encoding: string;          // NONE / 2C / IEEE-FLOAT32 / …原值，缺省 "NONE"
  readonly compuMethod?: DimCompuMethod;
  readonly unit?: DimUnit;
}

export type DimCodedType =
  | { readonly kind: 'standard'; readonly bitLength: number }
  | { readonly kind: 'minmax'; readonly minBytes: number; readonly maxBytes: number; readonly termination?: string }
  | { readonly kind: 'opaque' };

export type DimCompuMethod =
  | { readonly kind: 'identical' }
  | { readonly kind: 'linear'; readonly factor: number; readonly offset: number }
  | { readonly kind: 'texttable'; readonly entries: readonly DimTextTableEntry[] }
  | { readonly kind: 'scale-linear'; readonly segments: readonly DimLinearSegment[] };

export interface DimTextTableEntry { readonly lower: number; readonly upper: number; readonly text: string }
export interface DimLinearSegment { readonly lower: number; readonly upper: number; readonly factor: number; readonly offset: number }
export interface DimUnit { readonly name: string; readonly displayName?: string; readonly factor?: number; readonly offset?: number }

export interface DimDtc {
  readonly odxId: string;
  readonly shortName: string;
  readonly troubleCode: number;       // 数值化规则 §4.3；解析失败 → 该 DTC 整体进 warning 跳过
  readonly displayCode?: string;      // DISPLAY-TROUBLE-CODE（J2012）
  readonly text?: string;             // TEXT
  readonly severity?: string;         // DTC-SEVERITY 原值（归一化在映射层，§6.3.4）
  readonly functionalUnit?: number;   // FUNCTIONAL-UNIT 数值化
}

export interface DimSession {
  readonly name: string;              // SDG DiagInstanceQualifier 优先，否则服务 SHORT-NAME
  readonly value: number;             // 0x10 服务 subFunction（已屏蔽 0x80）
  // P2/P2* 不可得（§5.1），此模型不携带；BSWMD 默认值生效。
}

export interface DimSecurityLevel {
  readonly name: string;
  readonly level: number;             // 推导规则 §4.5
  readonly seedBytes?: number;        // 从 RequestSeed 正响应 DOP bitLength/8 推导
  readonly keyBytes?: number;         // 从 SendKey 请求 key 参数 DOP bitLength/8 推导
}

export interface DimWarning {
  readonly code: string;              // §11 取值集合
  readonly elementRef: string;        // ODX ID 或 SHORT-NAME
  readonly message: string;
}
```

### 4.1 serviceClass 归一化

SID 优先；SID 缺失时按 SEMANTIC 兜底（`SESSION→0x10`、`SECURITY→0x27`、`STOREDDATA→0x22`、`CONTROL→0x31`、`FAULTMEMORY→0x19`）；两者都缺 → `Unknown`。`Unknown` 服务 **不得** 生成任何容器，进 warning（`odx-unknown-service-class`）。

### 4.2 SID / subFunction / 数值标识符提取

- SID：REQUEST 第一个 `PARAM[@SEMANTIC="SERVICE-ID"]/CODED-VALUE`。数值化：`0x`/`0X` 前缀 → 16 进制；否则 10 进制（Vector 导出为 10 进制）。越界（<0 或 >255）→ warning `odx-service-sid-invalid`，服务跳过。
- subFunction：`PARAM[@SEMANTIC="SUBFUNCTION"]/CODED-VALUE` 同法数值化，然后 **`& 0x7F`**（屏蔽 suppressPosRspMsgIndicationBit）。缺失 → `undefined`。
- **DID 数值 identifier**（0x22/0x2E 服务用）：REQUEST 第一个 `PARAM[@SEMANTIC="ID"]/CODED-VALUE`，同法数值化，合法域 0..0xFFFF。缺失/越界 → `undefined`（映射层按 §6.3.2 处理）。
- **Routine 数值 identifier**（0x31 服务用）：REQUEST 第一个 `PARAM[@SEMANTIC="DATA-ID"]/CODED-VALUE`，同法数值化，合法域 0..0xFFFF。缺失/越界 → `undefined`。
- identifier **不进** `DimService` 顶层字段；它作为 `DimParam`（`semantic: "ID"` / `"DATA-ID"`，带 `codedValue`）自然存在于 `request` 参数树中，映射层按 semantic 查找。

### 4.3 DTC 数值化

`TROUBLE-CODE`：`0x` 前缀 → 16 进制，否则 10 进制；合法域 0..0xFFFFFF（24bit）。越界/不可解析 → warning `odx-dtc-code-invalid`，该 DTC 跳过。

### 4.4 会话推导

每个 `DiagnosticSessionControl` 服务贡献一个 `DimSession { name, value: subFunction }`。`subFunction` 缺失 → warning 跳过。按 `value` 去重（同名不同值 → 都保留 + warning `odx-session-value-conflict`）。

### 4.5 安全等级推导

0x27 服务按 CANdela 惯例成对（RequestSeed=奇数 subFunction，SendKey=偶数=奇数+1）。`level = (requestSeedSubFunction + 1) / 2`。配对规则：同 `DiagInstanceQualifier`（SDG）归一对；无 SDG 时按 subFunction 奇偶相邻配对。落单 → warning `odx-security-unpaired`，仍生成等级（seed/key 尺寸可能缺）。

### 4.6 会话/安全依赖推导（sessionRefs / securityRefs）

数据源（按优先级）：
1. **PRE-CONDITION-STATE-REFS**：服务的 `PRE-CONDITION-STATE-REF ID-REF` → STATE 元素 → 其 SHORT-NAME 与 `DimSession.name`（§4.4）/ `DimSecurityLevel.name`（§4.5）做大小写不敏感匹配；命中 → 加入对应 refs 集。
2. **SDG 标注**：`sdgAnnotations` 中 key 含 `Session`/`Security`（大小写不敏感）的值做同样匹配。

去重后升序输出。两条数据源都无命中 → 空数组（语义：所有会话可用 / 无安全要求，对应 §6.3.1 不生成引用）。STATE-TRANSITION-REFS 只描述跳转行为，**不得** 用作依赖数据源（0x10 服务自身的跳转目标已通过 §4.4 进入 DimSession）。STATE 图解析范围**仅限**：`STATES/STATE` 的 SHORT-NAME 收集 + PRE-CONDITION-STATE-REFS 的 ID-REF 解析；不建模完整状态机。

---

## 5. 解析前置事实：COMPARAM 与外部引用

### 5.1 外部 COMPARAM-SUBSET 不可解析

真实文件证实：`COMPARAM-REF ID-REF="ISO_15765_2.CP_CanFuncReqId" DOCREF="ISO_15765_2" DOCTYPE="COMPARAM-SUBSET"` —— 参数**定义**在外部文档（正常经 .pdx 分发），独立 .odx-d 不含该文档。

规则：
- `COMPARAM-REF` 的 `SIMPLE-VALUE[0]` 是内联值，**可** 读取用于报告展示（如 CAN ID）。
- **不得** 尝试解析 `DOCREF` 外部文档。
- P2/P2\*、CAN ID 等协议层参数 **不进入** DIM 与映射输出（§1.4 非目标）；映射器对 `DcmDspSessionRow` 的 P2 类参数 **必须** 填 §6.6 默认值（BSWMD 必填），并产生一条 warning `odx-comparam-external` 进导入报告。

---

## 6. Section ③：ECUC 映射器（`src/core/odx/mapDimToEcuc.ts`）

### 6.1 签名与产出

```typescript
export interface MapDimToEcucRequest {
  readonly dim: Dim;
  readonly bswmdIndex: BswmdDefIndex;   // §6.2
}
export interface MapDimToEcucResult {
  readonly modules: readonly ArxmlModule[];   // 恰好 2 个：Dcm、Dem（内容可空但模块必出）
  readonly warnings: readonly DimWarning[];   // 映射期 warning，并入导入报告
}
export function mapDimToEcuc(req: MapDimToEcucRequest): MapDimToEcucResult;
```

产出是 `src/core/arxml/types.ts` 的 `ArxmlModule`（`kind: 'module'`, `tagName: 'ECUC-MODULE-CONFIGURATION-VALUES'`），**不得** 拼字符串。容器 `definitionRef` 写入 `ArxmlContainer.definitionRef`，参数 `definitionRef` 写入 `ParamValue.definitionRef`——序列化器已有渲染路径（v1.9.0）。

### 6.2 BSWMD 索引（`BswmdDefIndex`）

```typescript
export interface BswmdDefIndex {
  /** 完整容器脊柱 key → BSWMD 绝对路径，如 "DcmConfigSet/DcmDsp/DcmDspDid" → "/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspDid" */
  readonly containerPath: ReadonlyMap<string, string>;
  /** "完整容器脊柱/参数短名" → 参数定义绝对路径，如 "DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidIdentifier" → ".../DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidIdentifier" */
  readonly paramPath: ReadonlyMap<string, string>;
  /** "完整容器脊柱/引用短名" → 引用定义绝对路径 */
  readonly refPath: ReadonlyMap<string, string>;
  /** "完整容器脊柱/参数短名" → ParamDef（kind/默认值/枚举字面量），用于值合法性 */
  readonly paramDef: ReadonlyMap<string, ParamDef>;
}
```

- 由 main 进程从工程已加载的 Dcm/Dem BSWMD（`BswModuleDef.containers` 递归走，`ContainerDef.path` 现成）构建。
- Dcm 或 Dem 任一 BSWMD 不可用 → 硬错误 `odx-bswmd-not-loaded`（向导弹出"请先在工程中加载 Dcm/Dem BSWMD"）。
- 映射表查不到的容器/参数 → warning `odx-bswmd-def-missing` + 跳过该项，**不得** 生成悬空 definition-ref。

### 6.3 映射总表（normative）

以下全部容器/参数/枚举字面量已逐个对照 workspace `Dcm_bswmd.arxml` / `Dem_bswmd.arxml`（包前缀 `/AUTOSAR_R22/EcucDefs/Dcm|Dem`，2025-09-27 版）验证。**注意**：容器层级为 `DcmConfigSet > DcmDsp > …`（含中间层），任何文档或代码中出现省略中间层的路径（如 `/Dcm/DcmDspDid`）都是错的——这正是 §6.2 禁止硬编码路径的原因。运行时仍以 BSWMD 索引反查为准，本表是索引的预期内容。

#### 6.3.0 模块骨架（mapper 必须生成的容器脊柱）

```
ECUC-MODULE-CONFIGURATION-VALUES(Dcm)
└── DcmConfigSet [1..1]
    ├── DcmDsd [1..1]
    │   └── DcmDsdServiceTable
    │       └── DcmDsdService [1..INF]（每服务一行，SUB: DcmDsdSubService）
    └── DcmDsp [0..1]
        ├── DcmDspDid [0..INF]  ├── DcmDspDidInfo  ├── DcmDspData [0..INF]
        ├── DcmDspRoutine [0..INF]  ├── DcmDspReadDTCInformation [0..1]
        ├── DcmDspSession [1..1] > DcmDspSessionRow [0..31]
        ├── DcmDspSecurity [1..1] > DcmDspSecurityRow [0..31]
        ├── DcmDspClearDTC [0..1]  ├── DcmDspComControl [0..1]
        ├── DcmDspControlDTCSetting [0..1]  └── DcmDspEcuReset [0..1] > DcmDspEcuResetRow

ECUC-MODULE-CONFIGURATION-VALUES(Dem)
├── DemConfigSet
│   ├── DemEventParameter [1..65535]  ├── DemDTC [0..65535]
│   └── DemDTCAttributes（不映射——优先级/内存目标是工程策略，非 ODX 内容）
└── DemGeneral [1..1]
    └── DemOperationCycle [1..256]
```

**工程已有模块文档时**：脊柱容器按 path 命中三向合并（§7），不重复生成。**工程无该模块时**：先用现有 `generateEcucSkeleton`（BSWMD 骨架 + `fillParamsFromBswmd` 默认值）建模块，再叠加映射容器。

#### 6.3.1 服务类映射（Dcm）

| DimServiceClass | 生成内容（容器实例短名 ← DIM 来源） |
|---|---|
| 0x22 ReadDataByIdentifier | `DcmDspDid/<DidName>`（池化 §6.4.1）+ `DcmDspDidInfo/<DidName>_Info`（含 `DcmDspDidRead` 子容器）+ 每 DOP 一个 `DcmDspData/<DopName>`（按 DOP odxId 去重）+ `DcmDsdService` 行 |
| 0x2E WriteDataByIdentifier | 命中同一 DID 池；其 `DcmDspDidInfo` 增加 `DcmDspDidWrite` 子容器 + `DcmDsdService` 行 |
| 0x2F InputOutputControlByIdentifier | 命中同一 DID 池；`DcmDspDidInfo` 增加 `DcmDspDidControl` 子容器 + `DcmDsdService` 行 |
| 0x31 RoutineControl | `DcmDspRoutine/<RoutineName>` + `DcmDsdService` 行。routine 的请求/响应参数**不映射**为信号级子容器（DcmDspStartRoutine 等），进 warning `odx-routine-params-not-mapped`（§1.4 后续工作） |
| 0x10 DiagnosticSessionControl | 每个 `DimSession` 一个 `DcmDspSessionRow/<SessionName>` + `DcmDsdService` 行 |
| 0x27 SecurityAccess | 每个 `DimSecurityLevel` 一个 `DcmDspSecurityRow/<LevelName>` + `DcmDsdService` 行（RequestSeed/SendKey 的 subFunction 进 DcmDsdSubService，引用同一 SecurityRow） |
| 0x19 ReadDTCInformation | `DcmDspReadDTCInformation` 空壳（0..1，任一 0x19 存在即生成）+ `DcmDsdService` 行；**每个 subFunction 一个 `DcmDsdSubService` 行**（`DcmDsdSubServiceId` ← subFunction） |
| 0x14 ClearDiagnosticInformation | `DcmDspClearDTC` 空壳 + `DcmDsdService` 行 |
| 0x28 CommunicationControl | `DcmDspComControl` 空壳 + `DcmDsdService` 行（通道分配是工程策略，不进 DcmDspComControlAllChannel） |
| 0x85 ControlDTCSetting | `DcmDspControlDTCSetting` 空壳 + `DcmDsdService` 行 |
| 0x11 ECUReset | `DcmDspEcuReset` 壳 + 每个 subFunction 一个 `DcmDspEcuResetRow/<SubName>` + `DcmDsdService` 行 |
| 0x3E TesterPresent | 仅 `DcmDsdService` 行 |
| 0x34/0x35/0x36/0x37 上下载 | 仅 `DcmDsdService` 行 + warning `odx-memory-service-not-mapped`（DcmDspMemory 内存描述是工程策略，§1.4 后续工作） |
| Unknown | 不生成 + warning `odx-unknown-service-class` |

**`DcmDsdService` 分组规则（normative）**：DcmDsdService 按 **SID 去重**——同一 SID 的多个 DimService 合并为一行 `DcmDsdService`（短名取组内 odxId 排序后首个服务的合法化 shortName + `_Svc` 后缀防重）；组内所有**不同** subFunction 值各生成一行 `DcmDsdSubService`（短名取该服务的合法化 shortName）。服务级 session/security refs 取组内并集；subservice 级 refs 取该 subFunction 对应服务的 refs。例：6 个 0x10 服务 → 1 行 DcmDsdService + 6 行 DcmDsdSubService；37 个 0x22 服务（无 subFunction）→ 1 行 DcmDsdService，`DcmDsdSidTabSubfuncAvail=false`，无 subservice。

**每行 `DcmDsdService` 的参数**（`DcmDsdSubService` 同理，括号内为差异）：

| 参数 | 值来源 |
|---|---|
| `DcmDsdServiceUsed` (bool, 必填) | `true` |
| `DcmDsdSidTabServiceId` (int, 必填) | `DimService.sid` |
| `DcmDsdSidTabSubfuncAvail` (bool, 必填) | `DimService.subFunction !== undefined` |
| `DcmDsdSidTabSessionLevelRef` [0..INF] | `DimService.sessionRefs` 每个值 → 对应 `DcmDspSessionRow` 实例路径；空数组 → 不生成引用（= 所有会话可用） |
| `DcmDsdSidTabSecurityLevelRef` [0..INF] | `DimService.securityRefs` 同理；空数组 → 不生成引用（= 无安全要求） |
| （SubService）`DcmDsdSubServiceId` (int, 必填) | `DimService.subFunction`；`DcmDsdSubServiceUsed` = `true` |

#### 6.3.2 DID 相关容器参数（Dcm）

| 容器/参数 | 值来源 |
|---|---|
| `DcmDspDid.DcmDspDidIdentifier` (int, 必填) | DID 数值（§4.2 提取）；缺失 → 整个 DcmDspDid 容器不生成（§6.4.1） |
| `DcmDspDid.DcmDspDidSize` (int, 可选) | 数据参数字节总长（各 DOP 字节数按 bytePosition 求和；minmax 取 maxBytes） |
| `DcmDspDid.DcmDspDidUsed` / `DcmDspDidUsePort` (必填) | 默认值表 §6.6 |
| `DcmDspDid.DcmDspDidInfoRef` (ref, **必填 1..1**) | 本 DID 的 `DcmDspDidInfo` 实例路径 |
| `DcmDspDid.DcmDspDidRef` [0..INF] | 各 `DcmDspData` 实例路径，按请求参数 bytePosition 升序。**不生成 `DcmDspDidSignal`**（现代信号形态列为后续工作） |
| `DcmDspDidInfo.DcmDspDidDynamicallyDefined` (bool, 必填) | `false` |
| `DcmDspDidRead/Write.DcmDspDid*SessionRef` / `*SecurityLevelRef` | 该访问类服务的 sessionRefs/securityRefs，规则同 §6.3.1 |
| `DcmDspDidControl.DcmDspDidFreezeCurrentState/ResetToDefault/ShortTermAdjustment` (bool, 必填) | `true`（0x2F 服务存在即宣称三项能力；细化到 controlOptionRecord 级列为后续工作） |
| `DcmDspDidControl.DcmDspDidControlMask` (enum, 必填) | `DCM_CONTROLMASK_NO` |
| `DcmDspData.DcmDspDataType` (enum, 必填) | §6.5 类型归一化表 |
| `DcmDspData.DcmDspDataByteSize` (int, 可选) | DOP 字节数（bitLength/8 向上取整；minmax 取 maxBytes） |
| `DcmDspData.DcmDspDataUsePort` (enum, 必填) | 默认值表 §6.6 |

#### 6.3.3 Routine / Session / Security / Reset 参数（Dcm）

| 参数 | 值来源 |
|---|---|
| `DcmDspRoutine.DcmDspRoutineIdentifier` (int, 必填) | `SEMANTIC="DATA-ID"` CODED-VALUE（§4.2）；缺失 → 整个 DcmDspRoutine 容器不生成（同 §6.4.1 规则）+ warning `odx-did-no-identifier` |
| `DcmDspRoutine.DcmDspRoutineUsed/RoutineUsePort/FncSignature` (必填) | 默认值表 §6.6 |
| `DcmDspSessionRow.DcmDspSessionLevel` (int, 必填) | `DimSession.value` |
| `DcmDspSessionRow.DcmDspSessionP2ServerMax/P2StarServerMax/SessionForBoot` (必填) | 默认值表 §6.6（§5.1：ODX 不可得） |
| `DcmDspSecurityRow.DcmDspSecurityLevel` (int, 必填) | `DimSecurityLevel.level` |
| `DcmDspSecurityRow.DcmDspSecuritySeedSize/KeySize` (int, 必填) | `DimSecurityLevel.seedBytes/keyBytes`；缺失 → 默认值表 §6.6 |
| `DcmDspSecurityRow.DcmDspSecurityDelayTime/DelayTimeOnBoot/AttemptCounterEnabled/UsePort` (必填) | 默认值表 §6.6 |
| `DcmDspSecurity.DcmDspSecurityMaxAttemptCounterReadoutTime` (float, 必填) | 默认值表 §6.6 |
| `DcmDspEcuResetRow.DcmDspEcuResetId` (int, 必填) | 该 reset subFunction 值 |
| `DcmDspEcuResetRow.DcmResponseToEcuReset` (enum, 必填) | `AFTER_RESET` |

#### 6.3.4 DTC 映射（Dem）

每个 `DimDtc` 生成一对容器：`DemEventParameter/<DtcName>` + `DemDTC/<DtcName>`，以前者的 `DemDTCRef` 指向后者。

| 参数 | 值来源 |
|---|---|
| `DemEventParameter.DemEventId` (int, 必填) | §6.7 顺序分配 |
| `DemEventParameter.DemEventAvailable/ConfirmationThreshold/EventKind/ReportingType/FFPrestorageSupported` (必填) | 默认值表 §6.6 |
| `DemEventParameter.DemOperationCycleRef` (ref, **必填 1..1**) | §6.8 操作循环规则 |
| `DemDTC.DemDtcValue` (int, 可选) | `DimDtc.troubleCode`（§4.3 已数值化） |
| `DemDTC.DemDTCFunctionalUnit` (int, 可选) | `DimDtc.functionalUnit`；缺失 → 不填 |
| `DemDTC.DemDTCSeverity` (enum, 可选) | `DimDtc.severity` 归一化匹配 `DEM_SEVERITY_*` 字面量；匹配失败 → 不填 + warning `odx-dtc-severity-unmapped` |

`DemDTCAttributes`（优先级/老化/内存目标）**不生成**——属工程策略；`DemDTC.DemDTCAttributesRef` 留空，由用户在工程内自行挂接。

#### 6.3.5 BSWMD 定义验证清单（实现 golden test 的断言基线）

| 定义 | 验证事实（来自 BSWMD 实际解析） |
|---|---|
| `DcmDspDid` | 路径含 `DcmConfigSet/DcmDsp`；MULT 0..INF；必填：DidUsed/DidIdentifier/DidUsePort + DidInfoRef |
| `DcmDspData` | MULT 0..INF；必填：DataType/DataUsePort |
| `DcmDspRoutine` | MULT 0..INF；必填：RoutineUsed/RoutineUsePort(**bool**)/RoutineIdentifier/FncSignature |
| `DcmDspSessionRow` | 父 `DcmDspSession` [1..1]；MULT 0..31；必填 4 参数 |
| `DcmDspSecurityRow` | 父 `DcmDspSecurity` [1..1]；MULT 0..31；必填 8 参数 |
| `DcmDsdService` | 父链 `DcmDsd/DcmDsdServiceTable`；MULT 1..INF；必填 3 参数 + SUB DcmDsdSubService |
| `DemEventParameter` | MULT 1..65535；必填 6 参数 + DemOperationCycleRef |
| `DemDTC` | MULT 0..65535；全部参数可选 |
| 枚举字面量 | `DcmDspDataType`: BOOLEAN/FLOAT/FLOAT_N/SINT8..32(_N)/UINT8..32(_N)/UINT8_DYN；`DcmDspSessionForBoot`: DCM_NO_BOOT 等 5 值；`DcmResponseToEcuReset`: AFTER_RESET/BEFORE_RESET；`DemEventKind`: DEM_EVENT_KIND_BSW/SWC；`DemDTCSeverity`: 4 值；`DcmDspDidControlMask`: DCM_CONTROLMASK_EXTERNAL/INTERNAL/NO |

### 6.4 通用映射规则

1. **DID 池化**：去重键 = DID 数值 identifier。0x22（读）与 0x2E（写）命中同一数值 → 一个 `DcmDspDid` 容器，读写访问按 §6.3.2 的 DcmDspDidInfo 子容器合并。identifier 缺失 → **不生成** `DcmDspDid` 容器（`DcmDspDidIdentifier` 是 BSWMD 必填参数，空值会产生非法 ECUC），该 DID 的 `DcmDsdService` 行仍生成 + warning `odx-did-no-identifier`。
2. **服务行**：每个成功映射的服务（非 Unknown）**必须** 生成 `DcmDsdService` 行并注册进服务表（具体容器见总表）——这补上 v1.24.0 以来 `DcmDsdService` 不生成的缺口。
3. **SHORT-NAME 合法化**（normative 算法）：
   - 合法字符集 `[A-Za-z0-9_]`，其余逐字符替换为 `_`；
   - 首字符非字母 → 前缀 `N_`；
   - 结果为空 → `Unnamed_<odxId 去下划线>`；
   - 截断到 128 字符；
   - 同一父容器内重名 → 追加 `_2`、`_3`…（首次出现不加后缀）。
4. **确定性**：同一份 DIM + 同一份 BSWMD 索引 → 序列化字节级一致。容器排序：先按 `definitionRef` 字典序，再按 `shortName`；参数按 BSWMD 定义序；数组输入顺序不得影响输出（映射前对 services/dtcs/dataObjects 按 `odxId` 排序）。
5. **数值格式**：整数参数十进制输出（AUTOSAR ECUC 惯例），不做 16 进制美化。

### 6.5 数据类型归一化（DOP → DcmDspDataType，枚举字面量已经 BSWMD 验证）

| ODX 输入 | `DcmDspDataType` |
|---|---|
| `A_UINT32`，bitLength = 1 | `BOOLEAN` |
| `A_UINT32`，bitLength ≤ 8 | `UINT8` |
| `A_UINT32`，bitLength ≤ 16 | `UINT16` |
| `A_UINT32`，bitLength ≤ 32 | `UINT32` |
| `A_UINT32`，bitLength > 32 或缺失 | `UINT8_N` + warning `odx-type-promotion` |
| `A_INT32` + encoding=`2C`，bitLength ≤ 8 / 16 / 32 | `SINT8` / `SINT16` / `SINT32` |
| encoding 含 `IEEE-FLOAT32` | `FLOAT` |
| `A_ASCIISTRING` / `A_UNICODE2STRING` / `A_BYTEFIELD`，codedType.kind = standard | `UINT8_N` |
| 上述三种 + codedType.kind = minmax | `UINT8_DYN` |
| 其他 `BASE-DATA-TYPE` | `UINT8_N` + warning `odx-unsupported-datatype` |

COMPU-METHOD / UNIT：Dcm BSWMD 的 `DcmDspData` 不承载缩放信息（§6.3.5 验证：无缩放参数），**不映射**；产生聚合 warning `odx-compu-not-mapped`，数据保留在 DIM 供未来代码生成使用。

### 6.6 必填参数默认值表（normative）

以下参数 BSWMD 要求必填但 ODX 无对应数据源，**必须** 按下表填默认值。每类默认值首次使用时产生一条**聚合** warning `odx-default-param-used`（同一参数定义只报一次，message 附使用次数），不得逐实例刷屏。

| 参数（容器/参数） | 默认值 | 依据 |
|---|---|---|
| `DcmDspSessionRow/DcmDspSessionP2ServerMax` | `0.05` | ISO 14229 默认 P2=50ms |
| `DcmDspSessionRow/DcmDspSessionP2StarServerMax` | `5.0` | ISO 14229 默认 P2\*=5000ms |
| `DcmDspSessionRow/DcmDspSessionForBoot` | `DCM_NO_BOOT` | 非刷写会话 |
| `DcmDspSecurityRow/DcmDspSecuritySeedSize`（DIM 缺失时） | `4` | 常见 4 字节种子 |
| `DcmDspSecurityRow/DcmDspSecurityKeySize`（DIM 缺失时） | `4` | 常见 4 字节密钥 |
| `DcmDspSecurityRow/DcmDspSecurityDelayTime` / `DelayTimeOnBoot` | `10.0` | 工程常规 10s |
| `DcmDspSecurityRow/DcmDspSecurityAttemptCounterEnabled` | `false` | 保守（不启用计数锁定） |
| `DcmDspSecurityRow/DcmDspSecurityUsePort` | `USE_ASYNCH_FNC` | C 函数接口惯例 |
| `DcmDspSecurity/DcmDspSecurityMaxAttemptCounterReadoutTime` | `0.0` | 不启用读出延时 |
| `DcmDspDid/DcmDspDidUsed` | `true` | 导入即启用 |
| `DcmDspDid/DcmDspDidUsePort` | `USE_DATA_ELEMENT_SPECIFIC_INTERFACES` | 该 BSWMD 唯一面向数据元素的取值 |
| `DcmDspData/DcmDspDataUsePort` | `USE_DATA_SYNCH_CLIENT_SERVER` | UDS 同步 C/S 惯例 |
| `DcmDspRoutine/DcmDspRoutineUsed` / `DcmDspRoutineUsePort` | `true` / `true` | 导入即启用 + RTE 端口 |
| `DcmDspRoutine/DcmDspRoutineFncSignature` | `ROUTINE_FNC_NORMAL` | 非常规代理 |
| `DcmDspDidInfo/DcmDspDidDynamicallyDefined` | `false` | 静态 DID |
| `DcmDspDidControl` 三能力布尔 | `true` | §6.3.2 |
| `DcmDspDidControl/DcmDspDidControlMask` | `DCM_CONTROLMASK_NO` | 无控制掩码 |
| `DcmDspEcuResetRow/DcmResponseToEcuReset` | `AFTER_RESET` | 复位后响应惯例 |
| `DcmDsdService/DcmDsdServiceUsed`、`DcmDsdSubService/DcmDsdSubServiceUsed` | `true` | 导入即启用 |
| `DemEventParameter/DemEventAvailable` | `true` | 导入即启用 |
| `DemEventParameter/DemEventConfirmationThreshold` | `1` | 单次确认 |
| `DemEventParameter/DemEventKind` | `DEM_EVENT_KIND_SWC` | 应用层事件（现行实现同值） |
| `DemEventParameter/DemEventReportingType` | `STANDARD_REPORTING` | 标准上报 |
| `DemEventParameter/DemFFPrestorageSupported` | `false` | 不预存冻结帧 |

### 6.7 DemEventId 顺序分配（normative）

ODX 无事件 ID 概念。规则：DTC 按 `troubleCode` **升序**排序后从 **1** 连续分配；被跳过的无效 DTC（§4.3）不占号。该规则保证同输入同分配（确定性 §6.4.4），但与工程已有事件 ID 体系可能冲突——冲突由三向合并的 `conflict` 分类暴露给用户，不在映射层特殊处理。

### 6.8 DemOperationCycleRef 规则（normative）

- 映射器生成的引用目标固定为 `/Dem/DemGeneral/DemOperationCycle_1`。
- 全新 Dem 模块：在 `DemGeneral` 下生成 `DemOperationCycle_1`（`DemOperationCycleId = 1`）。
- 合并进已有 Dem 模块：若工程已有其他命名的操作循环，引用将悬空——preview 步骤 **必须** 对合并结果运行现有 ref-dest 校验，悬空引用以 warning `odx-dem-cycle-ref-check` 进导入报告，由用户在导入后改挂（不阻塞提交）。

---

## 7. Section ④：三向对比 + Provenance

### 7.1 Provenance Manifest

**路径**：`<projectDir>/.autosarcfg/odx-import-manifest.json`（新约定：`.autosarcfg/` 为工具私有状态目录）。
**Schema**（version 必须 = 1；未知 version → 视为损坏）：

```json
{
  "version": 1,
  "sourceFile": "Demo_Cdd.odx-d",
  "sourceHash": "sha256:<hex>",
  "variant": { "odxId": "_x", "shortName": "Demo", "kind": "BASE-VARIANT" },
  "importedAt": "2026-09-02T12:34:56.789Z",
  "entries": [
    {
      "module": "Dcm",
      "containerPath": "/Dcm/DcmConfigSet/DcmDsp/DcmDspDid/DID_F186",
      "odxId": "_123",
      "contentHash": "sha256:<hex>"
    }
  ]
}
```

- `contentHash`：该容器 AST 经**规范化序列化**（属性序固定、空白固定——复用现有序列化器输出）的 SHA-256。规范化函数 `hashContainerForProvenance(c: ArxmlContainer): string` 在 `threeWayMerge.ts` 导出，preview/commit/manifest 三处共用同一实现。
- 读取失败/JSON 损坏/version 不符 → 按"无历史"处理（全部首次导入语义）+ warning `odx-manifest-ignored`。
- manifest 有条目但 workspace 已无该容器 → 惰性清除（不写回，下次 commit 时落盘）。
- 每次成功 commit **必须** 原子重写 manifest（`writeAtomic` 同款 tmp+rename）。

### 7.2 六分类规则（`classifyImportRows`，纯函数）

输入：`manifestEntries`（base）、`currentContainers`（workspace 现值，按 path → hash）、`incomingContainers`（新映射结果，按 path → hash）。
每行输出：`{ path, module, shortName, category, defaultDecision, detail? }`。

| # | 条件（base / current / incoming 三者哈希关系） | category | defaultDecision |
|---|---|---|---|
| 1 | incoming 有，base 无 | `added` | `import` |
| 2 | base 有，current = base，incoming ≠ base | `updated`（ODX 侧变更，本地未动） | `import` |
| 3 | base 有，current ≠ base，incoming = base | `locally-modified`（本地改过，ODX 没变） | `keep-local`（不列冲突，仅信息展示） |
| 4 | base 有，current ≠ base，incoming ≠ base，current ≠ incoming | `conflict` | `keep-local`，**必须** 用户显式改选才可 `import` |
| 5 | base 有，current ≠ base，incoming ≠ base，current = incoming | `converged`（两边改到一致） | `import`（无操作，仅信息） |
| 6 | base 有，incoming 无 | `removed-in-odx` | `keep-local`（用户显式改选 `delete` 才删） |
| 7 | current 有，base 无（手工容器） | **不产生行** | 永不触碰 |

`defaultDecision` 取值：`import`（采用 ODX 版本）/ `keep-local`（保留现状）/ `delete`（删除本地）。用户决策列表覆盖 default 后进 commit。

### 7.3 合并与提交（`mergeModuleThreeWay`，纯函数）

```typescript
export function mergeModuleThreeWay(args: {
  readonly existing: ArxmlModule | null;      // workspace 现值（无 → null）
  readonly incoming: ArxmlModule;             // 新映射结果
  readonly decisions: ReadonlyMap<string, 'import' | 'keep-local' | 'delete'>; // 按 path
}): ArxmlModule;
```

规则：`existing=null` → 直接返回 `incoming`（首次导入快路径）。否则按 path 逐容器应用决策；未出现在 decisions 的 path 用 §7.2 default。结果容器排序遵循 §6.4.4。

**提交路径**（main 进程）：
1. 前置检查：renderer 请求中的 dirtyDocPaths 与目标模块文档路径相交 → 硬错误 odx-target-dirty（向导第①步检查并提示先保存；main 进程自身不维护 renderer dirty 状态）。previewHash 必须与 preview 返回值一致。若同一模块短名命中多个 value ARXML 文档 → 硬错误 odx-module-ambiguous。
2. 重算（§7.4 确定性）→ 得 `merged: ArxmlModule`。
3. 落盘策略：复用 Sprint 14 `overwrite-module` patch op（`ImportPatchOp` 封闭集合**零扩展**）——merged 模块作为 `replacement`，经现有 `applyPatchesToDocument` 应用到内存文档后，由现有保存链路原子写盘；**或**（工程尚无该模块文档时）新建 `<projectDir>/<Module>_EcucValues.arxml` 并注册进工程 manifest（复用现有模块创建机制 + `resolveCollisionFilename` 命名）。
4. 成功后：重写 manifest（§7.1）→ 通知 renderer 重载受影响文档（复用 bug7 reload 路径）→ dirty 集合保持干净。

### 7.4 确定性重算（preview ≡ commit）

`importCommit` **不得** 接收 preview 的容器内容；只接收 `{ odxPath, variantId, decisions[] }`。main 重新执行 解析→映射→分类，并要求重算的每行哈希与 preview 时一致；不一致 → `odx-commit-mismatch`（防御 ODX 文件在两次调用间被改写）。决策按 path 应用到重算结果上。

---

## 8. Section ⑥⑦：staging 导出与 xlsx 迁移

### 8.1 `dimToDiagnosticExtract.ts`（新，纯函数）

```typescript
export function dimToDiagnosticExtract(args: {
  readonly dim: Dim;
  readonly bswmdIndex: BswmdDefIndex;
}): { readonly demContent: string; readonly dcmContent: string };
```

- 复用 §6 映射器产出 `ArxmlModule`，各自包进 `DiagExtract` AR-PACKAGE envelope（沿用现有 envelope 形态 + `AUTOSAR_4-4.xsd` schemaLocation），经现有序列化器输出字符串。
- 输出因此自动获得标准 ECUC 结构 + 正确 definition-ref（修复被废止 plan 的 Task 3/6）。

### 8.2 老 IPC 重接

- `odx:importDiagnosticExtract` 契约（请求/响应字段、文件名 `Dem_Extract.arxml`/`Dcm_Extract.arxml`、原子写+快照回滚）**不变**；handler 内部改走 `core/odx/` 解析层 → `dimToDiagnosticExtract`。
- 该 handler 的 BSWMD 索引构建失败时**不**硬错误：staging 导出允许降级（definition-ref 缺失时省略该属性 + warning 进响应 stats）。与工程导入路径的 `odx-bswmd-not-loaded` 硬错误形成有意差异——staging 的消费者是外部工具，工程导入的消费者是本工具树，容错标准不同。

### 8.3 xlsx Dcm 管线迁移

- `dcmConfigPipeline.ts` 的 ODX 数据源从 `odxToDiagnosticExtract` 改为 DIM。调用方式**固定为 main 进程内直接调用** `core/odx/` 解析层（`dcmConfigHandler` 与导入 handler 同在 main，DIM 不过 IPC——不新增任何 IPC 通道）。
- `validateOdxLinkage` 针对 DIM 重写：校验语义不变（xlsx 服务行引用的 DID/服务在 ODX 中存在），数据源换为 `dim.services`/`dim.dataObjects`。
- 迁移完成、全部测试转绿后，删除 `odxToDiagnosticExtract.ts` 与其测试文件。

---

## 9. Section ⑤：IPC 契约与向导 UI

### 9.1 新 IPC 通道（additive，不动现有契约）

```typescript
// shared/types/odx-import.ts（新文件；不进 shared/types/odx.ts——viewer 契约不动）
export interface OdxImportPreviewRequest {
  readonly odxPath: string;
  readonly dirtyDocPaths: readonly string[];
  readonly variantId?: string;        // 协商规则见下方"变体协商"
}
export type OdxImportPreviewResponse =
  | { readonly ok: true; readonly value: OdxImportPreview }
  | { readonly ok: false; readonly error: OdxImportError };

export interface OdxImportPreview {
  readonly variants: readonly OdxVariantInfo[];   // >1 时向导显示变体步骤
  readonly selectedVariant?: OdxVariantInfo;      // 已解析成功时出现
  readonly rows: readonly OdxImportRow[];         // §7.2 六分类行（不含 locally-modified/converged 之外的手工容器）
  readonly warnings: readonly DimWarning[];
  readonly previewHash: string;
  readonly stats: { readonly services: number; readonly dids: number; readonly dtcs: number; readonly sessions: number; readonly securityLevels: number };
  readonly targetModules: { readonly dcm: OdxTargetModuleInfo; readonly dem: OdxTargetModuleInfo };
}
export interface OdxImportRow {
  readonly path: string;              // "/Dcm/DcmConfigSet/DcmDsp/DcmDspDid/DID_F186"（含完整容器脊柱）
  readonly module: 'Dcm' | 'Dem';
  readonly shortName: string;
  readonly category: 'added' | 'updated' | 'locally-modified' | 'conflict' | 'converged' | 'removed-in-odx';
  readonly defaultDecision: 'import' | 'keep-local' | 'delete';
  readonly conflictDetail?: { readonly localHash: string; readonly incomingHash: string };
}
export interface OdxTargetModuleInfo {
  readonly exists: boolean;           // 工程已有该模块文档？
  readonly docPath?: string;          // 现有文档路径
  readonly dirty: boolean;            // dirty → 向导第①步即拦截
}

export interface OdxImportCommitRequest {
  readonly odxPath: string;
  readonly variantId: string;
  readonly dirtyDocPaths: readonly string[];
  readonly previewHash: string;
  readonly decisions: readonly { readonly path: string; readonly decision: 'import' | 'keep-local' | 'delete' }[];
}
export type OdxImportCommitResponse =
  | { readonly ok: true; readonly value: { readonly applied: number; readonly kept: number; readonly deleted: number; readonly manifestPath: string } }
  | { readonly ok: false; readonly error: OdxImportError };

export type OdxImportError =
  | { readonly kind: 'read-failed' | 'odx-malformed' | 'odx-too-large'; readonly message: string }
  | { readonly kind: 'odx-no-variant' | 'odx-variant-not-found' | 'odx-inheritance-cycle'; readonly message: string }
  | { readonly kind: 'odx-bswmd-not-loaded'; readonly module: 'Dcm' | 'Dem'; readonly message: string }
  | { readonly kind: 'odx-target-dirty'; readonly docPath: string; readonly message: string }
  | { readonly kind: 'odx-module-ambiguous'; readonly module: 'Dcm' | 'Dem'; readonly message: string }
  | { readonly kind: 'odx-commit-mismatch'; readonly message: string }
  | { readonly kind: 'write-failed'; readonly message: string; readonly rolledBack: boolean };
```

**变体协商（normative）**：
- 文件只有 1 个可导入变体 → 忽略 `variantId`，直接解析，`selectedVariant` 必填返回。
- 文件有多个变体且 `variantId` 缺省 → 返回 `ok: true`，`value = { variants: 全部, selectedVariant: undefined, rows: [], warnings: [], stats: 全 0, targetModules }`（此时**不执行**解析/映射）；向导据此显示变体步骤，用户选择后带 `variantId` 重发。
- `variantId` 存在但不存在于文件 → `ok: false`，`odx-variant-not-found`。

注册点：`src/main/ipc/register.ts`（`ODX_IMPORT_PREVIEW` / `ODX_IMPORT_COMMIT`），preload 桥 `src/preload/index.ts`（`importOdxPreview` / `importOdxCommit`）。

### 9.2 向导 UI（`src/renderer/components/OdxImportWizard/`）

状态机（`useOdxImportStore`，zustand slice，独立于 useArxmlStore）：

```
idle → picking → parsing → [variant-select] → preview → committing → done
                  │              │                 │
                  └→ error ──────┴─────────────────┘（任何一步失败 → error 页，可返回）
```

- **picking**：复用 `odx:open-with-default`。
- **preview**：复用 `DiffTable` 渲染行 + 新增分类徽章列（added=绿 / updated=蓝 / locally-modified=灰 / conflict=橙 / converged=灰 / removed-in-odx=红）；warnings 可折叠面板（按 code 分组计数 + 明细）；`conflict` 行默认 `keep-local` 且必须逐条显式改选才能 import（UI 防呆：conflict 行的 "采用 ODX" 需二次确认）。
- **done**：统计 + manifest 路径 + "Open in Workspace"（复用现有成功弹窗模式）。
- 入口：AppHeader 新菜单项「Import ODX-D…」（`btn-import-odx-full`）；现有「Import Diagnostic Extract」保留（staging 路径，§8.2）。
- i18n：`src/shared/i18n*/odx-import.ts` 新文件，中英双语。

---

## 10. Section ⑧：测试策略

| 层 | 文件 | 关键用例（必须全部存在） |
|---|---|---|
| 解析层 | `core/odx/__tests__/odxDocument.test.ts` | 真实 `Demo_Cdd.odx-d` 回归基线：95 服务 / 99 DTC / 167 DOP 计数；ID 索引完整性；importableVariants=[1 个 BASE-VARIANT] |
| 继承 | `core/odx/__tests__/layerResolver.test.ts` | 手工 fixture：三层链 PROTOCOL→BASE→ECU；同 ID 子层覆盖；NOT-INHERITED 剔除；成环硬错误；unresolved parent → warning |
| DOP | `core/odx/__tests__/dopResolver.test.ts` | COMPU-METHOD 各类别（含不支持的 RAT-FUNC → warning）；MIN-MAX-LENGTH；TEXTTABLE 多 scale |
| DIM | `core/odx/__tests__/dimBuilder.test.ts` | SID/subFunction 提取（0x80 屏蔽）；serviceClass 归一化全表；会话去重；安全配对/落单；DTC 数值化边界（0xFFFFFF 合法 / 0x1000000 拒绝） |
| 映射 | `core/odx/__tests__/mapDimToEcuc.test.ts` | golden AST（DIM fixture → 期望 ArxmlModule）；DID 池化（0x22+0x2E 同 ID → 1 容器）；SHORT-NAME 合法化全规则（非法字符/数字开头/空/128 截断/重名后缀）；确定性（同输入两次 → 深等 + 序列化字节等）；BSWMD 缺定义 → warning 不悬空 |
| 三向 | `core/odx/__tests__/threeWayMerge.test.ts` | §7.2 七行条件全覆盖；决策覆盖 default；首次导入（existing=null）；manifest 损坏/缺失；哈希稳定性 |
| IPC | `main/ipc/__tests__/odxImportPreviewHandler.test.ts` / `odxImportCommitHandler.test.ts` | 信封全 kind；dirty 拦截；commit 重算 mismatch；原子写回滚 |
| staging | `core/odx/__tests__/dimToDiagnosticExtract.test.ts` | 老契约回归（文件名/envelope）+ 新形态断言（标准 ECUC + 正确 definition-ref） |
| UI | `OdxImportWizard/__tests__/` | 状态机迁移；conflict 二次确认；徽章渲染；i18n key 齐全 |
| E2E | Playwright | Demo_Cdd 全导入 → 工程树出现 DcmDspDid 容器 → 参数编辑器显示 identifier 数值 |

- TDD：RED → GREEN → IMPROVE；覆盖率 ≥80%。
- 真实 fixture 预期计数若与实现有出入，以实现反推修正 spec §10 表格并在 PR 描述中说明（fixture 事实优先）。

## 11. Warning code 全集（封闭集合）

`odx-unresolved-parent-ref` / `odx-unsupported-compu` / `odx-unsupported-datatype` / `odx-type-promotion` / `odx-compu-not-mapped` / `odx-unknown-service-class` / `odx-dtc-code-invalid` / `odx-dtc-severity-unmapped` / `odx-did-no-identifier` / `odx-session-value-conflict` / `odx-security-unpaired` / `odx-comparam-external` / `odx-bswmd-def-missing` / `odx-manifest-ignored` / `odx-service-sid-invalid` / `odx-default-param-used`（聚合，§6.6）/ `odx-routine-params-not-mapped` / `odx-memory-service-not-mapped` / `odx-dem-cycle-ref-check` / `odx-element-skipped`（兜底，message 必带原因）

新增 code 必须同步本节与 i18n。

## 12. 实施阶段（供 writing-plans 细化）

| Phase | 内容 | 出口标准 |
|---|---|---|
| 1 | `core/odx/` 解析层 + DIM（§3-5） | Demo_Cdd 全量解析测试绿；viewer 通道零影响 |
| 2 | 映射器 + BSWMD 索引 + staging emitter 重接（§6、§8.1-8.2） | staging 输出标准 ECUC；老 IPC 契约测试绿 |
| 3 | manifest + 三向分类/合并 + preview/commit IPC（§7、§9.1） | 六分类表驱动测试绿；确定性 mismatch 防御生效 |
| 4 | 向导 UI + workspace 重载（§9.2） | E2E 通过 |
| 5 | xlsx 管线迁移 + 删除 `odxToDiagnosticExtract.ts`（§8.3） | 全仓无旧 mapper 引用；回归全绿 |

依赖序：1→2→3→4→5 严格线性（2 依赖 1 的 DIM；3 依赖 2 的映射；4 依赖 3 的 IPC；5 依赖 2 的 DIM 数据源就绪）。

## 13. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 其他 OEM 的 ODX 文件结构差异（本设计以 Vector CANdelaStudio 15 + ISO 22901-1 2.2.0 为基准） | warnings 兜底不致命；新形状进 `odx-element-skipped` 报告；后续按真实文件迭代支持矩阵 |
| DIM 在超大 ODX（>10MB）下内存占用 | 32 MiB cap 不变；解析层流式化列为后续工作，本 spec 不处理 |
| Sprint 14 `DiffTable` 与六分类行的语义差距（它面向模块级 2-way） | preview 行自带 category/decision，DiffTable 仅作渲染壳；不改动其 store 契约 |
| manifest 与工程树长期漂移（用户手删容器） | 惰性清除 + 每次导入重新验证哈希，漂移自动收敛 |


