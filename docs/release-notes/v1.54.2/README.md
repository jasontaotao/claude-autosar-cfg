# v1.54.2 — Multi-Instance Tree Collection Header, Phase P1 (PATCH)

**Released:** 2026-07-14
**Tag:** [`v1.54.2`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.54.2)
**Cycle type:** PATCH (UI enhancement; no IPC, no schema, no backend change)
**Ship basis:** 4 source commits (T1 + T2 + T3 + T4) + 1 docs ship (T5)

## Summary

Phase P1 of the multi-instance tree UI enhancement. Adds a synthetic
`<CollectionHeader>` row above BSWMD `0..*` sub-containers when ≥2 instances
exist, showing `<shortName> ×N` badge with default-collapsed sibling list.
Inline `+ 1` button disabled when `upperMultiplicity` reached. Closes the
user-reported UX gap (screenshot 2026-07-13) where existing `AFECellValidSet`
and `AFETempValidSet` dialog buttons showed grey without explanation.

**Zero IPC change. Zero backend change. Zero schema change.** Pure UI
enhancement consuming the existing `addContainer` mutation surface and the
existing `coreAddContainer` auto-suffix mechanism at
`src/core/arxml/mutation/container-ops.ts:98-103`.

## Commits

| # | Commit | Title |
|---|---|---|
| T1 | `9d86997` | `feat(tree): Phase P1 T1 -- collections.ts helpers + optionalContainers return type` |
| T1 fix | `9e7f4d2` | `fix(tree): Phase P1 T1 reviewer findings -- base-name currentCount + contract tests` |
| T2 | `5e1183f` | `feat(tree): Phase P1 T2 -- CollectionHeader component + at-max disabled state` |
| T3 | `3618901` | `feat(tree): Phase P1 T3 -- Tree integration of CollectionHeader (default-collapsed + auto-suffix add)` |
| T3 fix | `d815fcd` | `fix(tree): add addContainer spy + click assertion -- close reviewer Important` |
| T4 | `22acf14` | `feat(i18n): Phase P1 T4 -- 4 new collection header keys x 2 locales + parity test` |
| T-ship | (this commit) | `docs(release): v1.54.2 PATCH -- Phase P1 multi-instance tree collection header` |

## Decisions

- **D1 集合头 = 合成 row,不替换真 sibling** — 真实 sibling 保留独立 path / selection / context menu (T3 follow-up: sibling rows fully preserved under existing rendering path).
- **D2 默认折叠** — N 较大时屏幕占用恒定; chevron toggle reveals siblings on demand.
- **D3 行内按钮进集合头** — `+ 1` button 集中在 collection header; sibling 行不加按钮 (噪音)。
- **D4 0..1 上限事前 disable + tooltip** — `aria-label="已达上限 — 无法继续添加"` when `count >= upperMultiplicity`. 不靠后端错误兜底。
- **D5 集合头 `+ 1` 替代 OptionalAddPlaceholder 在树底部** — 语义更清晰; existing dedup (`existingShortNames`) prevents double-affordance in current BSWMD fixtures.
- **D6 不引入命名 dialog** — 后端 `coreAddContainer:98-103` 自动 suffix `_1`/`_2`/`_3`/... UI 直接调 `addContainer(parent, shortName)`。
- **D7 不引入拖拽排序** — 按钮排序留作 P2。

## User-visible behavior

Before v1.54.2:
- `JWQ3399ConfigSet` 树下打开添加子容器 dialog
- `AFECellValidSet` 和 `AFETempValidSet` 都是灰 `[+]`(理由 unclear)
- 用户不知道是 "已存在" 还是 "不可重复"

After v1.54.2:
- 树中已有的 `AFECellValidSet` 实例(如果有 ≥2 个)显示集合头 `AFECellValidSet ×3 ▼`
- 集合头默认折叠 → 用户看到简洁的 `(×3)` 而不是 3 行平铺
- 集合头有 `+ 1` 按钮 — 点击自动调 `addContainer`,后端 `_N` 后缀自动生成新实例
- `AFETempValidSet` (upper=1, 已 1 个) 集合头的 `+ 1` 按钮**禁用** + tooltip "已达上限"
- chevron 点击展开/折叠集合内的具体实例

## Test results

- vitest 360 files / **3190 + 7 SKIP / 0 fail** (+22 net from v1.54.1's 3168)
- tsc both `tsconfig.json` + `tsconfig.web.json` clean
- prettier + eslint clean (T4 D3 side-fix: `.prettierignore` excludes `.superpowers/sdd/`)
- `pnpm verify` 8-stage GREEN (format / lint / type-check / test / coverage / build / import-regression / python-self-test)

## Process lessons applied

- **`function-extract-must-clip-verbatim-not-reimplement`** (now **STANDALONE** — 3rd confirmation at T3) — T3's inline BSWMD lookup reuses `resolveModuleAndParentContainer + findChildContainerDef` character-for-character rather than reimplementing.
- **`release-checklist-must-verify-package.json-bump-on-every-version-ship`** (standalone, 6th application) — `package.json` `1.54.1` → `1.54.2` verified pre-tag.
- **`round-X-review-preflight`** (standalone) — Whole-branch review applied at task end (single feature, not multi-area; preflight N/A for feature branch).

## NEW 1/3 lesson candidates (awaiting 2 more observations each)

- `brief-stale-fact-claims-require-codebase-cross-check-before-action` (T4 D1 + D2: brief referenced `useTranslation` + `editorBundle` that don't exist in this codebase; resolved by using project's existing `t(locale, key)` helper)
- `click-handler-coverage-test-must-verify-real-action-invocation-not-just-button-presence` (T3 reviewer finding: scenario 4 extended with `vi.fn()` spy asserting `addContainer` invoked)
- `prettier-drift-in-orchestrator-authored-md-blocks-format-stage-unrelated-to-task-scope` (T2 D3 side-fix: `.prettierignore` excludes gitignored workflow artifacts)

## Related documents

- **Spec**: `docs/superpowers/specs/2026-07-13-multi-instance-tree-ui-design.md`
- **Plan**: `docs/superpowers/plans/2026-07-13-multi-instance-tree-ui-phase-p1.md`
- **Per-task reports**: `.superpowers/sdd/task-{1,2,3,4}-report.md`
- **Whole-branch review diff**: `.superpowers/sdd/review-8381982..22acf14.diff`
- **CHANGELOG**: top entry of `CHANGELOG.md`

## Future work (deferred per spec)

- **P2** (separate plan): row buttons (duplicate / sort / bulk-delete) + `ContextMenu` action union extension + `mutationSlice` actions
- **P3** (deferred until OEM ticket demonstrates N>15 pain): view-density auto-switching + virtual scroll for N>30

## Manual smoke test (recommended at install time)

1. Open a fixture with ≥2 `AFECellValidSet` instances (e.g. `C:/Users/13777/Desktop/ClaudeAutosarWorkSpace/111.au`)
2. Navigate to `JWQ3399ConfigSet`
3. Verify `AFECellValidSet` collection header renders with `×3` count
4. Verify `AFECellValidSet_1/_2/_3` are HIDDEN by default (collection collapsed)
5. Click chevron → 3 real siblings appear
6. Click `+ 1` → new `AFECellValidSet_4` instance created (via `addContainer` → `coreAddContainer` auto-suffix)
7. Navigate to `AFETempValidSet` (upper=1, already has 1 instance)
8. Verify `+ 1` button in header is DISABLED with tooltip "已达上限 — 无法继续添加"