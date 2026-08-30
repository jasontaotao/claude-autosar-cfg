# UI v2 P1 视觉地基 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 design tokens（`src/renderer/styles/tokens.css`）+ codemod 把 32 个手写 CSS 文件的 914 处裸色值（hex 835 + rgba 79）全部收敛为 `var()`（含 13 个 Catppuccin 暗色组件反转为亮色），删除 `.dark`/`dark:` 死代码，stylelint 禁裸 hex 进 CI，建立 6 surface visual regression 基线。

**Architecture:** 纯 CSS 层改造，零行为变化。核心是一个入仓 codemod 脚本（`scripts/codemod/hex-to-tokens.mjs`，TOKEN_MAP 单一数据源，dry-run / --write / --check 三模式），先 dry-run 产出偏差清单 → 用户逐 bucket 裁决（spec §10.1 停手上报）→ `--write` 落盘 → stylelint + visual regression 防回潮。

**Tech Stack:** Node ESM 脚本（无新运行时依赖）、vitest（脚本单测）、stylelint 17.14.1 + stylelint-config-standard 40.0.0（本 plan 锁定，spec §3.5 授权 plan 锁版本）、@playwright/test（已有 devDependency，visual regression 复用现有 vite dev server webServer）。

**Spec:** [docs/superpowers/specs/2026-08-30-ui-v2-workbench-design.md](../specs/2026-08-30-ui-v2-workbench-design.md)（2026-08-30 review 版，§9 含 16 条决策记录）。本 plan 按 spec §10.1 交接协议产出；冲突裁决优先级：spec §9 > spec 正文 > 本 plan。

**Baseline:** v1.55.0，~3003 单测 + e2e 全绿。执行时repo 内有其他未提交改动（如 `.superpowers/sdd/task-1-report.md`），**每个 commit 只 add 本 plan 列出的文件，严禁 `git add -A`**。

## Global Constraints（摘自 spec，每任务隐含遵守）

- tokens 唯一定义处：`src/renderer/styles/tokens.css`（spec §10.3）；codemod 唯一路径：`scripts/codemod/hex-to-tokens.mjs`（dry-run 默认 / `--write` / `--check`）。
- 映射语义 = **纯值映射**（spec §9.7）：每个色值唯一对应一个 token，与属性上下文无关；语义错位由重灾区人工 review 修正、不算偏离。TOKEN_MAP/ALPHA_MAP/GRADIENT_MAP/EXCEPTIONS 是唯一数据源，**实施者不得另建映射**。
- **渐变内 hex 不做单值替换**（spec §9.7）：整条渐变精确命中组合 token 才整体替换，否则进偏差清单。
- 收敛范围 = 32 个手写 CSS 文件；editor 子系统 Tailwind TSX 与 `tokens.css` 本身不收敛、不扫描（tokens.css 豁免 stylelint 与 --check）。
- light 单主题：`.dark` 选择器与 `dark:` 变体禁止回潮（spec §3.4）。
- 实施顺序强制 **dry-run 先行**（spec §9.7 注）：`--write` 前必须完成偏差裁决（Task 3 checkpoint）。
- 偏离协议（spec §10.4）：任何本 plan 之外的替代做法 → 先写入本文件 `## Deviations` → 用户确认 → 才可实施；未声明偏离在 code review 按 BLOCK 处理。
- 所有新文件须通过 `pnpm format:check`（prettier），提交前跑 `pnpm format` 涉及文件。
- commit 风格沿用仓库惯例：conventional commits + 中文描述（如 `feat(p1): ...`）。

## Deviations（spec §10.4 — 本 plan 相对 spec 的偏离与修订提案，随 plan 评审一并确认）

1. **新增 15 个 token（spec §3.1 / §9.8 修订提案）**。spec §9.8 说 `--surface-menu` 是 mockup 外唯一新增 token，但实测数据（去重色值分布）显示 26 token 无法覆盖全仓色值——浅色 tint 底、深色 chrome（header/footer/dropdown/ScriptPanel 保暗区）、overlay scrim、brand alpha 都无对应 token，而 P1 验收要求裸色值 = 0。提案清单见附录 A 第 0 节；Task 3 用户裁决后写入 tokens.css，并按 spec §10.5 修订 spec §3.1/§9.8。
2. **`dark:` 清理范围扩大**。spec §3.4 只列「ParamEditor.tsx 24 处 + index.html body」；全仓实测 `dark:` 另存在于 `editor/modes/{StringEditor,IntegerEditor,MultilineEditor,FloatEditor,ReferenceEditor}.tsx` 各 1 处。单主题决策（§9.1）下应全删，Task 5 一并处理。
3. **ParamEditor.test.tsx 断言同步修改**。该测试文件 `dark:text-slate-50` 等断言（:339-355 两处）依赖将被删除的类名，Task 5 同步改为断言亮色类（spec 未提测试改动）。
4. **ScriptPanel 渐变坍缩为实色**。ScriptPanel.css:301 `linear-gradient(180deg,#1f232b 0%,#1a1d23 100%)` 两 stop 均映射 `--chrome-bg-deep`，坍缩为实色（视觉变化 ≈ 0，两 stop 本就近似）。
5. **6 个 visual surface 清单补全**。spec §3.6 说「6 个关键 surface」未列明，本 plan Task 7 枚举为：默认工作区 / 文件 tab / NewProjectDialog / ScriptPanel / RemoveModuleConfirmDialog / delete-ecuc ConfirmDialog。

---

## 文件总览

| 动作 | 文件 | 职责 |
|---|---|---|
| Create | `src/renderer/styles/tokens.css` | 唯一 token 定义（:root 单块） |
| Modify | `src/renderer/styles.css`（头部 @import） | tokens 接入（必须在所有 @import/@tailwind 之前） |
| Create | `scripts/codemod/hex-to-tokens.mjs` | 色值收敛 codemod（dry-run/--write/--check） |
| Create | `tests/codemod/__tests__/hex-to-tokens.test.ts` | codemod 单测（vitest include 覆盖 `tests/**/__tests__/**/*.test.ts`） |
| Create | `tests/codemod/codemod.d.ts` | `.mjs` 导入的 TS 模块声明 shim |
| Modify | 32 个 `src/renderer/**/*.css` | 色值 → var()（codemod 自动）+ 语义修正（人工 review） |
| Modify | `src/renderer/components/editor/modes/{EnumEditor,BooleanEditor}.css` | 删 `.dark` 死代码（codemod 之外的手工编辑） |
| Modify | `src/renderer/components/editor/{ParamEditor,modes/*}.tsx`、`src/renderer/index.html` | 删 `dark:` 变体 |
| Modify | `src/renderer/components/editor/__tests__/ParamEditor.test.tsx` | dark: 断言 → 亮色断言 |
| Create | `src/renderer/__tests__/p1-single-theme.test.ts` | 单主题 guard 测试 |
| Modify | `package.json`、`.github/workflows/ci.yml`、`scripts/verify.mjs` | stylelint 接线 |
| Create | `stylelint.config.mjs` | stylelint 规则（bare-hex/rgba 门禁，tokens.css 豁免） |
| Modify | `playwright.config.ts` | snapshot 路径指到 `tests/visual/baseline/` |
| Create | `tests/e2e/visual-regression.spec.ts` + `tests/visual/baseline/**` | 6 surface 基线 |

---

### Task 1: tokens.css 落地 + styles.css 接入

**Files:**
- Create: `src/renderer/styles/tokens.css`
- Modify: `src/renderer/styles.css`（仅文件头部 @import 区，第 9-10 行附近）
- Test: `src/renderer/__tests__/tokens.test.ts`

**Interfaces:**
- Consumes: 无（首个任务）
- Produces: 44 个 CSS 自定义属性（Task 4 会追加裁决新增的 ~15 个）；后续所有任务的 `var(--*)` 消费以本文件为准

- [ ] **Step 1: 写失败测试**

创建 `src/renderer/__tests__/tokens.test.ts`：

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const tokensCss = read('../styles/tokens.css');
const stylesCss = read('../styles.css');

// spec §3.1 token 清单 + §9.8 --surface-menu + §9.14 字体栈（关键项抽查）
const REQUIRED_TOKENS: Array<[string, string]> = [
  ['--surface-app', '#f8fafc'],
  ['--surface-panel', '#ffffff'],
  ['--surface-elevated', '#ffffff'],
  ['--surface-subtle', '#f1f5f9'],
  ['--surface-header', 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'],
  ['--surface-menu', '#1c2128'],
  ['--brand-500', '#3b82f6'],
  ['--brand-400', '#60a5fa'],
  ['--brand-300', '#93c5fd'],
  ['--accent-cyan', '#38bdf8'],
  ['--accent-amber', '#f59e0b'],
  ['--accent-emerald', '#10b981'],
  ['--accent-rose', '#f43f5e'],
  ['--accent-amber-strong', '#b45309'],
  ['--text-primary', '#0f172a'],
  ['--text-secondary', '#475569'],
  ['--text-muted', '#94a3b8'],
  ['--text-inverse', '#f1f5f9'],
  ['--text-inverse-muted', '#cbd5e1'],
  ['--border-subtle', '#e2e8f0'],
  ['--border-strong', '#cbd5e1'],
  ['--shadow-sm', '0 1px 2px rgba(15, 23, 42, 0.05)'],
  ['--shadow-md', '0 4px 12px rgba(15, 23, 42, 0.08)'],
  ['--shadow-lg', '0 12px 32px rgba(15, 23, 42, 0.12)'],
  ['--radius-sm', '4px'],
  ['--radius-md', '6px'],
  ['--radius-lg', '10px'],
  ['--text-xs', '11px'],
  ['--text-base', '13px'],
  ['--text-lg', '16px'],
  ['--space-1', '4px'],
  ['--space-5', '16px'],
  ['--font-sans', "'Microsoft YaHei'"],
  ['--font-mono', 'Consolas'],
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('P1 tokens.css（spec §3.1 / §10.3 唯一定义处）', () => {
  it.each(REQUIRED_TOKENS)('定义 %s = %s', (name, value) => {
    expect(tokensCss).toMatch(new RegExp(`${escapeRe(name)}:\\s*${escapeRe(value)}`));
  });

  it('经 styles.css @import 接入，且位于所有 @import 之首', () => {
    const idx = stylesCss.indexOf("@import url('./styles/tokens.css');");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(stylesCss.indexOf("@import url('./keyboard/keyboard.css');"));
    expect(idx).toBeLessThan(stylesCss.indexOf('@tailwind'));
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/renderer/__tests__/tokens.test.ts`
Expected: FAIL（`tokens.css` 不存在，ENOENT）

- [ ] **Step 3: 创建 `src/renderer/styles/tokens.css`**

```css
/* tokens.css — UI v2 P1 唯一 token 定义处（spec §3.1 / §10.3）。
 * 值来源：docs/mockups/ui-v2-preview.html :root（25 token 逐字一致）
 *       + --surface-menu（spec §9.8 新增）
 *       + metrics 扩展（spec §3.1；字体栈为 §9.14 声明的 Windows/CJK 回退扩展）。
 * 规则：全仓 CSS 只允许消费本文件变量；裸 hex/rgb 由 stylelint 禁止（spec §3.5）。 */
:root {
  /* —— surface —— */
  --surface-app: #f8fafc;
  --surface-panel: #ffffff;
  --surface-elevated: #ffffff;
  --surface-subtle: #f1f5f9;
  --surface-header: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  --surface-menu: #1c2128; /* mockup 外新增（spec §9.8），下拉菜单 chrome */

  /* —— brand —— */
  --brand-500: #3b82f6;
  --brand-400: #60a5fa;
  --brand-300: #93c5fd;

  /* —— accent —— */
  --accent-cyan: #38bdf8;
  --accent-amber: #f59e0b;
  --accent-emerald: #10b981;
  --accent-rose: #f43f5e;
  --accent-amber-strong: #b45309; /* dirty 按钮深档（spec §3.1；#c2410c/#ea580c 不预先合并） */

  /* —— text —— */
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;
  --text-inverse: #f1f5f9;
  --text-inverse-muted: #cbd5e1;

  /* —— border —— */
  --border-subtle: #e2e8f0;
  --border-strong: #cbd5e1;

  /* —— shadow（与 mockup 逐字一致） —— */
  --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.05);
  --shadow-md: 0 4px 12px rgba(15, 23, 42, 0.08);
  --shadow-lg: 0 12px 32px rgba(15, 23, 42, 0.12);

  /* —— radius —— */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;

  /* —— metrics: 字号五档（spec §3.1） —— */
  --text-xs: 11px;
  --text-sm: 12px;
  --text-base: 13px;
  --text-md: 14px;
  --text-lg: 16px;

  /* —— metrics: 间距（spec §3.1 表列 5 档） —— */
  --space-1: 4px;
  --space-2: 6px;
  --space-3: 8px;
  --space-4: 12px;
  --space-5: 16px;

  /* —— metrics: 字体栈（spec §9.14） —— */
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
```

- [ ] **Step 4: styles.css 头部插入 @import**

在 `src/renderer/styles.css` 现有 `@import url('./keyboard/keyboard.css');`（第 9 行）**之前**插入一行，使头部成为：

```css
@import url('./styles/tokens.css');
@import url('./keyboard/keyboard.css');
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm vitest run src/renderer/__tests__/tokens.test.ts`
Expected: PASS（35 项）

- [ ] **Step 6: 全量回归 + 提交**

Run: `pnpm test`
Expected: 全绿（~3003 + 新增）

```bash
pnpm format src/renderer/styles/tokens.css src/renderer/__tests__/tokens.test.ts src/renderer/styles.css
git add src/renderer/styles/tokens.css src/renderer/__tests__/tokens.test.ts src/renderer/styles.css
git commit -m "feat(p1): tokens.css 落地 mockup 25 token + --surface-menu + metrics 扩展"
```

---

### Task 2: codemod 脚本 `scripts/codemod/hex-to-tokens.mjs` + 单测

**Files:**
- Create: `scripts/codemod/hex-to-tokens.mjs`
- Create: `tests/codemod/codemod.d.ts`
- Test: `tests/codemod/__tests__/hex-to-tokens.test.ts`

**Interfaces:**
- Consumes: Task 1 的 tokens.css（脚本本身不读它，只定义映射）
- Produces（Task 3/4 依赖）:
  - `TOKEN_MAP: Record<string, string>`（seed 直映射 + Catppuccin 反转，30 项）
  - `ALPHA_MAP: Record<string, string>`（T3 裁决前为空）、`GRADIENT_MAP: Record<string, string>`（同）、`EXCEPTIONS: Set<string>`（同）
  - `transformCss(css: string, relFile: string, maps?): { output: string; deviations: Array<{ value: string; count: number; firstLine: number }>; stats: { plannedCommentsStripped: number; danglingRewritten: number; replaced: number } }`
  - `scanResidue(css: string): Array<{ line: number; kind: string; value: string }>`
  - `findCssFiles(root?): string[]`（递归 `src/renderer`，**排除 tokens.css**，排序）
  - CLI：`node scripts/codemod/hex-to-tokens.mjs [--write|--check]`

- [ ] **Step 1: 写失败测试**

创建 `tests/codemod/codemod.d.ts`：

```ts
declare module '*.mjs';
```

创建 `tests/codemod/__tests__/hex-to-tokens.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  ALPHA_MAP,
  TOKEN_MAP,
  expandHex,
  findCssFiles,
  rgbSpaceToHex,
  scanResidue,
  transformCss,
} from '../../../scripts/codemod/hex-to-tokens.mjs';

describe('基础归一化', () => {
  it('expandHex：3/6 位小写归一', () => {
    expect(expandHex('#FFF')).toBe('#ffffff');
    expect(expandHex('#1E1E2E')).toBe('#1e1e2e');
  });
  it('rgbSpaceToHex：空格语法 → hex', () => {
    expect(rgbSpaceToHex('rgb(59 130 246)')).toBe('#3b82f6');
    expect(rgbSpaceToHex('rgba(15, 23, 42, 0.5)')).toBeNull(); // 带归一化语义，交给 ALPHA_MAP
  });
});

describe('纯值映射（spec §9.7）', () => {
  it('直映射命中（含大小写/缩写）', () => {
    const { output, stats } = transformCss('color: #FFF;\nborder-top: 1px solid #CBD5E1;', 'a.css');
    expect(output).toBe('color: var(--surface-panel);\nborder-top: 1px solid var(--border-strong);');
    expect(stats.replaced).toBe(2);
  });
  it('Catppuccin 反转逐行一对一（spec §3.3）', () => {
    const css = 'background: #1e1e2e; color: #cdd6f4; border-color: #45475a;';
    const { output } = transformCss(css, 'dialog.css');
    expect(output).toBe(
      'background: var(--surface-panel); color: var(--text-primary); border-color: var(--border-strong);',
    );
  });
  it('seed TOKEN_MAP 关键项抽查', () => {
    expect(TOKEN_MAP['#f8fafc']).toBe('--surface-app');
    expect(TOKEN_MAP['#89b4fa']).toBe('--brand-500');
    expect(TOKEN_MAP['#b45309']).toBe('--accent-amber-strong');
    expect(TOKEN_MAP['#1c2128']).toBe('--surface-menu');
  });
  it('未命中 → 原样保留 + 偏差记录', () => {
    const { output, deviations } = transformCss('color: #6b7280;', 'a.css');
    expect(output).toBe('color: #6b7280;');
    expect(deviations.map((d) => d.value)).toContain('#6b7280');
  });
  it('EXCEPTIONS 命中 → 原样保留且不计偏差', () => {
    const { output, deviations } = transformCss('color: #1a1d23;', 'a.css', {
      exceptions: new Set(['a.css:#1a1d23']),
    });
    expect(output).toBe('color: #1a1d23;');
    expect(deviations).toHaveLength(0);
  });
});

describe('悬空 var(--color-*, fallback)（spec §3.2）', () => {
  it('fallback 可映射 → 改写 + 删 fallback', () => {
    const maps = { tokenMap: { ...TOKEN_MAP, '#6b7280': '--text-muted' } };
    const { output, stats } = transformCss(
      'color: var(--color-text-muted, #6b7280);',
      'a.css',
      maps,
    );
    expect(output).toBe('color: var(--text-muted);');
    expect(stats.danglingRewritten).toBe(1);
  });
  it('fallback 不可映射 → 原样 + 偏差', () => {
    const { output, deviations } = transformCss('color: var(--color-accent, #4a90e2);', 'a.css');
    expect(output).toBe('color: var(--color-accent, #4a90e2);');
    expect(deviations.map((d) => d.value)).toContain('#4a90e2');
  });
});

describe('渐变与注释', () => {
  it('渐变内 hex 不做单值替换：未精确命中 → 原样 + 偏差（spec §9.7）', () => {
    const css = 'background: linear-gradient(180deg, #1f232b 0%, #1a1d23 100%);';
    const { output, deviations } = transformCss(css, 'sp.css');
    expect(output).toBe(css);
    expect(deviations.some((d) => d.value.startsWith('gradient:'))).toBe(true);
  });
  it('整条渐变精确命中 GRADIENT_MAP → 整体替换', () => {
    const g = 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)';
    const { output } = transformCss(`background: ${g};`, 'a.css', {
      gradientMap: { [g.replace(/\s+/g, ' ').toLowerCase()]: 'var(--surface-header)' },
    });
    expect(output).toBe('background: var(--surface-header);');
  });
  it('计划注释 /* --color-* */ 删除（spec §3.4），正文照常替换', () => {
    const { output, stats } = transformCss(
      'border: 1px solid #313244; /* --color-border */',
      'a.css',
    );
    expect(output).toBe('border: 1px solid var(--border-subtle);');
    expect(stats.plannedCommentsStripped).toBe(1);
  });
  it('普通文档注释内 hex 不替换、不计偏差', () => {
    const css = '/* uses #2d323b for the border */\n.x { color: #fff; }';
    const { output, deviations } = transformCss(css, 'a.css');
    expect(output).toContain('#2d323b');
    expect(deviations).toHaveLength(0);
  });
});

describe('alpha / overlay', () => {
  it('ALPHA_MAP 命中（空白归一）→ var()；未命中 → 偏差', () => {
    const maps = { alphaMap: { 'rgba(0,0,0,0.5)': '--overlay-scrim' } };
    const hit = transformCss('background: rgba(0, 0, 0, 0.5);', 'a.css', maps);
    expect(hit.output).toBe('background: var(--overlay-scrim);');
    const miss = transformCss('background: rgba(0, 0, 0, 0.55);', 'a.css', maps);
    expect(miss.output).toBe('background: rgba(0, 0, 0, 0.55);');
    expect(miss.deviations.map((d) => d.value)).toContain('rgba(0, 0, 0, 0.55)');
  });
  it('seed ALPHA_MAP 裁决前为空（Task 3 checkpoint 强制）', () => {
    expect(Object.keys(ALPHA_MAP)).toHaveLength(0);
  });
});

describe('scanResidue / findCssFiles（--check 支撑）', () => {
  it('报告 hex/rgb/悬空 var/.dark 残留，忽略注释内 hex', () => {
    const css = [
      '/* doc #2d323b */',
      '.x { color: #111; background: rgba(0,0,0,0.5); }',
      '.y { color: var(--color-text, #111); }',
      '.dark .z { color: #fff; }',
    ].join('\n');
    const kinds = scanResidue(css).map((r) => r.kind);
    expect(kinds).toContain('hex');
    expect(kinds).toContain('rgb');
    expect(kinds).toContain('dangling-var');
    expect(kinds).toContain('dark-selector');
    expect(kinds.filter((k) => k === 'hex')).toHaveLength(2); // 注释内不计
  });
  it('findCssFiles：递归 32 个 CSS 且排除 tokens.css', () => {
    const files = findCssFiles();
    expect(files.length).toBe(32);
    expect(files.some((f) => f.replace(/\\/g, '/').endsWith('styles/tokens.css'))).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/codemod/__tests__/hex-to-tokens.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `scripts/codemod/hex-to-tokens.mjs`**

```js
#!/usr/bin/env node
// scripts/codemod/hex-to-tokens.mjs — P1 色值收敛 codemod（spec §3.2 / §10.3）。
//
// 模式：
//   （无参数）  dry-run：输出每个文件的替换预览 + 偏差清单，不落盘
//   --write    落盘
//   --check    残留裸值即 exit 1（P1 门禁，spec §10.2）
//
// 映射语义 = 纯值映射（spec §9.7）。TOKEN_MAP / ALPHA_MAP / GRADIENT_MAP / EXCEPTIONS
// 是映射的唯一数据源，实施者不得另建映射。T3 偏差裁决后把裁决结果填入
// ALPHA_MAP / GRADIENT_MAP / EXCEPTIONS（seed TOKEN_MAP 不动）。

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const CSS_ROOT = 'src/renderer';
const TOKENS_CSS = `src/renderer${sep}styles${sep}tokens.css`;

/** seed：直映射（spec §3.1）+ Catppuccin 反转（spec §3.3，逐行一对一）。 */
export const TOKEN_MAP = {
  // —— mockup 直映射 ——
  '#f8fafc': '--surface-app',
  '#ffffff': '--surface-panel',
  '#fff': '--surface-panel',
  // #f1f5f9 / #cbd5e1 与 --text-inverse / --text-inverse-muted 同值（spec §3.1）。
  // 纯值映射取 surface/border 侧；header 等深色面上的文本用法由重灾区人工 review 改为 inverse token（§9.7）。
  '#f1f5f9': '--surface-subtle',
  '#e2e8f0': '--border-subtle',
  '#cbd5e1': '--border-strong',
  '#0f172a': '--text-primary',
  '#475569': '--text-secondary',
  '#94a3b8': '--text-muted',
  '#3b82f6': '--brand-500',
  '#60a5fa': '--brand-400',
  '#93c5fd': '--brand-300',
  '#b45309': '--accent-amber-strong',
  '#10b981': '--accent-emerald',
  '#1c2128': '--surface-menu',
  '#c9d1d9': '--text-inverse-muted',
  // —— Catppuccin 反转（§3.3）——
  '#1e1e2e': '--surface-panel',
  '#181825': '--surface-elevated',
  '#313244': '--border-subtle',
  '#45475a': '--border-strong',
  '#cdd6f4': '--text-primary',
  '#a6adc8': '--text-secondary',
  '#6c7086': '--text-muted',
  '#89b4fa': '--brand-500',
  '#f38ba8': '--accent-rose',
  '#a6e3a1': '--accent-emerald',
  '#f9e2af': '--accent-amber',
};

/** alpha/overlay 值映射；key = 空白归一化后的小写 rgba 串。T3 裁决前为空（§3.2 dry-run 先行）。 */
export const ALPHA_MAP = {};

/** 整条渐变映射；key = 空白归一化后的小写渐变串。T3 裁决前为空。 */
export const GRADIENT_MAP = {};

/** 用户裁决「保留原值」的豁免；元素形如 `<相对路径>:<小写色值>`。T3 裁决前为空。 */
export const EXCEPTIONS = new Set();

const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const RGB_RE = /rgba?\([^)]*\)/gi;
const DANGLING_RE =
  /var\(--color-[a-z0-9-]+,\s*(#[0-9a-fA-F]{3,8}|rgba?\([0-9a-z.,\s%]+\))\s*\)/gi;
const PLANNED_COMMENT_RE = /\/\*\s*--color-[^*]*\*\//g;
const GRADIENT_RE = /linear-gradient\([^;]*?\)/gi;
const DARK_SELECTOR_RE = /\.dark[\s{.,:[>#]/;

export function expandHex(hex) {
  const h = hex.toLowerCase();
  if (h.length === 4 || h.length === 5) {
    return '#' + [...h.slice(1)].map((c) => c + c).join('');
  }
  return h;
}

/** 'rgb(59 130 246)' → '#3b82f6'；带 alpha 或解析失败 → null（带 alpha 走 ALPHA_MAP）。 */
export function rgbSpaceToHex(fn) {
  const m = fn.match(/^rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\)$/i);
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((n) => Math.max(0, Math.min(255, parseInt(n, 10))));
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
}

export function normalizeAlpha(fn) {
  return fn.toLowerCase().replace(/\s+/g, '');
}

export function findCssFiles(root = CSS_ROOT) {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.css') && p !== TOKENS_CSS) files.push(p);
    }
  };
  walk(root);
  return files.sort();
}

/** --check 残留扫描：hex/rgb/悬空 var/计划注释/.dark 选择器；注释内 hex 不计。 */
export function scanResidue(css) {
  const residue = [];
  const add = (index, kind, value) => {
    const line = css.slice(0, index).split('\n').length;
    residue.push({ line, kind, value });
  };
  // 计划注释在掩码前检测（掩码会把注释内容替换为空格）
  for (const m of css.matchAll(/\/\*\s*--color-/g)) add(m.index, 'planned-comment', m[0]);
  const maskComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  const masked = maskComments(css);
  for (const m of masked.matchAll(HEX_RE)) add(m.index, 'hex', m[0]);
  for (const m of masked.matchAll(RGB_RE)) add(m.index, 'rgb', m[0]);
  for (const m of masked.matchAll(/var\(--color-[a-z0-9-]+/gi)) add(m.index, 'dangling-var', m[0]);
  const dark = masked.match(DARK_SELECTOR_RE);
  if (dark) add(dark.index, 'dark-selector', '.dark');
  return residue;
}

function noteDeviation(deviations, value) {
  const key = value.toLowerCase();
  const d = deviations.get(key) ?? { value: key, count: 0 };
  d.count += 1;
  deviations.set(key, d);
}

export function transformCss(css, relFile, maps = {}) {
  const tokenMap = maps.tokenMap ?? TOKEN_MAP;
  const alphaMap = maps.alphaMap ?? ALPHA_MAP;
  const gradientMap = maps.gradientMap ?? GRADIENT_MAP;
  const exceptions = maps.exceptions ?? EXCEPTIONS;
  const deviations = new Map();
  const stats = { plannedCommentsStripped: 0, danglingRewritten: 0, replaced: 0 };
  const excepted = (value) => exceptions.has(`${relFile.replaceAll('\\', '/')}:${value.toLowerCase()}`);
  const note = (value) => noteDeviation(deviations, value);

  // 1) 计划注释删除（spec §3.4）
  let text = css.replace(PLANNED_COMMENT_RE, () => {
    stats.plannedCommentsStripped += 1;
    return '';
  });

  // 2) 切分代码段/注释段：只变换代码段，注释原样保留（注释内 hex 不替换、不计偏差）
  const segments = [];
  let i = 0;
  for (;;) {
    const open = text.indexOf('/*', i);
    if (open === -1) {
      segments.push({ code: text.slice(i) });
      break;
    }
    const close = text.indexOf('*/', open + 2);
    const end = close === -1 ? text.length : close + 2;
    if (open > i) segments.push({ code: text.slice(i, open) });
    segments.push({ comment: text.slice(open, end) });
    i = end;
    if (close === -1) break;
  }

  const mapCode = (code) => {
    // 渐变最先处理并用占位符屏蔽：未精确命中的渐变内的 hex/rgb 不得被后续 pass 单值替换（spec §9.7）
    const hidden = [];
    let out = code.replace(GRADIENT_RE, (whole) => {
      const key = whole.replace(/\s+/g, ' ').toLowerCase();
      if (gradientMap[key]) {
        stats.replaced += 1;
        return gradientMap[key];
      }
      hidden.push(whole);
      return `\u0000${hidden.length - 1}\u0000`;
    });
    out = out.replace(DANGLING_RE, (whole, fallback) => {
      const hex = fallback.startsWith('#') ? expandHex(fallback) : rgbSpaceToHex(fallback);
      const target = hex ? tokenMap[hex] : null;
      if (!target) {
        note(fallback);
        return whole;
      }
      stats.danglingRewritten += 1;
      return `var(${target})`;
    });
    out = out.replace(RGB_RE, (whole) => {
      const asHex = rgbSpaceToHex(whole);
      if (asHex && tokenMap[asHex]) {
        stats.replaced += 1;
        return `var(${tokenMap[asHex]})`;
      }
      const key = normalizeAlpha(whole);
      if (alphaMap[key]) {
        stats.replaced += 1;
        return `var(${alphaMap[key]})`;
      }
      note(whole);
      return whole;
    });
    out = out.replace(HEX_RE, (whole) => {
      const hex = expandHex(whole);
      if (excepted(hex)) return whole;
      const target = tokenMap[hex];
      if (!target) {
        note(whole);
        return whole;
      }
      stats.replaced += 1;
      return `var(${target})`;
    });
    out = out.replace(/\u0000(\d+)\u0000/g, (_, n) => {
      const whole = hidden[Number(n)];
      note(`gradient: ${whole.replace(/\s+/g, ' ').toLowerCase()}`);
      return whole;
    });
    return out;
  };

  let output = '';
  for (const seg of segments) output += seg.code !== undefined ? mapCode(seg.code) : seg.comment;

  for (const d of deviations.values()) {
    const at = output.toLowerCase().indexOf(d.value);
    d.firstLine = at === -1 ? 0 : output.slice(0, at).split('\n').length;
  }
  return { output, deviations: [...deviations.values()], stats };
}

function scanDarkGuard() {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|html)$/.test(name)) {
        const src = readFileSync(p, 'utf8');
        src.split('\n').forEach((line, idx) => {
          if (/\bdark:[a-z]/i.test(line)) offenders.push(`${p}:${idx + 1}: dark-variant ${line.trim().slice(0, 80)}`);
        });
      }
    }
  };
  walk(CSS_ROOT);
  return offenders;
}

function main(argv) {
  const mode = argv.includes('--write') ? 'write' : argv.includes('--check') ? 'check' : 'dry';
  const files = findCssFiles();

  if (mode === 'check') {
    const offenders = [];
    for (const f of files) {
      for (const r of scanResidue(readFileSync(f, 'utf8'))) {
        offenders.push(`${f}:${r.line}: ${r.kind} ${r.value}`);
      }
    }
    offenders.push(...scanDarkGuard());
    if (offenders.length > 0) {
      console.error(`[hex-to-tokens] --check 失败：残留 ${offenders.length} 处`);
      for (const o of offenders) console.error(`  ${o}`);
      process.exit(1);
    }
    console.log('[hex-to-tokens] --check 通过：0 残留（spec §10.2 P1 门禁）');
    return;
  }

  let totalReplaced = 0;
  let totalDangling = 0;
  let totalComments = 0;
  let totalDeviations = 0;
  for (const f of files) {
    const rel = f.replaceAll('\\', '/');
    const { output, deviations, stats } = transformCss(readFileSync(f, 'utf8'), rel);
    totalReplaced += stats.replaced;
    totalDangling += stats.danglingRewritten;
    totalComments += stats.plannedCommentsStripped;
    totalDeviations += deviations.length;
    const changed =
      stats.replaced + stats.danglingRewritten + stats.plannedCommentsStripped + deviations.length > 0;
    if (!changed) continue;
    console.log(`\n== ${rel}  (替换 ${stats.replaced} / 悬空改写 ${stats.danglingRewritten} / 删注释 ${stats.plannedCommentsStripped})`);
    for (const d of deviations) console.log(`   偏差 ${d.value}  ×${d.count}  (首现 L${d.firstLine})`);
    if (mode === 'write') writeFileSync(f, output);
  }
  console.log(
    `\n[${mode === 'write' ? '--write' : 'dry-run'}] 替换 ${totalReplaced} / 悬空改写 ${totalDangling} / 删注释 ${totalComments}；未映射偏差 ${totalDeviations} 种`,
  );
  if (mode === 'dry') {
    console.log('[dry-run] 未落盘。按 spec §3.2 dry-run 先行：偏差裁决（Task 3 checkpoint）后才允许 --write。');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/codemod/__tests__/hex-to-tokens.test.ts`
Expected: PASS（约 17 项）

- [ ] **Step 5: CLI dry-run 冒烟（只看输出，不落盘）**

Run: `node scripts/codemod/hex-to-tokens.mjs`
Expected: 逐文件输出替换统计 + 未映射偏差清单；末行提示 dry-run 未落盘；exit 0

- [ ] **Step 6: 全量回归 + 提交**

Run: `pnpm test && pnpm type-check`
Expected: 全绿、type-check 通过

```bash
pnpm format scripts/codemod/hex-to-tokens.mjs tests/codemod/
git add scripts/codemod/hex-to-tokens.mjs tests/codemod/
git commit -m "feat(p1): hex-to-tokens codemod（dry-run/--write/--check，TOKEN_MAP 单一数据源）"
```

---

### Task 3: 【CHECKPOINT · 停手上报】dry-run 偏差清单 → 用户裁决 → spec 修订

**Files:**
- Create: `docs/superpowers/plans/2026-08-30-p1-visual-foundation-deviations.md`（裁决产物）
- Modify: `scripts/codemod/hex-to-tokens.mjs`（裁决结果填入 ALPHA_MAP/GRADIENT_MAP/EXCEPTIONS）
- Modify: `src/renderer/styles/tokens.css`（裁决通过的新 token）
- Modify: `docs/superpowers/specs/2026-08-30-ui-v2-workbench-design.md`（§3.1/§9.8 修订，spec §10.5）

**Interfaces:**
- Consumes: Task 2 的 CLI dry-run 输出、本 plan 附录 A 推荐表
- Produces: 填充完毕的 ALPHA_MAP/GRADIENT_MAP/EXCEPTIONS + tokens.css 最终 token 集（Task 4 `--write` 的前提）

> 本任务对应 spec §10.1「发现与代码现实冲突 → 停手上报」与 §3.2「dry-run 先行、偏差人工逐项裁决」。**未经用户确认不得执行 `--write`（Task 4）。**

- [ ] **Step 1: 产出偏差清单**

Run: `node scripts/codemod/hex-to-tokens.mjs > /tmp/p1-dryrun.txt 2>&1 && tail -40 /tmp/p1-dryrun.txt`
Expected: 偏差清单 ≈ 100 种 distinct 值（seed 覆盖 ~460/835 hex + 少量 rgba；其余进偏差）

- [ ] **Step 2: 写裁决文档**

创建 `docs/superpowers/plans/2026-08-30-p1-visual-foundation-deviations.md`：开头声明「本文件是 spec §3.2 偏差裁决产物」，然后逐 bucket 抄录 dry-run 实际偏差（以附录 A 推荐表为初始建议列），每 bucket 一行裁决位：`建议目标 / 用户裁决：________`。附录 A 第 0 节的新 token 提案原样附上。

- [ ] **Step 3: 停手上报**

向用户呈报：偏差文档路径 + 附录 A 的 15 个新 token 提案 + Deviations 1-5 项。**等待用户逐 bucket 确认**（可整体按推荐通过）。此步骤终止本轮执行，把用户裁决记录回 Step 2 文档。

- [ ] **Step 4: 应用裁决（用户确认后）**

- `scripts/codemod/hex-to-tokens.mjs`：把裁决为「映射」的 rgba 值填入 `ALPHA_MAP`、整条渐变填入 `GRADIENT_MAP`（ScriptPanel.css:301 的 `linear-gradient(180deg, #1f232b 0%, #1a1d23 100%)` 按裁决坍缩为 `var(--chrome-bg-deep)`，即两 stop 同 token 时取该 token 整体替换）、保留原值的填入 `EXCEPTIONS`（`'styles.css:#1a1d23'` 格式）。
- `src/renderer/styles/tokens.css`：把通过的新 token 追加到对应分组（附录 A 第 0 节的值），并在注释里标注「T3 裁决新增」。
- 重跑 Task 2 单测：若 seed 断言（`ALPHA_MAP` 为空）冲突，把该断言改为「裁决后 = 预期键集」。

- [ ] **Step 5: spec 修订 + 提交**

按 spec §10.5 修订 spec §3.1 token 表（追加裁决 token）与 §9.8（改为「mockup 外新增 token 以 §3.1 裁决清单为准」），并在 §9 追加决策 17：P1 偏差裁决结果以 `docs/superpowers/plans/2026-08-30-p1-visual-foundation-deviations.md` 为准。

```bash
git add docs/superpowers/plans/2026-08-30-p1-visual-foundation-deviations.md docs/superpowers/specs/2026-08-30-ui-v2-workbench-design.md scripts/codemod/hex-to-tokens.mjs src/renderer/styles/tokens.css
git commit -m "docs(p1): 偏差裁决落盘 + spec §3.1/§9.8 修订（新增 token 清单）"
```

---

### Task 4: 执行 `--write` + 重灾区人工 review

**Files:**
- Modify: 32 个 `src/renderer/**/*.css`（codemod 自动 + 人工语义修正）

**Interfaces:**
- Consumes: Task 3 填充完毕的映射表
- Produces: 全仓 CSS 裸色值 = 0（EXCEPTIONS 豁免除外）；119 处悬空 var 已改写；53 处计划注释已删除

- [ ] **Step 1: 写入**

Run: `node scripts/codemod/hex-to-tokens.mjs --write`
Expected: 32 文件落盘；偏差种类 = 0（除 EXCEPTIONS）

- [ ] **Step 2: 数量核账**

```bash
grep -rEoh "#[0-9a-fA-F]{3,8}\b" src/renderer --include="*.css" | wc -l
grep -rEoh "rgba?\(" src/renderer --include="*.css" | wc -l
grep -rc "var(--color-" src/renderer --include="*.css" | grep -v ":0" | wc -l
grep -rc -e "/\* --color-" src/renderer --include="*.css" | grep -v ":0" | wc -l
```
Expected: 前两条 = EXCEPTIONS 内豁免数（裁决后为已知常量，通常 0-9）；后两条 = 0

- [ ] **Step 3: 全量测试**

Run: `pnpm test && pnpm type-check`
Expected: 全绿（CSS-only 改动不应破坏行为测试；若样式快照类断言失败，逐个核对是断言硬编码 hex 的更新——属于允许的测试同步，逐条记录进 Deviations）

- [ ] **Step 4: 重灾区人工 review（15 文件，spec §3.2）**

Run: `pnpm dev`（另开终端）后用浏览器逐个走查，对照 `docs/mockups/audit-2026-08-30/` 的 6 张改前截图：

| 文件 | 走查 surface |
|---|---|
| styles.css | header / 下拉菜单 / 空态主区（重点：#f1f5f9/#cbd5e1 值冲突处按语义改 `--text-inverse`/`--text-inverse-muted`，styles.css 深色 chrome 区全部文本用 inverse 族） |
| ScriptPanel.css | 脚本面板（保暗 chrome，确认 `--chrome-*` 观感） |
| NewProjectDialog.css / ModuleFromBswmdPicker.css / BswmdPickerDialog.css / ConfirmDialog.css / ConfirmDialog2.css / CascadeConfirmDialog.css / RemoveModuleConfirmDialog.css / XlsxBatchWizard / DbcImportWizard | 反转组件：打开各 dialog，确认亮色观感（audit-03/04/05 对照） |
| ValidationPanel.css / ProjectPanel.css / FileListTab.css / OdxViewer.css / DbcViewer.css / ErrorBanner.css | 左面板 tabs / viewer / 错误横幅 |

发现问题 = 语义错位（值映射对了角色不对）→ 直接把该处 `var(--A)` 改成语义正确的 `var(--B)`（spec §9.7 允许，不算偏离）；结构性视觉失衡 → 停手上报。

- [ ] **Step 5: 提交**

```bash
pnpm format "src/renderer/**/*.css"
git add src/renderer
git commit -m "refactor(p1): 914 处裸色值收敛为 tokens 变量 + Catppuccin 13 组件反转亮色"
```

---

### Task 5: 单主题清理（.dark 死代码 / dark: 变体 / 测试断言）

**Files:**
- Modify: `src/renderer/components/editor/modes/EnumEditor.css`（:30-44）
- Modify: `src/renderer/components/editor/modes/BooleanEditor.css`（:30-34）
- Modify: `src/renderer/components/editor/ParamEditor.tsx`、`editor/modes/{StringEditor,IntegerEditor,MultilineEditor,FloatEditor,ReferenceEditor}.tsx`
- Modify: `src/renderer/index.html`（:9）
- Modify: `src/renderer/components/editor/__tests__/ParamEditor.test.tsx`（:339-355）
- Test: `src/renderer/__tests__/p1-single-theme.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `dark:` / `.dark` 全仓为 0（guard 测试固化，防回潮）

- [ ] **Step 1: 写失败 guard 测试**

创建 `src/renderer/__tests__/p1-single-theme.test.ts`：

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url)); // src/renderer/

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe('P1 单主题 guard（spec §3.4 / §9.1）', () => {
  it('src/renderer 全部 .css 无 .dark 选择器', () => {
    const css = walk(root).filter((f) => f.endsWith('.css') && !f.endsWith('tokens.css'));
    for (const f of css) expect(readFileSync(f, 'utf8'), f).not.toMatch(/\.dark[\s{.,:[>#]/);
  });
  it('src/renderer 全部 .tsx/.ts/.html 无 dark: 变体', () => {
    const src = walk(root).filter((f) => /\.(tsx?|html)$/.test(f));
    for (const f of src) expect(readFileSync(f, 'utf8'), f).not.toMatch(/\bdark:[a-z]/i);
  });
});
```

Run: `pnpm vitest run src/renderer/__tests__/p1-single-theme.test.ts`
Expected: FAIL（现状 EnumEditor/BooleanEditor/.tsx 有 `.dark`/`dark:`）

- [ ] **Step 2: 删 `.dark` 死代码（精确编辑）**

`EnumEditor.css` — 删除以下两段（连同 :36-40 解释 `<option>` 的注释块一并删除）：

```css
.dark .enum-editor {
  background-color: #1e293b; /* slate-800 */
  border-color: #475569; /* slate-600 */
  color: #f8fafc; /* slate-50 */
}
```

与

```css
.dark .enum-editor option {
  background-color: #1e293b;
  color: #f8fafc;
}
```

`BooleanEditor.css` — 删除：

```css
.dark .boolean-editor {
  background-color: #1e293b; /* slate-800 */
  border-color: #94a3b8; /* slate-400 — bumped from slate-600 so the
                                box stays visible against slate-800. */
  color: #f8fafc; /* slate-50 */
}
```

并把 BooleanEditor.css 头部注释中「the dark-mode section background (`bg-slate-800`) shows through」一句改为「the light section background shows through」（其余不动）。

- [ ] **Step 3: 删 `dark:` 变体**

```bash
sed -i -E 's/ ?dark:[^ "]+//g' \
  src/renderer/components/editor/ParamEditor.tsx \
  src/renderer/components/editor/modes/StringEditor.tsx \
  src/renderer/components/editor/modes/IntegerEditor.tsx \
  src/renderer/components/editor/modes/MultilineEditor.tsx \
  src/renderer/components/editor/modes/FloatEditor.tsx \
  src/renderer/components/editor/modes/ReferenceEditor.tsx
grep -rn "dark:" src/renderer --include="*.tsx" --include="*.html"
```
Expected: grep 无输出

sed 是全文替换——**注释里的 `dark:text-slate-50` 等字样也被移除**（如 ParamEditor.tsx:160 的 Sprint 13+ Q2 注释），替换后该类注释可能措辞不通。逐文件 `git diff` 检查被 sed 影响的注释行，把不通顺的注释手工改写为亮色描述（例如「explicit text-slate-900 / dark:text-slate-50」→「explicit text-slate-900」）。

`index.html` 第 9 行精确编辑：

```html
<body class="bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-50">
```
→
```html
<body class="bg-slate-50 text-slate-900">
```

- [ ] **Step 4: 同步测试断言**

`ParamEditor.test.tsx` :343 一带，把

```ts
expect(h2.className).toMatch(/dark:text-slate-50/);
```
改为
```ts
expect(h2.className).toMatch(/text-slate-900/);
expect(h2.className).not.toMatch(/dark:/);
```

:355 起的 IntegerEditor 同名断言（`dark:text-slate-50`）同样改为 `toMatch(/text-slate-900/)` + `not.toMatch(/dark:/)`；文件内其余 `dark:` 相关注释（:339、:349-351）同步措辞为亮色描述。

- [ ] **Step 5: 跑 guard + 相关测试**

Run: `pnpm vitest run src/renderer/__tests__/p1-single-theme.test.ts src/renderer/components/editor src/renderer/components/tree`
Expected: guard PASS；ParamEditor/Enum/Boolean/Tree 既有测试全绿（Tree.tsx 的 selectedPath 行为不受影响）

- [ ] **Step 6: 提交**

```bash
pnpm format src/renderer/components/editor src/renderer/index.html src/renderer/__tests__/p1-single-theme.test.ts
git add src/renderer/components/editor src/renderer/index.html src/renderer/__tests__/p1-single-theme.test.ts
git commit -m "refactor(p1): 删除 .dark 死代码与全部 dark: 变体，light 单主题落地（+guard 测试）"
```

---

### Task 6: stylelint 门禁接线（deps / config / CI / verify）

**Files:**
- Modify: `package.json`（devDependencies 精确版本 + scripts）
- Create: `stylelint.config.mjs`
- Modify: `.github/workflows/ci.yml`（lint job，`- run: pnpm lint` 之后）
- Modify: `scripts/verify.mjs`（STAGES 数组 lint 之后）

**Interfaces:**
- Consumes: Task 4 后的全仓 CSS（0 裸值）+ tokens.css（豁免）
- Produces: `pnpm stylelint` 门禁（CI lint 阶段 + 本地 `pnpm verify`）；spec §3.5 版本锁定：stylelint **17.14.1**、stylelint-config-standard **40.0.0**

- [ ] **Step 1: 安装（精确版本，spec §3.5 授权 plan 锁定）**

```bash
pnpm add -D -E stylelint@17.14.1 stylelint-config-standard@40.0.0
```

- [ ] **Step 2: 创建 `stylelint.config.mjs`**

```js
/** P1 防回潮门禁（spec §3.5）。tokens.css 是唯一裸色值豁免处（spec §10.3）。 */
export default {
  extends: ['stylelint-config-standard'],
  rules: {
    'at-rule-no-unknown': [true, { ignoreAtRules: ['tailwind', 'apply', 'layer', 'config'] }],
    'color-no-hex': [true, { message: 'P1 §10.3：禁止裸 hex，改用 tokens.css 变量' }],
    'color-named': 'never',
    'declaration-property-value-disallowed-list': {
      '/^(color|background|border|fill|stroke|box-shadow)/': ['/rgba?\\(|hsla?\\(/'],
    },
  },
  overrides: [
    {
      files: ['src/renderer/styles/tokens.css'],
      rules: {
        'color-no-hex': null,
        'declaration-property-value-disallowed-list': null,
      },
    },
  ],
};
```

> `at-rule-no-unknown` 必须忽略 Tailwind 指令，否则 styles.css 的 `@tailwind` 会误报。另外 `stylelint-config-standard` 预设含大量格式类规则（comment 空行、降序 specificity 等），若全量跑出**与色值无关**的存量风格 error：在 `rules` 里逐条关闭该规则并在本 plan `## Deviations` 记录一行（规则名 + 关闭原因）——不得为迁就存量风格放松任何色值规则。

- [ ] **Step 3: 接线**

`package.json` scripts 增加（`"lint"` 之后）：

```json
"stylelint": "stylelint \"src/renderer/**/*.css\"",
```

`.github/workflows/ci.yml` lint job 内 `- run: pnpm lint`（约 :32）之后加一行：

```yaml
      - run: pnpm stylelint
```

`scripts/verify.mjs` STAGES 数组 `{ name: 'lint', ... }` 之后插入：

```js
  { name: 'stylelint', cmd: 'pnpm', args: ['stylelint'] },
```

- [ ] **Step 4: 验证门禁有牙（先证伪再证真）**

```bash
printf '.x { color: #123456; }' > src/renderer/__stylelint_probe__.css
pnpm stylelint; echo "exit=$?"
rm src/renderer/__stylelint_probe__.css
pnpm stylelint; echo "exit=$?"
```
Expected: 第一次 exit=1（报 color-no-hex），第二次 exit=0

- [ ] **Step 5: 提交**

```bash
pnpm format package.json stylelint.config.mjs scripts/verify.mjs .github/workflows/ci.yml
git add package.json pnpm-lock.yaml stylelint.config.mjs scripts/verify.mjs .github/workflows/ci.yml
git commit -m "chore(p1): stylelint 禁裸色值门禁接入 CI lint 与 pnpm verify（spec §3.5）"
```

---

### Task 7: visual regression 6 surface 基线

**Files:**
- Modify: `playwright.config.ts`
- Create: `tests/e2e/visual-regression.spec.ts`
- Create: `tests/visual/baseline/**`（生成产物，入仓，spec §10.3）

**Interfaces:**
- Consumes: 现有 webServer（`pnpm dev` → localhost:5173，chromium headless）；既有 e2e 的打开助手（原样复制，见 Step 2）
- Produces: `pnpm test:e2e visual-regression` 门禁；基线在 `tests/visual/baseline/visual-regression.spec.ts/`

- [ ] **Step 1: playwright.config.ts 指定基线目录**

`defineConfig({...})` 内 `use` 同级增加：

```ts
  snapshotPathTemplate: 'tests/visual/baseline/{testFileName}/{arg}{ext}',
```

（刻意不含 `{platform}`——基线跨平台共享，靠 maxDiffPixelRatio 容差吸收字体渲染差。）

- [ ] **Step 2: 创建 `tests/e2e/visual-regression.spec.ts`**

```ts
// P1 visual regression（spec §3.6）— 6 surface 基线。
// maxDiffPixelRatio 0.02 = spec「逐像素对比的合理色差窗口」。
// 打开各 surface 的助手从既有 spec 原样复制，选择器已由那些用例验证：
//   openNewProjectDialog ← tests/e2e/new-project-dialog.spec.ts:24
//   ScriptPanel 打开步骤 ← tests/e2e/script-panel.spec.ts 的 describe 初始 setup
//   RemoveModuleConfirmDialog 触发 ← tests/e2e/remove-bswmd.spec.ts 的 setup
//   delete-ecuc ConfirmDialog 触发 ← tests/e2e/delete-ecuc-module.spec.ts 的 setup
import { expect, test, type Page } from '@playwright/test';

async function waitForAppReady(page: Page): Promise<void> {
  await expect(page.getByTestId('app-header')).toBeVisible();
  await expect(page.getByTestId('left-tab-files')).toBeVisible();
}

const OPTS = { maxDiffPixelRatio: 0.02, animations: 'disabled' as const };

test.describe('P1 visual baselines', () => {
  test('surface-01 默认工作区（header + 左面板 + 空态主区）', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await expect(page).toHaveScreenshot('surface-01-default-workspace', OPTS);
  });

  test('surface-02 左面板文件 tab', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.getByTestId('left-tab-files').click();
    await expect(page).toHaveScreenshot('surface-02-files-tab', OPTS);
  });

  test('surface-03 NewProjectDialog（反转组件）', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    // openNewProjectDialog：从 tests/e2e/new-project-dialog.spec.ts:24 原样复制
    await expect(page).toHaveScreenshot('surface-03-new-project-dialog', OPTS);
  });

  test('surface-04 ScriptPanel（保暗 chrome）', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    // ScriptPanel 打开步骤：从 tests/e2e/script-panel.spec.ts 复制
    await expect(page).toHaveScreenshot('surface-04-script-panel', OPTS);
  });

  test('surface-05 RemoveModuleConfirmDialog（反转组件）', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    // 触发步骤：从 tests/e2e/remove-bswmd.spec.ts 复制
    await expect(page).toHaveScreenshot('surface-05-remove-module-confirm', OPTS);
  });

  test('surface-06 delete-ecuc ConfirmDialog（反转组件）', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    // 触发步骤：从 tests/e2e/delete-ecuc-module.spec.ts 复制
    await expect(page).toHaveScreenshot('surface-06-confirm-dialog', OPTS);
  });
});
```

（执行者把四个「复制」注释替换为对应 spec 文件的原样步骤代码——那些用例已在维护中，触发路径以它们为准。）

- [ ] **Step 3: 生成基线并人工检查**

```bash
pnpm test:e2e visual-regression --update-snapshots
ls tests/visual/baseline/visual-regression.spec.ts/
```

逐张 Read 基线图确认内容正确（不是白屏/错层）；发现 surface 未弹出（助手复制有误）→ 修复后重新 `--update-snapshots`。

- [ ] **Step 4: 复跑确认通过**

Run: `pnpm test:e2e visual-regression`
Expected: 6 passed（基线已入仓，重跑无 diff）

- [ ] **Step 5: 提交**

```bash
git add playwright.config.ts tests/e2e/visual-regression.spec.ts tests/visual/
git commit -m "test(p1): visual regression 6 surface 基线入仓（spec §3.6/§10.3）"
```

---

### Task 8: P1 门禁全跑 + 一致性自检清单

**Files:**
- Modify: `docs/superpowers/plans/2026-08-30-p1-visual-foundation.md`（勾掉附录 B 自检清单）

- [ ] **Step 1: §10.2 门禁逐条跑**

```bash
node scripts/codemod/hex-to-tokens.mjs --check   # 期望：0 残留，exit 0
pnpm stylelint                                    # 期望：0 error
pnpm test                                         # 期望：全绿（~3003 + 新增）
pnpm test:e2e visual-regression                   # 期望：6 passed
pnpm verify                                       # 期望：全阶段通过（含 build）
```

- [ ] **Step 2: spec §3.6 验收核对**

- 全仓 CSS 裸色值 = 0（tokens.css + EXCEPTIONS 豁免）✓/✗
- 6 surface 基线建立且通过（反转组件走新基线）✓/✗
- ~3003 单测全绿 ✓/✗

- [ ] **Step 3: 更新附录 B 自检清单并提交**

```bash
git add docs/superpowers/plans/2026-08-30-p1-visual-foundation.md
git commit -m "docs(p1): 一致性自检清单打勾，P1 达成 DoD"
```

---

## 附录 A：偏差裁决推荐表（Task 3 输入；dry-run 实测输出为权威数据源）

### 第 0 节：新 token 提案（15 个，spec §3.1/§9.8 修订提案）

| Token | 值 | 收敛对象（实测） |
|---|---|---|
| `--brand-tint` | `#dbeafe` | #dbeafe(4) #bfdbfe(1) |
| `--brand-tint-soft` | `#eff6ff` | #eff6ff(1) #eef2ff(2) |
| `--rose-tint` | `#fef2f2` | #fef2f2(6) |
| `--rose-tint-strong` | `#fee2e2` | #fee2e2(4) #fecaca(1) |
| `--amber-tint` | `#fef3c7` | #fef3c7(5) #fff8e1(2) #fff7ed(2) #ffedd5(1) |
| `--emerald-tint` | `#dcfce7` | #dcfce7(1) #a7f3d0(1) #ecfdf5(1) #f0fdfa(1) |
| `--accent-rose-strong` | `#b91c1c` | #991b1b(12) #b91c1c(4) #7f1d1d(3) |
| `--chrome-bg` | `#1e293b` | #1e293b(20)（styles.css 深色 chrome 底） |
| `--chrome-bg-deep` | `#1a1d23` | #1a1d23(3) #1f232b(1) #22262e(3) #262a31(1)（ScriptPanel 深底/渐变端） |
| `--chrome-border` | `#334155` | #334155(13) #2d323b(14) #30363d(3) #3d424b(5) #484f58(2)（保暗区边框） |
| `--overlay-scrim` | `rgba(0,0,0,0.5)` | rgba(0,0,0,0.4–0.55)（~22 处弹窗遮罩） |
| `--overlay-scrim-soft` | `rgba(0,0,0,0.2)` | rgba(0,0,0,0.06–0.35)（~10 处弱遮罩） |
| `--brand-alpha` | `rgba(59,130,246,0.12)` | rgba(59,130,246,0.06–0.15)(5) + 反转后 rgba(137,180,250,*)(6) |
| `--brand-alpha-soft` | `rgba(59,130,246,0.06)` | rgba(59,130,246,0.06/0.08) 低档 |
| `--chrome-hairline` | `rgba(255,255,255,0.1)` | rgba(255,255,255,0.02–0.2)(6)（保暗区发丝线） |

### 第 1 节：hex 偏差 bucket（值(频次) → 建议目标）

| # | bucket | 建议目标 | 备注 |
|---|---|---|---|
| B1 | #6b7280(14) #64748b(11) #9ca3af(1) | `--text-muted` | 灰字主力 |
| B2 | #555(5) #666(2) #757575(1) #4b5563(1) #374151(2) | `--text-secondary` | 深灰字 |
| B3 | #111(2) #222(1) #3c3c3c(1) #1f2937(1) | `--text-primary` | 近黑字 |
| B4 | #e5e7eb(10) #e4e6eb(5) #e8ecf1(2) #eef1f6(1) #dce0e6(2) #eee(2) | `--border-subtle` | 浅灰边 |
| B5 | #d1d5db(9) #ccc(8) #ddd(3) #d4d6db(1) | `--border-strong` | 中灰边 |
| B6 | #f9fafb(3) #fafafa(2) #f5f7fa(4) | `--surface-app` | 极浅面 |
| B7 | #f3f4f6(4) #f1f3f5(3) #f3f3f3(2) #f5f5f5(1) #f0f0f0(1) | `--surface-subtle` | 浅灰面 |
| B8 | #2563eb(12) #4a90e2(5) #4f46e5(3) #357abd(2) #82aaff(1) #1e40af(2) | `--brand-500` | 蓝变体归一 |
| B9 | #1e3a8a(12) | 文字处→`--text-primary`；styles.css:251 深色区底→`--chrome-border` | 需 dry-run 上下文拆分 |
| B10 | #0ea5e9(5) | `--accent-cyan` | sky-500 |
| B11 | #ef4444(2) #f87171(1) #e53935(1) #c00(1) #ff5370(2) #ff8a80(2) | `--accent-rose` | 红亮变体 |
| B12 | #92400e(5) #8a6d00(2) #9a3412(1) | `--accent-amber-strong` | 深琥珀字 |
| B13 | #f57c00(1) #ffcb6b(2) #e0c070(1) | `--accent-amber` | 亮琥珀 |
| B14 | #43a047(2) #81c784(1) #16a34a(1) #15803d(1) #166534(1) #065f46(1) #115e59(1) | `--accent-emerald` | 绿变体 |
| B15 | Catppuccin 表外 #585b70(20) #74c7ec(15) #b4befe(4) #eba0ac(6) #94e2d5(2) #fab387(2) | #585b70→`--border-strong`；#74c7ec→`--brand-300`（选区高亮）；#b4befe→`--brand-400`；#eba0ac→`--accent-rose`；#94e2d5→`--accent-cyan`；#fab387→`--accent-amber` | 反转组件内，视觉归一可接受 |
| B16 | 深色 chrome 散值（styles.css/ScriptPanel 保暗区，见第 0 节三 token） | `--chrome-bg` / `--chrome-bg-deep` / `--chrome-border` | 按所在面取用 |
| B17 | 单发紫/粉 #9333ea(1) #6b21a8(1) #f3e8ff(1) #9d174d(1) #fdf2f8(1) | **默认保留原值 + EXCEPTIONS 豁免** | 疑似 Diff/语义高亮专色，映射反而失真 |
| B18 | #334155(13) | 浅色区文字→`--text-secondary`；保暗区→`--chrome-border` | 需上下文拆分 |

### 第 2 节：rgba/box-shadow 偏差

| # | bucket | 建议目标 |
|---|---|---|
| R1 | rgba(0,0,0,0.4–0.55)（弹窗遮罩 ~22） | `--overlay-scrim` |
| R2 | rgba(0,0,0,0.06–0.35)（弱遮罩 ~10） | `--overlay-scrim-soft` |
| R3 | rgba(59,130,246,0.06–0.15)(5) + rgba(137,180,250,*)(6) | `--brand-alpha` / `--brand-alpha-soft` |
| R4 | rgba(255,255,255,0.02–0.2)(6) | `--chrome-hairline` |
| R5 | 状态 alpha 零散：rgba(185,28,28,0.06)(3) rgba(252,165,165,0.1)(2) rgba(249,226,175,0.25/0.15) rgba(245,158,11,0.3/0.12) rgba(243,139,168,0.1) rgba(244,67,54,0.12) rgba(14,165,233,0.15) rgba(67,160,71,0.12) | 改用对应实 tint 底色（`--rose-tint`/`--amber-tint`/`--emerald-tint`），alpha 底→实 tint 属视觉归一 |
| R6 | box-shadow 一次值（自定义几何 + 黑 alpha） | 归并 `--shadow-sm/md/lg`（几何归一，spec §3.5 连 box-shadow 一起禁 rgba）；明显特异的（如 inset 焦点环）逐条裁决 |
| R7 | rgb(59 130 246)(2) rgb(241 245 249)(2) rgb(15 23 42)(2) rgb(100 116 139)(2) rgb(248 250 252)(1) rgb(226 232 240)(1) rgb(203 213 225)(1) | 脚本自动归一化 hex 后走 seed TOKEN_MAP（B1 的 #64748b→`--text-muted`） |

---

## 附录 B：§10.2 P1 一致性自检清单（Task 8 逐项打勾）

- [ ] `node scripts/codemod/hex-to-tokens.mjs --check` → 输出 0 残留裸色值，exit 0
- [ ] `pnpm stylelint "src/renderer/**/*.css"` → 0 error
- [ ] `pnpm test` 全绿（~3003 + 新增：tokens.test 35 项、codemod 17 项、p1-single-theme 2 项）
- [ ] visual regression 6 surface 基线建立且通过（反转组件走新基线）
- [ ] `pnpm verify` 全阶段通过
- [ ] Deviations 1-5 项均已经用户确认（plan 评审 / Task 3 checkpoint）
- [ ] spec §3.1/§9.8/§9.17 修订已按 §10.5 提交
- [ ] 偏差裁决文档已入仓：`docs/superpowers/plans/2026-08-30-p1-visual-foundation-deviations.md`
- [ ] 全部 commit 只包含本 plan 列出的文件（无 `git add -A`）
