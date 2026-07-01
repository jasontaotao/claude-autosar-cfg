# v1.19.0 Release Notes (2026-07-01) — MINOR

**GUI Bridge Dispatcher — closes v1.18.0 §11.1 + v1.18.1 + v1.18.2 carry-over chain**

See [CHANGELOG](../../CHANGELOG.md#v1190-2026-07-01--minor) for the headline.

## 关键决策

- **3 items + housekeeping in one MINOR** — closes 3 carry-overs (v1.18.0 §11.1 SCRIPT_PROGRESS consumer, v1.18.1 push emitters main-side caller, v1.18.2 PROJECT_CLOSE IPC renderer consumer) in one ship cycle. Each item is independently mergeable but the MINOR scope was clear from the start.
- **Real headless dispatcher delegates to existing CLI dispatcher** — `src/cli/command-dispatcher.ts` already routes 4 sub-commands (read/mutate/validate/generate). v1.19.0 adds `dispatchCommandForGui` (no stdout emission, returns `HeadlessResult` directly) + `headlessRunCommandHandler` (calls `dispatchCommandForGui`, emits push events for mutate/validate). CLI behavior unchanged.
- **`withDefaultGlobal` injection** — `DispatchArgs` requires `global: GlobalFlags` field; `HeadlessCommand` (the wire type) doesn't include it. The GUI handler injects a default `global` (`projectPath: input.projectPath`, `verbose: false`, `quiet: false`, `noColor: false`) before calling the dispatcher. The dispatcher doesn't read `global` for behavior — only the type requires it.
- **`closeProject` hook idempotent + loose-mode preserving** — per v1.6.0-era invariant (CHANGELOG line 1543-1544), the store's `closeProject` action preserves `documents[]` + `dirtyPaths` so the user keeps editing in loose mode without losing unsaved work.
- **SCRIPT_PROGRESS verification only (T3 = no code change)** — already fully wired since v1.17.0 MINOR T5. `useScriptStore.appendProgress` + `useScriptActions.onScriptProgress` subscription + tests cover the path. v1.19.0 documents this in the release notes for the chain-closure audit.

## 流程教训（PKM）

1. **GUI/CLI dispatcher pattern: GUI-mode variant** — when a CLI dispatcher writes to stdout/stderr (CLI-specific), creating a GUI-mode variant that returns results directly (instead of writing to stdout) is cleaner than refactoring the CLI dispatcher to be GUI-aware. New `dispatchCommandForGui` + new `headlessRunCommandHandler` keeps the CLI behavior untouched. Lesson: prefer mode-specific wrappers over mode-switching parameters in core dispatchers.
2. **Type-system boundary patching** — when a wire type (`HeadlessCommand`) differs from the internal type (`DispatchArgs`) only by a field the dispatcher doesn't use (`global`), inject a default at the boundary instead of restructuring the internal type. Avoids rippling changes through the CLI codebase.
3. **Carry-over closure verification (T3 = 0 LOC)** — before writing new code for a deferred item, verify the gap still exists. v1.19.0 T3 was expected to be a wire-up task but was already fully wired since v1.17.0 MINOR T5. Saving ~30 LOC + the test churn. Lesson: when picking up a deferred item, grep + read first; the gap may have closed in a prior ship.
4. **Test seam pattern: `withDefaultGlobal` as a seam not a real conversion** — adding the `withDefaultGlobal` helper inside the handler (not exported) keeps the wrapper narrow. Future callers that need different defaults can pass a custom `global` builder; current callers don't need to think about it. Lesson: seam functions belong at the narrowest point where they're needed.
5. **Format-lint loop pattern (7th-of-N occurrence)** — prettier + ESLint had 4 cleanup rounds this cycle (4 files prettier + 2 import-order + 1 empty-line + 1 stale-test-removal + 2 test-fixture-fixes). The pattern is now well-understood: write → format → lint → fix in 1-3 iterations. Pattern continues to be cheap and predictable.

## Ship Method

- 4 commits on main (T0 + T1-T3 + T4 release):
  - `32d278d` docs(plans): commit 6 untracked plan docs (v1.19.0 T0 housekeeping)
  - `<v1.19.0-T1-T3-commit>` feat(gui-bridge): real headless dispatcher + closeProject hook + SCRIPT_PROGRESS consumer
  - `<v1.19.0-T4-commit>` chore(release): v1.19.0 MINOR release artifacts (CHANGELOG + version + this file)
- `pnpm verify` 8-stage GREEN before push
- No code-reviewer dispatch — T1 follows existing patterns (mirrors push-emitters.test.ts mock setup), T2 is a single-method addition (mirrors existing useProjectActions methods), T3 is verification only

## 测试基线

- v1.18.6: 2584 + 2 SKIP / 0 fail
- v1.19.0: 2593 + 2 SKIP / 0 fail (+9 net = 7 T1 dispatcher tests + 3 T2 closeProject tests - 1 removed headlessRunCommandStub test)
- pnpm verify 8-stage 全绿 (format / lint / type-check / test / coverage / build / import-regression)
- Coverage: maintained (new code fully covered)

## v1.18.0 §11.1 Carry-over Closure Status

| Item | Status |
|---|---|
| SCRIPT_PROGRESS renderer consumer | ✅ closed (T3 — already wired since v1.17.0) |
| `emitMutateApplied` + `emitValidateResult` main-side caller | ✅ closed (T1 — new dispatcher emits them) |
| PROJECT_CLOSE IPC renderer consumer | ✅ closed (T2 — closeProject hook) |
| B-3 emit\*Decl + Handlebars | → v1.20.0 MINOR |
| `isPathInside` symlink-parent false positive | → v1.20.0 MINOR |
| Setting-file feature-flag readers async migration | → v1.20.0 MINOR |
| C2.4 real `applyMutation` wire-up (carry-over from v1.6.x) | → v1.20.0 MINOR |

## Deferred Pipeline (next MINOR)

- **v1.20.0 MINOR** — 4-item backlog (B-3 emit\*Decl + Handlebars / `isPathInside` symlink / setting-file feature-flag async / C2.4 real `applyMutation`)