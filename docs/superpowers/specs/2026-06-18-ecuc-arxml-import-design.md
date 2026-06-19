# ECUC ARXML Import Design Spec

> **For agentic workers:** 本 spec 描述 ECUC ARXML 多份导入合并机制的设计决策。
> 配套 plan 待 `writing-plans` skill 创建。状态: **draft → 待 user review**。
> 设计日期: 2026-06-18。基于方案 C（Lazy Merged View + ImportSlice）。

---

## 1. 摘要 (TL;DR)

为 claude-AutosarCfg 增加 **ECUC ARXML 多份聚合导入** 机制。用户在 FileListTab 点 `[Import…]` 选择 N 个 ECUC 文件 → 按 module 维度勾选要导入的 → module 撞名时弹 diff 表手动选 keep-existing / overwrite / keep-both / skip → 合并结果以 **merged 虚拟视图** 呈现（不污染源 doc）→ commit 时按 sourceFile 拆回各 target doc（不可变更新）。

**核心承诺**：

- 源 doc 在 commit 前**完全不被修改**（merged view 是叠加态）
- commit 是**原子**的（任一 patch 失败整体 rollback）
- 复用 Sprint 13 Stage 3.5 Combined Tree View 的 virtual view 机制
- 不新增 IPC channel、不改 ArxmlElement 核心类型、不动 project.ts manifest schema

---

## 2. 动机与背景

### 2.1 现状

claude-AutosarCfg v1.0.0 已发布：

- 完整的 ARXML 解析 / 序列化 / Tree / 编辑器 / 验证 / 项目持久化
- 9 个 validation kind（含 cross-ref / ref-dest / ref-cycle / schema-unknown / multiplicity）
- Combined Tree View（Sprint 13 Stage 3.5）支持多 doc 虚拟合成显示
- 5 baseline fixtures（CanIf / EcuC / Pdu / Com 等），1336 baseline violations

### 2.2 缺口

**没有任何 "导入另一份 ECUC 到现有 ECUC" 的逻辑**：

- `useArxmlStore.addDocument` 是 doc-level replace/append（整个 ArxmlDocument 替换）
- Combined Tree View 是只读虚拟显示（不修改 store 数据）
- 多个 ECUC 之间的 module 撞名无任何解决机制

### 2.3 用户场景

AUTOSAR 工程实践中，"多份 ECUC 聚合" 是常见需求：

- 一个 ECU 的 ECUC 拆成多个文件（按 module / 子系统），最终合并为一个 ECU Extract
- 多个独立子系统 ECUC 在某层（如 OEM 集成层）合并
- 同事发的 ECUC 子集要合进来

---

## 3. 范围

### 3.1 设计目标 (In-Scope)

| #   | 目标                                                                              |
| --- | --------------------------------------------------------------------------------- |
| G1  | 用户能选 N 个 ECUC 文件（multi-select dialog）                                    |
| G2  | 按 module 维度勾选要导入的（每个文件展示其 module 列表）                          |
| G3  | module 撞名时弹 diff 表，user 手动选 keep-existing / overwrite / keep-both / skip |
| G4  | 合并结果以 merged 虚拟视图呈现（viewMode='import-merged'），不污染源 doc          |
| G5  | commit 时按 sourceFile 拆回各 target doc（不可变更新，符合现有规则）              |
| G6  | commit 是原子的：任一 patch 失败整体 rollback                                     |
| G7  | commit 后悔可 undoLastCommit（一次撤销，仅最近一次 commit）                       |
| G8  | merged view 上保存走现有 project:save IPC，不新增 channel                         |

### 3.2 非目标 (Out-of-Scope)

| #   | 不做                               | 理由                                                        |
| --- | ---------------------------------- | ----------------------------------------------------------- |
| N1  | 删除 target 中 existing module     | 破坏性操作；留 Sprint 15+ 单独设计                          |
| N2  | 修改 reference dest / 自动重写 ref | 撞名 ref 时不动 ref，只高亮 cross-ref warning               |
| N3  | 跨项目导入                         | 只支持当前打开项目内的 docs；project.ts 不动                |
| N4  | 流式大文件 diff                    | 5 MB 以下全量加载；超过走现有 32 MiB cap                    |
| N5  | BSWMD 自动加载                     | incoming module 的 BSWMD 由用户用现有 "Load BSWMD" 入口加载 |
| N6  | 删除 / rename target module        | 留 Sprint 15+                                               |
| N7  | 实时多人协作                       | 单用户桌面 GUI，无协同                                      |

---

## 4. 厂商方案对照

| 厂商 / 工具                       | 聚合语义                                          | 撞名解决                                                               | 状态归属                            | 与本设计相似度                      |
| --------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------- | ----------------------------------- |
| **EB tresos (Studio)**            | Import Project wizard，按 module / ECU 选         | Resolve Conflicts 对话框，3 选项：Use incoming / Use existing / Rename | 决策持久化到 workspace，undo 栈有限 | **最接近**（弹 diff 表 + 拆分回源） |
| **Vector DaVinci (Configurator)** | Merge Configuration 把 .dbcx/.arxml 当 patch 应用 | Conflict Marker 高亮，无人值守默认 incoming-wins                       | 决策写到 builder log，不入源 doc    | 部分（lazy virtual view + log）     |
| **ETAS RTA-Config**               | 多个 .arxml 一文件一 module                       | 撞名默认拒绝导入，要求 prefix                                          | 不做合并视图                        | 不做合并，撞名拒绝                  |
| **Intewell (经纬恒润)**           | 类似 ETAS，multiple value-side files              | `/EAS/` 私有 schema 路径区分；撞名整体拒绝                             | 文件即 fragment                     | 不做合并，撞名拒绝                  |
| **Artop (Eclipse)**               | `EcucValueCollection.merge(other)` API            | 调用方决定                                                             | API 形式，无 UI                     | API 形式，无 UI                     |
| **claude-AutosarCfg (现状)**      | 无                                                | 无                                                                     | 无                                  | **目标 = EB tresos 风格**           |

**决策影响**：

- EB tresos 是最接近的对标 → 借鉴 Resolve Conflicts 对话框
- Vector 的 lazy virtual view + log 决策 → 借鉴 lazy diff 计算
- ETAS / Intewell 的"撞名拒绝"是另一条路 → 排除（用户体验差，且本设计明确支持 diff 表手动选）

---

## 5. Design §1 — 架构与组件

### 5.1 分层（核心约束：core 层零 react/electron 依赖）

```
┌────────────────────────────────────────────────────────────────────┐
│ renderer (React + Zustand)                                         │
│  ┌────────────────┐ ┌──────────────────┐ ┌─────────────────────┐  │
│  │ ImportEntry    │ │ ModuleSelection  │ │ DiffTable (lazy)    │  │
│  │ (FileListTab)  │ │ Panel            │ │                     │  │
│  └────────────────┘ └──────────────────┘ └─────────────────────┘  │
│                              │                │                    │
│                              ▼                ▼                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ useArxmlStore — ImportSession slice                         │  │
│  │   startImport / selectModule / resolveModule /              │  │
│  │   cancelImport / commitImport / undoLastCommit              │  │
│  └─────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│ core (pure TS, no react/electron/fs)                               │
│  src/core/import/                                                  │
│   ├─ types.ts        ImportSelection, ImportResolution,            │
│   │                   ImportPatch, ImportSessionSnapshot           │
│   ├─ diff.ts         buildModuleDiff(target, incoming)             │
│   │                   → ModuleDiff                                 │
│   ├─ merge.ts        buildMergedView(session) → MergedView         │
│   └─ patch.ts        compileResolutionToPatches(session)            │
│                       → ImportPatch[] + applyPatchesToDocument     │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                复用现有管线（无新 IPC channel）：
                - parseArxml (core/arxml/parser.ts)
                - validateProjectForRenderer (core/validation)
                - serializeArxml (core/arxml/serializer.ts)
                - arxml:parse / arxml:save / project:save
```

### 5.2 新增文件清单

| 路径                                                               | 角色                                                                                                          | 测试                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `src/core/import/types.ts`                                         | 数据契约：ImportSelection / ImportResolution / ImportPatch / ModuleDiff / ImportSessionSnapshot / ImportError | 单测类型守卫            |
| `src/core/import/diff.ts`                                          | `buildModuleDiff(target, incoming): Result<ModuleDiff, DiffError>`                                            | ≥8 单测                 |
| `src/core/import/merge.ts`                                         | `buildMergedView(session): MergedView`                                                                        | ≥6 单测                 |
| `src/core/import/patch.ts`                                         | `compileResolutionToPatches(session): ImportPatch[]` + `applyPatchesToDocument(doc, patches): ArxmlDocument`  | ≥10 单测                |
| `src/renderer/components/ImportEntry.tsx`                          | FileListTab 的 `[Import…]` 按钮 + multi-select dialog 桥                                                      | 组件测                  |
| `src/renderer/components/ModuleSelectionPanel.tsx`                 | 按 module 列出 incoming ECUC，每行 checkbox + 撞名 badge                                                      | 组件测                  |
| `src/renderer/components/DiffTable.tsx`                            | 单 module 三栏 diff (existing / incoming / 决策 radio)                                                        | 组件测 + Playwright E2E |
| `src/renderer/store/__tests__/useArxmlStore.importSession.test.ts` | ImportSession 状态机集成测                                                                                    | ≥10 集成测              |
| `tests/e2e/import-flow.spec.ts`                                    | happy path + abort path E2E                                                                                   | ≥2 cases                |

### 5.3 复用清单（不重新发明）

| 复用对象                      | 位置                        | 用法                                                                 |
| ----------------------------- | --------------------------- | -------------------------------------------------------------------- |
| `wrapPackageUnderSegment`     | `useArxmlStore.ts:894`      | merged view 把每个 incoming doc 包成 `[import:N]/<original-path>`    |
| `stripCombinedPrefix`         | `useArxmlStore.ts:983`      | 拆回源时剥离 `[import:N]/` 前缀                                      |
| `computeDisplayDoc`           | `useArxmlStore.ts:863`      | `viewMode: 'import-merged'` 分支扩展                                 |
| `parseArxml`                  | `core/arxml/parser.ts`      | 读 N 个 ECUC 文件直接复用                                            |
| `validateProjectForRenderer`  | `core/validation`           | merged view 校验复用 9 个 validation kind                            |
| `Tree` / `TreeNode`           | `renderer/components/tree/` | merged view 渲染直接复用                                             |
| `findByPathMultiDoc`          | `core/arxml/path.ts`        | 拆回源时按 path 查 target doc                                        |
| 现有 `dirtyPaths` + `isDirty` | `useArxmlStore.ts:295`      | ImportSession 内 dirty 不影响 store dirty；commit 时按 sourceFile 标 |

### 5.4 viewMode 状态机（最小扩展）

```
viewMode: 'single' | 'combined' | 'import-merged'
            │         │           │
            │         │           └─ importSession !== null
            │         └─ store.viewMode === 'combined'
            └─ 默认（importSession === null && viewMode !== 'combined'）

切换条件：
- 进入 'import-merged'：startImport(paths) 成功 → importSession !== null
- 退出 'import-merged'：cancelImport() 或 commitImport() 完成
- 退出时不弹 confirm（commit 已 confirm；cancel 是显式退出）
- 在 'import-merged' 时切到 'combined'：阻止并 toast
```

### 5.5 关键取舍（Alternatives Considered）

| 取舍点          | 选                                            | 备选                         | 理由                                     |
| --------------- | --------------------------------------------- | ---------------------------- | ---------------------------------------- |
| provenance 字段 | **不加**                                      | 方案 B 加 provenance tag     | 不污染 ArxmlElement，复用 Combined View  |
| viewMode 状态   | **扩 3 态**                                   | 独立 import store slice      | 复用 Combined View 渲染路径，UI 切换最简 |
| IPC 新增        | **不加**                                      | 新增 import:resolveConflicts | core 层足够纯，IPC 没必要                |
| Diff 算法       | **lazy**（点开 module 才算）                  | 一次算全部                   | 大型 ECUC 上避免阻塞                     |
| Ref 撞名时      | **保留 target 引用 + 高亮 cross-ref warning** | 自动重写 ref                 | ref-dest 不动 = 与现有 validation 一致   |

---

## 6. Design §2 — 数据流与 ImportSession

### 6.1 完整 Happy Path（10 步）

```
1. user click [Import…] in FileListTab
   → ImportEntry.tsx: dialog.showOpenDialog (multi, .arxml)
   → main: readFile × N (复用 bswmdReadHandler pattern)

2. IPC arxml:parse × N (复用现有 parseArxmlHandler.ts)
   → 每文件走 32 MiB cap + version detection

3. store.startImport(parsedDocs, originalPaths)
   → 建 ImportSession:
      - incomingDocs = parsedDocs
      - moduleSelections = Map<mergedModulePath, boolean> (默认 true)
      - resolutions = Map<mergedModulePath, ImportResolution>
                     (默认 'overwrite'，撞名才出现 diff 表)
      - activeModuleForDiff = null
   → set viewMode='import-merged'
   → 不动 documents / documentPaths（源 doc 完全不被污染）

4. UI: ModuleSelectionPanel 显示
   每行 = (incomingDoc, moduleShortName, target 是否已存在)
   - 状态：unselected / selected / collision-existing
   - 撞名行加 badge: "⚠ Module 已在 <target path> 中存在"
   - 用户勾选 → store.selectModule(path)

5. user click 某个 module row → store.openDiff(modulePath)
   → activeModuleForDiff = modulePath
   → 调 core/import/diff.ts: buildModuleDiff(targetModule, incomingModule)
   → 纯函数，结果 ModuleDiff:
      { containers: [{ path, existing?, incoming?,
                       resolution: 'keep-existing' | 'overwrite' | 'keep-both' }],
        references: [...],
        paramOverrides: [...] }

6. DiffTable 显示三栏 (existing | incoming | 决策 radio)
   - 每行 resolution 默认 = 'overwrite'（如果仅 incoming 有）
                    或 'keep-existing'（如果仅 existing 有）
   - 用户改一行 → store.resolveModule(path, resolution)

7. user click [Commit] → ConfirmDialog
   "将 N 个 module 合并到当前项目，是否继续？"

8. store.commitImport()
   → 调 core/import/patch.ts:
      compileResolutionToPatches(session) → ImportPatch[]
      (按 sourceFile 分组：每组 = 一个 target doc 的修改 ops)
   → 对每个 sourceFile 调 applyPatchesToDocument(targetDoc, patches)
      → 新 ArxmlDocument（不可变更新）
   → store.documents / documentPaths 同步更新
   → dirtyPaths += 修改过的 sourceFile paths
   → store.importSession = null
   → store.viewMode = 'single'
   → 保存 lastCommitSnapshot 用于 undoLastCommit

9. revalidate: validateProjectForRenderer(documents)
   (跨文件 ref 现在可能指向刚加的 module → cross-ref / ref-dest 重算)

10. user [Save Project] / [Save As] (走现有 project:save IPC)
```

### 6.2 ImportSession 数据契约（core/import/types.ts）

```typescript
export type ImportResolution =
  | 'keep-existing' // 保留 target，不动
  | 'overwrite' // incoming 覆盖 target（默认）
  | 'keep-both' // 保留两份，incoming 加 suffix
  | 'skip'; // 不导入

export interface ModuleSelection {
  /**
   * Module 在 merged view 中的 path。
   * 格式: `/[import:N]/<AR-PACKAGE-path>/<module-short-name>`
   * （复用 §5.3 `wrapPackageUnderSegment` 的 segment 命名规则，
   *  Combined View 用 `[doc:N]`，Import 用 `[import:N]`）
   */
  readonly mergedModulePath: string;
  readonly sourceDocIndex: number;
  readonly moduleShortName: string;
  readonly selected: boolean;
  readonly collidesWithTarget: boolean;
  readonly targetModulePath: string | null;
}

export interface ModuleResolution {
  readonly mergedModulePath: string;
  readonly resolution: ImportResolution;
  readonly containerResolutions?: ReadonlyMap<string, ImportResolution>;
}

export interface ImportSession {
  readonly id: string;
  readonly incomingDocs: readonly ArxmlDocument[];
  readonly originalPaths: readonly string[];
  readonly selections: readonly ModuleSelection[];
  readonly resolutions: readonly ModuleResolution[];
  readonly activeModuleForDiff: string | null;
  readonly createdAt: number;
}

export interface ImportPatch {
  readonly sourceFile: string;
  readonly ops: readonly ImportPatchOp[];
}
/**
 * Op 语义区分（与 §6.1 Step 8 / §6.4 边界条件对应）:
 * - `add-module`: target 中无此 module，incoming 全新插入（resolution='overwrite' 且 target 无 collision）
 * - `merge-into-module`: target 中有此 module，incoming 内容按容器粒度叠加（resolution='overwrite' 且 target 有 collision；保留 target 上用户独有的容器）
 * - `overwrite-module`: target 中有此 module，incoming 整体替换（resolution='overwrite' 且用户在 DiffTable 选 'overwrite-module'）
 * - `rename-incoming`: keep-both 时给 incoming module 加 `_imported` suffix
 */
export type ImportPatchOp =
  | { readonly kind: 'add-module'; readonly module: ArxmlModule }
  | {
      readonly kind: 'merge-into-module';
      readonly moduleShortName: string;
      readonly additions: ArxmlContainer[];
    }
  | {
      readonly kind: 'overwrite-module';
      readonly moduleShortName: string;
      readonly replacement: ArxmlModule;
    }
  | {
      readonly kind: 'rename-incoming';
      readonly originalShortName: string;
      readonly newShortName: string;
    };
```

### 6.3 状态生命周期

```
                 startImport()
                       │
                       ▼
            ┌─────────────────────┐
            │ ImportSession=null  │◀────── cancelImport() 任何时刻
            │ viewMode='single'   │       (退出无 confirm)
            └─────────────────────┘
                       │ startImport()
                       ▼
            ┌─────────────────────┐
            │ ImportSession!==null│
            │ viewMode='import-   │
            │   merged'           │
            │ activeModule=null   │◀────── 初始（ModuleSelection 可见）
            └─────────────────────┘
                       │ openDiff(path)
                       ▼
            ┌─────────────────────┐
            │ activeModule=path   │
            │ DiffTable 渲染      │◀────── resolveModule 修改
            └─────────────────────┘       resolutions map
                       │ closeDiff()
                       ▼
            ┌─────────────────────┐
            │ activeModule=null   │       back to ModuleSelection
            └─────────────────────┘
                       │ commitImport() 成功
                       ▼
            ┌─────────────────────┐
            │ ImportSession=null  │
            │ documents 已更新    │
            │ dirtyPaths+=被改    │
            │ viewMode='single'   │
            └─────────────────────┘
```

### 6.4 边界条件

| 场景                                       | 行为                                                             |
| ------------------------------------------ | ---------------------------------------------------------------- |
| 用户选 0 个 module 就 commit               | 阻止 commit，DiffTable 显示 "未选中任何 module"                  |
| 取消勾选原本 target 已存在的 module        | 不进入 resolutions map，patch 时不生成 ops（target 保持不变）    |
| resolution='keep-both' 撞 target shortName | 自动加 suffix `_imported`，target 内 ref 重写                    |
| import-merged 视图下切到 [Combined]        | 阻止切换并 toast "请先完成或取消导入"                            |
| import-merged 视图下点 [Save]              | 阻止并 toast（必须先 commit）                                    |
| dirty 时点 [Import]                        | ConfirmDialog 走现有 unsaved 保护                                |
| 撞名 module 但用户没 openDiff              | 默认 'overwrite'，commit 时弹 "X 个 module 使用默认覆盖，确认？" |
| commit 中途 patch apply 失败               | rollback 整个 import；toast 失败原因                             |
| Incoming version 与 target 不一致          | 弹 warning 但允许继续；project 级 validate 跑一次                |

---

## 7. Design §3 — 错误处理 + 撤销 / 事务

### 7.1 错误分类（按失败阶段）

| 阶段               | 错误源                               | 用户可见行为                        | 内部处理                                     |
| ------------------ | ------------------------------------ | ----------------------------------- | -------------------------------------------- |
| A. 文件读取        | fs.readFile 失败                     | Toast: "无法读取 X：{message}"      | 跳过该文件，剩余继续；最终弹 partial summary |
| B. 解析            | parseArxmlHandler 失败               | Toast: "解析 X 失败：{kind → 中文}" | 跳过该文件；剩余都失败则整体 cancelImport    |
| C. Diff 计算       | buildModuleDiff invariants 破裂      | Toast: "模块 X diff 计算失败"       | 标记 diffFailed，从 selections 移除          |
| D. Patch 应用      | applyPatchesToDocument 失败          | Toast + 整体 rollback               | 见 §7.2                                      |
| E. 跨文件 ref 失效 | commit 后 cross-ref 新错误           | ValidationPanel 自动刷新            | 不视为 import 失败                           |
| F. 用户操作        | commit 时 0 module / viewMode locked | Toast + 阻止操作                    | 状态机不变                                   |

### 7.2 错误码（core/import/types.ts）

```typescript
export type ImportError =
  | { readonly kind: 'read-failed'; readonly path: string; readonly message: string }
  | { readonly kind: 'parse-failed'; readonly path: string; readonly message: string }
  | { readonly kind: 'diff-failed'; readonly mergedModulePath: string; readonly message: string }
  | {
      readonly kind: 'patch-apply-failed';
      readonly sourceFile: string;
      readonly moduleShortName: string;
      readonly message: string;
    }
  | {
      readonly kind: 'multiplicity-exceeded';
      readonly sourceFile: string;
      readonly containerPath: string;
      readonly limit: number;
    }
  | { readonly kind: 'no-modules-selected' }
  | { readonly kind: 'view-mode-locked'; readonly currentViewMode: 'import-merged' }
  | {
      readonly kind: 'mixed-versions';
      readonly targetVersion: string;
      readonly incomingVersions: readonly string[];
    };
```

### 7.3 事务回滚（commit 原子性）

commitImport 用 immutable snapshot 实现 all-or-nothing：

```typescript
// useArxmlStore.ts commitImport 实现思路
commitImport: () => {
  const state = get();
  if (!state.importSession) return { ok: false, error: { kind: 'no-modules-selected' } };

  const patches = compileResolutionToPatches(state.importSession);
  const sourceFilesTouched = new Set(patches.map((p) => p.sourceFile));

  // 1. 拍快照（仅 sourceFilesTouched 这些 doc）
  const snapshots = new Map<string, ArxmlDocument>();
  for (const path of sourceFilesTouched) {
    const idx = state.documentPaths.indexOf(path);
    if (idx !== -1) snapshots.set(path, state.documents[idx]);
  }

  // 2. 应用 patches（任一失败立即整体回滚）
  let nextDocuments = state.documents;
  try {
    for (const path of sourceFilesTouched) {
      const idx = nextPaths.indexOf(path);
      if (idx === -1) continue;
      const filePatches = patches.filter((p) => p.sourceFile === path);
      const newDoc = applyPatchesToDocument(nextDocuments[idx], filePatches);
      nextDocuments = nextDocuments.map((d, i) => (i === idx ? newDoc : d));
    }
  } catch (err) {
    // rollback：直接用 snapshots 还原，importSession 不动
    return { ok: false, error: { kind: 'patch-apply-failed', message: err.message } };
  }

  // 3. 提交
  set({
    documents: nextDocuments,
    dirtyPaths: new Set([...state.dirtyPaths, ...sourceFilesTouched]),
    importSession: null,
    viewMode: 'single',
    lastCommitSnapshot: snapshots,
    validationErrors: validateProjectForRenderer(nextDocuments),
    lastValidatedAt: Date.now(),
  });
  return { ok: true, sourceFilesTouched: [...sourceFilesTouched] };
};
```

**关键不变量**：

- `importSession!==null` 时 store.documents 不可变（commitImport 不调用 set 直到 patches 全部成功）
- 失败后 importSession 保留，用户可修解决策重 commit
- 不会出现 "documents 部分更新、importSession 已清" 的中间态

### 7.4 撤销 / 事务范围

| 范围                                    | 行为                                                           | 实现                                                                                                                                        |
| --------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **ImportSession 内部撤销**（commit 前） | DiffTable 误改一行 → 单步 undo（限于该 module 的 resolutions） | ImportSession 内嵌 `undoStack: ImportSessionSnapshot[]`（≤20 步），仅 commit 前有效；cancelImport 清空                                      |
| **commit 后整体撤销**（commit 后）      | 后悔 → 一键回滚整次 commit                                     | 复用上面的 snapshots（保留最近一次 commit 的 snapshot 在 `lastCommitSnapshot`），提供 `undoLastCommit()` action；下次 commit 或 save 时清掉 |
| **跨 commit 撤销**                      | 不支持                                                         | 与 EB tresos 行为一致——commit 后是持久化状态                                                                                                |
| **应用关闭时 importSession!==null**     | 走现有 unsaved 保护                                            | `isDirty()` 改为 `dirtyPaths.size > 0 \|\| importSession !== null`                                                                          |

### 7.5 i18n keys

新增 18 个 key 到 `src/shared/i18n.ts` 的 `Messages` interface（zh-CN / en 双语，按 Sprint 11 Phase 1 风格）：

| key                                  | zh-CN                                          | en                                                         |
| ------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------- |
| `app.import.button`                  | 导入…                                          | Import…                                                    |
| `app.import.title`                   | 导入 ECUC ARXML                                | Import ECUC ARXML                                          |
| `app.import.moduleSelection.title`   | 选择要导入的模块                               | Select modules to import                                   |
| `app.import.collision.badge`         | ⚠ 模块已存在                                   | ⚠ Module exists                                            |
| `app.import.diff.title`              | 模块冲突：{shortName}                          | Module conflict: {shortName}                               |
| `app.import.resolution.keepExisting` | 保留现有                                       | Keep existing                                              |
| `app.import.resolution.overwrite`    | 覆盖                                           | Overwrite                                                  |
| `app.import.resolution.keepBoth`     | 保留两份                                       | Keep both                                                  |
| `app.import.resolution.skip`         | 跳过                                           | Skip                                                       |
| `app.import.commit.confirm`          | 将 {N} 个模块合并到 {M} 个目标文档，是否继续？ | Merge {N} module(s) into {M} target document(s). Continue? |
| `app.import.error.readFailed`        | 无法读取 {path}：{message}                     | Cannot read {path}: {message}                              |
| `app.import.error.parseFailed`       | 解析 {path} 失败：{message}                    | Parse {path} failed: {message}                             |
| `app.import.error.patchFailed`       | 合并到 {path} 失败：{message}                  | Merge into {path} failed: {message}                        |
| `app.import.error.noModulesSelected` | 未选中任何模块                                 | No modules selected                                        |
| `app.import.error.viewModeLocked`    | 请先完成或取消导入                             | Please finish or cancel the import first                   |
| `app.import.commit.success`          | 已合并 {N} 个模块到 {M} 个文档                 | Merged {N} module(s) into {M} document(s)                  |
| `app.import.commit.rolledBack`       | 已回滚本次合并（未应用任何修改）               | Import rolled back (no changes applied)                    |
| `app.import.undoLastCommit`          | 撤销上次合并                                   | Undo last import                                           |

**i18n parity 测试**：在 `src/shared/__tests__/i18n.test.ts` 加 assertion（与 Sprint 11 Phase 1 风格一致）。

### 7.6 Silent-Failure 防护

- ✅ 没有任何 `try/catch` 吞错；patch apply 失败必须把 message 传出来
- ✅ partial-read 不静默——主流程结束后仍弹 partial summary
- ✅ commit 失败后 importSession 保留，用户可重试或 cancel
- ✅ default resolution ('overwrite') 必须显式弹确认

---

## 8. Design §4 — 测试策略

### 8.1 覆盖目标

| 层级                      | 工具                     | 数量目标 | 覆盖率目标                       |
| ------------------------- | ------------------------ | -------- | -------------------------------- |
| core/import/              | Vitest 单测              | ≥24      | ≥95% stmts / ≥85% branches       |
| store importSession slice | Vitest 集成              | ≥10      | 状态机全覆盖                     |
| UI 组件                   | Vitest + Testing Library | ≥10      | 关键路径全覆盖                   |
| E2E                       | Playwright               | ≥2       | happy + abort path               |
| 整体回归                  | 现有 5 baseline fixtures | 不退化   | ref-cycle [0,200] / cross-ref 等 |

### 8.2 核心测试清单（`src/core/import/__tests__/`）

#### diff.test.ts（≥8 用例）

| #   | 用例                             | 关键断言                                          |
| --- | -------------------------------- | ------------------------------------------------- |
| 1   | 两个空 module                    | containers=[], references=[], paramOverrides=[]   |
| 2   | identical module                 | resolution 默认 'keep-existing'，无 overwrite ops |
| 3   | incoming 有 / target 无          | resolution 默认 'overwrite'，生成 add-module      |
| 4   | incoming 无 / target 有          | 默认 'keep-existing'，不生成删除 ops              |
| 5   | 同 path container，param 值不同  | paramOverrides 含 diff entries                    |
| 6   | 同 path container，param 数不同  | 列出新增 / 缺失 param                             |
| 7   | nested container 撞名（深 3 层） | path 完整保留，按层归并                           |
| 8   | multiplicity 超限                | 触发 `multiplicity-exceeded` 错误                 |

#### merge.test.ts（≥6 用例）

| #   | 用例                                   | 关键断言                                             |
| --- | -------------------------------------- | ---------------------------------------------------- |
| 1   | 单 doc 单 module 无决议                | merged view 与 target 等价                           |
| 2   | 多 doc 各自 module，不撞               | merged view 包含全部，path 加 `[import:N]` 前缀      |
| 3   | 撞名 resolution='overwrite'            | merged view 中该 module 取 incoming 形态             |
| 4   | 撞名 resolution='keep-both'            | 两个同名 module 都在，incoming 加 `_imported` suffix |
| 5   | 撞名 resolution='skip'                 | merged view 中不含该 module                          |
| 6   | resolutions 不存在（用户没 open diff） | 默认按 'overwrite' 处理（commit 时弹确认）           |

#### patch.test.ts（≥10 用例）

| #   | 用例                                     | 关键断言                                    |
| --- | ---------------------------------------- | ------------------------------------------- |
| 1   | 空 session → 空 patches                  | `[]`                                        |
| 2   | 单 doc 单 module overwrite → 1 patch     | add-module op                               |
| 3   | 单 doc 单 module keep-existing → 0 patch | 不进 sourceFilesTouched                     |
| 4   | 多 doc 多 module，按 sourceFile 分组     | patches.length === uniqueSourceFiles        |
| 5   | keep-both 含 shortName rename            | rename-incoming op                          |
| 6   | applyPatchesToDocument 不可变            | Object.is(original, next) === false         |
| 7   | applyPatchesToDocument 后 round-trip     | serialize → parse → 等价                    |
| 8   | patch apply 中途失败（mock 抛错）        | 抛错后 caller 负责 rollback                 |
| 9   | multiplicity 校验失败                    | 错误携带 sourceFile / containerPath / limit |
| 10  | 嵌套 container patch（3 层）             | path 完整保留                               |

### 8.3 Store 集成测试（≥10 用例）

| #   | 场景                                   | 关键断言                                                             |
| --- | -------------------------------------- | -------------------------------------------------------------------- |
| 1   | startImport(N 个 doc)                  | importSession 完整建立；viewMode='import-merged'；documents 不变     |
| 2   | selectModule(mixed)                    | selections map 更新；incomingDocs 不变                               |
| 3   | resolveModule + undo（内部 undoStack） | undoStack 长度 +1；undo 后回到上一步                                 |
| 4   | cancelImport mid-flow                  | importSession=null；viewMode='single'；documents 不变                |
| 5   | commitImport 成功                      | documents 更新；dirtyPaths 含 sourceFilesTouched；importSession=null |
| 6   | commitImport 失败（patch 抛错）        | importSession 保留；documents 不变；返回 ImportError                 |
| 7   | commitImport 无 module 选中            | 返回 'no-modules-selected'；状态不变                                 |
| 8   | undoLastCommit                         | sourceFilesTouched 从 dirtyPaths 移除；documents 还原                |
| 9   | isDirty() 含 importSession             | importSession!==null 时 isDirty===true                               |
| 10  | commit 后跨 doc ref 校验               | validationErrors 反映新 cross-ref 状态                               |

### 8.4 UI 组件测试

#### ImportEntry.test.tsx（4 用例）

- 显示 `[Import…]` 按钮
- 点击触发 dialog
- multi-select 返回 N 个 path → startImport
- cancel 返回 0 个 file → startImport 不调用

#### ModuleSelectionPanel.test.tsx（4 用例）

- 列出所有 module + checkbox
- 撞名 module 显示 badge
- 勾选触发 store.selectModule
- openDiff 按钮在勾选后启用

#### DiffTable.test.tsx（5 用例）

- 三栏渲染 existing / incoming / 决策 radio
- resolution 默认值正确
- 改 radio 触发 store.resolveModule
- 嵌套 container 展开 / 折叠
- param override 行高亮差异值

### 8.5 E2E（Playwright, tests/e2e/import-flow.spec.ts）

```typescript
test('happy path: import 2 ECUC, select module, commit', async ({ page }) => {
  // 1. FileListTab click [Import…]
  // 2. mock showOpenDialog 返回 2 fixtures
  // 3. ModuleSelection 显示 2 个 module
  // 4. 勾选 CanIfConfig（撞 target）
  // 5. DiffTable 显示 → 选 overwrite
  // 6. commit → ConfirmDialog → confirm
  // 7. 验证 target doc 已更新 + dirtyPaths +1
});

test('abort path: cancel mid-import 不影响 store', async ({ page }) => {
  // 启动 → Import → ModuleSelection → Cancel
  // 验证 viewMode='single'，documents 与 import 前一致
});
```

### 8.6 Baseline Fixture Guard

扩展 `scripts/verify.mjs` 6-stage pipeline 加 stage 7：

```
stage7_import: {
  fixtures: ['samples/CanIf.ecuc.arxml', 'samples/EcuC.ecuc.arxml'],
  expectedBehavior: {
    refCycleCount: '[0, 200]',
    crossRefCount: '[700, 850]',
    importMergeRoundTrip: 'byte-identical'
  }
}
```

### 8.7 边界用例清单（必须覆盖）

| #   | 边界                                              | 测试位置                    |
| --- | ------------------------------------------------- | --------------------------- |
| 1   | Incoming ECUC 0 module                            | diff.test.ts                |
| 2   | Target 0 module 但 incoming 有                    | merge.test.ts               |
| 3   | Module shortName 含特殊字符（/、空格、中文）      | types.test.ts               |
| 4   | 同 module 多次出现（multiplicity=2）且都选 import | patch.test.ts               |
| 5   | Import 后 cross-ref 数量增加                      | store importSession.test.ts |
| 6   | Import 后 validation 新增 'schema-unknown'        | store importSession.test.ts |
| 7   | Incoming version 与 target 不一致                 | store startImport           |
| 8   | User 选 5+ 文件（性能边界）                       | E2E（不能阻塞 UI >2s）      |
| 9   | commit 后立刻 undoLastCommit                      | store undoLastCommit 测试   |
| 10  | import-merged 视图下 dirty 退出                   | store isDirty 测试          |

### 8.8 测试原则

- ✅ **AAA pattern**：Arrange / Act / Assert 三段式
- ✅ **命名**：描述行为（`returns empty array when no markets match query` 风格）
- ✅ **不可变断言**：测试中不 mutate 输入
- ✅ **覆盖率 ≥80%**：core/import 走 95% 目标（与现有 core/arxml 同档）
- ✅ **修复实现不修测试**：若测试失败，优先改实现（除非测试本身错）
- ✅ **不静默吞错**：所有 catch 必须断言或 rethrow

---

## 9. 文件清单汇总

### 9.1 新增文件（8 个）

```
src/core/import/
  ├─ types.ts
  ├─ diff.ts
  ├─ merge.ts
  ├─ patch.ts
  └─ __tests__/
      ├─ diff.test.ts
      ├─ merge.test.ts
      └─ patch.test.ts

src/renderer/components/
  ├─ ImportEntry.tsx
  ├─ ModuleSelectionPanel.tsx
  ├─ DiffTable.tsx
  └─ __tests__/
      ├─ ImportEntry.test.tsx
      ├─ ModuleSelectionPanel.test.tsx
      └─ DiffTable.test.tsx

src/renderer/store/__tests__/
  └─ useArxmlStore.importSession.test.ts

tests/e2e/
  └─ import-flow.spec.ts
```

### 9.2 修改文件（5 个）

```
src/renderer/store/useArxmlStore.ts        # ImportSession slice + actions + viewMode 三态 + isDirty 扩展
src/renderer/components/FileListTab.tsx     # [Import…] 入口
src/shared/i18n.ts                          # +18 i18n keys (zh-CN/en)
src/shared/__tests__/i18n.test.ts           # +18 parity assertions
scripts/verify.mjs                          # +stage 7 import regression
```

### 9.3 不动的文件（明确）

```
src/core/arxml/{types,parser,serializer,path}.ts   # 核心类型不动
src/main/ipc/*.ts                                   # 不新增 IPC channel
src/shared/project.ts                               # manifest schema 不动
src/core/project/{manifest,bswmd}.ts                # 不动
src/core/validation/*.ts                            # 不动（仅作为被复用方）
```

---

## 10. 风险与缓解

| #   | 风险                                                           | 缓解                                                                                         |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| R1  | merged view 性能：5+ MB ECUC 在 ModuleSelectionPanel 渲染慢    | 走 lazy diff（用户点开 module 才算 merged 子树）                                             |
| R2  | viewMode 三态状态机与现有 dirty 保护交互复杂                   | isDirty() 明确包含 importSession；离开 import-merged 走单一入口（cancelImport/commitImport） |
| R3  | patch apply 失败时的 rollback 边界                             | snapshot 仅含 sourceFilesTouched，不污染其他 doc；commitImport 失败 importSession 保留       |
| R4  | 跨文件 ref 在 commit 后失效                                    | 复用现有 9 个 validation kind；ref-dest 不动 = 不打破现状                                    |
| R5  | undoLastCommit 后用户继续操作                                  | lastCommitSnapshot 在下次 commit / save 时清；store action 显式提示 "undo 仅最近一次"        |
| R6  | 与 Combined View 共存导致 UI 混乱                              | FileListTab 入口互斥（[Combined] / [Import] 二选一活跃）；viewMode 状态机硬约束              |
| R7  | multiplicity 校验依赖 BSWMD；incoming module 缺 BSWMD 时不报错 | 显式 'schema-unknown' warning；不阻止 commit；由用户后续手动加载 BSWMD                       |

---

## 11. 验收标准

- [ ] core/import/ 单元测试全部通过（≥24 用例），覆盖率 ≥95% stmts / ≥85% branches
- [ ] store importSession 集成测试全部通过（≥10 用例），状态机全覆盖
- [ ] UI 组件测试全部通过（≥10 用例）
- [ ] Playwright E2E ≥2 用例通过（happy + abort）
- [ ] 现有 5 baseline fixtures 不退化（ref-cycle / cross-ref / ref-dest 等 guard 通过）
- [ ] verify.mjs stage 7 import regression 通过
- [ ] i18n parity 测试通过（zh-CN + en 各 18 个 key）
- [ ] 不新增 IPC channel（设计不变量）
- [ ] 不修改 ArxmlElement / ArxmlDocument 核心类型（设计不变量）
- [ ] 不修改 project.ts manifest schema（设计不变量）
- [ ] code-reviewer agent 评审通过（无 CRITICAL / HIGH）

---

## 12. 后续 (Out-of-Scope for this spec)

- 删除 target 中 existing module（破坏性操作）
- 修改 / 重写 reference dest
- 跨项目导入
- 流式大文件 diff
- BSWMD 自动加载
- 删除 / rename target module
- 实时多人协作

留 Sprint 15+ 单独设计。

---

## 13. 关联文件清单（reference）

### 现有复用源

- `src/core/arxml/types.ts` — ArxmlElement / ArxmlDocument / ParamValue
- `src/core/arxml/parser.ts:53` — parseArxml
- `src/core/arxml/path.ts` — findByPathMultiDoc
- `src/core/validation` — validateProjectForRenderer
- `src/renderer/store/useArxmlStore.ts:299` — addDocument
- `src/renderer/store/useArxmlStore.ts:863` — computeDisplayDoc
- `src/renderer/store/useArxmlStore.ts:894` — wrapPackageUnderSegment
- `src/renderer/store/useArxmlStore.ts:983` — stripCombinedPrefix
- `src/main/ipc/parseArxmlHandler.ts:42` — ARXML_MAX_BYTES (32 MiB cap)
- `src/shared/i18n.ts` — Messages interface
- `scripts/verify.mjs` — 6-stage pipeline

### Sprint 历史

- Sprint 13 Stage 3.5 Combined Tree View — virtual view 机制源头
- Sprint 12 #2 BSWMD 集成 — 不可变更新模式参考

---

**Spec 状态**：draft，待 user review 后进入 writing-plans skill。
