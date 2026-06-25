# Commit Message Corrections — v1.13.x Corrections Bundle

> **Date**: 2026-06-25
> **Source**: D-rev2 joint review (Factual reviewer F1-F10)
> **Synthesis**: `.claude/sdd/reviews/2026-06-25-v1-13-x-joint-synthesis.md`
> **Branch**: `feature/v1-13-2-patch-ae`
> **Type**: docs-only

## Purpose

This document records factual corrections to commit messages and release notes from v1.10.3 through v1.13.1 that were flagged by the D-rev2 joint review (Factual reviewer, 2026-06-25). **No code changes are required** — these are post-hoc accuracy corrections for future archaeology and citation purposes.

Future commits should be cross-checked against `git diff --stat` and `find ... -name "*.test.ts" | xargs grep -c "^\s*it("` before claiming test counts.

## Corrections

### F1 — `f87323d` i18n.ts split line counts

- **Original commit message header**: "split bundles into per-locale files (1769→764 lines)"
- **Original commit message body**: claimed "i18n.zh-CN.ts: NEW (521 lines)" and "i18n.en.ts: NEW (530 lines)"
- **Actual**: pre-split `i18n.ts` was 1771 lines, post-split is 766 lines; `i18n.zh-CN.ts` is 516 lines, `i18n.en.ts` is 525 lines
- **Correction**: header should be "1771→766 lines" and bundle counts should be "516 lines" / "525 lines"

### F2 — `f87323d` src/shared test count underreported

- **Original commit message body**: "88/88 src/shared tests pass (85 pre-existing + 3 new)"
- **Actual**: src/shared has 8 test files (`i18n.test.ts`, `ipc-contract.test.ts`, `onboardingParity.test.ts`, `path.test.ts`, `types.test.ts`, `headless/__tests__/ipcContract.test.ts`, `ipc/__tests__/tourReset.test.ts`, `paths/__tests__/isPathInside.test.ts`) totalling **187 tests** (88 in `i18n.test.ts` alone, plus 99 across the other 7 files)
- **Correction**: should be "187/187 src/shared tests pass (184 pre-existing + 3 new in i18n.test.ts)"

### F3 — `i18n.test.ts:757,763` backlog comment stale

- **Original**: describes the split as "1769→800"
- **Actual**: see F1 — actual numbers are 1771→766
- **Correction**: the describe-block title and comment should reference the actual numbers, or remove the size claim entirely

### F4 — `docs/release-notes-v1.10.3.md:84` file count claim

- **Original**: header says "## Files changed (3)" but the table at lines 86-92 lists 5 files
- **Actual**: the v1.10.3 release commit `7f957fe` modified only 2 files (`docs/release-notes-v1.10.3.md` and `package.json`)
- **Correction**: either update header to "Files changed (2)" and shrink the table, or relabel header to "Files in this series" to clarify scope

### F5 — `f87323d` bundle file line counts

- **Original commit message body**: "i18n.zh-CN.ts: NEW (521 lines)" and "i18n.en.ts: NEW (530 lines)"
- **Actual**: `i18n.zh-CN.ts` is 516 lines, `i18n.en.ts` is 525 lines
- **Correction**: see F1 — update to "516 lines" / "525 lines"

### F6 — `33d1640` new test count

- **Original commit message body**: "12 new tests total (10 commander + 1 dispatcher + 1 handler)"
- **Actual**: `git show 33d1640 -- src/cli/__tests__/ | grep -cE "^\+\s*it\("` returns **13**, not 12. Breakdown is 11 commander + 1 dispatcher + 1 handler
- **Correction**: "13 new tests total (11 commander + 1 dispatcher + 1 handler)"

### F7 — `d795ea9` cites nonexistent test coverage

- **Original commit message body**: claimed "the existing test coverage for deleteEcucModuleWithFullFlow already exercises the 3-button confirm dialog (useProjectActions.test.ts:367-402)"
- **Actual**: `deleteEcucModuleWithFullFlow` appears only in `src/renderer/App.tsx` and `src/renderer/hooks/useProjectActions.ts` — **zero test files reference it**. The `useProjectActions.test.ts:367-402` block is a `describe('newProject')` block, not a deleteEcucModuleWithFullFlow block
- **Correction**: remove the false claim. The commit's actual contribution is **unblocking compilation** (no test coverage was added or existed). Future commit messages must not cite test coverage that doesn't exist

### F8 — `d795ea9` wrong line for return-object entry

- **Original commit message body**: "the function was added to the returned object (line 777)"
- **Actual**: in both pre- and post-fix `useProjectActions.ts`, `deleteEcucModuleWithFullFlow,` is on **line 785** in the returned object literal, not line 777 (line 777 is inside the `useCallback` body of `submitNewProject`)
- **Correction**: "line 777" → "line 785"

### F9 — `d795ea9` wrong line for `case 'delete-module'`

- **Original commit message body**: "the function that was actually used at case 'delete-module' on line 375"
- **Actual**: `grep -n "case 'delete-module'" src/renderer/App.tsx` returns **line 369**, not line 375
- **Correction**: "line 375" → "line 369"

### F10 — v1.11.0 doc vs commit test count disagreement

- **Original `docs/superpowers/release-notes-v1.11.0.md:63`**: "85+ new tests across 16 generator test files"
- **Original release commit `4851eaa` body**: "76 generator tests + 10 todo across 16 test files"
- **Discrepancy**: ~10% disagreement between two artifacts documenting the same release
- **Correction**: pick one number. The release commit's 76 is more verifiable (matches `grep -c "^\s*it("` across the 16 test files); recommend updating the doc to "76 new tests + 10 todo across 16 generator test files"

## Action items

This is a **docs-only** PATCH (no code changes). The corrections are recorded here so:

1. Future archaeologists reading these commits can verify the actual numbers via the tools cited above
2. The D-rev2 joint review synthesis can be cited as the canonical source of truth
3. Future commit messages follow a "verify before claim" pattern: always cross-check `git diff --stat` and `grep -c "^\s*it("` before claiming test counts

## Cross-reference

- **D-rev2 synthesis**: `.claude/sdd/reviews/2026-06-25-v1-13-x-joint-synthesis.md` §"Factual Findings" (F1-F10)
- **D-rev2 memory**: `claude-autosarcfg-v1-13-x-joint-review.md` (project memory)
- **Joint review methodology**: `claude-autosarcfg-v1-11-4-joint-review.md` (2026-06-24, prior run)
