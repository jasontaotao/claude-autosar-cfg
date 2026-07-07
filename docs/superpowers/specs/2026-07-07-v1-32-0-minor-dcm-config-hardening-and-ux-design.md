# v1.32.0 MINOR — Dcm Config Hardening + UX Completion

> **Status**: DESIGN — pre-flight (awaiting user review)
> **Ship target**: v1.32.0 MINOR
> **Baseline**: v1.31.1 PATCH (`44eb1c0`, 2933 + 7 SKIP / 0 fail)
> **Spec author**: brainstorming flow (2026-07-07)
> **Related**:
>
> - [v1.31.0 PATCH — Dcm Config Renderer UX](2026-07-06-v1-31-0-patch-dcm-config-renderer-ux-design.md) (parent — current PATCH)
> - [v1.30.0 MINOR — dcmConfig IPC bridge wiring](2026-07-06-v1-30-0-minor-dcm-config-IPC-bridge-wiring-design.md) (grandparent — wires the IPC)
> - [v1.24.0 T3 DiagnosticExtractSuccessDialog pattern](../../release-notes/v1.24.0/README.md#t3) (parity reference)

## Summary

v1.31.0 PATCH + v1.31.1 PATCH closed the developer-only gap on the v1.30.0 dcm:config IPC and polished the renderer UX. v1.32.0 MINOR is the **hardening + UX-completion** MINOR that resolves the 4 items v1.31.0 spec §5 deferred:

1. **Envelope migration** — `DcmConfigResponse.error` gains a `kind` discriminator (8 literals + `unknown`); renderer `classifyError` switches to read-kind-first with a legacy regex fallback for one release.
2. **BSWMD-parse-based `hasDcmBswmd`** — replaces the v1.31.x filename regex with a real ARXML parse that walks `<MODULE-SHORT-NAME>` nodes; removes the `bswmdHasDcm` regex helper.
3. **Dedicated ODX picker** — `DcmConfigPicker` wraps `openOdx()` with a `.odx$` filter and `picking-odx` substate; auto-skips when `activeDocumentPath` is already an `.odx` file.
4. **Manifest auto-population** — `bswmdHasDcm.dcmBswmdPath` flows into `args.bswmdPath` so the handler no longer relies on sample-fixture walk-up when the project has a Dcm BSWMD loaded.

A small escape hatch (text-input Override) is shipped disabled — Browse button is deferred to v1.33.0+.

## 1. Goals & Non-Goals

### Goals

- Make `DcmConfigResponse` errors **machine-classifiable** (no more renderer regex on a string message).
- Replace fragile filename regex gating with **real BSWMD parse**, eliminating false positives and false negatives.
- Let users launch Dcm config generation from the project root **without first loading an ODX document**.
- Auto-fill the BSWMD path from the project manifest so the handler doesn't always fall through to sample-fixture walk-up.
- Maintain IPC surface compatibility: additive `kind` field; renderer falls back to regex for one release; v1.33.0 removes the regex.
- Test count target: 2933 + 7 SKIP → **~2984 + 7 SKIP / 0 fail** (+51).

### Non-Goals (1.32.0)

- ❌ Dropping the legacy regex fallback (deferred to v1.33.0; one-release compat window).
- ❌ Override Browse button (text input ships; v1.33.0+ adds IPC-backed picker).
- ❌ Multi-ODX selection in the picker (single-select only; matches v1.22.0 `openOdx()`).
- ❌ BSWMD parse-cache eviction policy beyond per-path memo (YAGNI; measure first if profiler flags it).
- ❌ DcmDsl / Security access / Dem services (unchanged from v1.31.0 non-goals).
- ❌ Multi-step wizard (unchanged from v1.31.0 non-goals).

## 2. Architecture

### Layered design (extends v1.31.x)

```
┌──────────────────────────────────────────────────────────────────────┐
│ AppHeader (existing entry: 'Open Dcm Config')                        │
│   canOpenDcmConfig = odxLoaded && bswmdHasDcm.hasDcm && !busy         │
│   → handleOpenDcmConfig → launcher.promptAndOpen()                    │
│                                                                      │
│ ContextMenu (existing kind='bswmd' entry: 'Generate Dcm Config')     │
│   → same launcher.promptAndOpen() path                               │
└──────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│ useDcmConfigLauncher (extends v1.31.1 hook; 2 new substates)         │
│                                                                      │
│ state:                                                                │
│   { mode: 'idle' | 'picking-odx' | 'pending' | 'success' | 'error',  │
│     result, error, dialogOpen, toastVisible, odxPickerDefaultPath?,   │
│     bswmdPathOverride? }                                              │
│                                                                      │
│ actions:                                                              │
│   promptAndOpen() — entry from AppHeader/ContextMenu                  │
│     1. if isActiveOdx → skip picker, open(activeDoc, autofill)        │
│     2. else transition → 'picking-odx'                                │
│     3. on resolve, open({odxPath, xlsxRows, bswmdPath: autofill})     │
│                                                                      │
│   open(args) — IPC entry (now takes resolved bswmdPath)               │
│     classifyError: read kind FIRST, regex fallback (1-release compat) │
│     IPC: window.autosarApi.dcmConfig({odxPath, xlsxRows,              │
│                                       outputPath, bswmdPath})         │
│                                                                      │
│   handlePickerResolve(odxPath) — wiring hook for <DcmConfigPicker/>   │
│   handlePickerCancel() — wiring hook for <DcmConfigPicker/>           │
└──────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│ main/ipc/dcmConfigHandler (extends v1.30.0 handler)                  │
│                                                                      │
│ DcmConfigResponse.error: { kind, message, cause? }                    │
│   kind ∈ 'odx-unreadable' | 'odx-parse-failed' |                      │
│         'bswmd-unreadable' | 'odx-dcm-linkage' |                      │
│         'dcm-module-missing' | 'container-not-found' |                │
│         'patch-failed' | 'atomic-write-failed' | 'unknown'            │
│                                                                      │
│ Each of 9 return sites sets kind explicitly.                         │
│ The catch-all sets kind: 'unknown'.                                   │
│ `cause` field preserved for debug.                                    │
└──────────────────────────────────────────────────────────────────────┘
```

### Component placement

| Component                            | Path                                                              | Type                      |
| ------------------------------------ | ----------------------------------------------------------------- | ------------------------- |
| `DcmConfigErrorKind` (NEW type)      | `src/shared/types.ts`                                             | NEW type                  |
| `DcmConfigError` (MODIFIED)          | `src/shared/types.ts`                                             | MODIFY (additive)         |
| `dcmConfigHandler` (MODIFIED)        | `src/main/ipc/dcmConfigHandler.ts`                                | MODIFY (9 sites)          |
| `findDcmBswmd` (NEW helper)          | `src/renderer/components/dcmConfig/bswmdHasDcm.ts`                | NEW                       |
| `arxmlModuleShortNames` (NEW helper) | `src/renderer/arxml/arxmlModuleShortNames.ts`                     | NEW                       |
| `useDcmConfigLauncher` (MODIFIED)    | `src/renderer/hooks/useDcmConfigLauncher.ts`                      | MODIFY                    |
| `DcmConfigPicker` (NEW)              | `src/renderer/components/dcmConfig/DcmConfigPicker.tsx`           | NEW thin-wrapper (no JSX) |
| `DcmConfigSuccessDialog` (MODIFIED)  | `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx`    | MODIFY (autofill label)   |
| `AppHeader` (MODIFIED)               | `src/renderer/components/AppHeader.tsx`                           | MODIFY (regex → parse)    |
| `ContextMenu` (MODIFIED)             | `src/renderer/components/ContextMenu.tsx`                         | MODIFY (regex → parse)    |
| `App.tsx` (MODIFIED)                 | `src/renderer/App.tsx`                                            | MODIFY (wire picker)      |
| i18n keys (MODIFIED)                 | `src/shared/i18n/odx.ts` + `i18n.zh-CN/odx.ts` + `i18n.en/odx.ts` | MODIFY (5 keys)           |
| `bswmdHasDcm` regex (DELETED)        | `src/renderer/components/dcmConfig/regex.ts`                      | DELETE (29 LoC)           |

## 3. Detailed Design

### T1 — Envelope migration: kind at every return site

**Type evolution** (`src/shared/types.ts`):

```ts
export type DcmConfigErrorKind =
  | 'odx-unreadable'
  | 'odx-parse-failed'
  | 'bswmd-unreadable'
  | 'odx-dcm-linkage'
  | 'dcm-module-missing'
  | 'container-not-found'
  | 'patch-failed'
  | 'atomic-write-failed'
  | 'unknown';

export interface DcmConfigError {
  readonly kind: DcmConfigErrorKind;
  readonly message: string;
  readonly cause?: unknown;
}

export type DcmConfigResponse =
  | { readonly ok: true; readonly value: DcmConfigHandlerResult }
  | { readonly ok: false; readonly error: DcmConfigError };
```

**Handler site map** (9 sites in `dcmConfigHandler.ts`):

| #   | Site                                                                         | kind                  |
| --- | ---------------------------------------------------------------------------- | --------------------- |
| 1   | ODX `readFileSync` catch                                                     | `odx-unreadable`      |
| 2   | `parseOdxHandler` returns ok:false                                           | `odx-parse-failed`    |
| 3   | BSWMD `readFileSync` catch (explicit bswmdPath)                              | `bswmd-unreadable`    |
| 4   | `dcmConfigPipeline` throws → ODX-Dcm linkage broken (regex on message)       | `odx-dcm-linkage`     |
| 5   | `dcmConfigPipeline` throws → BSWMD map missing Dcm (regex on message)        | `dcm-module-missing`  |
| 6   | `xlsxDcmServicesToEcucBatch` throws → container not found (regex on message) | `container-not-found` |
| 7   | `applyPatchesToExtract` returns ok:false                                     | `patch-failed`        |
| 8   | `writeAtomic` throws                                                         | `atomic-write-failed` |
| 9   | Outer catch-all                                                              | `unknown`             |

Sites 4/5/6 currently rely on thrown-error message strings. The pipeline/mapper need **explicit error classes** that carry `kind`. This is a small change to `dcmConfigPipeline.ts` and `xlsxDcmServicesToEcucBatch.ts`: each `throw new Error(...)` becomes a `throw new DcmConfigError({kind, message, cause?})` carrying the kind field. The handler's catch then narrows on `instanceof DcmConfigError` and projects the kind; otherwise it sets `unknown`.

### T2 — Renderer `classifyError` rewrite

**Before** (v1.31.x):

```ts
function classifyError(message: string): DcmConfigErrorClass {
  /* 6 regexes */
}
```

**After** (v1.32.0):

```ts
function classifyError(error: DcmConfigError): DcmConfigErrorClass {
  // 1. read kind (preferred)
  switch (error.kind) {
    case 'odx-unreadable':
      return 'ODX_FILE_UNREADABLE';
    case 'odx-parse-failed':
      return 'ODX_PARSE_FAILED';
    // ... 9 kinds → 9 classes ...
    case 'unknown':
      /* fall through to regex fallback */ break;
  }
  // 2. legacy fallback (1 release; removed in v1.33.0)
  return classifyErrorByRegex(error.message);
}
```

The legacy `classifyErrorByRegex` retains the v1.31.x 6-prefix regex logic; tests cover both paths.

### T3 — `arxmlModuleShortNames` helper

```ts
// src/renderer/arxml/arxmlModuleShortNames.ts (NEW)
export function arxmlModuleShortNames(xml: string): readonly string[];
/**
 * Flatten all <SHORT-NAME> values inside <ECUC-MODULE-DEF> elements
 * found anywhere in the BSWMD ARXML (BSWMDs are not always wrapped in
 * <AUTOSAR> + schemaLocation; the renderer-side gate operates on raw
 * file content, not on the canonical parseArxml contract).
 *
 * Implementation note (mid-plan correction): uses fast-xml-parser
 * directly with a minimal config. parseArxml (src/core/arxml/parser.ts)
 * REQUIRES the <AUTOSAR> wrapper + schemaLocation + rejects pure-BSWMD
 * with a friendly "use Load BSWMD instead" error (parser.ts:128-143).
 * Those guards are correct for the ECUC value-file pipeline but
 * unsuitable for the UX-gate parse where a stripped-down walk is
 * sufficient.
 */
```

`findDcmBswmd` calls `arxmlModuleShortNames(xml).includes(DCM_MODULE_SHORT_NAME)`.

### T4 — `findDcmBswmd` helper

```ts
// src/renderer/components/dcmConfig/bswmdHasDcm.ts (NEW)

export interface BswmdHasDcmResult {
  readonly hasDcm: boolean;
  /** When `hasDcm === true`, the file path that supplied it (for autofill). */
  readonly dcmBswmdPath?: string;
}

export async function findDcmBswmd(
  bswmdPaths: readonly string[],
  fs: { readFile: (path: string) => Promise<string> },
): Promise<BswmdHasDcmResult>;
```

Behavior:

- Empty `bswmdPaths` → `{ hasDcm: false }`.
- All paths unparseable → `{ hasDcm: false }` (fail-soft at UX gate; real parse errors surface at click time via `bswmd-unreadable` IPC error class).
- Single Dcm BSWMD → `{ hasDcm: true, dcmBswmdPath: <that path> }`.
- Mixed → first Dcm BSWMD in input array order (deterministic).
- Per-path memoization lives in the consumer (the launcher hook), keyed by resolved path, to keep this helper pure.

### T5 — Launcher state machine extension

```ts
type LauncherMode =
  | 'idle'
  | 'picking-odx' // NEW
  | 'pending'
  | 'success'
  | 'error';
```

Transitions:

```
idle ──[promptAndOpen + !isActiveOdx]──> picking-odx ──[odx resolved]──> pending ──[ok]──> success
idle ──[promptAndOpen + isActiveOdx]───> pending ────────────────────────[err]──> error
picking-odx ──[user cancel]──> idle (status toast: 'dcmConfig.picker.cancelled')
```

`isActiveOdx` derived from `useArxmlStore((s) => s.activeDocumentPath?.toLowerCase().endsWith('.odx'))`.

### T6 — `DcmConfigPicker`

```tsx
interface DcmConfigPickerProps {
  readonly locale: Locale;
  readonly onResolve: (odxPath: string) => void | Promise<void>;
  readonly onCancel: () => void;
}

/** No JSX of its own — render-gates an openOdx() call. */
export function DcmConfigPicker(props: DcmConfigPickerProps): null;
```

Effect:

- On mount, invoke `window.autosarApi.openOdx()` (no args — `odx:open` IPC handler takes no parameters; `defaultPath`/`filters` are hardcoded in `openOdxHandler.ts:28-60`).
- On resolve (`{kind: 'opened', path, content}`) → `onResolve(path)`.
- On cancel (`{kind: 'canceled'}`) → `onCancel()`.
- On `read-failed` → `onCancel()` + console.warn (the OS dialog has already shown an error to the user per `openOdxHandler.ts:50-58`).
- Cleanup: guard against React 19 strict-mode double-invoke via a `mountedRef` (lesson `re-entrancy-guard-via-useref-not-setstate-callback-state`).

**Constraint discovered during planning**: `openOdx()` IPC takes no arguments (no `defaultPath` / `filters`). A future `odx:open-with-default` IPC would expand surface beyond envelope-migration-only scope; deferred to v1.33.0+ if UX testing shows lack of default folder is a friction point. The `.odx$` filter is already in place via the existing handler.

Override subcomponent (collapsed by default):

```tsx
<details>
  <summary>{t(locale, 'dcmConfig.bswmdPath.override')}</summary>
  <input
    type="text"
    value={overridePath ?? bswmdHasDcm.dcmBswmdPath ?? ''}
    readOnly // browse button deferred to v1.33.0
    disabled // v1.32.0 ships with override disabled
  />
</details>
```

Spec note: shipping disabled avoids the v1.32.0 scope expansion to a Bswmd-picker IPC. v1.33.0+ enables and adds the Browse button.

### T7 — i18n keys (4 new; `dcmConfig.picker.filter` removed because the filter is hardcoded in `openOdxHandler.ts` and not configurable from the renderer)

| Key                            | en                                    | zh-CN                  |
| ------------------------------ | ------------------------------------- | ---------------------- |
| `dcmConfig.picker.title`       | `Select ODX-D file`                   | `选择 ODX-D 文件`      |
| `dcmConfig.picker.cancelled`   | `ODX selection cancelled`             | `已取消 ODX 选择`      |
| `dcmConfig.bswmdPath.autofill` | `Auto-selected from project manifest` | `已从项目清单自动选择` |
| `dcmConfig.bswmdPath.override` | `Override BSWMD path`                 | `覆盖 BSWMD 路径`      |

### T8 — Wiring in `App.tsx` + ship

- `<DcmConfigPicker/>` mounted conditionally on `launcherState.mode === 'picking-odx'`.
- `AppHeader.tsx` + `ContextMenu.tsx`: gate switches from regex check to `bswmdHasDcm.hasDcm`.
- `DcmConfigSuccessDialog.tsx`: body adds `t(locale, 'dcmConfig.bswmdPath.autofill')` line when `bswmdPath` was auto-populated.
- `App.tsx`: import + wire.

## 4. Data Flow

### Cold-start (no active ODX)

1. User clicks "Open Dcm Config" in AppHeader.
2. Launcher `canOpenDcmConfig` is true (`odxLoaded && bswmdHasDcm.hasDcm && !busy`).
3. `promptAndOpen()` checks `isActiveOdx` → false → transitions to `picking-odx`.
4. `App.tsx` renders `<DcmConfigPicker/>`.
5. Picker invokes `openOdx()` (no args — handler hardcodes the `.odx$` filter); user picks → `onResolve(path)`.
6. Launcher `handlePickerResolve(path)` calls `open({odxPath: path, xlsxRows, bswmdPath: bswmdHasDcm.dcmBswmdPath})`.
7. Transition `picking-odx → pending`; IPC fires.

### Hot-path (active ODX already loaded)

1. Same as 1-2.
2. `promptAndOpen()` checks `isActiveOdx` → true → skip picker.
3. Call `open({odxPath: activeDocumentPath, xlsxRows, bswmdPath: bswmdHasDcm.dcmBswmdPath})`.
4. Transition `idle → pending`.

### Error surfacing

Handler returns `{ ok: false, error: { kind, message, cause? } }`. Launcher:

- Reads `kind` → maps to `DcmConfigErrorClass` → renders localized copy + 8s auto-dismiss toast.
- `kind === 'unknown'` falls back to regex classification on `message` (1-release compat).

## 5. Out of Scope (deferred)

- ❌ Removing the legacy regex fallback (v1.33.0; one-release compat window).
- ❌ Override Browse button + new Bswmd-picker IPC (v1.33.0+).
- ❌ BSWMD parse-cache eviction policy beyond per-path memo (YAGNI).
- ❌ Multi-ODX selection in picker (single-select matches `openOdx()`).
- ❌ DcmDsl / Security access / Dem services.

## 6. Test plan

### Test budget (+51)

| Test file                                                                     | Cases                                                                               | Δ       |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------- |
| `src/main/ipc/__tests__/dcmConfigHandler.test.ts`                             | 9 (kind per branch) + 5 (existing widened)                                          | +9      |
| `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts`                   | 9 (kind classify) + 6 (legacy regex fallback) + 3 (autofill + isActiveOdx + cancel) | +18     |
| `src/renderer/components/dcmConfig/__tests__/bswmdHasDcm.test.ts` (NEW)       | 12                                                                                  | +12     |
| `src/renderer/components/dcmConfig/__tests__/DcmConfigPicker.test.tsx` (NEW)  | 4                                                                                   | +4      |
| `src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx` | +2 (autofill label)                                                                 | +2      |
| `src/renderer/arxml/__tests__/arxmlModuleShortNames.test.ts` (NEW)            | 6                                                                                   | +6      |
| **Total**                                                                     |                                                                                     | **+51** |

Baseline 2933 + 7 SKIP / 0 fail → target **2984 + 7 SKIP / 0 fail** (unchanged from initial estimate; the `+1` for `picker.filter` was offset by other estimates being slightly conservative).

### Subagent-driven task split (8 tasks)

| #   | Task                                                                                    | Model  | Test delta             |
| --- | --------------------------------------------------------------------------------------- | ------ | ---------------------- |
| T1  | `DcmConfigErrorKind` type + handler populates kind at 9 sites                           | Sonnet | +9                     |
| T2  | Renderer `classifyError` rewrite (kind-first, regex-fallback)                           | Haiku  | +18                    |
| T3  | `arxmlModuleShortNames` helper + tests                                                  | Haiku  | +6                     |
| T4  | `findDcmBswmd` helper + tests                                                           | Haiku  | +12                    |
| T5  | Launcher state machine extension (picking-odx substate, autofill, isActiveOdx shortcut) | Sonnet | (folded into T2 tests) |
| T6  | `DcmConfigPicker` component + tests                                                     | Haiku  | +4                     |
| T7  | i18n keys (5 new) + SuccessDialog autofill label test                                   | Haiku  | +2                     |
| T8  | `App.tsx` wiring + `AppHeader.tsx` + `ContextMenu.tsx` swap regex→parse + ship          | Sonnet | (wiring only)          |

### Whole-branch review (post-ship)

Sonnet inline review on `T8` ship commit:

- 0 BLOCK / 0 CRITICAL expected.
- HIGH findings → fix in same MINOR.
- MEDIUM findings → v1.32.1 PATCH.
- LOW / SPEC findings → defer.

## 7. Risk Assessment

| Risk                                                                           | Likelihood | Impact | Mitigation                                                                                                                 |
| ------------------------------------------------------------------------------ | ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| Existing tests break on `DcmConfigError.kind` becoming required                | Medium     | Medium | TypeScript compile errors pin every site; widen assertions in same PR.                                                     |
| `dcmConfigPipeline` / `xlsxDcmServicesToEcucBatch` don't surface kind on throw | Medium     | Medium | Add `DcmConfigError` class with kind field; pipeline/mapper `throw new DcmConfigError(...)`; handler `instanceof` narrows. |
| Per-render BSWMD parse cost at scale (20+ BSWMD project)                       | Low        | Low    | Per-path memo in launcher; benchmark before optimizing.                                                                    |
| `isActiveOdx` shortcut races with activeDocumentPath change mid-pick           | Low        | Low    | Picker is synchronous; `activeDocumentPath` is store-derived; race is closed by `picking-odx` substate exclusivity.        |
| Legacy regex fallback drifts from handler message literals                     | Low        | Low    | Both share `DCM_MODULE_SHORT_NAME` constant; regex tests pin prefixes.                                                     |
| Override UI ships disabled — users expect it to work                           | Low        | Low    | `<details>` collapsed by default; future v1.33.0 enables.                                                                  |

## 8. Cross-references

- [v1.31.0 PATCH design](2026-07-06-v1-31-0-patch-dcm-config-renderer-ux-design.md) — parent.
- [v1.30.0 MINOR design](2026-07-06-v1-30-0-minor-dcm-config-IPC-bridge-wiring-design.md) — grandparent.
- Lessons:
  - `error-classification-via-regex-prefix-vs-envelope-kind-trade-off` (D5/D9): regex→kind rationale.
  - `filename-regex-for-ux-gate-vs-parse-based-detection-trade-off` (D4/D10): regex→parse rationale.
  - `backward-compat-branch-on-missing-discriminator-field`: kind fallback shape.
  - `re-entrancy-guard-via-useref-not-setstate-callback-state`: picker React-19 strict-mode guard.
  - `centralize-domain-identifiers-when-mapper-and-handler-and-pipeline-share-them`: `DCM_MODULE_SHORT_NAME` SoT.
  - `presentational-dialog-parity-port-pattern`: DcmConfigPicker thin-wrapper shape.
