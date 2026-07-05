# v1.25.2 PATCH — Demo-ecu BSWMD Misnomer Reverted

> **Ship date:** 2026-07-05
> **Commit:** 0d6e116bdd7054165ad9f53cc6a7cc8d45f14249
> **Tag:** v1.25.2
> **Tests:** 2834 + 6 SKIP / 0 fail (0 net change from v1.25.1's 2834)

## Summary

Reverts a misnomer introduced in v1.25.1 PATCH T3. The v1.25.1 "Demo BSWMD enrichment" task renamed the demo-ecu PduR BSWMD's container from canonical `PduRRoutingPaths` to non-canonical `PduRRoutingTables`. The mapper, value file, real-OEM fixture, and canonical AUTOSAR all use `PduRRoutingPaths`. T3's misnomer caused PduR `add-child` steps to silently fail with `path-not-found` (advisory filter masks the failure); end users saw no error but the PduR instance was never created in the committed ARXML.

## What's New

### T1: Demo-ecu BSWMD misnomer revert (corrected scope)

Single-line fix in `samples/arxml/demo-ecu/bswmd/Bsw_PduR_Bswmd.arxml:14`: `PduRRoutingTables` → `PduRRoutingPaths`. The container SHORT-NAME is restored to canonical AUTOSAR + real-OEM alignment.

**Why "corrected scope"**: the v1.25.2 spec originally framed this PATCH as a bridge-mapper fix (mapper `PduRRoutingPaths/...` → `PduRRoutingTables/...`). T1 implementation found that framing was inverted — the mapper was already canonical; the BSWMD was the side that needed correction. T1 reverted the BSWMD instead, leaving the mapper (and value file) unchanged. A separate T1 review nit aligned a stale header comment in `xlsxToEcucBatch.ts:9` that referenced the planned-but-wrong mapper edit; the comment now matches the canonical code.

Effects:

- PduR `add-child` steps now resolve correctly via the engine's `findContainerByPath` (the container exists in the BSWMD with the name the mapper expects).
- PduR instances land in the committed ARXML (were silently filtered as `path-not-found` in v1.25.1).
- The 2 test assertions relaxed in v1.25.1 PATCH per spec Risks option (b) — `perFile.PduR >= 0` (in `xlsxEcucBatchImportHandler.test.ts`) and `addedCounts.pduR >= 0` (in `dbcImportComStackHandler.test.ts`) — are restored to `>= 1`. The "known consequence" comment blocks are removed.

The 4 other Com-stack kinds (`ComIPdu`, `ComSignal`, `CanIfTxPdu`, `CanIfRxPdu`) were never affected — their hardcoded paths matched the v1.25.1-enriched BSWMDs exactly. Only the PduR container name was misaligned.

## Migration Notes

**No breaking changes.** v1.25.2 is purely additive. The demo-ecu PduR BSWMD container name is restored to canonical `PduRRoutingPaths`; the mapper emits the same step shape it always emitted.

For users on v1.25.1: upgrade directly. The PduR `add-child` now succeeds (was silently failing in v1.25.1).

For users on v1.25.0: no behavior change — v1.25.1 introduced the misnomer and v1.25.2 reverts it; both v1.25.0 and v1.25.2 match the canonical pre-v1.25.1 demo-ecu shape.

## Out of Scope (deferred)

- **BSWMD-driven dynamic mapper lookup** — the long-term fix is to refactor `xlsxToEcucBatch` to derive paths from BSWMD via `lookupContainerDef` rather than hardcoding them. This would change the mapper's signature and ripple to both the xlsx import handler and the DBC bridge. Defer to v1.26.0 MINOR where the mapper refactor is a proper sub-project.
- **Dcm services generator** (0x14/0x19/0x22/0x2E/0x31) — v1.26.0 MINOR. Was blocked until C1 was fixed (v1.25.1 PATCH); now unblocked.

## Test Results

- pnpm type-check: 0 errors (both `tsconfig.json` + `tsconfig.web.json`)
- pnpm lint: 0 errors, 0 warnings
- pnpm format: clean
- pnpm vitest: **2834 + 6 SKIP / 0 fail** (0 net change from v1.25.1's 2834)
  - T1: 0 new tests (assertion restoration only — 2 previously-relaxed `>= 0` assertions tightened to `>= 1`)
- pnpm verify: 7-stage GREEN

## Next Steps

- v1.26.0 MINOR: Dcm services generator (5 UDS service kinds) + bridge mapper refactor to BSWMD-driven dynamic lookup. Both are now reachable scope items.