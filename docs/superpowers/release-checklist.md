# Release Checklist — claude-AutosarCfg

> **Purpose**: Prevent the kind of silent drift closed by `v1.45.2 PATCH` (`0d7ad33`) and recurring in `v1.46.0 MINOR` (closed by `v1.46.1 PATCH`).
>
> **Apply on EVERY ship commit** — not just MINOR/PATCH cycles, also applies to vault-only PATCHes where a version string is mentioned anywhere.

## Pre-ship gate (run before `git commit` of ship commit)

```bash
# 1. CHANGELOG.md top entry must match package.json "version" MUST MATCH
grep -m1 '^## ' CHANGELOG.md   # expect: ## vX.Y.Z ...
grep -m1 '"version"' package.json   # expect: "version": "X.Y.Z",

# 1a. **v1.48.1 PATCH T1** (Round-8 audit enforcement): `package.json`
#     "version" must equal the version that `electron-builder` will
#     bake into the installer. F-1 CRITICAL (3rd drift recurrence):
#     v1.47.0 PATCH T1 (22120b1) and v1.48.0 MINOR T1 (719ec40) both
#     bypassed this parity check, leaving package.json stuck at
#     v1.46.0 for 2 consecutive cycles. The original v1.46.1 PATCH
#     gate only checked CHANGELOG + git tag; this amendment explicitly
#     covers package.json. **all three MUST match**.
#
#     If package.json version differs from CHANGELOG top entry:
#       STOP. Fix package.json version bump in a separate atomic
#       commit BEFORE the ship commit. Then continue.

# 2. Tagged release must exist (or be about to exist)
git tag --list 'vX.Y.Z' 2>/dev/null   # expect: empty (we tag after commit)
git log --oneline -1   # expect: docs(release) commit with the new version

# 3. Verify gate (must be GREEN before shipping)
pnpm verify   # expect: 8-stage GREEN
```

## Post-ship gate (run after `git push`)

```bash
# 1. Verify CHANGELOG + package.json + GH release tag all match
grep -m1 '^## ' CHANGELOG.md        # GH release title
grep -m1 '"version"' package.json   # electron-builder installer version
git describe --tags --abbrev=0      # local tag

# All three MUST match. If they don't, this is the silent-drift bug
# closed by v1.45.2 PATCH (Round-5.1 actual-state verify).

# 2. Verify release-notes README exists for the new version
ls -la docs/release-notes/vX.Y.Z/README.md   # expect: file exists

# 3. If this commit closes a finding listed in a recent Round-N review,
#    update the relevant doc/section to mark the finding CLOSED with
#    the closing commit SHA (lesson: `round-X-review-must-check-PARENT-commit-history`).
```

## Why this checklist exists

The `v1.45.2 PATCH` (`0d7ad33`) closed a silent user-facing version drift
where `package.json` had been stuck at `"version": "1.20.0"` for 24
MINOR versions despite GH releases reaching `v1.45.1`. The same bug class
recurred in `v1.46.0 MINOR ship` (`0c3b848`) — `package.json` remained
at `1.45.2` while CHANGELOG documented `v1.46.0`.

Lesson candidate: `release-checklist-must-verify-package.json-bump-on-every-version-ship` (currently 2/3 confirmations after this PATCH).

## Related lessons

- [`round-X-review-must-check-PARENT-commit-history`](development/lessons/round-X-review-must-check-PARENT-commit-history.md) — before marking Round-N review findings as OPEN, run `git log --oneline -20` to verify they weren't already closed.
- `release-checklist-must-verify-package-json-bump-on-every-version-ship` (1/3 → 2/3 formalizing candidate) — this checklist exists because the drift recurred despite v1.45.2 closing it.

## What changes when the checklist grows

- New gate items: ADD them inline.
- Removed items: TICK the `// REMOVED: ...` comment first to preserve history.
- Closed findings affecting gates: update the relevant gate + reference the closing commit.

## Round-7 audit-anchored items (v1.47.0 PATCH T2)

### Pre-review gate (run before dispatching Round-N fresh code review)

```bash
# 1. Branch state sanity (lesson candidate
#    `round-X-review-must-check-PARENT-commit-history` 1/3 -> 2/3 at Round-7).
#    Without this preflight, Round-5 dispatch (134th) marked 4 findings
#    as OPEN that were actually closed in v1.41.0 MINOR -- a stale-snapshot
#    trap that pre-flight `git log --oneline -20` would have caught.
git log --oneline -20
git rev-parse HEAD
git status --short

# 2. Recent Round-N-1 review report cross-check
ls -la docs/release-notes/v*/README.md 2>/dev/null | tail -5
ls -la 01-Projects/claude-AutosarCfg/development/capture-decisions/*round-*.md 2>/dev/null | tail -5
# Confirm the previous round's findings are reflected in MEMORY.md's
# ship-log rotation before this round's review touches the codebase.
```

### Tests-with-skip classification policy (Round-7 audit axis #1)

`vitest run` reports 3128 PASS + 7 SKIP. The SKIPs are documented
case-by-case in `src/**/__tests__/` via `it.skip` / `describe.skip` /
`it.skipIf(<cond>)` comments. **Classification convention**:

- **GENUINE-SKIP** -- a SKIP that documents why the test cannot run in
  the current harness (e.g., electron `app.whenReady` requirement,
  Windows-only behavior). Tagged as "OPEN-by-design". Default: leave
  as-is, do not chase.
- **STALE-SKIP** -- a SKIP that was added before the underlying feature
  shipped and the skip is now incorrect. **Action required**: remove
  the skip + ensure the test passes against the shipped implementation.
- **FUTURE-FEATURE SKIP** -- SKIP for a planned-but-not-yet-shipped
  feature. Tag with a "// FUTURE: <feature> MINOR" comment so future
  review rounds know to check on this when scoping new MINORs.
- **COVERAGE GAP** -- new work needed; not flagged as a SKIP because
  no test exists. Surface in Round-N review tables as new MEDIUM/HIGH
  actionable finding.

When a Round-N review inspects SKIPs, classify each one in the
review report's table above and link to the relevant test file:line.

### Magic-number convention (Round-7 audit axis #4)

Currently informal -- no CONTRIBUTING.md in this repo. **Practiced
convention (informal)**:

- Default timeout constants already named: `DEFAULT_VM_TIMEOUT_MS`
  (v1.47.0 PATCH T1, exported from `core/sws-validator/types.ts:121`)
  - `DEFAULT_TIMEOUT_MS` (private local anchor at `engine.ts:28`).
- New timeout / threshold literals in production code: prefer named
  const over inline. Per-site named const is acceptable for one-off
  use; cross-module reuse = the existing exported const.
- Test fixtures: tolerate magic numbers (test ergonomics); production
  code: name them.

### Test SKIP / open-by-design tracking (informal ledger)

| File:line                                                                                              | Tag            | Why-skipped                       | Round-7 verdict |
| ------------------------------------------------------------------------------------------------------ | -------------- | --------------------------------- | --------------- |
| `src/main/ipc/__tests__/dcmConfigRegistration.test.ts:32`                                              | GENUINE-SKIP   | electron `app.whenReady` required | leave as-is     |
| `src/shared/paths/__tests__/isPathInsideReal.test.ts:56,74,91,109`                                     | GENUINE-SKIP   | Windows symlink edge cases        | leave as-is     |
| `src/core/generator/__tests__/ecuc.snapshot.capture.test.ts:71`                                        | GENUINE-SKIP   | manual capture-harness gate       | leave as-is     |
| `src/core/bridge/__tests__/{addChildSiblingStep,dcmConfigPipeline,xlsxDcmServicesToEcucBatch}.test.ts` | OPEN-by-design | `as unknown as T` test fixtures   | ergonomic       |

The "Informal ledger" is here so future Round-N+1 review rounds don't
have to re-classify the same SKIPs. Future Round-N should append new
classifications rather than re-investigate.

## Related lessons

- `round-X-review-must-check-PARENT-commit-history` (1/3 confirmed at
  Round-5 -> 2/3 confirmed at Round-7). 1 more confirmation promotes
  to standalone tier.
- `function-extract-must-clip-verbatim-not-reimplement` (#15, 2/3 at
  v1.47.0). Cross-referenced in `release-checklist.md` because
  file-split commits are the most common "behavior change disguised
  as refactor" pattern that a Round-N review might miss.

## v1.47.0 cycle context

This file was originally amended in v1.46.1 PATCH (T1) to close F-5a
HIGH (package.json drift recurrence). v1.47.0 PATCH T2 adds the
Round-7 audit axis anchors so future Round-N code reviews inherit
the pre-flight protocol + the SKIP classification framework.
