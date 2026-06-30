# v1.18.1 Release Notes (2026-06-30) — PATCH

**Headless push channel emitters**

See [CHANGELOG](../../CHANGELOG.md#v1181-2026-06-30--patch) for the headline.

## 关键决策

- **Foundation-first sequencing** — T1 ships wire types (`MutateAppliedEvent` + `ValidateResultEvent`) BEFORE T2 ships the emitters. Even though no consumer existed at T1, defining the types first meant T2's emitter signatures were constrained by the same wire shape that future consumers will see. Reverse order (emitters first, types derived) would have created a refactor risk if the wire shape needed tuning.
- **CLI-mode is intentionally a no-op, not an error** — `getMainWindow()` returns `null` in CLI mode. The emitter guards on null and silently returns. This matches the SCRIPT_PROGRESS pattern: the CLI is a standalone Node process that does not own a renderer, so push channels have no recipient. Throwing would force CLI code to wrap emitters in try/catch — adding ceremony for a path that cannot exist.
- **Two-line guard beats full null-assertion** — `if (mainWindow === null || mainWindow.isDestroyed()) return` is the defensive check. The `null` arm catches CLI mode + window-not-yet-created + window-just-closed-via-`registerMainWindowCloseHandler`. The `isDestroyed()` arm catches the narrow race between "user closed window" and "main process emits from a long-running operation that survived the close event".
- **Stub-replacement deferred to v1.19.0 MINOR** — the `headlessRunCommandStub` is NOT modified. The emitters ship as standalone functions for future dispatcher to call. Wiring them into the stub would imply work was done when nothing has — keeping the stub contract "real bridge not wired yet" intact.

## 流程教训（PKM）

1. **Pure-function emitters + duck-typed window seam = 5 tests in 80 lines** — no `electron` mock needed. The mock setup (vi.hoisted control surface + vi.mock window.js redirect) was copied verbatim from `script-progress-emit.test.ts`, halving the time-to-first-test vs. from-scratch. Lesson: when one emitter pattern exists for a sibling channel, mirror the test seam 1:1.
2. **`import/order` lint loop** — Prettier reformat collapsed an empty line between two `import { ... } from '...'` blocks; ESLint flagged it as a violation of import-group ordering. `eslint --fix` resolved in 1 iteration. New minor variant of the format-lint loop confirmed (v1.17.1 → v1.18.0 T8 → v1.18.1 T2).
3. **PKM capture pattern improved** — T1 capture succeeded in 170s (vs 3-of-3 stalls at 600s in v1.18.0). The agent reused the printf + temp .py file pattern from v1.15.5. Lesson: the v1.18.0 memory note about python heredoc apostrophe stalls is now resolved by the temp .py fallback path.

## Ship Method

- 3 commits directly on `main` (no feature branch; PATCH scope 1-7 items, mirrors v1.17.0 / v1.17.1 PATCH ship pattern of 2-3 commits):
  - `517d331` feat(headless): push channel wire types (v1.18.1 T1)
  - `0feb83d` feat(headless): push channel emitters (v1.18.1 T2)
  - `<this commit>` chore(release): v1.18.1 PATCH release artifacts (CHANGELOG + version + this file)
- All commits passed `pnpm verify` 8-stage GREEN before push
- No code-reviewer dispatch — single-pattern implementation, low-risk (no behavior change to existing flows; emitters are new code paths that exercise the existing `getMainWindow` accessor)

## 测试基线

- v1.18.0: 2571 + 2 SKIP / 0 fail
- v1.18.1: 2576 + 2 SKIP / 0 fail (+5 net: T1 type-only +0 + T2 push-emitter tests +5)
- pnpm verify 8-stage 全绿 (format / lint / type-check / test / coverage / build / import-regression)
- Coverage: 100% on new code (T2 emitters + their tests)

## Deferred Pipeline (next 3 PATCHes)

- v1.18.2 — `PROJECT_CLOSE` IPC
- v1.18.3 — WriteAtomic fsync gap in `post-process.ts`
- v1.18.4 — C13 subdir refactor (with re-planning per spec §15.2)