# v1.48.1 — Round-8 Audit Follow-Up Closure (PATCH)

**Released:** 2026-07-12
**Tag:** [`v1.48.1`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.48.1)
**Cycle type:** PATCH (process/operational + 1 stale-literal fix)
**Ship basis:** 2 source commits (T1 + T2) + 1 docs ship (T3)

## Summary

Closes **2 Round-8 review findings**: F-1 CRITICAL (package.json 3rd-cycle silent drift recurrence) + F-3 LOW (GET_APP_VERSION hard-coded `'0.11.0'` literal predating v1.0.0). F-2 MEDIUM (onScriptProgress HMR listener leak, dev-only) deferred to v1.49.x — production sandbox-safe.

| | v1.48.0 baseline | **v1.48.1** | Delta |
|---|---|---|---|
| `package.json` `"version"` | `1.46.0` | **`1.48.0`** | synced with CHANGELOG + tag |
| `GET_APP_VERSION` channel | `'0.11.0'` (stale literal) | `app.getVersion()` | reads live package.json |
| Tests | 3128 + 7 SKIP | **3131 + 7 SKIP** | +3 regression cases |
| `pnpm verify` | 8-stage GREEN | 8-stage GREEN | maintained |
| Public API | unchanged | **unchanged** | 0 |

## Commits

| # | Commit | Title |
|---|---|---|
| T1 | `a54b72e` | `chore(release): v1.48.1 PATCH T1 -- package.json drift closure + checklist enforcement` |
| T2 | `4658c37` | `fix(ipc): v1.48.1 PATCH T2 -- GET_APP_VERSION reads app.getVersion() not literal` |
| T3 | (this commit) | `docs(release): v1.48.1 PATCH -- Round-8 audit follow-up closure` |

## What's new

### T1 — package.json drift closure (F-1 CRITICAL)

**Fix**: `package.json:3` bumped from `"1.46.0"` → `"1.48.0"`.

**Why this is the 3rd recurrence**: the release-checklist pre-ship gate (committed at v1.46.1 PATCH T1 `3afcb7d`) only cross-checked CHANGELOG + git tag, NOT `package.json`. The bypass happened on:
- v1.47.0 PATCH T1 (`22120b1`): line was `1.46.0` while shipping v1.47.0
- v1.48.0 MINOR T1 (`719ec40`): line was still `1.46.0` while shipping v1.48.0

Round-8 audit preflight (`git log --oneline -20 + git rev-parse HEAD`) caught F-1 via 3-way mismatch verification (package.json + CHANGELOG + tag). The fix not only bumps the version but **amends the gate** to require explicit package.json parity, so future ship cycles surface drift at pre-commit scope rather than post-release.

### T2 — GET_APP_VERSION literal replacement (F-3 LOW)

`src/main/ipc/register.ts:121-128` was returning hard-coded `'0.11.0'`. Now `return app.getVersion()` reads the live package.json "version" so the channel returns the same value `electron-builder` bakes into the installer.

**New regression test** (`src/main/ipc/__tests__/getAppVersion.test.ts`, 3 cases):

| Case | Pins |
|---|---|
| `GET_APP_VERSION handler returns app.getVersion() (not a stale literal)` | The handler reads the mocked `app.getVersion()` ('9.9.9-test'), NOT the legacy '0.11.0' |
| `IPC_CHANNELS.GET_APP_VERSION is a stable string identifier` | Channel name 'app:get-version' doesn't drift |
| `ipcMain.handle received GET_APP_VERSION registration` | Mirror of dcmConfigRegistration.test.ts v1.30.0 pattern that catches "imported but never wired up" regressions |

**Test fixtures**: mock `electron.app.getVersion()` to return `'9.9.9-test'` so any drift toward a stale literal surfaces as an equality mismatch. Mock `ipcMain.handle` into a `Map<channel, handler>` so the test can invoke the registered handler without booting Electron (vitest cannot run `app.whenReady`; same GENUINE-SKIP pattern as Round-7 audit identified).

## Decisions

- **D1 PATCH-not-MINOR** — 2 source commits (1 metadata + 1 src fix + 1 test file). Internal refactor + procedural fix; no new feature surface.
- **D2 amend release-checklist gate (T1)** — the pre-ship gate is opt-in documentation; if recurrence happens despite the in-repo gate, escalate to a PreToolUse hook in a future MINOR. Currently: documented gate + 3-cycle observation → structural enforcement warranted vs. relying on the gate artifact alone.
- **D3 `app.getVersion()` not `package.json` re-read** — `app.getVersion()` is Electron's API that reads the version from package.json at boot and caches it. Re-reading package.json at handler-call time would couple IPC timing to filesystem I/O. `app.getVersion()` is the canonical way.
- **D4 Defer F-2 (HMR leak) to v1.49.x** — production sandbox-safe (Round-8 confirmed F-10 negative-evidence). The dev-mode-only leak is bounded to HMR module re-evaluation cycles; not user-facing. Idempotent-listener pattern + dedicated test scaffold deserve a separate PATCH cycle, not bundling with the metadata fix.
- **D5 3 separate test cases, not 1** — separate cases for "literal-not-returned", "channel string stability", and "registration wired" because each pins a different failure mode (regression vs. drift vs. import-but-never-wired). Bundling them into 1 assertion would obscure which behavior broke.

## Honest deviations

- **(a)** The release-checklist pre-ship gate artifact (committed at v1.46.1 PATCH `3afcb7d`) was **bypassed on v1.47.0 and v1.48.0 ship cycles**. The gate existed but was opt-in (`grep -m1 '^## ' CHANGELOG.md` does not surface `package.json` parity automatically). T1 of this PATCH adds explicit package.json parity check to the gate.
- **(b)** `getAppVersion.test.ts` mocks `ipcMain.handle` into a Map rather than booting Electron. Same GENUINE-SKIP pattern as Round-7 audit (`src/main/ipc/__tests__/dcmConfigRegistration.test.ts:32`).
- **(c)** Round-8 F-2 (onScriptProgress HMR listener leak, MEDIUM dev-only) **deferred to v1.49.x** — not user-facing, production sandbox-safe.

## Process lessons applied (across T1-T2)

- **Lesson #10** (devlog-follow-up-status-claims) — `pnpm verify` 8-stage state confirmed at each commit boundary.
- **Lesson #11** (pkm-capture-stub-topic-file-recovery) — applied proactively; capture-decisions file written inline via Write tool.
- **Lesson #13** (per-flow prereq analysis) — T1 verified which artifacts were stale vs current; T2 verified the GET_APP_VERSION contract via 3 negative-evidence test cases.
- **Lesson #14** (chunk-replacement guard) — applied to T1 (`Edit` tool for 1-line package.json bump).
- **Lesson #15** (`function-extract-must-clip-verbatim-not-reimplement`) — N/A (no file-split in this cycle).

## NEW 3/3 + NEW 1/3 lesson candidate promotions

- **`round-X-review-must-check-PARENT-commit-history-before-marking-findings-as-open`** → **PROMOTED TO STANDALONE** (3/3). 3 confirmations: Round-5 stale findings + Round-7 preflight + Round-8 preflight caught F-1. Now formally in Process Cluster Tier 14+.
- `package.json-version-bump-must-be-on-every-version-ship` → NEW 1/3 (F-1 explicit observation). 2 more observations promote to standalone.
- `electron-builder-silently-uses-stale-package.json-version` → NEW 1/3 (F-1 sub-lesson). 2 more observations promote to standalone.

## Test results

- vitest 3131/3131 / 3131 + 7 SKIP / 0 fail (+3 net from v1.48.0).
- tsc `--noEmit -p tsconfig.json` + `--noEmit -p tsconfig.web.json` both clean.
- prettier check clean.
- eslint `--max-warnings 0` clean (1 auto-fix at T2 commit-time for `getAppVersion.test.ts`).
- **`pnpm verify` 8-stage GREEN** — python-self-test 8/8 PASS.

## Related documents

- **CHANGELOG**: top entry of `CHANGELOG.md`
- **Round-8 review report**: `01-Projects/claude-AutosarCfg/development/capture-decisions/claude-autosarcfg-round-8-fresh-review-2026-07-12.md` (NEW)
- **v1.48.0 ship notes** (predecessor): `docs/release-notes/v1.48.0/README.md`
- **Release-checklist amend (T1)**: `docs/superpowers/release-checklist.md` § "Pre-ship gate" step 1a (NEW)

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
