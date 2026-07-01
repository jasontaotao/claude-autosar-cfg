# v1.18.6 Release Notes (2026-07-01) — PATCH

**`AppHeader` co-located helpers + types extraction (C13 Option B split 2/2) — closes C13**

See [CHANGELOG](../../CHANGELOG.md#v1186-2026-07-01--patch) for the headline.

## 关键决策

- **C13 Option B fully closed** — v1.18.0 §11.2 deferred "C13 subdir refactor" had two scope options: Option A (invent 6 AppHeader sub-components + 7 useProjectActions sub-hooks; ~40% rewriting body content) or Option B (co-locate module-level helpers + types into separate files, keep function bodies monolithic; zero behavior change). v1.18.5 shipped the `useProjectActions` half; v1.18.6 ships the `AppHeader` half. Both halves follow the same pattern.
- **`INITIAL` exported from types.ts** — `INITIAL: AppHeaderState` is the initial state value used by `useState<AppHeaderState>(INITIAL)` inside the component. Marked `export` so the parent component can import it. Same for `AppHeaderState` (used in `useState<AppHeaderState>(...)`). Public-vs-internal boundary: `AppHeaderProps` is exported + re-exported from parent (truly public API); `AppHeaderState` + `INITIAL` are exported from types.ts but NOT re-exported from parent (subdir-internal).
- **`formatParseError` exhaustive switch preserved** — TypeScript's exhaustiveness check on the `ParseError` discriminated union must still pass after extraction. Verified by re-reading the original (lines 84-98); extracted verbatim.
- **`saveAllDirty` parallel-array indexing preserved** — relies on the `documents[i] ↔ documentPaths[i]` contract enforced by `store.addDocument`. No contract change in this PATCH. Extracted verbatim.

## 流程教训（PKM）

1. **Pattern-mirror extraction: identical for both halves** — v1.18.5 + v1.18.6 followed the exact same pattern: keep parent file as entry point; extract types to `types.ts`; extract helpers to `helpers.ts`; parent imports from subdir; no barrel `index.ts`. The v1.18.5 plan + extraction served as the template for v1.18.6 — same file structure, same import paths, same re-export strategy. Lesson: when repeating a refactor pattern, the second instance is significantly cheaper (~50% LOC moved, ~70% time saved).
2. **`INITIAL` extraction corner case** — `INITIAL: AppHeaderState = { busy: false };` looks like a "private constant" but the component body uses it. Must be `export`ed (not `internal`) for the parent to import. Easy to miss when scanning for extraction candidates. Lesson: when extracting "module-level values", trace every usage to determine if it crosses the file boundary.
3. **Format-lint loop pattern (6th-of-N occurrence)** — prettier reformatted 3 files (plan doc + 2 new TS files) in 1 pass; ESLint had 2 stages of cleanup (1 unused-import + 1 missing-import + 1 type-check error before green). Total: 3 iterations to green. Same pattern as v1.18.5 but slightly more iterations (component refactor touched more imports). Pattern continues to be cheap and predictable.
4. **Cross-half parity check** — v1.18.6 mirrored v1.18.5's structure exactly. Before writing v1.18.6's plan doc, re-read v1.18.5's plan to ensure consistent structure (Phase 0 / Goals / Architecture / Test Plan / Task Sequence / Risk Callouts / Test Count Forecast / Files Touched / Deferred Pipeline). Same template for both halves. Lesson: extract patterns → template them → reuse across instances.

## Ship Method

- 1 commit directly on `main`:
  - `ff51ab4` refactor(components): extract AppHeader helpers + types to co-located subdir (v1.18.6 T1)
  - `<this commit>` chore(release): v1.18.6 PATCH release artifacts (CHANGELOG + version + this file)
- 2 commits on main (T1 refactor + T2 release), mirrors v1.18.5 + v1.18.4 + v1.18.3 PATCH pattern
- `pnpm verify` 8-stage GREEN before push
- No code-reviewer dispatch — pattern-mirror implementation (helpers extracted verbatim from `AppHeader.tsx:84-151`), low-risk + 32 tests unchanged

## 测试基线

- v1.18.5: 2584 + 2 SKIP / 0 fail
- v1.18.6: 2584 + 2 SKIP / 0 fail (+0 net, matches plan forecast exactly — pure refactor)
- AppHeader tests: 32/32 pass (26 from `AppHeader.test.tsx` + 6 from `AppHeader.scripts.test.tsx`) without modification
- pnpm verify 8-stage 全绿 (format / lint / type-check / test / coverage / build / import-regression)
- Coverage: same as v1.18.5 (no test surface change)

## C13 Pipeline Status

| PATCH | File | LOC moved | Status |
|---|---|---|---|
| v1.18.5 | `useProjectActions.ts` | ~145 | ✅ shipped |
| v1.18.6 | `AppHeader.tsx` | ~110 | ✅ shipped (this PATCH) |

**C13 Option B fully closed** — v1.18.0 §11.2 deferred list now empty.

## Deferred Pipeline (next PATCHes)

- **v1.19.0 MINOR** — GUI bridge dispatcher (consumers of v1.18.1 push emitters + v1.18.2 PROJECT_CLOSE; renderer-side `useProjectActions.closeProject` hook)
- v1.20.0 MINOR — 3-item backlog (B-3 emit\*Decl + Handlebars / `isPathInside` symlink / setting-file feature-flag async)