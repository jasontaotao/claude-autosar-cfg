# v1.27.0 MINOR — Dcm Services Generator (ODX + xlsx Integrated)

> **Ship date:** 2026-07-06
> **Commit:** f04348bea34d86d946916b75b3dbd7ed1fbd470d
> **Tag:** v1.27.0
> **Tests:** 2857 + 6 SKIP / 0 fail (~16 net new from v1.26.0's 2841)

## Summary

Adds a new IPC handler `dcmConfigHandler` that combines v1.24.0's `odxToDiagnosticExtract.dcmContent` (ODX-derived DIDs + Routines as standalone ARXML) with xlsx-configured Dcm service instances (5 UDS kinds: 0x14 ClearDTC, 0x19 ReadDTC, 0x22 ReadDataById, 0x2E WriteDataById, 0x31 RoutineControl) into a single Dcm-Config ARXML. Builds on v1.26.0's BSWMD-driven mapper infrastructure; the mapper is shared between Dcm and Com-stack kinds (different `SHEET_TO_MODULE` const per file).

## What's New

### New IPC handler: `dcmConfigHandler`

```ts
dcmConfigHandler({
  odxPath: '/path/to/input.odx',
  xlsxRows: [...],  // sheet: 'DcmReadDataById' | 'DcmWriteDataById' | 'DcmRoutineControl' | etc.
  outputPath?: '/path/to/Dcm_Config.arxml',
}) → Promise<IpcResult<DcmConfigResult>>
```

### New helper modules

- `src/core/bridge/xlsxDcmServicesToEcucBatch.ts` — BSWMD-driven Dcm service mapper (mirrors v1.26.0 `xlsxToEcucBatch` shape; file-local `SHEET_TO_MODULE` const with 5 Dcm entries).
- `src/core/bridge/dcmConfigPipeline.ts` — orchestrator that validates ODX-Dcm cross-references + counts service instances + emits the merged Dcm-Config ARXML.

### New error class: ODX-Dcm linkage broken

When xlsx rows reference `didRef` / `routineRef` shortNames not present in the ODX extract, the handler errors with a diff-style message:

```
ODX-Dcm linkage broken: Sheet 'DcmReadDataById', row 'ReadGhost': referenced DID 'NotInOdx' not found. Available DIDs from ODX: Vbatt, EngTemp, Vin (and 0 more).
```

Fail-fast at mapper construction time (vs. v1.25.x's silent `path-not-found` masking).

### New fixtures

- `samples/arxml/demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml` — canonical demo-ecu Dcm BSWMD with 4 canonical AUTOSAR `DcmDsp*` service containers (`DcmDspClearDTC`, `DcmDspReadDTCInformation`, `DcmDspDid`, `DcmDspRoutine`). The 5 abstracted xlsx sheet names map to these 4 canonical containers via the T2 mapper's `SHEET_TO_CONTAINER_SHORT_NAME` seam.
- `samples/comstack-existing-fixture/Dcm.bswmd.arxml` — Vector-derived real-OEM-style Dcm BSWMD declaring the same 4 canonical AUTOSAR `DcmDsp*` containers (cross-vendor invariant).

## Migration Notes

**For users on v1.26.x and earlier**: v1.27.0 is purely additive. Existing `.xlsx` import workflows (Com/PduR/etc.) are unchanged. The new `dcmConfigHandler` IPC is a parallel addition for users who have ODX + Dcm service config needs.

**For users with existing Dcm configs**: no migration required. The new handler produces a standalone `Dcm_Config.arxml` file you merge with your existing Dcm BSWMD via DaVinci/EB tresos/GENy.

**Backward compat**: the new IPC handler is parallel; no existing endpoints touched.

## Out of Scope (deferred)

- **Dem services generator** — Dem has distinct concerns (DTC mapping + debouncing); separate sub-project (v1.28.0+)
- **DcmDsl data-link layer configuration** — different AUTOSAR sub-module
- **Security access (0x27) configuration** — out of original 5 UDS kinds; deferred to v1.28.0+
- **NRC customization per service** — future scope

## Architectural Decision: abstracted sheets vs canonical AUTOSAR container shortNames

The Dcm mapper uses two deliberately distinct naming layers, joined by a single seam constant:

- **User-facing xlsx sheet names stay abstracted** (5 sheets: `DcmClearDTC`, `DcmReadDTC`, `DcmReadDataById`, `DcmWriteDataById`, `DcmRoutineControl`) — keeps the spreadsheet ergonomic and vendor-neutral.
- **BSWMD-side container shortNames use canonical AUTOSAR `DcmDsp*`** (4 containers: `DcmDspClearDTC`, `DcmDspReadDTCInformation`, `DcmDspDid`, `DcmDspRoutine`) — matches what every real BSWMD declares and what DaVinci/EB tresos/GENy expect on import.
- **Seam**: the `SHEET_TO_CONTAINER_SHORT_NAME` const in `src/core/bridge/xlsxDcmServicesToEcucBatch.ts` is the single place these two naming layers meet. Future BSWMD renames are localized to that map; the rest of the pipeline is unaffected.

This mirrors the v1.25.x `SHEET_TO_PARENT_PATH` refactor (closed in v1.26.0) — keep user-facing naming abstracted from canonical AUTOSAR, centralize the mapping in one file-local const.

## Lessons learned (5 NEW permanent notes captured during v1.27.0)

These live in the project's PKM vault (`01-Projects/claude-AutosarCfg/`) and are the kind of "permanent knowledge" future readers of the codebase should be able to find:

- `claude-autosarcfg-canonical-autosar-always-verify.md` — Always verify BSWMD enrichments against canonical AUTOSAR before committing (T1 fix; the demo Dcm BSWMD initially used non-canonical container shortNames and was corrected to canonical `DcmDsp*`).
- `abstracted-vs-canonical-seam-via-sheet-to-shortname-const.md` — When user-facing names must be abstracted but canonical AUTOSAR names are required on the BSWMD side, the cleanest seam is a single file-local `SHEET_TO_CONTAINER_SHORT_NAME` const (T1 fix; replaces a more elaborate seam candidate).
- `odx-test-fixture-must-match-canonical-parser-shape.md` — ODX fixtures used in tests must mirror the actual `OdxSummary` shape the parser emits, not a hand-shaped subset (T4 lesson; surfaced during end-to-end IPC test).
- `bswmd-fixture-discovery-walk-up-during-dev-test-gap.md` — When the dev path and the test path discover BSWMDs differently (e.g., walk-up from a sample folder vs. a fixed fixture path), the test path can silently miss fixtures; always run the same discovery code in both paths (T4 lesson).
- `bswmd-fixture-extension-via-fixture-folder-not-demo-mutation.md` — When extending BSWMD coverage for a new module (e.g., Dcm), prefer extending the dedicated fixture folder over mutating the demo-ecu BSWMD in place. Keeps the demo-ecu invariant intact and the new module independently testable.

## Test Results

- pnpm type-check: 0 errors
- pnpm lint: 0 errors, 0 warnings
- pnpm format: clean
- pnpm vitest: **2857 + 6 SKIP / 0 fail** (~16 net new from v1.26.0's 2841)
  - T1: 1 net (demo Dcm BSWMD loader smoke test)
  - T2: 9 net (5 service kinds + 2 fail-fast errors + 2 canonical-AUTOSAR assertions)
  - T3: 3 net (happy / ODX-Dcm linkage error / missing BSWMD)
  - T4: 3 net (end-to-end IPC + read failure + linkage propagation)
  - T5: 1 net (cross-vendor real-OEM variant)
- pnpm verify: 7-stage GREEN
- Real-OEM cross-vendor invariant preserved
- BSWMD enrichment cross-reference confirmed (canonical AUTOSAR + demo + real-OEM all use same 4 canonical `DcmDsp*` service container shortNames — `DcmDspClearDTC`, `DcmDspReadDTCInformation`, `DcmDspDid`, `DcmDspRoutine`)

## Next Steps

- v1.28.0 MINOR: Dem services generator (DTC mapping + debouncing)
- v1.28.0+: DcmDsl configuration, Security access (0x27), NRC customization per service
- Long-term: auto-infer Dcm service kinds from BSWMD (drop `SHEET_TO_MODULE` const entirely)