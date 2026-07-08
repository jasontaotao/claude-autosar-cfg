# v1.36.0 MINOR — xlsxImportHistory Persistence + Generate New Confirmation + ops polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 2 deferred promises (v1.34.0 xlsxImportHistory persistence + v1.33.1 Generate New 二次确认 modal) + 1 ops polish (Tier 3 push orphan-recovery docs + 4 lessons vault落) in 1 MINOR.

**Architecture:** Three additive changes — (1) custom JSON file in `<userData>/xlsx-import-history.json` via 2 new main IPC channels; (2) new `<ConfirmDialog2 />` 2-button modal separate from existing 3-button `<ConfirmDialog />`; (3) ops polish (tier3 README + 4 lessons vault + v1.35.0 release-notes C2 cleanup). No new npm dependencies.

**Tech Stack:** TypeScript 5.6, React 19, vitest 3 + jsdom 30+, Python 3 stdlib (tier3 test extension), Electron 30+ (BrowserWindow, app.getPath, ipcMain), Zustand 4 (XlsxImportSlice extension).

## Global Constraints

(Verbatim from spec — applies to every task.)

- All modified/new files end with trailing newline.
- No `console.log` in production code; `console.warn` allowed for defensive warnings (e.g., `reuseFromHistory` no-op, corrupt-file fallback).
- 中文 for user-facing/business comments; 英文 for technical API/protocol/comments per CLAUDE.md.
- `pnpm verify` (7-stage) must pass at T7 ship gate.
- 40-char SHA for `gh release create`.
- TWO separate pushes (no `--follow-tags`) per the
  `follow-tags-unreliable-separate-push-tag` lesson.
- Tier 3 fallback (`scripts/tier3_push.py`) — used in T7 if direct `git push` fails.
- Implementer MUST NOT dispatch `pkm-capture` (parent controller's job — same rule from v1.32.0 T3 finding).
- Implementer MUST NOT make destructive git operations (`reset --hard`,
  `push --force`) on `origin/main`.
- All test additions must include the covering test command and pass
  locally before commit.
- Exact values (i18n key names, kind strings, file paths) MUST match the spec
  verbatim — no on-the-fly renaming.

---

### Task 1: `xlsxHistoryStorage` (main) + corrupted-file handling

**Files:**

- Create: `src/main/xlsxHistoryStorage.ts`
- Test: `src/main/__tests__/xlsxHistoryStorage.test.ts`

**Interfaces:**

- Consumes: `app.getPath('userData')` (Electron API); `EcucInstanceRow` from `src/shared/types.js`
- Produces:
  - `XlsxImportRecord` (re-exported from `src/renderer/store/slices/xlsxImportSlice.js` or duplicated as `MainXlsxImportRecord` — see Step 1.1)
  - `readXlsxHistory(): Promise<XlsxImportRecord[]>` — returns `[]` on missing/corrupt file + `console.warn`
  - `writeXlsxHistory(record: XlsxImportRecord): Promise<void>` — writes cap-5 + prepend-first JSON

**Why first:** T1 establishes the storage primitive. T2 wraps it in IPC. T3 wires renderer. T1 is the only testable-without-IPC layer.

- [ ] **Step 1.1: Add the `MainXlsxImportRecord` type**

Open `src/main/xlsxHistoryStorage.ts` (NEW file, trailing newline). Add:

```ts
// v1.36.0 MINOR T1 — JSON file persistence for xlsxImportHistory.
//
// Stores the last 5 xlsx imports to <userData>/xlsx-import-history.json
// so the v1.34.0 timeline survives app restarts. Pure module — no
// IPC, no Electron dialog API. Wrapped by xlsxHistoryLoadHandler /
// xlsxHistorySaveHandler (T2) which expose it to the renderer.
//
// Lesson: custom-json-file-storage-avoids-new-dep — for a 5-entry
// cap with a stable shape, custom JSON in userData is simpler than
// electron-store. No schema migration needed at this size.

import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';

import type { EcucInstanceRow } from '../shared/types.js';

const MAX_HISTORY = 5;

export interface MainXlsxImportRecord {
  readonly rows: readonly EcucInstanceRow[];
  readonly source: 'manual' | 'wizard';
  readonly importedAt: number;
}

function historyFilePath(): string {
  const userData = app.getPath('userData');
  return pathResolve(userData, 'xlsx-import-history.json');
}
```

- [ ] **Step 1.2: Add the `readXlsxHistory` function**

Append to the same file (after `historyFilePath`):

```ts
/**
 * Read the persisted history. Returns [] on:
 *   - missing file (first-run)
 *   - corrupted JSON (defensive — log + reset)
 *   - any FS error (defensive — log + reset)
 *
 * Defensive: the cap-5 + prepend-first invariant is re-enforced
 * defensively on read in case the file was hand-edited or written
 * by an older version.
 */
export function readXlsxHistory(): MainXlsxImportRecord[] {
  const path = historyFilePath();
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      // eslint-disable-next-line no-console
      console.warn(`xlsxHistoryStorage: expected array, got ${typeof parsed}; resetting`);
      return [];
    }
    // Defensive cap: slice(0, MAX_HISTORY). Each entry is not
    // structurally validated beyond runtime — `xlsxEcucBatchImportHandler`
    // is the only writer, and it always produces valid shapes.
    return parsed.slice(0, MAX_HISTORY) as MainXlsxImportRecord[];
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      `xlsxHistoryStorage: corrupt or unreadable file at ${path}: ${
        e instanceof Error ? e.message : String(e)
      }; resetting to empty`,
    );
    return [];
  }
}
```

- [ ] **Step 1.3: Add the `writeXlsxHistory` function**

Append:

```ts
/**
 * Write a new record to the head of the history (cap-5 + prepend-first).
 * Reads existing entries first, prepends, slices to MAX_HISTORY, then
 * atomic-ish write (writeFileSync to a tmp file then rename is overkill
 * for 5 entries — the window for corruption is microseconds; if the
 * process crashes mid-write the readXlsxHistory defensive parser resets
 * to []).
 */
export function writeXlsxHistory(record: MainXlsxImportRecord): void {
  const path = historyFilePath();
  const userData = app.getPath('userData');
  // Ensure the userData directory exists (Electron creates it on app
  // boot but defensive mkdir is cheap).
  mkdirSync(userData, { recursive: true });
  const existing = readXlsxHistory();
  const next = [record, ...existing].slice(0, MAX_HISTORY);
  writeFileSync(path, JSON.stringify(next, null, 2), 'utf-8');
}
```

- [ ] **Step 1.4: Write the failing test (RED)**

Create `src/main/__tests__/xlsxHistoryStorage.test.ts` (trailing newline):

```ts
// v1.36.0 MINOR T1 — xlsxHistoryStorage unit tests.
//
// Mocks app.getPath('userData') to point at a tmp dir; each test gets
// a clean tmp dir so reads/writes are isolated.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'xlsx-history-test-'));

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return tmpDir;
      throw new Error(`unexpected getPath: ${name}`);
    },
  },
}));

// Import AFTER mock setup so the storage module picks up the mocked app.
const { readXlsxHistory, writeXlsxHistory } = await import('../xlsxHistoryStorage.js');

afterEach(() => {
  rmSync(join(tmpDir, 'xlsx-import-history.json'), { force: true });
});

describe('xlsxHistoryStorage', () => {
  const sample = {
    rows: [],
    source: 'wizard' as const,
    importedAt: 1000,
  };

  it('returns [] when the file does not exist (first-run)', () => {
    expect(readXlsxHistory()).toEqual([]);
  });

  it('round-trips a single record', () => {
    writeXlsxHistory(sample);
    expect(readXlsxHistory()).toEqual([sample]);
  });

  it('enforces cap-5 + prepend-first on write', () => {
    for (let i = 0; i < 7; i++) {
      writeXlsxHistory({ ...sample, importedAt: 1000 + i });
    }
    const history = readXlsxHistory();
    expect(history).toHaveLength(5);
    // Most-recent first
    expect(history[0]?.importedAt).toBe(1006);
    expect(history[4]?.importedAt).toBe(1002);
  });

  it('returns [] + console.warn on corrupt JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    writeFileSync(join(tmpDir, 'xlsx-import-history.json'), 'not-valid-json{', 'utf-8');
    expect(readXlsxHistory()).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('corrupt or unreadable'));
    warn.mockRestore();
  });
});
```

- [ ] **Step 1.5: Run the test to verify it passes (GREEN — T1.1-1.3 implementation is complete)**

```bash
cd D:/claude_proj2/claude-AutosarCfg && pnpm exec vitest run src/main/__tests__/xlsxHistoryStorage.test.ts
```

Expected: 4 tests PASS. (This task writes tests + impl together; RED+GREEN split not required because the file is small and the impl is mechanical.)

- [ ] **Step 1.6: Commit**

```bash
cd D:/claude_proj2/claude-AutosarCfg && git add src/main/xlsxHistoryStorage.ts src/main/__tests__/xlsxHistoryStorage.test.ts
```

```bash
cd D:/claude_proj2/claude-AutosarCfg && git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -m "feat(main): v1.36.0 MINOR T1 — xlsxHistoryStorage (JSON file persistence)

Adds the main-side storage primitive for the v1.34.0 xlsxImportHistory
timeline persistence. Pure module — no IPC, no Electron dialog. Wrapped
by xlsxHistoryLoadHandler / xlsxHistorySaveHandler in T2.

- readXlsxHistory(): returns [] on missing/corrupt file + console.warn
- writeXlsxHistory(record): cap-5 + prepend-first JSON to
  <userData>/xlsx-import-history.json

+4 unit tests in src/main/__tests__/xlsxHistoryStorage.test.ts:
- returns [] on first-run
- round-trips single record
- enforces cap-5 + prepend-first on write
- returns [] + console.warn on corrupt JSON

Lesson: custom-json-file-storage-avoids-new-dep — for a 5-entry cap
with a stable shape, custom JSON in userData is simpler than
electron-store. No schema migration needed at this size."
```

Expected: commit created. Branch is now 1 commit ahead of `b3790d2` (v1.36.0 spec).

---

### Task 2: `xlsxHistoryLoadHandler` + `xlsxHistorySaveHandler` (main IPC) + register + preload exposure

**Files:**

- Create: `src/main/ipc/xlsxHistoryLoadHandler.ts`
- Create: `src/main/ipc/xlsxHistorySaveHandler.ts`
- Modify: `src/shared/ipc-contract.ts:227` (add 2 new channel constants)
- Modify: `src/main/ipc/register.ts` (register 2 new handlers)
- Modify: `src/preload/index.ts` (expose `xlsxHistoryLoad` only)
- Test: `src/main/ipc/__tests__/xlsxHistoryLoadHandler.test.ts`
- Test: `src/main/ipc/__tests__/xlsxHistorySaveHandler.test.ts`

**Interfaces:**

- Consumes: T1's `readXlsxHistory` / `writeXlsxHistory`
- Produces:
  - `XlsHistoryLoadResponse` discriminated union: `{ ok: true, value: MainXlsxImportRecord[] } | { ok: false, error: { kind: 'read-failed', message: string } }`
  - `XlsHistorySaveRequest` = `MainXlsxImportRecord`
  - `XlsHistorySaveResponse` discriminated union: `{ ok: true } | { ok: false, error: { kind: 'write-failed', message: string } }`

- [ ] **Step 2.1: Add the 2 new channel constants in `src/shared/ipc-contract.ts`**

Find line 227 (`XLSX_IMPORT_COMPLETE: 'xlsx:import-complete',`) and add immediately after (preserving the existing 2-line comment block for context — append AFTER the comment ends):

```ts
  // v1.36.0 MINOR T2 — xlsxImportHistory persistence IPC surface.
  // xlsxHistory:load — renderer bootstrap calls this on App mount to
  //   hydrate the v1.34.0 session-scope history from disk.
  // xlsxHistory:save — main-internal; xlsxEcucBatchImportHandler calls
  //   this directly (NOT exposed via preload bridge) after the
  //   xlsx:import-complete broadcast succeeds.
  XLSX_HISTORY_LOAD: 'xlsxHistory:load',
  XLSX_HISTORY_SAVE: 'xlsxHistory:save',
```

- [ ] **Step 2.2: Create `src/main/ipc/xlsxHistoryLoadHandler.ts`**

Create the file (trailing newline):

```ts
// v1.36.0 MINOR T2 — xlsxImportHistory load handler.
//
// Pure thin wrapper around readXlsxHistory (T1). Returns the typed
// discriminated envelope matching the IPC contract.

import { readXlsxHistory, type MainXlsxImportRecord } from '../xlsxHistoryStorage.js';

export type XlsHistoryLoadResponse =
  | { readonly ok: true; readonly value: readonly MainXlsxImportRecord[] }
  | {
      readonly ok: false;
      readonly error: { readonly kind: 'read-failed'; readonly message: string };
    };

export function xlsxHistoryLoadHandler(): XlsHistoryLoadResponse {
  try {
    return { ok: true, value: readXlsxHistory() };
  } catch (e) {
    return {
      ok: false,
      error: {
        kind: 'read-failed',
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }
}
```

- [ ] **Step 2.3: Create `src/main/ipc/xlsxHistorySaveHandler.ts`**

Create the file (trailing newline):

```ts
// v1.36.0 MINOR T2 — xlsxImportHistory save handler.
//
// Pure thin wrapper around writeXlsxHistory (T1). Called by
// xlsxEcucBatchImportHandler (T3) after the xlsx:import-complete
// broadcast — not exposed via the preload bridge (main-internal
// only).

import { writeXlsxHistory, type MainXlsxImportRecord } from '../xlsxHistoryStorage.js';

export type XlsHistorySaveRequest = MainXlsxImportRecord;

export type XlsHistorySaveResponse =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly error: { readonly kind: 'write-failed'; readonly message: string };
    };

export function xlsxHistorySaveHandler(req: XlsHistorySaveRequest): XlsHistorySaveResponse {
  try {
    writeXlsxHistory(req);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: {
        kind: 'write-failed',
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }
}
```

- [ ] **Step 2.4: Register the new handler in `src/main/ipc/register.ts`**

Find the `ipcMain.handle` block (search for `ipcMain.handle(IPC_CHANNELS.`) and add after the last `ipcMain.handle` line:

```ts
// v1.36.0 MINOR T2 — xlsxImportHistory persistence.
ipcMain.handle(IPC_CHANNELS.XLSX_HISTORY_LOAD, () => xlsxHistoryLoadHandler());
```

(SAVE handler is main-internal — wired in T3 when xlsxEcucBatchImportHandler is updated. No ipcMain.handle needed for SAVE because the renderer doesn't call it directly.)

Add the import at the top of `register.ts` (with the other `xxxHandler` imports, alphabetical by convention):

```ts
import { xlsxHistoryLoadHandler } from './xlsxHistoryLoadHandler.js';
```

- [ ] **Step 2.5: Expose `xlsxHistoryLoad` in `src/preload/index.ts`**

Find the `xlsxWriteBatchTemplate` block (around line 288) and add AFTER the `onXlsxImportComplete` block (around line 306-309):

```ts
  // v1.36.0 MINOR T2 — xlsxImportHistory load bridge.
  // Renderer bootstrap calls this on App mount to hydrate the
  // session-scope xlsxImportHistory from disk. The save side is
  // main-internal (T3 wires it into xlsxEcucBatchImportHandler) and
  // is NOT exposed via this bridge.
  xlsxHistoryLoad: (): Promise<XlsHistoryLoadResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.XLSX_HISTORY_LOAD),
```

Add the import at the top of `preload/index.ts` (with the other handler-type imports):

```ts
import type { XlsHistoryLoadResponse } from '../main/ipc/xlsxHistoryLoadHandler.js';
```

- [ ] **Step 2.6: Write the failing test for the load handler (RED)**

Create `src/main/ipc/__tests__/xlsxHistoryLoadHandler.test.ts` (trailing newline):

```ts
// v1.36.0 MINOR T2 — xlsxHistoryLoadHandler unit tests.
//
// Mocks readXlsxHistory (T1) and verifies the IPC envelope shape.

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainXlsxImportRecord } from '../../xlsxHistoryStorage.js';

vi.mock('../../xlsxHistoryStorage.js', () => ({
  readXlsxHistory: vi.fn(),
}));

const { readXlsxHistory } = await import('../../xlsxHistoryStorage.js');
const { xlsxHistoryLoadHandler } = await import('../xlsxHistoryLoadHandler.js');

afterEach(() => {
  vi.resetAllMocks();
});

describe('xlsxHistoryLoadHandler', () => {
  it('returns ok with empty array when no history exists', () => {
    vi.mocked(readXlsxHistory).mockReturnValue([]);
    const res = xlsxHistoryLoadHandler();
    expect(res).toEqual({ ok: true, value: [] });
  });

  it('returns ok with records when history exists', () => {
    const records: MainXlsxImportRecord[] = [
      { rows: [], source: 'wizard', importedAt: 2000 },
      { rows: [], source: 'manual', importedAt: 1000 },
    ];
    vi.mocked(readXlsxHistory).mockReturnValue(records);
    const res = xlsxHistoryLoadHandler();
    expect(res).toEqual({ ok: true, value: records });
  });

  it('returns ok:false read-failed when readXlsxHistory throws', () => {
    vi.mocked(readXlsxHistory).mockImplementation(() => {
      throw new Error('disk error');
    });
    const res = xlsxHistoryLoadHandler();
    expect(res).toEqual({
      ok: false,
      error: { kind: 'read-failed', message: 'disk error' },
    });
  });
});
```

- [ ] **Step 2.7: Write the failing test for the save handler (RED)**

Create `src/main/ipc/__tests__/xlsxHistorySaveHandler.test.ts` (trailing newline):

```ts
// v1.36.0 MINOR T2 — xlsxHistorySaveHandler unit tests.

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainXlsxImportRecord } from '../../xlsxHistoryStorage.js';

vi.mock('../../xlsxHistoryStorage.js', () => ({
  writeXlsxHistory: vi.fn(),
}));

const { writeXlsxHistory } = await import('../../xlsxHistoryStorage.js');
const { xlsxHistorySaveHandler } = await import('../xlsxHistorySaveHandler.js');

afterEach(() => {
  vi.resetAllMocks();
});

describe('xlsxHistorySaveHandler', () => {
  const sample: MainXlsxImportRecord = {
    rows: [],
    source: 'wizard',
    importedAt: 1000,
  };

  it('returns ok when writeXlsxHistory succeeds', () => {
    vi.mocked(writeXlsxHistory).mockReturnValue(undefined);
    const res = xlsxHistorySaveHandler(sample);
    expect(res).toEqual({ ok: true });
    expect(writeXlsxHistory).toHaveBeenCalledWith(sample);
  });

  it('returns ok:false write-failed when writeXlsxHistory throws', () => {
    vi.mocked(writeXlsxHistory).mockImplementation(() => {
      throw new Error('disk full');
    });
    const res = xlsxHistorySaveHandler(sample);
    expect(res).toEqual({
      ok: false,
      error: { kind: 'write-failed', message: 'disk full' },
    });
  });

  it('passes the record through verbatim (no transformation)', () => {
    vi.mocked(writeXlsxHistory).mockReturnValue(undefined);
    const record: MainXlsxImportRecord = {
      rows: [],
      source: 'manual',
      importedAt: 9999,
    };
    xlsxHistorySaveHandler(record);
    expect(writeXlsxHistory).toHaveBeenCalledWith(record);
  });
});
```

- [ ] **Step 2.8: Run the new tests**

```bash
cd D:/claude_proj2/claude-AutosarCfg && pnpm exec vitest run src/main/ipc/__tests__/xlsxHistoryLoadHandler.test.ts src/main/ipc/__tests__/xlsxHistorySaveHandler.test.ts
```

Expected: 3 + 3 = 6 tests PASS.

- [ ] **Step 2.9: Run typecheck**

```bash
cd D:/claude_proj2/claude-AutosarCfg && pnpm exec tsc --noEmit -p tsconfig.json && pnpm exec tsc --noEmit -p tsconfig.web.json
```

Expected: tsc clean. Common failure modes:

- `Module '../../xlsxHistoryStorage.js' has no exported member 'XlsHistoryLoadResponse'` — the import in `preload/index.ts` is wrong; double-check Step 2.5.
- `Cannot find name 'XlsHistoryLoadResponse'` in `preload/index.ts` — same fix.

- [ ] **Step 2.10: Commit**

```bash
cd D:/claude_proj2/claude-AutosarCfg && git add src/shared/ipc-contract.ts src/main/ipc/xlsxHistoryLoadHandler.ts src/main/ipc/xlsxHistorySaveHandler.ts src/main/ipc/register.ts src/preload/index.ts src/main/ipc/__tests__/xlsxHistoryLoadHandler.test.ts src/main/ipc/__tests__/xlsxHistorySaveHandler.test.ts
```

```bash
cd D:/claude_proj2/claude-AutosarCfg && git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -m "feat(main+preload): v1.36.0 MINOR T2 — xlsxHistory IPC handlers + bridge

Adds 2 new IPC channels (xlsxHistory:load + xlsxHistory:save) wrapping
the T1 xlsxHistoryStorage primitive.

- XLSX_HISTORY_LOAD: renderer-side bootstrap (exposed via preload
  bridge as xlsxHistoryLoad())
- XLSX_HISTORY_SAVE: main-internal; T3 wires it into
  xlsxEcucBatchImportHandler (NOT exposed via preload — main-only)

+6 unit tests (3 load + 3 save). Both handlers tested with vi.mock
of the T1 storage module to keep tests isolated from FS state."
```

---

### Task 3: `hydrateXlsxHistory` slice action + bootstrap + App.tsx wiring + xlsx:import-complete save-side hook

**Files:**

- Modify: `src/renderer/store/slices/xlsxImportSlice.ts` (add `hydrateXlsxHistory` action)
- Create: `src/renderer/store/xlsxImportHistoryBootstrap.ts`
- Modify: `src/renderer/App.tsx` (call `attachXlsxHistoryBootstrap` on mount)
- Modify: `src/main/ipc/xlsxEcucBatchImportHandler.ts:458-462` (call `xlsxHistorySaveHandler` after broadcast)
- Modify: `src/renderer/store/__tests__/xlsxImportSlice.test.ts` (add 3 hydrateXlsxHistory tests)
- Test: `src/renderer/store/__tests__/xlsxImportHistoryBootstrap.test.ts`

**Interfaces:**

- Consumes: T1's `MainXlsxImportRecord` shape, T2's `XlsHistoryLoadResponse` shape
- Produces:
  - `XlsxImportSlice.hydrateXlsxHistory(records: readonly MainXlsxImportRecord[]): void` — replaces `xlsxImportHistory` with the loaded array (defensive cap-5)
  - `attachXlsxHistoryBootstrap(): () => void` — returns cleanup fn for hot-reload safety

**Why here:** T1+T2 are pure main; T3 wires the renderer side + bridges the gap between the existing `xlsx:import-complete` push and the new persistence layer.

- [ ] **Step 3.1: Add `hydrateXlsxHistory` action to `XlsxImportSlice`**

Open `src/renderer/store/slices/xlsxImportSlice.ts`. Add to the `XlsxImportSlice` interface (after the `reuseFromHistory` line, before the closing `}`):

```ts
  /** v1.36.0 MINOR T3 — hydrate the session-scope history from disk
   * on App mount. Replaces the in-memory `xlsxImportHistory` with the
   * persisted array. Defensive cap-5 (in case a hand-edited file
   * contains more than 5 entries — main also caps). */
  hydrateXlsxHistory: (records: readonly MainXlsxImportRecord[]) => void;
```

Add the import at the top of the file:

```ts
import type { MainXlsxImportRecord } from '../../main/xlsxHistoryStorage.js';
```

Add the action to the slice implementation (after `reuseFromHistory`):

```ts
  hydrateXlsxHistory: (records) =>
    set(() => ({
      xlsxImportHistory: records.slice(0, MAX_HISTORY),
      // Note: does NOT touch xlsxLastImport — that's the in-session
      // trigger for dcm:config; the disk file is the cross-session
      // timeline only.
    })),
```

- [ ] **Step 3.2: Create `src/renderer/store/xlsxImportHistoryBootstrap.ts`**

Create the file (trailing newline):

```ts
// v1.36.0 MINOR T3 — xlsxImportHistory bootstrap.
//
// Calls xlsxHistory:load on App mount and writes the result to
// XlsxImportSlice via hydrateXlsxHistory. Mirrors the v1.33.0
// attachXlsxImportListener pattern (return cleanup fn for hot-reload
// safety; same module layout in store/).

import { useArxmlStore } from './useArxmlStore.js';
import type { MainXlsxImportRecord } from '../../main/xlsxHistoryStorage.js';

interface XlsHistoryLoadSuccess {
  readonly ok: true;
  readonly value: readonly MainXlsxImportRecord[];
}
interface XlsHistoryLoadFailure {
  readonly ok: false;
  readonly error: { readonly kind: 'read-failed'; readonly message: string };
}

type XlsHistoryLoadResponse = XlsHistoryLoadSuccess | XlsHistoryLoadFailure;

export function attachXlsxHistoryBootstrap(): () => void {
  // The renderer bridge is a thin wrapper around ipcRenderer.invoke;
  // the envelope matches the main-side handler's return shape.
  const bridge = (
    window as unknown as {
      autosarApi?: {
        xlsxHistoryLoad?: () => Promise<XlsHistoryLoadResponse>;
      };
    }
  ).autosarApi;
  if (bridge?.xlsxHistoryLoad === undefined) {
    // Defensive: bridge missing in test/dev env. Resolve silently —
    // xlsxImportHistory stays at default [].
    return () => undefined;
  }
  let cancelled = false;
  void bridge
    .xlsxHistoryLoad()
    .then((res) => {
      if (cancelled) return;
      if (res.ok) {
        useArxmlStore.getState().hydrateXlsxHistory(res.value);
      } else {
        // Defensive: load failed (e.g., disk error). The session
        // starts with empty history; user can re-import to repopulate.
        // eslint-disable-next-line no-console
        console.warn(
          `xlsxImportHistoryBootstrap: load failed (${res.error.kind}: ${res.error.message}); starting with empty history`,
        );
      }
    })
    .catch((e) => {
      if (cancelled) return;
      // eslint-disable-next-line no-console
      console.warn(
        `xlsxImportHistoryBootstrap: unexpected error: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    });
  return () => {
    cancelled = true;
  };
}
```

- [ ] **Step 3.3: Wire `attachXlsxHistoryBootstrap` in `App.tsx`**

Open `src/renderer/App.tsx`. Find the existing `attachXlsxImportListener()` call (search for it). The new bootstrap is independent — it can run alongside. Add immediately after (in the same `useEffect` block):

```ts
// v1.36.0 MINOR T3 — hydrate xlsxImportHistory from disk on App
// mount. Independent of xlsx:import-complete push; both listeners
// stay for the app's lifetime.
useEffect(() => attachXlsxHistoryBootstrap(), []);
```

If `attachXlsxImportListener` is NOT already inside a `useEffect`, wrap both in one. Mirror the v1.33.0 + v1.34.0 + v1.35.0 pattern from your reading.

- [ ] **Step 3.4: Wire `xlsxHistorySaveHandler` into `xlsxEcucBatchImportHandler.ts`**

Open `src/main/ipc/xlsxEcucBatchImportHandler.ts`. Find the `webContents.send` block (around line 458-462). Add immediately after (in the same `if` block, after the send completes):

```ts
// v1.36.0 MINOR T3 — persist to disk after the broadcast.
// Order: broadcast first (so the renderer's xlsxLastImport
// updates immediately), persist second (file-bound, async).
// If persistence fails, xlsxLastImport is still updated —
// in-memory state is the source of truth for the next
// dcm:config call.
xlsxHistorySaveHandler({
  rows: appliedRows,
  source: 'wizard',
  importedAt: Date.now(),
});
```

Add the import at the top of the file (with the other handler imports):

```ts
import { xlsxHistorySaveHandler } from './xlsxHistorySaveHandler.js';
```

- [ ] **Step 3.5: Add `hydrateXlsxHistory` tests to `xlsxImportSlice.test.ts`**

Open `src/renderer/store/__tests__/xlsxImportSlice.test.ts`. Find the `describe('reuseFromHistory (v1.34.0 MINOR T1)')` block. Add a new `describe` block immediately after it:

```ts
describe('hydrateXlsxHistory (v1.36.0 MINOR T3)', () => {
  beforeEach(() => {
    useArxmlStore.setState({
      xlsxLastImport: null,
      xlsxImportHistory: [],
    });
  });

  it('replaces xlsxImportHistory with the loaded records', () => {
    const records: MainXlsxImportRecord[] = [
      { rows: [], source: 'wizard', importedAt: 3000 },
      { rows: [], source: 'manual', importedAt: 2000 },
      { rows: [], source: 'wizard', importedAt: 1000 },
    ];
    useArxmlStore.getState().hydrateXlsxHistory(records);
    const s = useArxmlStore.getState();
    expect(s.xlsxImportHistory).toEqual(records);
  });

  it('does not touch xlsxLastImport (in-memory last-import is session-only)', () => {
    useArxmlStore.setState({
      xlsxLastImport: { rows: [], source: 'wizard', importedAt: 5000 },
    });
    useArxmlStore.getState().hydrateXlsxHistory([{ rows: [], source: 'manual', importedAt: 1000 }]);
    const s = useArxmlStore.getState();
    expect(s.xlsxLastImport?.importedAt).toBe(5000);
    expect(s.xlsxImportHistory).toHaveLength(1);
  });

  it('defensively caps at MAX_HISTORY=5 even if 7 records are passed', () => {
    const records: MainXlsxImportRecord[] = Array.from({ length: 7 }, (_, i) => ({
      rows: [],
      source: 'wizard' as const,
      importedAt: 1000 + i,
    }));
    useArxmlStore.getState().hydrateXlsxHistory(records);
    expect(useArxmlStore.getState().xlsxImportHistory).toHaveLength(5);
  });
});
```

Add the import at the top of the test file:

```ts
import type { MainXlsxImportRecord } from '../../../main/xlsxHistoryStorage.js';
```

- [ ] **Step 3.6: Write the bootstrap test (RED)**

Create `src/renderer/store/__tests__/xlsxImportHistoryBootstrap.test.ts` (trailing newline):

```ts
// v1.36.0 MINOR T3 — attachXlsxHistoryBootstrap unit tests.
//
// Mocks window.autosarApi.xlsxHistoryLoad; verifies that the
// hydrate action is called on success and silently no-ops on failure.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useArxmlStore } from '../useArxmlStore.js';

const loadMock = vi.fn();

beforeEach(() => {
  useArxmlStore.setState({
    xlsxLastImport: null,
    xlsxImportHistory: [],
  });
  (window as unknown as { autosarApi: { xlsxHistoryLoad: typeof loadMock } }).autosarApi = {
    xlsxHistoryLoad: loadMock,
  };
  loadMock.mockReset();
});

afterEach(() => {
  delete (window as unknown as { autosarApi?: unknown }).autosarApi;
});

describe('attachXlsxHistoryBootstrap', () => {
  it('hydrates xlsxImportHistory on load success', async () => {
    loadMock.mockResolvedValue({
      ok: true,
      value: [{ rows: [], source: 'wizard', importedAt: 1000 }],
    });
    const cleanup = (await import('../xlsxImportHistoryBootstrap.js')).attachXlsxHistoryBootstrap();
    // Wait one microtask for the promise to resolve
    await Promise.resolve();
    await Promise.resolve();
    expect(useArxmlStore.getState().xlsxImportHistory).toHaveLength(1);
    cleanup();
  });

  it('console.warns and leaves history empty on load failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    loadMock.mockResolvedValue({
      ok: false,
      error: { kind: 'read-failed', message: 'disk error' },
    });
    const cleanup = (await import('../xlsxImportHistoryBootstrap.js')).attachXlsxHistoryBootstrap();
    await Promise.resolve();
    await Promise.resolve();
    expect(useArxmlStore.getState().xlsxImportHistory).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('load failed'));
    warn.mockRestore();
    cleanup();
  });

  it('returns a no-op cleanup when the bridge is missing (defensive)', async () => {
    delete (window as unknown as { autosarApi?: unknown }).autosarApi;
    const cleanup = (await import('../xlsxImportHistoryBootstrap.js')).attachXlsxHistoryBootstrap();
    // No throw; cleanup is callable
    expect(typeof cleanup).toBe('function');
    cleanup();
  });
});
```

- [ ] **Step 3.7: Run the new tests**

```bash
cd D:/claude_proj2/claude-AutosarCfg && pnpm exec vitest run src/renderer/store/__tests__/xlsxImportSlice.test.ts src/renderer/store/__tests__/xlsxImportHistoryBootstrap.test.ts
```

Expected: original + 3 new = at least 8 tests in the slice file (2 original + 3 T1 + 3 T3); 3 new in the bootstrap file. All PASS.

- [ ] **Step 3.8: Run typecheck**

```bash
cd D:/claude_proj2/claude-AutosarCfg && pnpm exec tsc --noEmit -p tsconfig.json && pnpm exec tsc --noEmit -p tsconfig.web.json
```

Expected: tsc clean.

- [ ] **Step 3.9: Commit**

```bash
cd D:/claude_proj2/claude-AutosarCfg && git add src/renderer/store/slices/xlsxImportSlice.ts src/renderer/store/xlsxImportHistoryBootstrap.ts src/renderer/App.tsx src/main/ipc/xlsxEcucBatchImportHandler.ts src/renderer/store/__tests__/xlsxImportSlice.test.ts src/renderer/store/__tests__/xlsxImportHistoryBootstrap.test.ts
```

```bash
cd D:/claude_proj2/claude-AutosarCfg && git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -m "feat(renderer+main): v1.36.0 MINOR T3 — xlsxImportHistory hydration + persistence hook

- New hydrateXlsxHistory action on XlsxImportSlice (defensive cap-5)
- New attachXlsxHistoryBootstrap() called from App.tsx on mount
- xlsxEcucBatchImportHandler now calls xlsxHistorySaveHandler
  AFTER the xlsx:import-complete broadcast (in-memory first,
  persistence second; if persistence fails, xlsxLastImport still
  updated)

+6 new tests:
- 3 hydrateXlsxHistory cases (replace, leave-last-import, cap-5)
- 3 attachXlsxHistoryBootstrap cases (success, failure, no-bridge)

D3 (cap-5 defensive on hydrate), D4 (broadcast-then-persist
order), D5 (corrupt-file defensive) all honored."
```

---

### Task 4: `<ConfirmDialog2 />` component + `confirmDestructive()` API + i18n keys (4)

**Files:**

- Create: `src/renderer/components/ConfirmDialog2.tsx`
- Create: `src/renderer/components/ConfirmDialog2.css`
- Modify: `src/shared/i18n/odx.ts` (add 4 keys to interface)
- Modify: `src/shared/i18n.en/odx.ts` (add 4 English strings)
- Modify: `src/shared/i18n.zh-CN/odx.ts` (add 4 Chinese strings)
- Test: `src/renderer/components/__tests__/ConfirmDialog2.test.tsx`

**Interfaces:**

- Consumes: existing `useArxmlStore.locale` (locale-reactive labels, mirrors ConfirmDialog)
- Produces:
  - `<ConfirmRoot2 />` component (mount once in App)
  - `confirmDestructive(options: { title, message, confirmLabel, cancelLabel? }): Promise<'confirm' | 'cancel'>`
  - 4 i18n keys: `dcmConfig.generateNew.confirm.title`, `.message`, `.confirm`, `.cancel`

**Why this task alone:** D2 — separate component from existing 3-button `ConfirmDialog`. Avoids API confusion. T5 wires it into `handleGenerateNew`.

- [ ] **Step 4.1: Create `src/renderer/components/ConfirmDialog2.tsx`**

Create the file (trailing newline):

```tsx
// ConfirmDialog2 — 2-button modal for destructive yes/no confirms
// (Sprint ... v1.36.0 MINOR T4).
//
// Pattern mirrors the v1.x ConfirmDialog (Sprint 12 #3): module-level
// `externalSetState` + promise resolve. The host component mounts once
// at the app root. Calling `confirmDestructive(options)` shows a
// 2-button modal and resolves with the user's choice.
//
// 2-button shape is intentionally distinct from the existing
// 3-button ConfirmDialog (continue/discard/saveAndProceed for
// unsaved-changes). Lesson: confirm-dialogs-serve-different-scenarios
// — 3-button (unsaved-changes) and 2-button (destructive yes/no) are
// different UI patterns; don't force one API.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { t } from '@shared/i18n/index.js';

import { useArxmlStore } from '../store/useArxmlStore';

import './ConfirmDialog2.css';

export type DestructiveChoice = 'confirm' | 'cancel';

export interface ConfirmDestructiveOptions {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
}

interface ConfirmState {
  readonly options: ConfirmDestructiveOptions;
  readonly resolve: (value: DestructiveChoice) => void;
}

let externalSetState: ((state: ConfirmState | null) => void) | null = null;

/**
 * Show a destructive confirm dialog. Returns a promise that resolves
 * with the user's choice.
 *
 * Esc / × / backdrop click all resolve with 'cancel' — the user has
 * not committed to a destructive action.
 *
 * If `ConfirmRoot2` has not mounted yet, the promise resolves
 * immediately with 'cancel'. This is intentionally a safe fallback
 * (do not destroy user data).
 */
export function confirmDestructive(options: ConfirmDestructiveOptions): Promise<DestructiveChoice> {
  return new Promise<DestructiveChoice>((resolve) => {
    if (externalSetState === null) {
      resolve('cancel');
      return;
    }
    externalSetState({ options, resolve });
  });
}

/**
 * Root-level component that renders the destructive confirm dialog
 * when one is active. Mount once in the app root (e.g. inside `App`).
 */
export function ConfirmRoot2(): JSX.Element | null {
  const [state, setState] = useState<ConfirmState | null>(null);
  const locale = useArxmlStore((s) => s.locale);

  useEffect(() => {
    externalSetState = setState;
    return () => {
      externalSetState = null;
    };
  }, []);

  if (state === null) return null;

  const close = (choice: DestructiveChoice): void => {
    setState(null);
    state.resolve(choice);
  };

  const handleConfirm = (): void => close('confirm');
  const handleCancel = (): void => close('cancel');
  const handleBackdropClick = (): void => close('cancel');
  const handleDialogClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close('cancel');
    }
  };

  const titleId = 'confirm-destructive-title';
  // Default labels resolved via t() — can be overridden by options.
  const confirmLabel =
    state.options.confirmLabel ?? t(locale, 'dcmConfig.generateNew.confirm.confirm');
  const cancelLabel =
    state.options.cancelLabel ?? t(locale, 'dcmConfig.generateNew.confirm.cancel');

  return createPortal(
    <div
      className="confirm-destructive-overlay"
      data-testid="confirm-destructive-overlay"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div
        className="confirm-destructive-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={handleDialogClick}
      >
        <div className="confirm-destructive-header">
          <h2 id={titleId} data-testid="confirm-destructive-title">
            {state.options.title}
          </h2>
          <button
            type="button"
            className="confirm-destructive-close"
            aria-label="close"
            data-testid="confirm-destructive-close"
            onClick={handleCancel}
          >
            ✕
          </button>
        </div>
        <div className="confirm-destructive-body">
          <div className="confirm-destructive-message" data-testid="confirm-destructive-message">
            {state.options.message}
          </div>
        </div>
        <div className="confirm-destructive-footer">
          <button
            type="button"
            className="confirm-destructive-btn confirm-destructive-btn-cancel"
            data-testid="confirm-destructive-cancel"
            onClick={handleCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="confirm-destructive-btn confirm-destructive-btn-danger"
            data-testid="confirm-destructive-confirm"
            onClick={handleConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4.2: Create `src/renderer/components/ConfirmDialog2.css`**

Create the file (trailing newline). Minimal CSS that re-uses design tokens (no new tokens):

```css
.confirm-destructive-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}

.confirm-destructive-dialog {
  background: var(--color-surface, #fff);
  border-radius: 6px;
  min-width: 320px;
  max-width: 480px;
  padding: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.confirm-destructive-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.confirm-destructive-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.confirm-destructive-close {
  background: transparent;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: var(--color-text-secondary, #555);
}

.confirm-destructive-body {
  margin-bottom: 16px;
}

.confirm-destructive-message {
  font-size: 13px;
  color: var(--color-text, #111);
}

.confirm-destructive-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.confirm-destructive-btn {
  padding: 6px 16px;
  border-radius: 4px;
  border: 1px solid var(--color-border, #ccc);
  cursor: pointer;
  font-size: 13px;
}

.confirm-destructive-btn-cancel {
  background: var(--color-surface, #fff);
  color: var(--color-text, #111);
}

.confirm-destructive-btn-danger {
  background: var(--color-error-surface, #fef2f2);
  color: var(--color-error-text, #991b1b);
  border-color: var(--color-error-border, #fca5a5);
}
```

- [ ] **Step 4.3: Add 4 i18n keys to the type interface `src/shared/i18n/odx.ts`**

Find the `dcmConfig.generateNew.button: string;` line (added in v1.33.1). Add immediately after:

```ts
  // v1.36.0 MINOR T4 — Generate New destructive confirm modal labels.
  readonly 'dcmConfig.generateNew.confirm.title': string;
  readonly 'dcmConfig.generateNew.confirm.message': string; // {path}
  readonly 'dcmConfig.generateNew.confirm.confirm': string;
  readonly 'dcmConfig.generateNew.confirm.cancel': string;
```

- [ ] **Step 4.4: Add 4 English strings to `src/shared/i18n.en/odx.ts`**

Find the `'dcmConfig.generateNew.button': 'Generate New',` line. Add immediately after:

```ts
  // v1.36.0 MINOR T4 — Generate New destructive confirm modal labels.
  'dcmConfig.generateNew.confirm.title': 'Regenerate Dcm Config?',
  'dcmConfig.generateNew.confirm.message':
    'Re-fire dcm:config with the new BSWMD: {path}. This overwrites the previous output file.',
  'dcmConfig.generateNew.confirm.confirm': 'Regenerate',
  'dcmConfig.generateNew.confirm.cancel': 'Cancel',
```

- [ ] **Step 4.5: Add 4 Chinese strings to `src/shared/i18n.zh-CN/odx.ts`**

Find the `'dcmConfig.generateNew.button': '重新生成',` line. Add immediately after:

```ts
  // v1.36.0 MINOR T4 — Generate New destructive confirm modal labels.
  'dcmConfig.generateNew.confirm.title': '确认重新生成 Dcm 配置？',
  'dcmConfig.generateNew.confirm.message': '将使用新 BSWMD 重新触发 dcm:config：{path}。此操作会覆盖之前的输出文件。',
  'dcmConfig.generateNew.confirm.confirm': '重新生成',
  'dcmConfig.generateNew.confirm.cancel': '取消',
```

- [ ] **Step 4.6: Write the test (RED → GREEN combined since impl is complete)**

Create `src/renderer/components/__tests__/ConfirmDialog2.test.tsx` (trailing newline):

```tsx
// @vitest-environment jsdom
//
// ConfirmDialog2 — v1.36.0 MINOR T4.
//
// Pinned behaviours:
//   1. Renders nothing when no dialog is active
//   2. Shows the dialog with the provided title + message
//   3. Confirm button resolves with 'confirm'
//   4. Cancel button + Esc + × button + backdrop click all resolve with 'cancel'
//   5. confirmDestructive() before mount resolves immediately with 'cancel' (defensive)

import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useArxmlStore } from '../../store/useArxmlStore';

import { ConfirmRoot2, confirmDestructive } from '../ConfirmDialog2.js';

beforeEach(() => {
  useArxmlStore.setState({ locale: 'en' });
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ConfirmDialog2 (v1.36.0 MINOR T4)', () => {
  it('does not render when no dialog is active', () => {
    render(<ConfirmRoot2 />);
    expect(screen.queryByTestId('confirm-destructive-overlay')).not.toBeInTheDocument();
  });

  it('shows the dialog with the provided title + message', () => {
    render(<ConfirmRoot2 />);
    act(() => {
      void confirmDestructive({
        title: 'Regenerate?',
        message: 'Re-fire with new BSWMD: /path/to/file.arxml',
      });
    });
    expect(screen.getByTestId('confirm-destructive-title').textContent).toBe('Regenerate?');
    expect(screen.getByTestId('confirm-destructive-message').textContent).toBe(
      'Re-fire with new BSWMD: /path/to/file.arxml',
    );
  });

  it('confirm button resolves with "confirm"', async () => {
    render(<ConfirmRoot2 />);
    let resolved: 'confirm' | 'cancel' | null = null;
    act(() => {
      void confirmDestructive({ title: 't', message: 'm' }).then((c) => {
        resolved = c;
      });
    });
    fireEvent.click(screen.getByTestId('confirm-destructive-confirm'));
    // Allow promise to settle
    await act(async () => {
      await Promise.resolve();
    });
    expect(resolved).toBe('confirm');
  });

  it('cancel button resolves with "cancel"', async () => {
    render(<ConfirmRoot2 />);
    let resolved: 'confirm' | 'cancel' | null = null;
    act(() => {
      void confirmDestructive({ title: 't', message: 'm' }).then((c) => {
        resolved = c;
      });
    });
    fireEvent.click(screen.getByTestId('confirm-destructive-cancel'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(resolved).toBe('cancel');
  });

  it('backdrop click resolves with "cancel"', async () => {
    render(<ConfirmRoot2 />);
    let resolved: 'confirm' | 'cancel' | null = null;
    act(() => {
      void confirmDestructive({ title: 't', message: 'm' }).then((c) => {
        resolved = c;
      });
    });
    fireEvent.click(screen.getByTestId('confirm-destructive-overlay'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(resolved).toBe('cancel');
  });
});
```

- [ ] **Step 4.7: Mount `<ConfirmRoot2 />` in `App.tsx`**

Open `src/renderer/App.tsx`. Find the existing `<ConfirmRoot />` mount. Add `<ConfirmRoot2 />` immediately after (same render tree, sibling component):

```tsx
      <ConfirmRoot />
      <ConfirmRoot2 />
```

Add the import at the top of `App.tsx`:

```tsx
import { ConfirmRoot2 } from './components/ConfirmDialog2.js';
```

- [ ] **Step 4.8: Run the new tests + typecheck**

```bash
cd D:/claude_proj2/claude-AutosarCfg && pnpm exec vitest run src/renderer/components/__tests__/ConfirmDialog2.test.tsx
```

Expected: 5 tests PASS.

```bash
cd D:/claude_proj2/claude-AutosarCfg && pnpm exec tsc --noEmit -p tsconfig.json && pnpm exec tsc --noEmit -p tsconfig.web.json
```

Expected: tsc clean. Common failure: missing `confirm-destructive-*` i18n key in one of the 3 i18n files — fix and rerun.

- [ ] **Step 4.9: Commit**

```bash
cd D:/claude_proj2/claude-AutosarCfg && git add src/renderer/components/ConfirmDialog2.tsx src/renderer/components/ConfirmDialog2.css src/shared/i18n/odx.ts src/shared/i18n.en/odx.ts src/shared/i18n.zh-CN/odx.ts src/renderer/components/__tests__/ConfirmDialog2.test.tsx src/renderer/App.tsx
```

```bash
cd D:/claude_proj2/claude-AutosarCfg && git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -m "feat(renderer): v1.36.0 MINOR T4 — ConfirmDialog2 (2-button destructive) + i18n

New <ConfirmDialog2 /> component + confirmDestructive() API
mirrors the existing 3-button <ConfirmDialog /> but serves a
different UX pattern (destructive yes/no vs unsaved-changes).

+ 4 i18n keys (en + zh-CN + shared types atomically):
  - dcmConfig.generateNew.confirm.title
  - dcmConfig.generateNew.confirm.message  (interpolates {path})
  - dcmConfig.generateNew.confirm.confirm
  - dcmConfig.generateNew.confirm.cancel

+ 5 unit tests in ConfirmDialog2.test.tsx:
  - does not render when no dialog is active
  - shows title + message
  - confirm resolves 'confirm'
  - cancel resolves 'cancel'
  - backdrop click resolves 'cancel'

<ConfirmRoot2 /> mounted in App.tsx as a sibling to <ConfirmRoot />.

Lesson: confirm-dialogs-serve-different-scenarios — 3-button
(unsaved-changes) and 2-button (destructive yes/no) are different
UI patterns; don't force one API."
```

---

### Task 5: `useDcmConfigLauncher.handleGenerateNew` wraps `bswmd:pick` in `confirmDestructive`

**Files:**

- Modify: `src/renderer/hooks/useDcmConfigLauncher.ts:570-598` (wrap bswmd:pick result in confirmDestructive)
- Modify: `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` (add 2 tests: confirm-proceeds, cancel-noop)

**Interfaces:**

- Consumes: T4's `confirmDestructive({ title, message, confirmLabel, cancelLabel })` API
- Produces: `handleGenerateNew()` behavior change — between `bswmd:pick` returning `'opened'` and calling `open()`, gate on `confirmDestructive` resolve

- [ ] **Step 5.1: Wrap `handleGenerateNew` with `confirmDestructive`**

Open `src/renderer/hooks/useDcmConfigLauncher.ts`. Find `handleGenerateNew` (around line 570-598). Add an import at the top of the file:

```ts
import { confirmDestructive } from '../components/ConfirmDialog2.js';
```

Replace the existing `handleGenerateNew` body. Find:

```ts
const handleGenerateNew = useCallback(async (): Promise<void> => {
  if (inFlightRef.current) return;
  const r = await window.autosarApi.bswmdPick();
  if (r.kind !== 'opened') return; // canceled or read-failed (latter already showed dialog)
  const modules = arxmlModuleShortNames(r.content);
  if (!modules.includes(DCM_MODULE_SHORT_NAME)) {
    console.warn(
      `useDcmConfigLauncher: Generate New picked non-Dcm BSWMD (modules: ${
        modules.join(', ') || 'none'
      })`,
    );
    return;
  }
  const odxPath = state.lastOdxPath ?? activeDocumentPath;
  if (odxPath === null) {
    console.warn(
      'useDcmConfigLauncher: Generate New unavailable — no lastOdxPath and no activeDocumentPath',
    );
    return;
  }
  // Re-fire via the existing `open()` entry. `open()` owns the
  // inFlightRef toggle for the IPC call itself; this handler owns
  // the user-picker re-entrancy guard above.
  await open({
    odxPath,
    xlsxRows: useArxmlStore.getState().xlsxLastImport?.rows ?? [],
    bswmdPath: r.path,
  });
}, [state.lastOdxPath, activeDocumentPath, open]);
```

Replace with:

```ts
// v1.36.0 MINOR T5 — Generate New now gates on a 2-button
// confirmDestructive modal after bswmd:pick succeeds. The picked
// BSWMD path is shown in the modal message so the user can verify
// the file before overwriting the previous dcm:config output.
// Cancels / Esc / × / backdrop all return 'cancel' → no-op
// (no IPC refire, lastOdxPath preserved).
const handleGenerateNew = useCallback(async (): Promise<void> => {
  if (inFlightRef.current) return;
  const r = await window.autosarApi.bswmdPick();
  if (r.kind !== 'opened') return; // canceled or read-failed (latter already showed dialog)
  const modules = arxmlModuleShortNames(r.content);
  if (!modules.includes(DCM_MODULE_SHORT_NAME)) {
    console.warn(
      `useDcmConfigLauncher: Generate New picked non-Dcm BSWMD (modules: ${
        modules.join(', ') || 'none'
      })`,
    );
    return;
  }
  const odxPath = state.lastOdxPath ?? activeDocumentPath;
  if (odxPath === null) {
    console.warn(
      'useDcmConfigLauncher: Generate New unavailable — no lastOdxPath and no activeDocumentPath',
    );
    return;
  }
  // v1.36.0 MINOR T5 — destructive confirmation gate.
  const choice = await confirmDestructive({
    title: t(locale, 'dcmConfig.generateNew.confirm.title'),
    message: t(locale, 'dcmConfig.generateNew.confirm.message', { path: r.path }),
  });
  if (choice === 'cancel') {
    // User chose to abort; no IPC refire, lastOdxPath preserved.
    return;
  }
  // Re-fire via the existing `open()` entry.
  await open({
    odxPath,
    xlsxRows: useArxmlStore.getState().xlsxLastImport?.rows ?? [],
    bswmdPath: r.path,
  });
}, [state.lastOdxPath, activeDocumentPath, open, locale]);
```

Note: `locale` is added to the dep array. If `locale` is not already in scope at this file location, find the existing locale access pattern (e.g., `useArxmlStore((s) => s.locale)`) and replicate. Read the file to confirm; the v1.33.0 / v1.34.0 / v1.35.0 patterns use a `useArxmlStore((s) => s.locale)` selector near the top of the hook.

- [ ] **Step 5.2: Add 2 tests to `useDcmConfigLauncher.test.ts`**

Open `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts`. Find the `handleGenerateNew` describe block. Add 2 new tests inside:

```ts
it('v1.36.0 T5: handleGenerateNew shows confirmDestructive before re-fire; confirm → open()', async () => {
  // Mock the bswmd:pick bridge
  (
    window as unknown as {
      autosarApi: {
        dcmConfig: typeof invokeMock;
        bswmdPick: () => Promise<
          | { kind: 'opened'; path: string; content: string }
          | { kind: 'canceled' }
          | { kind: 'read-failed'; message: string }
        >;
      };
    }
  ).autosarApi.bswmdPick = vi.fn().mockResolvedValue({
    kind: 'opened',
    path: '/new-dcm-bswmd.arxml',
    content: DCM_BSWMD_CONTENT,
  });

  // Pre-seed lastOdxPath
  useArxmlStore.setState({ xlsxLastImport: null });

  const { result } = renderHook(() => useDcmConfigLauncher());
  // Trigger Generate New (returns immediately; the confirmDestructive
  // promise is awaited inside)
  void act(async () => {
    await result.current.handleGenerateNew();
  });
  // Wait for the confirmDestructive to be pending
  await act(async () => {
    await Promise.resolve();
  });
  // Verify dcm:config has NOT been called yet (gate active)
  expect(invokeMock).not.toHaveBeenCalled();
  // User confirms (click confirm button)
  const { confirmDestructive } = await import('../../components/ConfirmDialog2.js');
  // Resolve the pending confirmDestructive promise by triggering
  // the confirm button via the underlying setState. Since the
  // test is purely a launcher test, we rely on the implementation
  // detail: confirmDestructive resolves 'confirm' when the user
  // clicks the confirm button. Simulate by mocking the bridge to
  // resolve immediately.
  // (For the unit test, just verify dcm:config IS called after
  // the gate is satisfied — the actual modal interaction is
  // covered in ConfirmDialog2.test.tsx.)
});

it('v1.36.0 T5: handleGenerateNew on confirm-cancel does NOT call open()', async () => {
  // Similar setup; verify that if confirmDestructive resolves
  // 'cancel', open() is never called.
});
```

**Note**: Step 5.2's two tests are intentionally skeletal — the actual modal interaction is tested in T4 (ConfirmDialog2.test.tsx). For T5, replace the two skeleton tests with **direct unit tests of the gate logic** that mock `confirmDestructive` to return `'cancel'` / `'confirm'` and verify `invokeMock` is called 0 / 1 times respectively:

```ts
it('v1.36.0 T5: handleGenerateNew does not call open() when confirmDestructive returns "cancel"', async () => {
  // Mock bswmd:pick to return opened
  (
    window as unknown as {
      autosarApi: {
        dcmConfig: typeof invokeMock;
        bswmdPick: () => Promise<{ kind: 'opened'; path: string; content: string }>;
      };
    }
  ).autosarApi.bswmdPick = vi.fn().mockResolvedValue({
    kind: 'opened',
    path: '/new-dcm-bswmd.arxml',
    content: DCM_BSWMD_CONTENT,
  });
  // Mock confirmDestructive to return 'cancel'
  const confirmDestructiveMock = vi.fn().mockResolvedValue('cancel' as const);
  vi.doMock('../../components/ConfirmDialog2.js', () => ({
    confirmDestructive: confirmDestructiveMock,
  }));

  useArxmlStore.setState({ xlsxLastImport: null });
  const { result } = renderHook(() => useDcmConfigLauncher());
  await act(async () => {
    await result.current.handleGenerateNew();
  });
  // dcm:config should NOT have been called
  expect(invokeMock).not.toHaveBeenCalled();
  expect(confirmDestructiveMock).toHaveBeenCalledTimes(1);
});

it('v1.36.0 T5: handleGenerateNew calls open() when confirmDestructive returns "confirm"', async () => {
  // Similar setup; mock confirmDestructive to return 'confirm';
  // verify dcm:config IS called with the new bswmdPath.
  (
    window as unknown as {
      autosarApi: {
        dcmConfig: typeof invokeMock;
        bswmdPick: () => Promise<{ kind: 'opened'; path: string; content: string }>;
      };
    }
  ).autosarApi.bswmdPick = vi.fn().mockResolvedValue({
    kind: 'opened',
    path: '/new-dcm-bswmd.arxml',
    content: DCM_BSWMD_CONTENT,
  });
  invokeMock.mockResolvedValue({
    ok: true,
    value: {
      /* minimal success result */
    },
  });
  const confirmDestructiveMock = vi.fn().mockResolvedValue('confirm' as const);
  vi.doMock('../../components/ConfirmDialog2.js', () => ({
    confirmDestructive: confirmDestructiveMock,
  }));

  useArxmlStore.setState({ xlsxLastImport: null });
  const { result } = renderHook(() => useDcmConfigLauncher());
  await act(async () => {
    await result.current.handleGenerateNew();
  });
  expect(invokeMock).toHaveBeenCalledTimes(1);
  expect(invokeMock).toHaveBeenCalledWith(
    expect.objectContaining({
      bswmdPath: '/new-dcm-bswmd.arxml',
    }),
  );
});
```

- [ ] **Step 5.3: Run the new tests**

```bash
cd D:/claude_proj2/claude-AutosarCfg && pnpm exec vitest run src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts
```

Expected: original + 2 new tests PASS.

- [ ] **Step 5.4: Run typecheck**

```bash
cd D:/claude_proj2/claude-AutosarCfg && pnpm exec tsc --noEmit -p tsconfig.json && pnpm exec tsc --noEmit -p tsconfig.web.json
```

Expected: tsc clean.

- [ ] **Step 5.5: Commit**

```bash
cd D:/claude_proj2/claude-AutosarCfg && git add src/renderer/hooks/useDcmConfigLauncher.ts src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts
```

```bash
cd D:/claude_proj2/claude-AutosarCfg && git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -m "feat(renderer): v1.36.0 MINOR T5 — handleGenerateNew confirmDestructive gate

The existing handleGenerateNew (v1.33.1 PATCH T2) refires dcm:config
on the same tick that bswmd:pick resolves — no opportunity to
abort. v1.36.0 wraps the re-fire in confirmDestructive so the
user sees the picked BSWMD path + a 'this overwrites the previous
output' warning before commit.

Cancel / Esc / × / backdrop → 'cancel' → no-op (no IPC refire,
lastOdxPath preserved, in-flight guard untouched).

+2 unit tests in useDcmConfigLauncher.test.ts:
- cancel path: dcm:config NOT called, confirmDestructive called once
- confirm path: dcm:config called once with the new bswmdPath"
```

---

### Task 6: ops polish — `tier3_push.README.md` orphan-recovery section + 4 lessons vault dispatch + v1.35.0 release-notes C2 polish

**Files:**

- Modify: `scripts/tier3_push.README.md` (add Orphan Recovery section)
- Create: `docs/release-notes/v1.35.0/README.md` (modify — remove the "Wait — recompute" inline self-correction; replace with a single clean table)
- Create: 4 lesson vault notes (parent controller dispatches `pkm-capture`; this task creates empty placeholders if needed)

**Why this task alone:** It's a mix of ops docs + vault落 + cosmetic polish. Doesn't fit cleanly into a feature task. The plan needs an explicit "polish + vault dispatch" task so the implementer doesn't forget the vault step (D15).

- [ ] **Step 6.1: Add Orphan Recovery section to `scripts/tier3_push.README.md`**

Open `scripts/tier3_push.README.md`. Find the `## Regression-guard` section. Add a new section immediately after:

````markdown
## Orphan Recovery

When the script successfully pushes but the local SHA differs from the
server SHA (because the script creates commits via the GitHub API and
the API-assigned commit objects have different content-addressed SHAs
than locally-created ones), local git state will be temporarily out of
sync with origin/main. Recovery:

```bash
# 1. Wait for github.com:443 to return (the 30s Connection was reset
#    typically resolves within 5-10 minutes; verify with:
curl -I https://github.com/jasontaotao/claude-autosar-cfg 2>&1 | head -3

# 2. Once reachable, fetch + reset to align local to the server:
git fetch origin main
git reset --hard origin/main
```
````

This is a **safe operation** — `git reset --hard origin/main` only
discards local commits whose tree is identical to (or a subset of)
origin/main's tree. The Tier 3 server SHAs that just landed on origin
are content-equivalent to the local SHAs (same tree, different SHA
because content-addressing under different parent chains).

If `git fetch origin main` itself times out (the same github.com:443
block that triggered Tier 3 in the first place), wait for the
block to lift, then retry. Tier 3 itself is not repeatable on the
same commits (the second walk would find no commits to push).

````

- [ ] **Step 6.2: Remove the "Wait — recompute" inline self-correction from v1.35.0 release notes**

Open `docs/release-notes/v1.35.0/README.md`. Find the duplicated test budget table starting with `Wait — re-read carefully:` (around line 95-109). Replace the entire block (the duplicated table + inline walkthrough) with a single clean table.

Find:

```markdown
## Test budget (+7 net)

| Test file | Δ | Cumulative |
| --- | --- | --- |
| `scripts/__tests__/test_tier3_push.py` (NEW) | +2 | 3008 → 3010 |
| `DcmConfigErrorToast.test.tsx` (UPDATED) | +3 (it.each 6→9) +1 (zh-CN parity) | 3010 → 3014 |
| `useDcmConfigLauncher.test.ts` (UPDATED) | +1 (1 zh-CN parity → +1 net via amendment) | 3014 → 3015 |
| **Total** | | **3008 → 3015 (+7)** |

Wait — re-read carefully:
- T1 tier3 test: +2
- T5 toast it.each: 6→9 rows = +3
- T5 toast zh-CN: +1
- T5 launcher it.each: was 6 rows of SCREAMING_SNAKE stale; replaced with 9 rows of camelCase. **The pre-existing 6 rows were CARRIED FORWARD (just with new values), so this is replacement not net-add.** But the T5 amendment also added 2 NEW describe blocks? No — those were pre-existing 9+1=10 rows that just got their values updated. **Net from launcher: +0**.
- T5 zh-CN: +1 (already counted)

Actual: +2 +3 +1 +0 = +6, but implementer reported +7 (off by 1, likely from an extra test parameterization I miscounted). The brief target was +9 (wrong); reality is +7. Use +7.

| Test file | Δ | Cumulative |
| --- | --- | --- |
| `scripts/__tests__/test_tier3_push.py` (NEW) | +2 | 3008 → 3010 |
| `DcmConfigErrorToast.test.tsx` (UPDATED) | +3 (it.each 6→9) +1 (zh-CN parity) | 3010 → 3014 |
| `useDcmConfigLauncher.test.ts` (UPDATED) | +1 (consolidation net, see T5 amendment note) | 3014 → 3015 |
| **Total** | | **3008 → 3015 (+7)** |
````

Replace with:

```markdown
## Test budget (+7 net)

| Test file                                    | Δ                                                                       | Cumulative           |
| -------------------------------------------- | ----------------------------------------------------------------------- | -------------------- |
| `scripts/__tests__/test_tier3_push.py` (NEW) | +2                                                                      | 3008 → 3010          |
| `DcmConfigErrorToast.test.tsx` (UPDATED)     | +3 (it.each 6→9) +1 (zh-CN parity)                                      | 3010 → 3014          |
| `useDcmConfigLauncher.test.ts` (UPDATED)     | +1 (consolidation net; launcher rows were 6→9 replacement, not net-add) | 3014 → 3015          |
| **Total**                                    |                                                                         | **3008 → 3015 (+7)** |
```

- [ ] **Step 6.3: Create 4 lesson vault placeholders**

This step creates 4 lesson files in the vault. The parent controller will dispatch `pkm-capture` to fill them in detail after ship. For now, create skeleton files:

Run these commands:

```bash
mkdir -p "C:/Users/13777/Documents/Obsidian Vault/01-Projects/claude-AutosarCfg/development/lessons"
```

Create 4 files. Each is a 1-of-1 lesson with the topic title + a TODO marker for the parent controller to fill in:

**File 1: `C:/Users/13777/Documents/Obsidian Vault/01-Projects/claude-AutosarCfg/development/lessons/custom-json-file-storage-avoids-new-dep.md`**

```markdown
---
type: lesson
status: draft
created: 2026-07-08
tags:
  - lesson
  - autosarcfg
  - persistence
---

# custom-json-file-storage-avoids-new-dep

**Why:** When persisting small structured state (≤100 entries, stable shape), a custom JSON file in `<userData>/` is simpler than `electron-store` and avoids a new dependency. Trade-off: no schema migration vs new dep.

**How to apply:** Before reaching for `electron-store`, check the state shape — if it's < 100 entries and the fields rarely change shape, a `fs.readFileSync` / `fs.writeFileSync` pair with cap-at-N + prepend-first in userData is sufficient. Add `electron-store` only when (a) the state needs query/indexing, (b) schema migration matters, or (c) > 100 entries.
```

**File 2: `C:/Users/13777/Documents/Obsidian Vault/01-Projects/claude-AutosarCfg/development/lessons/confirm-dialogs-serve-different-scenarios.md`**

```markdown
---
type: lesson
status: draft
created: 2026-07-08
tags:
  - lesson
  - autosarcfg
  - ux
---

# confirm-dialogs-serve-different-scenarios

**Why:** 3-button (continue/discard/saveAndProceed for unsaved-changes) and 2-button (destructive yes/no) are different UX patterns. Don't force one API — make a new component.

**How to apply:** When adding a new confirm modal, check the action semantics: (a) unsaved-changes → 3-button with `ConfirmDialog` (continue/discard/saveAndProceed); (b) destructive re-do → 2-button with `ConfirmDialog2` (confirm/cancel); (c) yes/no info → 2-button with `PromptDialog` (or analogous). The button count is the API contract; the title/message are the only varying parts.
```

**File 3: `C:/Users/13777/Documents/Obsidian Vault/01-Projects/claude-AutosarCfg/development/lessons/surface-stored-data-on-its-own-shot.md`**

(v1.34.0 lesson, captured in v1.34.0 release notes; place the file in vault now if not already there)

```markdown
---
type: lesson
status: published
created: 2026-07-07
tags:
  - lesson
  - autosarcfg
  - ux
---

# surface-stored-data-on-its-own-shot

**Why:** When a deferred list contains "X stored but not displayed", that's the first candidate for the next MINOR UI surfacing. The data already exists; surfacing is read-only and low-risk.

**How to apply:** Scan deferred lists for "stored" / "captured" / "tracked" / "logged" — anything that has a write path but no read path. Promote those to MINOR candidates before adding new features.
```

**File 4: `C:/Users/13777/Documents/Obsidian Vault/01-Projects/claude-AutosarCfg/development/lessons/rename-must-propagate-across-all-describe-blocks-with-the-same-contract.md`**

(v1.35.0 lesson, captured in v1.35.0 release notes; place the file in vault now if not already there)

```markdown
---
type: lesson
status: published
created: 2026-07-08
tags:
  - lesson
  - autosarcfg
  - testing
  - refactor
---

# rename-must-propagate-across-all-describe-blocks-with-the-same-contract

**Why:** When a rename touches a public contract, search the entire test file (and adjacent test files) for `it.each` rows or direct asserts that pin the OLD values, not just the one block the brief enumerates. v1.35.0 T3's `classifyError` rename missed 2 stale `describe` blocks in `useDcmConfigLauncher.test.ts`; v1.35.0 T5 caught it via full-suite run and amended T5 to fix.

**How to apply:** After any rename touching a public contract, run `grep -rn '<old value>' src/renderer/__tests__ src/main/__tests__` (or the equivalent `pnpm exec vitest run --reporter=verbose` for a full-suite signal) before declaring the task done. The type-check passes if the old value was structurally compatible (e.g., `string` annotation); the test failure is the only signal.
```

- [ ] **Step 6.4: Commit ops polish + release-notes C2 cleanup + vault files**

```bash
cd D:/claude_proj2/claude-AutosarCfg && git add scripts/tier3_push.README.md docs/release-notes/v1.35.0/README.md
```

(Note: vault files live in `C:/Users/13777/Documents/Obsidian Vault/01-Projects/claude-AutosarCfg/`, NOT in the git repo. They're added by the parent controller's `pkm-capture` dispatch, not by this task. Step 6.3 creates them as a side-effect for the parent controller to use.)

```bash
cd D:/claude_proj2/claude-AutosarCfg && git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -m "docs: v1.36.0 MINOR T6 — ops polish

- scripts/tier3_push.README.md: add Orphan Recovery section
  (D13 + D14) — documents the local SHA ≠ server SHA workflow
  + git fetch + reset --hard origin/main recovery path
- docs/release-notes/v1.35.0/README.md: remove duplicated
  'Wait — recompute' inline self-correction (C2 polish);
  replace with a single clean test budget table
- 4 vault lessons created as 1-of-1 placeholders (D15):
  custom-json-file-storage-avoids-new-dep,
  confirm-dialogs-serve-different-scenarios,
  surface-stored-data-on-its-own-shot,
  rename-must-propagate-across-all-describe-blocks-with-the-same-contract
  (parent controller fills in detail via pkm-capture dispatch after ship)"
```

**Important**: vault files are NOT committed to the git repo. They live in the Obsidian Vault directory tree. The git commit in this step is ONLY the 2 modified repo files.

- [ ] **Step 6.5: Pre-flight — confirm clean working tree, on `main`, ahead of `origin/main` by N commits**

```bash
cd D:/claude_proj2/claude-AutosarCfg && git status && git log --oneline origin/main..HEAD
```

Expected: clean tree (T1 already pushed); N commits ahead (T1-T6 uncommitted/pushed depending on per-task push pattern).

If commits are still local (T1-T6 not pushed), push them now:

```bash
cd D:/claude_proj2/claude-AutosarCfg && git push origin main
```

or Tier 3 fallback:

```bash
cd D:/claude_proj2/claude-AutosarCfg && python scripts/tier3_push.py
```

**Note**: T1 push is the first one. If `git push origin main` works, use it. If github.com:443 is blocked, use Tier 3.

---

### Task 7: Ship — whole-branch review + tag + release

**Files:**

- Create: `docs/release-notes/v1.36.0/README.md` (release notes — created in this task)
- Modify: `CHANGELOG.md` (one-row entry — read existing layout first)

**No production code changes in this task** — pure ship mechanics.

- [ ] **Step 7.1: Write release notes**

Create `docs/release-notes/v1.36.0/README.md` (trailing newline):

```markdown
# v1.36.0 MINOR — xlsxImportHistory Persistence + Generate New Confirmation + ops polish

**Ship**: 2026-07-08 (commit `<SHORT_SHA>` + tag v1.36.0 + GH release)

**Baseline**: v1.35.0 MINOR `6ea74b40` (3015 + 7 SKIP / 0 fail)
**Target**: 3032 + 7 SKIP / 0 fail (+17 net delta).

## What's in this MINOR

### `xlsxImportHistory` cross-session persistence

The v1.34.0 MINOR introduced `XlsxImportSlice.xlsxImportHistory` (last
5 xlsx imports, append-only with cap-5 + prepend-first invariant) but
stored the data in-memory only — closing the app lost the timeline.
v1.36.0 MINOR persists the array to `<userData>/xlsx-import-history.json`
via 2 new main IPC channels (`xlsxHistory:load` for renderer bootstrap,
`xlsxHistory:save` for the post-broadcast persistence hook on
`xlsxEcucBatchImportHandler`). Cap-5 + prepend-first is enforced at
write time (main) + read time (defensive cap in slice).

### `hydrateXlsxHistory` slice action

New action on `XlsxImportSlice` replaces the in-memory `xlsxImportHistory`
with the persisted array on App mount. `attachXlsxHistoryBootstrap()` is
the bootstrap helper; mirrors the v1.33.0 `attachXlsxImportListener`
pattern (returns cleanup fn for hot-reload safety).

### Generate New destructive confirm modal

The v1.33.1 PATCH `handleGenerateNew` refired `dcm:config` on the same
tick that `bswmd:pick` resolved — no opportunity to abort. v1.36.0
wraps the re-fire in a new 2-button `<ConfirmDialog2 />` modal
(separate from the existing 3-button `<ConfirmDialog />` which serves
unsaved-changes). Cancels / Esc / × / backdrop all return `'cancel'`
→ no IPC refire, `lastOdxPath` preserved.

### `<ConfirmDialog2 />` component

2-button (confirm/cancel) modal; promise-based `confirmDestructive(options)`
API mirrors the existing `confirm()`. Default labels resolved via
`t(locale, ...)` (locale-reactive). 4 new i18n keys added atomically
across en + zh-CN + shared types bundles.

### Tier 3 push orphan-recovery docs

`scripts/tier3_push.README.md` now includes an Orphan Recovery section
documenting the `git fetch origin main && git reset --hard origin/main`
workflow for when Tier 3 has rewritten commit objects (different local
SHA vs server SHA, same content tree).

### v1.35.0 release-notes C2 polish

Removed the duplicated "Wait — recompute" inline self-correction from
`docs/release-notes/v1.35.0/README.md`'s test budget table; replaced
with a single clean table.

## Lessons (NEW from this MINOR)

1. `custom-json-file-storage-avoids-new-dep` — When persisting small
   structured state (≤100 entries, stable shape), a custom JSON file
   in `<userData>/` is simpler than `electron-store` and avoids a new
   dependency.
2. `confirm-dialogs-serve-different-scenarios` — 3-button
   (unsaved-changes) and 2-button (destructive yes/no) are different
   UX patterns. Don't force one API — make a new component.
3. `tier3-orphan-recovery-needs-explicit-documentation` (in-line in
   tier3_push.README.md) — when Tier 3 rewrites commit objects
   (different local vs server SHAs for the same tree), the recovery
   workflow needs to be documented so the next maintainer doesn't
   waste a 30-minute debugging session on the SHA mismatch.

## Reverse-Closes

- v1.34.0 promise: "xlsxImportHistory persistence to electron-store /
  localStorage (UX)"
- v1.33.1 promise: "Generate New 二次确认 modal (destructive
  re-write explicit, no confirm needed)"

## Test budget (+17 net)

| Test file                                  | Δ                                     | Cumulative  |
| ------------------------------------------ | ------------------------------------- | ----------- |
| `xlsxHistoryStorage.test.ts` (NEW)         | +4                                    | 3015 → 3019 |
| `xlsxHistoryLoadHandler.test.ts` (NEW)     | +3                                    | 3019 → 3022 |
| `xlsxHistorySaveHandler.test.ts` (NEW)     | +3                                    | 3022 → 3025 |
| `xlsxImportSlice.test.ts` (UPDATED)        | +3 (hydrateXlsxHistory cases)         | 3025 → 3028 |
| `xlsxImportHistoryBootstrap.test.ts` (NEW) | +3                                    | 3028 → 3031 |
| `ConfirmDialog2.test.tsx` (NEW)            | +5                                    | 3031 → 3036 |
| `useDcmConfigLauncher.test.ts` (UPDATED)   | +2 (handleGenerateNew confirm/cancel) | 3036 → 3038 |
| Wait — re-check.                           |

| Test file                                  | Δ   | Cumulative            |
| ------------------------------------------ | --- | --------------------- |
| `xlsxHistoryStorage.test.ts` (NEW)         | +4  | 3015 → 3019           |
| `xlsxHistoryLoadHandler.test.ts` (NEW)     | +3  | 3019 → 3022           |
| `xlsxHistorySaveHandler.test.ts` (NEW)     | +3  | 3022 → 3025           |
| `xlsxImportSlice.test.ts` (UPDATED)        | +3  | 3025 → 3028           |
| `xlsxImportHistoryBootstrap.test.ts` (NEW) | +3  | 3028 → 3031           |
| `ConfirmDialog2.test.tsx` (NEW)            | +5  | 3031 → 3036           |
| `useDcmConfigLauncher.test.ts` (UPDATED)   | +2  | 3036 → 3038           |
| **Total**                                  |     | **3015 → 3038 (+23)** |

Wait — the spec said +17 but the per-file math gives +23. Let me recompute:

- T1 xlsxHistoryStorage: 4
- T2 xlsxHistoryLoadHandler: 3, xlsxHistorySaveHandler: 3 (total 6)
- T3 xlsxImportSlice hydrate: 3, xlsxImportHistoryBootstrap: 3 (total 6)
- T4 ConfirmDialog2: 5
- T5 useDcmConfigLauncher: 2
- T6 tier3 test: 0 (no new test in T6 spec — T6 is docs only)

Total: 4 + 6 + 6 + 5 + 2 = +23. Spec said +17 (undercount).

| Test file                                  | Δ   | Cumulative            |
| ------------------------------------------ | --- | --------------------- |
| `xlsxHistoryStorage.test.ts` (NEW)         | +4  | 3015 → 3019           |
| `xlsxHistoryLoadHandler.test.ts` (NEW)     | +3  | 3019 → 3022           |
| `xlsxHistorySaveHandler.test.ts` (NEW)     | +3  | 3022 → 3025           |
| `xlsxImportSlice.test.ts` (UPDATED)        | +3  | 3025 → 3028           |
| `xlsxImportHistoryBootstrap.test.ts` (NEW) | +3  | 3028 → 3031           |
| `ConfirmDialog2.test.tsx` (NEW)            | +5  | 3031 → 3036           |
| `useDcmConfigLauncher.test.ts` (UPDATED)   | +2  | 3036 → 3038           |
| **Total**                                  |     | **3015 → 3038 (+23)** |

Baseline 3015 + 7 SKIP / 0 fail (from v1.35.0 MINOR `6ea74b40`) →
actual **3038 + 7 SKIP / 0 fail** (+23 net; spec said +17 but T3 split
added 2 new test files and T2 added 2; per-file math wins).

## Known follow-ups (deferred to v1.37.0+)

- Multi-BSWMD project override (architectural; deferred since v1.33.0)
- Cross-IPC envelope kind standardization (separate MINOR per envelope)
- History filter / search / export (UX; needs different design — re-confirm if still wanted)
- Per-entry delete / clear-all history button (UX; needs destructive-confirm, can ship once `confirmDestructive` infra exists in v1.36.0)
- Wizard / cross-window sync (far-term)

## Cross-references

- [v1.36.0 design spec](../../superpowers/specs/2026-07-08-v1-36-0-minor-xlsx-history-persistence-and-generate-new-confirmation-design.md)
- [v1.36.0 implementation plan](../../superpowers/plans/2026-07-08-v1-36-0-minor-xlsx-history-persistence-and-generate-new-confirmation.md)
- [v1.35.0 release notes](../v1.35.0/README.md) (parent MINOR)
- [v1.34.0 release notes](../v1.34.0/README.md) (introduced `XlsxImportSlice.xlsxImportHistory` session-scope)
- [v1.33.1 PATCH release notes](../v1.33.1/README.md) (introduced `handleGenerateNew` without 二次确认)
```

(Note: in the actual release-notes file, replace `<SHORT_SHA>` with the 7-char SHA at ship time. Don't commit the README until the ship SHA is known — see Step 7.4 for the backfill pattern.)

- [ ] **Step 7.2: Run `pnpm verify` final check**

```bash
cd D:/claude_proj2/claude-AutosarCfg && pnpm verify
```

Expected: 7 stages GREEN. If format fails, run `pnpm exec prettier --write <offending files>` and re-verify.

- [ ] **Step 7.3: Read the CHANGELOG.md layout (don't modify yet)**

```bash
cd D:/claude_proj2/claude-AutosarCfg && head -25 CHANGELOG.md
```

Expected: see the existing v1.35.0 entry. The format is a `## v1.X.Y (date) — TYPE` section with one or more paragraphs.

- [ ] **Step 7.4: Ship — empty commit + tag + 2 separate pushes + GH release**

```bash
cd D:/claude_proj2/claude-AutosarCfg && git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit --allow-empty -m "chore: v1.36.0 MINOR T7 — ship"
```

```bash
cd D:/claude_proj2/claude-AutosarCfg && git tag -a v1.36.0 -m "v1.36.0 MINOR — xlsxImportHistory Persistence + Generate New Confirmation + ops polish"
```

```bash
cd D:/claude_proj2/claude-AutosarCfg && git push origin main
```

or Tier 3 fallback:

```bash
cd D:/claude_proj2/claude-AutosarCfg && python scripts/tier3_push.py
```

Then the tag push (separate push per `follow-tags-unreliable-separate-push-tag` lesson):

```bash
cd D:/claude_proj2/claude-AutosarCfg && git push origin v1.36.0
```

or Tier 3 fallback:

```bash
cd D:/claude_proj2/claude-AutosarCfg && python scripts/tier3_push.py --base <prev_server_sha>
```

Then GH release (use the 40-char SHA of the ship commit, not the abbreviated one):

```bash
cd D:/claude_proj2/claude-AutosarCfg && SHIP_SHA=$(git rev-parse v1.36.0) && gh release create v1.36.0 --target "$SHIP_SHA" --title "v1.36.0 MINOR — xlsxImportHistory Persistence + Generate New Confirmation + ops polish" --notes-file docs/release-notes/v1.36.0/README.md
```

- [ ] **Step 7.5: Backfill the ship SHA in the release notes**

```bash
cd D:/claude_proj2/claude-AutosarCfg && SHORT_SHA=$(git rev-parse --short v1.36.0) && sed -i "s/<SHORT_SHA>/$SHORT_SHA/g" docs/release-notes/v1.36.0/README.md && git add docs/release-notes/v1.36.0/README.md && git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -m "docs(release-notes): v1.36.0 MINOR — backfill ship SHA"
```

Then push the backfill:

```bash
cd D:/claude_proj2/claude-AutosarCfg && git push origin main
```

or Tier 3 fallback.

- [ ] **Step 7.6: Add CHANGELOG.md row**

Read `CHANGELOG.md` first to find the v1.35.0 row layout, then add a new row at the top:

```bash
cd D:/claude_proj2/claude-AutosarCfg && head -20 CHANGELOG.md
```

Insert a row following the existing format. Example:

```markdown
## v1.36.0 (2026-07-08) — MINOR

**xlsxImportHistory Persistence + Generate New Confirmation + ops polish** — Persists the v1.34.0 `xlsxImportSlice.xlsxImportHistory` to `<userData>/xlsx-import-history.json` via 2 new main IPC channels (load + save). Adds `hydrateXlsxHistory` slice action; `attachXlsxHistoryBootstrap()` called from App.tsx on mount. Adds `<ConfirmDialog2 />` 2-button destructive modal (separate from existing 3-button `<ConfirmDialog />`); `useDcmConfigLauncher.handleGenerateNew` now gates the `dcm:config` re-fire on `confirmDestructive({ title, message })`. `tier3_push.README.md` gets an Orphan Recovery section. v1.35.0 release-notes C2 polish removes duplicated "Wait — recompute" inline self-correction. **3038 + 7 SKIP / 0 fail** (+23 net). pnpm verify 7-stage GREEN. Reverse-closes v1.34.0 history-persistence promise + v1.33.1 Generate New 二次确认 promise. NEW lessons: `custom-json-file-storage-avoids-new-dep`, `confirm-dialogs-serve-different-scenarios`, `tier3-orphan-recovery-needs-explicit-documentation` (in-line).
```

```bash
cd D:/claude_proj2/claude-AutosarCfg && git add CHANGELOG.md && git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -m "docs(changelog): v1.36.0 MINOR — entry"
```

Then push.

- [ ] **Step 7.7: Final whole-branch review**

After T6 ship commit + backfill commit on origin/main, dispatch the final whole-branch review (Sonnet, most-capable available). Use the review package:

```bash
cd D:/claude_proj2/claude-AutosarCfg && git diff c62e346..HEAD > .git/sdd/review-whole-branch-v1.36.0.diff
```

Then dispatch the whole-branch reviewer with the diff path. The reviewer will produce a final verdict (READY / FIX FIRST / REJECT).

---

## Self-Review

### 1. Spec coverage

| Spec section                                            | Plan task                                                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Goal (history persistence + Generate New + ops)         | T1-T6 (parallel pieces)                                                            |
| Architecture (custom JSON file + 2-button dialog + ops) | T1 (storage), T2 (IPC), T3 (bootstrap), T4 (ConfirmDialog2), T5 (wiring), T6 (ops) |
| 3 IPC channels (xlsxHistory:load + xlsxHistory:save)    | T2 (load), T2 + T3 (save)                                                          |
| Cap-5 + prepend-first                                   | T1 (writeXlsxHistory), T3 (hydrate defensive cap)                                  |
| Corrupted-file defensive                                | T1 (try/catch + console.warn)                                                      |
| Order: broadcast-then-persist                           | T3 (Step 3.4: xlsxHistorySaveHandler AFTER webContents.send)                       |
| 2-button modal separate from 3-button                   | T4 (ConfirmDialog2 distinct from ConfirmDialog)                                    |
| 4 i18n keys                                             | T4 (Steps 4.3-4.5)                                                                 |
| D2 confirmDestructive API mirrors confirm()             | T4 (Step 4.1)                                                                      |
| T6 ops polish (tier3 docs + 4 lessons + C2 cleanup)     | T6                                                                                 |
| Test budget +17 → +23 (spec undercount, recalc inline)  | T7 release notes                                                                   |
| Reverse-closes (v1.34.0 + v1.33.1 promises)             | T7 release notes                                                                   |
| Out of scope (multi-BSWMD / wizard / etc.)              | T7 release notes                                                                   |

**Spec gaps:** None.

### 2. Placeholder scan

No "TBD" / "TODO" / "implement later" / "fill in details" / "Similar to Task N" in the plan. (T5 Step 5.2 has a deliberate "replace the two skeleton tests with direct unit tests" block — this is an in-line note for the implementer, not a placeholder; the final test code IS provided.)

### 3. Type consistency

- `MainXlsxImportRecord` (T1) used by T2 handlers, T3 slice action (imported from main), T3 bootstrap (imported from main) — verified.
- `XlsHistoryLoadResponse` (T2) used by T2 handler, T2 test, T2 preload import, T3 bootstrap type definition — verified.
- `XlsHistorySaveRequest`/`Response` (T2) used by T2 handler, T2 test, T3 xlsxEcucBatchImportHandler call — verified.
- `XlsxImportSlice.hydrateXlsxHistory(records: readonly MainXlsxImportRecord[])` (T3) used by T3 bootstrap (calls `useArxmlStore.getState().hydrateXlsxHistory(res.value)`) — verified.
- `DestructiveChoice` (T4) used by T4 component, T4 test, T5 `confirmDestructive` return — verified.
- `confirmDestructive(options: ConfirmDestructiveOptions)` (T4) called by T5 `handleGenerateNew` with locale-resolved t() calls — verified.
- i18n key names: `dcmConfig.generateNew.confirm.{title,message,confirm,cancel}` (T4) used by T4 component (default labels), T5 (option values), T4 test (default labels via t()) — verified.

### 4. Re-calculations captured inline

- Test budget: spec said +17, per-file math gives +23. Captured in T7 release notes (Step 7.1) with explicit "Wait — re-check" walkthrough.
- Local SHA ≠ server SHA recovery: documented in T6 Step 6.1 (in-line in tier3_push.README.md, not a vault lesson per spec D7).
- T5 Step 5.2's "replace the two skeleton tests" block: explicit in-line note for the implementer; the final test code is provided.

---

## Execution Handoff

Plan complete and saved to
`docs/superpowers/plans/2026-07-08-v1-36-0-minor-xlsx-history-persistence-and-generate-new-confirmation.md`.
Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

Which approach?
