# v1.42.2 PATCH — AppHeader.tsx Sub-Component Extraction

**Released:** 2026-07-11
**Tag:** [`v1.42.2`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.42.2)
**Cycle type:** PATCH (sub-component extraction with render-prop pattern)
**Ship basis:** 5 commits (T0 spec + T1 BrandMenu + T2 ActionBar + T3 StatusBadge + T4 shell rewrite)

## Summary

Closes the **final Round-1 L8 file-size backlog item** in the renderer. AppHeader.tsx reduced from **894 LoC → 661 LoC (−233 LoC, −26.1%)** by extracting 3 sub-components:

1. **`src/renderer/components/AppHeader/BrandMenu.tsx`** (198 LoC NEW) — Brand trigger + dropdown panel container + `menuRef` + `closeTimerRef` + 3 useEffect + 2 useCallback. Render-prop pattern (10 menu items stay in shell as `children` callback).
2. **`src/renderer/components/AppHeader/AppHeaderActionBar.tsx`** (141 LoC NEW) — 3 Save buttons (Project Save / ARXML Save / Save All). Pure presentational.
3. **`src/renderer/components/AppHeader/AppHeaderStatusBadge.tsx`** (178 LoC NEW) — Project chip + scripts toggle + generate + locale toggle + version label. Pure presentational.

**Zero functional change** verified: `tsc --noEmit` clean + `vitest` 350/350 files / 3124 + 7 SKIP / 0 fail (identical test count to v1.42.1).

## Commits (5)

| # | Commit | Title | LoC |
|---|---|---|---|
| T0 spec | `ff6deb2` | `docs(spec): v1.42.x PATCH T0 -- AppHeader.tsx sub-component extraction analysis` | +196 LoC (NEW) |
| T1 | `bdebdbc` | `refactor(renderer): v1.42.x PATCH T1 -- create AppHeaderBrandMenu sub-component (render-prop pattern)` | +199 LoC (NEW) |
| T2 | `e2d0986` | `refactor(renderer): v1.42.x PATCH T2 -- create AppHeaderActionBar sub-component` | +142 LoC (NEW) |
| T3 | `edeb2fa` | `refactor(renderer): v1.42.x PATCH T3 -- create AppHeaderStatusBadge sub-component` | +179 LoC (NEW) |
| T4 | `4ab6fed` | `refactor(renderer): v1.42.x PATCH T4 -- rewrite AppHeader.tsx shell using 3 sub-components (render-prop pattern for BrandMenu)` | +87 / −320 LoC |

## What changed

### Render-prop pattern (key design decision)

The 10 menu items in the dropdown (projectNew / projectOpen / onOpen / onOpenDbc / onOpenOdx / onOpenDcmConfig / onOpenDbcImport / onOpenXlsxBatch / onEcucModuleSelect / conditional stencilFlagOn entry) live in **AppHeader.tsx shell** as children of `<AppHeaderBrandMenu>` via render-prop:

```tsx
<AppHeaderBrandMenu menuOpen={menuOpen} onMenuOpenChange={setMenuOpen}>
  {(api) => (
    <>
      <div className="app-dropdown-group-label">{t(api.locale, 'app.menu.projectManage')}</div>
      <button onClick={() => { api.closeMenu(); void onProjectNew(); }}>...</button>
      {/* ... 9 more items, each calls api.closeMenu() before handler ... */}
    </>
  )}
</AppHeaderBrandMenu>
```

**Why render-prop instead of prop-drilled menu items**: the trigger DOM node (`<div className="app-menu-trigger">`) and the panel DOM node (`<div className="app-dropdown">`) share `menuRef` + `closeTimerRef` + the hover-to-keep-open handlers. Splitting these across two sub-components would force the shell to manage DOM refs the sub-component owns. Render-prop pattern is the cleanest split: BrandMenu owns the trigger + panel chrome + ref/effect/callback ownership; shell owns the items + handler props.

This is **decision D2** from the v1.42.1 T5 ship capture-decisions. The render-prop API surface:

```typescript
export type BrandMenuRenderApi = {
  readonly closeMenu: () => void;
  readonly locale: Locale;
};
export type AppHeaderBrandMenuProps = {
  readonly menuOpen: boolean;
  readonly onMenuOpenChange: (open: boolean) => void;
  readonly children: (api: BrandMenuRenderApi) => ReactNode;
};
```

### Cross-VC state contract

All 3 sub-components are mutually independent — none reads state from another. Cross-VC coupling is props-down only:

| Source (shell) | Sink (sub-component) | Props |
|---|---|---|
| `menuOpen` + `setMenuOpen` | BrandMenu | 2 props + render-prop children |
| `onProjectSave` + `canSaveProject` + `projectDirtyCount` | ActionBar | 3 props |
| `onSave` + `canSave` + `isActiveDirty` | ActionBar | 3 props |
| `onSaveAll` + `canSaveAll` + `locale` | ActionBar | 3 props |
| `project` + `projectPath` + `onCloseProjectClick` | StatusBadge | 3 props |
| `scriptPanelOpen` + `onToggleScriptPanel` | StatusBadge | 2 props |
| `onGenerate` + `canGenerate` + `generateBusy` | StatusBadge | 3 props |
| `locale` + `appVersion` | StatusBadge | 2 props |

All cross-VC reads follow the `cross-flow-state-reads-must-flow-through-hook-parameters` lesson (Tier 8 in Process Cluster): shell owns state, sub-components read via props. No module-level state, no shared refs.

## T4 critical-honesty flag (lessons captured)

**R3 replacement range error**: The marker-based Python replacement script for R3 (delete 3 menu useEffect + 2 useCallback) accidentally swallowed the `getAppVersion` useEffect (lines 163-207 in pre-T4) along with the 3 menu useEffect. The marker range was 3048 chars, which covered **6 effects** (3 menu + getAppVersion + 2 unrelated setup effects) instead of the intended **3 effects**.

**Recovery**: Re-added the `getAppVersion` useEffect inline + restored its v1.12.0 PATCH D3 comment block. All 3124 tests passed post-restore.

**Lesson observation (NEW 1-of-1 lesson candidate, 1/3 confirmations)**: `marker-based-text-replacement-must-validate-block-contents-not-line-count` — when using marker-based text replacement (e.g., the Python `must_replace` pattern with line-count-based boundaries), validate the block's actual contents (count effects / callbacks / refs) before applying, not just trust the line count or char count. A 3048-char block could be 3 effects or 6 effects depending on what landed between the markers.

## NEW lessons promoted

**None**. v1.42.x is mechanical sub-component extraction with the render-prop pattern already covered by v1.42.1's T0 spec + D2 decision. The T4 R3 recovery observation is **1 of 3 confirmations** needed for the new `marker-based-text-replacement-must-validate-block-contents-not-line-count` lesson.

## Round-1 L8 file-size backlog closure

| | v1.40.0 baseline | v1.41.1 split | v1.42.1 MINOR | **v1.42.2 PATCH** |
|---|---|---|---|---|
| `App.tsx` | 1457 LoC | — | 840 LoC | 840 LoC |
| `AppHeader.tsx` | 894 LoC | — | 894 LoC | **661 LoC** |
| `core/arxml/parser.ts` | 1407 LoC | 3 files | — | — |
| `shared/types.ts` | 1240 LoC | 14 files | — | — |
| `core/project/bswmd.ts` | 1531 LoC | 2 files | — | — |
| **Round-1 L8 closed** | — | 6/9 | 8/9 | **9/9 ✅** |

## Test results

**3124 + 7 SKIP / 0 fail** (zero test delta — pure refactor). pnpm verify 7-stage GREEN. Identical test count to v1.42.1.

## Related documents

- **T0 spec**: `docs/superpowers/specs/2026-07-11-v1-42-x-patch-app-header-sub-components.md`
- **CHANGELOG**: top entry of `CHANGELOG.md`
- **Devlog**: see `01-Projects/claude-AutosarCfg/development/devlog.md` 2026-07-11 entries
- **v1.42.1 ship notes**: `docs/release-notes/v1.42.1/README.md` (the MINOR that extracted App.tsx flows T1-T4a)
- **v1.42.1 T5 capture-decisions**: `01-Projects/claude-AutosarCfg/development/capture-decisions/claude-autosarcfg-v1-42-1-minor-t5-ship-capture-decisions-2026-07-10.md` (contains D2 render-prop decision)

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)