# v1.26.0 MINOR — Xlsx Mapper BSWMD-Driven Refactor

> **Ship date:** 2026-07-05
> **Commit:** e8d798fdac148c7ebcef8c92f537cd9563266aa9
> **Tag:** v1.26.0
> **Tests:** 2841 + 6 SKIP / 0 fail (~7 net new from v1.25.2's 2834)

## Summary

Eliminates the hardcoded `SHEET_TO_PARENT_PATH` const in `src/core/bridge/xlsxToEcucBatch.ts`. The bridge mapper now derives BSWMD-side parent paths from the canonical BSWMD at call time via the existing `lookupContainerDef` infrastructure. The mismatch risk that caused the v1.25.1 PATCH T3 misnomer regression (and the v1.25.2 PATCH BSWMD revert) is structurally eliminated.

## What's New

### Architecture: BSWMD-driven lookup

The mapper accepts a new mandatory parameter:

```ts
function xlsxToEcucBatch(
  rows: readonly EcucInstanceRow[],
  bswmds: ReadonlyMap<string, BswModuleDef>, // NEW
): PatchStep[];
```

A minimal `SHEET_TO_MODULE` const (sheet → module shortName: ComIPdu→Com, PduRRoutingPath→PduR, etc.) maps each user-facing sheet name to its module. For each row, the mapper:

1. Looks up the module shortName via `SHEET_TO_MODULE`.
2. Fetches the `BswModuleDef` from `bswmds`.
3. Calls `lookupContainerDef(bswmd, row.sheet)` to get the canonical `ContainerDef`.
4. Uses `containerDef.path` as `parentPath` on the emitted `add-child` PatchStep.

### New helper: `parseDemoBswmds`

`src/core/bridge/demoBswmdLoader.ts` parses BSWMD ARXML strings (decoupled from file IO for testability) into a `ReadonlyMap<string, BswModuleDef>`. Used by `xlsxEcucBatchImportHandler` to feed the mapper.

### Fail-fast error classes

Three new error classes surface at mapper construction time:

- `Unrecognized sheet name: '<X>' (allowed: ...)` — sheet not in SHEET_TO_MODULE.
- `BSWMD map missing module '<X>' (needed by sheet '<Y>'). Provided modules: <list>` — module absent from bswmds.
- `Container '<X>' not found in BSWMD module '<Y>'` — `lookupContainerDef` returned null.

All three fail before any patch is emitted; strict improvement over v1.25.x PATCH's silent `path-not-found` soft-filter.

## Migration Notes

**For users on v1.25.x and earlier**: v1.26.0 is a pure architecture refactor. Existing `.xlsx` template formats are unchanged. The handler continues to read the same demo-ecu BSWMDs and now passes them through the new BSWMD-driven lookup. No user-visible behavior change for the happy path.

**For BSWMD authors**: any container shortName the demo-ecu BSWMD declares (e.g., `PduRRoutingPaths`) is now the **single source of truth**. If a future BSWMD renames a container, the mapper follows; the user sees a clear error message instead of a silent failure.

**Backward compat**: the `xlsxToEcucBatch(rows)` internal signature is replaced with `xlsxToEcucBatch(rows, bswmds)`. This is internal main-process code; the only caller (`xlsxEcucBatchImportHandler`) is updated in the same MINOR. Public IPC contract unchanged.

## Out of Scope (deferred to v1.27.0 MINOR)

- **Dcm services generator** (5 UDS kinds: 0x14/0x19/0x22/0x2E/0x31). Was unblocked since v1.25.1 PATCH (C1 fix); now ready as a fresh sub-project.
- **dbcToComStack refactor** (already mostly value-walk from v1.23.0 T2; minor cleanup is a separate concern).
- **odxToDiagnosticExtract refactor** (different schema: ODX not ARXML ECUC).

## Test Results

- pnpm type-check: 0 errors
- pnpm lint: 0 errors, 0 warnings
- pnpm format: clean
- pnpm vitest: **2841 + 6 SKIP / 0 fail** (~7 net new from v1.25.2's 2834)
  - T1: 4 new (parseDemoBswmds happy + 3 edge cases)
  - T4: 2-3 new (BSWMD-driven edge cases)
  - T2: 0 net (assertion updates only)
- pnpm verify: 7-stage GREEN

## Next Steps

- v1.27.0 MINOR: Dcm services generator (5 UDS kinds), reusing the BSWMD-driven xlsx mapper pipeline from v1.26.0.
- Long-term: BSWMD-driven mapping for new sheet kinds (Dem/ComM/EcuC) as those modules mature.