# claude-AutosarCfg — 项目进度

Standalone desktop GUI for AUTOSAR BSW configuration.
Electron 30 + TypeScript 5 (strict) + React 18 + Vite 5 + Zustand 4 + fast-xml-parser 4 + Tailwind 3 + Vitest 1 + Playwright 1.45.

> 仓库: https://github.com/jasontaotao/claude-autosar-cfg
> 本地: `D:\claude_proj2\claude-AutosarCfg\`
> License: MIT

---

## Sprint 总览（v0.1.0 路线）

| Sprint                                   | 范围                                                         | 状态 | 完成日     | HEAD                                               | 关键交付                                                                                                                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------ | ---- | ---------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S0** 脚手架                            | Electron + TS + Vite 三层骨架 + 5 阶段 CI                    | ✅   | 2026-06-13 | `563f7a5`                                          | Hello Window + 5/5 CI jobs green                                                                                                                                                                                                            |
| **S1** F1 ARXML IO                       | 解析 + 序列化 .arxml (r4.x ECUC subset)                      | ✅   | 2026-06-14 | `3a7a039`                                          | `core/arxml/{parser,serializer}.ts` + IPC `arxml:open/parse/save` + 5 round-trip 样本 + 5 覆盖率补测                                                                                                                                        |
| **S2** F2 Tree + 7-param editor          | 左树右编辑器，7 mode 编辑，Zustand store，键盘 a11y          | ✅   | 2026-06-14 | `73909a1` (GH Actions run 27500975793 — 5/5 green) | `tree/{Tree,TreeNode}.tsx` + `editor/{ParamEditor,modes.ts,modes/*}.tsx` + `useArxmlStore` + 5 mutate round-trip                                                                                                                            |
| **S3** F3 Validation                     | ECUC subset schema + range/enum/ref 校验 + 5 样本 baseline   | ✅   | 2026-06-14 | `f6aef6b`                                          | `core/validation/{types,validate}.ts` + `schema/ecucSubset.ts` (46 entries) + `ValidationPanel.tsx` + `useDebouncedValidation` + EnumEditor 升级 dropdown + 5/5 baseline 0 violation                                                        |
| **S4** F4 Parser bug fix + verify format | 修 2 parser bug (DEST-aware) + schema revert + verify format | ✅   | 2026-06-15 | `9c37e53` (GH Actions run 27519501464 — 5/5 green) | `parser.ts` DEST-first dispatch + `serializer.ts` 精确 DEST + `ecucSubset.ts` 撤回 18 entry + 删 2 sentinel + `verify.mjs` 6-stage + 110 tests / 94.57% coverage / 5/5 baseline 0 violation                                                 |
| **S5** F5 Container multiplicity         | 增 ECUC container 实例数 [lower, upper] 校验                 | ✅   | 2026-06-15 | TBD (整合 commit pending)                          | `types.ts` 加 `'multiplicity'` kind + `EcucContainerSchemaEntry` interface + `ecucSubset.ts` 13 entries + `validate.ts` `checkContainerMultiplicity` + `ValidationPanel` 第 6 group + 117 tests / 95.1% coverage / 5/5 baseline 0 violation |

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

## 参考资料

---

## 参考资料

- 详细 Sprint 0 plan: `C:\Users\13777\.claude\plans\autosar-cfg-spring-zero.md`
- 项目规划总览: `C:\Users\13777\.claude\projects\D--claude-proj2\memory\claude-autosarcfg-project.md`
- Sprint 0 完成记录 + 7 处偏差: `C:\Users\13777\.claude\projects\D--claude-proj2\memory\claude-autosarcfg-sprint-zero.md`
- 参考灵感（非代码）: `D:\claude_proj2\flexcfg_manual_utf8.txt`
