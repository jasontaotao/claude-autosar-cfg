# v1.24.0 MINOR — ODX → Diagnostic Extract ARXML Bridge

> **Ship date:** 2026-07-04
> **Commit:** 6216171bf9b8f094e9b39a2ff11c7a4c2cc184c8
> **Tag:** v1.24.0
> **Tests:** 2804 + 6 SKIP / 0 fail (+34 net from v1.23.2's 2770)

## Summary

Closes the v1.22.0 carry-over "Bridge to ARXML + project integration still deferred" by adding a 1-way ODX→Diagnostic Extract ARXML bridge. Takes a parsed `OdxSummary` (DTCs/DIDs/Routines) and produces 2 standalone ARXML files (`Dem_Extract.arxml` + `Dcm_Extract.arxml`) for the user to merge with their Dem/Dcm BSWMD via DaVinci/EB tresos/GENy.

Architecture mirrors the v1.23.0 DBC→Com-Stack bridge: pure mapper (T1) + IPC handler with 2-phase atomic write (T2) + UI Export button + success dialog (T3). Real-OEM fixture validation against `samples/odx/Demo_Cdd.odx-d` (Vector CANdelaStudio export) is ship-blocking (T4).

## What's New

### Pure mapper `odxToDiagnosticExtract` (T1)

Pure function (no IO, no React state) that maps an `OdxSummary` to 2 ARXML file contents:

- DTC → `DEM-EVENT-PARAMETER` (SHORT-NAME + EVENT-KIND=SWC + DISPLAY-CODE + DTC-VALUE + optional TEXT)
- DID → `DCM-DSP-DID` (SHORT-NAME)
- Routine → `DCM-DSP-ROUTINE` (SHORT-NAME)

All 3 v1.22.0 surfaces are consumed. XML-escape for special chars; multi-byte UTF-8 passes through unescaped. 12 unit tests.

### IPC handler `odxImportDiagnosticExtractHandler` (T2)

Mirrors the v1.23.0 DBC→Com-Stack bridge's 2-phase atomic write pattern:

1. Pre-flight: validate outputDir exists + is writable
2. Re-parse .odx-d via v1.22.0's `parseOdxHandler` (keeps IPC payload small)
3. Map to ARXML strings via T1
4. Snapshot existing files (if any)
5. `writeAtomic(Dem)` → tmp + rename
6. `writeAtomic(Dcm)` → tmp + rename
7. On any failure in 5-6: restore snapshots, return `write-failed` with `rolledBack: true`

Response: `{ ok, value: { demPath, dcmPath, stats } } | { ok, error: { kind, message } }`. 8 unit tests.

### UI: "Export Diagnostic Extract" button + success dialog (T3)

- `OdxViewer` modal gets an "Export Diagnostic Extract" button (disabled when summary is null or while exporting).
- After success, a new `DiagnosticExtractSuccessDialog` modal shows the 2 file paths + counts (DTCs/DIDs/Routines) and an OK button. Mirrors the v1.21.0 T4 DbcViewer / v1.22.0 T2 OdxViewer a11y pattern (Escape + backdrop-click + initial focus on close button).
- 5 new i18n keys × 2 locales (en + zh-CN).
- 10 new tests (4 OdxViewer + 5 dialog + 1 App.tsx wiring).

### i18n-bypass fix (T3.1)

Splits the T3 `rolledBack` error message into 2 fully-translated i18n keys (`write-failed` rolled-back vs rolled-back-partially). Closes a CRITICAL i18n bypass flagged in the T3 code review (mixed-language parenthetical in zh-CN). 2 new parity tests.

### Real-OEM fixture validation + UDS SERVICE-ID fix (T4)

Ship-blocking test against `samples/odx/Demo_Cdd.odx-d`:

- 99 `DemEventParameter` + 4 `DcmDspRoutine` + 34 `DcmDspDid` (per v1.22.0 T4 counts)
- DTC `_258` regression: SHORT-NAME `DTC0A7D01` + DISPLAY-CODE `P0A7D01` + DTC-VALUE `687361` (per v1.22.0 T4 concrete values)

Plus a latent parser bug surfaced during T4: REQUEST services were being mis-classified by name prefix. Fixed by classifying REQUEST by **UDS SERVICE-ID** (0x22 = DID, 0x31 = Routine, others = ignore). 2 additional tests pin the fix.

If any of these tests fails, the T1 mapper or T2 handler is wrong — fix the implementation, not the test.

## Migration Notes

**No user-facing breaking changes.** v1.24.0 is purely additive: extends the v1.22.0 ODX-D importer with an Export button.

For developers integrating v1.24.0 into their workflow:

1. Open a .odx-d file via the existing v1.22.0 menu (File Operations → Open ODX…)
2. In the OdxViewer modal, click "Export Diagnostic Extract"
3. The 2 generated files (`Dem_Extract.arxml` + `Dcm_Extract.arxml`) appear in the project at `samples/arxml/diagnostic-extract/`
4. **Manual merge step**: import the 2 files into your Dem/Dcm BSWMD using your AUTOSAR tooling (DaVinci / EB tresos / GENy / Vector Diagnostic Extract). v1.24.0 does NOT merge into the project's BSWMD automatically — the user is expected to have a real Dem/Dcm BSWMD with their preferred vendor (Vector / EB / ETAS).

For developers with hand-rolled Dem/Dcm configs: v1.24.0's output is a starting point. The `EVENT-KIND` defaults to `DEM_EVENT_KIND_SWC` for all events; adjust per your BSWMD's configured kinds.

## Out of Scope (deferred)

- **Dcm services (0x14 / 0x19 / 0x22 / 0x2E / 0x31)** are not generated. v1.22.0's `OdxSummary` does not include service definitions; user adds manually post-merge.
- **DID / Routine data (length, scaling, encoding)** are not generated. Would require parsing ODX-INSTANCE elements from .odx-d; defer to v1.24.x PATCH.
- **BSWMD merge helper** is not provided. The output is standalone; merging is the user's existing toolchain.
- **Reverse direction (ARXML → ODX)** is explicitly out of scope per user constraint ("只要ODX->arxml 就好了啊，不需要arxml 导出到odx").

## Test Results

- pnpm type-check: 0 errors (both `tsconfig.json` + `tsconfig.web.json`)
- pnpm lint: 0 errors, 0 warnings
- pnpm format: clean
- pnpm vitest: **2804 + 6 SKIP / 0 fail** (+34 net from v1.23.2's 2770)
  - T1 mapper: 12 cases PASS
  - T2 IPC handler: 8 cases PASS
  - T3 UI: 10 cases PASS
  - T3.1 i18n parity: 2 cases PASS
  - T4 real-OEM: 1 case PASS (SHIPPED as ship-blocking)
  - T4 UDS SERVICE-ID fix: 2 cases PASS
  - i18n parity: 88+ cases PASS (5 new keys × 2 locales added)
- pnpm verify: 7-stage GREEN

## Next Steps

- v1.24.x PATCH: parse ODX-INSTANCE for DID/Routine data (length, scaling, encoding) — closes the "DID data is BSWMD-coupled" deferred item
- v1.25.0 MINOR: Excel/CSV → batch create ECUC instances (per research finding from v1.23.0 planning)
- v1.26.0 MINOR: Dcm services (0x14/0x19/0x22/0x2E/0x31) generator (would require extending v1.22.0's `OdxSummary` first)