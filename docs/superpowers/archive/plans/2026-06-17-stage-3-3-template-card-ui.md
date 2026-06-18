# Stage 3.3 — TemplateCard UI 集成 (Sprint 12 #3 Phase 2)

> **For agentic workers:** 本计划执行 Sprint 12 #3 Phase 2（master plan § 3.3）。Wave 2 sub-agent 任务范围（不要动其他 Stage 子项）。

**Goal:** 在 `NewProjectDialog` 项目名 input 下方显示 3 张 `TemplateCard`（Empty / Classic / Clone），其中 Classic + Clone 标记 "coming soon" disabled，Empty 立即可创建。

**Architecture:** 新增 `TemplateCard` 展示组件 + `templates.ts` helper（i18n key → 显示名 / 描述），通过 Stage 2 已 ship 的 `templates:list` IPC 拉模板列表。Empty 卡走现有 `onSubmit(name, dir)` 路径；其他卡 disabled。卡片渲染独立于表单验证，状态不污染。

**Tech Stack:** Electron 30 + TypeScript 5 strict + React 18 + Zustand 4 + Vitest 1（与现有 stack 一致）

---

## 起点状态（2026-06-17）

| 项                | 状态                                                                               |
| ----------------- | ---------------------------------------------------------------------------------- |
| `local HEAD`      | `fd25ad9` fix(sprint13) Wave 1 post-release cleanup                                |
| `origin/main`     | = local (0 ahead / 0 behind)                                                       |
| Tests baseline    | **746 passed / 1 skipped** / 96.58% stmts / 86.68% branches / 100% funcs           |
| Version           | v0.15.0                                                                            |
| Stage 2 状态      | templates backend (TEMPLATES_LIST + TEMPLATES_COPY) **已 ship**                    |
| Stage 2 i18n keys | `template.{empty,classic,clone}.{displayName,description}` × 2 locales **已 ship** |
| Wave 2 范围       | 仅 NewProjectDialog scope；不动 FileListTab（Stage 3.5 范围）                      |

---

## 范围（4 tasks per master plan § 3.3）

1. **Task 1**: `src/renderer/components/templates.ts` helper（`getTemplateDisplayName` / `getTemplateDescription` / `isTemplateAvailable` 包装）
2. **Task 2**: `src/renderer/components/TemplateCard.tsx` 展示组件（含 CSS）
3. **Task 3**: `src/renderer/components/TemplateCardRow.tsx` 3-卡容器（拉 IPC + 渲染 + 处理 click）
4. **Task 4**: `NewProjectDialog.tsx` 集成 — 项目名 input 下方显示 `TemplateCardRow`，Empty 卡 click → `handleSubmit`；其他卡 disabled
5. **Task 5**: M7-style `template.comingSoon` i18n key（zh-CN + en）— Classic / Clone 卡片底部角标
6. **Task 6**: 跑 verify（pnpm test + format:check + lint + type-check + build），5/5 baseline 保持

---

## Task 1 — `templates.ts` helper

### 当前状态

模板的 i18n key 已在 Stage 2 ship（`template.empty.displayName` / `template.empty.description` / `template.classic.*` / `template.clone.*`）。`TemplateListResponse` 的 `displayNameKey` / `descriptionKey` 是 raw key，组件需要把它们 resolve 成显示字符串。

### 目标

新建 `src/renderer/components/templates.ts`：

```typescript
import type { Locale } from '@shared/i18n';
import { t, type MessageKey } from '@shared/i18n';

export function getTemplateDisplayName(
  locale: Locale,
  template: { id: string; displayNameKey: string; descriptionKey: string; fileCount: number },
): string { ... }

export function getTemplateDescription(
  locale: Locale,
  template: { id: string; ... },
): string { ... }

/** Classic / Clone 是 "coming soon" — Empty 是立即可用 */
export function isTemplateAvailable(templateId: string): boolean { ... }
```

### 关键决策

- **`displayNameKey` 类型放宽**：Stage 2 类型是 `string`（IPC 不 import `@shared/i18n`），但 helper 内部可以 cast 到 `MessageKey` 传给 `t()`。如果 key 拼错，t() 会 warn + 返 key 本身 — 故意 fail-loud。
- **`isTemplateAvailable` 实现**：hard-coded `templateId === 'empty'`。**不**拉 IPC 状态，因为只有 Empty 后端 ship 了，Classic / Clone 永远 disabled。等 Stage 3.4 之后 Classic 后端 ready，再扩展为基于 `fileCount > 0` 的动态判断。
- **不导出 TemplateListResponse 类型**：从 `shared/types.js` re-import；保持单一真相。

### Test 计划（RED → GREEN）

- `src/renderer/components/__tests__/templates.test.ts`:
  - `getTemplateDisplayName(zh-CN, empty)` → `'空项目'`
  - `getTemplateDisplayName(en, empty)` → `'Empty Project'`
  - `getTemplateDescription(zh-CN, classic)` → `'预填常见 BSWMD 的项目模板'`
  - `getTemplateDescription(en, clone)` → `'Create a copy of an existing project'`
  - `isTemplateAvailable('empty')` → `true`
  - `isTemplateAvailable('classic')` → `false`
  - `isTemplateAvailable('clone')` → `false`
  - 未知 key 透传：mock displayNameKey='unknown.foo' → t() 返 'unknown.foo'（fail-loud 行为）

### 改 files

- `src/renderer/components/templates.ts`（新）
- `src/renderer/components/__tests__/templates.test.ts`（新）

---

## Task 2 — `TemplateCard.tsx` 展示组件

### 目标

新建 `src/renderer/components/TemplateCard.tsx` + `TemplateCard.css`：

```typescript
interface TemplateCardProps {
  readonly template: {
    id: string;
    displayNameKey: string;
    descriptionKey: string;
    fileCount: number;
  };
  readonly selected: boolean;
  readonly onSelect: (templateId: string) => void;
}
```

- 卡片布局：标题（displayName）+ 描述（description） + file count badge + "coming soon" 角标（if !isTemplateAvailable）
- 状态视觉：
  - **available + unselected**：普通 border，hover 时高亮
  - **available + selected**：accent border + 浅色背景
  - **disabled（!available）**：opacity 0.55，cursor not-allowed，hover 无效
- 无障碍：`role="button"` + `aria-disabled` + `aria-pressed`（如果 selected）+ Enter / Space 触发 onSelect（仅 available 时）
- `data-testid="tpl-card-{id}"` + `data-testid="tpl-card-{id}-name"` / `-desc` / `-badge`

### Test 计划（RED → GREEN）

- `src/renderer/components/__tests__/TemplateCard.test.tsx`:
  - 渲染 displayName / description / fileCount badge
  - available 时 click → onSelect 被调用（带 id）
  - !available 时 click → onSelect NOT called + 角标存在
  - selected=true → className 含 `--selected`
  - aria-disabled / aria-pressed 反映状态
  - Enter 键触发 onSelect（仅 available）
  - Space 键触发 onSelect（仅 available）

### 改 files

- `src/renderer/components/TemplateCard.tsx`（新）
- `src/renderer/components/TemplateCard.css`（新）
- `src/renderer/components/__tests__/TemplateCard.test.tsx`（新）

---

## Task 3 — `TemplateCardRow.tsx` 容器组件

### 目标

新建 `src/renderer/components/TemplateCardRow.tsx`：

```typescript
interface TemplateCardRowProps {
  readonly selectedId: string | null;
  readonly onSelect: (templateId: string) => void;
}
```

- 内部通过 `useEffect` + `window.autosarApi.listTemplates()` 拉 IPC
- 内部 `useState<TemplateListResponse['templates']>([])` + `loading: boolean` + `error: string | null`
- 拉失败时：fallback 渲染只显示 Empty 卡片（永不 crash UI）
- 拉空时：fallback 同样只显示 Empty
- 拉成功时：3 张卡片
- 不依赖父组件的 `onSubmit` —— 只 emit `onSelect(id)` 事件

### Test 计划（RED → GREEN）

- `src/renderer/components/__tests__/TemplateCardRow.test.tsx`:
  - 默认 selectedId=null → 没有任何卡片 selected
  - 拉 IPC 成功返回 3 个模板 → 3 张卡片
  - 拉 IPC 成功返回 0 个模板 → 1 张 Empty fallback 卡片
  - 拉 IPC 失败 → 1 张 Empty fallback 卡片 + 错误吞掉
  - 点击 Empty 卡 → onSelect('empty') 被调用
  - 点击 Classic 卡 → onSelect('classic') NOT called（disabled）
  - selectedId='classic' → Classic 卡 `aria-pressed='true'`（即使 disabled 也要显示选中态）
  - **状态隔离**：重新渲染 selectedId='empty' → 切换到 Empty selected

### 改 files

- `src/renderer/components/TemplateCardRow.tsx`（新）
- `src/renderer/components/__tests__/TemplateCardRow.test.tsx`（新）

---

## Task 4 — 集成到 `NewProjectDialog.tsx`

### 目标

在 `NewProjectDialog` 项目名 input 下方插入 `TemplateCardRow`：

- 内部状态：const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
- 重置时机：`useEffect` 检测 `open` 转 true 时 reset selectedTemplateId = null（与现有 name/dir reset 一致）
- Empty 卡 onSelect → 维持 `'empty'` 选中态（不触发 onSubmit —— Create 按钮仍是唯一提交路径，与现有 UX 一致）
- 其他卡 onSelect → 啥也不做（卡片本身 disabled，已在 TemplateCard 内部拦截）

### 关键决策

- **不修改 `onSubmit` 签名**：保持 `(name: string, directory: string) => void | Promise<void>`，未来 Stage 3.4 加 BSWMD chips 时再扩展
- **不直接传 template id 到 onSubmit**：Stage 3.3 范围内 Empty 是唯一可用路径，传了也没意义。Stage 3.4 时再扩 `onSubmit(name, dir, templateId)`
- **CSS 嵌入到 NewProjectDialog.css**：避免改太多 css import 顺序；新增 `.npd-template-section` 容器 + spacing

### Test 计划（RED → GREEN）

- `src/renderer/components/__tests__/NewProjectDialog.test.tsx`:
  - 现有 18 个测试**不能回归**（重置 + 验证 + 提交逻辑全保留）
  - 新增 5 测试：
    - `TemplateCardRow` 出现在 dialog body 中（open=true 时）
    - 3 张卡片都渲染（依赖 IPC mock 返回 3 个）
    - Empty 卡 click → 切换到 selected
    - 重置时（close → open）selectedTemplateId 重置回 null
    - 现有 "clicking Create with valid inputs" 测试**仍通过**（证明 Empty selected 不阻断 onSubmit）

### 改 files

- `src/renderer/components/NewProjectDialog.tsx`（import + 内部 state + JSX 插入）
- `src/renderer/components/NewProjectDialog.css`（新增 .npd-template-section 样式）

---

## Task 5 — `template.comingSoon` i18n key

### 目标

M7-style 角标文案：zh-CN = "即将推出"，en = "Coming Soon"。

```typescript
// i18n.ts
readonly 'template.comingSoon': string;
```

### Test 计划（RED → GREEN）

- `src/shared/__tests__/i18n.test.ts`:
  - `t('zh-CN', 'template.comingSoon')` → `'即将推出'`
  - `t('en', 'template.comingSoon')` → `'Coming Soon'`

### 改 files

- `src/shared/i18n.ts`（type + zh-CN bundle + en bundle）
- `src/shared/__tests__/i18n.test.ts`（+1 测试）

---

## Task 6 — Verify

### 范围

跑 pnpm verify 5/5 baseline（format + lint + type-check + test + build）。Coverage 不能掉。

### Test 增量估算

| Task          | 新增 tests         | 改动 tests        |
| ------------- | ------------------ | ----------------- |
| 1             | +8                 | 0                 |
| 2             | +7                 | 0                 |
| 3             | +8                 | 0                 |
| 4             | +5                 | 0（不破坏 18 个） |
| 5             | +1                 | 0                 |
| **总计**      | **+29**            | 0                 |
| 预估 baseline | 746 + 29 = **775** |

---

## TDD / Commit 顺序

每个 task 严格 RED → GREEN → IMPROVE：

```
Task 1: templates.ts helper
  - RED:   8 tests 拼 helper API
  - GREEN: 写 helper 函数体
  - IMPROVE: 抽 cast 边界（raw key → MessageKey cast）

Task 2: TemplateCard.tsx
  - RED:   7 tests 拼 props + 行为
  - GREEN: 写组件 + CSS
  - IMPROVE: 抽出 isTemplateAvailable 调用到组件内（不 import Task 1 helper 直接用）

Task 3: TemplateCardRow.tsx
  - RED:   8 tests 拼 IPC + fallback + selected
  - GREEN: 写容器 + IPC 调用 + 错误处理
  - IMPROVE: 用 useCallback 包 onSelect handler

Task 4: 集成到 NewProjectDialog
  - RED:   5 tests 拼 template row 出现在 dialog body
  - GREEN: import + state + JSX 插入
  - IMPROVE: 抽出 selectedTemplateId reset 逻辑

Task 5: i18n key
  - RED:   1 test 验证 t() 输出
  - GREEN: i18n.ts 加 key
  - IMPROVE: parity test 验证两 bundle 同步

Task 6: verify
  - pnpm test 全绿
  - pnpm format:check 干净
  - pnpm lint 干净
  - pnpm type-check 干净
  - pnpm build 成功
```

---

## Commit 策略

**单一 commit**（按 master plan 要求）：

```
feat(ui): TemplateCard picker (Stage 3.3)
```

涵盖所有 5 个 task 的代码 + 测试 + i18n + 注释更新。

**不 bump version**（Wave 2 范围外，主 loop 统一处理 v0.15.0 → v0.16.0）。

---

## Ship gate

- pnpm test 全绿（~775 tests pass）
- Coverage ≥ baseline (96.58% / 86.68% / 100%)
- 5/5 baseline 保持
- ESLint + Prettier 干净
- 单一 commit `feat(ui): TemplateCard picker (Stage 3.3)` pushed
- Code review 通过

---

## 范围外（明确不做）

- 任何 `claude-autosar v2` 集成
- `package.json` version bump
- FileListTab 改造（Stage 3.5）
- BSWMD chips 集成（Stage 3.4）
- Combined Tree View (Stage 3.5)
- LeftPanel WIP（Stage 3.1 已 ship）
- templates:copy IPC 调用（Stage 3.3 范围内 Empty 是唯一可用模板，无需 copy）
- 任何 IPC error i18n 抽取（Stage 4）

---

## Self-Review

**1. 5 tasks 全部覆盖**：✅ Task 1-5 1:1 对应 master plan § 3.3 5 个 bullets

**2. TDD 严格性**：✅ 每个 task 标了 RED → GREEN → IMPROVE；先 test 后 code

**3. 不动 version**：✅ commit message 不含 `chore(release)`；`package.json` 不动

**4. 不动其他 sub-stage**：✅ 范围限定在 `NewProjectDialog.tsx` + 新建 `templates.ts` / `TemplateCard.{tsx,css}` / `TemplateCardRow.tsx` + `i18n.ts`

**5. i18n 命名一致**：✅ `template.comingSoon` 与现有 `template.*` key 风格一致

**6. 风险**：

- 风险 1：IPC 拉失败时 fallback 只显示 Empty → 用户看不到 Classic / Clone 预览。**缓解**：失败时 console.warn + 1 张卡足够，避免 crash UI
- 风险 2：Stage 2 IPC 实际返回值取决于 samples 目录（当前只有 .gitkeep）。**缓解**：测试用 `vi.spyOn(window.autosarApi, 'listTemplates')` mock，不依赖实际 IPC
- 风险 3：Wave 1 已 ship 的 NewProjectDialog 测试可能因为 dialog body 长度变化而 selector 冲突。**缓解**：新 TemplateCardRow 用独立 testid 前缀 `tpl-`，不与 `npd-` 冲突

**7. Push 风险**：保留 `git -c http.proxy= -c https.proxy= push` + sleep 30s 重试的 workaround
