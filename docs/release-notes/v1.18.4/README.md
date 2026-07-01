# v1.18.4 Release Notes (2026-07-01) — PATCH

**`bswmdDeleteHandler` no-open-project branch test coverage**

See [CHANGELOG](../../CHANGELOG.md#v1184-2026-07-01--patch) for the headline.

## 关键决策

- **Refined scope from v1.18.2 §0.4 deferral** — the v1.18.2 plan deferred "PROJECT_CLOSE defensive null-check in `bswmdDeleteHandler` + `projectWriteArxmlBatchHandler`" based on an outdated read. Phase 0 research confirmed: the defensive null-check has been in place since **v1.15.5** (commits `d9df9fb` / `e69753c`, part of the path-containment work that landed with the Trust Contract hardening). The actual gap closed in v1.18.4 is **test coverage** for that defensive branch, not production code.
- **Test-only PATCH** — 0 production code changes. The 2 new characterization tests lock in the v1.15.5 defensive contract so future refactors cannot silently regress it.
- **2 tests, not 1** — Test 1 (`rejects all calls when no project is open`) mirrors the existing v1.15.5 coverage pattern at `projectWriteArxmlBatchHandler.path.test.ts:52-64`. Test 2 (`rejects BSWMD delete after PROJECT_CLOSE`) ties together v1.18.2 + v1.15.5 by exercising the full lifecycle: open → delete works → close → delete fails. End-to-end contract verification.
- **Correction to v1.18.2 CHANGELOG** — the "Known limitation" entry in v1.18.2 said "`bswmdDeleteHandler` + `projectWriteArxmlBatchHandler` read manifest path state without null-check. After PROJECT_CLOSE, calling BSWMD_DELETE will crash..." This is incorrect as of v1.15.5. The defensive null-check was added to both handlers as part of the path-containment work. v1.18.2's plan §0.4 was an outdated read; v1.18.4 release notes document the correction here (cannot amend v1.18.2 release notes — released artifact).

## 流程教训（PKM）

1. **Phase 0 research re-read production code before assuming gap** — when a deferral description says "X is missing from production", verify by reading the current source. v1.18.2 §0.4 said the null-check was missing; Phase 0 read of `bswmdDeleteHandler.ts:30-34` and `projectWriteArxmlBatchHandler.ts:55-62` revealed the null-check has been in place since v1.15.5. The PATCH scope was refined from "add production null-check" (5-line fix) to "add test coverage" (2 new tests). Lesson: when refining a deferred item, **always re-read the cited source** before writing the plan — the deferral was written against an older snapshot.
2. **TDD GREEN-implicit is valid for characterization tests** — standard TDD is RED → GREEN → REFACTOR. Here, the tests pass from the start because production code is already correct. This is acceptable because the tests are **characterization tests** (locks in existing behavior) rather than regression tests (verifies a fix). The discipline is preserved by explicitly noting the absence in the plan doc + commit message. Without this acknowledgment, a future reader might wonder why no RED was needed.
3. **Released artifacts are immutable; corrections live in the next release** — v1.18.2 CHANGELOG documents an incorrect "Known limitation". v1.18.4 does NOT amend the v1.18.2 text (released artifact). The correction is documented in the v1.18.4 CHANGELOG entry + this README. Future readers see both versions; the v1.18.4 entry clarifies which was correct.
4. **Test-coverage-closure PATCHes have value** — even though the production code was already correct, adding the missing tests:
   - Prevents future regressions (someone could "simplify" the null-check away)
   - Documents the v1.18.2 + v1.15.5 contract explicitly
   - Demonstrates the defensive pattern via the lifecycle test
   The +2 net test count is worth more than the +0 production LOC.

## Ship Method

- 1 commit directly on `main`:
  - `4727d5f` test(ipc): add bswmdDeleteHandler no-open-project characterization tests (v1.18.4 T1)
  - `<this commit>` chore(release): v1.18.4 PATCH release artifacts (CHANGELOG + version + this file)
- 2 commits on main (T1 + T2); same pattern as v1.18.3 PATCH
- `pnpm verify` 8-stage GREEN before push
- No code-reviewer dispatch — pure test addition, mirrors v1.18.3 PATCH pattern (which also skipped review for pattern-mirror implementation)

## 测试基线

- v1.18.3: 2582 + 2 SKIP / 0 fail
- v1.18.4: 2584 + 2 SKIP / 0 fail (+2 net, matches plan forecast exactly)
- pnpm verify 8-stage 全绿 (format / lint / type-check / test / coverage / build / import-regression)
- Coverage: 100% on `bswmdDeleteHandler.ts` branches (was missing the null-state branch; this PATCH closes it)

## Deferred Pipeline (next PATCHes)

- **v1.18.5** — C13 subdir refactor (bumped from v1.18.4 due to v1.18.4 scope refinement; requires re-planning per spec §15.2)
- B-3 emit\*Decl + Handlebars (defer to v1.20.0 MINOR)
- `isPathInside` symlink-parent false positive (defer to v1.20.0)
- Setting-file feature-flag readers async migration (defer to v1.20.0)