# Plan: Sprint 12 #2 — BSWMD Renderer 集成 + 真实 CanIf smoke

**Source**: `PROGRESS.md` Sprint 12 衔接段 (1103-1119) + `claude-autosarcfg-overview` memory
**Selected Milestone**: Sprint 12 #2 — renderer 集成 (useArxmlStore.bswmdSchemas + addBswmd 替换 stub + ProjectPanel "Load BSWMD" + 真实 CanIf smoke)
**Complexity**: Medium

## Summary

把 Sprint 12 #1 落地的 BSWMD schema-side 解析器接通到 runtime：validator 通过 `SchemaLayer` opts 知道 BSWMD 声明的 schema（emit `'schema-unknown'` 当 layer 已知 module 但 param 不在 sourcePaths），store 持久化 `BswmdDocument[]` 并在 `addBswmd` 替换 stub，ProjectPanel 加 "Load BSWMD" 按钮 + remove，最后用用户提供的 CanIf BSWMD 跑端到端 smoke 收尾。

## Patterns to Mirror

| Category         | Source                                                         | Pattern                                              |
| ---------------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| Naming           | `src/core/validation/validate.ts:25` `validate(doc)`           | 纯函数接收 `doc`，可选 opts 在 dispatch 包装         |
| Errors           | `src/core/project/bswmd.ts:125` `BswmdError` union             | tag + message discriminated union                    |
| Errors           | `src/shared/i18n.ts:165-168` `bswmdParser.*`                   | 4 key 模式，zh-CN + en 同步                          |
| Store action     | `src/renderer/store/useArxmlStore.ts:178` `addDocument`        | parse → 失败 throw → 成功 set state → re-validate    |
| Store action     | `src/renderer/store/useArxmlStore.ts:392` `projectSyncAddPath` | 不可变添加，dedupe by membership                     |
| IPC handler      | `src/main/ipc/register.ts:289-307` `BSWMD_PARSE`               | size cap + Result envelope + `kind: 'ok' \| 'error'` |
| ProjectPanel     | `src/renderer/components/ProjectPanel.tsx:42-74` `FileList`    | `<ul>` + basename + remove button + testId prefix    |
| LooseView button | `src/renderer/components/ProjectPanel.tsx:86-103`              | `useProjectActions().<verb>FromDialog` 模式          |
| Test             | `src/core/validation/__tests__/validateProject.test.ts`        | describe('with <feature> (Sprint X #Y)')             |
| Test             | `src/renderer/store/__tests__/useArxmlStore.test.ts`           | beforeEach 直接构造 store 状态                       |

## Files to Change

| File                                                                | Action                   | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/validation/runtimeSchema.ts`                              | UPDATE                   | 已经在 working tree（WIP）— 保留 + 加 `findModuleForPath(layer, paramPath)` helper（剥前 3 段得到 module path）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/core/validation/types.ts`                                      | UPDATE                   | 已经在 working tree — 保留 'schema-unknown' kind，加 `schema-unknown` `expected: 'in-schema' \| 'out-of-schema'` 等于 `'out-of-schema'` 的隐式语义（无新字段）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/core/validation/schema/ecucSubset.ts`                          | UPDATE                   | `lookupSchema(path, layer?)` 和 `lookupContainerSchema(path, layer?)` 接受可选 `SchemaLayer`；layer 优先于静态表；返回 `{ entry, source: 'layer' \| 'static' \| null }` 元组或保留 null + 加 `lookupParamInLayer`                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/core/validation/validate.ts`                                   | UPDATE                   | `validate(doc, layer?)` 和 `validateProject(documents, layer?)` 加可选 layer；`walkContainer`/`walkReference`/`walkElements` 把 layer 串到 lookup 点；新逻辑：当 `layer != null` 且 lookup 返回 null + `findModuleForPath(layer, paramPath) != null` + paramPath 不在 `sourcePaths` → emit `'schema-unknown'`                                                                                                                                                                                                                                                                                                                                                  |
| `src/core/validation/dispatch.ts`                                   | UPDATE                   | `validateProjectForRenderer` 的 `DispatchOptions` 加 `schemaLayer?: SchemaLayer`，透传给 `validateProject`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/core/validation/index.ts`                                      | UPDATE                   | 公开 `buildSchemaLayer`, `SchemaLayer` 类型供 renderer 消费                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/shared/ipc-contract.ts`                                        | UPDATE                   | `IPC_CHANNELS.BSWMD_READ = 'bswmd:read'` + `ReadBswmdRequest` / `ReadBswmdResponse` types                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/main/ipc/register.ts`                                          | UPDATE                   | 注册 `bswmd:read` handler：`{ path }` → `fs.readFile` + size cap（8 MiB，同 BSWMD_PARSE） → `{ kind: 'ok', content } \| { kind: 'read-failed', message }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/preload/index.ts`                                              | UPDATE                   | 在 `autosarApi` 暴露 `readBswmd(req)`，type-safe wrapper                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/shared/i18n.ts`                                                | UPDATE                   | 新 keys: `projectPanel.bswmd.add` (zh/en), `projectPanel.bswmd.addAria` {name}, `app.error.readBswmdFailed` {message}, `app.error.parseBswmdFailed` {message}（reuse `bswmdParser.*` 的 4 个）, `app.error.duplicateBswmd` {path}, `app.error.needProject`；**修改** `projectPanel.bswmd.empty` zh/en 文案由"尚未加载 BSWMD" → "加载 BSWMD 以启用 schema-driven validation"（open 模式才显示）                                                                                                                                                                                                                                                                 |
| `src/renderer/store/useArxmlStore.ts`                               | UPDATE                   | state 加 `bswmdSchemas: readonly BswmdDocument[] = []` 和 `bswmdPaths: readonly string[]`（与 `valueArxmlPaths` 镜像，源真唯一在 `project.bswmdPaths` 当 project open；loose 模式 store 自己持有）；`addBswmd(path, content)` 替换 no-op：**先 dedupe by absolute path**（`bswmdPaths.includes(path)`）→ 已存在 `setError` + return（不允许 replace，user 必须先 remove）；否则 parseBswmd → 失败 `setError` + return，成功追加到 bswmdSchemas + bswmdPaths + 当 project open 时同步 `project.bswmdPaths` + re-validate with `buildSchemaLayer(bswmdSchemas)`；新 action `removeBswmd(path)` 反向（bswmdSchemas/bswmdPaths 移除 + project 同步 + re-validate） |
| `src/renderer/hooks/useProjectActions.ts`                           | UPDATE                   | 新增 `addBswmdFromDialog(): Promise<ProjectActionResult>`：检查 project open（loose 模式直接 return `{ kind: 'error', message: t(locale, 'app.error.needProject') }`）→ 调 IPC `readBswmd` → 调 `store.addBswmd` → 翻译错误（parse 失败 / read 失败 / 重复 path）到 zh-CN/en                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/renderer/components/ProjectPanel.tsx`                          | UPDATE                   | **LooseView 不渲染 BSWMD section**（整段不显示 — loose 模式不允许 Load BSWMD）；OpenView 中 BSWMD FileList 加 "Load BSWMD..." 按钮（紧贴 title 右侧）；list item 加 remove button (绑 `removeBswmd`)                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/renderer/components/ProjectPanel.css`                          | UPDATE                   | `.project-panel-section-add` 按钮样式（小尺寸 ghost button，与现有 panel 风格一致）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/core/validation/__tests__/runtimeSchema.test.ts`               | CREATE                   | `buildSchemaLayer` 单测：空输入 → 空 layer；module container + subContainer + choice branch 全索引；paramDefToSchemaEntry kind 映射 + min/max/maxLength/enumLiterals 注入；referenceDefToSchemaEntry destKind 透传；last-write-wins 碰撞                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/core/validation/__tests__/validateProject.schemaLayer.test.ts` | CREATE                   | `'schema-unknown'` 触发条件：layer 提供 + param 不在 layer.containers/params/sourcePaths + module path 匹配 layer.containers → emit 1 schema-unknown；layer 提供 + param 在 layer.params → 走 constraint（不 emit schema-unknown）；layer 不提供 → 行为同 Sprint 11（baseline 5/5 0 violation 不动）                                                                                                                                                                                                                                                                                                                                                           |
| `src/renderer/store/__tests__/useArxmlStore.bswmd.test.ts`          | CREATE                   | addBswmd: **dedupe — 重复 path → setError + bswmdSchemas 不变（不 replace）**；parse ok → bswmdSchemas 累加 + validationErrors 重新跑（用真实 CanIf fixture 验证 enum literal 触发）+ project open 时 bswmdPaths 追加 + loose 模式不写 project；addBswmd parse 失败 → setError + bswmdSchemas 不变 + validationErrors 不变；removeBswmd: bswmdSchemas 移除 + bswmdPaths 移除 + re-validate                                                                                                                                                                                                                                                                     |
| `src/main/ipc/__tests__/bswmdRead.test.ts`                          | CREATE                   | handler: 正常 file → ok；不存在 → read-failed；>8MiB → read-failed；与 `bswmdParse.test.ts` 风格一致                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/renderer/components/__tests__/ProjectPanel.bswmd.test.tsx`     | CREATE                   | 按钮存在 + 点击触发 addBswmdFromDialog + 列表显示 + remove 触发 removeBswmd + i18n zh/en 切换                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `tests/fixtures/bswmd/canif_smoke.arxml`                            | CREATE (用户提供后 copy) | 用户提供的真实 CanIf BSWMD；smoke test 用 `buildSchemaLayer` + `validateProject` 跑过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/core/validation/__tests__/validateProject.canifSmoke.test.ts`  | CREATE                   | 端到端：fixture file → fs.readFile → parseBswmd → buildSchemaLayer → 构造 fake ArxmlDocument 含 CanIf param (合法 enum literal) → validateProject 0 violations；非法 enum literal → emit enum 错误；不存在的 param → emit schema-unknown                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `PROGRESS.md`                                                       | UPDATE                   | 新增 Sprint 12 #2 段落：deliverable + 新增 tests 数 + coverage + code-review                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `package.json`                                                      | UPDATE                   | version `0.11.0` → `0.12.0` (MINOR bump, Sprint 12 #1+#2 累计)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Tasks

### Task 1: Validator schemaLayer 集成 (core)

- **Action**: `lookupSchema/lookupContainerSchema` 接受可选 `SchemaLayer`；`validate(doc, layer?)` / `validateProject(documents, layer?)` 透传；emit `'schema-unknown'` 当 layer 已知 module 但 param 不在 sourcePaths
- **Mirror**: `dispatch.ts:57` opts 模式 + `validate.ts:25` 单文档签名
- **Validate**: `pnpm test validateProject.schemaLayer` 通过；`pnpm test baseline` 仍 5/5 0 violation（layer 不提供时行为不变）

### Task 2: Store bswmdSchemas + addBswmd 真实实现 (renderer)

- **Action**: state `bswmdSchemas: BswmdDocument[]` + `bswmdPaths: string[]`；`addBswmd(path, content)` **先 dedupe by path**（已存在 → setError + return，不 replace）→ parseBswmd → 失败 setError + return → 成功追加 + 当 project open 时同步 `project.bswmdPaths` + re-validate with `buildSchemaLayer(bswmdSchemas)`；`removeBswmd(path)` 反向（移除 schemas/paths/project.sync/re-validate）
- **Mirror**: `addDocument:178` + `projectSyncAddPath:392` + `removeDocument:208`
- **Validate**: `pnpm test useArxmlStore.bswmd` 通过（覆盖 dedupe / parse fail / project sync / remove / loose 模式 path 不写 project）；`pnpm test useArxmlStore.multidoc` 不破

### Task 3: IPC bswmd:read (main + preload + contract)

- **Action**: `bswmd:read` handler with 8 MiB cap；preload 暴露 `readBswmd`；contract types
- **Mirror**: `register.ts:289-307` BSWMD_PARSE handler
- **Validate**: `pnpm test bswmdRead` 通过

### Task 4: useProjectActions.addBswmdFromDialog (hook)

- **Action**: `addBswmdFromDialog(): Promise<ProjectActionResult>` **先检查 project open（loose → return error 'app.error.needProject'）** → 调 IPC `readBswmd` → 调 `store.addBswmd`（store 自己负责 dedupe）→ 翻译错误（read fail / parse fail / duplicate）到 zh-CN/en
- **Mirror**: `openProjectFromDialog:63`
- **Validate**: `pnpm test useProjectActions` 通过（覆盖 loose 拒绝 / open 成功 / 三种 error branch）

### Task 5: ProjectPanel "Load BSWMD" 按钮 + remove (UI)

- **Action**: **LooseView 不渲染 BSWMD section**（整段不显示，避免用户尝试在 loose 模式加载）；OpenView 中 BSWMD FileList section 加 "Load BSWMD" 按钮 + list item remove 按钮（绑 `removeBswmd`）；CSS 微调
- **Mirror**: `FileList:42-74` (remove) + `LooseView:82-103` (button，但 OpenView 中)
- **Validate**: `pnpm test ProjectPanel.bswmd` 通过（loose 无 BSWMD section / open 有按钮和列表）；`pnpm exec playwright test --grep "bswmd"` 视觉回归（已有 playwright.config.ts）

### Task 6: i18n keys (zh-CN + en parity)

- **Action**: 6 个新 key: `projectPanel.bswmd.add`, `projectPanel.bswmd.addAria`, `app.error.readBswmdFailed`, `app.error.parseBswmdFailed`（reuse `bswmdParser.*`）, `app.error.duplicateBswmd` {path}, `app.error.needProject`；**修改** `projectPanel.bswmd.empty` 文案；parity test 覆盖
- **Mirror**: `i18n.ts:78-89` 现有 6 个 projectPanel/bswmdParser keys
- **Validate**: `pnpm test i18n` parity 100%

### Task 7: 真实 CanIf BSWMD smoke (E2E)

- **Action**: 用户提供真实 CanIf BSWMD 文件 → 落到 `tests/fixtures/bswmd/canif_smoke.arxml`；`validateProject.canifSmoke.test.ts` 端到端走 parse + layer + 合法 enum / 非法 enum / 不存在 param 三种 case
- **Mirror**: `tests/fixtures/arxml/` 现有 fixture 目录
- **Validate**: smoke test 通过；将 fixture 路径加入 `tests/fixtures/README.md` 记录

### Task 8: PROGRESS + CHANGELOG + version bump

- **Action**: `PROGRESS.md` 加 Sprint 12 #2 段落（仿 Sprint 12 #1 #29 行格式）；`CHANGELOG.md` 加 `0.12.0` 条目；`package.json` `0.11.0` → `0.12.0`
- **Mirror**: `package.json` 当前 version + `CHANGELOG.md` 现有 0.11.0 条目
- **Validate**: `git diff package.json` 显示 version bump

### Task 9: code-review (post-implementation)

- **Action**: 改完代码后立即调 `code-reviewer` agent；address CRITICAL/HIGH；fix MEDIUM when possible
- **Mirror**: Sprint 12 #1 的 code-review APPROVE 流程
- **Validate**: code-reviewer APPROVE（0 critical / 0 high / 中位数 medium/low）

## Validation

```bash
cd D:/claude_proj2/claude-AutosarCfg

# 单测 (单元 + 集成)
pnpm test
# 期望: ≥ 478 tests pass (Sprint 12 #1 = 428, +50 新增: 14 runtimeSchema + 12 schemaLayer + 12 store.bswmd + 4 bswmdRead + 4 ProjectPanel.bswmd + 4 canifSmoke)

# Coverage ≥ 96% lines / ≥ 85% branches (保持 Sprint 12 #1 baseline)
pnpm test:coverage

# Baseline 5 fixtures 不破
pnpm test baseline
# 期望: 5/5 fixtures 0 violations (签名 layer?=undefined 时行为不变)

# Lint + type check
pnpm lint
pnpm tsc --noEmit

# Build (main + preload + renderer)
pnpm build

# E2E (playwright, 已有 config)
pnpm exec playwright test

# 真实 CanIf smoke (Task 7)
pnpm test canifSmoke
```

## Risks

| Risk                                                                           | Likelihood | Mitigation                                                                                                                         |
| ------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `'schema-unknown'` 触发条件算法固定为前 3 段 `/EcucDefs/<module>`（user 拍板） | 已定       | normalizePath 折叠 `/EAS → /EcucDefs`；baseline 5 fixtures 测试覆盖 0 violation                                                    |
| `addBswmd` 重复 path 拒绝（user 拍板）                                         | 已定       | test 覆盖 dedupe + setError；UI "Load BSWMD" 按钮在 add 后变 disabled 也可（v0.13+）                                               |
| Loose mode 完全不允许 Load BSWMD（user 拍板）                                  | 已定       | LooseView 不渲染 BSWMD section；`useProjectActions.addBswmdFromDialog` loose 模式直接 return error；test 覆盖                      |
| 真实 CanIf BSWMD 文件用户未提供时 Task 7 卡住                                  | Medium     | Plan task 7 显式标"用户提供后 copy"；如未提供，先用 `Can_Bswmd.arxml` 现有 14KB fixture 跑 smoke（Sprint 12 #1 已落）作为 fallback |
| `validateProject` signature 变更破 Sprint 10-11 既有测试                       | Low        | 全部加 `layer?` 可选参数 + 默认 undefined；既有 5 步流水线不动；既有 test 不需改                                                   |
| IPC bswmd:read 8 MiB cap 与 bswmd:parse 不一致                                 | Low        | 同一常量 `BSWMD_PARSE_MAX_BYTES` 提到 module-level 共享；test 覆盖                                                                 |
| ProjectPanel CSS 加按钮影响现有 layout                                         | Low        | 小尺寸 ghost button；visual regression (playwright screenshot) 对比                                                                |
| `runtimeSchema.ts` working tree 改动与新改动冲突                               | Low        | 该文件是 WIP（未提交），Task 1 在同一文件加 helper，no conflict                                                                    |

## Acceptance

- [ ] Task 1-9 全过
- [ ] `pnpm test` ≥ 478 tests pass / 0 fail / 0 skipped
- [ ] Coverage ≥ 96% lines / ≥ 85% branches
- [ ] `pnpm test baseline` 5/5 fixtures 0 violations（无 layer 时行为不变）
- [ ] 真实 CanIf BSWMD smoke 通过（3 case: 合法 enum / 非法 enum / 不存在 param）
- [ ] `pnpm lint` + `pnpm tsc --noEmit` 0 errors
- [ ] `pnpm build` 0 errors
- [ ] code-reviewer APPROVE（0 critical / 0 high）
- [ ] `package.json` version `0.12.0`；`CHANGELOG.md` + `PROGRESS.md` Sprint 12 #2 段落更新
- [ ] 既有 428 Sprint 12 #1 tests 仍 100% pass（无 regression）

## Pre-flight (Plan-Execution Order)

1. ~~User 确认 plan~~ — 3 个 design decision 已 user 拍板
2. **WAIT for plan-confirm**（user 回 "yes/proceed" 后开始 TDD）
3. TaskCreate 跟踪 Task 1-9
4. Task 1 → 2 → 3 → 4 → 5 → 6 (code；每步 TDD: RED → GREEN → IMPROVE)
5. Task 7（需要用户 BSWMD 文件；可与 Task 5-6 并行；fallback: `tests/fixtures/bswmd/Can_Bswmd.arxml`）
6. Task 8 PROGRESS / CHANGELOG / version
7. Task 9 code-review（按 CLAUDE.md `改完代码自动审`）
8. 5-stage pipeline 5/5 baseline 验证 + final coverage
9. commit (per CLAUDE.md git-workflow: `feat(sprint12-2): BSWMD renderer integration (v0.12.0)`)
