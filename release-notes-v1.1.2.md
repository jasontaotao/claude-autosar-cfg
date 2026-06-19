## v1.1.2 — Sprint 17 Polish Batch

Sprint 17 集中 ship Sprint 16 留下的 10 个 polish follow-up。Zero breaking
change，全部 PATCH 级。

### Highlights

- **`SaveArxmlError` typed kind + errno 映射** (`50adda4`)：save 失败现在按
  NodeJS errno code (EACCES / EPERM / ENOSPC / EDQUOT / ENOENT / ENOTDIR)
  dispatch 到 6 种 typed kind，renderer 给用户本地化提示。`'write-failed'`
  保留作为 v1.1.0/v1.1.1 legacy alias。
- **ErrorBanner 4-kind 化** (`c2b2628`)：error (red, manual) / warning
  (amber, 5s) / info (blue, 3s) / success (green, 3s) — 各有独立色 + 自动
  消失 timer。`aria-live` 跟随 kind 切换 `assertive` ↔ `polite`。
- **Combined view EAS 去重** (`32c621b`)：`buildCombinedDocument` 静默合并
  identical root package（如两个 EAS），对 shortName 同但内容不同的 root
  保留第一个 + emit `duplicate-root-conflict` warning。
- **`toManifestRelative` 拒绝 `..` 段** (`3c6d0b6`)：防止 manifest 持久化
  时被注入 parent-traversal 路径。
- **`resolveContainerTarget` helper** (`912cc7f`)：消除 7 处重复
  `findByPathMultiDoc` inline block + 1 处 BswmdPickerDialog 调用，零行为
  变化纯重构。
- **BSWMD picker stale-seed 修复** (`82ca016`)：picker 开着时外部
  load/remove 文档后，picker 重新解析源而不是用缓存的旧值。

### 6 commits — 3 sub-sprints

| Sprint | Commits | Theme |
|--------|---------|-------|
| 17a    | `3c6d0b6` + `6bfff66` + `bbcb693` + `a314c35` | Path 安全 + UI 视觉提示 + lint 清理（pre-existing polish） |
| 17b    | `c2b2628` + `50adda4` | Toast 体系 + 错误类型化 |
| 17c    | `912cc7f` + `82ca016` + `32c621b` | 重构 + UX 修正 + 数据正确性 |
| Review | `77f62a8` | HIGH-1: eslint-disable 注释归位 |

### Tests

- **1206 tests passing**（v1.1.1: 1178 → v1.1.2: 1206，净增 +28）
- Coverage: ≥ v1.1.1 baseline (90.72% branches / 96.8% stmts)
- 5/5 baseline gate green (format / lint 0 warnings / type-check / test / build)
- 76 files changed, +7352 / -1895 lines

### Upgrading from v1.1.1

Zero breaking change. PATCH bump.

**注意：这是首次 `package.json` 实际与 release tag 对齐的版本。** v1.1.0
和 v1.1.1 的 tag 创建时未同步 bump `package.json`（一直停在 `1.0.0`）；
v1.1.2 是首次让 `package.json` 与 tag version 一致。如果你的环境依赖
`package.json` version（CI badge 等），v1.1.0/v1.1.1 显示为 1.0.0，
v1.1.2 起恢复正常。

### Sub-sprint Details

**17a (path/UI polish, pre-batch commits):**
- T1 path `..` 拒绝（`3c6d0b6`）
- T3 Save All `.is-dirty`（`6bfff66`）
- T4 zh-CN `app.saveAllPartial`（`a314c35` 一部分）
- T5 saveArxmlHandler lint 清理（`bbcb693`）
- T2 audit 确认无 dead code（no commit）

**17b (toast system + typed errors):**
- T6 ErrorBanner 4-kind + auto-dismiss + toast store slice（`c2b2628`）
- T7 SaveArxmlError 6-kind + errno threading + renderer dispatch（`50adda4`）

**17c (refactor + UX + correctness):**
- T8 resolveContainerTarget helper（`912cc7f`，零行为变化重构）
- T9 BswmdPickerDialog stale-seed 修复（`82ca016`）
- T10 buildCombinedDocument root dedup + warnings（`32c621b`）

**Review-fix:**
- HIGH-1: BswmdPickerDialog eslint-disable 注释位置修正（`77f62a8`）

### Notable Design Decisions

- **Toast slice 保留 legacy `error` 字段** — T6 的 `setInfo` /
  `setSuccess` / `setWarning` 同时写 `toast` 和 `error: string` 字段
  （保持 back-compat）。`error` 字段名仍可能误导（info/success 也会写），
  重命名为 `bannerMessage` 列入后续 sprint。
- **buildCombinedDocument dedup runs in BOTH modes** — 计划写 flat-only，
  实施时移到 flat/collision branch **之前**，所以 collision mode 也先
  dedup 再做 wrap。Spec 一致性优先于 plan 细节。
- **resolveContainerTarget single-mode return null** — 当 `state.doc ===
  null` 时 helper 返回 `null`，与原 inline `if (state.doc === null)
  return;` 语义一致，零行为变化验证通过 4 个 helper unit test。