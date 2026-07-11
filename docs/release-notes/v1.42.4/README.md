# v1.42.4 PATCH — AppHeader.tsx Shell Lifecycle Extraction (useAppHeaderShell)

**Released:** 2026-07-11
**Tag:** [`v1.42.4`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.42.4)
**Cycle type:** PATCH (closure-scoped hook extraction)
**Ship basis:** 3 source commits (T0 spec + T1 hook file + T2 shell rewrite)

## Summary

Final cleanup pass on AppHeader.tsx after v1.42.2 (sub-components) + v1.42.3 (handler cluster hook). Extracts the 3 remaining shell useState + 3 useEffect into a closure-scoped hook `useAppHeaderShell()`. After this PATCH:

| | v1.42.3 baseline | **v1.42.4** | Delta |
|---|---|---|---|
| `AppHeader.tsx` | 415 LoC | **362 LoC** | **−53 (−12.8%)** |
| `useAppHeaderShell.ts` (NEW) | — | 141 LoC | +141 |
| Tests | 3124 + 7 SKIP | 3124 + 7 SKIP | 0 |
| Functional change | — | **0** | — |

## Commits (3)

| # | Commit | Title | LoC |
|---|---|---|---|
| T0 spec | `8c2d4d8` | `docs(spec): v1.42.4 PATCH T0 -- useAppHeaderShell hook extraction analysis` | +116 LoC (NEW) |
| T1 | `1c515f1` | `refactor(renderer): v1.42.4 PATCH T1 -- create useAppHeaderShell hook (4-field bundle)` | +142 LoC (NEW) |
| T2 | `dc9f606` | `refactor(renderer): v1.42.4 PATCH T2 -- rewrite AppHeader.tsx shell to use useAppHeaderShell hook` | +15 / −68 LoC |

## Hook surface — `useAppHeaderShell()`

```typescript
export type AppHeaderShell = {
  /** App version string from `getAppVersion` IPC + v1.11.4 PATCH-B
   *  fallback chain. Read-only. */
  readonly appVersion: string;
  /** StencilWizard mount gate. `true` when Cmd-K palette dispatched
   *  `stencil:open`. Read-only. */
  readonly stencilOpen: boolean;
  /** Feature flag gate for Stencil Wizard menu entry. Read-only. */
  readonly stencilFlagOn: boolean;
  /** Imperative close action for StencilWizard — passed as
   *  `<StencilWizard onClose={closeStencil} />`. */
  readonly closeStencil: () => void;
};

export function useAppHeaderShell(): AppHeaderShell;
```

**4 return fields**: 3 read-only state + 1 imperative close. No arguments.

## What stays in AppHeader.tsx shell

- **1 useState**: `menuOpen` (boolean, controlled BrandMenu — render-prop pattern requires shell to own state)
- **2 hook calls**: `useAppHeaderShell()` + `useAppHeaderHandlers()`
- **3 sub-component mounts**: `<AppHeaderBrandMenu>` + `<AppHeaderActionBar>` + `<AppHeaderStatusBadge>`
- **1 inline mount**: `{stencilOpen && <StencilWizard onClose={closeStencil} />}`

## T2 critical-honesty flag — lesson promotion

R2 mega-replacement (anchor: `const [appVersion, setAppVersion]` to closing `}, []);` of getAppVersion effect) accidentally swallowed `menuOpen` state (which was the 4th useState before R2 anchors). First vitest run: **76 tests failed with `ReferenceError: menuOpen is not defined`**. Recovered by adding `const [menuOpen, setMenuOpen] = useState(false);` back to R2 new text. All 3124 tests passed post-restore.

**This is the 3rd confirmation of `marker-based-text-replacement-must-validate-block-contents-not-line-count`**:
1. **v1.42.2 T4 R3**: Python script's R3 replacement accidentally swallowed `getAppVersion` useEffect along with 3 menu useEffect — 3048 chars covered 6 effects not 3. Recovered inline.
2. **v1.42.3 T2 R2**: Python script's R2 replacement anchored on `const [state, setState]` to `const canSaveProject` accidentally swallowed 3 additional shell useState + 3 useEffect — 14570 chars / 332 LoC range included all hooks between anchors. 4 inline recoveries.
3. **v1.42.4 T2 R2**: Python script's R2 replacement anchored on `const [appVersion, setAppVersion]` accidentally swallowed `menuOpen` state. Recovered inline.

**PROMOTED TO STANDALONE LESSON** at 3/3 confirmations. Process Cluster catalog updated 13 → 14 lessons.

## NEW lessons promoted

**1**:
- `marker-based-text-replacement-must-validate-block-contents-not-line-count` (NEW Tier 10 in Process Cluster) — When using marker-based text replacement (Python `must_replace` pattern with `find`/`replace` or anchor-based heuristics), validate the block's actual contents (count useState / useEffect / useCallback / useRef) before applying, NOT just trust the line count or char count. A 2174-char block could contain 3 hooks or 4 hooks depending on what landed between the anchors. The pattern: count the actual hook declarations in the source range, write a marker that anchors on the FIRST hook in the cluster, and let the script consume everything until the LAST hook's closing brace — NOT a fixed char-count window. Promoted 2026-07-11 (3/3 confirmations in 1 session — v1.42.2 T4 + v1.42.3 T2 + v1.42.4 T2).

## Round-1 L8 file-size backlog

**9 of 9 closed** (unchanged from v1.42.2). v1.42.4 is opportunistic cleanup beyond the cap.

## Test results

**3124 + 7 SKIP / 0 fail** (zero test delta — pure refactor). pnpm verify 7-stage GREEN.

## Related documents

- **T0 spec**: `docs/superpowers/specs/2026-07-11-v1-42-4-patch-use-app-header-shell.md`
- **CHANGELOG**: top entry of `CHANGELOG.md`
- **Devlog**: see `01-Projects/claude-AutosarCfg/development/devlog.md` 2026-07-11 entries
- **v1.42.3 ship notes** (useAppHeaderHandlers): `docs/release-notes/v1.42.3/README.md`
- **v1.42.2 ship notes** (sub-components): `docs/release-notes/v1.42.2/README.md`
- **v1.42.1 ship notes** (App.tsx flows): `docs/release-notes/v1.42.1/README.md`

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)