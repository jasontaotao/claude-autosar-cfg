# Stage 3.3 — TemplateCard UI Design Spec

> **For agentic workers:** 本 spec 描述 Stage 3.3 模板选择 UI 的设计决策。配套 plan: `2026-06-17-stage-3-3-template-card-ui.md`。

## 1. 用户故事

新用户点 "新建项目" → NewProjectDialog 弹出 → 用户看到三张卡片选模板（Empty 立即可用 / Classic / Clone 显示 coming soon）→ 选 Empty → 输项目名 + 目录 → 点 "创建"。

## 2. UI 草图

```
┌─────────────────────────────────────────────────────────────┐
│  New Project                                          ✕     │
├─────────────────────────────────────────────────────────────┤
│  Project Name *                                              │
│  [____________________]                                      │
│  For display and filename, max 64 characters                │
│                                                              │
│  Save Location *                                             │
│  [_________________] [Browse...]                             │
│  📁 /tmp/MyProject.autosarcfg.json                          │
│                                                              │
│  ── Choose a template ──                                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │  ☐ Empty    │ │  ☐ Classic  │ │  ☐ Clone    │           │
│  │  Project    │ │  (coming    │ │  (coming    │           │
│  │  Start...   │ │  soon)      │ │  soon)      │           │
│  │  📁 0 files │ │  📁 0 files │ │  📁 0 files │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│              [Cancel]    [Create]                            │
│       <Enter> Create   <Esc> Cancel                          │
└─────────────────────────────────────────────────────────────┘
```

## 3. 组件层次

```
NewProjectDialog (Sprint 12 #3 Phase 1, 扩展)
├── <input name>
├── <input dir>
└── TemplateCardRow (新, 容器)
    ├── TemplateCard (新) — empty
    │   ├── displayName (template.empty.displayName)
    │   ├── description (template.empty.description)
    │   └── file count badge
    ├── TemplateCard (新) — classic
    │   ├── displayName (template.classic.displayName)
    │   ├── description (template.classic.description)
    │   ├── file count badge
    │   └── "coming soon" 角标 (template.comingSoon)
    └── TemplateCard (新) — clone
        ├── (same as classic)
```

## 4. 数据流

```
[user clicks "New Project"]
  → useProjectActions.newProject() → store.setNewProjectDialogOpen(true)
  → NewProjectDialog renders
  → useEffect: setSelectedTemplateId(null)
  → TemplateCardRow mounts
  → useEffect: window.autosarApi.listTemplates()
  → IPC → main: discoverBuiltinTemplates(samplesRoot) → cache
  → response: { templates: [{ id, displayNameKey, descriptionKey, fileCount }, ...] }
  → render 3 TemplateCard
  → user clicks "Empty" → onSelect('empty')
  → setSelectedTemplateId('empty') → TemplateCard re-renders with selected=true
  → user types name + dir
  → user clicks "Create"
  → onSubmit(name, dir) [unchanged signature]
  → useProjectActions.submitNewProject() → IPC project:new
```

## 5. 视觉状态

### 5.1 TemplateCard 状态

| 状态                   | border    | bg                 | opacity | cursor      | aria-disabled |
| ---------------------- | --------- | ------------------ | ------- | ----------- | ------------- |
| available + unselected | `#45475a` | `#1e1e2e`          | 1.0     | pointer     | false         |
| available + selected   | `#89b4fa` | `#89b4fa22` (tint) | 1.0     | pointer     | false         |
| available + hover      | `#585b70` | `#1e1e2e`          | 1.0     | pointer     | false         |
| disabled (coming soon) | `#45475a` | `#1e1e2e`          | 0.55    | not-allowed | true          |

### 5.2 "coming soon" 角标

- 位置：卡片右上角
- 样式：8px 字号 / `#f9e2af` 文字 / 半透明黄色背景 / 圆角 4px / padding 2px 6px
- 出现条件：`!isTemplateAvailable(template.id)`
- i18n: `template.comingSoon` (zh-CN="即将推出", en="Coming Soon")

## 6. CSS 实现

复用 NewProjectDialog.css 的 Catppuccin Mocha 调色板：

```css
.npd-template-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.npd-template-section-label {
  font-size: 13px;
  font-weight: 500;
  color: #a6adc8;
}

.npd-template-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.tpl-card {
  appearance: none;
  text-align: left;
  background: #1e1e2e;
  border: 1px solid #45475a;
  border-radius: 8px;
  padding: 12px;
  color: #cdd6f4;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition:
    border-color 120ms ease,
    background 120ms ease;
  font-family: inherit;
}

.tpl-card:hover:not(.tpl-card--disabled):not(.tpl-card--selected) {
  border-color: #585b70;
  background: #181825;
}

.tpl-card--selected {
  border-color: #89b4fa;
  background: rgba(137, 180, 250, 0.13);
}

.tpl-card--disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.tpl-card-name {
  font-size: 13px;
  font-weight: 600;
  color: #cdd6f4;
}

.tpl-card-desc {
  font-size: 11px;
  color: #a6adc8;
  line-height: 1.4;
}

.tpl-card-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #6c7086;
  margin-top: auto;
}

.tpl-card-soon {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(249, 226, 175, 0.15);
  color: #f9e2af;
  border: 1px solid rgba(249, 226, 175, 0.25);
}
```

> 注：`.tpl-card-soon` 角标需要 `.tpl-card` 加 `position: relative` —— Task 2 实现时确认。

## 7. 交互细节

### 7.1 键盘

| Key   | Available card | Disabled card            |
| ----- | -------------- | ------------------------ |
| Tab   | focus          | focus (但 aria-disabled) |
| Enter | onSelect(id)   | 无                       |
| Space | onSelect(id)   | 无                       |
| Esc   | 关闭 dialog    | 关闭 dialog              |

### 7.2 焦点

- `TemplateCardRow` 内部不主动 focus 任何卡片（不抢 name input 的 focus）
- 用户必须 Tab 离开 name input 才能 focus 卡片（默认 tab order）

### 7.3 错误处理

- `listTemplates()` reject → catch → fallback 只渲染 Empty 卡片 + console.warn
- `listTemplates()` 返空数组 → fallback 只渲染 Empty 卡片
- 永不 crash UI

## 8. 测试策略

### 8.1 单元测试（Vitest + RTL）

- `templates.test.ts`: 8 测试
- `TemplateCard.test.tsx`: 7 测试
- `TemplateCardRow.test.tsx`: 8 测试
- `NewProjectDialog.test.tsx`: +5 测试（不破现有 18）
- `i18n.test.ts`: +1 测试

### 8.2 测试隔离

- IPC mock：`vi.spyOn(window.autosarApi, 'listTemplates').mockResolvedValue(...)`
- 组件 mount 时立即触发 useEffect，需要 `await waitFor` 或 `findByTestId`

### 8.3 不测的东西

- CSS 视觉（Playwright E2E 阶段测）
- 真实 IPC（Stage 2 templatesHandler.test.ts 已覆盖）
- 键盘焦点的 tab order（jsdom 不模拟 layout）

## 9. 兼容性

- React 18: 兼容（不依赖 use() / useFormState 等 19+ 特性）
- TypeScript 5 strict: 严格模式通过
- Vite 5: 单文件组件 / CSS import 兼容
- Electron 30: 不影响 main 进程

## 10. 不在范围内

- 任何 templates:copy IPC 调用（Stage 3.4 范围）
- BSWMD chips 集成（Stage 3.4）
- Combined Tree View（Stage 3.5）
- 暗黑模式适配（应用只支持 dark）
- 国际化扩展（除新增的 `template.comingSoon` key）
