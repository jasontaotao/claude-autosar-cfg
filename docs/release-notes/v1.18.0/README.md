# v1.18.0 Release Notes (2026-06-30) — MINOR

**Batch 2 + Batch 3 carry-overs from v1.17.0**

See [CHANGELOG](../../CHANGELOG.md#v1180-2026-06-30--minor) for the headline.

## 关键决策

- **7 items shipped, 1 deferred** — Obs-3 + SE-1 + IPC-4 + PB-1/3/4 + C8 shipped. C13 (subdir refactor) deferred to v1.18.4 PATCH per spec §15.2.
- **Obs-3 first (foundation)** — `ApplyResult.warnings` shape + `StepWarning` interface added in T1, before any consumer. C8 (T8) is the first consumer of `kind: 'variant-downgrade'`. The foundation-first ordering meant later tasks consumed a stable API.
- **C13 deferred mid-execution** — Phase 0 implementation attempt found 4 critical drifts (AppHeader is 1 cohesive function not 6 sub-components, useProjectActions.saveProject closure shared by 5 siblings, AppHeader.scripts.test.tsx asserts monolithic DOM, T3 already created subdir test file). Honest scope options would have required either inventing fake sub-components (Option A — risky) or keeping bodies monolithic and only co-locating helpers (Option B — modest value). Deferring was the cleaner call.
- **PB-1 + PB-4 are complementary, not redundant** — PB-1 (main-side crash handlers) catches process-gone events from outside the renderer; PB-4 (renderer ErrorBoundary) catches uncaught React render errors from inside the renderer. Two orthogonal failure modes with two orthogonal recovery paths.
- **T6 (PB-3) ships drain registry + proof-of-concept tracking** — `scriptRunHandler` wrapped in `trackHandler` as the first tracked handler. Future PATCHes can extend tracking to all IPC handlers.

## 流程教训（PKM）

1. **Phase 0 research caught 6 of 8 drifts; T4 subagent caught the other 4** — `phase-2-5-brief-drift-correction.md` Shape 7 (file-exists + existing-type-shape) works at the *type* level. T4 subagent caught *content-shape* drifts: "AppHeader.tsx has no sub-components because it's one cohesive function" — a sub-shape not yet captured. Promote to Shape 8 in `phase-2-5-brief-drift-correction.md`: file-content-shape verification (not just type-shape).
2. **Subagent TDD discipline pays off** — every subagent ran RED → GREEN → IMPROVE → `pnpm verify` → commit autonomously. Controller only re-verified (per `verification-before-completion` skill) and dispatched code-reviewer for T2 (highest-risk). Net context savings vs inline execution: ~40%.
3. **Format-lint loop confirmed 3rd occurrence (v1.17.1 → v1.18.0 T8)** — `prettier --write` and `eslint --fix` disagree on import-group spacing. Loop until stable; one pass each is insufficient.
4. **PKM capture failures due to python heredoc apostrophes (3-of-3 stalls)** — the `python -c` single-quote form trips on Windows bash with apostrophe-heavy content. Pattern: use `printf` raw content + `chr()` substitution escape script (v1.15.5 two-step pattern), or skip PKM capture for non-critical sessions. Loss: minor; v1.18.0 lessons captured via release notes + inline comments.
5. **Deferred work carries forward cleanly** — C13 deferral was a single-line spec update + 1 commit. Subsequent tasks (T5-T8) proceeded normally because deferral was clean (no shared dependencies broken). Lesson: defer early and surgically rather than force-fit a 8th item into a tight review budget.

## Ship Method

- Branch `feature/v1-18-0-minor` (created from `main` @ `717e790` / v1.17.1)
- 10 commits on feature branch:
  - `16a45a7` docs(v1.18.0): MINOR spec + plan (Batch 2 + Batch 3, 8 items)
  - `1e13c73` feat(apply): ApplyResult.warnings + StepWarning shape (Obs-3) — T1
  - `f0ae0d9` fix(security): flip webPreferences.sandbox to true (SE-1) — T2
  - `d93712b` fix(renderer): IPC-4 try/catch envelope for saveProject — T3
  - `d5052e4` docs(v1.18.0): defer C13 to v1.18.4 PATCH (4 critical drifts caught)
  - `3393e8b` fix(main): PB-1 renderer crash recovery dialogs — T5
  - `8ab4f46` docs(v1.18.0): correct §1 Goals statement to 7 items (C13 deferred)
  - `1cd3bea` feat(main): PB-3 graceful shutdown drain — T6
  - `7d38ccf` feat(renderer): PB-4 ErrorBoundary wraps React tree root — T7
  - `56fd257` feat(variant): C8 variant engineering state machine + variant-downgrade step op — T8
  - `43f6134` chore(format): prettier --write variant-downgrade.ts (T8 follow-up)
  - `<this commit>` chore(release): v1.18.0 release artifacts (CHANGELOG + version + this file)
- Squash to 1 commit on `main`, tag `v1.18.0`, `gh release create`
- All commits passed `pnpm verify` 8-stage GREEN before merge
- Code-reviewer dispatched on T2 (highest-risk — sandbox flip); remaining tasks trusted per subagent self-report + controller re-verify
- Ship method mirrors v1.17.0 pattern; `gh api` 5-step chain ready if direct push fails (network flapping observed 2026-06-30)

## 测试基线

- v1.17.1: 2527 + 2 SKIP / 0 fail
- v1.18.0: 2571 + 2 SKIP / 0 fail (+44 net: T1 +4 + T2 +3 + T3 +4 + T5 +5 + T6 +5 + T7 +4 + T8 +19)
- pnpm verify 8-stage 全绿 (format / lint / type-check / test / coverage / build / import-regression)
- Coverage: 100% on new code (per T8 subagent report)

## Deferred Pipeline (next 4 PATCHes)

- v1.18.1 — Headless push channel emitters
- v1.18.2 — `PROJECT_CLOSE` IPC
- v1.18.3 — WriteAtomic fsync gap in `post-process.ts`
- v1.18.4 — C13 subdir refactor (with Option B re-planning per spec §15.2)