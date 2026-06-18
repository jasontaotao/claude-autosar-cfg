# Stage 3.4 — BSWMD chips (Sprint 12 #3 Phase 3)

> **For agentic workers:** 本计划执行 Sprint 12 #3 Phase 3 (master plan § 3.4)。Wave 3 sub-agent 任务范围（不要动其他 Stage 子项）。

**Goal:** 在 `NewProjectDialog` 中，当用户选中 Classic 模板时，显示该模板的 BSWMD chip 多选列表；选中 Empty / Clone 时不显示 chips。提交时把选中的 BSWMD 路径写入 `project.bswmdPaths`，让 main 把这些 BSWMD 一并拷贝到项目目录。

**Architecture:** 新建 `BswmdChip` 展示组件 + `BswmdChipRow` 容器 + 后端 `templates:list` 响应扩展 `bswmdPaths` 字段 + 扩展 `NewProjectDialog` 的 `onSubmit(name, dir)` 为 `onSubmit(name, dir, opts?)` 接受 `{ bswmdPaths: string[] }`，同步扩展 `useProjectActions.submitNewProject` + `projectNew` IPC。

**Tech Stack:** Electron 30 + TypeScript 5 strict + React 18 + Zustand 4 + Vitest 1 (与现有 stack 一致)

---

## 起点状态 (2026-06-17)

| 项             | 状态                                                                               |
| -------------- | ---------------------------------------------------------------------------------- |
| `local HEAD`   | `b3abd22` Wave 2 v0.16.0 release (already pushed)                                  |
| `origin/main`  | = local (0 ahead / 0 behind)                                                       |
| Tests baseline | **809 passed / 1 skipped** / 96.64% stmts / 86.55% branches / 100% funcs           |
| Version        | v0.16.0                                                                            |
| Stage 2 状态   | templates backend (TEMPLATES_LIST + TEMPLATES_COPY) 已 ship                        |
| Stage 3.3 状态 | TemplateCard picker + onSubmit(name, dir) 已 ship                                  |
| Stage 3.4 范围 | 仅 NewProjectDialog + useProjectActions + projectNew IPC + templatesHandler + i18n |

---

## 范围 (4 tasks per master plan § 3.4)

1. **Task 1**: Backend 扩展 — `templates:list` IPC 响应加 `bswmdPaths` 字段（仅给 `classic` 暴露真实路径，空 / clone 返回空数组）
2. **Task 2**: 前端扩展 — `TemplateRow` 加 `bswmdPaths` 字段；新建 `BswmdChip.tsx` + `BswmdChipRow.tsx` + CSS；Empty 模板不显示 chips，Classic 模板显示，Clone 不显示
3. **Task 3**: 集成到 `NewProjectDialog` — `onSubmit(name, dir, opts?: { bswmdPaths?: string[] })`；新建 `BswmdChipRow` 嵌入到 `TemplateCardRow` 下方（条件渲染）；清空 selected template 时 reset `selectedBswmdPaths`；通过 `useProjectActions.submitNewProject` 传递到 IPC
4. **Task 4**: i18n keys + verify — `newProject.bswmdLabel` / `newProject.bswmdHint` / `newProject.noBswmd` (zh-CN + en)；更新 `useProjectActions.submitNewProject` 把 `bswmdPaths` 透传给 `projectNew` IPC + 把 chips 状态重置；`pnpm test` 保持 809+ / 5/5 baseline

---

## Task 1 — Backend 扩展 (`templates:list` 返回 `bswmdPaths`)

### 背景

`BuiltinTemplate.bswmdPaths` 字段已经在 Stage 2 准备好（`src/main/templates/types.ts:24` — `readonly bswmdPaths: readonly string[];`），但是 `templatesListHandler` (`src/main/ipc/templatesHandler.ts:84-99`) **只暴露** `id / displayNameKey / descriptionKey / fileCount`，不暴露 `bswmdPaths` 给 renderer。

本 Task 扩展 IPC 响应：

```typescript
// src/shared/types.ts
export interface TemplateListResponse {
  readonly templates: ReadonlyArray<{
    readonly id: string;
    readonly displayNameKey: string;
    readonly descriptionKey: string;
    readonly fileCount: number;
    /** Sprint 13+ Stage 3.4 — absolute on-disk paths of schema-side
     *  BSWMD files within the template's `bswmd/` dir. The renderer
     *  surfaces them as multi-select chips in NewProjectDialog. Empty
     *  for templates without a `bswmd/` dir (e.g. `empty`, `clone`).
     *  The renderer treats these as opaque strings — main never
     *  re-reads the file before copying, and renderer-side code paths
     *  never execute on them. */
    readonly bswmdPaths: readonly string[];
  }>;
}
```

`templatesListHandler` 把 `t.bswmdPaths` 直接 copy 进响应（不重新计算 — `BuiltinTemplate.bswmdPaths` 已经是 absolute path 数组）。

### RED

`src/main/ipc/__tests__/templatesHandler.test.ts` 加 1 个 case：

```typescript
it('exposes bswmdPaths in the list response (Stage 3.4)', async () => {
  __setTestCache([
    makeTemplate({ id: 'classic', bswmdPaths: ['/samples/classic/bswmd/Can.arxml'] }),
  ]);
  const r = await templatesListHandler({});
  expect(r.templates[0]?.bswmdPaths).toEqual(['/samples/classic/bswmd/Can.arxml']);
});
```

### GREEN

修改 `templatesListHandler` 在 `templates: list` 响应中加 `bswmdPaths: t.bswmdPaths`。

### 风险

- 旧 IPC 响应（`{ id, displayNameKey, descriptionKey, fileCount }`）会被改成多 1 个字段 — 是 additive change，不破坏向后兼容（renderer 端用 `?.` 读取）。
- 暴露 absolute path 给 renderer 是设计妥协（renderer 不读 `process.resourcesPath`），但 chips UI 需要展示相对路径（basename），所以 renderer 内部做 `lastSegment` 转换，不直接显示 absolute path。

---

## Task 2 — 前端 `BswmdChip` 组件 + `BswmdChipRow` 容器

### 背景

Stage 3.3 的 `TemplateCardRow` 渲染卡片；本 Task 新增 `BswmdChipRow` 在选中 Classic 时显示。`BswmdChip` 是单 chip — multi-select toggle（点击 toggle 选中/取消）。

### 组件层次

```
NewProjectDialog
├── <input name>
├── <input dir>
└── TemplateCardRow
    ├── TemplateCard (empty)
    ├── TemplateCard (classic)  ← selected 时，下方显示
    └── TemplateCard (clone)
[条件渲染] BswmdChipRow (仅当 selectedTemplateId === 'classic' && classic.bswmdPaths.length > 0)
    ├── BswmdChip (basename1, unselected)
    ├── BswmdChip (basename2, selected)
    └── ...
```

### RED

`src/renderer/components/__tests__/BswmdChipRow.test.tsx` 新建（5-6 cases）：

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
// 测试：
// 1. 渲染所有 bswmdPaths 列表
// 2. 点击 chip → 切换 onChange callback
// 3. selectedPaths 内的 chip 渲染 selected modifier
// 4. 空 bswmdPaths → 渲染 "noBswmd" 提示文案
// 5. i18n label 来自 store locale
// 6. chips 显示 basename（不是 absolute path）
```

### GREEN

`src/renderer/components/BswmdChip.tsx` + `BswmdChipRow.tsx` + `BswmdChip.css`：

```typescript
// BswmdChip.tsx
interface BswmdChipProps {
  readonly label: string;     // basename 显示
  readonly selected: boolean;
  readonly onToggle: () => void;
}

export function BswmdChip({ label, selected, onToggle }: BswmdChipProps): JSX.Element {
  const className = `bswmd-chip ${selected ? 'bswmd-chip--selected' : ''}`;
  return (
    <button type="button"
      className={className}
      aria-pressed={selected}
      data-testid={`bswmd-chip-${label}`}
      onClick={onToggle}>
      {label}
    </button>
  );
}
```

```typescript
// BswmdChipRow.tsx
interface BswmdChipRowProps {
  readonly bswmdPaths: readonly string[];       // absolute paths
  readonly selectedPaths: readonly string[];    // absolute paths
  readonly onToggle: (path: string) => void;
}

export function BswmdChipRow({ bswmdPaths, selectedPaths, onToggle }: BswmdChipRowProps): JSX.Element {
  const locale: Locale = useArxmlStore((s) => s.locale);
  if (bswmdPaths.length === 0) {
    return <div className="npd-bswmd-empty">{t(locale, 'newProject.noBswmd')}</div>;
  }
  return (
    <div className="npd-bswmd-row" data-testid="bswmd-chip-row">
      <div className="npd-bswmd-label">{t(locale, 'newProject.bswmdLabel')}</div>
      <div className="npd-bswmd-hint">{t(locale, 'newProject.bswmdHint')}</div>
      <div className="npd-bswmd-chips">
        {bswmdPaths.map((p) => {
          const basename = p.split(/[\\/]/).pop() ?? p;
          return (
            <BswmdChip key={p} label={basename}
              selected={selectedPaths.includes(p)}
              onToggle={() => onToggle(p)} />
          );
        })}
      </div>
    </div>
  );
}
```

### 风险

- `BswmdChip` 必须保持纯展示（Container / Presentational 拆分）。
- basename 提取用 `split(/[\\/]/).pop()` 而不是 `path.basename()` — 保持 zero deps（renderer 不能 import node:path）。

---

## Task 3 — 集成到 `NewProjectDialog` + `useProjectActions` + `projectNew` IPC

### 背景

`NewProjectDialog.onSubmit(name, dir)` 需要扩展为 `onSubmit(name, dir, opts?: { bswmdPaths?: string[] })`。Stage 3.3 的 NewProjectDialog 已经持有 `selectedTemplateId`；本 Task 加 `selectedBswmdPaths: string[]`。

### 改动列表

1. `NewProjectDialogProps.onSubmit` 签名扩展为 `(name, dir, opts?) => void | Promise<void>`
2. `NewProjectDialog` 持有 `selectedBswmdPaths: string[]` state
3. 当 `selectedTemplateId` 变化时 reset `selectedBswmdPaths = []`
4. 当 `selectedTemplateId === 'classic'` 时，从 IPC 拉到的 templates 数组中找 `classic`，把 `bswmdPaths` 传给 `BswmdChipRow`
5. `useProjectActions.submitNewProject(name, directory, opts?)` 透传 `bswmdPaths` 给 `projectNew` IPC
6. `projectNew` IPC 处理程序 (`src/main/projectNewHandler.ts` — 待确认) 把 `bswmdPaths` 写入 `project.bswmdPaths`
7. App.tsx 的 `handleNewProjectSubmit` 扩展签名

### RED

`src/renderer/components/__tests__/NewProjectDialog.test.tsx` 加 2-3 cases：

```typescript
describe('NewProjectDialog (Sprint 13+ Stage 3.4 — BSWMD chips)', () => {
  it('does NOT render the BswmdChipRow when Empty is selected', async () => {
    installAutosarApi();
    setOpen(true);
    render(<NewProjectDialog onSubmit={() => undefined} />);
    await waitFor(() => screen.getByTestId('tpl-card-empty'));
    fireEvent.click(screen.getByTestId('tpl-card-empty'));
    expect(screen.queryByTestId('bswmd-chip-row')).toBeNull();
  });

  it('renders the BswmdChipRow with chips when Classic is selected', async () => {
    installAutosarApi();
    setOpen(true);
    render(<NewProjectDialog onSubmit={() => undefined} />);
    await waitFor(() => screen.getByTestId('tpl-card-classic'));
    fireEvent.click(screen.getByTestId('tpl-card-classic'));
    await waitFor(() => screen.getByTestId('bswmd-chip-row'));
    // 期望: 1+ chips 渲染（IPC stub bswmdPaths: ['/samples/classic/bswmd/Can.arxml']）
  });

  it('clicking Create with Classic + selected BSWMDs forwards bswmdPaths in onSubmit opts', async () => {
    installAutosarApi();
    setOpen(true);
    const onSubmit = vi.fn();
    render(<NewProjectDialog onSubmit={onSubmit} />);
    await waitFor(() => screen.getByTestId('tpl-card-classic'));
    fireEvent.click(screen.getByTestId('tpl-card-classic'));
    await waitFor(() => screen.getByTestId('bswmd-chip-row'));
    fireEvent.click(screen.getByTestId('bswmd-chip-Can.arxml')); // select one
    fireEvent.change(screen.getByTestId('npd-name-input'), { target: { value: 'C' } });
    fireEvent.change(screen.getByTestId('npd-dir-input'), { target: { value: '/d' } });
    fireEvent.click(screen.getByTestId('npd-create'));
    expect(onSubmit).toHaveBeenCalledWith('C', '/d', {
      bswmdPaths: ['/samples/classic/bswmd/Can.arxml'],
    });
  });
});
```

### GREEN

按上面"改动列表"实现。`useProjectActions.submitNewProject`：

```typescript
const submitNewProject = useCallback(
  async (
    name: string,
    directory: string,
    opts: { bswmdPaths?: string[] } = {},
  ): Promise<ProjectActionResult> => {
    const bswmdPaths = opts.bswmdPaths ?? [];
    const result = await window.autosarApi.projectNew({ name, directory, bswmdPaths });
    // ... 后续 switch 不变
  },
  [],
);
```

`projectNew` IPC (在 `src/main/projectNewHandler.ts` 或类似) 接收 `bswmdPaths` 并写入 `manifest.bswmdPaths`：

```typescript
// 伪代码 — 看实际文件
const manifest: ProjectManifest = {
  ...baseManifest,
  bswmdPaths, // 把 stage 3.4 透传的 bswmdPaths 写入
  // ...
};
```

`useProjectActions.test.ts` 现有 6 个 `submitNewProject` tests 需要更新签名（仍调 2 个参数，但加可选第 3 个）。Stage 3.4 的 IPC `projectNew` stub 也需要接受 `bswmdPaths`。

### 风险

- 扩展 IPC `projectNew` 签名是 additive — 旧 stub 不传 `bswmdPaths` 时，main 端用 `req.bswmdPaths ?? []` 兼容。
- `NewProjectDialog.onSubmit` 签名变化会破坏 `App.tsx` — 必须同步修改 `handleNewProjectSubmit`。
- `selectedBswmdPaths` reset 逻辑：每次 `selectedTemplateId` 变化时清空；关闭 dialog 时清空（与 `selectedTemplateId` 一起在 effect 里 reset）。

---

## Task 4 — i18n keys + verify

### 新 i18n keys (3 × 2 = 6 entries)

`src/shared/i18n.ts` Messages interface 加 3 个 key + zh-CN / en bundle 各加 3 条：

```typescript
// Messages interface
readonly 'newProject.bswmdLabel': string;
readonly 'newProject.bswmdHint': string;
readonly 'newProject.noBswmd': string;

// MessagesZhCN
'newProject.bswmdLabel': '预填 BSWMD',
'newProject.bswmdHint': '可多选；将随模板一并拷贝到项目目录',
'newProject.noBswmd': '该模板未携带 BSWMD',

// MessagesEn
'newProject.bswmdLabel': 'Preload BSWMDs',
'newProject.bswmdHint': 'Select multiple; they will be copied to your project',
'newProject.noBswmd': 'This template has no BSWMD files',
```

### Verify

1. `pnpm test` — 期望 809+4 = **813 passed / 1 skipped**
2. `pnpm type-check` — 期望 0 errors
3. `pnpm lint` — 期望 0 warnings
4. `pnpm format:check` — 期望 0 diff
5. `pnpm verify` — 5/5 baseline 保持 (782 signed-guard [700, 850])

### Coverage target

- Statements ≥ 96.64% (baseline)
- Branches ≥ 86.55% (baseline)
- Functions = 100%

---

## 依赖

- Stage 2 (templates backend) ✅ 已 ship
- Stage 3.3 (TemplateCard picker) ✅ 已 ship
- 不依赖 Stage 3.5 (Combined Tree View) — 独立 UI 特性

---

## Out of scope (明确不做)

- 不 bump version（Wave 3 ship 后由主 loop 统一 bump 到 v0.16.1）
- 不动 Stage 3.5 的 FileListTab / Combined Tree
- 不动 `useProjectActions.openProjectFromDialog` (旧项目打开时，bswmdPaths 走 main `project:open` 已经 ship)
- 不动 Stage 3.1 / 3.2 任何已 ship 的文件

---

## Self-Review

1. **i18n key 数量**: 3 × 2 = 6 entries (3 个新 key, 各 zh-CN + en)
2. **新文件**: `BswmdChip.tsx` + `BswmdChipRow.tsx` + `BswmdChip.css` + `__tests__/BswmdChipRow.test.tsx`
3. **修改文件**: `src/shared/types.ts` (TemplateListResponse + ProjectNewRequest) + `src/shared/i18n.ts` + `src/main/ipc/templatesHandler.ts` + `src/renderer/components/templates.ts` (TemplateRow) + `src/renderer/components/TemplateCardRow.tsx` (暴露 bswmdPaths 给 dialog) + `NewProjectDialog.tsx` + `useProjectActions.ts` + `App.tsx` + `__tests__/NewProjectDialog.test.tsx` + `__tests__/useProjectActions.test.tsx` + `NewProjectDialog.css` + `i18n.test.ts` (新 key parity)
4. **测试增量**: +4-5 (BswmdChipRow 5 + NewProjectDialog 3) = 净 +5 (rough estimate)
5. **5/5 baseline**: 782 signed-guard [700, 850] — verify 全过
