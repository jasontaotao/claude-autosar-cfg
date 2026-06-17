# Sprint 12 #3 Phase 1 简化清理（Stage 3.2）

> **For agentic workers:** 本计划执行 Sprint 12 #3 code review 留下的 5 项 Phase 1 simplification。Wave 1 sub-agent 任务范围（不要动其他 Stage 子项）。

**Goal:** 清掉 Sprint 12 #3 的 5 项 Phase 1 simplification 死代码 / 占位 / 硬编码。

**Architecture:** TDD 严格 (RED → GREEN → IMPROVE)，按依赖顺序串联 5 个 task；每个 task 独立 commit，集中在单一 PR commit。

**Tech Stack:** Electron 30 + TypeScript 5 strict + React 18 + Zustand 4 + Vitest 1（与现有 stack 一致）

---

## 起点状态（2026-06-17）

| 项                 | 状态                                                                  |
| ------------------ | --------------------------------------------------------------------- |
| `local HEAD`       | `aea386c` chore(format)                                               |
| `origin/main HEAD` | `aea386c` = local                                                     |
| Tests              | 711 passed / 1 skipped (712 total)                                    |
| Coverage           | 96.78% / 87.01% / 100%                                                |
| Wave 1 scope       | 仅本目录 5 tasks；不动 version（主 loop 统一 bump v0.14.0 → v0.14.1） |

---

## 范围（5 items per master plan § 3.2）

1. **Task 1**: `'saveAndProceed'` button 真实实现（当前返回 canceled）
2. **Task 2**: `'overwrite-confirm'` IPC result 改回二次 confirm dialog
3. **Task 3**: `store.pendingAction` 死代码清理
4. **Task 4**: `confirm.unsaved.message` per-action i18n（4 switching actions）
5. **Task 5**: `overwrite-confirm` hook i18n key

---

## Task 1 — `'saveAndProceed'` button 真实实现

### 当前行为

`src/renderer/hooks/useProjectActions.ts` 中 `guardedDirtySwitch()` 把 `'saveAndProceed'` 与 `'continue'` 都视为 `proceed: false`（line 99）。Phase 1 是安全的 "do nothing" 默认，但用户点 "保存并新建" 实际啥也没发生——违反用户意图。

### 目标

`'saveAndProceed'` = 先调用 `saveProject()` → 成功才 proceed（discard 同样的 proceed 路径）；失败则 cancel 并暴露错误。

### 实现细节

- 在 `guardedDirtySwitch` 内（或 inline 改写为每-action 各自处理）检测 `choice === 'saveAndProceed'`：
  - `await saveProject()` 调用当前 action 上下文里的 save 能力
  - `saveProject` 返回 `{ kind: 'ok' }` → `proceed: true`（已保存，安全 discard）
  - `saveProject` 返回 `{ kind: 'canceled' }`（无 project）→ `proceed: false`
  - `saveProject` 返回 `{ kind: 'error' }` → `proceed: false`（错误通过 ProjectActionResult 透传）

### 风险

- 当前测试 'saveAndProceed → returns canceled' 假设 Phase 1 占位；Task 1 完成后要 update
- saveProject 需要 project 路径；loose mode（project === null）下 user 没法 save，proceed: false 是合理 fallback

### Test 计划（RED → GREEN）

- 更新 `useProjectActions.test.ts` Section 3/4/5 中 `saveAndProceed` 测试：
  - **`openProjectFromDialog` + saveAndProceed + saveProject 成功**：mock saveProject 返回 `{ kind: 'ok' }`；断言 `projectOpen` 被调用
  - **`addBswmdFromDialog` + saveAndProceed + saveProject 成功**：mock saveProject 成功；断言 picker + addBswmd 链路触发
  - **`removeBswmdWithGuard` + saveAndProceed + saveProject 成功**：mock saveProject 成功；断言 `removeBswmd` 被调用
  - **`saveAndProceed` + saveProject 失败（write-failed）**：断言 proceed: false，IPC 链路 NOT 调用
  - **`saveAndProceed` + saveProject 返回 canceled（loose mode）**：断言 proceed: false

### 改 files

- `src/renderer/hooks/useProjectActions.ts`（`guardedDirtySwitch` 实现 + 各 action 调用点）
- `src/renderer/hooks/__tests__/useProjectActions.test.ts`（更新 3 个 saveAndProceed 假设 → 实行为）

---

## Task 2 — `'overwrite-confirm'` IPC result 改回二次 confirm dialog

### 当前行为

`useProjectActions.submitNewProject` 收到 `{ kind: 'overwrite-confirm', path }` 时直接 return `{ kind: 'error', message: '文件已存在: ...' }`。用户被迫改 name 或 dir。

### 目标

弹出 ConfirmDialog（3-button 复用：覆盖 / 重命名 / 取消）让用户选：

- **覆盖 (discard existing)**：直接重试 IPC 一次（带 overwrite flag 或新 IPC channel），覆盖原文件
- **重命名 (continue)**：关闭 confirm，用户改 input 重试
- **取消 (cancel)**：关闭 dialog 和 confirm，放弃创建

### 设计取舍

- **方案 A（最简）**：在 `useProjectActions` 内 `await confirm(...)` 复用 3-button；选 discard 走 `overwrite: true` flag（需要扩展 `ProjectNewRequest`）
- **方案 B（侵入小）**：增加 `projectNewOverwrite: true` flag 到 `ProjectNewRequest`；main 端 `projectNewHandler` 检测到 overwrite 时跳过 `fs.access` 检查直接 `writeFile`

**选定方案 B**（侵入小，main 端逻辑增量 +1 个分支）。

### Test 计划

- 新增 `useProjectActions.test.ts` 测试：
  - **`overwrite-confirm` + confirm → discard**：第二次调用 `projectNew` 带 `overwrite: true`，返回 `{ kind: 'created' }`；assert `store.openProject` 触发
  - **`overwrite-confirm` + confirm → continue**：assert IPC 第二次被调用（带 overwrite）→ 但 user 改 input 后只调用 1 次；**简化为**：assert dialog stays open, error feedback inline
  - **`overwrite-confirm` + confirm → saveAndProceed**（如保留 3-button）：**实测**：3-button 复用时 'saveAndProceed' 在此上下文无意义；改用 2-button 复用 confirm + 'discard' = 覆盖, 'continue' = 取消
- 新增 `projectNewHandler.test.ts` 测试：
  - `{ name, directory, overwrite: true }` 在文件已存在时直接 overwrite → `{ kind: 'created' }`

### 改 files

- `src/shared/types.ts`（`ProjectNewRequest` 加 `overwrite?: boolean`）
- `src/main/ipc/projectNewHandler.ts`（`fs.access` 检查前看 `overwrite` flag；`true` 时直接跳过）
- `src/main/ipc/__tests__/projectNew.test.ts`（+1 测试：overwrite 强制创建）
- `src/renderer/hooks/useProjectActions.ts`（`submitNewProject` 内收到 overwrite-confirm → 二次 confirm → 重试带 overwrite）
- `src/renderer/hooks/__tests__/useProjectActions.test.ts`（+2 测试）

### 命名约定

- 复用 `confirm()` API（ConfirmDialog）即可
- Confirm message 走 i18n key `confirm.overwrite.title` / `confirm.overwrite.message` / `confirm.overwrite.continueLabel` / `confirm.overwrite.discardLabel`（见 Task 5）

---

## Task 3 — `store.pendingAction` 死代码清理

### 当前行为

`store.pendingAction: PendingAction | null` + `setPendingAction` setter：

- 在 `useArxmlStore.ts` 定义（line 169, 172, 298, 441, 585）
- 在 `useProjectActions.ts` 的 `newProject()` 调用 `setPendingAction({ kind: 'newProject' })`
- 在 `submitNewProject('created')` 调用 `setPendingAction(null)` 清除
- 在 openProject / addBswmd / removeBswmd 三个 action 的 cancel 分支调用 `setPendingAction(null)`
- 但**没有任何 consumer 读** `pendingAction`：搜了所有 renderer 代码，没看到 selector use
- Phase 1 注释说"由 ConfirmDialog 消费"但**实际 ConfirmDialog 用 module-level externalSetState 模式，不读 store**

### 目标

删除 `pendingAction` 字段 + `setPendingAction` setter + `PendingAction` 类型 + 所有 setter 调用点（`useProjectActions` 内的 4-5 个 `setPendingAction` 调用）。

### 风险

- 测试 fixture `ensureDialogStatePatch` 装了 shim；删除后 fixture 的 patch 也要删
- 注释文档提到 `pendingAction`（多处）要扫干净

### Test 计划

- 已有 711 tests 通过；删除代码后必须仍通过
- 删 `PendingAction` 类型的 import / patch 分支 / store 字段访问
- 跑 `pnpm test` 验证 0 regression

### 改 files

- `src/renderer/store/useArxmlStore.ts`（删 `PendingAction` 类型 + `pendingAction` 字段 + `setPendingAction` setter + 注释）
- `src/renderer/hooks/useProjectActions.ts`（删 4 个 `setPendingAction` 调用 + `setPendingAction` helper function）
- `src/renderer/hooks/__tests__/useProjectActions.test.ts`（删 `ensureDialogStatePatch` 中 pendingAction 分支 + 测试断言中的 `pendingAction` 检查）
- `src/renderer/App.tsx`（如有 `pendingAction` 引用 → 删）

---

## Task 4 — `confirm.unsaved.message` per-action i18n

### 当前行为

`guardedDirtySwitch` 用的 message 是通用 `confirm.unsaved.message`（"新建项目将丢失这些更改"），但实际触发的 action 可能是 openProject / addBswmd / removeBswmd —— 文案对不上。

### 目标

按 4 switching actions 分别取 i18n message：

| Action      | i18n key                                                                      |
| ----------- | ----------------------------------------------------------------------------- |
| newProject  | `confirm.unsaved.message.new` (现有 `confirm.unsaved.message` 改名为 `.new`?) |
| openProject | `confirm.unsaved.message.open`                                                |
| addBswmd    | `confirm.unsaved.message.addBswmd`                                            |
| removeBswmd | `confirm.unsaved.message.removeBswmd`                                         |

button label 也按 action 微调（"不保存，新建" 在 openProject 时应是 "不保存，打开"；"保存并新建" → "保存并打开" 等）。

### 命名

维持 5 套 keys：

```
'confirm.unsaved.title'                 (统一)
'confirm.unsaved.message'               (默认 / fall-back)  -- or 拆分？见下
'confirm.unsaved.continue'              (统一)
'confirm.unsaved.discard'               (统一)  -- 改成 per-action?
'confirm.unsaved.saveAndNew'            (统一)  -- 改成 per-action?
```

**决策**：保持 5 套通用 keys + 加 4 套 per-action 变体（message + discardLabel + saveLabel）：

```
'confirm.unsaved.message.new'           (现有 'confirm.unsaved.message' 改名为 .new)
'confirm.unsaved.message.open'          (新)
'confirm.unsaved.message.addBswmd'      (新)
'confirm.unsaved.message.removeBswmd'   (新)

'confirm.unsaved.discard.new'           (新，discardLabel 拆分)
'confirm.unsaved.discard.open'          (新)
'confirm.unsaved.discard.addBswmd'      (新)
'confirm.unsaved.discard.removeBswmd'   (新)

'confirm.unsaved.saveAndNew.new'        (新，saveLabel 拆分)
'confirm.unsaved.saveAndNew.open'       (新)
'confirm.unsaved.saveAndNew.addBswmd'   (新)
'confirm.unsaved.saveAndNew.removeBswmd'(新)
```

**简化为**：title/message/per-action-discard/per-action-save 四个轴 → 12 keys（1 通用 + 3 per-action × 3 axis = 12 总）。

实际最终方案采用 **`actionContext` 参数** 传给 `guardedDirtySwitch(actionContext)`，然后内部 `t(locale, 'confirm.unsaved.${action}.message')` 等。

### Test 计划

- `i18n.test.ts` + N 测试（每个新 key 各 1 zh + 1 en = 6 × 2 = 12 测试）
- `useProjectActions.test.ts`：mock `confirm` spy 验证 per-action 传的 labels 不一样
  - **`newProject` + dirty**: confirm spy 收到 `discardLabel` 含 "新建"
  - **`openProjectFromDialog` + dirty**: confirm spy 收到 `discardLabel` 含 "打开"
  - **`addBswmdFromDialog` + dirty**: confirm spy 收到 `discardLabel` 含 "添加 BSWMD"
  - **`removeBswmdWithGuard` + dirty**: confirm spy 收到 `discardLabel` 含 "移除 BSWMD"

### 改 files

- `src/shared/i18n.ts`（+12 new keys in type + zh-CN bundle + en bundle）
- `src/shared/__tests__/i18n.test.ts`（+12 new tests）
- `src/renderer/hooks/useProjectActions.ts`（`guardedDirtySwitch` 接收 `actionContext` 参数 + 各 caller 传不同 context）
- `src/renderer/hooks/__tests__/useProjectActions.test.ts`（+4 new tests 验证 per-action labels）

---

## Task 5 — `overwrite-confirm` hook i18n key

### 当前行为

`useProjectActions.submitNewProject` 收到 overwrite-confirm 时返回 error 硬编码 "文件已存在: ... — 请换一个项目名或目录"。i18n 不全（部分在 IPC handler 里 hard-coded 英文）。

### 目标

- 新增 i18n key `confirm.overwrite.title` / `confirm.overwrite.message` / `confirm.overwrite.continueLabel`（="重命名"）/ `confirm.overwrite.discardLabel`（="覆盖"）
- 二次 confirm 弹窗（Task 2）用这些 keys
- 同时把 projectNewHandler 的 `Directory not found` / `Project name is empty` / `Project name cannot contain path separators` 等内部 message 抽到 i18n（**可选**，但 plan 限定在 overwrite-confirm）

### 范围限定

本 task 只动 overwrite-confirm 的 i18n 路径（3-4 keys）。**不**扩展到其它 IPC error message 抽 i18n（那属于 Stage 4 i18n 抛光）。

### 改 files

- `src/shared/i18n.ts`（+4 keys in type + zh-CN + en）
- `src/shared/__tests__/i18n.test.ts`（+4 tests）
- `src/renderer/hooks/useProjectActions.ts`（`submitNewProject` overwrite-confirm 路径用新 keys）

---

## TDD / Commit 顺序

每个 task 严格 RED → GREEN → IMPROVE：

```
Task 1: saveAndProceed 真实实现
  - RED:   更新 3 个 saveAndProceed 测试 → 期望 saveProject 调用
  - GREEN: guardedDirtySwitch 处理 saveAndProceed → call saveProject → on success proceed
  - IMPROVE: 抽出 saveOrProceed 内部 helper

Task 2: overwrite-confirm 二次 confirm
  - RED:   +2 测试 → 期望 confirm 调用 + overwrite: true flag 透传
  - GREEN: submitNewProject 收到 overwrite-confirm → confirm → retry
  - GREEN: projectNewHandler 支持 overwrite: true 跳过 fs.access
  - IMPROVE: 错误 message 改为 i18n（部分 → Task 5 收尾）

Task 3: pendingAction 死代码清理
  - RED:   (无新测试 — 纯删除) 跑 test 确认 711 pass
  - GREEN: 删 PendingAction type / pendingAction field / setPendingAction setter / 4 callsites
  - IMPROVE: 扫剩余注释 + 删除无关的 store type member

Task 4: confirm.unsaved.message per-action i18n
  - RED:   +12 i18n tests + 4 useProjectActions tests
  - GREEN: guardedDirtySwitch(actionContext) 传 context → 各 action 调不同 key
  - IMPROVE: actionContext 改成 enum literal 字符串字面量类型（'newProject' | 'openProject' | ...）

Task 5: overwrite-confirm i18n key
  - RED:   +4 i18n tests
  - GREEN: i18n.ts 加 4 keys + useProjectActions overwrite-confirm 路径用
  - IMPROVE: 错误 message 走 i18n chain
```

---

## Commit 策略

**单一 commit**（按 master plan 要求）：

```
feat(sprint12-3-phase1): cleanup 5 deferred items (3.2)
```

涵盖所有 5 个 task 的代码 + 测试 + i18n + 注释更新。

**不 bump version**（Wave 1 范围外，主 loop 统一处理 v0.14.0 → v0.14.1）。

---

## Test 增量估算

- Task 1: 改 3 个测试（不增量）
- Task 2: +2 tests (useProjectActions) + 1 test (projectNewHandler) = +3
- Task 3: -0 tests
- Task 4: +12 i18n + 4 useProjectActions = +16
- Task 5: +4 i18n = +4
- **总计 +23 tests** → 711 + 23 = **734** (目标)

---

## Ship gate

- pnpm test 全绿（734 tests pass）
- Coverage ≥ baseline (96.78% / 87.01% / 100%)
- 5/5 baseline 保持
- ESLint + Prettier 干净
- 单一 commit `feat(sprint12-3-phase1): cleanup 5 deferred items (3.2)` pushed

---

## 范围外（明确不做）

- 任何 `claude-autosar v2` 集成
- `package.json` version bump
- Sprint 12 #3 Phase 2/3 simplifications（属于 Stage 3.3/3.4）
- Sprint 12 backlog M6/M7/M8（Stage 4 i18n 抛光）
- Sprint 12 backlog #7/#8/#9（Stage 5 release）
- Combined Tree View (Stage 3.5)
- LeftPanel WIP（Stage 3.1）
- Schema-unknown（Stage 1 已 ship）
- 其它 IPC error i18n 抽取（除 overwrite-confirm）

---

## Self-Review

**1. 5 items 全部覆盖**：✅ Task 1-5 1:1 对应 master plan § 3.2 5 个 bullets

**2. TDD 严格性**：✅ 每个 task 标了 RED → GREEN → IMPROVE；先 test 后 code

**3. 不动 version**：✅ commit message 不含 `chore(release)`；`package.json` 不动

**4. 不动其他 sub-stage**：✅ 范围限定在 `useProjectActions.ts` / `useArxmlStore.ts` / `projectNewHandler.ts` / `i18n.ts` + 4 个测试文件 + 1 个 type 文件

**5. i18n 命名一致**：✅ `confirm.unsaved.*` / `confirm.overwrite.*` 与现有 `confirm.unsaved.title` 等 key 风格一致

**6. 风险**：

- 风险 1：Task 2 overwrite flag 涉及 IPC contract 改动 → `src/shared/types.ts` 改动 + `ProjectNewRequest` 类型扩展。**缓解**：与 Stage 2 templates IPC 同样的渐进式扩展做法（optional field + 后向兼容）
- 风险 2：Task 4 引入 12 个新 i18n keys → 翻译工作量。**缓解**：zh-CN 和 en 同步 ship
- 风险 3：Task 1 改 guardedDirtySwitch 签名 → 4 个 caller 都受影响。**缓解**：保持 backward-compat （默认 actionContext = 'newProject'）

**7. Push 风险**：保留 `git -c http.proxy= -c https.proxy= push` + sleep 30s 重试的 workaround
