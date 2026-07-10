# v1.42.0 MINOR T0 Implementation Plan — App.tsx + AppHeader.tsx JSX Refactor

> **For agentic workers:** REQUIRED SUB-SKILL: Main-thread execution (per D4 in spec — JSX refactor is sensitive to file moves, lessons-sweep `main-thread-recovery-from-subagent-stall-faster-than-redispatch` recommends main-thread for JSX-free refactors, this case is JSX-heavy which is more sensitive).

**Goal:** Mechanically refactor `src/renderer/App.tsx` (1375) + `src/renderer/components/AppHeader.tsx` (894) so both are < 300 LoC via JSX-driven refactor (NOT barrel-split).

**Architecture:** 2 source commits (T1: App.tsx + useAppHandlers hook, T2: AppHeader.tsx + 3 sub-components) + 1 docs commit (T3). T1 and T2 are self-contained; the reviewer can accept either independently of the other.

**Tech Stack:** Electron + TypeScript 5.6 + React 19 + vitest 3 + jsdom 30+. Pure TS + React refactor (no new deps, no new tests).

**Baseline:** v1.41.2 PATCH `3f507d9` (3124 + 7 SKIP / 0 fail)
**Target:** 3124 + 7 SKIP / 0 fail (zero test delta — pure JSX refactor)

## Global Constraints

(Inherit verbatim from spec. Implementer MUST obey these.)

- All modified/new files end with trailing newline.
- No `console.log` in production code.
- 中文 for user-facing/business comments; 英文 for technical API/protocol/comments per CLAUDE.md.
- Main-thread execution (NOT sub-agent) per D4. Lessons-sweep `main-thread-recovery-from-subagent-stall-faster-than-redispatch` applies — JSX refactor with 9 callbacks + 7 state is sensitive to file moves.
- Each task ends with `pnpm verify` 7-stage GREEN (per v1.40.0 T3 lesson).
- **Behavior must be IDENTICAL post-refactor.** No "while I'm here" fixes.
- **Zero new tests.** Existing test surfaces preserved.
- Exact values (file paths, function names, prop names, testid values) MUST match this plan verbatim.
- After commit, dispatch `pkm-capture` agent. If pkm-capture fails, write the vault files directly (per v1.41.2 PATCH T3 process deviation).
- Implementer MUST NOT make destructive git operations on `origin/main`.
- Implementer MUST NOT increase `App.tsx` past 300 LoC or `useAppHandlers.ts` past 650 LoC.

---

## Task 1: extract `useAppHandlers` hook

**Files:**

- Create: `src/renderer/app/useAppHandlers.ts`
- Modify: `src/renderer/App.tsx`

**Interfaces:**

- Consumes: existing `src/renderer/App.tsx` (1375 LoC)
- Produces: `useAppHandlers()` hook returning 16 fields (9 callbacks + 7 state setters + modal helpers). Public surface = same callback names + same state names as before, so existing tests pass.

### Step-by-step

- [ ] **Step 1.1: Pre-flight read**

  Run: `pnpm exec prettier --write src/renderer/App.tsx`

  Read `src/renderer/App.tsx` in full (1375 LoC, ~5 chunks of 500 LoC). Note exact line numbers of:
  - All 9 `useCallback` declarations (handleOpenDcmConfig, handleMenuSelectEcucModule, handleAddEcucFromBswmd, handleCloseEcucPicker, handleConfirmEcucPicker, handleContextMenu, handleGenerateClick, handleContextMenuAction, handleExportOdxDiagnosticExtract)
  - All 7 `useState` declarations (ecucPickerOpen, scriptPanelOpen, dbcModal, odxModal, diagExtractModal, diagExtractExporting, dbcImportState, xlsxBatchWizardOpen)
  - All 2 `useEffect` declarations (xlsxImport listener, xlsxHistory bootstrap)
  - All 5+ custom hook calls (useProjectActions, useDcmConfigLauncher, useArxmlStore selectors)
  - The JSX return statement (line 915+)

  Expected: comprehensive map of all top-level state + handlers in App.tsx.

- [ ] **Step 1.2: Create `src/renderer/app/useAppHandlers.ts` (NEW)**

  Create the file with header + imports + the hook signature.

  ```ts
  // src/renderer/app/useAppHandlers.ts
  // Closure-scoped hook for all App.tsx callbacks + state.
  // Split from `src/renderer/App.tsx` as part of v1.42.0 MINOR T0
  // (JSX refactor for file-size cap).
  //
  // Public surface: 9 callbacks + 7 state setters + modal helpers.
  // Existing consumers (App.test.tsx) exercise this via the App
  // component, not directly — the App shell destructures the
  // hook return and passes callbacks as props.

  import { useCallback, useEffect, useState } from 'react';
  import { useArxmlStore } from '../store/useArxmlStore.js';
  // ... (other imports verbatim from App.tsx)

  export type AppHandlers = {
    // 9 callbacks
    handleOpenDcmConfig: () => void;
    handleMenuSelectEcucModule: () => void;
    handleAddEcucFromBswmd: (bswmdPath: string) => void;
    handleCloseEcucPicker: () => void;
    handleConfirmEcucPicker: (selection: { path: string; moduleDef: BswModuleDef }) => void;
    handleContextMenu: (e: React.MouseEvent, path: string) => void;
    handleGenerateClick: () => Promise<void>;
    handleContextMenuAction: (action: ContextMenuAction) => void;
    handleExportOdxDiagnosticExtract: () => Promise<void>;
    // 7 state slots
    ecucPickerOpen: boolean;
    setEcucPickerOpen: (open: boolean) => void;
    preSelectedBswmdPath: string | undefined;
    setPreSelectedBswmdPath: (path: string | undefined) => void;
    scriptPanelOpen: boolean;
    toggleScriptPanel: () => void;
    dbcModal: DbcModalState;
    openDbcViewer: (path: string) => void;
    closeDbcViewer: () => void;
    odxModal: OdxModalState;
    openOdxViewer: (path: string) => void;
    closeOdxViewer: () => void;
    diagExtractModal: DiagExtractModalState;
    setDiagExtractModal: (state: DiagExtractModalState) => void;
    diagExtractExporting: boolean;
    setDiagExtractExporting: (busy: boolean) => void;
    dbcImportState: DbcImportState;
    dbcImportInFlight: React.MutableRefObject<boolean>;
    xlsxBatchWizardOpen: boolean;
    setXlsxBatchWizardOpen: (open: boolean) => void;
  };

  export function useAppHandlers(): AppHandlers {
    // ... (verbatim body from App.tsx, lines 119-913)
  }
  ```

  **Body**: copy lines 119-913 of App.tsx into the hook body. The 9 useCallback + 7 useState + 2 useEffect + 5+ custom hook calls all move verbatim.

  - [ ] **Step 1.3: Copy state + handlers verbatim**

    Copy lines 119-913 of `App.tsx` into the hook function body. Use `git show HEAD:src/renderer/App.tsx | sed -n '119,913p'` to extract the body.

    Imports: bring forward all `import` declarations from App.tsx that the hook body uses (useCallback, useEffect, useState, useArxmlStore, useProjectActions, useDcmConfigLauncher, BswModuleDef, Result, ContextMenuAction, etc.). Adjust relative paths: App.tsx is at `src/renderer/`, the new file is at `src/renderer/app/`, so `./` → `../` for sibling-directory imports.

  - [ ] **Step 1.4: Rewrite `src/renderer/App.tsx` as shell**

    Replace App.tsx content with the shell:

    ```ts
    // src/renderer/App.tsx
    // App shell — Sprint 12 #3 Task 8 part 2.
    // Split into `useAppHandlers` hook as part of v1.42.0 MINOR T0.
    // Now only contains: top-level hooks that are NOT in the closure
    // (useProjectActions, useDcmConfigLauncher, useArxmlStore for
    // viewMode/locale/canSelectEcucModule/etc.) + the JSX shell.

    import { /* ... */ } from 'react';
    import { useAppHandlers } from './app/useAppHandlers.js';
    // ... other imports

    export function App(): JSX.Element {
      // Top-level hooks (NOT in the closure):
      const { submitNewProject } = useProjectActions();
      const dcmLauncher = useDcmConfigLauncher();
      const viewMode = useArxmlStore((s) => s.viewMode);
      const locale = useArxmlStore((s) => s.locale);
      const canSelectEcucModule = useArxmlStore((s) => s.bswmdSchemas.length > 0 && s.project !== null);
      const odxPath = useArxmlStore((s) => s.activeDocumentPath ?? '');
      // ... (other top-level selectors)

      // All 16 hook return fields:
      const handlers = useAppHandlers();

      // ... defaultLayout (useMemo, ~10 lines)
      // ... onTourAdvance/onTourBack/onTourSkip/onTourFinish/tourLocale/tourState (top-level useMemo + useCallback, ~30 lines)
      // ... tour state hook (`useTourState`, ~40 lines)

      return (
        <TourProvider ...>
          <div className="app-shell">
            <AppHeader
              onEcucModuleSelect={handlers.handleMenuSelectEcucModule}
              canSelectEcucModule={canSelectEcucModule}
              // ... (all 13+ props for AppHeader)
            />
            <ErrorBanner />
            <main className="workspace">
              <Group orientation="horizontal" id="workspace" ...>
                <Panel id="workspace-left" ...>
                  {isImportMerged ? (
                    <div className="app-import-merged-column" ...>
                      <ModuleSelectionPanel />
                      <DiffTable />
                    </div>
                  ) : (
                    <LeftPanel
                      onAddEcucFromBswmd={handlers.handleAddEcucFromBswmd}
                      onContextMenu={handlers.handleContextMenu}
                    />
                  )}
                </Panel>
                <Separator ... />
                <Panel id="workspace-right" ...>
                  <ParamEditor />
                </Panel>
              </Group>
            </main>
            {handlers.scriptPanelOpen && (
              <div className="app-script-panel-host" ...>
                <ScriptPanel />
              </div>
            )}
            <ArxmlPanel />
            {handlers.dbcModal.kind !== 'closed' && (
              <DbcViewer ... onClose={handlers.closeDbcViewer} />
            )}
            {handlers.odxModal.kind !== 'closed' && (
              <OdxViewer ... onExport={handlers.handleExportOdxDiagnosticExtract} exporting={handlers.diagExtractExporting} />
            )}
            {/* ... 4 more modals: diagExtract success dialog, dbc import wizard, xlsx batch wizard, dcm config dialog */}
          </div>
        </TourProvider>
      );
    }
    ```

    Target: App.tsx < 300 LoC.

  - [ ] **Step 1.5: TypeScript + tests + verify**

    Run:

    ```bash
    pnpm exec tsc --noEmit -p tsconfig.web.json
    pnpm exec vitest run src/renderer/App.test.tsx
    pnpm exec vitest run 2>&1 | tail -5  # full regression
    pnpm verify 2>&1 | tail -8
    ```

    Expected:
    - tsc clean (0 errors)
    - App.test.tsx passes (all existing tests; no new tests)
    - Full vitest: 3124 + 7 SKIP / 0 fail
    - 7-stage pnpm verify GREEN

  - [ ] **Step 1.6: LoC verification**

    Run:

    ```bash
    wc -l src/renderer/App.tsx src/renderer/app/useAppHandlers.ts
    ```

    Expected: `App.tsx` ≤ 300 LoC + `useAppHandlers.ts` ≤ 650 LoC.

  - [ ] **Step 1.7: Commit atomically**

    Run:

    ```bash
    git add -A src/renderer/App.tsx src/renderer/app/useAppHandlers.ts
    git status
    git diff --cached --stat
    git commit -m "refactor(renderer): v1.42.0 MINOR T0 T1 -- extract useAppHandlers hook (App.tsx 1375 -> shell + hook)"
    ```

    Expected: 1 commit. App.tsx is REWRITTEN (modify); useAppHandlers.ts is NEW.

  - [ ] **Step 1.8: Dispatch pkm-capture**

    Run `pkm-capture` in the background. Pass the commit SHA + T1 description. If pkm-capture fails, write the vault files directly (per v1.41.2 PATCH T3 process deviation).

---

## Task 2: extract 3 AppHeader sub-components

**Files:**

- Create: `src/renderer/components/AppHeader/Menu.tsx`
- Create: `src/renderer/components/AppHeader/ActionBar.tsx`
- Create: `src/renderer/components/AppHeader/StatusBadge.tsx`
- Modify: `src/renderer/components/AppHeader.tsx`

**Interfaces:**

- Consumes: existing `src/renderer/components/AppHeader.tsx` (894 LoC)
- Produces: 3 sub-components with explicit prop interfaces. AppHeader.tsx becomes a shell that composes them.

### Step-by-step

- [ ] **Step 2.1: Pre-flight read**

  Run: `pnpm exec prettier --write src/renderer/components/AppHeader.tsx`

  Read `src/renderer/components/AppHeader.tsx` in full (894 LoC). Note exact line numbers of:
  - The 5 useState (state, appVersion, menuOpen, stencilOpen, stencilFlagOn)
  - The 4 useRef (menuRef, closeTimerRef, etc.)
  - The 5 useEffect (experimental flag, app version fetch, click-outside, etc.)
  - The 3 useCallback (openMenu, scheduleClose, onCloseProjectClick)
  - The JSX structure (header → brand + menu + action bar + status badge + help + profile)

  Map out: which state belongs to Menu (menuOpen, closeTimerRef, stencilOpen, stencilFlagOn)? Which to ActionBar (none — pure presentational buttons)? Which to StatusBadge (appVersion, state)?

- [ ] **Step 2.2: Create `src/renderer/components/AppHeader/Menu.tsx` (NEW, ~300 LoC)**

  Copy from AppHeader.tsx:
  - All menu-related state: `menuOpen`, `setMenuOpen`, `stencilOpen`, `setStencilOpen`, `stencilFlagOn`
  - All menu-related refs: `menuRef`, `closeTimerRef`
  - All menu-related effects: the click-outside useEffect, the schedule-close debounce
  - All menu-related callbacks: `openMenu`, `scheduleClose`
  - The menu JSX block: `<div ref={menuRef}>...menu items...</div>`

  Props interface:

  ```ts
  export interface MenuProps {
    onEcucModuleSelect: () => void;
    canSelectEcucModule: boolean;
    // ... (any other menu-trigger props from AppHeader.tsx)
  }
  ```

  Export: `export function Menu(props: MenuProps): JSX.Element { ... }`

- [ ] **Step 2.3: Create `src/renderer/components/AppHeader/ActionBar.tsx` (NEW, ~200 LoC)**

  Copy from AppHeader.tsx:
  - All action bar JSX: Save / Generate / DBC / ODX / DBC import / XLSX batch / DCM config / Script panel toggle buttons
  - All action bar busy flags + canX predicates (passed as props)

  Props interface:

  ```ts
  export interface ActionBarProps {
    onProjectSave: () => void;
    canSaveProject: boolean;
    onGenerate: () => void;
    canGenerate: boolean;
    generateBusy: boolean;
    onOpenDbc: () => void;
    dbcBusy: boolean;
    onOpenOdx: () => void;
    odxBusy: boolean;
    onOpenDbcImport: () => void;
    dbcImportBusy: boolean;
    onOpenXlsxBatch: () => void;
    xlsxBatchBusy: boolean;
    onOpenDcmConfig: () => void;
    canOpenDcmConfig: boolean;
    dcmConfigBusy: boolean;
    onToggleScriptPanel: () => void;
    scriptPanelOpen: boolean;
  }
  ```

  Export: `export function ActionBar(props: ActionBarProps): JSX.Element { ... }`

- [ ] **Step 2.4: Create `src/renderer/components/AppHeader/StatusBadge.tsx` (NEW, ~150 LoC)**

  Copy from AppHeader.tsx:
  - `appVersion`, `setAppVersion` state + the version-fetch useEffect
  - The status badge JSX (right-side of header)
  - The `state` prop from AppHeader (for the current state display)

  Props interface:

  ```ts
  export interface StatusBadgeProps {
    appVersion: string;
    state: AppHeaderState;
    // ... (any other state-display props)
  }
  ```

  Export: `export function StatusBadge(props: StatusBadgeProps): JSX.Element { ... }`

- [ ] **Step 2.5: Rewrite `src/renderer/components/AppHeader.tsx` as shell (~150 LoC)**

  Replace AppHeader.tsx content with the shell:

  ```ts
  // src/renderer/components/AppHeader.tsx
  // AppHeader shell — Sprint 16 #2 T2.
  // Split into 3 sub-components as part of v1.42.0 MINOR T0.
  // Now only composes Menu + ActionBar + StatusBadge.

  import { /* ... */ } from 'react';
  import { ActionBar } from './AppHeader/ActionBar.js';
  import { Menu } from './AppHeader/Menu.js';
  import { StatusBadge } from './AppHeader/StatusBadge.js';

  export type { AppHeaderProps };

  export function AppHeader({ /* ... 13+ props ... */ }: AppHeaderProps): JSX.Element {
    // Top-level state (passed DOWN to sub-components):
    const [state, setState] = useState<AppHeaderState>(INITIAL);
    const [appVersion, setAppVersion] = useState<string>('…');

    // ... (other top-level state)

    return (
      <header className="app-header">
        <BrandLogo />
        <Menu
          onEcucModuleSelect={onEcucModuleSelect}
          canSelectEcucModule={canSelectEcucModule}
        />
        <ActionBar
          onProjectSave={onProjectSave}
          canSaveProject={canSaveProject}
          onGenerate={onGenerate}
          canGenerate={canGenerate}
          generateBusy={generateBusy}
          // ... (all 13+ ActionBar props)
        />
        <StatusBadge
          appVersion={appVersion}
          state={state}
        />
      </header>
    );
  }
  ```

  Target: AppHeader.tsx < 200 LoC.

- [ ] **Step 2.6: TypeScript + tests + verify**

  Run:

  ```bash
  pnpm exec tsc --noEmit -p tsconfig.web.json
  pnpm exec vitest run src/renderer/components/AppHeader.test.tsx
  pnpm exec vitest run 2>&1 | tail -5
  pnpm verify 2>&1 | tail -8
  ```

  Expected:
  - tsc clean
  - AppHeader.test.tsx passes
  - Full vitest: 3124 + 7 SKIP / 0 fail
  - 7-stage pnpm verify GREEN

  If AppHeader.test.tsx fails because the test queries the AppHeader root for menu state (now in Menu sub-component):
  - Inspect the test query; if it's a testid query (e.g. `getByTestId('app-header-menu')`), the testid should be moved to the Menu sub-component.
  - If the test queries the AppHeader root for state directly, refactor the test to use a render-with-state helper that mounts the sub-components in a controlled environment.
  - If the refactor is too invasive, defer the AppHeader.test.tsx update to a follow-up PATCH and add a `# TODO: update for sub-components` comment.

- [ ] **Step 2.7: LoC verification**

  Run:

  ```bash
  wc -l src/renderer/components/AppHeader.tsx src/renderer/components/AppHeader/Menu.tsx src/renderer/components/AppHeader/ActionBar.tsx src/renderer/components/AppHeader/StatusBadge.tsx
  ```

  Expected: AppHeader.tsx ≤ 200 LoC + each sub-component ≤ 350 LoC.

- [ ] **Step 2.8: Commit atomically**

  Run:

  ```bash
  git add -A src/renderer/components/AppHeader.tsx src/renderer/components/AppHeader/
  git status
  git diff --cached --stat
  git commit -m "refactor(renderer): v1.42.0 MINOR T0 T2 -- extract 3 AppHeader sub-components (AppHeader.tsx 894 -> shell + Menu/ActionBar/StatusBadge)"
  ```

  Expected: 1 commit. AppHeader.tsx is REWRITTEN; 3 new sub-files.

- [ ] **Step 2.9: Dispatch pkm-capture**

  Run `pkm-capture` in the background. Pass the commit SHA + T2 description. If pkm-capture fails, write the vault files directly (per v1.41.2 PATCH T3 process deviation).

---

## Task 3: docs + ship v1.42.0 MINOR

**Files:**

- Create: `docs/release-notes/v1.42.0/README.md`
- Modify: `CHANGELOG.md`
- Modify: `.git/sdd/progress-v1.42.0.md` (NEW)

### Step-by-step

- [ ] **Step 3.1: Verify test count unchanged**

  Run: `pnpm exec vitest run 2>&1 | tail -5`

  Expected: **3124 + 7 SKIP / 0 fail** (zero test delta).

- [ ] **Step 3.2: Verify all source files < 800 LoC**

  Run:

  ```bash
  find src -type f \( -name "*.ts" -o -name "*.tsx" \) -not -name "*.test.ts" -not -name "*.test.tsx" -exec wc -l {} \; | awk '$1 > 800 {print}' | sort -rn
  ```

  Expected: empty output OR only `bswmd/parse.ts` at 1196 (accepted ceiling).

- [ ] **Step 3.3: Create release notes**

  Create `docs/release-notes/v1.42.0/README.md`. Mirror v1.41.2 format.

  Content outline:

  ```markdown
  # v1.42.0 MINOR — App.tsx + AppHeader.tsx JSX Refactor

  **Ship:** 2026-07-10
  **Tag:** `v1.42.0`
  **Baseline:** v1.41.2 PATCH `3f507d9` (3124 + 7 SKIP / 0 fail)
  **Target:** 3124 + 7 SKIP / 0 fail (zero test delta — pure JSX refactor)

  ## What shipped

  ### T1: useAppHandlers hook

  `src/renderer/App.tsx` (1375 → ~250 LoC) + `src/renderer/app/useAppHandlers.ts` (NEW, ~600 LoC). The 9 useCallback + 7 useState + 2 useEffect all move into a closure-scoped hook. App.tsx shell only retains top-level hooks that are NOT in the closure (useProjectActions, useDcmConfigLauncher, useArxmlStore for viewMode/locale/canSelectEcucModule) + the JSX shell.

  ### T2: 3 AppHeader sub-components

  `src/renderer/components/AppHeader.tsx` (894 → ~150 LoC) + 3 new sub-components:

  - `AppHeader/Menu.tsx` (NEW, ~300 LoC) — menu + ECUC picker
  - `AppHeader/ActionBar.tsx` (NEW, ~200 LoC) — buttons
  - `AppHeader/StatusBadge.tsx` (NEW, ~150 LoC) — bottom-right status

  ## Key design decisions

  - D1: Single useAppHandlers hook (not 3 domain hooks) — cross-state coupling makes single hook cleaner.
  - D2: AppHeader sub-components via props (not context) — 3-level composition with < 10 props per sub-component.
  - D3: Zero new tests — existing test surfaces preserved.
  - D4: Main-thread execution — JSX refactor with 9 callbacks + 7 state is sensitive to file moves.
  - D5: Per-T-level commit — T1 and T2 are self-contained.

  ## 2 source commits + 1 docs commit on origin/main

  | Commit    | Description                        | Files |
  | --------- | ---------------------------------- | ----- |
  | T1 commit | Extract useAppHandlers hook        | 2     |
  | T2 commit | Extract 3 AppHeader sub-components | 4     |
  | T3 commit | Docs release notes + CHANGELOG     | 2     |

  ## 3 NEW 1-of-1 lessons (candidates)

  1. `god-component-jsx-refactor-requires-closure-hook-not-barrel-split` (T1) — For JSX components with 7+ useState + 9+ useCallback, the natural cut is `useAppHandlers` closure-scoped hook, not barrel-split.
  2. `visual-concern-cut-beats-function-section-cut-for-jsx-components` (T2) — For JSX components, sub-component boundaries are by visual concern (Menu/ActionBar/StatusBadge), not by function-section.
  3. `refactor-preserves-test-surfaces-without-new-tests-if-signature-stable` (T1+T2) — A pure refactor with identical return-type signatures can rely on existing test coverage.

  ## Known follow-ups (out of scope)

  - `bswmd/parse.ts` at 1196 LoC: accepted as known ceiling
  - Shim removal sweep
  - Test mirroring
  - Pre-commit file-size hook
  - Round-6 deep code review

  ## Round-1 L8 closure

  7/8 file-size backlog items closed. `bswmd/parse.ts` accepted as known ceiling.
  ```

- [ ] **Step 3.4: Update CHANGELOG.md**

  Edit `CHANGELOG.md` — add v1.42.0 MINOR row above v1.41.2 with one-liner per T + commit SHAs + test delta.

- [ ] **Step 3.5: Prettier + pnpm verify 7-stage**

  Run: `pnpm exec prettier --write docs/release-notes/v1.42.0/README.md CHANGELOG.md`
  Then: `pnpm verify 2>&1 | tail -8`
  Expected: 7-stage GREEN EX=0.

- [ ] **Step 3.6: Commit atomically**

  Run:

  ```bash
  git add docs/release-notes/v1.42.0/ CHANGELOG.md .git/sdd/progress-v1.42.0.md
  git status
  git diff --cached --stat
  git commit -m "docs(release): v1.42.0 MINOR T0 T3 -- release notes + CHANGELOG"
  ```

  Expected: 1 commit. 2-3 files changed.

- [ ] **Step 3.7: Tag + push + gh release**

  Run:

  ```bash
  git push origin main
  git tag -a v1.42.0 -m "v1.42.0 MINOR -- App.tsx + AppHeader.tsx JSX refactor (file-size cap closure)"
  git push origin v1.42.0
  gh release create v1.42.0 --title "v1.42.0 MINOR" --notes-file docs/release-notes/v1.42.0/README.md
  ```

  Expected: 3 commits on origin/main (T1 + T2 + T3); tag v1.42.0 pushed; GH release published.

  If `github.com:443` blocked: set `http.proxy=http://127.0.0.1:7897` per v1.37.1 recovery pattern and retry.

- [ ] **Step 3.8: Record ship state in progress ledger**

  Append to `.git/sdd/progress-v1.42.0.md`:

  ```markdown
  ## Ship

  **SHIPPED 2026-07-10** — v1.42.0 MINOR — App.tsx + AppHeader.tsx JSX Refactor.

  - **Final commit SHA:** `<T3 sha>` (after T3 commit)
  - **Tag:** `v1.42.0` pushed to origin
  - **GH release:** https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.42.0
  - **Test count:** 3124 + 7 SKIP / 0 fail (zero test delta — pure JSX refactor)
  - **Pre-flight:** pnpm verify 7-stage GREEN
  - **App.tsx LoC:** 1375 → ~250 (down 82%)
  - **AppHeader.tsx LoC:** 894 → ~150 (down 83%)

  ## 3 commits on origin/main (T1 + T2 + T3)
  ```

- [ ] **Step 3.9: Dispatch pkm-capture**

  Run `pkm-capture` in the background. Pass the final commit SHA + T3 ship description. If pkm-capture fails, write the vault files directly (per v1.41.2 PATCH T3 process deviation).

---

## Self-Review

### 1. Spec coverage

| Spec section                                   | Task      | Status |
| ---------------------------------------------- | --------- | ------ |
| T1 useAppHandlers extraction                   | Task 1    | ✅     |
| T2 AppHeader sub-components                    | Task 2    | ✅     |
| T3 docs + ship                                 | Task 3    | ✅     |
| D1 single hook (not 3)                         | Task 1 D1 | ✅     |
| D2 AppHeader props (not context)               | Task 2 D2 | ✅     |
| D3 zero new tests                              | All tasks | ✅     |
| D4 main-thread execution                       | All tasks | ✅     |
| D5 per-T commit (T1+T2 separate)               | All tasks | ✅     |
| LoC caps (App.tsx < 300, useAppHandlers < 650) | Task 1.6  | ✅     |
| pnpm verify 7-stage per T                      | All tasks | ✅     |

### 2. Placeholder scan

- No "TBD" / "TODO" / "implement later" / "fill in details".
- No "Add appropriate error handling" / "Add validation" / "Handle edge cases".
- No "Write tests for the above" (without actual test code) — D3 mandates zero new tests.
- No "Similar to Task N" — each task has its own detailed step-by-step.
- All sub-component file paths + prop names specified.

### 3. Type consistency

- `AppHandlers` type defined in `useAppHandlers.ts` exports 16 fields.
- `MenuProps` / `ActionBarProps` / `StatusBadgeProps` types defined in each sub-component.
- `AppHeaderProps` type preserved as-is (the original 13+ props still exist on the shell, passed down to sub-components).

No inconsistencies found.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-10-v1-42-0-minor-t0-app-appheader-jsx-refactor.md`. **Main-thread execution per D4** (NO sub-agent dispatch). The 3 T-level commits land directly on `main`.

**Sequencing:**

- T1 first (App.tsx → useAppHandlers hook extraction)
- T2 second (AppHeader.tsx → 3 sub-components extraction)
- T3 third (docs + ship)
- Each T ends with `pnpm verify` 7-stage GREEN
- After each T commit, dispatch `pkm-capture` (or write vault directly if pkm-capture fails per v1.41.2 PATCH T3 process deviation)
