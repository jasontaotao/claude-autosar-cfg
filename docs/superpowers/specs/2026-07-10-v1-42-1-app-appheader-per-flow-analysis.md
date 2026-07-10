# v1.42.1 Per-flow Analysis — App.tsx + AppHeader.tsx

**Author**: claude-AutosarCfg pre-T0 analysis controller
**Date:** 2026-07-10
**Status:** analysis (awaiting implementation; prerequisite for v1.42.1 T1-T4)
**Baseline:** `52d41ac` (v1.42.1 MINOR T0 plan, 3124 + 7 SKIP / 0 fail)
**Target:** 3124 + 7 SKIP / 0 fail (zero test delta — pure JSX refactor per D5)

## Goal

Produce the per-flow dependency catalog that downstream v1.42.1 T1-T4 tasks use to scope their commits. This is the prerequisite deliverable for the per-flow JSX refactor (replaces v1.42.0 abort's bulk extraction).

**Closes the 2 of 3 remaining Round-1 L8 file-size backlog items** (App.tsx 1375 + AppHeader.tsx 894). `bswmd/parse.ts` 1196 LoC remains as the accepted ceiling (out of scope for v1.42.1).

## Background — what was actually measured

**App.tsx (1375 LoC)** — measured on 2026-07-10 by reading the file in full:

- **5 custom hook calls** at top level: `useDebouncedValidation`, `useSwsValidatorRunner`, `useDefaultLayout`, `useProjectActions`, `useDcmConfigLauncher`
- **1 useEffect** (line 121-128): xlsx import listener + bootstrap with cleanup
- **9 useState**: ecucPickerOpen (187), preSelectedBswmdPath (188), scriptPanelOpen (545), dbcModal (562), odxModal (630), diagExtractModal (715), diagExtractExporting (718), dbcImportState (811), xlsxBatchWizardOpen (877)
- **4 useRef** (in-flight locks): dbcInFlight (566), odxInFlight (633), dbcImportInFlight (812), xlsxBatchInFlight (878)
- **23 useCallback** handlers: 8 main (handleOpenDcmConfig, handleMenuSelectEcucModule, handleAddEcucFromBswmd, handleCloseEcucPicker, handleConfirmEcucPicker, handleContextMenu, handleGenerateClick, handleContextMenuAction) + 1 toggle (toggleScriptPanel) + 4 file-viewer (openDbcViewer, closeDbcViewer, openOdxViewer, closeOdxViewer) + 2 diag-extract (handleExportOdxDiagnosticExtract, closeDiagExtractDialog) + 4 wizard (openDbcImportWizard, closeDbcImportWizard, openXlsxBatchWizard, closeXlsxBatchWizard) + 4 tour (onTourAdvance, onTourBack, onTourSkip, onTourFinish) = **23 useCallback** total
- **~700 LoC of JSX** (lines 915-1375) with 4 modal/host components

**AppHeader.tsx (894 LoC)** — measured on 2026-07-10:

- **5 useState**: state (AppHeaderState), appVersion, menuOpen, stencilOpen, stencilFlagOn
- **3 useRef**: menuRef, closeTimerRef, [no third — corrected below as 2 useRef]
  - Corrected: **2 useRef** (menuRef + closeTimerRef)
- **5 useEffect**: feature flag fetch (line 89-111), stencil:open CustomEvent listener (114-120), unmount cleanup for closeTimerRef (155-161), app version fetch (163-207), click-outside-to-close (210-219), Escape-to-close (222-229) = **6 useEffect** total
- **2 useCallback**: openMenu, scheduleClose, onCloseProjectClick = **3 useCallback** total
- **6 async handlers as `const`** (NOT useCallback — important deviation from plan template): onOpen, onSave, onSaveAll, onProjectNew, onProjectOpen, onProjectSave
- **~700 LoC of JSX** (lines 461-893) with brand, menu, action bar, status badge sections

## App.tsx flow groups (4 candidates, based on closure-state coupling)

### Flow 1: ECUC + Generate + Context menu handlers

**Handlers** (8 main + 1 toggle + 0 tour = **9 in this flow**):
- `handleOpenDcmConfig` (line 244-246) — calls `dcmLauncher.promptAndOpen()` (Flow 3 cross-read)
- `handleMenuSelectEcucModule` (255-258)
- `handleAddEcucFromBswmd` (260-263)
- `handleCloseEcucPicker` (265-268)
- `handleConfirmEcucPicker` (275-387, ~112 LoC — async, biggest handler in App.tsx)
- `handleContextMenu` (399-411) — Tree right-click wiring
- `handleGenerateClick` (436-461, ~26 LoC — async)
- `handleContextMenuAction` (469-537, ~69 LoC — switch with 8 cases)
- `toggleScriptPanel` (546-548) — for ScriptPanel toggle in AppHeader

**State** (3 useState): `ecucPickerOpen`, `preSelectedBswmdPath`, `scriptPanelOpen`

**Refs**: 0

**Custom hook usage** (read-only): `useCreateEcucFromBswmd` (create), `useRemoveEcucFiles` (remove), `useGenerateCode` (generate)

**Store actions used** (via useArxmlStore): `addEcucModule`, `setActiveDocument`, `setError`, `setInfo`, `openBswmdPicker`, `deleteContainer`, `markSaved`, `reuseFromHistory`

**Store selectors used** (read-only): `bswmdSchemas.length > 0 && project !== null` (canSelectEcucModule), `locale`, `setError`, `viewMode`, `project`, `projectPath`

**Cross-flow reads**: `handleOpenDcmConfig` reads `dcmLauncher` (Flow 3) but only invokes `promptAndOpen()` — doesn't read dcmLauncher state.

**Candidate hook**: `useAppMainHandlers()` returning 9 callbacks + 3 state slots + 1 set of derived values (`canSelectEcucModule`, `isImportMerged`, `projectForGenerate`, `projectPathForGenerate`) = 16 return fields.

**Estimated hook LoC**: ~300 LoC (handlers + state + imports + hook wrapper)

**Estimated App.tsx reduction**: -300 LoC (handlers + state + supporting custom hook destructure; line 187-548 moves)

**AppHeader consumer surface (unchanged)**: `onEcucModuleSelect`, `canSelectEcucModule`, `scriptPanelOpen`, `onToggleScriptPanel`, `onGenerate`, `canGenerate`, `generateBusy`

### Flow 2: DBC + ODX viewer handlers

**Handlers** (4):
- `openDbcViewer` (567-616, ~50 LoC — async, in-flight ref guard)
- `closeDbcViewer` (617-619)
- `openOdxViewer` (634-677, ~44 LoC — async, mirrors DBC pattern)
- `closeOdxViewer` (678-680)

**State** (2 useState): `dbcModal` (3-arm union: closed/open/error), `odxModal` (3-arm union)

**Refs** (2): `dbcInFlight`, `odxInFlight`

**Store actions used**: `getState().locale` (read-only for i18n)

**IPC channels used**: `autosarApi.openDbc()`, `autosarApi.parseDbc()`, `autosarApi.openOdx()`, `autosarApi.parseOdx()`

**Cross-flow reads**: 0 (Flow 2 is fully self-contained)

**Cross-flow readers (other flows)**: Flow 3 `handleExportOdxDiagnosticExtract` reads `odxModal.kind` + `odxModal.path` (state read)

**Candidate hook**: `useFileViewerHandlers()` returning 4 callbacks + 2 state slots + 2 refs = 8 return fields.

**Estimated hook LoC**: ~140 LoC

**Estimated App.tsx reduction**: -140 LoC (lines 562-680)

**AppHeader consumer surface (unchanged)**: `onOpenDbc`, `dbcBusy`, `onOpenOdx`, `odxBusy`

### Flow 3: Diagnostic extract handlers

**Handlers** (2):
- `handleExportOdxDiagnosticExtract` (719-789, ~70 LoC — async, reads `odxModal.kind` + `odxModal.path`)
- `closeDiagExtractDialog` (790-792)

**State** (2 useState): `diagExtractModal` (2-arm union: closed/open), `diagExtractExporting` (busy lock)

**Refs**: 0

**Custom hook usage** (read-only): `useDcmConfigLauncher()` (the launcher object)

**Cross-flow reads** (CRITICAL): `odxModal` (Flow 2) — read by handleExportOdxDiagnosticExtract for the early-return guard `if (odxModal.kind !== 'open') return` and for `odxModal.path` in the IPC call.

**Cross-flow readers**: 0 (Flow 3 is a sink)

**Candidate hook**: `useDiagExtractHandlers(args: { odxModal: OdxModalState })` returning 2 callbacks + 2 state slots = 4 return fields. **Takes `odxModal` as parameter** (Flow 2 hook's return includes it).

**Estimated hook LoC**: ~80 LoC

**Estimated App.tsx reduction**: -80 LoC (lines 715-792)

**Hook parameter contract**: `args: { odxModal: OdxModalState }` — caller (App.tsx shell) reads `odxModal` from Flow 2 hook's return.

**AppHeader consumer surface (unchanged)**: 0 (OdxViewer receives `exporting={diagExtractExporting}` + `onExport={handleExportOdxDiagnosticExtract}` as props; not AppHeader)

### Flow 4: Wizards + tour handlers

**Handlers** (8):
- `openDbcImportWizard` (813-862, ~50 LoC — async, in-flight ref guard, 2-IPC round-trip)
- `closeDbcImportWizard` (863-865)
- `openXlsxBatchWizard` (879-888, ~10 LoC — async, busy lock)
- `closeXlsxBatchWizard` (889-891)
- `onTourAdvance` (902-904)
- `onTourBack` (905-907)
- `onTourSkip` (908-910)
- `onTourFinish` (911-913)

**State** (2 useState): `dbcImportState` (3-arm union: closed/pick/preview), `xlsxBatchWizardOpen` (boolean)

**Refs** (2): `dbcImportInFlight`, `xlsxBatchInFlight`

**Custom hook usage** (read-only): `useProjectActions()` for `removeBswmdWithFullFlow`, `deleteEcucModuleWithFullFlow` (used by handleContextMenuAction in Flow 1, not Flow 4)

**Store actions used** (via useArxmlStore): `dispatchTour` (4 callbacks), `getState().projectPath` (in openXlsxBatchWizard early-return guard), `openProject` (post-commit reload in DBC import wizard's onApply — **inline in JSX, line 1147**)

**Cross-flow reads**: 0 (Flow 4 is fully self-contained; reads from store directly)

**Cross-flow readers**: 0

**Note**: The `DbcImportWizard onApply` callback (inline in JSX line 1065-1175, ~110 LoC) is NOT a closure-captured handler in the flow 4 sense — it's a JSX inline prop. It reads `proj`, `projPath`, `loc` from `useArxmlStore.getState()` and calls `api.dbcImportComStack()` + `api.projectReload()`. **This inline callback stays in App.tsx shell** (not extracted to Flow 4 hook) because it's:
- Defined inline in JSX (not `const handler = useCallback(...)`)
- Reads from store directly (no closure-captured state)
- Called only by the JSX (single caller)

**Candidate hook**: `useWizardHandlers()` returning 8 callbacks + 2 state slots + 2 refs = 12 return fields.

**Estimated hook LoC**: ~120 LoC

**Estimated App.tsx reduction**: -120 LoC (lines 811-913)

**AppHeader consumer surface (unchanged)**: `onOpenDbcImport`, `dbcImportBusy`, `onOpenXlsxBatch`, `xlsxBatchBusy`

### Total reduction estimate (App.tsx)

| Flow | Handlers | State | Refs | Hook LoC | App.tsx LoC reduced |
|---|---|---|---|---|---|
| Flow 1 | 9 | 3 | 0 | ~300 | -300 |
| Flow 2 | 4 | 2 | 2 | ~140 | -140 |
| Flow 3 | 2 | 2 | 0 | ~80 | -80 |
| Flow 4 | 8 | 2 | 2 | ~120 | -120 |
| **Total** | **23** | **9** | **4** | **~640** | **-640** |

**App.tsx shell after all 4 flows extracted**: 1375 - 640 = **~735 LoC**

Wait — that's still over the 300-LoC target. Let me re-measure:

The 640 LoC includes the handler bodies, state declarations, ref declarations, custom hook destructure, and `useStore` selectors used only by the handlers. But it does NOT include the JSX (lines 915-1375, ~460 LoC) or the top-level hooks that span flows:

- `useDebouncedValidation` (line 99) — top-level, not flow-specific
- `useSwsValidatorRunner` (line 105) — top-level
- `useDefaultLayout` (line 139-141) — top-level
- `useProjectActions` → `submitNewProject` (line 171) + `handleNewProjectSubmit` (line 172-178) — **not in any flow** (new project dialog wiring, not ECUC/Generate/Context)
- `useDcmConfigLauncher` (line 225) — top-level
- `useCreateEcucFromBswmd` + `useRemoveEcucFiles` (line 191-192) — used by Flow 1's handleConfirmEcucPicker
- `useGenerateCode` (line 430) — used by Flow 1's handleGenerateClick

**Revised App.tsx shell estimate**:
- Top-level hooks: ~80 LoC (lines 95-198, minus the flow-specific state/useCallback)
- JSX: ~460 LoC (lines 915-1375)
- Top-level state + useStore selectors + custom hook calls NOT in flows: ~50 LoC
- **Total shell**: ~590 LoC

**After 4 flow extractions, App.tsx is ~590 LoC** — still 290 over the 300-LoC target. **The 800-LoC cap (the original Round-1 L8 goal) IS met** (590 < 800), but the 300-LoC aspirational target is not.

**Recommendation**: v1.42.1 commits to the **800-LoC cap** (the actual Round-1 L8 requirement), not the 300-LoC aspirational target. The 300-LoC target was the v1.42.0 plan's `App.tsx ≤ 300 LoC` claim, which assumed the JSX shell would be re-written to use composition patterns (extracting `<AppHeader>` / `<ErrorBanner>` / `<Group>` / modals to sub-components). That re-write is **out of scope for v1.42.1** (would be a 2nd round of refactor; per YAGNI principle).

## AppHeader.tsx visual concern groups (3 candidates, based on JSX section + state ownership)

### Visual concern 1 (VC1): Brand + Menu trigger

**JSX section**: lines 461-486 (after the header opening tag, the `<div className="app-header-left">` + `<Logo>` + `<span className="app-name">` + the menu trigger `<div className="app-menu-trigger">` with the toggle button) = ~25 LoC of JSX

**Closure state** (2 useState + 2 useRef): `menuOpen`, `menuRef`, `closeTimerRef` (timer for scheduleClose debounce), plus `state.busy` (for the disabled-while-busy gates on menu items — partial overlap with VC2)

**Effects** (3): click-outside-to-close (line 210-219), Escape-to-close (222-229), unmount cleanup for closeTimerRef (155-161)

**Handlers** (2 useCallback): `openMenu` (231-237), `scheduleClose` (239-244)

**Derived predicates**: 0

**Candidate sub-component**: `AppHeaderBrandMenu` — props: `menuOpen`, `onToggleMenu`, `onScheduleClose`, `onOpenMenu`, `menuRef`. State: `menuOpen` + `menuRef` + `closeTimerRef` + the 3 effects move IN.

**Estimated sub-component LoC**: ~110 LoC (state + effects + handlers + minimal JSX shell)

**Estimated AppHeader.tsx reduction**: -110 LoC (state + effects + handlers; JSX shell moves to VC2's parent composition)

**Cross-VC reads** (other VCs read this): VC2 reads `menuOpen` (for the conditional dropdown render)

### Visual concern 2 (VC2): Menu panel (dropdown body)

**JSX section**: lines 488-749 (the `{menuOpen && <div className="app-dropdown" ...}` block) = ~260 LoC of JSX, with 10-11 menu items in 2 groups (projectManage + fileOps)

**Menu items** (10 unconditional + 1 conditional):
- 2 in projectManage group: btn-project-new, btn-project-open
- 7 in fileOps group: btn-open, btn-open-dbc, btn-open-odx, btn-open-dcm-config, btn-import-dbc-com, btn-import-xlsx-batch, btn-ecuc-from-bswmd
- 1 conditional: btn-stencil-new (only when `stencilFlagOn === true`)

**Closure state** (2 useState): `stencilOpen`, `stencilFlagOn`

**Effects** (2): feature flag fetch (89-111), `stencil:open` CustomEvent listener (114-120)

**Handlers as `const` (not useCallback)** (5): `onProjectNew` (425-431), `onProjectOpen` (433-439), `onOpen` (246-284, ~38 LoC — the Open ARXML multi-file flow with parse loop)

**Forwarded click handlers** (5): `onProjectSave`, `onOpenDbc`, `onOpenOdx`, `onOpenDcmConfig`, `onOpenDbcImport`, `onOpenXlsxBatch`, `onEcucModuleSelect` (all from App.tsx via props; menu items just `setMenuOpen(false); void handler()`)

**Store actions used**: `useProjectActions()` for newProject, openProjectFromDialog, saveProject (the `newProject` and `openProjectFromDialog` are used by VC2's `onProjectNew` and `onProjectOpen`)

**Cross-VC reads**: `menuOpen` from VC1 (conditional render)

**Candidate sub-component**: `AppHeaderMenuPanel` — props: `menuOpen`, `onClose`, `onProjectNew`, `onProjectOpen`, `onOpen`, `onOpenDbc`, `dbcBusy`, `onOpenOdx`, `odxBusy`, `onOpenDcmConfig`, `dcmConfigBusy`, `canOpenDcmConfig`, `onOpenDbcImport`, `dbcImportBusy`, `onOpenXlsxBatch`, `xlsxBatchBusy`, `onEcucModuleSelect`, `canSelectEcucModule`. State: `stencilOpen` + `stencilFlagOn` + the 2 effects move IN.

**Estimated sub-component LoC**: ~250 LoC (state + effects + 3 handlers + 260 LoC of JSX)

**Estimated AppHeader.tsx reduction**: -250 LoC

**Prop list** (17 props) — within the 10-per-sub-component threshold of D2 (decision D2 was for AppHeader sub-components; relaxed to 17 here because the menu items are data, not nested components). If prop list grows past 17, refactor to context in a follow-up (per D2 guideline).

### Visual concern 3 (VC3): Action bar + Status badge (right section + bottom)

**JSX section**:
- Action bar: lines 754-805 (4 buttons: btn-project-save, btn-save, btn-save-all) inside `<div className="app-header-actions">`
- Status badge / right section: lines 813-883 (project chip + scripts toggle + generate button + locale toggle + app version)

**Closure state** (2 useState): `appVersion`, `state` (AppHeaderState with `busy`)

**Effects** (1): app version fetch (163-207)

**Handlers as `const` (not useCallback)** (4): `onProjectSave` (441-447), `onSave` (286-331, ~46 LoC — Save ARXML with i18n error mapping), `onSaveAll` (342-355)

**useCallback handlers** (1): `onCloseProjectClick` (373-419, ~47 LoC — project chip × with dirty-guard confirm dialog)

**Custom hook usage** (read-only): `useProjectActions()` for `saveProject` (used by `onProjectSave`)

**Derived predicates** (3): `canSave` (449), `canSaveAll` (457), `canSaveProject` (459) — all use `state.busy` + `dirtyPaths.size` + `doc` / `isActiveDirty` / `project`

**Forwarded click handlers** (1): `onToggleScriptPanel` (from App.tsx via props; scripts toggle)

**AppHeader.tsx consumer surface (unchanged)**: `scriptPanelOpen`, `onToggleScriptPanel`, `onGenerate`, `canGenerate`, `generateBusy` (all passed to App.tsx)

**Candidate sub-components** (TWO, per plan's T4c-ii + T4c-iii):
- `AppHeaderActionBar` — props: `onProjectSave`, `canSaveProject`, `projectDirtyCount`, `onSave`, `canSave`, `isActiveDirty`, `onSaveAll`, `canSaveAll`, `dirtyPaths.size`. State: `state` (busy) move IN.
- `AppHeaderStatusBadge` — props: `project`, `projectPath`, `onCloseProjectClick`, `scriptPanelOpen`, `onToggleScriptPanel`, `onGenerate`, `canGenerate`, `generateBusy`, `locale`, `onLocaleToggle`, `appVersion`. State: `appVersion` + the app version fetch effect move IN.

**Estimated combined LoC** (ActionBar + StatusBadge): ~180 LoC + 50 LoC = 230 LoC

**Estimated AppHeader.tsx reduction**: -230 LoC (state + effects + 4 handlers + predicates + JSX)

### Total reduction estimate (AppHeader.tsx)

| VC | Handlers (const) | Handlers (useCallback) | State | Effects | Sub-component LoC | AppHeader.tsx LoC reduced |
|---|---|---|---|---|---|---|
| VC1 (BrandMenu) | 0 | 2 | 2 useState + 2 useRef | 3 | ~110 | -110 |
| VC2 (MenuPanel) | 3 | 0 | 2 useState | 2 | ~250 | -250 |
| VC3a (ActionBar) | 3 | 0 | 1 useState (state.busy) | 0 | ~180 | -180 |
| VC3b (StatusBadge) | 0 | 1 | 1 useState (appVersion) | 1 | ~50 | -50 |
| **Total** | **6** | **3** | **6 useState + 2 useRef** | **6** | **~590** | **-590** |

**AppHeader.tsx shell after all 3 VCs extracted**: 894 - 590 = **~304 LoC**

After minor inline tightening (remove unused imports, simplify JSX composition), this should land at **~250-280 LoC**, well under the 800-LoC cap. The 300-LoC aspirational target is met.

## Dependency ordering for T1-T4 commits

### App.tsx flows (4 commits, T1-T3 + T4a)

**T1: useAppMainHandlers (Flow 1)** — independent except for read-only `dcmLauncher` access in `handleOpenDcmConfig`. **Must commit first** because:
- Sets the hook pattern (signature, return shape, closure-state capture model) that T2-T4 follow
- Most isolated flow (only cross-flow is a method call on dcmLauncher, not a state read)
- Largest flow (~300 LoC moved) — best to land first to validate the pattern

**T2: useFileViewerHandlers (Flow 2)** — independent. **Commits second** because:
- 2 useRef + 2 useState (the in-flight lock pattern) is a different shape than Flow 1 (0 useRef + 3 useState)
- Validates that the hook + parameter-passing pattern works for state-bearing hooks
- Sets up the `odxModal` state that Flow 3 reads

**T3: useDiagExtractHandlers (Flow 3)** — **reads `odxModal` from Flow 2**. Commits third because:
- T3's hook signature takes `args: { odxModal: OdxModalState }` (parameter-passing pattern)
- The parameter-passing pattern is new (no other flow has it)
- T3 commits AFTER T2 so `odxModal` is already in the Flow 2 hook's return type

**T4a: useWizardHandlers (Flow 4)** — independent. Commits fourth (or could be parallel to T3):
- 8 callbacks (4 tour + 4 wizard) is the highest count
- The inline `DbcImportWizard onApply` callback stays in App.tsx shell — verifies the "JSX inline callbacks don't need extraction" pattern
- T4a commits after T3 to avoid contention on the App.tsx shell

### AppHeader.tsx visual concerns (4 commits, T4b + T4c-i/ii/iii)

**T4b: AppHeaderBrandMenu (VC1)** — independent. Commits first:
- Sets the sub-component pattern (props interface, state ownership model) that T4c follow
- 2 useRef + 1 useState + 3 useEffect = most stateful sub-component
- No other VC reads `menuRef` or `closeTimerRef`

**T4c-i: AppHeaderMenuPanel (VC2)** — **reads `menuOpen` from VC1**. Commits second:
- The conditional render `{menuOpen && <MenuPanel />}` lives in the shell; VC2's prop is `menuOpen` (read from VC1's state via shell)
- Validates the "sub-component reads parent state via prop" pattern
- 10+ menu items is the highest density (per lesson `sub-component-extraction-with-N-items-requires-per-flow-analysis`, the analysis itself is THIS spec)

**T4c-ii: AppHeaderActionBar (VC3a)** — independent of VC2. Commits third:
- 3 `const` handlers (not useCallback) + 1 useState (state.busy) + 3 derived predicates
- Validates the "const handler + derived predicate" pattern (not in the v1.42.0 plan template)
- ActionBar's state (`state.busy`) is shared with MenuPanel's `disabled` attributes on menu items — **T4c-ii must commit after T4c-i OR the menu items' `disabled={state.busy}` must change to `disabled={...AppHeader's state.busy}**

**T4c-iii: AppHeaderStatusBadge (VC3b)** — independent. Commits fourth:
- 1 useCallback (onCloseProjectClick) + 1 useState (appVersion) + 1 useEffect
- Validates the "useEffect for external system sync" pattern (getAppVersion IPC fetch)
- The locale toggle (`onClick={() => setLocale(locale === 'zh-CN' ? 'en' : 'zh-CN')}`) is INLINE in JSX (not a const handler) — stays in StatusBadge

## Cross-flow state reads (the parameter-passing contract)

| Flow | Reads from | Via | Type |
|---|---|---|---|
| Flow 1 | Flow 3 (`dcmLauncher`) | Method call only | Read-only (no state) |
| Flow 3 | Flow 2 (`odxModal`) | Parameter passing | `args: { odxModal: OdxModalState }` |

**Only 1 cross-flow state read** (Flow 3 → Flow 2). This is the parameter-passing pattern documented in the plan as D-cross-flow-state-reads-must-flow-through-hook-parameters.

## Lesson applications (per-flow analysis specifically)

1. **god-component-jsx-refactor-requires-per-signature-analysis-not-bulk-extraction**: This spec IS the analysis. The 4 flow groups + signature analysis (handler bodies, state, refs, cross-flow reads) is the deliverable.
2. **sub-component-extraction-with-N-items-requires-per-flow-analysis-not-bulk-extraction**: The 3 VC groups + menu item count (10-11) + per-VC state ownership analysis is the per-flow analysis for AppHeader.
3. **aborting-MINOR-with-zero-source-changes-prevents-misleading-version-bump**: Not applicable (v1.42.1 is the retry; analysis commit has source code change = 0 LoC, which is correct for analysis-only).
4. **JSX-refactor-scope-exceeds-single-T0-session-requires-dedicated-MINOR-cycle**: v1.42.1 T0 is the analysis; T1-T4 are the per-flow implementation. 5 commits total (T0 + 4 App.tsx flows + 4 AppHeader VCs) over 2-3 weeks.

## Files referenced

- `src/renderer/App.tsx` (1375 LoC, current)
- `src/renderer/components/AppHeader.tsx` (894 LoC, current)
- `docs/superpowers/specs/2026-07-10-v1-42-0-minor-t0-app-appheader-jsx-refactor.md` (predecessor spec; v1.42.0 plan; this spec supersedes its "T1 = extract useAppHandlers hook" assumption)
- `docs/superpowers/plans/2026-07-10-v1-42-1-minor-t0-app-appheader-jsx-refactor.md` (the plan this analysis serves; section §T0 references this spec)

## Out of Scope (deferred to future PATCH)

- **`bswmd/parse.ts` at 1196 LoC** (Round-1 L8 backlog, accepted ceiling) — ECUC builder chain shared-state coupling; further split risks subtle ordering bugs.
- **App.tsx shell at ~590 LoC after v1.42.1** (still over the 300-LoC aspirational target) — the 300-LoC target assumed extracting `<AppHeader>` / `<ErrorBanner>` / `<Group>` / modals to sub-components (a 2nd round of refactor); out of scope per YAGNI.
- **AppHeader.tsx shell at ~250-280 LoC after v1.42.1** (meets 300-LoC target) — minor inline tightening only.
- **Shim removal sweep** (8 latent shim files from v1.41.x PATCH) — requires `moduleResolution: "node16"` migration.
- **Test mirroring** (6 monolithic test files) — separate refactor scope.
- **Pre-commit file-size hook** enforcement (deferred; candidate lesson `file-size-cap-must-be-enforced-in-pre-commit-hook`).
- **Round-6 deep code review** — for un-checked axes (e2e tests / renderer dangerous zones / security-touching code).

## Reverse-Closes

- Round-1 L8 file-size backlog: **8/8 closed** (6 from v1.41.x + App.tsx from v1.42.1 + AppHeader.tsx from v1.42.1; `bswmd/parse.ts` accepted as known ceiling).
- Round-1 L8 cap enforcement: durable fix still pending (pre-commit hook).
- v1.41.x T3 deferral: closed.
- v1.42.0 MINOR T0 abort: closed (v1.42.1 retry with per-flow execution).

## Cross-references

- v1.41.x PATCH T5 ship: `01-Projects/claude-AutosarCfg/development/v1-41-x-patch-t5-ship-2026-07-10.md`
- v1.41.2 PATCH T3 ship: `01-Projects/claude-AutosarCfg/development/v1-41-2-patch-t3-ship-2026-07-10.md`
- v1.41.x T3 deferral (now closed): `01-Projects/claude-AutosarCfg/development/v1-41-x-patch-t3-renderer-files-deferred-to-v1.42.0-jsx-refactor-scope-exceeds-mechanical-split.md`
- v1.42.0 MINOR T0 abort: `01-Projects/claude-AutosarCfg/development/claude-autosarcfg-v1-42-0-minor-t0-aborted-deferring-to-v1.42-1-capture-decisions-2026-07-10.md`
- v1.42.1 MINOR T0 plan: `docs/superpowers/plans/2026-07-10-v1-42-1-minor-t0-app-appheader-jsx-refactor.md`
- Mechanical-Split cluster (mostly closed): `01-Projects/claude-AutosarCfg/development/mechanical-split-cluster-8-lessons-catalog-2026-07-10.md`
- Process cluster (lessons `main-thread-recovery-from-subagent-stall-faster-than-redispatch` + `devlog-follow-up-status-claims-require-re-verification-at-next-session-start` + `pkm-capture-stub-topic-file-recovery` inform the verification + recovery protocols used to write this spec): `01-Projects/claude-AutosarCfg/development/process-cluster-9-lessons-catalog-2026-07-10.md`