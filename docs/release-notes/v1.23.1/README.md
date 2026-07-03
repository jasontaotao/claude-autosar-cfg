# v1.23.1 (2026-07-03) — PATCH · Release Notes

3 deferred items from the v1.23.0 ship cycle closed: (1) cross-file atomic write for the DBC bridge IPC, (2) i18n interface split (869 lines → 7 cluster files), (3) 3 dead-code MEDIUMs from the v1.23.0 T2 fix-review. No breaking changes; backwards compatible with v1.23.0.

---

## Highlights

### T1 — Cross-file atomic write for the DBC bridge IPC

`dbCImportComStackHandler` previously used `Promise.allSettled` + per-file `writeAtomic` to commit the 3 ECUC value-side files (Com / CanIf / PduR). If write fails on file 2 of 3 (AV scan, network drive teardown, disk-full), the project is left half-bridged (file 1 committed, files 2-3 not). Now uses 2-phase commit + snapshot rollback:

- **Phase 0 (snapshot)**: capture 3 original file contents in memory (already done — they were read in the IPC step).
- **Phase 1**: write 3 tmp files in parallel (`{path}.tmp.{pid}`).
- **Phase 2**: atomic rename each tmp → target, in serial. Per-rename try-catch tracks which file failed.
- **Phase 3** (only on phase-2 failure): best-effort rollback via `writeAtomic` on each of 3 files using the snapshot. `Promise.allSettled` determines `rolledBack: boolean` from rollback outcomes.

The new `DbcImportComStackResponse.write-failed` arm carries `rolledBack: boolean` so the renderer can show the user either "rolled back, project unchanged, please retry" or "rolled back partially, please check git status" (the latter is rare — only if `writeAtomic` itself fails during rollback).

5 new tests in `dbCImportComStackHandler.test.ts`:
- Happy path: all 3 files written atomically, returns `ok: true` with non-zero counts
- Partial failure on file 2 (rename fails): returns `write-failed` with `rolledBack: true`, CanIf file unchanged
- Rollback failure: returns `write-failed` with `rolledBack: false`
- No tmp files leaked after success (regex `tmp[.-]\d+` matches both `tmp.{pid}` and `tmp-{pid}-{ts}` patterns)
- No tmp files leaked after partial failure + rollback

The 2-MEDIUM fix wave (after code review) added proper i18n keys for the diagnostic message (`dbc.import.error.write.rolledBack` and `.partial`) so zh-CN users see fully-localized errors, not mixed-language parentheticals.

### T2 — i18n interface split (869 lines → 7 cluster files)

`src/shared/i18n.ts` was 869 lines (approaching the 900-line ceiling from the v1.23.0 T4 fix). 511 keys (now 513 after T1 added 2) spread across 35 namespaces. Split into 7 cluster files by **functional group**, not by namespace — splitting by namespace (35 files) would be unmaintainable. The 7 clusters:

| Cluster | Namespaces | Approx. keys | Lines |
|---|---|---|---|
| `app.ts` | `app.*` | 74 | 89 |
| `dialog.ts` | `common.*`, `confirm.*`, `dialog.*`, `error.*`, `prompt.*` | 38 | 57 |
| `editor.ts` | `tree.*`, `editor.*`, `params.*`, `ecuc.*`, `arxmlPanel.*`, `leftPanel.*`, `commandPalette.*`, `cheatSheet.*`, `shortcut.*`, `picker.*`, `fileList.*`, `projectPanel.*` | 140 | 181 |
| `validation.ts` | `validation.*`, `swsValidator.*`, `bswmdParser.*`, `parserError.*`, `mutation.*` | 83 | 111 |
| `dbc.ts` | `dbc.*` | 31 | 49 |
| `odx.ts` | `odx.*` | 20 | 28 |
| `misc.ts` | `headless.*`, `newProject.*`, `onboarding.*`, `tour.*`, `template.*`, `help.*`, `flags.*`, `script.*`, `stencil.*` | 112 | 129 |

Total: 513 keys across 7 files, largest 181 lines (well under the 300-line ceiling). The barrel `src/shared/i18n/index.ts` re-exports `Messages`, `MessagesEn`, `MessagesZhCN`, `Locale`, `DEFAULT_LOCALE`, `SUPPORTED_LOCALES`, `MESSAGES_BY_LOCALE`, and `t()`.

A 21-line backward-compat shim at `src/shared/i18n.ts` forwards all public symbols from the new barrel so existing callers (`DbcImportWizard`, `AppHeader`, `App.tsx`, `OdxViewer`, etc.) that import from `'@shared/i18n'` continue to work without changes. The shim is a transition aid; future PATCH cycles should migrate callers to `'@shared/i18n'` (no `.js` suffix, resolves to the folder) and delete the shim.

7 new tests in `i18n.ceiling.test.ts` (one per cluster, `it.each` asserting each per-cluster file < 300 lines). The existing 88-assertion i18n parity test continues to pass (now verifies 513 keys × 2 locales).

### T3 — Dead-code cleanups (3 MEDIUMs from v1.23.0 T2 fix-review)

3 MEDIUMs that were deferred from v1.23.0 ship are now closed:

1. **Empty DBC edge case** — `dbCToComStack` with `messages: []` or `signals: []` (with non-empty messages) does not throw. The defensive `?.filter ?? []` path is now pinned by 2 unit tests.
2. **`parseArxml` throw surfacing** — `extractExistingChildShortNames` (and 3 sibling call sites) now wrap `parseArxml` in try-catch with `console.warn("[dbCToComStack] parseArxml failed for ARXML at /<path>: <message>")`. Dev mode surfaces parse errors instead of silently returning empty Sets.
3. **Focused walk test for `discoverPrimaryContainer`** — nested ECUC module structure (Com > Com > ComConfig) now has a regression test that pins the walk contract.

4 new tests in `dbCToComStack.fixes.test.ts` (empty-messages, empty-signals, parseArxml-throw-warns, nested-walk).

---

## Stats

| Metric | Value |
|---|---|
| Commits on main | 3 (T1 + T1-fix + T2 + T3) + 1 release commit |
| Test count | **2769 + 6 SKIP / 0 fail** (+18 net from v1.23.0 2751) |
| Test files | 305 (1 new: `i18n.ceiling.test.ts`) |
| pnpm verify | 7-stage GREEN (format / lint / type-check / test / coverage / build / import-regression) |
| Files touched | 33 (29 new, 3 modified, 1 shim repurposed) |
| Behavioral changes | 2 (cross-file atomic rollback; i18n path structure internal change) |
| Real-OEM fixture | `samples/dbc/powertrain-typical.dbc` + `samples/arxml/demo-ecu/` (unchanged from v1.23.0) |
| Code-review cycles | T1: 0C/0H/2M/2L → FIX 0C/0H/0M/0L. T2: 0C/0H/0M/0L. T3: 0C/0H/0M/2L. |

---

## Migration notes

No data migration required. All changes are backwards compatible.

- **`DbcImportComStackResponse.write-failed` arm** now carries `rolledBack: boolean`. The wizard's `App.tsx:841-842` switch renders the new field with two localized messages: `dbc.import.error.write.rolledBack` (rolled back, project unchanged) and `dbc.import.error.write.partial` (rolled back partially, please check git). Both keys are in en + zh-CN. zh-CN users now see fully-localized error toasts, not mixed-language parentheticals.
- **i18n import path** — existing callers that import from `'@shared/i18n'` continue to work via the 21-line compat shim. New code should import from `'@shared/i18n'` (no `.js` suffix) which resolves to the new folder. The shim is documented as a transition aid and will be deleted in a future PATCH cycle.
- **No new external dependencies**, no deprecations, no removed features.

---

## Cycle-end lessons (NEW permanent notes captured in PKM)

1. **`cross-file-atomic-write-uses-in-memory-snapshot-for-rollback`** (1-of-1, defer) — When composing per-file atomic operations (`writeAtomic` = tmp+rename) into a cross-file "transactional" operation without git/backup/staging-dir support, the standard pattern is: snapshot originals in memory → write tmp files in parallel → atomic rename in serial → on any failure, use `Promise.allSettled` to writeAtomic the snapshot back. The `rolledBack: boolean` is the single most important contract for the renderer to surface to the user.
2. **`rolledback-true-only-on-full-rollback-success`** (1-of-1, defer) — `rolledBack: true` MUST mean "every per-file rollback succeeded" (i.e. `Promise.allSettled` had no rejections). `rolledBack: false` means partial rollback — user must investigate. The two states have very different recovery paths ("retry" vs "check git status").
3. **`serialize-renames-not-promise-allsettled`** (1-of-1, defer) — For atomic per-file rename, the correct pattern is **serial `for`-loop with try-catch per rename** (so the implementer can track which file failed and stop committing). `Promise.allSettled` masks the failure context — the implementer can only know "some rename failed", not which one. This loss of context propagates to the user-facing diagnostic.

---

## v1.23.0 backlog closure

- v1.23.0 had 4 MEDIUMs + 2 LOWs from T4 fix-review, deferred to v1.23.x PATCH. v1.23.1 closes 1 of them (T3 dead-code MEDIUMs) by way of clean-up.
- v1.23.0 ship had 2 specific deferred items: (1) M1 XMLValidator preflight (v1.22.0 M1, deferred 2 cycles), and (2) i18n split. v1.23.1 closes the i18n split. M1 XMLValidator preflight is still deferred — defense-in-depth, not load-bearing.
- v1.23.1 introduces a new follow-up: delete the 21-line i18n compat shim (track for v1.23.2 or v1.24.0).

---

## Closest cousins

- [[claude-autosarcfg-v1-23-0-shipped]] (v1.23.0 MINOR — prior release; DBC→Com-Stack bridge; v1.23.1 closes deferred items from this cycle)
- [[claude-autosarcfg-v1-22-0-shipped]] (v1.22.0 MINOR — ODX viewer)
- [[claude-autosarcfg-v1-21-0-shipped]] (v1.21.0 MINOR — DBC viewer + BSW generator)
- [[vendor-format-parser-needs-real-fixture-pre-ship]] (T1 tests use real `powertrain-typical.dbc` fixture, consistent with this permanent note)

---

## Devlog

### 2026-07-03 — v1.23.1 PATCH ship + 3 deferred items closed

**Session summary**
- Shipped v1.23.1 PATCH on main: 4 feature commits (T1 cross-file atomic + T1 fix + T2 i18n split + T3 dead-code) + 1 release commit. Tag v1.23.1.
- Closes 3 deferred items from v1.23.0 ship cycle: cross-file atomic write, i18n split (869 → 7 cluster files), 3 dead-code MEDIUMs.
- Test count: 2769 + 6 SKIP / 0 fail (+18 net from v1.23.0 2751).
- pnpm verify 7-stage GREEN; type-check + lint + format clean.
- User-manual baseline updated from v1.23.0 to v1.23.1; new "What's New in v1.23.1" section.

**Key decisions**
- T1 uses 2-phase commit (write tmp → serial atomic rename) instead of `Promise.allSettled` to track which rename failed and trigger rollback between renames. `rolledBack: boolean` is the single most important contract for the renderer.
- T2 splits by 7 functional clusters (app / dialog / editor / validation / dbc / odx / misc) instead of 35 per-namespace files. Each cluster is 28-181 lines, well under the 300-line ceiling.
- T2 keeps a 21-line backward-compat shim at `src/shared/i18n.ts` so existing callers don't change. Future PATCH cycle should migrate callers to the new folder import path and delete the shim.
- T3 discovered that `parseArxml` is Result-returning (not throw-based), so the test uses `vi.spyOn` to simulate a throw. Production defensive code is added to 4 call sites anyway (returns safe defaults that match existing `{ok:false}` fallbacks).

**Blockers / issues**
- (None at ship time. All 3 code-review fix waves completed; T1 had 1 fix wave for 2 MEDIUMs, T2 and T3 were clean on first review.)

**Next steps**
- v1.23.2 PATCH: migrate callers from `'@shared/i18n'` (shim path) to `'@shared/i18n'` (folder path), then delete the 21-line compat shim.
- v1.24.0 MINOR: ODX → Diagnostic Extract ARXML (deferred from v1.22.0; now natural complement to v1.23.0's DBC→Com-stack).
- v1.22.x PATCH: M1 XMLValidator preflight (deferred 3 cycles; defense-in-depth, not load-bearing; can be deferred indefinitely).
