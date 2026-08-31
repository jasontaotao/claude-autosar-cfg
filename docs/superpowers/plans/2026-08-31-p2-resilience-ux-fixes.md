# P2 健壮性 + UX 小修 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 spec §4 的 P2 阶段：ErrorBoundary 分级降级（6 局部 boundary + App 级样式化兜底）、NewProjectDialog 验证时机、主区空状态引导、保存按钮层级化。

**Architecture:** 新增可复用 `PanelErrorBoundary`（包一层现有 `ErrorBoundary`，渲染面板内错误卡片），在 6 个面板挂载点包裹；viewer 组件拆 `Inner` 以便故障注入测试。行为改动均为低风险局部改动，不引入新依赖。

**Tech Stack:** React 18.3.1（class ErrorBoundary）、zustand store、vitest + testing-library、Playwright（chromium headless + vite dev harness）、手写 BEM CSS + tokens。

**Spec:** `docs/superpowers/specs/2026-08-30-ui-v2-workbench-design.md` §4（P2 详细设计）、§9.13（6 个局部 boundary 全覆盖）、§10.2（P2 DoD）。

## Global Constraints

- React 18.3.1 pinned；P2 不新增任何 npm 依赖。
- light 单主题（spec §9.1）；所有新增 CSS 颜色一律用 `src/renderer/styles/tokens.css` 变量，禁止裸 hex/rgba（stylelint 门禁）。
- 不接外部遥测（spec Non-goal）：错误只 `console.error` + 卡片内「复制详情」。
- 每个新 i18n key 必须同时出现在三处：`src/shared/i18n/app.ts`（interface AppMessages）、`src/shared/i18n.en/app.ts`、`src/shared/i18n.zh-CN/app.ts`。
- 冲突裁决优先级：spec §9 决策记录 > spec 正文 > 本 plan（spec §10.1）。
- `pnpm format` 有全仓副作用；格式化用 `pnpm exec prettier --write <files>`（P1 裁决 R2）。
- 提交信息用 conventional commits，scope `p2`。

---

### Task 1: PanelErrorBoundary 组件 + i18n keys

**Files:**

- Create: `src/renderer/components/PanelErrorBoundary.tsx`
- Create: `src/renderer/components/PanelErrorBoundary.css`
- Create: `src/renderer/components/__tests__/PanelErrorBoundary.test.tsx`
- Modify: `src/shared/i18n/app.ts`（AppMessages interface 追加 5 个 key）
- Modify: `src/shared/i18n.en/app.ts`、`src/shared/i18n.zh-CN/app.ts`（同名 key 的 en/zh 值）

**Interfaces:**

- Consumes: 现有 `ErrorBoundary`（`src/renderer/components/ErrorBoundary.tsx`）的 `fallback?: (error: Error, reset: () => void) => ReactNode` render-prop。
- Produces: `PanelErrorBoundary({ panel, locale, onClose?, children })`，`panel` 为字面量联合 `'tree' | 'param-editor' | 'script-panel' | 'dbc-viewer' | 'odx-viewer' | 'validation-panel'`；fallback 卡片带 `data-testid="panel-error-<panel>"`，内含重试 / 复制详情 /（可选）关闭三个按钮。Task 3-5 依赖此签名。

- [ ] **Step 1: 追加 i18n keys（先定义契约）**

`src/shared/i18n/app.ts` 的 `AppMessages` interface 追加：

```ts
  // --- P2 panel error card (spec §4.1) ---
  readonly 'panel.error.title': string;
  readonly 'panel.error.retry': string;
  readonly 'panel.error.copyDetails': string;
  readonly 'panel.error.copied': string;
  readonly 'panel.error.close': string;
```

`src/shared/i18n.en/app.ts`：

```ts
  'panel.error.title': 'Panel error',
  'panel.error.retry': 'Retry',
  'panel.error.copyDetails': 'Copy details',
  'panel.error.copied': 'Copied',
  'panel.error.close': 'Close',
```

`src/shared/i18n.zh-CN/app.ts`：

```ts
  'panel.error.title': '面板出现错误',
  'panel.error.retry': '重试',
  'panel.error.copyDetails': '复制详情',
  'panel.error.copied': '已复制',
  'panel.error.close': '关闭',
```

- [ ] **Step 2: 写失败测试** `src/renderer/components/__tests__/PanelErrorBoundary.test.tsx`

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PanelErrorBoundary } from '../PanelErrorBoundary.js';

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
afterEach(() => consoleErrorSpy.mockClear());

class Bomb extends Component<{ shouldThrow: boolean }, object> {
  override render(): ReactNode {
    if (this.props.shouldThrow) throw new Error('boom: panel fault');
    return <div data-testid="panel-content">ok</div>;
  }
}

function Harness({
  shouldThrow,
  onClose,
}: {
  shouldThrow: boolean;
  onClose?: () => void;
}): JSX.Element {
  return (
    <PanelErrorBoundary panel="tree" locale="en" onClose={onClose}>
      <Bomb shouldThrow={shouldThrow} />
    </PanelErrorBoundary>
  );
}

describe('PanelErrorBoundary', () => {
  it('renders children transparently when no error', () => {
    render(<Harness shouldThrow={false} />);
    expect(screen.getByTestId('panel-content')).toBeInTheDocument();
  });

  it('renders the in-panel error card when a child throws', () => {
    render(<Harness shouldThrow />);
    const card = screen.getByTestId('panel-error-tree');
    expect(card).toHaveAttribute('role', 'alert');
    expect(card).toHaveTextContent('Panel error');
    expect(card).toHaveTextContent('boom: panel fault');
    expect(screen.queryByTestId('panel-content')).toBeNull();
  });

  it('Retry re-mounts children after they stop throwing', () => {
    const { rerender } = render(<Harness shouldThrow />);
    expect(screen.getByTestId('panel-error-tree')).toBeInTheDocument();
    rerender(<Harness shouldThrow={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByTestId('panel-content')).toBeInTheDocument();
    expect(screen.queryByTestId('panel-error-tree')).toBeNull();
  });

  it('Copy details writes message + stack to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<Harness shouldThrow />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy details' }));
    await vi.waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('boom: panel fault')),
    );
  });

  it('renders Close only when onClose is provided and wires it', () => {
    const onClose = vi.fn();
    render(<Harness shouldThrow onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm test src/renderer/components/__tests__/PanelErrorBoundary.test.tsx`
Expected: FAIL（PanelErrorBoundary 模块不存在）

- [ ] **Step 4: 实现 `PanelErrorBoundary.tsx`**

```tsx
// P2 (spec §4.1) — reusable in-panel error boundary. Wraps the existing
// ErrorBoundary and renders a token-styled error card that fills the
// hosting panel without affecting sibling panels.
import { useState, type JSX, type ReactNode } from 'react';

import { t, type Locale } from '../../shared/i18n/index.js';
import { ErrorBoundary } from './ErrorBoundary.js';
import './PanelErrorBoundary.css';

export type PanelErrorId =
  | 'tree'
  | 'param-editor'
  | 'script-panel'
  | 'dbc-viewer'
  | 'odx-viewer'
  | 'validation-panel';

export interface PanelErrorBoundaryProps {
  /** Stable panel id — drives the `panel-error-<panel>` testid. */
  readonly panel: PanelErrorId;
  readonly locale: Locale;
  /** Optional close action for modal-style panels (DBC/ODX viewers). */
  readonly onClose?: () => void;
  readonly children: ReactNode;
}

interface PanelErrorCardProps {
  readonly error: Error;
  readonly panel: PanelErrorId;
  readonly locale: Locale;
  readonly onClose?: () => void;
  readonly reset: () => void;
}

function PanelErrorCard({
  error,
  panel,
  locale,
  onClose,
  reset,
}: PanelErrorCardProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const copyDetails = (): void => {
    const detail = `${error.message}\n${error.stack ?? ''}`;
    const clipboard = navigator.clipboard;
    if (clipboard === undefined) return;
    clipboard
      .writeText(detail)
      .then(() => {
        setCopied(true);
      })
      .catch(() => undefined);
  };
  return (
    <section className="panel-error-card" role="alert" data-testid={`panel-error-${panel}`}>
      <span className="panel-error-card__icon" aria-hidden="true">
        ⚠
      </span>
      <h3 className="panel-error-card__title">{t(locale, 'panel.error.title')}</h3>
      <p className="panel-error-card__message">{error.message}</p>
      <div className="panel-error-card__actions">
        <button type="button" className="app-btn" onClick={reset}>
          {t(locale, 'panel.error.retry')}
        </button>
        <button type="button" className="app-btn" onClick={copyDetails}>
          {copied ? t(locale, 'panel.error.copied') : t(locale, 'panel.error.copyDetails')}
        </button>
        {onClose !== undefined && (
          <button type="button" className="app-btn" onClick={onClose}>
            {t(locale, 'panel.error.close')}
          </button>
        )}
      </div>
    </section>
  );
}

export function PanelErrorBoundary({
  panel,
  locale,
  onClose,
  children,
}: PanelErrorBoundaryProps): JSX.Element {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <PanelErrorCard
          error={error}
          panel={panel}
          locale={locale}
          onClose={onClose}
          reset={reset}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
```

- [ ] **Step 5: 实现 `PanelErrorBoundary.css`**

```css
/* P2 (spec §4.1) — in-panel error card. Fills the hosting panel,
   never the viewport; sibling panels keep working. */
.panel-error-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  height: 100%;
  min-height: 120px;
  padding: var(--space-4);
  background: var(--rose-tint);
  border: 1px solid var(--accent-rose);
  border-radius: var(--radius-md);
  color: var(--accent-rose-strong);
  text-align: center;
}

.panel-error-card__icon {
  font-size: var(--text-lg);
}

.panel-error-card__title {
  margin: 0;
  font-size: var(--text-md);
  font-weight: 600;
}

.panel-error-card__message {
  margin: 0;
  max-width: 90%;
  overflow-wrap: anywhere;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.panel-error-card__actions {
  display: flex;
  gap: var(--space-2);
}
```

- [ ] **Step 6: 运行测试确认通过 + lint**

Run: `pnpm test src/renderer/components/__tests__/PanelErrorBoundary.test.tsx && pnpm stylelint "src/renderer/**/*.css"`
Expected: 全 PASS；stylelint 0 error

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/PanelErrorBoundary.tsx src/renderer/components/PanelErrorBoundary.css src/renderer/components/__tests__/PanelErrorBoundary.test.tsx src/shared/i18n/app.ts src/shared/i18n.en/app.ts src/shared/i18n.zh-CN/app.ts
git commit -m "feat(p2): PanelErrorBoundary 组件 + 面板错误卡片 i18n（spec §4.1）"
```

---

### Task 2: App 级兜底 fallback 样式化

**Files:**

- Modify: `src/renderer/components/ErrorBoundary.tsx`（默认 fallback 分支重写）
- Create: `src/renderer/components/ErrorBoundary.css`
- Modify: `src/renderer/components/__tests__/ErrorBoundary.test.tsx`（补复制/重置断言）
- Modify: `src/shared/i18n/app.ts`、`src/shared/i18n.en/app.ts`、`src/shared/i18n.zh-CN/app.ts`

**Interfaces:**

- Consumes: Task 1 的 i18n 追加模式。
- Produces: App 级 fallback DOM：`<div class="app-error-page" role="alert">` + `data-testid="app-error-page"` + 复制按钮 `data-testid="app-error-copy"` + Reset 按钮 `data-testid="app-error-reset"`。语义不变（仍是 `ErrorBoundary` 默认 fallback，`fallback` render-prop 调用方不受影响）。

- [ ] **Step 1: 追加 i18n keys**

`AppMessages` interface：

```ts
  // --- P2 app-level error page (spec §4.1) ---
  readonly 'app.errorPage.title': string;
  readonly 'app.errorPage.copyStack': string;
  readonly 'app.errorPage.reset': string;
  readonly 'app.errorPage.feedback': string;
```

en：

```ts
  'app.errorPage.title': 'Something went wrong',
  'app.errorPage.copyStack': 'Copy error details',
  'app.errorPage.reset': 'Reset',
  'app.errorPage.feedback': 'Please copy the error details and report them to the developers.',
```

zh-CN：

```ts
  'app.errorPage.title': '应用出现错误',
  'app.errorPage.copyStack': '复制错误详情',
  'app.errorPage.reset': '重置',
  'app.errorPage.feedback': '请复制错误详情并反馈给开发者。',
```

en 的 `'app.errorPage.title'` 取值 `Something went wrong`，与现有测试断言兼容。

- [ ] **Step 2: 更新测试**（在 `ErrorBoundary.test.tsx` 现有 describe 内追加两个 it；沿用文件内已有 `Bomb` fixture 与其 testid）

```tsx
it('app-level fallback is a styled page with copy + reset actions', () => {
  render(
    <ErrorBoundary>
      <Bomb shouldThrow />
    </ErrorBoundary>,
  );
  const page = screen.getByTestId('app-error-page');
  expect(page).toHaveAttribute('role', 'alert');
  expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  expect(screen.getByTestId('app-error-copy')).toBeInTheDocument();
  expect(screen.getByTestId('app-error-reset')).toBeInTheDocument();
});

it('app-level fallback Reset clears the error and re-renders children', () => {
  const { rerender } = render(
    <ErrorBoundary>
      <Bomb shouldThrow />
    </ErrorBoundary>,
  );
  rerender(
    <ErrorBoundary>
      <Bomb shouldThrow={false} />
    </ErrorBoundary>,
  );
  fireEvent.click(screen.getByTestId('app-error-reset'));
  expect(screen.getByTestId('panel-content')).toBeInTheDocument();
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm test src/renderer/components/__tests__/ErrorBoundary.test.tsx`
Expected: FAIL（无 app-error-page testid）

- [ ] **Step 4: 实现** — `ErrorBoundary.tsx` 默认 fallback 分支替换为：

```tsx
const locale = useArxmlStore.getState().locale;
const copyStack = (): void => {
  const detail = `${error.message}\n${error.stack ?? ''}`;
  const clipboard = navigator.clipboard;
  if (clipboard !== undefined) clipboard.writeText(detail).catch(() => undefined);
};
return (
  <div className="app-error-page" role="alert" data-testid="app-error-page">
    <h1>{t(locale, 'app.errorPage.title')}</h1>
    <p className="app-error-page__message">{error.message}</p>
    <pre className="app-error-page__stack">{error.stack ?? ''}</pre>
    <div className="app-error-page__actions">
      <button type="button" className="app-btn" data-testid="app-error-copy" onClick={copyStack}>
        {t(locale, 'app.errorPage.copyStack')}
      </button>
      <button type="button" className="app-btn" data-testid="app-error-reset" onClick={this.reset}>
        {t(locale, 'app.errorPage.reset')}
      </button>
    </div>
    <p className="app-error-page__hint">{t(locale, 'app.errorPage.feedback')}</p>
  </div>
);
```

文件头追加 import：

```tsx
import { t } from '../../shared/i18n/index.js';
import { useArxmlStore } from '../store/useArxmlStore.js';
import './ErrorBoundary.css';
```

（locale 用 `getState()` 非响应式即可：fallback 只在崩溃后渲染，崩溃时无热更新诉求。）

- [ ] **Step 5: 实现 `ErrorBoundary.css`**

```css
/* P2 (spec §4.1) — App-level last-resort error page. */
.app-error-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  min-height: 100vh;
  padding: var(--space-5);
  background: var(--surface-app);
  color: var(--text-primary);
  font-family: var(--font-sans);
  text-align: center;
}

.app-error-page h1 {
  margin: 0;
  font-size: var(--text-lg);
}

.app-error-page__message {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--text-base);
}

.app-error-page__stack {
  max-width: 80%;
  max-height: 40vh;
  overflow: auto;
  padding: var(--space-3);
  background: var(--surface-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-align: left;
}

.app-error-page__actions {
  display: flex;
  gap: var(--space-2);
}

.app-error-page__hint {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}
```

- [ ] **Step 6: 运行测试 + lint 确认通过**

Run: `pnpm test src/renderer/components/__tests__/ErrorBoundary.test.tsx && pnpm stylelint "src/renderer/**/*.css"`
Expected: 全 PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/ErrorBoundary.tsx src/renderer/components/ErrorBoundary.css src/renderer/components/__tests__/ErrorBoundary.test.tsx src/shared/i18n/app.ts src/shared/i18n.en/app.ts src/shared/i18n.zh-CN/app.ts
git commit -m "feat(p2): App 级 ErrorBoundary fallback 样式化错误页（spec §4.1）"
```

---

### Task 3: LeftPanel 局部 boundary（Tree + ValidationPanel）+ 故障注入单测

**Files:**

- Modify: `src/renderer/components/LeftPanel.tsx:225`（Tree 包裹）、`src/renderer/components/LeftPanel.tsx:216`（ValidationPanel 包裹）
- Create: `src/renderer/components/__tests__/LeftPanel.errorBoundary.test.tsx`

**Interfaces:**

- Consumes: Task 1 `PanelErrorBoundary`；LeftPanel 的 `locale`（若无现成订阅则新增 `useArxmlStore((s) => s.locale)`）。
- Produces: 注入故障被限制在 `panel-error-tree` / `panel-error-validation-panel` 卡片内，ProjectPanel 等兄弟节点照常渲染。

- [ ] **Step 1: 写失败测试** `src/renderer/components/__tests__/LeftPanel.errorBoundary.test.tsx`

```tsx
// @vitest-environment jsdom
// P2 (spec §9.13) — fault injection: a throwing Tree / ValidationPanel
// must degrade to its in-panel error card without taking down siblings.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LeftPanel } from '../LeftPanel.js';

vi.mock('../tree/Tree.js', () => ({
  Tree: () => {
    throw new Error('boom: tree fault');
  },
}));
vi.mock('../ValidationPanel.js', () => ({
  ValidationPanel: () => {
    throw new Error('boom: validation fault');
  },
}));

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
afterEach(() => {
  cleanup();
  consoleErrorSpy.mockClear();
});

function renderPanel(): void {
  render(<LeftPanel onAddEcucFromBswmd={(): void => {}} onContextMenu={(): void => {}} />);
}

describe('LeftPanel local error boundaries (P2 fault injection)', () => {
  it('throwing Tree degrades to panel-error-tree; siblings survive', () => {
    renderPanel();
    // 切到 files tab——按钮文案取 leftPanel.tab.files 的现有渲染；以 LeftPanel.tsx 实际 tab 按钮选择器为准。
    fireEvent.click(screen.getByText(/Files/i));
    expect(screen.getByTestId('panel-error-tree')).toHaveTextContent('boom: tree fault');
    // 兄弟内容仍在：用 ProjectPanel 现有任一稳定 testid（写死前先 grep 确认）。
    expect(screen.getByTestId('app-project-panel')).toBeInTheDocument();
  });

  it('throwing ValidationPanel degrades to panel-error-validation-panel; siblings survive', () => {
    renderPanel();
    fireEvent.click(screen.getByText(/Validation/i));
    expect(screen.getByTestId('panel-error-validation-panel')).toHaveTextContent(
      'boom: validation fault',
    );
    expect(screen.getByTestId('app-project-panel')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/renderer/components/__tests__/LeftPanel.errorBoundary.test.tsx`
Expected: FAIL（错误冒泡到 App 级/测试崩溃，而非 panel-error-\* 卡片）

- [ ] **Step 3: 实现包裹** — `LeftPanel.tsx`：

```tsx
import { PanelErrorBoundary } from './PanelErrorBoundary';
```

```tsx
<PanelErrorBoundary panel="validation-panel" locale={locale}>
  <ValidationPanel embedded />
</PanelErrorBoundary>
```

```tsx
<PanelErrorBoundary panel="tree" locale={locale}>
  <Tree store={useArxmlStore} onContextMenu={onContextMenu} />
</PanelErrorBoundary>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test src/renderer/components/__tests__/LeftPanel.errorBoundary.test.tsx && pnpm test src/renderer/components/__tests__/LeftPanel.test.tsx`
Expected: 新测试 PASS；既有 LeftPanel 测试不回归

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/LeftPanel.tsx src/renderer/components/__tests__/LeftPanel.errorBoundary.test.tsx
git commit -m "feat(p2): Tree/ValidationPanel 局部 boundary + 故障注入单测（spec §4.1/§9.13）"
```

---

### Task 4: App 局部 boundary（ParamEditor + ScriptPanel）+ 故障注入单测

**Files:**

- Modify: `src/renderer/App.tsx:438`（ParamEditor 包裹）、`src/renderer/App.tsx:447-449`（ScriptPanel 包裹）
- Create: `src/renderer/__tests__/App.panelErrorBoundary.test.tsx`

**Interfaces:**

- Consumes: Task 1 `PanelErrorBoundary`；App 内已有 `locale` 订阅（`App.tsx:248`）。
- Produces: 注入故障限制在 `panel-error-param-editor` / `panel-error-script-panel` 卡片内；左面板照常渲染。

- [ ] **Step 1: 写失败测试** `src/renderer/__tests__/App.panelErrorBoundary.test.tsx`

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.jsx';
import { useArxmlStore } from '../store/useArxmlStore.js';

vi.mock('../components/editor/ParamEditor.js', () => ({
  ParamEditor: () => {
    throw new Error('boom: param editor fault');
  },
}));
vi.mock('../components/ScriptPanel/ScriptPanel.js', () => ({
  ScriptPanel: () => {
    throw new Error('boom: script panel fault');
  },
}));

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
afterEach(() => {
  cleanup();
  consoleErrorSpy.mockClear();
  useArxmlStore.setState({ scriptPanelOpen: false });
});

describe('App local error boundaries (P2 fault injection)', () => {
  it('throwing ParamEditor degrades to panel-error-param-editor; left panel survives', () => {
    render(<App />);
    expect(screen.getByTestId('panel-error-param-editor')).toHaveTextContent(
      'boom: param editor fault',
    );
    expect(screen.getByTestId('app-header')).toBeInTheDocument();
  });

  it('throwing ScriptPanel degrades to panel-error-script-panel inside its host', () => {
    useArxmlStore.setState({ scriptPanelOpen: true });
    render(<App />);
    const host = screen.getByTestId('app-script-panel-host');
    expect(host.querySelector('[data-testid="panel-error-script-panel"]')).not.toBeNull();
    expect(screen.getByTestId('app-header')).toBeInTheDocument();
  });
});
```

实现注意：`scriptPanelOpen` 在 App.tsx:223 来自 `useAppMainHandlers`。若它不是 store 顶层字段而是 hook 内部 state，则改为 UI 路径打开：`fireEvent.click(screen.getByTestId('btn-scripts-toggle'))`（与 `AppHeader.scripts.test.tsx` 触发方式一致）。mock 路径以 App.tsx 实际 import 路径为准。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/renderer/__tests__/App.panelErrorBoundary.test.tsx`
Expected: FAIL（错误冒泡到 App 级 fallback）

- [ ] **Step 3: 实现包裹** — `App.tsx`：

```tsx
import { PanelErrorBoundary } from './components/PanelErrorBoundary';
```

```tsx
<Panel id="workspace-right" data-tour-id="right-pane-content">
  <PanelErrorBoundary panel="param-editor" locale={locale}>
    <ParamEditor />
  </PanelErrorBoundary>
</Panel>
```

```tsx
<div className="app-script-panel-host" data-testid="app-script-panel-host">
  <PanelErrorBoundary panel="script-panel" locale={locale}>
    <ScriptPanel />
  </PanelErrorBoundary>
</div>
```

- [ ] **Step 4: 运行测试确认通过 + 回归**

Run: `pnpm test src/renderer/__tests__/App.panelErrorBoundary.test.tsx && pnpm test src/renderer/__tests__/App.test.tsx`
Expected: 全 PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/App.tsx src/renderer/__tests__/App.panelErrorBoundary.test.tsx
git commit -m "feat(p2): ParamEditor/ScriptPanel 局部 boundary + 故障注入单测（spec §4.1/§9.13）"
```

---

### Task 5: DBC/ODX viewer 拆 Inner + wrapper boundary + 故障注入单测

**Files:**

- Modify: `src/renderer/components/DbcViewer/DbcViewer.tsx`（现实现移入 `DbcViewerInner.tsx`，原文件变 wrapper）
- Modify: `src/renderer/components/OdxViewer/OdxViewer.tsx`（同构：`OdxViewerInner` + wrapper）
- Create: `src/renderer/components/DbcViewer/__tests__/DbcViewer.errorBoundary.test.tsx`
- Create: `src/renderer/components/OdxViewer/__tests__/OdxViewer.errorBoundary.test.tsx`

**Interfaces:**

- Consumes: Task 1 `PanelErrorBoundary`（带 `onClose`）。
- Produces: `DbcViewer` / `OdxViewer` 对外 props 契约完全不变（spec §6 迁移约束），仅实现变为 Inner + boundary 包装；viewer 崩溃时错误卡片提供「关闭」直接退出模态。

- [ ] **Step 1: 写失败测试** `src/renderer/components/DbcViewer/__tests__/DbcViewer.errorBoundary.test.tsx`

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DbcViewer } from '../DbcViewer.js';

vi.mock('../DbcViewerInner.js', () => ({
  DbcViewerInner: () => {
    throw new Error('boom: dbc viewer fault');
  },
}));

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
afterEach(() => {
  cleanup();
  consoleErrorSpy.mockClear();
});

describe('DbcViewer local error boundary (P2 fault injection)', () => {
  it('throwing viewer content degrades to panel-error-dbc-viewer with working Close', () => {
    const onClose = vi.fn();
    render(<DbcViewer open path="/x.dbc" summary={null} locale="en" onClose={onClose} />);
    const card = screen.getByTestId('panel-error-dbc-viewer');
    expect(card).toHaveTextContent('boom: dbc viewer fault');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

`OdxViewer` 版本同构（mock `../OdxViewerInner.js`，断言 `panel-error-odx-viewer`；props 参照 `App.tsx:475-484` 现有调用：`open path summary locale onClose onExport exporting`）。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/renderer/components/DbcViewer/__tests__/DbcViewer.errorBoundary.test.tsx src/renderer/components/OdxViewer/__tests__/OdxViewer.errorBoundary.test.tsx`
Expected: FAIL（DbcViewerInner 模块不存在）

- [ ] **Step 3: 拆分实现** — 以 DbcViewer 为例（OdxViewer 同构）：

1. 现 `DbcViewer.tsx` 全部实现移入新文件 `src/renderer/components/DbcViewer/DbcViewerInner.tsx`，组件改名 `export function DbcViewerInner(...)`，props interface 原样迁移（若是导出的具名类型 `DbcViewerInnerProps`，保留导出）。
2. `DbcViewer.tsx` 改为：

```tsx
// P2 (spec §4.1) — boundary wrapper. The viewer's own props contract is
// unchanged; a render crash inside the modal degrades to the in-modal
// error card whose Close exits the dialog.
import { type JSX } from 'react';

import { PanelErrorBoundary } from '../PanelErrorBoundary.js';
import { DbcViewerInner, type DbcViewerInnerProps } from './DbcViewerInner.js';

export type DbcViewerProps = DbcViewerInnerProps;

export function DbcViewer(props: DbcViewerProps): JSX.Element {
  const { locale, onClose, ...rest } = props;
  return (
    <PanelErrorBoundary panel="dbc-viewer" locale={locale} onClose={onClose}>
      <DbcViewerInner locale={locale} onClose={onClose} {...rest} />
    </PanelErrorBoundary>
  );
}
```

- [ ] **Step 4: 运行测试确认通过 + 回归**

Run: `pnpm test src/renderer/components/DbcViewer src/renderer/components/OdxViewer && pnpm type-check`
Expected: viewer 全部测试 PASS；type-check 通过（对外契约未变）

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/DbcViewer src/renderer/components/OdxViewer
git commit -m "feat(p2): DBC/ODX viewer 拆 Inner + 局部 boundary + 故障注入单测（spec §4.1/§9.13）"
```

---

### Task 6: NewProjectDialog 验证时机（blur / submit）

**Files:**

- Modify: `src/renderer/components/NewProjectDialog.tsx`（touched/attempted state + onBlur + handleSubmit + 错误渲染门控）
- Modify: `src/renderer/components/__tests__/NewProjectDialog.test.tsx`（mount 即报错的断言改为 blur/submit 触发）
- Modify: `tests/e2e/new-project-dialog.spec.ts`（追加时机用例）

**Interfaces:**

- Consumes: 现有 `validateProjectName(name)`、`nameErrorText` 映射（NewProjectDialog.tsx:243/357）。
- Produces: 初始态干净；blur 后或 submit 尝试（含 Enter）后 `npd-name-error` 才可能出现；`canSubmit` 门控逻辑不变。

- [ ] **Step 1: 更新/新增失败测试**

现有「shows a red error … when the name is empty」（:170）与「invalid characters」（:180）用例改为：先 `fireEvent.change`（如需）+ `fireEvent.blur` 输入框，再断言错误。另追加：

```tsx
it('keeps the name field clean on mount (no premature error)', () => {
  renderDialog();
  expect(screen.queryByTestId('npd-name-error')).toBeNull();
});

it('shows the empty-name error only after blur', () => {
  renderDialog();
  fireEvent.blur(screen.getByTestId('npd-name-input'));
  expect(screen.getByTestId('npd-name-error')).toBeInTheDocument();
});

it('submit attempt (Enter with empty name) surfaces the error without submitting', () => {
  const onSubmit = vi.fn();
  renderDialog(onSubmit);
  fireEvent.keyDown(screen.getByTestId('npd-name-input'), { key: 'Enter' });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByTestId('npd-name-error')).toBeInTheDocument();
});

it('typing a valid name clears the error', () => {
  renderDialog();
  fireEvent.blur(screen.getByTestId('npd-name-input'));
  expect(screen.getByTestId('npd-name-error')).toBeInTheDocument();
  fireEvent.change(screen.getByTestId('npd-name-input'), { target: { value: 'Valid_Name' } });
  expect(screen.queryByTestId('npd-name-error')).toBeNull();
});
```

（`renderDialog` 为该文件现有 render helper；若不接受 onSubmit 参数，按文件内现有模式内联 render。）

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/renderer/components/__tests__/NewProjectDialog.test.tsx`
Expected: mount-即报错相关断言 FAIL

- [ ] **Step 3: 实现** — `NewProjectDialog.tsx`：

```tsx
// P2 (spec §4.2) — validation timing: the field starts clean; the
// error appears only after the user leaves the field (blur) or
// attempts a submit (button or Enter).
const [nameTouched, setNameTouched] = useState(false);
const [submitAttempted, setSubmitAttempted] = useState(false);
const showNameError = (nameTouched || submitAttempted) && nameError !== null;
```

open-effect reset 块（:229 附近）追加：

```tsx
setNameTouched(false);
setSubmitAttempted(false);
```

input（:403-414）追加 `onBlur={() => setNameTouched(true)}`，className 门控改为：

```tsx
className={`npd-input${showNameError ? ' npd-input--error' : ''}`}
```

错误渲染（:415-419）条件改为 `showNameError && nameErrorText !== null`。

`handleSubmit`（:269）开头改为：

```tsx
  const handleSubmit = (): void => {
    if (!canSubmit) {
      setSubmitAttempted(true);
      return;
    }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test src/renderer/components/__tests__/NewProjectDialog.test.tsx src/renderer/components/__tests__/NewProjectDialog.preview.test.tsx`
Expected: 全 PASS

- [ ] **Step 5: 追加 e2e 用例**（`tests/e2e/new-project-dialog.spec.ts` 的 describe 内）

```ts
test('validation timing: no error on mount; appears after blur', async ({ page }) => {
  await openNewProjectDialog(page);
  await expect(page.getByTestId('npd-name-error')).not.toBeVisible();
  await page.getByTestId('npd-name-input').blur();
  await expect(page.getByTestId('npd-name-error')).toBeVisible();
});
```

- [ ] **Step 6: 运行 e2e 确认通过**

Run: `pnpm test:e2e new-project-dialog`
Expected: 全 PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/NewProjectDialog.tsx src/renderer/components/__tests__/NewProjectDialog.test.tsx tests/e2e/new-project-dialog.spec.ts
git commit -m "feat(p2): NewProjectDialog 空名验证改为 blur/submit 触发（spec §4.2）"
```

---

### Task 7: 主区空状态引导面板

**Files:**

- Create: `src/renderer/components/editor/ParamEditorEmptyState.tsx`
- Create: `src/renderer/components/editor/ParamEditorEmptyState.css`
- Modify: `src/renderer/components/editor/ParamEditor.tsx:122-134`（空态分支替换）+ props 追加
- Modify: `src/renderer/App.tsx`（传 handlers）
- Modify: `src/shared/i18n/app.ts`、`src/shared/i18n.en/app.ts`、`src/shared/i18n.zh-CN/app.ts`
- Create: `src/renderer/components/editor/__tests__/ParamEditorEmptyState.test.tsx`
- Create: `tests/e2e/empty-state.spec.ts`

**Interfaces:**

- Consumes: `useProjectActions()` 返回的 `newProject()`（打开新建项目 dialog）与 `openProjectFromDialog()`（带 dirty guard 的打开项目）；现有 i18n key `'app.project.open'`。
- Produces: `ParamEditor` 新增可选 props `onOpenProject?: () => void; onNewProject?: () => void`；空态 DOM `data-testid="param-editor-empty-state"`，保留外层 `aria-label="Parameter editor"`。

- [ ] **Step 1: 追加 i18n keys**

`AppMessages` interface：

```ts
  // --- P2 editor empty state (spec §4.2) ---
  readonly 'editor.empty.title': string;
  readonly 'editor.empty.hint': string;
  readonly 'editor.empty.newProject': string;
```

en：

```ts
  'editor.empty.title': 'Select an element in the tree to start editing',
  'editor.empty.hint': 'Open a project, or create one to begin.',
  'editor.empty.newProject': 'New Project',
```

zh-CN：

```ts
  'editor.empty.title': '从左侧树选择元素开始编辑',
  'editor.empty.hint': '打开一个项目，或新建项目开始使用。',
  'editor.empty.newProject': '新建项目',
```

- [ ] **Step 2: 写失败测试** `src/renderer/components/editor/__tests__/ParamEditorEmptyState.test.tsx`

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ParamEditorEmptyState } from '../ParamEditorEmptyState.js';

afterEach(() => cleanup());

describe('ParamEditorEmptyState (spec §4.2)', () => {
  it('renders centered guidance with both actions (en)', () => {
    const onOpen = vi.fn();
    const onNew = vi.fn();
    render(<ParamEditorEmptyState locale="en" onOpenProject={onOpen} onNewProject={onNew} />);
    expect(screen.getByTestId('param-editor-empty-state')).toHaveAttribute(
      'aria-label',
      'Parameter editor',
    );
    // 'Open Project' 文案以 i18n.en/app.ts 的 'app.project.open' 现值为准（先 grep 再写死）。
    expect(screen.getByRole('button', { name: 'Open Project' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New Project' }));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('hides actions that have no callback wired', () => {
    render(<ParamEditorEmptyState locale="en" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm test src/renderer/components/editor/__tests__/ParamEditorEmptyState.test.tsx`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现 `ParamEditorEmptyState.tsx`**

```tsx
// P2 (spec §4.2) — centered empty-state guidance for the main editing
// area. Reuses the header's existing project actions via callbacks
// passed down from App (spec defers the wiring choice to this plan:
// props-down, no new store slice).
import { type JSX } from 'react';

import { t, type Locale } from '../../../shared/i18n/index.js';
import './ParamEditorEmptyState.css';

export interface ParamEditorEmptyStateProps {
  readonly locale: Locale;
  readonly onOpenProject?: () => void;
  readonly onNewProject?: () => void;
}

export function ParamEditorEmptyState({
  locale,
  onOpenProject,
  onNewProject,
}: ParamEditorEmptyStateProps): JSX.Element {
  return (
    <section
      className="param-editor-empty"
      aria-label="Parameter editor"
      data-testid="param-editor-empty-state"
    >
      <span className="param-editor-empty__icon" aria-hidden="true">
        🗂
      </span>
      <h2 className="param-editor-empty__title">{t(locale, 'editor.empty.title')}</h2>
      <p className="param-editor-empty__hint">{t(locale, 'editor.empty.hint')}</p>
      <div className="param-editor-empty__actions">
        {onOpenProject !== undefined && (
          <button type="button" className="app-btn" onClick={onOpenProject}>
            {t(locale, 'app.project.open')}
          </button>
        )}
        {onNewProject !== undefined && (
          <button type="button" className="app-btn" onClick={onNewProject}>
            {t(locale, 'editor.empty.newProject')}
          </button>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: 实现 `ParamEditorEmptyState.css`**

```css
/* P2 (spec §4.2) — main-area empty state: centered guidance panel. */
.param-editor-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  height: 100%;
  padding: var(--space-5);
  background: var(--surface-panel);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  text-align: center;
}

.param-editor-empty__icon {
  font-size: 32px;
}

.param-editor-empty__title {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--text-md);
  font-weight: 600;
}

.param-editor-empty__hint {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.param-editor-empty__actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
```

- [ ] **Step 6: ParamEditor 接入**

空态分支（:122-134）替换为：

```tsx
if (element === null || (element.kind !== 'module' && element.kind !== 'container')) {
  return (
    <ParamEditorEmptyState
      locale={locale}
      onOpenProject={onOpenProject}
      onNewProject={onNewProject}
    />
  );
}
```

签名与 props：

```tsx
export interface ParamEditorProps {
  /** Wired by App from useProjectActions().openProjectFromDialog. */
  readonly onOpenProject?: () => void;
  /** Wired by App from useProjectActions().newProject. */
  readonly onNewProject?: () => void;
}

export function ParamEditor({ onOpenProject, onNewProject }: ParamEditorProps = {}): JSX.Element {
```

- [ ] **Step 7: App 传参** — `App.tsx:151` 解构改为：

```tsx
const { submitNewProject, newProject, openProjectFromDialog } = useProjectActions();
```

挂载点改为（与 Task 4 boundary 共存）：

```tsx
<PanelErrorBoundary panel="param-editor" locale={locale}>
  <ParamEditor onOpenProject={openProjectFromDialog} onNewProject={newProject} />
</PanelErrorBoundary>
```

- [ ] **Step 8: 运行测试 + 回归**

Run: `pnpm test src/renderer/components/editor/__tests__/ParamEditorEmptyState.test.tsx && pnpm test src/renderer/components/editor/__tests__/ParamEditor.test.tsx src/renderer/components/editor/__tests__/ParamEditor.mutation.test.tsx && pnpm type-check`
Expected: 全 PASS（ParamEditor 无 props 调用保持兼容）

- [ ] **Step 9: 追加 e2e** `tests/e2e/empty-state.spec.ts`

```ts
// @ts-check
// P2 (spec §4.2) — main-area empty state guidance.
// Harness notes from visual-regression.spec.ts apply verbatim:
//   - window.autosarApi is undefined in the headless dev harness; an
//     API stub must be installed before App mounts (see that file's
//     installApiStub :11-15).
//   - store dynamic import path is vite-root-relative '/store/useArxmlStore.ts'
//     (vite root = src/renderer).
//   - fix the store to the en canonical state before assertions.
import { expect, test, type Page } from '@playwright/test';

const ARXML_STORE_PATH = '/store/useArxmlStore.ts';

async function toCanonicalEnState(page: Page): Promise<void> {
  await expect(page.getByTestId('app-header')).toBeVisible();
  await page.evaluate(async (storePath) => {
    const mod = await import(/* @vite-ignore */ storePath);
    mod.useArxmlStore.setState({ locale: 'en' });
  }, ARXML_STORE_PATH);
}

test('main area shows guided empty state with open/new actions', async ({ page }) => {
  await page.goto('/');
  await toCanonicalEnState(page);
  const empty = page.getByTestId('param-editor-empty-state');
  await expect(empty).toBeVisible();
  await expect(empty.getByRole('button', { name: 'Open Project' })).toBeVisible();
  await expect(empty.getByRole('button', { name: 'New Project' })).toBeVisible();
});

test('empty-state New Project button opens the dialog', async ({ page }) => {
  await page.goto('/');
  await toCanonicalEnState(page);
  await page
    .getByTestId('param-editor-empty-state')
    .getByRole('button', { name: 'New Project' })
    .click();
  await expect(page.getByTestId('npd-overlay')).toBeVisible();
});
```

（`installApiStub` 调用按 visual-regression.spec.ts 的实际签名在两个用例 `page.goto('/')` 前插入。若 fresh state 下 ParamEditor 不走 `element === null` 路径，按 `ParamEditor.tsx:114-122` 的分支顺序核查 store 前置并调整。）

- [ ] **Step 10: 运行 e2e**

Run: `pnpm test:e2e empty-state`
Expected: 2 PASS

- [ ] **Step 11: Commit**

```bash
git add src/renderer/components/editor/ParamEditorEmptyState.tsx src/renderer/components/editor/ParamEditorEmptyState.css src/renderer/components/editor/ParamEditor.tsx src/renderer/components/editor/__tests__/ParamEditorEmptyState.test.tsx src/renderer/App.tsx src/shared/i18n/app.ts src/shared/i18n.en/app.ts src/shared/i18n.zh-CN/app.ts tests/e2e/empty-state.spec.ts
git commit -m "feat(p2): 主区空状态引导面板 + 打开/新建项目快捷入口（spec §4.2）"
```

---

### Task 8: 保存按钮层级化（主按钮 + 溢出菜单）

**Files:**

- Modify: `src/renderer/components/AppHeader/AppHeaderActionBar.tsx`（重构为 主按钮 + 溢出菜单）
- Modify: `src/renderer/styles.css`（`.app-save-group` / `.app-btn-save.is-dirty` amber 样式 / pulse keyframes / reduced-motion）
- Modify: `src/shared/i18n/app.ts`、`src/shared/i18n.en/app.ts`、`src/shared/i18n.zh-CN/app.ts`
- Modify: `src/renderer/components/__tests__/AppHeader.test.tsx`（直接点旧按钮的用例先开菜单）
- Update: `tests/visual/baseline/`（受影响 surface 重新截图）

**Interfaces:**

- Consumes: BrandMenu 的 menuRef + outside-click/Esc 关闭模式（`BrandMenu.tsx:14-15`）；`.app-dropdown` 既有样式（`styles.css:409`）。
- Produces: `btn-save`（ARXML 保存）为主按钮常驻；`btn-save-overflow` 触发下拉；菜单内 `btn-project-save` / `btn-save-all` testid 保留（选择器兼容，但需先开菜单）。dirty 时主按钮 `.is-dirty`：`--accent-amber` 底 + `--text-inverse` 文字 + pulse；hover/按下 `--accent-amber-strong`；`prefers-reduced-motion` 时静态高亮（spec §4.2 原文语义）。

- [ ] **Step 1: 追加 i18n key**

`AppMessages`：`readonly 'app.saveMore': string;`
en：`'app.saveMore': 'More save actions',`
zh-CN：`'app.saveMore': '更多保存操作',`

- [ ] **Step 2: 更新失败测试**（`AppHeader.test.tsx` 内直接点 `btn-project-save` / `btn-save-all` 的用例，统一改为先 `fireEvent.click(screen.getByTestId('btn-save-overflow'))`；并追加：）

```tsx
it('overflow menu contains Project Save and Save All', () => {
  renderHeader();
  fireEvent.click(screen.getByTestId('btn-save-overflow'));
  expect(screen.getByTestId('btn-project-save')).toBeInTheDocument();
  expect(screen.getByTestId('btn-save-all')).toBeInTheDocument();
});

it('Escape closes the save overflow menu', () => {
  renderHeader();
  fireEvent.click(screen.getByTestId('btn-save-overflow'));
  expect(screen.getByTestId('btn-save-all')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByTestId('btn-save-all')).toBeNull();
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm test src/renderer/components/__tests__/AppHeader.test.tsx`
Expected: FAIL（btn-save-overflow 不存在）

- [ ] **Step 4: 重构 `AppHeaderActionBar.tsx`** — 保留全部现有 props 与三个动作的 disabled/title/label 语义，返回结构替换为：

```tsx
const [menuOpen, setMenuOpen] = useState(false);
const menuRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!menuOpen) return undefined;
  const onDocMouseDown = (e: MouseEvent): void => {
    if (menuRef.current !== null && !menuRef.current.contains(e.target as Node)) {
      setMenuOpen(false);
    }
  };
  const onEsc = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') setMenuOpen(false);
  };
  document.addEventListener('mousedown', onDocMouseDown);
  document.addEventListener('keydown', onEsc);
  return () => {
    document.removeEventListener('mousedown', onDocMouseDown);
    document.removeEventListener('keydown', onEsc);
  };
}, [menuOpen]);

return (
  <div className="app-save-group">
    {/* Primary: Save active ARXML (spec §4.2) — semantics unchanged. */}
    <button
      type="button"
      onClick={() => {
        void onSave();
      }}
      disabled={!canSave}
      className={`app-btn app-btn-save ${isActiveDirty ? 'is-dirty' : ''}`}
      data-testid="btn-save"
      data-tour-id="app-save"
    >
      {isActiveDirty ? t(locale, 'app.saveDirty') : t(locale, 'app.save')}
    </button>
    {/* Overflow: Project Save + Save All. */}
    <div className="app-save-overflow" ref={menuRef}>
      <button
        type="button"
        className={`app-btn app-btn-save-overflow${dirtyPathsCount > 0 ? ' is-dirty' : ''}`}
        data-testid="btn-save-overflow"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={t(locale, 'app.saveMore')}
        title={t(locale, 'app.saveMore')}
        onClick={() => {
          setMenuOpen((open) => !open);
        }}
      >
        ▾
      </button>
      {menuOpen && (
        <div className="app-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            className="app-dropdown-item"
            data-testid="btn-project-save"
            disabled={!canSaveProject}
            title={
              projectDirtyCount > 0
                ? t(locale, 'app.project.saveBlockedDirty', { count: projectDirtyCount })
                : undefined
            }
            onClick={() => {
              setMenuOpen(false);
              void onProjectSave();
            }}
          >
            {t(locale, 'app.project.save')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="app-dropdown-item"
            data-testid="btn-save-all"
            disabled={!canSaveAll}
            title={
              dirtyPathsCount > 0
                ? t(locale, 'app.saveAllDirtyTitle', { count: dirtyPathsCount })
                : t(locale, 'app.saveAllTitle')
            }
            onClick={() => {
              setMenuOpen(false);
              void onSaveAll();
            }}
          >
            {dirtyPathsCount > 0
              ? t(locale, 'app.saveAllDirty', { count: dirtyPathsCount })
              : t(locale, 'app.saveAll')}
          </button>
        </div>
      )}
    </div>
  </div>
);
```

文件头 import 增加：

```tsx
import { useEffect, useRef, useState, type JSX } from 'react';
```

注意：`data-tour-id="app-save"`（原在 btn-project-save 上）迁到主按钮，避免 onboarding tour 断锚；写死前 grep `data-tour-id="app-save"` 的消费点确认定位方式。

- [ ] **Step 5: styles.css 追加样式**（全部 token，无裸色值）

```css
/* P2 (spec §4.2) — save action hierarchy. */
.app-save-group {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.app-save-overflow {
  position: relative;
}

.app-save-overflow .app-dropdown {
  top: calc(100% + var(--space-2));
  right: 0;
  left: auto;
}

.app-btn-save.is-dirty {
  background: var(--accent-amber);
  border-color: var(--accent-amber-strong);
  color: var(--text-inverse);
  animation: app-save-pulse 1.6s ease-in-out infinite;
}

.app-btn-save.is-dirty:hover:not(:disabled),
.app-btn-save.is-dirty:active:not(:disabled) {
  background: var(--accent-amber-strong);
}

@keyframes app-save-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.04);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-btn-save.is-dirty {
    animation: none;
  }
}
```

（若存在旧 `.app-btn-save.is-dirty` / `.app-btn-save-all.is-dirty` 规则与新规则冲突，合并为单条；不重复定义。）

- [ ] **Step 6: 运行测试 + lint + 全仓 testid 扫描**

Run: `pnpm test src/renderer/components/__tests__/AppHeader.test.tsx && pnpm stylelint "src/renderer/**/*.css"`
Expected: 全 PASS；stylelint 0 error。
另：全仓 grep `btn-project-save|btn-save-all`，把其余直接点击这两个 testid 的单测/e2e 全部改为先开 `btn-save-overflow`。

- [ ] **Step 7: 视觉基线更新**

Run: `pnpm test:e2e visual-regression`
Expected: header 可见的 surface 像素 diff 失败。人工确认 diff 只涉及保存按钮区域后：

Run: `pnpm test:e2e visual-regression --update-snapshots`
Expected: 仅 changed 基线被重写（P1 裁决 R15：裸参数只重写 changed，正合需求；不要用 `=all`）。复跑全绿后把 `tests/visual/baseline` 一并提交。

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/AppHeader/AppHeaderActionBar.tsx src/renderer/styles.css src/shared/i18n/app.ts src/shared/i18n.en/app.ts src/shared/i18n.zh-CN/app.ts src/renderer/components/__tests__/AppHeader.test.tsx tests/visual/baseline
git commit -m "feat(p2): 保存按钮层级化——主按钮 amber 高亮 + 溢出菜单（spec §4.2）"
```

---

### Task 9: 全量验证（spec §10.2 P2 DoD）

**Files:** 无新改动（只验证 + 修回归）。

**Interfaces:** 消费全部前序任务产物。

- [ ] **Step 1: 单测全量**

Run: `pnpm test`
Expected: 全绿；包含 6 个故障注入用例（tree / param-editor / script-panel / dbc-viewer / odx-viewer / validation-panel），注入故障不越出所在面板（spec §10.2）。

- [ ] **Step 2: e2e 全量**

Run: `pnpm test:e2e`
Expected: 全绿（含新增 empty-state、new-project-dialog 时机用例、visual-regression 6 surface）。

- [ ] **Step 3: 全门禁**

Run: `pnpm verify`
Expected: format/lint/stylelint/type-check/test/build/import-regression/python-self-test 全阶段通过。

- [ ] **Step 4: 收尾**

若 Step 1-3 发现回归：先修复再重跑至全绿。全部通过后按 subagent-driven-development / executing-plans 流程收尾（合并决策走 finishing-a-development-branch）。
