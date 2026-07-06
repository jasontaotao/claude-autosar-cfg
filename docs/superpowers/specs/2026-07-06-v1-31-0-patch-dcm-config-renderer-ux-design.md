# v1.31.0 PATCH — Dcm Config Renderer UX

> **Status**: DESIGN — pre-flight
> **Ship target**: v1.31.0 PATCH
> **Baseline**: v1.30.0 MINOR (`83953d9`)
> **Spec author**: brainstorming flow (2026-07-06)
> **Related**:
> - [v1.30.0 MINOR — dcmConfig IPC bridge wiring](2026-07-06-v1-30-0-minor-dcm-config-IPC-bridge-wiring-design.md) (parent — wires the IPC)
> - [v1.24.0 T3 DiagnosticExtractSuccessDialog pattern](../../release-notes/v1.24.0/README.md#t3) (parity reference for Success Dialog)
> - [v1.23.0 DBC Import Wizard](../../release-notes/v1.23.0/README.md) (anti-pattern — wizard is over-engineered for this PATCH)

## Summary

v1.30.0 MINOR shipped the `dcm:config` IPC channel end-to-end (channel registration + preload exposure + bare `DcmConfigTrigger` button). The IPC contract is solid; the **renderer UX is developer-only**. v1.31.0 PATCH closes the user-facing gap with 4 focused deliverables:

1. **T1** `DcmConfigSuccessDialog.tsx` — parity `DiagnosticExtractSuccessDialog` (a11y + i18n)
2. **T2** `DcmConfigErrorToast.tsx` — 6 fail-fast error classes with localized copy (zh-CN + en)
3. **T3** `useDcmConfigLauncher` hook — state machine + IPC + error classifier
4. **T4** `AppHeader` dropdown entry + `ContextMenu` right-click entry — both gated on the Dcm BSWMD being loaded

3 items are deliberately deferred to v1.32.0+ (rationale in §5 Out of Scope).

## 1. Goals & Non-Goals

### Goals

- Provide a production-grade success/failure UX for the v1.30.0 `dcm:config` IPC.
- Mirror the established v1.24.0 T3 `DiagnosticExtractSuccessDialog` pattern (Escape / backdrop / autofocus / i18n).
- Surface all 6 fail-fast error classes the v1.30.0 handler can return, with renderer-distinguishable keys.
- Wire 2 entry points (EB tresos-style dropdown + tree right-click) so the user can launch from wherever they have the Dcm BSWMD in view.
- Maintain IPC surface stability — no breaking change to `DcmConfigRequest` / `DcmConfigResponse`.

### Non-Goals (1.31.0)

- ❌ `DcmConfigResponse` envelope → discriminated `error.kind` migration. Stay with `{ message, cause? }`; renderer regex-matches the 6 message prefixes (D5).
- ❌ A dedicated ODX file picker. Reuse the v1.22.0 `openOdx()` flow + `activeDocumentPath` derivation.
- ❌ Project-manifest-driven `bswmdPath` auto-population. Caller supplies `bswmdPath` manually (or omits → sample-fixture discovery).
- ❌ Multi-step wizard (DBC-import-wizard style). The trigger is a single-button op; no input aggregation needed.
- ❌ DcmDsl / Security access / Dem services. Out of scope; future MINORs.

## 2. Architecture

### Layered design (container / hook / presentational)

```
┌────────────────────────────────────────────────────────┐
│ AppHeader.tsx                                          │
│   onOpenDcmConfig()       ─> useDcmConfigLauncher.open│
│   dcmConfigBusy           <─ pending flag              │
│                                                        │
│   <DcmConfigSuccessDialog open result={…} onClose/>   │
│   <DcmConfigErrorToast   error={…}   onDismiss/>      │
│                                                        │
│ ContextMenu (kind='bswmd', matches Dcm BSWMD)         │
│   action: { type: 'generate-dcm-config', path }       │
│   AppHeader.handleAction() ─> launcher.open()         │
└────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│ useDcmConfigLauncher (custom hook, App-level singleton)│
│   state: { mode: 'idle' | 'pending' | 'success' |      │
│           'error', result, error, dialogOpen,          │
│           toastVisible }                               │
│   actions: open(args), closeDialog(), dismissToast()  │
│   IPC: window.autosarApi.dcmConfig(req)                │
│   error classification: 6 regex prefixes (see §3)     │
└────────────────────────────────────────────────────────┘
```

### Component placement

| Component | Path | Type |
|---|---|---|
| `DcmConfigSuccessDialog` | `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx` | NEW presentational |
| `DcmConfigErrorToast` | `src/renderer/components/dcmConfig/DcmConfigErrorToast.tsx` | NEW presentational |
| `useDcmConfigLauncher` | `src/renderer/hooks/useDcmConfigLauncher.ts` | NEW custom hook |
| `AppHeader` integration | `src/renderer/components/AppHeader.tsx` + `AppHeader/types.ts` | MODIFY |
| `ContextMenu` integration | `src/renderer/components/ContextMenu.tsx` | MODIFY |
| i18n keys | `src/shared/i18n/odx.ts` + `src/shared/i18n.zh-CN/odx.ts` + `src/shared/i18n.en/odx.ts` | MODIFY |

The new `dcmConfig/` component folder mirrors the v1.30.0 minimal-trigger pattern (single folder, co-located CSS + tests).

## 3. Detailed Design

### T1 — `DcmConfigSuccessDialog`

**Parity**: `src/renderer/components/DiagnosticExtractSuccessDialog.tsx` (v1.24.0 T3) line-by-line.

```ts
// src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx
export interface DcmConfigSuccessDialogProps {
  /** Render-gate — when false, the modal is not in the DOM. */
  readonly open: boolean;
  /** Handler result payload (v1.30.0 DcmConfigHandlerResult). */
  readonly result: DcmConfigHandlerResult;
  readonly locale: Locale;
  readonly onClose: () => void;
}

export function DcmConfigSuccessDialog(
  props: DcmConfigSuccessDialogProps,
): JSX.Element | null;
```

**Rendered content**:
- Title: `t(locale, 'odx.export.dcmConfig.success.title')`
- Body: `t(locale, 'odx.export.dcmConfig.success.body', { dspCount, routineCount, appliedStepCount })`
- Paths: `<dl>` with single `outputPath` (no dem/dcm split — single output)
- Close button + Escape + backdrop click

**a11y** (parity):
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby="dcm-config-success-title"`
- Escape closes
- Backdrop click closes; inner card `stopPropagation` prevents file-path click from dismissing
- `useRef` on close button; `requestAnimationFrame` defers focus past mount paint
- Same `useEffect` mount-only-while-open pattern as DiagnosticExtract

**CSS**: new `DcmConfigSuccessDialog.css` — copy of `DiagnosticExtractSuccessDialog.css` with class names prefixed `dcm-config-success-*`.

### T2 — `DcmConfigErrorToast` + i18n

```ts
// src/renderer/components/dcmConfig/DcmConfigErrorToast.tsx
export type DcmConfigErrorClass =
  | 'bswmdUnreadable'
  | 'odxUnreadable'
  | 'odxParseFailed'
  | 'bswmdMapMissing'
  | 'atomicWriteFailed'
  | 'unexpected';

export interface DcmConfigErrorToastProps {
  readonly error: { message: string; classKey: DcmConfigErrorClass } | null;
  readonly locale: Locale;
  readonly onDismiss: () => void;
}

export function DcmConfigErrorToast(
  props: DcmConfigErrorToastProps,
): JSX.Element | null;
```

**Behavior**:
- Fixed bottom-right (`position: fixed; right: 24px; bottom: 24px;`)
- 8-second auto-dismiss via `setTimeout` in `useEffect` with cleanup
- Close button for immediate dismiss
- aria-live="polite" for screen reader announcement
- Distinct class for each of the 6 error classes (CSS class `dcm-config-error-toast--<classKey>`) so future styling can be class-specific

**i18n keys** (all added to `src/shared/i18n/odx.ts`, with zh-CN + en bundles):

| Key | zh-CN (summary) | en (summary) |
|---|---|---|
| `odx.export.dcmConfig.error.bswmdUnreadable` | 无法读取 BSWMD 文件:`{message}` | Cannot read BSWMD file: `{message}` |
| `odx.export.dcmConfig.error.odxUnreadable` | 无法读取 ODX 文件:`{message}` | Cannot read ODX file: `{message}` |
| `odx.export.dcmConfig.error.odxParseFailed` | ODX 解析失败:`{message}` | ODX parse failed: `{message}` |
| `odx.export.dcmConfig.error.bswmdMapMissing` | BSWMD 缺少 Dcm 模块:`{message}` | BSWMD missing Dcm module: `{message}` |
| `odx.export.dcmConfig.error.atomicWriteFailed` | 写入失败:`{message}` | Write failed: `{message}` |
| `odx.export.dcmConfig.error.unexpected` | 发生意外错误:`{message}` | Unexpected error: `{message}` |
| `odx.export.dcmConfig.error.dismiss` | 关闭 | Dismiss |
| `dcmConfig.action.generate` | 生成 Dcm 配置 | Generate Dcm Config |
| `dcmConfig.action.generateAria` | 生成 Dcm 配置 `{name}` | Generate Dcm Config for `{name}` |
| `dcmConfig.error.noDcmBswmd` | 需先加载 Dcm BSWMD | Requires a Dcm BSWMD to be loaded |
| `app.open.dcmConfig` | 打开 Dcm 配置 | Open Dcm Config |

11 keys × 2 locales = 22 new translation strings (existing pattern: see v1.24.0 DiagnosticExtractSuccessDialog for `odx.export.diagnosticExtract.*` precedent).

### T3 — `useDcmConfigLauncher` hook

```ts
// src/renderer/hooks/useDcmConfigLauncher.ts
export interface DcmConfigLauncherState {
  readonly mode: 'idle' | 'pending' | 'success' | 'error';
  readonly result: DcmConfigHandlerResult | null;
  readonly error: { message: string; classKey: DcmConfigErrorClass } | null;
  readonly dialogOpen: boolean;
  readonly toastVisible: boolean;
}

export interface DcmConfigLauncher {
  readonly state: DcmConfigLauncherState;
  open(args: {
    odxPath: string;
    xlsxRows: readonly EcucInstanceRow[];
    bswmdPath?: string;
  }): void;
  closeDialog(): void;
  dismissToast(): void;
}

export function useDcmConfigLauncher(): DcmConfigLauncher;
```

**State machine** (single transition per call — no parallel states):

```
idle ──(open)──> pending ──(IPC ok)──> success(dialogOpen=true,  toastVisible=false)
                  │
                  └──(IPC fail)──> error(toastVisible=true, dialogOpen=false)
success ──(closeDialog)──> idle
error   ──(dismissToast)──> idle
pending ──(open again)──> IGNORED (no state change — prevents double-fire race)
```

**Error classifier** (regex order matters — longer/more-specific prefixes first):

```ts
function classifyError(message: string): DcmConfigErrorClass {
  if (/^BSWMD file unreadable:/.test(message))  return 'bswmdUnreadable';
  if (/^ODX file unreadable:/.test(message))    return 'odxUnreadable';
  if (/^ODX parse failed:/.test(message))       return 'odxParseFailed';
  if (/BSWMD map missing/.test(message))        return 'bswmdMapMissing';
  if (/^Atomic write failed:/.test(message))    return 'atomicWriteFailed';
  return 'unexpected';
}
```

The 5 anchored prefixes map 1:1 to v1.30.0 handler `error.message` literal sites; `BSWMD map missing` is substring-matched because the v1.30.0 handler propagates this from `dcmConfigPipeline` (not a literal prefix in the handler itself).

**`open()` flow**:
1. `setState({ mode: 'pending', result: null, error: null, dialogOpen: false, toastVisible: false })`
2. `const res = await window.autosarApi.dcmConfig({ odxPath, xlsxRows, bswmdPath })`
3. `if (res.ok)`: `setState({ mode: 'success', result: res.value, dialogOpen: true, toastVisible: false })`
4. `else`: `setState({ mode: 'error', error: { message: res.error.message, classKey: classifyError(res.error.message) }, toastVisible: true, dialogOpen: false })`
5. **No throw** — IPC envelope is guaranteed; the catch is a no-op safety net (defensive only).

**Re-entrancy guard**: if `state.mode === 'pending'`, the second `open()` call returns early without changing state. Prevents the AppHeader button + ContextMenu entry double-fire race.

**`window.autosarApi` access**: use the same `as unknown as` cast pattern as `DcmConfigTrigger.tsx` (v1.30.0 — see `src/renderer/components/dcmConfig/DcmConfigTrigger.tsx:53-68`). Do NOT augment `Window.autosarApi` in `shared/renderer-env.d.ts` (TS interface merging conflict per v1.30.0 lesson).

### T4 — `AppHeader` + `ContextMenu` integration

#### AppHeader new props

```ts
// src/renderer/components/AppHeader/types.ts
export interface AppHeaderProps {
  // ... 既有 (onOpenOdx, onOpenDbc, onOpenDbcImport, onOpenXlsxBatch, ...) ...
  /** v1.31.0 PATCH — fire the dcm config IPC. Wired to useDcmConfigLauncher. */
  readonly onOpenDcmConfig: () => void;
  /** v1.31.0 PATCH — true while dcm config IPC is in-flight. */
  readonly dcmConfigBusy: boolean;
}
```

**AppHeader dropdown entry** — placed in the same group as `Open ODX` / `Open DBC` (EB tresos style "File" group):

```tsx
<button
  type="button"
  onClick={() => void onOpenDcmConfig()}
  disabled={dcmConfigBusy || !odxLoaded || !hasDcmBswmd}
  data-testid="btn-open-dcm-config"
>
  {t(locale, 'app.open.dcmConfig')}
</button>
```

**Gate derivation** — all 3 selectors live in AppHeader (matches the existing pattern: AppHeader already subscribes to `useArxmlStore` for `filePath` and `doc`):
- `dcmConfigBusy` ← `useDcmConfigLauncher().state.mode === 'pending'`
- `odxLoaded` ← derived in AppHeader: `useArxmlStore((s) => s.activeDocumentPath ?? '').endsWith('.odx')` (case-insensitive)
- `hasDcmBswmd` ← derived in AppHeader: `useArxmlStore((s) => s.manifest?.bswmdPaths.some((p) => /Dcm\.arxml$|Dcm_.*\.arxml$/i.test(p)) ?? false)`

**Title attr** (when disabled): `t(locale, 'dcmConfig.error.noDcmBswmd')` for the `!hasDcmBswmd` case; `t(locale, 'odx.export.odx.error.noOdxLoaded')` (re-use existing key) for the `!odxLoaded` case.

#### ContextMenu new entry

**Action union extension** (`src/renderer/components/ContextMenu.tsx`):
```ts
export type ContextMenuAction =
  // ... 既有 ...
  | { readonly type: 'generate-dcm-config'; readonly path: string };
```

**`buildBswmdItems` extension** (in `ContextMenu.tsx`):
```ts
function buildBswmdItems(target: ContextMenuTarget, locale: Locale): readonly MenuItemSpec[] {
  const items: MenuItemSpec[] = [
    // ... 既有 remove-module + (optionally) delete-module ...
  ];
  // v1.31.0 PATCH — append "Generate Dcm Config" when the BSWMD is a Dcm BSWMD.
  const isDcmBswmd = /Dcm\.arxml$|Dcm_.*\.arxml$/i.test(target.path);
  if (isDcmBswmd) {
    items.push({
      id: 'generate-dcm-config',
      label: t(locale, 'dcmConfig.action.generate'),
      ariaLabel: t(locale, 'dcmConfig.action.generateAria', { name: target.shortName }),
      disabled: false,
      cssClass: 'context-menu-item context-menu-item-action',
      build: () => ({ type: 'generate-dcm-config', path: target.path }),
    });
  }
  return items;
}
```

**AppHeader.handleAction branch**:
```ts
case 'generate-dcm-config':
  onOpenDcmConfig();
  break;
```

**`onOpenDcmConfig` source** — the AppHeader callback needs the ODX path + xlsx rows. Two inputs:
- `odxPath` ← `useArxmlStore.getState().activeDocumentPath` (assumed to end with `.odx` because the button is gated on `odxLoaded`). If the store field is not directly accessible, AppHeader passes the value via the props chain from App.tsx (AppHeader already does this for `filePath`).
- `xlsxRows` ← read from the v1.25.0 Excel→Com-Stack batch store state. The exact field name is identified during implementation (candidate: `useArxmlStore.getState().xlsxLastImport?.rows ?? []`); the plan-time investigation in T4-Task 1 confirms the field. If no xlsx data is present, the launcher is called with an empty array — the v1.30.0 handler then surfaces `ODX-Dcm linkage broken` (v1.30.0 PATCH is a PATCH, not a feature to teach xlsx imports).

**Rejected**: a new dialog asking the user for ODX + xlsx paths (over-engineered for PATCH).

## 4. Data Flow

### Happy path

```
1. User clicks "Open Dcm Config" (AppHeader dropdown)
   OR right-clicks a Dcm BSWMD row in ProjectPanel → "Generate Dcm Config"
2. AppHeader calls onOpenDcmConfig() (which is the launcher's open())
3. useDcmConfigLauncher.open({ odxPath, xlsxRows, bswmdPath? })
4. Hook: setState({ mode: 'pending' })
5. Hook: await window.autosarApi.dcmConfig({ odxPath, xlsxRows, bswmdPath })
6. Handler (v1.30.0): parses ODX + BSWMD, runs dcmConfigPipeline,
   generates PatchSteps, applies, atomic-writes Dcm_Config.arxml
7. Hook: setState({ mode: 'success', result, dialogOpen: true })
8. AppHeader renders <DcmConfigSuccessDialog open result onClose/>
9. User reads output path, clicks Close
10. Hook: closeDialog() → setState({ mode: 'idle' })
```

### Failure path

```
1-5. Same as happy path
6. Handler: returns { ok: false, error: { message: "BSWMD file unreadable: ENOENT: …" } }
7. Hook: classifyError(msg) → 'bswmdUnreadable'
   setState({ mode: 'error', error: { message, classKey }, toastVisible: true })
8. AppHeader renders <DcmConfigErrorToast error={…} onDismiss/>
9. Toast shows localized message; auto-dismisses after 8s OR user clicks Close
10. Hook: dismissToast() → setState({ mode: 'idle' })
```

### Double-fire race (AppHeader + ContextMenu)

```
t=0   User clicks AppHeader button
t=0   User right-clicks BSWMD → "Generate Dcm Config"
t=1   AppHeader.onOpenDcmConfig() → launcher.open() → setState(pending)
t=1   ContextMenu.onAction → AppHeader.handleAction → onOpenDcmConfig()
      → launcher.open() → state.mode === 'pending' → IGNORED
t=2   IPC returns → setState(success) — first call wins
```

## 5. Out of Scope (deferred to v1.32.0+)

| Item | Why deferred |
|---|---|
| `DcmConfigResponse` envelope → discriminated `error.kind` migration | Semver-major IPC change; the 1.31.0 PATCH keeps `{ message, cause? }` stable. Renderer regex-matches the 6 message prefixes (D5). v1.32.0 MINOR should add `kind` + consumers, and v1.33.0 PATCH can drop the regex once parity is confirmed. |
| Dedicated ODX file picker | `openOdx()` (v1.22.0) is already in AppHeader; the Dcm config flow reads `activeDocumentPath` to derive the ODX. A new picker is duplicate UX. |
| Project-manifest-driven `bswmdPath` auto-population | `bswmdPath` can be supplied manually (or omitted → sample-fixture discovery). Auto-population is a UX nicety; not a PATCH blocker. |
| Multi-step wizard | The trigger is single-button; no input aggregation needed. DBC Import Wizard is the anti-pattern (over-engineered for this op). |
| `DcmConfigTrigger` → `App.tsx` top-level mount | AppHeader is the established entry point (parity with `openOdx`, `openDbc`). If a future feature needs a 3rd entry point, lift to App. |

## 6. Testing

| Test file | What it pins |
|---|---|
| `src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx` | open/close + Escape + backdrop click + autofocus close button; renders `outputPath` and 5 service kind counts; i18n both locales (zh-CN + en) |
| `src/renderer/components/dcmConfig/__tests__/DcmConfigErrorToast.test.tsx` | 6 class messages render correctly (snapshot of localized string); auto-dismiss 8s (with `vi.useFakeTimers`); Close button immediate; null error → returns null |
| `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` | state machine transitions (idle→pending→success/error→idle); classifyError unit (6 cases); re-entrancy guard (open while pending is no-op); IPC mock returns ok/failure paths |
| `src/renderer/components/__tests__/AppHeader.dcmConfig.test.tsx` | button rendered; `dcmConfigBusy` disables; `onOpenDcmConfig` called on click; `disabled` when `!odxLoaded \|\| !hasDcmBswmd` |
| `src/renderer/components/__tests__/ContextMenu.dcmConfig.test.tsx` | `kind: 'bswmd'` + `path: 'Bsw_Dcm_Bswmd.arxml'` → entry visible; `kind: 'bswmd'` + `path: 'Bsw_Com_Bswmd.arxml'` → entry NOT visible; clicking the entry fires `generate-dcm-config` action with the path |

Target test count delta: **+12~16** tests. Baseline 2888 + 7 SKIP → expected **2900+ + 7 SKIP** / 0 fail.

## 7. Decision Log

- **D1** — 4 件套 vs 全 7 deferred items: 4 件套 unlocks real user use; envelope migration / picker / manifest auto-population are independent concerns and ship better separately (semver purity + lower review surface).
- **D2** — AppHeader dropdown (vs independent toolbar button): parity with `Open ODX` / `Open DBC`; EB tresos style; lower UX fragmentation.
- **D3** — ContextMenu entry on `kind: 'bswmd'` (vs new `'odx'` kind): trigger surface is the loaded BSWMD document row, UX concept clearer; same level as `Remove BSWMD` / `Delete ECUC module`.
- **D4** — `hasDcmBswmd` by filename regex (`/Dcm\.arxml$|Dcm_.*\.arxml$/i`): simple + fast, avoids parsing the entire manifest BSWMD in the renderer. v1.32.0+ can upgrade to BSWMD parse + module shortName match.
- **D5** — error class via regex prefix (not IPC envelope `kind`): v1.30.0 handler's 6 error sites already use the prefix literals; renderer regex-match is zero-latency; defer envelope migration to v1.32.0.
- **D6** — Layered architecture (hook + 2 presentational): each unit is independently testable; parity with v1.24.0 T3 DiagnosticExtract pattern; the DBC Import Wizard is the anti-pattern (multi-step for a single-button op).

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `classifyError` regex drifts from v1.30.0 handler message literals | Low | Medium | The 6 prefixes are pinned by v1.30.0 spec §T3; handler tests already cover them; launcher test asserts all 6 classes |
| ContextMenu + AppHeader double-fire race | Medium | Low | Re-entrancy guard in launcher (`if (state.mode === 'pending') return;`); race does not corrupt state |
| i18n key missing in zh-CN or en bundle | Low | Low | Test asserts `t(locale, key)` returns non-empty string for both locales across all 11 new keys |
| `hasDcmBswmd` regex false-positive (e.g. a BSWMD named `BCM_Dcm_Compat.arxml`) | Low | Low | v1.31.0 PATCH is conservative — false-positive just shows the entry when the actual `Bsw_Dcm` BSWMD is needed; the IPC `BSWMD file unreadable` error class surfaces the real issue at click time. v1.32.0+ can refine to BSWMD-parse-based detection. |
| `xlsxRows` source field name in `useArxmlStore` is identified at plan-time T4-Task 1 | Medium | Medium | AppHeader derives the value at integration time; if the field does not exist, the launcher is called with `[]` and the handler surfaces a clear `ODX-Dcm linkage broken` error (no feature work in 1.31.0 PATCH) |

## 9. Open Questions (resolved during brainstorming)

- **Q1** — Scope: 4 件套 vs 7 件套? **A**: 4 件套 (D1).
- **Q2** — Architecture: layered hook+presentational vs container vs wizard? **A**: layered (D6).
- **Q3** — ContextMenu trigger surface: `kind: 'bswmd'` (existing) vs new `'odx'` kind? **A**: `kind: 'bswmd'` (D3).
- **Q4** — Where to mount the success dialog: AppHeader vs App.tsx? **A**: AppHeader (D2).
- **Q5** — error class: regex prefix vs IPC envelope `kind`? **A**: regex prefix for 1.31.0; envelope migration in 1.32.0 (D5).

## 10. References

- v1.30.0 MINOR release notes — `docs/release-notes/v1.30.0/README.md` (deferred items §"Out of Scope")
- v1.30.0 design spec — `docs/superpowers/specs/2026-07-06-v1-30-0-minor-dcm-config-IPC-bridge-wiring-design.md`
- v1.24.0 T3 — `src/renderer/components/DiagnosticExtractSuccessDialog.tsx` (parity reference)
- v1.22.0 T2 — ODX viewer + `openOdx` flow
- v1.23.0 T3 — DBC Import Wizard (anti-pattern reference)
- i18n pattern — `src/shared/i18n/odx.ts` + zh-CN/en bundles
- sandbox-flip SE-1 audit — `src/main/__tests__/sandbox-flip.test.ts` (no new bridge methods required; the dcm:config channel was added in v1.30.0)
