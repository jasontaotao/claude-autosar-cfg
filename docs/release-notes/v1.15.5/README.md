# v1.15.5 Release Notes (2026-06-29) — PATCH

**Trust Contract + Coverage Hardening**

See [CHANGELOG](../../CHANGELOG.md#v1155-2026-06-29--patch) for the headline.

## 关键决策

- **writeAtomic 不抽 writeAtomicSync**：`script-handler.ts:133` 的 `writeFileSync` 保持不变（PATCH 范畴外，sprint 18+ 再处理）。
- **path-containment 使用模块级 `_openProjectManifestPath`**：对齐 `script-handler.ts:45-50` 的 `_manifestPath` 模式。最小耦合面，不引入新的依赖注入框架。
- **unhandledRejection 仅 log 不 exit**：避免破坏未保存数据；遵循 Electron 2024+ 社区惯例（electron-forge / electron-builder 模板默认行为）。
- **HEADLESS push 通道仅注释声明**：renderer 无消费者，注册 `webContents.send` 会产生 dev console "Renderer did not register listener" 噪音。
- **Path-containment 不在 `projectSaveHandler` 入口加 `isPathInside`**：保留 v1.4.0 引入的 loose-mode back-compat 契约（用户可打开任意 ARXML 并写回原路径）。仅在 NEW handler（writeArxmlBatch + bswmdDelete）加 strict containment。
- **mutate-with-warnings 测试目前不可达**：`applyPatchSteps` 不产生 warnings。新测试覆盖 `generate` 路径的 exit-2（诊断非空时），这是当前实际可达的 exit-2 入口。

## 推迟到 v1.17.0 MINOR

- **C8** MULTIPLICITY-CONFIG-CLASSES 校验消费（POST-BUILD 变体工程范围）
- **C9** `<DERIVED-FROM>` classifier 加挂
- **C10** FOREIGN-REFERENCE-DEF dest 跨方言保留
- **C11** `<MODULE-REF>` in ECUC-DEFINITION-COLLECTION 不再静默丢失
- **C12** 分层 ESLint 守门（renderer→@core 113+ import）— 结构性 CRITICAL，需独立 sprint
- **C13** AppHeader / useProjectActions 文件拆分

## 流程教训（PKM）

1. **writeAtomic 抽取触发 errno 源漂移** — 旧 `fs.writeFile` 在 parent 缺失时 ENOENT/ENOTDIR → 'path-not-found'；新 writeAtomic 先 `mkdir -p` 在 Windows 上 parent-as-file 路径返回 EEXIST → 'unknown'。测试断言改为接受 ['path-not-found', 'unknown'] 任一。
2. **renderer store 反向 import main helper** — `useScriptStore.test.ts` 直接 `import { writeAtomic } from '../../../main/ipc/projectSaveHandler.js'`。writeAtomic 抽取即破坏 import 路径。教训：renderer 端测试若要 mock main helper 应通过 preload bridge；最低限度应在 Phase 2.5 提前发现。
3. **Path-containment 需要 manifest path state** — 原本 stateless 的 handler 要做 containment 必须有"当前打开项目的 manifest dir"。新建模块级单例是最低耦合方案。
4. **类型联合扩展触发下游 rip** — 加 `'invalid-path'` 到 union 后，下游 `useCreateEcucFromBswmd.ts` / `bswmdSlice.ts` 都因 exhaustive switch 必须更新；`ValidateResult` 在 stub 处用 `as unknown as ValidateResult`（stub 是故意子集）。
5. **lint --fix 8 文件 import order** — 一次写多个文件时 import order 容易混乱；`npx eslint . --fix` 一键搞定，但要在 commit 前跑。
6. **联合审计 13/13 CONFIRMED 教训** — 全 e2e mock IPC + 核心 hook 0 单测 → 联合审计 4 个并行 agent 才能发现结构性盲区。单 agent 自我审查不够。

## Ship Method

- 分支 `feature/v1-15-5-patch`
- 2 commits: `fix(main): v1.15.5 trust contract + path-containment + IPC stubs` (C1+C4+C5+C2) + `docs+test: v1.15.5 ...` (C6+C7 batch, planned)
- 测试基线: v1.15.4 = 2097 unit + 1 SKIP / v1.15.5 = 2500+ test cases
- 全量回归: `pnpm verify` 7-stage pipeline 全绿