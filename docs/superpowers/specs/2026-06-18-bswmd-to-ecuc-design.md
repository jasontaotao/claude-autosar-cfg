# Create ECUC Module from BSWMD — Design Spec

**Status**: APPROVED (user approved 2026-06-18; implementation complete 2026-06-18 in Sprint 14)
**Date**: 2026-06-18
**Author**: brainstorming skill (claude-AutosarCfg Sprint 14)
**Supersedes**: —
**Related**: [[2026-06-17-sprint-13-1-templates-backend-design]] (BSWMD loading),
[[2026-06-18-sprint-13-master-roadmap]] (parent roadmap)

## Implementation Outcome

- **Commits**: 14 task commits + 3 side fixes (archive-move, tsc/lint cleanup, orphan i18n keys)
- **Tests**: 1029 → 1076 (47 new tests across core/store/hook/component/IPC layers)
- **Coverage**: 96.8% stmts / 87.77% branches / 100% funcs
- **Plan drift**: §15 Q1-Q9 all resolved per user approval; minor adaptations documented in `.git/sdd/task-N-report.md`
- **Real model**: plan sketch assumed pre-Sprint-12 root-based `ArxmlElement`; actual implementation uses post-Sprint-12 packages + discriminated union. All adaptations preserve semantic intent.

## 1. Problem

After a user loads a BSWMD file (which lists all available ECUC modules,
containers, params, references), there is currently **no way to instantiate
one as an ECUC value-side .arxml inside their project**. The schema-side
data is in the store (`bswmdSchemas[]`) but never flows into a writable
value-side document. This blocks the core "configure my ECU" workflow.

## 2. Goal

Give the user a discoverable, low-friction way to create an ECUC
value-side skeleton .arxml from any module declared in any loaded BSWMD,
and add it to the active project with one atomic action.

## 3. Non-Goals

- Editing / configuring parameters inside the generated skeleton (covered by existing ParamEditor)
- Multi-instance handling at module level (BSWMD author-set; user cannot create 2× `Can` modules)
- Creating a project from BSWMD (separate flow — NewProjectDialog has the template picker)
- Importing / parsing a pre-existing ECUC skeleton (covered by Open ARXML flow)

## 4. UX Recommendation (Option C: dual entry, shared picker)

**Two entry points share one picker component:**

1. **Menu entry** (primary, discoverable)
   - `AppHeader` dropdown → `fileOps` group → `ECUC模块选择...`
   - Disabled when no BSWMD loaded or project not open (tooltipped)

2. **Inline "+" entry** (secondary, fast)
   - `ProjectPanel` BSWMD list — each loaded BSWMD gets a "+" button on the right
   - Opens the same picker with that BSWMD pre-selected, so user skips the BSWMD picker step

Both paths converge on `<ModuleFromBswmdPicker />`, which is parameterized
on `preSelectedBswmdPath?: string`.

**Why dual entry** (vs single menu / single "+"):
- Menu matches EB tresos / Vector DaVinci / Artop convention — discoverable
- "+" matches the pattern users already see on the project panel
- One picker, one skeleton generator, two entry triggers — clean reuse

### 4.1 Picker is multi-select (checkbox)

The picker is **multi-select via checkbox**, not single-select via radio.
User can check N modules across N BSWMDs and create N ECUC skeletons
in one action. Rationale:

- Real projects set up many modules at once (Can, CanIf, CanTp, ComM, PduR, Nm...) — single-select forces user to repeat the flow
- Matches Artop / Eclipse "select multiple types" pattern in New Element wizards
- BSWMD files are stable — once loaded, the user knows what they want; bulk-create is the natural flow

UI: left pane rows are `☐ Module` checkboxes (not click-to-select rows).
Right pane shows aggregate: count + list of will-create files + collision warnings.

### 4.2 Collision handling (cross-BSWMD same module)

**Problem**: User loads BSWMD_A declaring `Can` and BSWMD_B also declaring
`Can` (different vendor / version / dialect). Both checkboxes are
independently selectable. Default file naming `<ModuleShortName>_Cfg.arxml`
collides for the same shortName.

**Resolution strategy** (recommended):

| Scenario | File naming |
|---|---|
| Single BSWMD, single `Can` | `Can_Cfg.arxml` |
| Two BSWMDs both have `Can`, only one checked | `Can_Cfg.arxml` |
| Two BSWMDs both have `Can`, BOTH checked | `Can_Cfg.arxml` + `Can__<vendorKey>_Cfg.arxml` (double underscore = collision marker) |

`<vendorKey>` is derived from BSWMD file basename (e.g.
`Can_Bswmd.arxml` → `Bswmd`, `Intewell_42.arxml` → `Intewell_42`),
stripped of `.arxml` and lowercased. If two BSWMDs have the same basename,
fall back to numeric suffix: `Can__Bswmd_1_Cfg.arxml`,
`Can__Bswmd_2_Cfg.arxml`.

Picker shows the disambiguated filenames in the right pane **before**
the user confirms, so collisions are visible. Example:

```
Selected (3): ☐ Can (Can_bswmd.arxml)   ☐ CanIf  ☐ Can
                ↑ selected from BSWMD A   ↑↑ from BSWMD B

Will create:
  D:/work/BMS/Can_Cfg.arxml        ← from Can_bswmd.arxml
  D:/work/BMS/CanIf_Cfg.arxml
  D:/work/BMS/Can__intewell_Cfg.arxml  ← collision: vendor suffix
```

If the user disagrees with the auto-naming (e.g. wants both files
named `Can_Cfg.arxml` because they intend to manually merge), they
uncheck one of the conflicting modules. Picker **does not** provide a
rename field — collisions are resolved by selection, not by typing.

**Tracking**: `ArxmlDocument.sourceBswmdPath` (added in §14.1) carries
the originating BSWMD path, so a file with name `Can__intewell_Cfg.arxml`
can be traced back to which BSWMD it came from even after the fact.

## 5. UX Flow (主路径 / 快速路径)

### 主路径 (菜单入口)

```
1. User: AppHeader 菜单 → "ECUC模块选择..."
2. System: opens <ModuleFromBswmdPicker /> modal
   Left pane: BSWMD tree with checkbox rows
     Each BSWMD collapsible; modules listed as ☐ <shortName> <vendor path>
     Top: filter textbox (substr match on shortName OR vendor path)
     Bottom-left: [全选当前 BSWMD] [全不选] buttons
   Right pane: aggregate summary of selection
     - "Selected: N modules"
     - List of will-create files (with collision-disambiguated names)
     - Warnings (e.g. "2 个 Can 模块被勾选，将自动加后缀")
     - Existing-file conflicts ("Can_Cfg.arxml 已存在 — 将覆盖")
   Bottom: [取消] [创建 N 个 ECUC >]
3. User: checks N modules (0 ≤ N, 0 disables button)
4. User: clicks "创建 N 个 ECUC"
5. System: dirty guard (SwitchingAction = 'createEcuc')
6. System: for each selected module (sequentially, atomic per file):
   a. Compute file path (collision rule from §4.2)
   b. generateEcucSkeleton(bswmdDoc, moduleShortName) → ArxmlDocument
   c. If file exists: add to "overwrite confirm" set
   d. After ALL collision/overwrite checks passed: IPC write + addDocument
7. If any overwrite detected: ConfirmDialog "覆盖以下 N 个文件?"
   [取消] [覆盖]
8. On confirm: bulk-write all N files, addDocument each, revalidate
9. System: closes modal, shows aggregate toast "已新建 N 个 ECUC 文件"
   FileListTab highlights new rows (or first new if any)
```

### 快速路径 ("+" 入口)

```
1. User: ProjectPanel → clicks "+" next to a BSWMD row
2. System: opens picker with that BSWMD pre-selected and ALL its
   non-disabled modules already checked (since "+" implies intent
   to use this specific BSWMD)
3. User: unchecks what they don't want, or adds from other BSWMDs
4. User: clicks "创建 N 个 ECUC" → (same as 主路径 step 5-9)
```

### Edge / Error Cases

| Condition | Behavior |
|---|---|
| No BSWMD loaded | Menu item disabled + tooltip "请先加载 BSWMD"; "+" buttons in ProjectPanel hidden |
| No project open (loose mode) | Menu item disabled + tooltip "请先新建/打开项目"; "+" buttons hidden |
| User selects module whose `<Module>_Cfg.arxml` already exists | Overwrite confirm (collected for batch; one dialog for all N) |
| Same moduleShortName across BSWMDs, both checked | Auto-suffix per §4.2; right pane previews both names |
| Selected module is at upper module-level multiplicity | Picker checkbox row disabled + tooltip "已达实例上限 (1/1)" |
| Generation throws (filesystem write fail, etc.) | store.error set; modal stays open with error banner; partial success written so far stays |
| Network/disk fails mid-batch | Roll back: delete the N files already written before failure; show error |

## 6. Architecture

```
+---------------------------------------------------+
|  AppHeader (existing)                             |
|  + fileOps group: <button "ECUC模块选择..."/>   |
+---------------------------------------------------+
                       | onClick
                       v
+---------------------------------------------------+
|  ModuleFromBswmdPicker (NEW component)            |
|  props:                                           |
|    open: boolean                                  |
|    onClose: () => void                            |
|    onConfirm: (selected: PickedModule[]) => void  |
|    preSelectedBswmdPath?: string                  |
|  state (local):                                   |
|    filter: string                                 |
|    selected: Set<`${bswmdPath}::${module}`>       |
|  reads from store:                                |
|    bswmdSchemas, bswmdPaths                       |
|  on confirm:                                      |
|    emit PickedModule[]                            |
+---------------------------------------------------+
                       |
                       v
+---------------------------------------------------+
|  useCreateEcucFromBswmd (NEW hook)                |
|  - dirty guard (SwitchingAction = 'createEcuc')   |
|  - computeCollisionNames(selected) → Map          |
|  - overwrite pre-check (existing files)           |
|  - for each: generate skeleton + IPC write +      |
|    store.addDocument                              |
|  - partial-failure rollback                       |
|  - dirty flag = true                              |
+---------------------------------------------------+
                       |
                       v
+---------------------------------------------------+
|  generateEcucSkeleton (NEW pure fn in core/)      |
|  in: (BswmdDocument, moduleShortName)             |
|  out: ArxmlDocument                               |
+---------------------------------------------------+
                       |
                       v
+---------------------------------------------------+
|  resolveCollisionFilename (NEW pure fn in core/)  |
|  in: (selected, projectDir)                       |
|  out: Map<PickedModule, finalFilePath>           |
+---------------------------------------------------+
                       |
                       v
+---------------------------------------------------+
|  core/arxml/skeleton.ts (NEW file)                |
|  exports:                                         |
|    generateEcucSkeleton(...)                      |
|    resolveCollisionFilename(...)                  |
|    type PickedModule                              |
+---------------------------------------------------+
```

### Component / Module boundaries

- **`<ModuleFromBswmdPicker />`** (renderer/components/) — pure UI, no IPC. Reads bswmdSchemas/bswmdPaths from store. Emits PickedModule[] on confirm.
- **`generateEcucSkeleton()`** (core/arxml/skeleton.ts) — pure function, no I/O, no Zustand, no React. Easily unit-tested. Input: BswmdDocument + moduleShortName. Output: ArxmlDocument.
- **`resolveCollisionFilename()`** (core/arxml/skeleton.ts) — pure function. Takes the full selection set and produces a deterministic filename for each picked module. Handles cross-BSWMD collisions per §4.2.
- **`useCreateEcucFromBswmd()`** (renderer/hooks/) — orchestration. Glue between picker → IPC write → store update. Mirrors the pattern of `useProjectActions.addBswmdFromDialog`. Adds rollback for partial batch failure.

## 7. Data Flow

```
picker (UI state)
   │
   │ selected = { bswmdPath, moduleShortName }
   ▼
useCreateEcucFromBswmd (hook)
   │
   │ 1. dirty guard via guardedDirtySwitch
   │ 2. look up BswmdDocument from store.bswmdSchemas
   │ 3. call generateEcucSkeleton(doc, moduleShortName) → ArxmlDocument
   │ 4. compute filePath = `${projectDir}/${moduleShortName}_Cfg.arxml`
   │ 5. IPC: window.autosarApi.projectWriteArxml({ filePath, content })  ← NEW IPC
   │ 6. store.addDocument(doc, filePath)
   │    → revalidates with current bswmdSchemas
   ▼
File on disk + Tree updates + ValidationPanel refresh
```

## 8. New IPC contract

```ts
// src/shared/ipc-contract.ts (ADD)
export const PROJECT_WRITE_ARXML = 'project:writeArxml';

// src/shared/types.ts (ADD)
export interface ProjectWriteArxmlRequest {
  readonly filePath: string;       // absolute path
  readonly content: string;         // serialized arxml (utf-8)
}
export interface ProjectWriteArxmlResult {
  readonly kind: 'ok' | 'write-failed';
  readonly message?: string;
}
```

Implementation: `src/main/ipc/projectWriteArxmlHandler.ts` — wraps fs.writeFile with directory-creation guard (mkdirp parent). Returns `{ kind: 'write-failed', message }` on any error (no throw).

Preload: expose `writeArxml(req: ProjectWriteArxmlRequest): Promise<ProjectWriteArxmlResult>`.

## 9. Error handling

| Failure mode | Detection | User-facing |
|---|---|---|
| No BSWMD loaded | `bswmdSchemas.length === 0` at render | Menu disabled, "+" hidden |
| No project open | `project === null` | Menu disabled, "+" hidden |
| File exists | `fs.existsSync(filePath)` before write | ConfirmDialog overwrite |
| Write fails (EACCES, ENOSPC) | catch in IPC handler | Inline picker error + store.error banner |
| Skeleton gen throws | catch in useCreateEcucFromBswmd | Inline picker error |
| Module shortName collision (different BSWMD, same name) | check existing manifest.valueArxmlPaths | ConfirmDialog "覆盖?" |

## 10. i18n keys (8 new keys, zh-CN + en parity)

```
ecuc.fromBswmd.menu          "ECUC模块选择..."  / "New ECUC Module from BSWMD..."
ecuc.fromBswmd.disabledNoBswmd  "请先加载 BSWMD"            / "Load a BSWMD first"
ecuc.fromBswmd.disabledNoProject "请先新建/打开项目"        / "Create or open a project first"
ecuc.fromBswmd.filter         "过滤 (模块名 / vendor 路径)" / "Filter (module name / vendor path)"
ecuc.fromBswmd.metadata      "元信息"                       / "Metadata"
ecuc.fromBswmd.confirmOverwrite  "覆盖现有文件 {path}?"      / "Overwrite existing file {path}?"
ecuc.fromBswmd.upperBoundReached "已达实例上限 ({current}/{max})" / "Upper bound reached ({current}/{max})"
ecuc.fromBswmd.toast          "已新建 {filename}"           / "Created {filename}"
```

## 11. Files Changed (predicted)

| Action | File |
|---|---|
| NEW | `src/core/arxml/skeleton.ts` — pure skeleton generator + `resolveCollisionFilename()` |
| NEW | `src/core/arxml/__tests__/skeleton.test.ts` — unit tests (incl. collision resolution) |
| NEW | `src/renderer/components/ModuleFromBswmdPicker.tsx` — multi-select picker |
| NEW | `src/renderer/components/ModuleFromBswmdPicker.css` |
| NEW | `src/renderer/components/__tests__/ModuleFromBswmdPicker.test.tsx` |
| NEW | `src/renderer/hooks/useCreateEcucFromBswmd.ts` — batch orchestration + rollback |
| NEW | `src/main/ipc/projectWriteArxmlHandler.ts` — supports batch write (multiple paths in one IPC) |
| MODIFY | `src/main/ipc/register.ts` — register PROJECT_WRITE_ARXML_BATCH |
| MODIFY | `src/preload/index.ts` — expose writeArxmlBatch |
| MODIFY | `src/shared/ipc-contract.ts` — add channel + types |
| MODIFY | `src/shared/types.ts` — add request/result types |
| MODIFY | `src/shared/types.ts` — add `sourceBswmdPath?: string` to `ArxmlDocument` |
| MODIFY | `src/shared/i18n.ts` — add 12 keys (8 base + 4 collision) |
| MODIFY | `src/renderer/components/AppHeader.tsx` — add menu entry under fileOps |
| MODIFY | `src/renderer/components/ProjectPanel.tsx` — add "+" button per BSWMD row |
| MODIFY | `src/renderer/components/App.tsx` — mount <ModuleFromBswmdPicker /> |

## 12. Testing strategy

| Layer | Coverage target |
|---|---|
| `generateEcucSkeleton` unit | ≥ 95% (pure function, every container shape) |
| `resolveCollisionFilename` unit | ≥ 95% — covers: single pick, multi pick same BSWMD, multi pick different BSWMDs, vendor key extraction from filename, duplicate basename fallback to numeric suffix |
| `ModuleFromBswmdPicker` component | Render with 0/1/many BSWMDs, multi-select checkbox state, filter behavior, disabled states, collision warnings visible, confirm emission (empty array, 1, N) |
| `useCreateEcucFromBswmd` hook | dirty guard, IPC batch call shape, store update for each, partial-failure rollback, overwrite confirm collection |
| E2E (Playwright) | Menu entry → multi-check 3 modules → batch file write → Tree shows 3 new nodes |
| E2E | "+" entry → pre-selected BSWMD with all modules checked → uncheck 1 → confirm → 4 of 5 created |
| E2E | Collision: load 2 BSWMDs both with Can → check both → confirm → 2 files created (one with vendor suffix) |

Total new tests: ~35 unit (incl. 8 collision) + ~10 component + ~6 E2E = **~51 new tests**.

## 13. Out of Scope (deferred)

- "Save as" path picker for skeleton file (auto-place is the convention)
- Editing container default values during skeleton creation (post-creation edit flow)
- Bulk creation (pick N modules, generate N files) — separate UX if needed
- Multiple instances of same module (BSWMD author-set; not user-controllable)

## 14. Reverse operations (BSWMD 移除 / module 禁用)

**This section covers the missing inverse of "Create ECUC from BSWMD"**.

### 14.1 Remove BSWMD with dependents

When the user clicks the × button on a BSWMD row that has ECUC files
created from it, we currently just drop the schema. The dependent
ECUC files become **orphans**: their container/param/ref structure still
references module paths that no schema defines, so validation re-runs
emit a flood of `'schema-unknown'` errors.

**Required flow:**
1. User clicks × on a BSWMD row → count dependents
2. If `dependents.length === 0` → proceed with current `removeBswmd`
3. If `dependents.length > 0` → ConfirmDialog:
   ```
   移除 BSWMD "Can_bswmd.arxml"?

   以下 ECUC 文件依赖此 BSWMD，移除 BSWMD 后它们将失去
   schema 校验（参数/容器将显示 schema-unknown 警告）：

     • Can_Cfg.arxml
     • CanIf_Cfg.arxml

   [取消]  [仅移除 BSWMD（保留 ECUC 文件）]  [移除 BSWMD + 删除依赖文件]
   ```
4. Default focus = "仅移除 BSWMD" (safer; user can manually delete later)

**Implementation:**
- `removeBswmdWithCascade(path)` action in `useProjectActions`
  - Computes `dependents = state.valueArxmlPaths.filter(p => isCreatedFrom(p, path))`
  - If `dependents.length > 0` → open ConfirmDialog
  - On "仅移除" → existing `removeBswmd` flow
  - On "移除 + 删除" → `removeBswmd(path)` + `removeDocument(p)` for each dependent + IPC `project:deleteArxml({ filePath })` (NEW IPC)
- Need to track "created-from BSWMD" relationship:
  - Option A: Add `sourceBswmdPath?: string` field to `ArxmlDocument` (simple, requires editing parser path or skeleton generator)
  - Option B: Derive from path pattern `${projectDir}/${moduleShortName}_Cfg.arxml` (fragile — user might rename)
  - **Recommendation: Option A** — pass `sourceBswmdPath` through the skeleton generator and into the generated `ArxmlDocument`. Set on creation, never re-derived.

### 14.2 Module-level disable (per-BSWMD)

Currently every module declared in a BSWMD is active. Real BSWMDs (e.g.
EB tresos master, AUTOSAR standard) declare 50-100+ modules but users
typically care about 5-10. Two consequences:

1. Picker is cluttered with irrelevant modules
2. Validation emits spurious warnings for modules the user is ignoring

**Required: per-module enable/disable.**

**Data model:**
- Add `BswmdDocument.disabledModules: ReadonlySet<string>` field (Set of
  module shortNames). New BSWMDs default to `new Set()` (all active).
- Migration: existing BSWMD documents in store need `disabledModules:
  new Set()` defaulted on access — `getActiveModules(doc)` returns
  `doc.modules.filter(m => !doc.disabledModules.has(m.shortName))`.

**UI entry — ProjectPanel BSWMD row "modules" popover:**
- Add a "Modules" sub-row under each BSWMD in ProjectPanel (collapsible)
- OR add a "📋" badge button next to "+" that opens a popover with
  checkboxes per module
- OR add a chip group in the picker showing enabled count (e.g.
  "5/12 active") that opens a "Configure modules" modal

**Recommendation: chip badge approach** — least new UI, fits in picker:
- The picker header shows "Modules (5/12 active)" — clickable
- Opens an inline accordion inside the picker showing all modules with
  checkboxes; user can toggle
- Disabled modules are greyed-out in the left tree (same UX as upper-
  multiplicity case, but with reason "Manually disabled")

**Behavior on disable:**
- Picker hides disabled modules (existing ECUC files from disabled
  modules remain — re-enable to bring back into validation)
- Validation re-runs with filtered `buildSchemaLayer` (use
  `getActiveModules(doc)` instead of `doc.modules`)
- Existing ECUC files from now-disabled modules get `schema-unknown`
  warnings — user is responsible for cleanup (consistent with BSWMD
  remove behavior)

**Implementation:**
- `BswmdDocument.disabledModules: ReadonlySet<string>` field
- `setBswmdModuleEnabled(path: string, moduleShortName: string,
  enabled: boolean)` store action
- ProjectPanel BSWMD row: add small "📋 5/12" chip → opens popover with
  module checkboxes
- Picker: shows all modules but disables manually-disabled ones
- `buildSchemaLayer(bswmdSchemas)` filters by `getActiveModules(doc)`
  before producing the layer

### 14.3 Updated files (additions to §11)

| Action | File |
|---|---|
| MODIFY | `src/core/project/bswmd.ts` — add `disabledModules` field to `BswmdDocument` |
| MODIFY | `src/renderer/store/useArxmlStore.ts` — add `sourceBswmdPath` to ArxmlDocument creation, add `setBswmdModuleEnabled` action |
| MODIFY | `src/renderer/components/ProjectPanel.tsx` — add "📋 N/M" chip + popover |
| MODIFY | `src/renderer/components/FileListTab.tsx` — add remove warning hint |
| MODIFY | `src/renderer/hooks/useProjectActions.ts` — add `removeBswmdWithCascade` |
| MODIFY | `src/shared/ipc-contract.ts` — add `PROJECT_DELETE_ARXML` channel |
| NEW | `src/main/ipc/projectDeleteArxmlHandler.ts` |
| MODIFY | `src/shared/i18n.ts` — add 4 new keys for cascade confirm dialog |

### 14.4 New i18n keys (4 additions to §10)

```
ecuc.removeBswmd.cascadeTitle   "移除 BSWMD {name}?"          / "Remove BSWMD {name}?"
ecuc.removeBswmd.cascadeBody    "以下 ECUC 文件依赖此 BSWMD..."  / "These ECUC files depend on this BSWMD..."
ecuc.removeBswmd.onlyBswmd      "仅移除 BSWMD（保留 ECUC）"    / "Remove BSWMD only (keep ECUC)"
ecuc.removeBswmd.cascade        "移除 BSWMD + 删除依赖文件"     / "Remove BSWMD + delete dependents"
```

## 15. Open questions (待 user 拍板)

All questions resolved per user approval (2026-06-18):

- **Q1**: ✅ Option C — menu + 内联 "+" 双入口 (implemented in T11)
- **Q2**: ✅ `${moduleShortName}_Cfg.arxml` (AUTOSAR convention; implemented in T3)
- **Q3**: ✅ Simple overwrite — ConfirmDialog文案保留简洁（"覆盖?"），不在文案里强调"内容丢失"
- **Q4**: ✅ 否 — module count not in ProjectPanel row; use 📋 N/M chip showing active/total (T11)
- **Q5**: ✅ 默认按钮 = "仅移除 BSWMD（保留 ECUC）" (safer default; T12 + Sprint 15 CascadeConfirmDialog reused)
- **Q6**: ✅ Picker 头部 chip via `ecuc.fromBswmd.modulesActive` + `getActiveModules` 过滤 (T4 + T10)
- **Q7**: ✅ Disabled module 已生成的 ECUC 文件保留 (与 BSWMD remove 默认一致)
- **Q8**: ✅ Picker multi-select (checkbox 一次勾 N 个 module 批量创建; T10)
- **Q9**: ✅ 跨 BSWMD 同名 module 自动加 `<vendorKey>` 后缀 (T3 with vendor key + numeric fallback)

### Implementation Notes (post-mortem)

- **Plan drift**: §6 architecture assumed pre-Sprint-12 root-based `ArxmlElement` shape. Actual model is post-Sprint-12 packages + discriminated union. All pure builders (T2/T3) adapted to actual shape while preserving semantic intent. Detailed adaptations in `.git/sdd/task-N-report.md`.
- **IPC channel naming**: §8 spec said `project:writeArxml` (single). Implementation uses `project:writeArxmlBatch` (batch) for atomic N-file write — chosen in plan, accepted.
- **i18n keys count**: §10 had 8 keys for the picker + §14.4 had 4 keys for cascade = 12 total. Plan T9 added 12 `ecuc.fromBswmd.*` keys per brief (note: T9 included `selectedCount`, `willCreate`, `targetDir`, `createN`, `collisionWarn`, `modulesActive` which spec §10 omitted; these were needed for the actual UI). T12 added 4 `ecuc.removeBswmd.*` keys per spec §14.4 — these are currently **orphan** (the active CascadeConfirmDialog uses `confirm.cascade.*` from Sprint 15). Future cleanup: either use the orphan keys or remove them.