# v1.54.3 — Multi-Instance Tree Multi-Doc Hydration (PATCH)

**Released:** 2026-07-15
**Tag:** [`v1.54.3`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.54.3)
**Cycle type:** PATCH (UI hydration fix; no IPC, no schema, no backend change)
**Ship basis:** 4 commits — 2 source fixes + 1 diagnostic banner + 1 banner revert

## Summary

Closes the user-reported "Tree shows only 2 of 8 modules after opening project"
UX gap from 2026-07-14. The root cause was that `buildCombinedDocument` ran
`dedupRootPackages` on UN-folded docs — every ECUC value file shares the
wrapper shortName (`AUTOSAR_R22`) at the top level — so dedup collapsed N
files to 1, and the post-hoc `foldVendorPackages` then collapsed the single
remaining wrapper to one module. Result: a manifest with 5 ECUC value files
of the canonical `AUTOSAR_R22 > EcucDefs > <module>` shape rendered only
2 module roots in the Tree (depending on which files survived dedup because
their packages happened to bypass the wrapper shortName match).

Two-layer fix:

1. **`b9f641a`** — `openProject` auto-promotes `viewMode` to `'combined'`
   when the IPC bundle holds 2+ value-side docs (and current viewMode is
   the default `'single'` and `importSession === null`). The combined view
   is the render path that goes through `computeDisplayDoc` →
   `buildCombinedDocument` → dedup-after-fold.
2. **`6478fbd`** — `foldVendorPackages` moved INSIDE `buildCombinedDocument`
   so the per-doc vendor-fold runs BEFORE the root-dedup pass. Dedup now
   sees the already-unwrapped module shortNames (each unique across the N
   docs) and keeps every entry.

The intermediate **`79e3590` / `a9939cd`** pair added and then immediately
reverted a UI diagnostic banner (`DIAG: loaded N/M docs, displayDoc.packages=P`)
that surfaced the counts in the existing `error` field without DevTools
console. Once the user confirmed the symptom, the banner was stripped so it
does not pollute production.

**Zero IPC change. Zero backend change. Zero schema change.**

## Commits

| # | Commit | Title |
|---|---|---|
| T1 promote | `b9f641a` | `fix(store): openProject auto-promotes viewMode to combined on multi-doc open` |
| T2 root cause | `6478fbd` | `fix(store): combined-mode vendor-fold runs BEFORE root dedup (Bug 5)` |
| T3 DIAG banner | `79e3590` | `fix(store): openProject surfaces DIAG banner for Bug 5 root-cause` |
| T3 DIAG revert | `a9939cd` | `Revert "fix(store): openProject surfaces DIAG banner for Bug 5 root-cause"` |
| T-ship | (this commit) | `docs(release): v1.54.3 PATCH -- Multi-Instance Tree multi-doc hydration` |

## Decisions

- **D1 promote viewMode in openProject, not in UI** — the combined
  `displayDoc.packages` is the correct render path; promoting the UI mode
  inside `openProject` keeps the user-visible flow aligned with the data
  shape without an explicit "Switch to Combined" interaction.
- **D2 fold before dedup (not the other order)** — the dedup groups by
  raw `pkg.shortName`. Folding first collapses the wrapper chain
  (`AUTOSAR_R22 > EcucDefs > <module>`) to the module shortName, so dedup
  sees 5 distinct names instead of 5 identical `AUTOSAR_R22` wrappers.
  Going the other order (dedup first) — the pre-fix shape — lost 4 of 5
  entries silently.
- **D3 keep importSession lockout on promote** — if `importSession !== null`
  the user is mid-import and the three-state guard at
  `uiSlice.ts:189-194` would reject `viewMode='combined'`. The promote
  branch respects the user's explicit choice and skips silently.
- **D4 DIAG banner as a one-shot diagnostic** — the banner lived for one
  cycle (commit add + commit revert = same delta). Once the user confirmed
  the post-fix Tree renders all 5 modules, the banner was reverted so
  `error` field semantics stay clean for production.
- **D5 single `set(...)` in openProject** — promote logic computes
  `resolvedViewMode` BEFORE the existing single `set(...)` call so the
  hydrate stays atomic. Calling `setViewMode('combined')` as a second
  store update would force the warnings slice to rekey through the
  `setViewMode` setter's own reset (wiping the just-computed dedup
  warnings).

## User-visible behavior

Before v1.54.3:
- Open project whose manifest references 5 ECUC value-side ARXML files
  (shape `AUTOSAR_R22 > EcucDefs > <module>`)
- ProjectPanel correctly lists all 5 files
- Tree renders only 2 module roots (`JWQ3399`, `CanIf` in the user case);
  the other 3 are silently dropped

After v1.54.3:
- Open the same project
- ProjectPanel still lists all 5 files (no UI change here)
- Tree renders all 5 module roots: `JWQ3399` / `CanIf` / `CanNm` / `Com` / `ComM`
- viewMode auto-promotes from `'single'` to `'combined'` so the multi-doc
  `findByPathMultiDoc` flat-mode fallback kicks in (already existed,
  previously unreachable in single-mode)

## Test results

- vitest 367 files / **3215 + 7 SKIP / 0 fail** (+6 net from v1.54.2's
  3209 baseline)
- tsc both `tsconfig.json` + `tsconfig.web.json` clean
- `pnpm verify` 8-stage GREEN
- New tests added (session 245):
  - **`useArxmlStore.openProject-bswmd.test.ts`** — 4 promote / single-doc /
    importSession-lockout / re-promote cases (lines 354-530)
  - **`combinedDoc.test.ts`** — 2 dedup-after-fold cases (lines 581-636)
    covering the user-reported 5 ECUC value doc scenario + an empty-BSWMD
    robustness variant

## Process lessons applied

- **`function-extract-must-clip-verbatim-not-reimplement`** (standalone) —
  T2 root-cause fix reused existing `foldVendorPackages` and
  `dedupRootPackages` signatures verbatim; no reimplementation drift.
- **`release-checklist-must-verify-package.json-bump-on-every-version-ship`**
  (standalone) — `package.json` bumped `1.54.2` → `1.54.3` in the same
  commit as the second source fix (was staged in working tree from earlier
  session cadence).

## NEW 1/3 lesson candidates (awaiting 2 more observations each)

- **`dedup-helper-must-run-after-fold-or-on-equivalent-shape`** —
  Session 245 root cause. `dedupRootPackages` was called on un-folded
  packages because both helpers were independently correct in isolation.
  The composition order (dedup → vs fold →) wasn't unit-tested at
  integration boundary. The vitest mock that vitest's `openProject`
  test fed in skipped the IPC → buildCombinedDocument → dedup chain
  entirely, so the bug surfaced only in real dev at user hand.
- **`vitest-mock-must-replicate-real-call-chain-not-just-leaf-input`** —
  Same session observation. When a unit test fixtures `[doc1, doc2, ...]`
  directly into the leaf reducer it loses the chance to catch bugs in
  the composition above the leaf. The right fix is either (a) add a
  composition-level integration test for the IPC → reducer branch, or
  (b) fixture via the same call site the production code uses.
- **`user-screenshot-with-facts-doesnt-need-mock-tests-just-trace-calls`** —
  When the user hands a screenshot showing exact counts (5 listed,
  2 rendered), the fastest path is to read the call chain top-to-bottom
  on the deltas — not to write more vitest fixtures. Mock tests in this
  session consumed ~15 minutes and 0 information; static code reading
  of `combinedDoc.ts:159-165` + `dedupRootPackages:264-265` revealed the
  bug in 30 seconds.

## Related documents

- **Plan**: `docs/superpowers/plans/2026-07-14-bug5-multidoc-promote-combined.md`
- **Per-task briefs / reports**: `.superpowers/sdd/task-1-{brief,report}.md`
- **Whole-branch review diff**: `.superpowers/sdd/review-9b1b2c7..a878f7c.diff`
  (also `review-9b1b2c7..b9f641a.diff` after reword — see git log)
- **CHANGELOG**: top entry of `CHANGELOG.md`

## Future work (deferred per Bug 4 / Bug 5 closeout)

- **`Bug 4` — `CanIfHrhCfg_1` collection fold** (session 245 deferred). The
  `stripSuffix` widening reverted in `9b1b2c7` is the candidate next PATCH;
  needs a separate repro before fix.
- **single-mode multi-doc union** (deferred feature work) — the openProject
  promote is the minimum to surface all docs in the Tree, but single-mode
  mutators still operate on `state.doc` (activeDoc). If the user wants
  per-doc mutation in single-mode view, that requires threading docIndex
  through `resolveContainerTarget` (separate feature, not a PATCH).
- **multi-agent repro infra** (process improvement) — the
  `superpowers:subagent-driven-development` flow worked well for the
  implementer + reviewer chain on the promote fix; the in-process repro
  via vitest fixtures turned out to be the wrong tool for surfacing
  composition-order bugs. Future session: spawn a `playwright-replay` agent
  for any user-reported visual bug instead of mock-test cycles.

## Manual smoke test (recommended at install time)

1. Open `C:\Users\13777\Desktop\ClaudeAutosarWorkSpace\111.autosarcfg.json`
2. Verify ProjectPanel lists 5 ECUC value files under "值侧 ARXML"
3. Verify Tree renders 5 module roots: `JWQ3399` / `CanIf` / `CanNm` / `Com` / `ComM`
4. Verify viewMode auto-promoted to combined (no user interaction required)
5. Click each root — confirm `findByPathMultiDoc` resolves the click to
   the correct source doc via the flat-mode fallback
6. Add a sub-container under one of the formerly-missing modules
   (`Com > ComConfig > ComIPdu > new`) — confirm `addContainer` routes
   through the post-fix `coreBulkRemove`-pre-validated mutation path
   (Phase P2 T1 already shipped, unrelated)
