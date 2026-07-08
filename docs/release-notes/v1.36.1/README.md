# v1.36.1 PATCH — T-fix review closure (M1 + M2 + L1)

**Ship**: 2026-07-08 (TAG PENDING — T5 will fill this in)

**Baseline**: v1.36.0 MINOR `e375ddb` (3041 + 7 SKIP / 0 fail)
**Target**: 3048 + 7 SKIP / 0 fail (+7 net delta from v1.36.0).

The spec's "+5 net" was an ESTIMATE. Real math after all 3 tasks:

- T1 added 4 NEW tests (the new listener test file had zero pre-existing
  tests, all 4 are net new).
- T2 added 3 NEW tests on top of 4 pre-existing → +3 net.
- T3 added 0 tests (deletion + sandbox-flip allowlist entry; no logic
  changes).
- Net = **+7 tests**, not +5.

Verified final count from T4's `pnpm exec vitest run`: **3048 + 7 SKIP /
0 fail**.

## What's in this PATCH

### M1: `importedAt` single source-of-truth (commit `5be8d77`)

**Problem**: `importedAt` was being stamped independently in two
places — once in the `xlsxEcucBatchImportHandler` (the post-import
broadcast) and once in the persist hook downstream. A renderer reload
mid-broadcast could observe two different timestamps for the same
import, corrupting the `xlsxImportHistory` timeline.

**Fix**: `importedAt` is now derived exactly once in
`xlsxEcucBatchImportHandler` (`new Date().toISOString()`) and threaded
into all three downstream consumers as a single payload field:

1. The `xlsx:import-complete` push payload.
2. The `writeXlsxHistory` persistence call.
3. The `xlsxLastImport` renderer-store update.

The receiver side (`attachXlsxImportListener` + `attachXlsxHistoryBootstrap`)
NEVER re-stamps — it uses the value from the payload verbatim. Type
signature of `XlsxImportEntry.importedAt` tightened from optional to
required.

File:line citation:
- `src/main/ipc/xlsxEcucBatchImportHandler.ts` — single `importedAt`
  derivation at the top of the broadcast block.
- `src/preload/index.ts` — payload type update (required field).
- `src/renderer/store/xlsxImportSlice.ts` — receiver trusts payload
  verbatim (no `Date.now()` re-stamp).
- `src/main/io/xlsxHistoryStorage.ts` — persistence receives the
  pre-stamped record.

### M2: `readXlsxHistory` per-record validation (commit `b0c74dd`)

**Problem**: `readXlsxHistory` validated the top-level shape with
`Array.isArray(parsed)` and then trusted every element. A hand-edited
or version-drifted `<userData>/xlsx-import-history.json` could inject
a non-record element (e.g. `null`, a primitive, a stale-shape object
from a previous app version) and corrupt the slice on the next launch.

**Fix**: After the `Array.isArray` top-level guard, each record is now
funneled through a `isXlsxHistoryRecord(value: unknown): value is
XlsxImportEntry` type guard. The guard checks: `value !== null`,
`typeof value === 'object'`, `Array.isArray(value) === false`, every
required field present with correct primitive type, and `importedAt`
parseable as ISO string. Invalid records are filtered out with a
`console.warn` containing the index + reason. The slice then
hydrates from the validated subset.

File:line citation:
- `src/main/io/xlsxHistoryStorage.ts:readXlsxHistory` — type guard
  + per-record filter.
- `src/main/io/xlsxHistoryStorage.ts:isXlsxHistoryRecord` — new
  exported guard helper.
- `src/main/io/__tests__/xlsxHistoryStorage.validation.test.ts` (new
  file) — 3 tests: hand-edited null injection, primitive injection,
  missing-field injection. All 3 pass; 0 fail.

### L1: removed dead `offXlsxImportComplete` stub (commit `f2ccfe9`)

**Problem**: A `offXlsxImportComplete` listener-off helper was
declared + exported but had zero call sites anywhere in the
codebase (renderer or main). The function body was an inert
no-op. The `sandbox-flip` test allowlist also pinned its
existence as a "must-stay-registered" check.

**Fix**: Both the stub function and the corresponding sandbox-flip
allowlist entry were deleted. Grep across `src/`, `tests/`, and
`__tests__/` returns 0 residual references. The sandbox-flip test
suite (3/3) continues to PASS without the entry. TypeScript
`tsc --noEmit` is clean for both `tsconfig.main.json` and
`tsconfig.renderer.json`.

File:line citation:
- `src/main/ipc/xlsxImportListener.ts` — `offXlsxImportComplete`
  function deleted.
- `src/main/__tests__/sandbox-flip.test.ts` — corresponding
  allowlist entry removed.

## Lessons (NEW from this PATCH)

1. `ipc-payload-timestamp-single-source-of-truth` — Derive once in
   main, thread into all downstream consumers (push payload +
   persistence call + UI display). Never re-stamp at the receiver;
   a `Date.now()` on the renderer is always wrong.
2. `persisted-json-file-must-validate-per-record-shape` —
   `Array.isArray` at the top level is not enough. The storage
   boundary must check each element's shape via a type guard to
   survive hand-edits and version drift. A single bad record
   should not corrupt the whole slice on the next launch.

## Reverse-Closes

- v1.36.0 post-ship review Round 3 finding M1: "importedAt
  dual-stamp risk on broadcast + persist divergence"
- v1.36.0 post-ship review Round 3 finding M2: "readXlsxHistory
  trusts Array.isArray top-level, no per-record guard"
- v1.36.0 post-ship review Round 3 finding L1: "offXlsxImportComplete
  stub is dead code; remove rather than carry"

## Test budget

**Actual verified count (T4 `pnpm exec vitest run`):** 3048 + 7 SKIP /
0 fail (+7 net from v1.36.0's 3041 baseline). See "Target" at top of
file.

## Known follow-ups (deferred to v1.36.x PATCH or v1.37.0+)

- v1.36.0 review (1 MEDIUM deferred): useDcmConfigLauncher memo Map
  无界增长 (LRU bound).
- v1.36.0 review (3 LOW deferred): resolutions key `:` 拼接碰撞; 错误
  分类 UX 改进 (新 error kind); 文件超 800 行切分.
- Multi-BSWMD project override (architectural; deferred since v1.33.0).
- Cross-IPC envelope kind standardization (separate MINOR per envelope).
- History filter / search / export (UX; needs different design).
- Per-entry delete / clear-all history button (UX).
- Wizard / cross-window sync (far-term).

No NEW follow-ups generated by this PATCH.

## Cross-references

- [v1.36.0 release notes](../v1.36.0/README.md) (parent MINOR; T-fix
  target)
- [v1.36.1 implementation plan](../../superpowers/plans/2026-07-08-v1-36-1-patch-tfix-importedAt-source-validate-and-offstub-removal.md)
- [v1.36.1 progress ledger](../../../.git/sdd/progress-v1.36.1.md)
