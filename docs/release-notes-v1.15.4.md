# v1.15.4 PATCH — v1.15.3 follow-up closure + DOC-2 ship-bug fix

**Release Date**: 2026-06-27
**Type**: PATCH
**Tag**: `v1.15.4`
**Base**: v1.15.3 (`c93dbe4f`)

## Summary

Closes the 5 v1.15.3 follow-ups listed in `docs/release-notes-v1.15.3.md` §Known Follow-ups (3 real fixes done, 2 cosmetic skipped per release-notes author's own assessment), and **fixes a v1.15.3 ship-bug**: the DOC-2 deletion of `docs/bswmd-to-ecuc-mockup.html` (1454 lines) was lost in the v1.15.3 squash merge — the file's blob hash (`020589ca`) is identical between v1.15.2 (`844d6e17`) and v1.15.3 (`c93dbe4f`), proving the deletion never reached main despite the v1.15.3 release notes claiming it shipped. **Zero production-code changes; zero test-count delta; 0 snapshot regen; SEC1–SEC4 controls intact.**

## Items

### v1.15.3 Follow-up Closure (per `docs/release-notes-v1.15.3.md` §Known Follow-ups)

#### T1 — `fix(docs): user-manual.html — v1.15.3 follow-up closure (6 edits)`

- **(1) `user-manual.html:405`** — CSS comment `/* What's New banner (v1.15.1) */` → `/* What's New banner (v1.15.2) */`. The banner content was bumped to v1.15.2 in v1.15.3 T6 (DOC-1) but the CSS comment was left stale.
- **(2) `user-manual.html:918`** — Hero stat `<span>🧪 2472 tests · 96.72% stmts</span>` → `<span>🧪 2482 tests · 96.01% stmts</span>`. Test count and coverage % both from v1.15.1; v1.15.2/3 actuals are 2482 / 96.01%.
- **(3) `user-manual.html:930`** — Section comment `<!-- WHAT'S NEW IN v1.15.1 (manual baseline jump) -->` → `<!-- WHAT'S NEW IN v1.15.2 (manual baseline jump) -->`. Matches the section's v1.15.2 content.
- **(4) `user-manual.html:966`** — What's New list bullet `<strong>2472 tests · 96.72% stmts</strong>` → `<strong>2482 tests · 96.01% stmts</strong>`. Same 2 stale numbers; same fix.
- **(5) `user-manual.html:1196`** — CLI-output illustration `<span class="com"># === Stage: test ===        PASS (2472 passed)</span>` → `... PASS (2482 passed)`. The CLI mock was showing v1.15.1's test count.
- **(6) `user-manual.html:1197`** — CLI-output illustration `<span class="com"># === Stage: coverage ===    PASS (96.72% stmts)</span>` → `... PASS (96.01% stmts)`. Same as #5, the v1.15.1 coverage %.

6 line edits in 1 file, all user-visible (hero + What's New + CLI mock). `prettier --write` also added the missing trailing newline to the file (pre-existing warning).

#### T2 — `refactor(test): pipeline.test.ts — extract warnings const (prettier-3 80-char friendly)`

The v1.15.3 M-T4-1 refactor (chained `.not.toContainEqual(...)`) left the BSW-SEC-003 WARN bound assertion as a 3-line `expect(...).toBeLessThanOrEqual(1)` block where the inner `diagnostics.filter((d) => d.severity === DiagnosticSeverity.WARNING).length` is a 73-char single line that prettier-3 tolerates but does not flag (it would warn if it crossed 80). Re-extract to a const for readability and to lock the prettier-clean shape:

```ts
// BSW-SEC-003 known-warn tolerance per v1.14.2 H1 (≤1 WARN).
const warnings = diagnostics.filter((d) => d.severity === DiagnosticSeverity.WARNING);
expect(warnings.length).toBeLessThanOrEqual(1);
```

The 87-char line `const warnings = diagnostics.filter(...)` is well within prettier's 100-col ceiling and matches the project style (the file already has other long `.filter(...)` lines). `prettier --write` added the missing trailing newline (pre-existing warning). 1 file, 1 assertion refactor, same 5 invariants asserted, same 0-fail outcome.

#### Skipped per release-notes author's own assessment

- **T-skip-A (`c-type-for-kind.test.ts:74-77`)** — release notes: "consider 1-line comment explaining satisfies over as (would be redundant commentary about commentary)". The test already has 4 lines of comment explaining the `satisfies` + double-cast pattern; adding a 1-line summary would be redundant. **Skipped**.
- **T-skip-B (`c-type-for-basic-kind.test.ts:1-15`)** — release notes: "header block is ~5 physical lines; could be split if project standard prefers shorter comments". The header is 15 lines of well-formatted prose that already cross-references the unified dispatcher file; the project's standard (per `c-type-for-kind.test.ts` header which is also 13 lines) is to keep detailed prose. **Skipped** to maintain consistency.

### v1.15.3 Ship-Bug Fix

#### T3 — `chore(docs): delete obsolete docs/bswmd-to-ecuc-mockup.html (DOC-2 lost in v1.15.3 squash merge)`

The v1.15.3 release notes claimed:
> "**DOC-2**: Delete the obsolete `docs/bswmd-to-ecuc-mockup.html` (1454 lines, sprint-14 era). The ECUC-from-BSWMD feature it mockups has long since shipped (v1.11.0 BSW code generator) and superseded. 3 historical references in `CHANGELOG.md` × 2 + `docs/superpowers/archive/plans/2026-06-18-ecuc-from-bswmd.md` × 1 intentionally retained."

**This is not what actually shipped.** Verification:

```bash
$ git ls-tree -r 844d6e17 -- docs/bswmd-to-ecuc-mockup.html
100644 blob 020589ca2dd90745d892ff3d09c367523ee2470f  docs/bswmd-to-ecuc-mockup.html

$ git ls-tree -r c93dbe4 -- docs/bswmd-to-ecuc-mockup.html
100644 blob 020589ca2dd90745d892ff3d09c367523ee2470f  docs/bswmd-to-ecuc-mockup.html
```

Same blob hash (`020589ca`) on both commits. The v1.15.3 T7 commit (DD-1) message was "chore(docs): DOC-2 — delete obsolete sprint-14 bswmd-to-ecuc-mockup.html (1454 lines)" but the file survived the squash merge. The diff between c93dbe4 and 844d6e1 shows only 3 files changed (plan, spec, user-manual.html) — the deletion did not make it into the squash.

**Likely root cause**: When the v1.15.3 commits were POSTed via the `gh api` `git/blobs` + `git/trees` + `git/commits` chain (per v1.15.2 ship pattern), the T7 commit's tree either included the file accidentally (a stale working tree) or the squash-merge input missed T7's tree-change. Either way, the 12 local commits made it to main as 1 squash commit; the file deletion did not survive the merge-base computation.

**Fix**: This v1.15.4 T3 commit deletes `docs/bswmd-to-ecuc-mockup.html` for real. 3 historical references intentionally retained per v1.15.3 plan:
- `CHANGELOG.md` (the file's v1.11.0 feature entry + the v1.15.3 entry referencing the failed deletion)
- `docs/superpowers/archive/plans/2026-06-18-ecuc-from-bswmd.md` (the original feature spec that the mockup illustrated)

#### T4 — `chore(release): T-RELEASE — v1.15.4 (package.json 1.15.4, CHANGELOG entry, release notes)`

- **`package.json`**: version `1.15.3` → `1.15.4`.
- **`CHANGELOG.md`**: add `## v1.15.4 (2026-06-27) — PATCH` section above v1.15.3.
- **`docs/release-notes-v1.15.4.md`**: this file.

## Statistics

- **Test count**: 2482 → 2482 (zero delta)
- **Test files**: 253 passed + 1 skipped + 0 fail
- **Snapshot regen**: 0
- **SEC1–SEC4 controls**: intact
- **Coverage**: 96.01% / 86.98% / 95.58% (unchanged; no production code touched)
- **Files changed**: 2 modified (`docs/user-manual.html`, `src/core/generator/__tests__/pipeline.test.ts`) + 1 deleted (`docs/bswmd-to-ecuc-mockup.html`) + 3 release artifacts (`package.json`, `CHANGELOG.md`, `docs/release-notes-v1.15.4.md`) = 6 total
- **Net line delta**: -1454 (mockup delete) + 10 (user-manual) - 11 (pipeline refactor) + release-artifact additions = ~+200
- **Commits**: 4 (T1, T2, T3, T4) on `feature/v1-15-4-patch`, squash-merged to main

## Next

- **v1.16.0 MINOR**: B-3 emit\*Decl + Handlebars parts + B-4 BSWMD full vendor modeling (`/EAS/` namespace + deep `<AR-PACKAGES>` + choiceContainers). Larger lift, separate spec/plan cycle.
- **v1.15.5 PATCH (if any new minor follow-ups)**: nothing on the horizon.

## Ship Method

Direct `git push` blocked (github.com:443 unreachable; proxy 127.0.0.1:7897 down per v1.15.2/3 pattern). Used `gh api` work-around per v1.15.2/3 pattern:

1. POST 4 commits via `git/blobs` + `git/trees` + `git/commits` (one chain per commit)
2. POST branch ref `feature/v1-15-4-patch` to final commit SHA
3. Create PR #16 via `pulls` endpoint
4. Squash-merge via `pulls/16/merge` endpoint
5. Create tag `v1.15.4` at squash SHA via `git/refs` endpoint
6. Create release via `releases` endpoint with this file as body

Local SHAs (HEAD on `feature/v1-15-4-patch`) will differ from remote SHAs (squash commit on `main` + `refs/tags/v1.15.4`) — same content, different git object hashes per v1.15.2/3 lesson.
