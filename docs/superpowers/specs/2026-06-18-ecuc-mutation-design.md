# ECUC Add/Delete Design Spec

> **For agentic workers:** 本 spec 描述 ECUC ARXML parameter / container 增删的设计决策。
> 配套 plan: `docs/superpowers/plans/2026-06-18-ecuc-mutation.md`。
> 设计日期: 2026-06-18。状态: **approved** (2026-06-18 user 拍板)。

---

## 1. 摘要 (TL;DR)

为 claude-AutosarCfg v1.0.0 增加 **ECUC container / parameter 增删** 能力。

- **加**: TreeNode 右键菜单 → `Add sub-container` / `Add parameter` / `Add reference` → BSWMD-driven picker → 选中即 add（immutable update）
- **删**: TreeNode 右键菜单 → `Delete container` → 若有 reference 指向此 container 弹 3 选项 cascade dialog（cancel / only / cascade）→ 选中即 delete
- ParamEditor footer 加 `+ Add parameter` / `+ Add reference` 按钮；每个 param row 末加 × 删除按钮

**核心承诺**：

- BSWMD 是 schema 唯一来源（无 BSWMD → 硬错误，不 bypass）
- 所有 mutation 走 immutable spread（与 `updateParam` 一致，reference-equality 短路）
- Combined Tree View 自动支持（双层 dispatch，沿用 `findByPathMultiDoc` + `stripCombinedPrefix`）
- 错误用 `Result<T, MutationError>`（6 个 kind），store action 消化后调 `setError()`
- 不引入新 IPC、不改 `ArxmlElement` 核心类型

---

## 2. 动机与背景

### 2.1 现状

claude-AutosarCfg v1.0.0 已发布：

- READ: `ParamEditor` + 7 种 mode editor（String/Integer/Float/Boolean/Enum/Multiline/Reference）
- UPDATE: `useArxmlStore.updateParam(path, key, value)` line 183
- 5 baseline fixtures (CanIf / EcuC / Pdu / Com / Adc) 100% round-trip 通过
- Combined Tree View (Sprint 13 Stage 3.5) 支持多 doc 虚拟合成
- 9 个 validation kind

### 2.2 缺口

**没有任何 "添加" 或 "删除" ECUC container / parameter 的逻辑**:

- `useArxmlStore` 只有 `addDocument`（doc-level replace/append），无 `addContainer` / `addParameter`
- 无 `deleteContainer` / `deleteParameter` / `removeDocument` 仅整 doc 删除
- BSWMD 只用作 validation 来源，不作为 picker 驱动

**核心缺失 → 工具对真实工程几乎无用**：

- 工程师日常 80% 工作是 "加 1 个 container / 改几个 param / 删掉不要的"，没有增删只能做一半

### 2.3 用户场景

```
场景 1: 新增 BSW 配置
  - 工程师从 BSWMD 选 Can module
  - 选 CanIfConfigSet 子 container
  - 选 BaudRate parameter (default 500000)
  - 加 CanIfRxPduCfg sub-container

场景 2: 清理 dead code
  - 删掉不再使用的 CanNmConfig sub-container
  - 系统检查 12 个 reference 指向此 container
  - 工程师决定 cascade 删 3 个不需要的 ref，保留 9 个
  - → 3 选项 dialog 派上用场

场景 3: 调整 multiplicity
  - 已知 CanIfRxPduCfg 上限是 8 (upperMultiplicity=8)
  - 已加到 8 个 → picker 灰显，UI 提示 "max reached (8/8)"
  - 删 1 个后又能加
```

### 2.4 Sprint 14 plan 覆盖度

| Plan                                    | 是否覆盖 add/delete                                |
| --------------------------------------- | -------------------------------------------------- |
| A. ECUC ARXML Import (Lazy Merged View) | ❌ 只解决多 file 合并读入                          |
| B. Script Engine (v1.1.0)               | ⚠️ 用户可写 JS 改 param，门槛高，**不是 GUI CRUD** |
| C. BSWMD → ECUC模块选择                 | ❌ 只生成 skeleton，**不**支持后续增删             |

→ 本 spec 独立 ship，**不**依赖 Sprint 14 plan 中尚未存在的 `BswmdDocument.disabledModules` / `getActiveModules`。

---

## 3. 范围

### 3.1 设计目标 (In-Scope)

| #   | 目标                                                                              |
| --- | --------------------------------------------------------------------------------- |
| G1  | 用户能从 BSWMD-driven picker 选 1 个 sub-container / parameter / reference 加入   |
| G2  | 用户能从 TreeNode 右键菜单删 1 个 container                                       |
| G3  | ParamEditor footer 加 `+ Add parameter` / `+ Add reference` 按钮；行末 × 删除按钮 |
| G4  | 删 container 时若有 reference 指向，弹 3 选项 cascade dialog                      |
| G5  | 所有 mutation 走 immutable update + reference-equality 短路                       |
| G6  | Combined Tree View 自动支持（双层 dispatch 沿用 `updateParam` 模式）              |
| G7  | 每次 mutation 后无条件 revalidate（与 `updateParam` 一致）                        |
| G8  | 5 baseline fixture round-trip mutation 100% 通过                                  |

### 3.2 非目标 (Out-of-Scope)

| #   | 不做                                                      | 理由                                                    |
| --- | --------------------------------------------------------- | ------------------------------------------------------- |
| N1  | undo/redo                                                 | 独立 feature，可加但不属本 spec                         |
| N2  | drag-and-drop reorder                                     | 不在任何 plan                                           |
| N3  | 剪贴板 copy/paste                                         | 不在任何 plan                                           |
| N4  | bulk delete via 区域选择                                  | 不在任何 plan                                           |
| N5  | reference autocomplete                                    | picker 只列 BSWMD 合法项，**不**做"已存在 ref 目标"补全 |
| N6  | 修改 `BswmdDocument.disabledModules` / `getActiveModules` | 属 Sprint 14 BSWMD-to-ECUC plan                         |
| N7  | 修改 `ArxmlElement` 核心类型                              | immutable spread 足够，扩 type 会破坏既有 test          |
| N8  | 新 IPC channel                                            | 内存操作即可                                            |
| N9  | Hard E2E requirement                                      | 不强求（optional Playwright spec 之后补）               |

---

## 4. 决策记录

### 4.1 决策 1 — 无 BSWMD 时的行为

**问题**: 用户想加 param/container，但 BSWMD 未加载 / 未定义此 module

**选项**:

- (A) 硬错误 (选) — 弹 "需要先加载 BSWMD" 错误，提示用户加载
- (B) 自由补名 + 软警告 — 用户可手输 param name + 选 type，validation 不会高亮手输项
- (C) 自动 prompt 加载 BSWMD — 用户点 + 时自动弹文件选择器

**决策**: (A) 硬错误

**理由**:

- BSWMD 是 schema 唯一真相来源；freeform 必然导致 ARXML 非法 → 与既有 validation 流程冲突
- 加载 BSWMD 已是用户熟悉的流程（FileListTab "Load BSWMD" 按钮）
- 强制 BSWMD 加载保证后续 validation 行为一致

**影响范围**:

- picker 在调 `listAllowedSubElements` 前先检查 moduleDef 是否存在 → 不存在则弹错
- core 函数 `addContainer` / `addParameter` 也校验（双层防御）

### 4.2 决策 2 — 删有引用的 container

**问题**: 删 container 时若有 N 个 reference 指向它

**选项**:

- (A) 3 选项 ConfirmDialog (选) — `[Cancel] [Only delete] [Cascade]`，默认聚焦 "Only delete"
- (B) 默认不级联 + 错误提示 — 弹警告 + 单一 "确认删除"；点了之后若有 ref 则取消
- (C) 直接 disable 删除按钮 + tooltip "存在 N 个引用，请先手动删除"

**决策**: (A) 3 选项 ConfirmDialog

**理由**:

- 用户决策最明确（取消 / 留下 dangling / 一并清干净）
- 借鉴 EB tresos Resolve Conflicts 对话框
- 9 个引用 + 3 个不引用，**不**该让用户手动一个个删 9 个

**"Only delete" 行为**:

- 删 container，**不**动 reference
- 留下 dangling reference → 既有 validation 会标红（`ref-unresolved` kind）
- UI 在 dangling ref 上显示 "unresolved" 标签
- 用户的责任是去修这些 ref

**"Cascade" 行为**:

- 删 container + 同时删所有 reference param
- 走同一个 `core.removeParameter` helper（统一代码路径）

### 4.3 决策 3 — Multiplicity 边界

**问题**: BSWMD 的 `lowerMultiplicity` / `upperMultiplicity` 怎么强制

**决策**:

- **Add 时**: 若 `current >= upper` → picker 灰显（带 tooltip "max reached (3/3)"）；core 函数二次校验（race condition 兜底）
- **Delete 时**: 若 `current <= lower` → core 函数返回 `multiplicity-floor` 错误，**不**弹"是否继续"对话框
  - 理由：floor violation 是绝对禁止的（schema 要求至少 N 个），无模糊地带
- Reference param 的 multiplicity 在 add/remove 时**不**单独校验（与既有 validation 行为一致）

### 4.4 决策 4 — Picking 来源

**问题**: Picker 是单选还是多选

**决策**: **单选 + Done 模式**（不做多选）

**理由**:

- 多选需要状态机（哪些已选 / 选几个 / 提交时排序）→ 复杂度高
- 一次加 N 个 container 的场景少（用户通常一个一个加，确认下 BSWMD 名字）
- 单选更可预测（点哪个就是哪个）

### 4.5 决策 5 — Cascade confirm 复用 vs 新建

**问题**: 3 选项 cascade 复用现有 `ConfirmDialog` 还是新建

**决策**: **新建** `CascadeConfirmDialog.tsx`

**理由**:

- 现有 `ConfirmDialog` 的 `ConfirmChoice = 'continue' | 'discard' | 'saveAndProceed'` 是 dirty-guard 专用
- 复用会污染语义（"discard" 在 cascade context 下意义不同）
- 新建可独立演化（未来加 4 选项不影响 dirty-guard）
- 复用 visual shell pattern（portal + backdrop）但不复用组件

---

## 5. Architecture（5 层）

```
┌──────────────────────────────────────────────────────────┐
│ core/arxml/mutation.ts        NEW    纯函数, Result<T, MutationError> │
│ core/project/bswmd.ts         EXTEND  + getContainerDefByPath / listContainerParams │
│ renderer/store/useArxmlStore  EXTEND  + 4 actions + picker state │
│ renderer/components/          NEW     ContextMenu / BswmdPickerDialog / CascadeConfirmDialog │
│ renderer/components/          EXTEND  TreeNode / Tree / ParamEditor │
│ shared/i18n.ts                EXTEND  + 15 keys (mutation.* / confirm.cascade.*) │
└──────────────────────────────────────────────────────────┘
```

### 5.1 Core layer 签名

```ts
// core/arxml/mutation.ts
export type MutationError =
  | { kind: 'path-not-found'; path: string }
  | { kind: 'name-conflict'; shortName: string }
  | { kind: 'multiplicity-exceeded'; path: string; upper: number; current: number }
  | { kind: 'multiplicity-floor'; path: string; lower: number; current: number }
  | { kind: 'no-bswmd-for-module'; modulePath: string }
  | { kind: 'invalid-param-type'; key: string; expected: ParamKind };

export type AllowedSubElement = {
  readonly kind: 'container' | 'parameter' | 'reference';
  readonly shortName: string;
  readonly displayLabel: string;
  readonly multiplicity: { lower: number; upper: number | 'infinite'; current: number };
  readonly disabled: boolean;
  readonly disabledReason?: 'at-max' | 'no-type-info';
};

export function listAllowedSubElements(
  moduleDef: BswModuleDef,
  containerDef: ContainerDef | null,
  currentContainer: ArxmlContainer | ArxmlModule,
): readonly AllowedSubElement[];

export function addContainer(
  doc: ArxmlDocument,
  parentPath: string,
  shortName: string,
  moduleDef: BswModuleDef,
  containerDef: ContainerDef,
): Result<ArxmlDocument, MutationError>;

export function removeContainer(
  doc: ArxmlDocument,
  containerPath: string,
  cascade: boolean,
): Result<ArxmlDocument, MutationError>;

export function addParameter(
  doc: ArxmlDocument,
  containerPath: string,
  paramDef: ParamDef,
  moduleDef: BswModuleDef,
): Result<ArxmlDocument, MutationError>;

export function removeParameter(
  doc: ArxmlDocument,
  containerPath: string,
  paramKey: string,
): Result<ArxmlDocument, MutationError>;

export function findReferencesTo(
  documents: readonly { readonly doc: ArxmlDocument; readonly filePath: string }[],
  targetPath: string,
): readonly {
  readonly filePath: string;
  readonly containerPath: string;
  readonly paramKey: string;
}[];
```

### 5.2 Store actions（4 个）

```ts
// useArxmlStore 新增
addContainer: (parentPath: string, shortName: string) => void;
deleteContainer: (containerPath: string) => void;  // 内部弹 cascade dialog
addParameter: (containerPath: string, paramShortName: string) => void;
deleteParameter: (containerPath: string, paramKey: string) => void;

// Picker state
bswmdPicker: { open: boolean; parentPath: string | null; kind: 'container' | 'parameter' | 'reference' | null };
openBswmdPicker: (target: { parentPath: string; kind: 'container' | 'parameter' | 'reference' }) => void;
closeBswmdPicker: () => void;
```

### 5.3 UI 组件

| 组件                       | 类型   | 说明                                                      |
| -------------------------- | ------ | --------------------------------------------------------- |
| `ContextMenu.tsx`          | NEW    | portal-based 右键菜单，a11y 完整（role/arrow nav/Esc）    |
| `BswmdPickerDialog.tsx`    | NEW    | BSWMD-driven picker，单选 + Done，搜索框                  |
| `CascadeConfirmDialog.tsx` | NEW    | 3 选项 cascade dialog，列引用路径，默认聚焦 "Only delete" |
| `TreeNode.tsx`             | EXTEND | 加 `onContextMenu` prop                                   |
| `Tree.tsx`                 | EXTEND | 顶层转发 onContextMenu 到 ContextMenu                     |
| `ParamEditor.tsx`          | EXTEND | footer 加 + / + 按钮；行末 × 按钮                         |

### 5.4 Combined Tree View 兼容

所有 4 个 mutation action 走与 `updateParam` 相同的双层 dispatch：

```ts
// 模板
mutation: (path: string, ...args) => void {
  if (state.viewMode === 'combined') {
    const hit = findByPathMultiDoc(state.documents, state.documentPaths, path);
    if (!hit) return;
    const innerPath = stripCombinedPrefix(path, hit.filePath);
    const result = coreMutation(hit.doc, innerPath, ...args);
    if (!result.ok) { setError(...); return; }
    // rebuild documents + displayDoc + dirtyPaths + validation
  } else {
    // single-mode dispatch
  }
}
```

这样新加 4 个 action 都自动支持 combined mode。

---

## 6. 数据流

### 6.1 Add Container

```
[用户右键 TreeNode on container X]
    ↓ onContextMenu(path, kind='container')
[ContextMenu 弹出]  ── 选 "Add sub-container" ──▶  openBswmdPicker(parentPath, kind='container')
    ↓ store.bswmdPicker.open = true
[BswmdPickerDialog mount]
    ↓ 调 listAllowedSubElements(moduleDef, containerDef, currentContainer)
[渲染 picker list]
   - 灰显：已达 upperMultiplicity
   - 灰显：类型不可解析
   - 可点：正常 ContainerDef
    ↓ 用户点 "CanIfBufferCfg"
[store.addContainer(parentPath, 'CanIfBufferCfg')]
    ↓ 内部调 core.addContainer
    ↓ 校验：name-conflict? multiplicity? path-not-found?
[Result.ok]    → set + revalidate
[Result.fail]  → setError(t(locale, 'mutation.error.<kind>'))
    ↓
[TreeNode 自动重渲染（displayDoc 已被 store 重算）]
```

### 6.2 Delete Container（带 reference cascade）

```
[用户右键 TreeNode on container X]
    ↓ 选 "Delete container"
[store.deleteContainer(path)]
    ↓ 调 core.findReferencesTo(documents, path)
    ↓
  ┌─ 找到 0 个引用 ─────────────────────────────────────┐
  │ 直接 removeContainer(doc, path, false)              │
  │ set({ documents, dirtyPaths, validationErrors })    │
  └─────────────────────────────────────────────────────┘
    ↓
  ┌─ 找到 N>0 个引用 ────────────────────────────────────┐
  │ 不动 store，先弹 CascadeConfirmDialog                │
  │ 标题："Delete 'CanIfBufferCfg'?"                     │
  │ 内容：列 N 个引用 (filePath:containerPath:paramKey)   │
  │ 按钮：[Cancel (default)] [Only delete] [Cascade]     │
  │                                                       │
  │ 用户选：                                              │
  │   Cancel    → no-op                                   │
  │   Only      → removeContainer(doc, path, false)      │
  │                → 留下 dangling references             │
  │                → validation 标红                      │
  │   Cascade   → removeContainer(doc, path, true)       │
  │                → 同时删 N 个引用 param                 │
  └─────────────────────────────────────────────────────┘
```

### 6.3 Add / Delete Parameter

```
[用户在 ParamEditor 选中 container X]
    ↓ 底部 "Add parameter" 按钮
[校验：是否有 BSWMD 定义 module X]
   ├─ 无  → setError("mutation.error.no-bswmd-for-module")
   └─ 有  → 打开 BswmdPickerDialog(parentPath, kind='parameter')
            ↓ 选 "BaudRate" (integer, default=500000)
[store.addParameter(parentPath, 'BaudRate')]
    ↓ 内部调 core.addParameter
    ↓ 校验：multiplicity-exceeded? no-bswmd?
    ↓ 构造 ParamValue from paramDef.defaultValue
[Result.ok → 触发 ParamEditor 重渲染，行立即出现]
[Result.fail → setError]

[Delete parameter — 单动作，无 cascade]
[用户点行末 × 按钮]
    ↓
[store.deleteParameter(path, key)]  ← 直接调 core.removeParameter
    ↓
[Result.ok → 行消失 + dirty + revalidate]
```

---

## 7. 错误处理

### 7.1 三层错误模型

```
Layer 1: core/arxml/mutation.ts  ← 返回 Result<T, MutationError> (6 kinds)
Layer 2: useArxmlStore action    ← 消化 Result, 翻译成 setError() (永不 throw / 永不返回 Result)
Layer 3: AppHeader banner        ← 单一全局错误 surface (Sprint 13 已实装)
```

### 7.2 6 个 MutationError → 用户消息

| Error kind              | 触发场景                      | zh-CN                    | en                                |
| ----------------------- | ----------------------------- | ------------------------ | --------------------------------- |
| `path-not-found`        | path 已不存在                 | 操作失败：路径不存在     | Operation failed: path not found  |
| `name-conflict`         | shortName 与已有 child 重名   | 名称冲突：'X' 已存在     | Name conflict: 'X' already exists |
| `multiplicity-exceeded` | 已达 upperMultiplicity        | 已达最大实例数 (3/3)     | Maximum reached (3/3)             |
| `multiplicity-floor`    | 删时低于 lowerMultiplicity    | 不能低于最小实例数 (2/2) | Cannot go below minimum (2/2)     |
| `no-bswmd-for-module`   | 选中的 module 没有 BSWMD 定义 | 需要先加载 BSWMD         | Load BSWMD first                  |
| `invalid-param-type`    | 找不到 paramDef               | 参数未在 BSWMD 中定义    | Parameter not defined in BSWMD    |

### 7.3 关键不变量

- 失败 action **不**污染 `documents` 数组（`Result.ok` 才 `set`）
- `dirtyPaths` 只在 `Result.ok` 时加（与 `updateParam` 一致）
- `validationErrors` 每次都重算（无条件，0 成本）
- "Only delete" 留下 dangling reference → 既有 validation 标红，**不**额外做清理

---

## 8. 测试策略

### 8.1 覆盖率目标

| 层                                  | 目标                         | 说明                      |
| ----------------------------------- | ---------------------------- | ------------------------- |
| `core/arxml/mutation.ts`            | ≥ 95% stmts / ≥ 90% branches | pure functions，是核心    |
| `core/project/bswmd.ts` (extension) | 既有 + 新增 ≥ 85%            | 2 新 helper               |
| `useArxmlStore.ts` 新增 actions     | 既有 + 新增 ≥ 80%            | 4 actions + picker state  |
| `ContextMenu.tsx`                   | ≥ 85%                        | 定位 / 关闭 / 键盘 / a11y |
| `BswmdPickerDialog.tsx`             | ≥ 80%                        | 渲染 / 灰显 / 确认 / 搜索 |
| `CascadeConfirmDialog.tsx`          | ≥ 90%                        | 3 选项 / 引用列 / Esc     |
| `ParamEditor.tsx` (新增按钮)        | 既有 92% + 维持              | 不破坏既有测试            |

**项目总覆盖率目标**: 97.52% / 90.72% / 100% funcs **不降级**。

### 8.2 Test 数量预估 (~111 新 test)

| 文件                                                                 | 新增数 | 说明                                            |
| -------------------------------------------------------------------- | ------ | ----------------------------------------------- |
| `core/arxml/__tests__/mutation.test.ts`                              | 30     | 4 helper + Result 失败 + multiplicity 边界      |
| `core/arxml/__tests__/round-trip-mutation.test.ts`                   | 15     | 5 fixture × 3 mutation                          |
| `core/project/__tests__/bswmd.test.ts` (extend)                      | +8     | `getContainerDefByPath` + `listContainerParams` |
| `renderer/store/__tests__/useArxmlStore.mutation.test.ts`            | 20     | 4 action × happy/fail/combined-mode/setError    |
| `renderer/components/__tests__/ContextMenu.test.tsx`                 | 12     | 定位 / 关闭 / 键盘 / disabled / a11y            |
| `renderer/components/__tests__/BswmdPickerDialog.test.tsx`           | 10     | 渲染 / 灰显 / 确认 / 搜索                       |
| `renderer/components/__tests__/CascadeConfirmDialog.test.tsx`        | 8      | 3 选项 / 引用列 / Esc / Promise resolve         |
| `renderer/components/editor/__tests__/ParamEditor.mutation.test.tsx` | +6     | 按钮 / disabled / picker 集成                   |
| `shared/__tests__/i18n.test.ts` (extend)                             | +2     | 15 新 key parity                                |

### 8.3 Round-trip mutation（关键集成验证）

5 fixture (Can / EcuC / Adc / PduR / WdgIf) × 3 mutation (addContainer / addParameter / removeContainer-cascade) = 15 test

模式: `parseArxml → mutation → serializeArxml → re-parse → assert`

---

## 9. 验收标准 (Acceptance Criteria)

1. ✅ `pnpm vitest run` 通过 ~1014 个 test (903 baseline + ~111 new)
2. ✅ Coverage 不降级（97.52% / 90.72% / 100% funcs 维持）
3. ✅ 5 fixture round-trip mutation 全部通过
4. ✅ 4 个 combined-mode test 全部通过（无回归）
5. ✅ i18n parity test 通过（zh-CN + en 各 15 新 key）
6. ✅ `pnpm build` 三条都过（renderer / main / preload）
7. ✅ `pnpm tsc --noEmit` 0 error
8. ✅ `pnpm eslint src` 0 new warning
9. ✅ 手动冒烟 10 步全部通过
10. ✅ commit 落到 feature branch，准备 PR

### 手动冒烟步骤

1. 启动 `pnpm dev`
2. Open project with `Can.arxml` + `Can_bswmd.arxml`
3. Right-click `Can` container in tree → 看到 "Add sub-container" 菜单项
4. 选 `CanIfBufferCfg` → 新 container 出现在 tree 中
5. ParamEditor footer 看到 "Add parameter" 按钮（已 enabled）
6. 选 `BaudRate` (integer, default 500000) → 立刻在 ParamEditor 看到新行
7. Right-click 新 container → "Delete" → 0 个引用时直接消失
8. 重新加一个被 reference 指向的 container → 删它 → 弹 3 选项 cascade dialog
9. 选 "Only delete" → 留下 dangling reference → validation 标红
10. Save → Reload → 改动持久化

### Combined Tree View 兼容

- `setViewMode('combined')` → 重复 3-7 步 → 验证 mutation 路由到正确的 source doc
- 既有 `useArxmlStore.combined.test.ts` 全部通过（无回归）

---

## 10. 风险与缓解

| 风险                                    | 缓解                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| Round-trip mutation 破坏既有 5 fixture  | Phase 1.3 优先跑通 round-trip；既有 test 失败立即停                                        |
| Combined mode path 处理出错             | Phase 2 写 4 个 combined-mode test 兜底；复用 `findByPathMultiDoc` + `stripCombinedPrefix` |
| Picker 状态泄漏                         | `closeBswmdPicker` 强制重置 state                                                          |
| Cascade "Only delete" 留下 dangling ref | validation 引擎会标红（已有流程）                                                          |
| 新增 i18n keys 破坏 parity test         | Phase 4 同步做                                                                             |
| 6 个 agent 并行互相冲突                 | Wave 划分按依赖链；同一文件只在一个 agent 改一次                                           |

---

## 11. 实施路线图

### Multi-Agent Execution Strategy

```
Wave 1 (串行, 1 agent, ~2h)
  └─ Agent A: Phase 1 全部 (core layer) — Phase 2 依赖

Wave 2 (并行, 2 agents, ~2.5h, after Wave 1 ships)
  ├─ Agent B: Phase 2 全部 (store actions) — Phase 3 依赖
  └─ Agent C: Phase 3.1 + 3.4 (ContextMenu + TreeNode/Tree) — 无 store 依赖

Wave 3 (并行, 2 agents, ~2.5h, after Wave 2 ships)
  ├─ Agent D: Phase 3.2 (BswmdPickerDialog) + Phase 3.5 (ParamEditor) — 依赖 store
  └─ Agent E: Phase 3.3 (CascadeConfirmDialog) + Phase 4.3 (wire to App.tsx) — 依赖 store

Wave 4 (1 agent, ~30min, after Wave 3 ships)
  └─ Agent F: Phase 4.1 + 4.2 (i18n 全部)
```

**总预估**: ~7.5 小时，6 agents，~111 新 tests

---

## 12. Open Decisions（已通过对话解决，列在此供回顾）

1. ✅ "无 BSWMD 时的行为" → 硬错误（不 bypass）
2. ✅ "删除有引用的 container" → 3 选项 ConfirmDialog（默认聚焦 "Only delete"）
3. ✅ "Multiplicity 边界" → 双层防御（picker 灰显 add / at-max 阻止 add；floor 删时 hard block）
4. ✅ "Picking 来源" → 单选 + Done（不做多选）
5. ✅ "Cascade confirm 复用 vs 新建" → 新建 `CascadeConfirmDialog`

---

## 13. Plan 之外的 Follow-up（建议下一个 Sprint）

- **v1.0.1 release**: 合并 v1.0.0 WIP 6 commits + 本 spec 全部 → tag v1.0.1 + push + GH release
- **Sprint 14 剩余 3 份 plan** (按依赖顺序: ImportSlice → BSWMD-to-ECUC) → v1.1.0
- **Script Engine** (独立 v1.1.0 feature)
- **Undo/Redo** (独立 feature，可与 Script Engine 同期 ship)
