# claude-AutosarCfg v1.6.0 Cluster U — Keyboard-First Power User Design

**Date**: 2026-06-21
**Author**: spec writer agent (Cluster U of v1.6.0 roadmap)
**Status**: DRAFT (待 user 拍板 Q1-Q9)
**Type**: New feature (MINOR bump, gated by `experimental.keyboardFirst` feature flag, default OFF)
**Source brainstorm memory**: [[claude-AutosarCfg-v1-6-brainstorm]] — Cluster U locked at v1.6.0, 2-3 wks, ship at feature freeze
**Reuses**: [[sprint-14-v1-3-0-shipped]] Script Engine (v1.3.0) — `runScript` IPC for Cmd-K "Run Script" entry
**Next milestone**: Sprint 14 #2 follow-up (mutation replay polish) or v1.7.0 brainstorm

---

## 0. Why Cluster U

v1.5.1 SHIPPED 2026-06-21 with Foundation layer (no user-visible features). v1.6.0 ships 3 clusters end-to-end; Cluster U is the keyboard-first UX layer that turns claude-AutosarCfg into a "VS Code-quality" tool for AUTOSAR power users.

Brainstorm flagged 3 Cluster U pain points:

1. **老 AUTOSAR 工程师不摸鼠标** — EB tresos / Vector / Artop 都是鼠标流, 50+ 容器树点起来手酸
2. **Screen reader 用户** — 当前 dialog-heavy UI 对 a11y 不友好, 键盘可达性差
3. **Power user 录制 macro** — 没有 Cmd-K / 脚本入口, 只能一遍遍点击同样的流程

**In scope (v1.6.0 Cluster U)**:

- **Cmd-K / Ctrl-K** command palette (VS Code / Sublime 风格入口)
- **50+ keyboard shortcuts** 覆盖 File / Edit / View / Navigate / Selection / Tree / Script / ECUC / Window / Help
- **Cheat sheet** "?" 弹窗 (可发现性)
- **菜单 / hover 提示** 显示 shortcut
- **a11y 焦点环 + screen reader** 支持
- **i18n shortcut label** (zh-CN + en, ≥ 60 个 key)
- **Feature flag** `experimental.keyboardFirst` 默认 OFF

**Out of scope (v1.7.0+)**:

- **Vim mode / emacs mode** (deferred to v1.7.0+ brainstorm)
- **Mouse gesture** (deferred)
- **Macro recording** (Cluster U 复用 v1.3.0 Script Engine 即可实现录制, 但 v1.6.0 只暴露 "Run Script" 入口)
- **Custom keybinding per user** (deferred to v1.7.0+)
- **Multi-window keybinding 重映射** (Electron menu accelerator 已经覆盖)

---

## 1. User Stories

### US-1: 老 AUTOSAR 工程师不摸鼠标

**Persona**: 老陈, 15 年 AUTOSAR 经验, 调试 Com / ComM / PduR 链路时, 每天操作 200+ 容器, 手腕酸。

**场景**: 老陈打开 EB tresos master 12 MiB 项目, 在 Container 树里跳到 `ComChannel/ComIPdu/ComTxIPdu/PduR/PduRRoutingPath`, 加一个 `CanIf`, 改 `CanIfTxPduCfg` 的 `CanIfTxPduBufferRef`。

**Before Cluster U**: 点 5 层树 → 右键 → Add Container → 填 shortName → 找到新容器 → 滚到 PduRRoutingPath → 选中 → 点 param editor → 改 3 个数值 → 保存。

**After Cluster U**:

1. `Cmd-K` 打开 palette → 输入 "jump" → 选 "Jump to Container" → 输入路径 → Enter (15s 完成)
2. `Cmd-K` → "add container" → Enter (弹出 AddContainerDialog, 已聚焦 shortName) → 填名 → Enter
3. `Cmd-K` → "edit parameter" → 输入 param 名 → Enter (跳到 ParamEditor)
4. `Cmd-S` 保存

**Acceptance**: 完成同样操作, 鼠标点击次数从 ~15 → 0; 总耗时从 ~45s → ~12s。

### US-2: Screen reader 用户

**Persona**: 小林, NVDA 用户, 在 OEM 内部工具团队负责模板评审。

**场景**: 小林打开 v1.5.0 的 UI, 想找一个参数, 屏幕阅读器读出 50+ 不可聚焦的 div, 没有 ARIA label, 没有键盘可达性。

**Before Cluster U**: 不可用 — 几乎所有菜单 / dialog 都没有 aria 属性, focus trap 不全, 焦点环不可见。

**After Cluster U**:

1. `Tab` 顺序清晰 (AppHeader → LeftPanel → Centre → RightPanel → StatusBar)
2. 每个 shortcut `aria-keyshortcuts="Ctrl+K"` 标在 menu 项上
3. Palette 打开时 focus 自动跳到 input, 关闭 focus 还原
4. Cheat sheet 用 `<dialog>` 原生元素, focus trap + Esc 关闭
5. 每个命令都标 `aria-label`, 例如 "Add Container to Selection"

**Acceptance**: NVDA 读出 "Command Palette, search input, edit, type to search", 焦点移动有 announce。

### US-3: Power user 录制 macro (via v1.3.0 Script Engine 复用)

**Persona**: 阿丽, Tier1 集成工程师, 每周要给 30 个 ECU 模板做相同的 ECUC 初始化 (设默认值 + 加 5 个容器 + 改 10 个 param)。

**场景**: 阿丽第 1 次手动操作时, 打开 Script Editor (v1.3.0 已 ship), 边操作边写 JS 脚本 (ctx.log + ctx.project API)。

**After Cluster U**:

1. 阿丽用 50+ shortcut 完成操作 (Cmd-K Add Container → Cmd-K Edit Parameter → Cmd-S)
2. 她把每个操作的"script 版本"写到一个新 `bootstrap.js` 脚本里
3. `Cmd-K` → "Run Script" → 选 `bootstrap.js` → Enter → 跑完 30 个 ECU
4. 下次新 ECU: `Cmd-K` → "Run Script" → Enter (5s 完成)

**Acceptance**: 30 个 ECU 初始化从 ~2 小时 → ~5 分钟; 阿丽不再需要鼠标。

---

## 2. Decisions Locked (Q1-Q9)

| #                             | Question                               | Answer                                                                                           | Why                                                                                                 |
| ----------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Q1                            | Cmd-K 触发条件                         | **A — Global** (无 focus 限制, 任何时候 Cmd-K 都开 palette)                                      | VS Code / Sublime 行为; power user 心智模型                                                         |
| Q2                            | Shortcut 跨平台差异                    | **A — isMac 区分** (`Cmd` vs `Ctrl`), 单一定义 + 自动 normalize                                  | 一份 schema, 运行时检测; Windows / Mac 用户分别看到 "Ctrl" / "Cmd" 标签                             |
| Q2a (was `Mod+Shift+P` 冲突)  | Script Editor vs Add Parameter binding | **A — `Mod+Shift+P` 留 Script Editor (高频), Add Parameter remap `Mod+Alt+I`**                   | 警告, plan 阶段拆分 (Q3 原选项)                                                                     |
| Q3                            | Shortcut 冲突解决                      | **B — 警告但不阻断**, 把冲突列表写到 `console.warn` (dev mode only)                              | Cluster U 是渐进引入, 不应该 hard-block; 后续 plan 阶段 user 拍板                                   |
| Q4                            | Cheat sheet 触发键                     | **A — `?`** (Shift+/) 全局可触 (除输入框内)                                                      | VS Code / GitHub / Slack 都用 `?`                                                                   |
| Q5                            | Palette 入口冲突 Cmd-K                 | **C — 默认 OFF**, feature flag 开启后才暴露; 菜单 File → "Toggle Command Palette" 也可触发       | 防止破坏既有 "Find" / "Quick Open" 用户习惯; ON 后仍是 single source of truth                       |
| Q6                            | Multi-cursor 优先级                    | **C — Defer to v1.7.0**, 不在本 sprint 实现 multi-cursor selection                               | 50+ shortcut 已经覆盖大部分 flow; multi-cursor 主要服务 CodeMirror 文本编辑, AUTOSAR 树形操作场景少 |
| Q6a (was feature flag naming) | Feature flag 命名                      | **A — `experimental.keyboardFirst`**                                                             | 与 W/A+C/G 统一 + v1.5.1 `experimental.streaming`/`experimental.indexedDb` 一致                     |
| Q7                            | 50+ shortcut 是否全部可配置            | **A — Hardcoded in v1.6.0**, user-level override 推到 v1.7.0                                     | YAGNI; 90% 用户不会重映射; plan 阶段考虑抽出 `keymap.json` config scaffold                          |
| Q8                            | 屏幕阅读器优先级                       | **A — WCAG 2.2 AA** (基础), 不强求 AAA                                                           | 行业 baseline; cheat sheet / palette 都标 `role="dialog"` `aria-modal="true"`                       |
| Q9                            | 复用 v1.3.0 Script Engine 边界         | **A — 只复用 `runScript` IPC + Script Sandbox**, 不复用 CodeMirror 编辑器 (palette 自己用 input) | Cmd-K "Run Script" 入口调用 `useScriptStore.runScript`; 不重复造 sandbox                            |

---

## 3. Architecture & Components

### 3.1 模块图 (新增 / 复用 / 不变)

```
src/renderer/                                          src/main/                src/shared/
├── components/
│   ├── CommandPalette/         ← NEW
│   │   ├── CommandPalette.tsx           # 主组件 (dialog + list + input)
│   │   ├── CommandPalette.css           # 样式 (focus ring, modal)
│   │   ├── useCommandPalette.ts         # hook: open/close/filter/execute
│   │   ├── CommandItem.tsx              # 单条命令渲染
│   │   ├── CheatSheet.tsx               # ? 弹窗
│   │   └── index.ts                     # barrel
│   │
│   ├── ShortcutRegistry/       ← NEW
│   │   ├── ShortcutRegistry.ts          # 不可变 Map<keys, Command[]>
│   │   ├── KeymapProvider.tsx           # Context: 提供 shortcut 解析
│   │   ├── normalizeKey.ts              # Mac Cmd 自动 → Ctrl 等价
│   │   └── __tests__/                   # 单元测试 (冲突检测 / normalize)
│   │
│   ├── ScriptPanel/            ← 复用 v1.3.0 (不变)
│   │   └── ScriptPanel.tsx              # Cmd-K "Run Script" 入口打开它
│   │
│   └── AppHeader.tsx           ← MODIFIED (加 aria-keyshortcuts)
│
├── hooks/
│   ├── useShortcut.ts          ← NEW (绑定 keydown → 命令)
│   ├── useFocusTrap.ts         ← NEW (palette focus trap)
│   └── useScriptActions.ts     ← 复用 v1.3.0 (palette "Run Script" 调用)
│
├── store/
│   ├── useArxmlStore.ts        ← 不变
│   └── useScriptStore.ts       ← 复用 v1.3.0 (runScript action)
│
├── config/
│   ├── shortcuts.ts            ← NEW (50+ shortcut 静态定义)
│   └── featureFlags.ts         ← MODIFIED (加 experimental.keyboardFirst field)
│
└── App.tsx                     ← MODIFIED (mount CommandPalette + KeymapProvider)

                              ┌──────────────────────┐
                              │   window.autosarApi   │ ← 复用 v1.3.0 IPC
                              │   .runScript(...)     │
                              └──────────────────────┘
```

**关键不重复造**: Cluster U **不实现** script sandbox / vm-runner / CodeMirror 编辑器; 只调用 `useScriptStore.runScript` 跳到 ScriptPanel。

### 3.2 数据流 (Cmd-K 触发 → 执行)

```
用户按 Cmd-K (keydown)
     │
     ▼
[useShortcut] 监听 window keydown
     │ (匹配 Cmd+K shortcut)
     ▼
[ShortcutRegistry.lookup] → Command { id: 'cmd-palette.open' }
     │
     ▼
[CommandPalette.open()]    ← zustand state
     │
     ▼
[CommandPalette.tsx] 渲染 <dialog open>
     │ (autofocus on input)
     ▼
用户输入 "jump" → 过滤 Command[]
     │
     ▼
用户按 Enter → [CommandPalette.execute(selectedCommand)]
     │
     ├─ 内置命令: 直接调用 useArxmlStore action
     ├─ "Run Script": useScriptStore.runScript(id) + 打开 ScriptPanel
     ├─ "Open Cheat Sheet": 打开 CheatSheet.tsx
     └─ "Toggle Panel": 修改 uiSlice state
```

### 3.3 Shortcut 解析优先级

```
keydown event
     │
     ▼
[normalizeKey] → 'Ctrl+K' / 'Cmd+K' → 标准化为 'Mod+K' (Mod = Mac Cmd / Win Ctrl, via `process.platform` 直读, no extra IPC — see §6.4 + §10.0 Q4/Q10 RESOLVED)
     │
     ▼
[ShortcutRegistry.lookup('Mod+K')]
     │
     ▼
返回第一条命中 (单 shortcut 不应冲突, 多冲突按声明顺序)
     │
     ▼
[CommandContext.match] 检查 when 条件 (e.g. when="editorFocused")
     │
     ▼
不匹配 → 跳过 (允许 key bubble 给原生处理)
     │
     ▼
匹配 → execute(command)
```

### 3.4 Help menu wiring (cross-cluster IPC consumer)

Cluster U ships the UI surface for cross-cluster IPC consumers. Specifically:
U §11 wires the "Help → Reset onboarding" AppHeader menu entry to W's `tour:reset`
IPC channel. Wave order: **W PR(W-1) ships `tour:reset` first, U PR(U-5) consumes**.
Source: W spec §3.2 (`tour:reset` IPC handler definition) + W peer reviewer H3 +
U peer reviewer H3 cross-confirmed (synthesizer-report H5).

- AppHeader Help menu adds entry "Reset onboarding tour"
- Click invokes `window.autosarApi.invoke('tour:reset')` (renderer → main IPC)
- Main process clears persisted tour state (`<userData>/tour.json`)
- Welcome card reappears on next boot (W §3.1 reset transition)
- Shortcut: `Mod+Shift+R` (registered in §5.2 Help category)
- New file: `src/renderer/components/AppHeader/ResetOnboardingMenuItem.tsx` (~30 LOC, see §11.1)

**No new IPC handler in Cluster U** — U only consumes the existing `tour:reset`
channel defined by W. i18n key: `help.menu.resetOnboarding` (added to U §12.1).

---

## 4. API / Interface Contract

### 4.1 Shortcut schema

```typescript
// src/renderer/config/shortcuts.ts

import type { ScriptSummary } from '@main/script/types';

/** 跨平台抽象的修饰键。运行时映射到 Cmd (Mac) / Ctrl (Win/Linux)。 */
export type ModifierToken = 'Mod' | 'Shift' | 'Alt';

/** 单个 key (字母 / 数字 / 符号 / 命名键)。例: 'K', '/', 'Enter', 'Escape', 'F5'。 */
export type KeyToken = string;

/** Shortcut 字符串语法: 'Mod+K', 'Mod+Shift+P', '?', 'F5'。Mod = Meta/Win/Cmd 自动映射。 */
export type ShortcutBinding = string;

/** 命令执行上下文 (含 focus 状态 + selected nodes)。 */
export interface CommandContext {
  readonly activeElement: HTMLElement | null;
  readonly hasOpenProject: boolean;
  readonly hasSelection: boolean;
  readonly focusedArea: 'tree' | 'editor' | 'script' | 'palette' | 'cheatsheet' | 'other';
}

/** Command 定义 — 可由 palette 或 shortcut 触发。 */
export interface Command {
  /** 唯一 ID, e.g. 'file.open', 'ecuc.addContainer', 'script.run'。 */
  readonly id: string;
  /** 用户面向 label, i18n key — 渲染时通过 t(locale, labelKey) 取本地化字符串。 */
  readonly labelKey: string;
  /** 简短描述 (副标题 / tooltip), 可选 i18n key。 */
  readonly descriptionKey?: string;
  /** 类别: 'file' | 'edit' | 'view' | 'navigate' | 'selection' | 'tree' | 'script' | 'ecuc' | 'window' | 'help' */
  readonly category: CommandCategory;
  /** 静态绑定的 shortcut 列表 (第一个生效)。 */
  readonly bindings: readonly ShortcutBinding[];
  /** 上下文门: undefined = 全局; 否则只在 when() === true 时触发。 */
  readonly when?: (ctx: CommandContext) => boolean;
  /** 执行函数 — 纯函数, 通过 store action 操作。 */
  readonly run: (ctx: CommandContext) => void | Promise<void>;
}

export type CommandCategory =
  | 'file'
  | 'edit'
  | 'view'
  | 'navigate'
  | 'selection'
  | 'tree'
  | 'script'
  | 'ecuc'
  | 'window'
  | 'help';

/** Palette 渲染用 — Command 的派生数据。 */
export interface PaletteEntry {
  readonly command: Command;
  readonly label: string; // t(locale, command.labelKey)
  readonly description: string; // t(locale, command.descriptionKey) ?? ''
  readonly bindingsDisplay: readonly string[]; // 格式化后 ['⌘K', 'Ctrl+K']
  readonly matched: readonly string[]; // fuzzy 匹配高亮段
}
```

### 4.2 ShortcutRegistry API

```typescript
// src/renderer/components/ShortcutRegistry/ShortcutRegistry.ts

export class ShortcutRegistry {
  /** 不可变更新 — 返回新 instance, 不 mutate 内部 Map。 */
  register(command: Command): ShortcutRegistry;
  registerAll(commands: readonly Command[]): ShortcutRegistry;
  /** 移除 (同样不可变)。 */
  unregister(id: string): ShortcutRegistry;

  /** 解析 keydown → 命中 Command (考虑 when 条件); 无命中返回 null。 */
  lookup(event: KeyboardEvent, ctx: CommandContext): Command | null;

  /** 所有命令 (按 category 排序)。用于 palette + cheat sheet。 */
  all(): readonly Command[];

  /** 检测冲突 — 返回共享同一 binding 的 command id 对。 */
  detectConflicts(): readonly {
    readonly ids: readonly [string, string];
    readonly binding: ShortcutBinding;
  }[];

  /** 按 category 分组 — cheat sheet 用。 */
  byCategory(): ReadonlyMap<CommandCategory, readonly Command[]>;
}
```

**Immutability 强制** (per `common/coding-style.md`): 内部 `Map<string, Command[]>` 全部 `ReadonlyMap`, register/unregister 用 spread 重建。

### 4.3 CommandPalette API

```typescript
// src/renderer/components/CommandPalette/useCommandPalette.ts

export interface CommandPaletteState {
  readonly open: boolean;
  readonly query: string;
  readonly selectedIndex: number;
  readonly entries: readonly PaletteEntry[];
}

export interface CommandPaletteApi {
  /** 打开 palette, 可选预填 query (e.g. '>' for script mode)。 */
  open(prefill?: string): void;
  /** 关闭 + 清空 query + 还焦点到 activeElement (打开前)。 */
  close(): void;
  /** 切换开 / 关。 */
  toggle(): void;
  /** 更新 query (filter 重新计算, selectedIndex 重置为 0)。 */
  setQuery(query: string): void;
  /** 执行当前 selectedIndex 条目; 关闭 palette。 */
  executeSelected(): Promise<void>;
  /** 上下移动 selectedIndex。 */
  moveSelection(delta: 1 | -1): void;
}
```

### 4.4 IPC 集成 (复用 v1.3.0)

**Cluster U 不新增 IPC handler** — 完全复用 v1.3.0 `runScript` IPC contract:

```typescript
// v1.3.0 (复用) — src/shared/types.ts
export interface ScriptRunRequest {
  readonly projectId: string;
  readonly id: string;
  readonly timeoutMs?: number;
}

export interface ScriptRunResponse {
  readonly runId: string;
  readonly status: 'success' | 'runtime-error' | 'import-error';
  readonly logs: readonly ScriptLog[];
  readonly violations: readonly ScriptViolation[];
  readonly mutations: readonly ScriptMutation[];
  readonly durationMs: number;
  readonly errorMessage?: string;
}
```

**Cmd-K "Run Script" 流程**:

1. palette 输入 "run script" → 选中 "script.run" 命令
2. 命令触发 `useScriptStore.runScript(selectedScriptId, timeoutMs)`
3. 该 action 调 `window.autosarApi.runScript(req)` (v1.3.0 IPC)
4. palette 关闭, ScriptPanel 自动显示 run result

### 4.5 CheatSheet 数据源

```typescript
// src/renderer/components/CommandPalette/CheatSheet.tsx

export interface CheatSheetSection {
  readonly category: CommandCategory;
  readonly categoryLabelKey: string;
  readonly items: readonly {
    readonly commandId: string;
    readonly label: string;
    readonly bindingsDisplay: readonly string[];
  }[];
}

export interface CheatSheetApi {
  /** 打开 cheat sheet (按 '?' 全局触发, 除输入框内)。 */
  open(): void;
  close(): void;
  toggle(): void;
}
```

---

## 5. Data Model

### 5.1 核心类型

| 类型                | 文件                                                        | 字段摘要                                                        |
| ------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| `Command`           | `src/renderer/config/shortcuts.ts`                          | id, labelKey, descriptionKey?, category, bindings[], when?, run |
| `CommandContext`    | `src/renderer/config/shortcuts.ts`                          | activeElement, hasOpenProject, hasSelection, focusedArea        |
| `ShortcutBinding`   | `src/renderer/config/shortcuts.ts`                          | `string` (`'Mod+K'`, `'?'`, `'F5'`)                             |
| `ModifierToken`     | `src/renderer/config/shortcuts.ts`                          | `'Mod' \| 'Shift' \| 'Alt'`                                     |
| `PaletteEntry`      | `src/renderer/components/CommandPalette/CommandPalette.tsx` | command, label, description, bindingsDisplay, matched           |
| `CheatSheetSection` | `src/renderer/components/CommandPalette/CheatSheet.tsx`     | category, categoryLabelKey, items[]                             |

### 5.2 50+ shortcut 候选清单 (待 plan 阶段 user 拍板)

| Category           |  Count | Shortcuts (含 binding 建议)                                                                                                                                                                                                                                                                       |
| ------------------ | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **File** (5)       |      5 | `Mod+O` Open · `Mod+S` Save · `Mod+Shift+S` Save As · `Mod+W` Close · `Mod+R` Recent                                                                                                                                                                                                              |
| **Edit** (7)       |      7 | `Mod+Z` Undo · `Mod+Shift+Z` Redo · `Mod+X` Cut · `Mod+C` Copy · `Mod+V` Paste · `Mod+F` Find · `Mod+H` Replace                                                                                                                                                                                   |
| **View** (5)       |      5 | `Mod+B` Toggle Left Panel · `Mod+J` Toggle Right Panel · `Mod+=` Zoom In · `Mod+-` Zoom Out · `Mod+0` Reset Zoom                                                                                                                                                                                  |
| **Navigate** (3)   |      3 | `F12` Go to Definition · `Shift+F12` Go to Reference · `Mod+P` Focus Search (Quick Open)                                                                                                                                                                                                          |
| **Selection** (5)  |      5 | `Mod+A` Select All · `Mod+Shift+Right` Expand Selection · `Mod+Shift+Left` Shrink Selection · `Mod+Alt+Up` Multi-cursor Above · `Mod+Alt+Down` Multi-cursor Below                                                                                                                                 |
| **Tree** (5)       |      5 | `Mod+Shift+E` Reveal Active · `Mod+K Mod+0` Collapse All · `Mod+K Mod+J` Expand All · `Alt+Left` Jump to Parent · `Alt+Right` Jump to First Child                                                                                                                                                 |
| **Script** (4)     |      4 | `Mod+Shift+P` Open Script Editor _(Script Editor 专用, 高频, 不 remap)_ · `Mod+K` then "Run Script" (Cmd-K entry) · `Mod+S` (in ScriptPanel) Save Script · `Shift+Alt+F` Format Script                                                                                                            |
| **ECUC** (5)       |      5 | `Mod+I` Add Container · `Mod+Backspace` Delete Container · `Mod+D` Duplicate Container · `Mod+Alt+I` Add Parameter _(替代原 `Mod+Shift+P` 冲突键, 2026-06-21 锁定)_ · `Enter` Edit Parameter                                                                                                      |
| **Window** (3)     |      3 | `Mod+Shift+N` New Window · `Mod+Shift+W` Close Window · `Mod+1/2/3` Focus Panel                                                                                                                                                                                                                   |
| **Help** (3)       |      3 | `?` Show Cheat Sheet · `F1` Show Docs · `Mod+Shift+R` Help → Reset onboarding _(tour reset, IPC `tour:reset` — 跨 cluster W, 见 §3.4)_                                                                                                                                                            |
| **Palette** (1)    |      1 | `Mod+K` Toggle Command Palette                                                                                                                                                                                                                                                                    |
| **Validation** (4) |      4 | `F8` Next validation error · `Shift+F8` Previous validation error · `Mod+Shift+V` Toggle ValidationPanel _(visible/hidden)_ · `Mod+Shift+E` Focus ValidationPanel _(a11y WCAG 2.2 AA 必需)_ — **G cluster 集成, 依赖 `experimental.swsValidator` flag** (G spec §3 ValidationPanel bottom-docked) |
| **TOTAL**          | **51** | (满足 ≥ 50 门槛; 47 v1.5.1 candidates + 1 Help `Mod+Shift+R` E4 + 3 net Validation changes: F8 + Shift+F8 moved out of Navigate → into Validation with 2 new Mod+Shift+V / Mod+Shift+E; net +2 from Help/E4)                                                                                      |

**Validation category 集成细节 (G cluster)**:

- 4 shortcuts 都接 G spec §3 ValidationPanel (bottom-docked component); 事件经 `useSwsValidatorStore` (G spec §4.5 store)
- **a11y strategy**: `Mod+Shift+E` Focus ValidationPanel 是 WCAG 2.2 AA 必需 (success criterion 2.1.1 Keyboard + 2.4.7 Focus Visible) — 焦点跳到 panel 内第一个 focusable element (rule list 第一个 row)
- **Gate condition**: 4 shortcuts 仅在 `experimental.swsValidator` flag ON 时才 register; flag OFF → 4 shortcut 静默 no-op (不弹 toast, 不 warn), 与 §6.4 flag-OFF zero-overhead 一致
- **G spec 引用**: ValidationPanel UI 实现 / `useSwsValidatorStore` API / focus 顺序约定 都在 G spec §3 + §4.5; U 仅 consume surface API (不 import G 内部)

**Binding 冲突清单 (预检)**:

- ~~`Mod+Shift+P` 同时绑到 "Open Script Editor" 和 "Add Parameter"~~ — **RESOLVED 2026-06-21 (Q2)**: Script Editor (高频) 保留 `Mod+Shift+P`; Add Parameter remap 到 `Mod+Alt+I` (per synthesizer-report H4)
- `Mod+S` 在主窗口绑 "Save Project", 在 ScriptPanel 绑 "Save Script" — 用 `when: ctx => ctx.focusedArea === 'script'` 区分
- `Mod+Shift+E` 同时绑到 Tree 类的 "Reveal Active" 和 Validation 类的 "Focus ValidationPanel" — 用 `when: ctx => ctx.focusedArea === 'tree' || focusedArea === 'other'` 区分 (Tree reveal 在 tree focus 时; Validation focus 在其他 focus 时) — 2026-06-21 锁定

### 5.3 状态位置

| 数据                                                    | 位置                                           | 理由                                           |
| ------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| `Command[]` 静态列表                                    | `src/renderer/config/shortcuts.ts` 常量        | 全局只读, 不需要 store                         |
| `ShortcutRegistry` 实例                                 | `KeymapProvider` Context                       | 跨组件共享; 不可变, 单例                       |
| `paletteOpen` / `paletteQuery` / `paletteSelectedIndex` | zustand `useUiStore` 新增 (或复用现有 uiSlice) | palette 单实例, 全局可见                       |
| `cheatSheetOpen`                                        | zustand `useUiStore` 新增                      | 同上                                           |
| `focusedArea` 推导                                      | `KeymapProvider` 监听 focus/blur, 不存 store   | 派生数据, 不入 store (per `react/patterns.md`) |

---

## 6. Error Handling

### 6.1 Shortcut 冲突

```typescript
export type ShortcutConflictWarning = {
  readonly kind: 'conflict';
  readonly binding: ShortcutBinding;
  readonly commandIds: readonly [string, string];
};

// dev mode only — 写入 console.warn, 不抛错
if (process.env.NODE_ENV === 'development') {
  for (const c of registry.detectConflicts()) {
    console.warn(
      `[shortcut-registry] binding "${c.binding}" is bound to multiple commands: ${c.ids.join(', ')}`,
    );
  }
}
```

- **Q3 决策**: 警告但不阻断 — 避免 hard-block 引入期; plan 阶段考虑把 warnings 写到 telemetry
- **运行时**: 第一个声明的 command 生效, 后注册的 silent-skip

### 6.2 Command palette 无结果

```typescript
// src/renderer/components/CommandPalette/CommandPalette.tsx
{entries.length === 0 && (
  <div className="command-palette__empty" role="status" aria-live="polite">
    {t(locale, 'commandPalette.noResults')}  {/* "无匹配命令" / "No matching commands" */}
  </div>
)}
```

- aria-live=polite 让 screen reader 朗读
- 不抛错, 不弹 toast

### 6.3 Script 执行失败 (复用 v1.3.0)

完全复用 v1.3.0 错误处理 — Cmd-K "Run Script" 调 `useScriptStore.runScript`, 该 action 已有:

- IPC error → `runResult.status = 'runtime-error'`, `errorMessage` 字段
- import error → `'import-error'`
- runtime error → `'runtime-error'`
- ScriptPanel 已经渲染这些错误; palette 关闭后 ScriptPanel 自动可见

**Cluster U 不引入新的 script 错误类型**, 不修改 v1.3.0 error matrix。

### 6.4 Feature flag 未开启

```typescript
// src/renderer/components/CommandPalette/KeymapProvider.tsx
export function KeymapProvider({ children }: { children: ReactNode }): JSX.Element {
  const enabled = isExperimentalKeyboardFirstEnabled();
  if (!enabled) {
    // 早期 return — 不挂 window keydown listener, palette 不渲染
    return <>{children}</>;
  }
  // ... 注册 listener + 提供 context
}
```

- Feature flag OFF 时: **零开销** — listener 不挂, palette 不 mount
- 用户手动开启: 写 `settings.json` 加 `"experimental": { "keyboardFirst": true }`
- 与 v1.5.1 `experimental.streaming` / `experimental.indexedDb` flag 命名风格保持一致 (W/A+C/G 也使用 `experimental.<camelCase>`)

### 6.5 a11y 焦点异常

- palette 打开时: `previousActiveElement = document.activeElement`, 关闭时 `previousActiveElement.focus()`
- focus trap: Tab 在 palette 内循环 (`useFocusTrap` hook)
- Esc 关闭 palette (binding: `Escape`)
- 焦点环可见: `:focus-visible` outline `2px solid var(--color-accent)` (复用现有 design token)

### 6.6 TourIpcContract type (cross-cluster consumer — W §3.2)

`ResetOnboardingMenuItem.tsx` consumes a preload-bridge-injected `TourIpcContract`. Cluster U **does not own** the IPC channel — W §3.2 defines `tour:reset` handler. U only consumes the typed bridge.

```typescript
// 来自 preload bridge (W §3.2 + §2.6 ownership)
interface TourIpcContract {
  /** Triggers W store action `tourReset()`; clears <userData>/tour.json; W re-renders welcome card on next boot. */
  reset(): Promise<void>;
  /** Returns current W TourState (idle | running | dismissed | completed | suppressed). */
  getState(): Promise<TourState>;
  /** Subscribes to TourState changes. Returns unsubscribe function (idempotent). */
  onStateChange(cb: (state: TourState) => void): () => void;
}

type TourState = 'idle' | 'running' | 'dismissed' | 'completed' | 'suppressed';
```

**Wiring** (additive — does NOT change §4.4 or §11.2):

- `ResetOnboardingMenuItem.tsx` receives `tourIpc: TourIpcContract` as a prop
- `AppHeader.tsx` (parent) gets `tourIpc` from `window.autosarApi.tour` (preload-bridge object defined by W §2.6 / §3.2)
- `tourIpc.reset()` is the only method U calls on click
- Failure path: if `tourIpc.reset()` rejects → catch + `console.warn('[tour] reset failed:', err)` + keep menu enabled (user can retry). No toast (W owns toast UI per W §3.2 reset transition).

**Why this contract is additive**: U does not extend the IPC channel name, payload, or return shape. The contract is a renderer-side type wrapper that mirrors the W-defined IPC schema (documented in W §3.2) for compile-time safety. Plan-stage assigns the `window.autosarApi.tour` object in `src/preload/index.ts` (1 bridge-line addition, owned by W PR(W-1)).

---

## 7. Testing Strategy

### 7.1 单元测试 (vitest)

| 模块                          | 测试数 | 覆盖场景                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------- | -----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ShortcutRegistry.ts`         |     18 | register / unregister 不可变 / lookup 命中 / when 条件 / conflict detect / byCategory 排序 / duplicate id 抛 / empty registry                                                                                                                                                                                                                                                                       |
| `normalizeKey.ts`             |     12 | Mac Cmd → Mod / Win Ctrl → Mod / Shift+? → `?` / F5 → `F5` / 大小写归一 / 多 modifier                                                                                                                                                                                                                                                                                                               |
| `useCommandPalette.ts` hook   |      8 | open / close / toggle / setQuery 过滤 / moveSelection 边界 / executeSelected 调 command.run                                                                                                                                                                                                                                                                                                         |
| `useShortcut.ts` hook         |      6 | keydown 命中 → 调 command / 没命中 → 不阻止默认 / when false → 不触发 / unmount 取消 listener                                                                                                                                                                                                                                                                                                       |
| `useFocusTrap.ts` hook        |      4 | Tab 在末元素 → 跳回首 / Shift+Tab 在首元素 → 跳到尾 / 外部 focus → 拉回 / unmount 清理                                                                                                                                                                                                                                                                                                              |
| `config/shortcuts.ts` (静态)  |      5 | 50+ 条目 / 全部 category 有 label / 无空 binding / 无空 run / conflict 数 ≤ 5                                                                                                                                                                                                                                                                                                                       |
| `ResetOnboardingMenuItem.tsx` |      3 | **visible-when-enabled**: project open + `experimental.keyboardFirst` flag ON → menu item rendered with i18n label `help.menu.resetOnboarding`. **click-dispatches-ipc**: user clicks → `tourIpc.reset()` called exactly once → returns resolved Promise. **hidden-when-no-project**: no project open OR flag OFF → menu item NOT rendered (query `getByText(/reset onboarding/i)` returns 0 hits). |
| **小计**                      | **56** |                                                                                                                                                                                                                                                                                                                                                                                                     |

### 7.2 集成测试 (vitest + jsdom)

| 场景                                          | 测试数 | 内容                                                                                       |
| --------------------------------------------- | -----: | ------------------------------------------------------------------------------------------ |
| AppHeader menu 显示 shortcut                  |      2 | `aria-keyshortcuts="Ctrl+O"` 渲染 / hover tooltip 显示                                     |
| Cmd-K 打开 palette                            |      3 | focus 跳到 input / query 为空 / entries 全部显示                                           |
| Palette 输入过滤                              |      3 | "add" 过滤出 Add Container + Add Parameter / "run script" 过滤出 Run Script / 大小写不敏感 |
| Palette Enter 执行                            |      3 | executeSelected 调 command.run / palette 关闭 / focus 还原                                 |
| `?` 打开 cheat sheet                          |      2 | 50+ 条目按 category 分组 / Esc 关闭                                                        |
| 当输入框 focus 时 `?` 不触发 cheat sheet      |      1 | when 条件                                                                                  |
| 当 ScriptPanel 打开时 `Mod+S` 触发 saveScript |      1 | when 条件                                                                                  |
| **小计**                                      | **15** |                                                                                            |

### 7.3 E2E 测试 (Playwright)

| 流程                           | 步骤                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------- |
| **Cmd-K open + execute**       | 按 Cmd-K → palette 可见 → 输入 "add" → 按 Enter → AddContainerDialog 弹出    |
| **Save shortcut**              | 按 Ctrl+S → save project IPC 调用 (mock 验证)                                |
| **Cheat sheet open + close**   | 按 ? → cheat sheet 可见 → 按 Esc → 关闭                                      |
| **Script run via palette**     | 按 Cmd-K → "run script" → 选 "PduId validator" → ScriptPanel run result 出现 |
| **Focus restoration**          | focus 在 input → 按 Cmd-K → 关闭 → focus 回到 input                          |
| **Multi-shortcut (Mac + Win)** | 测 `process.platform === 'darwin'` / `'win32'` 两条路径下 binding 显示       |
| **A11y: NVDA 模拟**            | axe-core 扫描 palette + cheat sheet → 0 violations                           |

**E2E 至少 10 条核心 shortcut 触发断言** (Q-A acceptance criteria 之一)。

### 7.4 覆盖目标

- **纯新增代码**: ≥ 90% stmts / ≥ 80% branches (per v1.5.1 spec Q4 D 阈值)
- **总体**: ≥ 95.5% stmts / ≥ 87% branches (与 v1.5.1 baseline 一致, 不降低)
- **关键路径 100%**: palette open / close / execute / focus trap / Script run via palette

### 7.5 Round-trip / property-based

- Shortcut binding 字符串 parser: 用 fast-check 生成 1000 条 random binding, 验证 parse + serialize round-trip 稳定
- Palette fuzzy filter: 1000 条 random query, 验证结果排序稳定

### 7.6 Cross-Spec Integration Tests (U-side ownership)

Reference: A+C spec **§10.6 9-scenario cross-spec integration test matrix** (per synthesizer-report §5 H7 + Adv audit Appendix F; corrected from phantom §15.6 reference in Round 3, 2026-06-21 — A+C has no §15.6 sub-section; the cross-spec integration matrix lives at §10.6 line 767). The 9-scenario matrix enumerates cross-cluster integration tests; U cluster owns **2 scenarios directly** + 5 scenarios **partially** (U-side component only).

| #                       | Scenario                                                             | U-side component                                             | U test file                                                                                                                                                  | U status for v1.6.0                              |
| ----------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| **#6**                  | U command palette "Run Script" entry → v1.3.0 `applyScript` IPC      | Cmd-K "Run Script" command → `useScriptStore.runScript()`    | `tests/integration/v1-6-0/u-run-script.test.ts` (reuses v1.3.0 `tests/integration/script-engine.test.ts`)                                                    | **OWNED — U ships**                              |
| **#7**                  | U Cmd-S save shortcut → A+C mutate path (GUI bridge)                 | Cmd-S → `useArxmlStore.saveProject()` (existing v1.5.1 path) | n/a — **DEFER to v1.7.0**                                                                                                                                    | N/A (no A+C GUI bridge in v1.6.0 per A+C §17 Q6) |
| **#14** (U-internal #1) | U ResetOnboardingMenuItem click → W `tour:reset` IPC                 | E1 §11.1 component + §6.6 `tourIpc.reset()`                  | `src/renderer/components/AppHeader/__tests__/ResetOnboardingMenuItem.test.tsx` (3 unit cases per E1) + `tests/integration/v1-6-0/u-tour-reset.test.ts` (e2e) | **OWNED — U ships**                              |
| **#15** (U-internal #2) | U `F8` Next validation error → G ValidationPanel rule list highlight | E2 §5.2 Validation category + §10 acceptance #14             | `tests/e2e/shortcuts.spec.ts` (Playwright G-coupled)                                                                                                         | **OWNED — U ships**                              |
| **#16** (U-internal #3) | U `Shift+F8` Previous validation error → G rule list highlight prev  | E2 §5.2 + §10 #15                                            | `tests/e2e/shortcuts.spec.ts`                                                                                                                                | **OWNED — U ships**                              |
| **#17** (U-internal #4) | U `Mod+Shift+V` Toggle ValidationPanel → G panel show/hide           | E2 §5.2 + §10 #16                                            | `tests/e2e/shortcuts.spec.ts`                                                                                                                                | **OWNED — U ships**                              |
| **#18** (U-internal #5) | U `Mod+Shift+E` Focus ValidationPanel → G panel a11y focus           | E2 §5.2 + §10 #17                                            | `tests/e2e/shortcuts.spec.ts` + axe-core                                                                                                                     | **OWNED — U ships**                              |

**U-owned integration test count for v1.6.0: 6 (scenario #6 + 5 U-internal) + scenario #7 deferred**.

**Gate condition for U v1.6.0 ship**: All 6 U-owned integration tests PASS (CI) + U spec §10 acceptance #14-#17 e2e tests PASS + axe-core 0 violations on ValidationPanel focus state. Plan-stage assigns each scenario to a PR (per synthesizer-report §8 merge wave order):

- **Wave 2 (PR U-5/U-6)**: scenarios #6 + #14 ship (U self-contained)
- **Wave 3 (PR U-7 cross-spec)**: scenarios #15-#18 ship (depend on G PR(G-3) `useSwsValidatorStore` API stable)
- **v1.7.0 defer**: scenario #7 (U Cmd-S → A+C GUI bridge, requires A+C mutate IPC to renderer)

**Why this is cross-spec coordination, not U-only work**: Scenarios #15-#18 require G `useSwsValidatorStore` actions `nextError()` / `prevError()` / `togglePanel()` / `focusPanel()` to exist. G spec §4.5 commits to these actions; U spec §5.2 consumes their surface API. If G changes the action names in plan-stage, U test files must update — this is the **single cross-spec risk** in U Round 2.

---

## 8. Migration / Backward Compatibility

### 8.1 不破坏现有菜单 / 鼠标

- Cluster U **完全 parallel** — 所有现有菜单项保留鼠标点击入口
- Shortcut 是**快捷方式**, 不是替代 — 用户随时可以回到鼠标
- AppHeader 的 `aria-keyshortcuts` 属性是**纯增量** — 不修改现有 menu item 行为

### 8.2 不影响 v1.3.0 Script Engine

- 不修改 `useScriptStore` action 签名
- 不修改 v1.3.0 IPC contract
- ScriptPanel 行为不变 — palette 打开它 = 用户手动点击 ScriptPanel tab

### 8.3 不影响 v1.5.1 Foundation

- 不修改 `applyMutation` 实体化逻辑
- 不修改 `NormalizedDocument` 抽象
- 不修改 streaming / IndexedDB (那都是 OFF, Cluster U 也不依赖)

### 8.4 Feature flag 默认 OFF

- `experimental.keyboardFirst` 默认 `false` — 用户必须显式 opt-in
- 0 性能开销 (listener 不挂, palette 不 mount)
- 0 bundle 影响 (按需 import, Vite 代码分割 — palette chunk lazy loaded)

### 8.5 i18n backward compat

- 既有 25 个 script i18n key 不动
- 新增 ≥ 60 个 keyboard / palette / cheat sheet i18n key
- parity 测试 (`src/shared/__tests__/i18n.test.ts`) 自动校验 EN + zh-CN 同步

### 8.6 Help menu behavior delta (v1.5.1 → v1.6.0)

The `ResetOnboardingMenuItem` Help menu entry is **purely additive** — the existing AppHeader Help menu (containing "Documentation", "About", etc. in v1.5.1) is not modified or removed. Behavior comparison:

| State                             | v1.5.1 (before)           | v1.6.0 with flag OFF (default)             | v1.6.0 with flag ON (opt-in)                                        |
| --------------------------------- | ------------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `experimental.keyboardFirst`      | n/a (flag does not exist) | `false`                                    | `true`                                                              |
| Help → Reset onboarding menu item | n/a (item not present)    | **Not rendered** (per E1 hidden condition) | **Rendered** when project open                                      |
| Click effect                      | n/a                       | n/a                                        | IPC `tour:reset` → W store action → main process clears `tour.json` |
| `Mod+Shift+R` binding             | n/a                       | **Not bound** (per E1 hidden condition)    | Bound; only fires when Help menu item visible                       |
| Migration action for users        | none                      | none                                       | none — additive UI, existing flows unchanged                        |

**Migration guarantee**: A user upgrading from v1.5.1 to v1.6.0 with flag OFF sees **zero UI change** in the Help menu. With flag ON, the new "Reset onboarding" entry is inserted between existing Help items at a documented position (plan-stage detail). No existing menu items are renamed, removed, or re-keyed. The W `tour:reset` IPC handler exists from W PR(W-1) onward, so even with flag OFF the IPC is registered but unreferenced from UI (W §2.6 / W §9.3 OUT-of-scope explicitly notes "settings menu entry is Cluster U's job").

---

## 9. Risks & Open Questions

### 9.1 待 user 拍板

| #   | Risk / Open Question                                                                                                                            | 严重度 | 影响范围                                                                         | Mitigation                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | **50+ shortcut 完整定稿** — spec 列 47 个候选, 需补 3+ 个到 50+, 部分 binding 与既有 AppHeader 冲突                                             | H      | shortcut.ts 静态定义; 计划阶段 user 拍板                                         | plan 阶段专门 review 一轮; 用 `when` 条件避开冲突                                             |
| 2   | **Mac Cmd vs Win Ctrl 跨平台** — `process.platform` direct (via preload bridge, no new IPC channel) — 与 A+C §11 CLI `--platform` flag SoT 一致 | M      | `normalizeKey.ts` 实现                                                           | **RESOLVED 2026-06-21 (Q4/Q10)**: `process.platform` 直读, 不需要新 IPC; preload 暴露一次即可 |
| 3   | **浏览器 default shortcut 冲突** — Cmd+R (刷新), Cmd+W (关 tab), Cmd+T (新 tab) 等 Electron 默认                                                | M      | electron main process `Menu.setApplicationMenu` 配置; renderer 不一定能 override | main process 显式 `Menu.registerAccelerator`; cheat sheet 标注 "browser"                      |
| 4   | **焦点环样式** — 现有 CSS 是否有 `--focus-ring-color` token? 没有要新增                                                                         | L      | CommandPalette.css + CheatSheet.css + 全局 `:focus-visible`                      | plan 阶段 audit 现有 design system; 缺则补 token                                              |
| 5   | **Cheat sheet 触发键 `?`** — 在中文键盘布局下 `?` 是 Shift+/, 可能不直观                                                                        | L      | binding 文档 + a11y 文档                                                         | cheat sheet 也加 `F1` 备用 binding; i18n key 标注 "Show Shortcuts (Press ?)"                  |
| 6   | **Multi-cursor 在 ParamEditor** — Q6 已 defer, 但 ParamEditor 是否需要 placeholder?                                                             | L      | ParamEditor.tsx (existing); 不在本 sprint                                        | 留 TODO 注释, v1.7.0 再决定                                                                   |
| 7   | **Macro 录制 (US-3)** — 用户期望"边操作边录", 当前 Script Engine 没有 record mode                                                               | M      | 不在本 sprint scope; v1.7.0 brainstorm                                           | spec US-3 已经说明"先写脚本, 再 Run"; 不假装支持"录制"                                        |
| 8   | **Cmd-K 与 Cmd+P (Quick Open)** — VS Code 是分开的, Cluster U 暂用一个 palette 入口                                                             | L      | UX 习惯问题                                                                      | cheat sheet 标注 "Cmd-K: Palette, Cmd+P: Focus Search"; 后续可拆                              |
| 9   | **bundle 影响** — CodeMirror 已 779 kB, Cluster U 不应再加 > 50 kB                                                                              | M      | Vite code splitting; palette + shortcut registry lazy load                       | plan 阶段用 `React.lazy` + `import()` 拆 chunk                                                |

### 9.2 技术风险

| Risk                                                   | Likelihood | Impact | Mitigation                                                                                                                            |
| ------------------------------------------------------ | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| useShortcut hook 与 CodeMirror 内部快捷键冲突          | M          | M      | CodeMirror 实例挂载时, listener 优先级 (capture vs bubble); plan 阶段决定用 `addEventListener('keydown', handler, { capture: true })` |
| Feature flag 配置写入 settings.json 后, dev 重启才发现 | L          | L      | 提供 `getFeatureFlag('experimental.keyboardFirst')` helper, unit test 覆盖 default OFF                                                |
| 50+ shortcut 静态定义文件过大 (> 800 行)               | L          | L      | 按 category 拆 `shortcuts/file.ts`, `shortcuts/edit.ts`, ...; barrel 汇总                                                             |
| i18n key 数量从 ~250 → 310+, parity test 变慢          | L          | L      | 已用 vitest snapshot; 影响 < 100ms, 可接受                                                                                            |

---

## 10. Acceptance Criteria

### 10.0 Resolved decisions (post-review, 2026-06-21)

| Q                                              | Decision                                                   | Resolution                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q6 (feature flag naming)                       | `experimental.keyboardFirst`                               | **RESOLVED 2026-06-21**: adopt `experimental.keyboardFirst` (matches W/A+C/G + v1.5.1 `experimental.streaming` / `experimental.indexedDb` pattern). All 5 reviewers (W/A+C/G/U/Adv) consensus per synthesizer-report C2. U §6.4 "product vs infra" justification paragraph removed; original flag `V16_KEYBOARD_FIRST` and settings.json key `v16.keyboardFirst` both renamed throughout this spec. |
| Q2 (`Mod+Shift+P` conflict)                    | `Mod+Shift+P` = Script Editor; `Mod+Alt+I` = Add Parameter | **RESOLVED 2026-06-21**: Script Editor (high-frequency) keeps `Mod+Shift+P`; Add Parameter remaps to `Mod+Alt+I`. Per W peer M3 + U peer H3 + Adv M7 consensus (synthesizer-report H4).                                                                                                                                                                                                             |
| Q4 (cross-platform `Mod`/`Cmd`)                | Use `process.platform` direct (no IPC)                     | **RESOLVED 2026-06-21**: U drops `getPlatform()` IPC proposal; renderer reads `process.platform` via preload bridge directly (matches A+C §11 CLI `--platform` flag SoT). Per U peer H1 + Synthesizer §3 H6.                                                                                                                                                                                        |
| Q10 (add `getPlatform()` IPC)                  | **DELETED** — superseded by Q4 resolution above            | **RESOLVED 2026-06-21**: see Q4. Renderer reads `process.platform` from preload-exposed Node API (no new IPC channel needed).                                                                                                                                                                                                                                                                       |
| (cross-spec H5) Help menu wires W `tour:reset` | U §11.1 + §5.2 + §3 wire W's `tour:reset` IPC              | **RESOLVED 2026-06-21**: U consumes W's IPC channel `tour:reset` (W §3.2) via AppHeader Help menu entry. Merge wave order: W PR(W-1) ships `tour:reset` IPC first, U PR(U-5) wires menu later. Per W peer H3 + U peer H3 cross-confirmed.                                                                                                                                                           |

### 10.1 BLOCK (must all pass to ship)

| #   | Item                                                                                                                                                 | Verification                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | 全部 shortcut 定义文件 ship (≥ 50 条)                                                                                                                | `grep -c 'id:' src/renderer/config/shortcuts/*.ts` ≥ 50               |
| 2   | Tests pass                                                                                                                                           | `pnpm test` — 既有 ~1900 tests + 53 unit + 15 integration + 10 e2e    |
| 3   | Coverage gate                                                                                                                                        | `pnpm test:coverage` — ≥ 95.5% stmts / ≥ 87% branches (baseline 不降) |
| 4   | 0 type errors                                                                                                                                        | `pnpm typecheck`                                                      |
| 5   | 0 lint errors                                                                                                                                        | `pnpm lint`                                                           |
| 6   | Build success; renderer bundle ≤ 900 kB (CodeMirror 779 + Cluster U ≤ 50 + 30 headroom)                                                              | `pnpm build`                                                          |
| 7   | `experimental.keyboardFirst` default OFF                                                                                                             | `grep settings.json` 默认 `false`; test 覆盖                          |
| 8   | i18n parity EN + zh-CN                                                                                                                               | `pnpm test:i18n` — ≥ 60 个新 key, 2 locale 同步                       |
| 9   | 50+ shortcut 全部可触发 (含 when 条件)                                                                                                               | Playwright e2e 至少 10 条核心 shortcut 实跑                           |
| 10  | Cmd-K 打开 palette ≤ 100ms (从 keydown 到 palette 可见)                                                                                              | Playwright `performance.now()` 测量                                   |
| 11  | Conflict detection 0 误报 (允许声明性 conflict 警告 ≤ 5)                                                                                             | `registry.detectConflicts()` 单元测试覆盖; CI 跑                      |
| 12  | Cheat sheet screen reader 可读 (axe-core 0 violations on palette + cheatsheet)                                                                       | Playwright + `@axe-core/playwright`                                   |
| 13  | Feature flag OFF 时: window keydown listener 不挂, palette 不 mount (zero overhead)                                                                  | unit test 覆盖 `KeymapProvider` early return                          |
| 14  | **F8 Next validation error** e2e: 3 rules in fixture → 1st press highlights rule 1, 2nd press highlights rule 2, 3rd press highlights rule 3         | Playwright `tests/e2e/shortcuts.spec.ts` (G cluster cross-spec test)  |
| 15  | **Shift+F8 Previous validation error** e2e: at rule 2 → press → highlights rule 1                                                                    | Playwright `tests/e2e/shortcuts.spec.ts` (G cluster cross-spec test)  |
| 16  | **Mod+Shift+V Toggle ValidationPanel** e2e: panel hidden → press → visible; visible → press → hidden                                                 | Playwright `tests/e2e/shortcuts.spec.ts` (G cluster cross-spec test)  |
| 17  | **Mod+Shift+E Focus ValidationPanel** e2e: focus outside panel → press → focus on panel's first rule row; axe-core 0 a11y violation on focused state | Playwright + `@axe-core/playwright` (a11y WCAG 2.2 AA 必需)           |

### 10.2 WARN (should pass, ship if minor miss)

| #   | Item                                                | Verification         |
| --- | --------------------------------------------------- | -------------------- |
| 14  | Mac Cmd / Win Ctrl 自动映射 + cheat sheet 显示正确  | e2e 跨平台用例       |
| 15  | CodeMirror 内部快捷键不与全局 listener 冲突         | e2e Script Editor 跑 |
| 16  | code-reviewer verdict: 0 C / ≤ 2 H / ≤ 5 M / ≤ 10 L | per-PR review        |

### 10.3 OUT of scope (v1.6.0 Cluster U 明确不交付)

- ❌ Vim mode / emacs mode (v1.7.0+)
- ❌ 鼠标手势 (v1.7.0+)
- ❌ Custom keybinding user-level override (v1.7.0+)
- ❌ Multi-cursor 文本编辑 (v1.7.0+)
- ❌ Macro 录制模式 (v1.7.0+)
- ❌ 其他 Cluster 范围: W Onboarding / A+C Headless CLI / G SWS Validator
- ❌ v1.5.1 features / v1.3.0 Script Engine 修改

---

## 11. File Structure (locked, plan 阶段细化)

### 11.1 New files (this spec creates)

| Path                                                                          | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | ~Lines |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -----: |
| `src/renderer/config/shortcuts/index.ts`                                      | Barrel 汇总 50+ shortcut 分类                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |     30 |
| `src/renderer/config/shortcuts/file.ts`                                       | File 类 5 条                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |     80 |
| `src/renderer/config/shortcuts/edit.ts`                                       | Edit 类 7 条                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |    100 |
| `src/renderer/config/shortcuts/view.ts`                                       | View 类 5 条                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |     70 |
| `src/renderer/config/shortcuts/navigate.ts`                                   | Navigate 类 5 条                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |     70 |
| `src/renderer/config/shortcuts/selection.ts`                                  | Selection 类 5 条                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |     70 |
| `src/renderer/config/shortcuts/tree.ts`                                       | Tree 类 5 条                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |     80 |
| `src/renderer/config/shortcuts/script.ts`                                     | Script 类 4 条 (复用 v1.3.0 IPC)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |     80 |
| `src/renderer/config/shortcuts/ecuc.ts`                                       | ECUC 类 5 条                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |     90 |
| `src/renderer/config/shortcuts/window.ts`                                     | Window 类 3 条                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |     50 |
| `src/renderer/config/shortcuts/help.ts`                                       | Help 类 2 条 + Palette 1 条                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |     50 |
| `src/renderer/components/ShortcutRegistry/ShortcutRegistry.ts`                | 不可变 registry 核心                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |    180 |
| `src/renderer/components/ShortcutRegistry/KeymapProvider.tsx`                 | Context provider                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |     90 |
| `src/renderer/components/ShortcutRegistry/normalizeKey.ts`                    | Mac/Win 跨平台 normalize                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |     80 |
| `src/renderer/components/ShortcutRegistry/__tests__/ShortcutRegistry.test.ts` | 18 unit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |    250 |
| `src/renderer/components/ShortcutRegistry/__tests__/normalizeKey.test.ts`     | 12 unit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |    150 |
| `src/renderer/components/CommandPalette/CommandPalette.tsx`                   | 主 dialog 组件                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |    220 |
| `src/renderer/components/CommandPalette/CommandPalette.css`                   | 样式 (focus ring + modal)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |    120 |
| `src/renderer/components/CommandPalette/CommandItem.tsx`                      | 单条命令渲染                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |    100 |
| `src/renderer/components/CommandPalette/CheatSheet.tsx`                       | ? 弹窗                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |    180 |
| `src/renderer/components/CommandPalette/CheatSheet.css`                       | 样式                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |     80 |
| `src/renderer/components/CommandPalette/useCommandPalette.ts`                 | 状态 + filter 逻辑                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |    150 |
| `src/renderer/components/CommandPalette/__tests__/*`                          | 8 unit + 6 integration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |    350 |
| `src/renderer/components/AppHeader/ResetOnboardingMenuItem.tsx`               | Help menu entry → W `tour:reset` IPC (cross-cluster consumer, §3.4). **Implementation detail**: Props = `{ tourIpc: TourIpcContract }` (preload bridge injects). Render: `<MenuItem>` with i18n label `help.menu.resetOnboarding`. `onClick` → `tourIpc.reset()` → W store action `tourReset()` (W §3.2 IPC handler). Hidden when: no project open OR `!experimental.keyboardFirst` flag. **Test file**: `src/renderer/components/AppHeader/__tests__/ResetOnboardingMenuItem.test.tsx` (3 cases: visible-when-enabled / click-dispatches-ipc / hidden-when-no-project). |     30 |
| `src/renderer/hooks/useShortcut.ts`                                           | window keydown listener                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |     70 |
| `src/renderer/hooks/__tests__/useShortcut.test.ts`                            | 6 unit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |    100 |
| `src/renderer/hooks/useFocusTrap.ts`                                          | palette focus trap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |     60 |
| `src/renderer/hooks/__tests__/useFocusTrap.test.ts`                           | 4 unit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |     80 |
| `tests/e2e/shortcuts.spec.ts`                                                 | 10 Playwright e2e                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |    350 |
| **新增小计**                                                                  | **~30 files / ~3300 lines (incl tests)**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |        |

### 11.2 Modified files

| Path                                    | Change                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| `src/renderer/App.tsx`                  | mount `KeymapProvider` + `CommandPalette` + `CheatSheet` (gated by feature flag) |
| `src/renderer/components/AppHeader.tsx` | 给 menu items 加 `aria-keyshortcuts`                                             |
| `src/shared/i18n.ts`                    | 新增 ≥ 60 个 key (palette / shortcut / cheat sheet) × 2 locale                   |
| `src/main/arxml-stream/feature-flag.ts` | 加 `experimental.keyboardFirst` flag (与 experimental 共存)                      |
| `src/renderer/store/slices/uiSlice.ts`  | 加 `paletteOpen` / `paletteQuery` / `paletteSelectedIndex` / `cheatSheetOpen`    |
| `src/renderer/store/useScriptStore.ts`  | **不改** — palette 复用其 `runScript` action                                     |
| `package.json`                          | bump 1.5.1 → 1.6.0 (MINOR)                                                       |
| `CHANGELOG.md`                          | 新增 v1.6.0 entry                                                                |
| `~/.claude/projects/.../memory/`        | 新增 `claude-autosarcfg-v1-6-0-U-keyboard-shipped.md` (post-ship)                |

### 11.3 文件责任边界 (locked)

- **`src/renderer/config/shortcuts/`** = 静态 50+ 命令定义; 纯常量, 无副作用
- **`src/renderer/components/ShortcutRegistry/`** = 跨组件共享的 registry + Context; 不挂 window listener
- **`src/renderer/components/CommandPalette/`** = UI + palette 状态; 通过 `KeymapProvider` 获取 registry
- **`src/renderer/hooks/useShortcut.ts`** = 唯一挂 `window keydown` 的位置; 查 registry 派发
- **`src/renderer/store/slices/uiSlice.ts`** = palette/cheatsheet 可见性状态; 与现有 ui state 共存
- **`src/main/arxml-stream/feature-flag.ts`** = 扩展, 不新建 feature-flag 系统

---

## 12. i18n Plan (≥ 60 keys, zh-CN + en parity)

### 12.1 Command label keys (per category, ≥ 50)

| Category            |         Count | 示例 keys                                                                                                                                                                                                         |
| ------------------- | ------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File                |             5 | `shortcut.file.open` "Open Project" / "打开项目"                                                                                                                                                                  |
| Edit                |             7 | `shortcut.edit.undo` "Undo" / "撤销"                                                                                                                                                                              |
| View                |             5 | `shortcut.view.toggleLeft` "Toggle Left Panel" / "切换左侧面板"                                                                                                                                                   |
| Navigate            |             5 | `shortcut.navigate.goToDefinition` "Go to Definition" / "转到定义"                                                                                                                                                |
| Selection           |             5 | `shortcut.selection.selectAll` "Select All" / "全选"                                                                                                                                                              |
| Tree                |             5 | `shortcut.tree.expandAll` "Expand All" / "全部展开"                                                                                                                                                               |
| Script              |             4 | `shortcut.script.run` "Run Script" / "运行脚本"                                                                                                                                                                   |
| ECUC                |             5 | `shortcut.ecuc.addContainer` "Add Container" / "添加容器"                                                                                                                                                         |
| Window              |             3 | `shortcut.window.closeWindow` "Close Window" / "关闭窗口"                                                                                                                                                         |
| Help                |             3 | `shortcut.help.showCheatSheet` "Show Shortcuts" / "显示快捷键" · `shortcut.help.resetOnboarding` "Reset onboarding tour" / "重置引导" · `help.menu.resetOnboarding` "Help → Reset onboarding" / "帮助 → 重置引导" |
| **Sub-total**       |        **47** |                                                                                                                                                                                                                   |
| Category label keys |            10 | `shortcut.category.file` "File" / "文件" 等                                                                                                                                                                       |
| Palette UI keys     |             6 | `commandPalette.placeholder` "Type a command..." / "输入命令..." / `commandPalette.noResults` / `commandPalette.error` / `commandPalette.title` / `commandPalette.scriptModeHint` (">")                           |
| Cheat sheet UI keys |             5 | `cheatSheet.title` "Keyboard Shortcuts" / "键盘快捷键" / `cheatSheet.searchPlaceholder` / `cheatSheet.closeAria` / `cheatSheet.bindingHint`                                                                       |
| Error / a11y keys   |             5 | `shortcut.error.conflictWarn` / `shortcut.error.noProject` / `palette.a11y.opened` / `palette.a11y.closed` / `palette.a11y.noResults`                                                                             |
| **TOTAL**           | **≥ 73 keys** | (满足 ≥ 60)                                                                                                                                                                                                       |

### 12.2 Parity test

`src/shared/__tests__/i18n.test.ts` 已有 parity test 模式 — 扩展为对 `Messages` interface 字段做编译期穷尽性检查, 防止漏译。

---

## 13. Build Approach (建议, plan 阶段细化)

### 13.1 三波合并 (3 sub-sprints)

```
Wave 1 — Foundation (~1 wk):
  PR(1) ShortcutRegistry + normalizeKey + useShortcut hook
        + useFocusTrap hook + config/shortcuts/ 静态定义 (50+)
  PR(2) i18n 新增 ≥ 60 keys (zh + en)
  PR(3) experimental.keyboardFirst feature flag 接入

Wave 2 — Palette UI (~1 wk, depends on Wave 1):
  PR(4) CommandPalette + CommandItem + useCommandPalette hook
  PR(5) CheatSheet 组件
  PR(6) App.tsx + AppHeader 集成 (mount + aria-keyshortcuts)
  PR(7) uiSlice 新增 palette/cheatsheet 状态

Wave 3 — E2E + Polish (~1 wk, depends on Wave 2):
  PR(8) Playwright e2e (10+ shortcut)
  PR(9) a11y audit (axe-core) + NVDA smoke
  PR(10) code-reviewer + 文档 + release bump (1.5.1 → 1.6.0)
```

**Total: ~3 wks** (与 brainstorm 锁定一致)。

### 13.2 为什么不 Big-Bang

- Wave 1 完成 = 静态定义 + registry 即可单测; 不需要 UI
- Wave 2 风险在 UI, 可独立迭代
- Wave 3 验证在 e2e, 与 Wave 2 解耦

---

## 14. References

- [[claude-AutosarCfg-v1-6-brainstorm]] — Cluster U 范围 + 战略决策
- [[sprint-14-v1-3-0-shipped]] — Script Engine (复用 runScript IPC)
- [[2026-06-21-v1-6-0-W-onboarding-design]] — W Onboarding (`tour:reset` IPC consumed by U §3.4 + §5.2 + §6.6 + §11.1; merge wave order W PR(W-1) → U PR(U-5))
- [[2026-06-21-v1-6-0-AC-headless-cli-design]] §17 Q6 — **A+C 不需要 U IPC** (Cluster U 决策 locked 2026-06-21: U palette 不 ship "Run CLI command"; 阿丽 macro 只走 Script Editor + v1.3.0 runScript IPC, 不借 A+C CLI bridge)
- [[2026-06-21-v1-6-0-G-sws-validator-design]] §3 + §5.4 — G ValidationPanel bottom-docked component + `useSwsValidatorStore` API (consumed by U §5.2 Validation category: F8 / Shift+F8 / Mod+Shift+V / Mod+Shift+E 4 shortcuts); G spec §5.4 RuleCtx 跟 v1.3.0 ScriptCtx 平行 — **U palette 跟 G panel 可共享 result-renderer component** (plan-stage refactor, v1.6.0 不强制)
- [[2026-06-21-v1-6-0-W-onboarding-design]] §3.2 — W `tour:reset` IPC handler definition (U §6.6 TourIpcContract mirrors W's IPC schema for compile-time safety)
- [[claude-AutosarCfg-v1-5-1-shipped]] — Foundation baseline (applyMutation 已 wire)
- [[claude-autosarcfg-overview]] — v1.5.x 当前状态
- `docs/superpowers/specs/2026-06-21-v1-5-1-foundation-design.md` — spec 格式参考
- `docs/superpowers/specs/2026-06-18-script-engine-design.md` — Script Engine 原始 spec
- `src/main/ipc/script-handler.ts` — v1.3.0 runScript handler (Cluster U 复用)
- `src/renderer/store/useScriptStore.ts` — v1.3.0 store actions (Cluster U 复用)
- `src/renderer/components/ScriptPanel/ScriptPanel.tsx` — Cmd-K "Run Script" 入口打开它
- `src/main/arxml-stream/feature-flag.ts` — feature flag 模式参考
- `src/shared/i18n.ts` — i18n 模式参考
- VS Code Keybindings 文档 — Cmd-K + ? cheat sheet 设计参考
- WCAG 2.2 AA — a11y baseline (success criterion 2.1.1 Keyboard + 2.4.7 Focus Visible; Validation category `Mod+Shift+E` 焦点约定依据)
