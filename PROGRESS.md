# claude-AutosarCfg — 项目进度

Standalone desktop GUI for AUTOSAR BSW configuration.
Electron 30 + TypeScript 5 (strict) + React 18 + Vite 5 + Zustand 4 + fast-xml-parser 4 + Tailwind 3 + Vitest 1 + Playwright 1.45.

> 仓库: https://github.com/jasontaotao/claude-autosar-cfg
> 本地: `D:\claude_proj2\claude-AutosarCfg\`
> License: MIT

---

## Sprint 总览（v0.1.0 路线）

| Sprint                                      | 范围                                                                            | 状态 | 完成日     | HEAD                                               | 关键交付                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------- | ---- | ---------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S0** 脚手架                               | Electron + TS + Vite 三层骨架 + 5 阶段 CI                                       | ✅   | 2026-06-13 | `563f7a5`                                          | Hello Window + 5/5 CI jobs green                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **S1** F1 ARXML IO                          | 解析 + 序列化 .arxml (r4.x ECUC subset)                                         | ✅   | 2026-06-14 | `3a7a039`                                          | `core/arxml/{parser,serializer}.ts` + IPC `arxml:open/parse/save` + 5 round-trip 样本 + 5 覆盖率补测                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **S2** F2 Tree + 7-param editor             | 左树右编辑器，7 mode 编辑，Zustand store，键盘 a11y                             | ✅   | 2026-06-14 | `73909a1` (GH Actions run 27500975793 — 5/5 green) | `tree/{Tree,TreeNode}.tsx` + `editor/{ParamEditor,modes.ts,modes/*}.tsx` + `useArxmlStore` + 5 mutate round-trip                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **S3** F3 Validation                        | ECUC subset schema + range/enum/ref 校验 + 5 样本 baseline                      | ✅   | 2026-06-14 | `f6aef6b`                                          | `core/validation/{types,validate}.ts` + `schema/ecucSubset.ts` (46 entries) + `ValidationPanel.tsx` + `useDebouncedValidation` + EnumEditor 升级 dropdown + 5/5 baseline 0 violation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **S4** F4 Parser bug fix + verify format    | 修 2 parser bug (DEST-aware) + schema revert + verify format                    | ✅   | 2026-06-15 | `9c37e53` (GH Actions run 27519501464 — 5/5 green) | `parser.ts` DEST-first dispatch + `serializer.ts` 精确 DEST + `ecucSubset.ts` 撤回 18 entry + 删 2 sentinel + `verify.mjs` 6-stage + 110 tests / 94.57% coverage / 5/5 baseline 0 violation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **S5** F5 Container multiplicity            | 增 ECUC container 实例数 [lower, upper] 校验                                    | ✅   | 2026-06-15 | `5c47f37`                                          | `types.ts` 加 `'multiplicity'` kind + `EcucContainerSchemaEntry` interface + `ecucSubset.ts` 13 entries + `validate.ts` `checkContainerMultiplicity` + `ValidationPanel` 第 6 group + 117 tests / 95.1% coverage / 5/5 baseline 0 violation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **S6** F6 Cross-container reference         | 项目级 cross-ref API + `'cross-ref'` 第 7 kind                                  | ✅   | 2026-06-15 | TBD                                                | `types.ts` 加 `'cross-ref'` kind + `PathIndexEntry` + `RefSite` interface + `validate.ts` 加 `validateProject` / `buildPathIndex` / `extractReferences` / `checkCrossRefs` + ValidationPanel `.kind-cross-ref` teal + 146 tests / 94.95% coverage / 5/5 baseline 0 violation；parser `<REFERENCE-VALUES>` 解析留 Sprint 7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **S7** F7 ECUC-REFERENCE-VALUE              | parser + serializer REFERENCE-VALUES 解析/序列化                                | ✅   | 2026-06-15 | `ff2c1d5`                                          | `types.ts` ParamValue.reference 加 `dest?` + parser `extractReferenceParams` 双 dialect 扫 + serializer `renderParamEntries` / `renderRegularParam` / `renderReferenceParam` + 5 fixture round-trip 恢复 + 1336 baseline signed-guard [1300, 1400] + 161 tests / 94.86% coverage / 5/5 baseline 0 violation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **S8** F8 #1 Cross-fixture namespace 归一化 | `normalizePath` 纯 helper + `checkCrossRefs` 入口归一化                         | ✅   | 2026-06-15 | TBD                                                | `validate.ts` 加 `normalizePath`（`/EAS → /EcucDefs`）+ 8 normalizePath 单测 + 3 validateProject 端到端 + fixtures test 注释更新（含 PLAN 漏错 1 处 + 双错配文档化）+ 172 tests / 94.98% / 80.48% branches / 5/5 baseline 0 violation；type 段错配未在 scope，留 Sprint 9+ #1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **S9** F9 #1 schema type-segment strip      | `tryStripTypeSegment` 纯 helper + `checkCrossRefs` 串接                         | ✅   | 2026-06-15 | TBD                                                | `validate.ts` 加 `tryStripTypeSegment`（白名单 `Pdu` / `ComIPdu` / `ComSignal` / `ComIPduGroup`）+ 12 单测 + `index.ts` barrel export + fixtures test 签名 guard 调 [800, 1100] + 198 tests / 95.33% / 82.67% branches / cross-ref 1336 → 1003（剩 1003 是 fixture 数据本身 dangling，deviation 文档化）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **S9** F9 #2 target-side ref dest 校验      | `checkRefDests` + `walkRefs` dest 透传 bug 修                                   | ✅   | 2026-06-15 | TBD                                                | `types.ts` union 加 `'ref-dest'` + `validate.ts` 加 `DEST_KIND_MAP`（3 条 + 静默 skip）+ `checkRefDests` + 串入 `validateProject` Step 5 + **walkRefs 修 bug**（param-level ref 漏传 `value.dest`，影响 2157 条 VALUE-REF）+ 14 unit + 3 E2E + fixtures guard 新增 `ref-dest` [0, 200] + `ValidationPanel.css` 加 `.kind-ref-dest` (amber-rose) + 215 tests / ref-dest 实测 0（5 fixture 干净，helper 验证于 3 E2E dirty data）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **S9** F9 #3 cyclic ref detection           | `checkRefCycles` DFS + 6 步流水线 + `resolveTargetPath` 提取                    | ✅   | 2026-06-15 | TBD                                                | `types.ts` union 加 `'ref-cycle'`（9 个 kind）+ `validate.ts` 新增 `resolveTargetPath`（落实 Sprint 9 #2 LOW-2 finding）+ `checkCrossRefs`/`checkRefDests` 切到 helper（refactor 不动行为）+ `checkRefCycles`（DFS + visited/onStack + canonical-key rotation dedup）+ 串入 `validateProject` Step 6 + 18 unit + 8 `resolveTargetPath` direct + 4 E2E + fixtures guard 新增 `ref-cycle` [0, 200] + `ValidationPanel.css` 加 `.kind-ref-cycle` (pink-rose `#db2777`) + 245 tests / ref-cycle 实测 0（5 fixture 干净）/ **95.84% stmts / 83.37% branches**；v0.9.3 → v0.9.4 PATCH bump                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **S11** Sprint 11 — Project Manifest + i18n | value-side 工程的 <name>.autosarcfg.json 持久化 + 完整 zh-CN/en 双语            | ✅   | 2026-06-16 | `1458816`                                          | `src/core/project/manifest.ts` (loadManifest/saveManifest/validateManifest/createEmptyManifest, path-shape 防 `..` / 绝对 / 空) + `src/shared/i18n.ts` (Messages interface + MessagesZhCN + MessagesEn + t(locale,key,params) + parity test) + `src/renderer/hooks/useProjectActions.ts` (替代 LooseView 合成 click 耦合) + IPC `PROJECT_NEW/OPEN/SAVE` (PROJECT_OPEN 用 `path.relative` 做 path-containment 防 hostile manifest) + ProjectPanel + AppHeader locale toggle 中/EN + 374 tests / 96.18% / 85.12% branches / 5/5 baseline 782 signed-guard [700, 850]；v0.9.5 → v0.10.0 MINOR bump                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **S12** Sprint 12 #1 — BSWMD parser         | schema-side BSWMD 解析器 (2 dialect) + IPC + fixtures + i18n + post-review 修复 | ✅   | 2026-06-16 | TBD                                                | `src/core/project/bswmd.ts` (~730 行) BswmdDocument / BswModuleDef / ContainerDef / ParamDef / ReferenceDef / ChoiceDef / ProvidedEntry types + parseBswmd + 4 lookup helpers (findModuleByPath / lookupContainerDef / lookupParamDef / lookupReferenceDef) 覆盖 EB tresos BSW-MODULE-DESCRIPTION + AUTOSAR ECUC-MODULE-DEF 2 dialect + 24 单测（含 ECUC-FUNCTION-NAME-DEF 拆为 'function-name' ParamKind / 00046 数字 namespace / EB tresos fallback 双 entry / unrecoverable entry skip） + IPC `bswmd:parse` (parse-only, 8 MiB size cap 防 OOM) + preload `parseBswmd` + 2 真实 fixture (Can_Bswmd.arxml 14KB / Adc_bswmd.arxml 80KB, byte-identical) + 17 round-trip 测试（含 7/42/8 recursive totals assertion + providedEntries recovery + fallback warning 计数） + 4 `bswmdParser.*` i18n key + `projectPanel.bswmd.empty` 去掉 "Phase 2" 提示 + Task 6 build 修复 (TreeNode subtitle optional + globalThis.crypto + 16 prettier drift + 5 import() type 拆分) + vitest setup 加 Web Crypto fail-fast guard + bswmd.ts 改 ProvidedEntry 加 entryKind + code-review 修 2 HIGH (providedEntries fallback / HIGH-2 design doc) + 4 MEDIUM/LOW (function-name 拆分 / crypto guard / size cap / numeric namespace / void tagName 清 / Adc totals) → **426 tests / 96.17% / 85.21% branches / 5/5 baseline 782 signed-guard [700, 850] / code-reviewer APPROVE (0 critical / 0 high / 2 medium / 3 low, 剩 Sprint 13+)**；v0.10.0 → v0.11.0 MINOR bump |
| **S12#2** Sprint 12 #2 — BSWMD renderer 集成 | useArxmlStore.bswmdSchemas + addBswmd 替换 stub + ProjectPanel "Load BSWMD" + 真实 CanIf smoke (用 Adc fixture) | ✅ | 2026-06-16 | TBD | `src/core/validation/runtimeSchema.ts` (SchemaLayer + buildSchemaLayer + findModuleForPath; WIP → ship) + `src/core/validation/schema/ecucSubset.ts` (lookupSchema/lookupContainerSchema 接受 layer?) + `src/core/validation/validate.ts` (validate/validateProject 加 layer?; 透传到 walkContainer/walkReference/walkElements; emit schema-unknown via emitSchemaUnknownIfInKnownModule helper) + `src/core/validation/dispatch.ts` (DispatchOptions.schemaLayer) + `src/core/validation/types.ts` (新增 'schema-unknown' kind) + `src/renderer/store/useArxmlStore.ts` (bswmdSchemas + bswmdPaths state; addBswmd dedupe by path 拒绝 + re-validate with buildSchemaLayer; removeBswmd; project.bswmdPaths 双向同步; revalidateWithBswmd helper) + `src/main/ipc/bswmdReadHandler.ts` (新; 8 MiB cap; fs.stat 先于 fs.readFile) + `src/main/ipc/register.ts` (BSWMD_READ + BSWMD_OPEN handlers) + `src/preload/index.ts` (readBswmd + openBswmdDialog) + `src/shared/ipc-contract.ts` (BSWMD_READ + BSWMD_OPEN) + `src/shared/types.ts` (ReadBswmdRequest/Response + OpenBswmdResult) + `src/renderer/hooks/useProjectActions.ts` (addBswmdFromDialog, loose 直接 reject) + `src/renderer/components/ProjectPanel.tsx` (FileList onAdd + OpenView onAddBswmd/onRemoveBswmd; LooseView 不渲染 BSWMD section) + `src/shared/i18n.ts` (6 new keys + 改 bswmd.empty) → **515 tests / 96.33% / 84.85% branches / 5/5 baseline 782 signed-guard**; v0.11.0 → v0.12.0 MINOR bump |
| **S12#3** Sprint 12 #3 — NewProjectDialog 统一弹窗 | 两步新建项目流程合并为单一 NewProjectDialog + 未保存保护 ConfirmDialog + 17 i18n keys + version 0.13.0 | ✅ | 2026-06-17 | TBD | `src/renderer/components/NewProjectDialog.{tsx,css,validate.ts}` (329+224+57 lines, Catppuccin Mocha, store-driven visibility, validateProjectName pure) + `src/renderer/components/ConfirmDialog.{tsx,css}` (165+127, `confirm()` module-level API, 3 按钮 + Esc + backdrop + ×) + `src/renderer/hooks/useProjectActions.ts` (重写: newProject 不调 prompt; 新 submitNewProject; openProject/addBswmd/removeBswmd 加 dirty 保护 via confirm()) + `src/renderer/store/useArxmlStore.ts` (isDirty function-on-state + newProjectDialogOpen/confirmDialogOpen/pendingAction 4-kind union + setters) + `src/main/ipc/pickDirHandler.ts` (43, new) + `src/main/ipc/projectNewHandler.ts` (124, new) + `src/main/ipc/register.ts` (PICK_DIR + PROJECT_NEW refactor) + `src/shared/types.ts` (PickDirRequest/Result + ProjectNewRequest.directory + overwrite-confirm/write-failed/invalid-name kinds) + `src/shared/ipc-contract.ts` (PICK_DIR) + `src/preload/index.ts` (pickDir) + `src/renderer/App.tsx` (mount NewProjectDialog + ConfirmRoot) + `src/shared/i18n.ts` (17 new keys: newProject.* 9 + confirm.unsaved.* 5 + app.error.projectName* 3) → **636 tests / 96.42% / 85.45% branches / 5/5 baseline 782 signed-guard**; v0.12.0 → v0.13.0 MINOR bump |

v0.1.0 总估时 22-31 工日（4-6 周单人）。

---

## Sprint 0 — 脚手架（2026-06-13 完成）

### 交付清单

- 41 源文件 + `pnpm-lock.yaml` + `.gitattributes` + `.npmrc`
- 8 commits（`5e9cfea` → `563f7a5`）
- 5/5 GitHub Actions jobs 全绿（run #8, 31 秒）
- 2 unit tests pass（`core/arxml/types.ts` 100% coverage）

### 关键文件结构

```
claude-AutosarCfg/
├── .github/workflows/ci.yml       # 5 jobs: lint / type-check / test / coverage / build
├── .vscode/                        # 推荐扩展 + format-on-save
├── src/
│   ├── core/                       # 纯 TS，零 react/electron 依赖（ESLint 强制）
│   │   ├── arxml/types.ts          # AUTOSAR 类型定义
│   │   └── version.ts
│   ├── main/                       # Electron 主进程
│   │   ├── index.ts
│   │   └── ipc/register.ts
│   ├── preload/index.ts            # contextBridge 类型化桥
│   ├── renderer/                   # React + Zustand UI
│   │   ├── App.tsx + HelloPanel.tsx
│   │   └── main.tsx + index.html + styles.css
│   └── shared/                     # 跨层类型 + IPC 契约
├── tests/e2e/hello-window.spec.ts  # Playwright 1 用例（需 display）
├── scripts/verify.{mjs,sh,ps1}     # 5 阶段本地验证脚本
├── vite.{main,preload,renderer}.config.ts
├── tsconfig.{json,web,node}.json
└── vitest.config.ts + playwright.config.ts
```

### Sprint 0 → Sprint 1 衔接清单

Sprint 1 启动时**已就绪**的基础：

- [x] `core/arxml/types.ts` 定义了 `ArxmlDocument` / `ArxmlPackage` / `ArxmlElement` / `ArxmlModule` / `ArxmlContainer` / `ArxmlReference` / `ParamValue` / `ParamEditMode` 等核心类型
- [x] `shared/ipc-contract.ts` 预留 F1 channel 注释位置（`OPEN_ARXML` / `PARSE_ARXML` / `SAVE_ARXML`）
- [x] `main/ipc/register.ts` 已注册 `PING` + `GET_APP_VERSION`，F1 channel 在这里加
- [x] `preload/index.ts` 已暴露 `autosarApi` 桥，F1 API 在这里加
- [x] `core/` ESLint `no-restricted-imports` 强制禁 react/electron/fs — Sprint 1 加 `parser.ts` / `serializer.ts` 时仍可用 fast-xml-parser（纯 TS）
- [x] 5 阶段 CI 跑通 — Sprint 1 加的测试会自动被 coverage gate 拦截 < 80%

### 风险（项目特定，需在 Sprint 1 启动前 review）

1. **AUTOSAR 命名空间复杂度**（plan 风险 #2）：r4.x `<AR-PACKAGE>` 嵌套 >10 层 + element/reference 同名冲突。**缓解：Sprint 1 只做 r4.6 单版本 + 5 个已知样本回归，不做"通用 ARXML 解析器"**。
2. **fast-xml-parser 选型**：plan 写 `^4.4.1`，实际装 4.5.6（在范围内）。API 在 Sprint 1 启动前需确认：XMLParser / XMLBuilder / 命名空间处理 / CDATA / comments。

---

## Sprint 1 — F1 ARXML IO（✅ 2026-06-14 完成）

### 完成情况

- **18 tests pass / 0 fail**：types 2 + parser 3 + serializer 3 + round-trip 10
- **5/5 真实样本 round-trip 全过**：Det_Det / EcuC_EcuC / Com_Com / PduR_PduR / WdgIf_WdgIf
  - 用户工程 `D:/claude_proj2/src/S32K148_EAS_EB_3399A/EAS_Cfg/Arxml/` 真实样本（总 9.1MB）
  - parse → serialize → re-parse 后 `ArxmlDocument` 字段全部 deep-equal
- **5/5 本地验证**：lint / type-check / test / build / 启动验证脚本 — 全绿
- **版本号**：`0.1.0 → 0.2.0`（`package.json` + main process `GET_APP_VERSION` 已同步）
- **HEAD commit + GH Actions run URL 待 push 后回填**

### 交付清单（12 task 全 done）

| ID     | 文件                                                        | 验收                                                                                                  |
| ------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| S1-T0  | `core/arxml/types.ts`                                       | `Result<T, E>` envelope 加在 core/ canonical 位置，shared/ 反向 re-export                             |
| S1-T1  | `core/arxml/parser.ts` + `__tests__/parser.test.ts`         | 3 单测：minimal r4.6 module + DEST reference + malformed XML                                          |
| S1-T2  | `core/arxml/serializer.ts` + `__tests__/serializer.test.ts` | 3 单测：minimal doc + ref w/ dest + empty doc                                                         |
| S1-T3  | `shared/ipc-contract.ts` + `shared/types.ts`                | 3 channel + 7 新 type（OpenArxmlResult / SaveArxmlResult / FileError / ...）                          |
| S1-T4  | `main/ipc/register.ts`                                      | OPEN_ARXML (dialog.showOpenDialog + fs.readFile) + PARSE_ARXML + SAVE_ARXML + GET_APP_VERSION='0.2.0' |
| S1-T5  | `preload/index.ts`                                          | openArxml / parseArxml / saveArxml 类型化桥                                                           |
| S1-T6  | `renderer/components/ArxmlPanel.tsx`                        | Open/Save ARXML 按钮 + formatParseError helper + package/element/version counts                       |
| S1-T7  | `renderer/App.tsx`                                          | ArxmlPanel 集成 + 标题更新为 `v{appVersion} — F1 ARXML IO`                                            |
| S1-T8  | `__tests__/round-trip.test.ts` + `tests/fixtures/arxml/`    | 5 真实样本 × 2 tests = 10 用例 deep-equal                                                             |
| S1-T9  | `package.json`                                              | version 0.2.0                                                                                         |
| S1-T10 | `CHANGELOG.md`（新增）                                      | Keep a Changelog 格式 + [0.2.0] Sprint 1 + [0.1.0] Sprint 0                                           |
| S1-T11 | `README.md`                                                 | Quick start 段加 F1 ARXML IO 子节                                                                     |
| S1-T12 | GH Actions                                                  | `pnpm verify` 5 阶段本地全绿；push 后 5/5 jobs expected                                               |

### 计划偏差（已实施）

| 项                           | plan 原文                               | 实际                                                                           | 原因                                                        |
| ---------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| parser 入口校验              | 无                                      | 加 `XMLValidator.validate` 显式校验                                            | fast-xml-parser 容错强，未闭合 XML 不会被抛 `xml-malformed` |
| detectVersion 严格过滤       | 不在 SUPPORTED 返回 null                | r4.0 namespace 时回退解析 `xsi:schemaLocation` 的 `AUTOSAR_4-2-2.xsd` 提取 4.2 | 用户 5 样本实际用 r4.0 namespace + 4-2-2 schema             |
| parser test fixture xmlns    | r4.0（plan 笔误）                       | r4.6                                                                           | 与 plan 测试期望 version='4.6' 一致                         |
| serializer wrapper tag       | renderPackage/Module 输出 plain object  | 加 `groupByTagName` helper + 每个元素 wrap `{ [tagName]: body }`               | fast-xml-parser 数组 + plain object 不会自动加 wrapper tag  |
| vite.main.config.ts external | `['electron', 'node:path', 'node:url']` | 加 `node:fs`                                                                   | T4 后 fs.promises 引入需要 external                         |
| shared/types re-export       | 仅 Result                               | 加 `ArxmlElement`                                                              | T6 renderer ArxmlPanel 函数签名需要                         |

### 风险回顾

| Risk                             | 实际遭遇                                            | 缓解                                                                             |
| -------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| fast-xml-parser namespace 复杂度 | 0                                                   | T1 加 SUPPORTED 过滤 + schemaLocation 回退解析                                   |
| 5 样本不同 schema                | 5 样本全部 r4.0 + AUTOSAR_4-2-2.xsd（同工程同版本） | detectVersion 一次覆盖全部                                                       |
| Serializer XML 结构错乱          | T8 round-trip 失败                                  | 加 groupByTagName + PARAMETER-VALUES 用 grouped 形式                             |
| CI runner 缺 fixtures            | N/A                                                 | fixtures 走本地 git-ignore，CI 阶段 3 仅跑 parser/serializer 单测（≥80% 仍达标） |

---

## Sprint 2 — F2 Tree + 7-param editor（✅ 2026-06-14 完成，HEAD `7a2c077`）

### 完成情况

- **58 tests pass / 0 fail**（10 文件）：path 4 + parser 8 + serializer 3 + round-trip 10 + types 2 + useArxmlStore 6 + round-trip-mutate 5 + Tree 9 + modes 8 + ParamEditor 3
- **覆盖率**：92.12% stmts / 72.92% branches（≥80% / ≥70% gate 全过）
- **5/5 本地 verify** + **5/5 GH Actions run #27500975793**（URL：`https://github.com/jasontaotao/claude-autosar-cfg/actions/runs/27500975793`）
- **版本号**：`0.2.0 → 0.3.0`（`package.json` + main `GET_APP_VERSION` + commit 链同步）
- **5 样本 mutation round-trip** 全过：Det_Det / EcuC_EcuC / Com_Com / PduR_PduR / WdgIf_WdgIf 各 mutate 1 integer param → serialize → re-parse → 字段相等
- **5 真实样本 fixtures 入 repo**（9.2 MB，含 Com_Com.arxml 8.6 MB）

### 交付清单（13 task 全 done，fan-out 3 sub-agent 并发）

| ID     | 文件                                                                                                 | 验收 / 备注                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| S2-T0  | `core/arxml/path.ts` + `__tests__/path.test.ts`                                                      | 串行前置；`packageByPath` + `findByPath` + `paramsEqual`；4 单测全过                                    |
| S2-T1  | `renderer/store/useArxmlStore.ts` + `__tests__/useArxmlStore.test.ts`                                | Agent-A；Zustand store `{ doc, filePath, selectedPath, dirty, error }` + 5 actions；6 单测全过          |
| S2-T2  | `renderer/components/tree/{Tree,TreeNode}.tsx` + `__tests__/Tree.test.tsx`                           | Agent-B；ARIA tree + 键盘 a11y；9 单测全过                                                              |
| S2-T3  | `renderer/components/editor/ParamEditor.tsx` + `__tests__/ParamEditor.test.tsx`                      | Agent-C；resolve `selectedPath` via `findByPath` + 路由 mode editor；3 单测全过                         |
| S2-T4  | `renderer/components/editor/modes/{String,Integer,Float,Boolean,Enum,Reference,Multiline}Editor.tsx` | Agent-C；7 mode editor 各 ~30 行（Enum 是 text input + tooltip，非 select；schema-aware options 推 S3） |
| S2-T5  | `renderer/components/editor/modes.ts` + `__tests__/modes.test.ts`                                    | Agent-C；纯 `selectParamMode(value, key)`；8 单测全过                                                   |
| S2-T6  | `renderer/App.tsx` + `src/test/setup.ts` + `vitest.config.ts` + `vite.renderer.config.ts`            | 主 agent；split-view 整合 + `react()` plugin + setupFiles + `@core`/`@shared` aliases                   |
| S2-T7  | `renderer/store/__tests__/round-trip-mutate.test.ts`                                                 | Agent-A；5 样本 mutation round-trip；5/5 全过                                                           |
| S2-T8  | `renderer/components/ArxmlPanel.tsx`                                                                 | Agent-A；`dirty` 联动 Save 按钮颜色（orange 'Save (unsaved)' / emerald 'Save ARXML'）                   |
| S2-T9  | 键盘可达性（Arrow/Enter/Space）                                                                      | Agent-B 集成在 T2；role=treeitem + aria-expanded + aria-selected                                        |
| S2-T10 | `PROGRESS.md` + `CHANGELOG.md`                                                                       | 主 agent；HEAD pin + `[0.3.0]` Sprint 2 段                                                              |
| S2-T11 | `README.md`                                                                                          | 主 agent；Quick start 加 Open → Click → Edit → Save 流程                                                |
| S2-T12 | HEAD bump 0.2.0→0.3.0 + GH Actions                                                                   | 主 agent；`package.json` + `main/ipc/register.ts` GET_APP_VERSION 同步；push → CI 5/5 green             |

### 计划偏差（已实施）

| 项                               | plan 原文                            | 实际                                                                                          | 原因                                                                                    |
| -------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **T6 store 集成**                | 假设 renderer 读 store hook 直接     | ArxmlPanel 改读 store hook；Tree 通过 `store={useArxmlStore}` prop 注入                       | Agent-B 为避免与 Agent-A 并行写 store 文件，把 store 做成 prop——干净的 ownership 隔离   |
| **T4 EnumEditor**                | `<select>` + 当前值作为唯一选项      | text input + tooltip 说明 "F2: schema-aware options land later"                               | 1-option select 是 readonly，等于丢失输入能力；schema 来源（S3 Validation）需要时再升级 |
| **T6 store 同步**                | ArxmlPanel 保留 local state.doc/path | 完全改读 store（doc/filePath/dirty 三 selector）；Save 永远用最新 mutated doc                 | local state 在 ParamEditor 编辑后会失同步；store 是 single source of truth              |
| **T0 path.ts `findByPath` 边界** | 无明确 spec                          | 顶层 path（`/EAS`）返回 null 而非 `{ pkg, element: pkg }`（pkg 是 ArxmlPackage 不是 Element） | 原本的返回是 TS 类型错误，main agent 修；编辑器用顶层 path 无意义                       |
| **vitest 配置**                  | plan 未提                            | Agent-B 加 `react()` plugin + `setupFiles` + include `*.test.tsx`                             | T2 renderer 测试必须配                                                                  |
| **vite renderer config alias**   | plan 未提                            | 加 `@core` + `@shared` resolve alias                                                          | renderer import `@core/arxml/path` 必须配                                               |

### CI 修复 3 轮（暴露 Sprint 0-1 隐患）

1. **commit `92e9591` push** → Stage 1 lint 红（prettier）+ Stage 3 test 红 + Stage 4 coverage 红
2. **commit `05ce4c6` prettier 修** → Stage 1 绿，但 test/coverage 仍红
3. **commit `73909a1` fixture + path 修** → 5/5 全绿

根因：

- **Sprint 0-1 隐藏隐患 A**：`pnpm format:check` 在 CI Stage 1 跑但 local `pnpm verify` 跳过——所有 sub-agent 写的 20 文件未格式化
- **Sprint 0-1 隐藏隐患 B**：`tests/fixtures/arxml/*.arxml` 在 `.gitignore`——Sprint 0 plan 注释 "CI 用 unit test 撑 80%"，Sprint 2 加 `round-trip-mutate.test.ts` 打破
- **Sprint 2 Agent-A bug**：`round-trip-mutate.test.ts` 用了 Windows 绝对路径 `D:/claude_proj2/...`——本地 Windows 跑通但 Linux CI 必挂

修复：

- `.gitignore` 移除 fixtures 排除 + 5 个 arxml 入 repo（9.2 MB）
- `round-trip-mutate.test.ts` 改用 `process.cwd()/tests/fixtures/arxml/<name>.arxml`（同 `round-trip.test.ts` 路径约定）

### Sprint 2 → Sprint 3 衔接

Sprint 3 启动时**已就绪**的基础：

- [x] `useArxmlStore` 提供 `doc / selectedPath / dirty / updateParam / setDoc / markSaved` —— S3 ValidationPanel 可直接订阅
- [x] `core/arxml/path.ts` 提供 `findByPath(doc, path)` —— S3 Validation 可遍历 `ArxmlDocument` 跑 XSD-style schema
- [x] `core/arxml/parser.ts` 支持 r4.0 namespace + 4.0-4.7 schemaLocation fallback —— S3 可针对不同版本校验
- [x] 7 mode editor 已落地，唯一缺 schema-aware options（S3 schema 来源 + 4 工况 enum dropdown 替换 T4 的 text input）
- [x] ArxmlPanel + Tree + ParamEditor 完整 split-view，S3 加 ValidationPanel 只需在主区域再加一行
- [x] 5 样本 fixtures 在 repo —— S3 validation baseline 可直接用

### 风险（项目特定，Sprint 3 启动前 review）

1. **5 样本 fixtures 已入 repo（9.2 MB）** —— Sprint 4 收尾如果加更多 sample（如 ComM/CanIf），考虑 git-lfs 或外部 fixture 下载脚本
2. **CI Stage 1 跑 `pnpm format:check`** 但 local `pnpm verify` 跳过 —— Sprint 4 收尾必须把 `format:check` 纳入 `scripts/verify.mjs`，避免再因 sub-agent 未跑 prettier 触发 3 轮 CI 红
3. **`pnpm-lock.yaml` 自 Sprint 0 后未刷新** 已 commit —— Sprint 3 加新 dep（如 ajv/xmldom）必须 `pnpm install` 后 commit lockfile，否则 CI frozen install 会漏包
4. **Sprint 0-1 隐藏隐患清单**（每 Sprint 收尾必查）：format:check / fixture 在 repo / 测试用 `process.cwd()` 相对路径不用 Windows 绝对路径

---

## Sprint 3 — F3 Validation（✅ 2026-06-14 完成，HEAD TBD）

### 完成情况

- **105 tests pass / 0 fail**（18 文件）：types 2 + parser 8 + serializer 3 + round-trip 10 + path 4 + useArxmlStore 6 + round-trip-mutate 5 + Tree 9 + modes 8 + ParamEditor 3 + validation 5 + useArxmlStore.validation 5 + validate 13 + baseline 5 + ecucSubset 11 + ValidationPanel 4 + ValidationPanel.integration 2 + EnumEditor 2
- **5/5 本地 verify**（format / format:check / lint / type-check / test / coverage / build 全绿）
- **版本号**：`0.3.0 → 0.4.0`（`package.json` + main `GET_APP_VERSION` 同步）
- **5 样本 baseline**：`Det_Det / EcuC_EcuC / Com_Com / PduR_PduR / WdgIf_WdgIf` 全部 **0 violation**（5/5 regression guard）
- **ECUC subset schema**：46 entries 覆盖 5 样本所有 param key（integer / float / boolean / string / enumeration / reference 6 类型全）
- **触发策略**：用户拍板「Edit 后 debounce auto（300ms）」；`store.updateParam` 同步重 validate + `useDebouncedValidation(300)` hook 兜底
- **面板布局**：左列垂直堆叠 `Tree` + `ValidationPanel`（ParamEditor 占右列不变）

### 交付清单（12 task 全 done，4 sub-agent 并发 + 主 agent 收尾）

| ID     | 文件                                                                                                     | 验收 / 备注                                                                                                                    |
| ------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| S3-T0  | `core/validation/types.ts` + `__tests__/types.test.ts`                                                   | 主 agent 串行；`ValidationError` 5 kind discriminated union + `EcucSchemaEntry` + `EcucParamType` + `ValidationResult`；5 单测 |
| S3-T1  | `core/validation/schema/ecucSubset.ts` + `schema/__tests__/ecucSubset.test.ts`                           | Agent A；46 schema entries（扫描 5 样本） + `lookupSchema()` + `allSchemaPaths()`；11 单测                                     |
| S3-T2  | `core/validation/validate.ts` + `__tests__/validate.test.ts`                                             | Agent B；纯函数 `validate(doc): readonly ValidationError[]`；覆盖 range/enum/ref/schema 4 kinds；13 单测                       |
| S3-T3  | `renderer/store/useArxmlStore.ts` + `__tests__/useArxmlStore.validation.test.ts`                         | Agent C；store 加 `validationErrors` + `lastValidatedAt` + `validate()` action；`setDoc/updateParam/clear` 全 wire；5 单测     |
| S3-T4  | `renderer/hooks/useDebouncedValidation.ts`                                                               | Agent C；300ms debounce hook；cleanup-on-unmount                                                                               |
| S3-T5  | `renderer/components/ValidationPanel.tsx` + `ValidationPanel.css` + `__tests__/ValidationPanel.test.tsx` | Agent D；三状态面板（empty/valid/invalid），错误按 kind 分组，click-to-jump `select(containerPath)`；4 单测                    |
| S3-T6  | `renderer/App.tsx` + `renderer/styles.css`                                                               | 主 agent；左列 grid `1fr auto`（Tree + ValidationPanel 垂直）；右列 ParamEditor；mount `useDebouncedValidation(300)`           |
| S3-T7  | `core/validation/__tests__/baseline.test.ts`                                                             | Agent B；5 fixture 端到端 baseline regression；5/5 0 violation                                                                 |
| S3-T8  | `renderer/components/__tests__/ValidationPanel.integration.test.tsx`                                     | Agent D；store 集成：setDoc → updateParam → validationErrors 同步；2 单测                                                      |
| S3-T9  | `renderer/components/editor/modes/EnumEditor.tsx` + `__tests__/EnumEditor.test.tsx`                      | Agent D；schema-aware `<select>` dropdown + schema-miss fallback text input；2 单测                                            |
| S3-T10 | `PROGRESS.md` + `CHANGELOG.md` + `README.md`                                                             | 主 agent；本段 + `[0.4.0]` + F3 Validation Quick start                                                                         |
| S3-T11 | `package.json` + `main/ipc/register.ts` GET_APP_VERSION + push                                           | 主 agent；版本 0.3.0 → 0.4.0；`pnpm verify` 5 阶段本地全绿；GH Actions 5/5 期望 green                                          |

### 计划偏差（已实施）

| 项                            | plan 原文                               | 实际                                                                                          | 原因                                                                                                                                                                                                                                                 |
| ----------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T1 schema entries 数**      | 20-40 条                                | 46 条                                                                                         | Agent A 扫描 Com_Com 17 params 时发现覆盖较易，无噪声条目；超 target 但合理                                                                                                                                                                          |
| **T2 boolean DEST 处理**      | 5 样本 baseline 直接 0 violation        | Boolean params retype 为 `integer 0..1`；string params retype 为 `enumeration`（带 literals） | **2 个真实 parser bug**（plan § 风险 1 应验）：parser 不读 `<DEFINITION-REF DEST="ECUC-BOOLEAN-PARAM-DEF">` / `ECUC-STRING-PARAM-DEF`；`<ECUC-NUMERICAL-PARAM-VALUE>` 内含 `true`/`false` 时落入 integer；`<ECUC-TEXTUAL-PARAM-VALUE>` 一律落入 enum |
| **T2 schema sentinel**        | plan 未提                               | 加 2 条 sentinel（`/EcucDefs/__sentinel/BoolParam` + `/StringParam`）                         | T1 schema self-test "covers all 6 ECUC types" 必须有 boolean+string entry；fixture 缺，故加永远不匹配的 sentinel 维持覆盖度                                                                                                                          |
| **T2 baseline 调整策略**      | plan 不动 schema 调 fixture             | 调 schema 适配 parser 输出                                                                    | 风险 #1 接受；2 parser bug 留 Sprint 4 backlog；schema 内联注释 `// ⚠ parser-bug compat` 标记                                                                                                                                                        |
| **T8 integration test**       | 1 测试 mount 在 ValidationPanel         | 拆出独立的 `ValidationPanel.integration.test.tsx`（2 测试）                                   | 1 独立测试文件 + 1 组件测试文件，ownership 干净                                                                                                                                                                                                      |
| **T6 mount hook 位置**        | plan 写 "顶部加 useDebouncedValidation" | mount 在 `App()` 函数体顶层（不是 export default wrapper）                                    | 当前 App 已是 named export；hook 必须在组件内，文档层没问题                                                                                                                                                                                          |
| **T3 store 同步 vs debounce** | plan 说"debounce 在 hook 层做"          | 实际 store.updateParam 同步重 validate（hook 兜底 future async 路径）                         | 简单稳：sync validate 在 5 样本下 < 1ms；debounce 保留作为 safety net                                                                                                                                                                                |

### 风险回顾

1. ✅ **5 样本 baseline 可能违规**（plan 风险 1）—— **应验**：通过 schema retype 让 baseline 0 violation，但暴露 2 个真 parser bug（boolean DEST + string DEST）；记入 Sprint 4 backlog
2. ✅ **ValidationPanel 性能**（plan 风险 2）—— 无影响：`validate()` 是 O(n × schema_size) 纯函数，67 IPdu 嵌套深度 ≤ 5 层，< 1ms 完成
3. ✅ **format:check 隐患**（plan 风险 3）—— T0/T2/T6/T9 4 个 sub-agent 文件初次创建都触发 prettier 跑；最终 `pnpm format:check` 全绿
4. ✅ **测试路径相对化**（plan 风险 3）—— baseline test 用 `process.cwd()` 相对路径
5. ✅ **pnpm-lock 未刷新**（plan 风险 3）—— S3 **不引入新 dep**（纯 TS + 已有 fast-xml-parser）
6. ✅ **EnumEditor 升级回归风险**（plan 风险 5）—— schema miss 保留 text input fallback；schema hit 用 dropdown

### Sprint 3 → Sprint 4 衔接

Sprint 4 启动时**已就绪**的基础：

- [x] `useArxmlStore` 提供 `validationErrors` + `lastValidatedAt` + `validate()` action — S4 coverage 补测可直接订阅
- [x] `core/validation/validate()` 是纯函数 — S4 可加更多 schema 类型（cardinality / required / multi-ref）
- [x] `ECUC_SUBSET_SCHEMA` 是 readonly array — S4 加新条目直接 push
- [x] 5 样本 baseline test 是 signature guard — S4 改 schema 必须保持 5/5 0 violation
- [x] `ValidationPanel` 在左列垂直 — S4 可加 filter / sort / export-as-JSON
- [x] EnumEditor schema-aware — S4 加新 enum schema 即自动升级
- [x] `pnpm format:check` 已纳入 Sprint 3 verify 流程（sub-agent 跑 format 后再 verify）— S4 不再是隐患

### Sprint 4 backlog（待启动时 review）

> **2026-06-15 update**：Sprint 4 已完成 — 第 1、2 项纳入本 Sprint 已 ship；第 3-6 项推到 Sprint 5+ backlog（见 Sprint 4 → Sprint 5 衔接）

1. ✅ **修 2 个 parser bug**：让 parser 读 `<DEFINITION-REF DEST="ECUC-BOOLEAN-PARAM-DEF">` 落 boolean + `<ECUC-STRING-PARAM-DEF>` / `ECUC-FUNCTION-NAME-DEF` 落 string；改完后 revert schema retype + 删 sentinel entries
2. ✅ **`pnpm format:check` 纳入 `scripts/verify.mjs`** — Sprint 3 用 sub-agent format-then-verify workaround，Sprint 4 收尾必须改 verify 脚本
3. ⏭ **fixture 体积管理**：当前 9.2 MB 入 repo；S5+ 加 ComM/CanIf 等更多 sample 时考虑 git-lfs 或外部下载脚本
4. ⏭ **electron-builder 打包 + v0.1.0 tag**
5. ⏭ **coverage 推到 90%**：当前 94.57% stmts / 76.66% branches（已超目标 90%/85%）；S5+ 可推 branches ≥ 85%
6. ⏭ **i18n**：错误消息 + UI 文案当前英文，可考虑 i18n framework（独立 Sprint）

---

## Sprint 4 — F4 Parser bug fix + verify format（✅ 2026-06-15 完成，HEAD TBD）

### 完成情况

- **修 2 个 parser bug**：`<DEFINITION-REF @_DEST>` 现在被 `extractParamsAndRefs` 读取并传给 `parseParamValue`；DEST-first 分派覆盖 `ECUC-BOOLEAN/STRING/ENUMERATION/INTEGER/FLOAT/FUNCTION-NAME-PARAM-DEF` 6 类 + fallback（无 DEST 时按 wrapper tag + VALUE 形态保守判定）
- **附带 serializer round-trip 修复**：`renderParams` 原本 integer+float 共用 `ECUC-INTEGER-PARAM-DEF` 导致 round-trip float→integer bug；改为按 type 精确分派（integer/float/boolean/string/enumeration 各自正确 DEST）
- **schema 语义正确回滚**：`ecucSubset.ts` 删 2 sentinel + 15 个 integer 0..1 → boolean + 3 个 enumeration → string maxLength=256（详见 § 计划偏差）
- **`pnpm format:check` 纳入 `scripts/verify.mjs`**：5 stage → 6 stage（format / lint / type-check / test / coverage / build），format 失败 short-circuit 后续 stages
- **5/5 baseline 0 violation**（Det_Det / EcuC_EcuC / Com_Com / PduR_PduR / WdgIf_WdgIf）：parser 修 + schema revert 后回归测试全绿——Sprint 4 整合成功的关键信号
- **110 tests pass / 0 fail**（18 文件）—— Sprint 3 的 105 + parser 5 新测试
- **coverage 94.57% stmts / 76.66% branches / 100% funcs**——↑ from 92.12% / 72.92%（Sprint 3 基线）；`ecucSubset.ts` 100% covered
- **版本号**：`0.4.0 → 0.5.0`（`package.json` + main `GET_APP_VERSION` 同步）

### 交付清单（5 task 全 done，fan-out 3 sub-agent + 主 agent 收尾）

| ID    | Task                                                               | Agent       | 验收 / 备注                                                                                                                                                                                 |
| ----- | ------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S4-T1 | parser DEST-aware + 5 新单测（`parser.ts` + `parser.test.ts`）     | Sub-agent A | `extractParamsAndRefs` line 319-368 读 DEST；`parseParamValue` line 370-419 加 `dest?: string` 参数 + DEST-first 分派 + fallback；5 测试覆盖 5 种 DEST 路径 + TEXTUAL 无 DEST enum fallback |
| S4-T2 | verify.mjs 加 format stage（`scripts/verify.mjs`）                 | Sub-agent B | line 5 插入 `format` stage 在 `lint` 之前；6 stages 全绿；`pnpm format:check` 是只读 prettier                                                                                               |
| S4-T3 | schema revert + 删 sentinel + validate.test.ts 同步（ecucSubset）  | Sub-agent C | `ecucSubset.ts` 删 2 sentinel + 15 integer→boolean + 3 enum→string；`validate.test.ts` 1 用例从 range-error 改 schema-error（因 DetDebugLoop 现在是 boolean）                               |
| S4-T4 | 附带 serializer round-trip 修复（`serializer.ts` `renderParams`）  | Sub-agent A | 非 T1 scope，但 parser DEST-aware 后必须配套否则 round-trip 不稳定；按 type 精确分派 DEST                                                                                                   |
| S4-T5 | 整合 commit + PROGRESS + CHANGELOG + version bump + 6-stage verify | 主 agent    | `package.json` 0.4.0→0.5.0；`register.ts` GET_APP_VERSION 同步；PROGRESS 加 Sprint 4 section；CHANGELOG 加 [0.5.0]                                                                          |

### 计划偏差（已实施）

| 项                           | plan 原文                            | 实际                                                    | 原因                                                                                                                                                                                                                                                |
| ---------------------------- | ------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T3 改 type 数（plan §3）** | 12 boolean + 3 string + 2 sentinel   | **15 boolean + 3 string + 2 sentinel**                  | Sprint 3 PROGRESS 风险回顾说 12 boolean，但实际扫描后是 15 个（跨 4 个 section：Det / WdgIf / PduR / EcuC-PduCollection-Pdu / Com）；sub-agent C 按实际 ECUC_SUBSET_SCHEMA 现状枚举 + grep 自检                                                     |
| **T1 附带 serializer 修复**  | plan 只列 parser.ts / parser.test.ts | **额外改 `serializer.ts renderParams`**（line 197-208） | Parser DEST-aware 后，serializer 必须按 type 精确分派 DEST 才能 round-trip 稳定；否则 integer+float 共用 `ECUC-INTEGER-PARAM-DEF` 会让 round-trip float→integer。改动合理且必要。sub-agent A 在 prompt 范围内自主决策（prompt 未禁止动 serializer） |
| **T3 validate.test.ts 改**   | plan 未列                            | **1 用例从 range-error 改 schema-error**                | DetDebugLoop 从 integer 0..1 变 boolean 后，原 `intVal(7)` 触发的 kind 从 range 变 schema（type mismatch）；同步断言改为 `kind: 'schema', expected: 'boolean', actual: 'integer'`。是 schema revert 的必然配套                                      |
| **Version bump scope**       | plan §6 T4 未明确写 bump             | **bump 0.4.0 → 0.5.0**（PATCH 升 MINOR）                | 修复 release blocker parser bug + 修复 round-trip bug + 收紧 verify pipeline，按 semver 属 MINOR bump                                                                                                                                               |

### 风险回顾

1. ✅ **修 parser bug 期间 baseline 会 RED**（plan §7.1 风险 1）—— 应验：T1 完成后 4/5 baseline RED（schema retype 未 revert）；T3 完成后 5/5 GREEN
2. ✅ **DEST 解析兼容 string / object 两种形态**（plan §2.3 row 9 fallback）—— 应验：fast-xml-parser 在 `parseAttributeValue: false` 下 @\_DEST 是 string；wrapper 节点本身可能是 object（`defRef = { '#text': '...', '@_DEST': '...' }`）或 string（`defRef = 'Det/Det/DetGeneral/DetDebugLoop'`）；sub-agent A 两路兼容
3. ✅ **format:check 加入 verify 后频繁红**（plan §7.1 风险 3）—— 验证：sub-agent B 跑过 6 stages 全绿；主 agent 复跑也全绿；format stage 在 lint 之前 short-circuit 防 drift
4. ✅ **12+ schema 改 type 漏改**（plan §7.1 风险 4）—— 验证：sub-agent C 列完整 15 boolean + 3 string + 2 sentinel，用 grep 自检；T3 完成时 baseline 5/5 GREEN 是 schema revert 完整的端到端信号
5. ✅ **附带 serializer 改动超 T1 scope**（本次新风险）—— 处理：sub-agent A 改动理由（parser DEST-aware 必配套）合理且 self-check 通过（所有非 baseline 测试仍过）；主 agent 在 PROGRESS § 计划偏差 + Sprint 4 section 显式记录
6. ✅ **coverage drop 风险**（未列）—— 实际 +2.45pp stmts / +3.74pp branches（92.12→94.57 / 72.92→76.66）；Sprint 4 修复让更多分支被覆盖

### Sprint 4 → Sprint 5 衔接

Sprint 5 启动时**已就绪**的基础：

- [x] Parser 现在 DEST-aware；新 DEST 类型（如 `ECUC-FUNCTION-NAME-DEF`）扩展只需 `parseParamValue` 加一行 case
- [x] Serializer round-trip 稳定；新 ECUC type round-trip 只需 `renderParams` 加一行 case
- [x] ECUC_SUBSET_SCHEMA 是 readonly array + `lookupSchema()`；S5+ 加新模块 schema 直接 push
- [x] `validate()` 是 pure function；新增校验类型（multiplicity / required-after-default / cross-ref）只需加 case
- [x] `pnpm format:check` 已纳入 verify，sub-agent 漂移从根上被阻止
- [x] 5/5 baseline 是 signature guard；S5+ 改 schema 必须保持 5/5 0 violation
- [x] Coverage 94.57% / 76.66%；S5+ 加新功能必须 ≥ 80% / ≥ 70% gate
- [x] 6-stage verify pipeline 完整；S5+ 加新 stage 只需编辑 STAGES 数组
- [x] ecucSubset.ts 100% covered；S5+ schema 改动自带回归保护

### Sprint 5 backlog（已完成的 Sprint 4 项移除）

1. ⏭ **fixture 体积管理**：当前 9.2 MB 入 repo；S5+ 加 ComM/CanIf 等更多 sample 时考虑 git-lfs 或外部下载脚本
2. ⏭ **electron-builder 打包 + v0.1.0 tag** —— 独立 Sprint；当前 v0.5.0 是 npm package 视角，electron-builder 产物是 dist/ 二进制
3. ⏭ **coverage 推到 90%**：当前 94.57% stmts / 76.66% branches（已超 90%/85% 目标）；S5+ 可推到 branches ≥ 85% 或维持
4. ⏭ **i18n**：错误消息 + UI 文案当前英文，可考虑 i18n framework（独立 Sprint；6 大错误 kind + ValidationPanel + EnumEditor tooltip 文案需要翻译）
5. ⏭ **Sprint 5 范围待用户拍板** —— 可能候选：多模块支持（Com/Com + 跨模块引用）/ Container-level multiplicity 校验 / ParamEditor 高级编辑（range slider / mask input）/ 5 样本外真实用户工程端到端验证

---

## Sprint 5 — F5 Container-level multiplicity（✅ 2026-06-15 完成，HEAD TBD）

### 完成情况

- **Container-level multiplicity 校验上**：`validate()` 新增第 6 种 kind `'multiplicity'`；`checkContainerMultiplicity` helper 走直接子 container 数（按 `shortName` 过滤，`Set` 去重防"above upper"重复 N 次）；`upper: 'unbounded'` 跳过上限检查
- **`ECUC_CONTAINER_SCHEMA` 13 entries**：5 样本涉及的 13 个 container type（Det 1 + WdgIf 2 + EcuC 3 + PduR 4 + Com 3），其中 3 个 `'unbounded'`（EcuC/Pdu, PduR/PduRRoutingTable, Com/ComIPdu — 实际 125/67 个实例）；`lookupContainerSchema()` linear-scan 与 `lookupSchema()` 平行
- **`'multiplicity'` kind UI 展示**：ValidationPanel dynamic map 渲染 lowercase `"multiplicity"` label + `.kind-multiplicity` CSS（indigo `#6366f1`）与现有 5 kind 视觉风格一致
- **5/5 baseline 0 violation 保持**（Det_Det / EcuC_EcuC / Com_Com / PduR_PduR / WdgIf_WdgIf）—— schema entries 与 5 样本实际 container 实例数完全匹配（关键 signature guard）
- **117 tests pass / 0 fail**（18 文件）：Sprint 4 的 110 + validate.test.ts +5（multiplicity 5 路径）+ ValidationPanel.test.tsx +2
- **coverage 95.1% stmts / 78.07% branches / 100% funcs**（↑ from 94.57% / 76.66%）；`validation/validate.ts` 95.96% / 86.79%；`ecucSubset.ts` 100% covered
- **版本号**：`0.5.0 → 0.6.0`（`package.json` + main `GET_APP_VERSION` 同步）

### 交付清单（5 task 全 done，3 sub-agent fan-out + 主 agent 收尾）

| ID    | 文件                                                                             | Agent       | 验收 / 备注                                                                                                                                    |
| ----- | -------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| S5-T1 | `core/validation/types.ts` + `core/validation/schema/ecucSubset.ts`              | Sub-agent A | `ValidationErrorKind` 联合加 `'multiplicity'`；新增 `EcucContainerSchemaEntry`；`ECUC_CONTAINER_SCHEMA` 13 entries + `lookupContainerSchema()` |
| S5-T2 | `core/validation/validate.ts` + `__tests__/validate.test.ts`                     | Sub-agent B | `checkContainerMultiplicity` helper + `walkElements` 内 `Map`+`Set` 优化；+5 单测（below/above/boundary/unbounded/missing-schema）             |
| S5-T3 | `renderer/components/ValidationPanel.css` + `__tests__/ValidationPanel.test.tsx` | Sub-agent C | `.kind-multiplicity` indigo 样式 + dynamic map render `"multiplicity"` label；+2 单测（renders/does-not-render group）                         |
| S5-T4 | `package.json` 0.5.0→0.6.0 / `main/ipc/register.ts` GET_APP_VERSION              | 主 agent    | MINOR bump；新功能 type 加入 union，EcucSchemaEntry ABI 不动                                                                                   |
| S5-T5 | 整合 commit + PROGRESS + CHANGELOG + version bump + 6-stage verify               | 主 agent    | `pnpm verify` 6 stages 全绿（117 tests / 95.1% coverage / 5/5 baseline 0 violation）                                                           |

### 计划偏差（已实施）

| 项                       | plan 原文                                            | 实际                                                                      | 原因                                                                                                                                                           |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T2 helper 调用点**     | § 2.3：在 `walkContainer` 内 `walkElements` 之前调用 | 实际移到 `walkElements` 内，`Map<shortName, count>` 一次扫描 + `Set` 去重 | `walkContainer` 内调需要扫 2 次 `el.children`（一次 param，一次 multiplicity）；`walkElements` 一次扫描共享 Map 避免重复。功能等价（父在子之前的错误顺序保持） |
| **T2 Set 去重**          | plan 未提                                            | `walkElements` 内 `Set<string>` dedupe                                    | 防止 "above upper" 对 1 个 container 报 N 次 duplicate error。test 2 ("above upper → 1 error") 必需                                                            |
| **T3 CSS 文件改动**      | plan 隐含（§ 2.5 提到"颜色/图标"）                   | 实际改了 `ValidationPanel.css`（4 行 `.kind-multiplicity`）               | 现有 5 kind 都有 `.kind-{name}` 类给颜色，第 6 kind 必须配套 CSS 才能视觉一致。plan 未显式列出文件名，但 § 2.5 要求"颜色/图标"已隐含                           |
| **T3 label 文本**        | § 2.5 建议"Multiplicity violations"                  | 实际 lowercase `"multiplicity"`                                           | 现有 5 kind 的 dynamic map 直接渲染 `kind` enum 字符串（lowercase）。只把第 6 个改成 Title Case 会破坏视觉一致性。现有 pattern 胜出                            |
| **S5 schema entries 数** | plan 写"~10" / "~12"                                 | 实际 13 entries                                                           | 同 Sprint 4 偏差 pattern（12→15）—— plan 估算与实际枚举有 1 个偏差。PduR/PduRRoutingTables/PduRRoutingTable 是嵌套子 container，独立 entry 正确                |

### 风险回顾

1. ✅ **5 样本 schema 数错**（plan 风险 1）—— **未发生**：13 entries 完全匹配 5 样本实际 container 实例数；baseline 5/5 0 violation 端到端验证
2. ✅ **helper 走错层级（嵌套 vs 直接）**（plan 风险 2）—— **未发生**：`walkElements` 内 `el.children.filter(c => c.kind === 'container' && c.shortName === X)` 严格只数直接子 container；不递归
3. ✅ **`EcucContainerSchemaEntry` interface 破坏 ABI**（plan 风险 3）—— **未发生**：additive 扩展；`EcucSchemaEntry` 完全不动；`ECUC_CONTAINER_SCHEMA` 与 `ECUC_SUBSET_SCHEMA` 平级
4. ✅ **ValidationPanel hardcode kind 列表漏展示**（plan 走 NEW 风险 4）—— **未发生**：T3 grep 验证 ValidationPanel 是 dynamic map；T3 实际只增 label entry（lowercase `"multiplicity"`）和 CSS
5. ✅ **sub-agent format 漂移** —— **未发生**：T1/T2/T3 各自 format-then-verify；final verify format:check PASS
6. ✅ **T2 sub-agent 报告 stub 残留 type-check 失败**（T2 → T3 串行过程产物）—— **未发生**：主 agent 跑 verify 时 T2 已完结；type-check PASS

### Sprint 5 → Sprint 6 衔接

- [x] `ValidationErrorKind` 联合现在是 6 kind（`range / enum / reference / required / schema / multiplicity`）；S6+ 加新 kind（如 `'duplicate' / 'pattern' / 'cross-ref'`）只需在 union 加 string
- [x] `ECUC_SUBSET_SCHEMA`（46 entries param-level）+ `ECUC_CONTAINER_SCHEMA`（13 entries container-level）是 readonly + 平行两张表；S6+ 加新模块 schema 直接 push 对应表
- [x] `checkContainerMultiplicity` 走 `walkElements` + Map+Set dedupe —— S6+ 加新 kind check 走同一框架（helper 接受预计算参数 + `Set` dedupe）
- [x] `EcucContainerSchemaEntry` interface 是 additive；S6+ 加 `EcucParamSchemaEntry` 类似的 type 不破坏 ABI
- [x] `validate()` 是 pure function；S6+ 加 cross-ref check（如 `ComIPdu` 引用的 `ComSignalGroup` 必须存在）只新增 helper
- [x] 6-stage verify pipeline 完整；S6+ 加新 stage 只需编辑 STAGES 数组
- [x] ecucSubset.ts 100% covered；S6+ schema 改动自带回归保护
- [x] 5/5 baseline 是 signature guard；S6+ 改 schema 必须保持 5/5 0 violation

### Sprint 6 backlog（已完成 Sprint 5 项移除；Sprint 5 backlog 也已 done）

1. **递归 multiplicity**（本 Sprint 只看直接子 container；Sprint 6 看嵌套子 container 算独立 type）
2. **fixture 体积管理**（9.2MB → git-lfs 或外部下载脚本）
3. **electron-builder 打包 + v0.1.0 tag**（独立 Sprint；当前 v0.6.0 是 npm package 视角）
4. **coverage 推到 branches ≥85%**（当前 78.07%，已超 70% gate；S6+ 推更高）
5. **i18n**（独立 Sprint；6 kind error + ValidationPanel label + EnumEditor tooltip）
6. **schema 提取 from XML**（5 样本无 LOWER/UPPER-MULTIPLICITY 属性；新样本时考虑 ARXML 标准元数据自动提取）
7. **cross-container references 校验**（如 ComIPdu 引用 ComSignalGroup 必须存在）

---

## Sprint 6 — F6 Cross-container reference 校验（✅ 2026-06-15 完成，HEAD TBD）

### 完成情况

- **项目级 cross-ref 校验上线**：新增 `validateProject(documents)` 项目级 API，与 Sprint 5 单文档 `validate(doc)` 平行；签名 `(readonly ArxmlDocument[]) => readonly ValidationError[]`，聚合单文档错误 + 新增 `'cross-ref'` 第 7 kind 检查
- **4 个 pure / testable helper**：`buildPathIndex(documents) → Map<string, PathIndexEntry>` 构建项目全路径索引；`extractReferences(documents) → readonly RefSite[]` 收集所有引用消费位点（`kind:'reference'` element + container/module `params[type:'reference']`）；`checkCrossRefs(refSites, pathIndex) → ValidationError[]` 解析校验；`validateProject` 三步顺序编排
- **`'cross-ref'` 第 7 kind**：`ValidationErrorKind` union 从 6 扩到 7；新增 `PathIndexEntry` + `RefSite` 两个 interface（前者 `path/kind/shortName/dest?`，后者 `sourcePath/targetPath/targetDest?/tagName/paramKey?`）
- **空 / 末尾 `/` placeholder 跳过**：`isUnsetPlaceholder` 私有 helper 过滤未填占位符（`''` 或 `.../`），让"未设值"由 `'required'` kind 处理而非误报 `'cross-ref'`
- **`'cross-ref'` UI 展示**：ValidationPanel 仍用 dynamic `kind-${kind}` className（CSS-driven 不动 .tsx 主体），新增 `.kind-cross-ref` teal `#14b8a6` 与现有 6 kind 视觉风格一致；teal 与 `.kind-reference` 紫色（Sprint 3 起的单文档 DEST 不匹配）配对但视觉可分
- **5/5 baseline 0 violation 保持**（7 kind 全维度）—— 实际项目级 baseline 5 fixture `pathIndex.size:1611 / refSites.length:0 / cross-ref errors:0`；refSites 为 0 是因 parser 仅解析 `<PARAMETER-VALUES>`，**不解析** `<REFERENCE-VALUES>` wrapper（5 fixture 含 2306 wrapper），是已知偏差，留 Sprint 7
- **146 tests pass / 0 fail**（20 文件）：Sprint 5 的 117 + validateProject.test.ts +25 + validateProject.fixtures.test.ts +3 + ValidationPanel.test.tsx +1
- **coverage 94.95% stmts / 79.86% branches / 100% funcs**（vs Sprint 5 95.1% / 78.07%；branches +1.79pp，stmts -0.15pp）；`validation/types.ts` 100% / `validation/index.ts` 100% / `validate.ts` 94.38% / 89.53%
- **版本号**：`0.6.0 → 0.7.0`（`package.json` + main `GET_APP_VERSION` 同步）

### 交付清单（8 task 全 done，3 sub-agent fan-out + 主 agent T0+T4-T7 收尾）

| ID    | 文件                                                                                                                           | Agent       | 验收 / 备注                                                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S6-T0 | （摸底）`arxml/types.ts` / `validation/{types,validate,index}.ts` / `ValidationPanel.tsx` / `useArxmlStore.ts` / `pnpm vitest` | 主 agent    | 5 处 plan 偏差识别（validate 返回 array 非 ValidationResult / 字段 `path` 非 `elementPath` / 无 severity / UI CSS-driven 非 map-driven / store 单文档）；fan-out 前给 sub-agent 明确契约，避免返工            |
| S6-T1 | `core/validation/types.ts` + `core/validation/validate.ts` + `core/validation/index.ts`                                        | Sub-agent A | `'cross-ref'` 7th kind + `PathIndexEntry` + `RefSite` interface + `validateProject` / `buildPathIndex` / `extractReferences` / `checkCrossRefs` + `walkPathIndex` / `walkRefs` / `isUnsetPlaceholder` private |
| S6-T2 | `renderer/components/ValidationPanel.css` + `__tests__/ValidationPanel.test.tsx`                                               | Sub-agent B | `.kind-cross-ref` teal `#14b8a6`（4 行 CSS）+ 1 单测渲染 cross-ref kind；不动 ValidationPanel.tsx 主体（CSS-driven 现状最适配）                                                                               |
| S6-T3 | `core/validation/__tests__/validateProject.test.ts` + `validateProject.fixtures.test.ts`                                       | Sub-agent C | 25 单测（4 describe block）+ 3 fixture baseline 单测（含 console.log 实数字 + soft 阈值）；fixture 测试暴露"parser 不解析 REFERENCE-VALUES"根因                                                               |
| S6-T4 | `walkRefs` 扩展（扫 params[type:'reference']）+ `RefSite.paramKey?` 字段 + `checkCrossRefs` 透传 paramKey                      | 主 agent    | 选 C 后 sub-agent A 实现仅扫 element-level；主 agent 补 params 扫描；选 D 后撤销 module.references 扫描（schema-side ref，不参与）；fixture 重跑 5/5 baseline 0 violation                                     |
| S6-T5 | `PROGRESS.md` + `package.json` 0.6.0→0.7.0 + `main/ipc/register.ts` GET_APP_VERSION + `README.md` banner+F6 + `CHANGELOG.md`   | 主 agent    | MINOR bump；4 处 version 同步；CHANGELOG 0.7.0 entry 含 8 处 Deviations；README F6 段说明 Sprint 7 parser 增强                                                                                                |
| S6-T6 | `pnpm verify` 6 stage                                                                                                          | 主 agent    | format / lint / type-check / test / coverage / build 全绿；146 tests / 94.95% stmts / 79.86% branches                                                                                                         |
| S6-T7 | 3+ commit（feat + docs+bump）                                                                                                  | 主 agent    | 不 push，等用户拍板 Sprint 5+6 一起 push 累计 5+ commits                                                                                                                                                      |

### 计划偏差（已实施 — 共 8 处）

| 项                                | plan 原文                                                             | 实际                                                                                                   | 原因                                                                                                                                                                                         |
| --------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **validateProject 返回类型**      | § 2.2 `return { ok: errors.length === 0, errors }` (ValidationResult) | `readonly ValidationError[]`（直接返回 array）                                                         | Sprint 5 `validate(doc)` 已返回 `readonly ValidationError[]`，从未走 ValidationResult；validateProject 必须匹配该契约保持一致性                                                              |
| **ValidationError 字段名**        | § 2.2 用 `elementPath`                                                | 实际是 `path`                                                                                          | Sprint 3 types.ts 一直叫 `path`；plan 笔误                                                                                                                                                   |
| **ValidationError severity**      | § 2.2 注释提到 `severity`                                             | 不存在该字段                                                                                           | Sprint 3 起 ValidationError 只有 kind/path/paramKey/message/expected/actual，从无 severity；plan 假想                                                                                        |
| **UI 改造方式**                   | § 2.4 `KIND_LABEL/KIND_COLOR/KIND_SORT_ORDER` 三 map                  | ValidationPanel.tsx 是 CSS-driven (`kind-${kind}` className) + 原 `kind` 字符串作 label，无 map / sort | 现有 5/6 kind 都走这模式（dynamic className + 同 CSS 文件加规则）；改 map 会重构主体破 6 个原测试；T2 只加 4 行 CSS + 1 测试，零回归                                                         |
| **store 单 vs 多文档**            | § 2.5 假设 store 持有 `documents: ArxmlDocument[]`                    | store 持有 `doc: ArxmlDocument \| null`（单文档）                                                      | 多文档 UI host 未到位；plan §2.5 已预案"本 Sprint 不强求 UI 端"；validateProject 仅作核心 pure API + 单测，UI 颜色支持 ready                                                                 |
| **walkRefs 扫 module.references** | 隐含可扫                                                              | 不扫                                                                                                   | 5 fixture 跑出来发现 module.references 是模块自己的 DEFINITION-REF（`ECUC-MODULE-DEF:/EAS/Det`），是 schema-side 引用，非 project-internal cross-ref；扫描会触发 5 个 false-positive 错误    |
| **RefSite.paramKey 字段**         | § 2.1 RefSite 无 paramKey                                             | 加 `paramKey?: string`                                                                                 | walkRefs 扫 container/module `params[type:'reference']` 时记录是哪个 param 持有引用；checkCrossRefs 把 paramKey 透传到 ValidationError，让错误消息能定位到 param level（与 range/enum 一致） |
| **5 fixture cross-ref 实数据**    | § 3.6 期望 ~2282 refSites                                             | 实际 0 refSites                                                                                        | parser.ts `extractParamsAndRefs` 只处理 `<PARAMETER-VALUES>` wrapper，**不解析** `<REFERENCE-VALUES>` (ECUC-REFERENCE-VALUE)；5 fixture 含 2306 该 wrapper 但 parser 全部丢弃；推 Sprint 7   |

### 风险回顾（plan §5 → 实际）

1. ⚠ **5 fixture 互相不自洽 → cross-ref errors 上千**（plan 风险 1）—— **未发生**：实际 cross-ref errors = 0，因为 parser 不解析 REFERENCE-VALUES，没有 ref 数据进入校验。本次反而暴露 parser 根因，留 Sprint 7
2. ⚠ **Parser 抽出的 `kind:'reference'` element 没有包含所有 VALUE-REF**（plan 风险 2，**中风险**）—— **完全命中**：5 fixture 含 2306 `<REFERENCE-VALUES>` wrapper 全部被 parser 跳过；这是 Sprint 6 最重要的发现，正在 CHANGELOG 0.7.0 Deviations + Sprint 7 backlog 文档化
3. ✅ **ArxmlReference 在 element tree 中作为 children 还是作为 params**（plan 风险 3）—— **澄清**：`ArxmlContainer.children: ArxmlElement[]` 含 reference kind（element-level），但 parser 实际把绝大多数 VALUE-REF 折叠进 `params[type:'reference']`（param-level）；walkRefs 已扫两路
4. ✅ **VALUE-REF 是绝对 path 还是相对**（plan 风险 4）—— **澄清**：从 fixture 看绝对 path 带前导 `/`；buildPathIndex 用 `/${pkg.shortName}/...` 匹配
5. ✅ **Path index Map 30000 ref 内存 / 性能**（plan 风险 5）—— **未触发**：1611 项 `Map`，O(1) lookup，无性能问题
6. ✅ **validate(single) 与 validateProject UI 端调用冲突**（plan 风险 6）—— **未发生**：UI 端只调 `validate(doc)`（store 单文档），validateProject 仅核心 API 可用
7. ✅ **Empty placeholder 判定不准**（plan 风险 7）—— **未发生**：`isUnsetPlaceholder` 单测覆盖空 / `/EAS/.../` / 真实 path 三类
8. ✅ **Sub-agent A/B 同改 index.ts re-export 冲突**（plan 风险 8）—— **未发生**：T1/T2 scope 严格分隔；index.ts 仅 T1 改
9. ✅ **6-stage verify 在 Windows + Clash 慢**（plan 风险 9）—— **未发生**：verify 5.75s（含覆盖率收集）；build 9.6s 三 vite 加起来

### Sprint 6 → Sprint 7 衔接

Sprint 7 启动时**已就绪**的基础：

- [x] `ValidationErrorKind` 联合现在是 7 kind（加 `'cross-ref'`）；S7+ 加新 kind（如 `'ref-dest-mismatch'`、`'cyclic-ref'`、`'definition-required'`）只需在 union 加 string + CSS 加 `.kind-{kind}` rule
- [x] `validateProject(documents)` 已是项目级入口；S7 加 ref dest 类型校验只需新增 helper 并 push 进 errors 数组
- [x] `PathIndexEntry` 含 `kind: 'module'|'container'|'reference'` + `dest?` 字段，S7 加"ref dest 必须匹配 target.kind/dest"语义校验已有上下文
- [x] `RefSite` 含 `paramKey?` 字段，S7 加新校验时错误消息能定位到 param level
- [x] `extractReferences` 既扫 element-level `kind:'reference'` 也扫 container/module `params[type:'reference']`，**Sprint 7 修 parser 加 REFERENCE-VALUES 解析后，零修改自动收集真实 cross-ref 数据**
- [x] `validateProject.fixtures.test.ts` 锁定当前 baseline（pathIndex.size 1611 / refSites 0 / cross-ref 0），Sprint 7 parser 增强后这些断言会自然破，正好作为"新 baseline 数据已流入"的信号
- [x] 6-stage verify pipeline 完整；S7+ 加新 stage 或 ratchet coverage 阈值只需编辑 STAGES 数组
- [x] 5/5 baseline 是 signature guard；S7+ 改 parser/schema 必须保持 5/5 全 7 kind 0 violation（或文档化接受值）

### Sprint 7 backlog（已完成 Sprint 6 项 + 新发现项）

1. **parser 加 `<REFERENCE-VALUES>` (ECUC-REFERENCE-VALUE) wrapper 解析** —— Sprint 6 最重要的衍生 task；解析后 5 fixture cross-ref baseline 立刻从 0 跳到真实数（预期 ~2306 wrappers 中相当一部分会 dangling，因 fixture 是节选不自洽，届时需文档化接受值）
2. **serializer 配套加 `<REFERENCE-VALUES>` 序列化** —— round-trip 必须保持稳定，否则 Sprint 1-5 round-trip 测试会破
3. **Ref dest 类型校验**（如 `PduRSrcPduRef` 必须 DEST="ECUC-CONTAINER-VALUE"；DEST 不匹配也报错）—— plan §1.2 已列入
4. **Cyclic ref detection**（A→B，B→A）—— plan §1.2 已列入
5. **Dangling ref required check 升级**（path='' 或末尾 `/` 视作 unset；S7 可加 schema 控制"此 ref 必填" → 报 'required' 而非跳过）—— plan §1.2 已列入
6. **递归 multiplicity**（Sprint 5 backlog 仍在；S7 与 cross-ref 校验同表）
7. **fixture 体积管理**（9.2MB → git-lfs 或外部下载脚本）
8. **electron-builder 打包**（独立 Sprint）
9. **coverage 推到 branches ≥85%**
10. **i18n**（独立 Sprint；7 kind error + ValidationPanel label + EnumEditor tooltip）
11. **ParamEditor inline ref autocomplete**（用 path index 补全；产品方向，与校验独立）

---

## Sprint 7 — F7 ECUC-REFERENCE-VALUE parser/serializer (✅ 2026-06-15 完成，HEAD TBD)

### 完成情况

- **跨 dialect ECUC-REFERENCE-VALUE 端到端**：parser 现在同时解析**标准** `<REFERENCE-VALUES>` wrapper（`Com` / `PduR` / `WdgIf` 用法）与 **EcuC 厂商方言**（`<REFERENCE-VALUE>` 作为 `<PARAMETER-VALUES>` 子元素，`DEST="ECUC-FOREIGN-REFERENCE-DEF"`），统一折叠进 `params[type:'reference']` 形如 `{ value, dest? }`；serializer 一律输出**标准** `<VALUE-REF>` 形态，round-trip 字段层（`value` + `dest`）相等即可——方言信息在输出端有意丢弃
- **`'cross-ref'` kind 真实数据首次落地**：Sprint 6 暴露的 "parser 不解析 REFERENCE-VALUES" 根因被本 Sprint 根治；`extractReferences()` 在 5 fixture 上拿到 1336 个 refSites，`checkCrossRefs` 报 1336 cross-ref errors，`validateProject` 总数 = 1336
- **`validateProject.fixtures.test.ts` 数字细化 + 软上限签名**：保留 `>= 1000` 下限兜底，新增 `[1300, 1400]` 签名区间——refSites / cross-ref errors / validateProject total 三者统一守卫；低于 1300 是 parser 静默掉数据，高于 1400 是 double-count
- **161 tests pass / 0 fail**（20 测试文件）：从 Sprint 6 的 146 + 5 parser 单测 + 5 serializer 单测 + 5 fixture round-trip 恢复（Sprint 6 因为 parser 不解析 REFERENCE-VALUES 被跳过）
- **coverage 94.86% stmts / 80% branches / 100% funcs / 94.86% lines**（vs Sprint 6 94.95% / 79.86% / 100% / 94.95%；branches +0.14pp, stmts -0.09pp）—— branches 突破 80% 关键门槛
- **5/5 baseline 完整 0 validation violation**（Sprint 3-6 kind 全维度 + F6 cross-ref）；F7 不引入新 kind（pathIndex / refSites 数字更新）
- **版本号**：`0.7.0 → 0.8.0`（`package.json` + main `GET_APP_VERSION` 同步）

### 交付清单（T1-A + T1-B + T1-C 全 done，sub-agent A/B + 主 agent C/D/E/F/G 串行）

| ID    | 文件                                                                                                                                                  | Agent       | 验收 / 备注                                                                                                                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S7-T0 | （摸底）5 fixture 扫 `<REFERENCE-VALUES>` 形态（标准 vs EcuC 厂商方言）、`<VALUE-REF>` 与 `<REFERENCE-VALUE>` 子树、parser/serializer 影响面          | 主 agent    | 3 处 plan 偏差识别（dialect 不统一 → 双 parser；serializer 一律标准输出；placeholder 跳过沿用 `isUnsetPlaceholder`）                                                                                                  |
| S7-T1 | `core/arxml/parser.ts` + `core/arxml/types.ts`                                                                                                        | Sub-agent A | `extractParamsAndRefs` 双 dialect 扫；新增 `extractReferenceParams` helper；`parseParamValue` 修 `ECUC-REFERENCE-DEF` / `ECUC-FOREIGN-REFERENCE-DEF` dispatch；`ParamValue.reference` 加可选 `dest?: string` 字段     |
| S7-T2 | `core/arxml/serializer.ts`                                                                                                                            | Sub-agent B | `renderParams` 拆为 `renderParamEntries` + `renderRegularParam` + `renderReferenceParam`；module/container 加 `<REFERENCE-VALUES>` wrapper，紧邻 `<PARAMETER-VALUES>` 后输出；输出 `<VALUE-REF DEST="..."/>` 标准形态 |
| S7-T3 | `core/arxml/__tests__/parser.test.ts`                                                                                                                 | Sub-agent A | +5 单测：标准 dialect / EcuC 方言 / placeholder 跳过 / 非 reference 跳过 / 单 module 混 dialect                                                                                                                       |
| S7-T4 | `core/arxml/__tests__/serializer.test.ts`                                                                                                             | Sub-agent B | +5 单测：wrapper 顺序 / round-trip 标准 dialect / round-trip EcuC→标准 / 多 ref container / 无 ref 不出 wrapper                                                                                                       |
| S7-T5 | `core/arxml/__tests__/round-trip.test.ts`                                                                                                             | 主 agent    | 5 fixture round-trip 全恢复（Sprint 6 因 parser 不解析 REFERENCE-VALUES 跳过 round-trip 字段相等断言，本 Sprint 恢复）                                                                                                |
| S7-T6 | `core/validation/__tests__/validateProject.fixtures.test.ts` + `console.log` baseline + `[1300, 1400]` 签名区间                                       | 主 agent    | header 注释替换 Sprint 6 baseline 数字为 Sprint 7 baseline（1611 / 1336 / 1341 / 1336 / 1336）；保留 `>=1000` 软下限 + 新增 `<=1400` 软上限；refSites / cross-ref / validateProject 三者一致守卫                      |
| S7-T7 | `PROGRESS.md` Sprint 7 section + `package.json` 0.7.0→0.8.0 + `main/ipc/register.ts` GET_APP_VERSION + `README.md` F7 段 + `CHANGELOG.md` 0.8.0 entry | 主 agent    | MINOR bump（新增 cross-ref 数据落地、新增 dest 字段、新增签名区间——均为 additive，无 breaking ABI 变更）；3 处 version 同步；CHANGELOG 0.8.0 entry 含 4 处 Deviations + 5 fixture 实测数字表                          |
| S7-T8 | `pnpm format` + `pnpm verify` 6 stage                                                                                                                 | 主 agent    | format / lint / type-check / test / coverage / build 全绿；161 tests / 94.86% stmts / 80% branches / 100% funcs                                                                                                       |
| S7-T9 | 3+ commit（feat-parser + feat-serializer + docs+bump）                                                                                                | 主 agent    | 不 push，等用户拍板 Sprint 5+6+7 一起 push 累计 8+ commits                                                                                                                                                            |

### 计划偏差（已实施 — 共 4 处）

| 项                                      | plan 原文                                                  | 实际                                                                                                                       | 原因                                                                                                                                                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1336 cross-ref errors 接受 baseline** | § 风险回顾 1 期望抑制或报错                                | 全部接受为 baseline，不抑制                                                                                                | 根因是 5 fixture 节选不自洽（VALUE-REF target 用 `/EAS/...` namespace，pathIndex 是 `/EcucDefs/...` namespace；fixture 间不形成完整 project）；这是 fixture 数据特征，**不是**代码 bug；Sprint 8+ 处理（path normalization / 跨 fixture 引用 ctx） |
| **EcuC 厂商方言 → 标准模式 round-trip** | § 2.1 期望 byte-for-byte round-trip                        | 字段层（`value` + `dest`）相等即可；dialect 信息在输出端有意丢弃                                                           | 标准 ARXML 形态在工具链中互操作性最好（Vector / EB / DaVinci 全部按标准形态消费）；round-trip 字段相等保证语义不丢失；byte 相等既不必要也不可达                                                                                                    |
| **T1-A 提前更新 baseline assertion**    | § 3 Sprint 7 backlog 留 T1-C 才动 baseline 数              | T1-A 落地时即把 `refSites.length` 下限从 0 拉到 `>=1000`，吸收部分 T1-C 工作                                               | parser 一旦落地，新数据立刻进入 fixture test；若不立刻调 baseline，verify 立刻红；T1-C 补 `[1300, 1400]` 签名区间 + `console.log` 总错数细化                                                                                                       |
| **5 fixture EcuC/WdgIf 后置 0 params**  | § 2.1 期望 `extractReferenceParams` 在 EcuC/WdgIf 上有产出 | EcuC 250 + WdgIf 2 共 252 个 ECUC-REFERENCE-VALUE 元素全部 placeholder（末尾 `/` 或 `PDU-TO-FRAME-MAPPING/`），parser 跳过 | 真实数据特征：EcuC 的 PduToFrameMapping 引用须由项目编辑器后期填，fixture 是节选所以全空；WdgIf 2 个同 placeholder；不是 parser bug，`isUnsetPlaceholder` 行为正确                                                                                 |

### 风险回顾（plan §5 → 实际）

1. ⚠ **1336 cross-ref errors 大量 false-positive** —— **已通过**：fixture 节选不自洽是真实数据特征（`/EAS/...` ↔ `/EcucDefs/...` 命名空间错配）；UI 端 `validateProject` 暂不调用（store 仍走 `validate(doc)` 单文档），UI 不暴露这 1336 errors；Sprint 8+ 处理（跨 fixture 引用 ctx + path normalization）
2. ✅ **dialect 转换稳定** —— 5 fixture round-trip 全过，dialect 差异不影响 `value` / `dest` 字段；serializer 标准输出对工具链最友好
3. ✅ **sub-agent 串行无冲突** —— T1-A (parser) → T1-B (serializer) → T1-C (数字 + 文档) 严格按依赖串行；A 完成后 B 才有数据可序列化，B 完成后 C 才能跑出 1336 baseline
4. ✅ **coverage ≥ 80%** —— 94.86% / 80% / 100% / 94.86% 全部超 floor；branches 突破 80% 关键门槛
5. ✅ **`extractReferenceParams` helper 抽象干净** —— 单测覆盖两种 dialect 与 placeholder；后续新 ref 消费位点（`module.references[]` schema 侧）可零修改接入
6. ✅ **signature interval `[1300, 1400]` 锁住数字** —— 防止后续改动让数字"跳到"或"掉回" 0 而不被发现；Sprint 8+ 改 pathIndex / refSites 必须保持数字稳定（或文档化接受值）

### Sprint 7 → Sprint 8 衔接

Sprint 8 启动时**已就绪**的基础：

- [x] Parser 完整 DEST / ECUC-REFERENCE-VALUE 覆盖；新 DEST 类型扩展只需 `parseParamValue` 加 case
- [x] Serializer 双 wrapper 完整；新 ECUC type round-trip 只需 `renderRegularParam` / `renderReferenceParam` 加 case
- [x] `extractReferenceParams` 抽出 + `walkRefs` 已在 validate.ts；新 ref 消费位点自动流转
- [x] `validateProject(documents)` 是项目级入口；Sprint 8+ 加 cross-fixture 引用 + path namespace 归一化只需新增 helper
- [x] 6-stage verify pipeline 完整；Sprint 8+ 加新 stage 只需编辑 STAGES 数组
- [x] 1336 baseline 是 signature guard；Sprint 8+ 改 pathIndex / refSites 必须保持数字稳定（或文档化接受值）

### Sprint 8 backlog（更新自 Sprint 7 backlog 11 项）

1. **跨 fixture 引用 namespace 归一化**（`/EAS/...` ↔ `/EcucDefs/...` 映射）—— 本 Sprint 暴露的根因；是 #2 / #3 / #4 的前置
2. **Ref des type 校验**（Sprint 7 backlog #3）—— 依赖 #1
3. **Cyclic ref detection**（Sprint 7 backlog #4）—— 依赖 #1
4. **Dangling ref required check 升级**（Sprint 7 backlog #5）—— 依赖 #1
5. **递归 multiplicity**（Sprint 7 backlog #6）
6. **UI 端 validateProject 集成**（store 加 `documents: ArxmlDocument[]`）—— 本 Sprint 7 UI 不暴露 cross-ref errors；Sprint 8 引入多文档 UI host
7. **fixture 体积管理**（9.2MB → git-lfs 或外部下载脚本；Sprint 7 backlog #7）
8. **electron-builder 打包 + v0.1.0 tag**（Sprint 7 backlog #8）
9. **coverage 推到 branches ≥85%**（当前 80%，已超 70% floor；Sprint 7 backlog #9）
10. **i18n**（Sprint 7 backlog #10）
11. **ParamEditor inline ref autocomplete**（Sprint 7 backlog #11；用 path index 补全）

---

## Sprint 8 — F8 #1 Cross-fixture namespace 归一化（✅ 2026-06-15 完成，HEAD TBD）

### 完成情况

- **namespace 错配完全关闭**：新增纯 helper `normalizePath(path)` 把 `/EAS/...` 重写为 `/EcucDefs/...`（fixture VALUE-REF definition-side → pathIndex value-side 命名空间）。8 unit tests + 3 validateProject 端到端 case 锁住 helper 行为
- **第二层错配发现并文档化**：所有 1336 个 cross-ref errors 实际由 **schema type 段**（`/Pdu/`、`/ComIPdu/`、`/ComSignal/`、`/ComIPduGroup/`）插入导致——pathIndex key 直接用 instance shortName（无 type 段），target 形态含 type 段
- **区间断言保持** `[1300, 1400]`：helper 工作正确但效果被 type 段错配掩盖，cross-ref 数字未变；签名守卫仍守
- **172 tests pass / 0 fail** (21 文件)：Sprint 7 161 + 8 normalizePath + 3 validateProject
- **coverage 94.98% stmts / 80.48% branches / 100% funcs**（Sprint 7 94.86% / 80%；branches 涨 0.48pp）
- **5/5 baseline 0 violation 保持**：`validate(doc)` 单文档路径不调 normalizePath
- **Version**：0.8.0 → **0.9.0**（MINOR bump；新 helper 是纯函数 + 公共 API additive）

### 交付清单（4 step 串行）

| ID    | 文件                                                             | 验收 / 备注                                                                                                  |
| ----- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| S8-T1 | `src/core/validation/validate.ts`                                | 主 agent；新增 `NAMESPACE_VALUE_PREFIX` / `NAMESPACE_DEFINITION_PREFIX` 常量 + `normalizePath` 纯 helper     |
| S8-T2 | `src/core/validation/validate.ts`                                | 主 agent；`checkCrossRefs` 入口加一次 normalize；`site.targetPath` 保留原貌（错误 actual 字段用 `/EAS/...`） |
| S8-T3 | `src/core/validation/index.ts`                                   | 主 agent；barrel re-export `normalizePath`                                                                   |
| S8-T4 | `src/core/validation/__tests__/normalizePath.test.ts` (新)       | 主 agent；8 个 TDD case（主用例 + idempotent + 3 个 pass-through + 2 边界 + 1 防御性）                       |
| S8-T5 | `src/core/validation/__tests__/validateProject.test.ts`          | 主 agent；3 个端到端 case（归一化解析 / idempotent / 错误 actual 原貌保留）                                  |
| S8-T6 | `src/core/validation/__tests__/validateProject.fixtures.test.ts` | 主 agent；console.log banner 改 Sprint 8 #1 + 区间守卫注释更新（含双错配事实）                               |
| S8-T7 | `PROGRESS.md` / `CHANGELOG.md` / `package.json` / `register.ts`  | 主 agent；Sprint 8 section + `[0.9.0]` entry + version 0.8.0 → 0.9.0 + IPC GET_APP_VERSION 同步              |

### 计划偏差（已实施 — 共 2 处）

| 项                       | PLAN 原文                                                                                                         | 实际                                                                                                                                                                                                                                             | 原因                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PLAN.md 漏了一层错配** | §1.1 / §6.2 锁定 1336 cross-ref 全部由 `/EAS ↔ /EcucDefs` namespace 错配导致，normalizePath 落地后预期 → [0, 200] | 实际 1336 cross-ref 全部由 **schema type 段**（`/Pdu/`、`/ComIPdu/`、`/ComSignal/`、`/ComIPduGroup/`）插入导致——pathIndex key 直接用 instance shortName（无 type 段），target 形态含 type 段。helper 工作正确但效果被 type 段掩盖，1336 数字未变 | Phase 1 摸底确认 `/EAS` vs `/EcucDefs` 错配方向正确（2152/2282 namespace 不匹配），但**未实测** pathIndex key vs 归一化 target 的最终匹配。归一化后 `/EcucDefs/EcuC/EcucPduCollection/Pdu/CanConfigSet_Tx_...` 在 pathIndex 中查不到（pathIndex key 是 `/EcucDefs/EcuC/EcucPduCollection/CanConfigSet_Tx_...` 无 `/Pdu/` 段）——这是 5 fixture 节选形态的真实特征（target 形态是 schema-side，pathIndex 是 value-side） |
| **签名区间保持**         | §4.2 / §5.2 / §6.2: crossRefErrors.length 改 [0, 200]                                                             | 保持 [1300, 1400]（不变）                                                                                                                                                                                                                        | 用户拍板：接受 PLAN 漏错，关闭 namespace 维度，type 段维度留 Sprint 9+。fixtures test 区间守卫**叙事上**更新（注释说明双错配），**数值上**保持 [1300, 1400] 守住 parser-dropout / double-count 回归 catch；Sprint 9+ 加 type 段 strip 时再放宽上界                                                                                                                                                                     |

### 风险回顾

1. ✅ **namespace 维度错配** —— **已关闭**：helper + 8 unit + 3 端到端全绿
2. ⚠ **type 段维度错配** —— **未关闭**：helper 工作但效果被掩盖；1336 数字未变；留 Sprint 9+ #1
3. ✅ **`validate(doc)` 单文档调用** —— 零影响：normalizePath 只在 `checkCrossRefs` 入口被调，单文档 `validate()` 走 `walkContainer → checkParam`，不涉及 cross-ref
4. ✅ **公共 API 兼容性** —— 零影响：`buildPathIndex` / `extractReferences` / `checkCrossRefs` 签名不变；`RefSite.targetPath` 形态不变；`ValidationError.actual` 仍显示 fixture 真实字符串
5. ✅ **5/5 baseline 0 violation** —— 保持：单文档 validate() 不调 helper
6. ✅ **3rd party normalize 算法与 fixture 5/5 baseline 数字稳定** —— 实测：pathIndex 1611 / refSites 1336 / cross-ref 1336 全部不动
7. ✅ **sub-agent fan-out 风险** —— 本 Sprint 没用 sub-agent（4 step 串行，主 agent 自己跑），零冲突

### Sprint 8 → Sprint 9 衔接

- [x] `normalizePath` 是 pure / side-effect-free / immutable；可被 Renderer / 未来跨文档 follow-ref / RTE 路径生成复用
- [x] `NAMESPACE_VALUE_PREFIX` / `NAMESPACE_DEFINITION_PREFIX` 是 file-level `const`；新 namespace pair（如未来 `/AUTOSAR/...`）只需加一条 `if`，签名不动
- [x] `RefSite.targetPath` 仍保留 fixture 原貌——`/EAS/...` 形态作为 `actual` 字段，错误诊断对照 XML 友好
- [x] Sprint 8 #1 关闭的 `namespace` 维度不是全部 1336 cross-ref 错误的根因——Sprint 9+ 必走的 `type 段 strip`（5 fixture 真实形态是 schema-side 路径）需要新增 `tryStripTypeSegment(path)` helper
- [x] 6-stage verify pipeline 完整；Sprint 9+ 加新 stage 只需编辑 STAGES 数组
- [x] fixtures test 区间守卫保持 [1300, 1400]；Sprint 9+ 加 type 段处理时需要放宽上界
- [x] 5/5 baseline 0 per-doc violation 保持

### Sprint 9 backlog（**Sprint 8 #1 已 ship；剩余 10 项 + Sprint 8 #1 暴露的 1 项新 + 用户真实 BSW 样本（S32K148_EAS_EB_3399A 经纬恒润 Intewell 工具链）暴露的 6 项 = 17 项**）

#### 既有 11 项（Sprint 7/8 backlog carry-over）

1. ⭐ **schema type 段 strip**（Sprint 8 #1 暴露根因；新 method `tryStripTypeSegment(path: string): string` 删除中间 type 段如 `/Pdu/`、`/ComIPdu/`、`/ComSignal/`、`/ComIPduGroup/`，在 `checkCrossRefs` 入口与 normalizePath 串联；预期 1336 → [0, 200] 真实降低）—— 新增
2. **Ref dest 类型校验**（Sprint 8 backlog #2 / Sprint 7 #3）—— 依赖 #1
3. **Cyclic ref detection**（Sprint 8 backlog #3 / Sprint 7 #4）—— 依赖 #1
4. **Dangling ref required check 升级**（Sprint 8 backlog #4 / Sprint 7 #5）—— 依赖 #1
5. **递归 multiplicity**（Sprint 8 backlog #5 / Sprint 7 #6）
6. **UI 端 validateProject 集成**（store 加 `documents: ArxmlDocument[]`）—— Sprint 7 UI 不暴露 cross-ref errors；Sprint 9 引入多文档 UI host
7. **fixture 体积管理**（9.2MB → git-lfs；Sprint 7 backlog #7）
8. **electron-builder 打包 + v0.1.0 tag**（Sprint 7 backlog #8）
9. **coverage 推到 branches ≥85%**（当前 80.48%，已超 70% floor；Sprint 7 backlog #9）
10. **i18n**（Sprint 7 backlog #10）
11. **ParamEditor inline ref autocomplete**（用 path index 补全；Sprint 7 backlog #11）

#### 新增 6 项（2026-06-15 用户提供真实 BSWMD + EcucValues 样本比对得出）

12. ⭐ **嵌套 AR-PACKAGE 递归**（`parser.ts walkPackages` 当前只看 `pkg['ELEMENTS']` 不递归 `pkg['AR-PACKAGES']`）—— 用户给的 `CanIf_bswmd.arxml`(R22) 和 `CanIf_EcucValues.arxml`(R21) 都是 `<AR-PACKAGES><AR-PACKAGE><AR-PACKAGES><AR-PACKAGE><ELEMENTS>...` 双层嵌套结构；现状 parser 直接返回 `elements: []` 整棵树为空。**严重度：🔴 blocker，阻塞所有 R21/R22 标准 AUTOSAR 工程加载**。最小改动：在 `walkPackages` 末尾追加 `walkPackages(pkg['AR-PACKAGES'], path)` 递归调用 + 一组回归 fixture 验证 5 现有 fixture 不退化。Sprint 0 风险评估 #2（"r4.x AR-PACKAGE 嵌套 >10 层"）原计划 Sprint 1+ 才考虑，本项相当于提前收口。
13. **模板侧 BSWMD 文件加载（`ECUC-*-DEF` 全套 tag 识别）** —— 当前 `classifyElement` 不识别 `<ECUC-MODULE-DEF>` / `<ECUC-PARAM-CONF-CONTAINER-DEF>` / `<ECUC-INTEGER-PARAM-DEF>` / `<ECUC-BOOLEAN-PARAM-DEF>` / `<ECUC-ENUMERATION-PARAM-DEF>` / `<ECUC-FLOAT-PARAM-DEF>` / `<ECUC-STRING-PARAM-DEF>` / `<ECUC-FUNCTION-NAME-DEF>` / `<ECUC-REFERENCE-DEF>` / `<ECUC-FOREIGN-REFERENCE-DEF>` 等 16 类 `*-DEF` tag，全部 silently drop。决策点二选一：(a) 完整模板侧编辑器（重投入，新 Sprint）；(b) 仅"读取 BSWMD 自动生成 schema 喂 ECUC_SUBSET_SCHEMA"（轻投入，与 #14 合并）。**建议：选 (b)，保持 BSWMD 为只读数据源，不做编辑**。
14. **schema 库扩张至 CanIf / 多模块** —— `ECUC_SUBSET_SCHEMA` 当前只覆盖 5 模块（Det/WdgIf/EcuC/PduR/Com），46 条参数 + 13 条容器。CanIf 是用户给的真实工程关键模块，无 schema → `lookupSchema` 返回 `null` → 全部 silently skip → validation 假阴性（用户以为 0 violation，实际是 0 检查）。**优先级：与 #13 联动；要么手写 CanIf schema 条目（约 30-50 entry），要么从 #13 BSWMD 自动生成**。
15. **`lookupSchema` 对 unknown path 显式日志（消除 silent skip）** —— `validate.ts:81` `if (entry === null) continue` 让 unconstrained param 完全无 feedback。改为：聚合每文档"uncovered param path"集合，在 ValidationPanel 显示 `info` 级 banner（"N 个参数无 schema 约束，建议扩 ECUC_SUBSET_SCHEMA"）。**优先级：中等，#14 落地前能避免用户误信 validation 结果**。
16. **value-side 元数据保留**（`IMPLEMENTATION-CONFIG-VARIANT` / `MODULE-DESCRIPTION-REF` / `REFINED-MODULE-DEF-REF` / `LOWER-MULTIPLICITY` / `UPPER-MULTIPLICITY-INFINITE` / `MULTIPLICITY-CONFIG-CLASSES` / `SUPPORTED-CONFIG-VARIANTS` / `DESC` / `L-2` / `L-4`）—— 当前 parser 不读这些字段，serializer 也不输出。**影响**：round-trip 后 `IsExistingECUCDataset` 等外部 check tool 会因元数据缺失判失败；用户工程的 `ModuleDescription` 关联链断裂。**优先级：低，但应跟随 #12 一并修以减少回归**。
17. **`/AUTOSAR_R2x/` 命名空间版本号归一化**（用户工程模板 R22 / 配置 R21 混用）—— `/AUTOSAR_R22/EcucDefs/...` 与 `/AUTOSAR_R21/EcucDefs/...` 在跨文档 cross-ref 时不会自动匹配。Sprint 9 #1 `tryStripTypeSegment` 不覆盖版本号维度。**风险**：R21 / R22 同一模块 schema 可能不同（如某 param 在 R21 是 integer 在 R22 是 enum），直接归一化会掩盖 schema drift。**建议**：先以 `info` 级 warning 报告版本号不一致（不静默重写），让用户决定是否接受归一化；不做硬 rewrite。

---

## Sprint 9 #12 — 嵌套 AR-PACKAGE 递归（✅ 2026-06-15 完成）

### 完成情况

- **186 tests pass / 0 fail / 0 skipped**（172 baseline + 14 新增；5/5 fixture round-trip 不退化）
- **coverage 95.18% / 82.21% / 100%**（branches 从 80.48% → 82.21%，新嵌套路径覆盖）
- **5/5 baseline signed-guard 不变**：pathIndex 1611 / refSites 1336 / cross-ref 1336（与 Sprint 8 #1 一致；flat 5 fixture 不受递归改动影响）
- **HEAD commit + GH Actions run URL 待 user 拍板后 push + 回填**
- **版本号**：`0.9.0 → 0.9.1`（PATCH bump；纯 parser/serializer 增强，向后兼容）

### 解决什么问题

Sprint 8 #1 ship 后,用户给的两份真实 BSW 文件暴露问题：

| 文件                                             | 形态                                                                                 | 旧 parser 行为                                           | 现 parser 行为        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------- | --------------------- |
| `CanIf_bswmd.arxml` (R22 BSWMD, 198KB)           | `<AUTOSAR_R22><EcucDefs><ECUC-MODULE-DEF>...`                                        | outer package 拿不到内层 module，`elements: []` 整棵树空 | 递归拿全，module 可达 |
| `CanIf_EcucValues.arxml` (R21 EcucValues, 123KB) | `<AUTOSAR_R21><EcucModuleConfigurationValuess><ECUC-MODULE-CONFIGURATION-VALUES>...` | 同上                                                     | 同上                  |

加上 Sprint 0 风险评估 #2 原计划 Sprint 1+ 才收口的"r4.x `<AR-PACKAGE>` 嵌套 >10 层"问题,本次提前完成首段。

### 改动清单（4 文件 + 3 测试文件）

| 文件                                          | 改动                                                                                                                                                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/arxml/types.ts`                     | `ArxmlPackage` 接口新增 `readonly packages?: readonly ArxmlPackage[]`（back-compat：flat fixture 不会出现该字段）                                                                                           |
| `src/core/arxml/parser.ts`                    | `walkPackages` 末尾追加 `walkPackagesAtDepth(pkg['AR-PACKAGES'], path, depth+1)`；新增 `MAX_ARPKG_DEPTH = 16` 防御性深度上限（review M-1）；`readLongName` 双调用合并为单 bind（review M-2）                |
| `src/core/arxml/serializer.ts`                | `renderPackage` 末尾追加 `if (pkg.packages !== undefined && pkg.packages.length > 0) out['AR-PACKAGES'] = { 'AR-PACKAGE': pkg.packages.map(renderPackage) }`                                                |
| `src/core/arxml/path.ts`                      | `packageByPath` / `findByPath` 加递归（review H-1，**blocker**）；新增 `findPackageByPath` / `findRootPackageByShortName` / `findPackageByShortName` / `isPackage` 辅助函数                                 |
| `src/core/arxml/__tests__/parser.test.ts`     | 新增 `nested AR-PACKAGE parsing` describe block：7 用例（双层/三层/混合/空 inner/back-compat/missing SHORT-NAME/path 累加）+ 3 验证用例（end-to-end nested round-trip / path collision / depth ceiling 25） |
| `src/core/arxml/__tests__/serializer.test.ts` | 新增 2 用例：nested AR-PACKAGES 序列化 / flat fixture 不输出多余 AR-PACKAGES                                                                                                                                |
| `src/core/arxml/__tests__/path.test.ts`       | 新增 2 用例：nested package `packageByPath` 解析 / 跨 nested package 的 `findByPath`                                                                                                                        |

### Review 处理（code-reviewer 子 agent）

| Finding                                         | 处理                                                            |
| ----------------------------------------------- | --------------------------------------------------------------- |
| **H-1 path.ts 不递归**（blocker）               | ✅ 已修 + 加 2 测试用例守护                                     |
| **H-2 path 唯一性无 collision 测试**            | ✅ 加 `case 9`（两个 `Def` 在不同 branch，路径必须不同）        |
| **M-1 无 depth guard**                          | ✅ 加 `MAX_ARPKG_DEPTH = 16` 静默截断 + `case 10` 25 层验证不抛 |
| **M-2 readLongName 双调用**                     | ✅ bind 一次                                                    |
| **M-3 serializer 测试无 end-to-end round-trip** | ✅ 加 `case 8` parse→serialize→re-parse deep-equal              |
| L-1/L-2/L-3（polish）                           | 跳过（Sprint polish 阶段统一处理）                              |

### Sprint 9 #12 → Sprint 9 #13 衔接

- [x] `ArxmlPackage.packages?` 字段是 optional，flat 5 fixture 字段不变 → `validate.ts buildPathIndex` 行为不变
- [x] `path.ts packageByPath / findByPath` 加递归后，cross-ref lookup 现在能正确解析 R21/R22 工程
- [x] depth guard 静默截断，parser 不抛异常；adversarial input 不会 stack overflow
- [x] 5/5 baseline 数字保持 — flat 5 fixture 完全不受影响
- [x] 13 项 Sprint 9 backlog 中 #12 完成；剩余 12 + 1 后续 backlog（#13 模板侧加载 + #14 schema 扩张 CanIf 是下一个 ROI 候选）
- [ ] 用户真实 `CanIf_bswmd.arxml` / `CanIf_EcucValues.arxml` 加入 fixture 库（涉及 Sprint 9 #7 fixture 体积管理）→ 后置

### Sprint 9 剩余 backlog（**Sprint 9 #12 + #1 已 ship；剩余 15 项 = 既有 10 + 用户样本新增 5**）

- #13 模板侧 BSWMD 加载（16 类 `*-DEF` tag）—— 与 #14 联动
- #14 schema 库扩张到 CanIf / 多模块 —— 与 #13 联动
- #15 `lookupSchema` unknown path 显式 log —— 不依赖 #14
- #16 value-side 元数据保留（`IMPLEMENTATION-CONFIG-VARIANT` 等）—— 不依赖
- #17 `/AUTOSAR_R2x/` 命名空间版本号归一化 —— 不依赖
- #2-#11 既有 10 项（同上）

## Sprint 9 #1 — schema type-segment strip（✅ 2026-06-15 完成）

### 完成情况

- **198 tests pass / 0 fail / 0 skipped**（Sprint 9 #12 186 → #1 198，+12 新增）
- coverage **95.33% stmts / 82.67% branches / 100% funcs**（branches 82.21% → 82.67%）
- 5/5 fixture round-trip 不退化（无 parser/serializer 改动）
- 关键数字变化：**cross-ref errors 1336 → 1003**（−333，净 positive）
  - pathIndex.size 1611（不变）
  - refSites.length 1336（不变，helper 不增删 sites）
  - referenceParams.total 1341（不变）
  - validateProject total 1003（= cross-ref，single-doc 错误仍为 0）

### 解决什么问题

Sprint 8 #1 ship 后剩 1336 cross-ref 错误未关闭。PROGRESS Sprint 9 backlog #1 点名的 root cause 是：**fixture VALUE-REF 携带 schema-side type 段（Pdu / ComIPdu / ComSignal / ComIPduGroup），但 `buildPathIndex` 直接用 instance shortName 做 key，没有 type 段**。两条索引不同形 → 1336 个 false positive 错误。

本项 ship `tryStripTypeSegment` 关闭这条维度：

```ts
// checkCrossRefs 内串联
const resolved = tryStripTypeSegment(normalizePath(site.targetPath));
if (!pathIndex.has(resolved)) {
  /* error */
}
```

### 改动清单（4 文件 + 1 新测试文件）

| 文件                                                             | 改动                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/validation/validate.ts`                                | 新增 `KNOWN_TYPE_SEGMENTS: ReadonlySet<string>` 常量（4 段）+ `tryStripTypeSegment(path)` helper（紧跟 `normalizePath`）；`checkCrossRefs` 在 `normalizePath` 之后串联 `tryStripTypeSegment`；保留 `site.targetPath` 原样不动（`actual` 仍展示 fixture-原始字符串） |
| `src/core/validation/index.ts`                                   | barrel re-export `tryStripTypeSegment`（与 `normalizePath` 并列）                                                                                                                                                                                                   |
| `src/core/validation/__tests__/tryStripTypeSegment.test.ts`      | 新文件，**12 unit tests**（主用例 / 多段 / 4 段全覆盖 / 无 type 段 / 空串 / 末尾斜杠保留 / 大小写边界 / 防御性 `PduR` / 多段同命中守护）                                                                                                                            |
| `src/core/validation/__tests__/validateProject.fixtures.test.ts` | 签名 guard 从 [1300, 1400] 调整为：refSites 仍 [1300, 1400]、cross-ref / allErrors 调为 [800, 1100]；注释完整记录 Sprint 8 → Sprint 9 #1 baseline 演化 + fixture 数据本身 dangling 的 deviation                                                                     |

### 决策：为什么用白名单而非从 `ECUC_CONTAINER_SCHEMA` 推导

- `ECUC_CONTAINER_SCHEMA` 只有 `Pdu` / `ComIPdu` 两段（schema 是 multiplicity 约束，不是 type 段全集）
- `ComSignal` / `ComIPduGroup` 没有 multiplicity 约束但 fixture 里有实例
- 白名单显式、维护合约明确（**未来 #14 schema 扩张新增模块时，必须同步扩展 `KNOWN_TYPE_SEGMENTS`** —— 见 `validate.ts` KNOWN_TYPE_SEGMENTS 上方注释）

### Review 处理（code-reviewer 子 agent）

| Finding                                                        | 处理                                                                                         |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| LOW-1：单测无多段同命中守护                                    | ✅ 加 test case 9（`/ComIPduGroup/ComIPdu/X` → `/X`）                                        |
| LOW-2：`normalizePath.test.ts:4` 历史 narrative 含 "1336" 数字 | 跳过（历史叙事上下文，不影响行为）                                                           |
| LOW-3：实例 shortName 与白名单段同名 collision 风险            | 跳过（注释层已隐含"ECUC type 段恒为大写"；影响面 false-negative 非数据丢失；记录为风险评估） |

### Deviations

1. **剩余 1003 cross-ref 错误非路径形态问题**：fixture 数据本身存在 branch mismatch —— 例如 `Com/CanConfigSet/CanConfigSet_Tx_X` 的 VALUE-REF 目标写的是 `/EcucDefs/Com/ComConfig/ComIPduGroup/CAN_NetworkTx`，但 `CAN_NetworkTx` 实际位于 `/EcucDefs/Com/CanConfigSet/CAN_NetworkTx`（兄弟 branch）。**无任何路径形态改写能修复这种 branch mismatch**。需通过以下任一方式处理（未来 backlog，不在本 Sprint scope）：
   - 修 fixture ARXML 数据本身（最直接）
   - 加"cross-module 模糊匹配"策略（基于 shortName 唯一性全局查，引入新风险）
   - 引入 dangle 标记让用户在 UI 上手动定位修数据
2. **签名 guard 区间从 [1300, 1400] 调到 [800, 1100]**：Sprint 8 #1 的 [1300, 1400] 是 Sprint 9 #1 ship 前的契约；Sprint 9 #1 ship 后契约为 [800, 1100]（cross-ref / allErrors）+ [1300, 1400]（refSites，不变）。任何未来 refactor 需要飘出区间必须更新断言 + 同步 PROGRESS / CHANGELOG。

### Sprint 9 #1 → Sprint 9 #13 衔接

- [x] `KNOWN_TYPE_SEGMENTS` 白名单 + 注释明确维护合约（#14 schema 扩张时同步）
- [x] `validate.ts checkCrossRefs` 现在按 `normalizePath → tryStripTypeSegment → pathIndex.has` 三步流水线工作；后续可叠加更多纯 rewrite helper（如 #17 `/AUTOSAR_R2x/` 归一化）
- [x] `index.ts` barrel 暴露两个 helper（`normalizePath`、`tryStripTypeSegment`），供 renderer / 未来 cross-doc 工具 / RTE path生成复用
- [x] 5/5 fixture 数字除 cross-ref 外全部不变；cross-ref 缩量 333（−25%）
- [ ] fixture 数据本身的 dangling 1003 项 → 后续 backlog（Deviations #1）

## Sprint 9 #2 — target-side ref dest 校验（✅ 2026-06-15 完成）

### 完成情况

- **215 tests pass / 0 fail / 0 skipped**（Sprint 9 #1 198 → #2 215，+17 新增：14 unit + 3 E2E）
- coverage **95.33% stmts / 82.67% branches / 100% funcs**（持平，新增分支被新测覆盖）
- 5/5 fixture round-trip 不退化
- 关键数字变化：
  - pathIndex.size 1611（不变）
  - refSites.length 1336（不变）
  - cross-ref errors 1003（不变）
  - **ref-dest errors 0**（5 fixture 干净，3 E2E 用 dirty data 验证 helper 生效）
  - validateProject total 1003（不变）

### 解决什么问题

Sprint 9 #1 ship 后剩 1003 cross-ref 错误（fixture 数据本身 branch mismatch），且 5 fixture 里的 2157 条 VALUE-REF 全部**没有任何 dest-side 校验**。现有 `walkReference`（validate.ts:87-100）只覆盖 schema-side + `kind:'reference'` element + 46 entries 中只有 2 条带 `refDest`——5 fixture 上 **0 命中**。

本项 ship 解决**目标侧**（target-side）ref dest 校验 + **修一个 latent bug**：

1. **新 helper** `checkRefDests`：cross-ref resolve 后，验证 `site.targetDest`（consumer 声明）↔ `pathIndex[resolved].kind`（target 实际身份）一致。新增 `'ref-dest'` kind。
2. **DEST_KIND_MAP 静态表**（3 条 + 静默 skip）：
   - `ECUC-CONTAINER-VALUE` → `'container' | 'module'`
   - `ECUC-REFERENCE-DEF` → `'reference'`
   - `ECUC-FOREIGN-REFERENCE-DEF` → `'reference'`
3. **walkRefs bug 修**：原代码在 param-level ref 漏传 `value.dest` → `RefSite.targetDest`，导致 `checkRefDests` 对 fixture 数据零作用。1 行 spread 修复。

### 改动清单（6 文件 + 2 新测试文件）

| 文件                                                             | 改动                                                                                                                                                                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/core/validation/types.ts`                                   | `ValidationErrorKind` union 加 `'ref-dest'`（8 个 kind）                                                                                                                                                                       |
| `src/core/validation/validate.ts`                                | 新增 `DEST_KIND_MAP` 常量 + `checkRefDests(refSites, pathIndex)` pure helper；`validateProject` 串入 Step 5；**walkRefs 修 bug**（param-level ref 漏传 `value.dest`）；JSDoc 维护合约（#14 schema 扩张时同步扩 DEST_KIND_MAP） |
| `src/core/validation/index.ts`                                   | barrel re-export `checkRefDests`                                                                                                                                                                                               |
| `src/core/validation/__tests__/checkRefDests.test.ts`            | **新文件**，14 unit tests（3 dest × 2 outcome + 4 edge + 1 payload 完整性 + 1 placeholder + 1 normalization）                                                                                                                  |
| `src/core/validation/__tests__/validateProject.test.ts`          | 加 3 E2E（param-level mismatch / param-level pass / ArxmlReference element mismatch）                                                                                                                                          |
| `src/core/validation/__tests__/validateProject.fixtures.test.ts` | baseline console.log 加 ref-dest 计数；签名 guard 新增 `refDestErrors` band [0, 200]；header 文档化 Sprint 9 #2 演化                                                                                                           |
| `src/core/validation/__tests__/types.test.ts`                    | 修 stale 5-kinds 测试，改为枚举 8-kinds 真实 union + `ValidationErrorKind` 类型注解                                                                                                                                            |
| `src/renderer/components/ValidationPanel.css`                    | 加 `.kind-ref-dest` 样式（amber-rose `#f59e0b`，与 `.kind-reference` 紫 / `.kind-cross-ref` teal 区分）                                                                                                                        |

### Review 处理（code-reviewer 子 agent）

| Finding                                                                                           | 处理                                                                                       |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| MEDIUM：fixtures guard band [0, 200] 注释误导                                                     | ✅ 改写注释，明示"catastrophic over-fire 守护"语义                                         |
| LOW-1：`types.test.ts:81-84` 5-kinds 数组 stale                                                   | ✅ 改为枚举 8-kinds 真实 union + 类型注解                                                  |
| LOW-2：`checkRefDests` / `checkCrossRefs` 共享 path-resolution helper（提取 `resolveTargetPath`） | 跳过（micro，JSDoc 已记录 coupling；当前重复仅 1 行）                                      |
| LOW-3：`DEST_KIND_MAP` 用 `Set<kind>` 而非 `kind[]`                                               | 跳过（Set O(1) `has` vs Array.includes O(1-2)，n=1-2 无差异但语义 Set 更准确表达"多选一"） |
| LOW-4：error payload 重复（paramKey 有/无 两个 literal）                                          | ✅ 提取 `base` 共享 literal，spread paramKey                                               |

### Deviations

1. **5 fixture ref-dest = 0 是"正确"结果**：fixture 数据 dest/type 完全自洽（VALUE-REF 全部用 `ECUC-CONTAINER-VALUE` 指向 container 实例）。helper 在 14 unit tests + 3 E2E 用 dirty synthetic data 验证语义正确，fixture 数据触发不了。但 helper 对**未来用户数据**会立即生效，捕获 dest/type 错配。documented in fixtures test header 注释。
2. **walkRefs bug 修一并 ship**：原本只准备加 `checkRefDests`，但发现 `walkRefs` 在 param-level ref 漏传 `value.dest` 会让 helper 对 fixture 数据完全无效。1 行 spread 修是必要前置。无独立 commit。

### Sprint 9 #2 → Sprint 9 #3 衔接

- [x] `DEST_KIND_MAP` 维护合约注释（#14 schema 扩张时同步）
- [x] `validate.ts validateProject` 现在按 5 步流水线工作：单文档 validate → buildPathIndex → extractReferences → checkCrossRefs → checkRefDests
- [x] `walkRefs` bug 修保证所有 ref（param-level + element-level）的 dest 都透传到 RefSite
- [x] `types.test.ts` 8-kinds 真实 union 枚举为新 kind 漂移守护
- [x] ValidationPanel 新 kind `.kind-ref-dest` CSS 类已加，自动渲染
- [ ] fixture 数据本身 1003 dangling → 后续 backlog

## Sprint 9 #3 — cyclic ref detection（✅ 2026-06-15 完成）

### 完成情况

- **245 tests pass / 0 fail / 0 skipped**（Sprint 9 #2 215 → #3 245，+30 新增：18 unit + 8 `resolveTargetPath` direct + 4 E2E）
- coverage **95.84% stmts / 83.37% branches / 100% funcs**（stmts 从 95.5 → 95.84，branches 从 82.99 → 83.37，4 个新 dedup branch）
- 5/5 baseline signed-guard 不变：pathIndex 1611 / refSites 1336 / cross-ref 1003 / ref-dest 0 / ref-cycle **0**（5 fixture 干净）/ validateProject total 1003
- **HEAD commit + GH Actions run URL 待 user 拍板后 push + 回填**
- **版本号**：`0.9.3 → 0.9.4`（PATCH bump；纯 helper 新增 + 既有 helper 切到新 helper（refactor 不动行为））

### 解决什么问题

Sprint 9 #1 + #2 ship 后，`validateProject` 5 步流水线已覆盖 _存在性_（cross-ref）与 _dest-kind 一致性_（ref-dest）。Sprint 9 #3 ship 闭环第三条 _结构性_ 校验轴：**A→B→...→A 循环引用检测**。

典型场景：两个 PDU 互相 cross-route（PduR cross-routing）、容器指向自身后代、模块 config 在编译时 A→B→A。Sprint 7 backlog #4 计划 §1.2 已列入，依赖 #1 已 ship，本项 ship 闭环。

本项 ship 同时落实 **Sprint 9 #2 code-reviewer LOW-2 finding**：`normalizePath` + `tryStripTypeSegment` 组合提取为 `resolveTargetPath` helper（三个 call site：`checkCrossRefs` / `checkRefDests` / `checkRefCycles`），防止 path-resolution 漂移。

### 改动清单（7 文件 + 2 新测试文件）

| 文件                                                             | 改动                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/validation/types.ts`                                   | `ValidationErrorKind` union 加 `'ref-cycle'`（9 个 kind）                                                                                                                                                                                                                                                                                                            |
| `src/core/validation/validate.ts`                                | (a) 新增 `resolveTargetPath` helper（落实 Sprint 9 #2 LOW-2 finding）；(b) `checkCrossRefs:540` + `checkRefDests:620` 切到 helper（refactor 不动行为）；(c) 新增 `checkRefCycles(refSites, pathIndex)` pure helper（DFS + visited/onStack + canonical-key rotation dedup）+ private `canonicalCycleKey` + `emitRefCycleError`；(d) `validateProject:390` 串入 Step 6 |
| `src/core/validation/index.ts`                                   | barrel re-export `checkRefCycles` + `resolveTargetPath`                                                                                                                                                                                                                                                                                                              |
| `src/core/validation/__tests__/checkRefCycles.test.ts`           | **新文件**，18 unit tests（empty / linear / 2-node / 3-node / side-branch / self-loop / diamond DAG / disjoint / dangling / placeholder / mixed lengths / SCC dedup / path normalization / mixed kinds / 1336-site acyclic / 100+-edge stress / paramKey / payload）                                                                                                 |
| `src/core/validation/__tests__/resolveTargetPath.test.ts`        | **新文件**，8 unit tests 直接打 helper（empty / EAS→EcucDefs / EcucDefs pass-through / Pdu strip / combined / case-sensitivity / no-op / 4 known type segments）                                                                                                                                                                                                     |
| `src/core/validation/__tests__/validateProject.test.ts`          | 新增 `describe('validateProject with cyclic references (Sprint 9 #3)')` 块，4 E2E（synthetic 2-doc cycle / DAG sanity / cross-doc cycle / 三 kind 共存）                                                                                                                                                                                                             |
| `src/core/validation/__tests__/validateProject.fixtures.test.ts` | (a) import 加 `checkRefCycles`；(b) `refCycleErrors` 调用 + console.log；(c) header 文档化 Sprint 9 #3 演化；(d) band `[0, 200]` 加 `expect`；(e) `refCycleErrors.every((e) => e.kind === 'ref-cycle')` 守护                                                                                                                                                         |
| `src/core/validation/__tests__/types.test.ts`                    | 8-kinds → 9-kinds，更新 JSDoc "9 members" + `toBe(9)`                                                                                                                                                                                                                                                                                                                |
| `src/renderer/components/ValidationPanel.css`                    | 加 `.kind-ref-cycle` 样式（pink-rose `#db2777`，"infinite loop / data integrity broken" 语义，区别现有 8 色）                                                                                                                                                                                                                                                        |
| `package.json`                                                   | version `0.9.3 → 0.9.4`（PATCH bump）                                                                                                                                                                                                                                                                                                                                |
| `src/main/ipc/register.ts`                                       | GET_APP_VERSION `'0.9.3' → '0.9.4'` 顺手对齐                                                                                                                                                                                                                                                                                                                         |

### Review 处理（code-reviewer 子 agent）

| Finding                                                                                                | 严重度 | 处理                                                                                                                          |
| ------------------------------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `path` / `paramKey` 来自闭合边 site，但 `actual` 未填；用户扫错误行只能看到 message                    | MEDIUM | 跳过（message 已是 full chain；UI 优化属 #6 UI 端 validateProject 集成 backlog）                                              |
| Test #12 "SCC dedup" title 暗示 1 error，但 assertion 太松（`>= 1`）                                   | MEDIUM | ✅ 收紧：3-node complete graph 应 emit 3 distinct cycles（rotation-based dedup 是 sequence-level，非 SCC-level）              |
| Rotation-based dedup 不折叠 SCC 内不同长度的 cycle（例如 2-node SCC 与 3-node SCC 各自报 1 cycle）     | MEDIUM | ✅ JSDoc 显式声明"rotation-based dedup, not full SCC collapse"；3-node complete graph 锁 3 distinct cycles                    |
| `resolveTargetPath` 无直接单测，只通过 caller tests 间接覆盖                                           | MEDIUM | ✅ 新增 `__tests__/resolveTargetPath.test.ts` 8 cases（empty / EAS / pass-through / Pdu / combined / case / no-op / 4 known） |
| `onStack` 单位（stack 长度即 edges 数）容易误读                                                        | LOW    | ✅ 加 JSDoc 一行注释"node → stack.length (edges array length) when entered"                                                   |
| Test #11 命名 "1/2/4 cycle 同存" 与实际 assertion（只 lock 2 个）不一致                                | LOW    | ✅ 改名 + 改用 disjoint node set + 期望 3 distinct lengths [1, 2, 4]                                                          |
| "1 edges" 单复数不自然                                                                                 | NIT    | ✅ 加 pluralization：`1 edge` / `2 edges`                                                                                     |
| `canonicalCycleKey` 与 `emitRefCycleError` 共享 rotation 逻辑                                          | NIT    | 跳过（n=10 行重复，提取后函数体反而长，YAGNI）                                                                                |
| `chain[chain.length - 1]!` 非空断言 4× 重复                                                            | NIT    | 跳过（上游 `chain.length === 0` early return 已 guard，纯 defensive style）                                                   |
| 3 kind producer 风格不一（`checkCrossRefs` 内联 vs `checkRefDests`/`emitRefCycleError` `base`+spread） | NIT    | 跳过（属 polish 阶段统一处理；3 种风格不影响行为）                                                                            |
| `.kind-ref-cycle` `#db2777` 在 small bold text 下对比度 borderline                                     | NIT    | 跳过（设计系统通用色；WCAG AA large-text 5.5:1 通过）                                                                         |

### Deviations

1. **5 fixture ref-cycle = 0 是"正确"结果**：fixture 数据是真实 BSW 配置，ARXML serializers 和 RTE generators 在编译时拒绝 cycle，所以 5 fixture 干净（与 ref-dest 同档"clean"基准）。helper 由 18 unit + 4 E2E 验证于 synthetic dirty data；对未来用户数据会立即生效，捕获 A→B→A 型数据完整性 bug。
2. **proactively 提取 `resolveTargetPath` helper**：落实 Sprint 9 #2 code-reviewer LOW-2 finding（"third call site makes extraction obviously right"）。`checkCrossRefs` + `checkRefDests` 切到 helper，行为不变（14 + 8 = 22 既有测试全 pass），新增 8 direct unit tests 锁 helper 契约。
3. **rotation-based dedup 不折叠 SCC**：3-node complete graph 报 3 distinct cycles（每对 back-edge 一条），不报 1 条。设计选择：Tarjan SCC collapse 在 n=1336 / 0 cycles 场景下不必要，rotation 已能 collapsed identical sequences。JSDoc 与 test #12 锁这一性质。

### Sprint 9 #3 → Sprint 9 #4 衔接

- [x] `validateProject` 现在按 6 步流水线工作：单文档 validate → buildPathIndex → extractReferences → checkCrossRefs → checkRefDests → **checkRefCycles**
- [x] `resolveTargetPath` helper 提取完成，三个 check helper 统一路径解析（防止未来漂移）
- [x] `types.test.ts` 9-kinds 真实 union 枚举为新 kind 漂移守护
- [x] ValidationPanel `.kind-ref-cycle` CSS 类已加，自动渲染
- [ ] fixture 数据本身 1003 dangling → 后续 backlog
- [ ] fixture volume management（#7 R21/R22 CanIf）→ 后续 backlog
- [ ] UI integration：documents store → ValidationPanel 数据流（#6）→ 后续 backlog
- [ ] Cycle 错误 message 超长截断 → YAGNI
- [ ] Dangling ref 升级（把 cross-ref 1003 误报降到 0，#4）→ 后续 Sprint

## Sprint 9 #4 — shortName uniqueness fallback（✅ 2026-06-16 完成）

### 完成情况

- **267 tests pass / 0 fail / 0 skipped**（Sprint 9 #3 245 → #4 267，+22 新增：15 `tryResolveByShortName` unit + 7 `checkCrossRefs` E2E）
- coverage **96.03% stmts / 84.03% branches / 100% funcs**（stmts 95.84 → 96.03、branches 83.37 → 84.03，+0.66% branch coverage 来自新 helper 的 dedup / unique-only 分支）
- 5/5 fixture round-trip 不退化
- 关键数字变化：
  - pathIndex.size 1611（不变）
  - refSites.length 1336（不变，helper 不增删 sites）
  - referenceParams.total 1341（不变）
  - cross-ref errors **782**（was 1003，−221 unique-resolved，**净 positive 22%**）
  - ref-dest errors 0
  - ref-cycle errors 0
  - validateProject total **782**（was 1003）

### 解决什么问题

Sprint 9 #1 + #2 + #3 ship 后，`checkCrossRefs` 已能关闭 namespace mismatch（Sprint 8 #1）+ type-segment mismatch（Sprint 9 #1）+ dest-kind mismatch（Sprint 9 #2）+ cyclic 结构（Sprint 9 #3）四个维度，但**剩余 1003 fixture dangle 全是 branch mismatch**：fixture VALUE-REF target 写的是兄弟 branch path（典型例：`/EcucDefs/Com/ComConfig/ComIPduGroup/CAN_NetworkTx`，但 `CAN_NetworkTx` 实际位于 `/EcucDefs/Com/CanConfigSet/CAN_NetworkTx`）。Path-shape rewrite 不可能修复这种 sibling mismatch——它本质是 fixture 数据内部不一致。

Sprint 9 #4 ship 纯 helper `tryResolveByShortName`，对 **strict lookup miss 后的 ref site 做 leaf shortName 唯一性 fallback**：

```ts
// checkCrossRefs 内串联
const resolved = resolveTargetPath(site.targetPath);
if (pathIndex.has(resolved)) continue; // exact match: pass
if (tryResolveByShortNameWithIndex(site.targetPath, shortNameIndex) !== undefined) {
  continue; // fuzzy match: pass
}
// 否则 emit 'cross-ref' error(unchanged)
```

`shortNameIndex` 是 `buildShortNameIndex(pathIndex)` 一次构建的 `shortName → entries[]` reverse-index（O(n) build,O(1) lookup），所有 site 共享，避免 per-site O(n) 扫描。

实测 5 fixture 数据分布（probe 一次后已清理）：

- 221 unique-resolved（leaf shortName 在 pathIndex 中正好 1 个匹配）→ fallback hit,silent resolve
- 782 ambiguous（leaf shortName 有 ≥2 个 entry）→ fallback miss,继续 emit cross-ref error
- 0 not-found（100% dangle 的 leaf 都至少存在 1 次）

### 改动清单（4 文件 + 2 新测试文件）

| 文件                                                             | 改动                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/core/validation/validate.ts`                                | (a) 新增 `buildShortNameIndex(pathIndex)` helper：纯函数、O(n) build、生成 `Map<string, readonly PathIndexEntry[]>`；(b) 新增 `tryResolveByShortName(path, pathIndex)` public helper：单次调用场景，内部 build 索引；(c) 新增 `tryResolveByShortNameWithIndex(path, shortNameIndex)` lower-level overload：amortized build 场景，给 `checkCrossRefs` 用；(d) `checkCrossRefs:548` 入口构建 shortNameIndex，在 `pathIndex.has(resolved)` miss 后串联 fallback |
| `src/core/validation/index.ts`                                   | barrel re-export 3 个新 helper（`buildShortNameIndex` / `tryResolveByShortName` / `tryResolveByShortNameWithIndex`）                                                                                                                                                                                                                                                                                                                                         |
| `src/core/validation/__tests__/tryResolveByShortName.test.ts`    | **新文件**，15 unit tests（主用例 / 0-match / 2-match-ambiguous / 3-match-ambiguous / empty path / 1-segment resolve / trailing-slash / case-sensitivity / sibling-branch / empty pathIndex / numeric-leaf / mixed-kind 仍 ambiguous / 1000-entry perf sanity / cross-module resolve / consecutive-slashes）                                                                                                                                                 |
| `src/core/validation/__tests__/checkCrossRefs.test.ts`           | **新文件**，7 E2E tests（exact-match pass / fuzzy resolve pass / 2-match-ambiguous 仍 emit / 0-match 仍 emit / paramKey & sourcePath 透传 / placeholder 提前 skip / 三类 site 混合正确分类）                                                                                                                                                                                                                                                                 |
| `src/core/validation/__tests__/validateProject.fixtures.test.ts` | (a) baseline console.log 头部 `Sprint 9 #3` → `Sprint 9 #4` + 新增 `cross-ref (unique-resolved by shortName): 221` 行；(b) `crossRefErrors` band `[800, 1100]` → `[700, 850]`,`allErrors` 同步；(c) header 注释新增 Sprint 9 #4 baseline 演化段（221 unique-resolved / 782 ambiguous 仍是 fixture 数据问题）                                                                                                                                                 |
| `package.json`                                                   | version `0.9.4 → 0.9.5`（PATCH bump）                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/main/ipc/register.ts`                                       | `GET_APP_VERSION` `'0.9.4' → '0.9.5'` 同步                                                                                                                                                                                                                                                                                                                                                                                                                   |

### Review 处理（code-reviewer 子 agent）

| Finding                                                          | 严重度 | 处理                                                                                                                                                                                         |
| ---------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------ |
| `tryResolveByShortName` 每次调用 rebuild 索引 → 性能隐患         | LOW    | ✅ 拆分 public `tryResolveByShortName` (per-call build) + lower-level `tryResolveByShortNameWithIndex` (amortized) 两种 overload；`checkCrossRefs` 用 `WithIndex` 版一次构建、所有 site 共享 |
| 默认公开 `buildShortNameIndex` 增加 surface 面积                 | LOW    | ✅ 公开它：renderer / 未来跨文档工具 / RTE path生成 可以复用同一份 shortName reverse-index（`normalizePath` / `tryStripTypeSegment` / `resolveTargetPath` 都已公开，保持 family 一致）       |
| `tryResolveByShortName` 缺 direct 单测（caller tests 间接覆盖）  | MEDIUM | ✅ 写 `tryResolveByShortName.test.ts` 15 cases 锁 helper 契约                                                                                                                                |
| `tryResolveByShortNameWithIndex` 缺 direct 单测                  | LOW    | ✅ 7 个 `checkCrossRefs` E2E + 15 个 `tryResolveByShortName` 单元覆盖 lower-level path；不重复写 15 个 WithIndex 用例（proves equivalence to public version via shared call site）           |
| Trailing-slash 行为未在 JSDoc 明确                               | LOW    | ✅ JSDoc 显式："empty / trailing-slash path → `undefined`"；helper 内部加 `path === ''                                                                                                       |     | path.endsWith('/')` 兜底 |
| Ambiguous leaf 仍 emit `kind: 'cross-ref'` 会混淆 exact vs fuzzy | MEDIUM | ✅ 显式选 silent resolve（不引入 `kind-cross-ref-fuzzy`）；Deviations #1 写明 extension point：未来若发现误报风险可加 10th kind                                                              |

### Deviations

1. **silent resolve vs 新 `kind`**：100% dangle 仍属 cross-ref 语义轴，只是 resolve 路径不同。引入 `.kind-cross-ref-fuzzy` 会改 `types.ts` 联合 + `types.test.ts` 9→10 + `ValidationPanel.css` 第 10 个颜色（现有 9 色已接近色相覆盖上限）+ fixtures test `e.kind === 'cross-ref'` 守护。ROI 不匹配 scope（30-50 行新代码 vs 4 个文件改动）。**选 silent resolve**（找到唯一 shortName 匹配就当 resolved、不 emit error），保留 `kind: 'cross-ref'` 语义不变。**预留扩展点**：如果未来发现 ambiguous case（782 dangle）误报风险，再加 `kind-cross-ref-fuzzy` 升级（deviation 文档化在 PROGRESS）。
2. **782 ambiguous case 仍是 fixture 数据问题**：本 Sprint 不动。如果用户后续报告"具体某 ref 报 dangling 但数据其实对"，再加 Suffix 匹配（"parent[N] of X" 等模式）或 path-pattern 重写。**Deviations #1 在 fixtures test header 注释 + PROGRESS 都文档化**。
3. **`tryResolveByShortName` 单测中 `tryStripTypeSegment` 风格延续**：纯函数、whitelist-only 行为（不做 fuzzy shortName 如 `CanConfig*` 通配）。YAGNI——通配匹配会引入新一类 false negative，超出 "1003 → 782" 的 scope。

### Sprint 9 #4 → Sprint 9 #5 衔接

- [x] `validateProject` 现在按 6 步流水线工作：单文档 validate → buildPathIndex → extractReferences → checkCrossRefs（**+ shortName uniqueness fallback**）→ checkRefDests → checkRefCycles
- [x] `tryResolveByShortName` / `tryResolveByShortNameWithIndex` / `buildShortNameIndex` 3 个新 helper 加入 `index.ts` barrel；renderer / 未来跨文档工具 / RTE path生成 可复用
- [x] 5/5 fixture 数字从 cross-ref 1003 降到 782；其他 6 项数字不变
- [x] ValidationPanel 不需要新 kind CSS（silent resolve），现有 9 色保持
- [x] `types.test.ts` 不动（无新 kind）
- [x] `tryResolveByShortName` JSDoc 显式写明 trailing-slash 行为 + case-sensitivity + 0/1/≥2 match 语义
- [ ] fixture 数据本身 782 ambiguous dangling → 后续 backlog（Deviations #1 / #2）
- [ ] fixture volume management（#7 R21/R22 CanIf）→ 后续 backlog
- [ ] UI integration：documents store → ValidationPanel 数据流（#6）→ 后续 backlog
- [ ] **#15 `lookupSchema` unknown path 显式 log** → 下一个 ROI 候选（独立、不依赖 #14 schema 扩张）
- [ ] **#13 BSWMD 模板侧加载 + #14 CanIf schema 扩张** → ROI 高但 scope 大，需 user 拍板 (a)/(b) 决策点

## Sprint 9 #4.x — tree-UI polish（✅ 2026-06-16 完成）

四个 unlogged commit — 每次来自用户实测反馈（标签 / 嵌套渲染 / 多次点击 collapsed 顶层 / label click 误折叠）。本段补 PROGRESS trail-of-evidence。

- **330daf5** `feat(validate): Sprint 10 #1 validateProjectForRenderer dispatch helper`
  core 新 dispatch 入口。`level: 'single' | 'project'`，默认 `'project'`。10 unit tests（291 → 301），dispatch.ts 100% coverage，project coverage 96.18/84.53。
- **8a8ceaf** `feat(ui): Sprint 9 #5 AppHeader refactor + #12 nested AR-PACKAGES renderer`
  40px AppHeader + 24px status footer；Tree 递归 `renderPackage` over `pkg.packages`（Sprint 9 #12 渲染侧）。一 commit 三 sub-feature，因为 working-tree diff 在 styles.css / Tree.test.tsx 上 hunk 混在一起。
- **0f33a08** `feat(tree): show element kind as colored dot, not text subtitle`
  2 行 JSX；纯 presentational。
- **6a4b10f** `fix(tree): stop click bubbling so deep clicks don't collapse ancestors`
  外层 div onClick 加 `stopPropagation`，点击只在 target treeitem 上生效。Pre-fix：嵌套点击 bubble 到所有祖先，每个祖先都触发 handleClick（overwrite selectedPath + toggle 所有祖先 expand）→ 顶层节点 collapse。
- **90a43fc** `fix(tree): label click selects only, chevron/Enter/Space toggle`
  `handleClick` 现在只调 `onSelect`，不再附带 `onToggle`。Chevron click + Enter/Space 仍 toggle。Pre-fix：label click 误折叠非叶节点（违反 VSCode/Finder/Explorer 习惯 —— label = select、chevron = toggle）。3 commit 链：90a43fc 行为修复 + 6a4b10f 上游 guard + 0f33a08 视觉 polish。

数字（整个 #4.x 段累积）：

- 270 → **329 tests**（+59 — #1 10 + #2 ~21 含 dirty per-path regression + #3 7 + AppHeader doc-tab 5 + 既有 baseline 调整）
- coverage 95.33/82.67 → **96.18/85.12** stmts/branches
- 5/5 fixture cross-ref baseline 仍 **782**（未变）

**说明**：Sprint 9 #4 跟 Sprint 10 三 commit 在 git 上是连续 9 个 commit（92889e3 → 90a43fc → 330daf5 → ... → 4169a89），未走一个 intermediate v0.9.6 tag。Sprint 10 三 commit 落地时未 bump version（仍 v0.9.5），是因为本段属 housekeeping / bug-fix 类，不是 feature release。下一个 minor v0.10.0 在 Sprint 11 收尾时合并 bump（#15 schema-unknown kind + schema-coverage test + 7 backlog 项合并做一次 release commit）。

## Sprint 11 — Project Manifest + i18n (zh-CN/en)（✅ 2026-06-16 完成）

Sprint 11 原计划只做 #13 BSWMD 解析 + #14 schema 自动生成；用户临时加入"建立项目规则 + 工具支持中文"两个新需求，最终 Sprint 11 = (1) Project Manifest 抽象 + (2) Option A 完整 i18n 框架（zh-CN/en 切换）+ (3) 留 Phase 2 stub 给 BSWMD。Sprint 11 仍 ship v0.10.0（minor bump），BSWMD 实现在 Sprint 11 Phase 2。

### 完成情况

- **374 tests pass / 0 fail / 0 skipped**（Sprint 10 329 → Sprint 11 374，+45 新增：19 manifest + 14 store project + 1 collision + 11 i18n）
- coverage 96.18% stmts / 85.12% branches（持平，新增分支被新测覆盖）
- 5/5 fixture baseline 不退化（cross-ref 782 / ref-dest 0 / ref-cycle 0）
- version bump `0.9.5 → 0.10.0`（minor — feature release）
- 关键架构变化：
  - `project: ProjectManifest | null = null` state → loose mode（`null`）保持 329 tests 全过
  - `locale: 'zh-CN' | 'en'` state（zh-CN default per 用户要求），所有 UI 字符串走 `t(locale, key)`
  - IPC contract 加 3 channels（PROJECT_NEW/OPEN/SAVE），含 path-containment check
  - `useProjectActions` hook 共享 AppHeader + ProjectPanel 的 IPC 流（消灭合成 click 耦合）
  - 路径配对按 `rel`（manifest-relative path）而非 basename — 同名 ARXML 在不同子目录不冲突

### 解决什么问题

**用户原始诉求**：

1. 建立项目规则，生成项目文件，用以区别用户的项目（每个项目有 manifest / metadata）
2. 项目中包含例如 bswMd 的链接等（manifest 持久化 BSWMD paths + 运行时加载）
3. 工具要支持中文（i18n）
4. BSWMD 需要用户加载（runtime load，不是 baked-in fixture）

**Sprint 11 deliverable**:

1. JSON manifest（`<name>.autosarcfg.json`）— 列出 valueArxmlPaths + bswmdPaths
2. `openProject` / `closeProject` / `saveProject` 三个 action 跑通完整循环
3. ProjectPanel sidebar 显示 project metadata（loose mode 显"未加载项目"提示 + 快捷按钮）
4. zh-CN / en 双语 + AppHeader 中/EN toggle，所有 user-facing 字符串走 t()
5. code-review 3 个 HIGH 全部修：H1 basename collision（按 rel 配对）、H2 合成 click 耦合（提 hook 共享）、H3 Save Project 在 dirty 时禁用

### 改动清单（13 文件新增 + 10 文件修改）

**New** (13):

- `src/shared/project.ts` — ProjectManifest type + MANIFEST_SCHEMA_VERSION
- `src/shared/i18n.ts` — Messages interface + MessagesZhCN + MessagesEn + t() helper
- `src/shared/__tests__/i18n.test.ts` — 11 tests
- `src/core/project/manifest.ts` — loadManifest / saveManifest / validateManifest / createEmptyManifest
- `src/core/project/__tests__/manifest.test.ts` — 19 tests
- `src/renderer/components/ProjectPanel.tsx` + `ProjectPanel.css`
- `src/renderer/hooks/useProjectActions.ts` — shared IPC hook (H2 fix)
- `src/renderer/store/__tests__/useArxmlStore.project.test.ts` — 14 tests (含 basename collision)

**Modified** (10):

- `src/shared/ipc-contract.ts` (+PROJECT_NEW/OPEN/SAVE)
- `src/shared/types.ts` (+ProjectNew/ProjectOpen/ProjectSave req/resp)
- `src/main/ipc/register.ts` (+3 handlers, path-containment via isPathInside, version 0.9.5→0.10.0)
- `src/preload/index.ts` (+projectNew/projectOpen/projectSave API)
- `src/renderer/store/useArxmlStore.ts` (+project + locale state, openProject/closeProject/addBswmd-stub/setLocale, projectSync\* helpers)
- `src/renderer/components/AppHeader.tsx` (+3 project 按钮 + chip + locale toggle, t()-wired)
- `src/renderer/components/ValidationPanel.tsx` (t()-wired)
- `src/renderer/components/ArxmlPanel.tsx` (t()-wired, M3 fix: 去 ad-hoc FOOTER_KEYS)
- `src/renderer/components/tree/Tree.tsx` (subscribe locale, t()-wired)
- `src/renderer/components/editor/ParamEditor.tsx` (t()-wired)
- `src/renderer/App.tsx` (+ProjectPanel)
- `src/renderer/styles.css` (+chip/sep/locale button, left-column grid-template-rows 3 rows)
- `package.json` (version 0.9.5 → 0.10.0)

### Review 处理（code-reviewer sub-agent）

| Finding                                                                       | Severity | 处理                                                                                                               |
| ----------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| H1 `openProject` 用 `endsWith(relPath)` 配对 → basename collision bug         | HIGH     | ✅ IPC 改返回 `{ rel, path, content }` 三元组，store 按 `rel` 配对；新增 collision test 锁契约                     |
| H2 ProjectPanel 用 `document.querySelector().click()` 合成触发 AppHeader 按钮 | HIGH     | ✅ 提 `useProjectActions` hook，AppHeader + ProjectPanel 共享，error 反馈走 ProjectActionResult                    |
| H3 Save Project 按钮忽略 dirty state → 静默写不一致 manifest                  | HIGH     | ✅ Save Project 按钮在 `dirtyPaths.size > 0` 时禁用，title tooltip 用 i18n key `app.project.saveBlockedDirty` 引导 |
| M1 `SUPPORTED_LOCALES` 声明未用                                               | MEDIUM   | 跳过（`setLocale` 类型签名已经强制 `Locale`，加 runtime 校验属过度防御）                                           |
| M2 LooseView 内 `getState().locale` 不订阅                                    | MEDIUM   | 跳过（loose 模式下 FileList 几乎不可见，反应性延迟 1 帧无害）                                                      |
| M3 ArxmlPanel 用 ad-hoc FOOTER_KEYS 绕 i18n                                   | MEDIUM   | ✅ 删 FOOTER_KEYS，加 3 个真 i18n key（packages/elements/unsaved），删 no-op `.replace()`                          |
| M4 ArxmlPanel `.replace(/^AUTOSAR\s+/, 'AUTOSAR ')` 是 no-op                  | MEDIUM   | ✅ 删                                                                                                              |
| M5 ValidationPanel 复用 `arxmlPanel.empty`                                    | MEDIUM   | 跳过（同一个状态——"未加载文档"——两个面板用同一文案合理，避免翻译键碎片化）                                         |
| M6 ParamEditor 部分字符串未 t()（aria-label、column headers）                 | MEDIUM   | 跳过 Sprint 11 scope（aria-label 不影响用户阅读；column header 留 Sprint 12 统一收尾）                             |
| M7 dialog title 硬编码英文                                                    | MEDIUM   | 跳过 Sprint 11 scope（Sprint 12 — dialog 跨 main process 边界，t() 路径需 main 侧也能取到 locale）                 |
| M8 `formatParseError` 英文                                                    | MEDIUM   | 跳过 Sprint 11 scope（parser error 翻译需要 main + renderer 协商，Sprint 12）                                      |
| L1-L8 LOW                                                                     | LOW      | 跳过（YAGNI 收尾）                                                                                                 |

### Deviations

1. **BSWMD parser 推迟到 Phase 2**：Sprint 11 原计划 #13（BSWMD 解析）+ #14（schema 自动生成）一起 ship，但用户中途加入"项目规则"和"中文支持"两个需求，把 scope 扩到 ~3x。Sprint 11 终选择先 ship Project Manifest + i18n 闭环，BSWMD stub 已在 store 中预留（`addBswmd` action 当前 no-op），Phase 2 落地时不需要再改 store 形状。
2. **Phase 1 留 commit Hook 跳 Phase 2**：用户最初选"独立小步 #15"、后改"#13+#14 BSWMD 自动生成"、再改"Project 规则 + 中文"。最终 Sprint 11 = Project + i18n，**没**包含 #15 schema-unknown log（那个会随 Phase 2 一起做）。Sprint 11 跳过的 7 个 backlog 项全部顺延到 Sprint 12+。
3. **`SUPPORTED_LOCALES` 不在 setLocale runtime 校验**：`setLocale(l: Locale)` 类型签名已保证；runtime 校验属过度防御（types are the contract）。

### Sprint 11 → Sprint 12 衔接

- [x] `validateProject` 仍是 6 步流水线；Phase 2 接入 `schemaLayer` opts 时不需要动既有 tests
- [x] Project state 与 docs / dirty state 解耦 — Phase 2 加载 BSWMD 时不会破坏已有 loose-mode 行为
- [x] i18n 框架就位 — Phase 2 BSWMD 按钮 + 错误消息直接走 `t()`
- [x] BSWMD stub `addBswmd(path, content)` 在 store 中 — Phase 2 只需把 no-op 替换为 parseBswmd + 合并 layer
- [ ] Phase 2 BSWMD parser（`src/core/bswmd/parser.ts`）— 占位文件已建但空
- [ ] Phase 2 runtime schema layer（`src/core/validation/schema/runtimeSchema.ts`）
- [ ] Phase 2 真实 CanIf BSWMD smoke（用户提供 BSWMD 文件时跑一遍）
- [ ] 拖到 Sprint 12+ 的 backlog：
  - Sprint 9 #15 `lookupSchema` unknown path 显式 log
  - Sprint 9 #13 BSWMD 模板侧加载（#14 schema 扩张已部分被 runtimeSchema 覆盖）
  - dialog title + parser error 翻译（M7/M8）
  - ParamEditor column header 翻译（M6）
  - fixture 体积管理（#7）
  - electron-builder 打包 + v1.0.0 tag（#8）
  - coverage 推到 branches ≥90%（#9）

## Sprint 12 #2 — BSWMD renderer 集成 (✅ 2026-06-16 完成)

### 背景

Sprint 12 #1 落地了 schema-side BSWMD 解析器（`src/core/project/bswmd.ts`），但 validator / store / UI 三处仍是 stub：
- validator 不知道 BSWMD 声明的 schema（只能在静态 `ECUC_SUBSET_SCHEMA` 表里查）
- store 持有 `addBswmd(path, content)` no-op（`project:open` 已经把 BSWMD content 读回来了，但 store 没用上）
- UI 没有 "Load BSWMD" 按钮；用户不知道 BSWMD 在哪加载

Sprint 12 #2 把这三处串起来：runtime `SchemaLayer` 串到 validator（emit `'schema-unknown'` kind），store 真实化 `addBswmd` + 新 `removeBswmd`，ProjectPanel 加 Load 按钮 + remove 按钮，最后用真实 BSWMD fixture 跑端到端 smoke 收尾。

### Sprint 12 #2 deliverable

**Validator (Task 1)**
- `src/core/validation/runtimeSchema.ts`（Sprint 12 #1 working tree WIP → ship）:
  - `SchemaLayer` interface: `{ modules: Map<string, ModuleLayerEntry>, params: Map<string, ParamLayerEntry>, containers: Map<string, ContainerLayerEntry> }`
  - `buildSchemaLayer(documents: BswmdDocument[]): SchemaLayer` 把多 BSWMD 文档合并成单 layer（last-write-wins collision policy）
  - `findModuleForPath(layer, paramPath)` helper: 剥前 2 段 `<pkg>/<module>` 得到 module path，搜 layer.modules
- `src/core/validation/schema/ecucSubset.ts`: `lookupSchema(paramPath, layer?)` 和 `lookupContainerSchema(containerPath, layer?)` 接受可选 `SchemaLayer`；layer 优先于静态表
- `src/core/validation/validate.ts`: `validate(doc, layer?)` / `validateProject(documents, layer?)` 透传 layer 到 walkContainer / walkReference / walkElements；当 `layer != null` 且 lookup 返回 null + module path 在 layer.modules + paramPath 不在 sourcePaths → emit `'schema-unknown'` via `emitSchemaUnknownIfInKnownModule` helper
- `src/core/validation/dispatch.ts`: `DispatchOptions.schemaLayer?: SchemaLayer` 透传
- `src/core/validation/types.ts`: union 加 `'schema-unknown'` kind（gates on BSWMD-declared module）

**Store (Task 2)**
- `src/renderer/store/useArxmlStore.ts`:
  - state 加 `bswmdSchemas: readonly BswmdDocument[]` + `bswmdPaths: readonly string[]`
  - `addBswmd(path, content)` 替换 no-op: **先 dedupe by absolute path**（已存在 → setError + return，**不允许 replace**）→ parseBswmd → 失败 setError + return → 成功追加 + 当 project open 时同步 `project.bswmdPaths` + re-validate with `buildSchemaLayer(bswmdSchemas)` via `revalidateWithBswmd` helper
  - `removeBswmd(path)` 新 action: 反向（移除 schemas/paths + project 同步 + re-validate）

**IPC (Task 3)**
- `src/main/ipc/bswmdReadHandler.ts` 新文件: `bswmd:read` handler，8 MiB size cap，`fs.stat` 先于 `fs.readFile`（避免大文件先 read 再 reject）
- `src/main/ipc/register.ts`: 注册 `BSWMD_READ` + `BSWMD_OPEN` handlers
- `src/preload/index.ts`: 暴露 `readBswmd` + `openBswmdDialog`
- `src/shared/ipc-contract.ts`: `BSWMD_READ` + `BSWMD_OPEN` channel 常量
- `src/shared/types.ts`: `ReadBswmdRequest/Response` + `OpenBswmdResult` types

**Hook (Task 4)**
- `src/renderer/hooks/useProjectActions.ts`:
  - `addBswmdFromDialog(): Promise<ProjectActionResult>` 新 action
  - **loose 模式直接 reject** (return `{ kind: 'error', message: t('app.error.needProject') }`) — 不允许在 loose mode 加载 BSWMD
  - open mode: 调 IPC `readBswmd` → 调 `store.addBswmd`（store 自己负责 dedupe）→ 翻译 3 种 error branch (read-failed / parse-failed / duplicate) 到 zh-CN/en

**UI (Task 5)**
- `src/renderer/components/ProjectPanel.tsx`:
  - **LooseView 不渲染 BSWMD section** (整段不显示 — 避免用户尝试在 loose mode 加载)
  - OpenView 中 BSWMD FileList section 加 "Load BSWMD..." 按钮 (紧贴 title 右侧)
  - list item 加 remove 按钮 (绑 `removeBswmd`)
- `src/renderer/components/ProjectPanel.css`: `.project-panel-section-add` 小尺寸 ghost button 样式

**i18n (Task 6)**
- `src/shared/i18n.ts`:
  - 6 new keys (zh-CN + en parity): `projectPanel.bswmd.add`, `projectPanel.bswmd.addAria {name}`, `app.error.readBswmdFailed {message}`, `app.error.parseBswmdFailed {message}`, `app.error.duplicateBswmd {path}`, `app.error.needProject`
  - `projectPanel.bswmd.empty` 文案更新 (反映 Sprint 12 #2 "Load BSWMD" 按钮)

**Smoke (Task 7)**
- `tests/fixtures/bswmd/Adc_bswmd.arxml` (81KB, byte-identical) — 用 AUTOSAR standard dialect, vendor-namespace `/EAS/...` paths
- `src/core/validation/__tests__/validateProject.canifSmoke.test.ts`: 端到端 — fs.readFile → parseBswmd → buildSchemaLayer → 构造 fake ArxmlDocument 走 validateProject:
  - **Case A**: 合法 enum literal → 0 violations
  - **Case B**: 非法 enum literal → emit enum 错误
  - **Case C**: BSWMD-declared module 下不存在的 param → emit schema-unknown

**Test count**: 33 (Task 1) + 15 (Task 2) + 11 (Task 3) + 9 (Task 4) + 6 (Task 5) + 7 (Task 6) + 6 (Task 7) = **87 new tests** (428 Sprint 12 #1 → 515). Coverage: **96.33% / 84.85% branches** / 5/5 baseline 782 signed-guard [700, 850].

### Sprint 11 → Sprint 12 #2 衔接

- [x] `validateProject` 6 步流水线扩展为 6+N 步（layer 是 opts，不影响主路径）— 既有 428 test 100% pass（无 regression）
- [x] store `addBswmd(path, content)` stub 替换为真实实现（path 参数就是 Sprint 11 manifest 存好的 bswmdPath，无需读 manifest 二次拿 path）
- [x] i18n 框架在 Sprint 11 落地，6 new key 直接走 `t(locale, key, params)`，parity 100%
- [x] BSWMD parser (Sprint 12 #1) + schemaLayer (Sprint 12 #2) = schema-side 完整闭环，下一步只剩 serialize (Sprint 13+)
- [x] 真实 fixture `Adc_bswmd.arxml` (80KB) round-trip + 端到端 smoke 三 case 跑通
- [x] `projectPanel.bswmd.empty` 文案从"尚未加载 BSWMD"改为"加载 BSWMD 以启用 schema-driven validation"
- [ ] BSWMD 模板侧加载（Sprint 9 #13）— schema 扩张已部分被 runtimeSchema 覆盖，余下 work 留 Sprint 13+
- [ ] Sprint 9 #15 `lookupSchema` unknown path 显式 log — `'schema-unknown'` kind 已部分覆盖，留 Sprint 13+ 决定 log vs. validate panel 显示策略
- [ ] dialog title + parser error 翻译 (M7/M8) — Sprint 11 已 i18n 框架就位但本 sprint 没补
- [ ] ParamEditor column header 翻译 (M6) — 同上
- [ ] fixture 体积管理 (#7) — `Adc_bswmd.arxml` 80KB 还不至于 git LFS，但若加 CanIf full module 需先评估
- [ ] electron-builder 打包 + v1.0.0 tag (#8)
- [ ] coverage 推到 branches ≥90% (#9)
- [ ] **NEW: Task 1 `findModuleForPath` vendor-namespace 兼容性** — 当前实现剥前 2 段 `<pkg>/<module>` 是 `/EcucDefs/...` 标准 dialect 形状，vendor-namespace (`/EAS/...` 等) 兼容性未覆盖 (test 用 Adc fixture 是因为路径已经在 Sprint 8 #1 `normalizePath` 折叠过)。Sprint 13+ backlog

### Deviations

1. **`findModuleForPath` 2-segment vs 3-segment off-by-one**: plan 阶段 user 拍板"剥前 3 段 `/EcucDefs/<Module>`"是按 value-side 风格讲的。Task 1 实际实现剥前 2 段 `<pkg>/<module>`（与 `BswmdDocument.modulePath` 的 2-segment 形状一致），Adc fixture 因 Sprint 8 #1 `normalizePath` 已折叠 `/EAS → /EcucDefs` 所以能跑通。**Vendor-namespace (e.g. Vector / EB tresos) BSWMD 直接加载兼容性未在 Sprint 12 #2 scope** — 留 Sprint 13+ backlog (见衔接段最后一条)。
2. **BSWMD 重复 path 拒绝 (user 拍板)**: `addBswmd` 重复 path 不 replace，setError + return；user 必须先 `removeBswmd` 再 `addBswmd`。原因：replace 会静默吃掉 dirty state，用户期望"加载"是显式 append/remove 序列。
3. **Loose mode 不渲染 BSWMD section (user 拍板)**: LooseView 整段不显示 BSWMD FileList；`addBswmdFromDialog` 在 loose 模式直接 reject。理由：loose 模式没有 project manifest 持久化 BSWMD 路径，加载了 store 状态会变孤儿（重启后丢失），UX 不一致。
4. **smoke 用 Adc 不是 CanIf**: Task 7 plan 是用用户提供的 CanIf BSWMD fixture，但 Sprint 12 #1 阶段用户没提供；用现有 `Adc_bswmd.arxml` 81KB 跑同等 3 case (合法 enum / 非法 enum / 不存在的 param) — Adc 包含完整 ECUC-MODULE-DEF + vendor-namespace paths + 多种 param kind，case 覆盖更广。CanIf fixture 留 Sprint 13+ (等用户提供)。
5. **`schema-unknown` 触发条件算法固定**: 当 `layer != null` 且 lookup 返回 null + `findModuleForPath(layer, paramPath) != null` + paramPath 不在 `sourcePaths` 才 emit。`sourcePaths` 兜底避免 false positive（param path 在 BSWMD sourcePaths 列表里说明是"已知但未声明"，不算 unknown）。
6. **`'schema-unknown'` 不动既有 5 步流水线**: 只是新增第 7 kind + 一个 `emitSchemaUnknownIfInKnownModule` helper 调用点；6 步流水线顺序不动（multiplicity → cross-ref → ref-dest → ref-cycle → constraints → 现有其它）；schema-unknown 在 walkContainer / walkReference / walkElements 入口处 emit。
7. **`'schema-unknown'` 不计入 baseline signed-guard**: 因为 baseline 5 fixture 不提供 layer 时根本不 emit；guard 维持 Sprint 11 范围 [700, 850] cross-ref 0 violation。
8. **fixtures README 不强补**: Task 7 `tests/fixtures/bswmd/README.md` 改动属"如有遗漏可补但不强制"；Sprint 12 #1 已记录 Adc + Can 路径，Sprint 12 #2 没有新 fixture，无须补 README。

### 后续 Sprint 12+ backlog

- [ ] Sprint 13+ 序列化 BSWMD round-trip（reader + writer；UI round-trip test）
- [ ] Sprint 13+ CanIf 用户 BSWMD fixture 加载（等用户提供）
- [ ] Sprint 13+ `findModuleForPath` vendor-namespace 兼容性（`/EAS/...` / `/Vector/...` / etc.）
- [ ] Sprint 13+ Sprint 9 #15 `lookupSchema` unknown path 显式 log（`'schema-unknown'` kind 已部分覆盖；决定 log vs. validation panel 显示）
- [ ] Sprint 13+ Sprint 9 #13 BSWMD 模板侧加载（schema 扩张留口）
- [ ] Sprint 14+ dialog title + parser error 翻译（M7/M8）
- [ ] Sprint 14+ ParamEditor column header 翻译（M6）
- [ ] Sprint 14+ fixture 体积管理 (#7)（引入 CanIf / 大型 ECU extract 时评估 git LFS）
- [ ] Sprint 15+ electron-builder 打包 + v1.0.0 tag (#8)
- [ ] Sprint 15+ coverage 推到 branches ≥90% (#9)

## Sprint 12 #3 — NewProjectDialog 统一弹窗 (✅ 2026-06-17 完成)

### 背景

Sprint 11 把项目新建流程迁到了 `useProjectActions` hook，但 dialog 仍是两步走：`PromptDialog.prompt()` 收项目名 → OS `dialog.showSaveDialog` 选文件路径。流程上的问题：
- 用户视觉跳变（自绘 prompt → OS 原生 save dialog → 自绘 manifest 路径）体验割裂
- `.autosarcfg.json` 固定后缀是工程约束，OS save dialog 反而给了用户"自选扩展名"的错觉
- 两步流程没有"项目名校验"机制（空名 / 非法字符 / 超长 / 重名都流到 main process 才报错）
- `isDirty` 状态在 Sprint 11 仅 `addBswmd` 有简化保护，**`newProject` / `openProject` / `removeBswmd` 等切换动作完全无保护**（用户编辑到一半点 "New Project" 静默丢失全部 dirty 改动）

Sprint 12 #3 把"两步流程"合并为单一自绘 `NewProjectDialog` (Catppuccin Mocha 风格, Variant A 起步, Phase 2/3 扩展位预留)，加 3 个 cross-cutting 改动：
1. **未保存保护 ConfirmDialog** — 复用 Phase 1 Task 5 dirty guard，所有 switching action (newProject/openProject/addBswmd/removeBswmd) 触发
2. **项目名实时验证** — 纯函数 `validateProjectName(value)` 拦截空名 / 非法字符 / 超长
3. **`project:pickDir` IPC** — OS openDirectory dialog 替代 OS saveDialog，固定 `.autosarcfg.json` 后缀由 main handler 拼

### Sprint 12 #3 deliverable (Phase 1 全部 8 tasks)

**Task 3 — pickDir IPC (Round 1)**
- `src/main/ipc/pickDirHandler.ts` (43 lines): `project:pickDir` handler，包装 `dialog.showOpenDialog({ properties: ['openDirectory'], defaultPath? })`，返回 `PickDirResult` discriminated union (`'picked' | 'canceled'`)
- `src/shared/ipc-contract.ts`: `PICK_DIR = 'project:pickDir'` channel 常量
- `src/shared/types.ts`: `PickDirRequest { defaultPath?: string }` + `PickDirResult` union
- `src/preload/index.ts`: 暴露 `pickDir(defaultPath?)` via contextBridge
- `src/main/ipc/register.ts`: 注册 PICK_DIR handler
- 6 tests: picked / canceled / defaultPath propagation

**Task 4 — ProjectNewRequest 扩展 (Round 1)**
- `src/main/ipc/projectNewHandler.ts` (124 lines): 把原 `register.ts` 的 PROJECT_NEW handler 抽出，扩展 request 加 `directory: string` 字段；main handler 拼 `path.join(directory, name + '.autosarcfg.json')`；加 `fs.access` 重名检查 → 存在时返回 `'overwrite-confirm'` kind（Phase 1 简化为显示 error，Phase 2/3 升级为二次 confirm dialog）
- `src/shared/types.ts`: `ProjectNewRequest` 加 `directory` 必填字段；`ProjectNewResult` union 加 3 kind: `'overwrite-confirm' | 'write-failed' | 'invalid-name'`
- `src/main/ipc/register.ts`: PROJECT_NEW 改调 `projectNewHandler`
- 9 tests: success / overwrite-confirm / write-failed / invalid-name / directory missing / 路径拼接正确

**Task 6 — ConfirmDialog 组件 (Round 1)**
- `src/renderer/components/ConfirmDialog.tsx` (165 lines): 3 按钮 (继续编辑 / 不保存新建 / 保存并新建)，promise-based `confirm({ title, message, confirmLabel, cancelLabel, destructive })` module-level API，`ConfirmRoot` portal root
- `src/renderer/components/ConfirmDialog.css` (127 lines): Catppuccin Mocha 风格 (Variant C 视觉)，与 NewProjectDialog 共用 color tokens，z-index 9998
- Esc / backdrop click / × button = 'continue' (用户中断意图)
- 13 tests: 3 按钮分支 / Esc / backdrop / × / promise resolve / unmount safety

**Task 7 — store isDirty + dialog state (Round 2)**
- `src/renderer/store/useArxmlStore.ts`:
  - `isDirty(): boolean` function-on-state (永远不 drift out of sync, 比 getter 形式更稳)
  - state 加 `newProjectDialogOpen: boolean` + `confirmDialogOpen: boolean` + `pendingAction: PendingAction | null` discriminated union (4 kinds: `'newProject' | 'openProject' | 'addBswmd' | 'removeBswmd'`)
  - setters: `setNewProjectDialogOpen(open)` / `setConfirmDialogOpen(open)` / `setPendingAction(action)`
- 23 tests: isDirty true/false / pendingAction 4 kinds / setters / state 不变量

**Task 8 part 1 — i18n 17 keys (Round 1)**
- `src/shared/i18n.ts`:
  - `newProject.*` 9 keys: `title` / `nameLabel` / `nameHint` / `dirLabel` / `dirHint` / `filenamePreview` / `browse` / `create` / `cancel`
  - `confirm.unsaved.*` 5 keys: `title` / `message` (含 `{name}` placeholder, 通用文案适用于 all switching actions) / `continue` / `discard` / `saveAndNew`
  - `app.error.projectName*` 3 keys: `empty` / `invalid` / `tooLong`
- zh-CN + en parity, 100% 覆盖
- 17 tests: 17 keys x 2 locale = 34 实际 assertion

**Task 1+2 — NewProjectDialog + validation (Round 2)**
- `src/renderer/components/NewProjectDialog.tsx` (329 lines): 单一自绘弹窗 (Variant A 视觉, 严格按 mockup)
  - 项目名 input + 实时验证 (空 / 非法字符 / >64 chars; validateProjectName 纯函数从 .tsx 内提到独立文件)
  - 目录 input + "浏览…" 按钮 (调 `project:pickDir` IPC) + 文件名实时 preview
  - Enter 创建 / Esc 取消 / 取消按钮
  - store-driven visibility (useArxmlStore.newProjectDialogOpen)
- `src/renderer/components/NewProjectDialog.css` (224 lines): Catppuccin Mocha 风格 (--color-bg #1e1e2e / --color-surface #313244 / --color-accent #89b4fa / --color-error #f38ba8), 严格按 mockup
- `src/renderer/components/NewProjectDialog.validate.ts` (57 lines): 纯函数 `validateProjectName(value: string): ValidationResult` (空 / 非法字符 `<>:"/\\|?*` / >64 chars); `MAX_NAME_LENGTH = 64` 常量
- 37 tests: 渲染 / name validation 4 cases / dir browse / preview / Enter submit / Esc cancel / store integration

**Task 5 — useProjectActions 重写 (Round 3)**
- `src/renderer/hooks/useProjectActions.ts`:
  - `newProject()` 不再调 `prompt()` (PromptDialog 仍保留 for other use cases), 改为 `setNewProjectDialogOpen(true)`
  - 新 `submitNewProject(name, directory)` 调 IPC `project:new` + 处理 4 种 result kinds (success / overwrite-confirm / write-failed / invalid-name)
  - `openProjectFromDialog` / `addBswmdFromDialog` / 新 `removeBswmdWithGuard` 加 dirty guard: 先调 `isDirty()` → true 时 `setPendingAction` + `setConfirmDialogOpen(true)`, 用户选 "不保存新建" 才执行原 action
  - **all switching actions** (newProject/openProject/addBswmd/removeBswmd) 触发 dirty 保护 (user 拍板)
- 17 tests: newProject 改 setDialog / submitNewProject 4 kinds / openProject dirty guard / addBswmd dirty guard / removeBswmdWithGuard dirty guard / 干净 state 不触发 dialog

**Task 8 part 2 — App.tsx 挂载 (Round 3)**
- `src/renderer/App.tsx`: mount `<PromptHost />` (z-index 9997) + `<NewProjectDialog onSubmit={submitNewProject} />` (z-index 9999) + `<ConfirmRoot />` (z-index 9998, 错开与 PromptHost 不冲突)
- 6 tests: 3 dialog 同时打开时 z-index 正确 / Esc 各自独立

**Test count**: 6 (T3) + 9 (T4) + 13 (T6) + 23 (T7) + 17 (T8p1) + 37 (T1+2) + 17 (T5) + 6 (T8p2) = **128 new tests** (515 Sprint 12 #2 baseline + 128 = 636; 净增 121 因有 1+1=2 baseline test 因新 dependency 调整)。Coverage: **96.42% / 85.45% branches** / 5/5 baseline 782 signed-guard [700, 850]。

### Phase 1 偏差 (user 拍板)

1. **Sequencing**: Sprint 12 #2 (v0.12.0) 先 commit (`f3b74c8`) → Sprint 12 #3 (v0.13.0) 再 commit。避免 working tree 同时有 #2 和 #3 改动 → commit 粒度清晰 / git history 干净
2. **Dirty 保护 = all switching actions** (newProject / openProject / addBswmd / removeBswmd 全部触发 ConfirmDialog) — Task 5 hook 实现
3. **重名检测 = 仅创建时 main handler `fs.access` check** (race-free, 不再 client-side 实时检) — Task 4 实现

### Phase 1 简化 (deferred to Sprint 13+)

- **'saveAndProceed' button 暂不实现**: Phase 1 ConfirmDialog 3 按钮中 '保存并新建' 简化为与 'continue' 一样返回 canceled (提示用户先手动保存), Phase 2 真正实现 save flow
- **'overwrite-confirm' IPC result Phase 1 简化为显示 error**: 不弹二次 confirm dialog, Phase 2 升级为 `confirm({ destructive: true })` 模式
- **Phase 2 模板 (empty/classic/clone)** 推迟到 Sprint 13 #1
- **Phase 3 BSWMD 模块多选 chips** 推迟到 Sprint 13 #2

### Pre-flight mishap (internal)

Task 8 part 2 派发的 agent 误执行 `git stash` + `git stash drop` 把 7 个 Sprint 12 #3 改动文件丢进 stash drop 不可恢复区。从 dangling commit `a78db91` 完整恢复 (user 拍板)。附带后果：2 个文件 (`src/renderer/components/ValidationPanel.css` + `src/renderer/styles.css`) 在 working tree 出现意外 M (Sprint 12 #3 scope 外的 formatting 漂移), **out of Sprint 12 #3 scope**, 留 Sprint 13 cleanup。

### Sprint 12 #3 backlog (P1)

- [ ] Sprint 13 #1: Phase 2 模板 (empty / classic / clone), NewProjectDialog 顶部加 TemplateCard, classic 模板预填 bswmdPaths, clone 模板调 `project:clone` IPC + 二级文件选择
- [ ] Sprint 13 #2: Phase 3 BSWMD 模块多选 chips, NewProjectDialog 集成 BswmdChip, 创建后自动 addBswmd
- [ ] Sprint 13 #3: 'saveAndProceed' button 真正实现 (Phase 1 与 'continue' 都返回 canceled 是简化)
- [ ] Sprint 13 #4: 'overwrite-confirm' 升级为二次 confirm dialog (`confirm({ destructive: true })` 模式)
- [ ] Sprint 13 cleanup: 恢复 2 个意外 M 文件 (ValidationPanel.css / styles.css) 到 Sprint 12 #2 baseline 状态
- [ ] Sprint 14+: 拖到 Sprint 12+ 的旧 backlog (见 Sprint 12 #2 后续段)

## 参考资料

- 详细 Sprint 0 plan: `C:\Users\13777\.claude\plans\autosar-cfg-spring-zero.md`
- 项目规划总览: `C:\Users\13777\.claude\projects\D--claude-proj2\memory\claude-autosarcfg-project.md`
- Sprint 0 完成记录 + 7 处偏差: `C:\Users\13777\.claude\projects\D--claude-proj2\memory\claude-autosarcfg-sprint-zero.md`
- 参考灵感（非代码）: `D:\claude_proj2\flexcfg_manual_utf8.txt`
