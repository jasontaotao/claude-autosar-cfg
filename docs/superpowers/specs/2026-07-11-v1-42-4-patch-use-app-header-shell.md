# v1.42.4 PATCH useAppHeaderShell Hook Extraction — AppHeader.tsx

**Author**: claude-AutosarCfg pre-T0 analysis controller
**Date:** 2026-07-11
**Status:** analysis (awaiting implementation; prerequisite for v1.42.4 T1-T2)
**Baseline:** `af61dc8` (v1.42.3 PATCH T3 ship, 3124 + 7 SKIP / 0 fail)
**Target:** AppHeader.tsx 415 → ~280 LoC shell + 1 NEW hook file (~80 LoC). 0 functional change.

## Goal

Final cleanup pass on AppHeader.tsx after v1.42.2 (sub-components) + v1.42.3 (handler cluster hook). The shell still owns 3 useEffect (feature flag fetch + CustomEvent listener + app version IPC) + 3 useState (`appVersion` + `stencilOpen` + `stencilFlagOn`). Extract these into a closure-scoped hook `useAppHeaderShell()`. Mirrors v1.42.3 T1-T2 pattern but with a smaller, focused scope (no async handlers, no store selectors — pure shell lifecycle effects).

After v1.42.4, AppHeader.tsx shell is near-pure JSX: 1 useState (`menuOpen` controlled BrandMenu) + 1 hook call + 3 sub-component mounts + 1 StencilWizard mount.

## Background — what was actually measured on `af61dc8`

**AppHeader.tsx (415 LoC)** measured 2026-07-11:

- **1 useState** (post-v1.42.3): `menuOpen` (boolean, controlled BrandMenu)
- **3 useState** that v1.42.4 will move to hook: `appVersion` (string, IPC), `stencilOpen` (boolean, StencilWizard mount), `stencilFlagOn` (boolean, BrandMenu children inline conditional)
- **3 useEffect** that v1.42.4 will move to hook:
  - **Effect 1** (82-104, ~22 LoC): `getFeatureFlags` IPC fetch → sets `stencilFlagOn`
  - **Effect 2** (107-113, ~7 LoC): `stencil:open` CustomEvent listener on `window` → sets `stencilOpen`
  - **Effect 3** (119-143, ~25 LoC): `getAppVersion` IPC fetch → sets `appVersion` (with v1.11.4 PATCH-B + v1.12.0 PATCH D3 fallback chain)
- **1 hook call**: `useAppHeaderHandlers()` (v1.42.3, 22-field bundle)
- **3 sub-component mounts**: `<AppHeaderBrandMenu>` + `<AppHeaderActionBar>` + `<AppHeaderStatusBadge>`
- **1 inline mount**: `{stencilOpen && <StencilWizard onClose={...} />}`
- **1 import**: `refreshStencilFlag as refreshStencilFlagCache` (used in Effect 1)

## Hook extraction scope — `useAppHeaderShell`

### Internal state (lives inside hook)

- `useState<string>('…')` — `appVersion` (IPC fetch result)
- `useState<boolean>(false)` — `stencilOpen` (StencilWizard mount gate)
- `useState<boolean>(false)` — `stencilFlagOn` (feature flag gate)

### Internal effects (lives inside hook)

- **Effect 1**: `getFeatureFlags` IPC + `refreshStencilFlagCache()` → sets `stencilFlagOn`
- **Effect 2**: `window.addEventListener('stencil:open', handler)` → sets `stencilOpen`
- **Effect 3**: `getAppVersion` IPC + fallback chain → sets `appVersion`

### Public return surface

```typescript
export type AppHeaderShell = {
  readonly appVersion: string;
  readonly stencilOpen: boolean;
  readonly stencilFlagOn: boolean;
};

export function useAppHeaderShell(): AppHeaderShell;
```

**3 read-only state slots.** No setters exposed (all setStates are internal to the hook — no external trigger for `setStencilOpen` exists outside the `stencil:open` CustomEvent listener).

### What stays in AppHeader.tsx shell

- **1 useState**: `menuOpen` (boolean, controlled BrandMenu)
- **1 hook call**: `useAppHeaderShell()` + `useAppHeaderHandlers()`
- **3 sub-component mounts**: `<AppHeaderBrandMenu>` + `<AppHeaderActionBar>` + `<AppHeaderStatusBadge>`
- **1 inline mount**: `{stencilOpen && <StencilWizard onClose={() => setStencilOpen(false)} />}` — but `setStencilOpen` is internal to the hook now, so StencilWizard's onClose needs a different approach. **Decision**: StencilWizard's onClose handler dispatches a `stencil:close` CustomEvent that the hook listens for and calls its internal `setStencilOpen(false)`. Mirrors the existing `stencil:open` symmetry.

### Hook signature

```typescript
export type AppHeaderShell = {
  readonly appVersion: string;
  readonly stencilOpen: boolean;
  readonly stencilFlagOn: boolean;
};

export function useAppHeaderShell(): AppHeaderShell;
```

No arguments. Matches `useAppHeaderHandlers()` shape (closure-scoped hook, no args).

## Dependency ordering (T-by-T execution)

1. **T0** (this spec) — Per-flow analysis with cross-VC state coupling (this file).
2. **T1** — NEW `src/renderer/app/useAppHeaderShell.ts` (~80 LoC). Extract 3 useState + 3 useEffect. AppHeader.tsx unchanged in T1.
3. **T2** — Rewrite AppHeader.tsx shell. Replace 3 useState + 3 useEffect with a single `useAppHeaderShell()` call. Add `stencil:close` CustomEvent handler in hook for StencilWizard onClose. Shell becomes ~280 LoC.
4. **T3** — Tier 3 push + tag `v1.42.4` (PATCH) + GH release.

## Risk register

| Risk                                                                                                                   | Severity | Mitigation                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T2 single-commit rewrite of AppHeader.tsx (~135 LoC inline state+effects → 1 hook call) breaks compilation             | MEDIUM   | T1 lands the hook file independently first with full `tsc --noEmit + vitest run` GREEN; T2 is mechanical replacement                                                                                                                                                                                                       |
| `stencil:close` CustomEvent dispatch (new IPC channel for StencilWizard onClose) — does any existing code dispatch it? | LOW      | Verify via `grep -rn "stencil:close\|stencil:open" src/` — expect only `dispatch` (existing palette Cmd-K) for `stencil:open`; no `stencil:close` exists                                                                                                                                                                   |
| `refreshStencilFlagCache` import moves to hook                                                                         | LOW      | Hook imports `refreshStencilFlag as refreshStencilFlagCache` from `'../keyboard/shortcuts/palette.js'` (AppHeader.tsx imports it from `'../keyboard/shortcuts/palette.js'` — same path, works from hook too)                                                                                                               |
| StencilWizard onClose needs to call setStencilOpen(false)                                                              | MEDIUM   | Add `stencil:close` CustomEvent listener in hook; StencilWizard onClose dispatches it. Symmetric with existing `stencil:open` pattern. Verified by AppHeader.test.tsx stencil-wizard tests (existing tests dispatch `stencil:open` and verify StencilWizard mounts; new `stencil:close` listener mirrors the inverse path) |
| Marker-based replacement range error (lesson observation #2 from v1.42.2 + v1.42.3)                                    | LOW      | T2 python script anchors explicitly on the 3 useState + 3 useEffect cluster, with the marker validated against line count before applying                                                                                                                                                                                  |

## Pre-flight verify (lesson #10)

Before T1: `git fetch + git rev-list --count origin/main..HEAD + git ls-remote origin HEAD` → expect `HEAD = origin/main = af61dc8`; `git tag -l v1.42.*` → expect `v1.42.1 v1.42.2 v1.42.3`. After T1 + T2: `pnpm tsc --noEmit + pnpm vitest run` → expect 3124 + 7 SKIP / 0 fail.

## Target LoC

|                                                               | v1.42.3 baseline | v1.42.4 PATCH target |
| ------------------------------------------------------------- | ---------------- | -------------------- |
| `src/renderer/components/AppHeader.tsx`                       | 415 LoC          | **~280 LoC**         |
| `src/renderer/app/useAppHeaderShell.ts` (NEW)                 | —                | ~80 LoC              |
| `src/renderer/app/useAppHeaderHandlers.ts`                    | 366 LoC          | 366 LoC (no change)  |
| **Total LoC across renderer/app/ + components/AppHeader.tsx** | 781 LoC          | ~726 LoC             |

Net reduction: ~55 LoC (~7% reduction). v1.42.4 is the final YAGNI-defensive cleanup before this PATCH cycle gives way to a new feature cycle (v1.43.0 MINOR or PATCH feature work).

## What this PATCH does NOT do

- **Does NOT extract `useAppHeaderHandlers` further**: v1.42.3 already extracted the handler cluster. Further splits would require splitting state from handlers, which would add cross-state-closure complexity without benefit.
- **Does NOT extract `menuOpen` state**: `menuOpen` is the only shell useState that survives v1.42.4 because it's the **controlled state** for BrandMenu's render-prop pattern (BrandMenu is a controlled component). Hoisting it into a hook would force the hook to expose `setMenuOpen`, adding 1 prop to BrandMenu's API for no benefit.
- **Does NOT touch the 3 sub-components** (BrandMenu / ActionBar / StatusBadge): v1.42.2 extracted them. They are stable; no further extraction needed.
- **Does NOT add new functionality**: pure structural refactor.
