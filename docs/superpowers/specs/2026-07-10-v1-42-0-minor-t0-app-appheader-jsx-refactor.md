# v1.42.0 MINOR T0 — App.tsx + AppHeader.tsx JSX Refactor

**Author**: claude-AutosarCfg post-ship review controller
**Date:** 2026-07-10
**Status:** design (awaiting spec self-review + user approval)
**Baseline:** v1.41.2 PATCH `3f507d9` (3124 + 7 SKIP / 0 fail)
**Target:** 3124 + 7 SKIP / 0 fail (zero test delta — pure JSX refactor)

## Goal

Mechanically refactor `src/renderer/App.tsx` (1375 LoC) + `src/renderer/components/AppHeader.tsx` (894 LoC) to bring both files under the 800-LoC cap via **JSX-driven refactoring** (not mechanical barrel-split). After this PATCH, both files are < 300 LoC; the extracted hook + sub-components live in dedicated sub-directories.

**Closes the 2 remaining items of the Round-1 L8 file-size backlog** (5/8 closed in v1.41.x PATCH; 3/8 remaining = App.tsx + AppHeader.tsx + bswmd/parse.ts). `bswmd/parse.ts` (1196 LoC) is accepted as a known ceiling (ECUC builder chain shared-state coupling — out of scope for v1.42.0).

## Background — what's actually wrong

**`App.tsx` is a god component.** 1375 LoC containing:

- 9 `useCallback` handlers (handleOpenDcmConfig, handleMenuSelectEcucModule, handleAddEcucFromBswmd, handleCloseEcucPicker, handleConfirmEcucPicker, handleContextMenu, handleGenerateClick, handleContextMenuAction, handleExportOdxDiagnosticExtract)
- 7 `useState` (ecucPickerOpen, scriptPanelOpen, dbcModal, odxModal, diagExtractModal, diagExtractExporting, dbcImportState, xlsxBatchWizardOpen)
- 2 `useEffect` (xlsxImport listener, xlsxHistory bootstrap)
- 5+ custom hooks (useProjectActions, useDcmConfigLauncher, useArxmlStore, etc.)
- ~700 LoC of JSX with 4 modal/host components

Every state change in App.tsx triggers a re-render of the entire shell + all 4 modals. New features require adding more useCallback + useState in the same file. The cap is hit by 575 LoC (75% over).

**`AppHeader.tsx` is a god-component-light.** 894 LoC containing:

- 5 `useState` (state, appVersion, menuOpen, stencilOpen, stencilFlagOn)
- 4 `useRef` (menuRef, closeTimerRef, etc.)
- 5 `useEffect` (experimental flag, app version fetch, click-outside, etc.)
- 3 `useCallback` (openMenu, scheduleClose, onCloseProjectClick)
- ~700 LoC of JSX with the entire header (brand + menu + action bar + status badge + help + profile + script panel toggle)

The component does too much. Menu + ActionBar + StatusBadge are 3 distinct visual concerns bundled into 1 component.

## Why not barrel-split (lesson from v1.41.x)

`v1.41.x PATCH` (file-size backlog) used barrel-split (6 files → 38 files via `src/<dir>/<file>/<sub>.ts` sub-directory). That pattern works for **function-bundle files** (e.g. `parser.ts` is a function library, easy to slice by function-section).

App.tsx + AppHeader.tsx are **JSX components with closure state** — every `useCallback` captures the surrounding `useState` set. Mechanical barrel-split would split the functions but the JSX remains in the shell, and the state machine stays monolithic. The natural cut is **by visual concern** (Menu, ActionBar, StatusBadge for AppHeader) and **by closure-captured state** (the `useAppHandlers` hook for App.tsx).

The Round-1 L8 cap is the goal. The cap is hit because of god-component complexity, not function-library size. So the fix is structural (JSX + hook extraction), not mechanical (barrel-split).

## Architecture

### T1: extract `useAppHandlers` hook (App.tsx → shell + hook)

`src/renderer/app/useAppHandlers.ts` (NEW, ~600 LoC) — closure-scoped hook containing:

- 9 useCallback handlers (verbatim from App.tsx)
- 7 useState (verbatim from App.tsx)
- 2 useEffect (verbatim from App.tsx)
- All cross-handler state dependencies (e.g. handleConfirmEcucPicker reads ecucPickerOpen + preSelectedBswmdPath + useArxmlStore state)
- Returns: 9 callbacks + 7 state setters + ~6 modal-open/close helpers (16 return fields total)

`src/renderer/App.tsx` (REWRITE as shell, ~250 LoC) — only:

- Top-level hooks that are NOT in the closure: `useProjectActions`, `useDcmConfigLauncher`, `useArxmlStore` (for viewMode, locale, canSelectEcucModule, etc.)
- `useAppHandlers()` call → get the 9 callbacks + 7 state slots
- JSX shell: `<TourProvider>` → `<div className="app-shell">` → `<AppHeader ... props />` → `<ErrorBanner />` → `<main>` → `<Group>` → 2 `<Panel>` → modals

**Decision: D1 — single hook vs 3 domain hooks?** A single `useAppHandlers` is preferred because:

- The 9 callbacks share state (e.g. `handleConfirmEcucPicker` reads `ecucPickerOpen` from `handleOpenDcmConfig`'s state)
- 3 domain hooks would force the shell to thread state between them (the cross-state coupling is the source of complexity, not the per-domain count)
- Single hook is consistent with v1.41.2 T1's `commitRunResult` helper pattern: closure-scoped helper, not module-scoped helper
- The 16 return-fields is manageable; the shell destructures what it needs

### T2: extract 3 AppHeader sub-components

`src/renderer/components/AppHeader/Menu.tsx` (NEW, ~300 LoC) — handles:

- Menu open/close state (`menuOpen`, `setMenuOpen`)
- Click-outside listener (currently in AppHeader's useEffect)
- Stencil wizard sub-menu (`stencilOpen`, `setStencilOpen`, `stencilFlagOn`)
- ECUC from BSWMD menu item + 3 other menu items
- Schedule-close debounce (currently `closeTimerRef`)

`src/renderer/components/AppHeader/ActionBar.tsx` (NEW, ~200 LoC) — handles:

- Save button (`onProjectSave` + `canSaveProject`)
- Generate button (`onGenerate` + `canGenerate` + `generateBusy`)
- DBC button (`onOpenDbc` + `dbcBusy`)
- ODX button (`onOpenOdx` + `odxBusy`)
- DBC import button (`onOpenDbcImport` + `dbcImportBusy`)
- XLSX batch button (`onOpenXlsxBatch` + `xlsxBatchBusy`)
- DCM config button (`onOpenDcmConfig` + `canOpenDcmConfig` + `dcmConfigBusy`)
- Script panel toggle button (`onToggleScriptPanel` + `scriptPanelOpen`)

`src/renderer/components/AppHeader/StatusBadge.tsx` (NEW, ~150 LoC) — handles:

- App version display (`appVersion` state)
- Stale-closure-prone state from `state` (the AppHeader's `AppHeaderState`)
- Help / profile dropdown (right-side of header)

`src/renderer/components/AppHeader.tsx` (REWRITE as shell, ~150 LoC) — only:

- Top-level state passed DOWN to sub-components via props (no state hoisting in shell)
- JSX composition: `<header><BrandLogo /><Menu {...} /><ActionBar {...} /><StatusBadge {...} /></header>`

**Decision: D2 — prop drilling vs context for AppHeader sub-components?** Props. AppHeader has 3 levels of sub-component composition (shell → Menu/ActionBar/StatusBadge). Context would add 1 abstraction layer; props keep the data flow explicit. If the prop list grows past 10 per sub-component, refactor to context in a follow-up.

### T3: docs + ship v1.42.0

`docs/release-notes/v1.42.0/README.md` (NEW) — release notes
`CHANGELOG.md` (MODIFY) — v1.42.0 MINOR row above v1.41.2
`docs/superpowers/specs/` + `docs/superpowers/plans/` already exist
Tag v1.42.0, push to origin, create GH release

## Components & Files Touched

| Layer                         | Path                                                                                         | Change                             |
| ----------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------- |
| renderer/app                  | `src/renderer/app/useAppHandlers.ts`                                                         | NEW (~600 LoC)                     |
| renderer                      | `src/renderer/App.tsx`                                                                       | REWRITE (~250 LoC, down from 1375) |
| renderer/components/AppHeader | `src/renderer/components/AppHeader.tsx`                                                      | REWRITE (~150 LoC, down from 894)  |
| renderer/components/AppHeader | `src/renderer/components/AppHeader/Menu.tsx`                                                 | NEW (~300 LoC)                     |
| renderer/components/AppHeader | `src/renderer/components/AppHeader/ActionBar.tsx`                                            | NEW (~200 LoC)                     |
| renderer/components/AppHeader | `src/renderer/components/AppHeader/StatusBadge.tsx`                                          | NEW (~150 LoC)                     |
| docs                          | `docs/release-notes/v1.42.0/README.md`                                                       | NEW                                |
| docs                          | `CHANGELOG.md`                                                                               | MODIFY                             |
| vault                         | `01-Projects/claude-AutosarCfg/development/v1-42-0-minor-t3-ship-2026-07-10.md` (or similar) | NEW (post-ship)                    |

## Key Design Decisions

| #   | Decision                                              | Rationale                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Single `useAppHandlers` hook** (not 3 domain hooks) | 9 callbacks share state (e.g. `handleConfirmEcucPicker` reads `ecucPickerOpen` from `handleOpenDcmConfig`'s state). Cross-state coupling is the source of complexity; threading state between 3 hooks would multiply it.                       |
| D2  | **AppHeader sub-components via props** (not context)  | 3-level composition with < 10 props per sub-component. Context adds 1 abstraction layer; props keep data flow explicit. Refactor to context if prop list grows past 10.                                                                        |
| D3  | **No new tests added** (zero test delta requirement)  | The refactor preserves behavior. New useAppHandlers hook + sub-components are exercised by existing App.test.tsx + AppHeader.test.tsx. If existing tests don't cover a state, write a test as a separate concern (defer to a follow-up PATCH). |
| D4  | **Main-thread execution** (not sub-agent)             | Following the v1.41.x T2+T4 lesson `main-thread-recovery-from-subagent-stall-faster-than-redispatch` (JSX refactor with 9 callback + 7 state → main thread is faster and more reliable than sub-agent dispatch).                               |
| D5  | **Per-T-level commit** (T1, T2, T3) — not bundle      | T1 (App.tsx + useAppHandlers) is a self-contained hook extraction. T2 (AppHeader + 3 sub-components) is a self-contained visual decomposition. Bundling them would force the reviewer to understand 2 distinct refactor patterns in 1 commit.  |

## Testing Strategy

| Test surface                                 | Coverage                                                                 | Δ tests |
| -------------------------------------------- | ------------------------------------------------------------------------ | ------- |
| `src/renderer/App.test.tsx`                  | Existing App tests must pass after T1                                    | +0      |
| `src/renderer/components/AppHeader.test.tsx` | Existing AppHeader tests must pass after T2                              | +0      |
| Full vitest run                              | 3124 + 7 SKIP / 0 fail pre = post                                        | +0      |
| pnpm verify 7-stage per T                    | format + lint + type-check + test + coverage + build + import-regression | n/a     |

**Zero new tests** (pure refactor; if a state isn't covered by existing tests, defer to a follow-up PATCH).

## Risks & Mitigations

| Risk                                                                                           | Mitigation                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1 breaks existing App tests because handler signatures change                                 | The hook returns the same 9 callbacks + 7 state slots; the shell destructures them with the same names as before. Existing tests should pass without modification.                                                                          |
| T2 breaks existing AppHeader tests because click-outside listener is now in Menu sub-component | The sub-component exposes the same onMenuToggle callback; AppHeader.tsx passes the toggle function as a prop. Test queries for the menu button by testid; if the test queries the AppHeader root for the menu state, the test needs update. |
| Sub-component prop list grows past 10 per sub-component during impl                            | Refactor to context mid-T. The D2 decision is a guideline, not a rule.                                                                                                                                                                      |
| JSX refactor accidentally mutates callback deps (e.g. new useCallback dep array)               | All 9 callbacks preserve their original useCallback deps; the move is textual, not functional. The pnpm verify 7-stage lint catches useEffect/useCallback dep changes.                                                                      |
| Sub-agent dispatch fails (T1 + T2 file moves are sensitive)                                    | D4 — main-thread execution. Lessons-sweep confirms this is the v1.41.x established pattern.                                                                                                                                                 |
| T1 + T2 共同 commit one is rejected by reviewer, blocking the chain                            | D5 — separate commits. Each T is self-contained; reviewer can accept T1 independently of T2.                                                                                                                                                |

## Tasks (3 T + 1 ship)

```
T1: extract useAppHandlers hook (App.tsx shell + useAppHandlers.ts)
T2: extract 3 AppHeader sub-components (AppHeader.tsx shell + Menu/ActionBar/StatusBadge)
T3: docs + ship v1.42.0 MINOR
```

3 tasks total, main-thread execution per D4.

## Global Constraints

(Inherit from v1.40.x + v1.41.x series.)

- All modified/new files end with trailing newline.
- No `console.log` in production code; `console.warn` / `console.error` allowed for defensive warnings (with `eslint-disable-next-line no-console` per project convention).
- 中文 for user-facing/business comments; 英文 for technical API/protocol/comments per CLAUDE.md.
- Subagent-driven execution skipped per D4 (main thread).
- Each task ends with `pnpm verify` 7-stage GREEN (per v1.40.0 T3 lesson `pre-flight-lint-must-be-7-stage-at-every-t-level`).
- **Behavior must be IDENTICAL post-refactor.** No "while I'm here" fixes.
- **Zero new tests.** If existing tests don't cover a state, write a test as a separate concern (defer to a follow-up PATCH).
- Exact values (file paths, function names, prop names, testid values) MUST match this spec verbatim.
- Implementer MUST dispatch `pkm-capture` autonomously when work is capture-worthy (per v1.38.0 lesson). If pkm-capture subagent fails, controller writes the vault files directly (per v1.41.2 PATCH T3 process deviation).
- Implementer MUST NOT make destructive git operations (`reset --hard`, `push --force`) on `origin/main`.
- Implementer MUST NOT increase any file's LoC by more than +5% (refactor only, not additions). EXCEPTION: the new `useAppHandlers.ts` (~600 LoC) IS the LoC growth — the cap is `useAppHandlers.ts` ≤ 650 LoC + `App.tsx` ≤ 300 LoC.

## Out of Scope (deferred to future PATCH)

- **`bswmd/parse.ts` at 1196 LoC** (Round-1 L8 backlog, accepted ceiling) — ECUC builder chain shared-state coupling; further split risks subtle ordering bugs.
- **Shim removal sweep** (8 latent shim files from v1.41.x PATCH) — requires `moduleResolution: "node16"` migration.
- **Test mirroring** (6 monolithic test files) — separate refactor scope.
- **Pre-commit file-size hook** enforcement (deferred; candidate lesson `file-size-cap-must-be-enforced-in-pre-commit-hook`).
- **Round-6 deep code review** — for un-checked axes (e2e tests / renderer dangerous zones / security-touching code).

## Reverse-Closes

- Round-1 L8 file-size backlog: **7/8 closed** (6 from v1.41.x + App.tsx from v1.42.0). `bswmd/parse.ts` accepted as known ceiling.
- Round-1 L8 cap enforcement: durable fix still pending (pre-commit hook).
- v1.41.x T3 deferral: closed.

## Lessons (NEW from this MINOR, candidates)

1. `god-component-jsx-refactor-requires-closure-hook-not-barrel-split` (T1) — For JSX components with 7+ useState + 9+ useCallback, the natural cut is `useAppHandlers` closure-scoped hook, not barrel-split. Mechanical barrel-split would leave the state machine monolithic.
2. `visual-concern-cut-beats-function-section-cut-for-jsx-components` (T2) — For JSX components, the natural sub-component boundaries are by visual concern (Menu / ActionBar / StatusBadge), not by function-section (handlers / effects / state).
3. `refactor-preserves-test-surfaces-without-new-tests-if-signature-stable` (T1+T2) — A pure refactor with identical return-type signatures can rely on existing test coverage. New tests only if the refactor changes the public surface (e.g. new exported hook, new prop in <App />).

## Cross-references

- v1.41.x PATCH T5 ship: `01-Projects/claude-AutosarCfg/development/v1-41-x-patch-t5-ship-2026-07-10.md`
- v1.41.2 PATCH T3 ship: `01-Projects/claude-AutosarCfg/development/v1-41-2-patch-t3-ship-2026-07-10.md`
- v1.41.x T3 deferral (now closed): `01-Projects/claude-AutosarCfg/development/v1-41-x-patch-t3-renderer-files-deferred-to-v1.42.0-jsx-refactor-scope-exceeds-mechanical-split.md`
- Mechanical-Split cluster (now mostly closed): `01-Projects/claude-AutosarCfg/development/mechanical-split-cluster-8-lessons-catalog-2026-07-10.md`
- Process cluster (lesson `main-thread-recovery-from-subagent-stall-faster-than-redispatch` informs D4): `01-Projects/claude-AutosarCfg/development/process-cluster-9-lessons-catalog-2026-07-10.md`
