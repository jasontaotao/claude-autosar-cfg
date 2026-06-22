# claude-AutosarCfg

独立的 AUTOSAR BSW（基础软件）配置桌面图形工具。

> **当前版本 v1.8.1** — 在 v1.8.0 基础上修复 v1.6.1 起的 main 进程
> 构建失败 + 补上一个 PATCH 级别的 Undo 体验收尾。
> 完整变更记录见 [CHANGELOG](./CHANGELOG.md)。

## 它能做什么

打开 `.arxml` → 在左侧树形结构浏览 package / module / container /
parameter → 在右侧编辑器修改参数 → **边输边校验**；违规项会即时
浮现在树下面的面板中，覆盖 7 大校验类型（`range` / `enum` /
`reference` / `required` / `schema` / `multiplicity` / `cross-ref` /
`ref-dest` / `ref-cycle`）。

在 AUTOSAR BSW 配置工作流里常见的痛点（`<REFERENCE-VALUE>` 多方言
解析、跨容器引用解析、容器实例数上下界校验、循环引用检测、供应商
私有扩展 namespace 归一化）都已经覆盖。

## 技术栈

- Electron 30 + TypeScript 5（strict 模式）+ React 18
- Vite 5（三段构建：main / preload / renderer）
- Zustand 4（状态管理）+ fast-xml-parser 4（ARXML 解析）+ Tailwind 3（样式）
- Vitest 1（单元测试）+ Playwright 1.45（E2E — 可选，需要图形环境）
- **pnpm 11** + Node 22.13+ + ESLint 8 + Prettier 3
- CodeMirror 6（v1.3.0 起的脚本编辑器）

## 分层架构（强约束）

| 层          | 允许依赖         | 禁止依赖                        |
| ----------- | ---------------- | ------------------------------- |
| `core/`     | 无（纯 TS）      | react、react-dom、electron、DOM |
| `shared/`   | 无（纯 TS 类型） | react、react-dom、electron      |
| `main/`     | electron、node   | react                           |
| `preload/`  | electron         | react                           |
| `renderer/` | react、zustand   | electron（必须经 preload 桥）   |

由 ESLint 的 `no-restricted-imports` 规则强制执行。

## 快速开始

```bash
pnpm install
pnpm build           # 首次必跑：产出 dist/main + dist/preload
                     #   （Vite 在 dev 模式下不服务 main/preload，
                     #    新 clone 必须先 build 一次再 pnpm dev）
pnpm dev             # 打开主界面：Tree + Editor + Validation
                     #   + 工具栏；renderer 走 Vite HMR
```

跳过 `pnpm build` 直接 `pnpm dev` 会立即报错并给出明确提示。

## 版本里程碑

详细每个版本的 release notes 见
[`docs/release-notes/`](./docs/release-notes/)。

### v1.8 — Stencil Wizard + PATCH 收尾（2026-06-22）

- **v1.8.0 K Stencil 向导**：从模板一键生成 4 大 BSW 模块族（Com /
  ComM / PduR / EcuC）最小合法骨架，支持纯模板和"套用 BSWMD"两种
  模式，可选 SWS Validator 闸门
- **v1.8.1 PATCH**：
  - `cascade-and-unlink` 成功 toast 上增加 8 秒"撤销"按钮
  - BSWMD 行的移除按钮补上独立 ARIA 文案
  - 修复 v1.6.1 起的 main 进程构建失败（vite.main.config alias）

### v1.7 — 抛光合集（2026-06-21）

- 骨架默认值自动填充、CHOICE 容器占位标记
- 可选容器的可见性 UI 切换
- `@dbc-forge/core` 复用 plumbing
- 渲染器构建链的 `node:fs` 动态 import 修复

### v1.6 — Sprint 14 Final 集群（2026-06-21）

- 引导教程（Onboarding）
- Headless CLI（独立 `autosarcfg` 命令，9 个退出场景）
- SWS Validator（独立 feature flag 开关）
- 键盘优先操作流

### v1.5 — 基建 + BSWMD 接线（2026-06-20-21）

- BSWMD picker 接入 + 右键菜单 + 分段感知覆盖率
- 拆分 7 个 store slice
- ARXML 流式读写
- 真实回放管线（`applyMutation`）

### v1.4 — Trust Sprint（2026-06-20）

- 完整的 zh-CN / en 双语
- 写入路径防 `..` 越界
- ARXML 回环安全（不再静默丢供应商扩展）
- 4 个关键 bug 修复（BSWMD `<MULTIPLICITY-CONFIG-CLASSES>` 解析 /
  skeleton tagName / lower>0 才建壳 / 4 段路径解析）

### v1.3 — Sprint 14 脚本引擎（2026-06-20）

- CodeMirror 6 编辑器
- `node:vm` 沙箱 + 白名单上下文 API
- 事务式 commit / discard

### v1.2 — Sprint 14 ECUC ARXML 导入（2026-06-19）

- EB tresos 风格的"解决冲突"向导
- 拉模式 vs 推模式合并视图

### v1.1 — Sprint 14 BSWMD-to-ECUC（2026-06-18）

- BSWMD schema 反向生成 ECUC 配置值
- 懒合并视图 + ImportSlice

### v1.0 — Release Ready（2026-06-17）

- 5 大 BSW 样本（Det / EcuC / Com / PduR / WdgIf）测试基线
  782 签名 guarded 范围 [700, 850]
- 覆盖率 ≥ 90%

### 早期里程碑（v0.1.0 → v0.16.x）

- F1 ARXML IO → F2 树形 + 7 模编辑 → F3 校验
- F4 parser 修复 → F5 容器实例数约束 → F6 跨容器引用 → F7 REFERENCE-VALUE
- 跨文件 namespace 归一化 / schema type-segment 剥离 / 目标侧 ref dest
  校验 / 循环引用检测（DFS）
- Project Manifest（`<name>.autosarcfg.json` 持久化）
- BSWMD 双方言解析 + 渲染器集成

## 使用方式

1. 点击 **[打开 ARXML]** 加载 `.arxml`（试
   `tests/fixtures/arxml/Com_Com.arxml` — 67 个 IPdu）。
2. **左栏**叠加两个面板：
   - **Tree**（上）：package → module → container → parameter。点
     三角形展开，点行选中
   - **Validation**（下）：违规项按类型分组（`range` / `enum` /
     `reference` / `required` / `schema` / `multiplicity` /
     `cross-ref` / `ref-dest` / `ref-cycle`）。点任意一条跳到对应
     容器
3. **右栏编辑器**列出当前选中节点的全部参数，按类型渲染对应输入：
   `string` → 文本框；`integer` / `float` → 数字框；`boolean` →
   复选框；`enum` → 模式感知的 `<select>` 下拉（schema 缺时退化到
   文本框）；`reference` → 文本框 + DEST 徽标；多行键 → textarea
4. **边输边校验** — 每次参数编辑都会同步重跑 ECUC 子集校验；300ms
   去抖钩子作为后续异步路径的安全网
5. 编辑会把文件标脏。Save 按钮会变成橙色"Save (unsaved)"
6. 点击 **[保存 ARXML]** 写回磁盘

键盘操作：树里方向键移动焦点，Enter / Space 选中，← / → 折叠 /
展开。

在 S32K148_EAS_EB_3399A 用户 BSW 工程（Det / EcuC / Com / PduR /
WdgIf）上做过完整的 round-trip + mutation + validation 回归。

## 验证（7 阶段）

```bash
pnpm format:check    # prettier --check（CI：合入 lint job）
pnpm lint            # eslint，0 警告
pnpm type-check      # tsc --noEmit（tsconfig.json + tsconfig.web.json）
pnpm test            # vitest run（2097 单元测试，+1 skip）
pnpm test:coverage   # v8 覆盖率（core/ ≥ 80%）
pnpm build           # 3 段 vite 构建：renderer + main + preload
pnpm smoke:packaged  # 打包后产物的冒烟测试（可选）
```

或一键全跑（format 失败短路后续）：

```bash
pnpm verify          # 7 阶段顺序执行
```

GitHub Actions 跑 5 个并行 job（format 合入 lint job；build 独立）。
见 [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)。

## 目录结构

```
src/
├── core/                 纯 TS，无 react / electron
│   ├── arxml/            parser / serializer / types / path helpers
│   ├── validation/       validate() + ECUC schema（param + container）
│   ├── project/          manifest + BSWMD parser
│   ├── feature-flags/    实验性功能开关
│   └── sws-validator/    SWS 规则校验引擎
├── main/                 Electron 主进程
│   ├── ipc/              IPC handler
│   └── script/           CodeMirror 脚本沙箱
├── preload/              contextBridge
├── renderer/             React + Zustand UI
│   ├── components/       Tree / ValidationPanel / ParamEditor / StencilWizard / ...
│   ├── hooks/            useDebouncedValidation / useProjectActions / ...
│   └── store/            useArxmlStore（Zustand）
└── shared/               跨层类型 + IPC 契约 + i18n

bin/                     独立 CLI 入口（autosarcfg 命令）
tests/
├── fixtures/arxml/       5 个 S32K148_EAS_EB_3399A 样本（9.2 MB 入库）
└── e2e/                  Playwright（可选，需要图形环境）
samples/                 模板样本
docs/                    设计文档 + 发布说明 + 历史归档
├── release-notes/        各版本发布说明
├── superpowers/
│   ├── specs/            当前活跃设计文档
│   ├── plans/            当前活跃实施计划
│   └── archive/          已结案的设计 / 计划 / PROGRESS 日志
└── user-manual.html      v0.1.0 用户手册（独立 HTML）
scripts/                  dev.mjs + verify.{mjs,ps1,sh} + smoke-packaged.mjs
```

## 许可

MIT — 见 [LICENSE](./LICENSE)。
