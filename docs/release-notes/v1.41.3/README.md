# v1.41.3 PATCH — Drive-By Prettier Pass

**Ship:** 2026-07-10
**Tag:** `v1.41.3` (pending — T1 fills)
**Baseline:** v1.41.2 PATCH `3f507d9` (3124 + 7 SKIP / 0 fail)
**Target:** 3124 + 7 SKIP / 0 fail (zero test delta — pure format PATCH)

## Goal

Close the prettier formatting drift accumulated by a background pkm-capture agent's verify pass after v1.41.2 ship. The agent invoked `prettier --write` during a verify run; 20 source files in 4 sub-trees touched by the v1.41.x file-size backlog PATCH received formatting changes that were never committed. v1.41.3 ships those format-only changes as a drive-by PATCH to return the working tree to a clean baseline before v1.42.1.

**0 logic change** — pure prettier formatting residue.

## What shipped

### T1: 20-file drive-by prettier pass

`git diff --stat 3f507d9..3d98c20` shows 20 files / 66 insertions / 51 deletions across 4 sub-trees:

```
 src/core/arxml/mutation/container-ops.ts     | 25 ++++++++++++++++++-------
 src/core/arxml/mutation/discovery.ts         |  5 +++--
 src/core/arxml/mutation/param-ref-ops.ts     | 17 ++++++++++++-----
 src/core/arxml/mutation/tree-ops.ts          |  7 +++++--
 src/core/arxml/parser/build.ts               |  9 +++++++--
 src/core/arxml/parser/parse.ts               | 12 +++---------
 src/core/arxml/parser/walk.ts                | 10 ++--------
 src/core/mutation/applyPatchSteps/engine.ts  |  3 ++-
 src/core/mutation/applyPatchSteps/helpers.ts |  7 +++++--
 src/shared/types/arxml.ts                    |  3 +--
 src/shared/types/bswmd-parse.ts              |  1 -
 src/shared/types/bswmd-pick.ts               |  1 -
 src/shared/types/dbc.ts                      |  1 -
 src/shared/types/diag-extract.ts            |  1 -
 src/shared/types/odx.ts                      |  1 -
 src/shared/types/project-manifest.ts         |  2 +-
 src/shared/types/project.ts                  |  1 -
 src/shared/types/save.ts                     |  2 +-
 src/shared/types/script.ts                   |  8 ++++++--
 src/shared/types/xlsx.ts                     |  1 -
 20 files changed, 66 insertions(+), 51 deletions(-)
```

Four diff categories:

1. **import-grouping** (12 files): side-effect imports + type imports sorted by prettier's import-order rule; alphabetized within group
2. **signature-wrap** (6 functions): `findInboundReferences`, `findElementByPath`, `containerPathToSubPath`, `omitKey`, `findParentContainerDef`, `hasChildWithShortName` — wrapped to multi-line per prettier print-width=100
3. **type-only-import splits** (2 sites): `CollisionCollector` extracted as `import type` in `parser/parse.ts` + `parser/walk.ts` (was value import); multiple `Arxml*` types expanded in `shared/types/script.ts` (was compressed)
4. **trailing-newline cleanup** (8 files): 8 `shared/types/*.ts` files had a single trailing blank line that prettier removes by default

## Key design decisions

- **D1 — Drive-by PATCH scope (drive-by-format only)** — v1.41.3 commits ONLY the 20 src/ files that prettier formatted. The 2 v1.42.0 spec/plan abort artefacts (`docs/superpowers/{specs,plans}/2026-07-10-v1-42-0-*.md`) are deliberately excluded — they are v1.42.0 cycle residue, not v1.41.3 housekeeping. They will be handled alongside v1.42.1 (per lesson `aborting-MINOR-with-zero-source-changes-prevents-misleading-version-bump`).
- **D2 — 0 test changes** — Pure format. Existing tests provide full coverage; the diff is mechanical and reversible per-file.
- **D3 — No lesson promoted** — Format-only changes do not surface new lessons. The pre-existing v1.41.x mechanical-split lessons + v1.42.0 abort lessons already cover the relevant patterns.

## 1 commit on origin/main

| Commit    | Description                                                              | Files changed |
| --------- | ------------------------------------------------------------------------ | ------------- |
| `3d98c20` | T1: 20-file drive-by prettier pass across v1.41.x split modules         | 20 files      |

1 atomic commit total for the v1.41.3 PATCH.

## Verification

`pnpm verify` 7-stage GREEN, EXIT=0:

| Stage              | Result                                            |
| ------------------ | ------------------------------------------------- |
| format             | ✅ All matched files use Prettier code style      |
| lint               | ✅ eslint . --max-warnings 0 clean                 |
| type-check         | ✅ tsc --noEmit clean                              |
| test               | ✅ 350/350 test files / 3124 + 7 SKIP / 0 fail    |
| coverage           | ✅ 350/350 test files / 3124 + 7 SKIP / 0 fail    |
| build              | ✅ vite × 3 (renderer / main / preload) + copy    |
| import-regression  | ✅ tests/regression/import-round-trip 2/2         |

**Pre-existing test pollution transient**: `tests/integration/__tests__/a-c-2b-cli-mutate-real.test.ts` (2 happy-path cases) showed a 2-failure transient on a single cold-cache verify run. Investigation:
- Same 2 tests pass in isolation (`pnpm exec vitest run <file>` → 5/5 PASS)
- Clean baseline (prettier diff stashed) full vitest → 3124 + 7 SKIP / 0 fail
- Warm-cache vitest run with diff applied → 3124 + 7 SKIP / 0 fail

The transient is **test ordering pollution** (cross-file state bleed in shared CLI fixture), not introduced by the prettier diff. The CI gate (`pnpm verify` 7-stage EXIT=0) is the binding signal; cold-cache ordering transients do not block the ship.

## Known follow-ups (out of scope)

- **v1.42.1 MINOR T0** (NEW dedicated cycle, deferred from aborted v1.42.0): App.tsx (1375) + AppHeader.tsx (894) per-flow JSX refactor — 2-3 weeks of dedicated work
- **bswmd/parse.ts** at 1196 LoC: accepted as known ceiling (ECUC builder chain shared-state coupling)
- **Shim removal sweep** (8 latent shim files, requires `moduleResolution: "node16"` migration)
- **Test mirroring** (6 monolithic test files, latent)
- **Pre-commit file-size hook** enforcement (deferred; candidate lesson `file-size-cap-must-be-enforced-in-pre-commit-hook`)
- **Cold-cache test ordering pollution** in `a-c-2b-cli-mutate-real.test.ts` (latent; investigate separately)

## Round-5 + Round-1 closure status (unchanged)

| Item                                              | Status                                       |
| ------------------------------------------------- | -------------------------------------------- |
| Round-5 H1 (useScriptStore.applyMutation)         | **CLOSED** (v1.41.0 T1)                      |
| Round-5 H1 caveat (6 latent siblings)             | **CLOSED** (v1.41.2 T1)                      |
| Round-5 M1 / M2 / M3 / M4 (i18n / dcm / script)    | **CLOSED** (v1.41.0 T1-T4)                   |
| Round-5 L1 (console.error inventory)              | **CLOSED** (auto-closed, no code change)     |
| Round-5 L2 (file-size backlog)                    | **CLOSED** (v1.41.x PATCH, 5/8 files)        |
| Round-5 L3 (file-size follow-up)                  | **CLOSED** (L1 equivalent, auto-closed)      |
| Round-5 N1 (CLI dispatcher exhaustive)            | **CLOSED** (v1.41.2 verify-only)             |
| Round-1 L8 (file-size cap)                       | **PARTIAL** (5/8 closed; 3 deferred)         |
| Round-1 M1-M4 / H1-H5                            | **CLOSED** (v1.36.0 - v1.40.0)               |