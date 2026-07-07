# v1.34.0 MINOR — xlsxImportHistory UI Surface

> **Status**: DESIGN — pre-flight (awaiting user review)
> **Ship target**: v1.34.0 MINOR
> **Baseline**: v1.33.1 PATCH (`576e4ea`, 2998 + 7 SKIP / 0 fail)
> **Spec author**: brainstorming flow (2026-07-07)
> **Related**:
>
> - [v1.33.1 PATCH design spec](2026-07-07-v1-33-1-patch-override-ui-debt-cleanup-design.md) (parent PATCH)
> - [v1.33.0 MINOR design spec](2026-07-07-v1-33-0-minor-dcm-config-cleanup-design.md) (grandparent MINOR — introduced `XlsxImportSlice`)
> - [v1.33.0 MINOR release notes](../../release-notes/v1.33.0/README.md)

## Summary

v1.33.0 MINOR 落地了 `XlsxImportSlice` (记录最近一次 xlsx-import 结果 + last 5 历史条) 与 `xlsx:import-complete` IPC push,把 launcher's `xlsxRows: []` placeholder 改成从 store 读。但 `xlsxImportHistory` 当时只写入从未 UI surface,spec §T5 留 "history stored but not displayed — future UX work"。

v1.34.0 MINOR **完成 surface 这一半**。新增 presentational component `<XlsxImportHistory>` (timeline + Reuse 按钮 each entry),mount 在 `DcmConfigSuccessDialog` 的 `<details>` 块下方。Reuse 是 non-destructive,只 set `xlsxLastImport = historyEntry` for the **next** `dcm:config` run;不直接重跑 IPC,不 destructive over-write 任何 output 文件。

XlsxImportSlice 加 1 个新 action:`reuseFromHistory(importedAt)` 读 history 中 matching `importedAt` 的 entry,call `setXlsxLastImport(entry)` with same `importedAt`. 当然,会发现"复制" 的 entry 写入一个全新的 timestamp — 这样 reuse-style 写入也能被区分(detail)。但 Action 语义先保持,后来 v1.35.0+ 可以 refine。

IPC / main / preload 全 KEEP — 这次纯 renderer-only surface + 1 store action。

## 1. Goals & Non-Goals

### Goals

- Surface the existing `xlsxImportHistory` slice (last 5 xlsx imports) on the DcmConfigSuccessDialog,read-only。
- 加 Reuse 按钮 per entry — 一键 set `xlsxLastImport` to that history entry。
- 加 1 个新 store action `reuseFromHistory(importedAt)`。
- 加 4 个 i18n keys (en + zh-CN + shared types)。
- 测试预算:2998+7 → **3008+7 SKIP / 0 fail (+10 net)**。

### Non-Goals (v1.34.0 MINOR)

- ❌ `xlsxImportHistory` 持久化 (electron-store / localStorage) — 继续 session-scope。
- ❌ Re-import 整个 dcm config from a history entry — Reuse only stages rows,不破坏 dcm:config。
- ❌ Filter / search history by source / date。
- ❌ Export history as CSV / JSON。
- ❌ Clear-all history button。
- ❌ Per-entry 删除按钮。
- ❌ Cross-window sync (renderer-process scoped to this window)。
- ❌ `parseArxmlLite` canonicalization (仍 deferred,YAGNI)。
- ❌ Multi-BSWMD project override / Override persistence (仍 deferred)。
- ❌ Generate New 二次确认 modal (仍 deferred)。
- ❌ DcmDsl / Security access / Dem services (unchanged)。
- ❌ `<XlsxImportHistory>` 在 App.tsx 顶层挂载 (仅在 SuccessDialog mode='success' state mount)。

## 2. Architecture

### Layered design (extends v1.33.1)

```
┌──────────────────────────────────────────────────────────────────┐
│ DcmConfigSuccessDialog (v1.33.1; extended for v1.34.0)            │
│                                                                  │
│  Header                                                          │
│  Autofill bswmdPath: /path/arxml   (existing)                    │
│  Applied N xlsx rows                  (existing)                 │
│  [<Cancel/Close>]   [<Generate New>]   (v1.33.1 existing)        │
│                                                                  │
│  NEW: <details class="xlsx-import-history">                      │
│    <summary>Xlsx import history ({count})</summary>               │
│    <ol className="xlsx-import-history__list">                     │
│      <li data-testid="xlsx-import-history-row-{importedAt}">      │
│        <time>{timestamp}</time> — {source} — {rows.length} rows  │
│        <button data-testid="xlsx-import-history-reuse-{importedAt}">
│          Reuse / 复用                                            │
│        </button>                                                 │
│      </li>                                                       │
│    </ol>                                                         │
│  </details>                                                       │
└──────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│ useArxmlStore (XlsxImportSlice — v1.33.0; extended for v1.34.0)  │
│                                                                  │
│  xlsxLastImport: XlsxImportRecord | null  (v1.33.0 existing)   │
│  xlsxImportHistory: readonly XlsxImportRecord[]  (v1.33.0; cap 5)│
│                                                                  │
│  setXlsxLastImport(record)  (v1.33.0 existing)                   │
│                                                                  │
│  NEW action:                                                     │
│    reuseFromHistory(importedAt: number): void                    │
│      → finds r where r.importedAt === importedAt (defensive)     │
│      → if found: setXlsxLastImport(r with same fields)           │
│      → if not: console.warn + no-op                             │
│                                                                  │
│  No other slice is written by this action. launcher hook         │
│  reads xlsxLastImport at IPC invocation time (v1.33.0 pattern).  │
└──────────────────────────────────────────────────────────────────┘
```

### Component placement

| Component                                         | Path                                                                              | Type                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `XlsxImportSlice` (MODIFY)                        | `src/renderer/store/slices/xlsxImportSlice.ts`                                    | MODIFY: add `reuseFromHistory`                             |
| `xlsxImportSlice.test.ts` (UPDATED)               | `src/renderer/store/__tests__/xlsxImportSlice.test.ts`                            | MODIFY: +3 tests for new action                            |
| `<DcmConfigXlsxImportHistory />` (NEW)            | `src/renderer/components/dcmConfig/DcmConfigXlsxImportHistory.tsx`                | NEW presentational                                         |
| `DcmConfigXlsxImportHistory.test.tsx` (NEW)       | `src/renderer/components/dcmConfig/__tests__/DcmConfigXlsxImportHistory.test.tsx` | NEW (5 cases)                                              |
| `DcmConfigSuccessDialog.tsx` (MODIFY)             | `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx`                    | MODIFY: mount new <details> below Generate New             |
| `DcmConfigSuccessDialog.css` (MODIFY)             | `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.css`                    | MODIFY: .xlsx-import-history\* styles                      |
| `DcmConfigSuccessDialog.test.tsx` (UPDATED)       | `src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx`     | MODIFY: +2 history tests                                   |
| i18n bundles (en + zh-CN + shared types) (MODIFY) | `src/shared/i18n/{en,zh-CN,}/odx.ts` + `src/shared/i18n/odx.ts`                   | MODIFY: add 4 keys                                         |
| `preload`                                         | `src/preload/index.ts`                                                            | KEEP — no IPC change                                       |
| main IPC                                          | `src/main/ipc/**`                                                                 | KEEP — no IPC change                                       |
| `useDcmConfigLauncher.ts`                         | `src/renderer/hooks/useDcmConfigLauncher.ts`                                      | KEEP — Reuse only stages rows for next IPC, doesn't refire |
| `useDcmConfigLauncher.test.ts`                    | `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts`                       | KEEP — no change needed                                    |

## 3. Detailed Design

### T1 — Add `reuseFromHistory` action to XlsxImportSlice + 3 store tests

```ts
// src/renderer/store/slices/xlsxImportSlice.ts (MODIFY)

/**
 * v1.34.0 MINOR — Reuse button hook. Reads the historical record
 * matching `importedAt` from `xlsxImportHistory` and re-applies
 * it via `setXlsxLastImport`. The caller (renderer `<XlsxImportHistory>`
 * Reuse button click) is the only trigger; we do NOT mutate
 * `xlsxImportHistory` (history is append-only as new imports arrive;
 * v1.33.0 cap-at-5 + prepend-first invariant preserved).
 *
 * Defensive: if `importedAt` does not match any record (stale history
 * entry, race, etc.), log to `console.warn` and no-op. The slice
 * remains consistent.
 */
reuseFromHistory: (importedAt: number) => void;
```

Implementation:

```ts
reuseFromHistory: (importedAt) =>
  set((s) => {
    const entry = s.xlsxImportHistory.find((r) => r.importedAt === importedAt);
    if (entry === undefined) {
      console.warn(
        `XlsxImportSlice.reuseFromHistory: no entry at importedAt=${importedAt}`,
      );
      return s;  // no-op preserve slice invariant
    }
    return {
      ...s,
      xlsxLastImport: entry,
    };
  }),
```

Tests added:

```ts
it('reuseFromHistory sets xlsxLastImport to the matching entry', () => { ... });
it('reuseFromHistory is no-op (with console.warn) when importedAt is not in history', () => { ... });
it('reuseFromHistory does not mutate xlsxImportHistory (history stays cap-5 + prepend-first)', () => { ... });
```

### T2 — New `<XlsxImportHistory>` presentational component + 5 tests + 4 i18n keys

```tsx
// src/renderer/components/dcmConfig/DcmConfigXlsxImportHistory.tsx (NEW)

interface DcmConfigXlsxImportHistoryProps {
  readonly history: readonly XlsxImportRecord[];
  readonly locale: 'en' | 'zh-CN';
  readonly onReuse: (importedAt: number) => void;
}

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

**Note** (self-review caught during finalization): source values `manual` / `wizard` are identifiers (already in slice). To avoid adding a no-op translation key, concatenate `record.source` directly into the rendered text rather than via t().

Final rendered JSX (adjusted):

```tsx
<time>{...}</time>
{' — '}
{record.source}
{' — '}
{t(props.locale, 'xlsxImportHistory.rowsCount', { count: record.rows.length })}
<button>...</button>
```

**Final i18n key list (4 keys, not 5)**:

| Key                             | en                              | zh-CN                |
| ------------------------------- | ------------------------------- | -------------------- |
| `xlsxImportHistory.title`       | `Xlsx import history`           | `xlsx 导入历史`      |
| `xlsxImportHistory.empty`       | `No prior imports this session` | `本会话暂无导入记录` |
| `xlsxImportHistory.rowsCount`   | `{count} rows`                  | `{count} 行`         |
| `xlsxImportHistory.reuseButton` | `Reuse`                         | `复用`               |

**Tests (5)**:

```tsx
it('renders empty-state when history is empty (en)', () => { ... });
it('renders one row per history entry with rows count + Reuse button (en)', () => { ... });
it('renders all 5 rows when history is cap-full (multi-render)', () => { ... });
it('respects caller-provided cap (history sliced to 5 by store, render passes through)', () => { ... });
it('clicking Reuse button calls props.onReuse with the entry importedAt', () => { ... });
```

### T3 — Mount in DcmConfigSuccessDialog + 2 SuccessDialog tests + CSS

```tsx
// DcmConfigSuccessDialog.tsx (MODIFY) — below <button data-testid="dcm-config-generate-new">:

<details className="xlsx-import-history" open={false}>
  <summary>
    {t(locale, 'xlsxImportHistory.title')} ({history.length})
  </summary>
  <DcmConfigXlsxImportHistory
    history={history}
    locale={locale}
    onReuse={(importedAt) => {
      void onReuseFromHistory(importedAt);
    }}
  />
</details>
```

`history` 与 `onReuseFromHistory` 是 DcmConfigSuccessDialog 的 **new props**。App.tsx wiring:

```tsx
<DcmConfigSuccessDialog
  locale={locale}
  result={launcher.state.result}
  onCancel={launcher.closeDialog}
  onGenerateNew={launcher.handleGenerateNew}
  history={useArxmlStore((s) => s.xlsxImportHistory)} // NEW
  onReuseFromHistory={(importedAt) => useArxmlStore.getState().reuseFromHistory(importedAt)} // NEW
/>
```

(Or via a custom hook; the inline expression above is sufficient for v1.34.0.)

CSS additions:

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

Tests added (2):

```tsx
it('renders History <details> collapsed by default after Generate New (en)', () => {
  // Render full SuccessDialog. Assert <details> rendered with open=false. Assert summary text contains "Xlsx import history" + count.
});

it('renders history rows inside <details> when expanded (zh-CN)', () => {
  // Render SuccessDialog with history of 2 entries. Click summary to expand. Assert both rows visible + Reuse buttons rendered.
});
```

### T4 — pnpm verify

7-stage GREEN expected (matches v1.33.0 MINOR + v1.33.1 PATCH verify).

Pre-flight greps (per spec §9, this MINOR adds its own grep block):

```bash
grep -rn "xlsxImportHistory\|reuseFromHistory" src/   # ≥ 5 hits expected
grep -rn "DcmConfigXlsxImportHistory\|xlsx-import-history" src/   # ≥ 3 hits (component + test + dialog mount + css)
grep -rn "xlsxImportHistory\." src/shared/i18n*/odx.ts   # 9 hits (3 keys × 3 bundles, plus 4 type sigs)
```

### T5 — Ship

Standard MINOR ship mechanics per project conventions:

1. `pnpm verify` 7 stages GREEN.
2. `git push origin main` + `git push origin v1.34.0` (TWO separate pushes — no `--follow-tags`).
3. `gh release create v1.34.0 --target $SHIP_COMMIT --title 'v1.34.0 MINOR — xlsxImportHistory UI Surface' --notes-file docs/release-notes/v1.34.0/README.md` with 40-char SHA.
4. Backfill ship SHA in release notes (per `release-notes-self-sha-stale-is-ship-acceptable-per-precedent` lesson, ship-acceptable to defer to a follow-up commit; v1.33.0 + v1.33.1 both followed this pattern).

## 4. Test Plan

### Test budget (+10 net)

| Test file                                        | Δ                                      | Cumulative      |
| ------------------------------------------------ | -------------------------------------- | --------------- |
| `xlsxImportSlice.test.ts` (UPDATED)              | +3 (reuseFromHistory)                  | 2998 → 3001     |
| `DcmConfigXlsxImportHistory.test.tsx` (NEW)      | +5 (render + Reuse)                    | 3001 → 3006     |
| `DcmConfigSuccessDialog.test.tsx` (UPDATED)      | +2 (history section renders)           | 3006 → 3008     |
| `DcmConfigXlsxImportHistory.tsx` (NEW component) | n/a                                    | —               |
| i18n bundles (3 files MODIFIED)                  | +0 (no test for i18n key set coverage) | 3008            |
| **Net**                                          |                                        | **2998 → 3008** |

Baseline 2998 + 7 SKIP / 0 fail → target **3008 + 7 SKIP / 0 fail (+10 net)**.

### Subagent-driven task split (5 tasks)

| #   | Task                                                    | Model  | Test delta |
| --- | ------------------------------------------------------- | ------ | ---------- |
| T1  | `reuseFromHistory` action + 3 store tests               | Sonnet | +3         |
| T2  | `<XlsxImportHistory>` component + 5 tests + 4 i18n keys | Sonnet | +5         |
| T3  | Mount in SuccessDialog + 2 tests + CSS                  | Haiku  | +2         |
| T4  | pnpm verify 7-stage GREEN + pre-ship grep checks        | Sonnet | (wiring)   |
| T5  | Ship: release notes + 2 pushes + gh release create      | Sonnet | (wiring)   |

## 5. Risk Assessment

| Risk                                                                          | Likelihood                                        | Impact | Mitigation                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `reuseFromHistory` writes `xlsxLastImport` 同时 cross-slice pollution         | Low                                               | Low    | Implementation scoped to xlsxImportHistory + xlsxLastImport only; no `lastOdxPath` / `bswmdPathOverride` / other slices touched.                                                                                             |
| `<details>` toggle behavior in jsdom — some jsdom versions don't open         | Low                                               | Medium | vitest 3 + jsdom 30+ supports `<details>` natively. v1.33.0 P4 (T3 reflection precedent) used `<details>` testing — pattern confirmed working.                                                                               |
| Reuse not visible — user doesn't realize "rows staged for next run"           | Low                                               | Low    | Generous i18n text + Reuse button explicit. Non-destructive so no UX surprise. Future v1.35.0 can add a toast/announce if UX feedback surfaces the need.                                                                     |
| `source: 'wizard'                                                             | 'manual'` snake-case identifier shown raw to user | Low    | Low                                                                                                                                                                                                                          | Acceptable for v1.34.0 (no future i18n promises). Future i18n enhancement can map source to translated labels — out of scope. |
| History UI distractor — visible too prominently                               | Low                                               | Low    | `<details>` collapsed by default + mount only in SuccessDialog mode='success'. Hidden on initial dialog view unless user expands.                                                                                            |
| Reuse click → rows injected → user clicks Generate New → destructive re-write | Low                                               | Medium | v1.33.1 Generate New is already documented as destructive re-write (no confirm in v1.33.1, deferred to v1.35.0+). Reuse is orthogonal — only stages rows, user must still click Generate New to apply. Interaction explicit. |
| i18n key count claim off — spec says 4 in body but earlier section said 5     | Low                                               | Low    | Spec self-review caught this — finalize to 4 keys (drop `sourceLabel`).                                                                                                                                                      |
| `<XlsxImportHistory>` accidentally surface in App.tsx (outside SuccessDialog) | Low                                               | Low    | Architecture forces mount point; spec §Component placement is explicit. App.tsx mount is the only valid mount.                                                                                                               |

## 6. Lessons (NEW from v1.34.0 MINOR)

1. **`surface-stored-data-on-its-own-shot`** — When a deferred list contains entries of the form "X stored but not displayed", that's _the first candidate_ for the next MINOR UI surfacing. Phase 1 UI cost is dwarfed by Phase 0 slicing/storage, which is already done.
2. **`read-only-timeline-is-safe-to-ship`** — Non-destructive visibility features have no UX 跳板 issues (unlike v1.33.0 half-finished Override UI). Independent MINOR scope. Lesson pin: when surfacing deferred data, prefer read-only-first in the first MINOR; add destructive interactions only after the read-only UX is shipped.
3. **`reuse-pattern-without-destructive-confirm`** — Single-click "reuse" actions that stage data but don't directly trigger destructive IPC don't need a confirm modal. Confirm modals add friction; the action itself is reversible (rows are just staged, IPC fires only on user's explicit subsequent click).

## 7. Cross-references

- [v1.33.1 PATCH design spec](2026-07-07-v1-33-1-patch-override-ui-debt-cleanup-design.md) (immediate parent)
- [v1.33.0 MINOR design spec](2026-07-07-v1-33-0-minor-dcm-config-cleanup-design.md) (grandparent — introduced `XlsxImportSlice`)
- [v1.33.0 MINOR release notes](../../release-notes/v1.33.0/README.md)
- [v1.33.1 PATCH release notes](../../release-notes/v1.33.1/README.md)
- Lessons re-applied (carry-over from prior versions):
  - `store-as-source-of-truth-for-async-args` (v1.33.0 — `xlsxLastImport` is the source of truth for next dcm:config)
  - `presentational-dialog-parity-port-pattern` (v1.32.0 — `<XlsxImportHistory>` is a presentational component; Reuse button encapsulates the click)
  - `lesson-static-when-utility-helpers` (v1.32.0 — `reuseFromHistory` is a slice action, not a hook helper)

## 8. Known follow-ups (deferred to v1.35.0+)

- ❌ `xlsxImportHistory` 持久化到 electron-store / localStorage (session-scope only for v1.34.0)。
- ❌ Re-import 整个 dcm config from a history entry (Generate New already covers this via current state)。
- ❌ Filter / search history by source / date。
- ❌ Export history as CSV / JSON。
- ❌ Per-entry 删除按钮。
- ❌ Clear-all history 按钮。
- ❌ Cross-window sync (multi-window renderer-process isolation)。
- ❌ `parseArxmlLite` canonicalization (deferred since v1.33.0)。
- ❌ Override persistence (now N/A, no override UI — closed by v1.33.1)。
- ❌ Multi-BSWMD project override (deferred since v1.33.0)。
- ❌ Generate New 二次确认 modal (deferred since v1.33.1)。
- ❌ Source translation (map `'manual' | 'wizard'` to translated labels in en/zh-CN bundles)。

## 9. Pre-Ship Verification Checklist

- [ ] All 5 tasks have reviewer-approved status。
- [ ] `pnpm verify` 7-stage GREEN.
- [ ] `git push origin main` succeeds.
- [ ] `git push origin v1.34.0` succeeds (separate push — no `--follow-tags`).
- [ ] `gh release create v1.34.0` with 40-char SHA succeeds.
- [ ] Tag visible on origin via `git ls-remote --tags origin | grep v1.34.0`.
- [ ] Release URL: `https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.34.0`。
- [ ] `grep -rn "xlsxImportHistory\|reuseFromHistory" src/` ≥ 5 hits。
- [ ] `grep -rn "DcmConfigXlsxImportHistory\|xlsx-import-history" src/` ≥ 3 hits。
- [ ] `grep -rn "xlsxImportHistory\." src/shared/i18n*/odx.ts` = 12 hits (4 keys × 3 bundles)。
