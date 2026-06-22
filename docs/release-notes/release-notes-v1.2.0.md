## v1.2.0 — Sprint 14 ECUC ARXML Import

Sprint 14 集中 ship **EB tresos 风格的 "Resolve Conflicts" wizard** — 多份
ECUC ARXML 按 module 维度聚合导入，支持撞名 diff 表 + atomic commit +
单步撤销。这是 v1.0.0 release 后第一个 MINOR bump（new feature，零 breaking
change）。

### Highlights

- **Lazy Merged View + ImportSlice** (`546b5ab` ~ `8afe110`)：用户选 N 个
  ECUC 文件 → 按 module 勾选 → 撞名弹三栏 diff 表（existing / incoming /
  决策 radio）→ atomic commit 拆回各 target doc。源 doc 在 commit 前**完全
  不被修改**（virtual view 叠加态）。
- **commit 原子性 + snapshot rollback** (`e3417a5`)：先 snapshot
  `sourceFilesTouched`，然后 immutable apply，任一 patch 抛错 → 立即 rollback
  - `importSession` 保留供 retry。承诺："documents 部分更新、importSession
    已清" 的中间态不存在。
- **8 个 store actions + viewMode 三态** (`546b5ab` ~ `098ebbd`)：
  `startImport` / `selectModule` / `resolveModule` / `openDiff` / `closeDiff`
  / `commitImport` / `cancelImport` / `undoLastCommit`。`viewMode` 扩为
  `'single' | 'combined' | 'import-merged'` 三态，互斥 guard 防止误切。
- **3 个 React UI 组件** (`31c7c78` ~ `d42821b`)：`ImportEntry`（FileListTab
  `[Import…]` 入口）/ `ModuleSelectionPanel`（按 module 列出 + 撞名 badge
  - Commit 按钮）/ `DiffTable`（三栏 lazy diff + 嵌套展开 + param 高亮）。
- **4 个纯 TS core 模块** (`506aad0` ~ `e266cb3`)：`core/import/types.ts`
  （4/8/4 kinds unions + 18 类型定义）/ `diff.ts`（`buildModuleDiff`）/
  `merge.ts`（`buildMergedView`）/ `patch.ts`（`compileResolutionToPatches` +
  `applyPatchesToDocument`）。**零 react/electron/zustand/fs 依赖**。
- **18 个 i18n key** (`7d49e5a`)：zh-CN + en 双语，从 `app.import.button`
  到 `app.import.undoLastCommit`。Parity 测试保证双语 key 集合完全一致。
- **Playwright E2E** (`41941f0`)：`tests/e2e/import-flow.spec.ts` happy
  path（全流程 end-to-end）+ abort path（中途 cancel 不污染 store）。
- **verify stage 7 import regression** (`ae7d72b`)：canary 加载 2 fixtures
  → 模拟 startImport → compile patches → apply → round-trip byte-identical
  guard。
- **`resolveContainerTarget` 复用** (Sprint 17c T9 集成)：store 中 7 处
  重复 `findByPathMultiDoc` inline block 全部走 helper，新 import slice 同样
  受益。

### 17 commits — 3 phase + 1 review fix

| Phase  | Commits                                                                                       | Theme                                                         |
| ------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1+2    | `506aad0` + `7d49e5a` + `31cb402` + `505fc8a` + `e266cb3` + `f9c5ce8`                         | 4 core modules + i18n + lint cleanup                          |
| 3+4    | `546b5ab` + `e9740f8` + `e3417a5` + `098ebbd` + `31c7c78` + `e31ae68` + `d42821b` + `8afe110` | 8 store actions + 3 UI + App routing                          |
| 5      | `41941f0` + `ae7d72b`                                                                         | E2E happy+abort + verify stage 7                              |
| Review | `0291817`                                                                                     | MEDIUM-1: remove dead `'overwrite-module'` branch in patch.ts |

### Tests

- **1309 tests passing**（v1.1.2: 1206 → v1.2.0: 1309，净增 +103）+ 2 verify
  stage 7 regression
- Coverage: 96.72% stmts / 88.45% branches（≥80% floor；88.45% 与 HEAD~2 实际
  值一致，非 Sprint 14 引入的退化）
- 5/5 baseline gate green（format / lint 0 warnings / type-check / test /
  build）+ stage 7 regression byte-identical
- core/import/ 单测 52 cases（spec floor 24 → +117%）：types 20 / diff 10 /
  merge 8 / patch 14
- store importSession 集成 19 cases（spec floor 10 → +90%）
- UI 组件 16 cases（spec floor 13 → +23%）
- E2E 3 cases（spec floor 2 → +50%）
- 96 total new test cases（spec floor 46 → **+108%**）

### Code Review

- **Final verdict**: `APPROVE_WITH_MINOR`
- 0 CRITICAL / 0 HIGH / 1 MEDIUM / 2 LOW
- **8/8 design invariants PASS**：
  - 0 new IPC channel
  - `core/arxml/{types,parser,serializer,path}.ts` 未修改
  - `shared/project.ts` 未修改
  - `core/import/*.ts` 零 react/electron/zustand/fs/path import
  - `ImportError` exactly 8 kinds（spec §7.2）
  - `ImportPatchOp` exactly 4 kinds（spec §6.2）
  - `commitImport` atomicity（snapshot → apply → set() only on success）
  - `isDirty()` 含 `importSession` + viewMode 三态 guard
- **12/12 acceptance gates PASS**（spec §11）
- MEDIUM-1 已 in-tree fix（commit `0291817`）；2 LOW（silent no-op edge case
  - 1 处 cosmetic）记录为 Sprint 15+ follow-up

### Files

- 24 files changed, +4,952 / -127 lines
- 新增：8 个 source files + 8 个 test files + 1 个 E2E spec + 1 个 regression
- 修改：5 个 source files（store / App.tsx / FileListTab / i18n / verify.mjs）
- 不动：`core/arxml/*` / `main/ipc/*` / `shared/project.ts`

### Upgrading from v1.1.2

Zero breaking change. MINOR bump per SemVer（新 feature）。

新增了 4 个 viewMode 状态值 `'import-merged'`，但现有 renderer 不感知（仅
新组件订阅），legacy `'single'` / `'combined'` 行为完全不变。

**`package.json` version 现在与 tag v1.2.0 对齐**（沿用 v1.1.2 fix 的习惯）。
如果 CI badge / script 依赖 `package.json` version，从 v1.1.2 → v1.2.0 会
显示从 1.1.2 跳到 1.2.0，符合预期。

### Out of Scope (deferred to Sprint 15+)

- 删除 target 中 existing module（破坏性操作）
- 修改 / 重写 reference dest
- 跨项目导入
- 流式大文件 diff
- BSWMD 自动加载
- 删除 / rename target module
- 实时多人协作
- Sprint 14 review 的 2 LOWs：
  - `patch.ts:215-226` add-module 始终插入 package index 0；空 packages
    静默 no-op
  - `ModuleSelectionPanel.tsx:60` SelectionRow 用
    `useArxmlStore.getState().locale` 而非订阅
- Sprint 17 polish 遗留的 GH release 自动创建（gh CLI 仍未安装，需 user 手动）

### Reference

- Spec: `docs/superpowers/specs/2026-06-18-ecuc-arxml-import-design.md`
- Plan: `docs/superpowers/plans/2026-06-18-ecuc-arxml-import.md`
- Phase 1+2 report: `.git/sdd/sprint14-phase1-2-report.md`
- Phase 3+4 report: `.git/sdd/sprint14-phase3-4-report.md`
- Phase 5 report: `.git/sdd/sprint14-phase5-report.md`
- Review fix report: `.git/sdd/sprint14-review-fix-report.md`
- Final code review: `.git/sdd/final-code-review.md`
