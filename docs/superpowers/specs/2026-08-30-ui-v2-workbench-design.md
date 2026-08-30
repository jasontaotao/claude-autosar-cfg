# UI v2 Workbench — 视觉刷新 + 可重排工作台

> **Status**: DESIGN — pre-flight（2026-08-30 spec review 完成，实施歧义已裁决，新增决策见 §9.7–9.16）
> **Ship strategy**: 四阶段递进，每阶段独立 MINOR/PATCH（不设单一版本号；统称 "UI v2" 方向）
> **Baseline**: v1.55.0（~3003 单测 + e2e 全绿）
> **Spec author**: brainstorming flow (2026-08-30)
> **Related**:
>
> - [ui-v2-preview.html](../../mockups/ui-v2-preview.html) — 视觉方向来源（light 单主题，25 tokens；代码侧另新增 1 个 `--surface-menu`，见 §3.1）
> - [审计截图证据](../../mockups/audit-2026-08-30/) — 2026-08-30 实跑走查 6 图
> - [v1.33.1 override UI debt cleanup](2026-07-07-v1-33-1-patch-override-ui-debt-cleanup-design.md) — 既有 UI 债务治理先例

## Summary

对 claude-AutosarCfg 渲染层做四阶段改造：**P1 视觉地基**（design tokens 落地 + 914 处裸色值收敛 + Catppuccin 暗色对话框反转为亮色）→ **P2 健壮性 + UX 小修**（ErrorBoundary 分级降级、dialog 验证时机、空状态引导、保存按钮层级）→ **P3 Dock 工作台骨架**（dockview 骨架 + 7 面板注册 + 布局持久化）→ **P4 IA 重组落位**（左面板 3 tab 拆独立面板、viewer 归组、验证联动）。

用户已确认的方向性决策（2026-08-30 brainstorming）：

- **先做全面 UI 审计**（已完成，证据见 §0）
- **light 单主题**，跟随 `ui-v2-preview.html`；不做 dark
- **激进可重排工作台**（dock 级，非保守内部重组）
- **方案 A 四阶段递进**（否决 B「Dock 先行」与 C「单次大版本」）
- 交互效率专项（键盘流/操作路径）**不在本期范围**

## 0. 审计证据摘要（方案的根基）

### 0.1 静态样式审计（2026-08-30，全量扫描非抽样）

| 发现 | 数据 |
|---|---|
| 裸色值总数 | **914 处**（hex 835 + rgba 79；hsl/oklch 为 0），分布 32 个 CSS 文件 / 5923 行 |
| 调色盘割裂 | 三套并存：Tailwind slate/blue 亮色壳（225 处）+ **Catppuccin Mocha 暗色对话框**（336+ 处，13 个组件）+ GitHub dark 下拉（7 处） |
| CSS 变量 | **定义 0 个**；悬空 `var(--color-*)` 引用 119 处（全带 hex fallback）；另有 53 处 `/* --color-xxx */` 计划注释（只留注释未抽变量） |
| 双轨空转 | Tailwind 管线完整编译，但 226 个工具类 token 只服务 editor 子系统 9 个文件；其余 151 个组件走 31 个手写 BEM `.css` |
| Metrics 魔法数字 | 字号 15 种离散值（主力 11/12/13px）、圆角 9 种、间距 15+ 种、`font-family` 内联 51 处 |
| 暗色机制 | 三种互不通气：Tailwind `dark:`（media 策略，ParamEditor 24 处 + index.html body）+ **永不命中的 `.dark` 死代码**（EnumEditor/BooleanEditor，无 toggle 逻辑）+ 无条件常暗 Catppuccin 弹窗 |
| 与 mockup 关系 | mockup 29 个 hex 全部能在现有代码找到同值来源——是同族萃取，但代码侧零 token 消费 |

重灾区 top 5（hex+rgba 合计）：`styles.css` 94、`ScriptPanel.css` 83、`NewProjectDialog.css` 55、`ModuleFromBswmdPicker.css` 52、`ValidationPanel.css` 46。

### 0.2 实跑走查发现（2026-08-30，Playwright + Vite dev server）

证据图在 `docs/mockups/audit-2026-08-30/`：

1. **ErrorBoundary 全屏裸崩**（audit-06）：Tree 组件拿到不完整 BSWMD 数据时（`parent.choices is not iterable` / `siblings is not iterable`）整个 App 崩溃，fallback 是无样式文字 + Reset 按钮，Reset 后反复再崩。无局部降级、无错误上下文、无恢复引导。
2. **空状态主区整片空白**（audit-01）：仅一行灰字「请从树中选择一个元素」，无引导；左面板空态文案细碎（三处分散的"未加载"提示）。
3. **header 三保存按钮**（audit-01）：`保存项目 / 保存 / 全部保存` 平铺，层级不清。
4. **dialog 验证过早**（audit-03）：NewProjectDialog 打开即报「项目名称不能为空」，先于任何用户输入。
5. **亮底 + 常暗弹窗断层**（audit-03/04/05）：主区亮灰底，菜单/弹窗 Catppuccin 深紫黑，肉眼可见的两套设计语言。

## 1. Goals & Non-Goals

### Goals（按阶段）

**P1 视觉地基**
- `src/renderer/styles/tokens.css` 落地 mockup 六组 25 token（+ 新增 `--surface-menu`，见 §3.1）+ metrics 扩展定义（字号 5 档 / 间距 4 档 / 字体 2 栈）；metrics 仅落定义，存量使用点迁移不在 P1 验收范围（§3.1）
- 914 处裸色值全部收敛为 `var()`（codemod + 人工 review 重灾区）
- 13 个 Catppuccin 暗色组件反转为亮色，消除亮底暗弹窗断层
- 删除 `.dark` 死代码 + Tailwind `dark:` 变体（单主题决策落地）
- stylelint 禁裸 hex 进 CI（防回潮）

**P2 健壮性 + UX 小修**
- ErrorBoundary 分级：Tree / ParamEditor / ScriptPanel / 各 Viewer 局部 boundary + 面板内错误卡片；App 级兜底 fallback 样式化
- NewProjectDialog 空名验证改为 blur/submit 触发
- 主区空状态改为引导面板（图标 + 主文案 + 打开/新建项目快捷按钮）
- header 保存按钮层级化：`保存` 主按钮（dirty 时 amber 高亮）+ 溢出菜单

**P3 Dock 工作台骨架**
- 引入 `dockview`（MIT），工作区替换为 `<DockviewReact>`；header / status-footer 留在 dock 外
- 面板注册表 `panels/registry.ts`，首批 5 面板（现状区域整体搬迁，不拆分内部）
- 默认布局序列化等价当前布局（用户升级无感）
- 布局持久化 localStorage（versioned key，坏数据回退默认）

**P4 IA 重组落位**
- 左面板 3 tab（项目/文件/验证）拆为 3 个独立 dock 面板 + Tree 独立成面板（LeftPanel 壳退役，终态 8 面板）
- DBC/ODX viewer 归组统一 viewer tab 组
- 验证面板 → ParamEditor 联动（点击问题定位树节点 + 滚动到参数）
- react-resizable-panels 移除

### Non-Goals（全期）

- ❌ Dark 主题（用户已决：light 单主题，跟随 mockup）
- ❌ 交互效率专项：键盘流重设计、命令面板、操作路径优化（后续单独立项）
- ❌ 浮动窗口 / 弹出式 dock 面板（v1 只做主区内 dock）
- ❌ 组件内部业务逻辑重写（P4 只做包装层迁移）
- ❌ Tailwind 全面替换手写 BEM 或反向替换（双轨收敛策略 = 统一到 tokens 变量层，不强制统一框架）
- ❌ 响应式 / 移动端断点（桌面单布局工具）
- ❌ i18n 文案内容重写（只接入新面板的 title key）

## 2. 总体架构

```
P1 视觉地基（纯 CSS，零行为变化）
  └→ P2 健壮性 + UX 小修（低风险行为改动；可与 P1 并行但建议串行）
       └→ P3 Dock 工作台骨架（架构改动；硬依赖 P1 —— dock 壳里直接装新样式，零返工）
            └→ P4 IA 重组落位（组件包装迁移；完成后移除 react-resizable-panels）
```

阶段边界即 ship 边界：每阶段独立 MINOR/PATCH、独立 spec/plan、独立 release。本 spec 是 umbrella 设计，约束四阶段共同遵守的架构决策；每阶段实施前另出该阶段的实施 plan。

## 3. P1 视觉地基（详细设计）

### 3.1 Token 清单

`src/renderer/styles/tokens.css`，`:root` 单一定义块。命名以 mockup 为唯一标准（不沿用代码侧悬空的 `--color-*` 命名）：

| 组 | Token | 值 |
|---|---|---|
| surface | `--surface-app` / `--surface-panel` / `--surface-elevated` / `--surface-subtle` | `#f8fafc` / `#ffffff` / `#ffffff` / `#f1f5f9` |
| surface | `--surface-header` | `linear-gradient(135deg,#0f172a,#1e293b)` |
| surface | `--surface-menu`（mockup 外新增，唯一例外） | `#1c2128` |
| brand | `--brand-500/400/300` | `#3b82f6` / `#60a5fa` / `#93c5fd` |
| accent | `--accent-cyan/amber/emerald/rose` | `#38bdf8` / `#f59e0b` / `#10b981` / `#f43f5e` |
| text | `--text-primary/secondary/muted` | `#0f172a` / `#475569` / `#94a3b8` |
| text | `--text-inverse/inverse-muted` | `#f1f5f9` / `#cbd5e1` |
| border | `--border-subtle/strong` | `#e2e8f0` / `#cbd5e1` |
| shadow | `--shadow-sm/md/lg` | `0 1px 2px rgba(15,23,42,0.05)` / `0 4px 12px rgba(15,23,42,0.08)` / `0 12px 32px rgba(15,23,42,0.12)`（与 mockup 逐字一致） |
| radius | `--radius-sm/md/lg` | `4px` / `6px` / `10px` |

**T3 裁决新增 15 token**（以下均为「T3 裁决新增」标注项，以 2026-08-30 P1 偏差裁决为准，见 `docs/superpowers/plans/2026-08-30-p1-visual-foundation-deviations.md`；分组同 tokens.css）：

| 组 | Token | 值 |
|---|---|---|
| surface | `--chrome-bg` / `--chrome-bg-deep` | `#1e293b` / `#1a1d23` |
| brand | `--brand-tint` / `--brand-tint-soft` | `#dbeafe` / `#eff6ff` |
| accent | `--accent-rose-strong` | `#b91c1c` |
| border | `--chrome-border` | `#334155` |
| tint | `--rose-tint` / `--rose-tint-strong` / `--amber-tint` / `--emerald-tint` | `#fef2f2` / `#fee2e2` / `#fef3c7` / `#dcfce7` |
| overlay/alpha | `--overlay-scrim` / `--overlay-scrim-soft` / `--brand-alpha` / `--brand-alpha-soft` / `--chrome-hairline` | `rgba(0,0,0,0.5)` / `rgba(0,0,0,0.2)` / `rgba(59,130,246,0.12)` / `rgba(59,130,246,0.06)` / `rgba(255,255,255,0.1)` |

**metrics 扩展**（mockup 未覆盖，按现有值分布收敛）：

| Token | 值 | 现状分布 / 收敛策略 |
|---|---|---|
| `--text-xs/sm/base/md/lg` | `11px/12px/13px/14px/16px` | 15 种离散字号（主力 11/12/13） |
| `--space-1/2/3/4/5` | `4px/6px/8px/12px/16px` | 15+ 种间距 |
| `--font-sans` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif` | 51 处内联 font-family；mockup 栈 + Windows/CJK 回退（已声明扩展，§9.14） |
| `--font-mono` | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | 同上（mockup 栈 + Windows 回退） |
| `--accent-amber-strong` | `#b45309` | 仅精确命中 `#b45309`；`#c2410c`/`#ea580c` **不预先合并**，走偏差清单人工裁决（§9.15） |

**metrics 收敛范围（P1）**：仅落地 tokens.css 定义；新增/修改样式必须消费 tokens（§10.3）。存量字号/间距/radius/font-family 使用点（15 种字号、15+ 间距、51 处 font-family）的迁移**不在 P1 验收范围**——字号归档含视觉降档裁决（如 15px→14px），不与色值 codemod 混车，留独立清理项或随各阶段触碰文件顺手迁移（后者不算偏离）。

引入方式：`styles.css` 顶部 `@import './styles/tokens.css'`。CSS 自定义属性运行时解析，与组件 CSS 加载顺序无关。

### 3.2 色值收敛 codemod

- 脚本：`scripts/codemod/hex-to-tokens.mjs`（新增，入仓）。三种模式：默认 **dry-run**（输出替换预览 + 偏差清单）、`--write`（落盘）、`--check`（CI 用，发现残留裸值即 exit 1）
- 映射表内嵌脚本（`TOKEN_MAP` 常量），来源 = §3.1 token 清单 + §3.3 反转表——**单一数据源**，实施者不得另建映射
- **收敛范围 = 32 个手写 CSS 文件**。editor 子系统的 Tailwind slate 工具类（9 个 tsx）不在本阶段收敛范围：其色值与 token 同源、视觉一致，且框架统一是 §1 声明的 Non-goal
- **映射语义 = 纯值映射**（§9.7）：TOKEN_MAP 中每个 hex 唯一对应一个 token，替换与属性上下文无关。语义错位（值命中但角色不符，如背景值被映射到 text token）不是 codemod 的职责——由 15 个重灾区文件人工 review 时修正为语义正确的 token，此类修正属 review 职责、不算 §10.4 偏离
- **渐变内 hex 不做单值替换**：整条渐变与某组合 token（如 `--surface-header`）逐字相等 → 整体替换为该 token；否则进偏差清单
- 脚本扫描 32 个 CSS 文件，按映射表替换裸值为 `var()`：
  - **Tailwind slate/blue 族（225 处）**：色值相等直映射（`#f8fafc→--surface-app`、`#0f172a→--text-primary` 等）
  - **GitHub dark 下拉（7 处，`styles.css .app-dropdown`）**：`#1c2128→--surface-menu`（§3.1 新增 token）、`#c9d1d9→--text-inverse-muted`；其余值（边框/hover 等无 token 对应）→ 偏差清单。**该下拉保持深色**（挂靠深色 header 的 chrome，与 `--surface-header` 一体），不随 13 组件反转（§9.8）
  - **Catppuccin（336 处，13 组件）**：见 §3.3 反转表，非直映射
- **实施顺序强制 dry-run 先行**：第一步以默认 dry-run 模式输出「TOKEN_MAP 未覆盖色值清单」→ 未覆盖项逐条裁决补表（经用户确认）→ 才允许 `--write`。不设自动阈值
- 119 处悬空 `var(--color-*, fallback)`：以各处 **fallback hex 查 TOKEN_MAP** 得目标 token 改写，随后删除 fallback（fallback hex 不在 TOKEN_MAP → 偏差清单）
- 无精确命中的近似色：全部进偏差清单，人工逐项裁决（不设自动阈值）
- 15 个重灾区文件替换后人工 review + visual regression 对比（括号内为裸色值计数，合计 641 / 914 ≈ 70%）：`styles.css`(94)、`components/ScriptPanel/ScriptPanel.css`(83)、`components/NewProjectDialog.css`(55)、`components/ModuleFromBswmdPicker.css`(52)、`components/ValidationPanel.css`(46)、`components/ProjectPanel.css`(42)、`components/BswmdPickerDialog.css`(37)、`components/RemoveModuleConfirmDialog.css`(35)、`components/ErrorBanner.css`(35)、`components/CascadeConfirmDialog.css`(33)、`components/OdxViewer/OdxViewer.css`(33)、`components/FileListTab.css`(31)、`components/DbcViewer/DbcViewer.css`(30)、`components/ValidationPanel/ValidationPanel.css`(29)、`components/DbcImportWizard/DbcImportWizard.css`(29)

### 3.3 Catppuccin 暗色反转表（13 组件）

| Catppuccin | 用途 | → 新 token |
|---|---|---|
| `#1e1e2e` | 弹窗 surface（base） | `--surface-panel` |
| `#181825` | 弹窗 surface（mantle） | `--surface-elevated` |
| `#313244` | 边框 | `--border-subtle` |
| `#45475a` | 分隔 | `--border-strong` |
| `#cdd6f4` | 主文本 | `--text-primary` |
| `#a6adc8` | 次级文本 | `--text-secondary` |
| `#6c7086` | 弱文本 | `--text-muted` |
| `#89b4fa` | 强调/链接 | `--brand-500` |
| `#f38ba8` | 错误 | `--accent-rose` |
| `#a6e3a1` | 成功 | `--accent-emerald` |
| `#f9e2af` | 警告 | `--accent-amber` |

涉及组件：NewProjectDialog、ModuleFromBswmdPicker、BswmdPickerDialog、ConfirmDialog、ConfirmDialog2、CascadeConfirmDialog、RemoveModuleConfirmDialog、XlsxBatchWizard、DbcImportWizard、OdxViewer、DiagnosticExtractSuccessDialog、PromptDialog、ErrorViewerModal。

**覆盖性与实施顺序**：上表按 Catppuccin Mocha 常用色覆盖，不保证覆盖 336 处的全部源值。dry-run 若发现表外 Catppuccin 值（如 `#11111b` crust、`#585b70` surface2、`#cba6f7` mauve、`#fab387` peach、`#b4befe` lavender 等），逐条裁决补表后方可 `--write`（§3.2 dry-run 先行，§10.4 偏离协议适用）。

### 3.4 删除清单

- `.dark .enum-editor`（EnumEditor.css:30,41）、`.dark .boolean-editor`（BooleanEditor.css:30）——无 toggle 逻辑，永不命中
- ParamEditor.tsx 24 处 `dark:` 变体 + `index.html` body 的 `dark:bg-slate-900 dark:text-slate-50`
- 53 处 `/* --color-xxx */` 计划注释（变量落地后注释失去意义）

### 3.5 防回潮

- 新增 devDependency：`stylelint` + `stylelint-config-standard`（确切版本在 P1 plan 锁定）
- 核心规则：`color-no-hex: true` + `color-named: never` + `declaration-property-value-disallowed-list` 对 `color/background/border/fill/stroke/box-shadow` 属性禁 `/rgba?\(|hsla?\(/`；`overrides` 豁免 `tokens.css` 与 codemod 脚本（`transparent` / `currentcolor` 为特殊关键字，不在禁用范围）
- `pnpm stylelint "src/renderer/**/*.css"` 进 CI lint 阶段，0 error 为门禁；与 codemod `--check` 构成双保险

### 3.6 P1 验收

- 全仓 CSS 裸色值 = 0（tokens.css 豁免）
- 6 个关键 surface visual regression 基线建立且通过（允许逐像素对比的合理色差窗口，反转组件走新基线）
- 现有 ~3003 单测全绿（CSS-only 不应破坏行为测试）

## 4. P2 健壮性 + UX 小修（详细设计）

### 4.1 ErrorBoundary 分级

- 现状：单个 ErrorBoundary 包整个 App（ErrorBoundary.tsx），任何子树异常 → 全屏裸文字 fallback
- 改为：
  - **App 级**保留兜底，fallback 重写为 token 样式错误页（错误摘要 + 复制堆栈 + Reset + 反馈指引）
  - **局部 boundary** 新增于：Tree、ParamEditor、ScriptPanel、DbcViewer、OdxViewer、ValidationPanel。fallback 为面板内错误卡片（图标 + 摘要 + 重试按钮），尺寸撑满所在面板，不影响兄弟面板
- 错误上报：局部 boundary 的 `componentDidCatch` 写 `console.error` + 面板卡片内提供「复制详情」；不接外部遥测（Non-goal）

### 4.2 其余三项

- **验证时机**：NewProjectDialog 空名错误从 mount 即显示改为 blur 后 + submit 时触发；初始态干净
- **空状态引导**：主区 `Parameter editor` 空态从一行灰字改为居中的引导面板（图标 + 「从左侧树选择元素开始编辑」+ `打开项目` / `新建项目` 按钮，复用 header 已有 action；跨组件触发机制——props 下传或 store action——由 P2 plan 决定）
- **保存按钮层级**：`保存` 主按钮（dirty 时底色 `--accent-amber` + pulse 动效，reduced-motion 时静态高亮；hover/按下加深为 `--accent-amber-strong`，文字 `--text-inverse`）；`保存项目` / `全部保存` 收进该按钮右侧的下拉溢出

## 5. P3 Dock 工作台（详细设计）

### 5.1 技术选型

**dockview**（mathuo/dockview）：MIT、React 一等支持、TS 原生、zero-deps（~40kb gz）、活跃维护。拖拽换位 / tab 合并分组 / split / 布局序列化齐备。**版本策略**：P3 plan 锁定确切版本，package.json 用精确版本（不带 caret），后续升级走独立 chore。

否决项：flexlayout-react（API 繁、自定义 license）、golden-layout（React 支持弱、维护放缓）、react-resizable-panels 扩展（只能 split，tab 合并/拖拽换位需自研，等于重写 dockview 已解决的问题）。

### 5.2 结构

```
App
├─ AppHeader（dock 外，chrome）
├─ <DockviewReact>（工作区整体替换）
│   └─ 面板实例（按 registry 注册）
└─ status-footer（dock 外，chrome）
```

### 5.3 面板注册表

`src/renderer/panels/registry.ts`：

```ts
interface PanelDef {
  readonly id: string;            // 'arxml-tree' 等稳定 id
  readonly component: ComponentType<any>;  // 注册的是包装组件（见下）
  readonly titleKey: string;      // i18n key
  readonly defaultGroup: 'left' | 'center' | 'bottom' | 'viewer';
}
```

首批 5 面板（现状区域**整体搬迁**，不拆分内部）：`left-panel`（现左面板含 3 tab + Tree）、`param-editor`、`script-panel`、`dbc-viewer`、`odx-viewer`。面板 id 一经注册**永不改名**（布局持久化引用 id）。

`component` 注册的是**包装组件**（负责从 store 读状态/注入回调后渲染业务组件）——现有组件并非全部无 props（`ParamEditor` 无 props，但 `DbcViewer` 带必选 props、`ScriptPanel` 带可选 props），由包装层供给 props，业务组件的 props 契约不变（§6 迁移约束）。

`defaultGroup` 的 `'viewer'` 枚举 **P3 不消费**：P3 中打开 `dbc-viewer` / `odx-viewer` 一律加入 `param-editor` 所在 tab 组（§5.4）；P4 起改入独立 viewer 组（§6）。

| 面板 id | defaultGroup | 说明 |
|---|---|---|
| `left-panel` | `left` | 现左面板整体（3 tab + Tree） |
| `param-editor` | `center` | 右侧参数编辑器 |
| `script-panel` | `bottom` | 脚本面板，默认折叠 |
| `dbc-viewer` | `viewer` | 按需打开 |
| `odx-viewer` | `viewer` | 按需打开 |

### 5.4 默认布局与持久化

- 默认布局语义（P3 plan 据此生成序列化 JSON，比例/折叠态以本节为准）：`left-panel` 居左占 **30%**；`param-editor` 居右占 70%；`script-panel` 底部组**默认折叠**；viewer 面板按需打开时加入 `param-editor` 所在 tab 组——**用户升级无感**为验收标准（截图对比）
- 持久化：`dockview.serialize()` 的输出外包一层落 localStorage——payload schema 固定为 `{ version: number, layout: <serialize() 原生输出> }`，key 固定 `autosarcfg.layout.v1`（**key 名永不递增**，schema 演进由 payload 内 `version` 字段承载：P3 为 1，P4 起为 2，§9.12）
- 写入时机：布局变化（拖拽/开关面板/换组/尺寸）后防抖 500ms 写入 + `beforeunload` flush（精确参数允许 P3 plan 微调，语义不变）
- 恢复策略：JSON 解析失败 / version 不匹配 / 引用了已删除面板 id → 静默回退默认布局（不阻塞启动，console.warn 一次）

### 5.5 react-resizable-panels 退役

- P3 期间共存：dock 面板内部仍可用旧 split（ParamEditor 内部布局不动）
- P4 全部面板迁移完后移除依赖（`workspace-resize-h` 等既有 e2e 选择器随 P4 更新）

### 5.6 面板恢复入口（P3 必备，§9.11）

dock 面板可关闭，且布局持久化会记住「已关闭」状态——必须提供找回手段：

- 复用现有 `.app-dropdown` 菜单体系，新增**「视图」下拉**：按 registry 枚举全部面板；已打开 → 激活并聚焦其 tab；已关闭 → 按 `defaultGroup` 在默认位置恢复
- 同菜单提供**「重置布局」**：清除 localStorage 布局 key → 恢复默认布局
- 该入口是 dock 工作台的基础能力，不属于 §1 Non-goal 所指的「交互效率专项」

### 5.7 P3 测试

- 单测：布局序列化/恢复（含坏数据、version 漂移、未知面板 id 回退）
- e2e：拖 tab 换组 + reload 恢复（镜像 `workspace-resize.spec.ts` 模式）；关闭面板 → 「视图」菜单恢复；默认布局 vs 现布局截图等价

## 6. P4 IA 重组（详细设计）

- 左面板 3 tab（项目 / 文件 / 验证）拆为 3 个独立 dock 面板（id：`project` / `files` / `validation`）+ `arxml-tree` 从 LeftPanel 内部独立成面板，LeftPanel 壳退役——终态 8 面板：`project`、`files`、`validation`、`arxml-tree`、`param-editor`、`script-panel`、`dbc-viewer`、`odx-viewer`
- P4 默认布局：左 30% 上下分——上为 `project`/`files`/`validation` tab 组，下为 `arxml-tree`；右侧 `param-editor` 与底部 `script-panel` 同 P3。观感与现状一致，能力上各自可拖出/关闭/换位
- DBC / ODX viewer 归组为统一 `viewer` tab 组（打开 viewer 时加入该组而非弹层；`defaultGroup: 'viewer'` 自 P4 起生效）
- 验证联动：ValidationPanel 点击问题项 → 树选中对应节点 + ParamEditor 滚动定位（走既有 `selectedPath` store 通道，不新增状态）
- 迁移约束：每 surface 只做「组件包装 + title i18n 接入」，不改内部逻辑与 props 契约
- 布局数据升级：`left-panel` 退役使 P3 布局 payload version 不匹配 → 全量回退 P4 默认布局，**属预期行为**（§9.16；P4 默认布局观感与现状一致，用户损失仅为自定义排布）；payload `version` 递增为 2（§5.4），release notes 明示

## 7. 测试策略汇总

| 阶段 | 防线 | 关键指标 |
|---|---|---|
| P1 | visual regression（6 surface 基线）+ stylelint 禁裸 hex + 全量单测 | 裸色值 = 0；3003 单测绿 |
| P2 | 局部 boundary 单测（子面板崩 → App 存活）+ dialog 验证时机单测 + 空状态 e2e | 崩溃隔离率 100%（注入故障不越面板） |
| P3 | 序列化/恢复单测 + 拖拽持久 e2e + 默认布局截图等价 | 升级无感（默认布局 = 现布局） |
| P4 | 面板独立渲染单测 + 验证联动 e2e + 移除旧依赖全量回归 | react-resizable-panels 依赖 = 0 |

每阶段 ship 前 `pnpm verify` 全量；visual regression 基线图入仓（tests/visual/baseline/）。

## 8. 风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| 914 处色值收敛是机械大体量活，手工易漏 | 高 | codemod 脚本先行；stylelint 禁裸 hex 兜底「零新增」；15 个重灾区文件人工 review |
| Catppuccin 反转后个别组件视觉失衡（对比度/层级丢失） | 中 | 反转表逐组件 review；反转组件走新 visual regression 基线而非硬对旧基线 |
| dockview 布局持久化 schema 漂移（后续版本面板增删） | 中 | version 字段 + 静默回退默认布局；面板 id 稳定命名契约 |
| 用户已有 `react-resizable-panels` localStorage 布局残留 | 低 | P4 移除旧依赖时清理旧 key；新 key 独立命名空间 |
| P1 与 P2 改同一文件（NewProjectDialog 等 13 组件既有样式又有行为改动） | 低 | 建议串行：P1 先落，P2 在其上改 |

## 9. 决策记录（本期已定，不再讨论）

1. **light 单主题**，跟随 `ui-v2-preview.html`；不做 dark（2026-08-30 用户确认）
2. **激进可重排工作台**（dock 级），非保守内部重组（2026-08-30 用户确认）
3. **方案 A 四阶段递进**；否决 B（Dock 先行，+20% 返工）与 C（单次大版本，回归风险）（2026-08-30 用户确认）
4. **dockview** 为 dock 库选型（§5.1 论证）
5. **token 命名以 mockup 为准**，不沿用代码侧 `--color-*` 悬空命名
6. 交互效率专项不在本期范围（后续单独立项）

以下为 2026-08-30 spec review 新增裁决（消除实施歧义）：

7. codemod 采用**纯值映射**（hex → 唯一 token，与属性上下文无关）；语义错位由重灾区人工 review 修正，不算偏离；渐变内 hex 不做单值替换
8. 新增 `--surface-menu`（mockup 外新增 token）；`.app-dropdown` 保持深色 chrome，仅做 token 化。mockup 外新增 token 以 §3.1 裁决清单为准（--surface-menu + T3 裁决 15 个）
9. metrics token P1 只落地定义；存量使用点迁移不在 P1 验收范围
10. P3 中 viewer 打开加入 `param-editor` 所在组；`'viewer'` 枚举 P4 启用
11. header 新增「视图」面板恢复入口 + 重置布局（§5.6），P3 交付
12. 布局 key 固定 `autosarcfg.layout.v1` 不递增；schema 版本由 payload `version` 字段承载（P3=1，P4=2）
13. P2 故障注入单测覆盖全部 6 个局部 boundary
14. 字体栈 pin 为含 Windows/CJK 回退的具体值（mockup 栈的声明性扩展）
15. `--accent-amber-strong` 仅精确命中 `#b45309`；`#c2410c`/`#ea580c` 走偏差清单，不预先合并
16. P4 升级触发布局全量重置（P3 数据 version 不匹配 → 默认布局），属预期行为
17. P1 偏差裁决结果以 `docs/superpowers/plans/2026-08-30-p1-visual-foundation-deviations.md` 为准（2026-08-30 用户整体确认）；B26（#fca5a5）保留原值 + EXCEPTIONS 豁免；实施机制注记（ADJUDICATED_TOKEN_MAP / FILE_OVERRIDES / scanResidue 例外感知）见该文档「机制注记（实施时裁决）」节

## 10. 实施一致性保障（交接协议）

本节是 spec 交付实施的契约层：实施者（人或 agent）拿到本 spec + 当阶段 plan 后，按以下规则执行，保证实现与设计不跑偏。

### 10.1 实施模型

- 每阶段 = 独立实施 plan（writing-plans 产出，落 `docs/superpowers/plans/`）→ TDD 执行 → code review → ship
- 实施者**只执行当阶段 plan**；本 spec 用于范围界定与冲突裁决，不直接作为施工清单
- 冲突裁决优先级：**本 spec §9 决策记录 > 本 spec 正文 > 阶段 plan**
- 发现 spec 内部矛盾、或与代码现实冲突 → **停手上报**，不得自行解释、变通或"选个看起来更合理的"

### 10.2 每阶段 Definition of Done（机器可验证）

| 阶段 | 门禁命令 | 通过标准 |
|---|---|---|
| P1 | `node scripts/codemod/hex-to-tokens.mjs --check` | 输出 0 残留裸色值 |
| P1 | `pnpm stylelint "src/renderer/**/*.css"` | 0 error |
| P1 | `pnpm test` + visual regression | 全绿；6 surface 基线通过（反转组件走新基线） |
| P2 | `pnpm test`（含新增故障注入单测：Tree / ParamEditor / ScriptPanel / DbcViewer / OdxViewer / ValidationPanel 各一） | 全绿；注入故障不越出所在面板 |
| P2 | e2e（空状态引导 + dialog 验证时机） | 通过 |
| P3 | 单测（布局序列化/恢复/坏数据回退）+ e2e（拖拽换组 + reload 恢复 + 视图菜单关闭/恢复面板） | 通过 |
| P3 | 默认布局 vs 现布局截图等价 | 视觉 diff 在阈值内（阈值在 P3 plan 量化） |
| P4 | `package.json` 无 `react-resizable-panels`；验证联动 e2e；`pnpm verify` | 依赖移除；全量绿 |

每阶段 plan 必须从本表生成自己的「一致性自检清单」，逐项打勾后才允许进入 review。

### 10.3 命名与位置契约（实施者不得另选）

| 契约项 | 值 |
|---|---|
| tokens 唯一定义处 | `src/renderer/styles/tokens.css` |
| codemod 脚本 | `scripts/codemod/hex-to-tokens.mjs`（dry-run 默认 / `--write` / `--check`） |
| 面板注册表 | `src/renderer/panels/registry.ts` |
| 布局持久化 | localStorage key `autosarcfg.layout.v1`（**key 名永不递增**）；payload 固定 `{ version, layout }`，schema 版本由 `version` 字段承载（P3=1，P4=2）；坏数据/版本漂移 → 静默回退默认布局 |
| 面板 id（P3） | `left-panel` / `param-editor` / `script-panel` / `dbc-viewer` / `odx-viewer` |
| 面板 id（P4 新增） | `project` / `files` / `validation` / `arxml-tree`（`left-panel` 退役，旧布局数据走版本回退） |
| visual regression 基线 | `tests/visual/baseline/`（入仓） |
| 新增/修改样式 | 只允许消费 `tokens.css` 变量；裸 hex/rgb 一律 BLOCK（stylelint 强制） |

面板 id 一经注册**永不改名**；需要重命名时新增 id + 布局版本号递增，旧 id 走回退路径。

### 10.4 偏离协议

- 实施中对 spec 的任何偏离——包括"看起来更合理"的替代做法——必须：先写入当阶段 plan 的 `## Deviations` 节 → 用户确认 → 才可实施
- 未声明的偏离在 code review 中按 **BLOCK** 处理

### 10.5 Spec 变更控制

- 本 spec 的任何修改必须经用户批准；修订历史走 git commit
- §9 决策记录的翻案（如重做 dark 主题、换 dock 库）必须新起 spec 修订 commit 并注明理由
