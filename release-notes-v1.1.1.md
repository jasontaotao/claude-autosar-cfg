## v1.1.1 — Sprint 16 Fixes Batch

Sprint 16 集中修复 v1.1.0 ship 后发现/回归的几个关键 issue，重点在
DEFINITION-REF 链路 end-to-end 一致 + manifest 路径迁移 + save/delete race。

### Highlights

- **DEFINITION-REF 链路 end-to-end 一致**：parser / addParameter /
  addReference / serializer / skeleton 五层都 stamp `definitionRef`，reload
  后再 save 不丢失
- **v1.1.0 → v1.1.1 manifest 路径迁移透明**：`loadManifest(json, manifestDir?)`
  - `migrateManifestPaths` 接受老 v1.1.0 absolute-path manifest，不需要用户
    手动迁移
- **Save-then-delete race 修复（数据丢失）**：`removeEcucFiles` 在第一个 save
  失败时 `BREAK`，失败的 target 不再被 delete 掉
- **Save All 按钮**：multi-ECUC dirty session 一键 save，每个文件独立的
  partial-failure UI
- **Combined Tree View smart basename wrapper skip**：避免重复嵌套同名 wrapper
- **`<Module>_EcucValues.arxml` 命名规范**：取代 `<Module>_Cfg.arxml`，与
  AUTOSAR 工具链约定一致
- **PICKER exclude + dirty-guard**：picker 选择新文件时排除当前 dirty 文件，
  save failure 提示用户

### 14 commits — 4 sub-sprints

#### Sprint 16a — Atomic fix batch (5 commits)

- `ad57e6a` fix(tree): combined-view smart basename wrapper skip
- `8ac5243` fix(save): silent save-back when currentPath known
- `b767ea6` fix(arxml): write real BSWMD path in DEFINITION-REF
- `8858c9f` refactor(arxml): rename `<Module>_Cfg.arxml` → `<Module>_EcucValues.arxml`
- `a227220` feat(picker): set-semantic exclude with dirty-guard

#### Sprint 16b — T6 + T7 (2 commits)

- `edaff98` fix(project): relativize paths before persisting to manifest
- `5534cce` feat(save): Save All button for multi-ECUC dirty sessions

#### Sprint 16c — 3 blockers + 1 regression catch (4 commits)

- `8fe1d28` fix(project): migrate absolute manifest paths on load (v1.1.0 compat)
- `dc92982` fix(removeEcuc): abort exclude on first save failure (data loss fix)
- `4453d46` fix(addParameter): stamp BSWMD path as definitionRef on new params
  (T3 contract)
- `f7b69a3` fix(parser): preserve definitionRef on in-memory ParamValue
  (Sprint 16c #4 regression catch — controller 抓到 reload-then-save silent
  regression)

#### Maintenance

- `32aee2f` chore(lint): fix import-order in useRemoveEcucFiles and project test
- `f93fc6e` chore(lint): fix import-order in manifest.ts

### Tests

- **1178 tests** passing across 93 test files（1 skipped）
- **0 type errors** (`tsc --noEmit` both projects clean)
- **0 lint errors** (`eslint --max-warnings 0` clean)
- **+149 tests** since v1.1.0 (1029 → 1178)

### Files

- `package.json` version: `1.1.0` → **`1.1.1`** (PATCH — bugfix + minor feature)
- 40 files changed (+3797 / -245) since v1.1.0
- New IPC contracts (all additive, backward compatible):
  - `removeEcucFiles` accepts `phase: 'save' | 'delete'` discriminator
  - `loadManifest(json, manifestDir?)` adds optional `manifestDir`
  - ParamValue / ReferenceValue gain optional `definitionRef?` field
- Migration: `manifestDir` is auto-resolved from manifest file path on load
  if not supplied (v1.1.0 absolute-path manifests work transparently)

### Upgrading from v1.1.0

No breaking changes. v1.1.1 is a **PATCH** release:

- All IPC contract changes are additive (optional params / fields)
- `definitionRef` propagation is backward compatible (old manifests without
  it will be re-stamped on first save)
- v1.1.0 absolute-path manifests are migrated transparently on load — no
  user action required
- `<Module>_Cfg.arxml` files created under v1.1.0 will continue to work;
  new files use the `<Module>_EcucValues.arxml` naming convention

### Known issues / follow-ups

Tracked for v1.1.2:

- `toManifestRelative` already-relative 透传不 reject `..` — caller 必须
  re-validate
- `saveArxmlHandler` 把所有 write error collapse 成单一 kind — 考虑 thread
  `error.code` 给不同 toast
- T5 confirm dialog 3-way type / 2-way production (dead `'continue'` branch)
- T5 picker stale-seed when documents change externally
- T7 CSS for `.app-btn-save-all.is-dirty` (no visual cue)
- T7 zh-CN coverage for `app.saveAllPartial` (English only tested)
- `info`/`notice` channel for success toasts (currently red ErrorBanner)
- Cross-task: consolidate "find doc by filePath" into a single store selector
- `buildCombinedDocument` flat-mode shows duplicate root packages
  (e.g. two `EAS`) — documented but UX regression

### Verification

```text
=== Stage: format ===      PASS (prettier --check clean)
=== Stage: lint ===        PASS (eslint --max-warnings 0 clean)
=== Stage: type-check ===  PASS (tsc --noEmit both projects clean)
=== Stage: test ===        PASS (1178 passed | 1 skipped)
=== Stage: build ===       PASS (vite build renderer + main + preload)
```

> Note: 5/5 baseline + coverage stage deferred to next release cycle
> (v1.1.2 polish sprint will re-run baseline verification after known
> issue fixes land).
