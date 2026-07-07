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