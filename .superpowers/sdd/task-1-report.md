# Task 1 Report — openProject viewMode promote

**STATUS**: DONE_WITH_CONCERNS

**Commit**: `a878f7c` (local on `main`, NOT pushed per session 245 protocol)

**Tests**: 4 new tests PASS in `useArxmlStore.openProject-bswmd.test.ts` (file total: 11/11 PASS).
Full suite: **3213 passed + 7 SKIP / 0 fail** (+4 net from baseline HEAD `9b1b2c7` of 3209 + 7 SKIP).
Brief projected 3199 + 7 SKIP; actual baseline was 3209, so my delta is +4 net as expected (4 new tests).

**pnpm verify**: 8-stage BLOCKED at stage 1 (format) due to **pre-existing prettier drift** in untracked workflow artifact `docs/superpowers/plans/2026-07-14-bug5-multidoc-promote-combined.md`. Verified by `git stash` + re-run on baseline HEAD `9b1b2c7` (still failed on the same file — not caused by my changes). Per brief: "Do NOT modify any other file"; per .prettierignore, the file is in `docs/superpowers/plans/` (not `docs/superpowers/archive/` or `.superpowers/sdd/`), so prettier --check still walks it. Stage 1 is the only failure; stages 2-8 (lint / tsc / vitest) all clean when run individually:
- `pnpm tsc --noEmit` clean
- `pnpm lint` clean (after 1 import-order fix on the new test file)
- `pnpm vitest run` 3213 + 7 SKIP / 0 fail

**Deviations from brief**:
1. **Test count delta** — Brief projected +9 net (3190 → 3199); actual delta is +4 (3209 → 3213). Justification: the brief was written against an older baseline count; current HEAD `9b1b2c7` baseline is 3209, and my 4 new tests are the only net additions (no other tests removed or changed).
2. **`pnpm verify` stage 1 failure** — Unrelated, pre-existing prettier drift on an untracked workflow artifact; not introduced by this commit. Verified by stashing my changes and re-running. Brief prohibits modifying other files; ignoring the artifact per instruction.

**Files touched** (only these 2):
- `src/renderer/store/slices/projectSlice.ts` (+32 / -6 LoC): inserted promote logic block before `set({...})`; added `viewMode: resolvedViewMode` as the 19th key in the single `set(...)` payload; rekeyed `warnings:` from `get().viewMode` to `resolvedViewMode`.
- `src/renderer/store/__tests__/useArxmlStore.openProject-bswmd.test.ts` (+177 / 0 LoC): 4 new `it()` cases after line 350; +1 import (`ImportSession` type from `@core/import/types.js`).

**RED → GREEN evidence**:
- RED: 11 tests run, **2 FAILED** (Tests A "promotes" + D "re-promotes" exposed the missing promote logic). Tests B + C are guard assertions ("does not promote" in single-doc / importSession-active cases) — they incidentally passed even without the fix because the absent implementation trivially satisfies the negative assertion.
- GREEN: 11/11 PASS after patch.

**Other notes**:
- Per-session-245 protocol: commit landed locally; **NOT pushed to origin** (user pre-review gate).
- No package.json bump, no version change (PATCH-level fix; brief explicitly prohibits).
- PKM/vault tools untouched per brief.
- Rekeyed `warnings:` from `get().viewMode` to `resolvedViewMode` per brief IMPROVE note 3 (combined-mode warnings slice matters when promoting).
- Lint import-order fix: moved `import type { ImportSession } from '@core/import/types.js'` before `BswmdDocument` import per eslint `import/order` rule.