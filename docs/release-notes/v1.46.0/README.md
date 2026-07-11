# v1.46.0 — `bswmd/parse.ts` Round-2 File-Split (MINOR)

**Released:** 2026-07-12
**Tag:** [`v1.46.0`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.46.0)
**Cycle type:** MINOR (pure-refactor + L8 backlog closure)
**Ship basis:** 5 atomic source commits (T1, T2, T3, T4, T5) + 1 docs ship commit

## Summary

Closes the **Round-1 L8 file-size backlog for `bswmd/`** — `src/core/project/bswmd/parse.ts` reduced from **1196 LoC → 248 LoC** (79.3% reduction) across 5 atomic sub-split commits. **All 7 `bswmd/` sub-files now well under the 800-LoC cap** (largest is `parse-ecuc-dialect.ts` at 575 LoC, 28% headroom).

No behavioral change at the public API surface — pure internal refactor. Zero test delta: 3128 + 7 SKIP / 0 fail across all 5 commits.

| | v1.45.2 baseline | **v1.46.0** | Delta |
|---|---|---|---|
| `parse.ts` LoC | 1196 | **248** | **-948** |
| `bswmd/` sub-files | 6 (with `parse.ts` at 1196) | **7 (all ≤ 575 LoC)** | +1 file |
| Round-1 L8 backlog | bswmd.ts 1531 → parse.ts 1196 | **fully closed** for `bswmd/` | -1 violator |
| Tests | 3128 + 7 SKIP | 3128 + 7 SKIP | 0 |
| `pnpm verify` | 8-stage GREEN | 8-stage GREEN | maintained |
| Public API | unchanged | **unchanged** | 0 |

## Commits

| # | Commit | Title | `parse.ts` LoC Δ |
|---|---|---|---|
| T1+T2 | `df525d4` | `refactor(core): v1.46.0 MINOR T1+T2 -- cycle-break + parse-primitives extract` | 1196 → 1128 |
| T3 | `5002e85` | `refactor(core): v1.46.0 MINOR T3 -- parse-eb-dialect extract` | 1128 → 1000 |
| T5 | `2693569` | `refactor(core): v1.46.0 MINOR T5 -- parse-ecuc-dialect extract` | 1000 → 440 |
| T4 | `2799a72` | `refactor(core): v1.46.0 MINOR T4 -- parse-tree-walker extract` | 440 → **248** |
| T6 | (this commit) | `docs(release): v1.46.0 MINOR -- bswmd round-2 file-split` | unchanged |

## What's new

### The 5 sub-splits (cumulative)

**T1 — cycle-break + parse-primitives extract**

Moved `validateModuleDefaults` real impl from `parse.ts` (lines 1131-1196) into `validate.ts` (84 LoC), breaking the v1.41.x PATCH T1 circular re-export (`parse.ts` ↔ `validate.ts`). NEW `parse-primitives.ts` (95 LoC) hosts 5 XML-attribute read helpers: `readShortName`, `readNumber`, `readBoolean`, `readUpperMultiplicity`, `readLowerMultiplicity`.

**T3 — parse-eb-dialect extract**

NEW `parse-eb-dialect.ts` (205 LoC) hosts EB-tresos dialect builders + element-text helpers: `buildEbModule`, `buildProvidedEntries`, `readElementText`, `readDesc`, `readDestAttr`, `lastPathSegment`. Documented cross-dialect dependency: `readElementText` + `readDesc` are used by both EB and ECUC dialects, so colocating them with the EB dialect avoids 2-way imports.

**T5 — parse-ecuc-dialect extract (the big one)**

NEW `parse-ecuc-dialect.ts` (575 LoC) hosts the ECUC-AR4 dialect builders + container/choice/parameter/reference sub-builders (12 functions: `buildEcucModule`, `buildContainerList`, `buildContainer`, `buildChoiceContainer`, `buildParamList`, `paramKindFromTag`, `buildParam`, `readEnumerationLiterals`, `readDefaultValue`, `buildRefList`, `buildRef`, `walkContainerDefaults`). `readMultiplicityConfigClasses` re-homed from `parse.ts` to `parse-eb-dialect.ts` (which owns the `readElementText` it depends on).

**T4 — parse-tree-walker extract (last sub-split)**

NEW `parse-tree-walker.ts` (257 LoC) hosts AR-PACKAGE + ELEMENTS walkers + path-lookup `findContainerInTree`. **`findContainerInTree` re-exported from parse.ts** so `lookup.ts:findContainerInTreeByPath` (which imports `findContainerInTree` from `./parse.js`) keeps working without a cross-file edit.

### Final 7 bswmd sub-files (all under 800 LoC)

| File | LoC | Origin | Cap headroom |
|---|---|---|---|
| `parse-primitives.ts` | 95 | T2 (NEW) | 705 |
| `validate.ts` | 84 | T1 (real impl) | 716 |
| `lookup.ts` | 106 | pre-existing (v1.41.x T1) | 694 |
| `parse-eb-dialect.ts` | 240 | T3 + 35 LoC in T5 (re-home `readMultiplicityConfigClasses`) | 560 |
| `parse-tree-walker.ts` | 257 | T4 (NEW) | 543 |
| `parse-ecuc-dialect.ts` | 575 | T5 (NEW) | 225 |
| `parse.ts` | **248** | T4 residual | 552 |

parse.ts residual contains: `parseBswmd` entry + `detectVersion` / `detectVersionLiteral` + `asArray` + `NS_PATTERN` / `SUPPORTED_VERSIONS` constants + `findContainerInTree` re-export.

### Why round-2 needs T5 before T4

The T0 spec listed T4 → T5, but actual dependency analysis flipped: `walkElementsForModules` (T4 candidate) imports `buildEcucModule` (T5 candidate). Without T5 first, T4's walker would need to import from `parse.ts`, defeating the DAG-clean goal. The T0 design spec at `docs/superpowers/specs/2026-07-11-v1-46-0-minor-bswmd-parse-split-design.md` retains the (revised) T1-T6 plan, with the T4-T5 order deviation noted.

## Decisions

- **D1 MINOR-not-PATCH** — pure-refactor without behavioral change, matches the `pure-refactor-minor-is-the-right-shape-for-deferred-cleanups-when-ipc-stable` lesson. Round-2 of file-split on a single file domain (`bswmd/`).
- **D2 T5 before T4 (revised order from spec)** — actual dependency required ECUC dialect extracted first so walker can import cleanly. T0 spec got the order wrong (off-by-one on cycle analysis).
- **D3 `findContainerInTree` re-export from parse.ts** — preserves `lookup.ts:findContainerInTreeByPath`'s `./parse.js` import path without cross-file edit. Public-surface stable.
- **D4 `asArrayLocal` private copy in each sub-file** — consistent pattern in `parse-eb-dialect.ts` + `parse-ecuc-dialect.ts` + `parse-tree-walker.ts`. Avoids cross-file runtime dep on `parse.ts`. Future cycle: hoist to `helpers/array.ts` shared utility.
- **D5 `walkContainerDefaults` dual-home (ecuc-dialect + validate)** — deduplication deferred; not blocking.

## Honest deviations

- (a) **`walkContainerDefaults` dual-home** — lives in both `parse-ecuc-dialect.ts` and `validate.ts`. ~25-line duplication. Future cycle should hoist to a shared helper.
- (b) **`parse-ecuc-dialect.ts` at 575 LoC** is the largest single file post-split. Under the 800-LoC cap (28% headroom) but could be split further if a future cycle needs additional ECUC sub-builder work. Not blocking for this MINOR.
- (c) **`asArrayLocal` triplicated** — exists in parse-eb-dialect.ts + parse-ecuc-dialect.ts + parse-tree-walker.ts. Future cycle should hoist to `helpers/array.ts` shared utility.
- (d) **T0 spec got T4/T5 order wrong** — flag-and-flip was a spec deviation, but lesson #13 (per-flow prerequisite analysis) caught it at runtime. The T0 spec document at `docs/superpowers/specs/2026-07-11-v1-46-0-minor-bswmd-parse-split-design.md` retains the (revised) T1-T6 plan.

## Process lessons applied (across T1-T5)

- **Lesson #10** (devlog-follow-up-status-claims) — confirmed `pnpm verify` 8-stage state before each commit.
- **Lesson #11** (pkm-capture-stub-topic-file-recovery) — applied proactively; capture-decisions written inline via Write tool to avoid the pkm-capture stall pattern observed earlier today.
- **Lesson #13** (per-flow prerequisite analysis) — T0 design spec flagged the dependency but cycle analysis was off-by-one (had to flip T4/T5 order at runtime).
- **Lesson #14** (chunk-replacement guard) — Python `must_replace` used function-presence check (not hook count) for the 21,575-char ECUC block delete + 7,970-char walker block delete + 3,820-char eb-dialect delete. The hook-count gate (v1.45.0) doesn't fit `function NAME` decl shape; the function-presence check is the second-tier gate.

## Test results

- vitest 350/350 / 3128 + 7 SKIP / 0 fail (unchanged across T1-T5)
- `tsc --noEmit -p tsconfig.json` + `--noEmit -p tsconfig.web.json` both clean
- prettier check clean after per-commit reformat
- eslint `--max-warnings 0` clean (0 errors, 0 warnings)
- **`pnpm verify` 8-stage GREEN** — same first-ship 8-stage result as v1.45.0 maintained across all 5 commits
- `python-self-test` 8/8 PASS (validate_hook_range.py coverage including new cases 5-8 from v1.45.1)

## Related documents

- **CHANGELOG**: top entry of `CHANGELOG.md`
- **T0 design spec**: `docs/superpowers/specs/2026-07-11-v1-46-0-minor-bswmd-parse-split-design.md`
- **Capture-decisions**: 4 files in `01-Projects/claude-AutosarCfg/development/capture-decisions/claude-autosarcfg-v1-46-0-minor-t{1+t2,3,4,5}-*.md`
- **Round-5.1 actual-state verify** (root discovery): `01-Projects/claude-AutosarCfg/development/capture-decisions/claude-autosarcfg-round-5-1-actual-state-verify-2026-07-11.md`
- **v1.45.2 ship notes** (predecessor): `docs/release-notes/v1.45.2/README.md`
- **Lesson #14 file**: `01-Projects/claude-AutosarCfg/development/lessons/marker-based-text-replacement-must-validate-block-contents-not-line-count.md`

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
