# v1.46.1 — Round-6 Follow-up Closure (PATCH)

**Released:** 2026-07-12
**Tag:** [`v1.46.1`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.46.1)
**Cycle type:** PATCH (process/operational + L8 residue closure)
**Ship basis:** 2 source commits (T1 + T2) + 1 docs ship (T3)

## Summary

Closes **2 findings from Round-6 fresh code review**:

| Finding | Severity | Status |
|---|---|---|
| **F-5a** `package.json` drift recurrence | **HIGH** | **CLOSED** (NEW release-checklist formalizes defense) |
| **F-1** `App.tsx` 840 LoC (+40 over cap) | LOW | **CLOSED** (NEW `<AppShell>` component extraction) |

Plus **3 lessons promoted to 2/3 confirmations**:

- `function-extract-must-clip-verbatim-not-reimplement` (#15) — 1/3 → **2/3**
- `release-checklist-must-verify-package.json-bump-on-every-version-ship` — 1/3 → **2/3**
- (Round-5 stale-snapshot lesson stayed 1/3 — Round-6 preflight prevented recurrence)

| | v1.46.0 baseline | **v1.46.1** | Delta |
|---|---|---|---|
| `package.json` `"version"` | `1.45.2` | **`1.46.0`** | synced with CHANGELOG |
| `App.tsx` LoC | 840 | **729** | **-111 (-13.2%)** |
| `useAppShell.tsx` LoC | — | **215** (NEW) | +1 file |
| Round-1 L8 backlog | 1/4 residue | **0/4 residue** | all `src/` files under cap |
| Tests | 3128 + 7 SKIP | 3128 + 7 SKIP | 0 |
| `pnpm verify` | 8-stage GREEN | 8-stage GREEN | maintained |
| Public API | unchanged | **unchanged** | 0 |

## Commits

| # | Commit | Title |
|---|---|---|
| T1 | `3afcb7d` | `chore(release): v1.46.1 PATCH T1 -- package.json drift recurrence closure + release-checklist amend` |
| T2 | `364033f` | `refactor(renderer): v1.46.1 PATCH T2 -- AppShell component extraction (App.tsx 840 -> 729)` |
| T3 | (this commit) | `docs(release): v1.46.1 PATCH -- Round-6 follow-up closure` |

## What's new

### T1 — `package.json` drift recurrence closure

**Root cause**: the v1.46.0 MINOR ship cycle followed the "Tree-touching process improvements ship as MINOR" convention (v1.45.0 D1 complement) but the ship commit's verification step ran `tsc --noEmit` instead of `pnpm verify`. The package.json vs CHANGELOG cross-check wasn't performed (Lesson #10 devlog-follow-up-status-claims missed because verify shortcut).

**Diff**:

```diff
-  "version": "1.45.2",
+  "version": "1.46.0",
```

Plus **NEW** `docs/superpowers/release-checklist.md` — pre-ship gate that cross-checks CHANGELOG top entry + package.json version + git tag before each ship commit, and post-ship gate that re-verifies all three after each `git push`. The release-checklist is the durable artifact that closes the bug class for future cycles.

### T2 — `<AppShell>` component extraction

NEW `src/renderer/hooks/useAppShell.tsx` (215 LoC): clipped **VERBATIM** from `src/renderer/App.tsx` lines 720-836, the 117-LoC dialog-host block. Per lesson `#15` (`function-extract-must-clip-verbatim-not-reimplement`, 2/3 confirmation after this cycle), no logic was reimplemented — only structural changes (imports relocated to relative paths, JSX wrapped in fragment, props extracted to `AppShellProps` interface).

**Mounts moved to `<AppShell>`**:

- 8 dialog hosts (PromptRoot + ConfirmRoot + ConfirmRoot2 + CascadeConfirmRoot + RemoveModuleConfirmRoot + NewProjectDialog + BswmdPickerRoot + ContextMenuRoot)
- 3 state-machine-conditional mounts (ModuleFromBswmdPicker + DcmConfigSuccessDialog + DcmConfigErrorToast)
- 1 ODX picker (DcmConfigPicker, conditional on `dcmLauncher.state.mode === 'picking-odx'`)

Mount order preserved: `<ConfirmRoot />` still mounts BEFORE `<NewProjectDialog />` because NewProjectDialog.onSubmit calls module-level `confirm()` which needs ConfirmRoot's `externalSetState` handle to have flushed.

**Cross-flow parameter pattern** (lesson `cross-flow-state-reads-must-flow-through-hook-parameters` 4th confirmation, originally from v1.42.1 MINOR T3):

`<AppShell>` consumes 9 props from the App.tsx shell, all originated by prior hook extractions (useAppMainHandlers + useDcmConfigLauncher + useBswmdHasDcm). The shell retains the orchestration; the dialog hosts own nothing but mount-order.

### Round-1 L8 file-size backlog residue closure

After this PATCH, **NO `src/` file is over the 800-LoC cap**:

| File | LoC | Cap buffer |
|---|---|---|
| `src/core/project/bswmd/parse-ecuc-dialect.ts` | 575 | 225 LoC (28%) |
| `src/renderer/hooks/useAppShell.tsx` | 215 | 585 LoC (73%) |
| `src/renderer/App.tsx` | **729** | **71 LoC (8.9%)** |
| `src/renderer/store/helpers/combinedDoc.ts` | 795 | 5 LoC (0.6%) |
| `src/main/ipc/register.ts` | 706 | 94 LoC (11.8%) |
| `src/renderer/hooks/useDcmConfigLauncher.ts` | 700 | 100 LoC (12.5%) |
| `src/renderer/hooks/useProjectActions.ts` | 698 | 102 LoC (13%) |

combinedDoc.ts at 795 is 5-LoC away from cap but is a single-purpose file (DocumentStore helper), no extraction warranted.

## Decisions

- **D1 PATCH-not-MINOR** — 2 atomic source commits (1-line version bump + 1 file extraction). Per `pure-refactor-minor-is-the-right-shape-for-deferred-cleanups-when-ipc-stable` lesson + the v1.45.0 D1 complement (tree-touching process improvements ship as MINOR), the App.tsx extraction is internal-refactor → PATCH.
- **D2 inline `pnpm verify` between T1 and T2** — caught prettier/import-order issues at pre-commit scope rather than post-commit scope. Saved an amend cycle.
- **D3 useAppShell.tsx as `.tsx` not `.ts`** — returns JSX fragment; React + TypeScript coding-style rule: `.tsx` for files containing JSX even if the file is mostly types.
- **D4 release-checklist amend as separate file, not as a section in CONTRIBUTING.md** — `CONTRIBUTING.md` doesn't exist in this repo; the release-checklist is a standalone process artifact.
- **D5 `PickedModule` type-only import relocated** — originally imported from `./useCreateEcucFromBswmd` (wrong — not re-exported). True export source is `core/arxml/skeleton.ts:44`. Located via grep; tsc caught the miss.

## Honest deviations

- (a) **combinedDoc.ts at 795 LoC** remains 5-LoC from cap. Not closed in this PATCH — single-purpose DocumentStore helper, extraction would create artificial boundary. Future cycle: split DocumentStore methods into 2 helper files (only if growth continues).
- (b) **Round-5 stale-snapshot lesson candidate stays at 1/3** — Round-6 preflight prevented recurrence; lesson was "you got bitten once, here are the rules", not "you got bitten twice with no rules". Verification by negative evidence is acceptable for this cluster but doesn't count toward promotion.
- (c) **NEW release-checklist amend is itself a process artifact** — it formalizes the lesson but is opt-in (no PreToolUse hook enforces it). If recurrence happens despite the checklist being in-repo, escalate to a PreToolUse hook in a future MINOR.

## Process lessons applied (across T1-T2)

- **Lesson #10** (devlog-follow-up-status-claims) — Round-6 preflight ran `git log --oneline -20` + cross-referenced each finding against shipped PATCH history; prevented the same stale-snapshot trap that tripped Round-5 (134th dispatch).
- **Lesson #11** (pkm-capture-stub-topic-file-recovery) — applied proactively; capture-decisions files written inline via Write tool.
- **Lesson #13** (per-flow prereq analysis) — T2 dialog-host extraction flow-mapped: 12 mounts across 3 categories (always-mounted / state-machine-conditional / mode-conditional). ConfirmRoot-before-NewProjectDialog order invariant preserved.
- **Lesson #14** (chunk-replacement guard) — applied to T1 via `Edit` tool (1-line bump; no marker-based replacement needed).
- **Lesson #15** (`function-extract-must-clip-verbatim-not-reimplement`) — 1/3 → 2/3 confirmation. T2 App.tsx extraction was clipped VERBATIM with only structural changes.

## NEW 2/3 lesson candidates (this cycle)

- **`function-extract-must-clip-verbatim-not-reimplement` (#15)** — confirms that the lesson learned at v1.46.0 T5 (where a rough-copy of `buildEcucModule` missed several internal fields) is durable. T2 App.tsx extraction followed the same protocol cleanly.
- **`release-checklist-must-verify-package.json-bump-on-every-version-ship`** — confirms that the release-checklist pattern works. Promotion to 3/3 + standalone tier requires 1 more occurrence in a future ship cycle (which would itself mean the checklist wasn't being followed).

## Test results

- vitest 350/350 files / 3128 + 7 SKIP / 0 fail (zero test delta — pure refactor + metadata)
- tsc `--noEmit -p tsconfig.json` + `--noEmit -p tsconfig.web.json` both clean
- prettier check clean after per-commit reformat
- eslint `--max-warnings 0` clean (0 errors, 0 warnings; useAppShell.tsx import/order auto-fixed via `eslint --fix`)
- **`pnpm verify` 8-stage GREEN** — python-self-test 8/8 PASS

## Related documents

- **CHANGELOG**: top entry of `CHANGELOG.md`
- **Release-checklist amend**: `docs/superpowers/release-checklist.md` (NEW this cycle)
- **Round-6 review report**: `01-Projects/claude-AutosarCfg/development/capture-decisions/claude-autosarcfg-round-6-fresh-review-2026-07-12.md` (NEW)
- **v1.46.0 ship notes** (predecessor): `docs/release-notes/v1.46.0/README.md`
- **Lesson #15 file** (2/3 confirmation this cycle): `01-Projects/claude-AutosarCfg/development/lessons/function-extract-must-clip-verbatim-not-reimplement.md`

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
