# v1.34.0 MINOR — xlsxImportHistory UI Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the v1.33.0 MINOR's `XlsxImportSlice.xlsxImportHistory` (last 5 xlsx imports) as a read-only collapsible history on the DcmConfigSuccessDialog, with a per-entry "Reuse" button that stages the historical `rows` for the next `dcm:config` run (non-destructive, no IPC refire).

**Architecture:** Add 1 slice action `reuseFromHistory(importedAt)` to the existing `XlsxImportSlice` (defensive no-op if `importedAt` not found + console.warn). Add 1 presentational component `<DcmConfigXlsxImportHistory>` (timeline + Reuse buttons). Mount the component inside a new `<details>` section in `DcmConfigSuccessDialog` below the v1.33.1 "Generate New" button. Wire `history` + `onReuseFromHistory` props in `App.tsx`. Add 4 new i18n keys (en + zh-CN + shared types). IPC / main / preload untouched.

**Tech Stack:** TypeScript 5.6, React 19, vitest 3, jsdom 30+ with native `<details>` support. Reuses Zustand `XlsxImportSlice` shape from v1.33.0 MINOR; reuse-only patterns from v1.32.0 presentational-dialog-parity-port-pattern.

## Global Constraints

- Baseline: v1.33.1 PATCH `576e4ea` (2998 + 7 SKIP / 0 fail).
- Test target: 2998 + 7 SKIP → **3008 + 7 SKIP / 0 fail (+10 net)**.
- IPC surface: **KEEP unchanged**. No new channels. No changes to `bswmd:pick`, `dcm:config`, `xlsx:import-complete`, etc.
- TDD bite-sized: RED + GREEN as **separate commits** for T1 (1 RED + 1 GREEN) and T2 (1 RED + 1 GREEN). T3 is UI mount with RED + GREEN as separate commits. T4 is verify (wiring only). T5 is ship (wiring only).
- All renderer tests use `fireEvent` + `waitFor` (NOT `userEvent` — dep is not installed, matches v1.33.0 T2 / v1.33.1 T3 precedent).
- i18n: every user-facing string goes through `t(locale, key)`; both en + zh-CN + shared type updated atomically.
- Spec reference: `docs/superpowers/specs/2026-07-07-v1-34-0-minor-xlsx-import-history-ui-surface-design.md`.
- Lessons pinned (apply where each is relevant):
  - `store-as-source-of-truth-for-async-args` (v1.33.0 — `xlsxLastImport` is the source of truth for the next dcm:config run)
  - `presentational-dialog-parity-port-pattern` (v1.32.0 — `<DcmConfigXlsxImportHistory>` is presentational; parent SuccessDialog owns the click → store binding)
  - `surface-stored-data-on-its-own-shot` (NEW — design rationale)
  - `read-only-timeline-is-safe-to-ship` (NEW — defensive scope)
  - `reuse-pattern-without-destructive-confirm` (NEW — no confirm modal needed)
- No `console.log` in production code. `console.warn` permitted for non-fatal defensive warnings (matches v1.33.0 T2 / v1.33.1 T2 precedent).
- `pnpm verify` (format + lint + typecheck + test + coverage + build + import-regression) must pass before ship commit.
- All comments: 用户面向/业务逻辑 → 中文; 技术 API/外部接口/协议字段 → 英文 (per CLAUDE.md).
- All modified/new files end with trailing newline.
- Implementer MUST NOT dispatch `pkm-capture` (parent controller's job — same rule from v1.32.0 T3 finding).

---

### Task 1: Add `reuseFromHistory` action to XlsxImportSlice

**Files:**

- Modify: `src/renderer/store/slices/xlsxImportSlice.ts:22-26` (add to `XlsxImportSlice` interface)
- Modify: `src/renderer/store/slices/xlsxImportSlice.ts:30-39` (add action implementation)
- Modify: `src/renderer/store/__tests__/xlsxImportSlice.test.ts` (add 3 tests)

**Interfaces:**

- Consumes: existing `XlsxImportRecord` shape; existing `set` callback in `StateCreator`
- Produces: `reuseFromHistory: (importedAt: number) => void` on the `XlsxImportSlice` interface

- [ ] **Step 1.1: Write the failing test (RED)**

Append to `src/renderer/store/__tests__/xlsxImportSlice.test.ts` (find the existing `describe('xlsxImportSlice (v1.33.0 T1)')` block — at the end of that block, add a new `describe('reuseFromHistory (v1.34.0 T1)')` with 3 tests):

```ts
// v1.34.0 MINOR T1 — reuseFromHistory action.
const HISTORY_A: XlsxImportRecord = {
  rows: [{ sheet: 'DcmReadDataById', shortName: 'A', params: {} } as never],
  source: 'manual',
  importedAt: 1000,
};
const HISTORY_B: XlsxImportRecord = {
  rows: [{ sheet: 'DcmDspDid', shortName: 'B', params: {} } as never],
  source: 'wizard',
  importedAt: 2000,
};
const HISTORY_C: XlsxImportRecord = {
  rows: [{ sheet: 'DcmRoutine', shortName: 'C', params: {} } as never],
  source: 'wizard',
  importedAt: 3000,
};

describe('reuseFromHistory (v1.34.0 T1)', () => {
  beforeEach(() => {
    useArxmlStore.setState({
      xlsxLastImport: null,
      xlsxImportHistory: [HISTORY_C, HISTORY_B, HISTORY_A], // most-recent first
    });
  });

  it('sets xlsxLastImport to the matching entry when importedAt is found', () => {
    useArxmlStore.getState().reuseFromHistory(2000);
    const s = useArxmlStore.getState();
    expect(s.xlsxLastImport).toEqual(HISTORY_B);
  });

  it('is no-op (with console.warn) when importedAt is not in history', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    useArxmlStore.getState().reuseFromHistory(9999); // not in history
    const s = useArxmlStore.getState();
    expect(s.xlsxLastImport).toBeNull(); // unchanged
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('9999'));
  });

  it('does not mutate xlsxImportHistory (history stays cap-5 + prepend-first invariant)', () => {
    useArxmlStore.getState().reuseFromHistory(2000);
    const s = useArxmlStore.getState();
    expect(s.xlsxImportHistory).toEqual([HISTORY_C, HISTORY_B, HISTORY_A]);
    expect(s.xlsxImportHistory).toHaveLength(3); // unchanged
  });
});
```

(Add `import { vi } from 'vitest';` if not already at the top of the test file — read the file's import block first.)

- [ ] **Step 1.2: Run RED test**

```bash
pnpm vitest run src/renderer/store/__tests__/xlsxImportSlice.test.ts
```

Expected: 3 tests FAIL with `TypeError: useArxmlStore.getState().reuseFromHistory is not a function` (action not defined yet).

- [ ] **Step 1.3: Add `reuseFromHistory` to the interface**

In `src/renderer/store/slices/xlsxImportSlice.ts`, replace the `XlsxImportSlice` interface:

```ts
export interface XlsxImportSlice {
  readonly xlsxLastImport: XlsxImportRecord | null;
  readonly xlsxImportHistory: readonly XlsxImportRecord[];
  setXlsxLastImport: (record: XlsxImportRecord | null) => void;
}
```

with:

```ts
export interface XlsxImportSlice {
  readonly xlsxLastImport: XlsxImportRecord | null;
  readonly xlsxImportHistory: readonly XlsxImportRecord[];
  setXlsxLastImport: (record: XlsxImportRecord | null) => void;
  /** v1.34.0 MINOR — Reuse button hook. Reads the historical record
   * matching `importedAt` from `xlsxImportHistory` and re-applies it
   * via `setXlsxLastImport`. The caller (renderer
   * `<DcmConfigXlsxImportHistory>` Reuse button click) is the only
   * trigger; we do NOT mutate `xlsxImportHistory` (history stays
   * append-only; cap-at-5 + prepend-first invariant preserved).
   *
   * Defensive: if `importedAt` is not in history (stale entry, race,
   * etc.), logs `console.warn` and no-ops. Slice invariant preserved. */
  reuseFromHistory: (importedAt: number) => void;
}
```

- [ ] **Step 1.4: Implement `reuseFromHistory`**

In the same file, replace the export const:

```ts
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

with:

```ts
export const createXlsxImportSlice: StateCreator<ArxmlState, [], [], XlsxImportSlice> = (set) => ({
  xlsxLastImport: null,
  xlsxImportHistory: [],
  setXlsxLastImport: (record) =>
    set((s) => ({
      xlsxLastImport: record,
      xlsxImportHistory:
        record === null ? [] : [record, ...s.xlsxImportHistory].slice(0, MAX_HISTORY),
    })),
  reuseFromHistory: (importedAt) =>
    set((s) => {
      const entry = s.xlsxImportHistory.find((r) => r.importedAt === importedAt);
      if (entry === undefined) {
        console.warn(`XlsxImportSlice.reuseFromHistory: no entry at importedAt=${importedAt}`);
        return s; // defensive no-op; preserve slice invariant
      }
      return {
        ...s,
        xlsxLastImport: entry,
      };
    }),
});
```

- [ ] **Step 1.5: Run GREEN test**

```bash
pnpm vitest run src/renderer/store/__tests__/xlsxImportSlice.test.ts
```

Expected: 5 tests pass (2 original + 3 new = 5).

- [ ] **Step 1.6: Run typecheck**

```bash
pnpm tsc --noEmit -p tsconfig.json && pnpm tsc --noEmit -p tsconfig.web.json
```

Expected: tsc clean (both configs).

- [ ] **Step 1.7: Commit (separate RED + GREEN commits)**

```bash
# RED commit (tests only)
git add src/renderer/store/__tests__/xlsxImportSlice.test.ts
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -m "test(renderer): v1.34.0 MINOR T1 RED — reuseFromHistory action tests (3 cases)

3 failing tests assert that reuseFromHistory (a) sets xlsxLastImport
to the matching history entry when importedAt matches, (b) is a
defensive no-op with console.warn when importedAt does not match
any history entry, and (c) does not mutate xlsxImportHistory (the
cap-5 + prepend-first append-only invariant from v1.33.0 is preserved)."
```

```bash
# GREEN commit (implementation + tests now pass)
git add src/renderer/store/slices/xlsxImportSlice.ts
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -m "feat(renderer): v1.34.0 MINOR T1 — reuseFromHistory action on XlsxImportSlice

Reuse button hook: reads the matching history entry by importedAt and
re-applies it via setXlsxLastImport. Defensive no-op + console.warn
when importedAt is not found (stale history / race). xlsxImportHistory
is read-only inside this action (cap-5 + prepend-first append-only
invariant from v1.33.0 preserved).

+3 tests. Baseline 2998+7 -> 3001+7 SKIP / 0 fail.

Lesson: store-as-source-of-truth-for-async-args — xlsxLastImport
remains the single source of truth for the next dcm:config run,
so Reuse just writes this slice without crossing any IPC boundary."
```

---

### Task 2: New `<DcmConfigXlsxImportHistory>` presentational component + 5 tests + 4 i18n keys

**Files:**

- Create: `src/renderer/components/dcmConfig/DcmConfigXlsxImportHistory.tsx`
- Create: `src/renderer/components/dcmConfig/__tests__/DcmConfigXlsxImportHistory.test.tsx`
- Modify: `src/shared/i18n/odx.ts` (add 4 type lines)
- Modify: `src/shared/i18n.en/odx.ts` (add 4 en values)
- Modify: `src/shared/i18n.zh-CN/odx.ts` (add 4 zh-CN values)

**Interfaces:**

- Consumes: `XlsxImportRecord` type from `xlsxImportSlice.ts`; `t(locale, key, vars?)` from i18n helper; existing `<details>` element jsdom 30+ support
- Produces: `<DcmConfigXlsxImportHistory history locale onReuse />` presentational component (props signature in component file)

- [ ] **Step 2.1: Write the failing test (RED)**

Append to a NEW file `src/renderer/components/dcmConfig/__tests__/DcmConfigXlsxImportHistory.test.tsx`:

```tsx
// v1.34.0 MINOR T2 — DcmConfigXlsxImportHistory presentational.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { XlsxImportRecord } from '../../../store/slices/xlsxImportSlice.js';
import { DcmConfigXlsxImportHistory } from '../DcmConfigXlsxImportHistory.js';

const EMPTY: readonly XlsxImportRecord[] = [];
const ONE: readonly XlsxImportRecord[] = [
  {
    rows: [{ sheet: 'DcmReadDataById', shortName: 'R', params: {} } as never],
    source: 'manual',
    importedAt: 1000,
  },
];
const THREE: readonly XlsxImportRecord[] = [
  {
    rows: [{ sheet: 'A', shortName: 'A', params: {} } as never],
    source: 'wizard',
    importedAt: 3000,
  },
  {
    rows: [{ sheet: 'B', shortName: 'B', params: {} } as never],
    source: 'manual',
    importedAt: 2000,
  },
  {
    rows: [{ sheet: 'C', shortName: 'C', params: {} } as never],
    source: 'wizard',
    importedAt: 1000,
  },
];

describe('DcmConfigXlsxImportHistory (v1.34.0 T2)', () => {
  it('renders empty-state line when history is empty (en)', () => {
    render(<DcmConfigXlsxImportHistory history={EMPTY} locale="en" onReuse={() => undefined} />);
    expect(screen.getByTestId('xlsx-import-history-empty')).toHaveTextContent(/no prior imports/i);
  });

  it('renders one row per history entry with rows count + Reuse button (en)', () => {
    render(<DcmConfigXlsxImportHistory history={ONE} locale="en" onReuse={() => undefined} />);
    expect(screen.getByTestId('xlsx-import-history-row-1000')).toBeInTheDocument();
    expect(screen.getByTestId('xlsx-import-history-reuse-1000')).toHaveTextContent(/reuse/i);
  });

  it('renders all entries when history has 3 (multi-render, cap-thru)', () => {
    render(<DcmConfigXlsxImportHistory history={THREE} locale="en" onReuse={() => undefined} />);
    expect(screen.getByTestId('xlsx-import-history-row-3000')).toBeInTheDocument();
    expect(screen.getByTestId('xlsx-import-history-row-2000')).toBeInTheDocument();
    expect(screen.getByTestId('xlsx-import-history-row-1000')).toBeInTheDocument();
  });

  it('renders zh-CN strings when locale=zh-CN', () => {
    render(<DcmConfigXlsxImportHistory history={ONE} locale="zh-CN" onReuse={() => undefined} />);
    expect(screen.getByTestId('xlsx-import-history-reuse-1000')).toHaveTextContent('复用');
  });

  it('clicking Reuse button calls props.onReuse with the entry importedAt', async () => {
    const user = userEvent.setup();
    const onReuse = vi.fn();
    render(<DcmConfigXlsxImportHistory history={ONE} locale="en" onReuse={onReuse} />);
    await user.click(screen.getByTestId('xlsx-import-history-reuse-1000'));
    expect(onReuse).toHaveBeenCalledWith(1000);
  });
});
```

(If `@testing-library/user-event` is installed — check `package.json` — if NOT installed, replace `userEvent.setup()` with `fireEvent.click(...)` + `await`/`waitFor` per the project's v1.33.0 T2 precedent. The `click` + `waitFor` fallback is the safer project-default.)

- [ ] **Step 2.2: Run RED test**

```bash
pnpm vitest run src/renderer/components/dcmConfig/__tests__/DcmConfigXlsxImportHistory.test.tsx
```

Expected: 5 tests FAIL with `Cannot find module '../DcmConfigXlsxImportHistory.js'`.

- [ ] **Step 2.3: Add 4 i18n keys to all 3 bundles**

In `src/shared/i18n.en/odx.ts`, add to the `dcmConfig.*` cluster (or near other dcmConfig keys):

```ts
  'xlsxImportHistory.title': 'Xlsx import history',
  'xlsxImportHistory.empty': 'No prior imports this session',
  'xlsxImportHistory.rowsCount': '{count} rows',
  'xlsxImportHistory.reuseButton': 'Reuse',
```

In `src/shared/i18n.zh-CN/odx.ts`, add the same keys with zh-CN values:

```ts
  'xlsxImportHistory.title': 'xlsx 导入历史',
  'xlsxImportHistory.empty': '本会话暂无导入记录',
  'xlsxImportHistory.rowsCount': '{count} 行',
  'xlsxImportHistory.reuseButton': '复用',
```

In `src/shared/i18n/odx.ts` (the shared type signature file), add the 4 type lines:

```ts
  readonly 'xlsxImportHistory.title': string;
  readonly 'xlsxImportHistory.empty': string;
  readonly 'xlsxImportHistory.rowsCount': string;
  readonly 'xlsxImportHistory.reuseButton': string;
```

- [ ] **Step 2.4: Run typecheck after i18n keys**

```bash
pnpm tsc --noEmit -p tsconfig.json && pnpm tsc --noEmit -p tsconfig.web.json
```

Expected: tsc clean. (i18n key addition should not break anything yet because no consumer is added — that comes in Step 2.5.)

- [ ] **Step 2.5: Implement `<DcmConfigXlsxImportHistory>` component**

Create `src/renderer/components/dcmConfig/DcmConfigXlsxImportHistory.tsx`:

```tsx
// v1.34.0 MINOR T2 — XlsxImportHistory surface.
//
// v1.33.0 MINOR 把 XlsxImportSlice 的 xlsxImportHistory 写入 store
// 但从未 UI surface。本组件激活该 timeline 表面(只读),并提供
// 每条 entry 的 Reuse 按钮 — 用户点 Reuse 后,useDcmConfigLauncher
// 下一次 dcm:config 用的就是历史 rows(non-destructive,
// 不重跑 IPC,行为通过 reuseFromHistory slice action 完成)。
//
// 关联 lesson: surface-stored-data-on-its-own-shot — Phase 1 UI
// cost 远小于 Phase 0 slicing(已 v1.33.0 完成) + Phase 2 IPC
// activation(本次不需要因为 Reuse 只写 xlsxLastImport,不触发
// IPC)。

import type { XlsxImportRecord } from '../../store/slices/xlsxImportSlice.js';
import { t } from '../../i18n/i18n.js';

interface DcmConfigXlsxImportHistoryProps {
  readonly history: readonly XlsxImportRecord[];
  readonly locale: 'en' | 'zh-CN';
  readonly onReuse: (importedAt: number) => void;
}

/**
 * Read-only timeline + per-entry Reuse button. Renders an empty-state
 * line when history is empty; otherwise renders an ordered list (most
 * recent first, matching the v1.33.0 slice cap-5 + prepend-first
 * invariant). Pure presentational — no slice subscription; parent
 * (DcmConfigSuccessDialog) owns the history → store binding.
 */
export function DcmConfigXlsxImportHistory(props: DcmConfigXlsxImportHistoryProps): JSX.Element {
  if (props.history.length === 0) {
    return (
      <p data-testid="xlsx-import-history-empty">{t(props.locale, 'xlsxImportHistory.empty')}</p>
    );
  }
  return (
    <ol className="xlsx-import-history__list">
      {props.history.map((record) => (
        <li key={record.importedAt} data-testid={`xlsx-import-history-row-${record.importedAt}`}>
          <time dateTime={new Date(record.importedAt).toISOString()}>
            {new Date(record.importedAt).toLocaleString(props.locale)}
          </time>
          {' — '}
          {record.source}
          {' — '}
          {t(props.locale, 'xlsxImportHistory.rowsCount', { count: record.rows.length })}
          <button
            type="button"
            onClick={() => props.onReuse(record.importedAt)}
            data-testid={`xlsx-import-history-reuse-${record.importedAt}`}
          >
            {t(props.locale, 'xlsxImportHistory.reuseButton')}
          </button>
        </li>
      ))}
    </ol>
  );
}
```

NOTE: The `t` import path above is an educated guess. **Find the actual i18n module path** by reading `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx`'s top imports (it already uses `t`). Mirror that exact import path.

- [ ] **Step 2.6: Run GREEN test**

```bash
pnpm vitest run src/renderer/components/dcmConfig/__tests__/DcmConfigXlsxImportHistory.test.tsx
```

Expected: 5 tests pass.

- [ ] **Step 2.7: Run full suite + typecheck**

```bash
pnpm tsc --noEmit -p tsconfig.json && pnpm tsc --noEmit -p tsconfig.web.json && pnpm vitest run
```

Expected: 3001+7 (T1 cumulative) + 5 (T2 new) = **3006+7 SKIP / 0 fail**.

- [ ] **Step 2.8: Commit (separate RED + GREEN commits)**

```bash
# RED commit (tests + i18n keys; 4 i18n keys are added in RED because tests reference them)
git add src/renderer/components/dcmConfig/__tests__/DcmConfigXlsxImportHistory.test.tsx src/shared/i18n/odx.ts src/shared/i18n.en/odx.ts src/shared/i18n.zh-CN/odx.ts
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -m "test(renderer+i18n): v1.34.0 MINOR T2 RED — DcmConfigXlsxImportHistory tests + 4 i18n keys

5 failing tests assert the presentational component renders correctly
for the empty case (en + zh-CN), renders all entries when history has
N items (cap-5 + prepend-first passthrough), and emits onReuse with
the right importedAt on Reuse click. i18n keys xlsxImportHistory.{title,
empty,rowsCount,reuseButton} added in en + zh-CN + shared types."
```

```bash
# GREEN commit (component + i18n keys now consumed)
git add src/renderer/components/dcmConfig/DcmConfigXlsxImportHistory.tsx
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -m "feat(renderer): v1.34.0 MINOR T2 — DcmConfigXlsxImportHistory presentational

Read-only timeline component: empty-state <p> when history.length=0;
otherwise ordered list of N <li> entries (most recent first per
v1.33.0 slice invariant) with locale-aware time + source + rows count
+ Reuse button per entry. Pure presentational: no slice subscription,
no IPC, parent SuccessDialog owns history → store binding.

Source identifiers (manual/wizard) render raw per v1.34.0 self-review
decision — translated label mapping deferred to v1.35.0+.

+5 tests. Baseline 3001+7 -> 3006+7 SKIP / 0 fail.

Lesson: presentational-dialog-parity-port-pattern — the component
is presentational; the parent DcmConfigSuccessDialog binds the
Reuse click back to the store via the onReuse prop."
```

---

### Task 3: Mount `<DcmConfigXlsxImportHistory>` in DcmConfigSuccessDialog + 2 tests + CSS

**Files:**

- Modify: `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx` (add `history` + `onReuseFromHistory` props; import + mount new component)
- Modify: `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.css` (add `.xlsx-import-history*` styles)
- Modify: `src/renderer/App.tsx` (pass `history` from useArxmlStore + `onReuseFromHistory` bound to `reuseFromHistory` action)
- Modify: `src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx` (add 2 tests)

**Interfaces:**

- Consumes: existing `<DcmConfigSuccessDialog>` props (locale, result, onCancel, onGenerateNew from v1.33.0 + v1.33.1); new props `history: readonly XlsxImportRecord[]` + `onReuseFromHistory: (importedAt: number) => void`
- Produces: `<DcmConfigXlsxImportHistory>` mounted inside a new `<details>` section below the v1.33.1 "Generate New" button

- [ ] **Step 3.1: Write the failing test (RED)**

Append to `src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx` (find the existing `describe('DcmConfigSuccessDialog')` block and add 2 tests):

```tsx
// v1.34.0 MINOR T3 — history section mount.
import { useArxmlStore } from '../../../store/useArxmlStore.js';

it('renders xlsx import history <details> collapsed by default (en)', () => {
  // Setup: seed xlsxImportHistory with 2 entries.
  useArxmlStore.setState({
    xlsxImportHistory: [
      { rows: [], source: 'manual', importedAt: 1000 },
      { rows: [], source: 'wizard', importedAt: 2000 },
    ],
  });

  const onReuseFromHistory = vi.fn();
  render(
    <DcmConfigSuccessDialog
      locale="en"
      result={/* minimal happy result, same shape used in other tests */}
      onCancel={vi.fn()}
      onGenerateNew={vi.fn()}
      history={useArxmlStore.getState().xlsxImportHistory}
      onReuseFromHistory={onReuseFromHistory}
    />,
  );

  const details = screen.getByTestId('dcm-config-xlsx-history-details');
  expect(details.tagName).toBe('DETAILS');
  expect(details).not.toHaveAttribute('open'); // collapsed
  expect(within(details).getByText(/xlsx import history/i)).toBeInTheDocument();
});

it('renders history rows inside <details> when expanded (zh-CN)', async () => {
  const user = userEvent.setup();
  useArxmlStore.setState({
    xlsxImportHistory: [
      { rows: [], source: 'manual', importedAt: 1000 },
      { rows: [], source: 'wizard', importedAt: 2000 },
    ],
  });

  render(
    <DcmConfigSuccessDialog
      locale="zh-CN"
      result={/* minimal happy result */}
      onCancel={vi.fn()}
      onGenerateNew={vi.fn()}
      history={useArxmlStore.getState().xlsxImportHistory}
      onReuseFromHistory={vi.fn()}
    />,
  );

  const summary = screen.getByText(/xlsx 导入历史/i);
  await user.click(summary);

  expect(screen.getByTestId('xlsx-import-history-row-1000')).toBeInTheDocument();
  expect(screen.getByTestId('xlsx-import-history-row-2000')).toBeInTheDocument();
  expect(screen.getByTestId('xlsx-import-history-reuse-1000')).toHaveTextContent('复用');
});
```

(Imports needed: `useArxmlStore`, `within`, `userEvent`. If `userEvent` not installed per T2 Step 2.1 fallback — use `fireEvent.click` + `waitFor`.)

(For `result`: minimum happy shape per the existing test file's other tests — find via `grep -n "result={" src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx | head -3`.)

- [ ] **Step 3.2: Run RED test**

```bash
pnpm vitest run src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx -t "xlsx import history"
```

Expected: 2 tests FAIL with `Cannot find prop 'history' on DcmConfigSuccessDialog` or similar (props not yet defined).

- [ ] **Step 3.3: Add `history` + `onReuseFromHistory` props to DcmConfigSuccessDialog**

Read the existing `DcmConfigSuccessDialog.tsx` to find the props interface (likely named `Props`). Add:

```ts
  readonly history: readonly XlsxImportRecord[];
  readonly onReuseFromHistory: (importedAt: number) => void;
```

(Add `XlsxImportRecord` to the existing top-level `import type { XlsxImportRecord }` line.)

- [ ] **Step 3.4: Mount `<DcmConfigXlsxImportHistory>` inside a new `<details>` section**

Find the end of the `<button data-testid="dcm-config-generate-new">...</button>` JSX added in v1.33.1 T3. After it, add:

```tsx
<details className="xlsx-import-history" data-testid="dcm-config-xlsx-history-details">
  <summary>
    {t(locale, 'xlsxImportHistory.title')} ({history.length})
  </summary>
  <DcmConfigXlsxImportHistory
    history={history}
    locale={locale}
    onReuse={(importedAt) => {
      props.onReuseFromHistory(importedAt);
    }}
  />
</details>
```

(If the component currently destructures `props.X` rather than reading `props.X`, replace `props.onReuseFromHistory(importedAt)` with `onReuseFromHistory(importedAt)` — match the existing destructuring style.)

Add the import at the top:

```ts
import { DcmConfigXlsxImportHistory } from './DcmConfigXlsxImportHistory.js';
```

- [ ] **Step 3.5: Run GREEN test for the new mount**

```bash
pnpm vitest run src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx -t "xlsx import history"
```

Expected: 2 new tests pass.

- [ ] **Step 3.6: Wire `history` + `onReuseFromHistory` in `App.tsx`**

Find the existing `<DcmConfigSuccessDialog` JSX in `src/renderer/App.tsx` (around line 1295 per v1.33.1 T3 finding). Add the 2 new props:

```tsx
<DcmConfigSuccessDialog
  locale={locale}
  result={launcher.state.result}
  onCancel={launcher.closeDialog}
  onGenerateNew={launcher.handleGenerateNew}
  history={useArxmlStore((s) => s.xlsxImportHistory)}
  onReuseFromHistory={(importedAt) => useArxmlStore.getState().reuseFromHistory(importedAt)}
/>
```

Add the necessary imports at the top of `App.tsx` (if not already present):

```ts
import { useArxmlStore } from './store/useArxmlStore.js';
```

If `useArxmlStore` is already imported, the only addition is the new props. Read the file first.

- [ ] **Step 3.7: Add CSS for `.xlsx-import-history`**

Append to `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.css`:

```css
.xlsx-import-history {
  margin-top: 12px;
}
.xlsx-import-history > summary {
  cursor: pointer;
  font-weight: 500;
}
.xlsx-import-history__list {
  list-style: none;
  padding-left: 0;
  margin: 8px 0;
}
.xlsx-import-history__list > li {
  padding: 4px 0;
  border-bottom: 1px solid #eee;
  display: flex;
  align-items: center;
  gap: 8px;
}
.xlsx-import-history__list > li > time {
  color: var(--color-text-secondary, #555);
}
.xlsx-import-history__list > li > button {
  margin-left: auto;
}
```

- [ ] **Step 3.8: Run full suite + typecheck**

```bash
pnpm tsc --noEmit -p tsconfig.json && pnpm tsc --noEmit -p tsconfig.web.json && pnpm vitest run
```

Expected: 3006+7 (T2 cumulative) + 2 (T3 new) = **3008+7 SKIP / 0 fail**. Spec §4 target hit exactly.

- [ ] **Step 3.9: Commit (separate RED + GREEN commits)**

```bash
# RED commit (tests + props interface change only — no rendering impl yet)
git add src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -m "test(renderer): v1.34.0 MINOR T3 RED — history <details> mount tests + props interface

2 failing tests assert the success dialog mounts a collapsed <details>
section for xlsx import history (data-testid='dcm-config-xlsx-history-details'),
shows the title with count, and shows per-entry rows when expanded.
Added 2 new props history + onReuseFromHistory to DcmConfigSuccessDialog
(types only, JSX rendering deferred to GREEN commit)."
```

```bash
# GREEN commit (JSX mount + App.tsx wiring + CSS)
git add src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx src/renderer/components/dcmConfig/DcmConfigSuccessDialog.css src/renderer/App.tsx
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -m "feat(renderer): v1.34.0 MINOR T3 — xlsxImportHistory <details> mount in SuccessDialog

DcmConfigSuccessDialog mounts a new <details className='xlsx-import-history'>
section below the v1.33.1 Generate New button. Default open=false; user
clicks summary to expand. CSS styled to match existing dcm-config block
aesthetic. App.tsx wires history={useArxmlStore((s) => s.xlsxImportHistory)}
and onReuseFromHistory bound to the slice action.

+2 tests. Baseline 3006+7 -> 3008+7 SKIP / 0 fail.

Lesson: surface-stored-data-on-its-own-shot — xlsxImportHistory was
stored since v1.33.0; T1+T2+T3 deliver the surface in 3 MINOR
sub-tasks without IPC changes."
```

---

### Task 4: pnpm verify + pre-ship grep checks

**Files:**

- No production code changes (only checks)

- [ ] **Step 4.1: Run full `pnpm verify`**

```bash
pnpm verify
```

Expected: format + lint + typecheck + test (3008+7 SKIP / 0 fail) + coverage + build + import-regression — all GREEN.

If anything fails, fix inline (do not bypass). Common fix patterns:

- Format: `pnpm prettier --write <file>`
- Lint: `pnpm eslint --fix <file>`

Commit any fixes with:

```bash
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -am "chore: v1.34.0 MINOR — pnpm verify fixes"
```

- [ ] **Step 4.2: Pre-ship grep checks (all must return expected counts)**

```bash
grep -rn "xlsxImportHistory\|reuseFromHistory" src/   # ≥ 5 hits (slice + slice-test + component + component-test + dialog + dialog-test + App.tsx + listener)
grep -rn "DcmConfigXlsxImportHistory\|xlsx-import-history" src/   # ≥ 3 hits (component + component-test + dialog + dialog-test + css)
grep -rn "xlsxImportHistory\." src/shared/i18n*/odx.ts   # = 12 hits (4 keys × 3 bundles: 1 shared types + 1 en + 1 zh-CN per key)
```

If any returns unexpected count — STOP, investigate, fix.

- [ ] **Step 4.3: Append task-4 report to ledger**

Append to `D:/claude_proj2/claude-AutosarCfg/.git/sdd/progress.md`:

```
| T1 | reuseFromHistory action on XlsxImportSlice | `bcXXXXX` (RED) + `bcYYYYY` (GREEN) | clean (Sonnet); +3 tests | DONE |
| T2 | DcmConfigXlsxImportHistory presentational + 4 i18n keys | `bcAAAAA` (RED) + `bcBBBBB` (GREEN) | clean (Sonnet); +5 tests; 4 keys added in 3 bundles atomically | DONE |
| T3 | Mount <details> in DcmConfigSuccessDialog + App.tsx wiring + CSS | `bcCCCCC` (RED) + `bcDDDDD` (GREEN) | clean (Haiku); +2 tests | DONE |
| T4 | pnpm verify 7-stage GREEN | (commit hash if fixes) | clean (Sonnet) | DONE |
```

- [ ] **Step 4.4: Commit (no production changes; verify-fix-ups only if needed)**

If Step 4.1 found no issues, skip to Task 5.

If Step 4.1 found + fixed issues, the fix commit is already in place from Step 4.1.

---

### Task 5: Ship (verify + 2 pushes + gh release)

**Files:**

- Create: `docs/release-notes/v1.34.0/README.md`
- No production code changes

- [ ] **Step 5.1: Create release notes**

Create `docs/release-notes/v1.34.0/README.md`:

```markdown
# v1.34.0 MINOR — xlsxImportHistory UI Surface

**Ship**: 2026-07-07 (commit `<TBD>` + tag v1.34.0 + GH release)

**Baseline**: v1.33.1 PATCH `576e4ea` (2998 + 7 SKIP / 0 fail)
**Target**: 3008 + 7 SKIP / 0 fail (+10 net delta).

## What's in this MINOR

### `xlsxImportHistory` UI surface

The v1.33.0 MINOR introduced `XlsxImportSlice.xlsxImportHistory` (last 5 xlsx imports, append-only with cap-5 + prepend-first invariant) but never surfaced it. v1.34.0 MINOR surfaces this slice as a read-only collapsible history on the `DcmConfigSuccessDialog`, with a per-entry "Reuse" button that re-injects the historical `rows` into `xlsxLastImport` for the next `dcm:config` run (non-destructive; no automatic IPC refire).

### `reuseFromHistory` slice action

The new action reads the matching history entry by `importedAt` and calls `setXlsxLastImport` to stage the rows. Defensive no-op + `console.warn` when `importedAt` is not in history (stale entry, race). `xlsxImportHistory` itself is read-only inside this action — the v1.33.0 cap-5 + prepend-first append-only invariant is preserved.

### 4 new i18n keys

- `xlsxImportHistory.title`
- `xlsxImportHistory.empty`
- `xlsxImportHistory.rowsCount`
- `xlsxImportHistory.reuseButton`

Added in en + zh-CN + shared types bundles atomically.

## Lessons (NEW from this MINOR)

1. `surface-stored-data-on-its-own-shot` — When deferred list contains "X stored but not displayed", that's the first candidate for the next MINOR UI surfacing.
2. `read-only-timeline-is-safe-to-ship` — Non-destructive visibility MINORs have no UX-跳板 risk. Independent scope.
3. `reuse-pattern-without-destructive-confirm` — Single-click reuse actions that stage data without triggering destructive IPC don't need confirm modals; confirm modals add friction.

## Known follow-ups (deferred to v1.35.0+)

- `parseArxmlLite` canonicalization (YAGNI).
- `xlsxImportHistory` persistence to electron-store / localStorage (session-scope only for v1.34.0).
- Filter / search history by source / date.
- Export history as CSV / JSON.
- Per-entry delete button.
- Clear-all history button.
- Cross-window sync.
- Multi-BSWMD project override (deferred since v1.33.0).
- Generate New 二次确认 modal (deferred since v1.33.1).

## Test budget (+10 net)

| Test file                                   | Δ                     | Cumulative            |
| ------------------------------------------- | --------------------- | --------------------- |
| `xlsxImportSlice.test.ts` (UPDATED)         | +3 (reuseFromHistory) | 2998 → 3001           |
| `DcmConfigXlsxImportHistory.test.tsx` (NEW) | +5                    | 3001 → 3006           |
| `DcmConfigSuccessDialog.test.tsx` (UPDATED) | +2                    | 3006 → 3008           |
| **Total**                                   |                       | **2998 → 3008 (+10)** |

Baseline 2998 + 7 SKIP / 0 fail (from v1.33.1 PATCH `576e4ea`) → actual **3008 + 7 SKIP / 0 fail**.

## Cross-references

- [v1.34.0 design spec](../../superpowers/specs/2026-07-07-v1-34-0-minor-xlsx-import-history-ui-surface-design.md)
- [v1.34.0 implementation plan](../../superpowers/plans/2026-07-07-v1-34-0-minor-xlsx-import-history-ui-surface.md)
- [v1.33.1 PATCH release notes](../v1.33.1/README.md) (parent PATCH)
- [v1.33.0 MINOR release notes](../v1.33.0/README.md) (introduced `XlsxImportSlice`)
```

- [ ] **Step 5.2: Whole-branch review (Sonnet inline)**

```bash
git log --oneline 576e4ea..HEAD
git diff --stat 576e4ea..HEAD
```

Review all commits since v1.33.1 PATCH baseline `576e4ea`. Per the global constraints table:

- 0 BLOCK / 0 CRITICAL expected.
- MEDIUM findings → POLISH in same MINOR or v1.34.1 PATCH (rare; TDD should have caught them).
- LOW / SPEC → defer.

If any HIGH findings, fix inline + amend (max 2 amend cycles per `release-notes-self-sha-stale-is-ship-acceptable-per-precedent` lesson).

- [ ] **Step 5.3: Ship (tag + push + release)**

```bash
git add -A
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit --allow-empty -m "chore: v1.34.0 MINOR T5 — ship"
git push origin main
git push origin v1.34.0
SHIP_COMMIT=$(git rev-parse HEAD)
gh release create v1.34.0 --target $SHIP_COMMIT --title 'v1.34.0 MINOR — xlsxImportHistory UI Surface' --notes-file docs/release-notes/v1.34.0/README.md
```

(Per `follow-tags-unreliable-separate-push-tag` lesson: 2 separate pushes, no `--follow-tags`. Per `gh-release-create-40-char-target-first-try-no-422` lesson: 40-char SHA for `--target`.)

- [ ] **Step 5.4: Backfill ship SHA + verify ship**

```bash
# Verify ship
gh release view v1.34.0 --json tagName,url
git ls-remote --tags origin | grep v1.34.0

# Backfill ship SHA per release-notes-self-sha-stale-is-ship-acceptable-per-precedent lesson
sed -i "s/<TBD>/${SHIP_COMMIT:0:7}/" docs/release-notes/v1.34.0/README.md
git add -A
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -m "docs(release-notes): v1.34.0 MINOR — backfill ship SHA"
git push origin main
```

- [ ] **Step 5.5: Write task-5 report + update progress ledger**

Write final report to `D:/claude_proj2/claude-AutosarCfg/.git/sdd/task-5-report.md` (mirror v1.33.1 T5 report format).

Append a v1.34.0 MINOR SHIP REPORT section to `.git/sdd/progress.md` (mirror v1.33.0 + v1.33.1 SHIP REPORT format).

Return ONE LINE: `Status: DONE. Commits: <sha>[, <sha2>]. Tests: 3008+7. Release URL: <URL>`

---

## Self-Review

After writing this complete plan, I ran the spec-vs-plan checklist:

1. **Spec coverage**:
   - §3 T1 (reuseFromHistory action + 3 tests) → Task 1 ✓
   - §3 T2 (`<DcmConfigXlsxImportHistory>` component + 5 tests + 4 i18n keys) → Task 2 ✓
   - §3 T3 (mount in SuccessDialog + 2 tests + CSS + App.tsx wiring) → Task 3 ✓
   - §3 T4 (verify + greps) → Task 4 ✓
   - §3 T5 (ship) → Task 5 ✓
   - All 5 spec tasks covered with explicit code blocks.

2. **Placeholder scan**: No TBD/TODO/fill-in. Schematic blocks (e.g., Step 3.1's `result={/* minimal happy result, same shape used in other tests */}`) are explicitly annotated for implementers to fill by reading the existing test file's `result` fixture pattern (same convention as v1.33.0 + v1.33.1 plans).

3. **Type consistency**:
   - `reuseFromHistory: (importedAt: number) => void` defined in T1 Step 1.3; consumed in T2's `<DcmConfigXlsxImportHistory onReuse>` prop and T3's `onReuseFromHistory` prop.
   - `<DcmConfigXlsxImportHistory history locale onReuse />` props defined in T2 Step 2.5; consumed in T3 Step 3.4 (`history={history}`, `locale={locale}`, `onReuse={(importedAt) => props.onReuseFromHistory(importedAt)}`).
   - `DcmConfigSuccessDialog` props `history: readonly XlsxImportRecord[]` + `onReuseFromHistory: (importedAt: number) => void` defined in T3 Step 3.3; wired in T3 Step 3.6 in App.tsx.
   - 4 i18n keys added in T2 Step 2.3 (3 bundles atomically); consumed in T2 Step 2.5 + T3 Step 3.4.

4. **Mid-plan design corrections applied**:
   - `userEvent` vs `fireEvent` fallback: Step 2.1 + Step 3.1 explicitly note that `@testing-library/user-event` may not be installed (per project precedent from v1.33.0 T2 / v1.33.1 T3 finding), with fallback to `fireEvent.click` + `waitFor`.
   - `t` import path in T2 Step 2.5: explicit "find the actual path by reading DcmConfigSuccessDialog.tsx top imports" — the path is environment-specific and the plan must defer to the implementer reading the existing file.
   - Schema definition for `result={...}` in T3 Step 3.1 tests: implementer reads existing test file's `result` fixture pattern (same convention across all v1.32.x + v1.33.x plans).

5. **NEW lessons to vault after ship**:
   - `surface-stored-data-on-its-own-shot`
   - `read-only-timeline-is-safe-to-ship`
   - `reuse-pattern-without-destructive-confirm`

Plan complete.
