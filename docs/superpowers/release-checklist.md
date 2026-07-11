# Release Checklist — claude-AutosarCfg

> **Purpose**: Prevent the kind of silent drift closed by `v1.45.2 PATCH` (`0d7ad33`) and recurring in `v1.46.0 MINOR` (closed by `v1.46.1 PATCH`).
>
> **Apply on EVERY ship commit** — not just MINOR/PATCH cycles, also applies to vault-only PATCHes where a version string is mentioned anywhere.

## Pre-ship gate (run before `git commit` of ship commit)

```bash
# 1. CHANGELOG.md top entry must match package.json "version"
grep -m1 '^## ' CHANGELOG.md   # expect: ## vX.Y.Z ...
grep -m1 '"version"' package.json   # expect: "version": "X.Y.Z",

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
