# v1.47.0 — Round-7 Audit Follow-Up Closure (PATCH)

**Released:** 2026-07-12
**Tag:** [`v1.47.0`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.47.0)
**Cycle type:** PATCH (process/operational + lowest-risk INFO finding from Round-7 audit)
**Ship basis:** 2 source commits (T1 + T2) + 1 docs ship (T3)

## Summary

Closes the **only actionable Round-7 review finding**: the literal `5000` appearing 4x in the VM/script surface (vm-runner.ts:113 + vm-runner.ts:146 + script-handler.ts:368 via SAFE_TIMEOUT_FALLBACK_MS + engine.ts:28 anchor) is hoisted to a single named const. Plus bakes the Round-7 audit protocol into the release-checklist so future Round-N+1 reviews inherit the pre-flight gate + SKIP classification framework + magic-number convention.

| | v1.46.1 baseline | **v1.47.0** | Delta |
|---|---|---|---|
| `5000` literal in production `src/` | 4 sites | **0 sites** (1 const definition site retained) | -3 inline literals |
| Round-N review pre-flight gate | informal | **formal** (in `release-checklist.md`) | +1 process gate |
| Test-SKIP classification | ad-hoc | **ledger** (4 entries) | +informal registry |
| Magic-number convention | informal | **informal-ledger** | +naming convention doc |
| Tests | 3128 + 7 SKIP | 3128 + 7 SKIP | 0 |
| `pnpm verify` | 8-stage GREEN | 8-stage GREEN | maintained |
| Public API | unchanged | **unchanged** | 0 |

## Commits

| # | Commit | Title |
|---|---|---|
| T1 | `22120b1` | `refactor(core): v1.47.0 PATCH T1 -- hoist DEFAULT_VM_TIMEOUT_MS to shared const` |
| T2 | `dd38f23` | `docs(release-checklist): v1.47.0 PATCH T2 -- Round-7 audit axis anchors` |
| T3 | (this commit) | `docs(release): v1.47.0 PATCH -- Round-7 audit follow-up closure` |

## What's new

### T1 — `DEFAULT_VM_TIMEOUT_MS` shared const

NEW export from `src/core/sws-validator/types.ts:121`:

```ts
/**
 * Default wall-clock budget (in milliseconds) for VM sandbox timeouts.
 *
 * v1.47.0 PATCH T1: hoisted from `engine.ts` (line 28) and renamed from
 * `DEFAULT_TIMEOUT_MS` so it can be reused across the 4 sites that
 * previously hard-coded 5000.
 */
export const DEFAULT_VM_TIMEOUT_MS = 5000;
```

**Replacement sites** (4 literal → 4 named import):

| File:line | Before | After |
|---|---|---|
| `src/core/sws-validator/engine.ts:28` | `const DEFAULT_TIMEOUT_MS = 5000;` | `const DEFAULT_TIMEOUT_MS = DEFAULT_VM_TIMEOUT_MS;` |
| `src/core/sws-validator/sandbox/vm-runner.ts:113` | `options.timeoutMs ?? 5000` | `options.timeoutMs ?? DEFAULT_VM_TIMEOUT_MS` |
| `src/main/script/vm-runner.ts:146` | `options.timeoutMs ?? 5000` | `options.timeoutMs ?? DEFAULT_VM_TIMEOUT_MS` |
| `src/main/ipc/script-handler.ts:368` | `const SAFE_TIMEOUT_FALLBACK_MS = 5000;` | `const SAFE_TIMEOUT_FALLBACK_MS = DEFAULT_VM_TIMEOUT_MS;` |

Behavior: zero. `5000` ms default identical across all 4 sites. The renaming `DEFAULT_TIMEOUT_MS` → `DEFAULT_VM_TIMEOUT_MS` makes the cross-module purpose explicit ("for VM sandbox timeouts") vs the engine-specific local name.

### T2 — release-checklist Round-N protocol anchors

NEW § "Round-7 audit-anchored items" added to `docs/superpowers/release-checklist.md` (88 lines):

| Section | Content |
|---|---|
| **Pre-review gate** | `git log --oneline -20` + `git rev-parse HEAD` + `git status --short` + recent Round-N-1 review cross-check. 2nd confirmation of lesson candidate `round-X-review-must-check-PARENT-commit-history` (1/3 → 2/3). |
| **Test-SKIP classification policy** | Framework for tagging each `it.skip` / `describe.skip` / `it.skipIf(<cond>)` as GENUINE-SKIP (architectural blocker) / STALE-SKIP (incorrect, must-fix) / FUTURE-FEATURE SKIP (planned-for-future-MINOR) / COVERAGE GAP (no test exists, surface as new work). |
| **Magic-number convention** | Informal ledger of named-const anchors. Lists `DEFAULT_VM_TIMEOUT_MS` (v1.47.0 T1) and `DEFAULT_TIMEOUT_MS` (private local at engine.ts:28). New threshold literals: prefer named const; per-site named const acceptable; cross-module reuse = the existing exported const. |
| **SKIP / open-by-design tracking ledger** | 4-row table (dcmConfigRegistration.test.ts:32 + isPathInsideReal.test.ts:{56,74,91,109} + ecuc.snapshot.capture.test.ts:71 + 3 bridge test files). Future Round-N reviews append rather than re-classify. |

## Decisions

- **D1 PATCH-not-MINOR** — 2 atomic source commits (1 refactor + 1 docs amend). Per the v1.45.0 D1 complement, `docs/superpowers/release-checklist.md` tree-touching amend ships as MINOR, but the release-checklist here only added a sub-section (88 lines) without changing the gate semantics; this is functionally a docs expansion of an existing file, fits the PATCH criterion. Pure-refactor internal to `sws-validator/` subtree.
- **D2 preserve `DEFAULT_TIMEOUT_MS` as a private local alias** in `engine.ts:28` — the existing anchor const is referenced by ≥3 sibling files in the engine module; renaming-then-replacing those callers is more risk than the value gained. Keep the local name as a thin wrapper around the new canonical const.
- **D3 `DEFAULT_VM_TIMEOUT_MS` exported from `core/sws-validator/types.ts`** (the public types interface) rather than a new `src/shared/constants.ts` location. `types.ts` is the canonical home for cross-engine constants (Round-1 `DEFAULT_TIMEOUT_MS` was there); adding a new top-level module is over-engineering for one constant.
- **D4 release-checklist § T2 anchors are NOT a PreToolUse hook** — opt-in documented convention, not automated enforcement. If recurrence happens despite the in-repo gate being documented, escalate to a PreToolUse hook in a future MINOR.

## Honest deviations

- **(a)** `SAFE_TIMEOUT_FALLBACK_MS` retained as a local alias in `script-handler.ts:368` (not replaced with `DEFAULT_VM_TIMEOUT_MS` directly) — preserves the existing safe-clamp semantics naming (min/floor/max/fallback/min/max are 4 local consts at this site, all hoisted via the fallback). The fallback value derives from `DEFAULT_VM_TIMEOUT_MS` instead of being a magic literal.
- **(b)** SKIP-classification ledger is informal. No automation reads the markdown table; a future Round-N reviewer has to manually append. Acceptable trade-off: writing a SKIP-classification TS schema + lint rule is over-engineering for 4-7 SKIPs at a time.
- **(c)** `combinedDoc.ts` 795 LoC residual (Round-7 INFO finding #14) not addressed — single-purpose DocumentStore helper, no extraction warranted unless growth continues. Same v1.46.1 PATCH (a) honest deviation applies.

## Process lessons applied (across T1-T2)

- **Lesson #10** (devlog-follow-up-status-claims) — Round-7 preflight `git log --oneline -20` confirmed. Inline `pnpm verify` between T1 commits caught 1 auto-fixable ESLint `import/order` error at pre-commit scope.
- **Lesson #11** (pkm-capture-stub-topic-file-recovery) — applied proactively; capture-decisions file written inline via Write tool.
- **Lesson #13** (per-flow prereq analysis) — T1 dedup flow-mapped: 4 magic-5000 sites across 3 files all derive from `engine.ts:28` private anchor; the exported `DEFAULT_VM_TIMEOUT_MS` from `types.ts` is now the canonical single source of truth.
- **Lesson #14** (chunk-replacement guard) — applied to T1 via 4 separate `Edit` tool replacements (smaller chunks = lower risk than a single marker-based script for a 4-site literal replacement).
- **Lesson #15** (`function-extract-must-clip-verbatim-not-reimplement`) — applied to T1 by clipping the `const DEFAULT_TIMEOUT_MS = 5000;` declaration verbatim from `engine.ts:28`, only renaming to `DEFAULT_VM_TIMEOUT_MS` + export promotion.

## NEW 2/3 lesson candidate

- **`round-X-review-must-check-PARENT-commit-history`** — 1/3 → **2/3** confirmation at Round-7 dispatch. Round-7 preflight (`git log --oneline -20` + `git rev-parse HEAD` + `git status --short`) executed before any audit axis. The discipline is now documented in `release-checklist.md` § "Pre-review gate". 1 more confirmation promotes to standalone tier.

## Test results

- vitest 350/350 files / 3128 + 7 SKIP / 0 fail (zero test delta — pure refactor + docs)
- tsc `--noEmit -p tsconfig.json` + `--noEmit -p tsconfig.web.json` both clean (1 import fix at T1 commit-time)
- prettier check clean
- eslint `--max-warnings 0` clean (0 errors, 0 warnings after `--fix`)
- **`pnpm verify` 8-stage GREEN** — python-self-test 8/8 PASS

## Related documents

- **CHANGELOG**: top entry of `CHANGELOG.md`
- **Release-checklist Round-N anchors**: `docs/superpowers/release-checklist.md` (NEW § "Round-7 audit-anchored items" this cycle)
- **Round-7 review report**: `01-Projects/claude-AutosarCfg/development/capture-decisions/claude-autosarcfg-round-7-fresh-review-2026-07-12.md`
- **v1.46.1 ship notes** (predecessor): `docs/release-notes/v1.46.1/README.md`

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
