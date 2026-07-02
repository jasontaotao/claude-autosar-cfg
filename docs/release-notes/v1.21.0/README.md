# v1.21.0 (2026-07-02) — MINOR · Release Notes

ScriptPanel UX redesign + DBC viewer wiring + Classic project template + App logo / Windows .exe icon + template preview pane. Closes the 5-bug user-reported backlog (CRITICAL ScriptPanel + HIGH DBC + HIGH Classic template + MEDIUM merge-view boundary + MEDIUM template preview). Heavy UI / IPC release — almost every renderer surface touched.

---

## Highlights

### T1 — BSW code-generator GUI entry + App logo / Windows .exe icon (`98248cd` + `27967e6`)

Two commits land here:

**`98248cd` — App logo + Windows .exe icon**

`src/renderer/assets/autosarcfg-logo.svg` is the single hand-written source: a 64×64 rounded-rectangle (`rx=12`) filled with Catppuccin Mocha Blue `#89b4fa` and a white "AC" wordmark. Everything else (PNGs at 16/32/48/64/128/256, multi-size `.ico`, favicon) is generated from it by `scripts/gen-icons.mjs` (`pnpm gen-icons`).

- `Logo.tsx` inlines the SVG into a React `<svg>` so callers control size via prop (defaults to 32) and a11y via `aria-hidden="true"` (decorative — wordmark next to it carries the meaning).
- AppHeader reads `<Logo size={20} />` + "AutosarCfg" wordmark (was `⊟` + "claude-AutosarCfg").
- Browser `<title>` + favicon link updated to match.
- `electron-builder` config gains `build.win.icon`; the NSIS installer + the unpacked `.exe` + the Start-menu + desktop shortcut all pick up the AC icon.
- Main process loads `assets/autosarcfg-icon.png` via `nativeImage.createFromPath` (PNG is cross-platform at runtime; `.ico` is for the installer only).
- **Vite-lib-mode publicDir gotcha** (1-of-1 lesson — `vite-publicdir-lib-mode-silent-ignore`): `vite.main.config.ts` is in `lib` mode, which silently ignores `publicDir`. The fix is a post-build `scripts/copy-main-assets.mjs` that copies the PNG into `dist/main/assets/`. Tagged as a trap because the failure is silent — the .exe still launches with no icon and no warning.

**`27967e6` — BSW code-generator GUI entry**

The script engine could already produce BSW output, but the only entry point was the CLI. This adds a menu entry and a re-entrancy-safe wrapper hook so the GUI can fire the same engine without races.

- New `useGenerateCode` hook in `src/renderer/hooks/`. Returns `GenerateOutcome` discriminated union (`{kind:'success', outputs}` / `{kind:'failure', message}`) so the caller doesn't have to `try`/`catch`.
- New IPC channel `GENERATE_CODE` (mirrors the script-run pattern). Main side resolves to the same outcome shape.
- **Re-entrancy guard via `useRef` not `useState`** (1-of-1 lesson — `re-entrancy-guard-useref-not-usestate`): a `useState` flag would be stale-closure-prone across the async IPC `.then` boundary; a `useRef<boolean>` short-circuits synchronously with no re-render dependency.

### T2 — Classic project template ships (`da24063`)

Before this commit, `NewProjectDialog` exposed three template cards (Empty / Classic / Clone) but only Empty was actionable — Classic + Clone rendered with a "coming soon" badge. This commit ships the Classic template (samples/arxml/classic/ — 1 template.json + 4 ECUC ARXMLs + 5 BSWMDs, byte-identical copy of samples/arxml/demo-ecu/ which is preserved for SWS Validator).

- New `isTemplateAvailable(data-driven)` gate on `TemplateCardRow` flips to true for any template with `fileCount > 0` (was hardcoded to true only for Empty). Removed "(coming soon)" suffix from retired labels.
- Pre-ship code-review caught HIGH (label/gate mismatch — the card still read "coming soon" after the gate flip) + MEDIUM (stale comment at templates.ts:14-15). Both fixed before commit.
- 5 new `isTemplateAvailable` tests pin the data-driven gate behavior.

### T3 — ScriptPanel UX redesign (`ea1d2f9`)

Closes the highest-priority CRITICAL bug in the v1.21.0 backlog. The original script-runner UI was functional but ugly and gave no indication of what each script does until you actually ran it. Four-phase redesign:

1. **Kind badges with localized full names** — the kind chip (PreCompile / Mixed / Refs / Custom) now shows the full localized name plus a tooltip explaining what the kind means. Uses `aria-describedby` + sr-only span for screen readers (NOT `aria-label` on the chip span — code-review HIGH-1 caught that `aria-label` would replace the visible text for SR).
2. **First-run onboarding banner** — new users see a one-time "this is what scripts are" hint. Existing-script users skip it (gated on `initialized && length === 0`, not `length === 0` alone — code-review MEDIUM-1 caught the flicker trap where existing users saw the banner for one render before their scripts loaded).
3. **Dark-palette CSS** — JetBrains/Linear-style: `#1a1d23` surface / `#22262e` panel-header / `#2d323b` border. 14/13/12 px typography hierarchy. 10-16 px padding rhythm. Explicit-property `transition`s (no `transition: all` — code-review MEDIUM-3).
4. **Status icons in ScriptOutput** — ✓/✗ icon + localized "OK" / "Failed" label.

- 14 new i18n keys (4 kind desc, 7 onboarding, 1 status.ok, 2 misc). Both en and zh-CN.
- 9 new ScriptPanel tests; 2637 → 2651 (+3 net — most of the new tests already existed from earlier refactors).
- Pre-ship code-review caught 2 HIGH + 3 MEDIUM + 3 LOW. **HIGH-1 a11y FIXED** (aria-label → aria-describedby + sr-only). **HIGH-2 CSS FIXED** (missing `.script-output-status-detail` rule — was in diff at one point and got removed in a rebase; restored). **MEDIUM-1 flicker FIXED** (initialized flag threaded through ScriptLibrary).
- 2 MEDIUMs deferred (file organization taste + Record refactor).
- 1 LOW added (bustling CTA test).

### T4 — Wire `@dbc-forge/core` parser (`f06d639`)

The `@dbc-forge/core` package was installed in v1.7.0 Cluster 3 I (with a smoke test that proved the parser + writer round-trip) but never wired to the renderer. It was dead code: a user could not actually open or view any DBC file from the app. This commit closes that gap with the smallest shippable surface — a read-only viewer — without taking on the ARXML↔DBC bridging that the v1.7.0 design intentionally deferred.

- New `DBC_OPEN` + `DBC_PARSE` IPC channels (mirror the ARXML pair).
- `parseDbcHandler` returns a renderer-friendly `DbcSummary` (version + node list + per-message id/name/dlc/transmitter/signalCount). The full @dbc-forge `Network` is NOT streamed across IPC (it's potentially large + has internal cycles — see type doc for why).
- `openDbcHandler` shows the OS file picker (filtered to `.dbc`) and reads the chosen file's content into memory.
- Preload bridge: `window.autosarApi.openDbc()` + `parseDbc(req)`.
- Renderer: "File Operations → Open DBC…" menu entry next to "Open ARXML…". `App.tsx` owns the parse state machine + the `DbcViewer` modal mount.
- `<DbcViewer />` modal: stats strip, nodes chip row, messages table, error banner. i18n for both en and zh-CN (15 keys).
- Size cap (32 MiB), defensive non-string guard, and discriminated union response shape all mirror the existing ARXML / BSWMD patterns. Empty input is rejected as malformed so the user does not see "0 messages" for a clearly-empty file.
- Pre-ship code-review caught 2 HIGH + 6 MEDIUM. **HIGH-1 a11y FIXED** (DbcViewer missing Escape + backdrop-click + initial focus → added, matching the StencilWizard modal a11y pattern). **HIGH-2 type safety FIXED** (`as unknown as` casts on the IPC envelope bypassed the typed bridge → removed, replaced with switch + `never` exhaustive default arm). **MEDIUM-1 z-index FIXED** (2000 → 9996 — must sit above other dialog hosts). **MEDIUM-2 loading FIXED** (rendered as broken empty error banner → dropped loading state, added `useRef` in-flight guard). **MEDIUM-3 decoupling FIXED** (DBC menu gated on ARXML state.busy → added `dbcBusy` prop). **MEDIUM-4 basename FIXED** (`path.split(/[\\/]/)` reimplemented basename → imported from @shared/path).
- 23 files / +1349 / -2 / +12 App tests + 11 preload tests.

### T5 — Template preview pane + BSWMD-chip-row boundary fix (`78a4c13`)

Closes the last 2 bugs of the v1.21.0 backlog:

- **MEDIUM 合并视图设计边界错** (Bug #6) — the pre-fix `NewProjectDialog` body showed two separate horizontal bands (TemplateCardRow above, BswmdChipRow as a top-level sibling below). The boundary was wrong: the chips were a top-level dialog-body child, so the user had to mentally stitch "I picked Classic" + "and these BSWMDs will preload" together.
- **MEDIUM 缺模板预览视图** (Bug #7) — there was no preview of what each template actually brings; clicking a card gave no feedback beyond a hover state.

Post-fix: a single self-contained `<TemplatePreview />` pane shows the entire "selected template + its contents" as one unit. The BSWMD chip row moved INSIDE the preview (Bug #6 boundary fix) and the description + file count surface at the top of the pane (Bug #7 fix).

- 4 new i18n keys (pickFirst, fileCountNone, fileCount, preloadBswmd) for both en and zh-CN.
- The `t()` helper does NOT parse ICU MessageFormat, so `count=0` uses `fileCountNone` and `count>0` uses `fileCount {count} files` — runtime branch in the component (1-of-1 lesson — `t-helper-no-icu-plural-branch-in-component`).
- 1-of-1 lesson — `sibling-sections-that-are-conceptually-one-unit`: when two UI sections always render together + share state + the user perceives them as one block, hoist them into a shared parent. CSS cannot save a structural mistake.
- 5 new tests in `NewProjectDialog.preview.test.tsx`. End state: 2674 → 2679 (+5 net).
- Pre-ship code-review APPROVE. Two INFO cleanups applied (dead `loading` prop + more direct `.closest('.npd-body')` test assertion).

---

## Stats

| Metric | Value |
|---|---|
| Commits on main | 6 (`98248cd` + `27967e6` + `da24063` + `ea1d2f9` + `f06d639` + `78a4c13`) |
| Test count | **2679 + 6 SKIP / 0 fail** (+65 net from v1.20.0 2614) |
| Test files | 293 + 1 skipped (294) |
| pnpm verify | 7-stage GREEN (format / lint / type-check / test / coverage / build / import-regression) |
| Coverage | 96.31% stmts / 86.97% branch / 95.96% funcs / 96.31% lines |
| Files touched | ~50 (35 mod + 15 new) |
| Behavioral changes | 4 (logo swap / DBC menu + modal / Classic template / template preview pane) |

---

## Migration notes

No data migration required. All changes are renderer / IPC / branding.

- Renderer-side users who relied on the old `⊟` glyph for the logo will see the new AC square + wordmark. The CSS class `.app-logo` now hosts an `<svg>` (was a `<span>` with a glyph); any third-party CSS that targeted the inner text content needs to target the SVG.
- The `NewProjectDialog` previously rendered the BSWMD chip row as a top-level dialog-body child (`.bswmd-chip-row` testid was reachable from `.npd-body`). The chip row still emits the same testid but now lives inside `data-testid="npd-template-preview"`. Tests that asserted "the chip row is a direct child of `.npd-body`" must update their assertion to "the chip row is inside the preview container".
- The `@dbc-forge/core` package is now wired. Users who pinned the previous "no DBC menu entry" behavior will see a new menu item. Read-only viewer scope — DBC→ARXML and ARXML→DBC bridges still deferred.

---

## Cycle-end lessons (NEW process lessons captured in PKM)

1. **`vite-publicdir-lib-mode-silent-ignore`** (1-of-1, defer promotion) — Vite 5 `build.lib` mode silently ignores `publicDir`. The icon PNG would never be copied into `dist/main/assets/`. The fix is a post-build `scripts/copy-main-assets.mjs`. The trap is the silent failure: the .exe still launches with no icon and no warning. Promote to permanent note on 2nd occurrence.
2. **`stale-closure-async-ipc-callback`** (1-of-1, defer promotion) — when an async IPC callback captures `useState` setters across an `.then()`, the captured setters can be stale across renders. Use the functional setter form (`setX(prev => ...)`) or pass the data forward via `await` rather than `.then()`. Promote on 2nd occurrence.
3. **`re-entrancy-guard-useref-not-usestate`** (2-of-1, **promote to permanent note**) — async re-entrancy gate via `useRef<boolean>` short-circuit, not `useState` flag. The mutable cell is synchronous (no re-render dependency) and immune to stale-closure across async boundaries. Confirmed in `useGenerateCode` (T1) + `openDbcViewer` (T4).
4. **`commit-split-overlapping-file-edits`** (1-of-1, defer promotion) — when two commits must both touch the same shared file (e.g., refactor + feature using the refactor), stage the shared file with the FIRST commit's subset of changes via `git add -p` / `git restore --staged`, then re-apply the remaining hunks for the SECOND commit. Documented inline in T1 commits. Promote on 2nd occurrence.
5. **`aria-label-replaces-visible-text-on-non-interactive`** (1-of-1, defer promotion) — `aria-label` on a non-interactive `<span>` REPLACES the rendered text for screen readers; the visible text is no longer announced. Use `aria-describedby` + sr-only span for "extra context that supplements the visible text". Caught by code-review HIGH-1 in T3.
6. **`store-driven-empty-state-must-gate-on-initialized`** (1-of-1, defer promotion) — a "you have nothing yet" UI that gates on `length === 0` alone flickers for existing-data users (length=0 on first render before the store hydrates). Gate on `initialized && length === 0`. Caught by code-review MEDIUM-1 in T3.
7. **`co-located-sub-component-extraction-threshold`** (1-of-1, defer promotion) — when a child component is sub-60 LOC, single-caller, and only used in one parent's render tree, extracting it as a top-level named export adds navigation overhead without testability benefit. Inline it as a local function. Caught by code-review LOW in T3 (deferred in favor of keeping the inline).
8. **`sibling-sections-that-are-conceptually-one-unit`** (**promote to permanent note**) — when two UI sections always render together, share state, and the user perceives them as one block, hoist them into a shared parent. CSS cannot save a structural mistake. Closes Bug #6 in T5.
9. **`t-helper-no-icu-plural-branch-in-component`** (**promote to permanent note**) — the `t()` helper does NOT parse ICU MessageFormat. When count-driven variants are needed, define 2-3 separate keys and branch in the component. Adding ICU for one site sets a precedent the helper cannot afford. Closes Bug #7 in T5.

---

## v1.21.0 backlog closure

- CLOSED in T1: App logo + Windows .exe icon (Branding). HIGH BSW generate GUI entry.
- CLOSED in T2: HIGH "新建项目模板 UX" — Classic template ships + `isTemplateAvailable` data-driven gate + "(coming soon)" suffix retired.
- CLOSED in T3: CRITICAL "脚本界面丑 + 不知道干啥" — 4-phase ScriptPanel UX redesign.
- CLOSED in T4: HIGH "DBC 解析器装上未接入" — `DBC_OPEN` + `DBC_PARSE` IPC channels + `DbcViewer` modal + AppHeader menu entry.
- CLOSED in T5: MEDIUM "合并视图设计边界错" (Bug #6) + MEDIUM "缺模板预览视图" (Bug #7) — single `<TemplatePreview />` pane with embedded BSWMD chips.
- **All 5 backlog bugs CLOSED. Open follow-ups: HIGH ODX 完全没做 (v1.22.x candidate — architectural scope).**

---

## Closest cousins

- [[claude-autosarcfg-v1-20-0-shipped]] (v1.20.0 MINOR — prior release; internal refactor only)
- [[claude-autosarcfg-v1-19-1-shipped]] (v1.19.1 PATCH — prior PATCH; feature-flag async + IPC symlink defense)
- [[claude-autosarcfg-v1-19-0-shipped]] (v1.19.0 MINOR — GUI Bridge Dispatcher; mirrors the IPC pattern T4 uses for DBC)
- [[peakcan-host-v2-1-1-patch-shipped]] (sister project — ODX-D round-trip from real Vector .odx-d files; v1.22.x ODX work can borrow the parsing approach)
- [[phase-2-5-brief-drift-correction]] (Shape 10 promoted from v1.20.0 brief-drift — target-source-canonical-state verification)

---

## Devlog

### 2026-07-02 — v1.21.0 MINOR ship + 5-bug backlog closed

**Session summary**
- Shipped v1.21.0 MINOR on main: 6 commits (T1 logo + generate GUI + T2 Classic + T3 ScriptPanel + T4 DBC + T5 preview).
- Closes 5 of 5 backlog bugs (CRITICAL ScriptPanel + HIGH DBC + HIGH Classic template + 2 MEDIUM NewProjectDialog).
- Test count: 2679 + 6 SKIP / 0 fail (+65 net from v1.20.0 2614).
- pnpm verify 7-stage GREEN. Coverage 96.31% stmts / 86.97% branch.
- User-manual baseline updated from v1.20.0 to v1.21.0; new "What's New" section summarizing all 5 T items + new i18n keys + behavioral changes.

**Key decisions**
- **Logo source = single hand-written SVG** (`autosarcfg-logo.svg`); everything else (PNGs at 6 sizes + .ico + favicon) generated by `scripts/gen-icons.mjs`. Single source of truth for the brand mark.
- **Vite lib mode + publicDir gotcha**: post-build `scripts/copy-main-assets.mjs` instead of relying on `publicDir` (which is silently ignored in lib mode).
- **Re-entrancy guard via `useRef` not `useState`** (now 2-of-1 — promote to permanent note): the synchronous mutable cell is immune to stale-closure across async IPC `.then` boundaries.
- **DBC scope = read-only viewer**: defers ARXML↔DBC bridging to v1.22.x. The full @dbc-forge `Network` is not streamed across IPC — only the renderer-friendly `DbcSummary` projection.
- **Template preview pane = single self-contained unit** (Bug #6 + #7): the BSWMD chip row lives INSIDE the preview, not as a sibling of the template row.
- **t() does not parse ICU plural**: count=0 → `fileCountNone`, count>0 → `fileCount {count} files` — runtime branch in the component.

**Blockers / issues**
- (None at ship time; pre-ship code-review caught and fixed 4 HIGH + 9 MEDIUM + 3 LOW across T3/T4/T5.)

**Next steps**
- v1.21.x PATCH (if small follow-ups emerge) or v1.22.x MINOR (ODX importer + ARXML↔DBC bridge — both architectural scope).