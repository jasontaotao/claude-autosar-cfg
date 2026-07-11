# v1.46.0 MINOR — `bswmd/parse.ts` Round-2 File-Split Design

**Status:** draft (T0 spec for v1.46.0 MINOR plan-mode)
**Date:** 2026-07-11
**Author:** 136th dispatch (post-compact)
**Roadmap ref:** Round-1 L8 backlog closure; pre-PLAN reality check via Round-5.1 actual-state verify (134th dispatch)
**Discovery source:** Round-5.1 capture-decisions confirmed `bswmd/parse.ts` 1196 LoC is the only file strictly over 800-LoC cap in production src-tree

## Why this exists

After Round-5.1 actual-state verify (134th dispatch, 2026-07-11) closed the Round-5 actionable findings (already shipped in v1.41.0 MINOR), the only **outstanding** Round-1 L8 backlog item is `src/core/project/bswmd/parse.ts` at 1196 LoC. v1.41.x PATCH T1 had already reduced the original `bswmd.ts` (1531) by extracting `lookup.ts` + `validate.ts` + `types.ts` + a `parse.ts` (now 1196). Round-2 split handles the remaining parse.ts surface.

This is **self-contained internal refactor**: zero public-API change. ~30 import sites (8 test files + production consumers) continue importing from `bswmd.js` / `bswmd/index.js` with **no edit needed**.

## Goal

`src/core/project/bswmd/parse.ts` 1196 LoC → split into **5 files**, all under 800-LoC cap. Closes Round-1 L8 backlog completely (assuming `App.tsx` 840 LoC remains unchanged in scope; the remaining 40-LoC reduction is deferred per Round-5 L1 partial closure note).

## Architecture

```
src/core/project/bswmd/
├── index.ts (existing — barrel re-export; +1 NEW line per T1-T4 commit)
├── types.ts (existing — type-only, untouched)
├── lookup.ts (existing — untouched)
├── validate.ts (existing re-export shim; will gain `validateModuleDefaults` real impl + drop circular dep)
├── parse.ts (existing — 1196 LoC, RESIDUAL ~150-200 LoC after T5)
├── parse-primitives.ts (NEW — line 226-302 ~77 LoC)
├── parse-tree-walker.ts (NEW — line 303-499 ~196 LoC)
├── parse-eb-dialect.ts (NEW — line 501-630 ~129 LoC)
└── parse-ecuc-dialect.ts (NEW — line 632-1196 ~564 LoC)
```

Residual `parse.ts` content after T5:

- Top-of-file comment block (lines 1-30, ~30 LoC)
- imports (line 32-47, ~16 LoC)
- NS_PATTERN, SUPPORTED_VERSIONS constants (lines 49-66, ~18 LoC)
- `parseBswmd` entry function (lines 68-200, ~133 LoC)
- `detectVersion`, `detectVersionLiteral`, `asArray` (lines 206-224, ~19 LoC)
- `MAX_CONTAINER_DEPTH` export (line 816, ~2 LoC if not moved)

Estimate: **~218 LoC** residual (under 800 cap with comfortable margin).

## File-decomposition contract

| File                        | Imports from                                                                                                                 | Exports                                                                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `parse.ts` (residual)       | `parse-primitives.js`, `parse-eb-dialect.js`, `parse-ecuc-dialect.js`, `parse-tree-walker.js`, `./types.js`, `./validate.js` | `parseBswmd`, `detectVersion`, `detectVersionLiteral`, `asArray`, `MAX_CONTAINER_DEPTH`                                                                                                    |
| `parse-primitives.ts` NEW   | `./types.js` only                                                                                                            | `readShortName`, `readNumber`, `readBoolean`, `readUpperMultiplicity`, `readLowerMultiplicity`, `readMultiplicityConfigClasses`                                                            |
| `parse-tree-walker.ts` NEW  | `./types.js`, `./lookup.js`, `./parse-eb-dialect.js` (for `buildEbModule`)                                                   | `findContainerInTree`, `walkPackagesForModules`, `walkPackagesForModuleRefs`, `walkElementsForModules`                                                                                     |
| `parse-eb-dialect.ts` NEW   | `./types.js`, `./parse-primitives.js`                                                                                        | `buildEbModule`, `readElementText`, `readDesc`, `readDestAttr`, `lastPathSegment`, `buildProvidedEntries`                                                                                  |
| `parse-ecuc-dialect.ts` NEW | `./types.js`, `./parse-primitives.js`, `./parse-tree-walker.js` (for `findContainerInTree` if used)                          | `buildEcucModule`, `buildContainerList`, `buildContainer`, `buildChoiceContainer`, `buildParamList`, `paramKindFromTag`, `buildParam`, `buildRef`, `buildRefList`, `walkContainerDefaults` |
| `validate.ts` (modified)    | `./parse-primitives.js` if used                                                                                              | **NEW**: `validateModuleDefaults` real impl (moved from parse.ts); **keeps re-exports**: `asArray`, `detectVersion`, `detectVersionLiteral`                                                |
| `index.ts` (modified)       | unchanged                                                                                                                    | unchanged (`export *` covers it)                                                                                                                                                           |

## Cycle-break strategy (CRITICAL — T0 step 1)

Currently `validate.ts` (line 22) re-exports `asArray, detectVersion, detectVersionLiteral, validateModuleDefaults` from `./parse.js`. **And `parse.ts` imports `validateModuleDefaults` from `./validate.js`**. This is a circular re-export.

**v1.46.0 split strategy — resolve cycle in T0 prep**:

1. **T0 step 1** (before any code move): confirm `validateModuleDefaults` real impl is in `parse.ts` lines 1131-1196 region. Decision: move real impl into `validate.ts` (its semantic name fits validate scope). Cost: `parse.ts` becomes dependent on `validate.ts` for the impl (currently the opposite).
2. **T2 prerequisite**: when moving `validateModuleDefaults` to `validate.ts`, also ensure `validate.ts` does NOT import from `./parse.js` (cycle break).
3. **Re-export chain**: `validate.ts` keeps `export { asArray, detectVersion, detectVersionLiteral } from './parse.js'` (parse still owns these); `parse.ts:parseBswmd` imports `validateModuleDefaults` directly from `./validate.js`.

This is the **one** cycle break — must be done in T0 spec's prep step **before** any T1-T5 commits so cycle-breaking is atomic.

## Cross-boundary call map (T0 step 3)

| Caller                                                       | Callee                                                                          | Same-file currently | After split                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------- | -------------------------------------------- |
| `parse.ts:parseBswmd`                                        | `walkPackagesForModules`, `walkPackagesForModuleRefs`, `validateModuleDefaults` | yes                 | across file (parse → tree-walker + validate) |
| `parse-tree-walker.ts:walkElementsForModules`                | `buildEbModule`                                                                 | yes                 | across file (tree-walker → eb-dialect)       |
| `parse-tree-walker.ts:walkElementsForModules` (continuation) | `buildEcucModule`                                                               | yes                 | across file (tree-walker → ecuc-dialect)     |
| `parse-ecuc-dialect.ts:buildContainerList`                   | `readUpperMultiplicity` etc.                                                    | yes (parse.ts)      | across file (ecuc-dialect → primitives)      |
| `parse-ecuc-dialect.ts:buildContainer`                       | `walkContainerDefaults`                                                         | yes                 | same file (both in ecuc-dialect)             |
| `parse-ecuc-dialect.ts:buildRef`                             | `readShortName`                                                                 | yes (parse.ts)      | across file (ecuc-dialect → primitives)      |
| `parse-eb-dialect.ts:buildProvidedEntries`                   | `readElementText`, `readDesc`, `readDestAttr`, `lastPathSegment`                | yes                 | same file                                    |
| `parse-eb-dialect.ts:buildEbModule`                          | `readShortName`                                                                 | yes (parse.ts)      | across file (eb-dialect → primitives)        |

**No cycle is created** because the dependency graph is a strict **DAG**:

- `parse.ts` → everything (top entry)
- `parse-tree-walker.ts` → `parse-eb-dialect.ts`, `parse-ecuc-dialect.ts`, `parse-primitives.ts`, `./lookup.js`
- `parse-ecuc-dialect.ts` → `parse-primitives.ts`, `parse-tree-walker.ts` (for `findContainerInTree` if used)
- `parse-eb-dialect.ts` → `parse-primitives.ts`
- `parse-primitives.ts` → none (depends on `./types.js` only)

**Verification step at T0 step 4**: produce the DAG as a textual listing and walk it to confirm acyclic.

## Out-of-scope (explicit deferrals)

| Item                                                                          | Why out                                                              |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `console.*` allowlist inventory (Round-5 L2)                                  | Process-rule-set; needs separate planning signal                     |
| `App.tsx` 840 LoC further 40 LoC reduction                                    | Micro-debt; not Round-1 L8 backlog                                   |
| Round-6 fresh code review                                                     | Independent planning-signal dispatch                                 |
| Public-API rename                                                             | Zero public-API change is the goal                                   |
| `walkContainerDefaults` rename (currently "validate"-named but in parse file) | Minimize diff; document but defer rename                             |
| Circular-cycle source migration beyond `validateModuleDefaults`               | If other cycle paths exist, leave them; only the one confirmed above |

## Risk analysis (T0 step 5)

| Risk                                                           | Severity                        | Mitigation                                                                                                                                 |
| -------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cycle break fails (T0 step 1)**                              | HIGH                            | Single atomic commit + `pnpm verify` 8-stage pre-test                                                                                      |
| **`walkContainerDefaults` location confusion**                 | MEDIUM                          | T0 step 3 explicit DAG; keep alongside `buildContainer` (both ecuc-dialect)                                                                |
| **8 test files break**                                         | HIGH                            | T0 step 2 verify existing public surface stable; no test edits in T1-T5                                                                    |
| **30+ downstream imports break**                               | HIGH                            | same as above — `bswmd.js` shim + `bswmd/index.js` both keep working                                                                       |
| **Lesson #14 chunk-replacement script swallows function body** | MEDIUM (historical v1.42.2/3/4) | Each T commit uses targeted Edit, NOT Python must_replace. `python scripts/test_python.py` pre-flight at every T                           |
| **`tsc --noEmit` strict mode catches new unused imports**      | LOW                             | After each T, `pnpm verify` 8-stage catches immediately                                                                                    |
| **T5 (parse.ts缩) is largest diff**                            | MEDIUM                          | Cherry-pick T5 into T5a (delete functions + update imports) + T5b (update parseBswmd body to call new modules). Each sub-step runs verify. |

## Critical-honesty notes

1. **`walkContainerDefaults` is misnamed** — it semantically belongs in `validate.ts` (calls from `buildContainer`'s inner loop). Renaming + migration is deferred — but documenting here so a future cycle can pick it up.
2. **Round-2 split vs Round-1 result** — v1.41.x PATCH T1 likely put `walkContainerDefaults` in parse.ts because of the close coupling with `buildContainer`. Round-2 needs to keep that coupling by colocating them in `parse-ecuc-dialect.ts`.
3. **No IPC surface change** — per lesson `pure-refactor-minor-is-the-right-shape-for-deferred-cleanups-when-ipc-stable`, this is a clean MINOR candidate.
4. **Scope size estimate** — 5 commits (T2-T5 + T5b) + 1 ship commit + 1 T0 spec commit + 5 per-T code-reviewer dispatches (may be batched). Total 7 source commits + 4-5 tool dispatches.

## Test strategy

- **Per T**: `pnpm verify` 8-stage GREEN. Python self-test 8/8 still passes (no test changes to validate_hook_range).
- **Per T**: spawn code-reviewer agent (per CLAUDE.md `改完代码自动审`).
- **After all T**: confirm 8 test files in `src/core/project/__tests__/` + `src/main/ipc/__tests__/` still pass (already covered by `pnpm test` stage).
- **After all T**: `pnpm tsc --noEmit -p tsconfig.json && pnpm tsc --noEmit -p tsconfig.web.json` clean (covered by `pnpm type-check` stage).

## Next step

Proceed to plan-mode (superpowers:writing-plans skill) for the implementation plan once this design is approved.
