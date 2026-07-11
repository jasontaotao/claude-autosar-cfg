# v1.42.3 PATCH — AppHeader.tsx Handler Cluster Extraction (useAppHeaderHandlers)

**Released:** 2026-07-11
**Tag:** [`v1.42.3`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.42.3)
**Cycle type:** PATCH (closure-scoped hook extraction)
**Ship basis:** 3 source commits (T0 spec + T1 hook file + T2 shell rewrite)

## Summary

Reduces AppHeader.tsx by extracting its handler cluster into a closure-scoped hook `useAppHeaderHandlers()`. Mirrors the v1.42.1 T1-T4a per-flow hook extraction pattern but applied to AppHeader.tsx (a different file). After this PATCH:

| | v1.42.2 baseline | **v1.42.3** | Delta |
|---|---|---|---|
| `AppHeader.tsx` | 661 LoC | **415 LoC** | **−246 (−37.2%)** |
| `useAppHeaderHandlers.ts` (NEW) | — | 366 LoC | +366 |
| Tests | 3124 + 7 SKIP | 3124 + 7 SKIP | 0 |
| Functional change | — | **0** | — |

## Commits (3)

| # | Commit | Title | LoC |
|---|---|---|---|
| T0 spec | `ba8c709` | `docs(spec): v1.42.3 PATCH T0 -- useAppHeaderHandlers hook extraction analysis` | +126 LoC (NEW) |
| T1 | `65ab91e` | `refactor(renderer): v1.42.3 PATCH T1 -- create useAppHeaderHandlers hook (22-field bundle)` | +367 LoC (NEW) |
| T2 | `7c2ca37` | `refactor(renderer): v1.42.3 PATCH T2 -- rewrite AppHeader.tsx shell to use useAppHeaderHandlers hook` | +37 / −283 LoC |

## Hook surface — `useAppHeaderHandlers()`

```typescript
export type AppHeaderHandlers = {
  // 6 async handlers (`const` pattern, NOT useCallback — per v1.42.1
  // critical-honesty flag in devlog — no memoized consumers in AppHeader)
  onOpen: () => Promise<void>;
  onSave: () => Promise<void>;
  onSaveAll: () => Promise<void>;
  onProjectNew: () => Promise<void>;
  onProjectOpen: () => Promise<void>;
  onProjectSave: () => Promise<void>;
  // 1 useCallback (only one with explicit deps: [state.busy, locale, setStoreError])
  onCloseProjectClick: () => Promise<void>;
  // 3 derived predicates
  canSave: boolean;
  canSaveAll: boolean;
  canSaveProject: boolean;
  // 1 state slot (read-only — useState lives inside hook)
  state: AppHeaderState;
  // 11 store selectors (read-only — Zustand subscriptions)
  doc: ArxmlDocument | null;
  filePath: string | null;
  isActiveDirty: boolean;
  addDocument: (doc, filePath, options?) => void;
  setStoreError: (msg: string | null) => void;
  project: ProjectManifest | null;
  projectPath: string | null;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  dirtyPaths: ReadonlySet<string>;
  projectDirtyCount: number;
};

export function useAppHeaderHandlers(): AppHeaderHandlers;
```

**Total: 22 return fields.** No arguments (matches `useWizardHandlers()` / `useAppMainHandlers()` / `useFileViewerHandlers()` / `useDiagExtractHandlers()` shape from v1.42.1 T1-T4a).

## What stays in AppHeader.tsx shell

- **4 useState**: `appVersion` (with `getAppVersion` effect), `menuOpen` (controlled BrandMenu), `stencilOpen` (StencilWizard mount), `stencilFlagOn` (feature flag)
- **2 useEffect**: `getFeatureFlags` (refreshStencilFlagCache + setStencilFlagOn) + `stencil:open` CustomEvent listener + `getAppVersion` IPC fetch
- **3 sub-component mounts**: `<AppHeaderBrandMenu>` + `<AppHeaderActionBar>` + `<AppHeaderStatusBadge>` + their prop wiring
- **1 hook call**: `const { ...22 fields... } = useAppHeaderHandlers();`

## T2 critical-honesty flag (lesson observation #2 confirmation)

R2 mega-replacement (state selectors + handlers + predicates, lines 77-408) accidentally swallowed 3 additional shell `useState` (`appVersion`/`menuOpen`/`stencilOpen`/`stencilFlagOn`) + 3 `useEffect` (feature flag + stencil:open listener + getAppVersion IPC). This is the **same bug pattern as v1.42.2 T4 R3** — marker-based text replacement that anchors on a `const X = useState(...)` line catches the useState + useEffect cluster between that anchor and the next anchor (which is 332 LoC away in this case).

**Recovered inline** by adding all 7 hooks back into the R2 replacement text. **4 separate inline recoveries** in T2:
- (a) shell useState cluster (4 useState: `appVersion`/`menuOpen`/`stencilOpen`/`stencilFlagOn`)
- (b) 2 useEffects (feature flag + stencil:open listener)
- (c) getAppVersion useEffect (3rd useEffect)
- (d) `t` import (removed by R1 but still needed by BrandMenu children render-prop)

**Lesson candidate at 2/3 confirmations**: `marker-based-text-replacement-must-validate-block-contents-not-line-count` — needs 1 more natural observation in a future cycle to promote to standalone.

## NEW lessons promoted

**None**. v1.42.3 is mechanical hook extraction with the lesson pattern already covered by v1.42.1 T0 spec + D2 decision. The T2 R2 recovery observation is **2 of 3 confirmations** needed for the new `marker-based-text-replacement-must-validate-block-contents-not-line-count` lesson.

## Round-1 L8 file-size backlog

**9 of 9 closed** (unchanged from v1.42.2). v1.42.3 is opportunistic cleanup beyond the Round-1 cap.

## Test results

**3124 + 7 SKIP / 0 fail** (zero test delta — pure refactor). pnpm verify 7-stage GREEN. Identical test count to v1.42.2.

## Related documents

- **T0 spec**: `docs/superpowers/specs/2026-07-11-v1-42-3-patch-use-app-header-handlers.md`
- **CHANGELOG**: top entry of `CHANGELOG.md`
- **Devlog**: see `01-Projects/claude-AutosarCfg/development/devlog.md` 2026-07-11 entries
- **v1.42.2 ship notes** (AppHeader sub-components): `docs/release-notes/v1.42.2/README.md`
- **v1.42.1 ship notes** (App.tsx flows): `docs/release-notes/v1.42.1/README.md`

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)