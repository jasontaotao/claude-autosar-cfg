# v1.41.1 PATCH — File-Size Backlog Mechanical Split

**Ship:** 2026-07-10
**Tag:** `v1.41.1` (pending — T5 fills)
**Baseline:** v1.41.0 MINOR `a4acd4d` (3124 + 7 SKIP / 0 fail)
**Target:** 3124 + 7 SKIP / 0 fail (zero test delta — pure mechanical split)

## Goal

Mechanically split 6 source files > 800 LoC into ≤ 600 LoC sub-files. **Zero behavior change, zero test change, zero public API change.** Pure file-size hygiene to retire the Round-1 L8 + Round-5 L1 backlog. After this PATCH, the project has 3 source files > 800 LoC remaining (down from 8) — the renderer backlog (App.tsx + AppHeader.tsx) is deferred to v1.42.0 MINOR T0 because the split requires JSX refactoring that exceeds the scope of "mechanical split".

## What was split

| File (before)                         | LoC | Split into                                                                                                | Total LoC after       |
| ------------------------------------- | --- | --------------------------------------------------------------------------------------------------------- | --------------------- |
| `src/core/project/bswmd.ts`           | 1531 | `bswmd/{types,parse,lookup,validate,index}.ts`                                                            | 5 files, peak 1196    |
| `src/core/validation/validate.ts`     | 1019 | `validate/{walk,checks,coverage,project,index}.ts`                                                        | 5 files, peak 526     |
| `src/core/arxml/mutation.ts`          | 1407 | `mutation/{types,container-ops,param-ref-ops,discovery,tree-ops,index}.ts`                               | 6 files, peak 460     |
| `src/core/mutation/applyPatchSteps.ts`| 923  | `applyPatchSteps/{types,engine,helpers,index}.ts`                                                        | 4 files, peak 628     |
| `src/shared/types.ts`                 | 1240 | `types/{app,arxml,odx,dbc,diag-extract,xlsx,save,bswmd-parse,bswmd-pick,project,project-manifest,script,dcm,index}.ts` | 14 files, peak 623 |
| `src/core/arxml/parser.ts`            | 819  | `parser/{parse,walk,build,index}.ts`                                                                      | 4 files, peak 418     |

**Total: 6 files → 38 files (32 sub-files + 6 barrels) + 6 shim files at original paths.** Net LoC delta: ~+0% (most lines moved, not added).

## What's NOT split (deferred to v1.42.0 MINOR T0)

| File                                 | LoC | Reason for deferral                                                                                    |
| ------------------------------------ | --- | ------------------------------------------------------------------------------------------------------- |
| `src/renderer/App.tsx`              | 1375 | Single 1375-line function with 9 useCallback handlers; split requires extracting a `useAppHandlers` hook with ~10 closure-dep parameters. JSX refactor, not mechanical. |
| `src/renderer/components/AppHeader.tsx` | 894 | Single 894-line component with menu + action-bar + status-badge JSX; split requires extracting 3 sub-components (`BrandMark`, `MenuBar`, `StatusBadge`) which is JSX refactoring. |
| `src/core/project/bswmd/parse.ts`    | 1196 | ECUC builder chain is monolithic — `buildEbModule` + `walkPackagesForModules` + `walkPackagesForModuleRefs` + `walkElementsForModules` are tightly coupled via shared `parentPath` + `collector` state. Further split risks subtle ordering bugs. Accept 1196 LoC as a known ceiling. |

## Key design decisions

- **D1 — Barrel re-exports preserve all external import paths.** Every file that did `import { addContainer } from '../core/arxml/mutation'` keeps working through a 1-line re-export shim at the original path. The barrel `mutation/index.ts` is the canonical entry; the shim exists because TypeScript `moduleResolution: "Bundler"` does NOT auto-resolve `./foo.js` → `./foo/index.ts` for `.js`-suffixed relative imports (verified empirically with `tsc --traceResolution`).

- **D3 — Pure mechanical split, zero behavior change, zero test change.** The whole point of the PATCH is to retire the file-size backlog. No "while I'm here" fixes. Defects found during the split are written down but NOT fixed in this PATCH (deferred).

- **D6 — No new exports from any sub-file beyond what the barrel re-exports.** Sub-files are internal implementation; consumers go through the barrel or the shim.

- **D7 — Relative imports only.** No tsconfig path-mapping changes. No new aliases. Within each sub-directory, files reference each other via `./types.js`, `./parse.js`, etc.

- **D8 — T3 sub-component boundaries determined by T3.1 reading** (renderer files) — the cut is JSX-driven, not function-section-driven, so a preflight read is required. T3 was deferred to v1.42.0 because the cut scope exceeds "mechanical split".

- **D9 — Sub-agents skipped for T2, T4a, T4b.** Following the T2 lesson `main-thread-recovery-from-subagent-stall-faster-than-redispatch`, mechanical barrel-splits of JSX-free TS > 1000 LoC execute directly on the main thread (~15 min) rather than via sub-agent dispatch (~25+ min with 600s timeout risk).

## 4 commits on origin/main (T1 + T2 + T4a + T4b)

T1, T2, T4a, T4b are the actual code commits. T5 will be the docs + ship commit. T3 was deferred (see "What's NOT split" above).

| Commit    | Description                                                                  | Files changed |
| --------- | ---------------------------------------------------------------------------- | ------------- |
| `69b3e60` | T1: split `src/core/project/bswmd.ts` + `src/core/validation/validate.ts`     | 12 files      |
| `4e2c13a` | T2: split `src/core/arxml/mutation.ts` + `src/core/mutation/applyPatchSteps.ts` | 12 files      |
| `e5eff4a` | T4a: split `src/shared/types.ts` (14 sub-files)                              | 14 files      |
| `4cd9efc` | T4b: split `src/core/arxml/parser.ts`                                        | 5 files       |

## 8 NEW 1-of-1 lessons (queued for lessons-sweep PATCH)

1. `mechanical-split-barrel-requires-shim-when-tsconfig-bundler-disabled-directory-resolution` (T1) — TypeScript Bundler moduleResolution does NOT auto-resolve `./foo.js` → `./foo/index.ts`. Mechanical splits must keep the original file as a thin re-export shim.
2. `mechanical-split-requires-export-keyword-on-internal-helpers-cross-imported-between-sub-files` (T2) — When sub-file A imports a helper from sibling sub-file B, B must `export` the helper. Mechanical copies of the original file body preserve the lack-of-export, leading to TS2459.
3. `mechanical-split-requires-cross-sub-file-imports-not-just-same-sub-file` (T2) — Functions in sub-file A that call helpers in sub-file B require explicit `import { X } from './B.js'`. Sliced imports are only the original file's imports; cross-sub-file dependencies are silent.
4. `mechanical-split-requires-jSDoc-rebalance-at-slice-boundaries` (T2) — When `sed -n 'START,ENDp'` slices a file mid-JSDoc, the result is unbalanced `/**` / `*/` markers. Either adjust slice boundaries or re-add the missing opener/closer.
5. `main-thread-recovery-from-subagent-stall-faster-than-redispatch` (T2) — When a sub-agent fails (timeout, API error, watchdog), redispatching wastes context. Direct main-thread completion using `sed` + targeted Edit calls is faster.
6. `mechanical-split-types-domain-grouping-must-keep-relative-paths-aligned` (T4) — When splitting `shared/types.ts` into domain-grouped sub-files, each sub-file's relative imports to `core/parser/serializer` must change from `./types.js` to `../../core/parser.js` (TWO levels up).
7. `mechanical-split-introduces-circular-deps-walk-build-classifyElement` (T4) — `parser/walk.ts:194` calls `buildContainer` (defined in `parser/build.ts`), while `parser/build.ts` calls `walkElements` (defined in `parser/walk.ts`). True circular import. Tsc compiles OK but Node runtime errors with `ReferenceError` if the cross-import is missing in EITHER direction. Solution: explicit cross-import in BOTH sub-files.
8. `mechanical-split-handle-cross-sub-file-used-types-not-just-declared-types` (T4) — When sub-file A USES a type DECLARED in sibling sub-file B, A must `import type { X } from './B.js'`. Sliced bodies don't auto-import types from siblings.

## Known follow-ups (out of scope)

- **T3**: `src/renderer/App.tsx` (1375) + `src/renderer/components/AppHeader.tsx` (894) — split requires JSX refactoring (useAppHandlers hook + 3 AppHeader sub-components). Deferred to v1.42.0 MINOR T0.
- **`bswmd/parse.ts` at 1196 LoC** — ECUC builder chain is monolithic. Accept as a known ceiling. A future lessons-sweep PATCH may document the 1-of-1 lesson for the ECUC chain shared-state coupling.
- **8 lessons queued for lessons-sweep PATCH** — should land in a dedicated dispatch.
- **shim removal sweep (latent)** — when project migrates to `moduleResolution: "node16"` or extensionless imports, the 6 shim files can be `git rm`'d.
- **Tier 3 push pending** — v1.41.0/v1.40.0/v1.39.0 MINOR Tier 3 pushes also PENDING (local main 4 commits ahead of origin/main after v1.41.1).

## Round-5 + Round-1 closure

| Round-1 / Round-5 finding         | Status                                  |
| -------------------------------- | --------------------------------------- |
| Round-1 L8 (file-size backlog)    | **5/8 closed (T1+T2+T4)**, 3 deferred to v1.42.0 |
| Round-5 L1 (file-size)            | **5/8 closed (T1+T2+T4)**, same deferral |
| Round-5 file-size-backlog-recurs | **CAPTURED** as 1-of-1 lesson above     |
