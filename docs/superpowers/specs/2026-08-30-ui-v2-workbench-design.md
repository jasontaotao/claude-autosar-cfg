# UI v2 Workbench — 视觉刷新 + 可重排工作台

> **Status**: DESIGN — pre-flight (awaiting user review)
> **Ship strategy**: 四阶段递进，每阶段独立 MINOR/PATCH（不设单一版本号；统称 "UI v2" 方向）
> **Baseline**: v1.55.0（~3003 单测 + e2e 全绿）
> **Spec author**: brainstorming flow (2026-08-30)
> **Related**:
>
> - [ui-v2-preview.html](../../mockups/ui-v2-preview.html) — 视觉方向来源（light 单主题，23 tokens）
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
- `src/renderer/styles/tokens.css` 落地 mockup 六组 23 token + metrics 扩展（字号 5 档 / 间距 4 档 / 字体 2 栈），作为唯一命名标准
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
- 面板注册表 `panels/registry.ts`，首批 7 面板
- 默认布局序列化等价当前布局（用户升级无感）
- 布局持久化 localStorage（versioned key，坏数据回退默认）

**P4 IA 重组落位**
- 左面板 3 tab（项目/文件/验证）拆为 3 个独立 dock 面板（默认仍同 tab 组，观感不变）
- Tree 独立成面板；DBC/ODX viewer 归组统一 viewer tab 组
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
| brand | `--brand-500/400/300` | `#3b82f6` / `#60a5fa` / `#93c5fd` |
| accent | `--accent-cyan/amber/emerald/rose` | `#38bdf8` / `#f59e0b` / `#10b981` / `#f43f5e` |
| text | `--text-primary/secondary/muted` | `#0f172a` / `#475569` / `#94a3b8` |
| text | `--text-inverse/inverse-muted` | `#f1f5f9` / `#cbd5e1` |
| border | `--border-subtle/strong` | `#e2e8f0` / `#cbd5e1` |
| shadow | `--shadow-sm/md/lg` | `0 1px 2px` / `0 4px 12px` / `0 12px 32px`（rgba(15,23,42,*)） |
| radius | `--radius-sm/md/lg` | `4px` / `6px` / `10px` |

**metrics 扩展**（mockup 未覆盖，按现有值分布收敛）：

| Token | 值 | 收敛对象 |
|---|---|---|
| `--text-xs/sm/base/md/lg` | `11px/12px/13px/14px/16px` | 15 种离散字号（主力 11/12/13） |
| `--space-1/2/3/4/5` | `4px/6px/8px/12px/16px` | 15+ 种间距 |
| `--font-sans` / `--font-mono` | 系统栈 / 等宽栈 | 51 处内联 font-family |
| `--accent-amber-strong` | `#b45309` | dirty 按钮深档（`#b45309/#c2410c/#ea580c` 收敛） |

引入方式：`styles.css` 顶部 `@import './styles/tokens.css'`。CSS 自定义属性运行时解析，与组件 CSS 加载顺序无关。

### 3.2 色值收敛 codemod

- 脚本扫描 32 个 CSS 文件，按映射表替换裸值为 `var()`：
  - **Tailwind slate/blue 族（225 处）**：色值相等直映射（`#f8fafc→--surface-app`、`#0f172a→--text-primary` 等）
  - **GitHub dark 下拉（7 处，`styles.css .app-dropdown`）**：`#1c2128→--surface-header` 实色或新增 `--surface-menu`，`#c9d1d9→--text-inverse-muted`
  - **Catppuccin（336 处，13 组件）**：见 §3.3 反转表，非直映射
- 119 处悬空 `var(--color-*, fallback)` 统一改写为新命名（fallback 删除，token 已有定义）
- 无精确命中的近似色：全部进偏差清单，人工逐项裁决（不设自动阈值）
- 15 个重灾区文件替换后人工 review + visual regression 对比

### 3.3 Catppuccin 暗色反转表（13 组件）

| Catppuccin | 用途 | → 新 token |
|---|---|---|
| `#1e1e2e` `#181825` | 弹窗 surface | `--surface-panel` / `--surface-elevated` |
| `#313244` `#45475a` | 边框 / 分隔 | `--border-subtle` / `--border-strong` |
| `#cdd6f4` | 主文本 | `--text-primary` |
| `#a6adc8` `#6c7086` | 次级/弱文本 | `--text-secondary` / `--text-muted` |
| `#89b4fa` | 强调/链接 | `--brand-500` |
| `#f38ba8` | 错误 | `--accent-rose` |
| `#a6e3a1` | 成功 | `--accent-emerald` |
| `#f9e2af` | 警告 | `--accent-amber` |

涉及组件：NewProjectDialog、ModuleFromBswmdPicker、BswmdPickerDialog、ConfirmDialog、ConfirmDialog2、CascadeConfirmDialog、RemoveModuleConfirmDialog、XlsxBatchWizard、DbcImportWizard、OdxViewer、DiagnosticExtractSuccessDialog、PromptDialog、ErrorViewerModal。

### 3.4 删除清单

- `.dark .enum-editor`（EnumEditor.css:30,41）、`.dark .boolean-editor`（BooleanEditor.css:30）——无 toggle 逻辑，永不命中
- ParamEditor.tsx 24 处 `dark:` 变体 + `index.html` body 的 `dark:bg-slate-900 dark:text-slate-50`
- 53 处 `/* --color-xxx */` 计划注释（变量落地后注释失去意义）

### 3.5 防回潮

- stylelint 规则禁裸 hex/rgb/rgba（`declaration-property-value-disallowed-list` 或自定义规则），`tokens.css` 自身豁免；进 CI lint 阶段

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
- **空状态引导**：主区 `Parameter editor` 空态从一行灰字改为居中的引导面板（图标 + 「从左侧树选择元素开始编辑」+ `打开项目` / `新建项目` 按钮，复用 header 已有 action）
- **保存按钮层级**：`保存` 主按钮（dirty 时 `--accent-amber` 底 + pulse 动效，reduced-motion 时静态高亮）；`保存项目` / `全部保存` 收进该按钮右侧的下拉溢出

## 5. P3 Dock 工作台（详细设计）

### 5.1 技术选型

**dockview**（mathuo/dockview）：MIT、React 一等支持、TS 原生、zero-deps（~40kb gz）、活跃维护。拖拽换位 / tab 合并分组 / split / 布局序列化齐备。

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
  readonly component: ComponentType;
  readonly titleKey: string;      // i18n key
  readonly defaultGroup: 'left' | 'center' | 'bottom' | 'viewer';
}
```

首批 7 面板：`project-files`（现左面板 3 tab 容器）、`arxml-tree`、`param-editor`、`script-panel`、`validation`、`dbc-viewer`、`odx-viewer`。

### 5.4 默认布局与持久化

- 默认布局序列化 JSON **等价当前布局**：左 ~30%（`project-files` + `arxml-tree` tab 组）、右 `param-editor`、`script-panel` 收底部默认折叠——**用户升级无感**为验收标准（截图对比）
- 持久化：`dockview.serialize()` → localStorage key `autosarcfg.layout.v1`；含 `version` 字段
- 恢复策略：JSON 解析失败 / version 不匹配 / 引用了已删除面板 id → 静默回退默认布局（不阻塞启动，console.warn 一次）

### 5.5 react-resizable-panels 退役

- P3 期间共存：dock 面板内部仍可用旧 split（ParamEditor 内部布局不动）
- P4 全部面板迁移完后移除依赖（`workspace-resize-h` 等既有 e2e 选择器随 P4 更新）

### 5.6 P3 测试

- 单测：布局序列化/恢复（含坏数据、version 漂移、未知面板 id 回退）
- e2e：拖 tab 换组 + reload 恢复（镜像 `workspace-resize.spec.ts` 模式）；默认布局 vs 现布局截图等价

## 6. P4 IA 重组（详细设计）

- 左面板 3 tab（项目 / 文件 / 验证）拆为 3 个独立 dock 面板，默认仍组在同一 tab 组——观感与现状一致，能力上各自可拖出/关闭/换位
- `arxml-tree` 从 LeftPanel 内部独立成面板（LeftPanel 壳退役）
- DBC / ODX viewer 归组为统一 `viewer` tab 组（打开 viewer 时加入该组而非弹层）
- 验证联动：ValidationPanel 点击问题项 → 树选中对应节点 + ParamEditor 滚动定位（走既有 `selectedPath` store 通道，不新增状态）
- 迁移约束：每 surface 只做「组件包装 + title i18n 接入」，不改内部逻辑与 props 契约

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
