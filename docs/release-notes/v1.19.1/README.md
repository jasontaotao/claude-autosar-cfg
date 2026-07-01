# v1.19.1 Release Notes (2026-07-01) — PATCH

**Generator emit-strategy migration + IPC symlink defense + feature-flag async migration**

See [CHANGELOG](../../CHANGELOG.md#v1191-2026-07-01--patch) for the headline.

## 关键决策

- **3 of 4 v1.18.0 §11.1 items shipped in one PATCH cycle**. C2.4 GUI `applyMutation` parity deferred to v1.20.0 MINOR — it's the highest-risk item (rewrite of 30+ existing tests in `useScriptStore.test.ts`) and deserves dedicated cycle with characterization tests.
- **T1 B-3 = migration, not extraction**. Phase 0.5 found that `src/core/generator/emit/strategy.ts` already exported the 3 canonical helpers with the new param-object signature + `emit-strategy.test.ts` already had 6 passing tests. `ecuc.ts` still used the OLD tuple-signature private helpers at lines 162-182, making the public exports dead code. The actual work was migrating `ecuc.ts` to use the canonical surface and registering Handlebars helpers.
- **T2 symlink defense = `realpath` + existing `isPathInside` composition**. Defense-in-depth against attacker-controlled symlinks inside the project dir. Pure-string `isPathInside` is preserved as the fallback when `realpath` throws on non-existent paths (callers' `existsSync` stays the IO-error authority).
- **T3 feature-flag async = Promise cache**. Migrating from sync module-level cache (`let cached: T | null = null`) to async (`let cached: Promise<T> | null = null`) — concurrent first-callers share the in-flight read; subsequent awaits resolve on the same microtask.

## 流程教训（PKM）

1. **Phase 0.5 mid-T1 drift finding** (target-source-canonical-state verification, new `phase-2-5-brief-drift-correction.md` Shape 10): before planning a migration, verify whether the destination already exists and the source still uses the old API. Spec files can have stale gaps — re-read the target file before writing the migration plan. The drift: spec said "extract from ecuc.ts" but extraction was already done; remaining work was "wire ecuc.ts to the existing extraction".
2. **Behavioral change documentation pattern**: when migrating to a new canonical API, the snapshot byte-identity expectation may be wrong. The canonical contract was already documented in the new test file; the snapshot captured the OLD (fixture-only) behavior. Always diff snapshot deltas against the canonical contract, not against the pre-migration output.
3. **Param-object dead code pattern**: parameter-object APIs are easier to evolve than tuple APIs — old unused parameters become optional fields that get ignored silently. Lint catches dead counters (`'postBuildOffset' is assigned a value but never used`); TypeScript does NOT catch unused object properties.
4. **Trailing-newline snapshot gotcha** (3rd PKM occurrence): `Write` tool writes snapshot files WITHOUT a trailing newline; the generator emits WITH a trailing newline. Snapshot test fails with `+` indicator on diff. Fix: `printf '\n' >> file`. Verify with `xxd file | tail -2`.
5. **Symlink defense via `realpath` composition**: wrap the proven pure-string `isPathInside` with an async `isPathInsideReal` that calls `realpath` on both sides first, then delegates. Composition over rewrite preserves the hardened matrix (.., UNC, case-insensitive, trailing slash) and adds symlink detection.
6. **Windows symlink EPERM test pattern**: `fs.symlinkSync` returns EPERM on Windows without admin / Developer Mode. Use `it.skipIf(process.platform === 'win32')` for symlink-creating tests. Pure-string-fallback tests run on both platforms; symlink-following tests run only on POSIX CI.
7. **Promise-based cache pattern**: when migrating sync module-level cache to async, use `let cached: Promise<T> | null = null`. Concurrent first-callers share the in-flight read; subsequent awaits resolve on the same microtask via the existing Promise reference.
8. **Async handler signature ripple**: sync handlers wrapping async dependencies are fragile — when the dependency becomes async, the handler becomes async too. Better to write handlers as `async` from the start if any dependency could be async.

## Ship Method

- 3 commits on main (T1, T2, T3) + this release commit.
- No squash (kept separate commits for clean diff review).
- `pnpm verify` 8-stage GREEN before each commit.
- No code-reviewer dispatch — each task was mechanical (mirroring existing patterns, no architectural decisions).

## 测试基线

- v1.19.0: 2593 + 2 SKIP / 0 fail
- v1.19.1: **2597 + 6 SKIP / 0 fail** (+4 net from T1 baseline; +4 symlink tests skip on Windows)
- pnpm verify 8-stage 全绿 (format / lint / type-check / test / coverage / build / import-regression)
- Coverage: maintained (new code fully covered)

## v1.18.0 §11.1 Carry-over Closure Status

| Item | Status |
|---|---|
| B-3 emit\*Decl + Handlebars | ✅ closed (T1 — migrated to `emit/strategy.ts` + Handlebars helpers registered; template reshape deferred to v1.20.0) |
| `isPathInside` symlink-parent false positive | ✅ closed (T2 — `isPathInsideReal` async helper; 3 IPC handlers updated) |
| Setting-file feature-flag readers async migration | ✅ closed (T3 — `arxml-stream` + `stencil` readers async; Promise cache) |
| C2.4 real `applyMutation` wire-up (carry-over from v1.6.x) | → v1.20.0 MINOR (high-risk; dedicated cycle with full TDD discipline) |

## Deferred Pipeline (next cycle)

- **v1.20.0 MINOR** — C2.4 GUI `applyMutation` parity: rewrite `useScriptStore.applyMutation` to route through `applyPatchSteps` (same engine as CLI). Thread `warnings[]` back to `runResult.warnings`. Preserve cascade-dialog semantics via hybrid path (remove-child direct, others via `applyPatchSteps`).
- **Handlebars template reshape** (B-3 second half): `cfg.h.hbs` / `cfg.c.hbs` / `pbcfg.c.hbs` call the registered helpers directly.