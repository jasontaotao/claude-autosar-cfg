# Sprint 17 — BSWMD Remove-From-Disk Interface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Remove BSWMD" interface that complements the existing "Add BSWMD" flow. The current state is one-way: load a BSWMD via `addBswmdFromDialog`, no symmetric remove. Sprint 17 ships the full remove path: 4-option confirmation dialog (cancel / only / cascade / cascade-and-unlink), unified `removeBswmdWithFullFlow` hook that merges dirty-guard + cascade into one state machine, single-level undo via P1's `lastRemoveSnapshot`, and a new `bswmd:delete` IPC that unlinks the BSWMD file from disk on top of the cascade.

**Architecture:** TDD-driven atomic commits, 4 sequential sub-sprints (P1 core IPC + store, P2 dialog + hook merge, P3 UI wiring, P4 integration + E2E). All committed directly to `main` with conventional commits. Version bump `1.5.0` → `1.6.0` (MINOR bump — new feature, GUI scripting + remove-BSWMD workflow).

**Tech Stack:** TypeScript 5 strict + React 18 + Zustand 4 + Vitest 1 + ESLint 8 + Prettier 3 + Electron 30 + fast-xml-parser 4. (No new deps; pure TypeScript changes.)

## Status

| Sub-sprint | Scope                                                                      | Status     | Commit    | Head         |
| ---------- | -------------------------------------------------------------------------- | ---------- | --------- | ------------ |
| **P1**     | Core IPC + Store + i18n + types + undo                                     | ✅ SHIPPED | `fc2bf75` | ahead main 3 |
| **P2**     | Dialog + hook merge + i18n + S14 cleanup                                   | ✅ SHIPPED | `2128e43` | ahead main 3 |
| **P3**     | UI wiring (ProjectPanel onContextMenu + Tree module kind + App.tsx router) | ⏳ PENDING | —         | —            |
| **P4**     | Integration tests + Playwright E2E                                         | ⏳ PENDING | —         | —            |

**Branch baseline:** `main` @ `bdb81f6` (v1.5.1, JWQ3399 P0 fix)

## Global Constraints

| Constraint                | Value                                                                                    | Source                          |
| ------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------- |
| Branch baseline           | `main` @ `bdb81f6` (v1.5.1)                                                              | current HEAD pre-P1             |
| TS strict mode            | ON                                                                                       | `tsconfig.json`                 |
| ESLint `--max-warnings 0` | MUST pass                                                                                | release gate                    |
| Prettier `--check`        | MUST pass                                                                                | release gate                    |
| Test runner               | `pnpm test` (Vitest 1)                                                                   | `package.json`                  |
| Coverage gate             | ≥ 80% lines, ≥ 80% functions, ≥ 70% branches (v1.5.0 baseline ~96.8% stmts)              | release gate                    |
| Commit format             | Conventional Commits (`feat:` / `fix:` / `refactor:` / `chore:` / `test:`)               | global CLAUDE.md                |
| Branch policy             | Direct push to `main` allowed (no PR gate)                                               | verified 2026-06-20             |
| Network workaround        | local `http.proxy=""` + `https.proxy=""` + `credential.helper=manager` (already applied) | [[git-push-network-workaround]] |
| GH release                | gh CLI NOT in PATH; user manually creates release                                        | v1.5.0 pattern                  |

## Design Decisions (locked at P1 design time)

| #   | Decision                              | Choice                                                                                | Rationale                                                                                                                                                                                               |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Dialog vs. reuse CascadeConfirmDialog | **NEW RemoveModuleConfirmDialog (4-option)**                                          | The 4th option (`cascade-and-unlink`) adds disk-unlink of the BSWMD file on top of cascade — a verb the ECUC case has no analog for. Reusing CascadeConfirmDialog would overload enum semantics.        |
| 2   | dirty-guard + cascade dialog          | **MERGE into one function `removeBswmdWithFullFlow`**                                 | P1 design flagged the two-path state-fork risk: cascade dialog already shown but dirty-guard was cancelled. P2 collapses into a single function.                                                        |
| 3   | 'cascade-and-unlink' partial-failure  | Accept as documented design trade-off                                                 | If disk unlink fails, dependent ARXMLs are already gone (cascade half completed). User has no obvious recovery path. Documented in design; not blocking.                                                |
| 4   | on-disk file unlink                   | New `bswmd:delete` IPC (NOT reuse `project:deleteArxml`)                              | Different channel name keeps the type system honest about which channel flows. Body is byte-for-byte identical to `projectDeleteArxmlHandler`.                                                          |
| 5   | Undo scope                            | **Single-level, in-memory only**                                                      | `undoLastRemoveBswmd` restores the captured `BswmdDocument` from `lastRemoveSnapshot`. The on-disk BSWMD file is NOT restored (gone). Matches `undoLastCommit` constraint.                              |
| 6   | cross-BSWMD reference detection       | **YAGNI v1 — not implemented**                                                        | Today codebase has no tool to enumerate "BSWMD-A module referenced from BSWMD-B". Documented as known limitation. v1 only scans `sourceBswmdPath` chain (Sprint 14 BSWMD-to-ECUC generated dependents). |
| 7   | UI entry points (P3)                  | **DUAL**: ProjectPanel `<li>` row right-click + Tree `kind:'module'` node right-click | Reuses Sprint 16's `App.tsx:283-295` `handleContextMenu` + `useArxmlStore.ts:283-295` router pattern.                                                                                                   |

## File Structure

**Created by P1 (✅ SHIPPED):**

| File                                                                     | Responsibility                                                     | Lines |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ | ----- |
| `src/main/ipc/bswmdDeleteHandler.ts`                                     | `bswmd:delete` IPC handler (fs.unlink + ok/not-found/write-failed) | 39    |
| `src/main/ipc/__tests__/bswmdDeleteHandler.test.ts`                      | 3 IPC tests (ok / not-found / write-failed)                        | 92    |
| `src/renderer/store/__tests__/useArxmlStore.removeBswmdFromDisk.test.ts` | 7 store tests for `removeBswmdFromDisk` + `undoLastRemoveBswmd`    | 226   |

**Created by P2 (✅ SHIPPED):**

| File                                                                   | Responsibility                                                 | Lines |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- | ----- |
| `src/renderer/components/RemoveModuleConfirmDialog.tsx`                | 4-option modal dialog (cancel/only/cascade/cascade-and-unlink) | 242   |
| `src/renderer/components/RemoveModuleConfirmDialog.css`                | Visual shell (z-index 9997)                                    | 163   |
| `src/renderer/components/__tests__/RemoveModuleConfirmDialog.test.tsx` | 13 dialog tests                                                | 224   |
| `src/renderer/hooks/__tests__/useProjectActions.removeBswmd.test.ts`   | 7 hook tests for `removeBswmdWithFullFlow`                     | 308   |

**Modified by P1 (✅ SHIPPED):**

| File                                  | Change                                                                                                                                                                                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/ipc-contract.ts`          | +`BSWMD_DELETE: 'bswmd:delete'` channel constant                                                                                                                                                                                                                |
| `src/shared/types.ts`                 | +`ProjectDeleteBswmdRequest/Result` (mirror of Arxml versions)                                                                                                                                                                                                  |
| `src/main/ipc/register.ts`            | +`bswmdDeleteHandler` import + `ipcMain.handle` registration                                                                                                                                                                                                    |
| `src/preload/index.ts`                | +`deleteBswmd({ filePath })` bridge method                                                                                                                                                                                                                      |
| `src/shared/i18n.ts`                  | +`app.error.removeBswmdFromDisk` (zh-CN + en)                                                                                                                                                                                                                   |
| `src/renderer/store/useArxmlStore.ts` | +`BswmdRemoveSnapshot` type, +`lastRemoveSnapshot` slice, +`removeBswmdFromDisk` action, +`undoLastRemoveBswmd` action, +`clear()` resets new slice, **drive-by fix**: removed pre-existing duplicate `bswmdSchemas/bswmdPaths` block in `openProject` (TS1117) |
| `.eslintignore`                       | +`claude-AutosarCfg/` (gitignored local regen scripts)                                                                                                                                                                                                          |

**Modified by P2 (✅ SHIPPED):**

| File                                                         | Change                                                                                                                                                                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/renderer/hooks/useProjectActions.ts`                    | -`removeBswmdWithCascade`, +`removeBswmdWithFullFlow` (unified dirty-guard + 4-option dispatch), maps P1's `write-failed` → `error` envelope                                                       |
| `src/renderer/App.tsx`                                       | +`<RemoveModuleConfirmRoot />` mount (imported after `PromptDialog` per `import/order`)                                                                                                            |
| `src/shared/i18n.ts`                                         | +`confirm.removeBswmd.{title,message,cancel,only,cascade,cascadeAndUnlink}` (zh-CN + en)                                                                                                           |
| `src/renderer/hooks/__tests__/useProjectActions.s14.test.ts` | -4 old `removeBswmdWithCascade` behavioral tests (function removed), -unused imports/helpers, kept 1 i18n contract test for `confirm.cascade.*` keys (still consumed by ECUC CascadeConfirmDialog) |

**P3 (⏳ PENDING) — to be created/modified:**

| File                                                                        | Change                                                                                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/renderer/components/ProjectPanel.tsx`                                  | +onContextMenu on `<li>` rows in `<FileList>` (BSWMD section), call `openContextMenu({path, kind:'bswmd', shortName: basename(path)}, e.clientX, e.clientY)` |
| `src/renderer/components/LeftPanel.tsx`                                     | +`removeBswmdWithFullFlow` import, pass to `onRemoveBswmd` callback (replacing `removeBswmdWithGuard`)                                                       |
| `src/renderer/components/tree/TreeNode.tsx`                                 | +resolve `kind:'module'` → look up `sourceBswmdPath` from store, forward to context-menu on right-click                                                      |
| `src/renderer/components/ContextMenu.tsx`                                   | +new action type `'remove-module'`, +new menu item "Remove module" (visible when `kind === 'bswmd'` or resolved module)                                      |
| `src/renderer/App.tsx`                                                      | +case `'remove-module'` in `handleContextMenuAction` (router at `App.tsx:308-343`) — call `useProjectActions.removeBswmdWithFullFlow(path)`                  |
| `src/shared/i18n.ts`                                                        | +`contextMenu.removeModule` key (zh-CN + en)                                                                                                                 |
| `src/renderer/components/__tests__/ContextMenu.test.tsx` (or new test file) | +test "Remove module" menu item shows for BSWMD row right-click + module tree right-click                                                                    |

**P4 (⏳ PENDING) — to be created:**

| File                                                               | Change                                                                                                                      |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `src/renderer/__tests__/integration/removeBswmd.fullFlow.test.tsx` | end-to-end: openProject → addBswmd → useCreateEcucFromBswmd → 4-option dialog (each path) → verify disk + store state       |
| `tests/e2e/remove-bswmd.spec.ts`                                   | Playwright: click × on BSWMD row with dependents → assert cascade dialog → pick each option → verify file gone + UI updated |
| `tests/e2e/remove-bswmd-from-disk.spec.ts`                         | Playwright: right-click BSWMD row → "Remove module" → "cascade-and-unlink" → verify file gone from disk                     |

## Sequencing

```
P1 (✅ SHIPPED, fc2bf75):
  T1.1 → T1.2 → T1.3 → T1.4 (i18n keys, parallel-safe)

P2 (✅ SHIPPED, 2128e43):
  T2.1 → T2.2 (S14 test cleanup parallel-safe)

P3 (⏳ PENDING):
  T3.1 → T3.2 (ProjectPanel onContextMenu + Tree forwarding, parallel-safe)
  T3.3 (App.tsx router + ContextMenu item, depends on T3.1+T3.2)
  T3.4 (LeftPanel rewrite to removeBswmdWithFullFlow, independent of T3.1-T3.3)

P4 (⏳ PENDING):
  T4.1 (integration test, depends on P3)
  T4.2 (Playwright E2E add+remove flow)
  T4.3 (Playwright E2E remove-from-disk flow)

Release:
  → version bump 1.5.0 → 1.6.0 + CHANGELOG + release-notes + push + tag v1.6.0
```

---

## P1 — Core IPC + Store Foundation (✅ SHIPPED at `fc2bf75`)

### T1.1 — `bswmdDeleteHandler` + IPC channel + types

**Files:**

- Create: `src/main/ipc/bswmdDeleteHandler.ts` (39 lines)
- Create: `src/main/ipc/__tests__/bswmdDeleteHandler.test.ts` (92 lines, 3 cases)
- Modify: `src/shared/ipc-contract.ts` (+`BSWMD_DELETE: 'bswmd:delete'`)
- Modify: `src/shared/types.ts` (+`ProjectDeleteBswmdRequest/Result`)
- Modify: `src/main/ipc/register.ts` (+`bswmdDeleteHandler` import + `ipcMain.handle` registration)
- Modify: `src/preload/index.ts` (+`deleteBswmd({ filePath })` bridge method)

**Acceptance:** `pnpm test src/main/ipc/__tests__/bswmdDeleteHandler.test.ts` passes 3/3. `pnpm type-check` clean. `pnpm lint` clean.

### T1.2 — `removeBswmdFromDisk` store action

**Files:**

- Modify: `src/renderer/store/useArxmlStore.ts` (+`BswmdRemoveSnapshot` type, +`lastRemoveSnapshot: BswmdRemoveSnapshot | null` slice, +`removeBswmdFromDisk(path)` action, +reset in `clear()`, **drive-by fix** remove duplicate `bswmdSchemas/bswmdPaths` block in `openProject`)

**Acceptance:** TypeScript compiles. Action signature: `Promise<{ kind: 'ok' | 'canceled' | 'write-failed'; message?: string }>`.

### T1.3 — `undoLastRemoveBswmd` store action

**Files:**

- Modify: `src/renderer/store/useArxmlStore.ts` (+`undoLastRemoveBswmd()` action, mirrors `undoLastCommit` shape)

**Acceptance:** Single-level undo. Snapshot cleared on undo. Re-insert schema via `projectSyncAddBswmdPath`.

### T1.4 — i18n key `app.error.removeBswmdFromDisk`

**Files:**

- Modify: `src/shared/i18n.ts` (+type entry, +zh-CN, +en)

**Acceptance:** `t('zh-CN', 'app.error.removeBswmdFromDisk', { message: 'X' })` returns `"从磁盘移除 BSWMD 失败: X"`.

---

## P2 — Dialog + Hook Merge (✅ SHIPPED at `2128e43`)

### T2.1 — `RemoveModuleConfirmDialog` (4-option) + CSS

**Files:**

- Create: `src/renderer/components/RemoveModuleConfirmDialog.tsx` (242 lines)
- Create: `src/renderer/components/RemoveModuleConfirmDialog.css` (163 lines)
- Create: `src/renderer/components/__tests__/RemoveModuleConfirmDialog.test.tsx` (224 lines, 13 cases)

**Acceptance:** 13/13 dialog tests pass. autoFocus on `'only'`. Esc / backdrop click resolve to `'cancel'`. z-index 9997.

### T2.2 — `removeBswmdWithFullFlow` hook + S14 cleanup

**Files:**

- Modify: `src/renderer/hooks/useProjectActions.ts` (-`removeBswmdWithCascade`, +`removeBswmdWithFullFlow`)
- Modify: `src/renderer/hooks/__tests__/useProjectActions.s14.test.ts` (-4 old tests, -unused imports, kept 1 i18n contract test)

**Acceptance:** 7 hook tests pass. Maps P1's `write-failed` → `error` envelope. All 4 dialog dispatch paths work.

---

## P3 — UI Wiring (⏳ PENDING)

### T3.1 — ProjectPanel `<li>` onContextMenu

**Files:**

- Modify: `src/renderer/components/ProjectPanel.tsx` (+onContextMenu handler in `<FileList>` BSWMD row section)
- Add test: project-panel context menu shows "Remove module" item

**Acceptance:** Right-click on a BSWMD row in ProjectPanel shows context menu with "Remove module" entry.

### T3.2 — Tree `kind:'module'` forwarding

**Files:**

- Modify: `src/renderer/components/tree/TreeNode.tsx` (+`sourceBswmdPath` resolution, +context menu trigger for modules)

**Acceptance:** Right-click on a module tree node shows the same context menu as ProjectPanel row.

### T3.3 — App.tsx router + ContextMenu item

**Files:**

- Modify: `src/renderer/components/ContextMenu.tsx` (+action type `'remove-module'`, +menu item)
- Modify: `src/renderer/App.tsx` (+case in `handleContextMenuAction` switch)
- Modify: `src/shared/i18n.ts` (+`contextMenu.removeModule`)

**Acceptance:** Clicking "Remove module" in any context menu triggers `useProjectActions.removeBswmdWithFullFlow(path)`.

### T3.4 — LeftPanel × button rewrite

**Files:**

- Modify: `src/renderer/components/LeftPanel.tsx` (replace `removeBswmdWithGuard` import with `removeBswmdWithFullFlow`)

**Acceptance:** The `×` button on ProjectPanel rows now shows the 4-option dialog when dependents exist (was: silently remove in-memory).

---

## P4 — Integration + E2E (⏳ PENDING)

### T4.1 — Integration test (full flow)

**Files:**

- Create: `src/renderer/__tests__/integration/removeBswmd.fullFlow.test.tsx`

**Acceptance:** openProject → addBswmd → useCreateEcucFromBswmd → trigger 4-option dialog (each choice) → verify store + IPC calls.

### T4.2 — Playwright E2E (add + remove with cascade)

**Files:**

- Create: `tests/e2e/remove-bswmd.spec.ts`

**Acceptance:** Add BSWMD via dialog → assert BSWMD appears in ProjectPanel → right-click → "Remove module" → "cascade" → assert dependent ARXML gone from disk.

### T4.3 — Playwright E2E (cascade-and-unlink from disk)

**Files:**

- Create: `tests/e2e/remove-bswmd-from-disk.spec.ts`

**Acceptance:** Right-click BSWMD row → "Remove module" → "cascade-and-unlink" → assert BSWMD file gone from disk via fs.stat (ENOENT).

---

## Release

- Bump `package.json` `1.5.0` → `1.6.0` (MINOR — new feature)
- Add CHANGELOG entry for v1.6.0 (3 sub-sprints: P1+P2 shipped, P3+P4 plan)
- Generate `release-notes-v1.6.0.md` (mirror v1.5.0 format)
- `git push origin main`
- `git tag -a v1.6.0 -m "Sprint 17: BSWMD remove-from-disk interface"`
- `git push origin v1.6.0`
- User manually creates GitHub release (gh CLI not in PATH)

## Post-mortem (post-P2)

| What worked                                                                                       | What didn't                                                                                                                     |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| TDD discipline caught `clear()` missing `lastRemoveSnapshot` reset (one test failure, 1-line fix) | Code review flagged partial-failure UX risk on 'cascade-and-unlink' — should have surfaced during design phase, not code review |
| Pre-existing `useArxmlStore.s14.test.ts` → 4 tests removed cleanly when function removed          | User WIP (validation refactor) overlapped with my commit window; had to be careful about staging                                |
| IPC handler byte-for-byte parity with `projectDeleteArxmlHandler` makes the codebase consistent   | `RemoveBswmdChoice` kebab-case `'cascade-and-unlink'` vs camelCase `cascadeAndUnlink` i18n key — minor inconsistency            |
| `code-architect` agent's upfront design paid off — 4-phase plan executed cleanly                  | `App.tsx` import order required re-arranging to add new dialog mount; lint should have caught earlier                           |

## References

- **Spec**: P1 design (code-architect agent investigation report, 2026-06-20) — no separate `docs/superpowers/specs/` file; design rationale in this plan's "Design Decisions" section
- **Sprint 14 BSWMD-to-ECUC**: `docs/superpowers/specs/2026-06-18-bswmd-ecuc-skeleton-defaults-design.md` — explains `sourceBswmdPath` field used in `findDependentsOfBswmd`
- **Sprint 15 ECUC Add/Delete**: `docs/superpowers/specs/2026-06-18-ecuc-mutation-design.md` — design pattern for `CascadeConfirmDialog` (3-option); P2 mirrors with 4-option
- **Sprint 16 context-menu wire-up**: `App.tsx:283-295` + `useArxmlStore.ts:283-295` — P3 reuses the `handleContextMenu` router pattern
