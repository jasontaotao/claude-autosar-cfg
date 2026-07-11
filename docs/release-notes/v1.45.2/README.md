# v1.45.2 — package.json + CHANGELOG Drift Closure (PATCH)

**Released:** 2026-07-11
**Tag:** [`v1.45.2`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.45.2)
**Cycle type:** PATCH (1-line version bump + 1-line format drift fix)
**Ship basis:** 1 source commit (T1) + 1 docs ship (T2)

## Summary

Closes the silent user-facing version drift discovered via Round-5.1 actual-state verify dispatch. `package.json` was still at `"version": "1.20.0"` despite 24 MINOR versions (v1.21.0..v1.45.1) having shipped through GH releases. `electron-builder` reads `package.json` for the installer version, so users installing from source-built installers were getting `v1.20.0` even though GH release pages showed `v1.45.1`.

| | v1.45.1 baseline | **v1.45.2** | Delta |
|---|---|---|---|
| `package.json` `"version"` | `1.20.0` | `1.45.2` | bumped to current |
| `CHANGELOG.md` format | 1 drift line | clean | prettier auto-fix |
| Tests | 3128 + 7 SKIP | 3128 + 7 SKIP | 0 |
| `pnpm verify` | 8-stage GREEN | 8-stage GREEN | unchanged |

## Commits

| # | Commit | Title |
|---|---|---|
| T1 | `0d7ad33` | `chore(release): v1.45.2 PATCH T1 -- bump package.json to 1.45.2 + CHANGELOG format drift fix` |
| T2 | (this commit) | `docs(release): v1.45.2 PATCH -- package.json + CHANGELOG drift closure` |

## What's new

### `package.json` version bump

```diff
-  "version": "1.20.0",
+  "version": "1.45.2",
```

This brings the source-build's installer version in sync with the GH release trail. Users running `pnpm install && pnpm build && electron-builder` will now get installers tagged `v1.45.2` rather than the silently-stale `v1.20.0`.

### CHANGELOG format drift fix

The v1.45.1 ship commit's CHANGELOG entry introduced 1 line of format drift (a missing blank line between a paragraph and a markdown bullet list, where prettier expects a blank line). The drift was cosmetic but `prettier --check` flagged it, which `pnpm verify`'s format stage would have failed on at the next dispatch. Fixed inline by `prettier --write`.

## Decisions

- **D1 PATCH-not-MINOR** — 1-line version bump + 1-line format drift fix; no src-tree behavioral change; entirely operational/process.
- **D2 CHANGELOG format drift included** — discovered during the package.json bump sanity-check (`pnpm verify` failed on format stage). Bundling the 1-line prettier fix in this PATCH is necessary to keep verify green; otherwise the format stage would fail at the next dispatch.
- **D3 no separate topic file for the 1-line CHANGELOG fix** — both changes (package.json bump + CHANGELOG format) ship as a single commit because they're both pre-flight-discovered during Round-5.1 actual-state verify dispatch.

## Process lessons applied

- **Lesson #10** (devlog-follow-up-status-claims) — confirmed `pnpm verify` 8-stage state before committing T1 (5th confirmation today).
- **Lesson #11** (pkm-capture-stub-topic-file-recovery) — applied proactively; inline write path used for forward-propagation.
- **Round-5.1 actual-state verify** (134th dispatch) — discovered this PATCH was needed via preflight scope check against recent ship history. Records the first observation of a 1/3 lesson candidate `round-X-review-must-check-PARENT-commit-history-before-marking-findings-as-open`.

## How this was discovered

The Round-5.1 actual-state verify dispatch (134th dispatch, 2026-07-11) checked Round-5 review findings against current src-tree state. Round-5 listed 4 actionable findings + a 4-file file-size backlog. Verification revealed:

- All 4 actionable findings (H1 + M2 + M3 + M4) had been closed in **v1.41.0 MINOR** (committed before Round-5 was reviewed on 2026-07-09 — review was on a stale snapshot).
- File-size backlog reduced from 4 files to 1 (`bswmd/parse.ts` 1196 LoC is the only file strictly over 800-LoC cap; `App.tsx` reduced from 1375 → 840 by v1.42.x PATCH chain; `mutation.ts` was split into 2 sub-625-LoC files).
- `package.json` was still at `1.20.0` despite the GH release trail reaching `v1.45.1` — silent user-facing version drift on source-build installers.

The Round-5.1 capture-decisions file (`01-Projects/claude-AutosarCfg/development/capture-decisions/claude-autosarcfg-round-5-1-actual-state-verify-2026-07-11.md`) flagged the `package.json` issue as the most urgent item in the Round-5 leftover pool. This PATCH closes it.

## Test results

- `pnpm format:check` → clean
- `pnpm lint --max-warnings 0` → 0 errors, 0 warnings
- `pnpm type-check` → both tsconfigs clean
- `pnpm test` → 350/350 files / 3128 + 7 SKIP / 0 fail (zero delta)
- `pnpm verify` → **8-stage GREEN, python-self-test 8/8**

## Related documents

- **CHANGELOG**: top entry of `CHANGELOG.md`
- **Round-5.1 actual-state verify** (discovery): `01-Projects/claude-AutosarCfg/development/capture-decisions/claude-autosarcfg-round-5-1-actual-state-verify-2026-07-11.md`
- **Round-5 review** (original stale inventory): `01-Projects/claude-AutosarCfg/development/code-review-round-5-i18n-locale-process-hygiene-2026-07-09.md`
- **v1.45.1 ship notes** (predecessor): `docs/release-notes/v1.45.1/README.md`

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
