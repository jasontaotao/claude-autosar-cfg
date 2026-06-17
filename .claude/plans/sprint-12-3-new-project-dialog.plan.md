# Plan: Sprint 12 #3 — 新建项目统一弹窗

**Source**: `mockup/new-project-dialog.html` + user-supplied plan (14 tasks / 26 files / 3 phases)
**Complexity**: Medium
**Target version**: v0.13.0 (Sprint 12 #3 MINOR bump on top of v0.12.0)

## Pre-flight: Commit Sprint 12 #2 first (推荐)

**Sprint 12 #2 还在 working tree, 515 tests pass, v0.12.0 已 bump 但未 commit。** 强烈建议:

- **Phase 0**: commit Sprint 12 #2 (`feat(sprint12-2): BSWMD renderer integration (v0.12.0)`) — 9 tasks 完成
- 然后做 Sprint 12 #3 (v0.13.0 MINOR bump)

**Why**: 避免 working tree 同时有 #2 和 #3 改动 → commit 粒度清晰 / git history 干净 / Phase 1 的 pickDir IPC / projectNew 重构 / ConfirmDialog 等不与 #2 改动互相影响。

**Alternative** (user 拍板): 把 #2 + #3 一起 ship v0.12.0 (合并 1 个 commit, 但 #2 实际已是 v0.12.0, 不再 bump) — 风险是 #3 太大, 一次 commit 难 review.

## Summary (Sprint 12 #3 全部)

把现有两步新建项目 (`PromptDialog.prompt()` 输入名 → OS `showSaveDialog` 选路径) 合并为单一自绘 `NewProjectDialog` (Catppuccin Mocha 风格, 3 variants from mockup)。加 3 个 cross-cutting 改动: dirty 状态未保存保护 / 项目名实时验证 (空名 + 非法字符 + 超长 + 重名) / 目录选择 IPC (`project:pickDir`)。Phase 2 加模板 (empty/classic/clone) + Phase 3 加 BSWMD 模块多选。

## Phases (增量交付)

### Phase 1 — 统一弹窗 + 验证 + dirty 保护 (核心, 9 tasks)

| #   | Task                                                                                                                                                                 | Files                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------- |
| 1   | `NewProjectDialog` 组件 (Catppuccin Mocha, portal + overlay, 3 input sections)                                                                                       | `components/NewProjectDialog.{tsx,css}`                             |
| 2   | `validateProjectName(value)` 纯函数 (空 / 非法字符 `<>:"/\\                                                                                                          | ?\*` / >64 / 重名)                                                  | `NewProjectDialog.tsx` 内 |
| 3   | `project:pickDir` IPC (`dialog.showOpenDialog({ properties: ['openDirectory'] })`)                                                                                   | `ipc-contract.ts` + `types.ts` + `register.ts` + `preload/index.ts` |
| 4   | `ProjectNewRequest` 扩展 `directory: string`, 移除 OS save dialog, 改 main handler 拼 `.autosarcfg.json`, 加 `'overwrite-confirm'` result kind                       | `types.ts` + `register.ts`                                          |
| 5   | `useProjectActions.newProject` 重写: 打开 NewProjectDialog → 收集 {name, directory} → IPC                                                                            | `useProjectActions.ts`                                              |
| 6   | `ConfirmDialog` 组件 (3 按钮: 继续编辑 / 不保存新建 / 保存并新建)                                                                                                    | `components/ConfirmDialog.{tsx,css}`                                |
| 7   | Store `isDirty` getter (`dirtyPaths.size > 0`) + dirty 保护集成到 **all switching actions** (newProject / openProject / addBswmd / removeBswmd 都触发 ConfirmDialog) | `useArxmlStore.ts` + `useProjectActions.ts`                         |
| 8   | `App.tsx` 挂载 NewProjectDialog + ConfirmDialog root; i18n ~15 新 keys                                                                                               | `App.tsx` + `i18n.ts`                                               |
| 9   | Playwright E2E + code-reviewer + PROGRESS + CHANGELOG + version 0.13.0                                                                                               | E2E + docs + version                                                |

### Phase 2 — 模板 (3 tasks, Sprint 13 #1)

| #   | Task                                                            | Files                                                 |
| --- | --------------------------------------------------------------- | ----------------------------------------------------- |
| 10  | `TemplateCard` 组件 + `templates.ts` (empty/classic/clone 定义) | `components/TemplateCard.tsx` + `shared/templates.ts` |
| 11  | Classic 模板预填 bswmdPaths                                     | `types.ts` + `register.ts`                            |
| 12  | Clone 模板 (`project:clone` IPC, 二级文件选择)                  | `register.ts` + `types.ts`                            |

### Phase 3 — BSWMD 模块多选 (2 tasks, Sprint 13 #2)

| #   | Task                                                    | Files                            |
| --- | ------------------------------------------------------- | -------------------------------- |
| 13  | `BswmdChip` 组件 (pill, 选中态高亮)                     | `components/BswmdChip.tsx` + CSS |
| 14  | NewProjectDialog 集成 BSWMD chips + 创建后自动 addBswmd | `NewProjectDialog.tsx` + store   |

## Patterns to Mirror

| Category     | Source                                    | Pattern                                                          |
| ------------ | ----------------------------------------- | ---------------------------------------------------------------- |
| Dialog       | `PromptDialog.tsx` (1-30)                 | `createPortal` + `externalSetState` + promise resolve            |
| Hook         | `useProjectActions.ts:36-63`              | `prompt → IPC → store.openProject → error translation`           |
| IPC handler  | `register.ts:160-191` `PROJECT_NEW`       | `dialog.showSaveDialog` + `createEmptyManifest` + `fs.writeFile` |
| IPC contract | `ipc-contract.ts` + `types.ts`            | channel name constant + discriminated union result               |
| Store action | `useArxmlStore.ts:314-357` `openProject`  | parse docs + set state + re-validate                             |
| Validation   | `manifest.ts:classifyBadPath`             | pure function `null \| error string`                             |
| i18n         | `i18n.ts:78-89`                           | zh/en key parity, `{param}` template                             |
| Test         | `components/__tests__/AppHeader.test.tsx` | `@testing-library/react` + render + `getByTestId`                |

## Files to Change (Phase 1)

| File                                                          | Action | Why                                                                                  |
| ------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `src/renderer/components/NewProjectDialog.tsx`                | CREATE | 统一弹窗组件 (Variant A 起步, Phase 2/3 扩展)                                        |
| `src/renderer/components/NewProjectDialog.css`                | CREATE | Catppuccin Mocha 样式 (参照 mockup CSS)                                              |
| `src/renderer/components/ConfirmDialog.tsx`                   | CREATE | 未保存保护 (Variant C)                                                               |
| `src/renderer/components/ConfirmDialog.css`                   | CREATE | ConfirmDialog 样式                                                                   |
| `src/shared/ipc-contract.ts`                                  | UPDATE | `PICK_DIR: 'project:pickDir'`                                                        |
| `src/shared/types.ts`                                         | UPDATE | `PickDirRequest/Result` + `ProjectNewRequest.directory` + `'overwrite-confirm'` kind |
| `src/main/ipc/register.ts`                                    | UPDATE | `PICK_DIR` handler + `PROJECT_NEW` 改用 directory 拼接 + overwrite check             |
| `src/preload/index.ts`                                        | UPDATE | 暴露 `pickDir`                                                                       |
| `src/renderer/hooks/useProjectActions.ts`                     | UPDATE | `newProject` 重写 (移除 `prompt()`, 打开 NewProjectDialog)                           |
| `src/renderer/store/useArxmlStore.ts`                         | UPDATE | `newProjectDialogOpen` / `confirmDialogOpen` state + `isDirty` getter                |
| `src/renderer/App.tsx`                                        | UPDATE | 挂载 NewProjectDialog + ConfirmDialog root                                           |
| `src/shared/i18n.ts`                                          | UPDATE | ~15 新 keys (zh/en parity)                                                           |
| `src/renderer/components/__tests__/NewProjectDialog.test.tsx` | CREATE | 验证 + 渲染 + 交互                                                                   |
| `src/renderer/components/__tests__/ConfirmDialog.test.tsx`    | CREATE | 3 按钮分支                                                                           |
| `src/main/ipc/__tests__/pickDir.test.ts`                      | CREATE | picked / canceled                                                                    |
| `src/main/ipc/__tests__/projectNew.test.ts`                   | UPDATE | 新字段 + overwrite-confirm                                                           |
| `src/renderer/hooks/__tests__/useProjectActions.test.ts`      | UPDATE | mock NewProjectDialog 流程                                                           |
| `src/renderer/store/__tests__/useArxmlStore.project.test.ts`  | UPDATE | `isDirty` getter                                                                     |
| `src/shared/__tests__/i18n.test.ts`                           | UPDATE | 新 keys parity                                                                       |
| `PROGRESS.md`                                                 | UPDATE | Sprint 12 #3 段落                                                                    |
| `CHANGELOG.md`                                                | UPDATE | 0.13.0 条目                                                                          |
| `package.json`                                                | UPDATE | version `0.12.0` → `0.13.0`                                                          |
| `tests/e2e/new-project-dialog.spec.ts`                        | CREATE | Playwright E2E                                                                       |

## Risks

| Risk                                                                           | Likelihood | Mitigation                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 重名检测需要 IPC 访问文件系统 (项目名 vs 目录下 `.autosarcfg.json` 是否已存在) | Medium     | `PROJECT_NEW` handler 加 `fs.access` 检查; 存在时返回 `'overwrite-confirm'` kind; dialog 显示红色错误 + 创建按钮 disabled; **OR** `NewProjectDialog` mount 时 fire-and-forget `pickDir` 后端, 显示后端结果 (race-y) |
| 移除 OS save dialog, 用户失去自定义文件扩展名能力                              | Low        | `.autosarcfg.json` 固定后缀已够用; 用户可通过目录选择控制位置; 在 dialog 文案中说明                                                                                                                                 |
| `isDirty` getter 性能 (遍历 `dirtyPaths` map)                                  | Low        | map 通常 <100 entries, O(n) 可忽略                                                                                                                                                                                  |
| NewProjectDialog 与 PromptDialog 共存期间的 portal 冲突                        | Low        | 各自独立 portal root, z-index 错开 (9999 vs 9998)                                                                                                                                                                   |
| Phase 2 克隆涉及文件复制, 大项目可能慢                                         | Medium     | 后台执行 + 进度条 (Phase 3 再做)                                                                                                                                                                                    |
| **Sprint 12 #2 + #3 一起 ship**: working tree 复杂, 1 commit 难 review         | High       | **Pre-flight Phase 0**: 先 commit Sprint 12 #2 (v0.12.0), 然后 Sprint 12 #3 (v0.13.0)                                                                                                                               |
| ~~dirty 保护触发范围: 仅 newProject vs openProject 也触发~~                    | 已定       | **all switching actions**: newProject / openProject / addBswmd / removeBswmd 全部触发 ConfirmDialog (user 拍板)                                                                                                     |

## Acceptance (Phase 1)

- [ ] `NewProjectDialog` 渲染: 项目名输入 + 目录选择 + 文件名预览
- [ ] 项目名实时验证: 空名 / 非法字符 / >64 / 重名 → 红色错误 + 创建按钮 disabled
- [ ] 目录选择: 点"浏览…" → OS openDirectory dialog → 回填路径
- [ ] 创建流程: 输入名称 + 选目录 → 创建 → manifest 写入 → store.openProject
- [ ] dirty 保护: dirty 状态点新建 → ConfirmDialog → 3 按钮各自正确
- [ ] 旧 PromptDialog 不再被 newProject 流程使用 (其他 prompt 场景保留)
- [ ] pnpm test 全通过 (新增 ~30 tests, 515 → ~545)
- [ ] Coverage ≥ 96% lines / ≥ 85% branches
- [ ] pnpm lint + pnpm tsc --noEmit 0 errors
- [ ] pnpm build 0 errors
- [ ] pnpm exec playwright test 通过
- [ ] code-reviewer APPROVE (0 critical / 0 high)
- [ ] package.json → 0.13.0; CHANGELOG + PROGRESS 更新

## Open design decisions (需要 user 拍板)

1. **Sequencing**: 先 commit Sprint 12 #2 (v0.12.0) 然后 Sprint 12 #3 (v0.13.0) — **推荐**, 还是合并 ship 一次 v0.12.0?
2. **Dirty 保护范围**: 仅 newProject 触发, 还是 openProject / newProject / load BSWMD 全部触发?
3. **重名检测时序**: dialog 打开后 fire-and-forget IPC 检查 → 实时显示重名错误, 还是仅在用户点"创建"时检查?

## Pre-flight (Execution Order)

1. ~~User 确认 plan + 3 design decisions~~
2. **WAIT for plan-confirm** (user 回 "yes/proceed" 后启动)
3. **Phase 0**: commit Sprint 12 #2 (如果选 recommended sequencing)
4. TaskCreate 跟踪 Sprint 12 #3 Phase 1 tasks 1-9
5. Phase 1 派发 (parallel where possible):
   - **Round 1**: Task 3 (pickDir IPC) + Task 4 (ProjectNewRequest 扩展) + Task 6 (ConfirmDialog 组件) + Task 8 i18n keys 部分 — 4 agents 并行
   - **Round 2**: Task 1 (NewProjectDialog) + Task 2 (validation) + Task 5 (hook 重写) — 依赖 Round 1 部分
   - **Round 3**: Task 7 (store isDirty) + Task 8 完成 + Task 9 (E2E + code-review + docs + version)
6. Phase 1 commit: `feat(ui): Sprint 12 #3 NewProjectDialog + ConfirmDialog (v0.13.0)`
7. Phase 2 / 3 推 Sprint 13 #1 / #2 (本 plan 不实施)

## Notes

- **PromptDialog 不删除**: 可能其他 prompt 场景仍需用 (e.g. "重命名"等 future use case); newProject 流程不再依赖它
- **Mockup Variant A 是 Phase 1 MVP**, Variant B (含 BSWMD chips) 是 Phase 3; **不要** Phase 1 提前实现 chips
- **Catppuccin Mocha**: 严格按 mockup 颜色 (--color-bg #1e1e2e / --color-surface #313244 / --color-accent #89b4fa / --color-error #f38ba8)
