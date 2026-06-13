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
| **S1** F1 ARXML IO | 解析 + 序列化 .arxml (r4.2-r5.0) | ⏳ 待启动 | — | — | `core/arxml/{parser,serializer}.ts` + IPC `arxml:open/parse/save` |
| **S2** F2 Tree + 7-param editor | 左树右编辑器，7 mode 编辑 | ⏳ 待启动 | — | — | `Tree.tsx` + `ParamEditor.tsx` + Zustand `useArxmlStore` |
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

## Sprint 1 — F1 ARXML IO（计划中，待启动拍板）

> 详细 plan 待写。范围与验收标准继承自 `C:\Users\13777\.claude\plans\autosar-cfg-spring-zero.md` 第 1408-1415 行表格。

**核心任务**：
- `core/arxml/parser.ts`：fast-xml-parser → `ArxmlDocument`
- `core/arxml/serializer.ts`：`ArxmlDocument` → fast-xml-parser → 字符串
- 5 个 demo 样本回归（round-trip 无字段丢失）
- main IPC `arxml:open`（dialog.showOpenDialog） / `arxml:parse` / `arxml:save`（dialog.showSaveDialog）
- preload `autosarApi.openArxml() / parseArxml() / saveArxml()`
- 8 unit tests（parser 3 + serializer 3 + round-trip 2）

**估时**：5-7 天（plan）

**启动条件**：
1. 用户拍板 Sprint 1 启动
2. 我先写 ~500 行详细 plan（含 fast-xml-parser API + 5 样本选择 + IPC 协议 + 测试用例）
3. 然后按 plan 执行

---

## 参考资料

- 详细 Sprint 0 plan: `C:\Users\13777\.claude\plans\autosar-cfg-spring-zero.md`
- 项目规划总览: `C:\Users\13777\.claude\projects\D--claude-proj2\memory\claude-autosarcfg-project.md`
- Sprint 0 完成记录 + 7 处偏差: `C:\Users\13777\.claude\projects\D--claude-proj2\memory\claude-autosarcfg-sprint-zero.md`
- 参考灵感（非代码）: `D:\claude_proj2\flexcfg_manual_utf8.txt`