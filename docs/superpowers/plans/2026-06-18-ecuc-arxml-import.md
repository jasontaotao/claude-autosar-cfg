# ECUC ARXML Import Implementation Plan

> **For agentic workers:** 本计划执行 spec `docs/superpowers/specs/2026-06-18-ecuc-arxml-import-design.md` (commit `ef6430a`)。
> 范围：方案 C — Lazy Merged View + ImportSlice。
> **状态**：draft → 待 user review 后执行。

**Goal:** 在 claude-AutosarCfg 增加多份 ECUC ARXML 聚合导入机制：按 module 选择 + 撞名 diff 表 + merged 虚拟视图 + 原子 commit 拆回源 doc。

**Architecture:**
- 4 个新 core 模块（`core/import/{types,diff,merge,patch}.ts`）— 纯函数，零 react/electron 依赖
- `useArxmlStore` 扩 `ImportSession` slice + viewMode 三态 + isDirty 含 importSession
- 3 个新 UI 组件（`ImportEntry` / `ModuleSelectionPanel` / `DiffTable`）+ 1 个现有组件修改（`FileListTab`）
- 不新增 IPC channel、不改 ArxmlElement 核心类型、不动 project.ts manifest schema

**Tech Stack:** Electron 30 + TypeScript 5 strict + React 18 + Zustand 4 + Vitest 1 + Playwright 1.45（与现有 stack 一致）

---

## 起点状态 (2026-06-18)

| 项 | 状态 |
|---|---|
| `local HEAD` | `ef6430a` (spec commit, ahead 7) |
| `origin/main` | 落后 7 commit |
| Tests baseline | 876 passed / 97.52% stmts / 90.72% branches (v1.0.0) |
| Version | v1.0.0 |
| Spec | `docs/superpowers/specs/2026-06-18-ecuc-arxml-import-design.md` |
| Sprint 历史 | Sprint 13 Stage 3.5 Combined View 经验可复用 |

---

## 范围 (15 tasks)

### Phase 1 — Foundation

#### Task 1: core/import/types.ts — 数据契约

**Files:**
- Create: `src/core/import/types.ts`
- Create: `src/core/import/__tests__/types.test.ts`

**工作:**
- 定义 `ImportResolution` (4 个 literal union)
- 定义 `ModuleSelection` / `ModuleResolution` / `ImportSession` / `ImportPatch` / `ImportPatchOp` (4 个 op kind)
- 定义 `ModuleDiff` / `ContainerDiff` / `ParamOverride`
- 定义 `ImportError` (8 个 kind，spec §7.2)
- 定义 `MergedView` (复用 ArxmlDocument 形状，加 provenance 元数据)
- 类型守卫：`isImportResolution` / `isImportPatchOp`

**测试 (≥6):** 类型守卫有效性、union exhaustiveness、readonly 不变量

---

#### Task 2: shared/i18n.ts — +18 i18n keys

**Files:**
- Modify: `src/shared/i18n.ts` (Messages interface + MessagesZhCN + MessagesEn)
- Modify: `src/shared/__tests__/i18n.test.ts` (parity assertion)

**工作:**
- 加 spec §7.5 表中 18 个 key（zh-CN + en 各 18 条）
- 按 Sprint 11 Phase 1 风格：MessageKey 联合类型 + t(locale, key, params)
- i18n.test.ts 加 parity assertion（zh-CN 与 en 的 key 集合完全相等）

**测试 (≥3):** parity 通过、t() 参数替换工作、缺失 key 不静默

---

### Phase 2 — core/import 三大模块

#### Task 3: core/import/diff.ts — buildModuleDiff

**Files:**
- Create: `src/core/import/diff.ts`
- Create: `src/core/import/__tests__/diff.test.ts`

**工作:**
- 导出 `buildModuleDiff(target: ArxmlModule | null, incoming: ArxmlModule): Result<ModuleDiff, ImportError>`
- 内部纯函数：按 container path 分组 existing/incoming
- 计算 paramOverride（值不同 / 新增 / 删除）
- 计算 reference 差异
- 处理 multiplicity 超限（触发 `'multiplicity-exceeded'` 错误）

**测试 (≥8, spec §8.2 diff):**
1. 两个空 module
2. identical module
3. 仅 incoming 有
4. 仅 existing 有（默认 keep-existing）
5. 同 path container，param 值不同
6. 同 path container，param 数不同
7. nested container 撞名（深 3 层）
8. multiplicity 超限

---

#### Task 4: core/import/merge.ts — buildMergedView

**Files:**
- Create: `src/core/import/merge.ts`
- Create: `src/core/import/__tests__/merge.test.ts`

**工作:**
- 导出 `buildMergedView(targetDocs: readonly ArxmlDocument[], session: ImportSession): MergedView`
- 复用 `wrapPackageUnderSegment` 思路（spec §5.3），segment 名 `[import:N]`
- 按 session.resolutions 决定每个 module 的渲染形态
- 'keep-both' 时自动加 `_imported` suffix

**测试 (≥6, spec §8.2 merge):**
1. 单 doc 单 module 无决议
2. 多 doc 各自 module，不撞
3. 撞名 resolution='overwrite'
4. 撞名 resolution='keep-both'
5. 撞名 resolution='skip'
6. resolutions 不存在（默认 overwrite）

---

#### Task 5: core/import/patch.ts — compile + apply

**Files:**
- Create: `src/core/import/patch.ts`
- Create: `src/core/import/__tests__/patch.test.ts`

**工作:**
- 导出 `compileResolutionToPatches(session: ImportSession): readonly ImportPatch[]`
- 导出 `applyPatchesToDocument(doc: ArxmlDocument, patches: readonly ImportPatchOp[]): ArxmlDocument`
- 按 sourceFile 分组 → 每个 patch 含该 sourceFile 的 ops
- 应用 patches 时不可变更新（spread + 数组 map）
- multiplicity 校验失败抛错（caller 负责 rollback）

**测试 (≥10, spec §8.2 patch):**
1. 空 session → 空 patches
2. 单 doc 单 module overwrite → 1 patch
3. keep-existing → 0 patch
4. 多 doc 多 module 按 sourceFile 分组
5. keep-both 含 shortName rename
6. applyPatchesToDocument 不可变（Object.is false）
7. applyPatchesToDocument 后 round-trip（serialize → parse 等价）
8. patch apply 中途失败（mock 抛错）
9. multiplicity 校验失败
10. 嵌套 container patch（3 层）

---

### Phase 3 — Store 集成

#### Task 6: useArxmlStore — ImportSession state + startImport

**Files:**
- Modify: `src/renderer/store/useArxmlStore.ts` (新 state 字段 + startImport action)
- Create: `src/renderer/store/__tests__/useArxmlStore.importSession.test.ts`

**工作:**
- 新 state 字段: `importSession: ImportSession | null` / `viewMode: 'single' | 'combined' | 'import-merged'` / `lastCommitSnapshot: Map<string, ArxmlDocument> | null`
- 新 action: `startImport(incomingDocs, originalPaths)` — 建 session、set viewMode='import-merged'、不动 documents
- 默认 selections: 所有 module 勾选；默认 resolutions: 仅撞名 module 加 'overwrite' 决议

**测试 (≥3):** startImport 建 session 完整、viewMode 切换、documents 不变

---

#### Task 7: useArxmlStore — selectModule / resolveModule / openDiff / closeDiff + 内部 undoStack

**Files:**
- Modify: `src/renderer/store/useArxmlStore.ts`
- Modify: `src/renderer/store/__tests__/useArxmlStore.importSession.test.ts`

**工作:**
- 新 action: `selectModule(mergedPath, selected: boolean)`
- 新 action: `resolveModule(mergedPath, resolution: ImportResolution, containerResolutions?: Map<string, ImportResolution>)`
- 新 action: `openDiff(mergedPath)` / `closeDiff()`
- ImportSession 内嵌 `undoStack: ImportSessionSnapshot[]` (≤20 步)
- 新 action: `undoInternal()` — 弹 undoStack 顶部（仅 commit 前有效）

**测试 (≥4):** selections map 更新、resolutions 更新、openDiff/closeDiff 切换、undoInternal 单步撤销

---

#### Task 8: useArxmlStore — commitImport (原子 + snapshot rollback)

**Files:**
- Modify: `src/renderer/store/useArxmlStore.ts`
- Modify: `src/renderer/store/__tests__/useArxmlStore.importSession.test.ts`

**工作:**
- 新 action: `commitImport(): Result<{ sourceFilesTouched: string[] }, ImportError>`
- 流程（spec §7.3）：拍 snapshots → 遍历 patches → 任一失败 catch + rollback（importSession 保留、documents 不变）→ 全部成功 set state
- 成功后：documents 更新、dirtyPaths += sourceFilesTouched、importSession=null、viewMode='single'、lastCommitSnapshot=snapshots、validateProjectForRenderer 重跑

**测试 (≥4):** 成功路径、patch 失败回滚（importSession 保留）、dirtyPaths 同步、validation 重跑

---

#### Task 9: useArxmlStore — cancelImport + undoLastCommit + isDirty 扩展

**Files:**
- Modify: `src/renderer/store/useArxmlStore.ts`
- Modify: `src/renderer/store/__tests__/useArxmlStore.importSession.test.ts`

**工作:**
- 新 action: `cancelImport()` — importSession=null、viewMode='single'、documents 不变（不弹 confirm）
- 新 action: `undoLastCommit()` — 用 lastCommitSnapshot 还原 documents + dirtyPaths 清理
- 扩展 `isDirty()` 函数：`dirtyPaths.size > 0 || importSession !== null`
- lastCommitSnapshot 在下次 commit 或 save 时清掉

**测试 (≥3):** cancelImport 状态复位、undoLastCommit 还原、isDirty 含 importSession

---

### Phase 4 — UI 组件

#### Task 10: ImportEntry.tsx + FileListTab 入口

**Files:**
- Create: `src/renderer/components/ImportEntry.tsx`
- Create: `src/renderer/components/__tests__/ImportEntry.test.tsx`
- Modify: `src/renderer/components/FileListTab.tsx` (加 [Import…] 按钮)

**工作:**
- ImportEntry: 触发 dialog.showOpenDialog (multi, .arxml filter)，返回 paths → store.startImport
- 通过 preload bridge `openArxmlMultiDialog` (已有，F1 复用)
- FileListTab 加 `[Import…]` 按钮在 files 列表头部
- dirty 时点击 → ConfirmDialog 走现有 unsaved 保护（useProjectActions 已有逻辑）

**测试 (≥4):** 按钮渲染、点击触发 dialog、multi-select 返回 N path、cancel 0 file 不调用

---

#### Task 11: ModuleSelectionPanel.tsx

**Files:**
- Create: `src/renderer/components/ModuleSelectionPanel.tsx`
- Create: `src/renderer/components/__tests__/ModuleSelectionPanel.test.tsx`

**工作:**
- 列出所有 incoming module：sourceFile + moduleShortName + path + 撞名 badge
- 每行 checkbox + openDiff 按钮（勾选后启用）
- 状态：unselected / selected / collision-existing
- 撞名 badge: `t(locale, 'app.import.collision.badge')`
- Commit 按钮在 ModuleSelectionPanel 底部（≥1 个 selected 时启用）

**测试 (≥4):** module 列表渲染、撞名 badge、勾选触发 store action、Commit 按钮启用条件

---

#### Task 12: DiffTable.tsx (lazy diff)

**Files:**
- Create: `src/renderer/components/DiffTable.tsx`
- Create: `src/renderer/components/__tests__/DiffTable.test.tsx`

**工作:**
- 三栏布局: existing | incoming | 决策 radio
- 每行 resolution radio: keepExisting / overwrite / keepBoth / skip
- 嵌套 container 展开 / 折叠
- param override 行高亮差异值（红/绿对比）
- 仅在打开时调 buildModuleDiff（lazy），结果缓存到 session.activeModuleForDiff
- 改 radio → store.resolveModule(mergedPath, resolution, containerResolutions?)

**测试 (≥5):** 三栏渲染、默认 resolution、改 radio 触发 store action、嵌套展开、param 高亮

---

#### Task 13: App.tsx 挂载 + viewMode 路由

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/store/useArxmlStore.ts` (viewMode 三态互斥逻辑)

**工作:**
- App.tsx 在 viewMode='import-merged' 时：
  - Tree 显示 buildMergedView(targetDocs, session) 的结果
  - 隐藏 Combined 入口 / Save 按钮（已 commit 才能 save）
- viewMode 三态互斥：试图切到 'combined' 时 toast 'view-mode-locked'（已有 viewMode 字段，扩展 guard）
- import-merged 视图下 ParamEditor 仍可用（编辑 merged view 的内存态，commit 时才写入）

**测试 (≥2):** viewMode 三态切换、import-merged 隐藏 Save/Combined

---

### Phase 5 — E2E + Baseline

#### Task 14: Playwright E2E — happy + abort path

**Files:**
- Create: `tests/e2e/import-flow.spec.ts`

**工作:**
- happy path: 启动 app → FileListTab [Import…] → mock dialog 返回 2 fixtures (CanIf + EcuC) → ModuleSelection 勾选 CanIfConfig → DiffTable 选 overwrite → Commit → ConfirmDialog → 验证 target doc 更新 + dirtyPaths +1
- abort path: 启动 → Import → ModuleSelection → Cancel → 验证 viewMode='single'、documents 不变
- 用 `playwright/_electron.ts` 已有 setup（如果存在）或 vitest renderer 测试

**测试 (≥2):** happy path 全流程、abort path 不污染 store

---

#### Task 15: scripts/verify.mjs stage 7 + 最终全量验证

**Files:**
- Modify: `scripts/verify.mjs` (加 stage 7 import regression)
- Modify: `scripts/verify.mjs` (加 importMergeRoundTrip guard)

**工作:**
- stage 7: 加载 CanIf + EcuC fixtures → 模拟 startImport → compileResolutionToPatches → applyPatchesToDocument → serialize → parse → 验证 byte-identical (round-trip)
- 加 baseline guard：`importMergeRoundTrip: 'byte-identical'`
- 最终全量：`pnpm test:coverage` 必须 ≥ 当前 baseline（876 tests / 97.52%）
- code-reviewer agent 评审所有新增文件

**测试 (≥1):** stage 7 通过；876+ tests 不退化

---

## 关键依赖与顺序

```
Task 1 (types)  ─┐
                  ├─→ Task 3 (diff) ─→ Task 4 (merge) ─→ Task 5 (patch) ─┐
Task 2 (i18n) ───┘                                                        │
                                                                           ▼
                                                            Task 6 (startImport)
                                                                           │
                                                                           ▼
                                              Task 7 (select/resolve/diff) │
                                                                           │
                                                                           ▼
                                              Task 8 (commitImport) ──────┤
                                                                           │
                                                                           ▼
                                              Task 9 (cancel/undo/isDirty)
                                                                           │
                                                                           ▼
                                              Task 10/11/12 (UI) ←───────┘
                                                                           │
                                                                           ▼
                                              Task 13 (App routing)
                                                                           │
                                                                           ▼
                                              Task 14 (E2E) → Task 15 (verify)
```

**Critical Path:** 1 → 3 → 5 → 6 → 8 → 12 → 13 → 14 → 15 (9 tasks 串行)
**Parallelizable:** Task 2 (i18n) 可与 Task 1-5 任一并行；Task 4 (merge) 可与 Task 7-9 部分并行

---

## 验收门禁 (Per spec §11)

- [ ] core/import 单元测试 ≥24 用例，覆盖率 ≥95% stmts / ≥85% branches
- [ ] store importSession 集成测试 ≥10 用例，状态机全覆盖
- [ ] UI 组件测试 ≥10 用例
- [ ] Playwright E2E ≥2 用例通过
- [ ] 5 baseline fixtures 不退化（ref-cycle [0,200] / cross-ref [700,850]）
- [ ] verify.mjs stage 7 importMergeRoundTrip byte-identical 通过
- [ ] i18n parity 测试通过（zh-CN + en 各 18 key）
- [ ] 不新增 IPC channel（设计不变量）
- [ ] 不修改 ArxmlElement / ArxmlDocument 核心类型（设计不变量）
- [ ] 不修改 project.ts manifest schema（设计不变量）
- [ ] code-reviewer agent 评审通过（无 CRITICAL / HIGH）

---

## 风险与缓解 (引自 spec §10)

| # | 风险 | 缓解 |
|---|---|---|
| R1 | merged view 性能 (5+ MB ECUC) | lazy diff（点开 module 才算） |
| R2 | viewMode 三态与 dirty 保护交互 | isDirty() 显式含 importSession；离开 import-merged 单一入口 |
| R3 | patch apply 失败 rollback 边界 | snapshot 仅含 sourceFilesTouched；commitImport 失败保留 session |
| R4 | 跨文件 ref 失效 | 复用现有 9 个 validation kind；ref-dest 不动 |
| R5 | undoLastCommit 后用户继续操作 | lastCommitSnapshot 在下次 commit / save 清；store action 显式提示 |
| R6 | 与 Combined View 共存导致 UI 混乱 | FileListTab 入口互斥；viewMode 状态机硬约束 |
| R7 | multiplicity 校验缺 BSWMD | 'schema-unknown' warning；不阻止 commit |

---

## 不做 (Out-of-Scope, 引自 spec §3.2)

- 删除 target 中 existing module
- 修改 / 重写 reference dest
- 跨项目导入
- 流式大文件 diff
- BSWMD 自动加载
- 删除 / rename target module
- 实时多人协作

---

## 关联文件

### Spec
- `docs/superpowers/specs/2026-06-18-ecuc-arxml-import-design.md` (commit `ef6430a`)

### 复用源（不修改）
- `src/core/arxml/{types,parser,serializer,path}.ts`
- `src/renderer/store/useArxmlStore.ts:863` (`computeDisplayDoc`)
- `src/renderer/store/useArxmlStore.ts:894` (`wrapPackageUnderSegment`)
- `src/renderer/store/useArxmlStore.ts:983` (`stripCombinedPrefix`)
- `src/main/ipc/parseArxmlHandler.ts:42` (`ARXML_MAX_BYTES`)
- `src/core/validation/` (`validateProjectForRenderer`)
- `src/renderer/components/tree/{Tree,TreeNode}.tsx`
- `src/renderer/hooks/useProjectActions.ts` (dirty 保护)

---

**Plan 状态**: draft。User 批准后按 Task 顺序逐个执行（TDD: write test → run → implement → run → commit）。