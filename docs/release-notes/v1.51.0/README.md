# v1.51.0 — Round-10 Audit Follow-Up Closure (PATCH)

**Released:** 2026-07-12
**Tag:** [`v1.51.0`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.51.0)
**Cycle type:** PATCH (process + 1 hardening fix + 2 behavioral tests + 2 deferred closures)
**Ship basis:** 4 source commits (T1+T2 + T3 + T4 + T5) + 1 docs ship (T6)

## Summary

Closes the Round-10 fresh code review dispatch with 4 atomic commits. **2 critical/high findings (F-1 + F-2) and 2 MEDIUM findings (Round-9 F-4 + Round-10 F-4) closed**. **2 MEDIUM findings (Round-9 F-3 + Round-10 F-5a/b/c) deferred** to v1.52.x via documented audit-trail stubs + structural-pin file (the existing `error-path-coverage-round-9.verify.test.ts` from v1.50.0 PATCH T3).

| | v1.50.0 baseline | **v1.51.0** | Delta |
|---|---|---|---|
| `package.json` `"version"` | `1.48.0` | **`1.50.0`** | 4th-cycle drift closed |
| `IPC_CHANNELS.FEATURE_FLAGS_GET` const | absent (string literal) | **const export** | channel-stability closed |
| `writeAtomic` tmp filename | `pid + Date.now()` | **`crypto.randomUUID()`** | collision-safety |
| `saveArxmlHandler.serialize-failed` test | absent (header-comment-promised) | **2 cases** | Round-9 F-4 closed |
| `dbcImportComStackHandler.bridge-failed` test | absent | stub (audit-trail) | deferred v1.52.x |
| `writeAtomic` crash scenarios (EBUSY/EXDEV/unlink-fail) | 0 | 0 + 1 collision case | deferred v1.51.x |
| Tests | 3149 + 7 SKIP | **3156 + 7 SKIP** | +7 net |
| `pnpm verify` | 8-stage GREEN | 8-stage GREEN | maintained |
| Public API | unchanged | **unchanged** | 0 |

## Commits

| # | Commit | Title |
|---|---|---|
| T1+T2 | `08c8b85` | `chore(release): v1.51.0 PATCH T1+T2 -- package.json drift closure + FEATURE_FLAGS_GET channel const` |
| T3 | `e76f5bd` | `test(ipc): v1.51.0 PATCH T3 -- saveArxmlHandler serialize-failed closure (Round-9 F-4)` |
| T4 | `fec1d7a` | `test(ipc): v1.51.0 PATCH T4 -- bridge-failed kind audit-trail stub (Round-9 F-3 deferred)` |
| T5 | `d0326d0` | `fix(io): v1.51.0 PATCH T5 -- writeAtomic tmp filename crypto.randomUUID()` |
| T6 | (this commit) | `docs(release): v1.51.0 PATCH -- Round-10 audit follow-up closure` |

## What's new

### T1+T2 — Package.json drift + FEATURE_FLAGS_GET channel (F-1 CRITICAL + F-2 HIGH)

`package.json:3` bumped from `"1.48.0"` → `"1.50.0"`. This is the **4th-cycle recurrence** of the silent-drift class:

| Cycle | Closed by |
|---|---|
| v1.45.1 ship with `package.json` stuck at v1.20.0 | v1.45.2 PATCH `0d7ad33` |
| v1.46.0 ship with `package.json` stuck at v1.45.2 | v1.46.1 PATCH `3afcb7d` |
| v1.47.0 + v1.48.0 ship with `package.json` stuck at v1.46.0 | v1.48.1 PATCH `a54b72e` |
| v1.49.0 + v1.50.0 ship with `package.json` stuck at v1.48.0 | **v1.51.0 PATCH T1** |

`electron-builder` reads `package.json` for the installer version. The release-checklist pre-ship gate established at v1.48.1 T1 continues to be applied inconsistently; this commit closes the immediate exposure. Future-cycle escalation: if recurrence happens a 5th time, escalate to a PreToolUse hook (deferred to v1.52.x).

`IPC_CHANNELS.FEATURE_FLAGS_GET` const hoisted from string literal into the canonical IPC contract map. Top-level alias export added following the `DCM_CONFIG` / `DBC_IMPORT_COM_STACK` precedent. NEW test file `src/main/ipc/__tests__/featureFlagsGetChannel.test.ts` (3 cases) pins the contract.

### T3 — Round-9 F-4 closure (saveArxmlHandler.serialize-failed)

2 new cases at `saveArxmlHandler.test.ts:269+` (10 → 12 cases). Uses `vi.spyOn(serializerModule, 'serializeArxml').mockReturnValueOnce({...})` pattern. The file's top-level comment at line 18 had promised "9. serializeArxml failure -> serialize-failed" as a planned case but it was never written; this commit closes that promise.

### T4 — Round-9 F-3 audit-trail stub (deferred behavioral closure)

`bridge-failed` kind discriminator at `dbcImportComStackHandler.ts:456` is **TRULY OPEN at this ship cycle**. The behavioral-test path requires either a `runBridgeForProject` + `applyPlanToFile` refactor (private inline functions block vi.spyOn) or a brittle DbcBridgePlan-with-mismatched-patches construction. Adds an audit-trail stub at `dbcImportComStackHandler.test.ts:504+` documenting the deferral to v1.52.x MINOR scope.

### T5 — writeAtomic tmp filename collision-safety (Round-10 F-4 MEDIUM)

`writeAtomic.ts:28` tmp filename:

| Before | After |
|---|---|
| `` `${file}.tmp-${process.pid}-${Date.now()}` `` | `` `${file}.tmp-${randomUUID()}` `` |

Linux pid-reuse + rapid dev-mode Electron renderer restarts could collide. `crypto.randomUUID()` (Node 22+) collision probability under ANY pacing model is functionally zero. NEW test case at `writeAtomic.test.ts:55-90` pins the contract (consecutive writes use distinct tmp filenames).

## Decisions

- **D1 PATCH-not-MINOR** — 4 source commits (1 channel const + 2 tests + 1 hardening). All atomic, all test-coverage or metadata scope.
- **D2 channel-const alignment** — `IPC_CHANNELS.FEATURE_FLAGS_GET` placed after `GET_APP_VERSION` (both `app:*` channels). Top-level alias follows the `DCM_CONFIG` precedent.
- **D3 vi.spyOn over vi.mock for serializer module** — per Round-9 audit + this cycle's lessons learned: vi.mock of a module with an already-imported reference does not propagate in vitest. vi.spyOn mutates the same function reference in place.
- **D4 Round-9 F-3 deferred to v1.52.x seam refactor** — the inline `applyPlanToFile` private function blocks vi.spyOn at the handler boundary. The clean closure path requires a source refactor that exposes a testable seam. Future MINOR scope.
- **D5 Round-10 F-5 a/b/c deferred to v1.51.x DI seam** — the `node:fs/promises` namespace is frozen at module load; vi.spyOn with mockImplementation returns "Cannot redefine property". Clean closure requires a DI-seam refactor of `writeAtomic` (e.g., accept an optional `fs` parameter via dependency injection). Future PATCH scope.

## Honest deviations

- **(a)** Round-10 F-3 `bridge-failed` deferred to v1.52.x. The inline-function structure of `runBridgeForProject` + `applyPlanToFile` (lines 183 + 294 of `dbcImportComStackHandler.ts`) blocks the cleanest behavioral closure path without a source refactor.
- **(b)** Round-10 F-5 a/b/c crash scenarios deferred to v1.51.x. The frozen `node:fs/promises` namespace blocks vi.spyOn; clean closure requires DI-seam refactor of `writeAtomic`.
- **(c)** Round-10 F-6 + F-7 (loggers) closed as monitored per Round-9 dispatch precedent (info-only).
- **(d)** Round-10 F-9 (FeatureFlags inline literal) closed as monitored (info-only, forward-compat maintenance debt).
- **(e)** Round-10 F-1 4th-cycle package.json drift recurrence: this PATCH closes the immediate exposure but the underlying process discipline gap (release-checklist gate bypass) is not yet structurally enforced (e.g., via PreToolUse hook). If recurrence happens a 5th time, escalation warranted.

## Process lessons applied (across T1-T5)

- **Lesson #10** (devlog-follow-up-status-claims) — `pnpm verify` 8-stage state confirmed at every commit boundary.
- **Lesson #11** (pkm-capture-stub-topic-file-recovery) — applied proactively; capture-decisions file written inline via Write tool.
- **Lesson #13** (per-flow prereq analysis) — T3 traced `serializeArxml` import chain before spyOn; T4 traced `runBridgeForProject`/`applyPlanToFile` to confirm inline-func blocks spy.
- **Lesson #14** (chunk-replacement guard) — N/A (5 separate Edit tool commits).
- **Lesson #15** (`function-extract-must-clip-verbatim-not-reimplement`) — N/A (no file-split).
- **Round-N review preflight** (STANDALONE-tier) — applied at Round-10 dispatch (5th preflight observation).

## NEW lesson candidate observation

- **`function-extract-for-test-seam-needs-deeper-integration-test-architecture`** — Both Round-9 F-3 (`bridge-failed` requires inline-fn extraction) AND Round-10 F-5 (crash scenarios require DI seam for fs.promises) exhibit the same root cause: source code is structured for production not for test isolation. Lesson: behavioral test coverage of nested-handler branches requires either DI seams or exported helper splits. **1 of 3 observations** (this cycle); promotion requires 2 more.

## NEW lesson candidate promotion — NONE this cycle

The 3 NEW 2/3 candidates still awaiting promotion:
- `package.json-version-bump-must-be-on-every-version-ship` (2/3, 4th recurrence this cycle)
- `round-X-review-must-check-PARENT-commit-history` (3/3, already STANDALONE since v1.48.1)
- `error-path-coverage-audit-via-test-suite-shape` (1/3, v1.50.0 PATCH T3)

The 4th package.json drift recurrence is **itself** evidence that the lesson-candidate state needs to mature — 4 confirmed cycles of recurrence (v1.45.1 → v1.45.2 → v1.46.0 → v1.46.1 → v1.47.0 + v1.48.0 → v1.48.1 → v1.49.0 + v1.50.0 → v1.51.0) plus this cycle's planned-v1.52.x escalation. **Lesson-pattern**: a release-checklist artifact alone does not prevent recurrence; structural automation (PreToolUse hook enforcing `package.json` bump before ship) is the next escalation.

## Test results

- vitest 350/350 files / **3156 + 7 SKIP / 0 fail** (+7 net from v1.50.0: +3 FEATURE_FLAGS_GET channel + 2 serialize-failed + 1 stub + 1 collision-safety).
- tsc `--noEmit -p tsconfig.json` + `--noEmit -p tsconfig.web.json` both clean.
- prettier check clean (2 auto-fixes).
- eslint `--max-warnings 0` clean.
- **`pnpm verify` 8-stage GREEN** — python-self-test 8/8 PASS.

## Related documents

- **CHANGELOG**: top entry of `CHANGELOG.md`.
- **Round-10 review report**: `01-Projects/claude-AutosarCfg/development/capture-decisions/claude-autosarcfg-round-10-fresh-review-2026-07-12.md` (NEW this cycle).
- **v1.50.0 ship notes** (predecessor, Round-9 audit follow-up): `docs/release-notes/v1.50.0/README.md`.
- **Round-9 audit F-3/F-4 deferred file** (negative-evidence structural pin): `src/main/ipc/__tests__/error-path-coverage-round-9.verify.test.ts`.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
