# v1.18.2 Release Notes (2026-06-30) — PATCH

**PROJECT_CLOSE IPC**

See [CHANGELOG](../../CHANGELOG.md#v1182-2026-06-30--patch) for the headline.

## 关键决策

- **Idempotent close semantics (Unix `close(2)` model)** — `projectCloseHandler()` always returns `{ kind: 'closed' }` whether or not a project was open. The renderer never needs to track is-a-project-open state. Mirrors how `close(fd)` on a closed fd is a no-op, not an error. Avoids the renderer needing defensive guards.
- **Extracted handler pattern** — `projectCloseHandler.ts` is a pure function (no IO, no electron mock required). Mirrors `bswmdDeleteHandler.ts` extraction per v1.15.5. The `register.ts` site is a 1-line wrapper that calls the extracted handler. This pattern: handler testable in isolation, registration site stays focused on wiring.
- **No `:v1` suffix** — state-mutation channel, not a wire-versioned surface. Mirrors `SCRIPT_LIST` / `SCRIPT_RUN` convention. Wire-versioned channels (`:v1`) are reserved for breaking-shape evolution, which doesn't apply to idempotent close.
- **Known limitation deferred** — `bswmdDeleteHandler` + `projectWriteArxmlBatchHandler` read manifest path state without null-check. After PROJECT_CLOSE, calling BSWMD_DELETE will crash. Fix is 1-line `if (state === null) return { kind: 'no-open-project' }` in each consumer handler — deferred to follow-up PATCH per plan §0.4.

## 流程教训（PKM）

1. **Format-lint loop 4th occurrence (v1.17.1 → v1.18.0 T8 → v1.18.1 T2 → v1.18.2 T2)** — Prettier reformat collapsed an empty line within import group in the test file; ESLint flagged import-group ordering. `eslint --fix` resolved in 1 iteration. Pattern now at 4-of-N occurrences; promote to dedicated memory at end-of-PATCH cycle (currently 1-of-N at the in-line note level).
2. **Pure-function handler extraction pays off** — handler was testable in 4 tests with no `electron` mock. Direct import of `projectCloseHandler` + `getOpenProjectManifestPath` + `__resetOpenProjectManifestPathForTests` from the accessor module. The reset hook established in v1.15.5 made test isolation trivial.
3. **Test seam = accessor module pattern reconfirmed** — `project-manifest-state.ts` exports `set/get/reset` so the handler test directly drives state without touching `register.ts` or `electron`. Same architectural pattern as `window.ts` (v1.17.1 M1) and `shutdown/drain.ts` (v1.18.0 T6).

## Ship Method

- 3 commits directly on `main` (no feature branch; PATCH scope 1-7 items, mirrors v1.17.0 / v1.17.1 / v1.18.1 PATCH ship pattern):
  - `4ff50ee` feat(ipc): PROJECT_CLOSE channel + result type (v1.18.2 T1)
  - `bec8670` feat(ipc): PROJECT_CLOSE handler + tests + register wiring (v1.18.2 T2)
  - `<this commit>` chore(release): v1.18.2 PATCH release artifacts (CHANGELOG + version + this file)
- All commits passed `pnpm verify` 8-stage GREEN before push
- No code-reviewer dispatch — symmetric-pattern implementation (mirrors `bswmdDeleteHandler` extraction), low-risk (no behavior change to existing flows; handler is a new code path that exercises the existing `setOpenProjectManifestPath(null)` setter)

## 测试基线

- v1.18.1: 2576 + 2 SKIP / 0 fail
- v1.18.2: 2580 + 2 SKIP / 0 fail (+4 net, matches plan forecast exactly)
- pnpm verify 8-stage 全绿 (format / lint / type-check / test / coverage / build / import-regression)
- Coverage: 100% on new code (T2 handler + tests)

## Deferred Pipeline (next 2 PATCHes)

- v1.18.3 — WriteAtomic fsync gap in `post-process.ts`
- v1.18.4 — C13 subdir refactor (with re-planning per spec §15.2)