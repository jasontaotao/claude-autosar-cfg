# Sprint 13+ Master Roadmap

> **For agentic workers:** 本计划是 roadmap，**不**是单一 feature 的实施 plan。每个 Stage 引用一个或多个子 plan；执行时打开子 plan 逐步走。

**Goal:** 把所有未做的 plan（4 个子 plan + Sprint 12 #3 Phase 1/2/3 simplifications + Sprint 12 backlog）整合成 5 阶段有序 roadmap，按依赖和价值排序，依次 ship。

**Architecture:** 5 stages — 修 bug + 解析能力 → 模板 backend 基础设施 → UI 重构 + Sprint 12 #3 收尾 → i18n 抛光 → release 收尾（#7/#8/#9 + v1.0.0 tag）。

**Tech Stack:** Electron 30 + TypeScript 5 strict + React 18 + Vite 5 + Zustand 4 + fast-xml-parser 4 + Tailwind 3 + Vitest 1 + Playwright 1.45 + pnpm 11 + Node 22.13+ — 与现有 stack 一致。

---

## 起点状态（2026-06-17）

| 项                     | 状态                                                     |
| ---------------------- | -------------------------------------------------------- |
| `local HEAD`           | `bb80206` LeftPanel + FileListTab components with tests  |
| `origin/main HEAD`     | `9d5ea6d` Sprint 12 #3 (v0.13.0) + version set extension |
| `local vs origin/main` | **16 commits ahead, 0 behind**                           |
| Uncommitted WIP        | 13 modified + 10 untracked（见下）                       |
| Version                | v0.13.0 (memory: 已 pushed 2026-06-17)                   |
| Tests                  | 640 / 96.47% stmts / 85.45% branches / 100% funcs        |

**未提交 WIP 分布**（**不**在主计划范围内，由 user 单独决定如何处理）：

- `src/renderer/components/AppHeader.tsx` + `__tests__/` + `styles.css` + `App.tsx` + `useProjectActions.ts` + `i18n.ts` → **Left-panel plan Tasks 4-5**（独立 commit）
- `ErrorBanner.{tsx,css}` + `ErrorViewerModal.tsx` + `__tests__/ErrorBanner.test.tsx` → **未识别**（不是现有 plan 的一部分；user 须解释来源）
- `src/core/arxml/types.ts` + `parser.tresos422.test.ts` + `src/core/project/bswmd.ts` + `__tests__/bswmd.tresos422.test.ts` + `src/main/ipc/bswmdReadHandler.ts` + `__tests__/bswmdRead.test.ts` + `register.ts` + `preload/index.ts` → **未识别**（可能是 namespace+BSWMD-strict 后继，或者新方向）
- `docs/combined-tree-view-plan.md` + `docs/left-panel-tabs-proposal.html` → **plan 文档**（前者已纳入本 roadmap Stage 3；后者是 design 提案，可选 commit）

**进入 Stage 1 之前**：user 必须先决定 WIP 处置——是 (a) commit 进对应 plan 的延续，还是 (b) `git stash` 后开干净 main，还是 (c) 重新设计。主计划假设 WIP 已被处理，进入干净状态。

---

## Stage 1 — 解析能力 + 验证增强

**目标**：修 3 个解析 bug + 加 schema-unknown 验证 + 推 origin/main 同步

**依赖**：无

**子 plans**：

- **Sprint 13 namespace+BSWMD-strict** (Tasks 2-7) — `docs/superpowers/plans/2026-06-17-autosar-namespace-and-bswmd-strict.md`
  - **状态**：Tasks 1 (version union + SUPPORTED) 已 ship in local（`9d5ea6d`），但**未 push**。Tasks 2-7 全部 ship in local（`084154a`...`c49d1ab`）但**未 push**。
  - **本 Stage 行动**：`git push` 全部 13 个 namespace+BSWMD-strict commit。无需重做。
  - **追溯**：`084154a` (XSD_PATTERN 5-digit) + `63b66de` (strict reject BSWMD) + `f0ac56c` (serializer lookup table) + `25b6ac9`/`6e4bbe2`/`22f4fca`/`ebdd6d6`/`c49d1ab` (tests) + `00a3dfc`/`3ab446c` (polish) + `fa07617` (templates plan docs) + `8cefcd1` (templates design docs) + `25b6ac9` (test fixes)
  - **注意**：commit `fa07617` (templates plan) + `8cefcd1` (templates design) 混在本批 push 内——可以，但**不**符合 plan-grouping 习惯。建议单独 push 这 2 个 docs commit。
- **Sprint 9 #15 `schema-unknown`** — 无现存 plan，需新写
  - **范围**：`src/core/validation/lookupSchema` unknown path silent skip → emit `schema-unknown` ValidationErrorKind
  - **位置**：与 Sprint 12 #2 runtimeSchema 集成，独立可 ship
  - **预估**：~30 min（4-5 task 的小 plan）

**Ship gate**：

- local 与 origin/main 同步（除 16 commits 已 push 外）
- pnpm test 仍 640 + 16 new = 656+（具体看 unmerged 改了多少）
- pnpm verify 5/5 baseline 仍绿

**Version bump**：无（push 不改 version）

**预估时间**：~15 min（just push + 写 schema-unknown plan + ship 它）

---

## Stage 2 — 模板 backend 基础设施

**目标**：在 main 进程做 built-in template 发现 + 拷贝 infrastructure（无 UI），让 Stage 3 的 TemplateCard UI 直接调用现成 IPC

**依赖**：Stage 1（push 同步保证 clean baseline）

**子 plan**：

- **Sprint 13 #1 templates backend** (12 tasks) — `docs/superpowers/plans/2026-06-17-sprint-13-1-templates-backend.md`
  - **状态**：plan 完整，design spec 完整。**未开工**。
  - **任务清单**（来自子 plan）：
    1. Types + Errors 基础（types.ts + errors.ts）
    2. parseTemplateManifest type guard + 5 tests
    3. walkArxml + discoverBuiltinTemplates + 9 tests + 6 fixture dirs
    4. copyTemplateFilesToDir + 5 tests
    5. index.ts barrel re-exports
    6. IPC types + channel constants（TEMPLATES_LIST + TEMPLATES_COPY）
    7. templatesHandler + 6 tests
    8. Register handlers in register.ts + boot wiring in main/index.ts
    9. Preload bridge（listTemplates + copyTemplate）
    10. i18n keys 6 new
    11. package.json extraResources
    12. samples/README.md case-flip hygiene
    13. Final verify + version bump + CHANGELOG + push
  - **测试增量**：+25（5+9+5+6），总 640 → 665
  - **预估时间**：~110 min（按 plan 估算）
  - **关键 spec**：`docs/superpowers/specs/2026-06-17-sprint-13-1-templates-backend-design.md`

**Ship gate**：

- 665 tests pass
- Coverage ≥ baseline（96.47% stmts / 85.45% branches / 100% funcs）
- 5/5 baseline 保持 + 新增 `samples/arxml/.gitkeep exists` 检查
- pnpm build 成功

**Version bump**：v0.13.0 → **v0.14.0**（MINOR — feature release, no UI change but new IPC contract）

**入口文档**：子 plan Task 13 Step 8 要求回填 memory。本 Stage ship 后 memory 应更新到 v0.14.0。

---

## Stage 3 — UI 重构 + Sprint 12 #3 收尾

**目标**：完成 Left-panel 完整重构 + 清掉 Sprint 12 #3 Phase 1 简化项 + 接 templates UI

**依赖**：Stage 2（template IPC 必须就绪才能接 TemplateCard UI）

**子 plans**：

### 3.1 Left-panel 重构收尾

- **子 plan**：Left-panel Tasks 4-6 — `docs/superpowers/plans/2026-06-17-left-panel-tabs-refactor.md`
- **状态**：Tasks 1-3 已 ship in local（`38d4c43` / `1de85c0` / `bb80206`）但**未 push**。Tasks 4-6 WIP 在 working tree（13 modified files 里）。
- **本 Stage 行动**：
  - 完成 Task 4（AppHeader 下拉菜单 WIP）— 独立 commit
  - 完成 Task 5（LeftPanel 接入 App.tsx 替换堆叠布局 WIP）— 独立 commit
  - 完成 Task 6（收尾验证 + PROGRESS 回填 + push）
- **追溯 uncommitted WIP**（供参考）：
  - `src/renderer/components/AppHeader.tsx` + `__tests__/AppHeader.test.tsx` + `styles.css` + `i18n.ts` → Task 4
  - `src/renderer/App.tsx` + `__tests__/App.test.tsx` → Task 5
  - `src/renderer/hooks/useProjectActions.ts` → 可能是 left-panel 相关，也可能是 dirty-switch refactor
- **测试增量**：+9（LeftPanel 5 + FileListTab 4 = 9 新增，-M ProjectPanel.bswmd 删 = 净 +K），待 final count
- **预估时间**：~40 min（commit WIP + verify + push）

### 3.2 Sprint 12 #3 Phase 1 简化清理

- **来源**：Sprint 12 #3 code review 的 5 项 Phase 1 simplification，**无现存 plan**，需新写
- **范围**（来自 memory）：
  1. `'saveAndProceed'` button 真实实现（当前返回 canceled）
  2. `'overwrite-confirm'` IPC result 改回二次 confirm dialog
  3. `store.pendingAction` 死代码清理
  4. `confirm.unsaved.message` per-action i18n（当前硬编码 "新建项目" 文案 for all 4 switching actions）
  5. `overwrite-confirm` hook i18n key
- **预估**：~45 min（5 task 的小 plan）

### 3.3 Sprint 12 #3 Phase 2 — TemplateCard UI

- **范围**：新建 `TemplateCard` 组件 + `templates.ts` + 集成到 NewProjectDialog
  - 用户新建项目时显示 3 张卡：Empty / Classic (coming soon) / Clone (coming soon)
  - 用 Stage 2 的 `templates:list` IPC 拉列表
  - Empty 立即可创建；Classic / Clone 占位 disabled with "coming soon" 文案
- **来源**：Sprint 12 #3 plan §"Phase 2 (Sprint 13 #1)" + Sprint 13 #1 templates backend plan 隐含引用
- **无现存 plan**，需新写
- **i18n**：6 个 templates 键已 ship（Stage 2 Task 10），本 Stage 直接用
- **预估**：~60 min（4-5 task plan）

### 3.4 Sprint 12 #3 Phase 3 — BSWMD chips

- **范围**：新建 `BswmdChip` 组件 + 集成到 NewProjectDialog + 创建项目后自动 addBswmd
  - 用户在 Classic 模板下看到可多选 BSWMD 模块
  - 创建项目时把选中的 BSWMD 路径写进 `project.bswmdPaths`
- **依赖**：Stage 2 (templates backend 暴露 bswmdPaths) + Stage 3.3 (TemplateCard 集成)
- **无现存 plan**，需新写
- **预估**：~50 min（4 task plan）

### 3.5 Combined Tree View

- **子 plan**：`docs/combined-tree-view-plan.md`
- **状态**：plan 完整，**"待确认"** 状态，**未开工**
- **范围**（9 步 Phase 1-7）：
  - Phase 1 核心：`buildCombinedDocument` + `findByPathMultiDoc`
  - Phase 2 store：`viewMode: 'single' | 'combined'` + `displayDoc`
  - Phase 3 Tree：displayDoc 替换 doc
  - Phase 4 入口：FileListTab 顶部 `[Combined]` 虚拟条目
  - Phase 5 ParamEditor：combined 模式路径解析
  - Phase 6 打磨：聚合统计 + dirty 标记
  - Phase 7 测试
- **依赖**：与 3.1 Left-panel 重叠（FileListTab 改造）—— **执行顺序**：先 3.1 ship，再开始 3.5
- **状态门槛**：user 须先拍板"是否要做"（plan 自带"待确认"）—— 本 Stage **不自动 ship**，仅在 user 拍板后开工
- **预估**：~120 min（9 step plan）— 假设 6 个新文件 + 现有 2 个 test 扩展

**Ship gate（整个 Stage 3）**：

- 所有 5 个 sub-stage 各自的 ship gate 满足
- pnpm test 全绿
- pnpm verify 5/5 baseline 保持
- local 累积 5-10 commits，**分阶段 push**（每个 sub-stage 一个 push）

**Version bump**：v0.14.0 → **v0.15.0**（MINOR — UI 重构 + 多个 feature release）

**注意**：Stage 3.1, 3.2, 3.3, 3.4, 3.5 互相依赖关系：

- 3.1 独立（Left-panel 收尾）
- 3.2 独立（Phase 1 cleanup）
- 3.3 依赖 3.1（FileListTab 在 NewProjectDialog 里）+ 依赖 Stage 2（templates IPC）
- 3.4 依赖 3.3
- 3.5 依赖 3.1（FileListTab）
- 3.5 **不依赖** 3.3/3.4（独立 UI 特性）

**推荐执行顺序**：3.1 → 3.2 → 3.5 → 3.3 → 3.4（让 3.5 跟 3.1 收尾同 sprint，3.3/3.4 是 templates UI 顺延）

**预估总时间**：~315 min（3.1: 40 + 3.2: 45 + 3.3: 60 + 3.4: 50 + 3.5: 120）

---

## Stage 4 — i18n 抛光

**目标**：把 hard-coded 英文 UI 文案收归 i18n

**依赖**：无（独立小修）

**子 plans**：**全部无现存 plan**，需新写

| Item                                    | 来源              | 范围                                                                          |
| --------------------------------------- | ----------------- | ----------------------------------------------------------------------------- |
| **M6** ParamEditor column header 本地化 | Sprint 12 backlog | 改 `Param` / `Type` / `Value` 为 i18n key                                     |
| **M7** OS dialog title 本地化           | Sprint 12 backlog | IPC handler 加 `locale` 参数；main 侧 `dialog.showOpenDialog` title 用 locale |
| **M8** `formatParseError` 本地化        | Sprint 12 backlog | AppHeader parser 错误格式 i18n                                                |

**预估时间**：~60 min（3 个小 plan，各 ~20 min）

**Ship gate**：

- 4 个 locale parity test 仍 PASS
- 现有测试不受影响（参数化或显式 locale）
- pnpm verify 5/5 baseline 保持

**Version bump**：v0.15.0 → **v0.15.1**（PATCH — 抛光，无 feature 变化）

---

## Stage 5 — Release 收尾

**目标**：把项目推到 v1.0.0 release-ready 状态

**依赖**：无（独立项）

**子 plans**：**全部无现存 plan**，需新写

| Item                                          | 来源                      | 范围                                                         |
| --------------------------------------------- | ------------------------- | ------------------------------------------------------------ |
| **等价 size cap on `arxml:parse` IPC**        | Sprint 12 reviewer MEDIUM | 8 MiB cap 加到 arxml:parse（与 BSWMD_READ/BSWMD_PARSE 对齐） |
| **default-value 跨 enumerationLiterals 校验** | Sprint 12 backlog         | push warning if `<DEFAULT-VALUE>` 不在 literal set           |
| **`<CHOICES>` 递归深度上限**                  | Sprint 12 backlog         | 防御 pathological vendor file stack overflow                 |
| **#7 fixture 体积管理**                       | Sprint 12 backlog         | 9.2MB → git-lfs / slim down（不阻塞）                        |
| **#8 electron-builder 打包 + v1.0.0 tag**     | Sprint 12 backlog         | 全量打包、签名、生成 release artifacts                       |
| **#9 coverage ≥90%**                          | Sprint 12 backlog         | branches 从 85.45% 推到 ≥90%                                 |

**预估时间**：

- size cap + validators: ~60 min
- fixture slim: ~30 min
- electron-builder 打包: ~120 min（含 OS-specific 测试）
- coverage 推到 90%: ~90 min
- **总计 ~300 min**

**Ship gate**：

- 全部 6 项 ship
- pnpm test 仍 100% pass
- coverage branches ≥ 90%
- electron-builder 产出 .exe / .dmg / .AppImage
- 5/5 baseline 保持
- Tag `v1.0.0` + GitHub release

**Version bump**：v0.15.1 → **v1.0.0**（MAJOR — release-ready）

---

## 总览路线图

| Stage | 内容                                       | Version                       | 时间     | Push 节点    |
| ----- | ------------------------------------------ | ----------------------------- | -------- | ------------ |
| 1     | namespace+BSWMD-strict 推 + schema-unknown | v0.13.0 → v0.13.1 (PATCH)     | ~15 min  | Stage 1 ship |
| 2     | templates backend (12 tasks)               | v0.13.1 → **v0.14.0** (MINOR) | ~110 min | Stage 2 ship |
| 3.1   | Left-panel 收尾 (Tasks 4-6)                | v0.14.0 → v0.14.1 (PATCH)     | ~40 min  | 3.1 ship     |
| 3.2   | Sprint 12 #3 Phase 1 清理 (5 items)        | v0.14.1 → v0.14.2 (PATCH)     | ~45 min  | 3.2 ship     |
| 3.3   | TemplateCard UI (4-5 tasks)                | v0.14.2 → v0.14.3 (PATCH)     | ~60 min  | 3.3 ship     |
| 3.4   | BSWMD chips (4 tasks)                      | v0.14.3 → v0.14.4 (PATCH)     | ~50 min  | 3.4 ship     |
| 3.5   | Combined Tree View (9 steps)               | v0.14.4 → **v0.15.0** (MINOR) | ~120 min | 3.5 ship     |
| 4     | i18n 抛光 (M6/M7/M8)                       | v0.15.0 → v0.15.1 (PATCH)     | ~60 min  | Stage 4 ship |
| 5     | Release (validators + 打包 + v1.0.0)       | v0.15.1 → **v1.0.0** (MAJOR)  | ~300 min | Stage 5 ship |

**总时间**：~800 min（≈13.3 小时，分散在多 session）

**累积 test 增量估算**：

- Stage 1: +16 (namespace+BSWMD-strict + schema-unknown) = **656**
- Stage 2: +25 = **681**
- Stage 3.1: +9 = **690**
- Stage 3.2: +5 = **695**
- Stage 3.3: +5 = **700**
- Stage 3.4: +4 = **704**
- Stage 3.5: +6 = **710**
- Stage 4: +3 = **713**
- Stage 5: +6 (validators) + coverage 推到 90% 增量 ≈ +20 = **733**

**最终**：~733 tests / 90%+ coverage / v1.0.0 release

---

## 范围外（明确不做）

- **任何 claude-autosar v2 集成**（不 import `autoc`，是独立项目）
- **FlexCFG C#/.NET 复刻**（只读设计模式）
- **macOS native menubar 集成**（Windows-first，macOS 是 nice-to-have）
- **Linux .AppImage 验证**（同上）
- **协作编辑 / 多人模式**（单机工具）
- **CI/CD pipeline**（GH Actions 已经存在但未启用；不是本 roadmap 范围）

---

## Self-Review

**1. 子 plan 覆盖率**：

- ✅ 4 个未做子 plan（Sprint 13 namespace+BSWMD-strict / Sprint 13 #1 templates / Left-panel / Combined Tree View）— 全部整合
- ✅ Sprint 12 #3 Phase 1/2/3 simplifications — Stage 3 收编
- ✅ Sprint 12 backlog（#7/#8/#9, M6/M7/M8, size cap, validators, choices depth）— Stage 4/5 收编
- ✅ Sprint 9 #15 schema-unknown — Stage 1 收编

**2. 依赖排序正确性**：

- ✅ Stage 1 → Stage 2（push 同步 + 解析稳定后做 backend）
- ✅ Stage 2 → Stage 3（template IPC 必须在 TemplateCard 之前）
- ✅ Stage 3 内部 3.1 → 3.5/3.3（FileListTab 改造是前置）
- ✅ Stage 3.3 → 3.4（chips 依赖 card）
- ✅ Stage 4 独立
- ✅ Stage 5 独立

**3. Placeholder scan**：无 "TBD" / "TODO" / "fill in" — Stage 1 2 3 4 5 全部引用具体子 plan 路径

**4. Version bump 合理性**：

- v0.13.0 → v0.13.1（push only, PATCH）
- v0.13.1 → v0.14.0（new IPC, MINOR）
- v0.14.x → v0.15.0（UI 重构, MINOR）
- v0.15.0 → v0.15.1（i18n 抛光, PATCH）
- v0.15.1 → v1.0.0（release-ready, MAJOR）
- ✅ semver 规范遵循

**5. 风险识别**：

- **风险 1**：Combined Tree View 计划 "待确认"——已显式标注 user 须拍板
- **风险 2**：uncommitted WIP 含未识别组件（ErrorBanner / ErrorViewerModal / tresos422 handler）—— 已显式标注 user 须决定
- **风险 3**：Left-panel WIP 与 Stage 3.1 任务清单可能不完全对齐（working tree 的 hooks/useProjectActions.ts 改动不在 plan 里）—— 已显式标注
- **风险 4**：Combined Tree View 计划 line 引用 path（如 `path.ts` 路径）未在 Stage 1-2 push 中验证—— Stage 3.5 开工前须先核 path 实际位置
- **风险 5**：push `Recv failure: Connection was reset` 网络问题——保留 memory 的 unset proxy workaround

**6. 执行策略建议**：

- **强烈推荐 subagent-driven**：每个 Stage / sub-stage 单独 subagent，避免 context 爆炸
- **每个 sub-stage ship 后立即 push**：与 Sprint 12 #1 #2 #3 经验一致（多次 push，已知稳定）
- **Code review 在每个 sub-stage 末尾**：CLAUDE.md 规则要求 "改完代码自动审"
- **Test 在每个 task 末尾**：TDD 流程（RED → GREEN → IMPROVE）
- **memory 在每个 Stage ship 后更新**：保持 memory 与代码同步

---

## 怎么使用本 plan

1. **进入 Stage N 前**：先 `git pull --rebase` 拉 origin/main 最新
2. **打开对应子 plan 文件**：按子 plan 的 task 步骤执行
3. **子 plan ship 后**：回到本 plan 标记该 sub-stage 完成
4. **本 Stage 全部 sub-stage ship 后**：version bump + push + 更新 memory
5. **进入下一 Stage 前**：再走一次 5/5 baseline verify

**配套子 plan 索引**：

- `docs/superpowers/plans/2026-06-17-autosar-namespace-and-bswmd-strict.md` (Sprint 13 namespace+BSWMD-strict)
- `docs/superpowers/plans/2026-06-17-sprint-13-1-templates-backend.md` (Sprint 13 #1 templates backend)
- `docs/superpowers/plans/2026-06-17-left-panel-tabs-refactor.md` (Left-panel 重构)
- `docs/combined-tree-view-plan.md` (Combined Tree View — **待 user 确认**)
- `docs/superpowers/specs/2026-06-17-sprint-13-1-templates-backend-design.md` (Sprint 13 #1 design spec)
- `docs/superpowers/specs/2026-06-17-autosar-namespace-and-bswmd-strict-design.md` (Sprint 13 design spec)
- `docs/superpowers/specs/2026-06-17-left-panel-tabs-refactor-design.md` (Left-panel design spec)

**待写 plan**（Stage 1 / 3.2 / 3.3 / 3.4 / 3.5 部分 / 4 / 5）— 见各 sub-stage "无现存 plan，需新写" 标注
