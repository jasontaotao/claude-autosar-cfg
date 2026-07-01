# v1.18.3 Release Notes (2026-06-30) — PATCH

**WriteAtomic fsync gap in `post-process.ts`**

See [CHANGELOG](../../CHANGELOG.md#v1183-2026-06-30--patch) for the headline.

## 关键决策

- **Pattern mirror across two writeAtomic sites** — main-side `src/main/io/writeAtomic.ts:36-41` already fsyncs (used by `projectSaveHandler`, `scriptRunHandler`, `stencilSaveHandler`, `saveArxmlHandler`, `projectWriteArxmlBatchHandler`). CLI-side `writeOutputTree` in `src/core/generator/post-process.ts` did NOT. v1.18.3 closes the gap by mirroring the exact pattern: `open` + `sync` + `close` between `writeFile` and `rename`.
- **Keep `writeFile`, add fsync** — the refactor doesn't replace `writeFile` with `fs.open` + `write`. The fsync step is added between the existing write and rename. Same UTF-8 encoding options, no behavior change for happy path.
- **`r+` mode for fsync** — required because `fsync` on an O_WRONLY handle is implementation-defined on some platforms. `r+` is the canonical "I have a handle, sync its data" mode.
- **`try/finally` for `close()`** — defensive. If `sync()` throws, the handle must close before the error propagates — otherwise we leak file descriptors under generator churn.
- **Performance trade-off acknowledged** — fsync adds ~1-10ms per file. For the generator pipeline that writes dozens-to-hundreds of files, this is non-trivial. Acceptable for crash-safety; feature flag for opt-out is a future-PATCH option.

## 流程教训（PKM）

1. **Pattern-mirror cross-site gap** — when a helper exists at multiple sites (main-side writeAtomic + CLI-side writeOutputTree), drift can hide: one site gains a fix, the other doesn't. Phase 0 grep across `src/main/io/` + `src/core/` revealed the gap. Lesson: when adding fsync (or any invariant) to a helper, grep for OTHER implementations of the same pattern and check they match.
2. **MockRejectedValue is sticky across loop iterations** — `vi.fn().mockResolvedValue(rejectingHandle)` returns the SAME rejecting handle for every call. The first test assertion expected `syncSpy` to be called exactly once, but the production loop calls `open` once per artifact. Test revised to use `.toHaveBeenCalled()` (at least once) and `.mock.calls.length` comparison. Lesson: when mocking a function called in a loop, account for N invocations, not 1.
3. **try/finally invariant worth a dedicated test** — the second test verifies `fh.close()` runs even when `fh.sync()` throws. Without this test, a future refactor could move `close()` out of the `finally` block and silently leak handles under generator churn. The defensive coverage pays for itself.
4. **Plan-vs-actual lesson: predicted counts under loop iteration** — the plan predicted "sync called once" but the actual loop invokes fsync per artifact. Future plans should specify "called once per artifact" when the SUT iterates over a collection.

## Ship Method

- 1 commit directly on `main`:
  - `a97703f` feat(generator): fsync before rename in writeOutputTree (v1.18.3 T1)
  - `<this commit>` chore(release): v1.18.3 PATCH release artifacts (CHANGELOG + version + this file)
- 1 commit on feature branch + release (smaller PATCH than v1.18.1/v1.18.2 — single TDD task, no T2 separate)
- `pnpm verify` 8-stage GREEN before push
- No code-reviewer dispatch — pattern-mirror implementation (exact code copied from `src/main/io/writeAtomic.ts`), low-risk

## 测试基线

- v1.18.2: 2580 + 2 SKIP / 0 fail
- v1.18.3: 2582 + 2 SKIP / 0 fail (+2 net, matches plan forecast exactly)
- pnpm verify 8-stage 全绿 (format / lint / type-check / test / coverage / build / import-regression)
- Coverage: 100% on new code (T1 fsync tests + refactor)

## Deferred Pipeline (next 2 PATCHes)

- v1.18.4 — C13 subdir refactor (with re-planning per spec §15.2)
- `PROJECT_CLOSE` defensive null-check (deferred from v1.18.2 — independent concern)