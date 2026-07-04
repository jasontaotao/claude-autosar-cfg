# v1.24.1 PATCH — ODX-INSTANCE DID Data

> **Ship date:** 2026-07-04
> **Commit:** {{ship-hash}}
> **Tag:** v1.24.1
> **Tests:** 2813 + 6 SKIP / 0 fail (+9 net from v1.24.0's 2804)

## Summary

Closes the v1.24.0 release-notes "Next Steps" item: "DID / Routine data (length, scaling, encoding) are not generated. Would require parsing ODX-INSTANCE elements from .odx-d; defer to v1.24.x PATCH."

The ODX→Diagnostic Extract bridge now captures `<DIAG-CODED-TYPE>` (BASE-DATA-TYPE + BASE-TYPE-ENCODING + optional BIT-LENGTH) from 0x22 REQUESTs' DID-value PARAMs and emits a `<DCM-DSP-DID-DATA>` block in the Dcm_Extract.arxml output for each DID that has data. The diagnostic engineer no longer has to manually fill in the DID data type and encoding when merging the output into their Dem/Dcm BSWMD.

## What's New

### `parseOdxHandler` extension (T1)

For 0x22 REQUESTS, the parser now walks the REQUEST's PARAMS and identifies the DID-value PARAM (the one whose `SEMANTIC` attribute is not `SERVICE-ID` and not `SUBFUNCTION`). It extracts that PARAM's `<DIAG-CODED-TYPE>` and populates a new `data` field on `OdxDidSummary`.

For DIDs from `<DID-OBJECT>` (legacy spec shape), the `data` field is `undefined` (backward-compat with v1.22.0's hand-crafted fixtures).

### `odxToDiagnosticExtract` mapper extension (T2)

When a DID has `data` populated, the mapper emits a `<DCM-DSP-DID-DATA>` block inside the `<DCM-DSP-DID>`:

```xml
<DCM-DSP-DID>
  <SHORT-NAME>DID_F186</SHORT-NAME>
  <DCM-DSP-DID-DATA>
    <DIAG-CODED-TYPE>A_UINT32</DIAG-CODED-TYPE>
    <BASE-TYPE-ENCODING>NONE</BASE-TYPE-ENCODING>
    <BIT-LENGTH>16</BIT-LENGTH>
  </DCM-DSP-DID-DATA>
</DCM-DSP-DID>
```

When `data.bitLength` is undefined, the `<BIT-LENGTH>` line is omitted. When `data` itself is undefined, no `<DCM-DSP-DID-DATA>` block is emitted.

### Real-OEM fixture regression test (T3)

Ship-blocking test against `samples/odx/Demo_Cdd.odx-d` (Vector CANdelaStudio export) verifies that all 34 DIDs have `<DCM-DSP-DID-DATA>` blocks and that a specific DID has the expected concrete DIAG-CODED-TYPE values.

## Migration Notes

**No user-facing breaking changes.** v1.24.1 is purely additive: the bridge output now contains more data for DIDs that have it, but the existing `<DCM-DSP-DID>` structure (just `<SHORT-NAME>`) is preserved for DIDs that don't.

For developers integrating v1.24.1 into their workflow: regenerate the Diagnostic Extract and check that the `<DCM-DSP-DID-DATA>` blocks are populated for your .odx-d file's DIDs. If your BSWMD requires `xsi:type` disambiguation (`STANDARD-LENGTH-TYPE` vs `LEADING-LENGTH-INFO-TYPE`), you may need to add that manually post-merge — v1.24.1 does not capture `xsi:type`.

## Out of Scope (deferred)

- **PHYSICAL-TYPE / SCALING / COMPU-METHOD** are not parsed. v1.24.1 captures only the wire-format data type + encoding. To add scaling, parse `<PHYSICAL-TYPE>` and `<COMPU-METHOD>` from the same DIAG-CODED-TYPE area.
- **Routine data** (start/stop, request/response format) is not parsed.
- **xsi:type disambiguation** is not captured.
- **BSWMD merge helper** is not provided.

## Test Results

- pnpm type-check: 0 errors (both `tsconfig.json` + `tsconfig.web.json`)
- pnpm lint: 0 errors, 0 warnings
- pnpm format: clean
- pnpm vitest: **2813 + 6 SKIP / 0 fail** (+9 net from v1.24.0's 2804)
  - T1 parser: 4 new cases PASS (DID data extraction + 3 backward-compat cases)
  - T2 mapper: 3 new cases PASS (DID data block + no bitLength + backward-compat)
  - T3 real-OEM: 2 new cases PASS (ship-blocking, all 34 DIDs + 1 specific DID)
  - All 47 v1.24.0 + v1.22.0 tests continue to pass (backward-compat)
- pnpm verify: 7-stage GREEN

## Next Steps

- v1.25.0 MINOR: Excel/CSV → batch create ECUC instances (per research finding from v1.23.0 planning)
- v1.26.0 MINOR: Dcm services (0x14/0x19/0x22/0x2E/0x31) generator
- v1.24.x PATCH (future): add PHYSICAL-TYPE / SCALING / COMPU-METHOD to DID data