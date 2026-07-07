# v1.33.0 MINOR — Dcm Config Cleanup + Override Activation

> **Status**: DESIGN — pre-flight (awaiting user review)
> **Ship target**: v1.33.0 MINOR
> **Baseline**: v1.32.1 PATCH (`a5c665c`, 2987 + 7 SKIP / 0 fail)
> **Spec author**: brainstorming flow (2026-07-07)
> **Related**:
>
> - [v1.32.1 PATCH release notes](../../release-notes/v1.32.1/README.md) (parent PATCH)
> - [v1.32.0 MINOR — Dcm Config Hardening + UX](2026-07-07-v1-32-0-minor-dcm-config-hardening-and-ux-design.md) (grandparent MINOR)
> - [v1.30.0 MINOR — dcmConfig IPC bridge wiring](2026-07-06-v1-30-0-minor-dcm-config-IPC-bridge-wiring-design.md) (great-grandparent)

## Summary

v1.32.0 MINOR + v1.32.1 PATCH shipped the Dcm config hardening + Override UI shell + release-notes fixes. v1.33.0 MINOR is the **final cleanup MINOR** for the Dcm config lineage (v1.30.0 MINOR → v1.33.0 MINOR). It closes 6 follow-up items:

1. **`xlsxLastImport` architectural wiring** — replace the `xlsxRows: []` placeholder in `promptAndOpen` / `handlePickerResolve` with a real Zustand slice that captures the most-recent xlsx-import result. New `XlsxImportSlice` + `xlsx:import-complete` IPC push channel.
2. **`bswmd:pick` IPC + Override activation** — add `bswmd:pick` IPC handler so the Override `<details>` Browse button can open a BSWMD file picker. Override `<input>` activates (`disabled=false`).
3. **`odx:open-with-default` IPC** — new IPC channel that accepts `defaultPath` + `filters`. `DcmConfigPicker` calls this instead of `openOdx()` so the OS dialog opens at the project root (or BSWMD parent dir) instead of user-home.
4. **Drop legacy regex fallback** — `classifyErrorByRegex` and 12 related test cases deleted. `classifyError` reads `kind` exclusively (defensive `UNKNOWN` fallback kept for type-safety).
5. **`bswmdPath: optional → required`** — `DcmConfigHandlerResult.bswmdPath: string` (was `bswmdPath?: string`). Handler always populates from the launcher-resolved path.
6. **SuccessDialog row count surface** — render `appliedStepCount` (or xlsx row count) symmetrically in the autofill label, complementing the existing `bswmdPath` line.

After v1.33.0 ships, the Dcm config chain is **fully closed** — no further PATCH candidates from this lineage.

## 1. Goals & Non-Goals

### Goals

- Eliminate the `xlsxRows: []` placeholder that persisted from v1.31.x through v1.32.x.
- Activate the Override UI Browse button so the user can pick a real BSWMD override file.
- Make the ODX picker open at a sensible default folder (project root or BSWMD parent).
- Close the v1.32.0 spec §5 1-release compat window for the legacy regex classifier.
- Strengthen `DcmConfigHandlerResult.bswmdPath` to `required` — eliminates a class of consumer-side `undefined` checks.
- Surface xlsx row count in the SuccessDialog so users see what was applied.
- Maintain IPC surface additive: no breaking changes to existing channels; new channels are independent.
- Test count target: 2987 + 7 SKIP → **2998 + 7 SKIP / 0 fail** (+11 net).

### Non-Goals (1.33.0)

- ❌ `parseArxmlLite` canonicalization (deferred to v1.34.0+ — YAGNI until a second consumer of the lightweight parse emerges).
- ❌ Enabling Override UI persistence across sessions (override picks are session-scoped).
- ❌ Multi-BSWMD project override (current design supports a single override path).
- ❌ `xlsxImportHistory` UI surfacing (the history slice is stored but not displayed — future UX work).
- ❌ DcmDsl / Security access / Dem services (unchanged from v1.31.0/v1.32.0 non-goals).
- ❌ Override keyboard shortcut (no UX hook).

## 2. Architecture

### Layered design (extends v1.32.1)

```
┌────────────────────────────────────────────────────────────────────────┐
│ xlsx-import flow (renderer store)                                      │
│   xlsxEcucBatchImportHandler (existing v1.23.0 IPC) →                   │
│   on success, webContents.send('xlsx:import-complete', payload) →      │
│   xlsxImportListener hook → useArxmlStore.setXlsxLastImport(record)    │
└────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────────────────┐
│ useDcmConfigLauncher (v1.32.0 hook; modified for v1.33.0)              │
│                                                                        │
│ promptAndOpen() entry — replaces xlsxRows:[] placeholder:              │
│   const xlsx = useArxmlStore.getState().xlsxLastImport                  │
│   const xlsxRows = xlsx?.rows ?? []                                    │
│   → open({ odxPath, xlsxRows, bswmdPath })                             │
│                                                                        │
│ State slice additions:                                                  │
│   bswmdPathOverride?: string  // set by handleOverridePick              │
│                                                                        │
│ New actions:                                                            │
│   handleOverridePick() — opens bswmd:pick IPC, updates bswmdPathOverride│
│   handleOverrideClear() — clears bswmdPathOverride, reverts to autofill │
│                                                                        │
│ (v1.33.0) classifyError: kind-first ONLY                                │
│   classifyErrorByRegex deleted (1-release window expired)               │
│   Defensive 'UNKNOWN' fallback for legacy typed-cast payloads           │
└────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────────────────┐
│ DcmConfigSuccessDialog (v1.32.1; extended for v1.33.0)                  │
│                                                                        │
│ Override <details> ACTIVE:                                              │
│   <input readOnly={false}> value=bswmdPathOverride ?? result.bswmdPath │
│   <DcmConfigOverridePicker>Browse...</DcmConfigOverridePicker>          │
│                                                                        │
│ Autofill block:                                                         │
│   result.bswmdPath — always rendered (now required)                    │
│   result.appliedStepCount — NEW line: "X rows applied: <count>"         │
└────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────────────────┐
│ IPC surface (additive only — no breaking changes)                      │
│                                                                        │
│ dcm:config (v1.32.0) — unchanged shape, kind required                  │
│ bswmd:pick (NEW v1.33.0) — {kind: 'opened', path, content} | 'canceled' │
│ odx:open-with-default (NEW v1.33.0) — {defaultPath?, filters?}          │
│   returns {kind: 'opened'|'canceled'|'read-failed'}                    │
│ xlsx:import-complete (NEW v1.33.0 push) — broadcast payload             │
│                                                                        │
│ DcmConfigHandlerResult (v1.33.0) — bswmdPath: string (was optional)     │
└────────────────────────────────────────────────────────────────────────┘
```

### Component placement

| Component | Path | Type |
| --- | --- | --- |
| `XlsxImportRecord` (NEW type) | `src/renderer/store/slices/xlsxImportSlice.ts` | NEW |
| `XlsxImportSlice` (NEW) | `src/renderer/store/slices/xlsxImportSlice.ts` | NEW |
| `createXlsxImportSlice` (NEW) | `src/renderer/store/slices/xlsxImportSlice.ts` | NEW |
| `xlsxImportListener` (NEW) | `src/renderer/store/xlsxImportListener.ts` | NEW |
| `useArxmlStore` (MODIFIED) | `src/renderer/store/useArxmlStore.ts` | MODIFY (add slice to intersection) |
| `BswmdPickResult` (NEW type) | `src/shared/types.ts` | NEW |
| `bswmdPickDialog` (NEW) | `src/main/ipc/bswmdPickHandler.ts` | NEW |
| `OpenOdxWithDefaultRequest` (NEW type) | `src/shared/types.ts` | NEW |
| `OpenOdxWithDefaultResult` (NEW type) | `src/shared/types.ts` | NEW |
| `openOdxWithDefaultDialog` (NEW) | `src/main/ipc/openOdxWithDefaultHandler.ts` | NEW |
| `DcmConfigOverridePicker` (NEW) | `src/renderer/components/dcmConfig/DcmConfigOverridePicker.tsx` | NEW presentational |
| `useDcmConfigLauncher` (MODIFIED) | `src/renderer/hooks/useDcmConfigLauncher.ts` | MODIFY |
| `DcmConfigSuccessDialog` (MODIFIED) | `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx` | MODIFY (Override activation + row count) |
| `DcmConfigPicker` (MODIFIED) | `src/renderer/components/dcmConfig/DcmConfigPicker.tsx` | MODIFY (defaultPath prop) |
| `App.tsx` (MODIFIED) | `src/renderer/App.tsx` | MODIFY (defaultPath computation) |
| `dcmConfigHandler` (MODIFIED) | `src/main/ipc/dcmConfigHandler.ts` | MODIFY (bswmdPath always populated) |
| `DcmConfigHandlerResult` (MODIFIED) | `src/shared/types.ts` | MODIFY (bswmdPath required) |
| `IPC_CHANNELS` (MODIFIED) | `src/shared/ipc-contract.ts` | MODIFY (3 new channels) |
| `register` (MODIFIED) | `src/main/ipc/register.ts` | MODIFY (2 new handler registrations) |
| `preload` (MODIFIED) | `src/preload/index.ts` | MODIFY (2 new method exposures + 2 listeners) |
| `xlsxEcucBatchImportHandler` (MODIFIED) | `src/main/ipc/xlsxEcucBatchImportHandler.ts` | MODIFY (push payload on success) |
| `classifyErrorByRegex` (DELETED) | `src/renderer/hooks/useDcmConfigLauncher.ts` | DELETE |
| 12 regex test cases (DELETED) | `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` | DELETE |
| 3 bswmdPath absence tests (DELETED) | `src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx` | DELETE |

## 3. Detailed Design

### T1 — `xlsxImportSlice` + IPC push integration

**Type**:

```ts
// src/renderer/store/slices/xlsxImportSlice.ts (NEW)
import type { StateCreator } from 'zustand';
import type { EcucInstanceRow } from '@shared/types.js';
import type { ArxmlState } from '../useArxmlStore.js';

export interface XlsxImportRecord {
  readonly rows: readonly EcucInstanceRow[];
  readonly source: 'manual' | 'wizard';
  readonly importedAt: number;  // Date.now()
}

export interface XlsxImportSlice {
  readonly xlsxLastImport: XlsxImportRecord | null;
  readonly xlsxImportHistory: readonly XlsxImportRecord[];  // last 5
  setXlsxLastImport: (record: XlsxImportRecord | null) => void;
}

const MAX_HISTORY = 5;

export const createXlsxImportSlice: StateCreator<
  ArxmlState,
  [],
  [],
  XlsxImportSlice
> = (set) => ({
  xlsxLastImport: null,
  xlsxImportHistory: [],
  setXlsxLastImport: (record) => set((s) => ({
    xlsxLastImport: record,
    xlsxImportHistory: record === null
      ? []
      : [record, ...s.xlsxImportHistory].slice(0, MAX_HISTORY),
  })),
});
```

**Listener** (window-level singleton):

```ts
// src/renderer/store/xlsxImportListener.ts (NEW)
import { useArxmlStore } from './useArxmlStore.js';
import type { EcucInstanceRow } from '@shared/types.js';

interface XlsxImportCompletePayload {
  readonly rows: readonly EcucInstanceRow[];
  readonly source: 'manual' | 'wizard';
}

/** Attach the IPC push listener for xlsx:import-complete.
 *  Returns a cleanup function for hot-reload safety. */
export function attachXlsxImportListener(): () => void {
  const handler = (_event: unknown, payload: XlsxImportCompletePayload) => {
    useArxmlStore.getState().setXlsxLastImport({
      rows: payload.rows,
      source: payload.source,
      importedAt: Date.now(),
    });
  };
  window.autosarApi.onXlsxImportComplete(handler);
  return () => window.autosarApi.offXlsxImportComplete(handler);
}
```

**IPC handler writeback** (in `xlsxEcucBatchImportHandler.ts`):

After successful xlsx import + parse:

```ts
// After computing the final result + returning {ok, value}:
import { BrowserWindow } from 'electron';
const sender = BrowserWindow.fromWebContents(event.sender);
if (sender !== null) {
  sender.webContents.send('xlsx:import-complete', {
    rows: ecucRows,
    source: 'wizard',
  });
}
```

The sender-receiver relationship is the IPC channel's `event.sender`, not a global broadcast — multi-window safety preserved.

### T2 — `bswmd:pick` IPC + Override activation

**IPC channel**:

```ts
// src/shared/ipc-contract.ts — ADD
BSWMD_PICK: 'bswmd:pick',
```

**Type**:

```ts
// src/shared/types.ts — ADD
export type BswmdPickResult =
  | { readonly kind: 'opened'; readonly path: string; readonly content: string }
  | { readonly kind: 'canceled' };
```

**Handler**:

```ts
// src/main/ipc/bswmdPickHandler.ts (NEW, ~40 LoC)

import { promises as fs } from 'node:fs';
import { dialog, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-contract.js';
import type { BswmdPickResult } from '../../shared/types.js';

export async function bswmdPickDialog(): Promise<BswmdPickResult> {
  const result = await dialog.showOpenDialog({
    title: 'Override BSWMD',
    properties: ['openFile'],
    filters: [
      { name: 'BSWMD', extensions: ['arxml'] },
      { name: 'All', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { kind: 'canceled' };
  }
  const path = result.filePaths[0]!;
  try {
    const content = await fs.readFile(path, 'utf8');
    return { kind: 'opened', path, content };
  } catch (err) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Failed to read BSWMD',
      message: err instanceof Error ? err.message : String(err),
    });
    return { kind: 'canceled' };
  }
}

export function registerBswmdPickHandler(): void {
  ipcMain.handle(
    IPC_CHANNELS.BSWMD_PICK,
    async (): Promise<BswmdPickResult> => bswmdPickDialog(),
  );
}
```

**Register + preload**:

```ts
// src/main/ipc/register.ts — ADD
import { registerBswmdPickHandler } from './bswmdPickHandler.js';
// ... inside the registration block:
registerBswmdPickHandler();

// src/preload/index.ts — ADD (next to existing readBswmd)
bswmdPick: (): Promise<BswmdPickResult> =>
  ipcRenderer.invoke(IPC_CHANNELS.BSWMD_PICK),
```

**Override picker component**:

```tsx
// src/renderer/components/dcmConfig/DcmConfigOverridePicker.tsx (NEW, ~60 LoC)

import { useEffect, useRef } from 'react';

interface DcmConfigOverridePickerProps {
  readonly value: string;
  readonly onChange: (path: string) => void;
  readonly onCancel: () => void;
}

/** Browse button + cancel button for the Override <details> subcomponent.
 *  Renders a button cluster; the parent dialog owns the <input> field. */
export function DcmConfigOverridePicker(
  props: DcmConfigOverridePickerProps,
): JSX.Element {
  // No mountedRef needed — this is a sync button handler, not an
  // async IPC effect. (Strict-mode double-fire would invoke the click
  // handler twice, but the user has to actually click.)
  // ... button cluster implementation
}
```

(Implementation: 2 buttons — "Browse..." and "Clear". On click, `await window.autosarApi.bswmdPick()`. On opened, call `findDcmBswmd([path], ...)` for sanity check; pass/fail propagates to `onChange`/`onCancel`.)

**SuccessDialog activation**:

```tsx
// src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx — MODIFY

// Inside the existing <details>:
<details>
  <summary>{t(locale, 'dcmConfig.bswmdPath.override')}</summary>
  <input
    type="text"
    value={result.bswmdPath ?? ''}  // v1.33.0: required, so ?? '' is defensive
    readOnly
    disabled={false}  // v1.33.0: now active (was disabled=true in v1.32.1)
    data-testid="dcm-config-override-input"
  />
  <DcmConfigOverridePicker
    value={result.bswmdPath}
    onChange={handleOverrideChange}
    onCancel={handleOverrideCancel}
  />
</details>
```

### T3 — `odx:open-with-default` IPC + `DcmConfigPicker` defaultPath

**IPC channel**:

```ts
// src/shared/ipc-contract.ts — ADD
ODX_OPEN_WITH_DEFAULT: 'odx:open-with-default',
```

**Types**:

```ts
// src/shared/types.ts — ADD
export interface OpenOdxWithDefaultRequest {
  readonly defaultPath?: string;
  readonly filters?: readonly {
    readonly name: string;
    readonly extensions: readonly string[];
  }[];
}

export type OpenOdxWithDefaultResult =
  | { readonly kind: 'opened'; readonly path: string; readonly content: string }
  | { readonly kind: 'canceled' }
  | { readonly kind: 'read-failed'; readonly message: string };
```

**Handler**:

```ts
// src/main/ipc/openOdxWithDefaultHandler.ts (NEW, ~55 LoC)

import { promises as fs } from 'node:fs';
import { dialog, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-contract.js';
import type {
  OpenOdxWithDefaultRequest,
  OpenOdxWithDefaultResult,
} from '../../shared/types.js';

export async function openOdxWithDefaultDialog(
  req: OpenOdxWithDefaultRequest,
): Promise<OpenOdxWithDefaultResult> {
  const result = await dialog.showOpenDialog({
    title: 'Select ODX-D file',
    defaultPath: req.defaultPath,
    properties: ['openFile'],
    filters: req.filters?.map((f) => ({
      name: f.name,
      extensions: [...f.extensions],
    })) ?? [{ name: 'ODX', extensions: ['odx'] }],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { kind: 'canceled' };
  }
  const path = result.filePaths[0]!;
  try {
    const content = await fs.readFile(path, 'utf8');
    return { kind: 'opened', path, content };
  } catch (err) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Failed to read ODX',
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      kind: 'read-failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export function registerOpenOdxWithDefaultHandler(): void {
  ipcMain.handle(
    IPC_CHANNELS.ODX_OPEN_WITH_DEFAULT,
    async (
      _event,
      req: OpenOdxWithDefaultRequest,
    ): Promise<OpenOdxWithDefaultResult> => openOdxWithDefaultDialog(req),
  );
}
```

**DcmConfigPicker integration**:

```tsx
// src/renderer/components/dcmConfig/DcmConfigPicker.tsx — MODIFY

interface DcmConfigPickerProps {
  readonly locale: 'en' | 'zh-CN';
  readonly defaultPath?: string;  // NEW v1.33.0
  readonly onResolve: (odxPath: string) => void | Promise<void>;
  readonly onCancel: () => void;
}

export function DcmConfigPicker(props: DcmConfigPickerProps): null {
  const mountedRef = useRef(false);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    void (async () => {
      // v1.33.0 — pass defaultPath to the new IPC channel
      const result = await window.autosarApi.openOdxWithDefault({
        defaultPath: propsRef.current.defaultPath,
      });
      const { onResolve, onCancel } = propsRef.current;
      if (result.kind === 'opened') {
        await onResolve(result.path);
      } else if (result.kind === 'canceled') {
        onCancel();
      } else {
        console.warn(`DcmConfigPicker: ODX read failed: ${result.message}`);
        onCancel();
      }
    })();
  }, []);

  return null;
}
```

**App.tsx defaultPath computation**:

```tsx
// src/renderer/App.tsx — MODIFY

{launcherState.mode === 'picking-odx' && (
  <DcmConfigPicker
    locale={locale}
    defaultPath={
      project?.rootDir ??
      bswmdHasDcm.dcmBswmdPath?.split(/[/\\]/).slice(0, -1).join('/')
    }
    onResolve={launcher.handlePickerResolve}
    onCancel={launcher.handlePickerCancel}
  />
)}
```

`defaultPath` falls back to the BSWMD's parent directory if no project root — a sensible "near the BSWMD" default without needing a project manifest.

### T4 — Drop legacy regex fallback

```ts
// src/renderer/hooks/useDcmConfigLauncher.ts — DELETE

// v1.32.0 deprecated function removed in v1.33.0 MINOR per spec §5
// (1-release compat window expired). Renderer classifyError now reads
// kind exclusively; legacy payloads without kind are unreachable
// because v1.32.0+ handlers always populate kind at 9 return sites.
//
// Lesson: error-classification-via-regex-prefix-vs-envelope-kind-trade-off
//   — regex path retired; kind discriminator is the only classifier.

// class classifyErrorByRegex(message: string): DcmConfigErrorClass { ... } — DELETED
```

```ts
// class classifyError(error: DcmConfigError): DcmConfigErrorClass — SIMPLIFIED

export function classifyError(error: DcmConfigError): DcmConfigErrorClass {
  if (typeof error === 'object' && error !== null && 'kind' in error) {
    return KIND_TO_CLASS[error.kind];
  }
  return 'UNKNOWN';  // Defensive: should never happen in v1.32.0+ payloads.
}
```

**Tests dropped + added** in `useDcmConfigLauncher.test.ts`:
- DELETE: 9 `classifyErrorByRegex` cases.
- DELETE: 3 backward-compat cases (`describe('classifyError backward-compat ... missing kind')`).
- KEEP: 9 kind-mapping cases.
- ADD: 1 defensive-fallback case (`classifyError({...no kind...})` returns `'UNKNOWN'`).

### T5 — Launcher xlsxRows + handleOverridePick wiring

```ts
// src/renderer/hooks/useDcmConfigLauncher.ts — MODIFY

const promptAndOpen = useCallback(async () => {
  if (inFlightRef.current) return;
  if (!bswmdHasDcm.hasDcm) return;
  inFlightRef.current = true;
  try {
    // v1.33.0 — source xlsxRows from store (was [] placeholder)
    const xlsxRows = useArxmlStore.getState().xlsxLastImport?.rows ?? [];

    if (isActiveOdx && activeDocumentPath) {
      await open({
        odxPath: activeDocumentPath,
        xlsxRows,
        bswmdPath: bswmdPathOverride ?? bswmdHasDcm.dcmBswmdPath,
      });
      return;
    }
    setState((s) => ({ ...s, mode: 'picking-odx' }));
  } finally {
    inFlightRef.current = false;
  }
}, [bswmdHasDcm, isActiveOdx, activeDocumentPath, bswmdPathOverride, /* etc */]);

const handlePickerResolve = useCallback(async (odxPath: string) => {
  setState((s) => ({ ...s, mode: 'pending' }));
  const xlsxRows = useArxmlStore.getState().xlsxLastImport?.rows ?? [];
  const bswmdPath = bswmdPathOverride ?? bswmdHasDcm.dcmBswmdPath;
  await open({ odxPath, xlsxRows, bswmdPath });
}, [bswmdHasDcm.dcmBswmdPath, bswmdPathOverride, /* etc */]);

const handleOverridePick = useCallback(async (path: string) => {
  setState((s) => ({ ...s, bswmdPathOverride: path }));
  // No IPC re-fire here — the override is applied on the NEXT open() call.
}, []);

const handleOverrideClear = useCallback(() => {
  setState((s) => ({ ...s, bswmdPathOverride: undefined }));
}, []);
```

### T6 — `bswmdPath: optional → required`

```ts
// src/shared/types.ts — MODIFY
export interface DcmConfigHandlerResult {
  readonly dcmConfigXml: string;
  readonly odxLinkedDcmDspCount: number;
  readonly odxLinkedRoutineCount: number;
  readonly serviceCounts: Readonly<Record<DcmServiceKind, number>>;
  readonly outputPath: string;
  readonly appliedStepCount: number;
  readonly bswmdPath: string;  // v1.33.0 — was optional. Always populated.
}
```

```ts
// src/main/ipc/dcmConfigHandler.ts — MODIFY

const result: DcmConfigHandlerResult = {
  dcmConfigXml: finalXml,
  odxLinkedDcmDspCount: pipelineResult.odxLinkedDcmDspCount,
  odxLinkedRoutineCount: pipelineResult.odxLinkedRoutineCount,
  serviceCounts: pipelineResult.serviceCounts,
  outputPath,
  appliedStepCount,
  bswmdPath: dcmBswmdPath,  // v1.33.0 — always populated; no `??`
};
```

`args.bswmdPath ?? dcmBswmdPath` resolution moves entirely to the launcher (already done there per v1.32.0's autofill); the handler always receives a resolved path and always echoes it back.

**Tests** in `DcmConfigSuccessDialog.test.tsx`:
- DELETE: 3 `bswmdPathAutofill` absence tests (path is always set now).
- ADD: 1 always-populated assertion in the existing positive case.

### T7 — Wiring + SuccessDialog row count surface

```tsx
// src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx — MODIFY

{result.bswmdPath && (
  <p className="dcm-config-success-bswmd-autofill">
    {t(locale, 'dcmConfig.bswmdPath.autofill')}: <code>{result.bswmdPath}</code>
  </p>
)}
{result.appliedStepCount > 0 && (
  <p className="dcm-config-success-applied-count">
    {t(locale, 'dcmConfig.appliedCount.summary', { count: result.appliedStepCount })}
  </p>
)}
```

New i18n key: `dcmConfig.appliedCount.summary` = "Applied {count} xlsx rows" / "已应用 {count} 行 xlsx 数据" (en/zh-CN).

**Tests** in `DcmConfigSuccessDialog.test.tsx`:
- ADD: 1 test asserting row count renders when `appliedStepCount > 0`.

### T8 — Ship

Standard ship mechanics per the project's `gh-api-ship-pattern-recap` + `follow-tags-unreliable-separate-push-tag` + `gh-release-create-40-char-target-first-try-no-422` lessons:

1. `pnpm verify` (7 stages GREEN).
2. `git push origin main` + `git push origin v1.33.0` (TWO separate pushes).
3. `gh release create v1.33.0 --target <40-char-sha> --notes-file docs/release-notes/v1.33.0/README.md`.

## 4. Test Plan

### Test budget (+11 net)

| Test file | Δ | Cumulative |
| --- | --- | --- |
| `src/renderer/store/__tests__/xlsxImportSlice.test.ts` (NEW) | +5 | 2987 → 2992 |
| `src/main/ipc/__tests__/bswmdPickHandler.test.ts` (NEW) | +4 | 2992 → 2996 |
| `src/renderer/components/dcmConfig/__tests__/DcmConfigOverridePicker.test.tsx` (NEW) | +5 | 2996 → 3001 |
| `src/main/ipc/__tests__/openOdxWithDefaultHandler.test.ts` (NEW) | +4 | 3001 → 3005 |
| `src/renderer/components/dcmConfig/__tests__/DcmConfigPicker.test.tsx` (UPDATED) | +1 (defaultPath prop test) | 3005 → 3006 |
| `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` (UPDATED) | -9 (regex) -3 (backward-compat) +1 (defensive fallback) | 3006 → 2995 |
| `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` (NEW xlsxRows + handleOverridePick tests) | +3 | 2995 → 2998 |
| `src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx` (UPDATED) | -3 (absence) +1 (always-populated) +1 (row count) | 2998 → 2997 |
| **Total** | | **2987 → 2998 (+11)** |

Baseline 2987 + 7 SKIP / 0 fail (from v1.32.1 PATCH `a5c665c`) → target **2998 + 7 SKIP / 0 fail**.

### Subagent-driven task split (8 tasks)

| # | Task | Model | Test delta |
| --- | --- | --- | --- |
| T1 | `xlsxImportSlice` + IPC push listener + handler writeback | Sonnet | +5 |
| T2 | `bswmdPickHandler` + `DcmConfigOverridePicker` + IPC channel + preload | Sonnet | +9 |
| T3 | `openOdxWithDefaultHandler` + `DcmConfigPicker` defaultPath | Haiku | +5 |
| T4 | `classifyErrorByRegex` deletion + `classifyError` simplify | Haiku | -11 |
| T5 | Launcher `xlsxRows` + `handleOverridePick` + `bswmdPathOverride` state | Sonnet | +3 |
| T6 | `bswmdPath: optional → required` + dialog absence test removal | Haiku | -2 |
| T7 | Wiring + SuccessDialog row count surface + appliedCount i18n key | Sonnet | +2 |
| T8 | Ship: `pnpm verify` + 2 separate pushes + `gh release create` | Sonnet | (wiring only) |

## 5. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| `xlsxLastImport` race — multiple imports before launcher reads | Low | Medium | `xlsxImportHistory` keeps last 5; `xlsxLastImport` is most recent. Launcher reads at IPC invocation time (not mount time), race naturally bounded. |
| `bswmd:pick` IPC payload size | Low | Low | BSWMD files < 1 MB typically. Existing 32 MiB cap applies. |
| `odx:open-with-default` filters arg mutability | Low | Low | Handler spreads `req.filters` into fresh array. Pattern matches `xlsxEcucBatchImportHandler`. |
| Regex deletion breaks hidden consumers | Very Low | High | Grep for `classifyErrorByRegex` returns 0 external uses after deletion. Pre-ship check enforces. |
| `bswmdPath: optional → required` breaks downstream | Low | Medium | 3 known consumers (handler, dialog, launcher). All updated atomically in T6. |
| `DcmConfigOverridePicker` parse-fail silent | Low | Medium | If a non-BSWMD file is picked, `findDcmBswmd` returns `{hasDcm: false}`; we call `onCancel()` + `console.warn`. Real errors surface via `bswmd-unreadable` IPC error class. |
| `xlsx:import-complete` IPC push ordering | Low | Low | Listener is idempotent (always overwrites `xlsxLastImport`). |
| Override UI activation regresses v1.32.1 PATCH behavior | Very Low | Low | v1.32.1 shipped `disabled={true}`; v1.33.0 changes to `disabled={false}` + adds Browse. Existing tests assert input visibility (kept). |
| `arxmlModuleShortNames` uses direct fast-xml-parser (refactor deferred) | Low | Low | Tracked in v1.33.0 spec — YAGNI until 2nd consumer. |
| 8-task subagent dispatch surface | Low | Medium | Per project pattern; per-task reviewer gates catch regressions; whole-branch review at end routes any missed items. |

## 6. Lessons (NEW from v1.33.0 design)

1. **`store-as-source-of-truth-for-async-args`** — When an IPC consumer needs data that lives outside React state, it belongs in a Zustand slice, not a hook local. Placeholder `xlsxRows: []` is acceptable for 1-release migration; persisting it is debt.
2. **`disable-input-without-browse-button-is-debt`** — Disabled `<input>` with no Browse button is half-finished UX. Plan the activation path in the same MINOR or explicitly defer with a tracking item.
3. **`additive-ipc-channels-over-extending-args`** — When adding `defaultPath` / `filters` to an existing IPC, prefer a new `xxx:with-default` channel over extending the existing channel's args. Additive preserves semver.
4. **`1-release-compat-window-explicit-removal`** — When deferring a cleanup with "removed in v.N+1", set a tracking item at v.N ship time. v1.32.0 spec §5 said "regex removed in v1.33.0"; without spec+plan tracking, it would have been forgotten.

## 7. Cross-references

- [v1.32.1 PATCH release notes](../../release-notes/v1.32.1/README.md) (parent PATCH)
- [v1.32.0 MINOR design spec](2026-07-07-v1-32-0-minor-dcm-config-hardening-and-ux-design.md) (grandparent MINOR)
- [v1.30.0 MINOR design spec](2026-07-06-v1-30-0-minor-dcm-config-IPC-bridge-wiring-design.md) (great-grandparent)
- Lessons pinned:
  - `error-classification-via-regex-prefix-vs-envelope-kind-trade-off` (v1.32.0; T4 removes the regex path in v1.33.0)
  - `re-entrancy-guard-via-useref-not-setstate-callback-state` (v1.32.0; reused in `DcmConfigOverridePicker` mount)
  - `centralize-domain-identifiers-when-mapper-and-handler-and-pipeline-share-them` (v1.32.0; reused)
  - `presentational-dialog-parity-port-pattern` (v1.32.0; reused in `DcmConfigOverridePicker`)

## 8. Known follow-ups (deferred to v1.34.0+)

- ❌ `parseArxmlLite` canonicalization (single-consumer is fine; revisit when 2nd consumer emerges).
- ❌ Override UI persistence across sessions (current design is session-scoped).
- ❌ Multi-BSWMD project override (current design supports single override path).
- ❌ `xlsxImportHistory` UI surfacing (history stored but not displayed; future UX work).
- ❌ Override keyboard shortcut.

## 9. Pre-Ship Verification Checklist

- [ ] All 8 tasks have reviewer-approved status.
- [ ] `pnpm verify` 7-stage GREEN.
- [ ] `git push origin main` succeeds.
- [ ] `git push origin v1.33.0` succeeds (separate push — no `--follow-tags`).
- [ ] `gh release create v1.33.0` with 40-char SHA succeeds.
- [ ] Tag visible on origin via `git ls-remote --tags origin | grep v1.33.0`.
- [ ] Release URL: `https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.33.0`.