# claude-AutosarCfg v1.6.0 Cluster W — First-Run Onboarding Design

**Date**: 2026-06-21
**Author**: Cluster W spec writer (post-brainstorm)
**Status**: DRAFT (pending user review)
**Type**: MINOR bump (new user-visible feature)
**Cluster**: W — First-Run Onboarding (bundled Demo ECU + 5-step tour)
**Source brainstorm memory**: [[claude-AutosarCfg-v1-6-brainstorm]]
**Predecessor spec**: [[2026-06-21-v1-5-1-foundation-design]]
**Sibling specs**: A+C Headless CLI v1 / G SWS Validator / U Keyboard-First Power User (separate specs)

---

## 0. Why W

claude-AutosarCfg v1.5.1 ships a powerful BSW configuration GUI but offers
nothing to a first-time user. The most common uninstalled-to-uninstalled
path in the brainstorm was "opened the app, didn't know what to click,
closed". Cluster W closes this gap with two parts:

1. **Bundled Demo ECU** — a known-good Com/ComM/CanIf/EcuC ARXML pair that
   ships in `samples/arxml/demo-ecu/` (extending the existing template
   system). Users can pick it from the existing NewProjectDialog preset
   picker.
2. **5-step UI tour** — a first-run overlay that walks new users through
   the four-pane workspace (left Project / middle ECUC / right Properties)
   and the Save → Export ARXML loop. Auto-detected on first launch
   (no project + no tour history + feature flag on).

Together these compress the time-to-first-edit from "explore for 10
minutes" to "click 'Take tour' → 90 seconds → have a working saved
project".

### Out of scope (v1.6.0 W explicitly does NOT deliver)

- ❌ Tour for the Script Engine panel (covered by U Keyboard spec)
- ❌ ARXML Import wizard tour (Sprint 14 already shipped; no re-tour needed)
- ❌ Cross-platform packaging polish (deferred; covered in brainstorm follow-ups)
- ❌ Locale-deep scripting docs (deferred; W uses existing i18n parity only)
- ❌ Multi-ECU Demo (one Demo ECU only — see Risks)
- ❌ Tour for schema editor (no schema editor in v1.6.0)
- ❌ Headless CLI / SWS Validator / Keyboard shortcuts (separate clusters)

---

## 1. User Stories

### US-W1 — First-time installer

> As a developer who just installed AutosarCfg for the first time,
> when I launch the app, I see a non-blocking welcome card offering
> a 5-step tour and a one-click "Load Demo ECU" button. The tour
> highlights the four panes and a Save → Export flow against the
> Demo ECU. After completing (or skipping) the tour, the welcome
> card never reappears unless I reset it from Settings.

**Acceptance**: Welcome card visible within 5 s of first launch. "Skip"
hides it; reload-of-app-within-7-days does not re-show it. Demo ECU
loads in ≤ 500 ms after one click.

### US-W2 — Returning user who closed without saving

> As a developer who installed the app a week ago, dismissed the
> tour after step 2, and never opened a project, when I relaunch the
> app, the welcome card is **gone** (7-day suppress window
> elapsed) and the app boots straight to the empty workspace.
> I can still load the Demo ECU from the NewProjectDialog preset.

**Acceptance**: No tour-related UI after the suppress window. Demo ECU
still discoverable via NewProjectDialog preset picker (existing path).

### US-W3 — Power user who never wants the tour

> As a power user who already knows the workspace, I open the
> project, click "Help → Reset onboarding tour" in the AppHeader
> menu (or never — the tour stays hidden because I started with a
> project). I never see the welcome card.

**Acceptance**: Tour never fires if any project has been opened in the
local profile, regardless of feature flag. Manual "Show tour" entry
point lives in AppHeader menu (covered by U Keyboard spec — W
references it but does not implement).

---

## 2. Architecture & Components

### 2.1 Layer overview

```
┌────────────────────────────────────────────────────────────────────┐
│  Renderer (React)                                                  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  <TourRoot />   — portal'd overlay (z-index 9996)            │  │
│  │  ├── <TourSpotlight />   — single-step UI (target + bubble)  │  │
│  │  └── <TourProgress />    — "Step 2 of 5" footer              │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  <WelcomeCard />  — first-launch entry (AppHeader-level)     │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  useTourStore  (zustand slice)                                │  │
│  │  ├── state: TourState (idle | running | completed | dismissed│  │
│  │  │         | suppressed)                                     │  │
│  │  ├── actions: start / advance / back / skip / complete /     │  │
│  │  │            reset                                          │  │
│  │  └── selectors: shouldShowWelcome, currentStep, isLastStep   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  Main process (Electron) — unchanged                               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  IPC: tour:reset  (clears persisted tour state)              │  │
│  │  IPC: demo-ecu:load  (returns Demo ECU manifest + paths)     │  │
│  │  Template: samples/arxml/demo-ecu/  (existing template system│  │
│  │  discovers it; no new infra needed)                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### 2.2 Module responsibilities

| Module                                                | Responsibility                                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/renderer/onboarding/TourRoot.tsx`                | Portal'd overlay host. Reads `useTourStore`; renders nothing in `idle` / `suppressed` / `dismissed` / `completed` states. |
| `src/renderer/onboarding/TourSpotlight.tsx`           | Single-step card: target element rect (via `data-tour-id` selector), bubble with title + body + prev/next/skip, dimmed backdrop. |
| `src/renderer/onboarding/WelcomeCard.tsx`             | First-launch card in AppHeader area. Two CTAs: "Take tour" + "Load Demo ECU". Auto-hides on first state transition. |
| `src/renderer/onboarding/useTourStore.ts`             | Zustand slice (`tourSlice`) added to existing `useArxmlStore` via PR(5)-style composition.                      |
| `src/renderer/onboarding/tourSteps.ts`                | Static step definitions (5 entries × i18n key × target selector). Pure data.                                     |
| `src/renderer/onboarding/DemoEcuLoader.ts`            | Hook wrapping existing NewProjectDialog submit with the `demo-ecu` template pre-selected.                         |
| `src/main/ipc/tourHandlers.ts`                        | IPC: `tour:reset`, `tour:state-get`, `tour:state-set`. Persists `tourState` + `tourDismissedAt` to `userData/tour.json`. |
| `samples/arxml/demo-ecu/` (template directory)        | 1 `template.json` + 1-2 value-side ARXML + 1 BSWMD. Discovered by existing `discoverBuiltinTemplates`.           |
| `src/shared/i18n.ts` (extend)                         | 12 new keys (5 step titles + 5 step bodies + 2 buttons). Parity test enforces EN + ZH.                            |
| `config/featureFlags.ts` (NEW — see §2.3)             | Renderer-side flag lookup, mirrors `arxml-stream/feature-flag.ts` pattern.                                     |

### 2.3 Feature flag

W requires a **renderer-side** feature flag (existing `arxml-stream/feature-flag.ts`
only handles main-process flags). New file `config/featureFlags.ts`:

```ts
// Read at boot from the same settings.json the main process reads,
// but routed through IPC because the renderer cannot fs.readFileSync.
// Mirrors arxml-stream/feature-flag.ts API.
export function isOnboardingEnabled(): boolean;
export function readFeatureFlags(): Promise<FeatureFlags>;
```

`FeatureFlags` shape:

```ts
interface FeatureFlags {
  readonly experimental: {
    readonly onboarding: boolean;     // v1.6.0 W
    readonly streaming: boolean;      // passthrough from main (v1.5.1)
    readonly indexedDb: boolean;     // passthrough from main (v1.5.1)
  };
  readonly keyboardFirst: boolean;    // mirrors experimental.keyboardFirst; v1.6.0 U
}
```

**Default**: `experimental.onboarding = false`. To opt in:
```jsonc
// <APPDATA>/claude-autosarcfg/settings.json
{ "experimental": { "onboarding": true, "keyboardFirst": true } }
```

**`keyboardFirst` field rationale (per F1 follow-up)**: U spec §6.4
defines `experimental.keyboardFirst` (the wire/source field). W's
renderer-side `FeatureFlags` interface flattens this to a top-level
`keyboardFirst: boolean` so W's `useFeatureFlag('keyboardFirst')`
selector can short-circuit render-time keyboard handlers without
traversing the `experimental.*` namespace. The renderer reads the
flat field; the IPC passthrough to main still uses the nested
`experimental.keyboardFirst` (U spec owns the canonical wire shape).

### 2.4 Tour step target wiring

Each pane already has stable React root elements. W adds a minimal
`data-tour-id` attribute scheme (no DOM changes beyond attributes):

| `data-tour-id`   | Wired by                              | Used in step |
| ---------------- | ------------------------------------- | ------------ |
| `app-header`     | `AppHeader.tsx` root                 | Step 1 (intro) |
| `left-panel`     | `LeftPanel.tsx` root                  | Step 2 (project panel) |
| `arxml-panel`    | `ArxmlPanel.tsx` root                 | Step 3 (ECUC editor) |
| `right-pane-content` | (new wrapper on the right pane body; NOT G's bottom-docked `ValidationPanel`; see §2.4 Note) | Step 4 (right pane) |
| `app-save`       | `AppHeader` save button (existing)   | Step 5 (Save flow) |
| `app-export`     | new dropdown entry (Save As → ARXML) | Step 5 (Export) |

Selector resolution uses `document.querySelector('[data-tour-id="..."]')`.
If selector misses (e.g., user in a workspace variant without the
target), the tour falls back to a centered bubble with a "Continue"
button (no spotlight) — see §6 Error Handling.

**Note (per C4 review, 2026-06-21)**: W Step 4 "Properties panel"
refers to the **right-pane content area** (`right-pane-content`,
selector above). This is **independent** of G cluster's
`ValidationPanel` (bottom-docked per G spec §2 G7). The two must not
visually or functionally collide — confirmed via W peer reviewer C2
and adversarial audit C4 cross-check. W does NOT piggyback on G's
panel; if G is OFF, W tour Step 4 still resolves to the renderer's
default right pane.

### 2.5 Demo ECU template

`samples/arxml/demo-ecu/` directory layout (extends existing
`samples/arxml/<id>/` template convention from `samples/README.md`):

```
samples/arxml/demo-ecu/
├── template.json         // { id: "demo-ecu", displayName: "Demo ECU", description: "..." }
├── demo.autosarcfg.json  // project manifest (SoT for H2; both GUI template-discovery
│                         //   AND A+C CLI manifest-driven loader consume this file;
│                         //   see §3.1.x Manifest schema for the TS interface contract)
├── bswmd/
│   ├── Bsw_Com_Bswmd.arxml    // Com BSWMD (subset)
│   ├── Bsw_ComM_Bswmd.arxml   // ComM BSWMD (subset)
│   ├── Bsw_CanIf_Bswmd.arxml  // CanIf BSWMD (subset)
│   ├── Bsw_EcuC_Bswmd.arxml   // EcuC BSWMD (subset)
│   └── Bsw_PduR_Bswmd.arxml   // PduR BSWMD (subset; required for SWS_PDUR_ROUTING_COMPLETE coverage)
├── EcuC_Config.arxml          // ~30 KB value-side, 5 containers, 12 params
├── Com_Config.arxml           // ~20 KB value-side, 3 signals, 2 PDUs (+ 1 intentional SWS violation — see below)
├── CanIf_Config.arxml         // ~10 KB value-side
├── ComM_Config.arxml          // ~5 KB value-side
└── PduR_Config.arxml          // ~10 KB value-side
```

**Total bundle**: ~150 KB (5 BSWMDs + 5 value ARXMLs, vs original proposal 100 KB).
**PduR rationale**: G's C3 starter rule `SWS_PDUR_ROUTING_COMPLETE` needs PduR BSWMD + value-side to demonstrate. Without PduR the G cluster can't end-to-end exercise the rule against the bundled Demo ECU.

**Intentional SWS violation** (per NEW-Q-A, locked 2026-06-21): `Com_Config.arxml` contains 1 ComIPdu with a `ComPduId` that duplicates another ComIPdu's `ComPduId`. This triggers G cluster's C1 starter rule `SWS_COM_PDUID_UNIQUE`. The violation is **demo-ECU-only** — it exists so W tour Step 4's right-pane spotlight lands on a container whose `PropertiesPanel` shows a validation error tooltip (visible "the tool found a problem" signal for first-run users). No real-world ECU is affected; the welcome card tooltip "Demo ECU has 1 intentional SWS violation for tour demo purposes" surfaces this.

The template is auto-discovered by the existing
`discoverBuiltinTemplates` (no changes needed there). The first-run
welcome card's "Load Demo ECU" button drives the existing
NewProjectDialog submit with this template pre-selected.

**Open question (Risks §6)**: Com/ComM/CanIf/EcuC vs single-module —
locked in §6 Q1.

### 2.6 Reset entry ownership (W ships IPC only; U wires menu)

The `tour:reset` IPC channel is **defined and shipped by W** (Wave 1,
PR W-1). The actual **UI entry** that calls it (AppHeader `Help →
Reset onboarding` menu, plus optional `Cmd+Shift+R` binding) is owned
by **U cluster** (Wave 2, PR U-5 or U-6).

**Merge wave order (locked 2026-06-21)**: W PR(W-1) lands **first** to
publish the IPC contract; U PR(U-5) depends on it. Until U ships, the
reset entry is **not present** in the UI — W does NOT ship a placeholder
menu entry (per H5 review consensus; avoids dead UI). Reference: W peer
reviewer H3 + U peer reviewer H3 cross-confirmed.

US-W3 acceptance ("manual Show tour entry") is therefore **gated on U
shipping**; plan-stage enforcement via merge wave order documented in
synthesizer report §8.

---

## 3. API / Interface Contract

### 3.1 Tour state machine

```
                  ┌────────────────────────────────┐
                  ▼                                │
              ┌───────┐  start()                ┌────────┐
   boot  ───▶ │ idle  │ ────────────────────▶  │running │ ─┐
              └───────┘                        └────────┘  │
                  ▲                                 │       │
   reset()        │                                 ▼       │
              ┌──────────┐  skip() / last-step next()   ┌──────────┐
              │dismissed │ ◀─────────────────────────── │completed │
              └──────────┘                              └──────────┘
                  │                                         │
                  │   any state ── 7-day timer elapsed ─────┘
                  │             (only re-fires on explicit reset)
                  ▼
            ┌────────────┐
            │suppressed  │   (terminal; tour never re-fires unless reset)
            └────────────┘
```

**Transitions** (every arrow is an explicit action; no implicit):

| From       | Event          | To          | Side effect                                              |
| ---------- | -------------- | ----------- | -------------------------------------------------------- |
| `idle`     | `start()`      | `running`   | `currentStep = 0`, render TourRoot                       |
| `running`  | `advance()`    | `running` or `completed` | If last step: `completed`; else `currentStep++`     |
| `running`  | `back()`       | `running`   | `currentStep--` (clamped at 0)                            |
| `running`  | `skip()`       | `dismissed` | Persist `dismissedAt = Date.now()`; hide TourRoot        |
| `completed`| (none)         | `completed` | Persist `completedAt`; mark `tourCompleted: true`        |
| any        | `reset()` (IPC)| `idle`      | Clear persisted state                                    |
| any        | 7-day timer    | `suppressed`| Compute on boot: `now - dismissedAt > 7 days`            |

**Terminal states**: `completed`, `dismissed`, `suppressed`. None can
transition out except via explicit `reset()` (Settings menu, not in W
scope; U Keyboard spec will add the menu entry).

### 3.2 IPC channels (new)

```ts
// Main process
'ipcMain.handle('tour:state-get', () => Promise<TourPersistedState>);
'ipcMain.handle('tour:state-set', (_e, state: TourPersistedState) => Promise<void>);
'ipcMain.handle('tour:reset', () => Promise<void>);
'ipcMain.handle('feature-flags:get', () => Promise<FeatureFlags>);  // passthrough

// Demo ECU
'ipcMain.handle('demo-ecu:load', () => Promise<DemoEcuManifest>);
```

### 3.3 Tour slice API (renderer)

```ts
// src/renderer/store/slices/tourSlice.ts  (composed into useArxmlStore)
export interface TourSlice {
  readonly tour: TourState;
  readonly startTour: () => void;
  readonly advanceTour: () => void;
  readonly backTour: () => void;
  readonly skipTour: () => void;
  readonly resetTour: () => Promise<void>;
  readonly shouldShowWelcome: () => boolean;  // selector
}

export type TourState =
  | { kind: 'idle'; currentStep: 0; dismissedAt: number | null; completedAt: number | null; validationPaused: boolean }
  | { kind: 'running'; currentStep: 0 | 1 | 2 | 3 | 4; validationPaused: boolean }
  | { kind: 'completed'; validationPaused: boolean }
  | { kind: 'dismissed'; validationPaused: boolean }
  | { kind: 'suppressed'; validationPaused: boolean };

// Persisted across launches:
export interface TourPersistedState {
  readonly dismissedAt: number | null;       // epoch ms
  readonly completedAt: number | null;       // epoch ms
  readonly lastShownVersion: string | null;  // '1.6.0' — bumps re-arm if changed
}
```

### 3.4 Demo ECU manifest

```ts
export interface DemoEcuManifest {
  readonly templateId: 'demo-ecu';
  readonly displayName: string;
  readonly bswmdPaths: readonly string[];
  readonly valueArxmlPaths: readonly string[];
  readonly estimatedLoadMs: number;  // measured at startup; surfaced in welcome card
}
```

#### 3.4.1 Project Manifest File Schema (`demo.autosarcfg.json`) — NEW per H2

The `demo.autosarcfg.json` file in `samples/arxml/demo-ecu/` is the **single
source of truth** for both GUI template discovery (existing
`discoverBuiltinTemplates`) and A+C CLI manifest-driven loading
(`autosarcfg read --project ./samples/arxml/demo-ecu/`). The TypeScript
schema, locked 2026-06-21 per synthesizer H2:

```ts
/**
 * Canonical project manifest for a bundled or user-saved AutosarCfg project.
 * Schema version `1` (locked v1.6.0; bumping requires `manifestVersion: '2'`).
 *
 * SoT for H2: both renderer `discoverBuiltinTemplates` and A+C CLI
 * `autosarcfg read` parse this manifest. A+C plan-stage imports this
 * interface verbatim (no fork).
 */
export interface DemoEcuManifestFile {
  readonly manifestVersion: '1';
  readonly bswmds: ReadonlyArray<string>;        // relative paths to bswmd/*.arxml
  readonly valueArxmls: ReadonlyArray<string>;   // relative paths to *.arxml value-side
  readonly intentionalViolations: ReadonlyArray<{  // surfaces visible SWS errors in tour
    readonly ruleId: string;        // e.g. 'SWS_COM_PDUID_UNIQUE'
    readonly path: string;          // ECUC path within project (e.g. '/Com/ComConfig/ComIPdu/...')
  }>;
}
```

**Required fields**: all four (`manifestVersion`, `bswmds`, `valueArxmls`,
`intentionalViolations`). Missing `manifestVersion` → reject as
"unsupported manifest format" (no silent default). Empty
`intentionalViolations: []` is valid; bundled Demo ECU ships with **1**
intentional violation per NEW-Q-A (see §2.5).

**Resolution semantics**:

- All `bswmds` / `valueArxmls` entries are **relative paths** resolved
  against the manifest's containing directory. Absolute paths and
  parent-directory `..` traversal are rejected at parse time (path
  containment hardening; per v1.1.2 H2 follow-up).
- Duplicates within `bswmds` or `valueArxmls` are de-duplicated
  (preserve insertion order).
- `intentionalViolations[].path` is matched **as a literal string**
  against G cluster's `InternalValidatorResult.path` field; if a rule
  fires on a different path, the entry is ignored (no false
  suppression of real bugs).

**Parsing**: ≤ 50 ms for the bundled Demo ECU manifest (~1 KB). Plan stage
adds a unit test asserting `JSON.parse + zod-validate` under 50 ms on a
cold-start Node 20 runtime.

**Cross-spec contract (locked per H2)**: A+C spec plan-stage imports
`DemoEcuManifestFile` from `src/shared/project-manifest.ts` (NEW file;
SoT lives in shared per the v1.5.1 PR(5) split convention). A+C spec
§10.6 row 4 ("W Demo ECU loaded via CLI") cross-references this
section as the manifest schema SoT (per Round 3 fix, 2026-06-21; the
previous reference to §10.2 was a phantom — A+C §10.2 is "Integration
tests", not a manifest cross-reference).

### 3.5 i18n key contract

12 new keys (parity test enforces EN + ZH):

| Key                                       | EN                                                  | ZH                              |
| ----------------------------------------- | --------------------------------------------------- | ------------------------------- |
| `onboarding.welcome.title`                | "Welcome to AutosarCfg"                             | "欢迎使用 AutosarCfg"            |
| `onboarding.welcome.body`                 | "Take a quick tour or load a sample project."       | "快速浏览或加载示例工程。"        |
| `onboarding.welcome.ctaTour`              | "Take tour"                                         | "开始引导"                       |
| `onboarding.welcome.ctaDemo`              | "Load Demo ECU"                                     | "加载 Demo ECU"                  |
| `onboarding.welcome.ctaSkip`              | "Skip"                                              | "跳过"                           |
| `onboarding.step1.title`                  | "This is your project header"                       | "这是项目顶栏"                   |
| `onboarding.step1.body`                   | "Open, save, and switch language from here."        | "在此打开、保存、切换语言。"      |
| `onboarding.step2.title`                  | "Project panel on the left"                         | "左侧是项目面板"                 |
| `onboarding.step2.body`                   | "Manage BSWMDs and ECUC files here."                | "在此管理 BSWMD 与 ECUC 文件。"  |
| `onboarding.step3.title`                  | "ECUC editor in the middle"                         | "中间是 ECUC 编辑器"             |
| `onboarding.step3.body`                   | "Browse the parameter tree and edit values."        | "浏览参数树并编辑数值。"          |
| `onboarding.step4.title`                  | "Properties on the right"                           | "右侧是属性面板"                 |
| `onboarding.step4.body`                   | "Inspect and edit the selected parameter."          | "查看与编辑选中参数。"            |
| `onboarding.step5.title`                  | "Save and export"                                   | "保存与导出"                     |
| `onboarding.step5.body`                   | "Save your project; export ARXML for your toolchain."| "保存工程；为工具链导出 ARXML。"  |
| `onboarding.controls.next`                | "Next"                                              | "下一步"                         |
| `onboarding.controls.back`                | "Back"                                              | "上一步"                         |
| `onboarding.controls.skip`                | "Skip tour"                                         | "跳过引导"                       |
| `onboarding.controls.finish`              | "Finish"                                            | "完成"                           |
| `onboarding.progress.label`               | "Step {current} of {total}"                         | "第 {current} / {total} 步"      |
| `tour.coordination.validationPaused.title`  | "Validation paused during tour"                  | "引导期间暂停校验"               |
| `tour.coordination.validationPaused.message` | "Background validation is paused while the tour is running. It resumes after you finish or skip the tour." | "引导运行期间后台校验已暂停；完成或跳过引导后恢复。" |
| `flags.keyboardFirst.label`               | "Keyboard-first mode"                            | "键盘优先模式"                    |
| `flags.keyboardFirst.description`          | "Enable U cluster's keyboard navigation palette (experimental). Mirrors `experimental.keyboardFirst`." | "启用 U 集群的键盘导航面板（实验性）。镜像 `experimental.keyboardFirst`。" |

(24 keys total — 20 onboarding + 2 tour-coordination + 2 flags-keyboardFirst; exceeds the 12 minimum.)

### 3.6 Events (no new IPC; pure renderer)

- `tour:started` — dispatched when `startTour()` fires (consumed by analytics / logs only)
- `tour:completed` — last step advanced; no consumer required
- `tour:skipped` — user clicked Skip; welcome card hides

### 3.7 Tour ↔ G Validator coordination — NEW per H3

G cluster's GUI validation runs on a 300ms debounce after every edit
(see G spec §3 line 153 + G §11 R4). When W tour runs simultaneously
(e.g., during Step 3 `arxml-panel` spotlight where the user types into
ECUC fields to "browse the parameter tree and edit values" per §3.5
step3.body), G fires background validation runs that:

- Surface `ValidationPanel` results (potentially competing for focus
  with W's tour overlay)
- Consume CPU during step animations → tour stutter

**Coordination contract** (locked 2026-06-21 per synthesizer H3):

1. **`TourState.validationPaused: boolean`** (added in §3.3, every
   variant of the union carries this field). Semantics:
   - `validationPaused: true` throughout the `running` state (all 5
     `currentStep` values 0-4 — the union type restricts `currentStep`
     to `0 | 1 | 2 | 3 | 4` for the `running` variant, so every
     `running` step qualifies).
   - `validationPaused: false` for all other states (`idle`,
     `completed`, `dismissed`, `suppressed`). Validation resumes on
     `completed` / `dismissed` / `suppressed`.
2. **`tourSlice` writes**: `validationPaused: true` on
   `startTour()`; `validationPaused: false` on `completeTour()`,
   `skipTour()`, `backTour()` (any state leaving `running`).
3. **IPC event**: W's `tourSlice` publishes
   `tour:state-changed` with payload `{ state: TourState, validationPaused: boolean }`
   to the renderer event bus (no new IPC channel; pure in-process via
   the existing `useArxmlStore.subscribe()`). G's `swsValidatorSlice`
   subscribes to this event and updates its own `paused: boolean`
   cache.

   **Canonical source for `tour:state-changed` propagation** (locked
   Round 3, 2026-06-21): in-process via `useArxmlStore.subscribe()`.
   G spec §3.9 + A+C spec §10.6 row 8 reference this design. **No new
   IPC channel added in v1.6.0** — both consumers (G validator debounce
   gate + A+C integration test observer) subscribe within the renderer
   process; headless CLI does not observe tour state (no tour in CLI).
4. **G debounce handler**: G's `ValidationEngine.run()` debounce
   callback (300ms after edit) MUST early-return when
   `useSwsValidatorStore.getState().paused === true`. Spec wording for
   G's plan editor (G §4.5 update):
   > "Validation debounce skips when `useTourStore.tour.kind === 'running'` (cross-store coupling; 3 LOC change in `swsValidatorSlice` debounce gate). Early-return: `if (tourState.kind === 'running') return [];`"

**Why event-based, not store-import**: `useSwsValidatorSlice` and
`useTourSlice` are both composed into `useArxmlStore` (per v1.5.1
PR(5) split). Cross-slice reads via `useArxmlStore.getState()` would
couple slices at the import level; event subscription decouples
build-time and keeps the slice module graph one-directional (G does
not import W, W does not import G).

**i18n**: §3.5 / §6 adds 2 keys
(`tour.coordination.validationPaused.title` / `.message`) — see §6
update.

**Future refactor (v1.7.0+)**: a unified orchestrator could replace
this event-subscription pattern. W §9 risks R-NEW tracks this.

---

## 4. Data Model

### 4.1 Persisted state (new)

File: `<userData>/tour.json`. Schema:

```ts
interface TourPersistenceFile {
  readonly version: 1;
  readonly dismissedAt: number | null;
  readonly completedAt: number | null;
  readonly lastShownVersion: string | null;  // semver
}
```

Atomic write (same pattern as PR(4) `applyMutation` — write to
`tour.json.tmp` → fsync → rename). Max file size: 200 bytes. Lives in
Electron `app.getPath('userData')`.

**Persistence helper SoT** (per C5 audit + final-fix doc-rot pass 2026-06-21):
`writeAtomic()` is defined at `src/main/ipc/projectSaveHandler.ts:50`
(verified during v1.6.0 final fix — the spec's earlier claim of
`src/main/arxml/mutation.ts` was incorrect; the actual export lives
in the project-save handler module). Tour state JSON persistence
MUST `import { writeAtomic } from 'main/ipc/projectSaveHandler.js'`
rather than re-implement the atomic-write pattern. Plan stage verifies
the exact export signature + line range at plan-write time.

Reference: v1.5.1 PR(4) `applyMutation` commit `5b99ac3`,
file `src/main/ipc/projectSaveHandler.ts`. (Earlier synthesizer
draft correctly identified this location; the user's final spec
edit was mis-keyed to `src/main/arxml/mutation.ts`; the final-fix
agent corrected the path back to the real export site.)

### 4.2 In-memory types (new)

```ts
// Step definitions — pure data, no runtime side effects
export interface TourStepDef {
  readonly index: 0 | 1 | 2 | 3 | 4;
  readonly targetId: string;        // matches data-tour-id attribute
  readonly titleKey: string;        // i18n key
  readonly bodyKey: string;         // i18n key
  readonly placement: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

export const TOUR_STEPS: readonly TourStepDef[] = [
  { index: 0, targetId: 'app-header',        titleKey: 'onboarding.step1.title', bodyKey: 'onboarding.step1.body', placement: 'bottom' },
  { index: 1, targetId: 'left-panel',        titleKey: 'onboarding.step2.title', bodyKey: 'onboarding.step2.body', placement: 'right' },
  { index: 2, targetId: 'arxml-panel',       titleKey: 'onboarding.step3.title', bodyKey: 'onboarding.step3.body', placement: 'left' },
  { index: 3, targetId: 'right-pane-content',  titleKey: 'onboarding.step4.title', bodyKey: 'onboarding.step4.body', placement: 'left' },
  { index: 4, targetId: 'app-save',          titleKey: 'onboarding.step5.title', bodyKey: 'onboarding.step5.body', placement: 'bottom' },
] as const;
```

### 4.3 Reused existing types

- `TemplateManifest` (from `src/main/templates/types.ts`) — Demo ECU is a vanilla template
- `ArxmlState` (from `useArxmlStore.ts`) — `tourSlice` composes in via existing slice pattern

### 4.4 Demo ECU manifest example (`samples/arxml/demo-ecu/demo.autosarcfg.json`) — NEW per H2

The actual manifest file shipped in the bundle (per §3.4.1 schema, locked
2026-06-21):

```json
{
  "manifestVersion": "1",
  "bswmds": [
    "bswmd/Bsw_Com_Bswmd.arxml",
    "bswmd/Bsw_ComM_Bswmd.arxml",
    "bswmd/Bsw_CanIf_Bswmd.arxml",
    "bswmd/Bsw_EcuC_Bswmd.arxml",
    "bswmd/Bsw_PduR_Bswmd.arxml"
  ],
  "valueArxmls": [
    "EcuC_Config.arxml",
    "Com_Config.arxml",
    "CanIf_Config.arxml",
    "ComM_Config.arxml",
    "PduR_Config.arxml"
  ],
  "intentionalViolations": [
    {
      "ruleId": "SWS_COM_PDUID_UNIQUE",
      "path": "/Com/ComConfig/ComIPdu/ComIPdu_1/ComPduId"
    }
  ]
}
```

This manifest lists all 5 BSWMDs and 5 value-side ARXMLs from the §2.5
directory layout, and declares **1 intentional violation**
(`SWS_COM_PDUID_UNIQUE` duplicate `ComPduId` on `ComIPdu_1`) per NEW-Q-A
so that W tour Step 4's `right-pane-content` spotlight lands on a
container whose `PropertiesPanel` shows a visible validation error
tooltip for first-run users.

**Validation**: parsed at welcome-card load (renderer) and CLI
`autosarcfg read` invocation (main process via A+C). Both consumers use
the same zod schema defined in `src/shared/project-manifest.ts` (NEW
file, per v1.5.1 PR(5) split convention).

---

## 5. Error Handling

### 5.1 Tour target missing

If `document.querySelector('[data-tour-id="..."]')` returns null:

1. Log a single console.warn (no stack trace — common/coding-style.md spirit)
2. Render a centered fallback bubble (no spotlight)
3. Continue to next step on advance

This handles workspace variants (e.g., if `right-pane-content` is hidden
in some future view) without breaking the tour.

### 5.2 Demo ECU load failure

If `discoverBuiltinTemplates` does not return `demo-ecu`:

1. Welcome card's "Load Demo ECU" button shows disabled state with tooltip "Demo ECU unavailable"
2. Tour still runs (no Demo ECU step in W — see US-W1)
3. Console.warn once; no UI error toast

### 5.3 Feature flag OFF

If `experimental.onboarding === false`:

1. `useTourStore` initializes to `suppressed` on mount (skipping `idle`)
2. `<TourRoot />` renders nothing (early return)
3. `<WelcomeCard />` does not mount
4. **Net effect**: zero overhead, zero UI, zero IPC for the tour system

This matches v1.5.1's "feature flags default OFF = v1.5.0 behavior"
invariant.

### 5.4 i18n key missing

Already handled by existing parity test + `t()` fallback to key
literal. W adds no new failure mode.

### 5.5 Persistence write failure

If `<userData>/tour.json` write fails (disk full / permission):

1. `tourSlice` keeps in-memory state; user can still complete tour
2. Tour will re-fire on next launch (worse UX but not broken)
3. Console.warn with `kind: 'persistence-failed'`
4. No user-visible error (silent recovery — consistent with v1.5.1 IndexedDB pattern)

### 5.6 Reset race

If user clicks "Reset" in AppHeader menu (U spec) while tour is running:

1. `resetTour()` IPC clears persistence
2. Tour state goes to `idle`
3. Welcome card reappears on next boot
4. No data loss; in-memory state discards

---

## 6. Testing Strategy

### 6.1 Unit tests (Vitest)

| Module                               | Cases | Notes                                                          |
| ------------------------------------ | ----- | -------------------------------------------------------------- |
| `useTourStore` (slice)               | 8     | All 7 transitions × state machine coverage; reset clears persistence |
| `tourSteps.ts` (data)                | 3     | Index/key parity; 5 entries; placement values valid              |
| `tourPersistence.ts` (main IPC)      | 5     | Atomic write; corrupted JSON recovery; missing file → defaults |
| `featureFlags.ts` (renderer)         | 4     | Flag OFF → suppressed; flag ON → idle; passthrough for streaming/indexedDb |
| `WelcomeCard.tsx`                    | 5     | Visible when idle; hidden when dismissed/completed/suppressed; CTAs call correct handlers |
| `TourSpotlight.tsx`                  | 6     | Renders target selector; missing target → centered fallback; prev/next/skip buttons functional |
| `DemoEcuLoader.ts`                   | 3     | Calls existing `submitNewProject({ templateId: 'demo-ecu' })`; failure path disables button |
| `project-manifest.ts` (NEW shared)   | 5     | Validates `demo.autosarcfg.json` per §3.4.1 schema: missing fields reject, duplicate paths dedupe, `..` traversal rejects, parse ≤ 50 ms, intentional-violations path literal-match against `InternalValidatorResult.path` |

**Total new unit tests**: ~34

### 6.2 Integration tests (Vitest + Testing Library)

| Test                                            | Verifies                                                       |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `TourRoot.integration.test.tsx`                 | Mount with App shell → 5 steps render → end → state `completed` |
| `WelcomeCard.flow.test.tsx`                     | Boot → idle → click "Take tour" → `running` → first step visible |
| `featureFlag.suppress.test.tsx`                 | Flag OFF → TourRoot renders null → WelcomeCard not in tree     |
| `persistence.roundtrip.test.tsx`                | Dismiss tour → reload (mock IPC) → state persists → 7-day timer advances via clock mock |
| `demoEcu.template-discovery.test.ts`            | `samples/arxml/demo-ecu/template.json` exists → discovered     |

**Total new integration tests**: ~5

### 6.3 E2E tests (Playwright)

`tests/e2e/onboarding.spec.ts`:

| Test                                          | Verifies                                                          |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `first-run shows welcome card`                | Fresh app boot → welcome card visible in 5 s                     |
| `take tour advances 5 steps`                  | Click "Take tour" → step 1-5 → "Finish" → card gone               |
| `skip tour persists for 7 days`               | Click "Skip" → reload → card stays hidden; clock advance 7 d → card reappears on reset only |
| `demo ecu loads in under 500ms`               | Click "Load Demo ECU" → project open with bswmd + value arxml within 500 ms |
| `feature flag off hides everything`           | settings.json `{ experimental: { onboarding: false } }` → no tour UI ever |
| `right-pane-content missing falls back`         | Mock missing target → step 4 renders centered bubble → advance still works |
| `keyboard escape skips tour`                  | Press Esc on any step → tour dismisses (handled by U spec; W test verifies hook exists) |

**Total new E2E tests**: ~7

### 6.4 Coverage gate

| Type                | Threshold                                  |
| ------------------- | ------------------------------------------ |
| New slice + state machine | 100% stmts / 100% branches (per ECC common testing.md spirit) |
| New IPC handlers    | ≥ 90% stmts / ≥ 80% branches               |
| New components      | ≥ 85% stmts / ≥ 75% branches               |
| New i18n keys       | Parity test (existing pattern)             |
| **Total project**   | **≥ 95.5% stmts / ≥ 87% branches** (hold v1.5.1 bar) |

### 6.5 TDD workflow

Per project convention + `common/testing.md`:

1. RED: write failing test for state machine transition
2. GREEN: minimal impl
3. IMPROVE: add edge cases (missing target, flag OFF, persistence failure)
4. Subagent-driven: 3 sequential subagents (state+store, components+i18n, integration+e2e) + code-reviewer gate

---

## 7. Migration / Backward Compatibility

### 7.1 Existing first-load behavior — UNCHANGED

When `experimental.onboarding = false` (default):

- App boots identically to v1.5.1
- `useArxmlStore` shape unchanged (tourSlice adds fields but with default-`suppressed` initial state)
- No new UI mounts
- No new IPC handlers called (renderer never invokes `tour:*` channels)
- Bundle size delta: ≤ 30 KB gzipped (tourSlice + components, tree-shaken when flag OFF)

### 7.2 Tour state shape — additive only

`useArxmlStore` adds `tour: TourState` field. All existing selectors
untouched. The 5 existing test files (`App.test.tsx`,
`AppHeader.test.tsx`, etc.) need **zero** updates — they do not read
the `tour` field.

### 7.3 Demo ECU template — additive

`samples/arxml/demo-ecu/` is a new directory. Existing
`discoverBuiltinTemplates` (no changes) picks it up. Existing
NewProjectDialog (no changes) shows it as one more preset.

### 7.4 Persistence file — new, scoped

`<userData>/tour.json` is new. App startup does not fail if missing
(treated as `{ dismissedAt: null, completedAt: null, lastShownVersion: null }`).
Corrupted JSON falls back to defaults with a console.warn (same pattern
as `arxml-stream/feature-flag.ts`).

### 7.5 Feature flag — additive

`config/featureFlags.ts` reads `settings.json` via IPC passthrough
(main process already reads the file for v1.5.1 streaming/indexedDb).
No schema change to `settings.json`.

---

## 8. Risks & Open Questions

### 8.1 Risks (registered with mitigations)

| #  | Risk                                                       | Likelihood | Impact | Mitigation                                                                                          |
| -- | ---------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------- |
| R1 | **Demo ECU domain choice** (Com/ComM/CanIf/EcuC+PduR vs single) | M          | M      | Lock to **mixed (Com+ComM+CanIf+EcuC+PduR)** — covers 80% of users' first question; PduR added so G's C3 rule has fixture coverage. See NEW-Q-A. |
| R2 | **Bundled asset size** (Demo ECU ≈ 150 KB total)           | M          | L      | 150 KB is acceptable; templates/ already enabled via `extraResources` in package.json.              |
| R3 | **Tour spotlight jank** on workspace variants              | M          | M      | Centered-fallback bubble when target missing (see §5.1); tested in E2E.                              |
| R4 | **Skip button position** (top-right vs bottom)             | L          | L      | A/B not justified at v1.6.0; pick **bottom-right of bubble** (consistent with existing dialogs).    |
| R5 | **7-day suppress window** may feel too short / too long    | M          | L      | Configurable via future settings; v1.6.0 hardcoded. Document in release notes.                       |
| R6 | **Tour fires on every new install** (no per-machine ID)   | L          | L      | `userData` is per-OS-user; per-install is acceptable for v1.6.0. Future telemetry hook (U spec) can persist a stable ID. |
| R7 | **Demo ECU load hides IPC failures** (silent fallback)     | L          | M      | Welcome card tooltip surfaces load failure; existing `ErrorBanner` (v1.4.0) shows parse errors.       |
| R-NEW | **Cross-cluster tour-validator coordination** (event-subscription between W `tourSlice` and G `swsValidatorSlice`) | L | M | Explicit event subscription on `tour:state-changed` keeps slice module graph one-directional (G does not import W; W does not import G). Mitigation documented in §3.7. v1.7.0+ may replace with unified orchestrator. |

### 8.2 Open questions for user (lock before plan)

1. **Q1 — Demo ECU domain mix**: **Com + ComM + CanIf + EcuC + PduR (5 modules)** — locked per user 2026-06-21. PduR added so G's C3 `SWS_PDUR_ROUTING_COMPLETE` starter rule has fixture coverage. Bundle size impact: ~150 KB total (vs original 4-module proposal of ~100 KB). Also includes 1 intentional SWS violation in `Com_Config.arxml` (duplicate `ComPduId` triggering C1 `SWS_COM_PDUID_UNIQUE`) for tour Step 4 demo visibility — see NEW-Q-A.
2. **Q2 — Suppress window length**: 7 days (proposed, industry-standard)? Configurable in v1.6.0 or hardcoded until v1.7.0?
3. **Q3 — Tour target #4**: Step 4 target = `right-pane-content` (the existing right-pane body, NOT a new component, and NOT G's bottom-docked `ValidationPanel`). Renderer must provide a stable right-pane root element with `data-tour-id="right-pane-content"`; plan stage adds a thin wrapper if absent (verified via W peer reviewer M3 + Adv C4 audit). **NO ValidationPanel piggyback** — W and G stay orthogonal.
4. **Q4 — Reset entry point**: **LOCKED** — U cluster wires the `Help → Reset onboarding` menu entry + optional `Cmd+Shift+R` binding. W ships the `tour:reset` IPC handler only (no placeholder menu). Merge wave order: W PR(W-1) → U PR(U-5/U-6). See §2.6.
5. **Q5 — "Load Demo ECU" button placement**: In welcome card (proposed) + also in NewProjectDialog preset (auto-discovered). Both? Welcome card only? Preset only?
6. **NEW-Q-A — Intentional SWS violation in Demo ECU fixture**: **YES** — 1 intentional SWS violation (`SWS_COM_PDUID_UNIQUE` duplicate `ComPduId` in `Com_Config.arxml`) so W tour Step 4 (`right-pane-content` spotlight) lands on a container whose PropertiesPanel surfaces a visible validation error tooltip for first-run users. Demo-ECU only — no real-world impact. Welcome card tooltip discloses "Demo ECU has 1 intentional SWS violation for tour demo purposes." Locked per user 2026-06-21.

### 8.3 Out of scope / explicit non-goals

- No tour analytics / telemetry (deferred; needs anonymized opt-in)
- No tour for ScriptEngine (U spec covers Cmd-K)
- No tour for ARXML Import wizard (Sprint 14 already polished)
- No per-user customization of step order / skip-list (future feature-flagged enhancement)

---

## 9. Acceptance Criteria

### 9.1 BLOCK (must all pass to ship v1.6.0 W)

| #   | Item                                                                  | Verification                                  |
| --- | --------------------------------------------------------------------- | --------------------------------------------- |
| 1   | Feature flag `experimental.onboarding` defined, default `false`        | `grep config/featureFlags.ts`                  |
| 2   | When flag OFF: TourRoot renders null, WelcomeCard not mounted          | `featureFlag.suppress.test.tsx`               |
| 3   | 5 tour steps render in correct order on first launch (flag ON)         | `TourRoot.integration.test.tsx` + E2E         |
| 4   | Skip persists across reload (within 7-day window)                      | E2E `skip tour persists for 7 days`           |
| 5   | Demo ECU template auto-discovered by `discoverBuiltinTemplates`        | `demoEcu.template-discovery.test.ts`          |
| 5b  | **NEW (H2)**: `samples/arxml/demo-ecu/demo.autosarcfg.json` exists, validates per §3.4.1 schema, parse ≤ 50 ms | `project-manifest.test.ts` + A+C CLI smoke |
| 6   | Demo ECU loads + opens project in ≤ 500 ms                            | E2E `demo ecu loads in under 500ms`           |
| 7   | 20 i18n keys present × 2 locales (EN + ZH)                             | `pnpm test:i18n` parity test                  |
| 7b  | **NEW (H3)**: 22 i18n keys present × 2 locales (EN + ZH; includes 2 `tour.coordination.validationPaused.*` keys) | `pnpm test:i18n` parity test |
| 7c  | **NEW (H3)**: Tour running → G ValidationPanel 0 hits / CPU profile stable (debounce gate early-returns when `tour.kind === 'running'`) | `tour-validation-coordination.test.tsx` + CPU profile |
| 8   | Tour state machine: 7 transitions covered                             | 8 unit tests on `useTourStore`                 |
| 9   | All existing 1692 tests still pass                                    | `pnpm test`                                   |
| 10  | 0 type errors, 0 lint errors                                          | `pnpm type-check && pnpm lint`                |
| 11  | Coverage: new code ≥ 90/80; total ≥ 95.5/87                            | `pnpm test:coverage`                          |
| 12  | Bundle size delta ≤ 30 KB gzipped when flag OFF                        | `pnpm build` size diff                        |
| 13  | `<userData>/tour.json` atomic write (temp + rename)                    | `tourPersistence.test.ts`                     |
| 14  | code-reviewer 0 C / ≤ 2 H / ≤ 5 M                                     | per-PR review                                 |
| 15  | Persistence corruption recovers silently                              | `tourPersistence.test.ts`                     |

### 9.2 WARN (should pass, ship if minor miss)

| #   | Item                                                                 | Verification          |
| --- | -------------------------------------------------------------------- | --------------------- |
| 16  | Right-pane-content target fallback (centered bubble) works             | E2E `right-pane-content missing falls back` |
| 17  | Escape key skips tour                                                | E2E `keyboard escape skips tour` |
| 18  | Demo ECU is recognizable to `parseBswmd` (no vendor extension)      | manual round-trip     |

### 9.3 OUT of scope (v1.6.0 W explicitly does NOT deliver)

- ❌ Headless CLI (Cluster A+C)
- ❌ SWS Validator framework (Cluster G)
- ❌ Keyboard shortcuts (Cluster U)
- ❌ Tour for Script Engine (Cluster U)
- ❌ Settings menu "Reset onboarding" entry (Cluster U wires it)
- ❌ Tour analytics / opt-out telemetry (v1.7.0+)
- ❌ Multi-ECU Demo (single ECU only)
- ❌ Tour for schema editor (no schema editor in v1.6.0)

---

## 10. Open Decisions to Lock Before Plan

User must confirm before the implementation plan is written:

1. **Q1 — Demo ECU domain**: Com + ComM + CanIf + EcuC + PduR (5 modules; user-locked 2026-06-21; see §2.5 + NEW-Q-A for intentional violation)
2. **Q2 — Suppress window**: 7 days hardcoded (proposed)
3. **Q3 — Step 4 target**: `right-pane-content` (renderer right-pane body). Orthogonal to G's bottom `ValidationPanel`. See §2.4 Note.
4. **Q4 — Reset entry**: **LOCKED** — U spec wires menu; W ships `tour:reset` IPC only. Merge wave order W→U. See §2.6.
5. **Q5 — Load Demo ECU button**: in welcome card only (proposed)
6. **NEW-Q-A — Intentional SWS violation**: **LOCKED** — 1 `SWS_COM_PDUID_UNIQUE` violation in `Com_Config.arxml` for tour Step 4 demo. See §2.5.

---

## 11. References

- [[claude-AutosarCfg-v1-6-brainstorm]] — source brainstorm (3 rounds, 8 agents)
- [[2026-06-21-v1-5-1-foundation-design]] — predecessor design (feature-flag pattern, slice composition, i18n parity)
- [[2026-06-21-v1-5-1-foundation]] — predecessor plan (slice decomposition, atomic-write pattern)
- [[claude-autosarcfg-overview]] — v1.5.1 state (1692 tests, 96.31% stmts)
- [[2026-06-21-v1-6-0-U-keyboard-design]] — U Keyboard (F1 closure: `FeatureFlags.keyboardFirst` mirrors U §6.4 `experimental.keyboardFirst`; U §3.4 wires W's `tour:reset` IPC into Help menu; merge wave order W→U locked per §2.6)
- [[2026-06-21-v1-6-0-G-sws-validator-design]] — G SWS Validator (H3 closure: W §3.7 `validationPaused` is consumed by G §4.5 debounce handler; G spec plan-stage adds `if (tourState.kind === 'running') return [];` early-return)
- [[2026-06-21-v1-6-0-AC-headless-cli-design]] — A+C Headless CLI (H2 closure: W §3.4.1 `DemoEcuManifestFile` is the canonical schema SoT; A+C §10.6 row 4 imports `src/shared/project-manifest.ts` per plan stage — fixed from phantom §10.2 reference in Round 3, 2026-06-21)
- `src/main/templates/index.ts` — Demo ECU template auto-discovery (no changes needed)
- `src/shared/i18n.ts` — parity test pattern
- `src/main/arxml-stream/feature-flag.ts` — feature flag pattern (mirrored for renderer)
- `src/renderer/store/useArxmlStore.ts` — slice composition pattern
- `src/renderer/components/AppHeader.tsx` — header target wiring
- `samples/README.md` — template directory convention
- `docs/superpowers/specs/2026-06-21-v1-5-1-foundation-design.md` — Round-trip tolerance whitelist pattern (not directly used but spirit applies)