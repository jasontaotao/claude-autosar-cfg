# Sprint 12 #3 Phase 1 Cleanup — Design Spec (Stage 3.2)

> **For agentic workers:** 本设计 spec 配合 `2026-06-17-sprint-12-3-phase-1-cleanup.md` plan 一起读。Plan 给 TDD 任务清单；本文给接口、数据流、决策表。

**Goal:** 清掉 Sprint 12 #3 的 5 项 Phase 1 simplification，留下干净的 v0.14.1-ready 代码。

---

## 1. 当前状态 vs 目标状态

### 1.1 `'saveAndProceed'` button (Task 1)

| 维度       | 当前 (Phase 1)                    | 目标 (Phase 2)                                                   |
| ---------- | --------------------------------- | ---------------------------------------------------------------- |
| 用户行为   | 点 "保存并新建" 按钮 → 啥也不发生 | 点 → 触发 `saveProject()` → 成功才 discard                       |
| 返回值     | `{ kind: 'canceled' }`            | `{ kind: 'ok' }`（save 成功 + proceed 触发）                     |
| 错误处理   | 无                                | `saveProject` 失败 → `{ kind: 'error' }`                         |
| Loose mode | 静默 cancel                       | 静默 cancel（`saveProject` 在 project === null 时返回 canceled） |

### 1.2 `'overwrite-confirm'` IPC result (Task 2)

| 维度         | 当前 (Phase 1)                            | 目标 (Phase 2)                                      |
| ------------ | ----------------------------------------- | --------------------------------------------------- |
| 用户行为     | 看到硬编码 "文件已存在" 错误，被迫改 name | 看到 confirm dialog 3-button (覆盖 / 重命名 / 取消) |
| 覆盖路径     | 不支持                                    | 重试 IPC 带 `overwrite: true`，覆盖原文件           |
| 取消路径     | 必须按 dialog 取消键                      | confirm dialog "取消" 按钮                          |
| 重命名路径   | 错误信息                                  | confirm dialog "重命名" → dialog stays open         |
| IPC contract | 1 个 kind                                 | 1 个 kind + Request 增 `overwrite?: boolean`        |

### 1.3 `store.pendingAction` (Task 3)

| 维度         | 当前                                                                             | 目标                                         |
| ------------ | -------------------------------------------------------------------------------- | -------------------------------------------- |
| Store 字段   | `pendingAction: PendingAction \| null`                                           | 删除                                         |
| Type         | `PendingAction` 4-variant union                                                  | 删除                                         |
| Setter       | `setPendingAction: (a) => void`                                                  | 删除                                         |
| Callers      | 5 个 setter 调用 (newProject / submitNewProject / open / addBswmd / removeBswmd) | 删除（改用 Promise 链路或直接 close dialog） |
| Consumers    | **0 个**（搜过所有 renderer 代码）                                               | N/A                                          |
| 测试 fixture | `ensureDialogStatePatch` 装 shim                                                 | 删除 patch 分支                              |

### 1.4 `confirm.unsaved.message` per-action i18n (Task 4)

| Action                | 当前 message                                            | 目标 message (zh-CN)                                        |
| --------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| `newProject` + dirty  | "当前项目 X 有未保存的更改。\n新建项目将丢失这些更改。" | 同（保留现 key `confirm.unsaved.message` 或拆 `.new`）      |
| `openProject` + dirty | 同上（错误："新建项目"）                                | "当前项目 X 有未保存的更改。\n打开其他项目将丢失这些更改。" |
| `addBswmd` + dirty    | 同上                                                    | "当前项目 X 有未保存的更改。\n添加 BSWMD 将丢失这些更改。"  |
| `removeBswmd` + dirty | 同上                                                    | "当前项目 X 有未保存的更改。\n移除 BSWMD 将丢失这些更改。"  |

button label 也按 action 改：

| Action      | discard label (zh) | save label (zh) |
| ----------- | ------------------ | --------------- |
| newProject  | "不保存，新建"     | "保存并新建"    |
| openProject | "不保存，打开"     | "保存并打开"    |
| addBswmd    | "不保存，添加"     | "保存并添加"    |
| removeBswmd | "不保存，移除"     | "保存并移除"    |

### 1.5 `overwrite-confirm` hook i18n key (Task 5)

| 维度                       | 当前 | 目标                                                           |
| -------------------------- | ---- | -------------------------------------------------------------- |
| 二次 confirm title         | 缺   | `confirm.overwrite.title` = "文件已存在"                       |
| 二次 confirm message       | 缺   | `confirm.overwrite.message` = "文件 {path} 已存在。要覆盖吗？" |
| 二次 confirm 覆盖 button   | 缺   | `confirm.overwrite.discardLabel` = "覆盖"                      |
| 二次 confirm 重命名 button | 缺   | `confirm.overwrite.continueLabel` = "重命名"                   |

---

## 2. 数据流 / 接口设计

### 2.1 `useProjectActions.guardedDirtySwitch` 改造

**Before (Phase 1):**

```typescript
async function guardedDirtySwitch(): Promise<
  { readonly proceed: true } | { readonly proceed: false }
> {
  if (useArxmlStore.getState().dirtyPaths.size === 0) {
    return { proceed: true };
  }
  const locale: Locale = useArxmlStore.getState().locale;
  const projectName = useArxmlStore.getState().project?.name ?? '';
  const choice = await confirm({
    title: t(locale, 'confirm.unsaved.title'),
    message: t(locale, 'confirm.unsaved.message', { name: projectName }),
    continueLabel: t(locale, 'confirm.unsaved.continue'),
    discardLabel: t(locale, 'confirm.unsaved.discard'),
    saveLabel: t(locale, 'confirm.unsaved.saveAndNew'),
  });
  if (choice === 'discard') {
    return { proceed: true };
  }
  return { proceed: false }; // 'continue' or 'saveAndProceed' → both cancel
}
```

**After (Phase 2):**

```typescript
export type SwitchingAction = 'newProject' | 'openProject' | 'addBswmd' | 'removeBswmd';

interface GuardedDirtySwitchOptions {
  readonly action: SwitchingAction;
  /** When set (only for removeBswmd), interpolate into message. */
  readonly targetName?: string;
}

async function guardedDirtySwitch(
  opts: GuardedDirtySwitchOptions,
): Promise<
  | { readonly proceed: true }
  | { readonly proceed: false }
  | { readonly proceed: false; readonly saveError: string }
> {
  if (useArxmlStore.getState().dirtyPaths.size === 0) {
    return { proceed: true };
  }
  const locale: Locale = useArxmlStore.getState().locale;
  const projectName = useArxmlStore.getState().project?.name ?? '';
  const choice = await confirm({
    title: t(locale, 'confirm.unsaved.title'),
    message: t(locale, `confirm.unsaved.message.${opts.action}`, {
      name: projectName,
      target: opts.targetName,
    }),
    continueLabel: t(locale, 'confirm.unsaved.continue'),
    discardLabel: t(locale, `confirm.unsaved.discard.${opts.action}`),
    saveLabel: t(locale, `confirm.unsaved.saveAndNew.${opts.action}`),
  });
  if (choice === 'discard') {
    return { proceed: true };
  }
  if (choice === 'saveAndProceed') {
    const saveResult = await useArxmlStore.getState().saveProject; // ❌ wrong, fix below
    // Actually call the hook-internal saveProject function
    // ...
  }
  return { proceed: false };
}
```

**问题：** `saveProject` 写的是 hook 内 useCallback。`guardedDirtySwitch` 是 module-level。**解决方案**：

```typescript
// Option A: pass save callback into options
interface GuardedDirtySwitchOptions {
  readonly action: SwitchingAction;
  readonly targetName?: string;
  readonly save?: () => Promise<ProjectActionResult>;
}

async function guardedDirtySwitch(
  opts: GuardedDirtySwitchOptions,
): Promise<...> {
  // ...
  if (choice === 'saveAndProceed' && opts.save) {
    const result = await opts.save();
    if (result.kind === 'ok') {
      return { proceed: true };
    }
    if (result.kind === 'error') {
      return { proceed: false, saveError: result.message };
    }
    // result.kind === 'canceled' → fall through to proceed: false
  }
  return { proceed: false };
}
```

每个 caller 在 `useCallback` 内部构造时把自己的 `saveProject` closure 传进去：

```typescript
const saveProject = useCallback(...);
const newProject = useCallback(async () => {
  const guard = await guardedDirtySwitch({ action: 'newProject', save: saveProject });
  if (!guard.proceed) {
    if ('saveError' in guard) {
      // bubble up save error to caller via store.error or ProjectActionResult
      return { kind: 'error', message: guard.saveError };
    }
    return { kind: 'canceled' };
  }
  // ... proceed
}, [saveProject]);
```

**决策**：用 **Option A**（pass save callback into options）。优点：

- `guardedDirtySwitch` 保持 module-level（无 hook 依赖）
- 各 caller 显式传自己的 save 实现（不依赖隐式 shared state）
- 测试可独立注入 mock save

### 2.2 `submitNewProject` overwrite-confirm 流程

**Before:**

```typescript
case 'overwrite-confirm':
  return {
    kind: 'error',
    message: `文件已存在: ${result.path} — 请换一个项目名或目录`,
  };
```

**After:**

```typescript
case 'overwrite-confirm': {
  const locale: Locale = useArxmlStore.getState().locale;
  const choice = await confirm({
    title: t(locale, 'confirm.overwrite.title'),
    message: t(locale, 'confirm.overwrite.message', { path: result.path }),
    continueLabel: t(locale, 'confirm.overwrite.continueLabel'),
    discardLabel: t(locale, 'confirm.overwrite.discardLabel'),
  });
  if (choice === 'continue') {
    // User chose rename — dialog stays open, no retry
    return { kind: 'canceled' };
  }
  // 'discard' → user chose overwrite, retry IPC with overwrite: true
  const retry = await window.autosarApi.projectNew({
    name,
    directory,
    overwrite: true,
  });
  switch (retry.kind) {
    case 'created':
      setNewProjectDialogOpen(false);
      useArxmlStore.getState().openProject({ ... });
      return { kind: 'ok' };
    case 'overwrite-confirm':
      // Should be impossible with overwrite: true, but handle defensively
      return { kind: 'error', message: t(locale, 'app.error.newProjectFailed', { message: 'overwrite retry failed' }) };
    case 'write-failed':
      return { kind: 'error', message: retry.message };
    case 'invalid-name':
      return { kind: 'error', message: retry.message };
  }
}
```

### 2.3 `projectNewHandler` overwrite flag 支持

**`src/shared/types.ts`:**

```typescript
export interface ProjectNewRequest {
  readonly name: string;
  readonly directory: string;
  /** Sprint 12 #3 Phase 2: skip the file-exists check and force overwrite. */
  readonly overwrite?: boolean;
}
```

**`src/main/ipc/projectNewHandler.ts`:**

```typescript
// 4. Overwrite check (race-free, click-time)
if (req.overwrite !== true) {
  try {
    await fs.access(filePath);
    return { kind: 'overwrite-confirm', path: filePath };
  } catch {
    // expected ENOENT
  }
}

// 5. Create + write
const manifest = createEmptyManifest(req.name);
try {
  await fs.writeFile(filePath, saveManifest(manifest), 'utf8');
  return { kind: 'created', path: filePath, manifest };
} catch (e) {
  return { kind: 'write-failed', message: `...` };
}
```

### 2.4 死代码删除清单（Task 3）

| 位置                                                                | 删除内容                                                             |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/renderer/store/useArxmlStore.ts` line 75-79                    | `PendingAction` type                                                 |
| `src/renderer/store/useArxmlStore.ts` line 169                      | `readonly pendingAction: PendingAction \| null;`                     |
| `src/renderer/store/useArxmlStore.ts` line 172                      | `setPendingAction: (action: PendingAction \| null) => void;`         |
| `src/renderer/store/useArxmlStore.ts` line 298                      | `pendingAction: null,` (initial state)                               |
| `src/renderer/store/useArxmlStore.ts` line 441                      | `pendingAction: null,` (in `clear()` or similar)                     |
| `src/renderer/store/useArxmlStore.ts` line 585                      | `setPendingAction: (action) => set({ pendingAction: action }),`      |
| `src/renderer/store/useArxmlStore.ts` line 52-57 (header comment)   | Block 引用 `pendingAction`                                           |
| `src/renderer/hooks/useProjectActions.ts` line 61-65                | `setPendingAction` helper function                                   |
| `src/renderer/hooks/useProjectActions.ts` line 163                  | `setPendingAction({ kind: 'newProject' });`                          |
| `src/renderer/hooks/useProjectActions.ts` line 184                  | `setPendingAction(null);` (in submitNewProject created case)         |
| `src/renderer/hooks/useProjectActions.ts` line 233                  | `setPendingAction(null);` (in openProject cancel)                    |
| `src/renderer/hooks/useProjectActions.ts` line 239                  | `setPendingAction(null);` (in openProject canceled case)             |
| `src/renderer/hooks/useProjectActions.ts` line 254                  | `setPendingAction(null);` (in openProject opened)                    |
| `src/renderer/hooks/useProjectActions.ts` line 257                  | `setPendingAction(null);` (in openProject parse error)               |
| `src/renderer/hooks/useProjectActions.ts` line 334                  | `setPendingAction(null);` (in addBswmd guard cancel)                 |
| `src/renderer/hooks/useProjectActions.ts` line 339                  | `setPendingAction(null);` (in addBswmd loose mode)                   |
| `src/renderer/hooks/useProjectActions.ts` line 349                  | `setPendingAction(null);` (in addBswmd canceled picker)              |
| `src/renderer/hooks/useProjectActions.ts` line 354                  | `setPendingAction(null);` (in addBswmd read failed)                  |
| `src/renderer/hooks/useProjectActions.ts` line 368                  | `setPendingAction(null);` (in addBswmd after store.addBswmd)         |
| `src/renderer/hooks/useProjectActions.ts` line 397                  | `setPendingAction(null);` (in removeBswmd guard cancel)              |
| `src/renderer/hooks/useProjectActions.ts` line 400                  | `setPendingAction(null);` (in removeBswmd after store.removeBswmd)   |
| `src/renderer/hooks/__tests__/useProjectActions.test.ts` line 49    | `import type { PendingAction } ...`                                  |
| `src/renderer/hooks/__tests__/useProjectActions.test.ts` line 83-90 | `ensureDialogStatePatch` 内 `setPendingAction` shim                  |
| `src/renderer/hooks/__tests__/useProjectActions.test.ts` line 321   | `expect(after.pendingAction).toEqual({ kind: 'newProject' });`       |
| `src/renderer/hooks/__tests__/useProjectActions.test.ts` line 368   | `useArxmlStore.getState().setPendingAction({ kind: 'newProject' });` |
| `src/renderer/hooks/__tests__/useProjectActions.test.ts` line 383   | `expect(after.pendingAction).toBeNull();`                            |
| `src/renderer/hooks/__tests__/useProjectActions.test.ts` line 392   | `useArxmlStore.getState().setPendingAction({ kind: 'newProject' });` |
| `src/renderer/hooks/__tests__/useProjectActions.test.ts` line 411   | `expect(after.pendingAction).toEqual({ kind: 'newProject' });`       |

**共 ~20 处删除。**

### 2.5 i18n 新增 key 清单（Tasks 4 + 5）

**Task 4（per-action 拆分 12 keys）：**

```typescript
// messages (4)
'confirm.unsaved.message.new': string;        // {name}
'confirm.unsaved.message.open': string;       // {name}
'confirm.unsaved.message.addBswmd': string;   // {name}
'confirm.unsaved.message.removeBswmd': string; // {name} {target}

// discard labels (4)
'confirm.unsaved.discard.new': string;
'confirm.unsaved.discard.open': string;
'confirm.unsaved.discard.addBswmd': string;
'confirm.unsaved.discard.removeBswmd': string;

// save labels (4)
'confirm.unsaved.saveAndNew.new': string;
'confirm.unsaved.saveAndNew.open': string;
'confirm.unsaved.saveAndNew.addBswmd': string;
'confirm.unsaved.saveAndNew.removeBswmd': string;
```

**zh-CN bundle:**

```typescript
'confirm.unsaved.message.new':          '当前项目 {name} 有未保存的更改。\n新建项目将丢失这些更改。',
'confirm.unsaved.message.open':         '当前项目 {name} 有未保存的更改。\n打开其他项目将丢失这些更改。',
'confirm.unsaved.message.addBswmd':     '当前项目 {name} 有未保存的更改。\n添加 BSWMD 将丢失这些更改。',
'confirm.unsaved.message.removeBswmd':  '当前项目 {name} 有未保存的更改。\n移除 BSWMD {target} 将丢失这些更改。',
'confirm.unsaved.discard.new':          '不保存，新建',
'confirm.unsaved.discard.open':         '不保存，打开',
'confirm.unsaved.discard.addBswmd':     '不保存，添加',
'confirm.unsaved.discard.removeBswmd':  '不保存，移除',
'confirm.unsaved.saveAndNew.new':       '保存并新建',
'confirm.unsaved.saveAndNew.open':      '保存并打开',
'confirm.unsaved.saveAndNew.addBswmd':  '保存并添加',
'confirm.unsaved.saveAndNew.removeBswmd': '保存并移除',
```

**en bundle:**

```typescript
'confirm.unsaved.message.new':          'Project "{name}" has unsaved changes.\nCreating a new project will discard them.',
'confirm.unsaved.message.open':         'Project "{name}" has unsaved changes.\nOpening another project will discard them.',
'confirm.unsaved.message.addBswmd':     'Project "{name}" has unsaved changes.\nAdding a BSWMD will discard them.',
'confirm.unsaved.message.removeBswmd':  'Project "{name}" has unsaved changes.\nRemoving BSWMD {target} will discard them.',
'confirm.unsaved.discard.new':          'Discard & New',
'confirm.unsaved.discard.open':         'Discard & Open',
'confirm.unsaved.discard.addBswmd':     'Discard & Add',
'confirm.unsaved.discard.removeBswmd':  'Discard & Remove',
'confirm.unsaved.saveAndNew.new':       'Save & New',
'confirm.unsaved.saveAndNew.open':      'Save & Open',
'confirm.unsaved.saveAndNew.addBswmd':  'Save & Add',
'confirm.unsaved.saveAndNew.removeBswmd': 'Save & Remove',
```

**Task 5（overwrite-confirm 4 keys）：**

```typescript
'confirm.overwrite.title': string;
'confirm.overwrite.message': string;       // {path}
'confirm.overwrite.continueLabel': string;
'confirm.overwrite.discardLabel': string;
```

**zh-CN:**

```typescript
'confirm.overwrite.title':          '文件已存在',
'confirm.overwrite.message':        '文件 {path} 已存在。\n是否覆盖现有项目？',
'confirm.overwrite.continueLabel':  '重命名',
'confirm.overwrite.discardLabel':   '覆盖',
```

**en:**

```typescript
'confirm.overwrite.title':          'File Exists',
'confirm.overwrite.message':        'File {path} already exists.\nOverwrite the existing project?',
'confirm.overwrite.continueLabel':  'Rename',
'confirm.overwrite.discardLabel':   'Overwrite',
```

**注意**：保留旧 key `confirm.unsaved.message`（不带后缀）作为 fall-back。**或** 重命名为 `.new` 并把测试 / 旧引用改完。**决策**：保留旧 key + 添加新 key，旧 key 在 `guardedDirtySwitch` 内作为 back-compat fallback（如果 `confirm.unsaved.message.${action}` 不存在则用旧 key）。**简化决策**：直接加新 key，**不**重命名旧 key。旧 key 在 Phase 2 之后无 caller（确认过）→ 后面 sweep 时删。

### 2.6 决策表

| Decision                                  | Choice                                                               | Rationale                                                     |
| ----------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| `guardedDirtySwitch` save callback 注入   | Option A: pass `save` callback in options                            | Module-level function stays pure; no hook dep                 |
| `overwrite` flag 命名                     | `overwrite?: boolean` (camelCase)                                    | 与现有 `ProjectNewRequest` 风格一致；optional = back-compat   |
| 二次 confirm dialog 复用                  | 复用 `confirm()` from ConfirmDialog                                  | 已有 3-button 组件，'continue' 视为重命名，'discard' 视为覆盖 |
| 4 switching actions 拆分粒度              | 按 action 4 套完整 i18n (12 keys)                                    | 一致性，UX 文案与触发 action 强相关                           |
| pendingAction 替代                        | 无替代 — 整个机制没必要                                              | 0 consumer + 4 caller 同步 set，但没 read 路径                |
| old `confirm.unsaved.message` 保留        | 保留（暂时无 caller）                                                | 最小 diff；后续 sweep 删除                                    |
| overwrite-confirm "saveAndProceed" button | 不暴露 — 3-button 改为 2-button via `discardLabel` + `continueLabel` | 上下文无关：overwrite 场景下"保存并 X"无意义                  |

---

## 3. 错误处理

### 3.1 saveProject 失败（Task 1）

`saveProject` 内部可能返回：

- `{ kind: 'ok' }` → proceed
- `{ kind: 'canceled' }` (project === null) → cancel silently
- `{ kind: 'error', message }` → cancel + bubble error

**Bubble error 路径：**

```typescript
const guard = await guardedDirtySwitch({ action: 'openProject', save: saveProject });
if (!guard.proceed) {
  if ('saveError' in guard) {
    return { kind: 'error', message: guard.saveError };
  }
  return { kind: 'canceled' };
}
```

`ProjectActionResult` 通过 hook return 透传；caller (App.tsx) 在 `setError` 中显示。

### 3.2 overwrite 重试失败（Task 2）

`projectNew({ overwrite: true })` 仍然可能返回 `write-failed`（permission denied）：

```typescript
case 'write-failed':
  return { kind: 'error', message: retry.message };
```

`overwrite-confirm` 重试不应该再返回（因为 overwrite: true 跳过 check），但防御性写。

### 3.3 i18n key 缺失

`confirm.unsaved.message.${action}` 拼字符串如果 key 不存在 → `t()` 抛错或返回 fallback。**决策**：i18n 加载时校验 12 个新 key 全部存在（TypeScript 编译期保证 + `i18n.test.ts` runtime 校验所有 key 各 zh/en 一对）。

---

## 4. 状态机

### 4.1 NewProjectDialog overwrite-confirm 状态机

```
[Idle]
  ↓ newProject() [clean]
[DialogOpen]
  ↓ submitNewProject(name, dir)
  ↓ IPC projectNew
  ↓ ↓
  ↓ ↓ created
  ↓ → [ProjectLoaded] dialog close
  ↓
  ↓ ↓ overwrite-confirm
  ↓ → [OverwriteConfirm] 二次 confirm
  ↓   ↓ discard (覆盖)
  ↓   ↓ → retry projectNew({ overwrite: true })
  ↓   ↓   ↓ created
  ↓   ↓   → [ProjectLoaded] dialog close
  ↓   ↓   ↓ write-failed
  ↓   ↓   → [DialogOpen] error inline
  ↓   ↓ continue (重命名)
  ↓   → [DialogOpen] dialog stays open
  ↓ ↓ write-failed
  ↓ → [DialogOpen] error inline
  ↓ ↓ invalid-name
  ↓ → [DialogOpen] error inline
```

### 4.2 guardedDirtySwitch 状态机

```
[guardedDirtySwitch] entry
  ↓
  ↓ if isDirty === false
  → proceed: true
  ↓
  ↓ if isDirty === true
  ↓ → confirm(...)
  ↓   ↓ 'continue' → proceed: false
  ↓   ↓ 'discard' → proceed: true
  ↓   ↓ 'saveAndProceed' + save() returns ok → proceed: true
  ↓   ↓ 'saveAndProceed' + save() returns canceled → proceed: false
  ↓   ↓ 'saveAndProceed' + save() returns error → proceed: false + saveError
```

---

## 5. 测试策略

### 5.1 RED 阶段（先写失败测试）

**Task 1:**

- 改 3 个 saveAndProceed 测试的 assertion：
  - mock saveProject → `{ kind: 'ok' }` 后断言 IPC 链路触发
  - mock saveProject → `{ kind: 'error', message: 'X' }` 后断言 proceed: false + error 透传

**Task 2:**

- 新增 2 测试 useProjectActions：
  - overwrite-confirm → confirm('discard') → retry projectNew({ overwrite: true }) → created
  - overwrite-confirm → confirm('continue') → canceled (no retry)
- 新增 1 测试 projectNewHandler：
  - overwrite: true 在文件已存在时直接 created

**Task 4:**

- i18n.test.ts +12 tests（每个 key 各 zh + en）
- useProjectActions.test.ts +4 tests（每个 action 的 confirm spy 收到不同 labels）

**Task 5:**

- i18n.test.ts +4 tests（overwrite keys 各 zh + en）

### 5.2 GREEN 阶段（实现）

按上面 §2 接口设计实现。

### 5.3 IMPROVE 阶段

- 抽出 `buildConfirmOptions(action, locale, projectName, targetName)` helper
- `overwrite` flag 在 `ProjectNewRequest` 类型上加 JSDoc
- i18n key 命名加 internal cross-reference comment
- `guardedDirtySwitch` return type 用 discriminated union 更精确

### 5.4 Coverage 验证

- pnpm test 734 pass
- coverage ≥ 96.78% / 87.01% / 100%
- 5/5 baseline 保持

---

## 6. 文件改动总览

| 文件                                                     | 改动                                                                                                                | Task               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `src/shared/types.ts`                                    | `ProjectNewRequest` + `overwrite?: boolean`                                                                         | T2                 |
| `src/main/ipc/projectNewHandler.ts`                      | overwrite 跳过 fs.access                                                                                            | T2                 |
| `src/main/ipc/__tests__/projectNew.test.ts`              | +1 test (overwrite)                                                                                                 | T2                 |
| `src/renderer/store/useArxmlStore.ts`                    | 删 `PendingAction` + `pendingAction` + `setPendingAction`                                                           | T3                 |
| `src/renderer/hooks/useProjectActions.ts`                | `guardedDirtySwitch` 接 action + save callback；`submitNewProject` overwrite-confirm 重试；删 4 个 setPendingAction | T1, T2, T3, T4, T5 |
| `src/renderer/hooks/__tests__/useProjectActions.test.ts` | 改 3 saveAndProceed；+2 overwrite；+4 per-action labels；删 ensureDialogStatePatch 1 分支                           | T1, T2, T3, T4     |
| `src/shared/i18n.ts`                                     | +12 (T4) +4 (T5) keys in type + zh-CN + en                                                                          | T4, T5             |
| `src/shared/__tests__/i18n.test.ts`                      | +12 (T4) +4 (T5) tests                                                                                              | T4, T5             |

**总计 8 个文件。**

---

## 7. 风险与缓解

| 风险                                                    | 概率 | 影响                                              | 缓解                                                                    |
| ------------------------------------------------------- | ---- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| `overwrite: true` 跳过 fs.access 后被恶意 renderer 利用 | 中   | 低（renderer 是自己代码 + electron IPC 是 local） | 添加 JSDoc 注释：仅供 main→renderer overwrite-confirm 重试使用          |
| `guardedDirtySwitch` 加 `save` 参数破坏现有 4 caller    | 中   | 中                                                | 每个 caller 在 useCallback 内部传自己的 save closure；保持 module-level |
| `pendingAction` 删除后某个 consumer 默默断掉            | 低   | 高（功能 regression）                             | 全文搜 `'pendingAction'`（grep + AGENTS.md）→ 0 consumer → 安全         |
| i18n key 命名不一致                                     | 中   | 中                                                | 用 `confirm.unsaved.${axis}.${action}` 模板；新 key 一次 ship 16 个     |
| push 仍然遇到 Recv failure reset                        | 中   | 低                                                | 保留 `git -c http.proxy= -c https.proxy= push` + sleep 30s 重试         |

---

## 8. 退出条件 (Exit Criteria)

Wave 1 sub-agent 报告时必须满足：

- [x] Plan + spec 写完
- [ ] pnpm test 734 pass (或 711 + 23 = 734)
- [ ] Coverage ≥ baseline
- [ ] 5/5 baseline 通过
- [ ] ESLint + Prettier clean
- [ ] 单一 commit `feat(sprint12-3-phase1): cleanup 5 deferred items (3.2)` pushed to origin/main
- [ ] 5 items 全部勾掉

---

## 9. 不做（明确范围外）

- claude-autosar v2 集成
- package.json version bump（主 loop 统一处理 v0.14.0 → v0.14.1）
- Sprint 12 #3 Phase 2/3 simplifications（属于 Stage 3.3/3.4）
- Sprint 12 backlog M6/M7/M8（Stage 4 i18n 抛光）
- Sprint 12 backlog #7/#8/#9（Stage 5 release）
- Combined Tree View (Stage 3.5)
- LeftPanel WIP（Stage 3.1）
- 其它 IPC error i18n 抽取（仅 overwrite-confirm）
