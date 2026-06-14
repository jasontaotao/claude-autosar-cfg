# claude-AutosarCfg — 项目进度

Standalone desktop GUI for AUTOSAR BSW configuration.
Electron 30 + TypeScript 5 (strict) + React 18 + Vite 5 + Zustand 4 + fast-xml-parser 4 + Tailwind 3 + Vitest 1 + Playwright 1.45.

> 仓库: https://github.com/jasontaotao/claude-autosar-cfg
> 本地: `D:\claude_proj2\claude-AutosarCfg\`
> License: MIT

---

## Sprint 总览（v0.1.0 路线）

| Sprint                          | 范围                                                | 状态      | 完成日     | HEAD                                           | 关键交付                                                                                                         |
| ------------------------------- | --------------------------------------------------- | --------- | ---------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **S0** 脚手架                   | Electron + TS + Vite 三层骨架 + 5 阶段 CI           | ✅        | 2026-06-13 | `563f7a5`                                      | Hello Window + 5/5 CI jobs green                                                                                 |
| **S1** F1 ARXML IO              | 解析 + 序列化 .arxml (r4.x ECUC subset)             | ✅        | 2026-06-14 | `3a7a039`                                      | `core/arxml/{parser,serializer}.ts` + IPC `arxml:open/parse/save` + 5 round-trip 样本 + 5 覆盖率补测             |
| **S2** F2 Tree + 7-param editor | 左树右编辑器，7 mode 编辑，Zustand store，键盘 a11y | ✅        | 2026-06-14 | `73909a1` (GH Actions run 27500975793 — 5/5 green) | `tree/{Tree,TreeNode}.tsx` + `editor/{ParamEditor,modes.ts,modes/*}.tsx` + `useArxmlStore` + 5 mutate round-trip |
| **S3** F3 Validation            | XSD-style schema + 业务规则                         | ⏳ 待启动 | —          | —                                              | `core/validation/{schema,rules}.ts` + `ValidationPanel.tsx`                                                      |
| **S4** 收尾                     | coverage 90% + electron-builder + docs              | ⏳ 待启动 | —          | —                                              | `electron-builder.yml` + `docs/user-guide.md` + v0.1.0 tag                                                       |

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

| ID     | 文件                                                                                       | 验收 / 备注                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| S2-T0  | `core/arxml/path.ts` + `__tests__/path.test.ts`                                            | 串行前置；`packageByPath` + `findByPath` + `paramsEqual`；4 单测全过                                                    |
| S2-T1  | `renderer/store/useArxmlStore.ts` + `__tests__/useArxmlStore.test.ts`                       | Agent-A；Zustand store `{ doc, filePath, selectedPath, dirty, error }` + 5 actions；6 单测全过                          |
| S2-T2  | `renderer/components/tree/{Tree,TreeNode}.tsx` + `__tests__/Tree.test.tsx`                  | Agent-B；ARIA tree + 键盘 a11y；9 单测全过                                                                              |
| S2-T3  | `renderer/components/editor/ParamEditor.tsx` + `__tests__/ParamEditor.test.tsx`            | Agent-C；resolve `selectedPath` via `findByPath` + 路由 mode editor；3 单测全过                                         |
| S2-T4  | `renderer/components/editor/modes/{String,Integer,Float,Boolean,Enum,Reference,Multiline}Editor.tsx` | Agent-C；7 mode editor 各 ~30 行（Enum 是 text input + tooltip，非 select；schema-aware options 推 S3）               |
| S2-T5  | `renderer/components/editor/modes.ts` + `__tests__/modes.test.ts`                          | Agent-C；纯 `selectParamMode(value, key)`；8 单测全过                                                                    |
| S2-T6  | `renderer/App.tsx` + `src/test/setup.ts` + `vitest.config.ts` + `vite.renderer.config.ts`  | 主 agent；split-view 整合 + `react()` plugin + setupFiles + `@core`/`@shared` aliases                                  |
| S2-T7  | `renderer/store/__tests__/round-trip-mutate.test.ts`                                       | Agent-A；5 样本 mutation round-trip；5/5 全过                                                                            |
| S2-T8  | `renderer/components/ArxmlPanel.tsx`                                                      | Agent-A；`dirty` 联动 Save 按钮颜色（orange 'Save (unsaved)' / emerald 'Save ARXML'）                                  |
| S2-T9  | 键盘可达性（Arrow/Enter/Space）                                                            | Agent-B 集成在 T2；role=treeitem + aria-expanded + aria-selected                                                          |
| S2-T10 | `PROGRESS.md` + `CHANGELOG.md`                                                             | 主 agent；HEAD pin + `[0.3.0]` Sprint 2 段                                                                              |
| S2-T11 | `README.md`                                                                                | 主 agent；Quick start 加 Open → Click → Edit → Save 流程                                                                |
| S2-T12 | HEAD bump 0.2.0→0.3.0 + GH Actions                                                        | 主 agent；`package.json` + `main/ipc/register.ts` GET_APP_VERSION 同步；push → CI 5/5 green                              |

### 计划偏差（已实施）

| 项                          | plan 原文                                 | 实际                                                                                       | 原因                                                                                                                          |
| --------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **T6 store 集成**           | 假设 renderer 读 store hook 直接         | ArxmlPanel 改读 store hook；Tree 通过 `store={useArxmlStore}` prop 注入                    | Agent-B 为避免与 Agent-A 并行写 store 文件，把 store 做成 prop——干净的 ownership 隔离                                              |
| **T4 EnumEditor**           | `<select>` + 当前值作为唯一选项          | text input + tooltip 说明 "F2: schema-aware options land later"                            | 1-option select 是 readonly，等于丢失输入能力；schema 来源（S3 Validation）需要时再升级                                       |
| **T6 store 同步**           | ArxmlPanel 保留 local state.doc/path     | 完全改读 store（doc/filePath/dirty 三 selector）；Save 永远用最新 mutated doc               | local state 在 ParamEditor 编辑后会失同步；store 是 single source of truth                                                       |
| **T0 path.ts `findByPath` 边界** | 无明确 spec                          | 顶层 path（`/EAS`）返回 null 而非 `{ pkg, element: pkg }`（pkg 是 ArxmlPackage 不是 Element） | 原本的返回是 TS 类型错误，main agent 修；编辑器用顶层 path 无意义                                                                |
| **vitest 配置**            | plan 未提                                 | Agent-B 加 `react()` plugin + `setupFiles` + include `*.test.tsx`                          | T2 renderer 测试必须配                                                                                                          |
| **vite renderer config alias** | plan 未提                              | 加 `@core` + `@shared` resolve alias                                                        | renderer import `@core/arxml/path` 必须配                                                                                       |

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

## Sprint 3 — F3 Validation（⏳ 待启动）

`C:\Users\13777\.claude\plans\autosar-cfg-spring-two.md` 末尾列出了 Sprint 3 起点。Sprint 3 plan 范围：

- `core/validation/schema.ts` — XSD-style schema 定义（r4.x ECUC subset）
- `core/validation/rules.ts` — 业务规则（referential integrity / range / enum 合法值）
- `renderer/components/ValidationPanel.tsx` — 第三面板（底部 drawer 或右侧栏），展示违规列表
- `useArxmlStore` 加 `validationErrors` 字段 + `validate()` action
- IPC `validation:run` + `preload.validate()`（如需在 main 跑重校验）
- 5 样本 validate + 0 violation regression（baseline）

`pnpm verify` 仍 5 阶段；Sprint 4 收尾时把 `format:check` 加进 `scripts/verify.mjs` 避免历史重演。

---

## 参考资料

- 详细 Sprint 0 plan: `C:\Users\13777\.claude\plans\autosar-cfg-spring-zero.md`
- 项目规划总览: `C:\Users\13777\.claude\projects\D--claude-proj2\memory\claude-autosarcfg-project.md`
- Sprint 0 完成记录 + 7 处偏差: `C:\Users\13777\.claude\projects\D--claude-proj2\memory\claude-autosarcfg-sprint-zero.md`
- 参考灵感（非代码）: `D:\claude_proj2\flexcfg_manual_utf8.txt`
