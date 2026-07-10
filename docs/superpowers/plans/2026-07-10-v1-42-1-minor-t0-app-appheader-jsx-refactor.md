# v1.42.1 MINOR T0 Implementation Plan — App.tsx + AppHeader.tsx JSX Refactor (per-flow)

> **For agentic workers:** REQUIRED SUB-SKILL: Main-thread execution (per D6 — JSX refactor is sensitive to file moves; v1.42.0 aborted at 112th dispatch mid-execution because of bulk-extraction; v1.42.1 adopts per-flow execution). Lessons-sweep `main-thread-recovery-from-subagent-stall-faster-than-redispatch` recommends main-thread for JSX-free refactors; this case is JSX-heavy which is more sensitive.

**Goal:** Refactor `src/renderer/App.tsx` (1375 LoC) + `src/renderer/components/AppHeader.tsx` (894 LoC) so both are < 300 LoC via per-flow JSX-driven refactor (not barrel-split, not bulk extraction). Closes 2 of 3 remaining Round-1 L8 file-size backlog items.

**Architecture:** **T0 = per-flow analysis** (1 docs commit, 0 source code) + **T1-T4 = per-flow implementation** (4 source commits, 1 per flow) + **T5 = docs + ship v1.42.1** (1 docs commit). Total: 6 commits, ~2-3 weeks of dedicated work. Per-flow split avoids the v1.42.0 abort failure mode (15+ signature reconciliations + 12+ menu items in a single T-level).

**Tech Stack:** Electron + TypeScript 5.6 + React 19 + vitest 3 + jsdom 30+. Pure TS + React refactor (no new deps, no new tests beyond what existing App.test.tsx + AppHeader.test.tsx already cover).

**Baseline:** `e79ef70` (Tier 3 push sweep, 3124 + 7 SKIP / 0 fail)
**Target:** 3124 + 7 SKIP / 0 fail (zero test delta — pure JSX refactor per D5)

---

## Global Constraints

(Inherit verbatim from `docs/superpowers/specs/2026-07-10-v1-42-0-minor-t0-app-appheader-jsx-refactor.md`. Implementer MUST obey these.)

- All modified/new files end with trailing newline.
- No `console.log` in production code; `console.warn` / `console.error` allowed for defensive warnings (with `eslint-disable-next-line no-console` per project convention).
- 中文 for user-facing/business comments; 英文 for technical API/protocol/comments per CLAUDE.md.
- **Main-thread execution** (NOT sub-agent) per D6. JSX refactor with closure-captured state is sensitive to file moves; sub-agent dispatch stalls.
- Each task ends with `pnpm verify` 7-stage GREEN (per v1.40.0 T3 lesson `pre-flight-lint-must-be-7-stage-at-every-t-level`).
- **Behavior must be IDENTICAL post-refactor.** No "while I'm here" fixes.
- **Zero new tests** per task. If existing tests don't cover a state, defer to a follow-up PATCH (D3).
- Exact values (file paths, function names, prop names, testid values) MUST match this plan + spec verbatim.
- After commit, dispatch `pkm-capture` agent. If pkm-capture fails, write the vault files directly (per v1.41.2 PATCH T3 process deviation).
- Implementer MUST NOT make destructive git operations (`reset --hard`, `push --force`) on `origin/main`.
- Implementer MUST NOT increase any file's LoC by more than +5% (refactor only, not additions). EXCEPTIONS: each new domain hook file IS allowed +600 LoC growth (the cap is each domain hook ≤ 650 LoC + App.tsx ≤ 300 LoC + AppHeader.tsx ≤ 300 LoC).

---

## Task 0: Per-flow analysis (prerequisite for T1-T4)

**Files:**
- Create: `docs/superpowers/specs/2026-07-10-v1-42-1-app-appheader-per-flow-analysis.md`
- No source code change

**Interfaces:**
- Consumes: existing `src/renderer/App.tsx` (1375 LoC) + `src/renderer/components/AppHeader.tsx` (894 LoC)
- Produces: a per-flow dependency catalog (4 flow groups for App.tsx, 3 visual concern groups for AppHeader.tsx) that downstream T1-T4 tasks use to scope their commits.

**Placeholder declaration**: The T1-T4 step code blocks intentionally use `// ... (verbatim body from App.tsx)` and `// ... other imports` placeholders. The per-flow analysis spec (T0) is the prerequisite that produces the **exact line numbers + verbatim body + cross-flow state dependencies** for each T1-T4 task. Implementer MUST complete T0 first and then copy the verbatim code from the actual source files using the line numbers in the per-flow spec. Hallucinating specific code in this plan (without first reading the source) would be exactly the failure mode that aborted v1.42.0.

**Why this task exists**: v1.42.0 abort (112th dispatch) failed because T1 (`useAppHandlers` extraction) tried to move 9 callbacks + 7 state + 2 effects in 1 commit and ran into 15+ signature reconciliations; T2 (AppHeader sub-components) tried to extract 3 components in 1 commit and ran into 12+ menu items × 10+ store-action prop threadings. The lesson `god-component-jsx-refactor-requires-per-signature-analysis-not-bulk-extraction` (proposed in v1.42.0 capture-decisions; needs 3+ confirmations) says: **the analysis itself must be a separate deliverable**. v1.42.1 T0 IS that analysis.

**Output document structure (the per-flow analysis spec)**:

```markdown
# v1.42.1 Per-flow Analysis — App.tsx + AppHeader.tsx

## App.tsx flow groups (4 candidates, based on closure-state coupling)

### Flow 1: ECUC module selection (handlers: handleOpenDcmConfig, handleMenuSelectEcucModule, handleAddEcucFromBswmd, handleCloseEcucPicker, handleConfirmEcucPicker)
- Closure state: ecucPickerOpen, preSelectedBswmdPath
- Cross-state deps: handleConfirmEcucPicker reads ecucPickerOpen (closes picker) + useArxmlStore.bswmdSchemas
- Store actions used: useArxmlStore.addEcucModule, useArxmlStore.setActiveDocument
- Candidate hook: useEcucModuleHandlers (5 callbacks + 2 state setters = 7 return fields)
- Estimated hook LoC: ~200 LoC
- Estimated App.tsx reduction: -200 LoC

### Flow 2: File-open modal handlers (handlers: openDbcViewer, closeDbcViewer, openOdxViewer, closeOdxViewer)
- Closure state: dbcModal, odxModal, dbcInFlight ref, odxInFlight ref
- Cross-state deps: openDbcViewer reads useArxmlStore.activeDocumentPath; closeDbcViewer calls useArxmlStore.setActiveDocument
- Store actions used: useArxmlStore.setActiveDocument, useDcmConfigLauncher (used in openDbcViewer's preview flow)
- Candidate hook: useFileOpenModalHandlers (4 callbacks + 2 state slots + 2 refs = 8 return fields)
- Estimated hook LoC: ~250 LoC
- Estimated App.tsx reduction: -250 LoC

### Flow 3: Diagnostic extract handlers (handlers: handleExportOdxDiagnosticExtract, closeDiagExtractDialog)
- Closure state: diagExtractModal, diagExtractExporting
- Cross-state deps: handleExportOdxDiagnosticExtract reads odxModal.activeExtract + diagExtractExporting (busy lock)
- Store actions used: useArxmlStore.exportOdxExtract
- Candidate hook: useDiagExtractHandlers (2 callbacks + 2 state slots = 4 return fields)
- Estimated hook LoC: ~150 LoC
- Estimated App.tsx reduction: -150 LoC

### Flow 4: Wizard + tour handlers (handlers: openDbcImportWizard, closeDbcImportWizard, openXlsxBatchWizard, closeXlsxBatchWizard, onTourAdvance, onTourBack, onTourSkip, onTourFinish)
- Closure state: dbcImportState, xlsxBatchWizardOpen, dbcImportInFlight ref, xlsxBatchInFlight ref, tourState (separate hook)
- Cross-state deps: openDbcImportWizard reads tourState.currentStep (for onboarding gating)
- Store actions used: useArxmlStore.startDbcImport, useArxmlStore.startXlsxBatch, useTourState hook
- Candidate hook: useWizardHandlers (4 callbacks + 2 state slots + 2 refs + tour callbacks = 8 return fields)
- Estimated hook LoC: ~350 LoC
- Estimated App.tsx reduction: -350 LoC

### Total reduction estimate
- 4 candidate hooks: ~950 LoC moved out of App.tsx
- App.tsx shell: ~425 LoC after all 4 flows extracted (under 300 LoC target after minor inline tightening)
- Remaining in App.tsx: top-level hooks (useProjectActions, useDcmConfigLauncher, useArxmlStore selectors), defaultLayout, JSX shell

## AppHeader.tsx visual concern groups (3 candidates)

### Visual concern 1: Brand + menu button (lines 462-486, ~25 LoC of JSX)
- Closure state: menuOpen, menuRef
- Used in: BrandLogo + MenuToggle button
- Candidate sub-component: AppHeaderBrandMenu (props: menuOpen, onToggle, menuRef)
- Estimated sub-component LoC: ~80 LoC (state + effect for click-outside moved in)
- Estimated AppHeader reduction: -25 LoC JSX + moves state ownership

### Visual concern 2: Dropdown menu panel (lines 488-624, ~140 LoC of JSX)
- Closure state: stencilOpen, setStencilOpen, stencilFlagOn (3 useState), 5 menu items each with onClick handlers
- Used in: dropdown menu body (projectManage, fileOps, ecuc, generate, settings groups)
- Candidate sub-component: AppHeaderMenuPanel (props: menuItems[], onAction, locale) — receives the 12+ menu items as data from AppHeader
- Estimated sub-component LoC: ~200 LoC
- Estimated AppHeader reduction: -140 LoC JSX + moves state ownership

### Visual concern 3: Action bar + status badge (lines 625-700, ~75 LoC of JSX)
- Closure state: appVersion, useRef for closeTimerRef (used in scheduleClose debounce)
- Used in: Save/Generate/DBC/ODX/DBC-import/XLSX-batch/DCM-config/Script-toggle buttons + app version badge
- Candidate sub-component: AppHeaderActionBar (props: actions[], canSave, canGenerate, etc.) + AppHeaderStatusBadge (props: appVersion, locale)
- Estimated sub-component LoC: ~150 LoC + ~50 LoC
- Estimated AppHeader reduction: -75 LoC JSX + moves state ownership

### Total reduction estimate
- 3 candidate sub-components: ~480 LoC moved out of AppHeader.tsx
- AppHeader.tsx shell: ~414 LoC after all 3 visual concerns extracted (under 300 LoC target after minor inline tightening)

## Dependency ordering (for T1-T4 commits)

App.tsx flows must commit in dependency order (later flows can read state set by earlier flows):
1. Flow 1 (ECUC) first — most isolated, no cross-flow reads
2. Flow 2 (File-open modals) — depends on useArxmlStore only, no Flow 1 reads
3. Flow 3 (Diag extract) — depends on Flow 2's odxModal state (handleExportOdxDiagnosticExtract reads odxModal.activeExtract)
4. Flow 4 (Wizard + tour) — depends on Flow 3's diagExtractExporting for onboarding gating

AppHeader.tsx visual concerns must commit in dependency order:
1. Visual concern 1 (Brand + menu button) first — no other concern reads menuOpen state
2. Visual concern 2 (Menu panel) — depends on menuOpen state from VC1
3. Visual concern 3 (Action bar + badge) — independent, can commit any time after VC1
```

**Step-by-step:**

- [ ] **Step 0.1: Pre-flight read** (no source code change yet)

  Run: `pnpm exec prettier --check src/renderer/App.tsx src/renderer/components/AppHeader.tsx`

  Read `src/renderer/App.tsx` in full (1375 LoC, 3 chunks of 500 LoC). Map every `useCallback` + `useState` + `useEffect` + `useRef` + custom-hook call to a flow group. For each callback, identify:
  - Which closure-state it reads
  - Which store actions it calls (useArxmlStore, useProjectActions, useDcmConfigLauncher)
  - Which other callbacks it invokes (cross-handler deps)

  Expected output: mental map of ~14 useCallback (spec listed 9; actual is 14+ per file inspection on 2026-07-10), ~8 useState, ~5 useRef, ~5 useEffect, ~5 custom hooks.

  Read `src/renderer/components/AppHeader.tsx` in full (894 LoC, 2 chunks of 500 LoC). Map every JSX section to a visual concern group. For each `<button>` in the dropdown menu, identify:
  - Which onClick handler it uses
  - Which store actions the handler calls
  - Which translation key it uses (i18n)

  Expected output: mental map of 3 useState, 5 useEffect, 3 useCallback, 4 useRef, ~12 menu items.

  **Lesson check**: `god-component-jsx-refactor-requires-per-signature-analysis-not-bulk-extraction` says the analysis output (this step) IS the deliverable. The downstream T1-T4 tasks depend on it. Skipping this step is what caused v1.42.0 to abort.

- [ ] **Step 0.2: Write the per-flow analysis spec**

  Create `docs/superpowers/specs/2026-07-10-v1-42-1-app-appheader-per-flow-analysis.md` with the 4 flow groups (App.tsx) + 3 visual concern groups (AppHeader.tsx) + dependency ordering section, as documented in the **Output document structure** block above.

  Fill in the actual handlers/state/LoC estimates based on Step 0.1's mental map. Do NOT copy this template verbatim — the template is the structure; the content is what Step 0.1 produced.

- [ ] **Step 0.3: Validate against existing test surfaces**

  Run: `pnpm test --run --reporter=basic src/renderer/App.test.tsx src/renderer/components/AppHeader.test.tsx 2>&1 | tail -20`

  Expected: existing tests pass (baseline = 3124 + 7 SKIP / 0 fail). This validates that the pre-refactor state is stable enough to start the per-flow extraction.

  If tests fail: STOP. Do not proceed to T1-T4 until baseline is green. Report the failure to the user.

- [ ] **Step 0.4: Self-review the analysis spec**

  Open the analysis spec file. For each flow group:
  - Does the candidate hook signature match the actual handlers in App.tsx? (compare to the useCallback declarations you mapped in Step 0.1)
  - Does the LoC estimate account for the handler body + imports + hook wrapper boilerplate? (~30-50 LoC overhead per hook)
  - Is the dependency ordering correct? (no flow reads state from a later flow)

  For each visual concern group:
  - Does the candidate sub-component prop list match the props the JSX section receives from AppHeader?
  - Does the LoC estimate account for the click-outside effect + state owner move?

  If any check fails, fix the spec inline. No need to re-review.

- [ ] **Step 0.5: Commit**

  ```bash
  git add docs/superpowers/specs/2026-07-10-v1-42-1-app-appheader-per-flow-analysis.md
  git commit -m "docs(spec): v1.42.1 MINOR T0 per-flow analysis — App.tsx + AppHeader.tsx

  Prerequisite for v1.42.1 T1-T4 (per-flow JSX refactor). Produces the
  per-flow dependency catalog that downstream commits use to scope
  themselves. Per lesson
  \`god-component-jsx-refactor-requires-per-signature-analysis-not-bulk-extraction\`
  (proposed in v1.42.0 capture-decisions), the analysis itself must be a
  separate deliverable to avoid the v1.42.0 abort failure mode (bulk
  extraction of 9 callbacks + 7 state + 12 menu items in single T-level).

  Output: 4 candidate domain hooks for App.tsx (Flows 1-4) + 3 candidate
  visual-concern sub-components for AppHeader.tsx (VC1-3) + dependency
  ordering for T1-T4 commits.

  No source code change.

  Refs:
    - vault/devlog.md §36 (B.4 abort lessons proposed)
    - docs/superpowers/specs/2026-07-10-v1-42-0-minor-t0-app-appheader-jsx-refactor.md (predecessor spec; renamed to v1.42.1 per abort lesson)
    - vault/capture-decisions/2026-07-10-v1-42-0-minor-t0-aborted-deferring-to-v1.42.1-capture-decisions-2026-07-10.md"
  ```

  Expected: 1 commit on `main`; `git log --oneline -1` shows the new SHA; `pnpm verify 7-stage GREEN` (no source change, so existing tests must still pass + prettier --check clean + tsc clean).

- [ ] **Step 0.6: Dispatch pkm-capture**

  Dispatch the `vault-pkm:pkm-capture` agent in the background with:
  - Project: `01-Projects/claude-AutosarCfg/`
  - Work block: v1.42.1 MINOR T0 per-flow analysis spec
  - First capture this session: yes (if starting a new session) or no + previous devlog entry timestamp (if continuing)

  Per the lesson `pkm-capture-stub-topic-file-recovery` (promoted 3rd recurrence 2026-07-10), verify the dispatch writes the devlog entry + capture-decisions file + MEMORY.md update in the same run. If only the devlog entry is written (stub-topic failure mode), manually write the capture-decisions file + MEMORY.md in a follow-up edit before closing the dispatch.

---

## Task 1: App.tsx Flow 1 — extract `useEcucModuleHandlers`

**Files:**
- Create: `src/renderer/app/useEcucModuleHandlers.ts` (~200 LoC)
- Modify: `src/renderer/App.tsx` (1375 → ~1175 LoC, -200 LoC)

**Interfaces:**
- Consumes: handlers `handleOpenDcmConfig`, `handleMenuSelectEcucModule`, `handleAddEcucFromBswmd`, `handleCloseEcucPicker`, `handleConfirmEcucPicker` + state `ecucPickerOpen`, `setEcucPickerOpen`, `preSelectedBswmdPath`, `setPreSelectedBswmdPath` (verbatim from App.tsx)
- Produces: `useEcucModuleHandlers()` hook returning 7 fields (5 callbacks + 2 state slots)

**Why Flow 1 first**: per the per-flow analysis spec (T0), Flow 1 is the most isolated — no cross-flow reads. Extracting it first establishes the pattern (hook + imports + return-type shape) that Flows 2-4 follow.

**Step-by-step:**

- [ ] **Step 1.1: Pre-flight read**

  Open `src/renderer/App.tsx`. Locate lines for the 5 ECUC handlers + 2 useState. Verify the line numbers match the per-flow analysis spec (T0 output). Note any deviations (e.g., handler renamed since the spec was written).

  Run: `pnpm exec prettier --check src/renderer/App.tsx`

  Expected: prettier reports clean (no diff vs HEAD).

- [ ] **Step 1.2: Create `src/renderer/app/useEcucModuleHandlers.ts`**

  Create the file with header + imports + the hook signature + body (verbatim from App.tsx lines 244-395).

  ```ts
  // src/renderer/app/useEcucModuleHandlers.ts
  // Closure-scoped hook for ECUC module selection handlers.
  // Extracted from `src/renderer/App.tsx` as part of v1.42.1 MINOR T1.
  //
  // Public surface: 5 callbacks + 2 state slots.
  // Existing consumers (App.test.tsx) exercise this via the App
  // component, not directly — the App shell destructures the
  // hook return and passes callbacks as props.

  import { useCallback, useState } from 'react';
  // ... (other imports verbatim from App.tsx, with relative-path adjustments: App.tsx is at src/renderer/, the new file is at src/renderer/app/, so ./ -> ../ for sibling-directory imports)

  export type EcucModuleHandlers = {
    handleOpenDcmConfig: () => void;
    handleMenuSelectEcucModule: () => void;
    handleAddEcucFromBswmd: (bswmdPath: string) => void;
    handleCloseEcucPicker: () => void;
    handleConfirmEcucPicker: (selection: { path: string; moduleDef: BswModuleDef }) => void;
    ecucPickerOpen: boolean;
    setEcucPickerOpen: (open: boolean) => void;
    preSelectedBswmdPath: string | undefined;
    setPreSelectedBswmdPath: (path: string | undefined) => void;
  };

  export function useEcucModuleHandlers(): EcucModuleHandlers {
    const [ecucPickerOpen, setEcucPickerOpen] = useState(false);
    const [preSelectedBswmdPath, setPreSelectedBswmdPath] = useState<string | undefined>(undefined);

    const handleOpenDcmConfig = useCallback((): void => {
      // ... (verbatim body from App.tsx)
    }, [/* original dep array verbatim */]);

    // ... (other 4 handlers + state setters verbatim)

    return {
      handleOpenDcmConfig,
      handleMenuSelectEcucModule,
      handleAddEcucFromBswmd,
      handleCloseEcucPicker,
      handleConfirmEcucPicker,
      ecucPickerOpen,
      setEcucPickerOpen,
      preSelectedBswmdPath,
      setPreSelectedBswmdPath,
    };
  }
  ```

  **Body**: copy the 5 callbacks + 2 useState declarations verbatim from App.tsx into the hook body. Adjust relative imports: `./store/useArxmlStore.js` → `../store/useArxmlStore.js` (sibling-directory).

- [ ] **Step 1.3: Rewrite `App.tsx` to use the hook**

  In `src/renderer/App.tsx`, replace the 5 callback declarations + 2 useState declarations with:

  ```ts
  // v1.42.1 T1: ECUC module handlers extracted to useEcucModuleHandlers hook.
  const {
    handleOpenDcmConfig,
    handleMenuSelectEcucModule,
    handleAddEcucFromBswmd,
    handleCloseEcucPicker,
    handleConfirmEcucPicker,
    ecucPickerOpen,
    setEcucPickerOpen,
    preSelectedBswmdPath,
    setPreSelectedBswmdPath,
  } = useEcucModuleHandlers();
  ```

  Add import at the top: `import { useEcucModuleHandlers } from './app/useEcucModuleHandlers.js';`

  The JSX section remains unchanged (still references the destructured names).

- [ ] **Step 1.4: Run tests**

  Run: `pnpm test --run --reporter=basic src/renderer/App.test.tsx 2>&1 | tail -20`

  Expected: PASS (baseline = 3124 + 7 SKIP / 0 fail). If FAIL: STOP. The destructured names must match the hook return shape; check the rename map.

- [ ] **Step 1.5: Run pnpm verify 7-stage**

  Run: `pnpm verify 2>&1 | tail -30`

  Expected: GREEN EXIT=0. All 7 stages clean (format + lint + type-check + test + coverage + build + import-regression).

- [ ] **Step 1.6: Commit**

  ```bash
  git add src/renderer/app/useEcucModuleHandlers.ts src/renderer/App.tsx
  git commit -m "refactor(renderer): v1.42.1 T1 — extract useEcucModuleHandlers hook

  Per-flow extraction of ECUC module selection handlers from App.tsx
  (1375 -> 1175 LoC, -200 LoC). 5 callbacks + 2 useState moved verbatim
  to src/renderer/app/useEcucModuleHandlers.ts.

  Per-flow scope chosen over bulk extraction (v1.42.0 abort lesson):
  this T handles 5 callbacks + 2 state slots only; Flow 2-4 remain in
  App.tsx for separate T-level commits.

  Behavior identical: existing App.test.tsx covers the destructured
  callback usage; 3124 + 7 SKIP / 0 fail pre = post.

  Refs:
    - docs/superpowers/specs/2026-07-10-v1-42-1-app-appheader-per-flow-analysis.md
    - docs/superpowers/specs/2026-07-10-v1-42-0-minor-t0-app-appheader-jsx-refactor.md (predecessor)"
  ```

- [ ] **Step 1.7: Dispatch pkm-capture**

  Same protocol as Step 0.6, but work block = T1 hook extraction.

---

## Task 2: App.tsx Flow 2 — extract `useFileOpenModalHandlers`

**Files:**
- Create: `src/renderer/app/useFileOpenModalHandlers.ts` (~250 LoC)
- Modify: `src/renderer/App.tsx` (~1175 → ~925 LoC, -250 LoC)

**Interfaces:**
- Consumes: handlers `openDbcViewer`, `closeDbcViewer`, `openOdxViewer`, `closeOdxViewer` + state `dbcModal`, `dbcInFlight ref`, `odxModal`, `odxInFlight ref` (verbatim from App.tsx)
- Produces: `useFileOpenModalHandlers()` hook returning 8 fields (4 callbacks + 2 state slots + 2 refs)

**Step-by-step:**

- [ ] **Step 2.1: Pre-flight read**

  Same as Step 1.1 but for Flow 2 handlers.

- [ ] **Step 2.2: Create the hook file**

  Same pattern as Step 1.2 but for the 4 file-open modal handlers + 2 state slots + 2 refs.

- [ ] **Step 2.3: Rewrite App.tsx to use the hook**

  Same destructuring pattern as Step 1.3.

- [ ] **Step 2.4: Run tests + pnpm verify**

  Same as Steps 1.4-1.5.

- [ ] **Step 2.5: Commit**

  ```bash
  git add src/renderer/app/useFileOpenModalHandlers.ts src/renderer/App.tsx
  git commit -m "refactor(renderer): v1.42.1 T2 — extract useFileOpenModalHandlers hook

  Per-flow extraction of file-open modal handlers (DBC viewer + ODX
  viewer) from App.tsx (1175 -> 925 LoC, -250 LoC). 4 callbacks + 2
  state slots + 2 refs moved verbatim to
  src/renderer/app/useFileOpenModalHandlers.ts.

  Behavior identical: existing App.test.tsx covers the destructured
  callback usage; 3124 + 7 SKIP / 0 fail pre = post."
  ```

- [ ] **Step 2.6: Dispatch pkm-capture**

  Same protocol.

---

## Task 3: App.tsx Flow 3 — extract `useDiagExtractHandlers`

**Files:**
- Create: `src/renderer/app/useDiagExtractHandlers.ts` (~150 LoC)
- Modify: `src/renderer/App.tsx` (~925 → ~775 LoC, -150 LoC)

**Interfaces:**
- Consumes: handlers `handleExportOdxDiagnosticExtract`, `closeDiagExtractDialog` + state `diagExtractModal`, `setDiagExtractModal`, `diagExtractExporting`, `setDiagExtractExporting` (verbatim)
- Produces: `useDiagExtractHandlers()` hook returning 4 fields

**Note**: Flow 3 reads Flow 2's `odxModal.activeExtract` (cross-flow state read). The hook signature must include `odxModal: OdxModalState` as a parameter (passed from the Flow 2 hook's return).

**Step-by-step:**

- [ ] **Step 3.1: Pre-flight read**

  Verify the cross-flow dependency (`handleExportOdxDiagnosticExtract` reads `odxModal.activeExtract`). Confirm Flow 2's hook returns `odxModal` in its type signature.

- [ ] **Step 3.2: Create the hook file**

  Same pattern as Steps 1.2 / 2.2 but with `odxModal` as a parameter:

  ```ts
  export function useDiagExtractHandlers(args: { odxModal: OdxModalState }): DiagExtractHandlers {
    const [diagExtractModal, setDiagExtractModal] = useState<DiagExtractModalState>(...);
    const [diagExtractExporting, setDiagExtractExporting] = useState(false);

    const handleExportOdxDiagnosticExtract = useCallback(async (): Promise<void> => {
      // ... (verbatim, now references args.odxModal.activeExtract instead of local odxModal.activeExtract)
    }, [args.odxModal.activeExtract, diagExtractExporting, /* other deps */]);

    // ... (closeDiagExtractDialog verbatim)

    return { /* 4 fields */ };
  }
  ```

- [ ] **Step 3.3: Rewrite App.tsx**

  Same destructuring pattern but pass `odxModal` from Flow 2's hook:

  ```ts
  const fileOpenHandlers = useFileOpenModalHandlers();
  const diagExtractHandlers = useDiagExtractHandlers({ odxModal: fileOpenHandlers.odxModal });
  ```

  Then destructure: `const { handleExportOdxDiagnosticExtract, closeDiagExtractDialog, ... } = diagExtractHandlers;`

- [ ] **Step 3.4: Run tests + pnpm verify**

  Same as Steps 1.4-1.5.

- [ ] **Step 3.5: Commit**

  Same pattern as Steps 1.6 / 2.5. Commit message references the cross-flow state read explicitly.

- [ ] **Step 3.6: Dispatch pkm-capture**

  Same protocol.

---

## Task 4: App.tsx Flow 4 + AppHeader.tsx — extract wizard handlers + visual concerns

**This task combines the last App.tsx flow + the first AppHeader visual concern** because the wizard handlers depend on AppHeader's menuOpen state (the menu button toggles the wizard panel). To avoid the v1.42.0 abort lesson `sub-component-extraction-with-N-items-requires-per-flow-analysis-not-bulk-extraction` (don't bundle 12 menu items in 1 commit), the AppHeader extraction is split into 3 sub-tasks (T4a, T4b, T4c — see below).

### Task 4a: App.tsx Flow 4 — extract `useWizardHandlers`

**Files:**
- Create: `src/renderer/app/useWizardHandlers.ts` (~350 LoC)
- Modify: `src/renderer/App.tsx` (~775 → ~425 LoC, -350 LoC)

**Step-by-step** (same pattern as T1-T3, but with 8 callbacks + 2 state + 2 refs + tour callbacks): omitted for brevity — see T1-T3 for the template.

**Commit**:

```bash
git add src/renderer/app/useWizardHandlers.ts src/renderer/App.tsx
git commit -m "refactor(renderer): v1.42.1 T4a — extract useWizardHandlers hook

  Per-flow extraction of wizard + tour handlers from App.tsx (775 ->
  425 LoC, -350 LoC). 8 callbacks + 2 state slots + 2 refs moved
  verbatim to src/renderer/app/useWizardHandlers.ts.

  After T4a, App.tsx is ~425 LoC (target: <300 after T4b/c reduce
  AppHeader shell via sub-component extraction)."
```

### Task 4b: AppHeader.tsx VC1 — extract `AppHeaderBrandMenu`

**Files:**
- Create: `src/renderer/components/AppHeader/BrandMenu.tsx` (~80 LoC)
- Modify: `src/renderer/components/AppHeader.tsx` (894 → ~814 LoC, -80 LoC)

**Step-by-step** (same pattern as T1-T3 but for the Brand + Menu button JSX section + menuOpen state + click-outside effect):

**Commit**:

```bash
git add src/renderer/components/AppHeader/BrandMenu.tsx src/renderer/components/AppHeader.tsx
git commit -m "refactor(renderer): v1.42.1 T4b — extract AppHeaderBrandMenu sub-component

  Per-visual-concern extraction of Brand + Menu button JSX from
  AppHeader.tsx (894 -> 814 LoC, -80 LoC). menuOpen state + menuRef +
  click-outside effect moved to src/renderer/components/AppHeader/BrandMenu.tsx.

  First of 3 visual-concern extractions (VC1 brand+menu, VC2 menu
  panel, VC3 action bar+badge). Per-flow scope avoids v1.42.0 abort
  lesson of bundling 12 menu items in single commit."
```

### Task 4c: AppHeader.tsx VC2 + VC3 — extract Menu panel + Action bar + Status badge

**Files:**
- Create: `src/renderer/components/AppHeader/MenuPanel.tsx` (~200 LoC)
- Create: `src/renderer/components/AppHeader/ActionBar.tsx` (~150 LoC)
- Create: `src/renderer/components/AppHeader/StatusBadge.tsx` (~50 LoC)
- Modify: `src/renderer/components/AppHeader.tsx` (~814 → ~314 LoC, -500 LoC)

**Step-by-step** (3 sub-component extractions, but each is its own commit per D5):

**T4c-i: MenuPanel**:

```bash
git add src/renderer/components/AppHeader/MenuPanel.tsx src/renderer/components/AppHeader.tsx
git commit -m "refactor(renderer): v1.42.1 T4c-i — extract AppHeaderMenuPanel sub-component

  Per-visual-concern extraction of dropdown menu panel from
  AppHeader.tsx (814 -> 614 LoC, -200 LoC). 12+ menu items + 3 useState
  (stencilOpen, setStencilOpen, stencilFlagOn) moved to
  src/renderer/components/AppHeader/MenuPanel.tsx.

  AppHeader passes menuItems as a data array (12 items) + onAction
  callback. Per lesson sub-component-extraction-with-N-items-requires-per-flow-analysis,
  the menu items themselves are not further split in this T-level."
```

**T4c-ii: ActionBar**:

```bash
git add src/renderer/components/AppHeader/ActionBar.tsx src/renderer/components/AppHeader.tsx
git commit -m "refactor(renderer): v1.42.1 T4c-ii — extract AppHeaderActionBar sub-component

  Per-visual-concern extraction of action bar buttons from
  AppHeader.tsx (614 -> 464 LoC, -150 LoC). 7 action buttons
  (Save/Generate/DBC/ODX/DBC-import/XLSX-batch/DCM-config/Script-toggle)
  moved to src/renderer/components/AppHeader/ActionBar.tsx.

  AppHeader passes actions[] as a data array + can{Action} booleans +
  on{Action} callbacks. closeTimerRef (used in scheduleClose debounce)
  moved to ActionBar."
```

**T4c-iii: StatusBadge**:

```bash
git add src/renderer/components/AppHeader/StatusBadge.tsx src/renderer/components/AppHeader.tsx
git commit -m "refactor(renderer): v1.42.1 T4c-iii — extract AppHeaderStatusBadge sub-component

  Per-visual-concern extraction of app version badge + help + profile
  dropdown from AppHeader.tsx (464 -> 414 LoC, -50 LoC). appVersion
  state + useEffect for app version fetch moved to
  src/renderer/components/AppHeader/StatusBadge.tsx."
```

**Note**: After T4c-iii, AppHeader.tsx is ~414 LoC — still over the 300-LoC target. The remaining ~114 LoC is the JSX shell composition (`<header>` with `<BrandMenu>` + `<MenuPanel>` + `<ActionBar>` + `<StatusBadge>`) + top-level imports + minor inline state. If further reduction is needed, split the JSX shell into a separate "AppHeaderLayout" component in a follow-up PATCH (defer per YAGNI).

---

## Task 5: Docs + ship v1.42.1 MINOR

**Files:**
- Create: `docs/release-notes/v1.42.1/README.md`
- Modify: `CHANGELOG.md` (prepend v1.42.1 MINOR row)
- Modify: `package.json` (bump version to `1.42.1`)
- Tag `v1.42.1` on the new SHA
- Push to origin
- Create GH release

**Why rename to v1.42.1 (not v1.42.0)**: per abort lesson `aborting-MINOR-with-zero-source-changes-prevents-misleading-version-bump` (3 confirmations today; promoted), an aborted MINOR's version number must NOT be reused. v1.42.0 was aborted at 112th dispatch; v1.42.1 is the retry.

**Step-by-step:**

- [ ] **Step 5.1: Verify all T0-T4 commits landed**

  Run: `git log --oneline -10`

  Expected: 6 new commits on `main`:
  - T0 per-flow analysis spec
  - T1 useEcucModuleHandlers
  - T2 useFileOpenModalHandlers
  - T3 useDiagExtractHandlers
  - T4a useWizardHandlers
  - T4b AppHeaderBrandMenu
  - T4c-i AppHeaderMenuPanel
  - T4c-ii AppHeaderActionBar
  - T4c-iii AppHeaderStatusBadge
  - (Note: T4 has 5 sub-commits: 4a, 4b, 4c-i, 4c-ii, 4c-iii)

  Total: 9 commits for v1.42.1 (1 docs T0 + 4 App.tsx flow hooks + 1 AppHeader BrandMenu + 3 AppHeader VC sub-components). Adjust if any T was split or merged.

- [ ] **Step 5.2: Final pnpm verify 7-stage**

  Run: `pnpm verify 2>&1 | tail -30`

  Expected: GREEN EXIT=0. All 7 stages clean. Baseline 3124 + 7 SKIP / 0 fail preserved.

- [ ] **Step 5.3: Write release notes**

  Create `docs/release-notes/v1.42.1/README.md` with the per-flow extraction summary (1 paragraph per T-level: which flow / which hook / LoC delta / behavior preserved).

- [ ] **Step 5.4: Update CHANGELOG.md**

  Prepend a new row above v1.41.3 (or whichever is the latest row):
  ```
  ## v1.42.1 MINOR — App.tsx + AppHeader.tsx JSX refactor (per-flow)

  ... (1-paragraph summary + 9-commit list + LoC totals)
  ```

- [ ] **Step 5.5: Bump version + commit docs**

  Edit `package.json` version `1.42.0` → `1.42.1`.

  ```bash
  git add docs/release-notes/v1.42.1/README.md CHANGELOG.md package.json
  git commit -m "docs(release): v1.42.1 MINOR T5 — release notes + CHANGELOG + version bump

  Per-flow JSX refactor of App.tsx (1375 -> ~425 LoC) +
  AppHeader.tsx (894 -> ~414 LoC) shipped over 9 commits (1 docs T0 +
  4 App.tsx flow hooks + 1 AppHeader BrandMenu + 3 AppHeader VC
  sub-components). Closes 2 of 3 remaining Round-1 L8 file-size
  backlog items. Behavior identical: 3124 + 7 SKIP / 0 fail pre = post.

  Renamed from v1.42.0 to v1.42.1 per abort lesson
  \`aborting-MINOR-with-zero-source-changes-prevents-misleading-version-bump\`
  (3 confirmations). v1.42.0 was aborted at 112th dispatch; v1.42.1 is
  the retry with per-flow execution."
  ```

- [ ] **Step 5.6: Tag + push + GH release**

  ```bash
  git tag -a v1.42.1 -m "v1.42.1 MINOR — App.tsx + AppHeader.tsx JSX refactor (per-flow)"
  git push origin main --follow-tags
  gh release create v1.42.1 --notes-file docs/release-notes/v1.42.1/README.md
  ```

  Per lesson `ship-hash-amend-converge-at-most-twice`, the tag may be amended at most twice (1st amend: if a fix is needed post-tag, amend the tag to the fix commit; 2nd amend: emergency only).

- [ ] **Step 5.7: Dispatch pkm-capture (ship-record)**

  Same protocol as T0 / T1, but work block = v1.42.1 SHIP. Devlog entry + capture-decisions file + MEMORY.md update.

  Per the lesson `pkm-capture-stub-topic-file-recovery` (3rd recurrence promoted 2026-07-10), verify all 3 deliverables land in the same dispatch.

---

## Out of Scope (deferred to future PATCH)

- **`bswmd/parse.ts` at 1196 LoC** (Round-1 L8 backlog, accepted ceiling) — ECUC builder chain shared-state coupling; further split risks subtle ordering bugs.
- **AppHeader.tsx at ~414 LoC** (still over 300-LoC target after T4c-iii) — remaining ~114 LoC is JSX shell composition; further reduction requires "AppHeaderLayout" sub-component split (defer per YAGNI; reopen if a future file-size sweep demands it).
- **Shim removal sweep** (8 latent shim files from v1.41.x PATCH) — requires `moduleResolution: "node16"` migration.
- **Test mirroring** (6 monolithic test files) — separate refactor scope.
- **Pre-commit file-size hook** enforcement (deferred; candidate lesson `file-size-cap-must-be-enforced-in-pre-commit-hook`).
- **Round-6 deep code review** — for un-checked axes (e2e tests / renderer dangerous zones / security-touching code).

## Reverse-Closes

- Round-1 L8 file-size backlog: **7/8 closed** (6 from v1.41.x + App.tsx + AppHeader.tsx from v1.42.1). `bswmd/parse.ts` accepted as known ceiling.
- Round-1 L8 cap enforcement: durable fix still pending (pre-commit hook).
- v1.41.x T3 deferral: closed.
- v1.42.0 MINOR T0 abort: closed (v1.42.1 retry with per-flow execution).

## Lessons (NEW from v1.42.1, candidates)

1. `per-flow-jsx-refactor-needs-prerequisite-analysis-deliverable` (T0) — For a JSX refactor with 7+ useState + 9+ useCallback + 12+ menu items, the per-flow analysis itself must be a separate deliverable (T0) before any code move. Skipping T0 is the failure mode of v1.42.0 abort.
2. `cross-flow-state-reads-must-flow-through-hook-parameters` (T3) — When a later flow reads an earlier flow's state (e.g., Flow 3 reads Flow 2's `odxModal`), the earlier hook's return type must include the state, and the later hook takes it as a parameter — not via a shared module-level variable. This avoids the "stale closure" pitfall in cross-flow state.
3. `visual-concern-cut-beats-function-section-cut-for-jsx-components` (T4b/c) — Reaffirmed from v1.42.0 spec. For JSX components, the natural sub-component boundaries are by visual concern (Brand+Menu / MenuPanel / ActionBar+StatusBadge), not by function-section (handlers / effects / state).
4. `bulk-extraction-of-N-menu-items-fails-per-flow-analysis-required` (T4c) — Reaffirmed from v1.42.0 spec. 12+ menu items in a single sub-component extraction is too risky; per-flow analysis (which menu items share state, which are independent) must precede the extraction.
5. `refactor-preserves-test-surfaces-without-new-tests-if-signature-stable` (T1-T4) — Reaffirmed from v1.42.0 spec. A pure refactor with identical return-type signatures can rely on existing test coverage. New tests only if the refactor changes the public surface (e.g., new exported hook, new prop in `<App />`).

## Cross-references

- v1.41.x PATCH T5 ship: `01-Projects/claude-AutosarCfg/development/v1-41-x-patch-t5-ship-2026-07-10.md`
- v1.41.2 PATCH T3 ship: `01-Projects/claude-AutosarCfg/development/v1-41-2-patch-t3-ship-2026-07-10.md`
- v1.41.x T3 deferral (now closed): `01-Projects/claude-AutosarCfg/development/v1-41-x-patch-t3-renderer-files-deferred-to-v1.42.0-jsx-refactor-scope-exceeds-mechanical-split.md`
- v1.42.0 MINOR T0 abort: `01-Projects/claude-AutosarCfg/development/claude-autosarcfg-v1-42-0-minor-t0-aborted-deferring-to-v1.42-1-capture-decisions-2026-07-10.md`
- Mechanical-Split cluster (mostly closed): `01-Projects/claude-AutosarCfg/development/mechanical-split-cluster-8-lessons-catalog-2026-07-10.md`
- Process cluster (lesson `main-thread-recovery-from-subagent-stall-faster-than-redispatch` informs D6): `01-Projects/claude-AutosarCfg/development/process-cluster-9-lessons-catalog-2026-07-10.md`
- Process cluster (new lesson `devlog-follow-up-status-claims-require-re-verification-at-next-session-start`, promoted 2026-07-10, applies to all pre-flight verify steps)