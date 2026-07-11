# v1.42.x PATCH Sub-Component Extraction — AppHeader.tsx

**Author**: claude-AutosarCfg pre-T0 analysis controller
**Date:** 2026-07-11
**Status:** analysis (awaiting implementation; prerequisite for v1.42.x T1-T4)
**Baseline:** `8778d48` (v1.42.1 MINOR T5 ship, 3124 + 7 SKIP / 0 fail)
**Target:** AppHeader.tsx 894 → ~120 LoC shell + 3 sub-components (BrandMenu + ActionBar + StatusBadge). Existing `AppHeader/ResetOnboardingMenuItem.tsx` remains untouched. AppHeader/helpers.ts + AppHeader/types.ts extended with 1 prop type.

## Goal

Close the **last remaining Round-1 L8 file-size backlog item** by extracting AppHeader.tsx (894 LoC) into 3 new sub-components under `AppHeader/`:

1. **`AppHeader/BrandMenu.tsx`** (~180 LoC) — VC1: Brand trigger + dropdown panel + refs/effects/callbacks. Render-prop pattern keeps the 10 menu items in shell so the prop drilling for handlers stays in one place.
2. **`AppHeader/AppHeaderActionBar.tsx`** (~70 LoC) — VC3a: 3 Save buttons (Project Save / ARXML Save / Save All). Pure presentational sub-component.
3. **`AppHeader/AppHeaderStatusBadge.tsx`** (~90 LoC) — VC3b: project chip + scripts toggle + generate button + locale toggle + version label.

**Reuses existing pattern**: `AppHeader/ResetOnboardingMenuItem.tsx` (v1.6.0 U) is already an extracted sub-component using the same file layout convention. The 3 new sub-components follow the same per-file TypeScript + TSDoc + explicit props pattern.

## Background — what was actually measured on `8778d48`

**AppHeader.tsx (894 LoC)** measured 2026-07-11:

- **5 useState**: `state` (AppHeaderState, INITIAL), `appVersion` (string), `menuOpen` (boolean), `stencilOpen` (boolean), `stencilFlagOn` (boolean)
- **2 useRef**: `menuRef` (HTMLDivElement for click-outside), `closeTimerRef` (setTimeout id for hover-debounce)
- **6 useEffect**: feature flag fetch (89-111), stencil:open CustomEvent listener (114-120), unmount cleanup for closeTimerRef (155-161), app version fetch (163-207), click-outside-to-close (210-219), Escape-to-close (222-229)
- **3 useCallback**: `openMenu`, `scheduleClose`, `onCloseProjectClick`
- **6 `const` async handlers** (NOT useCallback — silent deviation from v1.42.1 plan template): `onOpen`, `onSave`, `onSaveAll`, `onProjectNew`, `onProjectOpen`, `onProjectSave`
- **~430 LoC of JSX** (lines 462-893) with 4 functional regions

## 3 Visual Concern (VC) regions — sub-component scope

### VC1: Brand + Menu trigger + Dropdown panel (lines 475-750, ~280 LoC)

**Owner**: NEW `AppHeader/BrandMenu.tsx`. **Render-prop pattern** (per `D2` decision from v1.42.1 T5 ship capture-decisions):

- **Owns**: trigger JSX (button + chevron SVG), `app-dropdown` panel wrapper, `menuRef`, `closeTimerRef`, 3 useEffect (unmount cleanup + click-outside + Escape), 2 useCallback (openMenu + scheduleClose), conditional `{menuOpen && <panel />}` render.
- **Does NOT own**: 10 menu items (projectNew, projectOpen, onOpen, onOpenDbc, onOpenOdx, onOpenDcmConfig, onOpenDbcImport, onOpenXlsxBatch, onEcucModuleSelect, conditional stencilFlagOn entry). These live in shell as children via render-prop `(api) => <menu items />` receiving `{ closeMenu, locale }`.
- **Why split this way**: trigger JSX's `ref={menuRef}` and `onMouseEnter/Leave={openMenu/scheduleClose}` are coupled to the same DOM node as the panel's `onMouseEnter/Leave` (hover-to-keep-open). The menuRef + closeTimerRef + 2 useCallback form a single ownership unit that CANNOT be split across two sub-components without prop-drilling refs to shell (which would force shell to manage DOM refs the sub-component owns). Render-prop pattern is the cleanest split: BrandMenu owns the trigger + panel chrome + ref/effect/callback ownership; shell owns the items + handler props.

**Props surface (BrandMenu render-prop API)**:

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

**Shell usage** (inside AppHeader.tsx after T4):

```tsx
<AppHeaderBrandMenu menuOpen={menuOpen} onMenuOpenChange={setMenuOpen}>
  {(api) => (
    <>
      <div className="app-dropdown-group-label">{t(api.locale, 'app.menu.projectManage')}</div>
      <button
        type="button"
        className="app-dropdown-item"
        role="menuitem"
        onClick={() => {
          api.closeMenu();
          void onProjectNew();
        }}
        disabled={state.busy}
        data-testid="btn-project-new"
      >
        {/* ...icon + label... */}
      </button>
      {/* ... 9 more items, each calls api.closeMenu() before handler ... */}
      {stencilFlagOn && (
        <button
          onClick={() => {
            api.closeMenu();
            setStencilOpen(true);
          }}
        >
          {/* ...stencil wizard entry... */}
        </button>
      )}
    </>
  )}
</AppHeaderBrandMenu>
```

### VC3a: Action bar (lines 754-805, ~52 LoC)

**Owner**: NEW `AppHeader/AppHeaderActionBar.tsx`. Pure presentational sub-component:

- **3 buttons**: Project Save (`onProjectSave`), ARXML Save (`onSave`), Save All (`onSaveAll`).
- **9 props**: `onProjectSave`, `canSaveProject`, `projectDirtyCount`, `onSave`, `canSave`, `isActiveDirty`, `onSaveAll`, `canSaveAll`, `dirtyPaths.size`, `locale`.
- **1 derived**: `dirtyPaths.size` is read from store via `useArxmlStore((s) => s.dirtyPaths.size)` inside sub-component (avoids passing the Set across the boundary when only the size matters).
- **1 store read**: `useArxmlStore((s) => s.dirtyPaths.size)` (size only — not the Set itself).

**Props surface**:

```typescript
export type AppHeaderActionBarProps = {
  readonly onProjectSave: () => void | Promise<void>;
  readonly canSaveProject: boolean;
  readonly projectDirtyCount: number;
  readonly onSave: () => void | Promise<void>;
  readonly canSave: boolean;
  readonly isActiveDirty: boolean;
  readonly onSaveAll: () => void | Promise<void>;
  readonly canSaveAll: boolean;
  readonly locale: Locale;
};
```

### VC3b: Status badge (lines 813-883, ~71 LoC)

**Owner**: NEW `AppHeader/AppHeaderStatusBadge.tsx`. Pure presentational sub-component:

- **5 UI blocks**: project chip (conditional on `project !== null`), scripts toggle, generate button, locale toggle, version label.
- **11 props**: `project`, `projectPath`, `onCloseProjectClick`, `scriptPanelOpen`, `onToggleScriptPanel`, `onGenerate`, `canGenerate`, `generateBusy`, `locale`, `appVersion`, `setLocale`.
- **1 store read**: `useArxmlStore((s) => s.setLocale)` (Zustand action is a stable ref, fine to subscribe).
- **Conditional render**: `{project !== null && <chip />}` stays inside sub-component (the `project !== null` check is the sub-component's responsibility).

**Props surface**:

```typescript
export type AppHeaderStatusBadgeProps = {
  readonly project: Project | null;
  readonly projectPath: string | null;
  readonly onCloseProjectClick: () => void;
  readonly scriptPanelOpen: boolean;
  readonly onToggleScriptPanel: () => void;
  readonly onGenerate: () => void;
  readonly canGenerate: boolean;
  readonly generateBusy: boolean;
  readonly locale: Locale;
  readonly appVersion: string;
};
```

## What does NOT move out of AppHeader.tsx shell

- **Brand line + Logo** (lines 463-472, ~10 LoC) — too small to justify extraction. Stays inline in shell.
- **`onCloseProjectClick` useCallback** (lines 248-298, ~50 LoC) — async confirm dialog flow coupled to `saveAllDirty` helper. Stays in shell (referenced by StatusBadge via prop).
- **5 useState** (state, appVersion, menuOpen, stencilOpen, stencilFlagOn) — `state` and `appVersion` are read by `onCloseProjectClick`/`useProjectActions`, so they stay in shell. `menuOpen` stays in shell (BrandMenu is controlled — shell owns the boolean). `stencilOpen` stays in shell (the StencilWizard modal mounts in shell JSX). `stencilFlagOn` stays in shell (used by inline stencilFlagOn conditional render inside the BrandMenu children).
- **6 useEffect** (feature flag fetch, stencil:open listener, unmount cleanup, app version fetch, click-outside, Escape) — click-outside + Escape + unmount cleanup move to BrandMenu; the other 3 stay in shell.
- **6 `const` async handlers** (onOpen, onSave, onSaveAll, onProjectNew, onProjectOpen, onProjectSave) — onSave + onSaveAll + onProjectSave are passed to AppHeaderActionBar; onProjectNew + onProjectOpen + onOpen are passed via BrandMenu children render-prop callback closures.
- **`useProjectActions` hook** — extracted store-binding logic, stays at top of shell.

## Dependency ordering (T-by-T execution)

1. **T0** (this spec) — Per-flow analysis with cross-VC state coupling (this file).
2. **T1** — `AppHeader/BrandMenu.tsx` (NEW ~180 LoC) + extend `AppHeader/types.ts` (no new exports — sub-component has its own props type). Render-prop pattern; shell still uses inline menu JSX.
3. **T2** — `AppHeader/AppHeaderActionBar.tsx` (NEW ~70 LoC) + add `AppHeaderActionBarProps` to `AppHeader/types.ts`. Shell renders `<AppHeaderActionBar ... />` in place of the 3 inline Save buttons.
4. **T3** — `AppHeader/AppHeaderStatusBadge.tsx` (NEW ~90 LoC) + add `AppHeaderStatusBadgeProps` to `AppHeader/types.ts`. Shell renders `<AppHeaderStatusBadge ... />` in place of the inline `app-header-right` div content.
5. **T4** — Rewrite AppHeader.tsx shell: replace inline `<AppHeaderBrandMenu>` trigger + panel JSX (lines 475-750) + 3 inline Save buttons (lines 754-805) + inline `app-header-right` div (lines 813-883) with sub-component JSX. Shell becomes ~120 LoC (Logo + 3 sub-component mounts + StencilWizard modal).
6. **T5** — Tier 3 push + tag `v1.42.x` (PATCH) + GH release.

## Cross-VC state contract

The 3 sub-components are **mutually independent** — none reads state from another. The shell owns all 5 useState and the 6 useEffect (the 3 that move to BrandMenu are isolated to VC1). Cross-VC coupling is **props-down only**:

| Source (shell)                                           | Sink (sub-component)    | Prop               |
| -------------------------------------------------------- | ----------------------- | ------------------ |
| `menuOpen`                                               | BrandMenu               | `menuOpen`         |
| `setMenuOpen`                                            | BrandMenu               | `onMenuOpenChange` |
| `onProjectSave` + `canSaveProject` + `projectDirtyCount` | ActionBar               | 3 props            |
| `onSave` + `canSave` + `isActiveDirty`                   | ActionBar               | 3 props            |
| `onSaveAll` + `canSaveAll`                               | ActionBar               | 2 props            |
| `project` + `projectPath` + `onCloseProjectClick`        | StatusBadge             | 3 props            |
| `scriptPanelOpen` + `onToggleScriptPanel`                | StatusBadge             | 2 props            |
| `onGenerate` + `canGenerate` + `generateBusy`            | StatusBadge             | 3 props            |
| `locale` + `appVersion` + `setLocale`                    | StatusBadge + ActionBar | 3 props            |

All cross-VC reads follow the **`cross-flow-state-reads-must-flow-through-hook-parameters`** lesson (Tier 8 in Process Cluster): shell owns state, sub-components read via props. No module-level state, no shared refs.

## Risk register

| Risk                                                                                      | Severity | Mitigation                                                                                                                                                         |
| ----------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T4 single-commit rewrite of AppHeader.tsx (−774 LoC) breaks compilation                   | HIGH     | T1-T3 land independently first, each with full `tsc --noEmit + vitest run` GREEN; T4 is pure replacement of inline JSX with sub-component JSX with same prop shape |
| BrandMenu render-prop API awkward for `stencilFlagOn` conditional inside children         | LOW      | Shell renders `{stencilFlagOn && <button>...</button>}` inside the children callback; works because render-prop callback receives the full JSX render context      |
| `dirtyPaths.size` derived in AppHeaderActionBar needs the Set's size, not the Set itself  | LOW      | Sub-component subscribes to `useArxmlStore((s) => s.dirtyPaths.size)`; Zustand selector returns a number, comparison is cheap                                      |
| `setLocale` (Zustand action ref) read in StatusBadge vs passed via props                  | LOW      | Prefer store subscription inside sub-component (`useArxmlStore((s) => s.setLocale)`) — Zustand action refs are stable, no re-render churn                          |
| 6 `const` async handlers stay in shell as `const` (NOT useCallback) per v1.42.1 deviation | LOW      | Pre-existing pattern; no plan to convert (per v1.42.1 critical-honesty flag in devlog)                                                                             |

## Pre-flight verify (lesson #10)

Before T1: `git fetch + git rev-list --count origin/main..HEAD + git ls-remote origin HEAD` → expected `HEAD = origin/main = 8778d48`; `git tag -l v1.42.*` → expect `v1.42.1`. After each T: `pnpm tsc --noEmit + pnpm vitest run` → expect 3124 + 7 SKIP / 0 fail.

## Target LoC

|                                                                    | v1.42.1 baseline | v1.42.x PATCH target            |
| ------------------------------------------------------------------ | ---------------- | ------------------------------- |
| `src/renderer/components/AppHeader.tsx`                            | 894 LoC          | **~120 LoC**                    |
| `src/renderer/components/AppHeader/BrandMenu.tsx` (NEW)            | —                | ~180 LoC                        |
| `src/renderer/components/AppHeader/AppHeaderActionBar.tsx` (NEW)   | —                | ~70 LoC                         |
| `src/renderer/components/AppHeader/AppHeaderStatusBadge.tsx` (NEW) | —                | ~90 LoC                         |
| `src/renderer/components/AppHeader/types.ts`                       | 97 LoC           | ~140 LoC (+3 prop type exports) |
| `src/renderer/components/AppHeader/helpers.ts`                     | 83 LoC           | 83 LoC (no change)              |
| `src/renderer/components/AppHeader/ResetOnboardingMenuItem.tsx`    | 61 LoC           | 61 LoC (no change)              |
| **AppHeader.tsx + sub-components total**                           | **1135 LoC**     | **~744 LoC**                    |

Round-1 L8 file-size backlog: **9 of 9 closed** ✅ (was 8/9 after v1.42.1).
