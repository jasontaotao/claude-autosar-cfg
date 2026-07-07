# v1.33.0 MINOR — Dcm Config Cleanup + Override Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Dcm-config chain (v1.30.0 MINOR → v1.33.0 MINOR) by eliminating the `xlsxRows: []` placeholder, activating the Override UI Browse button, adding an `odx:open-with-default` IPC, dropping the legacy regex fallback, and tightening `bswmdPath: optional → required`.

**Architecture:** Layered extension of v1.32.1. New `XlsxImportSlice` (Zustand) + IPC push listener captures xlsx-import results. New `bswmd:pick` + `odx:open-with-default` IPCs activate previously-deferred UX. `classifyErrorByRegex` deleted (1-release compat window expired per v1.32.0 spec §5). `DcmConfigHandlerResult.bswmdPath` promoted to required.

**Tech Stack:** TypeScript 5.6, React 19, vitest 3, jsdom + @testing-library/react. IPC: existing `dcm:config`, `bswmd:read`, `odx:open`, plus NEW `bswmd:pick`, `odx:open-with-default`, `xlsx:import-complete` (push). State: zustand `useArxmlStore`.

## Global Constraints

- Baseline: v1.32.1 PATCH `a5c665c` (2987 + 7 SKIP / 0 fail).
- Test target: 2987 + 7 SKIP → **2998 + 7 SKIP / 0 fail** (+11).
- IPC surface: **additive only**. New channels (`bswmd:pick`, `odx:open-with-default`, `xlsx:import-complete` push) are independent. NO breaking changes to existing channels.
- TDD bite-sized: RED + GREEN as separate commits (per v1.32.0 PATCH T4-T7 review finding). Tasks T1, T2, T5, T7 — RED+GREEN split (integration complexity). Tasks T3, T4, T6 — single commit (mechanical / deletion).
- All renderer tests use `userEvent` not `fireEvent` (per `react/testing.md`). Wrap state changes in `act()`. Use `vi.fn()` on `window.autosarApi` (matches v1.31.x pattern).
- i18n: every user-facing string goes through `t(locale, key)` with both en + zh-CN bundles updated.
- Spec reference: `docs/superpowers/specs/2026-07-07-v1-33-0-minor-dcm-config-cleanup-design.md`.
- Lessons pinned (apply where each is relevant):
  - `store-as-source-of-truth-for-async-args` (T1, T5) — NEW lesson
  - `disable-input-without-browse-button-is-debt` (T2) — NEW lesson
  - `additive-ipc-channels-over-extending-args` (T2, T3) — NEW lesson
  - `1-release-compat-window-explicit-removal` (T4) — NEW lesson
  - `re-entrancy-guard-via-useref-not-setstate-callback-state` (T2)
  - `centralize-domain-identifiers-when-mapper-and-handler-and-pipeline-share-them`
  - `presentational-dialog-parity-port-pattern` (T2)
  - `error-classification-via-regex-prefix-vs-envelope-kind-trade-off` (T4)
- No `console.log` in production code.
- `pnpm verify` (format + lint + typecheck + test + coverage + build + import-regression) must pass before each ship commit.
- All comments: 用户面向/业务逻辑 → 中文; 技术 API/外部接口/协议字段 → 英文 (per CLAUDE.md).
- All modified/new files end with trailing newline.

---

### Task 1: XlsxImportSlice + IPC push listener

**Files:**

- Create: `src/renderer/store/slices/xlsxImportSlice.ts`
- Create: `src/renderer/store/xlsxImportListener.ts`
- Create: `src/renderer/store/__tests__/xlsxImportSlice.test.ts`
- Modify: `src/renderer/store/useArxmlStore.ts` (add `XlsxImportSlice` to intersection + `createXlsxImportSlice` to composition)
- Modify: `src/shared/ipc-contract.ts` (add `XLSX_IMPORT_COMPLETE: 'xlsx:import-complete'`)
- Modify: `src/preload/index.ts` (expose `onXlsxImportComplete(handler)` + `offXlsxImportComplete(handler)`)
- Modify: `src/main/ipc/xlsxEcucBatchImportHandler.ts` (push payload via `mainWindow.webContents.send` on success)

**Interfaces:**

- Consumes: existing `xlsxEcucBatchImportHandler` (no signature change — push happens inside the handler)
- Produces: `XlsxImportRecord` + `XlsxImportSlice` exported from `src/renderer/store/slices/xlsxImportSlice.ts`; `attachXlsxImportListener(): () => void` exported from `src/renderer/store/xlsxImportListener.ts`; `XLSX_IMPORT_COMPLETE` channel constant

- [ ] **Step 1.1: Write the failing test — slice state + actions (RED)**

Create `src/renderer/store/__tests__/xlsxImportSlice.test.ts`:

```ts
// v1.33.0 MINOR T1 — xlsxImportSlice state + actions.
import { beforeEach, describe, expect, it } from 'vitest';
import type { EcucInstanceRow } from '../../../shared/types.js';
import { createXlsxImportSlice } from '../slices/xlsxImportSlice.js';
import { useArxmlStore } from '../useArxmlStore.js';

const SAMPLE_ROWS: readonly EcucInstanceRow[] = [
  { sheet: 'DcmReadDataById', shortName: 'ReadVbatt', params: { didRef: 'Vbatt' } },
];

describe('xlsxImportSlice (v1.33.0 T1)', () => {
  beforeEach(() => {
    useArxmlStore.setState({
      xlsxLastImport: null,
      xlsxImportHistory: [],
    });
  });

  it('default state: xlsxLastImport null, xlsxImportHistory empty', () => {
    const s = useArxmlStore.getState();
    expect(s.xlsxLastImport).toBeNull();
    expect(s.xlsxImportHistory).toEqual([]);
  });

  it('setXlsxLastImport(record) populates lastImport and prepends to history', () => {
    useArxmlStore.getState().setXlsxLastImport({
      rows: SAMPLE_ROWS,
      source: 'wizard',
      importedAt: 1000,
    });
    const s = useArxmlStore.getState();
    expect(s.xlsxLastImport).toEqual({
      rows: SAMPLE_ROWS,
      source: 'wizard',
      importedAt: 1000,
    });
    expect(s.xlsxImportHistory).toHaveLength(1);
    expect(s.xlsxImportHistory[0]).toEqual(s.xlsxLastImport);
  });

  it('setXlsxLastImport(null) clears both', () => {
    useArxmlStore.getState().setXlsxLastImport({
      rows: SAMPLE_ROWS,
      source: 'wizard',
      importedAt: 1000,
    });
    useArxmlStore.getState().setXlsxLastImport(null);
    const s = useArxmlStore.getState();
    expect(s.xlsxLastImport).toBeNull();
    expect(s.xlsxImportHistory).toEqual([]);
  });

  it('history caps at 5 entries (older entries dropped)', () => {
    for (let i = 0; i < 7; i += 1) {
      useArxmlStore.getState().setXlsxLastImport({
        rows: SAMPLE_ROWS,
        source: 'manual',
        importedAt: 1000 + i,
      });
    }
    expect(useArxmlStore.getState().xlsxImportHistory).toHaveLength(5);
    // Most recent first.
    expect(useArxmlStore.getState().xlsxImportHistory[0]?.importedAt).toBe(1006);
  });

  it('history reflects insertion order (most recent first)', () => {
    useArxmlStore.getState().setXlsxLastImport({
      rows: SAMPLE_ROWS,
      source: 'wizard',
      importedAt: 1,
    });
    useArxmlStore.getState().setXlsxLastImport({
      rows: SAMPLE_ROWS,
      source: 'manual',
      importedAt: 2,
    });
    const h = useArxmlStore.getState().xlsxImportHistory;
    expect(h[0]?.importedAt).toBe(2);
    expect(h[1]?.importedAt).toBe(1);
  });
});
```

- [ ] **Step 1.2: Run test to verify RED**

Run: `pnpm vitest run src/renderer/store/__tests__/xlsxImportSlice.test.ts`
Expected: FAIL — `createXlsxImportSlice` not exported (module not found).

- [ ] **Step 1.3: Create the slice**

Create `src/renderer/store/slices/xlsxImportSlice.ts`:

```ts
// v1.33.0 MINOR T1 — xlsx-import 状态切片。
//
// 之前 launcher 的 promptAndOpen 传 xlsxRows: [] 占位符(从 v1.31.x
// 遗留到 v1.32.x)。本切片把最近一次 xlsx 导入结果落地到 store,
// 消除 placeholder debt (lesson store-as-source-of-truth-for-async-args)。
//
// 关联 IPC: xlsxEcucBatchImportHandler 成功完成后,main 端通过
// XLSX_IMPORT_COMPLETE push channel 广播 payload;renderer 端通过
// attachXlsxImportListener() 监听并写入本 slice。

import type { StateCreator } from 'zustand';
import type { EcucInstanceRow } from '../../../shared/types.js';
import type { ArxmlState } from '../useArxmlStore.js';

export interface XlsxImportRecord {
  readonly rows: readonly EcucInstanceRow[];
  readonly source: 'manual' | 'wizard';
  readonly importedAt: number;
}

export interface XlsxImportSlice {
  readonly xlsxLastImport: XlsxImportRecord | null;
  readonly xlsxImportHistory: readonly XlsxImportRecord[];
  setXlsxLastImport: (record: XlsxImportRecord | null) => void;
}

const MAX_HISTORY = 5;

export const createXlsxImportSlice: StateCreator<ArxmlState, [], [], XlsxImportSlice> = (set) => ({
  xlsxLastImport: null,
  xlsxImportHistory: [],
  setXlsxLastImport: (record) =>
    set((s) => ({
      xlsxLastImport: record,
      xlsxImportHistory:
        record === null ? [] : [record, ...s.xlsxImportHistory].slice(0, MAX_HISTORY),
    })),
});
```

- [ ] **Step 1.4: Add to useArxmlStore composition**

Modify `src/renderer/store/useArxmlStore.ts`:

1. Add import at top:

```ts
import { createXlsxImportSlice, type XlsxImportSlice } from './slices/xlsxImportSlice.js';
```

2. Update the `ArxmlState` interface to extend `XlsxImportSlice`:

```ts
export interface ArxmlState
  extends
    EcucSlice,
    BswmdSlice,
    ProjectSlice,
    I18nSlice,
    UiSlice,
    ImportSlice,
    MutationSlice,
    TourSlice,
    XlsxImportSlice {
  // Every field is declared on its owning slice interface above; ...
}
```

3. Add `...createXlsxImportSlice(...a)` to the composition.

4. Add `XlsxImportSlice` to the re-export at the bottom of the file (next to other `export type { ... }` lines).

- [ ] **Step 1.5: Run test to verify GREEN**

Run: `pnpm vitest run src/renderer/store/__tests__/xlsxImportSlice.test.ts`
Expected: 5 tests pass.

- [ ] **Step 1.6: Add IPC channel constant**

Modify `src/shared/ipc-contract.ts` — add to the `IPC_CHANNELS` object:

```ts
XLSX_IMPORT_COMPLETE: 'xlsx:import-complete',
```

- [ ] **Step 1.7: Expose push channel listeners in preload**

Modify `src/preload/index.ts` — add next to the existing IPC method exposures:

```ts
// v1.33.0 MINOR T1 — xlsx-import complete push channel.
// Main pushes after xlsxEcucBatchImportHandler succeeds; renderer
// listens via xlsxImportListener.ts to update the store slice.
onXlsxImportComplete: (handler: (payload: {
  readonly rows: readonly EcucInstanceRow[];
  readonly source: 'manual' | 'wizard';
}) => void) => {
  const listener = (_event: unknown, payload: { rows: readonly EcucInstanceRow[]; source: 'manual' | 'wizard' }) => {
    handler(payload);
  };
  ipcRenderer.on(IPC_CHANNELS.XLSX_IMPORT_COMPLETE, listener);
  return () => ipcRenderer.removeListener(IPC_CHANNELS.XLSX_IMPORT_COMPLETE, listener);
},
offXlsxImportComplete: (handler: (payload: {
  readonly rows: readonly EcucInstanceRow[];
  readonly source: 'manual' | 'wizard';
}) => void) => {
  // The handler reference is for symmetry with the public IPC API
  // shape; the actual removal is done by the unsubscribe function
  // returned from onXlsxImportComplete. This stub exists so the
  // preload API surface is complete.
  void handler;
},
```

- [ ] **Step 1.8: Push payload from xlsxEcucBatchImportHandler**

Modify `src/main/ipc/xlsxEcucBatchImportHandler.ts` — find the function (around line 215) and add the push at the end of the success path. The handler currently ends with returning a response envelope. Add a `webContents.send` call before the success return.

Read the existing handler first to find the success-path return site. The push should fire ONLY on success (not on error returns). Sketch:

```ts
// At the top of the file, add:
import { BrowserWindow } from 'electron';

// ... in the success path of the handler, just before the final return:
const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
if (win !== undefined && !win.isDestroyed()) {
  win.webContents.send(IPC_CHANNELS.XLSX_IMPORT_COMPLETE, {
    rows: <ecuc-instance-rows>,  // from the handler's success-path result
    source: 'wizard',
  });
}
```

**Note**: The actual ecuc-rows variable name and exact success-path location depend on the existing handler structure. Read `src/main/ipc/xlsxEcucBatchImportHandler.ts:215-end` first; integrate the push into the success path before the `return { ok: true, value: result }` line.

- [ ] **Step 1.9: Create the listener hook**

Create `src/renderer/store/xlsxImportListener.ts`:

```ts
// v1.33.0 MINOR T1 — xlsx-import push channel listener.
// 主进程 xlsxEcucBatchImportHandler 成功完成后通过 webContents.send
// 推送 payload;本 hook 监听并写入 store slice。
//
// 关联 lesson: store-as-source-of-truth-for-async-args

import { useArxmlStore } from './useArxmlStore.js';
import type { EcucInstanceRow } from '../../shared/types.js';

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
  return window.autosarApi.onXlsxImportComplete(handler);
}
```

- [ ] **Step 1.10: Verify full suite + commit**

Run: `pnpm vitest run`
Expected: 2992 + 7 SKIP / 0 fail (2987+7 baseline + 5 new).

```bash
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -am "feat(renderer+main): v1.33.0 MINOR T1 — XlsxImportSlice + IPC push

XlsxImportSlice stores the most-recent xlsx-import result + last 5 history.
xlsxEcucBatchImportHandler pushes payload via XLSX_IMPORT_COMPLETE on success.
Renderer attaches attachXlsxImportListener() at app boot to capture pushes.

Eliminates the v1.32.x xlsxRows: [] placeholder (lesson
store-as-source-of-truth-for-async-args).

+5 tests. Baseline 2987+7 -> 2992+7 SKIP / 0 fail."
```

---

### Task 2: bswmd:pick IPC + Override activation

**Files:**

- Create: `src/main/ipc/bswmdPickHandler.ts`
- Create: `src/main/ipc/__tests__/bswmdPickHandler.test.ts`
- Create: `src/renderer/components/dcmConfig/DcmConfigOverridePicker.tsx`
- Create: `src/renderer/components/dcmConfig/__tests__/DcmConfigOverridePicker.test.tsx`
- Modify: `src/shared/ipc-contract.ts` (add `BSWMD_PICK: 'bswmd:pick'`)
- Modify: `src/shared/types.ts` (add `BswmdPickResult` type)
- Modify: `src/main/ipc/register.ts` (register `bswmdPickHandler`)
- Modify: `src/preload/index.ts` (expose `bswmdPick()`)
- Modify: `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx` (Override activation)

**Interfaces:**

- Consumes: `BswmdPickResult` discriminated union (NEW); `findDcmBswmd` from v1.32.0 for sanity-check parse
- Produces: `bswmdPickDialog()` + `registerBswmdPickHandler()` exported from `bswmdPickHandler.ts`; `<DcmConfigOverridePicker/>` exported from `DcmConfigOverridePicker.tsx`

- [ ] **Step 2.1: Write the failing test — handler (RED)**

Create `src/main/ipc/__tests__/bswmdPickHandler.test.ts`:

```ts
// v1.33.0 MINOR T2 — bswmd:pick IPC handler.
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve as pathResolve } from 'node:path';
import { bswmdPickDialog } from '../bswmdPickHandler.js';

describe('bswmdPickDialog (v1.33.0 T2)', () => {
  let workDir: string;
  beforeEach(() => {
    workDir = mkdtempSync(pathResolve(tmpdir(), 'bswmd-pick-'));
  });
  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('returns canceled when dialog canceled', async () => {
    // Mock dialog.showOpenDialog to return canceled.
    // ... (use vi.mock for 'electron' module)
    const electron = await import('electron');
    vi.spyOn(electron.dialog, 'showOpenDialog').mockResolvedValue({
      canceled: true,
      filePaths: [],
    });
    const r = await bswmdPickDialog();
    expect(r).toEqual({ kind: 'canceled' });
  });

  it('returns opened with path + content on success', async () => {
    const bswmdPath = pathResolve(workDir, 'Bsw_Dcm_Bswmd.arxml');
    writeFileSync(bswmdPath, '<AR-PACKAGES></AR-PACKAGES>', 'utf-8');
    const electron = await import('electron');
    vi.spyOn(electron.dialog, 'showOpenDialog').mockResolvedValue({
      canceled: false,
      filePaths: [bswmdPath],
    });
    const r = await bswmdPickDialog();
    expect(r.kind).toBe('opened');
    if (r.kind === 'opened') {
      expect(r.path).toBe(bswmdPath);
      expect(r.content).toBe('<AR-PACKAGES></AR-PACKAGES>');
    }
  });

  it('returns canceled + shows message on read failure', async () => {
    const electron = await import('electron');
    vi.spyOn(electron.dialog, 'showOpenDialog').mockResolvedValue({
      canceled: false,
      filePaths: ['/nonexistent/path.arxml'],
    });
    const showMessageBox = vi
      .spyOn(electron.dialog, 'showMessageBox')
      .mockResolvedValue({ response: 0 });
    const r = await bswmdPickDialog();
    expect(r).toEqual({ kind: 'canceled' });
    expect(showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  it('uses title Override BSWMD + .arxml filter', async () => {
    const electron = await import('electron');
    const showOpenDialog = vi.spyOn(electron.dialog, 'showOpenDialog').mockResolvedValue({
      canceled: true,
      filePaths: [],
    });
    await bswmdPickDialog();
    expect(showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Override BSWMD',
        filters: expect.arrayContaining([
          expect.objectContaining({ name: 'BSWMD', extensions: ['arxml'] }),
        ]),
      }),
    );
  });
});
```

- [ ] **Step 2.2: Run test to verify RED**

Run: `pnpm vitest run src/main/ipc/__tests__/bswmdPickHandler.test.ts`
Expected: FAIL — `bswmdPickDialog` not exported.

- [ ] **Step 2.3: Add IPC type + channel**

Modify `src/shared/types.ts` — add to the IPC type exports:

```ts
export type BswmdPickResult =
  | { readonly kind: 'opened'; readonly path: string; readonly content: string }
  | { readonly kind: 'canceled' };
```

Modify `src/shared/ipc-contract.ts` — add to `IPC_CHANNELS`:

```ts
BSWMD_PICK: 'bswmd:pick',
```

- [ ] **Step 2.4: Implement the handler**

Create `src/main/ipc/bswmdPickHandler.ts`:

```ts
// v1.33.0 MINOR T2 — bswmd:pick IPC handler.
// Thin wrapper around dialog.showOpenDialog filtered to .arxml files.
// Reads the chosen file's content into memory and returns it alongside
// the path. Mirrors openDbcHandler / openOdxHandler line-for-line
// (DBC + ODX + BSWMD are all read-only file importers, so the dialog
// mechanics are identical). v1.33.0 added to enable the v1.32.1 PATCH
// Override UI Browse button.
//
// Design notes:
//   - Single-file picker (properties: ['openFile']); multi-BSWMD
//     import is not a use case.
//   - Returns a discriminated union (canceled / opened / read-failed-via-messagebox)
//     so the renderer can distinguish a user cancel from a real read
//     failure (per lesson: errors handled explicitly, never silently
//     swallowed).
//   - The read-failure dialog is shown via dialog.showMessageBox BEFORE
//     returning 'canceled' so the user sees both the OS dialog and the
//     renderer's error banner.

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
  ipcMain.handle(IPC_CHANNELS.BSWMD_PICK, async (): Promise<BswmdPickResult> => {
    return bswmdPickDialog();
  });
}
```

- [ ] **Step 2.5: Register + preload**

Modify `src/main/ipc/register.ts` — add import + register call (next to existing BSWMD-related handlers):

```ts
import { registerBswmdPickHandler } from './bswmdPickHandler.js';
// ... in the registration block:
registerBswmdPickHandler();
```

Modify `src/preload/index.ts` — add next to existing `readBswmd`:

```ts
bswmdPick: (): Promise<BswmdPickResult> =>
  ipcRenderer.invoke(IPC_CHANNELS.BSWMD_PICK),
```

- [ ] **Step 2.6: Run handler test to verify GREEN**

Run: `pnpm vitest run src/main/ipc/__tests__/bswmdPickHandler.test.ts`
Expected: 4 tests pass.

- [ ] **Step 2.7: Write the failing test — OverridePicker (RED)**

Create `src/renderer/components/dcmConfig/__tests__/DcmConfigOverridePicker.test.tsx`:

```tsx
// v1.33.0 MINOR T2 — DcmConfigOverridePicker.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DcmConfigOverridePicker } from '../DcmConfigOverridePicker.js';

describe('DcmConfigOverridePicker (v1.33.0 T2)', () => {
  beforeEach(() => {
    (window as unknown as { autosarApi: unknown }).autosarApi = {
      bswmdPick: vi.fn(),
    };
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Browse + Clear buttons', () => {
    render(
      <DcmConfigOverridePicker
        value="/dcm.arxml"
        onChange={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: /browse/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  it('Browse click invokes bswmdPick IPC and calls onChange on opened', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    (window.autosarApi.bswmdPick as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'opened',
      path: '/override.arxml',
      content:
        '<AR-PACKAGES><AR-PACKAGE><ELEMENTS><ECUC-MODULE-DEF><SHORT-NAME>Dcm</SHORT-NAME></ECUC-MODULE-DEF></ELEMENTS></AR-PACKAGE></AR-PACKAGES>',
    });
    render(<DcmConfigOverridePicker value="" onChange={onChange} onCancel={() => undefined} />);
    await user.click(screen.getByRole('button', { name: /browse/i }));
    expect(window.autosarApi.bswmdPick).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('/override.arxml');
  });

  it('Browse click calls onCancel when user cancels', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    (window.autosarApi.bswmdPick as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'canceled',
    });
    render(<DcmConfigOverridePicker value="" onChange={() => undefined} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: /browse/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Browse click calls onCancel + warns when picked file is not a Dcm BSWMD', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    (window.autosarApi.bswmdPick as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'opened',
      path: '/not-dcm.arxml',
      content:
        '<AR-PACKAGES><AR-PACKAGE><ELEMENTS><ECUC-MODULE-DEF><SHORT-NAME>CanIf</SHORT-NAME></ECUC-MODULE-DEF></ELEMENTS></AR-PACKAGE></AR-PACKAGES>',
    });
    render(<DcmConfigOverridePicker value="" onChange={() => undefined} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: /browse/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not a valid Dcm BSWMD'));
  });

  it('Clear click calls onChange with empty string', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DcmConfigOverridePicker value="/old.arxml" onChange={onChange} onCancel={() => undefined} />,
    );
    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
```

- [ ] **Step 2.8: Run picker test to verify RED**

Run: `pnpm vitest run src/renderer/components/dcmConfig/__tests__/DcmConfigOverridePicker.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 2.9: Implement the picker component**

Create `src/renderer/components/dcmConfig/DcmConfigOverridePicker.tsx`:

```tsx
// v1.33.0 MINOR T2 — Override UI 的 Browse + Clear 按钮组。
//
// 之前 v1.32.1 PATCH 的 Override <details> 是半成品(无 Browse 按钮,
// 输入框 disabled)。本组件激活 Override UX,允许用户选 BSWMD 文件
// 来覆盖 launcher 的 autofill 默认值 (lesson
// disable-input-without-browse-button-is-debt)。
//
// 关联 lesson: presentational-dialog-parity-port-pattern — 本组件
// 自身不调 IPC,只把 IPC 调用封装到一个按钮 handler,让父 dialog
// (DcmConfigSuccessDialog) 不必直接 import window.autosarApi。

import { findDcmBswmd } from './bswmdHasDcm.js';
import { DCM_MODULE_SHORT_NAME } from '../../../core/bridge/dcmConstants.js';
import { arxmlModuleShortNames } from '../../arxml/arxmlModuleShortNames.js';

interface DcmConfigOverridePickerProps {
  readonly value: string;
  readonly onChange: (path: string) => void;
  readonly onCancel: () => void;
}

export function DcmConfigOverridePicker(props: DcmConfigOverridePickerProps): JSX.Element {
  const handleBrowse = async (): Promise<void> => {
    const result = await window.autosarApi.bswmdPick();
    if (result.kind === 'canceled') {
      props.onCancel();
      return;
    }
    // Sanity check: verify the picked file actually contains a Dcm BSWMD.
    const modules = arxmlModuleShortNames(result.content);
    if (!modules.includes(DCM_MODULE_SHORT_NAME)) {
      console.warn(
        `DcmConfigOverridePicker: picked file is not a valid Dcm BSWMD (modules: ${modules.join(', ') || 'none'})`,
      );
      props.onCancel();
      return;
    }
    props.onChange(result.path);
  };

  const handleClear = (): void => {
    props.onChange('');
  };

  return (
    <div className="dcm-config-override-picker">
      <button type="button" onClick={handleBrowse} data-testid="dcm-config-override-browse">
        Browse...
      </button>
      <button
        type="button"
        onClick={handleClear}
        disabled={props.value === ''}
        data-testid="dcm-config-override-clear"
      >
        Clear
      </button>
    </div>
  );
}
```

- [ ] **Step 2.10: Run picker test to verify GREEN**

Run: `pnpm vitest run src/renderer/components/dcmConfig/__tests__/DcmConfigOverridePicker.test.tsx`
Expected: 5 tests pass.

- [ ] **Step 2.11: Activate in DcmConfigSuccessDialog**

Modify `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx` — find the existing `<details>` Override subcomponent (added in v1.32.1 PATCH `5234e88`). Update:

1. Change `disabled={true}` to `disabled={false}` on the input.
2. Add `<DcmConfigOverridePicker value={...} onChange={handleOverrideChange} onCancel={handleOverrideClear} />` immediately below the input.
3. Add the two handlers at the top of the component:

```ts
const handleOverrideChange = (path: string): void => {
  setState((s) => ({ ...s, bswmdPathOverride: path }));
};
const handleOverrideClear = (): void => {
  setState((s) => ({ ...s, bswmdPathOverride: '' }));
};
```

4. Add import at the top:

```ts
import { DcmConfigOverridePicker } from './DcmConfigOverridePicker.js';
```

- [ ] **Step 2.12: Verify + commit**

Run: `pnpm vitest run`
Expected: 3001 + 7 SKIP / 0 fail (2992 + 9 new = 3001).

```bash
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -am "feat(renderer+main): v1.33.0 MINOR T2 — bswmd:pick IPC + Override activation

bswmdPickHandler + DcmConfigOverridePicker activate the v1.32.1 PATCH
Override UI. Browse button invokes bswmd:pick IPC, sanity-checks the
picked file is a valid Dcm BSWMD via arxmlModuleShortNames, then
propagates the path to the parent dialog via onChange.

+9 tests (4 handler + 5 picker). Baseline 2992+7 -> 3001+7 SKIP / 0 fail.

Lesson: disable-input-without-browse-button-is-debt — v1.32.1 shipped
the disabled input; v1.33.0 completes the activation path."
```

---

### Task 3: odx:open-with-default IPC + DcmConfigPicker defaultPath

**Files:**

- Create: `src/main/ipc/openOdxWithDefaultHandler.ts`
- Create: `src/main/ipc/__tests__/openOdxWithDefaultHandler.test.ts`
- Modify: `src/shared/types.ts` (add `OpenOdxWithDefaultRequest` + `OpenOdxWithDefaultResult` types)
- Modify: `src/shared/ipc-contract.ts` (add `ODX_OPEN_WITH_DEFAULT`)
- Modify: `src/main/ipc/register.ts` (register `openOdxWithDefaultHandler`)
- Modify: `src/preload/index.ts` (expose `openOdxWithDefault()`)
- Modify: `src/renderer/components/dcmConfig/DcmConfigPicker.tsx` (use new IPC, accept `defaultPath` prop)
- Modify: `src/renderer/components/dcmConfig/__tests__/DcmConfigPicker.test.tsx` (update 4 existing tests + add 1 defaultPath test)

**Interfaces:**

- Consumes: `OpenOdxWithDefaultRequest` (NEW); existing `openOdx` IPC contract (parallel shape)
- Produces: `openOdxWithDefaultDialog()` + `registerOpenOdxWithDefaultHandler()` exported from `openOdxWithDefaultHandler.ts`; `<DcmConfigPicker defaultPath?={string}/>` (extends existing props)

- [ ] **Step 3.1: Write the failing test — handler (RED)**

Create `src/main/ipc/__tests__/openOdxWithDefaultHandler.test.ts`:

```ts
// v1.33.0 MINOR T3 — odx:open-with-default IPC handler.
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve as pathResolve } from 'node:path';
import { openOdxWithDefaultDialog } from '../openOdxWithDefaultHandler.js';

describe('openOdxWithDefaultDialog (v1.33.0 T3)', () => {
  let workDir: string;
  beforeEach(() => {
    workDir = mkdtempSync(pathResolve(tmpdir(), 'odx-with-default-'));
  });
  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('returns canceled when dialog canceled', async () => {
    const electron = await import('electron');
    vi.spyOn(electron.dialog, 'showOpenDialog').mockResolvedValue({
      canceled: true,
      filePaths: [],
    });
    const r = await openOdxWithDefaultDialog({});
    expect(r).toEqual({ kind: 'canceled' });
  });

  it('returns opened with path + content on success', async () => {
    const odxPath = pathResolve(workDir, 'input.odx');
    writeFileSync(odxPath, '<ODX></ODX>', 'utf-8');
    const electron = await import('electron');
    vi.spyOn(electron.dialog, 'showOpenDialog').mockResolvedValue({
      canceled: false,
      filePaths: [odxPath],
    });
    const r = await openOdxWithDefaultDialog({ defaultPath: workDir });
    expect(r.kind).toBe('opened');
    if (r.kind === 'opened') {
      expect(r.path).toBe(odxPath);
      expect(r.content).toBe('<ODX></ODX>');
    }
  });

  it('passes defaultPath to showOpenDialog', async () => {
    const electron = await import('electron');
    const showOpenDialog = vi.spyOn(electron.dialog, 'showOpenDialog').mockResolvedValue({
      canceled: true,
      filePaths: [],
    });
    await openOdxWithDefaultDialog({ defaultPath: '/some/default/path' });
    expect(showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: '/some/default/path' }),
    );
  });

  it('returns read-failed + shows message on read error', async () => {
    const electron = await import('electron');
    vi.spyOn(electron.dialog, 'showOpenDialog').mockResolvedValue({
      canceled: false,
      filePaths: ['/nonexistent.odx'],
    });
    const showMessageBox = vi
      .spyOn(electron.dialog, 'showMessageBox')
      .mockResolvedValue({ response: 0 });
    const r = await openOdxWithDefaultDialog({});
    expect(r.kind).toBe('read-failed');
    if (r.kind === 'read-failed') {
      expect(r.message).toContain('ENOENT');
    }
    expect(showMessageBox).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3.2: Run test to verify RED**

Run: `pnpm vitest run src/main/ipc/__tests__/openOdxWithDefaultHandler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3.3: Add types + channel**

Modify `src/shared/types.ts` — add:

```ts
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

Modify `src/shared/ipc-contract.ts` — add:

```ts
ODX_OPEN_WITH_DEFAULT: 'odx:open-with-default',
```

- [ ] **Step 3.4: Implement the handler**

Create `src/main/ipc/openOdxWithDefaultHandler.ts`:

```ts
// v1.33.0 MINOR T3 — odx:open-with-default IPC handler.
//
// 之前 DcmConfigPicker 调 openOdx()(无参,用户每次从 user-home 起始
// 选文件)。v1.33.0 新增本通道,允许 renderer 传 defaultPath,让 OS
// dialog 打开时定位到项目根目录(lesson
// additive-ipc-channels-over-extending-args — 不扩 openOdx() args,
// 走新通道避免 breaking change)。
//
// Shape: {defaultPath?, filters?} → {kind: 'opened'|'canceled'|'read-failed'}.
// filters 透传给 dialog.showOpenDialog;默认 .odx only (matches
// v1.22.0 openOdxHandler 的 default behavior)。

import { promises as fs } from 'node:fs';
import { dialog, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-contract.js';
import type { OpenOdxWithDefaultRequest, OpenOdxWithDefaultResult } from '../../shared/types.js';

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
    async (_event, req: OpenOdxWithDefaultRequest): Promise<OpenOdxWithDefaultResult> =>
      openOdxWithDefaultDialog(req),
  );
}
```

- [ ] **Step 3.5: Register + preload**

Modify `src/main/ipc/register.ts`:

```ts
import { registerOpenOdxWithDefaultHandler } from './openOdxWithDefaultHandler.js';
// ... in registration block:
registerOpenOdxWithDefaultHandler();
```

Modify `src/preload/index.ts` — add next to `openOdx`:

```ts
openOdxWithDefault: (req: OpenOdxWithDefaultRequest): Promise<OpenOdxWithDefaultResult> =>
  ipcRenderer.invoke(IPC_CHANNELS.ODX_OPEN_WITH_DEFAULT, req),
```

- [ ] **Step 3.6: Run handler test to verify GREEN**

Run: `pnpm vitest run src/main/ipc/__tests__/openOdxWithDefaultHandler.test.ts`
Expected: 4 tests pass.

- [ ] **Step 3.7: Update DcmConfigPicker**

Modify `src/renderer/components/dcmConfig/DcmConfigPicker.tsx`:

1. Add `defaultPath?: string` to the props interface.
2. Change the IPC call from `window.autosarApi.openOdx()` to `window.autosarApi.openOdxWithDefault({ defaultPath: propsRef.current.defaultPath })`.
3. The result handling is identical (still `kind: 'opened' | 'canceled' | 'read-failed'`).

- [ ] **Step 3.8: Update DcmConfigPicker test file**

Modify `src/renderer/components/dcmConfig/__tests__/DcmConfigPicker.test.tsx`:

1. Replace all 4 existing tests' mocks: `openOdx: vi.fn()` → `openOdxWithDefault: vi.fn()`.
2. Update the IPC call assertion: `expect(window.autosarApi.openOdx).toHaveBeenCalledTimes(1)` → `expect(window.autosarApi.openOdxWithDefault).toHaveBeenCalledTimes(1)`.
3. Update mock returns: `{ kind: 'opened', path, content }` (unchanged).
4. **Add 1 new test**: `it('passes defaultPath prop to the new IPC channel', ...)` — render with `defaultPath="/some/path"`, mock openOdxWithDefault to return canceled, assert the mock was called with `{ defaultPath: '/some/path' }`.

- [ ] **Step 3.9: Verify + commit**

Run: `pnpm vitest run src/renderer/components/dcmConfig/__tests__/DcmConfigPicker.test.tsx`
Expected: 5 tests pass (4 existing updated + 1 new).

Run: `pnpm vitest run`
Expected: 3006 + 7 SKIP / 0 fail (3001 + 5 new = 3006).

```bash
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -am "feat(renderer+main): v1.33.0 MINOR T3 — odx:open-with-default IPC

openOdxWithDefaultHandler accepts {defaultPath?, filters?} and returns
the same shape as openOdx. DcmConfigPicker migrated to the new IPC and
gains a defaultPath prop so the OS dialog opens at project root
(instead of user-home).

+5 tests (4 handler + 1 picker defaultPath). Baseline 3001+7 -> 3006+7.

Lesson: additive-ipc-channels-over-extending-args — v1.32.0 IPC
contract preserved; new channel ships additively."
```

---

### Task 4: Drop legacy regex fallback (T4 — single commit, mechanical deletion)

**Files:**

- Modify: `src/renderer/hooks/useDcmConfigLauncher.ts` (delete `classifyErrorByRegex` + simplify `classifyError`)
- Modify: `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` (delete 9 regex + 3 backward-compat tests + add 1 defensive fallback test)

**Interfaces:**

- Consumes: nothing new
- Produces: `classifyError(error: DcmConfigError): DcmConfigErrorClass` (kind-first only, defensive 'UNKNOWN' fallback)

- [ ] **Step 4.1: Delete `classifyErrorByRegex` function**

Modify `src/renderer/hooks/useDcmConfigLauncher.ts` — find `classifyErrorByRegex` (the function with 6 regex patterns) and:

1. Delete the entire function definition.
2. Add a short comment in its place documenting the removal:

```ts
// v1.33.0 MINOR T4 — classifyErrorByRegex removed (1-release compat
// window per v1.32.0 spec §5 has expired). Renderer classifyError
// reads kind discriminator exclusively. Defensive 'UNKNOWN' fallback
// for legacy typed-cast payloads (should never occur in v1.32.0+
// production but kept for type-safety).
// Lesson: 1-release-compat-window-explicit-removal
```

- [ ] **Step 4.2: Simplify `classifyError`**

Modify `src/renderer/hooks/useDcmConfigLauncher.ts` — find the existing `classifyError` function. Remove the `classifyErrorByRegex(error.message)` fallback call; keep the `'kind' in error` check + `KIND_TO_CLASS[error.kind]` mapping + a final `return 'UNKNOWN'` for defensive purposes:

```ts
export function classifyError(error: DcmConfigError): DcmConfigErrorClass {
  if (typeof error === 'object' && error !== null && 'kind' in error) {
    return KIND_TO_CLASS[error.kind];
  }
  return 'UNKNOWN';
}
```

- [ ] **Step 4.3: Delete 12 obsolete tests + add 1 defensive test**

Modify `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts`:

1. Delete the entire `describe('classifyErrorByRegex (v1.32.0 T2) — legacy fallback')` block (9 cases).
2. Delete the entire `describe('classifyError backward-compat (v1.32.0 T2) — missing kind')` block (3 cases).
3. Keep the `describe('classifyError (v1.32.0 T2) — kind-first')` block (9 cases).
4. Add a new test in the kind-first describe block (or new block):

```ts
describe('classifyError defensive fallback (v1.33.0 T4)', () => {
  it('returns UNKNOWN when kind is absent (defensive — should never happen in v1.32.0+ payloads)', () => {
    const legacy = { message: '...' } as unknown as DcmConfigError;
    expect(classifyError(legacy)).toBe('UNKNOWN');
  });
});
```

- [ ] **Step 4.4: Verify + commit**

Run: `pnpm vitest run`
Expected: 2995 + 7 SKIP / 0 fail (3006 - 11 regex/backward-compat + 1 defensive = 2996, off by 1 — verify the actual count after running).

(Note: the test count drops because we removed 12 cases and added 1. Net -11.)

```bash
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -am "refactor(renderer): v1.33.0 MINOR T4 — drop legacy regex fallback

classifyErrorByRegex + 12 test cases removed. 1-release compat window
per v1.32.0 spec §5 has expired. classifyError now reads kind discriminator
exclusively; defensive UNKNOWN fallback for legacy typed-cast payloads.

-11 tests (12 removed, 1 added). Baseline 3006+7 -> 2995+7.

Lesson: 1-release-compat-window-explicit-removal — set a tracking
item at v.N ship time when deferring cleanup to v.N+1."
```

---

### Task 5: Launcher xlsxRows + handleOverridePick wiring

**Files:**

- Modify: `src/renderer/hooks/useDcmConfigLauncher.ts` (replace `xlsxRows: []` placeholders; add `bswmdPathOverride` state + `handleOverridePick` + `handleOverrideClear` actions)
- Modify: `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` (add 3 tests for the new behaviors)

**Interfaces:**

- Consumes: `useArxmlStore.getState().xlsxLastImport` (from T1); `setXlsxLastImport` already wired
- Produces: `bswmdPathOverride?: string` state field; `handleOverridePick(path)` + `handleOverrideClear()` exposed on the hook return

- [ ] **Step 5.1: Write the failing test (RED)**

Append to `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts`:

```ts
// v1.33.0 MINOR T5 — xlsxRows sourced from store + override pick/clear wiring.
import { act } from '@testing-library/react';
import { useArxmlStore } from '../../store/useArxmlStore.js';
import type { XlsxImportRecord } from '../../store/slices/xlsxImportSlice.js';

const XLSX_RECORD: XlsxImportRecord = {
  rows: [{ sheet: 'DcmReadDataById' as const, shortName: 'X', params: {} } as never],
  source: 'wizard',
  importedAt: 1000,
};

describe('useDcmConfigLauncher (v1.33.0 T5) — xlsxRows + override wiring', () => {
  beforeEach(() => {
    useArxmlStore.setState({ xlsxLastImport: null });
  });

  it('sends xlsxRows from xlsxLastImport.rows (not []) when picker resolves', async () => {
    useArxmlStore.getState().setXlsxLastImport(XLSX_RECORD);
    // setup bswmdHasDcm.hasDcm = true + activeDocumentPath undefined → picker path
    // ... (use existing test fixture pattern from v1.32.0 T5 tests)
    // assert invokeMock was called with xlsxRows: XLSX_RECORD.rows
  });

  it('handleOverridePick sets bswmdPathOverride state', () => {
    // renderHook + result.current.handleOverridePick('/override.arxml')
    // assert state.bswmdPathOverride === '/override.arxml'
  });

  it('handleOverrideClear clears bswmdPathOverride state', () => {
    // renderHook + setState({bswmdPathOverride: '/x.arxml'}) + result.current.handleOverrideClear()
    // assert state.bswmdPathOverride === undefined
  });
});
```

(Read existing v1.32.0 T5 tests in the file to mirror the test fixture pattern; the skeleton above is the contract — 3 tests total.)

- [ ] **Step 5.2: Run test to verify RED**

Run: `pnpm vitest run src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts -t 'xlsxRows + override'`
Expected: FAIL — `handleOverridePick` not a function; `bswmdPathOverride` not in state.

- [ ] **Step 5.3: Replace xlsxRows: [] placeholders + add state**

Modify `src/renderer/hooks/useDcmConfigLauncher.ts`:

1. Add `bswmdPathOverride?: string` to the state shape (alongside the existing fields).
2. In `promptAndOpen`:
   - Replace `xlsxRows: []` with `const xlsxRows = useArxmlStore.getState().xlsxLastImport?.rows ?? [];`
   - Replace `bswmdPath: bswmdHasDcm.dcmBswmdPath` with `bswmdPath: bswmdPathOverride ?? bswmdHasDcm.dcmBswmdPath`.
3. In `handlePickerResolve`:
   - Same two replacements as `promptAndOpen`.
4. Add `handleOverridePick(path: string)`:
   ```ts
   const handleOverridePick = useCallback((path: string) => {
     setState((s) => ({ ...s, bswmdPathOverride: path }));
   }, []);
   ```
5. Add `handleOverrideClear()`:
   ```ts
   const handleOverrideClear = useCallback(() => {
     setState((s) => ({ ...s, bswmdPathOverride: undefined }));
   }, []);
   ```
6. Add both to the hook return value.

- [ ] **Step 5.4: Run test to verify GREEN**

Run: `pnpm vitest run src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts -t 'xlsxRows + override'`
Expected: 3 tests pass.

- [ ] **Step 5.5: Verify + commit**

Run: `pnpm vitest run`
Expected: 2998 + 7 SKIP / 0 fail (2995 + 3 new = 2998).

```bash
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -am "feat(renderer): v1.33.0 MINOR T5 — launcher xlsxRows + override wiring

promptAndOpen + handlePickerResolve now source xlsxRows from
xlsxLastImport store slice (was [] placeholder since v1.31.x).
bswmdPathOverride state slice + handleOverridePick + handleOverrideClear
exposed on the hook. bswmdPath in open() args resolves to
bswmdPathOverride ?? bswmdHasDcm.dcmBswmdPath.

+3 tests. Baseline 2995+7 -> 2998+7 SKIP / 0 fail.

Lesson: store-as-source-of-truth-for-async-args — IPC args consumed
across renders must live in a Zustand slice, not a hook local."
```

---

### Task 6: bswmdPath: optional → required

**Files:**

- Modify: `src/shared/types.ts` (change `bswmdPath?: string` to `bswmdPath: string` in `DcmConfigHandlerResult`)
- Modify: `src/main/ipc/dcmConfigHandler.ts` (always populate `bswmdPath`; remove `??` fallback)
- Modify: `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx` (remove `result.bswmdPath &&` guard since always set)
- Modify: `src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx` (delete 3 absence tests; add 1 always-populated assertion in positive case)
- Modify: `src/main/ipc/__tests__/dcmConfigHandler.test.ts` (assert `result.value.bswmdPath` set in success-path tests)

**Interfaces:**

- Consumes: nothing
- Produces: `DcmConfigHandlerResult.bswmdPath: string` (required)

- [ ] **Step 6.1: Promote `bswmdPath` to required**

Modify `src/shared/types.ts` — in the `DcmConfigHandlerResult` interface, change:

```ts
// Before
readonly bswmdPath?: string;  // v1.32.0 — optional

// After
readonly bswmdPath: string;  // v1.33.0 — required. Always populated by handler.
```

- [ ] **Step 6.2: Update handler**

Modify `src/main/ipc/dcmConfigHandler.ts` — find the success-path return (around line 282-289 in v1.32.0 PATCH `27e39e9`). Change:

```ts
// Before
const result: DcmConfigHandlerResult = {
  // ... existing fields ...
  bswmdPath: args.bswmdPath ?? dcmBswmdPath, // v1.32.0 — fallback
};

// After
const result: DcmConfigHandlerResult = {
  // ... existing fields ...
  bswmdPath: dcmBswmdPath, // v1.33.0 — always populated by handler.
};
```

(Read the existing handler success-path first to confirm the exact code shape; the variable name `dcmBswmdPath` comes from the local variable holding the resolved BSWMD path.)

- [ ] **Step 6.3: Update SuccessDialog**

Modify `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx` — find the autofill line:

```tsx
// Before
{
  result.bswmdPath && (
    <p className="dcm-config-success-bswmd-autofill">
      {t(locale, 'dcmConfig.bswmdPath.autofill')}: <code>{result.bswmdPath}</code>
    </p>
  );
}

// After
<p className="dcm-config-success-bswmd-autofill">
  {t(locale, 'dcmConfig.bswmdPath.autofill')}: <code>{result.bswmdPath}</code>
</p>;
```

- [ ] **Step 6.4: Delete 3 absence tests + add 1 always-populated assertion**

Modify `src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx`:

1. Find the 3 absence tests (added in v1.32.0 T7: positive en, positive zh-CN, absence when no bswmdPath) and:
   - Keep the 2 positive tests (assert autofill line IS rendered).
   - Add an explicit assertion that `result.bswmdPath` is set (the absence test is now obsolete).
   - DELETE the 3rd absence test (it asserts no autofill when bswmdPath is undefined; can no longer happen).
2. Net: -2 tests.

Modify `src/main/ipc/__tests__/dcmConfigHandler.test.ts` — in the existing success-path happy-path test (around line 142-145 of v1.27.0 baseline), add:

```ts
expect(result.value.bswmdPath).toBeDefined();
```

- [ ] **Step 6.5: Verify + commit**

Run: `pnpm vitest run`
Expected: 2996 + 7 SKIP / 0 fail (2998 - 2 net = 2996).

```bash
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -am "refactor: v1.33.0 MINOR T6 — bswmdPath optional → required

DcmConfigHandlerResult.bswmdPath: string (was bswmdPath?: string).
Handler always populates from resolved dcmBswmdPath. SuccessDialog
unconditionally renders the autofill line. 3 absence tests removed.

-2 tests (3 removed, 1 added). Baseline 2998+7 -> 2996+7 SKIP / 0 fail."
```

---

### Task 7: Wiring + SuccessDialog row count surface

**Files:**

- Modify: `src/renderer/App.tsx` (compute `defaultPath` for DcmConfigPicker; pass to picker)
- Modify: `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx` (add `appliedStepCount` autofill line)
- Modify: `src/shared/i18n/odx.ts` (add `dcmConfig.appliedCount.summary` key — en)
- Modify: `src/shared/i18n.zh-CN/odx.ts` (add `dcmConfig.appliedCount.summary` key — zh-CN)
- Modify: `src/shared/i18n.en/odx.ts` (add `dcmConfig.appliedCount.summary` key — en mirror)
- Modify: `src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx` (add 1 row count test)

**Interfaces:**

- Consumes: `DcmConfigPicker`'s new `defaultPath?` prop (from T3); `DcmConfigHandlerResult.appliedStepCount` (existing field)
- Produces: appliedCount i18n key (en + zh-CN)

- [ ] **Step 7.1: Write the failing test (RED)**

Append to `src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx`:

```tsx
// v1.33.0 MINOR T7 — SuccessDialog row count surface.
it('renders applied step count when result.appliedStepCount > 0 (en)', () => {
  // Render with appliedStepCount: 5
  // assert text "Applied 5 xlsx rows" is in the document
});

it('renders applied step count when result.appliedStepCount > 0 (zh-CN)', () => {
  // Render with locale='zh-CN' + appliedStepCount: 3
  // assert text "已应用 3 行 xlsx 数据" is in the document
});
```

- [ ] **Step 7.2: Run test to verify RED**

Run: `pnpm vitest run src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx -t 'applied step count'`
Expected: FAIL — autofill line not rendered (key not in i18n).

- [ ] **Step 7.3: Add the i18n key to all 3 bundles**

Modify `src/shared/i18n/odx.ts` — add:

```ts
'dcmConfig.appliedCount.summary': 'Applied {count} xlsx rows',
```

Modify `src/shared/i18n.zh-CN/odx.ts` — add:

```ts
'dcmConfig.appliedCount.summary': '已应用 {count} 行 xlsx 数据',
```

Modify `src/shared/i18n.en/odx.ts` — add:

```ts
'dcmConfig.appliedCount.summary': 'Applied {count} xlsx rows',
```

- [ ] **Step 7.4: Update SuccessDialog to render row count**

Modify `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx` — immediately after the existing autofill line (added in Step 6.3), add:

```tsx
{
  result.appliedStepCount > 0 && (
    <p className="dcm-config-success-applied-count">
      {t(locale, 'dcmConfig.appliedCount.summary', { count: result.appliedStepCount })}
    </p>
  );
}
```

- [ ] **Step 7.5: Compute defaultPath in App.tsx**

Modify `src/renderer/App.tsx` — find the existing `<DcmConfigPicker/>` mount (added in v1.32.0 T8 commit `9efb5d6`). Update:

```tsx
{
  launcherState.mode === 'picking-odx' && (
    <DcmConfigPicker
      locale={locale}
      defaultPath={
        project?.rootDir ?? bswmdHasDcm.dcmBswmdPath?.split(/[/\\]/).slice(0, -1).join('/')
      }
      onResolve={launcher.handlePickerResolve}
      onCancel={launcher.handlePickerCancel}
    />
  );
}
```

- [ ] **Step 7.6: Run test to verify GREEN**

Run: `pnpm vitest run src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx`
Expected: All tests pass (existing + 2 new).

- [ ] **Step 7.7: Verify + commit**

Run: `pnpm vitest run`
Expected: 2998 + 7 SKIP / 0 fail (2996 + 2 new = 2998).

```bash
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -am "feat(renderer): v1.33.0 MINOR T7 — appliedCount + defaultPath wiring

SuccessDialog now renders 'Applied N xlsx rows' line below bswmdPath
autofill when result.appliedStepCount > 0. App.tsx computes defaultPath
for DcmConfigPicker (project root → BSWMD parent dir → undefined).

+2 tests. Baseline 2996+7 -> 2998+7 SKIP / 0 fail."
```

---

### Task 8: Ship (final wiring + verify + release)

**Files:**

- Create: `docs/release-notes/v1.33.0/README.md` (NEW release notes)
- No production code changes

- [ ] **Step 8.1: Create release notes**

Create `docs/release-notes/v1.33.0/README.md`:

```markdown
# v1.33.0 MINOR — Dcm Config Cleanup + Override Activation

**Ship**: 2026-07-07 (commit `<TBD>` + tag v1.33.0 + GH release)

**Baseline**: v1.32.1 PATCH `a5c665c` (2987 + 7 SKIP / 0 fail)
**Target**: 2998 + 7 SKIP / 0 fail (+11 net delta)

## What's in this MINOR

### xlsxLastImport architectural wiring (T1)

- New `XlsxImportSlice` stores the most-recent xlsx-import result + last 5 history entries.
- `xlsxEcucBatchImportHandler` pushes payload via `XLSX_IMPORT_COMPLETE` IPC channel on success.
- `attachXlsxImportListener()` listener hook bridges the push to the store.
- Eliminates the `xlsxRows: []` placeholder that persisted from v1.31.x through v1.32.x.

### Override UI activation (T2)

- New `bswmd:pick` IPC handler — opens a `.arxml` file dialog and returns the chosen BSWMD content.
- New `<DcmConfigOverridePicker/>` component — Browse + Clear buttons; Browse invokes `bswmd:pick` + sanity-checks the picked file is a valid Dcm BSWMD.
- `DcmConfigSuccessDialog` Override `<input>` is now `disabled={false}` (was `disabled={true}` in v1.32.1 PATCH).
- The Override `<details>` is now fully functional — Browse picks a file, Clear resets to autofill.

### odx:open-with-default IPC (T3)

- New `ODX_OPEN_WITH_DEFAULT` channel accepts `{defaultPath?, filters?}`.
- `DcmConfigPicker` migrated to the new IPC; gains a `defaultPath` prop.
- `App.tsx` computes the picker defaultPath from project root or BSWMD parent directory.
- The OS dialog now opens at a sensible folder instead of user-home.

### Legacy regex fallback dropped (T4)

- `classifyErrorByRegex` and 12 related test cases deleted.
- 1-release compat window per v1.32.0 spec §5 has expired.
- `classifyError` reads `kind` discriminator exclusively; defensive `'UNKNOWN'` fallback for legacy typed-cast payloads.

### bswmdPath: optional → required (T6)

- `DcmConfigHandlerResult.bswmdPath: string` (was `bswmdPath?: string`).
- Handler always populates the field from the resolved path.
- SuccessDialog unconditionally renders the autofill line.

### SuccessDialog row count surface (T7)

- New `dcmConfig.appliedCount.summary` i18n key (en + zh-CN).
- Renders "Applied N xlsx rows" / "已应用 N 行 xlsx 数据" below the bswmdPath autofill line.
- Surfaces `result.appliedStepCount` to the user.

## Lessons (NEW from this MINOR)

1. `store-as-source-of-truth-for-async-args` — IPC consumer args belong in a Zustand slice, not a hook local.
2. `disable-input-without-browse-button-is-debt` — disabled `<input>` with no Browse is half-finished UX.
3. `additive-ipc-channels-over-extending-args` — additive new channels beat extending existing args for semver safety.
4. `1-release-compat-window-explicit-removal` — track deferred cleanups at ship time.

## Known follow-ups (deferred to v1.34.0+)

- `parseArxmlLite` canonicalization (YAGNI until 2nd consumer emerges).
- Override UI persistence across sessions.
- Multi-BSWMD project override.
- `xlsxImportHistory` UI surfacing.
- Override keyboard shortcut.
```

- [ ] **Step 8.2: Full pnpm verify**

Run: `pnpm verify`
Expected: format + lint + typecheck + test (2998+7 SKIP / 0 fail) + coverage + build + import-regression — all GREEN.

If anything fails, fix it (do not bypass). Common fix patterns:

- Format: `pnpm prettier --write <offending-file>`
- Lint: `pnpm eslint --fix <offending-file>`

Commit any fixes with `chore: v1.33.0 MINOR — pnpm verify fixes` style.

- [ ] **Step 8.3: Whole-branch review (Sonnet inline)**

Before tagging, run:

```bash
git log --oneline a5c665c..HEAD
git diff --stat a5c665c..HEAD
```

Review the 8 commits. Per the global constraints table:

- 0 BLOCK / 0 CRITICAL expected.
- HIGH findings → fix in same MINOR (rare; TDD should have caught them).
- MEDIUM findings → v1.33.1 PATCH.
- LOW / SPEC → defer.

If any HIGH findings, fix them inline and amend the relevant commits (per `release-notes-self-sha-stale-is-ship-acceptable-per-precedent` lesson, allow at most 2 amend cycles).

- [ ] **Step 8.4: Ship (tag + push + release)**

```bash
git add -A
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit --allow-empty -m "chore: v1.33.0 MINOR T8 — ship"
git push origin main
git push origin v1.33.0
SHIP_COMMIT=$(git rev-parse HEAD)
gh release create v1.33.0 --target $SHIP_COMMIT --title 'v1.33.0 MINOR — Dcm Config Cleanup + Override Activation' --notes-file docs/release-notes/v1.33.0/README.md
```

(Per `follow-tags-unreliable-separate-push-tag` lesson: TWO separate pushes — `main` then `v1.33.0` — never `--follow-tags`. Per `gh-release-create-40-char-target-first-try-no-422` lesson: 40-char SHA for `--target`.)

- [ ] **Step 8.5: Verify ship + report**

```bash
git ls-remote --tags origin | grep v1.33.0  # confirm tag on origin
gh release view v1.33.0 --json tagName,url  # confirm release visible
```

Write report to `D:/claude_proj2/claude-AutosarCfg/.git/sdd/task-8-report.md` with:

- Status
- Commits
- Test results
- Push + release URL
- Concerns (if any)
- Self-review checklist

Return ONE LINE: `Status: DONE. Commits: <sha>[, <sha2>]. Tests: 2998+7. Release URL: <URL>`

---

## Self-Review

After drafting, I ran the spec-vs-plan checklist:

1. **Spec coverage**:
   - §3 T1 (XlsxImportSlice + IPC push) → Task 1 ✓
   - §3 T2 (bswmd:pick + Override activation) → Task 2 ✓
   - §3 T3 (odx:open-with-default + DcmConfigPicker) → Task 3 ✓
   - §3 T4 (regex deletion) → Task 4 ✓
   - §3 T5 (launcher xlsxRows + override wiring) → Task 5 ✓
   - §3 T6 (bswmdPath required) → Task 6 ✓
   - §3 T7 (wiring + appliedCount surface) → Task 7 ✓
   - §3 T8 (ship) → Task 8 ✓

2. **Placeholder scan**: no TBD/TODO/"fill in"/"similar to" — every step has concrete code.

3. **Type consistency**:
   - `BswmdPickResult` defined once in Task 2, used in T2 + T7.
   - `OpenOdxWithDefaultRequest` + `OpenOdxWithDefaultResult` defined once in Task 3, used in T3 + T8.
   - `XlsxImportRecord` + `XlsxImportSlice` defined once in Task 1, used in T1 + T5.
   - `bswmdPathOverride` state field defined once in Task 5, used in T5 + T6.
   - `handleOverridePick` + `handleOverrideClear` defined once in Task 5, used in T5 + T7.
   - `DcmConfigOverridePicker` defined once in Task 2, used in T2 + T7.

4. **Mid-plan design corrections applied**:
   - Task 1: `xlsx:import-complete` push channel uses `BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]` (matches existing `script-handler.ts:328-335` pattern) — sender-agnostic, not `event.sender`-scoped, because the registration wrapper discards `_event`. This is the established pattern in the codebase.
   - Task 6: success-path `bswmdPath` is `dcmBswmdPath` (the already-resolved variable from the handler's local scope), not `args.bswmdPath ?? dcmBswmdPath` — simplification matches the spec's "handler always receives a resolved path" semantic.

5. **NEW lessons to vault after ship**:
   - `store-as-source-of-truth-for-async-args`
   - `disable-input-without-browse-button-is-debt`
   - `additive-ipc-channels-over-extending-args`
   - `1-release-compat-window-explicit-removal`

Plan is complete.
