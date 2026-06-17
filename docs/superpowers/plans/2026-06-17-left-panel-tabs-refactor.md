# 左侧栏 Tab 化重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Renderer 左侧栏从 "ProjectPanel + Tree + ValidationPanel 全堆叠" 改为 "项目 / 文件 / 验证 三 Tab + Tree 固定在底部"，并补完 working tree 中的 WIP 残骸直到能 commit。

**Architecture:**

- `useArxmlStore` 加 `leftTab: 'project' | 'files' | 'validate'` 字段 + `setLeftTab` action
- `ValidationPanel` 加 `embedded?: boolean` prop（true 时去掉外层 `<aside>` 标题栏）
- `ProjectPanel.tsx` 把 `OpenView` 导出为 `ProjectPanelInfo`（在"项目"Tab 使用），删掉 `LooseView`（被 `FileListTab` loose 模式替代）
- 新建 `LeftPanel` 组件，CSS Grid `auto 1fr auto`（tab-bar / tab-content / tree），loose 模式隐藏"项目"Tab
- 新建 `FileListTab` 组件作为"文件"Tab 内容（loose 模式显示 New/Open 紧凑头）
- `AppHeader` 项目下拉菜单作为单独 commit（与 Tab 主线独立，可单独 revert）
- i18n 加 3 个 `leftPanel.tab.*` 键（zh-CN/en parity）
- `basename` 收归到 `src/shared/path.ts`（已存在），删除 `ProjectPanel.tsx` / `AppHeader.tsx` 里的本地副本

**Tech Stack:** Electron 30 + TypeScript 5.5 strict + React 18.3 + Zustand 4.5 + Vitest 1.6

**Working baseline:**

- HEAD: `a763a73 docs(arxml): Sprint 13 namespace+BSWMD-strict spec and implementation plan`
- 主分支 local 13 commits ahead of origin（不动这些 commit）
- 起点：4 modified + 7 untracked（WIP 残骸）

**Sprint 13 #1 边界（**不在本计划**）：** 模板 backend（`samples/` 目录 + `template.json` 发现机制）已通过 `8cefcd1` 设计稿和 `fa07617` 实施计划锁定为独立方向，**本计划不实现 Sprint 13 #1 模板逻辑**。`samples/` 目录及其 README 保留为后续 sprint 入口，不在本计划改动。

---

## Task 1: 基础设施 — i18n 键 + basename 去重

**Files:**

- Modify: `src/shared/i18n.ts` (加 3 个 `leftPanel.tab.*` 键到 `Messages` 接口、`MessagesZhCN`、`MessagesEn`)
- Modify: `src/renderer/components/ProjectPanel.tsx` (删 line 33-35 局部 `basename`，改 import 共享版本)
- Modify: `src/renderer/components/AppHeader.tsx` (删 line 58-60 局部 `basename`，改 import 共享版本)
- Verify: `src/shared/i18n.ts` 现有的 zh-CN/en parity test（增 key 必须两边同时加，否则测试挂）

- [ ] **Step 1: 添加 3 个 i18n 键**

在 `src/shared/i18n.ts` 的 `Messages` interface（line 41-143）添加：

```ts
leftPanel: {
  tab: {
    project: string;
    files: string;
    validate: string;
  }
}
```

在 `MessagesZhCN`（line 151-253）添加：

```ts
  leftPanel: {
    tab: {
      project: '项目',
      files: '文件',
      validate: '验证',
    },
  },
```

在 `MessagesEn`（line 259-362）添加同样结构：

```ts
  leftPanel: {
    tab: {
      project: 'Project',
      files: 'Files',
      validate: 'Validate',
    },
  },
```

- [ ] **Step 2: 跑 i18n parity test 确认新键覆盖**

Run: `pnpm test src/shared/__tests__/i18n.test.ts -t "parity"`
Expected: PASS（如果 `src/shared/__tests__/i18n.test.ts` 不存在，先 `git ls-files src/shared/__tests__/` 找具体路径）

- [ ] **Step 3: 删 `ProjectPanel.tsx` 局部 `basename`**

删除 line 33-35 整段（`function basename(p: string): string { return p.split(/[\\/]/).pop() ?? p; }`），在文件顶部 import 区添加：

```ts
import { basename } from '@shared/path';
```

- [ ] **Step 4: 删 `AppHeader.tsx` 局部 `basename`**

同样：删除 line 58-60，import 添加 `import { basename } from '@shared/path';`

- [ ] **Step 5: 跑相关测试确认无回归**

Run: `pnpm test src/renderer/components/__tests__/ProjectPanel.bswmd.test.tsx src/renderer/components/__tests__/AppHeader.test.tsx`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/shared/i18n.ts src/renderer/components/ProjectPanel.tsx src/renderer/components/AppHeader.tsx
git commit -m "refactor(tabs): add leftPanel.tab.* i18n keys + dedupe basename to @shared/path"
```

---

## Task 2: Store `leftTab` + ValidationPanel `embedded` + ProjectPanel 拆分

**Files:**

- Modify: `src/renderer/store/useArxmlStore.ts` (加 `leftTab: LeftTabId` + `setLeftTab` action + LeftTabId type)
- Modify: `src/renderer/components/ValidationPanel.tsx` (加 `embedded?: boolean` prop)
- Modify: `src/renderer/components/ProjectPanel.tsx` (导出 `OpenView` as `ProjectPanelInfo`；删除 `LooseView` 和 `ProjectPanel` 顶层导出)

- [ ] **Step 1: 加 `LeftTabId` 类型与 `leftTab` / `setLeftTab` 到 store**

在 `src/renderer/store/useArxmlStore.ts` 顶部添加类型：

```ts
export type LeftTabId = 'project' | 'files' | 'validate';
```

在 `ArxmlState` interface（line 81-245）添加：

```ts
  leftTab: LeftTabId;
  setLeftTab: (tab: LeftTabId) => void;
```

在 store 创建函数（找到 `setLocale` 附近的 actions 段）添加实现：

```ts
      leftTab: 'files',  // 默认从文件 Tab 开始（Sprint 11/12 都是先 open/create project）
      setLeftTab: (tab) => set({ leftTab: tab }),
```

- [ ] **Step 2: 写 store 测试**

新建或更新 `src/renderer/store/__tests__/useArxmlStore.test.ts`（先 `git ls-files` 找路径），添加：

```ts
describe('leftTab', () => {
  it('默认是 files', () => {
    expect(useArxmlStore.getState().leftTab).toBe('files');
  });

  it('setLeftTab 切换', () => {
    useArxmlStore.getState().setLeftTab('validate');
    expect(useArxmlStore.getState().leftTab).toBe('validate');
    useArxmlStore.getState().setLeftTab('project');
    expect(useArxmlStore.getState().leftTab).toBe('project');
  });
});
```

Run: `pnpm test src/renderer/store`
Expected: PASS

- [ ] **Step 3: 给 `ValidationPanel` 加 `embedded` prop**

修改 `src/renderer/components/ValidationPanel.tsx` line 56:

```ts
export function ValidationPanel({ embedded = false }: { embedded?: boolean }): JSX.Element {
```

然后在 line 65（empty 分支）、line 74（valid 分支）、以及 invalid 分支（`groupByKind` 渲染处，找 `<aside className="validation-panel invalid">` 之类）的外层 `<aside>` 上加 conditional：

```ts
  if (lastValidatedAt === null) {
    const inner = <p className="muted">{t(locale, 'arxmlPanel.empty')}</p>;
    return embedded
      ? <div className="validation-panel-embedded" data-testid="validation-embedded-empty">{inner}</div>
      : <aside className="validation-panel empty" aria-label={t(locale, 'validation.title')}>{inner}</aside>;
  }
```

对 `valid` 和 `invalid` 分支同样处理：embedded 模式用 `<div className="validation-panel-embedded">` + 隐藏 header。

- [ ] **Step 4: 写 ValidationPanel embedded 测试**

新建 `src/renderer/components/__tests__/ValidationPanel.embedded.test.tsx`：

```ts
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';

import { ValidationPanel } from '../ValidationPanel';
import { useArxmlStore } from '../../store/useArxmlStore';

describe('ValidationPanel embedded', () => {
  beforeEach(() => {
    useArxmlStore.setState({ validationErrors: [], lastValidatedAt: null });
  });

  it('默认渲染 aside', () => {
    render(<ValidationPanel />);
    expect(screen.getByLabelText(/validation/i)).toBeTruthy();
  });

  it('embedded=true 渲染 div 不渲染 aside', () => {
    render(<ValidationPanel embedded />);
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.getByTestId('validation-embedded-empty')).toBeTruthy();
  });
});
```

Run: `pnpm test src/renderer/components/__tests__/ValidationPanel`
Expected: PASS

- [ ] **Step 5: 拆 `ProjectPanel.tsx`**

修改 `src/renderer/components/ProjectPanel.tsx`:

1. 把 `LooseView` 函数（line 107-135）整段删除
2. 把 `OpenView` 函数重命名为 `ProjectPanelInfo`（保留所有 props 不变；OpenViewProps → ProjectPanelInfoProps）
3. 在文件末尾添加 export：

```ts
export { ProjectPanelInfo };
export type { ProjectPanelInfoProps };
```

4. 删除原 `export function ProjectPanel(...)` (line 201 / line 232 附近) — 不再需要顶层壳

- [ ] **Step 6: 删 `ProjectPanel.bswmd.test.tsx`（被 `FileListTab` 测试取代）**

这个测试测的是 `ProjectPanel` 顶层组件（loose 模式 + open 模式），因为 `ProjectPanel` 删了，这个测试必须删。

Run: `git rm src/renderer/components/__tests__/ProjectPanel.bswmd.test.tsx`

- [ ] **Step 7: 跑相关测试确认无回归**

Run: `pnpm test src/renderer/components/__tests__/ValidationPanel.test.tsx src/renderer/components/__tests__/ValidationPanel.integration.test.tsx`
Expected: PASS（因为这两个测的是 `ValidationPanel` 的核心行为，embedded 是新加的 prop 不影响默认行为）

- [ ] **Step 8: 提交**

```bash
git add src/renderer/store/useArxmlStore.ts src/renderer/components/ValidationPanel.tsx src/renderer/components/ProjectPanel.tsx src/renderer/components/__tests__/ValidationPanel.embedded.test.tsx
git rm src/renderer/components/__tests__/ProjectPanel.bswmd.test.tsx
git commit -m "refactor(tabs): add leftTab store + ValidationPanel embedded + split ProjectPanel → ProjectPanelInfo"
```

---

## Task 3: LeftPanel + FileListTab 组件

**Files:**

- Verify/Create: `src/renderer/components/LeftPanel.tsx` (已 WIP, 微调)
- Verify/Create: `src/renderer/components/LeftPanel.css` (已 WIP, 确认完整)
- Verify/Create: `src/renderer/components/FileListTab.tsx` (已 WIP, 微调)
- Verify/Create: `src/renderer/components/FileListTab.css` (已 WIP, 确认完整)
- Create: `src/renderer/components/__tests__/LeftPanel.test.tsx`
- Create: `src/renderer/components/__tests__/FileListTab.test.tsx`

- [ ] **Step 1: 确认 `LeftPanel.tsx` 现状**

读 working tree 的 `LeftPanel.tsx`，验证：

- import `ProjectPanelInfo` from `./ProjectPanel` — **OK**（Task 2 已导出）
- import `ValidationPanel` from `./ValidationPanel` — **OK**（Task 2 已加 `embedded` prop）
- import `FileListTab` from `./FileListTab` — **OK**（本 Task 创建）
- `s.leftTab` / `s.setLeftTab` — **OK**（Task 2 已加）

如果以上都满足，保持 WIP 不动。

- [ ] **Step 2: 确认 `LeftPanel.css` 现状**

读 working tree 的 `LeftPanel.css`，验证包含：

- `.left-panel` (CSS Grid `display: grid; grid-template-rows: auto 1fr auto;`)
- `.left-panel-tabs` / `.left-panel-tab` / `.left-panel-tab.is-active` / `.left-panel-tab-badge`
- `.left-panel-content` / `.left-panel-pane`
- `.left-panel-tree` (Tree 固定底部)

如不完整，按需补。Catppuccin Mocha 色板对齐项目现有风格。

- [ ] **Step 3: 写 LeftPanel 测试**

新建 `src/renderer/components/__tests__/LeftPanel.test.tsx`：

```ts
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';

import { LeftPanel } from '../LeftPanel';
import { useArxmlStore } from '../../store/useArxmlStore';

describe('LeftPanel', () => {
  beforeEach(() => {
    useArxmlStore.setState({
      leftTab: 'files',
      project: null,
      validationErrors: [],
      lastValidatedAt: null,
      documentPaths: [],
      bswmdPaths: [],
    });
  });

  it('loose 模式只渲染 files + validate 两个 tab', () => {
    render(<LeftPanel />);
    expect(screen.queryByTestId('left-tab-project')).toBeNull();
    expect(screen.getByTestId('left-tab-files')).toBeTruthy();
    expect(screen.getByTestId('left-tab-validate')).toBeTruthy();
  });

  it('project 模式渲染三个 tab', () => {
    useArxmlStore.setState({
      project: { name: 'demo', valueArxmlPaths: [], bswmdPaths: [] } as any,
    });
    render(<LeftPanel />);
    expect(screen.getByTestId('left-tab-project')).toBeTruthy();
  });

  it('点击 tab 切换 active state', async () => {
    useArxmlStore.setState({
      project: { name: 'demo', valueArxmlPaths: [], bswmdPaths: [] } as any,
    });
    const user = userEvent.setup();
    render(<LeftPanel />);
    await user.click(screen.getByTestId('left-tab-validate'));
    expect(useArxmlStore.getState().leftTab).toBe('validate');
  });

  it('validate tab 在有错误时显示 badge', () => {
    useArxmlStore.setState({
      lastValidatedAt: 1000,
      validationErrors: [{
        kind: 'required',
        path: '/foo',
        message: 'missing',
      }] as any,
    });
    render(<LeftPanel />);
    expect(screen.getByTestId('left-tab-validate').textContent).toMatch(/1/);
  });

  it('loose 模式下默认 leftTab=project 自动 fallback 到 files', () => {
    useArxmlStore.setState({ leftTab: 'project' });
    render(<LeftPanel />);
    expect(useArxmlStore.getState().leftTab).toBe('files');
  });
});
```

Run: `pnpm test src/renderer/components/__tests__/LeftPanel.test.tsx`
Expected: PASS

- [ ] **Step 4: 确认 `FileListTab.tsx` 现状**

读 working tree 的 `FileListTab.tsx`，验证：

- import `basename` from `@shared/path` — **OK**（Task 1 已建）
- 用 `s.documentPaths` / `s.project.valueArxmlPaths` / `s.bswmdPaths` — 这些 store 字段已存在
- loose 模式 header 用 `projectPanel.loose.text` / `loose.new` / `loose.open` — **OK**（已存在）

如都满足，保持 WIP 不动。

- [ ] **Step 5: 确认 `FileListTab.css` 现状**

读 working tree 的 `FileListTab.css`，验证包含：

- `.file-list-tab-loose` (loose 模式 header)
- `.file-list-tab-group` / `.file-list-tab-group-title` / `.file-list-tab-count`
- `.file-list-tab-item` / `.file-list-tab-item.is-active-doc` / `.file-list-tab-item-icon` / `.file-list-tab-item-name` / `.file-list-tab-item-remove`
- `.file-list-tab-add` (BSWMD add 按钮)
- `.file-list-tab-empty`

如不完整，按需补。

- [ ] **Step 6: 写 FileListTab 测试**

新建 `src/renderer/components/__tests__/FileListTab.test.tsx`：

```ts
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { FileListTab } from '../FileListTab';
import { useArxmlStore } from '../../store/useArxmlStore';

vi.mock('../../hooks/useProjectActions', () => ({
  useProjectActions: () => ({
    newProject: vi.fn(),
    openProjectFromDialog: vi.fn(),
    addBswmdFromDialog: vi.fn(),
  }),
}));

describe('FileListTab', () => {
  beforeEach(() => {
    useArxmlStore.setState({
      project: null,
      documentPaths: [],
      bswmdPaths: [],
      activeDocumentPath: null,
      locale: 'zh-CN',
    });
  });

  it('loose 模式显示 New/Open 按钮', () => {
    render(<FileListTab />);
    expect(screen.getByTestId('file-list-tab-loose-new')).toBeTruthy();
    expect(screen.getByTestId('file-list-tab-loose-open')).toBeTruthy();
  });

  it('project 模式显示 BSWMD 区域', () => {
    useArxmlStore.setState({
      project: { valueArxmlPaths: [], bswmdPaths: [] } as any,
    });
    render(<FileListTab />);
    expect(screen.getByTestId('file-list-tab-bswmd-add')).toBeTruthy();
  });

  it('点击 ARXML 文件切换 active', async () => {
    useArxmlStore.setState({
      project: { valueArxmlPaths: ['/p/EcuC.arxml'], bswmdPaths: [] } as any,
      activeDocumentPath: null,
    });
    const user = userEvent.setup();
    render(<FileListTab />);
    await user.click(screen.getByTestId('file-list-tab-arxml-/p/EcuC.arxml'));
    expect(useArxmlStore.getState().activeDocumentPath).toBe('/p/EcuC.arxml');
  });

  it('空 ARXML 列表显示空提示', () => {
    useArxmlStore.setState({
      project: { valueArxmlPaths: [], bswmdPaths: [] } as any,
    });
    render(<FileListTab />);
    expect(screen.getByText(/空|empty/i)).toBeTruthy();
  });
});
```

Run: `pnpm test src/renderer/components/__tests__/FileListTab.test.tsx`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/renderer/components/LeftPanel.tsx src/renderer/components/LeftPanel.css src/renderer/components/FileListTab.tsx src/renderer/components/FileListTab.css src/renderer/components/__tests__/LeftPanel.test.tsx src/renderer/components/__tests__/FileListTab.test.tsx
git commit -m "feat(tabs): LeftPanel + FileListTab components with tests"
```

---

## Task 4: AppHeader 项目下拉菜单（独立 UX 改动，可单独 revert）

**Files:**

- Verify/Modify: `src/renderer/components/AppHeader.tsx` (working tree 已 WIP)
- Verify/Modify: `src/renderer/components/__tests__/AppHeader.test.tsx` (working tree 已 WIP)
- Verify: `src/renderer/styles.css` (working tree 中 .app-menu* / .app-dropdown* 类已存在)
- Verify: `src/shared/i18n.ts` (working tree 中 `app.menu.project` / `app.menu.projectManage` / `app.menu.fileOps` 键已存在)

- [ ] **Step 1: 读 AppHeader.tsx WIP 确认逻辑正确**

读 working tree 的 `AppHeader.tsx`:

- 把两个 project 按钮（"新建" + "打开"）合并到 "项目" 下拉菜单
- 加 project chip 显示当前打开项目（虽然左栏"项目"Tab 也会显示，但 header 始终可见是更直接的入口 — 这是 design 决定）
- click-outside 关闭 + Escape 关闭 + 鼠标 hover 延迟关闭
- 定时器 ref 在 unmount 时清理

逐项 review 代码（`menuOpen` / `menuRef` / `closeTimerRef` / `openMenu` / `scheduleClose` 三个 useEffect）。

- [ ] **Step 2: 读 AppHeader.test.tsx WIP 确认测试覆盖**

读 working tree 的 `__tests__/AppHeader.test.tsx`:

- 验证下拉菜单打开/关闭测试存在
- 验证 New / Open / Open ARXML 菜单项的 click 测试存在
- 验证 Escape 关闭测试存在

如果缺测试，按需补。

- [ ] **Step 3: 跑测试**

Run: `pnpm test src/renderer/components/__tests__/AppHeader.test.tsx`
Expected: PASS

- [ ] **Step 4: 跑 lint**

Run: `pnpm lint src/renderer/components/AppHeader.tsx src/renderer/components/__tests__/AppHeader.test.tsx`
Expected: PASS（0 warnings）

- [ ] **Step 5: 提交**

```bash
git add src/renderer/components/AppHeader.tsx src/renderer/components/__tests__/AppHeader.test.tsx src/renderer/styles.css src/shared/i18n.ts
git commit -m "feat(header): project dropdown menu (EB-tresos-style)"
```

---

## Task 5: 把 LeftPanel 接入 App.tsx + 替换堆叠布局

**Files:**

- Modify: `src/renderer/App.tsx` (line 90-99 替换)
- Modify: `src/renderer/styles.css` (line 450-458 `.left-column` 改造或保留)
- Verify: 现有 AppHeader / ArxmlPanel / ParamEditor 测试仍然通过

- [ ] **Step 1: 改 App.tsx**

读 `src/renderer/App.tsx` line 90-99，替换：

```tsx
-(
  <div className="left-column">
    - <ProjectPanel />
    - <Tree store={useArxmlStore} />
    - <ValidationPanel />-{' '}
  </div>
) + <LeftPanel />;
```

加 import：

```ts
import { LeftPanel } from './components/LeftPanel';
```

删除不再使用的 import：

```ts
- import { ProjectPanel } from './components/ProjectPanel';
- import { Tree } from './components/tree/Tree';
- import { ValidationPanel } from './components/ValidationPanel';
```

(注意：Tree 仍然在 `LeftPanel` 内部被引用，import 不必删，但 `ProjectPanel` 和 `ValidationPanel` 的直接 import 确实删掉)

- [ ] **Step 2: 改 styles.css**

读 `src/renderer/styles.css` line 450-458 附近的 `.left-column` 规则。

如果 `.left-column` 类不再被任何元素使用，可以删除该规则。
如果未来仍需保留（向后兼容），保留但加注释说明 "left-column 已被 left-panel 取代，保留此规则以备后用"。

如果 `.left-column` 的 grid 样式 (auto 1fr auto) 与 `.left-panel` 重复，从 `.left-column` 删除，只在 `.left-panel` 留。

- [ ] **Step 3: 跑所有相关测试**

Run: `pnpm test src/renderer`
Expected: 全部 PASS

- [ ] **Step 4: 跑 type-check**

Run: `pnpm type-check`
Expected: 0 errors

- [ ] **Step 5: 跑 lint**

Run: `pnpm lint`
Expected: 0 warnings

- [ ] **Step 6: 跑 build**

Run: `pnpm build`
Expected: 成功

- [ ] **Step 7: 提交**

```bash
git add src/renderer/App.tsx src/renderer/styles.css
git commit -m "feat(tabs): wire LeftPanel into App.tsx, replace stacked layout"
```

---

## Task 6: 收尾验证 + PROGRESS 回填

- [ ] **Step 1: 跑全量测试 + 覆盖率**

Run: `pnpm test:coverage`
Expected: 与 Sprint 12 #3 baseline (96.47% stmts / 85.45% branches / 100% funcs) 持平或略升

- [ ] **Step 2: 跑 5/5 baseline signed-guard**

`docs/verify-baseline.md` 或类似文件（先 `git ls-files docs/` 找）：
Run: `pnpm verify`
Expected: cross-ref 782 signed-guard [700, 850] 保持；ref-dest 0 / ref-cycle 0；schema-unknown 0

- [ ] **Step 3: 跑 Playwright E2E（如果 `tests/e2e/` 下有 left-panel 场景）**

Run: `pnpm test:e2e tests/e2e/left-panel-tabs.spec.ts`（如果存在）
Expected: 全部 PASS

如果 E2E 文件不存在，跳过此步（暂不为 tab 化加新 E2E 测试，由后续 sprint 补）

- [ ] **Step 4: 回填 PROGRESS / Sprint entry**

读 `docs/PROGRESS.md`（如果存在），在 Sprint 12 #3 之后追加：

```
## Sprint 13 #0 — 左侧栏 Tab 化（不在原 Sprint 13 计划内，临时插入）
- HEAD: <新 commit hash>
- 5 commits: i18n / store+ValidationPanel+ProjectPanel 拆分 / LeftPanel+FileListTab / AppHeader 下拉 / 接入 App.tsx
- tests: +N (LeftPanel 5 + FileListTab 4 = 9 新增，-M (ProjectPanel.bswmd 删) = 净 +K)
- coverage: 与 baseline 持平
- 5/5 baseline: 保持
```

如果 `docs/PROGRESS.md` 不存在或不需要回填，跳过。

- [ ] **Step 5: 提交 PROGRESS 更新**

```bash
git add docs/PROGRESS.md
git commit -m "docs(progress): Sprint 13 #0 left-panel tab refactor entry"
```

- [ ] **Step 6: 把 5 个 commit 推到 origin**

告知 user 需要执行 `git push`：

```bash
git -c http.proxy= -c https.proxy= push -u origin main
```

**不在本计划自动执行** — push 是 outward-facing 动作，需 user 确认。

---

## 范围外（明确不做）

- **Sprint 13 #1 模板 backend**（`samples/` + `template.json`）— 是独立方向，由 `8cefcd1` + `fa07617` 锁定，本计划不动
- **Sprint 13 namespace+BSWMD-strict 已 ship 的 13 个 commit** — 全部保留，与本计划独立
- **electron-builder 打包（#8）** — Sprint 12 backlog，不在本计划
- **branches ≥90% coverage 推到（#9）** — Sprint 12 backlog，不在本计划
- **fixture 体积管理（#7）** — Sprint 12 backlog，不在本计划
- **OS dialog title 本地化（M7）** — Sprint 12 backlog，不在本计划
- **ParamEditor column header 本地化（M6）** — Sprint 12 backlog，不在本计划
- **`formatParseError` 本地化（M8）** — Sprint 12 backlog，不在本计划
- **`<CHOICES>` 递归深度上限** — Sprint 12 backlog
- **default-value 跨 enumerationLiterals 校验** — Sprint 12 backlog
- **等价 size cap on `arxml:parse` IPC** — Sprint 12 backlog
- **Sprint 9 #15 `schema-unknown`** — Sprint 12 backlog

---

## Self-Review

**1. Spec coverage:**

- ✅ Tab 三件套（项目/文件/验证）— Task 2 (store) + Task 3 (components) + Task 5 (wire)
- ✅ Tree 固定底部 — Task 3 LeftPanel.css + Task 5 App.tsx 替换
- ✅ Loose 模式隐藏项目 Tab — Task 3 LeftPanel.test.tsx 第 1 个 test
- ✅ Loose 模式 files Tab 显示 New/Open — Task 3 FileListTab.test.tsx 第 1 个 test
- ✅ 点击 ARXML 切换 active — Task 3 FileListTab.test.tsx 第 3 个 test
- ✅ validate badge 显示错误数 — Task 3 LeftPanel.test.tsx 第 4 个 test
- ✅ i18n 切换 — Task 1 + Task 3 (LeftPanel 用 `leftPanel.tab.*`)
- ✅ basename 去重 — Task 1
- ✅ AppHeader 下拉（独立 UX）— Task 4
- ✅ Verification (test + lint + type-check + build) — Task 5 Step 3-6 + Task 6

**2. Placeholder scan:** 无 "TBD" / "TODO" / "similar to" / "appropriate" 等占位。所有 Step 都有具体路径、具体代码片段、具体命令。

**3. Type consistency:**

- `LeftTabId = 'project' | 'files' | 'validate'` 在 Task 2 Step 1 定义并贯穿 Task 3 LeftPanel.tsx (line 34) 和 Task 3 LeftPanel.test.tsx — 一致
- `basename` 从 `@shared/path` 导入（Task 1）— ProjectPanel + AppHeader + FileListTab 都用同一个 import 路径
- `ProjectPanelInfo` 在 Task 2 Step 5 导出，Task 3 LeftPanel.tsx line 28 导入 — 一致
- `embedded?: boolean` 在 Task 2 Step 3 加，Task 3 LeftPanel.tsx line 129 传 `embedded` — 一致
- i18n 键 `leftPanel.tab.{project|files|validate}` 在 Task 1 定义，Task 3 LeftPanel.tsx line 44-46 用 — 一致
- 旧 `ProjectPanel` 顶层导出在 Task 2 Step 5 删除，Task 5 Step 1 App.tsx 同步删除 import — 一致

**Issues found & fixed inline:** 无。
