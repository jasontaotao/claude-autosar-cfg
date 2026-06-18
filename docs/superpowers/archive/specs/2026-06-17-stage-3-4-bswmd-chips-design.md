# Stage 3.4 — BSWMD chips Design Spec

> **For agentic workers:** 本 spec 描述 Stage 3.4 BSWMD chip 多选 UI 的设计决策。配套 plan: `2026-06-17-stage-3-4-bswmd-chips.md`。

## 1. 用户故事

用户在 NewProjectDialog 选 Classic 模板 → 模板卡片下方出现可多选 BSWMD chip 列表（来自模板的 `bswmd/` 目录）→ 用户勾选若干 BSWMD → 点 Create → main 把选中的 BSWMD 一并 copy 到项目目录并写入 `project.bswmdPaths` → 打开后这些 BSWMD 自动加载并参与 schema 验证。

## 2. UI 草图 (Classic 选中时)

```
┌─────────────────────────────────────────────────────────────┐
│  New Project                                          ✕     │
├─────────────────────────────────────────────────────────────┤
│  Project Name *                                              │
│  [____________________]                                      │
│                                                              │
│  Save Location *                                             │
│  [_________________] [Browse...]                             │
│  📁 /tmp/MyProject.autosarcfg.json                          │
│                                                              │
│  ── Choose a template ──                                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │  ☐ Empty    │ │  ☑ Classic  │ │  ☐ Clone    │           │
│  │             │ │             │ │             │           │
│  │             │ │             │ │             │           │
│  │  📁 0 files │ │  📁 2 files │ │  📁 0 files │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
│                                                              │
│  ── Preload BSWMDs ──                                       │
│  Select multiple; they will be copied to your project       │
│  [☑ Can.arxml] [☐ EcuC.arxml]                               │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│              [Cancel]    [Create]                            │
│       <Enter> Create   <Esc> Cancel                          │
└─────────────────────────────────────────────────────────────┘
```

Empty / Clone 选中时 chips 行不渲染（避免空状态视觉噪音）。

## 3. 组件层次

```
NewProjectDialog
├── <input name>
├── <input dir>
└── TemplateCardRow
    ├── TemplateCard (empty)
    ├── TemplateCard (classic)  ← selected
    └── TemplateCard (clone)
[条件渲染] BswmdChipRow (selectedTemplateId === 'classic' && classicBswndPaths.length > 0)
    ├── BswmdChip (Can.arxml, selected)
    └── BswmdChip (EcuC.arxml, unselected)
```

`BswmdChipRow` 是 `NewProjectDialog` 的子节点（不是 `TemplateCardRow` 的子节点）— 因为 chip 状态由 dialog 持有，dialog 是 close 时 reset 的源头。

## 4. 数据流

```
[main boot] discoverBuiltinTemplates() → BuiltinTemplate[] (含 bswmdPaths)
↓
[renderer 启动 / NewProjectDialog 打开]
  → TemplateCardRow useEffect: window.autosarApi.listTemplates()
  → IPC 响应: { templates: [{ id, ..., bswmdPaths: [absPath, ...] }] }
  → TemplateCardRow setTemplates(res.templates)
  → 传给 NewProjectDialog (selectedId + templates + onSelect)
  → NewProjectDialog 在 templates 中找 selectedTemplateId 对应的 bswmdPaths
↓
[user clicks "Classic" card]
  → onSelect('classic') → setSelectedTemplateId('classic')
  → setSelectedBswmdPaths([]) // 切模板时清空之前选的
  → NewProjectDialog 渲染 BswmdChipRow
↓
[user clicks a BSWMD chip]
  → onToggle(absPath)
  → setSelectedBswmdPaths((prev) => prev.includes(absPath) ? prev.filter(p !== absPath) : [...prev, absPath])
  → chip re-render with new aria-pressed
↓
[user clicks Create]
  → onSubmit(name, dir, { bswmdPaths: selectedBswmdPaths })
  → App.tsx → useProjectActions.submitNewProject(name, dir, { bswmdPaths })
  → window.autosarApi.projectNew({ name, directory, bswmdPaths })
  → main projectNewHandler: 写 manifest.bswmdPaths = bswmdPaths
  → return { kind: 'created', path, manifest }
  → store.openProject({ manifestPath, manifest, docs: [] })
  → 后续 stage 3.4+ 会扩展 project:open 响应, 把 bswmdPaths 路径的 bswmd 内容加载到 store
```

## 5. 类型契约

### 5.1 IPC 扩展 (`src/shared/types.ts`)

```typescript
export interface TemplateListResponse {
  readonly templates: ReadonlyArray<{
    readonly id: string;
    readonly displayNameKey: string;
    readonly descriptionKey: string;
    readonly fileCount: number;
    /** Stage 3.4 — absolute paths of BSWMD files within template's bswmd/ dir. */
    readonly bswmdPaths: readonly string[];
  }>;
}

export interface ProjectNewRequest {
  readonly name: string;
  readonly directory: string;
  readonly overwrite?: boolean;
  /** Stage 3.4 — BSWMD paths selected via BswmdChipRow. Main writes
   *  these into project.bswmdPaths when creating the manifest. Empty
   *  array when no chips are checked (Empty / Clone templates). */
  readonly bswmdPaths?: readonly string[];
}
```

### 5.2 ProjectManifest 不变

`ProjectManifest.bswmdPaths` 已经是 `readonly string[]` (`src/shared/project.ts`)，main 把 IPC 透传的 bswmdPaths 直接写进去。**不**改 `ProjectManifest` shape。

### 5.3 NewProjectDialog props 扩展

```typescript
export interface NewProjectSubmitOpts {
  /** Absolute paths of BSWMDs the user pre-selected via BswmdChipRow. */
  readonly bswmdPaths?: readonly string[];
}

export interface NewProjectDialogProps {
  readonly onSubmit: (
    name: string,
    directory: string,
    opts?: NewProjectSubmitOpts,
  ) => void | Promise<void>;
}
```

### 5.4 TemplateRow helper 扩展

```typescript
// src/renderer/components/templates.ts
export interface TemplateRow {
  readonly id: string;
  readonly displayNameKey: string;
  readonly descriptionKey: string;
  readonly fileCount: number;
  /** Stage 3.4 — list of BSWMD paths for the chip row. */
  readonly bswmdPaths: readonly string[];
}
```

`TemplateCardRow` 在 IPC 响应 → `setTemplates` 时把 `bswmdPaths` 透传进 `TemplateRow`。

## 6. 视觉状态

### 6.1 BswmdChip 状态

| State         | Visual                                    |
| ------------- | ----------------------------------------- |
| default       | 边框 #45475a, 背景 #1e1e2e, 文字 #cdd6f4  |
| hover         | 边框 #585b70                              |
| selected      | 边框 #89b4fa, 背景 rgba(137,180,250,0.13) |
| focus-visible | outline 2px #89b4fa                       |

`aria-pressed={selected}` — 屏幕阅读器能区分。

### 6.2 布局

`BswmdChipRow` 用 flex-wrap container（chips 排成行，超出换行），不强制 grid 布局。max-width = 100% of dialog body。

## 7. Empty / Clone 路径

- **Empty 选中**: `bswmdPaths.length === 0` → 不渲染 `BswmdChipRow`（无视觉噪音）
- **Clone 选中**: 同样不渲染（Stage 3.3 把 Clone 标 "coming soon" disabled；如果未来 wire 上，按 Empty 同理处理）
- **Classic 选中但 bswmdPaths === []** (边缘 case, e.g. 用户删了 bswmd 目录): 渲染 "noBswmd" 提示

## 8. Reset 语义

- 关闭 dialog (`newProjectDialogOpen` 变 false) → effect reset `selectedTemplateId = null` + `selectedBswmdPaths = []`
- 切换 template (`setSelectedTemplateId(other)`) → effect reset `selectedBswmdPaths = []` (之前选 classic 的 chips 不应该 leak 到 empty 路径)
- Create 成功后 → dialog close, 走关闭 effect

## 9. 风险

1. **后端 sample dir 未 ship**: 现状 `samples/` 只有 `arxml/` 子目录，没有 `classic/bswmd/`. 生产环境 `templatesRoot` 为空 → IPC 返回 `[]` → `TemplateCardRow` fallback 到 Empty-only → chips 永远不会显示。**正确**：UI 代码就位但生产环境不显示，直到 samples 落地。**缓解**：unit tests 用 stub `listTemplates` 返回 3 个模板 + classic 1 个 bswmdPath 验证完整路径。

2. **`useProjectActions.test.ts` 6 个 `submitNewProject` tests**: 签名变化要求更新 `result.current.submitNewProject('NewProj', '/d')` 调用 — 但因为第 3 个参数是 optional, 这些调用不需要改（向后兼容）。需要更新 `installApiStub` 的 `projectNew` 签名让它接受新字段。

3. **App.tsx 签名变化**: `handleNewProjectSubmit` 签名从 `(name, dir) => void` 改为 `(name, dir, opts?) => void` — 但 App.tsx 是 host, opts 是 dialog 透传过来的, host 直接传给 hook 即可。**不破坏 host 接口**。

4. **main `projectNewHandler` 兼容**: 旧 IPC stub 不传 `bswmdPaths` 时, main 端用 `req.bswmdPaths ?? []` 兼容。**关键**: 读 main 端实际文件, 确认 handler 已经把 manifest 写到 disk; 我们需要扩展它去接受并写 bswmdPaths. (stage 3.4 design 决定 bswmdPaths 写到 manifest, 不做 disk copy — 真正的 bswmd 文件由 main 在 stage 2 已 ship 的 TEMPLATES_COPY 流程拷贝, 或在 stage 3.4+ 后续阶段加 project:open 时从 manifest 路径加载)。

5. **绝对路径在 IPC 透传**: 暴露 absolute path 给 renderer 是设计妥协。`Window` 进程知道 `process.resourcesPath` (main), 但 renderer 不能 import node:path. 这意味着 main 必须把 BSWMD 列表 (绝对路径) 放在 IPC 响应里让 renderer 展示 basename + 把 path 透传给 main 的 projectNew IPC. 安全性: 这些路径只是用户可读展示 + 一次性透传, 不写 fs, 不 evaluate.

## 10. i18n keys

| Key                     | zh-CN                              | en                                                   |
| ----------------------- | ---------------------------------- | ---------------------------------------------------- |
| `newProject.bswmdLabel` | 预填 BSWMD                         | Preload BSWMDs                                       |
| `newProject.bswmdHint`  | 可多选；将随模板一并拷贝到项目目录 | Select multiple; they will be copied to your project |
| `newProject.noBswmd`    | 该模板未携带 BSWMD                 | This template has no BSWMD files                     |

`i18n.test.ts` parity test 覆盖 — 3 个新 key 必须 zh-CN + en 都覆盖。

## 11. 测试覆盖

### Unit / Integration (Vitest + RTL)

**新增** `src/renderer/components/__tests__/BswmdChipRow.test.tsx` (5-6 cases)：

1. 渲染 N 个 chip (N === bswmdPaths.length)
2. 点击未选 chip → onToggle(absPath)
3. 点击已选 chip → onToggle(absPath) (再次触发, 让 parent 决定移除)
4. selectedPaths 内的 chip 应用 `--selected` modifier + `aria-pressed=true`
5. 空 bswmdPaths → 渲染 `newProject.noBswmd` 文案
6. 切换 locale → label / hint 文案变

**扩展** `NewProjectDialog.test.tsx` (3-4 cases)：

1. Empty 选中 → BswmdChipRow 不渲染
2. Classic 选中 → BswmdChipRow 渲染
3. Classic → 选 1 chip → 切到 Empty → 切回 Classic → 上次选的 chip 应该是 unselected (reset 验证)
4. 点 Create with selected chips → onSubmit 被调, 第 3 个参数含 `bswmdPaths`

**扩展** `useProjectActions.test.ts` (1-2 cases)：

1. `submitNewProject(name, dir, { bswmdPaths: [...] })` → IPC `projectNew` 被调, 第 3 参数透传
2. `submitNewProject(name, dir)` (旧调用) → IPC `projectNew` 被调, `bswmdPaths: []` (向后兼容)

**扩展** `templatesHandler.test.ts` (1 case)：

1. IPC `templates:list` 响应含 `bswmdPaths` 字段

### 5/5 baseline

- `pnpm test` 期望 809+5-6 = **814-815 passed / 1 skipped**
- `pnpm type-check` 0 errors
- `pnpm lint` 0 warnings
- `pnpm format:check` 0 diff
- `pnpm verify` 5/5 baseline 782 signed-guard [700, 850]

## 12. Ship gate

- 4 tasks checkbox 全部完成
- `pnpm test` 绿, 覆盖 ≥ baseline
- 5/5 baseline 保持
- 单 commit `feat(ui): BSWMD chip multi-select (Stage 3.4)` (依 plan § 必做约束)
- Code review (code-reviewer agent) APPROVE
- push to origin/main
