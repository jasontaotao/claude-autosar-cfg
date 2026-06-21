# Changelog

All notable changes to **claude-AutosarCfg** are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/).
Versioning: [Semantic Versioning](https://semver.org/).

## [1.5.1] - 2026-06-21 — Foundation sprint + Sprint 17 follow-up

PATCH bump: **Foundation + 8 pre-Foundation commits** — pays down 4 tech-debt items, adds ARXML streaming + IndexedDB cache (feature-flagged default OFF per Q6 A), and ships the Sprint 17 P1+P2 BSWMD remove-from-disk flow + vendor-CDD module-root fallback. Closes the Sprint 14 #2 `applyMutation` follow-up. 12 commits since v1.5.0, 1692 tests pass + 1 skipped, 0 type errors, 0 lint errors, build success.

> **Why PATCH not MINOR?** The Foundation work itself has no user-visible features by default — `arxml-stream` and `preserveOrder` are feature-flagged OFF, and the `useArxmlStore` split is a pure refactor. The user-visible pieces (BSWMD remove dialog, vendor-CDD fallback) were already shipped to `main` between v1.5.0 and the Foundation start, and bundling them into 1.5.1 keeps the changelog and git history coherent (one tag, one release). If you'd rather split this into 1.5.1 (Foundation-only, MINOR-bump-quality) + 1.5.2 (Sprint 17 P1+P2 + vendor-CDD), revert the version bump and re-tag.

### Added (Foundation)

- **PR(1) — `isPathInside` hardening** (`3084370`): Extract the path-containment check from `src/main/ipc/register.ts:451` to `src/shared/paths/isPathInside.ts`. Hardens against path traversal (`..`), trailing slashes, Windows case-insensitivity, UNC paths, current-dir marker (`.`), double-slash normalization. 12 new unit tests. The deviation from the plan (using `node:path`'s `sep` instead of a hard-coded `/`) makes the implementation platform-correct on Windows.
- **PR(2) — `preserveOrder` source-aware serializer** (`d8f7dc5`): New `SerializeOptions.sourceArxml` parameter on the serializer. When provided, the output preserves source element order (the user hand-edits a file, re-saves, and the order doesn't shuffle). Index-alignment bug caught by `code-reviewer` HIGH (deletion case) and fixed via `Map<shortName, ArxmlPackage>` lookup. **Feature flag `experimental.preserveOrder` default OFF** per Q6 A — behavior is bit-for-bit identical to v1.5.0 when the flag is off.
- **PR(3) — `removeWithCascade` cascade-aware ref deletion** (`33cc250`): When a referenced container is removed, all inbound `REFERENCE-VALUES` are auto-dangled in a single BFS walk with cycle defense via a `visited` set keyed by full path. Returns `Result<{ removedPath, danglingRefs }, E>`. The `removeAtPath` behavior is unchanged; `removeWithCascade` is a strictly additive companion.
- **PR(4) — `applyMutation` real + atomic disk write** (`5b99ac3` + `9e762bb` + `fcd7aef`): Closes the Sprint 14 #2 follow-up. The Phase C stub at `src/renderer/store/useScriptStore.ts:288` is replaced with a real replayer that:
  1. Dispatches each `ScriptMutation` (`set-param` / `add-child` / `remove-child`) to the existing `useArxmlStore` actions (so the in-memory doc, dirty tracking, and validation pipeline stay in sync).
  2. Surfaces per-action failures (path-not-found, BSWMD missing, cascade dialog needed) in `runResult.errorMessage` instead of silent no-ops.
  3. Serializes the in-memory doc and persists via the `project:save` IPC channel (see T12-pre fix below).
  - **`writeAtomic` helper** at `src/main/ipc/projectSaveHandler.ts`: write-to-temp (`${file}.tmp-${pid}-${Date.now()}`) + `fh.sync()` + `fs.rename(tmp, file)`. Atomic on POSIX, near-atomic on Windows via `MoveFileEx` with `MOVEFILE_REPLACE_EXISTING`. On any error, best-effort `unlink(tmp)` keeps the original file untouched.
  - **T12-pre fix** (`fcd7aef`): The original T6 cross-process dynamic import of `writeAtomic` leaked `node:fs` / `node:path` into the renderer bundle, breaking the production build with `"promises" is not exported by "__vite-browser-external"`. Routed through `window.autosarApi.projectSave` (the existing IPC channel that the main-side handler already implements with `writeAtomic` internally) — same trust-sprint invariant, correct IPC boundary.
  - **Loose-mode guard**: refuses to persist when no project manifest is loaded; surfaces a clear error and leaves the in-memory mutation applied so the user can save manually.
- **PR(5) — `useArxmlStore` split** (`94666ff`): Pure refactor, 0 new tests required per Q4 D. **3446 lines → 16 files** (7 slices + 7 helpers): `slices/{mutation,bswmd,import,ecuc,ui,project,i18n}Slice.ts` + `helpers/{combinedDoc,bswmdLookup,projectSync,paramUpdate,mutationErrors,importHelpers,dirty}.ts`. Largest file 492 lines. All existing 1638 tests preserved (the test count is the fuse).
- **PR(6) — `arxml-stream` package** (`d03c4e6` + `9dd112d` + `828bed1`):
  - **Sub-A scaffolding** (`d03c4e6`): new `src/main/arxml-stream/` sub-path with public `index.ts`, `feature-flag.ts` reader (settings.json + in-process override), and `router.ts` (`routeArxmlReader` dispatcher). 13 new tests.
  - **Sub-B SAX reader** (`9dd112d`): `emitSaxEvents` `AsyncIterable<SaxEvent>` + `streamParse` public API. 8 new tests (equivalence with DOM, error path, perf). **See known limitation below — memory bounded-ness is NOT achieved.**
  - **Sub-C IndexedDB cache** (`828bed1`): `deriveCacheKey` (filePath + mtime + contentHash) + `cacheGet` / `cacheSet` with automatic invalidation. 18 new tests (invalidation 10 + store 8). Default OFF via `experimental.indexedDb`.

### Added (Pre-Foundation, 8 commits rolled into v1.5.1)

- **Sprint 17 P1 — BSWMD remove from disk** (`fc2bf75`): `BSWMD_DELETE` IPC + `useArxmlStore.removeBswmdFromDisk` + `undoLastRemoveBswmd` (8-step rollback flow).
- **Sprint 17 P2 — `RemoveModuleConfirmDialog`** (`2128e43`): 4-option dialog (cancel / only / cascade / cascade-and-unlink) + `removeBswmdWithFullFlow` hook.
- **Sprint 17d — `EnumEditor` reads BSWMD layer + vendor CDD fallback** (`fe521bb`): Retires `ECUC_SUBSET_SCHEMA` (46-entry hard-coded fixture fallback). New `lookupSchemaAcrossModuleRoots` + `resolveTargetPath` folding `/AUTOSAR_R<NN>/` and `/EAS/`.
- **Sprint 17d follow-up — wire vendor-CDD module-root fallback end-to-end** (`d296a6f`): `EnumEditor` + `useArxmlStore` + `validate.ts#checkContainerMultiplicity` all use the new helper.
- **T9 spec/plan docs** (`82a3629` + `d8f5fc7`): The v1.5.1 Foundation design + implementation plan.
- **T0 — format cleanup** (`35b1bd0`): 127 files / +8798/-4820 via `pnpm format` + 2 HTML mockup bug fixes (`docs/bswmd-to-ecuc-mockup.html` had a duplicate `</body></html>` tail; `docs/superpowers/specs/2026-06-18-script-engine-design-preview.html` had an over-closed `</div>`). These were the only 2 hard failures blocking `pnpm format:check` since v1.4.0.

### Fixed

- **T12-pre fix** (`fcd7aef`): Renderer→main IPC boundary violation. See PR(4) above. Discovered while running the pre-ship `pnpm verify` for v1.5.1 — without this fix, the production build was broken and the tag could not ship.

### Known limitations (called out for downstream)

- **`arxml-stream` memory bounded-ness is NOT achieved** (PR(6) Sub-B). The `streaming` flag currently yields a post-parse event surface for renderer progressive rendering, not parse-time memory savings. `streamParse` is a thin wrapper around `parseArxml` + `fromArxmlDocument` because `fast-xml-parser` 4.4.1 has no native SAX mode, and the plan's "no new top-level deps" constraint ruled out `sax` / `node-expat` / `htmlparser2`. The `emitSaxEvents` `AsyncIterable` API is preserved for v1.6.0+ renderer work; the v1.7.0 plan is to swap in a true SAX parser. Documented in `src/main/arxml-stream/streaming/sax-reader.ts:1-11` and `streaming/index.ts:13-16`.
- **`deriveCacheKey` (filePath + mtime + contentHash) has no router consumer yet.** The router currently uses an inline-content hash for cache keys (`contentHashOf(content)` in `router.ts:175`). File-path invalidation machinery is built and tested but unused — wire-up deferred to the headless CLI in v1.6.0.

### Test count

| Before                         | After                 | Delta                                                                                                                |
| ------------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1557 pass + 1 skipped (v1.5.0) | 1692 pass + 1 skipped | **+135 tests** (PR(1) 12 + PR(2) 6 + PR(3) 6 + PR(4) 12 + PR(5) 0 + PR(6) 39 + T9 round-trip 15 + pre-Foundation 45) |

### Coverage

- **96.31% stmts / 87.96% branches** (target ≥95.5% / ≥87%, both met — verified by the T9 acceptance gate).

### Build status

`pnpm verify` passes all 7 stages: `format` / `lint` / `type-check` / 1692 tests / `coverage` / `build` / `import-regression`.

## [1.5.0] - 2026-06-20 — Wire BSWMD picker + context menu + segment-aware coverage

MINOR bump: **把 Picker / 右键菜单接上 UI** — 修了 v1.4.0 之后一直藏着的三个 P0/P1 缺口。1557 tests pass (从 1511, +46), 0 type errors, 0 lint errors, build success。

### Added

- **App.tsx mount BswmdPickerRoot + ContextMenuRoot + handleContextMenuAction** (`d0f3ecf`)：之前 `App.tsx` 完全没有 import 这两个 root 组件，store 里 `bswmdPicker` / context menu state 翻成 `open=true` 也没人渲染。修复后右击 tree 节点 → 弹菜单 → 点 Add parameter → 弹 picker → 选 → 写盘，端到端通。`handleContextMenuAction` exhaustively switch 5 种 `ContextMenuAction`（add-container / add-parameter / add-reference → `openBswmdPicker`；delete-container → `removeContainer`；delete-reference → `setInfo` toast，因为 store 还没 `removeReference` action，诚实地告诉用户这个 backlog 项）。
- **LeftPanel 接 onContextMenu prop + Tree/TreeNode 3-arg onContextMenu** (`d0f3ecf`)：Tree 节点右键捕获的 `MouseEvent` 完整传到 App.tsx，让 host 能用 `clientX/clientY` 弹菜单位置。

### Fixed

- **P0-1 — ProjectPanel chip 永远 0/0、+ 按钮永远 disabled** (`4ba5ec4`)：`ProjectPanel.tsx:265` 用 `bswmdPathsInStore.indexOf(bswmdPath)` 但 `manifest.bswmdPaths`（相对 forward-slash 如 `bswmd/JWQ3399.arxml`）跟 `state.bswmdPaths`（绝对 backslash 如 `C:\Users\...\bswmd\JWQ3399.arxml`）形态不一致，indexOf 永不命中。修复：`shared/path.ts` 新增 `bswmdKeyFor` helper（小写 + `\`→`/` + 取最后 2 段），`ProjectPanel` + `ModuleFromBswmdPicker` 用 `useMemo` 派生 `bswmdKeyToSchema: Map<key, BswmdDocument>`，O(1) 查询。
- **P0-2 — openProject 静默丢弃 IPC `bswmds` 字段** (`4ba5ec4`)：main 进程 `project:open` 返回 `{ manifest, docs, bswmds: [{rel, path, content}] }`，renderer `useArxmlStore.openProject({ manifestPath, manifest, docs })` 签名没 `bswmds` 字段，IPC 数据被 TypeScript 静默丢弃。修复：扩 `openProject` 签名为 optional `bswmds`，循环 `parseBswmd` push 到 `bswmdSchemas` / `bswmdPaths`（用 `entry.path` 绝对路径，跟 dialog 加的形态一致），`useProjectActions.openProjectFromDialog` 转发 `result.bswmds` 给 store action。**重新打开 project 后 schema 真的进 store**。
- **P1 — `isModuleCoveredByBswmd` segments[0] 错位** (`d0f3ecf`)：注释假设 `path = '/<module>/...'` 但 value-side 路径是 `/<AR-PACKAGE>/<MODULE>/<CONTAINER>/...`。当前 user 测试集碰巧 AR-PACKAGE 跟 module 同名 (`JWQ3399`)，但 vendor 工具普遍用 `JWQ_CDD_PACK` 这种 package 名 — 那个 case 下 add items 全 disabled。修复：inlined `stripCombinedPrefix` + `lastPathSegment` 跟 `useArxmlStore.ts` 那份 byte-for-byte 对齐，从 path 末尾往前 walk 找 module shortName；同时处理 combined mode 的 basename / `[doc:N]` 前缀。Backward-compat：原 caller 不传 `viewMode` 时仍走 single-mode + segment-walk。
- **MEDIUM-1 — ContextMenu z-index 撞车** (`d0f3ecf`)：ContextMenu.css 9995 跟 BswmdPickerDialog.css 9995 撞车，App.tsx 注释说 9998 跟实际不符。改 ContextMenu 9995→9994（sits below picker 9995 + cascade 9996 + confirm 9998），注释对齐现实。

### Test count

| Before                | After                 | Delta                                                               |
| --------------------- | --------------------- | ------------------------------------------------------------------- |
| 1511 pass + 1 skipped | 1557 pass + 1 skipped | +46 tests (X1 18 + X2 11 + X3 5 + v1.4.1 17 + inter-test dedupe -5) |

## [1.4.2] - 2026-06-20 — Project-load P0 patches

PATCH bump: **两个 P0 项目加载 bug** — chip 永远 0/0 + 重新打开 project 丢 BSWMD。1537 tests pass（基线），0 type errors，0 lint errors，build success。

### Fixed

- **P0-1 — ProjectPanel chip 永远 0/0、+ 按钮永远 disabled**：`ProjectPanel.tsx:265` 的 `indexOf` 跨 manifest / store 两种路径形态做严格字符串比较，命中概率为 0。`bswmdKeyFor` helper 双向 normalize 后做 O(1) Map 查询。
- **P0-2 — `openProject` 静默丢弃 IPC `bswmds`**：renderer 签名没 `bswmds` 字段，IPC 数据被 TypeScript 丢弃。扩 `openProject` 接收 + 循环 `parseBswmd` + 清旧 schema 防 cross-project leak。

详见 release-notes-v1.4.1.md（v1.4.1 + v1.4.2 合并叙述）。

## [1.4.1] - 2026-06-20 — 4-bug fix batch (BSWMD MCC + skeleton tag + 3-segment path)

PATCH bump: **真实 vendor fixture 触发的 4 个 P0 bug** — 来自用户 `JWQ3399_bswmd.arxml` + `JWQ3399_EcucValues.arxml` pair。1537 tests pass（基线），0 type errors，0 lint errors，build success。

### Fixed

- **Bug 1 — BSWMD `<MULTIPLICITY-CONFIG-CLASSES>` 解析器静默丢弃**：`bswmd.ts` 之前完全没读这个块。`ContainerDef` / `BswModuleDef` interface 加 `multiplicityConfigClasses?: readonly MultiplicityConfigClass[]` 字段 + `readMultiplicityConfigClasses()` helper。Picker dialog 用 `moduleDef.multiplicityConfigClasses ?? []` 兜底。
- **Bug 2a — skeleton 用错 tagName**：`skeleton.ts` `buildTopContainer` + `buildSubContainerShell` 之前 emit `<ECUC-CONFIGURATION-CONTAINER>`（schema-side），但 `addContainer` + serializer 写 `<ECUC-CONTAINER-VALUE>`（value-side）— 跟后续 write path 不一致。改用 `ECUC-CONTAINER-VALUE`。
- **Bug 2b — skeleton 为 `lower=0` 容器预建空 shell**：`buildSubContainerShell` 之前不管 `lowerMultiplicity` 都 emit 一个空 container，留下 ghost placeholder。改为只在 `lowerMultiplicity > 0` 时 emit shell，返回 `ArxmlContainer[]`（而不是单个）让顶层用 `flatMap` 收口。AUTOSAR 惯例：skeleton 预建 minimum 1 instance，剩下的用户用 picker 加。
- **Bug 2c — `findByPath` 只接 4-segment path**：用户 UI 发的是 compressed 3-segment `/JWQ3399/JWQ3399ConfigSet/...`（当 `pkg.shortName === module.shortName` 时省 module 段）。Core 层之前假设 canonical 4-segment `/JWQ3399/JWQ3399/JWQ3399ConfigSet/...`。用户明确说"无法实现4段" — UI 改不了，core 必须接住。修复：`findByPath` 加 3-segment fallback（iterate `pkg.elements` 找 module 短名匹配 + 子容器 shortName 匹配 `rest[0]`），提取共享 `walkFrom` helper。`locateParent`（mutation.ts）+ `locateParentElement`（BswmdPickerDialog.tsx）现在都委托 `findByPath`。

### Code review findings (APPROVE_WITH_MEDIUM, 0 C / 0 H / 2 M / 2 L)

- **MEDIUM 1**: 3-segment fallback 在 multiple modules in same pkg 时静默 first-wins。**Dormant in current fixtures; AUTOSAR convention puts each module in own pkg.**
- **MEDIUM 2**: `replaceElement` / `removeElement` 用 `kind + shortName` identity match，not pkg-scoped。Compounds M1。**Dormant.**
- **LOW 1**: `multiplicityConfigClasses` optional type vs `buildEbModule` 永远 emit `[]` 的 cosmetic 不一致。
- **LOW 2**: pre-existing `appendChild` 永远 replace parent identity even when no actual change。Not from this fix.

详见 release-notes-v1.4.1.md。

## [1.4.0] - 2026-06-20 — Trust Sprint (17a + 17b + 17c)

MINOR bump: **三个 trust-critical 修复** — round-trip 不再静默丢数据 / Dialog 全 i18n 化 / 写路径防 `..` 遍历。1511 tests pass (从 1493, +18), 0 type errors, 0 lint errors, build success。

### Fixed

- **P0-1 + P0-2 (Sprint 17c) — Round-trip 不再丢 vendor extensions**：`classifyElement` 对未识别 tag 返回 `ArxmlUnknown` 而不是 `null`；`renderElement` 通过 `{ [tagName]: parsed }` 原始 fast-xml-parser 节点 verbatim 发出。SERVICE-NEEDS / EXCLUSIVE-AREA / `/EAS/` namespace 等 vendor 扩展现在 round-trip 保留。新 fixture `vendor-extension.arxml` + 新测试覆盖。
- **P0-1 second-order drop (Sprint 17c) — 多 DEFINITION-REF 不再丢**：`renderModule` 修复了 `m.references[0]` 静默丢弃所有其他 `DEFINITION-REF` 的 bug。改为把所有 references 作为 top-level `<DEFINITION-REF>` siblings 发出（与 `parser.ts:500` 的 `asArray` 消费端契约匹配）。
- **H8 (Sprint 17b) — 写路径防 `..` parent-traversal**：新增 `path.normalize(p).includes('..')` 预检，覆盖 3 个写入口：PROJECT_SAVE（抽出为新 `projectSaveHandler.ts`） / saveArxmlHandler（per-doc write） / script-handler（manifest read/write）。关闭了 renderer 伪造 `../../etc/passwd` 的 CVE-shaped vector。

### Changed

- **H6 → P0 (Sprint 17a) — Dialog 全 i18n 化**：9 个硬编码 user-facing 字符串（zh-CN + en）替换为 `t(locale, key)`。7 个新 i18n keys (`prompt.*` 2, `app.import.diff.column.*` 3, `app.import.diff.referenceCount`, `confirm.unsaved.saveAndNew.import`)。`ImportEntry.tsx:64` 从 `window.confirm` 迁移到 app 自己的 3-state `confirm()`，与其他 dirty-guard 一致。`ConfirmRoot` 订阅 `useArxmlStore((s) => s.locale)`，切语言时 label 实时更新。

### Known limitations (deliberate, deferred to v1.5+)

- **Sibling order between known and unknown elements within a parent** is determined by model iteration order, not original source order. Full preservation requires `preserveOrder: true` (2-week refactor).
- **XML comments / CDATA / processing instructions** are still lost (parser config doesn't preserve them).
- **Full `isPathInside(manifestDir)` containment** is deferred because it would break the loose-mode back-compat contract at `register.ts:414-418` (users can open ARXMLs from anywhere and save back to the same path). The 17b fix closes the actual attack vector without changing UX.
- **Symlink bypass** — `path.normalize` doesn't resolve symlinks. A renderer that has write access to a symlink target can still write there. Tracked for v1.5+ as a follow-up.

### Out of scope (deferred with reason)

- **P0-3 file lock** — over-engineering for single-user desktop tool; EB tresos / Vector don't force locks either.
- **H1/H2/H4/H5/H7/H9/H10** — UX/architecture overhauls; defer to v1.5+.
- **M13 batch-write atomicity** — report was wrong; handler already uses `partial` discriminated union correctly.
- **All other MEDIUM and P1-P3** — defer to v1.5+.

### Test count

| Before                | After                 | Delta     |
| --------------------- | --------------------- | --------- |
| 1493 pass + 1 skipped | 1511 pass + 1 skipped | +18 tests |

## [1.3.0] - 2026-06-20 — Sprint 14 Script Engine

MINOR bump: **EB tresos 风格的 Script Engine** — 用户在 panel 内写
JavaScript，whitelisted ctx API 操作 ARXML project，validator / transformer /
report / free 4 种 kind 直接进入 ValidationPanel。21 commits, +184 tests
(1493 total).

### Added

- **Main core** (`14073ff` ~ `1aedd45`)：6 个新模块 —
  `types.ts` (ScriptEntry / ScriptLog / ScriptViolation / ScriptMutation 等
  5 个核心类型) / `errors.ts` (16 种 ScriptErrorKind 工厂 +
  `validateShortName` + RESERVED_SHORTNAMES 19 个保留字) /
  `import-resolver.ts` (DAG + cycle 检测 + depth-limit) / `ctx.ts`
  (whitelisted API surface — `project.findContainers` / `getContainer` /
  `validator.addViolation` / `log.*` / `utils.path`) / `transaction.ts`
  (WorkingCopy + commit/discard) / `vm-runner.ts` (`node:vm` 沙箱 + post-hoc
  timeout + user-line stack 捕获)。**零 react/electron import**。
- **5 个 IPC 通道** (`8227305` + `2ef9917` + `df47e23`)：
  `SCRIPT_LIST` / `SCRIPT_SAVE` / `SCRIPT_DELETE` / `SCRIPT_RUN` +
  `SCRIPT_PROGRESS` push channel。`script-handler.ts` (299 行) + preload
  bridge 5 wrappers。
- **25 个 i18n keys** (`55c55c8`)：zh-CN + en 双语，覆盖 panel / library /
  editor / output / violation / error 全部 scope。Parity 测试保证双语 key 集合
  完全一致。
- **3 个 sample fixtures** (`adbe248`)：`pduid-uniqueness.js` (validator) /
  `wdgif-defaults.js` (transformer) / `utils/path.js` (shared helper)。`node
--check` 全过。
- **Renderer** (`d0286bc` ~ `45e3d7c`)：
  - `useScriptStore` (Zustand singleton) + `useScriptActions` (IPC bridge)
  - `ScriptEditor` with **CodeMirror 6** (`@codemirror/state` +
    `lang-javascript` + `theme-one-dark` + `view`)
  - `ScriptLibrary` + `ScriptOutput` + `ScriptKindBadge`
  - `ScriptPanel` 3-column host (library / editor / output) + App/AppHeader
    Scripts toggle
  - `ValidationPanel` Script 校验 group（validator-kind 脚本的 latest run
    violations 单独列出）
- **T16 PduId validation E2E** (`569e710`)：
  `tests/e2e-vitest/script-pduid-validation.test.ts` — 5 个真实 fixture
  (Com_Com / Det_Det / EcuC_EcuC / PduR_PduR / WdgIf_WdgIf) 跑过完整 pipeline
  - 1 个 duplicate-injection case（`setParamInDocument` 强制 2 个 ComTxIPdu
    共享 id=42 → 验证 `script:pduid-duplicate` violation 触发）。
- **T17 Playwright E2E happy path** (`e071dfb`)：
  `tests/e2e/script-panel.spec.ts` — Scripts toggle → 选 fixture →
  editor 填充 → Run → output 渲染 logs + status='ok'。

### Changed

- **`vite.main.config.ts`** (`a9fad9d`)：`rollupOptions.external` 扩
  `node:vm` + `node:crypto`，Phase A import 的 Node-only 模块不再被 Vite
  错误内联到 main bundle。
- **`core/project/manifest.ts`** (`14073ff`)：additive
  `scripts?: ScriptEntry[]` + 兼容 normalization / migration path。

### Internal

- **Phase A lint polish** (`d947e53`)：post-pass cleanup — import order +
  `exactOptionalPropertyTypes` 兼容 + 删除 ctx.ts duplicated `walk`。
- **vitest include**：`tests/e2e-vitest/__tests__/**` 已纳入现有 include
  pattern（与 `tests/e2e/**` 互斥）。

### Verified

- 5/5 baseline gate green：format / lint 0 warnings / type-check / test
  (1493 passing / 1 skipped) / build (renderer 779KB / main 146KB /
  preload 2KB)
- T16 E2E：6/6 通过（5 fixture happy path + 1 duplicate injection）
- T17 E2E：spec file 通过 lint + type-check（Playwright 需 display server，
  CI 用 packaged Electron build 跑）
- Final self-review: 0 CRITICAL / 0 HIGH / 14 LOW（全部记录为已知设计 gap
  或 Sprint 15+ follow-up）

### Out of Scope (deferred to Sprint 15+)

- 真实 ES module import（`_import` 当前是 stub）
- `ScriptPanel.handleNew` proper dialog（当前是 stub saveScript）
- `onCommitMutation` mutation replay pipeline 接通到 arxml store
- ValidationPanel Script 校验 group 点击跳转
- Code-split ScriptPanel 子树（lazy `import()` for CodeMirror 6）
- TypeScript-in-script 模式
- Multi-script run + 依赖图可视化

## [1.2.0] - 2026-06-19 — Sprint 14 ECUC ARXML Import

MINOR bump: **EB tresos 风格 "Resolve Conflicts" wizard** — 多份 ECUC
ARXML 按 module 维度聚合导入，支持撞名 diff 表 + atomic commit + 单步撤销。
17 commits + 1 review-fix, +103 tests (1309 total).

### Added

- **`core/import/` 新模块** (`506aad0` + `31cb402` + `505fc8a` + `e266cb3`)：
  4 个纯 TS 模块 — `types.ts` (4/8/4 kinds unions + 18 类型) / `diff.ts`
  (`buildModuleDiff`) / `merge.ts` (`buildMergedView`) / `patch.ts`
  (`compileResolutionToPatches` + `applyPatchesToDocument`)。**零
  react/electron/zustand/fs 依赖**。
- **8 个 store actions** (`546b5ab` + `e9740f8` + `e3417a5` + `098ebbd`)：
  `startImport` / `selectModule` / `resolveModule` / `openDiff` / `closeDiff`
  / `commitImport` / `cancelImport` / `undoLastCommit`。
- **viewMode 三态扩展** (`546b5ab` + `8afe110`)：`'single' | 'combined'
| 'import-merged'`，互斥 guard 防止误切到 combined / 误触发 save。
- **`ImportSession` state slice** (`546b5ab`)：`importSession` /
  `lastCommitSnapshot` 字段；`isDirty()` 扩为
  `dirtyPaths.size > 0 || importSession !== null`。
- **`commitImport` 原子性** (`e3417a5`)：snapshot sourceFilesTouched →
  immutable apply → 任一失败 catch + rollback (importSession 保留) → 全部
  成功才 `set()`。`undoLastCommit` 用 snapshot 还原。
- **3 个 React UI 组件** (`31c7c78` + `e31ae68` + `d42821b`)：
  - `ImportEntry` (FileListTab `[Import…]` 入口 + multi-select dialog)
  - `ModuleSelectionPanel` (按 module 列出 + 撞名 badge + Commit 按钮)
  - `DiffTable` (三栏 existing/incoming/决策 radio + lazy diff + 嵌套展开
    - param 高亮)
- **18 个 i18n keys** (`7d49e5a`)：zh-CN + en 双语，从 `app.import.button`
  到 `app.import.undoLastCommit`。Parity 测试保证双语 key 集合完全一致。
- **8 kind `ImportError` union** (`506aad0`)：`read-failed` / `parse-failed`
  / `diff-failed` / `patch-apply-failed` / `multiplicity-exceeded` /
  `no-modules-selected` / `view-mode-locked` / `mixed-versions` + 类型守卫。
- **4 kind `ImportPatchOp` union** (`506aad0`)：`add-module` /
  `merge-into-module` / `overwrite-module` / `rename-incoming`。
- **Playwright E2E** (`41941f0`)：`tests/e2e/import-flow.spec.ts` —
  happy path (FileListTab → ImportEntry → ModuleSelection → DiffTable →
  commit → ConfirmDialog → 验证 dirtyPaths + viewMode 复位) + abort path
  (中途 cancel 不污染 store)。
- **verify stage 7 import regression** (`ae7d72b`)：
  `tests/regression/import-round-trip.test.ts` — 加载 2 fixtures → 模拟
  startImport → compile patches → apply → serialize → parse → 验证
  byte-identical。
- **internal undoStack** (`e9740f8`)：`ImportSession` 内嵌 ≤20 步
  `ImportSessionSnapshot[]`，仅 commit 前有效；cancel 清空。

### Changed

- **`useArxmlStore.ts`** (`546b5ab` ~ `8afe110`)：扩 3 state 字段 + 8
  actions；`computeDisplayDoc` 增加 `'import-merged'` 分支（复用
  `wrapPackageUnderSegment` 思路，segment 名 `[import:N]`）。
- **`App.tsx`** (`8afe110`)：viewMode 三态路由 — `import-merged` 时挂载
  ModuleSelectionPanel / DiffTable，隐藏 Save / Combined 入口；param editor
  仍可用但仅在内存态。
- **`FileListTab.tsx`** (`31c7c78`)：加 `[Import…]` 按钮（与 Combined
  入口互斥，dirty 时走现有 unsaved 保护）。
- **`scripts/verify.mjs`** (`ae7d72b`)：加 stage 7 import regression
  guard。

### Internal

- **Phase 1+2 cleanup** (`f9c5ce8`)：lint + type-check post-pass — drop
  unused imports / 替换 fixture / 重命名 unused arg。
- **Review MEDIUM-1 fix** (`0291817`)：删除 `patch.ts:143-152` 的 dead
  `'overwrite-module'` 分支（`ImportResolution` 不含此字面量，if-block
  永远 false）。

### Verified

- 5/5 baseline gate green：format / lint 0 warnings / type-check / test
  (1309 passing / 1 skipped) / build (renderer 391KB / main 126KB /
  preload 1.6KB)
- verify.mjs stage 7 import regression：byte-identical round-trip
- Final code review: 0 CRITICAL / 0 HIGH / 1 MEDIUM (fixed) / 2 LOW
  (deferred)
- 8/8 design invariants PASS: 0 new IPC channel / 0 modification of
  `core/arxml/*` / `shared/project.ts` / 0 forbidden imports in
  `core/import/` / exact 8/4 kind unions / `commitImport` atomicity /
  `isDirty` covers `importSession`
- 12/12 acceptance gates PASS（spec §11）

### Out of Scope (deferred to Sprint 15+)

- 删除 target 中 existing module（破坏性操作）
- 修改 / 重写 reference dest
- 跨项目导入
- 流式大文件 diff
- BSWMD 自动加载
- 删除 / rename target module
- 实时多人协作
- Review 2 LOWs：add-module silent no-op edge case / SelectionRow
  cosmetic locale read
- GH release 自动创建（gh CLI 未安装）

## [1.1.2] - 2026-06-19 — Sprint 17 Polish Batch

10 follow-up polish items from Sprint 16 ship. Zero breaking change.

### Changed

- **T1 path** (`3c6d0b6`)：`toManifestRelative` 现在拒绝含 `..` 段的相对
  输入，防止 manifest 持久化时被注入 parent-traversal 路径。
- **T3 ui** (`6bfff66`)：Save All 按钮在任意 doc dirty 时加 amber
  `.is-dirty` 视觉提示（`--accent-amber` CSS 变量）。
- **T6 ui** (`c2b2628`)：ErrorBanner 支持 4 种 kind（error / warning /
  info / success），各带独立色 + auto-dismiss timer（error 不自动消失）。
- **T7 save** (`50adda4`)：`SaveArxmlError` 引入 typed kind discriminator，
  把 NodeJS errno code（EACCES / ENOSPC / ENOENT 等）映射到 6 种
  kind；renderer dispatch 本地化 toast。
- **T8 store** (`912cc7f`)：`resolveContainerTarget(state, containerPath)`
  helper 取代 7 处重复 `findByPathMultiDoc` inline block，零行为变化。
- **T9 picker** (`82ca016`)：BSWMD picker 在 doc set 变化时 re-resolve，
  修复 stale-seed bug（picker 开着时其他路径加载/移除文档）。
- **T10 tree** (`32c621b`)：`buildCombinedDocument` 对 identical root
  package（典型 EAS）静默去重；对 shortName 同但内容不同的 root 保留
  第一个 + emit `duplicate-root-conflict` warning。

### Added

- **T4 i18n** (`a314c35` 的一部分)：zh-CN 补 `app.saveAllPartial` 翻译。
- **T6 ui**：`setInfo` / `setSuccess` / `setWarning` / `dismissToast` store
  actions；3 个新 aria-label（warningAria / infoAria / successAria）。
- **T7 save**：`app.save.error.*` 6 个 kind 键（en-US + zh-CN 双语）。

### Internal

- **T2 audit**：确认 `ConfirmDialog` / `CascadeConfirmDialog` 的
  `'continue'` 分支是合法 cancel 路径（return `{ kind: 'canceled' }`），
  无 dead code，无需 commit。
- **T5 lint** (`bbcb693`)：清理 saveArxmlHandler 历史 ESLint warning +
  4 个 pre-existing TypeScript error。

### Tests

- **1206 tests passing**（v1.1.1 → v1.1.2 净增 +28，覆盖 10 个 polish task）
- Coverage: ≥ v1.1.1 baseline (90.72% branches / 96.8% stmts)
- 5/5 baseline: format / lint (0 warnings) / type-check / test / build
- 76 files changed, +7352 / -1895 lines

### Notes

- **首次 package.json 实际 bump**：v1.1.0 / v1.1.1 tag 创建时未同步 bump
  `package.json`（停留在 `1.0.0`）；v1.1.2 是首次让 `package.json` 与 tag
  对齐的 release。

## [1.1.1] - 2026-06-19 — Sprint 16 Fixes Batch

Sprint 16 (16a + 16b + 16c) 集中修复 v1.1.0 ship 后发现 / 回归的 5 个关键
issue，重点在 DEFINITION-REF 链路 end-to-end 一致 + manifest 路径迁移 +
save/delete race。

### Added (Sprint 16)

- **Save All 按钮** (`5534cce`)：multi-ECUC dirty session 一键 save，每个
  文件独立的 partial-failure UI。
- **PICKER exclude + dirty-guard** (`a227220`)：picker 选择新文件时排除
  当前 dirty 文件；save failure 提示用户。
- **Sprint 16c #4 回归捕获** (`f7b69a3`)：controller 用 dedicated
  reload-then-save 测试抓到 parser 剥 `definitionRef` 的 silent regression。

### Changed (Sprint 16)

- **DEFINITION-REF 链路 end-to-end 一致**：parser (`f7b69a3`) /
  addParameter (`4453d46`) / addReference (`4453d46`) / serializer /
  skeleton 五层都 stamp `definitionRef`，reload 后再 save 不丢失。
- **v1.1.0 → v1.1.1 manifest 路径迁移透明** (`8fe1d28`)：`loadManifest(json, manifestDir?)`
  - `migrateManifestPaths` 接受老 v1.1.0 absolute-path manifest，不需要用户
    手动迁移。
- **Save-then-delete race 修复** (`dc92982`)：`removeEcucFiles` 在第一个
  save 失败时 `BREAK`，失败的 target 不再被 delete 掉（**数据丢失修复**）。
- **Combined Tree View smart basename wrapper skip** (`ad57e6a`)：避免
  重复嵌套同名 wrapper。
- **Silent save-back when currentPath known** (`8ac5243`)：save dialog
  在 currentPath 已知时静默回写，不再弹窗。
- **DEFINITION-REF 真路径写入** (`b767ea6`)：arxml 写出时把真实 BSWMD
  路径写到 `<DEFINITION-REF>` 而非占位符。
- **`<Module>_EcucValues.arxml` 命名规范** (`8858c9f`)：取代
  `<Module>_Cfg.arxml`，与 AUTOSAR 工具链约定一致。
- **manifest 路径持久化前 relativize** (`edaff98`)：确保 manifest 跨机器
  可移植。

### Tests (Sprint 16)

- **1178 tests** passing across 93 test files (1 skipped)
- **0 type errors** / **0 lint errors**
- **+149 tests** since v1.1.0 (1029 → 1178)
- 14 commits / 40 files / +3797 / -245

### Files (Sprint 16)

- `package.json` version: `1.1.0` → **`1.1.1`** (PATCH)
- New IPC contract additions (all additive, backward compatible):
  - `removeEcucFiles` accepts `phase: 'save' | 'delete'` discriminator
  - `loadManifest(json, manifestDir?)` adds optional `manifestDir`
  - `ParamValue` / `ReferenceValue` gain optional `definitionRef?` field

### Follow-ups (tracked for v1.1.2)

- `toManifestRelative` already-relative 透传不 reject `..`
- `saveArxmlHandler` collapse 所有 write error 成单一 kind
- T5 confirm dialog dead `'continue'` branch
- T5 picker stale-seed when documents change externally
- T7 CSS `.app-btn-save-all.is-dirty` visual cue
- T7 zh-CN coverage for `app.saveAllPartial`
- `info` / `notice` channel for success toasts (currently red ErrorBanner)
- Cross-task: consolidate "find doc by filePath" into single store selector
- `buildCombinedDocument` flat-mode duplicate root packages

---

## [1.1.0] - 2026-06-18 — Sprint 14 BSWMD-to-ECUC

Sprint 14 落地 BSWMD schema-side → ECUC value-side 模块选择的完整 workflow。
Spec approved (commit `a29d4f2`)，14 task + 4 side commits ship 到 main。

### Added (Sprint 14)

- **Multi-pick BSWMD-to-ECUC** (`sprint-14-ecuc-from-bswmd`)：从已加载
  BSWMD 文件选择 1+ ECUC 模块定义生成对应 value-side ECUC 容器。
- **Reverse op support**：从已存在 ECUC 容器反向 trace 回 BSWMD 定义
  路径（multi-pick scenario）。
- **CascadeConfirmDialog 复用**：和 Sprint 15 共享 cascade 确认组件。

### Changed (Sprint 14)

- **Q6 duplicate definition diagnostics** (`5b86510` on
  `feature/post-v1.0.0-wip`)：BSWMD 重复定义时给精准诊断信息。
- **Q1 resizable left/right columns** (`a8f78ee`)：workspace 列宽可拖拽。
- **Q2 two-segment grouping + dark-mode color fixes** (`45a225a`)：
  editor 双段分组。
- **Q5 project tab split + Q2-3 loose mode hint** (`09db4b9`)：project
  tab 拆分。

### Tests (Sprint 14)

- **1076 tests** passing across 89 test files
- **96.8% statements / 89.7% branches / 100% functions** (post-Sprint 14)
- **89 files changed**

### Files (Sprint 14)

- `package.json` version: `1.0.0` → **`1.1.0`** (MINOR — feature add)
- Spec: `docs/superpowers/specs/2026-06-18-bswmd-to-ecuc-design.md`
- Plan: `docs/superpowers/plans/2026-06-18-ecuc-from-bswmd.md`
- HTML mockup: `docs/bswmd-to-ecuc-mockup.html`

### Known issues at v1.1.0 (resolved in v1.1.1)

- Manifest 持久化路径在 cross-machine 不可移植（v1.1.1 `8fe1d28` 修复）
- addParameter 不 stamp `definitionRef` 导致 reload 后丢失（T3 合约缺口；
  v1.1.1 `4453d46` 修复）
- removeEcuc save 失败后仍继续 delete（数据丢失；v1.1.1 `dc92982` 修复）
- Parser reload 时剥 `definitionRef`（v1.1.1 `f7b69a3` 修复）

---

## [1.0.0] - 2026-06-17 — Release Ready (Wave 4: coverage ≥90% + version bump)

The first **release-ready major** for claude-AutosarCfg. All Wave 1–3 work
(Left-panel, Phase 1 cleanup, Stage 4 i18n, validators, TemplateCard picker,
BSWMD chip multi-select, Combined Tree View) is shipped and verified. Branch
coverage has been pushed from 85.45% to **90.72%** (≥ 90% ship-gate met).

### Added (Wave 4)

- **Branch coverage ≥ 90% ship gate** (commit `TBD`):
  - Branches: 85.45% → **90.72%** (+5.27 pp)
  - Statements: 96.47% → 97.52% (+1.05 pp)
  - Functions: 100% (parity)
  - Tests: 678 → **876** (+198 cumulative since v0.13.0)
  - New test file: `src/shared/__tests__/path.test.ts` (7 tests)
  - Coverage closes: path.ts branches, serializer option flags, parser
    defensive structure checks, runtimeSchema choices/maxLength mapping,
    validate.ts walkReference layer-aware paths, manifest non-string path
    entries, bswmd AR-PACKAGES missing branch.

### Changed

- `package.json` version: `0.16.1` → **`1.0.0`** (MAJOR — release-ready)
- No behavioral changes from v0.16.1. This release pins the cumulative
  Sprint 12 / Sprint 13 / Wave 1-3 surface as the v1.0.0 contract.

### Tests

- **876 tests** (1 skipped; parity with v0.16.1 baseline + Wave 4 additions)
- **Coverage**: **97.52% stmts / 90.72% branches / 100% funcs / 97.52% lines**
- **5/5 baseline**: format + lint + type-check + test + build all green
- **Signed-guard**: 830 cross-ref baseline preserved [700, 850]

### Cumulative work since v0.1.0 (release notes summary)

| Stage               | Highlights                                                               |
| ------------------- | ------------------------------------------------------------------------ |
| Sprint 0-9          | Core parser, validator, BSWMD, 5-fixture cross-ref baseline (782 signed) |
| Sprint 10-11        | Renderer store, NewProjectDialog, save/load, IPC handlers                |
| Sprint 12 #1        | Namespace-aware path normalize (Sprint 9 #12)                            |
| Sprint 12 #2        | Runtime BSWMD schema layer + schema-unknown disambiguator                |
| Sprint 12 #3        | NewProjectDialog unification, dirty-switch confirm, ipc contract         |
| Sprint 13 #1        | Templates backend (`templates:list` / `templates:copy` IPC, 25 tests)    |
| Sprint 13 Stage 3   | Left-panel + FileListTab refactor                                        |
| Sprint 13 Stage 3.3 | TemplateCard picker (Empty/Classic/Clone)                                |
| Sprint 13 Stage 3.4 | BSWMD chip multi-select (Classic template)                               |
| Sprint 13 Stage 3.5 | Combined Tree View across multiple loaded documents                      |
| Sprint 13 Stage 4   | i18n polish M6/M7/M8 (column header / OS dialog / parse error)           |
| Sprint 13 Stage 5.D | Validators: size cap + default-value + CHOICES depth                     |
| Wave 4.B            | Coverage ≥90% (this release)                                             |

### Verification

```text
=== Stage: format ===      PASS (prettier --check clean)
=== Stage: lint ===        PASS (eslint --max-warnings 0 clean)
=== Stage: type-check ===  PASS (tsc --noEmit both projects clean)
=== Stage: test ===        PASS (876 passed | 1 skipped)
=== Stage: coverage ===    PASS (90.72% branches, 97.52% stmts)
=== Stage: build ===       PASS (vite build renderer + main + preload)
```

---

## [0.16.1] - 2026-06-17 — Wave 3 (Sprint 13 #2 Stage 3.4)

### Added

- **BSWMD chip multi-select in NewProjectDialog** (commit `c382a5d`)
  - Backend `templates:list` IPC now exposes `bswmdPaths: string[]` per builtin template (Stage 2 extension)
  - `src/renderer/components/BswmdChip.tsx` (47L) — single chip component (toggleable)
  - `src/renderer/components/BswmdChipRow.tsx` (76L) — multi-select row container
  - `src/renderer/components/BswmdChip.css` (78L) — Catppuccin Mocha styling
  - `BswmdChipRow` rendered below TemplateCardRow only on the **Classic** template path (Empty/Clone hidden)
  - Selected chips reset on dialog close + on template switch (covered by 2 explicit tests)
  - New i18n keys: `newProject.bswmdLabel` (选择 BSWMD 模块 / BSWMD Modules) + `newProject.bswmdHint` (多选/支持取消勾选) + `newProject.noBswmd` (Classic 模板下无可用 BSWMD)
  - 7 new BswmdChipRow tests + backend IPC test extensions

### Changed

- `NewProjectDialogProps.onSubmit` signature: `(name, dir)` → `(name, dir, opts?: { bswmdPaths?: readonly string[] })`
  - Backward-compatible: opts is optional; existing callers pass 2 args
  - `useProjectActions.submitNewProject` reads `opts.bswmdPaths` and threads through to `projectNew` IPC as `bswmdPaths?: string[]` field
  - IPC contract: `ProjectNewRequest.bswmdPaths?: string[]` added (also optional, backward-compatible)
- `TemplateCardRow` lifted from owned-fetch to controlled component (parent NewProjectDialog now passes `bswmdPaths` array; old IPC fetch path retained as a fallback for tests)

### Behavior

- Selecting BSWMD chips in NewProjectDialog → `manifest.bswmdPaths` populated on creation
- Stage 3.4 **does NOT copy BSWMD files into project dir** (only writes the manifest pointers); copy is deferred to a future stage (Agent G follow-up note)
- Production `samples/` currently has only `arxml/`; no `classic/bswmd/` shipped. The IPC stub returns `bswmdPaths: ['/samples/classic/bswmd/Can.arxml']` from test fixtures. Stage 2 plan Task 11 (extraResources) handles this when real samples land.

### Tests

- **809 → 830 tests (+21)**:
  - BswmdChipRow: 7 cases (empty / single / multi / select/deselect / reset on template switch / reset on dialog close)
  - Backend templates IPC: +1 case for `bswmdPaths` exposure
  - NewProjectDialog integration: +5 cases (chip behavior on each template path)
  - useProjectActions.submitNewProject: +8 cases (bswmdPaths threading)
- **Coverage**: 96.65% stmts / 86.55% branches / 100% funcs (parity with v0.16.0)
- **5/5 baseline**: verify all green; cross-ref 830 signed-guard [700, 850] PASS

### Code review

- **WARN**: code-reviewer agent invocation was interrupted during this stage (auto-mode classifier transient block). Agent G performed self-review:
  - IPC contract backward-compatible (new optional field on both ends)
  - State-reset semantics verified (close + template switch both reset selectedBswmdPaths)
  - `isTemplateAvailable('classic')` flipped to true (was false in Stage 3.3); existing tests updated
  - No CRITICAL or HIGH issues identified
  - **Deferred to follow-up stage**: BSWMD file copy into project dir on project:new (currently only manifest pointers are written)

## [0.16.0] - 2026-06-17 — Wave 2 (Sprint 13 #2 Stage 3.3 + Stage 3.5)

### Added

- **TemplateCard picker UI** (Stage 3.3, commit `0c20e9c`)
  - `src/renderer/components/templates.ts` (52L) — template display helpers
  - `src/renderer/components/TemplateCard.tsx` (93L) + `TemplateCard.css` (91L) — single card component
  - `src/renderer/components/TemplateCardRow.tsx` (133L) — 3-card row container
  - NewProjectDialog body now embeds a TemplateCardRow (Empty / Classic / Clone)
  - Only Empty card is actionable; Classic/Clone render "coming soon" badge
  - 2 new i18n keys: `template.comingSoon` (zh-CN: 即将推出 / en: Coming Soon) + `newProject.templateLabel` (zh-CN: 选择模板 / en: Choose a template)
  - Card selection is visual only at this stage; submission still flows through `onSubmit(name, dir)`. Stage 3.4 will widen `onSubmit` to take `(name, dir, templateId)`
- **Combined Tree View** (Stage 3.5, commit `b16a2a9`) — user approved 2026-06-17
  - **Phase 1**: `buildCombinedDocument` + `findByPathMultiDoc` in `src/core/arxml/multiDoc.ts` (new)
  - **Phase 2**: `viewMode: 'single' | 'combined'` + `displayDoc` derived state in `useArxmlStore`
  - **Phase 3**: Tree component uses `displayDoc` instead of `doc`
  - **Phase 4**: FileListTab 顶部 `[Combined]` 虚拟条目 (4 new i18n keys: `fileList.combinedView`, `fileList.combinedViewAria`, `arxmlPanel.combinedDocs`, `arxmlPanel.combinedView`)
  - **Phase 5**: ParamEditor combined 模式路径解析 (uses `findByPathMultiDoc`)
  - **Phase 6**: 聚合统计 + dirty 标记 in combined mode
  - **Phase 7**: extend existing tests + add 6 new

### Changed

- NewProjectDialog body: now includes TemplateCardRow below the dir/browse row; visual restructure to fit cards gracefully
- useArxmlStore: added `viewMode` field + `setViewMode` action; added `displayDoc` selector (returns either `doc` or `combinedDoc` based on viewMode)
- FileListTab: top-level "Combined" virtual entry when viewMode = 'combined' shows aggregated count badge

### Behavior

- Combined mode is a view-only addition: no project save format change, no IPC contract change, no schema change
- Empty / Classic / Clone cards in NewProjectDialog: Empty flows through to existing `onSubmit` path unchanged; Classic/Clone disabled with "coming soon"

### Tests

- **746 → 809 tests (+63)**:
  - Stage 3.3: 13 templates + 13 TemplateCard + 8 TemplateCardRow + 5 integration + 2 i18n + 22 from helpers bundled = 63
  - Stage 3.5: 6 new + extended coverage on Tree/ParamEditor
- **Coverage**: 96.64% stmts / 86.55% branches / 100% funcs (vs v0.15.0 baseline 96.58% / 86.68% / 100%; +0.06% stmts, -0.13% branches, parity funcs)
- **5/5 baseline**: cross-ref 809 signed-guard [700, 850] PASS; ref-dest 0 / ref-cycle 0 / schema-unknown 0

### Code review (per-agent)

- Stage 3.3: APPROVE (0/0/1/2) — MEDIUM: 4 Stage 3.5 keys (fileList.combinedView, etc.) accidentally shipped in 3.3 commit (working tree pre-applied); Agent F's 3.5 commit immediately followed and references them — net clean
- Stage 3.5: pending (Agent F not yet returned at time of release; main loop will review on Agent F notification)

## [0.15.0] - 2026-06-17 — Wave 1 (Sprint 13 #2 + Stage 4 + 5.D)

### Added

- **Left-panel tab refactor** (Sprint 13 #2 Stage 3.1, commit `142c968`)
  - `App.tsx` mounts single `<LeftPanel />` instance; old stacked layout (ProjectPanelInfo / loose banner / Tree / ValidationPanel) removed
  - `LeftPanel` owns project / files / validate tab bar + always-visible Tree footer
  - Loose mode hides "project" tab automatically
  - 4 new App integration tests + 7 wiring tests
- **Stage 4 i18n polish M6/M7/M8** (commit `b924ccb`, with 8 keys shipped in `679ff25`)
  - **M6**: ParamEditor column headers localized — `editor.col.param` / `type` / `value` (zh-CN + en)
  - **M7**: OS pickDir dialog title localized — `dialog.pickDir.title` + `PickDirRequest.locale` IPC contract
  - **M8**: AppHeader `formatParseError` localized — `parserError.xmlMalformed` / `missingRoot` / `unsupportedVersion` / `invalidStructure`
  - i18n parity test 58 cases all green
- **Stage 5.D validators** (commit `ecb7385`)
  - **arxml:parse size cap**: 32 MiB on parse IPC, mirrors BSWMD_READ/BSWMD_PARSE pattern; extracted to `src/main/ipc/parseArxmlHandler.ts` (new)
  - **default-value cross enumerationLiterals**: warning (non-fatal) when `<DEFAULT-VALUE>` is not in the literal set; walks subContainers + choices recursively
  - **`<CHOICES>` recursion depth limit**: `MAX_CONTAINER_DEPTH = 64` fatal `invalid-structure`; XMLParser `maxNestedTags` bumped to 200 (two-layer defense)

### Changed

- **Phase 1 cleanup of Sprint 12 #3** (Stage 3.2, commit `679ff25`)
  - **`saveAndProceed` button real implementation**: `guardedDirtySwitch` accepts a `save` callback; `saveProject()` runs first, success proceeds, failure surfaces typed error
  - **`overwrite-confirm` IPC result → 2-button ConfirmDialog**: 覆盖/重命名 via i18n (`confirm.overwrite.{title,message,continueLabel,discardLabel}`); retry path uses `overwrite: true` flag
  - **`store.pendingAction` dead code removed**: `PendingAction` type + field + setter deleted; 5 hook call sites + 1 test import + 11 dialog tests removed
  - **per-action i18n for `confirm.unsaved.message`**: 12 new keys (4 actions × 3 messages: `message` / `discard` / `saveAndNew`); `SwitchingAction` + `toI18nAxis()` helper added

### Fixed

- `<CHOICES>` recursive parse: defense against pathological vendor file stack overflow (MAX_CONTAINER_DEPTH = 64)
- arxml:parse OOM risk: 32 MiB cap on parse IPC (was unbounded)

### Tests

- **703 → 746 tests (+43)**:
  - Stage 3.1: +11 (4 App + 7 wiring)
  - Stage 3.2: +18 (saveAndProceed + overwrite + per-action i18n)
  - Stage 4: +0 net (consumer code only; i18n keys shipped in 679ff25)
  - Stage 5.D: +14 (6 size cap + 4 default-value + 1 depth + 3 misc from parseArxml.test.ts)
- **Coverage**: 96.58% stmts / 86.68% branches / 100% funcs (within 0.2% of v0.14.0 baseline 96.78% / 87.01% / 100%)
- **5/5 baseline**: cross-ref 782 signed-guard [700, 850] preserved; ref-dest 0 / ref-cycle 0 / schema-unknown 0

### Code review (per-agent)

- Stage 3.1: APPROVE (0/0/1/1) — informational MEDIUM + LOW
- Stage 3.2: WARN (1/2/2) — HIGH scope creep (8 Stage 4 i18n keys physically in 679ff25; Agent C detected and shipped only consumer code in b924ccb; functionality split across two commits, accepted for Wave 1 coordination)
- Stage 5.D: APPROVE (0/0/0/3) — LOW cosmetic only
- Stage 4: APPROVE (0/0/0/0) — clean

## [0.14.0] - 2026-06-17 — Sprint 13 #1

### Added (backend only — no UI)

- **`src/main/templates/`** new module (7 files, 19 tests):
  - `discoverBuiltinTemplates(samplesRoot)` — opt-in scan of `<samplesRoot>/<id>/template.json` directories; warns + skips on parse / id-mismatch failures (one bad template never blocks discovery of the others)
  - `copyTemplateFilesToDir(template, samplesRoot, destDir)` — copy template files into a project directory, preserving `<templateId>/<relPath>` layout
  - `parseTemplateManifest(raw)` — hand-rolled type guard (no Zod, no new deps); validates `{ id: kebab-case, displayName, description }`
  - `walkArxml(root, opts)` — recursive `*.arxml` finder with `bswmd/` exclusion; skips hidden dirs
  - `classTemplateError(kind, message, details?)` — structured error envelope (7 kinds: 3 discovery + 4 IPC)
- **IPC channels**: `templates:list`, `templates:copy`
- **IPC types**: `TemplateListRequest/Response`, `TemplateCopyRequest/Response` in `src/shared/types.ts`
- **IPC handler**: `src/main/ipc/templatesHandler.ts` — `templatesListHandler` (returns summaries without leaking absolute paths), `templatesCopyHandler` (validates destDir + known template, then delegates to copy), `initBuiltinTemplatesCache()` (boot-time discovery, called from `app.whenReady` in `src/main/index.ts`), `resolveSamplesRoot()` (dev path: `app.getAppPath()/samples`; prod: `process.resourcesPath/samples`; returns null if neither exists)
- **Preload bridge**: `window.api.listTemplates()`, `window.api.copyTemplate(req)`
- **6 new i18n keys**: `template.empty/classic/clone.{displayName,description}` (zh-CN + en parity preserved)
- **`package.json` `build.extraResources`**: includes `samples/` in install bundles
- **`samples/arxml/.gitkeep`**: restored from stash as 5/5 baseline item
- **`samples/README.md`**: clarification note added — `bswmd/` (lowercase) is the convention for new templates; legacy `Bswmd/` (capital B) under `samples/arxml/<Module>/` is vendor sync data, silently ignored by the opt-in `template.json` gate

### Behavior

- Renderer (NewProjectDialog) is **unchanged** in this sprint. Sprint 13 #2 (Stage 3.3) will add the `TemplateCard` picker UI; the backend is ready and tested.
- The 100+ reference BSWMD under `samples/arxml/<Module>/Bswmd/` (capital B, legacy vendor sync) remain on disk and are silently ignored by `discoverBuiltinTemplates` (no `template.json` → opt-in skip).

### Tests

- **678 → 703 tests** (+25):
  - 5 `parseTemplateManifest` cases
  - 9 `discoverBuiltinTemplates` cases (using 6 fixture directories under `tests/fixtures/templates/samples-root/`)
  - 5 `copyTemplateFilesToDir` cases
  - 6 IPC handler cases (`templates:list` × 2, `templates:copy` × 4)
- **Coverage**: 96.78% stmts / 87.01% branches / 100% funcs (Sprint 12 #3 baseline 96.47% / 85.45% / 100% preserved; coverage **improved** by +0.31pp stmts / +1.56pp branches)
- **5/5 baseline guards**: all green; new item `samples/arxml/.gitkeep exists` added

## [0.13.0] - 2026-06-17

### Added

- NewProjectDialog 统一弹窗 (Sprint 12 #3):
  - 替换两步流程 (PromptDialog + OS saveDialog) 为单一自绘 dialog
  - Catppuccin Mocha 风格 (Variant A 视觉, 严格按 mockup)
  - 项目名 input + 实时验证 (空 / 非法字符 / >64 chars; validateProjectName 纯函数)
  - 目录 input + "浏览…" 按钮 (调 `project:pickDir` IPC) + 文件名实时 preview
  - Enter 创建 / Esc 取消 / 取消按钮
  - store-driven visibility (useArxmlStore.newProjectDialogOpen)
- ConfirmDialog 未保存保护组件 (Sprint 12 #3):
  - 3 按钮: 继续编辑 / 不保存新建 / 保存并新建
  - promise-based `confirm({ title, message, ... })` module-level API
  - Esc / backdrop click / × button = 'continue' (用户中断意图)
  - 复用 Phase 1 Task 5 dirty guard
- IPC channels (Sprint 12 #3):
  - `project:pickDir` (dialog.showOpenDialog openDirectory, defaultPath 可选)
  - `project:new` 扩展 (directory 字段, fs.access overwrite check, 'overwrite-confirm'/'write-failed'/'invalid-name' kinds)
- Store (Sprint 12 #3):
  - `isDirty(): boolean` function-on-state (永远不 drift out of sync)
  - `newProjectDialogOpen` / `confirmDialogOpen` / `pendingAction` discriminated union (4 kinds: newProject/openProject/addBswmd/removeBswmd) + setters
- useProjectActions 重写 (Sprint 12 #3):
  - `newProject()` 不再调 `prompt()` (PromptDialog 仍保留 for other use cases), 改为打开 NewProjectDialog
  - 新 `submitNewProject(name, dir)` 调 IPC + 处理所有 result kinds
  - `openProjectFromDialog` / `addBswmdFromDialog` / 新 `removeBswmdWithGuard` 加 dirty guard (ConfirmDialog)
  - **all switching actions** (newProject/openProject/addBswmd/removeBswmd) 触发 dirty 保护 (user 拍板)

### Changed

- `App.tsx` mount `<NewProjectDialog onSubmit={submitNewProject} />` + `<ConfirmRoot />` (z-index 9999/9998, 错开与 PromptHost 9997)
- `useProjectActions` 全面 dirty-protected (vs Sprint 12 #2 仅有 `addBswmd` 简化版)
- 重名检测 = 仅创建时 main handler `fs.access` check (race-free, 不再 client-side 实时检)

### i18n

- 17 new keys: `newProject.title` / `nameLabel` / `nameHint` / `dirLabel` / `dirHint` / `filenamePreview` / `browse` / `create` / `cancel` (9), `confirm.unsaved.title` / `message` / `continue` / `discard` / `saveAndNew` (5), `app.error.projectNameEmpty` / `projectNameInvalid` / `projectNameTooLong` (3)
- `confirm.unsaved.message` 用 `{name}` placeholder, 通用文案适用于 all switching actions (newProject/openProject/addBswmd/removeBswmd)

### Phase 1 Simplifications (deferred to Sprint 13)

- 'saveAndProceed' button in ConfirmDialog 暂不实现 (Phase 1 与 'continue' 都返回 canceled, 提示用户先手动保存)
- 'overwrite-confirm' IPC result Phase 1 简化为显示 error (不弹二次 confirm dialog)
- Phase 2 模板 (empty/classic/clone) 推迟到 Sprint 13 #1
- Phase 3 BSWMD 模块多选 chips 推迟到 Sprint 13 #2

### Tests

- 121 new tests (515 Sprint 12 #2 baseline + 121 = 636)
- Coverage: 96.42% lines / 85.45% branches (守住 80% floor)
- 5/5 baseline fixtures 0 violation (schemaLayer 行为不变)
- code-reviewer: APPROVE (0 critical / 0 high) (per Part A agent report)

## [0.12.0] - 2026-06-16 (Sprint 12 #2 - BSWMD renderer 集成)

### Added

- BSWMD schema-side 集成 (Sprint 12 #1 + #2 累计):
  - `parseBswmd` + `BswmdDocument` types (Sprint 12 #1)
  - `SchemaLayer` + `buildSchemaLayer(documents)` runtime schema layer
  - validator 集成: `validate(doc, layer?)` / `validateProject(documents, layer?)` 接受可选 `SchemaLayer`
  - **NEW** validation kind `'schema-unknown'`: emitted when a `SchemaLayer` is provided and a query path is in neither the layer nor the static `ECUC_SUBSET_SCHEMA` (gates on BSWMD-declared module)
  - store: `bswmdSchemas: BswmdDocument[]` + `bswmdPaths: string[]` state; `addBswmd(path, content)` 真实实现 (含 dedupe by path 拒绝); `removeBswmd(path)` 新 action
  - IPC: `bswmd:read` (file read, 8 MiB cap) + `bswmd:open` (file dialog)
  - ProjectPanel: BSWMD FileList "Load BSWMD..." 按钮 + list item remove 按钮 (OpenView only; LooseView 不渲染 BSWMD section)
  - useProjectActions: `addBswmdFromDialog()` 新 action, loose mode 直接拒绝
  - 端到端 smoke: 真实 BSWMD fixture (`Adc_bswmd.arxml` 81KB) 跑 enum 合法/非法 + schema-unknown 三个 case

### Changed

- `lookupSchema(paramPath)` / `lookupContainerSchema(containerPath)` 接受可选 `SchemaLayer` (向后兼容; `layer=undefined` 行为不变)
- App version string `0.11.0` → `0.12.0` (minor bump: feature release).

### i18n

- 6 new keys: `projectPanel.bswmd.add`, `projectPanel.bswmd.addAria`, `app.error.readBswmdFailed`, `app.error.parseBswmdFailed`, `app.error.duplicateBswmd`, `app.error.needProject`
- `projectPanel.bswmd.empty` 文案更新 (反映 Sprint 12 #2 "Load BSWMD" 按钮)

### Tests

- 87 new tests (428 Sprint 12 #1 baseline + 87 = 515)
- Coverage: 96.33% lines / 84.85% branches (目标 80% floor 守住)
- 5/5 baseline fixtures 0 violation

## [0.11.0] — 2026-06-16 (Sprint 12 #1 — BSWMD parser)

### Added

- **BSWMD parser** (`src/core/project/bswmd.ts`) — pure-TS, zero-dep schema-side parser. Recognises 2 dialects:
  - **EB tresos** `<BSW-MODULE-DESCRIPTION>` — SHORT-NAME + MODULE-ID + PROVIDED-ENTRYS (both wrapper-shape with `<SHORT-NAME>` + `<ENTRY-REF>`, and the real-data fallback where `<BSW-MODULE-ENTRY-REF>` sits inside the wrapper without a `<SHORT-NAME>` sibling — entry short-name is derived from the last path segment and a warning is recorded).
  - **AUTOSAR standard** `<ECUC-MODULE-DEF>` — full tree: CONTAINERS (ECUC-PARAM-CONF-CONTAINER-DEF + ECUC-CHOICE-ORIENTED-STRUCTURE-DEF) / SUB-CONTAINERS / PARAMETERS (integer / boolean / enumeration / float / string / **function-name**) / REFERENCES (ECUC-REFERENCE-DEF + ECUC-FOREIGN-REFERENCE-DEF) / MULTIPLICITY (number / 'infinite').
- 4 lookup helpers for Sprint 13 validation integration: `findModuleByPath` / `lookupContainerDef` / `lookupParamDef` / `lookupReferenceDef`.
- `BswmdError` discriminated union (4 kinds) mapped 1:1 to i18n keys.
- `ProvidedEntry.entryKind` field (`@_DEST` attribute value, typically `BSW-MODULE-ENTRY`) — lets the Sprint 13 editor distinguish entry kinds when rendering.
- IPC `bswmd:parse` channel — parse-only, file I/O stays in `project:open`. Renderer-side integration (`useArxmlStore.bswmdSchemas`) deferred to Sprint 13. **Size cap** of 8 MiB on incoming `content` (returns `xml-malformed` for larger payloads — prevents a tampered preload bridge from OOMing the main process).
- BSWMD fixtures: `tests/fixtures/bswmd/Can_Bswmd.arxml` (14KB EB tresos) + `Adc_bswmd.arxml` (80KB AUTOSAR standard), byte-identical copies of real user data. Round-trip test asserts dialect, moduleId, container / param structure, recursive totals (7 containers / 42 parameters / 8 references for Adc), and real-data `providedEntries` recovery.
- 4 new i18n keys (`bswmdParser.xmlMalformed` / `missingRoot` / `unsupportedVersion` / `invalidStructure`) for human-readable error messages; `projectPanel.bswmd.empty` updated to drop the "Phase 2 will add a button" stub.
- Numeric-format AUTOSAR namespaces accepted in `SUPPORTED_VERSIONS` (e.g. `00046` ≡ R4.6); regex already supported the shape, the supported set just didn't list it.

### Changed

- App version string `0.10.0` → `0.11.0` (minor bump: feature release).
- `vitest.config.ts` `include` glob now picks up `tests/**/__tests__/**/*.test.ts` so the new fixture-driven round-trip tests are discovered.
- `vitest setup` (`src/test/setup.ts`) now fails fast with a clear message if `globalThis.crypto.randomUUID` is unavailable — protects manifest tests against future vitest/jsdom bumps that might drop the Web Crypto polyfill.
- Lint drift (16 files prettier-formatted + 5 `import()`-type annotations split into top-level `import type` declarations) accumulated since Sprint 11 was committed — restored to parity.

### Fixed

- `TreeNodeProps.subtitle` changed from required to optional. Sprint 9 #4.x switched element rows from a text subtitle to a colored `kind` dot, but the type still declared `subtitle: string` — type-check failed → renderer build failed → entire AppHeader didn't render → "新建项目 / 打开项目 / 打开" 3 button 看似无反应.
- `core/project/manifest.ts` UUID generator switched from `node:crypto` import to `globalThis.crypto.randomUUID()`. The previous import pulled `__vite-browser-external` into the renderer bundle, which has no `randomUUID` export → renderer build failed.
- **HIGH (code-reviewer):** EB tresos `providedEntries` recovery — the original parser silently dropped entries where `<BSW-MODULE-ENTRY-REF-CONDITIONAL>` lacked a `<SHORT-NAME>` sibling (the real-world EB tresos shape). Now derives `shortName` from the inner `<BSW-MODULE-ENTRY-REF>`'s path text, captures `@_DEST` as `entryKind`, and pushes a fallback warning per entry.
- **MEDIUM (code-reviewer):** `<ECUC-FUNCTION-NAME-DEF>` previously collapsed to `kind: 'string'`. Distinct `'function-name'` ParamKind added so the Sprint 13 editor can render a symbol picker instead of a free-text input.

### Test coverage

- 374 → 426 tests passing (+52): 22 bswmd parser core (incl. function-name + numeric-namespace + EB-tresos-fallback cases), 17 fixture round-trip (incl. recursive totals assertion), 5 IPC handler shape, 8 i18n.
- All 5 baseline fixtures still produce the same `validateProject` totals: 782 cross-ref / 0 ref-dest / 0 ref-cycle. No regressions.
- Stmts / branches coverage stay ≥96% / ≥85% — only additive code in the new dialect walker.

### Code review

- 0 critical / 0 high / 2 medium / 3 low remaining after pre-tag fixes. The 2 medium (default-value cross-validation against `enumerationLiterals`, recursion depth limit on deeply-nested `<CHOICES>`) and 3 low are deferred to Sprint 13+ with explicit notes. Verdict: **APPROVE**.

### Known gaps (deferred to Sprint 13+)

- Renderer integration — `useArxmlStore.bswmdSchemas` not yet populated. `project:open` already returns BSWMD content; Sprint 13 wires the store to call `bswmd:parse` on each entry and expose the resulting `BswmdDocument[]` to `validateProjectForRenderer`.
- BSWMD serializer — read-only this sprint. Add when UI round-trip is needed.
- Equivalent size cap on `arxml:parse` IPC channel (reviewer MEDIUM, deferred to keep this sprint's diff focused on BSWMD).
- Default-value cross-validation against `enumerationLiterals` (push a warning if `<DEFAULT-VALUE>` is not in the literal set) — schema-side hardening for Sprint 13.
- Recursion depth limit on `<CHOICES>` chains — current implementation trusts input depth; a pathological vendor file could stack-overflow. Tracked.
- AppHeader Ribbon UI refactor (Sprint 12 #0) deferred — current single-row toolbar still ships in v0.11.0.

## [0.10.0] — 2026-06-16 (Sprint 11 — Project Manifest + i18n)

### Added

- **Project Manifest** (`<name>.autosarcfg.json`) — distinguishes a user's project from a generic doc collection. Co-located with the value-side ARXMLs. Stores `id` (UUID) + `name` + `valueArxmlPaths` + `bswmdPaths`. Schema-versioned (`schemaVersion: "1"`).
- `src/core/project/manifest.ts` — pure helpers `loadManifest(json)` / `saveManifest(m)` / `validateManifest(m)` / `createEmptyManifest(name)`. Path-shape checks refuse `..` / absolute / empty paths so a hostile manifest can't escape its directory at the main-process read step.
- **i18n framework** — `src/shared/i18n.ts` exports `Messages` interface + `MessagesZhCN` + `MessagesEn` + `t(locale, key, params?)` helper. Parity test enforces both bundles cover the same key set. Default locale: `zh-CN` (per user request).
- `src/renderer/components/ProjectPanel.tsx` + `.css` — sidebar that surfaces the project's value-side ARXMLs + BSWMDs, or shows a "no project loaded" hint with quick New/Open buttons in loose mode.
- `src/renderer/hooks/useProjectActions.ts` — shared hook returning `newProject()` / `openProjectFromDialog()` / `saveProject()`. Both `AppHeader` and `ProjectPanel` consume it; no synthetic-click coupling.
- IPC: `PROJECT_NEW` / `PROJECT_OPEN` / `PROJECT_SAVE` channels. `PROJECT_OPEN` returns `{ rel, path, content }` triples (matching by manifest-relative path so two docs sharing a basename pair correctly). Path-containment check via `path.relative` refuses escapes from the manifest directory.

### Changed

- `AppHeader` adds three project buttons (New / Open Project / Save Project) + a project chip when a project is open + a `中/EN` locale toggle. Every user-facing string routes through `t()`.
- `ValidationPanel` / `ArxmlPanel` / `Tree` / `ParamEditor` translated. ParamEditor keeps the technical type names (`integer` / `float` / etc.) untranslated — they map to ECUC standard identifiers engineers read in English.
- `useArxmlStore` gains `project` / `projectPath` / `locale` state + `openProject` / `closeProject` / `addBswmd` (Phase-1 stub) / `setLocale` actions. `addDocument` / `removeDocument` sync `project.valueArxmlPaths` when a project is open; loose mode (project null) is unchanged — 329 prior tests still pass.
- `closeProject()` preserves `documents[]` and `dirtyPaths` so the user keeps editing in loose mode without losing unsaved changes.
- `useDebouncedValidation` and the renderer data flow are unchanged; validation still runs on every mutation via the existing inline calls.
- App version string `0.9.5` → `0.10.0` (minor bump: feature release).

### Fixed

- **HIGH: basename collision** in `openProject` — the renderer now matches by `rel` (manifest-relative path) instead of `path.endsWith(rel)`. Two ARXMLs sharing a basename in different sub-directories of the same project pair to the correct manifest slot.
- **HIGH: synthetic-click coupling** — `ProjectPanel.LooseView` used to fire `document.querySelector(...).click()` on `AppHeader`'s buttons. Replaced with shared `useProjectActions` hook; `ProjectActionResult` discriminated union drives error feedback in either component.
- **HIGH: silent data-loss risk** — Save Project only persists the manifest. Disabled when `dirtyPaths.size > 0`; tooltip routes the user to the per-doc Save flow via the new `app.project.saveBlockedDirty` i18n key.
- `ArxmlPanel` no longer carries a local `FOOTER_KEYS` ad-hoc dictionary — replaced with `t('arxmlPanel.packages' | 'elements' | 'unsaved')` so the parity test enforces coverage.

### Test coverage

- 329 → 374 tests passing (+45): 19 manifest, 14 store project (including the new basename-collision test), 11 i18n.
- All 5 baseline fixtures still produce the same `validateProject` totals: 782 cross-ref / 0 ref-dest / 0 ref-cycle. No regressions.
- Stmts / branches coverage stay ≥96% / ≥85% — only additive code, no existing paths modified in a behavior-changing way.

### Known gaps (deferred to Sprint 12+)

- `formatParseError` strings in `AppHeader` stay English (parser error localisation needs main+renderer coordination).
- OS dialog titles (Open ARXML / New Project / Save ARXML) are hardcoded English — would need a `locale` parameter in the IPC handler.
- `ParamEditor` column headers (Param / Type / Value) and the `aria-label="Parameter editor"` stay English.
- BSWMD parser (`src/core/bswmd/parser.ts`) is an empty placeholder — Sprint 11 Phase 2 wires it up next.
- `addBswmd` store action is a Phase-1 no-op; the IPC `PROJECT_OPEN` already returns BSWMD content but the renderer ignores it until Phase 2 lands.

## [0.9.5] — 2026-06-16 (Sprint 9 #4 — shortName uniqueness fallback)

### Added

- `src/core/validation/validate.ts` — new pure helper `tryResolveByShortName(path, pathIndex): PathIndexEntry | undefined` that resolves a cross-ref target's leaf shortName against the project's path index. Returns the unique `PathIndexEntry` matching the leaf if there is exactly one; returns `undefined` if the leaf is missing or ambiguous. Closes branch-mismatch cases where the fixture VALUE-REF says e.g. `/EcucDefs/Com/ComConfig/ComIPduGroup/CAN_NetworkTx` but the element actually lives at `/EcucDefs/Com/CanConfigSet/CAN_NetworkTx` (sibling branch match). Pure / side-effect-free / immutable.
- `src/core/validation/validate.ts` — new pure helper `tryResolveByShortNameWithIndex(path, shortNameIndex): PathIndexEntry | undefined`, the lower-level overload that accepts a pre-built shortName reverse-index. Used by `checkCrossRefs` to amortise the O(n) index-build cost across all sites.
- `src/core/validation/validate.ts` — new pure helper `buildShortNameIndex(pathIndex): ReadonlyMap<string, readonly PathIndexEntry[]>` that builds a `shortName → entries[]` reverse index. O(n) build, O(1) lookup.
- `src/core/validation/__tests__/tryResolveByShortName.test.ts` — 15 unit tests covering: main case, 0-match, 2-match ambiguous, 3-match ambiguous, empty path, 1-segment path, trailing-slash, case-sensitivity, sibling-branch, empty pathIndex, numeric-leaf, mixed-kind duplicates, 1000-entry perf sanity, cross-module resolve, consecutive-slashes.
- `src/core/validation/__tests__/checkCrossRefs.test.ts` — 7 E2E tests verifying the fallback integration: exact match still works, branch-mismatch target resolves, ambiguous leaf still emits cross-ref, missing leaf still emits cross-ref, paramKey / sourcePath preserved on emitted error, placeholder filtering runs before fallback, mixed classification in a single call.

### Changed

- `src/core/validation/validate.ts` — `checkCrossRefs` builds a shortName reverse-index once at function entry (`O(n)`), then after the strict `pathIndex.has(resolveTargetPath(...))` lookup, runs the leaf-uniqueness fallback via `tryResolveByShortNameWithIndex`. If the fallback hits, the site is treated as resolved and no error is emitted. Misses (0 match or ≥2 ambiguous) fall through to the existing cross-ref error path unchanged.
- `src/core/validation/index.ts` — barrel re-exports `buildShortNameIndex`, `tryResolveByShortName`, and `tryResolveByShortNameWithIndex` alongside the existing `normalizePath` / `tryStripTypeSegment` / `resolveTargetPath` family.
- `src/core/validation/__tests__/validateProject.fixtures.test.ts` — baseline console.log now prints `cross-ref (unique-resolved by shortName): N` line; signature guard band tightened from `[800, 1100]` to `[700, 850]` for both `crossRefErrors.length` and `allErrors.length` to reflect the 221-site reduction; header comment block updated to document the Sprint 7 → Sprint 8 #1 → Sprint 9 #1 → Sprint 9 #2 → Sprint 9 #3 → Sprint 9 #4 baseline evolution.
- `package.json` — version `0.9.4 → 0.9.5` (PATCH bump; pure helper addition).
- `src/main/ipc/register.ts` — `GET_APP_VERSION` `'0.9.4' → '0.9.5'` sync.

### Verified

- `pnpm vitest run` — **267 tests pass / 0 fail / 0 skipped** (Sprint 9 #3 245 → Sprint 9 #4 267, +22 new). All 27 test files green.
- `pnpm vitest run --coverage` — **96.03% stmts / 84.03% branches / 100% funcs** (Sprint 9 #3 95.84% / 83.37% / 100%; +0.19% stmts, +0.66% branches from the new dedup / unique-only branches).
- 5-fixture project-level baseline numbers (Sprint 9 #4): `pathIndex.size` 1611, `refSites.length` 1336, `referenceParams.total` 1341, `cross-ref errors` **782** (was 1003, −221 unique-resolved), `ref-dest errors` 0, `ref-cycle errors` 0, `validateProject total` **782**.
- 5/5 per-doc baseline: 0 per-doc violation preserved.
- Public API: `checkCrossRefs` / `validateProject` / `buildPathIndex` / `extractReferences` signatures unchanged (the new helper is internal; only the public barrel re-exports the standalone helpers). Existing 5-fixture round-trip deep-equal signature preserved. Existing `'cross-ref'` kind behaviour unchanged — silent resolve is the new behaviour, but the error kind is the same as before when a site does not resolve.

### Deviations

- **silent resolve vs new `kind-cross-ref-fuzzy`**: the 1003 dangles closed by the fallback are silently resolved rather than emitted as a new `kind`. Introducing a 10th `ValidationErrorKind` would require a `types.ts` union extension, a `types.test.ts` 9→10 update, a new `ValidationPanel.css` colour (current 9 colours already approach the upper limit of distinct hues), and a fixtures-test `e.kind === 'cross-ref'` guard rewrite. The silent-resolve trade-off loses the "this was a fuzzy resolve, not an exact match" audit signal, but keeps the scope at 30-50 new lines instead of 4-file cross-cutting changes. Documented in PROGRESS §Deviations #1 with an explicit extension point: if ambiguous-case false-negative risk surfaces in user data, add `kind-cross-ref-fuzzy` then.
- **782 ambiguous dangles remain as genuine cross-ref errors**: the 1003 dangles were partitioned as 221 unique (1 match in pathIndex), 782 ambiguous (≥2 matches), 0 not-found. The 221 unique cases close cleanly; the 782 ambiguous cases share a leaf shortName with at least one other element and cannot be safely auto-resolved without a richer heuristic (suffix matching, parent-N lookup, etc). These remain reported as `kind: 'cross-ref'` errors and constitute fixture data quality issues (branch-mismatch cross-references in real BSW configuration data), not validator gaps. Documented in PROGRESS §Deviations #2.
- **No `'cross-ref-fuzzy'` UI test additions**: same convention as Sprint 9 #2 and #3 — `ValidationPanel.tsx` is data-driven via `groupByKind` + `Object.entries(grouped).map(...)`, so no kind auto-rendering change was needed. The two `ValidationPanel` integration tests verify the panel renders without crashing; they do not assert a specific kind set, so no test was added for the silent-resolve change. The `kind: 'cross-ref'` CSS class is purely visual and matches the existing convention of untested visual styling.

## [0.9.3] — 2026-06-15 (Sprint 9 #2 — target-side ref dest validation)

### Added

- `src/core/validation/validate.ts` — new pure helper `checkRefDests(refSites, pathIndex): readonly ValidationError[]` that performs target-side reference DEST-kind validation. After a cross-ref resolves in `pathIndex`, the resolved entry's `kind` must match the consumer's declared `site.targetDest`. Complements the existing schema-side `'reference'` kind check (which compares source's DEST against the schema entry's `refDest`) with a target-existence complement (compares source's DEST against the resolved target's actual kind).
- `src/core/validation/validate.ts` — new file-level constant `DEST_KIND_MAP: ReadonlyMap<string, ReadonlySet<PathIndexEntry['kind']>>` mapping the three standard ECUC target-kind DEST values to the set of allowed pathIndex entry kinds. Unrecognised DEST values (e.g. `ECUC-INTEGER-PARAM-DEF`, `ECUC-FUNCTION-NAME-DEF`) are skipped silently — their natural target is a param value not a path-indexed container/module/reference, so there is no ground truth to compare against. Maintenance contract: when a vendor DEST value proves stable (e.g. `ECUC-CHOICE-REFERENCE-DEF` after Sprint 9 #14 CanIf), add the mapping here with one line + a unit test pinning the new rule.
- `src/core/validation/types.ts` — `ValidationErrorKind` union gains `'ref-dest'` (now 8 kinds: `range` / `enum` / `reference` / `required` / `schema` / `multiplicity` / `cross-ref` / `ref-dest`).
- `src/core/validation/index.ts` — barrel re-export `checkRefDests` alongside `normalizePath` and `tryStripTypeSegment`.
- `src/core/validation/__tests__/checkRefDests.test.ts` — 14 unit tests covering: 3 dest-value × 2 outcomes (pass/fail), 4 edge cases (undefined targetDest / unresolved target / unknown dest / placeholder), 1 payload field completeness, 1 placeholder-skip, 1 normalization chain test (namespace + type-segment).
- `src/core/validation/__tests__/validateProject.test.ts` — 3 E2E tests verifying target-side validation runs through the full pipeline: param-level mismatch (container dest pointing at reference element), param-level pass, ArxmlReference element mismatch with no paramKey.
- `src/renderer/components/ValidationPanel.css` — new `.kind-ref-dest` class (amber-rose `#f59e0b`) visually distinct from `.kind-reference` purple `#a855f7` (schema-side) and `.kind-cross-ref` teal `#14b8a6` (target-existence).

### Changed

- `src/core/validation/validate.ts` — `walkRefs` now propagates `ParamValue.dest` (carried by the parser from `<VALUE-REF DEST="...">`) into `RefSite.targetDest` for **param-level** references, not just `ArxmlReference` elements. This was a latent bug: the existing 2157 VALUE-REFs in 5-fixture data had `targetDest === undefined` in their RefSite records, which would have made `checkRefDests` a no-op on real fixture data. The fix is a one-line conditional spread (`...(value.dest !== undefined ? { targetDest: value.dest } : {})`) that preserves the field's optionality without introducing a phantom property.
- `src/core/validation/validate.ts` — `validateProject` runs `checkRefDests` as a new Step 5 after `checkCrossRefs`. Same `refSites` and `pathIndex` inputs are reused (no double work).
- `src/core/validation/__tests__/validateProject.fixtures.test.ts` — baseline console.log now prints `ref-dest errors : N` line; signature guard gains a new `ref-dest` band `[0, 200]` (5-fixture observation: 0, upper bound catches catastrophic over-fire regressions only); header comment block updated to document the Sprint 7 → Sprint 8 #1 → Sprint 9 #1 → Sprint 9 #2 baseline evolution.
- `src/core/validation/__tests__/types.test.ts` — replaced the stale "covers all 5 kinds" hardcoded-array test with an enumerated `ValidationErrorKind` test that uses the real union type annotation. The test now fails on drift when a new kind is added without updating the list (compiler enforces shape).

### Verified

- `pnpm vitest run` — **215 tests pass / 0 fail / 0 skipped** (Sprint 9 #1 198 → Sprint 9 #2 215, +17 new). All 23 test files green.
- `pnpm vitest run --coverage` — **95.33% stmts / 82.67% branches / 100% funcs**. Branch coverage held (the new checkRefDests branch is fully exercised by the 14 unit + 3 E2E tests; the walkRefs fix branch is exercised by the 5-fixture ref-dest count dropping to 0 — proof the dest is now correctly propagated).
- 5-fixture project-level baseline numbers (Sprint 9 #2): `pathIndex.size` 1611, `refSites.length` 1336, `referenceParams.total` 1341, `cross-ref errors` 1003, `ref-dest errors` **0** (was undefined before; new metric). `validateProject total` 1003.
- 5/5 per-doc baseline: 0 per-doc violation preserved.
- Public API: `checkRefDests` is additive; `checkCrossRefs` / `validateProject` / `buildPathIndex` / `extractReferences` signatures unchanged; existing 5-fixture round-trip deep-equal signature preserved; existing `'reference'` kind (schema-side) behaviour unchanged and complementary to the new `'ref-dest'` kind (target-side).

### Deviations

- **5-fixture ref-dest count is 0 (clean data)**: every fixture VALUE-REF's `DEST` attribute matches the resolved target's actual kind (fixture data is internally consistent on the dest-kind axis). The helper is exercised by 14 unit tests on synthetic dirty data + 3 E2E tests on `validateProject`. For user-loaded data with real dest-kind mismatches, the helper will fire correctly. Documented in PROGRESS.md Sprint 9 #2 Deviations and the fixtures test header comment.
- **walkRefs bugfix bundled in same ship**: the original Sprint 9 #2 plan only added `checkRefDests`. The walkRefs fix for `targetDest` propagation was discovered while measuring the fixture baseline and is a necessary precondition for the new check to actually run on real fixture data. It is a one-line change (conditional spread) and ships in the same commit because splitting would leave the helper non-functional in practice.
- **No new `'ref-dest'` UI test additions**: `ValidationPanel.tsx` is data-driven via `groupByKind` + `Object.entries(grouped).map(...)` so new kinds auto-render. The existing 2 `ValidationPanel` integration tests verify the panel renders without crashing; they do not assert a specific kind set, so no test was added for the new kind. The `.kind-ref-dest` CSS class is purely visual and has no test coverage (matches the existing convention of untested visual styling).

## [0.9.2] — 2026-06-15 (Sprint 9 #1 — schema type-segment strip)

### Added

- `src/core/validation/validate.ts` — new pure helper `tryStripTypeSegment(path: string): string` that strips known schema-side type segments (`/Pdu/`, `/ComIPdu/`, `/ComSignal/`, `/ComIPduGroup/`) from absolute AUTOSAR paths before path-index lookup. Helper is pure, immutable, case-sensitive, idempotent on no-op inputs (empty / no known segments), and preserves trailing-slash placeholders.
- `src/core/validation/__tests__/tryStripTypeSegment.test.ts` — 12 unit tests covering: main single-segment case; multi-segment case; 4 known type segments (`Pdu` / `ComIPdu` / `ComSignal` / `ComIPduGroup`) each tested individually; empty-string / no-type-segment pass-through; trailing-slash preservation; case-sensitivity (lowercase `pdu` not stripped); defensive `PduR` not stripped; multi-segment single-path strip.
- `src/core/validation/index.ts` — barrel re-export `tryStripTypeSegment` alongside `normalizePath`.

### Changed

- `src/core/validation/validate.ts` — `checkCrossRefs` now normalises each `site.targetPath` via `normalizePath()` **and then** strips known type segments via `tryStripTypeSegment()` before the `pathIndex.has()` lookup. Order matters: namespace rewrite first, then segment strip (helper assumes the value-side namespace prefix). The `site.targetPath` field itself is left untouched so the error payload's `actual` continues to show the fixture-original string for cross-referencing the source ARXML.
- `src/core/validation/__tests__/validateProject.fixtures.test.ts` — signature-interval guard updated to reflect Sprint 9 #1 outcome. `refSites.length` band stays `[1300, 1400]` (helper is purely path-rewriting; sites are independent of path normalization). `crossRefErrors.length` band moves from `[1300, 1400]` to `[800, 1100]`; `validateProject total` mirrors. Header comment block documents the Sprint 7 → Sprint 8 #1 → Sprint 9 #1 baseline evolution and explains why the remaining 1003 cross-ref errors are genuine dangling refs (fixture data quality), not path-shape mismatches.

### Verified

- `pnpm vitest run` — **198 tests pass / 0 fail / 0 skipped** (Sprint 9 #12 186 → Sprint 9 #1 198, +12 new). All 22 test files green.
- `pnpm vitest run --coverage` — **95.33% stmts / 82.67% branches / 100% funcs**. Branch coverage improved from 82.21% (Sprint 9 #12) to 82.67% as the new type-segment path is exercised.
- 5-fixture project-level baseline numbers (Sprint 9 #1): `pathIndex.size` 1611, `refSites.length` 1336, `referenceParams.total` 1341, `cross-ref errors` **1003** (was 1336, −333 net resolved), `validateProject total` 1003.
- 5/5 per-doc baseline: 0 per-doc violation preserved.
- Public API: `tryStripTypeSegment` is additive; `checkCrossRefs` / `validateProject` / `buildPathIndex` / `extractReferences` signatures unchanged; existing 5-fixture round-trip deep-equal signature preserved.

### Deviations

- **333 of 1336 cross-ref errors resolved; 1003 remain**: Sprint 9 #1 closes the type-segment dimension of the cross-fixture mismatch. The remaining 1003 are _genuine_ dangling refs in the fixture ARXML — `Com_Com.arxml` has VALUE-REF targets pointing to elements that actually live under a sibling branch (e.g. target says `/EcucDefs/Com/ComConfig/ComIPduGroup/CAN_NetworkTx` but `CAN_NetworkTx` is a sibling under `/EcucDefs/Com/CanConfigSet/`). No path-shape rewrite can resolve a branch mismatch; this is fixture data quality, out of scope for Sprint 9 #1. Documented in PROGRESS.md Sprint 9 #1 Deviations and proposed as a future backlog item.
- **Whitelist chosen over schema-derivation**: `KNOWN_TYPE_SEGMENTS` is a hard-coded 4-element set rather than derived from `ECUC_CONTAINER_SCHEMA`. The schema only carries `Pdu` / `ComIPdu` (it tracks multiplicity, not type-segment identity); `ComSignal` / `ComIPduGroup` have no multiplicity constraint but appear as instances in the fixture. The whitelist makes the contract explicit: **future schema extensions (Sprint 9 #14 CanIf + others) must extend the whitelist in lockstep** — see the maintenance-contract comment block above the constant in `validate.ts`.

## [0.9.1] — 2026-06-15 (Sprint 9 #12 — nested AR-PACKAGE recursion)

### Added

- `src/core/arxml/types.ts` — `ArxmlPackage` interface gains an optional `packages?: readonly ArxmlPackage[]` field for the recursive package hierarchy. Field is omitted for flat (single-level) fixtures so existing 5-fixture round-trip signatures stay field-equal.
- `src/core/arxml/parser.ts` — `walkPackages` recurses into `pkg['AR-PACKAGES']`, exposing nested package elements / modules / containers that were previously silently dropped. R21/R22 BSWMD + EcucValues shapes (`AUTOSAR_R2x > EcucDefs > <module>`) now parse to a populated tree. New `MAX_ARPKG_DEPTH = 16` ceiling silently truncates pathological nesting (adversarial input no longer risks V8 stack overflow).
- `src/core/arxml/serializer.ts` — `renderPackage` emits a `<AR-PACKAGES>` block when `pkg.packages` is non-empty, mirroring the parsed structure. Flat fixtures stay flat (no spurious nested wrappers).
- `src/core/arxml/path.ts` — `packageByPath` and `findByPath` now walk the recursive package tree. `findByPath` allows each segment to resolve to either a nested package or a child element. UI navigation through nested packages works end-to-end (previously `ParamEditor` would silently miss nested targets).
- 14 new unit tests across 3 files: 7 nested-package parse cases + 1 collision case + 1 depth-ceiling case + 1 end-to-end round-trip case + 2 path helper cases + 2 serializer output cases.

### Changed

- `src/core/arxml/parser.ts` — `readLongName` is now bound once before the spread conditional instead of called twice (review M-2 cleanup adjacent to the new `packages` field).
- `src/core/arxml/__tests__/parser.test.ts` — imports `serializeArxml` statically so the new end-to-end round-trip test can run under ESM vitest (no `require()` at test runtime).

### Verified

- `pnpm vitest run` — **186 tests pass / 0 fail / 0 skipped** (Sprint 8 #1 172 → Sprint 9 #12 186, +14 new). All 21 test files green.
- `pnpm vitest run --coverage` — **95.18% stmts / 82.21% branches / 100% funcs**. Branch coverage improved from 80.48% (Sprint 8 #1) to 82.21% as new nested-package paths are exercised.
- 5-fixture project-level baseline numbers unchanged: `pathIndex.size` 1611, `refSites.length` 1336, `cross-ref errors` 1336, `validateProject total` 1336. Flat 5-fixture shapes are unaffected by the recursion addition (back-compat via conditional `packages` field).
- 5/5 per-doc baseline: 0 per-doc violation preserved. Single-document `validate(doc)` is unaffected.
- Public API: `ArxmlPackage.packages` is additive (optional field); `packageByPath` / `findByPath` / `parseArxml` / `serializeArxml` signatures unchanged; existing 5-fixture round-trip deep-equal signature preserved.

### Deviations

- **`path.ts` regression caught pre-ship by code-reviewer (review H-1)**: the initial implementation recursed in `walkPackages` but `packageByPath` / `findByPath` still only walked top-level `doc.packages`. Without the fix, `findByPath('/AUTOSAR_R22/EcucDefs/CanIf/CanIfInitCfg')` would have returned `null` for any R21/R22 BSW file even though the parser correctly produced the tree — the recursion would have been a no-op from the UI's perspective. Fix landed in the same ship: `path.ts` now recursively descends `pkg.packages`, and 2 new tests in `path.test.ts` pin the contract.
- **Depth ceiling chosen at 16**: real R21/R22 BSW files top out at 3-4 levels; 16 is generous so vendor quirks never hit it while keeping adversarial input bounded. Parser returns `ok: true` with a truncated tree beyond the limit (parseArxml contract: never throws).

## [0.9.0] — 2026-06-15 (Sprint 8 #1)

### Added

- `core/validation/validate.ts` — new pure helper `normalizePath(path: string): string` collapses the cross-fixture `/EAS/...` definition-side namespace onto `/EcucDefs/...` (the value-side namespace used by `buildPathIndex`). Helper is idempotent, pass-through for empty / bare-typename / other-prefix inputs, and never throws.
- `core/validation/__tests__/normalizePath.test.ts` — 8 unit tests covering: main `/EAS → /EcucDefs` rewrite; idempotence on `/EcucDefs/...`; empty / bare-typename / other-prefix pass-through; bare-`/EAS` / `/EAS/` edge cases; defensive `/EASx/...` non-match.
- `core/validation/__tests__/validateProject.test.ts` — 3 end-to-end tests: `/EAS/...` target resolves against `/EcucDefs/...` pathIndex; `/EcucDefs/...` target idempotent; unresolvable target's error payload preserves the fixture-original `/EAS/...` string in `actual`.
- `core/validation/index.ts` — barrel re-export `normalizePath` so callers (Renderer / future cross-doc tools / RTE path generation) can reuse the helper without touching the private submodule.

### Changed

- `core/validation/validate.ts` — `checkCrossRefs` now normalizes each `site.targetPath` via `normalizePath()` **before** the `pathIndex.has()` lookup. The `site.targetPath` field itself is left untouched (and the error payload's `actual` continues to carry the fixture-original `/EAS/...` string) so users can cross-reference the source ARXML.
- `core/validation/__tests__/validateProject.fixtures.test.ts` — signature-interval guard header updated to document Sprint 8 #1 outcome. Interval stays `[1300, 1400]` for `refSites` / `crossRefErrors` / `allErrors`: Sprint 8 #1 closes the **namespace** half of the cross-fixture mismatch but **does not** touch the second half (schema type segments like `/Pdu/`, `/ComIPdu/` inserted between the parent container and the instance shortName), which is documented as Sprint 9+ backlog. All 1336 cross-ref errors today are gated on the type-segment mismatch; helper has no observable effect on the cross-ref count until Sprint 9+ adds the type-segment strip.

### Verified

- `pnpm verify` 6-stage pipeline: format / lint / type-check / test / coverage / build all green.
- Test count: Sprint 7 161 → **172** (+8 normalizePath + 3 validateProject end-to-end).
- Coverage: `94.98% stmts / 80.48% branches / 100% funcs` (Sprint 7 was 94.86% / 80%).
- 5-fixture baseline numbers (Sprint 7 → Sprint 8 #1): `pathIndex.size` 1611 → 1611 (unchanged), `refSites.length` 1336 → 1336 (unchanged), `cross-ref errors` 1336 → 1336 (unchanged — see Changed section).
- 5/5 per-doc baseline: 0 per-doc violation preserved (`validate(doc)` does not invoke `normalizePath`; the namespace rewrite lives entirely inside `checkCrossRefs`).
- Public API: `buildPathIndex` / `extractReferences` / `checkCrossRefs` signatures unchanged. `RefSite.targetPath` and `ValidationError.actual` semantics unchanged (still carry fixture-original strings).

### Deviations

- **PLAN.md mis-identified the root cause**: Phase 1 reconnaissance confirmed the namespace mismatch (`/EAS/...` vs `/EcucDefs/...`) but missed a second mismatch layer — every `VALUE-REF` target in the 5 fixtures also carries a schema-side **type segment** (e.g. `Pdu` for `EcucPduCollection` container instances, `ComIPdu` / `ComSignal` / `ComIPduGroup` for Com containers) that `pathIndex` does not emit (pathIndex keys use the instance's own shortName directly, with no `Pdu` / `ComIPdu` / `ComSignal` / `ComIPduGroup` segment). After `normalizePath` rewrites `/EAS/...` to `/EcucDefs/...`, all 1336 cross-ref errors are still unresolved because of the type-segment gap. Sprint 8 #1 ships the namespace half as planned; the type-segment half is documented in the Sprint 8 section of `PROGRESS.md` and queued for Sprint 9+ as backlog item **#1**.
- **Signature interval unchanged**: PLAN.md §4.2 / §5.2 / §6.2 projected the cross-ref count would drop from 1336 to `[0, 200]`. After implementation the count is still 1336 (every site has a type segment). The interval guard is updated narratively but the `[1300, 1400]` numeric range is kept to preserve the parser-dropout / double-count regression catch — Sprint 9+ will need to widen the upper bound when type-segment stripping lands.

## [0.8.0] — 2026-06-15 (Sprint 7)

### Added

- `core/arxml/parser.ts` — `extractParamsAndRefs` now walks **both** the standard `<REFERENCE-VALUES>` wrapper (used by `Com` / `PduR` / `WdgIf`) **and** the EcuC vendor dialect where the `<REFERENCE-VALUE>` lives as a child of `<PARAMETER-VALUES>` with `DEST="ECUC-FOREIGN-REFERENCE-DEF"`. New `extractReferenceParams` helper returns `ParamValue[]` of shape `{ type: 'reference', value, dest? }`. `parseParamValue` gains a `dest?: string` parameter and uses **DEST-first dispatch** to route `ECUC-REFERENCE-DEF` / `ECUC-FOREIGN-REFERENCE-DEF` into the reference shape (alongside the Sprint 4 ECUC-NUMERICAL-PARAM-VALUE / ECUC-TEXTUAL-PARAM-VALUE / ECUC-BOOLEAN-PARAM-DEF dispatch).
- `core/arxml/serializer.ts` — `renderParams` split into three focused helpers (`renderParamEntries` / `renderRegularParam` / `renderReferenceParam`). Module / container rendering now emits a `<REFERENCE-VALUES>` wrapper **immediately after** `<PARAMETER-VALUES>` containing one `<ECUC-REFERENCE-VALUE>` per `param[type:'reference']` with a `<VALUE-REF DEST="...">` child. The serializer always emits the **standard** `<VALUE-REF>` shape regardless of which dialect the parser saw — round-trip field equality holds (`value` + `dest` preserved).
- `core/arxml/__tests__/parser.test.ts` — 5 new unit tests covering: standard `<REFERENCE-VALUES>` parse → `params[type:'reference']`; EcuC vendor dialect parse → `params[type:'reference']`; placeholder (`<VALUE-REF DEST="..."/>` empty) is skipped; non-reference `<REFERENCE-VALUES>` children are ignored; mixed dialect within a single module.
- `core/arxml/__tests__/serializer.test.ts` — 5 new unit tests covering: `<REFERENCE-VALUES>` wrapper emitted after `<PARAMETER-VALUES>`; round-trip of standard dialect; round-trip of EcuC vendor dialect (output is standard); multi-ref container shape; no-ref container emits no `<REFERENCE-VALUES>` wrapper.
- `core/arxml/__tests__/round-trip.test.ts` — 5 fixture round-trip tests restored (all 5 fixtures parse → serialize → re-parse with field-level equality).
- `core/validation/__tests__/validateProject.fixtures.test.ts` — print real `validateProject` total + `referenceParams` count via `console.log`; refSites / cross-ref errors / validateProject total each locked to `[1300, 1400]` signature interval (catches parser dropouts AND double-counts).

### Changed

- `core/arxml/types.ts` — `ParamValue.reference` shape gains an optional `dest?: string` field (parser writes it; serializer reads it; round-trip preserves it).
- `core/validation/__tests__/validateProject.fixtures.test.ts` — lower-bound assertion `refSites.length >= 1000` / `crossRefErrors.length >= 1000` retained as the regression floor; new upper-bound `<= 1400` added alongside so the Sprint 7 signature interval `[1300, 1400]` is **both** directions enforced.

### Verified

- `pnpm verify` — format / lint / type-check / test / coverage / build all green.
- **161 unit tests pass** across 20 test files (up from 146 in v0.7.0):
  - Sprint 6 regression: 146 tests preserved
  - Sprint 7 new: parser.test.ts +5 + serializer.test.ts +5 + round-trip.test.ts fixture suite restored (5 fixtures × ~3 round-trip cases per fixture)
- **Coverage**: 94.86% stmts / 80% branches / 100% funcs / 94.86% lines (vs v0.7.0 94.95% / 79.86% / 100% / 94.95%; branches +0.14pp, stmts -0.09pp — both stay well above the ≥80% stmts / ≥70% branches gate).
- **5-sample baseline regression**: Det_Det / EcuC_EcuC / Com_Com / PduR_PduR / WdgIf_WdgIf all surface **0 per-document violations** across all 7 kinds (range/enum/reference/required/schema/multiplicity/cross-ref). Project-level cross-ref errors are 1336 (1:1 with refSites), and the 1336 are accepted as baseline — see Deviations for the rationale.

### 5-fixture measured numbers (post-placeholder-skip)

| Fixture     | ECUC-REFERENCE-VALUE elements (XML) |      params[type:reference] (parser output) |
| ----------- | ----------------------------------: | ------------------------------------------: |
| Det_Det     |                                   0 |                                           0 |
| EcuC_EcuC   |                                 250 | 0 (all placeholder `PDU-TO-FRAME-MAPPING/`) |
| Com_Com     |                                3630 |                                        1107 |
| PduR_PduR   |                                 682 |                                         229 |
| WdgIf_WdgIf |                                   2 |           0 (both placeholder trailing `/`) |
| **Total**   |                                4564 |                                        1336 |

Sprint 6 → Sprint 7 baseline jump:
`pathIndex=1611` / `refSites=0` / `cross-ref errors=0` / `validateProject total=0`
→ `pathIndex=1611` / `refSites=1336` / `cross-ref errors=1336` / `validateProject total=1336`.

### Deviations from plan

- **1336 cross-ref errors accepted as baseline** — the 5 fixtures are **slices**, not a self-contained project. `<VALUE-REF>` targets live under the `/EAS/...` namespace (definition-side references), while the path index is built from `/EcucDefs/...` values (value-side). Of the 1336 cross-ref errors, virtually all are real `/EAS/...` targets that **would resolve** if the project included the bundled `EAS_*` schema modules. The Sprint 7 plan acknowledged this risk explicitly ("fixtures may not form a self-contained project; document accepted baseline rather than suppress"). No errors are suppressed in `checkCrossRefs`; the signature guard `[1300, 1400]` keeps the contract honest. Cross-fixture normalisation is the next step (Sprint 8 backlog).
- **EcuC vendor dialect → standard mode round-trip** — parser dual-dialect (`<REFERENCE-VALUES>` wrapper OR nested-under-`<PARAMETER-VALUES>`), but the serializer always emits the **standard** `<VALUE-REF>` shape. Round-trip tests assert **field equality** (`value` + `dest`), not XML byte-for-byte equality. Re-parsing a previously-EcuC-dialect document produces a tree that re-serialises to the standard shape — the dialect information is intentionally dropped on output. Documented in serializer comment block.
- **T1-A pre-empted part of T1-C** — Sprint 7 plan reserved baseline number updates for T1-C, but T1-A's `refSites.length >= 1000` lower-bound assertion had to be raised to ≥1000 at the time the parser landed (otherwise the fixture test went red immediately). The [1300, 1400] signature interval and the `validateProject` total print are the new T1-C surface.
- **5-fixture EcuC / WdgIf post-parse refSite count is 0** — EcuC's 250 ECUC-REFERENCE-VALUE elements all carry placeholder paths ending in `PDU-TO-FRAME-MAPPING/` (unset, waiting for a project editor); WdgIf's 2 are both `/.../Wdgs/` trailing-slash placeholders. Parser-side placeholder skip is intentional (matches `isUnsetPlaceholder`); these 252 elements are correctly absent from `refSites`. Documented as a **data characteristic**, not a parser bug.

## [0.7.0] — 2026-06-15 (Sprint 6)

### Added

- `core/validation/types.ts` — `ValidationErrorKind` extended with `'cross-ref'` (7th kind, joins range/enum/reference/required/schema/multiplicity); new `PathIndexEntry` interface (`path` + `kind: 'module'|'container'|'reference'` + `shortName` + optional `dest`); new `RefSite` interface (`sourcePath` + `targetPath` + optional `targetDest` + `tagName` + optional `paramKey`).
- `core/validation/validate.ts` — 4 new pure / testable exports building on the Sprint 5 single-document surface:
  - `validateProject(documents)`: aggregates per-document `validate()` errors + project-wide cross-ref check; returns `readonly ValidationError[]` matching the Sprint 5 contract
  - `buildPathIndex(documents)`: walks every module/container/named-reference across documents and indexes them under their absolute AUTOSAR path (`/<pkg.shortName>/.../<leaf.shortName>`)
  - `extractReferences(documents)`: walks every `kind:'reference'` ArxmlElement plus every container/module `params[]` value with `type:'reference'` and collects them as `RefSite`s (deliberately skips `ArxmlModule.references[]` — those are schema-side DEFINITION-REFs, not project-internal cross-refs)
  - `checkCrossRefs(refSites, pathIndex)`: emits one `'cross-ref'` `ValidationError` per unresolved target; skips empty / trailing-slash placeholders (those are surfaced by the `'required'` kind in single-doc `validate()`)
- `core/validation/index.ts` — re-exports the 4 new symbols; type re-export already covered `PathIndexEntry` / `RefSite` / new `'cross-ref'` kind via `export * from './types.js'`.
- `renderer/components/ValidationPanel.css` — `.kind-cross-ref` class (teal `#14b8a6`) for visual distinction from `.kind-reference` (purple — per-param DEST mismatch within a single doc) and the other 5 kinds.
- 25 new unit tests in `core/validation/__tests__/validateProject.test.ts` across 4 describe blocks (7 buildPathIndex / 6 extractReferences / 6 checkCrossRefs / 5 validateProject + 1 parity-with-validate).
- 3 new fixture tests in `core/validation/__tests__/validateProject.fixtures.test.ts` loading the 5 baseline ARXML files and surfacing real project-level numbers via stdout.
- 1 new unit test in `renderer/components/__tests__/ValidationPanel.test.tsx` (renders cross-ref kind with teal `.kind-cross-ref` class).

### Verified

- `pnpm verify` — format / lint / type-check / test / coverage / build all green
- **146 unit tests pass** across 20 test files (up from 117 in v0.6.0):
  - Sprint 5 regression: 117 tests preserved
  - Sprint 6 new: validateProject.test.ts +25 + validateProject.fixtures.test.ts +3 + ValidationPanel.test.tsx +1 = 29
- **Coverage**: 94.95% stmts / 79.86% branches / 100% funcs / 94.95% lines (vs v0.6.0 95.1% / 78.07% / 100% / 95.1%; branches +1.79pp, stmts -0.15pp — the 0.15pp dip is the few uncovered defensive branches in the new `validate.ts` cross-ref helpers that real fixture data does not exercise until Sprint 7 lands REFERENCE-VALUES parsing; both numbers remain well above the ≥80% stmts / ≥70% branches gate). `core/validation/index.ts` 100% / `core/validation/types.ts` 100% / `core/validation/validate.ts` 94.38% / 89.53%.
- **5-sample baseline regression**: Det_Det / EcuC_EcuC / Com_Com / PduR_PduR / WdgIf_WdgIf all **0 violations** across all 7 kinds (range/enum/reference/required/schema/multiplicity/cross-ref). The new `validateProject.fixtures.test.ts` prints the real numbers (pathIndex.size 1611, refSites.length 0, cross-ref errors 0, validateProject total 0) — see Deviations for why the cross-ref count is 0 today.
- 6-stage CI: GitHub Actions expected 6/6 green.

### Deviations from plan

- **Parser does not parse `<REFERENCE-VALUES>` (ECUC-REFERENCE-VALUE) wrappers** — discovered during T3 fixture baseline. The 5 fixtures hold 2306 such wrappers (Com 1846 / PduR 458 / WdgIf 2) which contain the real cross-container `<VALUE-REF>` data, but `src/core/arxml/parser.ts` `extractParamsAndRefs()` only handles `<PARAMETER-VALUES>` (ECUC-NUMERICAL-PARAM-VALUE / ECUC-TEXTUAL-PARAM-VALUE). Result: `extractReferences()` finds 0 sites for the 5 fixtures today, and `validateProject` reports 0 cross-ref errors. **Parser/serializer support for REFERENCE-VALUES is deferred to Sprint 7** (plan §1.2 backlog item). The Sprint 6 cross-ref infrastructure (validateProject / buildPathIndex / extractReferences / checkCrossRefs / 'cross-ref' kind / UI color) is correct and tested with synthetic documents (25 unit tests); as soon as Sprint 7 lands REFERENCE-VALUES parsing, real cross-ref data will flow through with zero additional work in validation.
- **`walkRefs` deliberately skips `ArxmlModule.references[]`** — plan §2.2 suggested those strings (module-level `<DEFINITION-REF>`) could feed into the path-index walk. Investigation showed they point at schema definition paths (`/EAS/Det` → ECUC-MODULE-DEF namespace), not project-internal value-side paths (`/EcucDefs/Det`). Including them would always trigger 5 false-positive "cross-ref" errors against the value-side path index. Comment block in `walkRefs()` documents the decision; schema-side ref validation is in the Sprint 7 backlog.
- **`validateProject` returns `readonly ValidationError[]`, not `ValidationResult`** — plan §2.2 wrote `return { ok: errors.length === 0, errors }` but the Sprint 5 `validate()` returns `readonly ValidationError[]` directly (never a `ValidationResult` envelope). Matching that contract is the consistent choice for the project-level surface.
- **`ValidationError` field is `path`, not `elementPath`** — plan §2.2 referenced `elementPath`; the actual `ValidationError` shape from Sprint 3/5 uses `path`. `checkCrossRefs` writes to `path` accordingly. The `paramKey` field is now also set when the ref site comes from a container/module param scan, mirroring how single-doc `walkContainer` populates it for `range`/`enum` errors.
- **No `severity` field** — plan §2.2 referenced a `severity` field that does not exist on `ValidationError` (and was not part of Sprint 5). Not added.
- **UI is CSS-driven, not map-driven** — plan §2.4 proposed `KIND_LABEL` / `KIND_COLOR` / `KIND_SORT_ORDER` typed maps. The actual ValidationPanel uses dynamic `kind-${kind}` className + raw `kind` string as label. T2 sub-agent only added `.kind-cross-ref` to the CSS file (4 lines) and 1 test case, leaving `ValidationPanel.tsx` untouched. No sort order added — kinds render in errors' arrival order, matching the Sprint 5 multiplicity rollout.
- **Store is single-document** — plan §2.5 hedged on a `documents: ArxmlDocument[]` store shape; the actual store holds `doc: ArxmlDocument | null`. `validateProject` is exposed as a pure core API for now; UI integration of project-level validation is deferred to whichever Sprint introduces multi-document loading.
- **`RefSite` gained an optional `paramKey` field** — plan's `RefSite` shape did not include it; sub-agent A added it during the walkRefs scan-params extension so error messages can identify which container param holds the dangling ref (mirrors single-doc `validate()` populating `ValidationError.paramKey`). Additive change, no break.
- **version bump 0.6.0 → 0.7.0** — adding a new validation kind, a new project-level API, and two new exported types constitutes a MINOR bump per semver (additive feature, no breaking change to `validate()` / `EcucSchemaEntry` / `ValidationError` ABI).

## [0.6.0] — 2026-06-15 (Sprint 5)

### Added

- `core/validation/types.ts` — `ValidationErrorKind` extended with `'multiplicity'` (6th kind); new `EcucContainerSchemaEntry` interface (`path` + `lower: number` + `upper: number | 'unbounded'`).
- `core/validation/schema/ecucSubset.ts` — `ECUC_CONTAINER_SCHEMA` readonly array (13 entries covering the 5 fixture container types: Det/DetGeneral, WdgIf/WdgIfGeneral, WdgIf/WdgIfDevice, EcuC/EcucGeneral, EcuC/EcucPduCollection, EcuC/EcucPduCollection/Pdu, PduR/PduRGeneral, PduR/PduRBswModules, PduR/PduRRoutingTables, PduR/PduRRoutingTables/PduRRoutingTable, Com/ComGeneral, Com/ComConfig, Com/ComConfig/ComIPdu); `lookupContainerSchema(containerPath)` linear-scan lookup (parallel to `lookupSchema`).
- `core/validation/validate.ts` — `checkContainerMultiplicity` helper invoked from `walkElements` (counts direct child containers by `shortName`, dedupes via `Set` so "above upper" reports once not N times); `upper: 'unbounded'` skips the upper-bound check.
- `renderer/components/ValidationPanel.css` — `.kind-multiplicity` class (indigo `#6366f1`) for visual distinction from existing `kind-range/enum/reference/required/schema`.
- `renderer/components/ValidationPanel.tsx` — multiplicity errors now surface in their own group (lowercase label `"multiplicity"`, consistent with the 5 existing dynamic-map kind labels).
- 5 new unit tests in `core/validation/__tests__/validate.test.ts` (below lower / above upper / at boundary / unbounded / un-registered path).
- 2 new unit tests in `renderer/components/__tests__/ValidationPanel.test.tsx` (renders multiplicity group / no group when absent).

### Verified

- `pnpm verify` — format / lint / type-check / test / coverage / build all green
- **117 unit tests pass** across 18 test files (up from 110 in v0.5.0):
  - Sprint 4 regression: 110 tests preserved
  - Sprint 5 new: validate.test.ts +5 (multiplicity) + ValidationPanel.test.tsx +2
- **Coverage**: 95.1% stmts / 78.07% branches / 100% funcs / 95.1% lines (up from 94.57% / 76.66% / 100% / 94.57% in v0.5.0); `core/validation/validate.ts` 95.96% / 86.79% (gate ≥80% / ≥70%); `core/validation/schema/ecucSubset.ts` 100% covered.
- **5-sample baseline regression**: Det_Det / EcuC_EcuC / Com_Com / PduR_PduR / WdgIf_WdgIf all **0 violations** — schema entries match observed container instance counts across all 5 fixtures (Det 1, WdgIf 1+1, EcuC 1+1+125 Pdu, PduR 1+1+1+N routing, Com 1+1+67 IPdus).
- 6-stage CI: GitHub Actions expected 6/6 green.

### Deviations from plan

- **`checkContainerMultiplicity` called from `walkElements` not `walkContainer`** — sub-agent B found that placing the call inside the per-element `walkContainer` would scan `el.children` twice (once for params, once for multiplicity). Moving the call to `walkElements` lets a single `Map<shortName, count>` pass serve both `checkParam` and `checkContainerMultiplicity`. Plan §2.3 specified the call site in `walkContainer`; the implementation deviates but is functionally equivalent (parent-level errors still surface before child-level recursion).
- **`Set<string>` dedupe in `walkElements`** — without dedupe, an "above upper" condition for a container appearing 5 times would emit 5 duplicate errors. Set limits emission to 1 per `parentPath+shortName`. Not in plan but required for test 2 ("above upper → 1 error").
- **`ValidationPanel.css` modified** — plan §2.5 called for a distinct color for the new kind; the existing 5 kinds all use `.kind-{name}` classes for color, so the 6th needed its own. 4-line CSS add keeps visual consistency.
- **Label text uses lowercase `"multiplicity"`** — matches the existing 5 kind labels (lowercase enum values rendered via dynamic map). Plan §2.5 suggested `"Multiplicity violations"` but the existing pattern wins; capitalising only the new kind would break visual consistency.
- **version bump 0.5.0 → 0.6.0** — adding a new validation kind and a new schema table constitutes a MINOR bump per semver (new additive feature, no breaking change to existing `EcucSchemaEntry` ABI).

## [0.5.0] — 2026-06-15 (Sprint 4)

### Fixed

- **parser**: `core/arxml/parser.ts` `extractParamsAndRefs` now reads `<DEFINITION-REF @_DEST>` attribute; `parseParamValue` signature gains `dest?: string` parameter and uses **DEST-first dispatch** to map AUTOSAR ECUC parameter types:
  - `ECUC-BOOLEAN-PARAM-DEF` → `boolean` (accepts `true`/`false`/`1`/`0`)
  - `ECUC-STRING-PARAM-DEF` / `ECUC-FUNCTION-NAME-DEF` → `string`
  - `ECUC-ENUMERATION-PARAM-DEF` → `enum`
  - `ECUC-INTEGER-PARAM-DEF` / `ECUC-FLOAT-PARAM-DEF` → `integer` / `float`
  - No DEST + `ECUC-NUMERICAL-PARAM-VALUE` wrapper → `integer`/`float` by VALUE shape (backward compatible)
  - No DEST + `ECUC-TEXTUAL-PARAM-VALUE` wrapper → `enum` (conservative fallback)
- **serializer**: `core/arxml/serializer.ts` `renderParams` now dispatches by type to write the exact DEST attribute (`ECUC-INTEGER-PARAM-DEF` vs `ECUC-FLOAT-PARAM-DEF` vs `ECUC-STRING-PARAM-DEF` vs `ECUC-BOOLEAN-PARAM-DEF` vs `ECUC-ENUMERATION-PARAM-DEF`); previously integer+float shared `ECUC-INTEGER-PARAM-DEF` which silently corrupted round-trips.

### Changed

- `core/validation/schema/ecucSubset.ts` — **schema retype revert**: 15 boolean entries (Det/WdgIf/PduR/EcuC-PduCollection-Pdu/Com) now typed `boolean` (were `integer 0..1` workaround for Sprint 3 parser bug); 3 string entries (DetErrorHook, CddHeaderFile, WdgSetModeName) now typed `string` with `maxLength: 256` (were `enumeration` workaround); 2 sentinel entries removed (`/EcucDefs/__sentinel/BoolParam`, `/EcucDefs/__sentinel/StringParam`).
- `core/validation/__tests__/validate.test.ts` — one test now expects `kind: 'schema', expected: 'boolean', actual: 'integer'` (was `kind: 'range'`); schema revert makes DetDebugLoop a `boolean` not `integer 0..1`.
- `scripts/verify.mjs` — added `format` stage at position 1 (before `lint`); 5 stages → 6 stages. `format` failures short-circuit the rest of the pipeline.

### Verified

- `pnpm verify` — format / lint / type-check / test / coverage / build all green
- **110 unit tests pass** across 18 test files (up from 105 in v0.4.0):
  - Sprint 3 regression: 105 tests preserved
  - Sprint 4 new: parser.test.ts +5 tests covering DEST-first dispatch (boolean true/false, string ECUC-STRING-PARAM-DEF, string ECUC-FUNCTION-NAME-DEF, TEXTUAL fallback to enum)
- **Coverage**: 94.57% stmts / 76.66% branches / 100% funcs / 94.57% lines (up from 92.12% / 72.92% / 100% / 92.12% in v0.4.0); `core/validation/schema/ecucSubset.ts` 100% covered.
- **5-sample baseline regression**: Det_Det / EcuC_EcuC / Com_Com / PduR_PduR / WdgIf_WdgIf all **0 violations** — schema revert integrated successfully with parser fix.
- 6-stage CI: GitHub Actions expected 6/6 green (was 5/5; format stage added).

### Deviations from plan

- **15 boolean entries** (not 12 as listed in plan §3.1) — Sprint 3 PROGRESS risk review listed 12, but actual scan after parser fix surfaced 15 entries across Det/WdgIf/PduR/EcuC-PduCollection-Pdu/Com sections.
- **serializer.ts also modified** — beyond the plan's `parser.ts` + `parser.test.ts` scope, `serializer.ts` `renderParams` needed a complementary fix: parser's DEST-aware output would have been corrupted on round-trip (float → integer) without this change. Same sub-agent self-checked via non-baseline test pass.
- **`validate.test.ts` 1 test updated** — DetDebugLoop retype from `integer 0..1` to `boolean` changes the triggered error kind from `range` to `schema` (type mismatch). Schema revert is incomplete without this.
- **version bump 0.4.0 → 0.5.0** — fixing two release-blocker parser bugs + serializer round-trip bug + tightening verify pipeline constitutes a MINOR bump per semver.

## [0.4.0] — 2026-06-14 (Sprint 3)

### Added

- `core/validation/types.ts` — `ValidationError` discriminated union (5 kinds: range/enum/reference/required/schema), `EcucSchemaEntry`, `EcucParamType`, `ValidationResult` envelope
- `core/validation/schema/ecucSubset.ts` — `ECUC_SUBSET_SCHEMA` (46 entries covering ECUC 6 types), `lookupSchema(paramPath)`, `allSchemaPaths()` derived from 5-sample fixture scan
- `core/validation/validate.ts` — pure `validate(doc): readonly ValidationError[]` walker (range/enum/reference/schema checks + nested container recursion)
- `renderer/hooks/useDebouncedValidation.ts` — 300ms debounce safety-net hook (cleanup on unmount)
- `renderer/components/ValidationPanel.tsx` + `ValidationPanel.css` — three-state panel (empty / valid / invalid), errors grouped by kind with click-to-jump `select(containerPath)`
- 5-sample baseline regression test (`baseline.test.ts`) — Det_Det / EcuC_EcuC / Com_Com / PduR_PduR / WdgIf_WdgIf all 0 violations

### Changed

- `renderer/store/useArxmlStore.ts` — added `validationErrors` + `lastValidatedAt` + `validate()` action; `setDoc` / `updateParam` / `clear` all wire validation
- `renderer/components/editor/modes/EnumEditor.tsx` — schema-aware `<select>` dropdown when `lookupSchema` finds `enumLiterals`; falls back to free-form text input otherwise (preserves F2 behaviour)
- `renderer/App.tsx` — split-view layout: `<Tree>` and `<ValidationPanel>` stacked vertically in left column (grid `1fr auto`), `<ParamEditor>` in right column; mounts `useDebouncedValidation(300)` at app root
- `renderer/styles.css` — `.workspace` is now 2-column grid (`minmax(280px, 30%) 1fr`); new `.left-column` 2-row grid stacks Tree + ValidationPanel
- App header now reads `v{appVersion} — F3 Validation`
- `core/index.ts` — barrel re-exports `./validation/index.js`
- `package.json` — version 0.3.0 → 0.4.0

### Verified

- `pnpm verify` — format / format:check / lint / type-check / test / coverage / build all green
- **105 unit tests pass** across 18 test files (up from 58 in v0.3.0):
  - Sprint 2 regression: types 2 + parser 8 + serializer 3 + round-trip 10 + path 4 + useArxmlStore 6 + round-trip-mutate 5 + Tree 9 + modes 8 + ParamEditor 3 = 58
  - Sprint 3 new: validation types 5 + ecucSubset 11 + validate 13 + baseline 5 + useArxmlStore.validation 5 + ValidationPanel 4 + ValidationPanel.integration 2 + EnumEditor 2 = 47
- 5-stage CI: GitHub Actions 5/5 green expected

### Deviations from plan

- **46 schema entries** vs target 20-40 — broader Com coverage was straightforward to add without noise
- **2 real parser bugs discovered** during baseline test: `parser` does not read `<DEFINITION-REF DEST="ECUC-BOOLEAN-PARAM-DEF">` (boolean values fall through to integer) or `ECUC-STRING-PARAM-DEF` / `ECUC-FUNCTION-NAME-DEF` (string values fall through to enum). To make the 5-sample baseline pass, the schema was retyped: boolean params marked as `integer 0..1`, string params marked as `enumeration` with observed literals. Schema retypes documented inline with `// ⚠ parser-bug compat` comments. **Proper fix is in Sprint 4**: patch `src/core/arxml/parser.ts` to honour DEST attribute, then revert the schema and remove sentinel entries.
- `EnumEditor` upgrade kept text-input fallback for schema miss — preserves F2 behaviour for any params not yet in `ECUC_SUBSET_SCHEMA`

## [0.3.0] — 2026-06-14 (Sprint 2)

### Added

- `core/arxml/path.ts` — `packageByPath`, `findByPath`, `paramsEqual` pure helpers
- `renderer/store/useArxmlStore.ts` — Zustand store: `{ doc, filePath, selectedPath, dirty, error }` + actions `setDoc / select / updateParam / markSaved / clear`
- `renderer/components/tree/Tree.tsx` + `TreeNode.tsx` — recursive accessible ARIA tree (chevron + label + subtitle), expansion state local to Tree
- `renderer/components/editor/ParamEditor.tsx` — right-pane editor that resolves `selectedPath` via `findByPath` and routes each param to a mode-specific editor
- `renderer/components/editor/modes.ts` — pure `selectParamMode(value, key)` helper (6 ParamValue → 7 ParamEditMode)
- 7 mode editors: `StringEditor`, `IntegerEditor`, `FloatEditor`, `BooleanEditor`, `EnumEditor` (F2 text-only, schema-aware options deferred to S3), `ReferenceEditor` (DEST badge readonly), `MultilineEditor`
- Keyboard a11y on Tree: `ArrowRight/Left` expand/collapse, `ArrowUp/Down` move focus, `Enter/Space` select
- `src/test/setup.ts` — shared `@testing-library/jest-dom` matcher setup for vitest

### Changed

- `renderer/App.tsx` — split-view layout: `<Tree />` left, `<ParamEditor />` right, `<ArxmlPanel />` toolbar on top
- `renderer/components/ArxmlPanel.tsx` — `doc`/`filePath` now read directly from store (was local `useState`); Save button reads `dirty` from store and labels "Save (unsaved)" when dirty, emerald when clean
- `vite.renderer.config.ts` — added `@core` + `@shared` resolve aliases (renderer needs to import from `core/arxml/path`)
- `vitest.config.ts` — added `react()` plugin, `setupFiles: ['src/test/setup.ts']`, includes `*.test.tsx`
- `package.json` — version 0.2.0 → 0.3.0
- Removed `HelloPanel` import from App.tsx (Sprint 0 placeholder retired)

### Verified

- `pnpm verify` — lint / type-check / test / coverage (72.92% branches, ≥ 70%) / build all green
- 58 unit tests pass across 10 test files (path 4 + parser 8 + serializer 3 + round-trip 10 + types 2 + useArxmlStore 6 + round-trip-mutate 5 + Tree 9 + modes 8 + ParamEditor 3)
- 5-stage CI: GitHub Actions run expected 5/5 green

### Deviations from plan

- `EnumEditor` implemented as text input + tooltip (not `<select>` with 1 option) — see comment in file; schema-aware options land in Sprint 3 Validation
- `Tree` takes `store` prop instead of importing `useArxmlStore` directly — keeps file-ownership boundary clean across the fan-out agents; `App.tsx` wires `<Tree store={useArxmlStore} />`

## [0.2.0] — 2026-06-14 (Sprint 1)

### Added

- `core/arxml/parser.ts` — fast-xml-parser → `ArxmlDocument` (r4.x ECUC subset)
- `core/arxml/serializer.ts` — `ArxmlDocument` → ARXML XML string
- IPC channels: `arxml:open`, `arxml:parse`, `arxml:save`
- preload bridge: `openArxml()`, `parseArxml()`, `saveArxml()`
- renderer component: `ArxmlPanel` with Open / Save buttons
- 5 round-trip test fixtures from S32K148_EAS_EB_3399A user工程
  (Det_Det, EcuC_EcuC, Com_Com, PduR_PduR, WdgIf_WdgIf)
- Result<T, E> envelope + FileError + ParseError + SerializeError types in shared/

### Changed

- `core/arxml/types.ts` — `ArxmlReference` gained `dest?: string` field (Sprint 0)
- `package.json` — version 0.1.0 → 0.2.0
- `App.tsx` — now stacks ArxmlPanel below HelloPanel
- `vite.main.config.ts` — `external` extended with `node:fs`

### Verified

- pnpm lint / type-check / test / coverage (core/ ≥ 80%) / build all green
- 18 unit tests pass (types 2 + parser 3 + serializer 3 + round-trip 10)
- 5-stage CI: GitHub Actions run is 5/5 green

## [0.1.0] — 2026-06-13 (Sprint 0)

### Added

- Initial Electron + TypeScript + Vite scaffold
- 5-stage CI on GitHub Actions
- Strict layer separation (core/main/preload/renderer/shared) enforced by ESLint
