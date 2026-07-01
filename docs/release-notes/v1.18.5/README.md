# v1.18.5 Release Notes (2026-07-01) — PATCH

**`useProjectActions` co-located helpers + types extraction (C13 Option B split 1/2)**

See [CHANGELOG](../../CHANGELOG.md#v1185-2026-07-01--patch) for the headline.

## 关键决策

- **C13 split into 2 PATCHes** — v1.18.0 §11.2 lumped `useProjectActions.ts` + `AppHeader.tsx` extractions into one PATCH ("C13 subdir refactor"). v1.18.5 splits per "smallest-first" pattern: v1.18.5 = `useProjectActions` extraction (~145 LOC moved, bigger), v1.18.6 = `AppHeader` extraction (~90 LOC moved, smaller). Each PATCH is reviewable + shippable independently. Splitting rationale: large monolithic refactors are harder to review + bisect if regressions appear.
- **Option B (co-locate helpers + types) chosen over Option A** — Option A (per v1.18.0 §11.2) would invent 6 AppHeader sub-components + 7 useProjectActions sub-hooks. ~40% of that work is rewriting body content (public API change required for useProjectActions). Option B keeps function bodies monolithic but extracts module-level helpers + types to separate files. Zero behavior change; minimal risk.
- **No barrel re-export added** — parent file `useProjectActions.ts` stays the public entry point. The existing test file at `useProjectActions/__tests__/useProjectOpen.saveProject.test.tsx` (created by v1.18.0 T3 IPC-4) imports from `'../../useProjectActions.js'` (parent file). Keeping the parent file importable avoids breaking the test. Option B explicitly preserves the parent file as the entry point.
- **`ProjectActionResult` re-exported from parent** — public API type stays accessible via the same import path. `SwitchingAction` stays internal (only used inside the subdir module graph). If a future caller needs `SwitchingAction`, add `export type { SwitchingAction }` from the parent file in a follow-up.
- **`toI18nAxis` removed from parent imports** — only used inside `guardedDirtySwitch` (extracted to helpers.ts). Parent file import reduced to `{ guardedDirtySwitch, setNewProjectDialogOpen }`. Avoids `@typescript-eslint/no-unused-vars`.

## 流程教训（PKM）

1. **Subdir structure pattern: parent + subdir, no barrel** — when a subdir exists with test files but the parent file is the public entry point, do NOT add a barrel `index.ts` re-export. Tests may import from either path; adding a barrel changes resolution semantics. Per "smallest change that ships", keep the parent file as the entry point + add extracted modules in the subdir. Future "Option A" refactors (move parent file into subdir) can add the barrel then.
2. **Pattern-mirror refactor: 0 tests needed when behavior is unchanged** — for a pure extraction where the extracted code is identical to the inline original (verbatim copy), existing tests are the characterization. No new unit tests needed because the inline code was already covered (4 tests via `useProjectOpen.saveProject.test.tsx`). Lesson: when extracting code, check if the existing test surface already exercises the extracted pieces through the parent file. If yes, don't write new tests — just move the code.
3. **Format-lint loop pattern (5th-of-N occurrence)** — prettier reformatted 4 files (plan doc + 3 TS files) in 1 pass; ESLint import-order error in 1 iteration. Established pattern: write → format → lint → fix in 1-2 iterations. Don't fight it; the loop is expected. Promote to dedicated memory at end-of-PATCH if it hits 6+ occurrences.
4. **Scope split vs original spec: document rationale** — when splitting a PATCH scope from the original spec, document why in the PATCH plan + CHANGELOG. v1.18.5 split C13 into 2 PATCHes; rationale recorded in plan §0.3 + this README + CHANGELOG. Future readers can trace why the split happened (smallest-first pattern + per-PATCH reviewability).

## Ship Method

- 1 commit directly on `main`:
  - `2fbc0c7` refactor(hooks): extract useProjectActions helpers + types to co-located subdir (v1.18.5 T1)
  - `<this commit>` chore(release): v1.18.5 PATCH release artifacts (CHANGELOG + version + this file)
- 2 commits on main (T1 refactor + T2 release), mirrors v1.18.3 + v1.18.4 PATCH pattern
- `pnpm verify` 8-stage GREEN before push
- No code-reviewer dispatch — pattern-mirror implementation (helpers extracted verbatim from `useProjectActions.ts:97-219`), low-risk + tests unchanged

## 测试基线

- v1.18.4: 2584 + 2 SKIP / 0 fail
- v1.18.5: 2584 + 2 SKIP / 0 fail (+0 net, matches plan forecast exactly — pure refactor)
- pnpm verify 8-stage 全绿 (format / lint / type-check / test / coverage / build / import-regression)
- Coverage: same as v1.18.4 (no test surface change)

## Deferred Pipeline (next PATCHes)

- **v1.18.6** — AppHeader.tsx co-located helpers + types extraction (C13 Option B split 2/2; ~90 LOC moved; 4 extraction candidates: `AppHeaderState`, `INITIAL`, `formatParseError`, `saveAllDirty`)
- v1.19.0 MINOR — GUI bridge dispatcher (consumers of v1.18.1 push emitters + v1.18.2 PROJECT_CLOSE)
- v1.20.0 MINOR — 3-item backlog (B-3 emit\*Decl + Handlebars / `isPathInside` symlink / setting-file feature-flag async)