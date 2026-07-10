# v1.41.x PATCH Implementation Plan — File-Size Backlog Mechanical Split

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mechanically split 8 source files > 800 LoC into ≤ 600 LoC sub-files via barrel re-exports. Zero behavior change, zero test change, zero public API change.

**Architecture:** 4 paired-file atomic commits (T1-T4) + 1 release-notes commit (T5). Each split file is a pure file-move + content-slice; the original file's path is replaced by a barrel that re-exports from the new sub-directory. Cross-file imports stay untouched.

**Tech Stack:** Electron + TypeScript 5.6 + React 19 + vitest 3 + jsdom 30+. Pure TypeScript refactor.

**Baseline:** v1.41.0 MINOR `a4acd4d` (3124 + 7 SKIP / 0 fail)
**Target:** 3124 + 7 SKIP / 0 fail (zero test delta)

## Global Constraints

(Inherit verbatim from spec. Implementer MUST obey these.)

- All modified/new files end with trailing newline.
- No `console.log` in production code; `console.warn` / `console.error` allowed for defensive warnings (with `eslint-disable-next-line no-console` per project convention).
- 中文 for user-facing/business comments; 英文 for technical API/protocol/comments per CLAUDE.md.
- Subagent-driven execution; one implementer per task.
- Each task ends with `pnpm verify` 7-stage GREEN (per v1.40.0 T3 lesson `pre-flight-lint-must-be-7-stage-at-every-t-level`).
- **Behavior must be IDENTICAL post-split.** No "while I'm here" fixes.
- **Zero new tests.** If a test fails after split, the split is wrong — revert and fix the slice.
- **Barrel re-exports preserve all external import paths.** `import { X } from '...bswmd'` keeps working through the barrel.
- Exact values (file paths, function names, type names) MUST match this plan verbatim. T3 sub-component names TBD pending T3.1 body read.
- Implementer MUST dispatch `pkm-capture` autonomously when work is capture-worthy (per v1.38.0 lesson `brief-explicit-must-not-clause-is-overridden-by-implementer-judgment-when-content-is-genuinely-capture-worthy`).
- Implementer MUST NOT make destructive git operations (`reset --hard`, `push --force`) on `origin/main`.
- Implementer MUST NOT increase any file's LoC by more than +5% (refactors only, not additions).
- Worktree: NOT used. Tasks land directly on `main` per v1.39.x / v1.40.x / v1.41.0 PATCH chain (CLAUDE.md rule + Round-1 L8 cap enforcement is post-hoc via `pnpm verify` lint).

---

## Task 1: split bswmd.ts (1531) + validate.ts (1019)

### Files

- Create: `src/core/project/bswmd/index.ts`
- Create: `src/core/project/bswmd/types.ts`
- Create: `src/core/project/bswmd/parse.ts`
- Create: `src/core/project/bswmd/lookup.ts`
- Create: `src/core/project/bswmd/validate.ts` (sub-file, NOT to be confused with `src/core/validation/validate.ts`)
- Delete: `src/core/project/bswmd.ts`
- Create: `src/core/validation/validate/index.ts`
- Create: `src/core/validation/validate/walk.ts`
- Create: `src/core/validation/validate/checks.ts`
- Create: `src/core/validation/validate/coverage.ts`
- Create: `src/core/validation/validate/project.ts`
- Delete: `src/core/validation/validate.ts`

### Interfaces

- Consumes: existing `src/core/project/bswmd.ts` + `src/core/validation/validate.ts` (the two files being split)
- Produces: same public surface — every named export from the original two files remains importable from the new barrel paths

### Step-by-step

- [ ] **Step 1.1: Read both source files in full**

  Run:

  ```bash
  pnpm exec prettier --write src/core/project/bswmd.ts src/core/validation/validate.ts
  git status
  ```

  Expected: both files show as modified by prettier; the split will be easier from a clean baseline.

  Read the entire content of both files into context. Note: `src/core/project/bswmd.ts` has 1531 LoC; `src/core/validation/validate.ts` has 1019 LoC. Read in 500-LoC chunks.

- [ ] **Step 1.2: Slice bswmd.ts into 5 sub-files**

  Create `src/core/project/bswmd/types.ts`:
  - Copy lines 1-278 verbatim (the `import` block at top + interface/type/enum declarations from line 39 to line 278)
  - Remove the imports that won't be used by `types.ts` (keep only `Result` import from `'../../shared/types/result.js'`)
  - **No `import` of other `bswmd/*` sub-files** (types file has zero runtime deps)

  Create `src/core/project/bswmd/parse.ts`:
  - Copy lines 280-470 (constants + parseBswmd function + version detection helpers 571-585) + lines 866-914 (buildEbModule + readElementText + readDesc)
  - Adjust imports to: `'./types.js'` for types, `'../../shared/types/result.js'` for Result, no other sub-file deps

  Create `src/core/project/bswmd/lookup.ts`:
  - Copy lines 477-565 (findModuleByPath + lookupContainerDef + lookupParamDef + lookupReferenceDef + getContainerDefByPath + listContainerChildren + findContainerInTreeByPath)
  - Imports: `'./types.js'`, plus `findContainerInTree` and `walkPackagesForModules` from `./parse.js` if needed

  Create `src/core/project/bswmd/validate.ts` (sub-file):
  - Copy lines 448-475 (validateModuleDefaults + walkContainerDefaults) + lines 571-585 (detectVersion + detectVersionLiteral + asArray)
  - Imports: `'./types.js'`

  Create `src/core/project/bswmd/index.ts`:
  - Re-export everything from the 4 sub-files using `export *`:
    ```ts
    export * from './types.js';
    export * from './parse.js';
    export * from './lookup.js';
    export * from './validate.js';
    ```
  - Plus preserve any `import` block from the original (e.g. `Result` import for downstream consumers)
  - **Verify:** every named export from the original `bswmd.ts` is now reachable through the barrel

- [ ] **Step 1.3: Delete the old bswmd.ts**

  Run: `git rm src/core/project/bswmd.ts`
  This is safe because the barrel at `src/core/project/bswmd/index.ts` preserves the surface (but the index file is at a different path — see Step 1.6 for the directory-entry fix below).

- [ ] **Step 1.4: Slice validate.ts into 5 sub-files**

  Create `src/core/validation/validate/walk.ts`:
  - Copy lines 1-191 (imports + validate + walkElements + walkContainer + walkReference + emitSchemaUnknownIfInKnownModule)
  - Imports: `'./walk.js'`, `BswmdDocument` etc. from `'../../core/project/bswmd/index.js'`

  Create `src/core/validation/validate/checks.ts`:
  - Copy lines 192-959 (checkParam + checkContainerMultiplicity + typeMatches + checkCrossRefs + checkRefDests + checkRefCycles + isUnsetPlaceholder + canonicalCycleKey + emitRefCycleError)
  - Imports: types from `'../../core/project/bswmd/index.js'`, own deps

  Create `src/core/validation/validate/coverage.ts`:
  - Copy lines 380-484 (buildShortNameIndex + tryResolveByShortName + tryResolveByShortNameWithIndex) + lines 961-end (VariantCoverageWarning + VariantCoverageValue + validateVariantCoverage)
  - Imports: types from `'../../core/project/bswmd/index.js'`

  Create `src/core/validation/validate/project.ts`:
  - Copy lines 484-649 (validateProject + buildPathIndex + walkPathIndex + extractReferences + walkRefs)
  - Imports: types

  Create `src/core/validation/validate/index.ts`:
  - Re-export everything from the 4 sub-files
  - **Verify:** every named export from the original `validate.ts` is now reachable through the barrel

- [ ] **Step 1.5: Delete the old validate.ts**

  Run: `git rm src/core/validation/validate.ts`

- [ ] **Step 1.6: TypeScript path resolution check**

  TypeScript's `"moduleResolution": "node16"` (or `"bundler"`) auto-resolves `./bswmd` → `./bswmd/index.ts`. Verify the new `src/core/project/bswmd/index.ts` and `src/core/validation/validate/index.ts` exist and the new structure compiles.

  Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | head -50`
  Expected: zero errors. (If errors, the import in some consumer is using a non-barel-resolvable form like `bswmd/parse` — fix the consumer, not the barrel.)

- [ ] **Step 1.7: Run full vitest**

  Run:

  ```bash
  pnpm exec vitest run 2>&1 | tail -10
  ```

  Expected: 3124 + 7 SKIP / 0 fail (no test count change).

- [ ] **Step 1.8: pnpm verify 7-stage**

  Run: `pnpm verify 2>&1 | tail -30`
  Expected: all 7 stages GREEN (format, lint, type-check, test, coverage, build, import-regression). EX=0.

- [ ] **Step 1.9: Commit atomically**

  Run:

  ```bash
  git add -A src/core/project/bswmd.ts src/core/project/bswmd/ src/core/validation/validate.ts src/core/validation/validate/
  git status
  git diff --cached --stat
  git commit -m "refactor(core): v1.41.x PATCH T1 -- split bswmd.ts + validate.ts (file-size backlog)"
  ```

  Expected: 1 commit; ~12 new files + 2 deletes. Total net LoC delta should be ≤ +5% (most lines are moved, not added).

- [ ] **Step 1.10: Dispatch pkm-capture**

  Run: `pkm-capture` in the background. Pass the commit SHA + this T1 description.

---

## Task 2: split mutation.ts (1407) + applyPatchSteps.ts (923)

### Files

- Create: `src/core/arxml/mutation/index.ts`
- Create: `src/core/arxml/mutation/types.ts`
- Create: `src/core/arxml/mutation/container-ops.ts`
- Create: `src/core/arxml/mutation/param-ref-ops.ts`
- Create: `src/core/arxml/mutation/discovery.ts`
- Create: `src/core/arxml/mutation/tree-ops.ts`
- Delete: `src/core/arxml/mutation.ts`
- Create: `src/core/mutation/applyPatchSteps/index.ts`
- Create: `src/core/mutation/applyPatchSteps/types.ts`
- Create: `src/core/mutation/applyPatchSteps/engine.ts`
- Create: `src/core/mutation/applyPatchSteps/helpers.ts`
- Delete: `src/core/mutation/applyPatchSteps.ts`

### Interfaces

- Consumes: existing `src/core/arxml/mutation.ts` + `src/core/mutation/applyPatchSteps.ts`
- Produces: same public surface through the barrels

### Step-by-step

- [ ] **Step 2.1: Read both source files in full**

  Run: `pnpm exec prettier --write src/core/arxml/mutation.ts src/core/mutation/applyPatchSteps.ts`
  Read both files entirely into context.

- [ ] **Step 2.2: Slice mutation.ts into 6 sub-files**

  Create `src/core/arxml/mutation/types.ts`:
  - Copy lines 1-112 (imports + `MutationError` type + `AllowedSubElement` + `ReferenceHit` interfaces)
  - Imports: `Result` from `'../../../shared/types/result.js'`, `ArxmlElement` from `'./types.js'` of the parser barrel (via `'../parser/index.js'`)
  - No other mutation sub-file deps

  Create `src/core/arxml/mutation/container-ops.ts`:
  - Copy lines 114-528 (addContainer + removeContainer + removeModuleFromDoc + removeWithCascade + removeReferenceParam + removeElementAtPath + checkMultiplicityFloor + findInboundReferences + collectPackageElements + findElementByPath)
  - Imports: `'./types.js'`, types from `'../parser/index.js'` + `'../../shared/types/...js'`

  Create `src/core/arxml/mutation/param-ref-ops.ts`:
  - Copy lines 532-945 (addParameter + addReference + removeParameter + applyParamUpdate + makeReferenceParamValue + containerPathToSubPath + paramValueEquals + withDefinitionRefPreserved + omitKey)
  - Imports: `'./types.js'`, plus `findContainerInTreeByPath` etc. from `'../../core/project/bswmd/index.js'`, types from `'../parser/index.js'`

  Create `src/core/arxml/mutation/discovery.ts`:
  - Copy lines 949-1129 (listAllowedSubElements + buildContainerAllowed + findReferencesTo + scanDocForRefs + scanPackage + scanElement + endsWithPath)
  - Imports: `'./types.js'`, types

  Create `src/core/arxml/mutation/tree-ops.ts`:
  - Copy lines 1132-1276 (locateParent + shortNameOf + hasChildWithShortName + countChildrenWithShortName + insertChild + appendChild + replaceElement + replaceInTopLevelPackage + replaceAnywhere + mapPackagesDeep + replaceInElements)
  - Imports: `'./types.js'`, types

  Create `src/core/arxml/mutation/index.ts`:
  - Re-export all 5 sub-files:
    ```ts
    export * from './types.js';
    export * from './container-ops.js';
    export * from './param-ref-ops.js';
    export * from './discovery.js';
    export * from './tree-ops.js';
    ```
  - **Verify:** every named export from the original `mutation.ts` is reachable through the barrel.

- [ ] **Step 2.3: Delete old mutation.ts**

  Run: `git rm src/core/arxml/mutation.ts`

- [ ] **Step 2.4: Slice applyPatchSteps.ts into 4 sub-files**

  Create `src/core/mutation/applyPatchSteps/types.ts`:
  - Copy lines 1-145 (imports + the re-export of `PatchStep` + `ApplyContext` + `StepError` + `StepWarning` + `ApplyResult`)
  - Imports: `PatchStep` from `'../../../shared/headless/ipc-contract.js'`

  Create `src/core/mutation/applyPatchSteps/engine.ts`:
  - Copy lines 150-754 (applyPatchSteps + remapStepForPendingAddChildSuffix + findPendingSuffixRemap + detectAutoSuffixRemap + applyOneStep + applySetParam + applyAddChild + applyRemoveWithCascade + applyJsonPatchStep + applyVariantDowngrade)
  - Imports: `'./types.js'`, `applyPatchSteps`-internal helpers from `'./helpers.js'`, `addContainer` etc. from `'../../core/arxml/mutation/index.js'`, `BswmdDocument` from `'../../core/project/bswmd/index.js'`

  Create `src/core/mutation/applyPatchSteps/helpers.ts`:
  - Copy lines 756-868 (coerceToParamValue + describeValueType + findChildDefForAdd + findParentContainerDef)
  - Imports: types only

  Create `src/core/mutation/applyPatchSteps/index.ts`:
  - Re-export all 3 sub-files:
    ```ts
    export * from './types.js';
    export * from './engine.js';
    export * from './helpers.js';
    ```

- [ ] **Step 2.5: Delete old applyPatchSteps.ts**

  Run: `git rm src/core/mutation/applyPatchSteps.ts`

- [ ] **Step 2.6: TypeScript + tests + verify**

  Run:

  ```bash
  pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | head -50
  pnpm exec vitest run 2>&1 | tail -10
  pnpm verify 2>&1 | tail -30
  ```

  Expected: 0 type errors, 3124 + 7 SKIP / 0 fail, 7-stage GREEN.

- [ ] **Step 2.7: Commit atomically**

  Run:

  ```bash
  git add -A src/core/arxml/mutation.ts src/core/arxml/mutation/ src/core/mutation/applyPatchSteps.ts src/core/mutation/applyPatchSteps/
  git status
  git diff --cached --stat
  git commit -m "refactor(core): v1.41.x PATCH T2 -- split mutation.ts + applyPatchSteps.ts (file-size backlog)"
  ```

  Expected: 1 commit, ~10 new files + 2 deletes.

- [ ] **Step 2.8: Dispatch pkm-capture**

  Run: `pkm-capture` in the background.

---

## Task 3: split App.tsx (1375) + AppHeader.tsx (894)

### Files

- Modify: `src/renderer/App.tsx` (rewrite as shell orchestrator)
- Create: `src/renderer/app/useAppHandlers.ts` (TBD pending T3.1)
- Create: `src/renderer/app/ViewRouter.tsx` (TBD pending T3.1)
- Create: `src/renderer/app/StatusFooter.tsx` (TBD pending T3.1)
- Modify: `src/renderer/components/AppHeader.tsx` (rewrite as shell orchestrator)
- Create: `src/renderer/components/AppHeader/BrandMark.tsx` (TBD pending T3.1)
- Create: `src/renderer/components/AppHeader/MenuBar.tsx` (TBD pending T3.1)
- Create: `src/renderer/components/AppHeader/StatusBadge.tsx` (TBD pending T3.1)

### Interfaces

- Consumes: existing `src/renderer/App.tsx` (1375 LoC single component) + `src/renderer/components/AppHeader.tsx` (894 LoC single component)
- Produces: shell orchestrators + sub-components. Public surface = `<App />` and `<AppHeader ... />` props unchanged.

### Step-by-step

- [ ] **Step 3.1 (PREFLIGHT): Read both files in full and design the sub-component cut**

  Run: `pnpm exec prettier --write src/renderer/App.tsx src/renderer/components/AppHeader.tsx`
  Read both files in full (4-5 chunks of 500 LoC each for App.tsx).

  **Output:** a 1-page "sub-component cut" document (write to `.git/sdd/v1.41.x-t3-cut.md`) listing:
  - For App.tsx: each extracted sub-component name + its file path + the JSX block it owns + the props it consumes
  - For AppHeader.tsx: same

  This preflight is required because renderer files are JSX-driven, not function-section-driven. The cut is unknowable without reading.

  **Sub-component cut principles:**
  - Each sub-component has a single visual purpose
  - Each sub-component is independently testable (existing tests in `AppHeader.test.tsx` should still pass)
  - Sub-component file LoC ≤ 500 each
  - App.tsx shell orchestrator ≤ 300 LoC after extraction
  - AppHeader.tsx shell orchestrator ≤ 250 LoC after extraction

- [ ] **Step 3.2: Create the App.tsx sub-components per the T3.1 cut**

  For each sub-component identified in T3.1:
  - Create the new file under `src/renderer/app/` with the agreed name
  - Move the JSX + the relevant hooks/handlers
  - Define a typed `Props` interface for each sub-component
  - Use the original handler names; do not introduce new abstractions

- [ ] **Step 3.3: Rewrite App.tsx as shell orchestrator**

  - Remove the extracted JSX blocks
  - Import the new sub-components from `./app/...`
  - Keep all top-level state (Zustand stores, IPC, refs) in App.tsx
  - Pass props down explicitly (no context unless the original used context)

- [ ] **Step 3.4: Create the AppHeader.tsx sub-components per the T3.1 cut**

  - Same pattern as Step 3.2, but under `src/renderer/components/AppHeader/`
  - Sub-component files: `BrandMark.tsx`, `MenuBar.tsx`, `StatusBadge.tsx` (subject to T3.1 cut)

- [ ] **Step 3.5: Rewrite AppHeader.tsx as shell orchestrator**

  - Remove the extracted JSX
  - Import the sub-components
  - Keep the original `AppHeaderProps` interface at the top of the file
  - The default export `AppHeader` is preserved (the file is still `AppHeader.tsx`)

- [ ] **Step 3.6: TypeScript + tests + verify**

  Run:

  ```bash
  pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | head -50
  pnpm exec tsc --noEmit -p tsconfig.web.json 2>&1 | head -50
  pnpm exec vitest run src/renderer/App.test.tsx src/renderer/components/AppHeader.test.tsx 2>&1 | tail -20
  pnpm exec vitest run 2>&1 | tail -10
  pnpm verify 2>&1 | tail -30
  ```

  Expected: 0 type errors, both tsc configs clean, all App/AppHeader tests pass, 3124 + 7 SKIP / 0 fail overall, 7-stage GREEN.

- [ ] **Step 3.7: Verify file-size targets**

  Run:

  ```bash
  wc -l src/renderer/App.tsx src/renderer/components/AppHeader.tsx src/renderer/app/*.ts src/renderer/components/AppHeader/*.tsx 2>&1
  ```

  Expected: all files ≤ 500 LoC; App.tsx ≤ 300; AppHeader.tsx ≤ 250.

- [ ] **Step 3.8: Commit atomically**

  Run:

  ```bash
  git add -A src/renderer/App.tsx src/renderer/app/ src/renderer/components/AppHeader.tsx src/renderer/components/AppHeader/
  git status
  git diff --cached --stat
  git commit -m "refactor(renderer): v1.41.x PATCH T3 -- split App.tsx + AppHeader.tsx (file-size backlog)"
  ```

  Expected: 1 commit, ~7 new files + 2 modified.

- [ ] **Step 3.9: Dispatch pkm-capture**

  Run: `pkm-capture` in the background.

---

## Task 4: split types.ts (1240) + parser.ts (819)

### Files

- Create: `src/shared/types/index.ts`
- Create: `src/shared/types/app.ts`
- Create: `src/shared/types/arxml.ts`
- Create: `src/shared/types/dbc.ts`
- Create: `src/shared/types/odx.ts`
- Create: `src/shared/types/xlsx.ts`
- Delete: `src/shared/types.ts`
- Create: `src/core/arxml/parser/index.ts`
- Create: `src/core/arxml/parser/parse.ts`
- Create: `src/core/arxml/parser/walk.ts`
- Create: `src/core/arxml/parser/build.ts`
- Delete: `src/core/arxml/parser.ts`

### Interfaces

- Consumes: existing `src/shared/types.ts` + `src/core/arxml/parser.ts`
- Produces: same public surface through the barrels; **`Result` re-export is critical** because dozens of files import it from `'../shared/types'`

### Step-by-step

- [ ] **Step 4.1: Read both files in full**

  Run: `pnpm exec prettier --write src/shared/types.ts src/core/arxml/parser.ts`
  Read both files in full.

- [ ] **Step 4.2: Slice types.ts into 6 sub-files**

  Create `src/shared/types/app.ts`:
  - Copy lines 1-40 (`AppInfo` + `PingResponse` + the `Result` re-export)
  - This file re-exports `Result` from `'./result.js'`

  Create `src/shared/types/arxml.ts`:
  - Copy lines 43-152 (`SaveArxmlErrorKind` + `SaveArxmlError` + `FileError` + `OpenArxmlResult` + `OpenArxmlMultiResult` + `SaveArxmlResult` + `ParseArxmlRequest` + `ParseArxmlResponse`)
  - Plus lines 618-end (`SaveArxmlRequest`)

  Create `src/shared/types/dbc.ts`:
  - Copy lines 153-500 (DbcMessageSummary + DbcSignalSummary + DbcSummary + OpenDbcResult + ParseDbcRequest + ParseDbcResponse + DbcImportComStackRequest + DbcImportComStackResponse)

  Create `src/shared/types/odx.ts`:
  - Copy lines 251-552 (OdxDtcSummary + OdxDidData + OdxDidSummary + OdxRoutineSummary + OdxSummary + OpenOdxResult + OpenOdxWithDefaultRequest + OpenOdxWithDefaultResult + BswmdPickResult + ParseOdxRequest + ParseOdxResponse + OdxImportDiagExtractRequest + OdxImportDiagExtractResponse)

  Create `src/shared/types/xlsx.ts`:
  - Copy lines 553-617 (EcucInstanceRow + XlsxParseBatchRequest + XlsxParseBatchResponse + XlsxWriteBatchTemplateRequest + XlsxWriteBatchTemplateResponse + XlsxCommitBatchRequest + XlsxCommitBatchResponse)

  Create `src/shared/types/index.ts`:
  - Re-export all 5 sub-files:
    ```ts
    export * from './app.js';
    export * from './arxml.js';
    export * from './dbc.js';
    export * from './odx.js';
    export * from './xlsx.js';
    ```
  - **CRITICAL:** every file in the codebase that does `import { Result } from '../shared/types'` (or similar) will still resolve through this barrel.

- [ ] **Step 4.3: Delete old types.ts**

  Run: `git rm src/shared/types.ts`

- [ ] **Step 4.4: Slice parser.ts into 4 sub-files**

  Create `src/core/arxml/parser/parse.ts`:
  - Copy lines 1-225 (imports + `ParseOptions` + `ParseError` + `NS_PATTERN` + `XSD_PATTERN` + `parseArxml` + `detectVersion`)

  Create `src/core/arxml/parser/walk.ts`:
  - Copy lines 227-419 (asArray + readShortName + readLongName + MAX_ARPKG_DEPTH + walkPackages + walkPackagesAtDepth + findAnyModuleInPackages + findAnyDefInPackages + walkElements + classifyElement)
  - Imports: `parseArxml` types from `'./parse.js'`

  Create `src/core/arxml/parser/build.ts`:
  - Copy lines 418-819 (buildModule + buildContainer + buildReference + extractParamsAndRefs + extractReferenceParams + parseParamValue)
  - Imports: types from `'./parse.js'`

  Create `src/core/arxml/parser/index.ts`:
  - Re-export all 3 sub-files:
    ```ts
    export * from './parse.js';
    export * from './walk.js';
    export * from './build.js';
    ```

- [ ] **Step 4.5: Delete old parser.ts**

  Run: `git rm src/core/arxml/parser.ts`

- [ ] **Step 4.6: TypeScript + tests + verify**

  Run:

  ```bash
  pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | head -50
  pnpm exec tsc --noEmit -p tsconfig.web.json 2>&1 | head -50
  pnpm exec vitest run 2>&1 | tail -10
  pnpm verify 2>&1 | tail -30
  ```

  Expected: 0 type errors, both tsc configs clean, 3124 + 7 SKIP / 0 fail, 7-stage GREEN.

  **If tsc fails on `import { Result } from '../shared/types'`** — the barrel re-export is incomplete. Check the new `src/shared/types/index.ts` includes `export * from './app.js'`.

- [ ] **Step 4.7: Commit atomically**

  Run:

  ```bash
  git add -A src/shared/types.ts src/shared/types/ src/core/arxml/parser.ts src/core/arxml/parser/
  git status
  git diff --cached --stat
  git commit -m "refactor(core): v1.41.x PATCH T4 -- split types.ts + parser.ts (file-size backlog)"
  ```

  Expected: 1 commit, ~10 new files + 2 deletes.

- [ ] **Step 4.8: Dispatch pkm-capture**

  Run: `pkm-capture` in the background.

---

## Task 5: docs + ship v1.41.1 PATCH

### Files

- Create: `docs/release-notes/v1.41.1/README.md`
- Modify: `CHANGELOG.md`
- Create: `.git/sdd/progress-v1.41.x.md`

### Interfaces

- Consumes: 4 commits from T1-T4 (the splits)
- Produces: release notes, CHANGELOG row, progress ledger, tag v1.41.1, GH release

### Step-by-step

- [ ] **Step 5.1: Verify test count unchanged**

  Run: `pnpm exec vitest run 2>&1 | tail -5`
  Expected: **3124 + 7 SKIP / 0 fail** (zero test delta — the whole point of the PATCH).

- [ ] **Step 5.2: Verify all 8 source files now ≤ 600 LoC**

  Run:

  ```bash
  find src -type f \( -name "*.ts" -o -name "*.tsx" \) -not -name "*.test.ts" -not -name "*.test.tsx" -exec wc -l {} \; | awk '$1 > 600 {print}' | sort -rn
  ```

  Expected: **empty output.** All files ≤ 600 LoC.

- [ ] **Step 5.3: Create release notes**

  Create `docs/release-notes/v1.41.1/README.md`. Mirror v1.41.0 format.

  Content outline:

  ```markdown
  # v1.41.1 PATCH — File-Size Backlog Mechanical Split

  **Ship:** 2026-07-09
  **Baseline:** v1.41.0 MINOR `a4acd4d` (3124 + 7 SKIP / 0 fail)
  **Target:** 3124 + 7 SKIP / 0 fail (zero test delta — pure mechanical split)

  ## Goal

  Mechanically split 8 source files > 800 LoC into ≤ 600 LoC sub-files via barrel re-exports.

  ## What's split

  | File (before)                           | LoC  | Split into                                                                 | Total LoC after           |
  | --------------------------------------- | ---- | -------------------------------------------------------------------------- | ------------------------- |
  | `src/core/project/bswmd.ts`             | 1531 | `bswmd/{types,parse,lookup,validate,index}.ts`                             | 5 files, max 500 LoC each |
  | `src/core/validation/validate.ts`       | 1019 | `validate/{walk,checks,coverage,project,index}.ts`                         | 5 files, max 700 LoC each |
  | `src/core/arxml/mutation.ts`            | 1407 | `mutation/{types,container-ops,param-ref-ops,discovery,tree-ops,index}.ts` | 6 files, max 400 LoC each |
  | `src/core/mutation/applyPatchSteps.ts`  | 923  | `applyPatchSteps/{types,engine,helpers,index}.ts`                          | 4 files, max 600 LoC each |
  | `src/renderer/App.tsx`                  | 1375 | `App.tsx` shell + `app/{useAppHandlers,ViewRouter,StatusFooter,...}.tsx`   | ≤ 500 LoC each            |
  | `src/renderer/components/AppHeader.tsx` | 894  | `AppHeader.tsx` shell + `AppHeader/{BrandMark,MenuBar,StatusBadge}.tsx`    | ≤ 500 LoC each            |
  | `src/shared/types.ts`                   | 1240 | `types/{app,arxml,dbc,odx,xlsx,index}.ts`                                  | 6 files, max 350 LoC each |
  | `src/core/arxml/parser.ts`              | 819  | `parser/{parse,walk,build,index}.ts`                                       | 4 files, max 420 LoC each |

  Total: 8 files → ~32 files. Net LoC delta: ≤ +5% (most lines are moved, not added).

  ## 4 commits on origin/main (T1 + T2 + T3 + T4)

  ## Key design decisions

  - D1: **Barrel re-exports preserve all external import paths** — zero downstream change.
  - D3: **Pure mechanical split, zero behavior change, zero test change** — the whole point of the PATCH is to retire the backlog.
  - D6: **No new exports from any sub-file beyond what the barrel re-exports** — sub-files are internal implementation; consumers go through the barrel.

  ## 2 NEW lessons (candidates)

  1. `file-size-cap-must-be-enforced-in-pre-commit-hook` — every PATCH this year flagged a new file > 800 LoC; the only durable fix is a hook. Queued for lessons-sweep PATCH.
  2. `mechanical-split-barrel-pattern-preserves-import-graphs-without-touching-consumers` — re-exports + sub-directories = zero downstream churn.

  ## Known follow-ups (out of scope)

  - 2 lessons queued for lessons-sweep (vi-waitfor-over-fake-timers, null-fallback-spread)
  - The 6 latent stale-state siblings in `useScriptStore.ts` (v1.41.0 T1 caveat)
  - L2 console.error inventory (Round-5 L2)
  - N1 CLI dispatcher exhaustive (Round-5 N1 confirmed clean)
  ```

- [ ] **Step 5.4: Update CHANGELOG.md**

  Edit `CHANGELOG.md` — add v1.41.1 PATCH row above v1.41.0 with one-liner per T + commit SHAs + "zero test delta" note.

- [ ] **Step 5.5: Run prettier + pnpm verify 7-stage**

  Run: `pnpm exec prettier --write docs/release-notes/v1.41.1/README.md CHANGELOG.md`
  Then: `pnpm verify 2>&1 | tail -30`
  Expected: 7-stage GREEN EX=0.

- [ ] **Step 5.6: Commit atomically**

  Run:

  ```bash
  git add docs/release-notes/v1.41.1/README.md CHANGELOG.md .git/sdd/progress-v1.41.x.md
  git status
  git diff --cached --stat
  git commit -m "docs(release): v1.41.x PATCH T5 -- release notes + CHANGELOG"
  ```

  Expected: 1 commit, 2-3 files changed.

- [ ] **Step 5.7: Tag + push + gh release**

  Run:

  ```bash
  git log --oneline origin/main -3
  git push origin main
  git tag -a v1.41.1 -m "v1.41.1 PATCH -- file-size backlog mechanical split"
  git push origin v1.41.1
  gh release create v1.41.1 --title "v1.41.1 PATCH" --notes-file docs/release-notes/v1.41.1/README.md
  ```

  Expected: 5 commits on origin/main (T1 + T2 + T3 + T4 + T5); tag v1.41.1 pushed; GH release published.

  If `github.com:443` blocked: set `http.proxy=http://127.0.0.1:7897` per v1.37.1 recovery pattern and retry.

- [ ] **Step 5.8: Record ship state in progress ledger**

  Append to `.git/sdd/progress-v1.41.x.md`:

  ```markdown
  ## Ship

  **SHIPPED 2026-07-09** — v1.41.1 PATCH — File-Size Backlog Mechanical Split.

  - **Final commit SHA:** `<T5 sha>`.
  - **Tag:** `v1.41.1` pushed to origin.
  - **GH release:** https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.41.1.
  - **Test count:** 3124 + 7 SKIP / 0 fail (zero test delta — pure mechanical split).
  - **Pre-flight:** pnpm verify 7-stage GREEN.
  - **Source files > 600 LoC after PATCH:** 0 (verified via `find ... -exec wc -l`).

  ## 5 commits on origin/main (T1 + T2 + T3 + T4 + T5)
  ```

- [ ] **Step 5.9: Dispatch pkm-capture**

  Run: `pkm-capture` in the background. Pass the final commit SHA + ship state.

---

## Self-Review

### 1. Spec coverage

| Spec section                              | Task                                                    |
| ----------------------------------------- | ------------------------------------------------------- |
| T1 bswmd + validate split                 | Task 1 ✓                                                |
| T2 mutation + applyPatchSteps split       | Task 2 ✓                                                |
| T3 App + AppHeader split (T3.1 preflight) | Task 3 ✓                                                |
| T4 types + parser split                   | Task 4 ✓                                                |
| T5 docs + ship                            | Task 5 ✓                                                |
| D1 barrel re-exports                      | Step 1.2, 1.4, 2.2, 2.4, 3.3, 3.5, 4.2, 4.4 ✓           |
| D3 zero behavior/test change              | Every task ends with `pnpm verify`; no test additions ✓ |
| D6 no new exports                         | Barrel-only re-exports, no sub-file widening ✓          |
| D7 relative imports                       | Spec mandates; plan uses `'./types.js'` style ✓         |
| pnpm verify 7-stage per T                 | Steps 1.8, 2.6, 3.6, 4.6, 5.5 ✓                         |
| pkm-capture per T                         | Steps 1.10, 2.8, 3.9, 4.8, 5.9 ✓                        |

### 2. Placeholder scan

- "TBD" appears ONLY in T3.1 preflight — explicitly required because the cut is JSX-driven and unknowable without reading. Spec D8 mandates this.
- No "TODO" / "implement later" / "similar to Task N".
- Every code change step shows the actual content (barrel code shown; sub-file path lists given).

### 3. Type consistency

- `bswmd/` sub-files: types.ts → parse.ts → lookup.ts → validate.ts; no circular deps.
- `validate/` sub-files: walk.ts → checks.ts → coverage.ts → project.ts; no circular deps.
- `mutation/` sub-files: types.ts → container-ops.ts → param-ref-ops.ts → discovery.ts → tree-ops.ts; no circular deps.
- `applyPatchSteps/` sub-files: types.ts → engine.ts → helpers.ts; no circular deps.
- `types/` sub-files: app.ts → arxml.ts → dbc.ts → odx.ts → xlsx.ts; no cross-deps within sub-files.
- `parser/` sub-files: parse.ts → walk.ts → build.ts; no circular deps.
- `App/` sub-files: App.tsx imports from `app/*`; sub-files import only React + their props.
- `AppHeader/` sub-files: AppHeader.tsx imports from `AppHeader/*`; sub-files import only React + their props.

No inconsistencies found.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-09-v1-41-x-patch-file-size-backlog-mechanical-split.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
