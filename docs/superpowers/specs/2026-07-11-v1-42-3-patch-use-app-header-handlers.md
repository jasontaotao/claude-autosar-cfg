# v1.42.3 PATCH useAppHeaderHandlers Hook Extraction — AppHeader.tsx

**Author**: claude-AutosarCfg pre-T0 analysis controller
**Date:** 2026-07-11
**Status:** analysis (awaiting implementation; prerequisite for v1.42.3 T1-T2)
**Baseline:** `c368217` (v1.42.2 PATCH T5 ship, 3124 + 7 SKIP / 0 fail)
**Target:** AppHeader.tsx 661 → ~250 LoC shell + 1 NEW hook file (~280 LoC). 0 functional change.

## Goal

Continue the Round-1 L8 backlog closure momentum by extracting AppHeader.tsx's handler cluster into a closure-scoped hook `useAppHeaderHandlers()`. Mirrors the v1.42.1 T1-T4a per-flow hook extraction pattern (Flow 1 → `useAppMainHandlers`, Flow 2 → `useFileViewerHandlers`, etc.) but applied to a different file (AppHeader.tsx vs App.tsx). After this PATCH, AppHeader.tsx becomes a near-pure JSX shell with state binding + sub-component mounts.

**Round-1 L8 backlog status**: 9/9 closed by v1.42.2 (all entries now under 800 LoC). v1.42.3 is **beyond the Round-1 cap** — it's an opportunistic cleanup that simplifies AppHeader.tsx by ~400 LoC without introducing new sub-components or architectural patterns.

## Background — what was actually measured on `c368217`

**AppHeader.tsx (661 LoC)** measured 2026-07-11:

- **5 useState**: `state` (AppHeaderState, INITIAL), `appVersion` (string), `menuOpen` (boolean), `stencilOpen` (boolean), `stencilFlagOn` (boolean)
- **2 useEffect**: feature flag fetch (91-114), app version fetch (179-203)
- **1 useCallback**: `onCloseProjectClick` (332-378, ~46 LoC — async + 3-button confirm dialog flow)
- **6 `const` async handlers** (NOT useCallback — silent deviation from plan template, per v1.42.1 critical-honesty flag): `onOpen` (205-243, ~38 LoC), `onSave` (245-290, ~45 LoC), `onSaveAll` (301-314, ~13 LoC), `onProjectNew` (384-390, ~6 LoC), `onProjectOpen` (392-398, ~6 LoC), `onProjectSave` (400-406, ~6 LoC)
- **1 custom hook call**: `useProjectActions()` (154) → returns `{ newProject, openProjectFromDialog, saveProject }`
- **11 `const` store selectors** (Zustand subscriptions): `doc` (123), `filePath` (124), `isActiveDirty` (126-128), `addDocument` (129), `setStoreError` (138), `project` (140), `projectPath` (141), `locale` (143), `setLocale` (144), `dirtyPaths` (151), `projectDirtyCount` (417)
- **3 derived predicates**: `canSave` (408), `canSaveAll` (416), `canSaveProject` (418)
- **3 sub-component mounts**: `<AppHeaderBrandMenu>` + `<AppHeaderActionBar>` + `<AppHeaderStatusBadge>` (~80 LoC)
- **~250 LoC of comments + JSX skeleton** (sections ~12, 421-661)

## Hook extraction scope — `useAppHeaderHandlers`

### What moves to hook

**Internal state** (lives inside hook):

- `useState<AppHeaderState>(INITIAL)` — the `state.busy` flag that gates handlers
- `useProjectActions()` — destructured into `{ newProject, openProjectFromDialog, saveProject }`

**Public return surface** (`AppHeaderHandlers` type):

- **6 async handlers**: `onOpen`, `onSave`, `onSaveAll`, `onProjectNew`, `onProjectOpen`, `onProjectSave`
- **1 useCallback**: `onCloseProjectClick`
- **3 derived predicates**: `canSave`, `canSaveAll`, `canSaveProject`
- **1 state slot** (read-only): `state`
- **11 store selectors** (read-only): `doc`, `filePath`, `isActiveDirty`, `addDocument`, `setStoreError`, `project`, `projectPath`, `locale`, `setLocale`, `dirtyPaths`, `projectDirtyCount`

Total: **22 return fields** + internal state + 1 internal hook call.

### What stays in AppHeader.tsx shell

- **4 useState**: `appVersion` (with `getAppVersion` effect), `menuOpen` (controlled BrandMenu), `stencilOpen` (StencilWizard mount), `stencilFlagOn` (feature flag)
- **2 useEffect**: `getFeatureFlags` (91-114) + `getAppVersion` (179-203)
- **1 sub-component destructure**: `const { ... } = useAppHeaderHandlers()`
- **3 sub-component mounts**: `<AppHeaderBrandMenu>` + `<AppHeaderActionBar>` + `<AppHeaderStatusBadge>` + their prop wiring

### Hook signature

```typescript
export type AppHeaderHandlers = {
  // 6 async handlers (no useCallback — `const` pattern per v1.42.1 critical-honesty flag)
  onOpen: () => Promise<void>;
  onSave: () => Promise<void>;
  onSaveAll: () => Promise<void>;
  onProjectNew: () => Promise<void>;
  onProjectOpen: () => Promise<void>;
  onProjectSave: () => Promise<void>;
  // 1 useCallback
  onCloseProjectClick: () => Promise<void>;
  // 3 derived predicates
  canSave: boolean;
  canSaveAll: boolean;
  canSaveProject: boolean;
  // 1 state slot (read-only)
  state: AppHeaderState;
  // 11 store selectors (read-only — Zustand subscriptions)
  doc: ArxmlDocument | null;
  filePath: string | null;
  isActiveDirty: boolean;
  addDocument: (doc: ArxmlDocument, path: string, opts?: AddDocumentOptions) => void;
  setStoreError: (msg: string | null) => void;
  project: Project | null;
  projectPath: string | null;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  dirtyPaths: ReadonlySet<string>;
  projectDirtyCount: number;
};

export function useAppHeaderHandlers(): AppHeaderHandlers;
```

No arguments (matches `useWizardHandlers()` / `useAppMainHandlers()` / `useFileViewerHandlers()` / `useDiagExtractHandlers()` shape from v1.42.1 T1-T4a).

## Dependency ordering (T-by-T execution)

1. **T0** (this spec) — Per-flow analysis with cross-VC state coupling (this file).
2. **T1** — NEW `src/renderer/app/useAppHeaderHandlers.ts` (~280 LoC). Extract 6 async handlers + 1 useCallback + 3 predicates + 11 selectors + internal state. **AppHeader.tsx unchanged in T1** (hook created but not yet consumed).
3. **T2** — Rewrite AppHeader.tsx shell. Replace 6 inline handlers + 1 useCallback + 3 predicates + 11 store selectors with a single `useAppHeaderHandlers()` call. Shell becomes ~250 LoC.
4. **T3** — Tier 3 push + tag `v1.42.3` (PATCH) + GH release.

## Risk register

| Risk                                                                                                                                                            | Severity | Mitigation                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T2 single-commit rewrite of AppHeader.tsx (~411 LoC inline handlers → 1 hook call) breaks compilation                                                           | MEDIUM   | T1 lands the hook file independently first with full `tsc --noEmit + vitest run` GREEN (no callers yet, so type errors will surface immediately); T2 is mechanical replacement            |
| `onCloseProjectClick` useCallback dep array includes `[state.busy, locale, setStoreError]` — needs `state.busy` from hook's `useState`, which is fine           | LOW      | All deps are stable: `setStoreError` is Zustand action ref; `locale` only changes via `setLocale` (so deps re-evaluate); `state.busy` is from the same hook's useState                    |
| 6 `const` async handlers stay as `const` (NOT useCallback) per v1.42.1 deviation                                                                                | LOW      | Pre-existing pattern; no plan to convert (per v1.42.1 critical-honesty flag in devlog). Handlers are created per render anyway — useCallback would add dep-array overhead without benefit |
| Hook return field count = 22 — large destructure in shell                                                                                                       | LOW      | Pre-existing pattern from v1.42.1 T1 (`useAppMainHandlers` had 13 fields, T3 had 5 fields). Shell destructures all 22 fields in one statement at the top                                  |
| `addDocument` store action signature — AppHeader.tsx imports types `ArxmlDocument` and `AddDocumentOptions` — hook needs to re-export or shell imports directly | LOW      | Hook file imports the types from `../../shared/types` and re-exports them via the `AppHeaderHandlers` type. Shell doesn't need to import types separately                                 |

## Pre-flight verify (lesson #10)

Before T1: `git fetch + git rev-list --count origin/main..HEAD + git ls-remote origin HEAD` → expect `HEAD = origin/main = c368217`; `git tag -l v1.42.*` → expect `v1.42.1 v1.42.2`. After T1 + T2: `pnpm tsc --noEmit + pnpm vitest run` → expect 3124 + 7 SKIP / 0 fail.

## Target LoC

|                                                  | v1.42.2 baseline | v1.42.3 PATCH target |
| ------------------------------------------------ | ---------------- | -------------------- |
| `src/renderer/components/AppHeader.tsx`          | 661 LoC          | **~250 LoC**         |
| `src/renderer/app/useAppHeaderHandlers.ts` (NEW) | —                | ~280 LoC             |
| **Total LoC**                                    | 661 LoC          | ~530 LoC             |

Net reduction: ~131 LoC (~20% reduction across the AppHeader file). The hook file adds new structure (TBDoc + imports + types) that the inline code didn't need, so the net reduction is smaller than the raw line delta suggests.

## What this PATCH does NOT do

- **Does NOT extract `appVersion` `useEffect`**: appVersion is owned by the shell because it's wired into the `<AppHeaderStatusBadge>` component via prop. Moving the effect to the hook would force the hook to return `appVersion` + `setAppVersion`, which the sub-component doesn't need (it receives `appVersion` via prop from shell). Keep effect in shell.
- **Does NOT extract `menuOpen` / `stencilOpen` / `stencilFlagOn` state**: these are tightly coupled to the JSX sub-component mounts (`<AppHeaderBrandMenu menuOpen={menuOpen}>` and `{stencilOpen && <StencilWizard />}` and `{stencilFlagOn && <button>...}` inline in BrandMenu children). Hoisting them into a hook would force the hook to return them, adding indirection without benefit.
- **Does NOT touch the 3 sub-components** (BrandMenu / ActionBar / StatusBadge): v1.42.2 PATCH already extracted them. They are stable; no further extraction needed.
