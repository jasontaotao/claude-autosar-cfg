# v1.41.x PATCH — File-Size Backlog Mechanical Split

**Author**: claude-AutosarCfg post-ship review controller
**Date**: 2026-07-09
**Status**: design (awaiting spec self-review + user approval)
**Baseline**: v1.41.0 MINOR `a4acd4d` (3124 + 7 SKIP / 0 fail)
**Target:** 3124 + 7 SKIP / 0 fail (zero test delta — mechanical split only)

## Goal

Mechanically split 8 source files > 800 LoC into ≤ 600 LoC sub-files. **Zero behavior change, zero test change, zero public API change.** Pure file-size hygiene to retire the Round-1 L8 + Round-5 L1 backlog. After this PATCH, every source file should be ≤ 600 LoC (200 LoC headroom under the 800-LoC cap).

## Background — what's actually wrong

The codebase has 8 source files that have grown past the 800-LoC cap. The cap exists because files > 800 LoC consistently produce review-evading bugs (Round-1 L8 + Round-5 L1 lessons both cite the same symptom):

| File                                    | Current LoC | Where split naturally                                                                                              |
| --------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/core/project/bswmd.ts`             | 1531        | types block (39-278) + parse fn (299-914) + lookup fns (477-559) + readers (571-914)                               |
| `src/core/arxml/mutation.ts`            | 1407        | add/remove container (114-468) + add/remove/apply param+ref (532-905) + list+find (949-1030) + helpers (1030-1276) |
| `src/renderer/App.tsx`                  | 1375        | need to read body — likely extractable sub-hooks/components                                                        |
| `src/shared/types.ts`                   | 1240        | pure type decls, splittable by domain (arxml/dbc/odx/xlsx/ecuc/app/save)                                           |
| `src/core/validation/validate.ts`       | 1019        | validate core (40-174) + check\* fns (174-910) + variant coverage (961-end)                                        |
| `src/core/mutation/applyPatchSteps.ts`  | 923         | types (76-118) + applyPatchSteps/applyOneStep (150-344) + apply\*Step impls (344-714) + helpers (756-868)          |
| `src/renderer/components/AppHeader.tsx` | 894         | need to read body — single component, likely heavy on inline JSX                                                   |
| `src/core/arxml/parser.ts`              | 819         | parseArxml (60-193) + walkPackages/buildModule (282-521) + extractParams/parseParamValue (542-end)                 |

**The cap exists because:** each Round-N code review (Round-1 → Round-5) flagged a different file as a source of bugs. The pattern is consistent — large files are review-evading. The lesson `file-size-backlog-recurs-every-patch-cycle-without-deliberate-patch` (Round-5) explicitly mandates a separate PATCH for this.

## Architecture — split strategy

4 T (paired by layer cohesion) + 1 T (release/ship). Each T = 1 atomic commit. Each T's 2 files share an import-graph neighborhood, so the import-barrel change stays local.

### T1 — `core/project/bswmd.ts` (1531) + `core/validation/validate.ts` (1019)

Both files are in the validation/BSWMD resolution path; they share `BswmdDocument`, `ContainerDef`, `ParamDef` types heavily.

- **`src/core/project/bswmd.ts` → `src/core/project/bswmd/` directory (4 files):**
  - `bswmd/index.ts` — barrel re-export all public surface (preserves external `import { ... } from './bswmd'` paths)
  - `bswmd/types.ts` — interfaces (ModuleRefEntry, BswmdDocument, BswModuleDef, MultiplicityConfigClass, ContainerDef, ParamKind, ParamDef, ReferenceDef, ChoiceDef, ProvidedEntry, BswmdError, ContainerChildren) ≈ 280 LoC
  - `bswmd/parse.ts` — parseBswmd + buildEbModule + walkPackagesForModules + walkPackagesForModuleRefs + walkElementsForModules + read\* helpers (299-470 + 866-914) ≈ 500 LoC
  - `bswmd/lookup.ts` — findModuleByPath + lookupContainerDef + lookupParamDef + lookupReferenceDef + getContainerDefByPath + listContainerChildren + findContainerInTreeByPath (477-565) ≈ 120 LoC
  - `bswmd/validate.ts` — validateModuleDefaults + walkContainerDefaults + version detection helpers (448-475 + 571-585) ≈ 60 LoC
- **`src/core/validation/validate.ts` → `src/core/validation/` directory (4 files):**
  - `validate/index.ts` — barrel re-export (preserves `import { validate } from '../core/validation'`)
  - `validate/walk.ts` — walkElements + walkContainer + walkReference + emitSchemaUnknownIfInKnownModule (40-191) ≈ 180 LoC
  - `validate/checks.ts` — checkParam + checkContainerMultiplicity + typeMatches + checkCrossRefs + checkRefDests + checkRefCycles + isUnsetPlaceholder + canonicalCycleKey + emitRefCycleError (192-959) ≈ 700 LoC
  - `validate/coverage.ts` — VariantCoverageWarning + VariantCoverageValue + validateVariantCoverage + buildShortNameIndex + tryResolveByShortName + tryResolveByShortNameWithIndex (380-484 + 961-end) ≈ 350 LoC
  - `validate/project.ts` — validateProject + buildPathIndex + walkPathIndex + extractReferences + walkRefs (484-649) ≈ 180 LoC

### T2 — `core/arxml/mutation.ts` (1407) + `core/mutation/applyPatchSteps.ts` (923)

Both files are the ARXML mutation surface. Split is straightforward because mutation.ts has clear functional sections.

- **`src/core/arxml/mutation.ts` → `src/core/arxml/mutation/` directory (5 files):**
  - `mutation/index.ts` — barrel
  - `mutation/types.ts` — MutationError + AllowedSubElement + ReferenceHit ≈ 80 LoC
  - `mutation/container-ops.ts` — addContainer + removeContainer + removeModuleFromDoc + removeWithCascade + removeReferenceParam + removeElementAtPath + checkMultiplicityFloor + findInboundReferences + collectPackageElements + findElementByPath (114-528) ≈ 400 LoC
  - `mutation/param-ref-ops.ts` — addParameter + addReference + removeParameter + applyParamUpdate + makeReferenceParamValue + containerPathToSubPath + paramValueEquals + withDefinitionRefPreserved + omitKey (532-945) ≈ 400 LoC
  - `mutation/discovery.ts` — listAllowedSubElements + buildContainerAllowed + findReferencesTo + scanDocForRefs + scanPackage + scanElement + endsWithPath (949-1129) ≈ 200 LoC
  - `mutation/tree-ops.ts` — locateParent + shortNameOf + hasChildWithShortName + countChildrenWithShortName + insertChild + appendChild + replaceElement + replaceInTopLevelPackage + replaceAnywhere + mapPackagesDeep + replaceInElements (1132-1276) ≈ 200 LoC
- **`src/core/mutation/applyPatchSteps.ts` → `src/core/mutation/` directory (3 files):**
  - `applyPatchSteps/index.ts` — barrel (preserves `import { applyPatchSteps } from '../core/mutation/applyPatchSteps'`)
  - `applyPatchSteps/types.ts` — re-exports PatchStep + ApplyContext + StepError + StepWarning + ApplyResult (76-145) ≈ 80 LoC
  - `applyPatchSteps/engine.ts` — applyPatchSteps + remapStepForPendingAddChildSuffix + findPendingSuffixRemap + detectAutoSuffixRemap + applyOneStep + applySetParam + applyAddChild + applyRemoveWithCascade + applyJsonPatchStep + applyVariantDowngrade (150-754) ≈ 600 LoC
  - `applyPatchSteps/helpers.ts` — coerceToParamValue + describeValueType + findChildDefForAdd + findParentContainerDef (756-868) ≈ 130 LoC

### T3 — `renderer/App.tsx` (1375) + `renderer/components/AppHeader.tsx` (894)

Both renderer files. App.tsx is a single 1375-line component; AppHeader.tsx is a single 894-line component. Need to read both bodies in T3.1 to identify extractable sub-components / hooks.

- **`src/renderer/App.tsx`:** split into App.tsx (orchestrator shell) + 3-4 new files in `src/renderer/app/`:
  - `app/useAppHandlers.ts` — top-level state-management hooks extracted
  - `app/ViewRouter.tsx` — view-switching logic
  - `app/StatusFooter.tsx` — bottom status bar
  - `app/XxxPanel.tsx` (TBD based on T3.1 reading)
- **`src/renderer/components/AppHeader.tsx`:** split into AppHeader.tsx (orchestrator) + sub-components:
  - `components/AppHeader/BrandMark.tsx`
  - `components/AppHeader/MenuBar.tsx`
  - `components/AppHeader/StatusBadge.tsx`
  - (TBD based on T3.1 reading)

T3.1 (preflight) must read both files in full and document the concrete sub-component boundaries. The brief above is the **shape**; the implementer fills in the exact components.

### T4 — `shared/types.ts` (1240) + `core/arxml/parser.ts` (819)

`types.ts` is pure type decls, splittable by domain. `parser.ts` has 3 natural sections.

- **`src/shared/types.ts` → `src/shared/types/` directory (7 files):**
  - `types/index.ts` — barrel
  - `types/app.ts` — AppInfo + PingResponse + Result re-export (14-40) ≈ 35 LoC
  - `types/arxml.ts` — SaveArxmlErrorKind + SaveArxmlError + FileError + OpenArxmlResult + OpenArxmlMultiResult + SaveArxmlResult + ParseArxmlRequest + ParseArxmlResponse + SaveArxmlRequest (43-152 + 618-end) ≈ 200 LoC
  - `types/dbc.ts` — DbcMessageSummary + DbcSignalSummary + DbcSummary + OpenDbcResult + ParseDbcRequest + ParseDbcResponse + DbcImportComStackRequest + DbcImportComStackResponse (153-500) ≈ 350 LoC
  - `types/odx.ts` — OdxDtcSummary + OdxDidData + OdxDidSummary + OdxRoutineSummary + OdxSummary + OpenOdxResult + OpenOdxWithDefaultRequest + OpenOdxWithDefaultResult + BswmdPickResult + ParseOdxRequest + ParseOdxResponse + OdxImportDiagExtractRequest + OdxImportDiagExtractResponse (251-552) ≈ 300 LoC
  - `types/xlsx.ts` — EcucInstanceRow + XlsxParseBatchRequest + XlsxParseBatchResponse + XlsxWriteBatchTemplateRequest + XlsxWriteBatchTemplateResponse + XlsxCommitBatchRequest + XlsxCommitBatchResponse (553-617) ≈ 70 LoC
- **`src/core/arxml/parser.ts` → `src/core/arxml/parser/` directory (3 files):**
  - `parser/index.ts` — barrel (preserves `import { parseArxml } from '../core/arxml/parser'`)
  - `parser/parse.ts` — ParseOptions + ParseError + NS_PATTERN + XSD_PATTERN + parseArxml + detectVersion (40-225) ≈ 200 LoC
  - `parser/walk.ts` — asArray + readShortName + readLongName + MAX_ARPKG_DEPTH + walkPackages + walkPackagesAtDepth + findAnyModuleInPackages + findAnyDefInPackages + walkElements + classifyElement (227-419) ≈ 200 LoC
  - `parser/build.ts` — buildModule + buildContainer + buildReference + extractParamsAndRefs + extractReferenceParams + parseParamValue (418-819) ≈ 420 LoC

## Components & Files Touched

| Layer           | Path                                                    | Change                   |
| --------------- | ------------------------------------------------------- | ------------------------ |
| core/project    | `src/core/project/bswmd/` (NEW dir, 5 files)            | split bswmd.ts           |
| core/project    | `src/core/project/bswmd.ts` (DELETE)                    | moved to dir             |
| core/validation | `src/core/validation/validate/` (NEW dir, 5 files)      | split validate.ts        |
| core/validation | `src/core/validation/validate.ts` (DELETE)              | moved to dir             |
| core/arxml      | `src/core/arxml/mutation/` (NEW dir, 6 files)           | split mutation.ts        |
| core/arxml      | `src/core/arxml/mutation.ts` (DELETE)                   | moved to dir             |
| core/mutation   | `src/core/mutation/applyPatchSteps/` (NEW dir, 4 files) | split applyPatchSteps.ts |
| core/mutation   | `src/core/mutation/applyPatchSteps.ts` (DELETE)         | moved to dir             |
| renderer        | `src/renderer/app/` (NEW dir, 3-4 files)                | split App.tsx            |
| renderer        | `src/renderer/App.tsx` (REWRITE)                        | shell only               |
| renderer        | `src/renderer/components/AppHeader/` (NEW dir, 3 files) | split AppHeader.tsx      |
| renderer        | `src/renderer/components/AppHeader.tsx` (REWRITE)       | shell only               |
| shared          | `src/shared/types/` (NEW dir, 6 files)                  | split types.ts           |
| shared          | `src/shared/types.ts` (DELETE)                          | moved to dir             |
| core/arxml      | `src/core/arxml/parser/` (NEW dir, 4 files)             | split parser.ts          |
| core/arxml      | `src/core/arxml/parser.ts` (DELETE)                     | moved to dir             |
| docs            | `docs/release-notes/v1.41.1/README.md` (NEW)            | release notes            |
| docs            | `CHANGELOG.md`                                          | v1.41.1 row              |

## Key Design Decisions

| #   | Decision                                                                                                                 | Rationale                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Barrel re-exports preserve all external import paths**                                                                 | Zero downstream change. `import { validate } from '../core/validation/validate'` keeps working. tsconfig path-mapping would force every import site to change.                                 |
| D2  | **T1/T2/T3/T4 each ship as 1 atomic commit per file pair**                                                               | Matches v1.40.0 / v1.41.0 ship pattern. One commit per T keeps reviewer scope local.                                                                                                           |
| D3  | **Pure mechanical split, zero behavior change, zero test change**                                                        | The whole point of the PATCH is to retire the backlog. Any "while I'm here" improvement is scope creep. Defects found during split are written down but NOT fixed (defer to a separate PATCH). |
| D4  | **T3 sub-component boundaries determined by T3.1 reading**                                                               | App.tsx + AppHeader.tsx are renderer files where the natural cut is JSX-driven, not function-section-driven. T3.1 must read full body before dispatch.                                         |
| D5  | **types/ sub-directory is OK**                                                                                           | pure type files are zero-runtime-cost; tree-shaking handles them.                                                                                                                              |
| D6  | **No new exports from any sub-file beyond what the barrel re-exports**                                                   | The sub-files are internal implementation; consumers go through the barrel. Avoids accidental widening of API surface.                                                                         |
| D7  | **Imports within split groups use relative paths**                                                                       | No tsconfig path-mapping changes. No new aliases. Within `bswmd/`, files reference each other via `./types`, `./parse`, etc.                                                                   |
| D8  | **T3 implementer reads App.tsx and AppHeader.tsx fully in T3.1, then writes the sub-component spec inline in the brief** | The renderer shape is unknowable without reading.                                                                                                                                              |

## Testing Strategy

| Test surface                  | Coverage                                                                 | Δ tests |
| ----------------------------- | ------------------------------------------------------------------------ | ------- |
| Full vitest run (3124 → 3124) | All existing tests pass with zero modification                           | **+0**  |
| pnpm verify 7-stage per T     | format + lint + type-check + test + coverage + build + import-regression | n/a     |

**No new tests** — the split must not change behavior. If a test fails after a split, the split is wrong (or the test was a regression net, and the regression is real — that case is a deferred PATCH, not a here-and-now fix).

## Risks & Mitigations

| Risk                                                | Mitigation                                                                                                                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Split breaks circular imports                       | Each split file owns its imports; use `import type` for type-only cross-references within the split group.                                                                 |
| Split breaks `import { X }` in downstream consumers | D1: barrel re-exports preserve all paths.                                                                                                                                  |
| Sub-directory conflicts with existing import paths  | Verify no existing `src/core/project/bswmd/` directory; only `bswmd.ts` exists. Same for all 8 targets.                                                                    |
| T3 (renderer) split is too aggressive               | T3.1 reads full body, identifies clean JSX sub-component boundaries. If the file is one monolithic component, fall back to extracting render-helpers + a useAppShell hook. |
| tsconfig path mapping change needed                 | D7 forbids it. Pure relative imports.                                                                                                                                      |
| Snapshot tests pick up file moves                   | If a snapshot references a file path (e.g. generated artifact path), update the snapshot string. But this codebase's tests don't snapshot file paths (per Round-1 review). |
| Lint complains about new files having no test       | New barrel + new internal files don't need tests; they're re-exports + pure refactors. `pnpm lint` only flags test-coverage thresholds, not absence.                       |
| File-size cap re-violation in 6 months              | Out of scope. New 1-of-1 lesson `file-size-cap-must-be-enforced-in-pre-commit-hook` is a candidate for lessons-sweep (queued).                                             |

## Tasks (4 split + 1 ship)

```
T1: split bswmd.ts + validate.ts
T2: split mutation.ts + applyPatchSteps.ts
T3: split App.tsx + AppHeader.tsx (T3.1 reads bodies first)
T4: split types.ts + parser.ts
T5: docs release artifacts + ship v1.41.1 PATCH
```

5 tasks total, Subagent-Driven execution.

## Global Constraints

(Inherit from v1.40.x + v1.39.x + v1.38.x + v1.37.x series.)

- All modified/new files end with trailing newline.
- No `console.log` in production code; `console.warn` / `console.error` allowed for defensive warnings (with `eslint-disable-next-line no-console` per project convention).
- 中文 for user-facing/business comments; 英文 for technical API/protocol/comments per CLAUDE.md.
- Subagent-driven execution; one implementer per task.
- Each task ends with its own test running and passing.
- **Behavior must be IDENTICAL post-split.** No "while I'm here" fixes.
- **Zero new tests** (mechanical split only; if a test is needed, the split revealed a regression, file an issue and defer).
- **Barrel re-exports preserve all external import paths.**
- Exact values (file paths, function names, type names) MUST match this spec verbatim. Sub-component names within T3 are TBD pending T3.1 reading.
- Implementer MUST dispatch `pkm-capture` autonomously when work is capture-worthy (per v1.38.0 lesson).
- Implementer MUST NOT make destructive git operations (`reset --hard`, `push --force`) on `origin/main`.
- **`pnpm verify` 7-stage MUST pass after every T** (per v1.40.0 T3 lesson `pre-flight-lint-must-be-7-stage-at-every-t-level`).
- Implementer MUST NOT increase any file's LoC by more than +5% (refactors only, not additions).

## Out of Scope (deferred to future PATCHes)

- L2 (console.error inventory) — Round-5 L2, no action needed
- N1 (CLI dispatcher exhaustive) — Round-5 N1, confirmed clean
- File-size cap enforcement in pre-commit hook — candidate for lessons-sweep PATCH
- 2 lessons queued for lessons-sweep (vi-waitfor-over-fake-timers, null-fallback-spread)
- The 6 latent stale-state siblings in `useScriptStore.ts` (T1 caveat from v1.41.0)

## Reverse-Closes

Closes Round-1 L8 + Round-5 L1 file-size backlog (8 of 8 files). After this PATCH, the project has 0 source files > 800 LoC.

## Lessons (NEW from this PATCH, candidates)

1. `file-size-cap-must-be-enforced-in-pre-commit-hook` (proactive) — every PATCH this year flagged a new file > 800 LoC; the only durable fix is a hook. Capture as a queued lesson for the next PATCH.
2. `mechanical-split-barrel-pattern-preserves-import-graphs-without-touching-consumers` (process) — re-exports + sub-directories = zero downstream churn. Capture as a process pattern.

## Cross-references

- Round-5 review topic: `01-Projects/claude-AutosarCfg/development/code-review-round-5-i18n-locale-process-hygiene-2026-07-09.md`
- v1.41.0 spec (parent MINOR): `docs/superpowers/specs/2026-07-09-v1-41-0-minor-script-store-i18n-and-error-envelope-cleanup.md`
- v1.41.0 plan (parent MINOR): `docs/superpowers/plans/2026-07-09-v1-41-0-minor-script-store-i18n-and-error-envelope-cleanup.md`
- Round-1 L8 file-size backlog: `01-Projects/claude-AutosarCfg/development/code-review-round-1-deep-dive-2026-07-08.md`
