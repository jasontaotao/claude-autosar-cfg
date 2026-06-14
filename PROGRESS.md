# claude-AutosarCfg — 项目进度

Standalone desktop GUI for AUTOSAR BSW configuration.
Electron 30 + TypeScript 5 (strict) + React 18 + Vite 5 + Zustand 4 + fast-xml-parser 4 + Tailwind 3 + Vitest 1 + Playwright 1.45.

> 仓库: https://github.com/jasontaotao/claude-autosar-cfg
> 本地: `D:\claude_proj2\claude-AutosarCfg\`
> License: MIT

---

## Sprint 总览（v0.1.0 路线）

| Sprint | 范围 | 状态 | 完成日 | HEAD | 关键交付 |
|---|---|---|---|---|---|
| **S0** 脚手架 | Electron + TS + Vite 三层骨架 + 5 阶段 CI | ✅ | 2026-06-13 | `563f7a5` | Hello Window + 5/5 CI jobs green |
| **S1** F1 ARXML IO | 解析 + 序列化 .arxml (r4.x ECUC subset) | ✅ | 2026-06-14 | `3a7a039` | `core/arxml/{parser,serializer}.ts` + IPC `arxml:open/parse/save` + 5 round-trip 样本 + 5 覆盖率补测 |
| **S2** F2 Tree + 7-param editor | 左树右编辑器，7 mode 编辑，Zustand store，键盘 a11y | ✅ | 2026-06-14 | `f1a8b3c` (push pending — direct main blocked) | `tree/{Tree,TreeNode}.tsx` + `editor/{ParamEditor,modes.ts,modes/*}.tsx` + `useArxmlStore` + 5 mutate round-trip |
| **S3** F3 Validation | XSD-style schema + 业务规则 | ⏳ 待启动 | — | — | `core/validation/{schema,rules}.ts` + `ValidationPanel.tsx` |
| **S4** 收尾 | coverage 90% + electron-builder + docs | ⏳ 待启动 | — | — | `electron-builder.yml` + `docs/user-guide.md` + v0.1.0 tag |

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

| ID | 文件 | 验收 |
|---|---|---|
| S1-T0 | `core/arxml/types.ts` | `Result<T, E>` envelope 加在 core/ canonical 位置，shared/ 反向 re-export |
| S1-T1 | `core/arxml/parser.ts` + `__tests__/parser.test.ts` | 3 单测：minimal r4.6 module + DEST reference + malformed XML |
| S1-T2 | `core/arxml/serializer.ts` + `__tests__/serializer.test.ts` | 3 单测：minimal doc + ref w/ dest + empty doc |
| S1-T3 | `shared/ipc-contract.ts` + `shared/types.ts` | 3 channel + 7 新 type（OpenArxmlResult / SaveArxmlResult / FileError / ...）|
| S1-T4 | `main/ipc/register.ts` | OPEN_ARXML (dialog.showOpenDialog + fs.readFile) + PARSE_ARXML + SAVE_ARXML + GET_APP_VERSION='0.2.0' |
| S1-T5 | `preload/index.ts` | openArxml / parseArxml / saveArxml 类型化桥 |
| S1-T6 | `renderer/components/ArxmlPanel.tsx` | Open/Save ARXML 按钮 + formatParseError helper + package/element/version counts |
| S1-T7 | `renderer/App.tsx` | ArxmlPanel 集成 + 标题更新为 `v{appVersion} — F1 ARXML IO` |
| S1-T8 | `__tests__/round-trip.test.ts` + `tests/fixtures/arxml/` | 5 真实样本 × 2 tests = 10 用例 deep-equal |
| S1-T9 | `package.json` | version 0.2.0 |
| S1-T10 | `CHANGELOG.md`（新增） | Keep a Changelog 格式 + [0.2.0] Sprint 1 + [0.1.0] Sprint 0 |
| S1-T11 | `README.md` | Quick start 段加 F1 ARXML IO 子节 |
| S1-T12 | GH Actions | `pnpm verify` 5 阶段本地全绿；push 后 5/5 jobs expected |

### 计划偏差（已实施）

| 项 | plan 原文 | 实际 | 原因 |
|---|---|---|---|
| parser 入口校验 | 无 | 加 `XMLValidator.validate` 显式校验 | fast-xml-parser 容错强，未闭合 XML 不会被抛 `xml-malformed` |
| detectVersion 严格过滤 | 不在 SUPPORTED 返回 null | r4.0 namespace 时回退解析 `xsi:schemaLocation` 的 `AUTOSAR_4-2-2.xsd` 提取 4.2 | 用户 5 样本实际用 r4.0 namespace + 4-2-2 schema |
| parser test fixture xmlns | r4.0（plan 笔误） | r4.6 | 与 plan 测试期望 version='4.6' 一致 |
| serializer wrapper tag | renderPackage/Module 输出 plain object | 加 `groupByTagName` helper + 每个元素 wrap `{ [tagName]: body }` | fast-xml-parser 数组 + plain object 不会自动加 wrapper tag |
| vite.main.config.ts external | `['electron', 'node:path', 'node:url']` | 加 `node:fs` | T4 后 fs.promises 引入需要 external |
| shared/types re-export | 仅 Result | 加 `ArxmlElement` | T6 renderer ArxmlPanel 函数签名需要 |

### 风险回顾

| Risk | 实际遭遇 | 缓解 |
|---|---|---|
| fast-xml-parser namespace 复杂度 | 0 | T1 加 SUPPORTED 过滤 + schemaLocation 回退解析 |
| 5 样本不同 schema | 5 样本全部 r4.0 + AUTOSAR_4-2-2.xsd（同工程同版本） | detectVersion 一次覆盖全部 |
| Serializer XML 结构错乱 | T8 round-trip 失败 | 加 groupByTagName + PARAMETER-VALUES 用 grouped 形式 |
| CI runner 缺 fixtures | N/A | fixtures 走本地 git-ignore，CI 阶段 3 仅跑 parser/serializer 单测（≥80% 仍达标） |

---

## 参考资料

- 详细 Sprint 0 plan: `C:\Users\13777\.claude\plans\autosar-cfg-spring-zero.md`
- 项目规划总览: `C:\Users\13777\.claude\projects\D--claude-proj2\memory\claude-autosarcfg-project.md`
- Sprint 0 完成记录 + 7 处偏差: `C:\Users\13777\.claude\projects\D--claude-proj2\memory\claude-autosarcfg-sprint-zero.md`
- 参考灵感（非代码）: `D:\claude_proj2\flexcfg_manual_utf8.txt`