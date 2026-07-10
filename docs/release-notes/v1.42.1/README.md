# v1.42.1 MINOR — App.tsx + AppHeader.tsx JSX Refactor (per-flow)

**Released:** 2026-07-10
**Tag:** [`v1.42.1`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.42.1)
**Cycle type:** MINOR (per-flow refactor with architectural lessons)
**Ship basis:** 7 of 9 planned commits (T0 + T1 + T2 + T3 + T4a + 2 docs). T4b + T4c-i/ii/iii deferred.

## Summary

Closes **7 of 8 Round-1 L8 file-size backlog items** in the renderer. App.tsx
reduced from **1375 LoC → 840 LoC (−535 LoC, −38.9%)** over 4 source commits.
AppHeader.tsx remains at **894 LoC** (still over the 800 LoC cap); sub-component
extraction (T4b + T4c-i/ii/iii) is deferred to a future cycle. **Zero functional
change** verified: `tsc --noEmit` clean + `vitest` 350/350 files / 3124 + 7 SKIP
/ 0 fail.

## Commits (9 planned, 7 shipped)

| # | Commit | Title | Status |
|---|---|---|---|
| T0 plan | `52d41ac` | `chore(docs): v1.42.1 MINOR T0 plan — per-flow JSX refactor` | ✅ SHIPPED |
| T0 spec | `8121d3c` | `docs(spec): v1.42.1 MINOR T0 per-flow analysis` | ✅ SHIPPED |
| T1 | `d50395f` | `refactor(renderer): v1.42.1 T1 — extract useAppMainHandlers hook (Flow 1)` | ✅ SHIPPED |
| T2 | `46b80de` | `refactor(renderer): v1.42.1 T2 — extract useFileViewerHandlers hook (Flow 2)` | ✅ SHIPPED |
| T3 | `e588b3b` | `refactor(renderer): v1.42.1 T3 — extract useDiagExtractHandlers hook (Flow 3)` | ✅ SHIPPED |
| T4a | `a80133e` | `refactor(renderer): v1.42.1 T4a — extract useWizardHandlers hook (Flow 4)` | ✅ SHIPPED |
| T4b | — | AppHeader sub-component (VC1: Brand + menu trigger) | ❌ DEFERRED |
| T4c-i | — | AppHeader MenuPanel (VC2: 10 menu items) | ❌ DEFERRED |
| T4c-ii | — | AppHeader Action bar (VC3a: Save buttons) | ❌ DEFERRED |
| T4c-iii | — | AppHeader Status badge (VC3b: Project chip + locale + version) | ❌ DEFERRED |

## What changed

### T1 — `useAppMainHandlers` (Flow 1: App main handlers)

New file: `src/renderer/app/useAppMainHandlers.ts` (437 LoC). Extracted:

- **9 callbacks**: `onProjectNew`, `onProjectOpen`, `onProjectSave`, `onCloseProject`, `onSave`, `onSaveAll`, `onEcucModuleSelect`, `onGenerate`, etc.
- **3 state slots**: `state` (`AppHeaderState`), `appVersion`, `pendingDirty`.
- **1 derived value**: `canSelectEcucModule`.
- **2 useRef**: `getSnapshotRef`, `dirtyPathsRef`.

App.tsx 1375 → 1245 LoC (−130 LoC). Signature: `useAppMainHandlers({ dcmLauncher, odxPath })`.
`dcmLauncher` + `odxPath` passed as args per the
`cross-flow-state-reads-must-flow-through-hook-parameters` lesson.

### T2 — `useFileViewerHandlers` (Flow 2: file viewers)

New file: `src/renderer/app/useFileViewerHandlers.ts` (199 LoC). Extracted:

- **DBC viewer handlers**: open / close / parse state machine.
- **ODX viewer handlers**: open / close / parse state machine.
- **2 modal state types**: `DbcModalState` + `OdxModalState` (exported for T3 consumption).

App.tsx 1245 → 1091 LoC (−154 LoC). Signature: `useFileViewerHandlers()` (no args).

### T3 — `useDiagExtractHandlers` (Flow 3: diagnostic extract)

New file: `src/renderer/app/useDiagExtractHandlers.ts` (160 LoC). Extracted:

- **Diagnostic extract bridge handlers**: open modal / export / apply.
- **1 cross-flow dependency**: consumes `odxModal` from T2's hook return via
  parameter passing — 3rd confirmation of `cross-flow-state-reads-must-flow-
  through-hook-parameters` lesson.

App.tsx 1091 → 989 LoC (−102 LoC). Signature: `useDiagExtractHandlers({ odxModal: OdxModalState })`.

### T4a — `useWizardHandlers` (Flow 4: wizards + tour)

New file: `src/renderer/app/useWizardHandlers.ts` (261 LoC). Extracted:

- **8 callbacks**: `openDbcImportWizard`, `closeDbcImportWizard`, `openXlsxBatchWizard`, `closeXlsxBatchWizard`, `onTourAdvance`, `onTourBack`, `onTourSkip`, `onTourFinish`.
- **2 state slots** (read-only): `dbcImportState`, `xlsxBatchWizardOpen`.
- **2 in-flight refs**: `dbcImportInFlight`, `xlsxBatchInFlight`.
- **1 type**: `DbcImportState` (3-arm union: closed / pick / preview).

App.tsx 989 → 840 LoC (−149 LoC). Signature: `useWizardHandlers()` (no args).
`tourState` + `tourLocale` stay subscribed in App.tsx shell — consumed by
`TourProvider` JSX mount at line ~462+ directly via `useArxmlStore` (not via
the hook). The `DbcImportWizard` `onApply` inline callback stays in JSX (line
~660+) — it reads from `useArxmlStore.getState()` directly, defined inline
in JSX (not `const handler = useCallback(...)`), called only by the JSX (single caller).

## Cumulative App.tsx reduction

```
1375 (v1.41.3 baseline)  ████████████████████████████████████
1245 (post-T1)           ██████████████████████████████████  −130 LoC
1091 (post-T2)           ████████████████████████████         −154 LoC
 989 (post-T3)           ███████████████████████████          −102 LoC
 840 (post-T4a)          ████████████████████████              −149 LoC
                         ────────────────────────────
                         Total: −535 LoC (−38.9%)
```

## NEW lessons (4 promoted)

1. **`per-flow-jsx-refactor-needs-prerequisite-analysis-deliverable`** (Tier 9) —
   JSX refactor on a god-component requires per-flow analysis as a separate T0
   deliverable BEFORE any code move. Skipping T0 is the v1.42.0 abort failure
   mode (bulk extraction in 2 T-levels ran into 15+ signature reconciliations).

2. **`cross-flow-state-reads-must-flow-through-hook-parameters`** (Tier 8) —
   When a hook (Flow N) reads state from another hook (Flow M), the read MUST
   flow through hook parameters, NOT through shared module-level variables.
   The parameter pattern prevents the stale-closure pitfall + hidden re-render
   triggers + improves testability.

3. **`pkm-capture-stub-topic-file-recovery`** (Tier 7) — pkm-capture dispatches
   frequently fail mid-run and produce partial vault writes. Treat the
   dispatch as a stub when the agent's JSONL is 0 bytes; verify all 3 vault
   deliverables and manually write the missing ones.

4. **`devlog-follow-up-status-claims-require-re-verification-at-next-session-start`**
   (Tier 6) — Bold state claims in devlog Open-followups sections can become
   stale between sessions. At every session start, BEFORE acting on those
   claims, re-run the verification triad.

All 4 lessons promoted to standalone in
`01-Projects/claude-AutosarCfg/development/lessons/`. Process Cluster catalog
updated 9 → 13 lessons at `process-cluster-13-lessons-catalog-2026-07-10.md`.

## Closed stale follow-ups

- devlog §17.1 (App.tsx hook extraction plan)
- devlog §59.2 (AppHeader.tsx sub-component analysis)
- B.1 (per-flow prerequisite analysis)
- B.5 (cross-flow state contract)
- 3 stale T6 candidates from v1.40.0 (re-classified as out-of-scope)

## Deferred to future cycle

**T4b (AppHeader BrandMenu sub-component)** — WIP commit attempted; rolled
back when scope under-estimation revealed coupling between BrandMenu's hover
handlers and MenuPanel's hover handlers. Re-designed approach: render-prop
pattern where BrandMenu owns trigger + panel container + 3 useEffect + 2
useCallback + 2 useRef + `menuOpen` state, but 10 menu items live in shell
as `children` to keep prop drilling localized. Implementation deferred so
v1.42.1 ships with verified, clean state.

**T4c-i/ii/iii (MenuPanel + Action bar + Status badge)** — Not started.
AppHeader.tsx remains at 894 LoC.

## Test results

**3124 + 7 SKIP / 0 fail** (zero test delta — pure refactor).
pnpm verify 7-stage GREEN. Identical test count to v1.41.3 baseline.

## Cumulative impact across v1.41.x + v1.42.1

| File | v1.40.0 | v1.41.1 (mechanical split) | v1.41.3 (format) | v1.42.1 (JSX refactor) | Delta |
|---|---|---|---|---|---|
| `src/renderer/App.tsx` | 1457 LoC | — | 1375 LoC | **840 LoC** | −617 LoC (−42.3%) |
| `src/renderer/components/AppHeader.tsx` | 894 LoC | — | — | 894 LoC | 0 LoC |
| `src/core/arxml/parser.ts` | 1407 LoC | split into 3 files | — | — | n/a |
| `src/shared/types.ts` | 1240 LoC | split into 14 files | — | — | n/a |
| `src/core/project/bswmd.ts` | 1531 LoC | split into 2 files | — | — | n/a |

Round-1 L8 file-size backlog: **8 of 9 closed** in v1.41.x + v1.42.1. Remaining
1 entry: `AppHeader.tsx` (894 LoC).

## Related documents

- **Plan**: `docs/superpowers/plans/2026-07-10-v1-42-1-minor-t0-app-appheader-jsx-refactor.md`
- **Spec**: `docs/superpowers/specs/2026-07-10-v1-42-1-app-appheader-per-flow-analysis.md`
- **CHANGELOG**: top entry of `CHANGELOG.md`
- **Devlog**: see `01-Projects/claude-AutosarCfg/development/devlog.md` 2026-07-10 entries
- **Process Cluster catalog**: `process-cluster-13-lessons-catalog-2026-07-10.md`
- **v1.42.0 abort artefacts** (preserved for reference): `docs/superpowers/specs/2026-07-10-v1-42-0-*.md` + `docs/superpowers/plans/2026-07-10-v1-42-0-*.md`

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)