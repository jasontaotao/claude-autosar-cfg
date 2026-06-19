# v1.1.2 Polish Sprint — Design Spec

> **Status**: Draft → Approved (user "you choose" = full autonomy)
> **Author**: Claude (autonomous design call after 3× "you choose" deflection)
> **Date**: 2026-06-19
> **Baseline**: v1.1.1 (`aa1c731` on origin/main) / 1178 tests / 0 type errors / 0 lint errors / 96.8% stmts
> **Target**: v1.1.2 (`package.json` 1.1.1 → 1.1.2, PATCH bump)

## 1. 范围

v1.1.2 是 Sprint 16 ship 后沉淀的 **10 项 polish** 的集中 release。所有改动基于 v1.1.1 稳定基线，**零 breaking change**。

10 项 follow-up 来自 `sprint-16-shipped.md` 的 "关键 follow-up" 段，已按风险和复杂度归入 3 个 sub-sprint：

| Sub-sprint | Items | 风险 | 估计 commits |
|---|---|---|---|
| **17a polish** | #1 / #3 / #5 / #6 / #10 | 低 | 5-6 |
| **17b UX** | #2 / #7 | 低-中 | 2-3 |
| **17c correctness** | #4 / #8 / #9 | 中 | 3-5 |
| **Total** | 10 | — | **10-14** |

## 2. Sub-sprint 17a — Trivial polish (5-6 commits)

### T1 — `#1` `toManifestRelative` reject `..` (#8: low)

**文件**: `src/shared/path.ts` + `src/shared/__tests__/path.test.ts`

**改动**:
- `toManifestRelative(manifestDir, filePath)` 当前对 already-relative 输入透传不 reject `..` segments。
- 当 caller 已知 filePath 是相对 manifestDir 计算的（已 relative），但仍可能含有 `..`（例如 `../../../etc/passwd`），需 caller 自行 validate。
- **修复**: 在 `toManifestRelative` 末尾增加 final 检查：若返回的 relative path 包含 `..` segment（不拆分 normalize），返回 `null`（与 invalid input 同语义）。caller 已知处理 `null` 返回值。

**测试**:
- `src/shared/__tests__/path.test.ts` 新增 2-3 cases：
  - relative input `../foo` → `null`
  - relative input `foo/../bar` → `null`（含 ..）
  - relative input `foo/bar` → `foo/bar`（passthrough）
- 现有 caller (manifest.ts) 已 re-validate，**预期 0 churn**。

### T2 — `#3` ConfirmDialog consumer dead `'continue'` audit (#8: low)

**文件**: `src/renderer/components/` 下 ConfirmDialog + CascadeConfirmDialog 的所有 consumer

**改动**:
- 验证所有 `switch (choice)` / `if (choice === ...)` 处是否有 dead `'continue'` branch。
- 已知 `ConfirmDialog.tsx` 自身使用 `'continue'` 作为 Esc/backdrop/× 的安全 fallback（**非 dead**）。
- `CascadeConfirmDialog.tsx` 用 `'cancel'`（不是 `'continue'`），同样**非 dead**。
- 检查 caller 的 switch 中是否把 `'continue'` 当合法分支处理。若是，**保留 case + 加注释 `// 'continue' = safe fallback from ConfirmDialog (Esc/backdrop/×); treat as no-op`**。
- 若 caller 写了 `case 'continue': throw new Error(...)` 之类 unreachable 代码，**移除 + inline fallback**。

**测试**:
- 不加新测试（仅 audit + comment）。如有移除 dead branch，加 regression test 验证 fallback 行为。

### T3 — `#5` `.app-btn-save-all.is-dirty` visual cue (#8: low)

**文件**: `src/renderer/components/AppHeader.tsx` + `src/renderer/components/AppHeader.css` + `src/renderer/components/__tests__/AppHeader.test.tsx`

**改动**:
- 当前 `.app-btn-save-all` 没有 `.is-dirty` 状态视觉反馈。
- CSS: 加 `.app-btn-save-all.is-dirty { background: var(--accent-amber); color: var(--text-inverse); }` 或类似。
- AppHeader.tsx: 当任意 doc dirty 时，给 Save All 按钮加 `is-dirty` class（已通过 `hasDirty` selector 判断）。
- 测试: 验证 dirty 时有 `is-dirty` class，clean 时无。

### T4 — `#6` zh-CN `app.saveAllPartial` i18n key (#8: low)

**文件**: `src/shared/i18n.ts` (zh-CN section)

**改动**:
- 现有 `app.saveAllPartial` 仅在 en-US / 英文 locale 有翻译。
- 加 zh-CN 翻译（基于 Sprint 16 T7 设计 — 部分 save 失败的 toast 消息）。
- 测试: 加 locale-parity 测试（确保 en-US / zh-CN 都有 `app.saveAllPartial` key）。

### T5 — `#10` saveArxmlHandler lint warnings (#8: low)

**文件**: `src/main/ipc/saveArxmlHandler.ts`

**改动**:
- 当前文件有 pre-existing lint warnings（具体行号需 implementer 通过 `pnpm lint` 确认）。
- 修复所有 warning（unused var / no-explicit-any / import-order 等）。
- 预期改动小，可能 1-2 处清理。
- 测试: `pnpm lint --max-warnings 0` 必须 PASS（v1.1.2 release gate）。

## 3. Sub-sprint 17b — UX (2-3 commits)

### T6 — `#7` ErrorBanner `kind` discriminator (#8: low-mid)

**文件**:
- `src/renderer/components/ErrorBanner.tsx`
- `src/renderer/components/ErrorBanner.css`
- `src/renderer/store/useArxmlStore.ts`（新增 `info` / `success` action）
- `src/shared/i18n.ts`（新 keys）
- `src/renderer/components/__tests__/ErrorBanner.test.tsx`

**改动**:
- **核心**: 扩展 `ErrorBanner` 接受 `kind: 'error' | 'warning' | 'info' | 'success'`（默认 `'error'` 保持现有行为）。
- **颜色**:
  - `error` → 红色（现状 `#7f1d1d`）
  - `warning` → 琥珀色（`#92400e` 背景 + `#fef3c7` 文字）
  - `info` → 蓝色（`#1e40af` + `#dbeafe`）
  - `success` → 绿色（`#166534` + `#dcfce7`）
- **auto-dismiss**: `info` / `success` 默认 3 秒后自动消失；`error` / `warning` 保留手动 dismiss（保留现有 contract）。
- **store action**: 新增 `setInfo(message)` / `setSuccess(message)` / `setWarning(message)`，`setError(message)` 保持不变。
- **i18n keys**: `app.info.dismissAria` / `app.success.dismissAria` / `app.warning.dismissAria`（en + zh-CN）。
- **类型设计**:
  ```ts
  type ToastKind = 'error' | 'warning' | 'info' | 'success';
  interface ToastState {
    readonly kind: ToastKind;
    readonly message: string;
    readonly autoDismissMs?: number;  // 默认 0 = manual only
  }
  ```

**测试**:
- ErrorBanner.test.tsx 新增 4 cases：每个 kind 渲染对应 className / auto-dismiss 计时。
- store test: `setInfo` / `setSuccess` / `setWarning` 各自走 store 状态正确。

### T7 — `#2` `SaveArxmlError` typed error + toast dispatch (#8: low-mid)

**文件**:
- `src/shared/types.ts`（扩 `FileError` union）
- `src/main/ipc/saveArxmlHandler.ts`（thread `error.code`）
- `src/renderer/store/useArxmlStore.ts`（接 toast dispatch）
- `src/shared/i18n.ts`（新 error kind 翻译 keys）

**改动**:
- **类型扩展**:
  ```ts
  type SaveArxmlErrorKind =
    | 'permission-denied'
    | 'disk-full'
    | 'path-not-found'
    | 'serialize-failed'
    | 'write-failed'   // v1.1.0/v1.1.1 legacy alias kept for backward compat
    | 'unknown';
  interface FileError {
    kind: SaveArxmlErrorKind;
    code?: string;  // e.g. 'EACCES', 'ENOSPC', 'ENOENT'
    message: string;
  }
  ```
  `'write-failed'` 保留作为 backward-compat alias（v1.1.0/v1.1.1 主进程错误返回都用它），renderer handler 仍识别 `'write-failed'` 并 fallback 到 `'unknown'` toast 渲染。
- **handler**:
  - `fs.writeFile` 抛错时根据 `e.code`（NodeJS.ErrnoException）分发 kind：
    - `EACCES` / `EPERM` → `'permission-denied'`
    - `ENOSPC` / `EDQUOT` → `'disk-full'`
    - `ENOENT` / `ENOTDIR` → `'path-not-found'`
    - 其他 → `'unknown'`（不再用 `'write-failed'`，新错误一律精确 kind）
  - `serializeArxml` 失败 → `'serialize-failed'`（独立 kind）
- **toast dispatch**: renderer 在收到 `{ ok: false, error }` 时根据 `kind` 选不同 toast (T6):
  - `permission-denied` → red error toast with localized "Permission denied"
  - `disk-full` → red error toast with localized "Disk full"
  - `path-not-found` → red error toast with localized "Path not found"
  - `serialize-failed` → red error toast
  - `'write-failed'` (legacy) → red error toast with `error.message` fallback（向后兼容旧 IPC 响应）
  - `'unknown'` → red error toast with `error.message` fallback

**测试**:
- saveArxmlHandler 新增 unit tests（mock fs.writeFile 抛各 errno code 验证 kind 分发）。
- i18n locale-parity tests for new keys。

## 4. Sub-sprint 17c — Correctness (3-5 commits)

### T8 — `#4` picker stale-seed invalidation (#8: mid)

**文件**: `src/renderer/components/BswmdPickerDialog.tsx`

**改动**:
- 当前 picker 用 `useMemo` 计算 seed，仅依赖 `[parentPath, kind, state]`。如果 `state.documents` 在 picker open 期间变化（load / remove / mutate），`useMemo` 不会重跑（因为 `state` reference 没变 — Zustand 部分订阅）。
- **修复**: 用 selector 单独订阅 `state.documents` + `state.documentPaths`，加入 `useMemo` deps。或者改用 `useArxmlStore((s) => ({ docs: s.documents, paths: s.documentPaths }))` 拿到 fine-grained subscription。
- 也可以加 `useEffect` 监听 `state.documents` 变化触发 `resolvePickerSource` re-run。

**测试**:
- 新增 test: render picker → dispatch `loadDocument` action → assert picker 重渲染并显示新 doc 的元素。
- 现有 picker 测试不变（passthrough case 验证）。

### T9 — `#8` consolidate `findByPathMultiDoc` call sites (#8: mid)

**文件**:
- `src/renderer/store/useArxmlStore.ts`（抽出 helper）
- `src/renderer/store/__tests__/useArxmlStore.combined.test.ts`（新增 helper test）
- `src/renderer/components/BswmdPickerDialog.tsx`（改用 helper）

**改动**:
- 当前 `useArxmlStore.ts` 7 处 `if (state.viewMode === 'combined') { const hit = findByPathMultiDoc(...); ... }` 重复模式。
- 抽出 helper:
  ```ts
  // in useArxmlStore.ts
  export function resolveContainerTarget(
    state: ArxmlStoreState,
    containerPath: string,
  ): { doc: ArxmlDocument; filePath: string; innerPath: string } | null {
    if (state.viewMode === 'combined') {
      const hit = findByPathMultiDoc(state.documents, state.documentPaths, containerPath);
      if (hit === null) return null;
      return { doc: hit.doc, filePath: hit.filePath, innerPath: containerPath };
    }
    if (state.doc === null) return null;
    return { doc: state.doc, filePath: state.docPath ?? '', innerPath: containerPath };
  }
  ```
- 替换 7 处 call sites。BswmdPickerDialog 也用 helper（去除它内部的 `findByPathMultiDoc` 调用）。
- 保留 `findByPathMultiDoc` 本身（core 层 utility，helper 只是 store 层包装）。

**测试**:
- `useArxmlStore.combined.test.ts` 新增 helper unit tests（combined/single/empty cases）。
- 现有 7 处 call sites 的 integration tests 应继续 pass（行为不变）。

### T10 — `#9` `buildCombinedDocument` dedup duplicate root (#8: mid-high)

**文件**:
- `src/core/arxml/path.ts`（`buildCombinedDocument` 函数）
- `src/core/arxml/__tests__/path.test.ts`（新增 dedup tests）
- `src/renderer/store/useArxmlStore.ts`（如需要 metric 上报）

**改动**:
- 当前 flat-mode 下若多文档有相同 SHORT-NAME 的根包（最常见场景：两个 `EAS` 模块定义），会全部展示，造成重复。
- **修复方案**: 在 `buildCombinedDocument` 内做 dedup:
  1. 遍历所有 docs 的根包，按 `(parentPath, shortName)` 分组。
  2. 同一组内:
     - **同 content（深度 equal）** → 保留 1 份，**静默去重**。
     - **不同 content** → 保留第 1 份，**记录 warning metric**（toast 或 console.warn，看设计）。
  3. dedup 后的 root packages 数组传给 tree renderer。
- **UI 影响**: 现有 `EAS[0]` / `EAS[1]` 后缀 fallback（Sprint 16 `detectCombinedCollision` 已实现）保留；dedup 是更进一步的合并 — 若两个 `EAS` 内容相同，则只显示 1 个 `EAS`。
- **metric**: 加 `store.warnings` 数组（push `{kind: 'duplicate-root-collapsed', shortName, count}，`）renderer 可选地在 status bar 显示。

**测试**:
- path.test.ts 新增 4-5 cases:
  - 2 docs with identical `EAS` → dedup to 1
  - 2 docs with different `EAS` → keep first, emit warning
  - 3 docs with mixed identical/different → dedup where possible, warn where conflict
  - 不同 shortName (`EAS` + `Com`) → no dedup, no warning
  - 嵌套 dedup (子包也 dedup)

## 5. 测试策略

每个 task 至少 1 个新单元测试：

| Task | 新增测试 | 覆盖范围 |
|---|---|---|
| T1 | 2-3 cases in path.test.ts | reject `..` |
| T2 | 0 (audit + comment) — 除非发现真 dead code | — |
| T3 | 2 cases in AppHeader.test.tsx | `.is-dirty` class on/off |
| T4 | 1 case in i18n.test.ts | locale parity `app.saveAllPartial` |
| T5 | 0 (lint clean via `pnpm lint`) | — |
| T6 | 4-5 cases in ErrorBanner.test.tsx | 4 kind rendering + auto-dismiss |
| T7 | 4-5 cases in saveArxmlHandler.test.ts | errno → kind dispatch |
| T8 | 1 case in BswmdPickerDialog.test.tsx | store change triggers re-resolve |
| T9 | 3-4 cases in useArxmlStore.combined.test.ts | helper combined/single/empty |
| T10 | 4-5 cases in path.test.ts | dedup scenarios |

**预计新增测试**: 18-28 cases / 1178 → ~1200 tests。

## 6. 成功标准 (Release Gate)

- [ ] **5/5 baseline 通过**:
  - format (prettier --check clean)
  - lint (eslint --max-warnings 0 clean，**含 T5 saveArxmlHandler warnings**)
  - type-check (tsc --noEmit both projects clean)
  - test (1178 + new ≥ 1195 tests pass, 1 skipped)
  - build (vite build renderer + main + preload)
- [ ] **Coverage**: ≥ 90.72% branches / ≥ 96.8% stmts (持平 v1.1.1)
- [ ] **0 type errors / 0 lint errors**
- [ ] **所有 commits 走 conventional commits format**
- [ ] **package.json version**: 1.1.1 → **1.1.2**
- [ ] **CHANGELOG.md**: 新增 `[1.1.2]` 条目（基于本文档 §2-4）

## 7. 迁移 / 兼容性

- 零 breaking change：
  - `FileError` 新增 `kind` enum cases 是**加法**（existing `'write-failed'` rename 为 `'unknown'` — 但保留 backward compat alias）
  - `ToastState` 是新 type，existing `error` field 保持
  - `toManifestRelative` 行为变更（reject `..`）— 仅影响 already-malformed input，正常 caller 不受影响
- v1.1.0 / v1.1.1 → v1.1.2 透明升级

## 8. 风险 + 缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| T7 errno kind 分发遗漏 (rare errno) | 低 | 低 | fallback 到 `'unknown'` |
| T6 auto-dismiss 与手动 dismiss 冲突 | 中 | 低 | manual dismiss cancel timer |
| T10 dedup 算法 perf (大工程) | 低 | 中 | 单元测试覆盖 10+ docs case |
| T9 helper 抽出回归 | 中 | 中 | 现有 integration test 应捕获 |

## 9. 决策记录（已锁定）

| # | 决策 | 理由 |
|---|---|---|
| D1 | 10 项全入 v1.1.2 (Option A) | 用户 "you choose" — 单 release 比拆 v1.1.2/v1.1.3 节省 release overhead；Sprint 16 已证 14 commits 单 sprint 可行 |
| D2 | T6 kind = 4 值 (error/warning/info/success) | 覆盖所有 toast 场景；不引入 enum，type alias 更轻 |
| D3 | T7 FileError 新增 `kind` union + 保留 `'unknown'` 作为 catch-all | backward compat（renderer 现有 `'write-failed'` handler 可 fallback 到 `'unknown'`） |
| D4 | T10 dedup 同 content 静默 / 不同 content warn | 同 content 不打扰；不同 content 提示用户避免信息丢失 |
| D5 | T9 helper 放 `useArxmlStore.ts`（不新文件） | 7 处调用都在 store，co-location 减少 import churn |
| D6 | T5 lint warnings fix 不改 behavior | 仅 lint clean，不动 save flow |

## 10. Out of Scope

明确**不**在 v1.1.2：

- Script Engine (Sprint 14 #B) — 28 new files，下个 sprint
- ECUC ARXML Import (Sprint 14 #A) — 15 tasks，下个 sprint
- BSWMD multi-pick reverse op (Sprint 14 #C) — 已 ship v1.1.0
- Coverage 提升到 95% — 留给下个 PATCH
- NSIS installer rebuild — 留给手动 build
- GH release 自动创建 — gh CLI 仍未装，留手动

## 11. 实施顺序

```
17a (T1-T5, ~3 commits first, then T6-T7 for 17b, then 17c)
  → parallel: T1 / T3 / T4 / T5 can run as independent atomic commits
  → sequential within 17c: T9 → T8 → T10 (helper first, then consumers)
```

## 12. 关联

- [[sprint-16-shipped]] — follow-ups 来源
- [[claude-autosarcfg-overview]] — project context
- `docs/superpowers/specs/2026-06-18-bswmd-to-ecuc-design.md` — Sprint 14 设计参考