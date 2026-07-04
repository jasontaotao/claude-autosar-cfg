# v1.24.x PATCH — ODX-INSTANCE DID Data Design Spec

> **For agentic workers:** This is a design spec, not a plan. Use superpowers:writing-plans to author the implementation plan after this spec is approved.

**Date**: 2026-07-04
**Author**: brainstorming session
**Status**: PROPOSED — pending user approval
**Branch**: main (post v1.24.0 MINOR at tag v1.24.0)
**Baseline tests**: 2804 + 6 SKIP / 0 fail (post v1.24.0)

## Motivation

v1.24.0 MINOR shipped the ODX→Diagnostic Extract ARXML bridge. The bridge consumes a parsed `OdxSummary` (DTCs/DIDs/Routines) and produces 2 standalone ARXML files (`Dem_Extract.arxml` + `Dcm_Extract.arxml`). The release notes explicitly stated: "DID / Routine data (length, scaling, encoding) are not generated. Would require parsing ODX-INSTANCE elements from .odx-d; defer to v1.24.x PATCH."

v1.24.x PATCH closes that carry-over. The user pain point is real: diagnostic engineers who run the bridge then merge the output into their Dem/Dcm BSWMD still have to manually fill in the DID data type and encoding for each DcmDspDid. v1.24.x PATCH provides a partial fix — at minimum, the data type and encoding, so the engineer only has to fill in the BSWMD-specific details (event priorities, debounce, etc.).

User constraint (still applies): "只要ODX->arxml 就好了啊，不需要arxml 导出到odx". v1.24.x PATCH is purely additive; no reverse direction.

## Goals

1. **Parse ODX-INSTANCE DID data for 0x22 REQUESTS** — extend `parseOdxHandler` to extract `<DIAG-CODED-TYPE>` from the 0x22 REQUEST's DID-value PARAM (the PARAM that represents the DID itself, not SERVICE-ID or SUBFUNCTION).
2. **Extend `OdxDidSummary` with optional data field** — `data: { dataType, encoding, bitLength? } | undefined`. Optional to preserve backward compatibility with v1.22.0's 11 hand-crafted T1 tests.
3. **Emit `<DCM-DSP-DID-DATA>` block in mapper output** — when `data` is present, the mapper wraps the DID's data type + encoding in a `<DCM-DSP-DID-DATA>` block inside the `<DCM-DSP-DID>`.
4. **Real-OEM fixture regression test** — validate against `samples/odx/Demo_Cdd.odx-d` (Vector CANdelaStudio export, 34 DIDs). Pin concrete DIAG-CODED-TYPE values for 1-2 DIDs as the ship-blocking test.

## Non-Goals (explicit YAGNI)

- **No PHYSICAL-TYPE / SCALING / COMPU-METHOD** parsing. The user's chosen scope is "Data type + encoding"; scaling, bit position, and computation methods are deferred to a future PATCH (likely v1.24.x.x or v1.25.0).
- **No xsi:type disambiguation** (`STANDARD-LENGTH-TYPE` vs `LEADING-LENGTH-INFO-TYPE`). The `<BIT-LENGTH>` child element is sufficient for v1.24.x; the xsi:type is a Vector export detail.
- **No Routine data** (start/stop, request/response format). Deferred to v1.24.x.x PATCH or v1.26.0 MINOR.
- **No Dcm services (0x14/0x19/0x22/0x2E/0x31)** generation. v1.22.0's `OdxSummary` does not include service definitions; user adds manually post-merge.
- **No BSWMD merge helper**. Output remains standalone; merging is the user's existing toolchain.

## Scope

**In scope (v1.24.x PATCH)**:
- Extend `parseOdxHandler.extractDids` to walk 0x22 REQUEST's PARAMS and extract `<DIAG-CODED-TYPE>` from the DID-value PARAM
- Extend `OdxDidSummary` interface in `src/shared/types.ts` with optional `data` field
- Update `odxToDiagnosticExtract.buildDcmContent` to emit `<DCM-DSP-DID-DATA>` block when `data` is present
- Real-OEM fixture regression test (1-2 DIDs pinned) — ship-blocking
- Backward-compat: 11 existing T1 hand-crafted tests + 1 v1.22.0 / v1.24.0 unit test must all still pass
- Release notes + CHANGELOG + tag v1.24.x + gh release

**Out of scope (deferred to v1.24.x.x PATCH or v1.25.0 MINOR)**:
- PHYSICAL-TYPE / SCALING / COMPU-METHOD
- xsi:type disambiguation
- Routine data (start/stop, request/response)
- DID with multi-segment composite data (only single-segment DIDs handled)
- BSWMD merge helper
- Reverse direction (ARXML → ODX)

## Architecture

```
Real Vector .odx-d (.odx-d)
  ↓ parseOdxHandler (extended in T1)
  - When extracting 0x22 REQUEST, walk the PARAMS.
  - Find the PARAM that is NOT SERVICE-ID and NOT SUBFUNCTION
    (i.e., the DID-value PARAM).
  - Extract that PARAM's <DIAG-CODED-TYPE>:
      BASE-DATA-TYPE (e.g. "A_UINT32")
      BASE-TYPE-ENCODING (e.g. "NONE")
      optional <BIT-LENGTH> (e.g. 16)
  ↓ OdxDidSummary (extended with optional data field)
    { id, shortName, data?: { dataType, encoding, bitLength? } }
  ↓ odxToDiagnosticExtract.buildDcmContent (extended in T2)
    <DCM-DSP-DID>
      <SHORT-NAME>{shortName}</SHORT-NAME>
      <DCM-DSP-DID-DATA>  ← new block, only when data is present
        <DIAG-CODED-TYPE>{dataType}</DIAG-CODED-TYPE>
        <BASE-TYPE-ENCODING>{encoding}</BASE-TYPE-ENCODING>
        <BIT-LENGTH>{bitLength?}</BIT-LENGTH>
      </DCM-DSP-DID-DATA>
    </DCM-DSP-DID>
```

**Backward-compat invariant**: `data` is OPTIONAL in `OdxDidSummary`. v1.22.0's 11 hand-crafted T1 tests have DIDs without DIAG-CODED-TYPE → `data === undefined` → mapper emits `<DCM-DSP-DID>` with just `<SHORT-NAME>` (same as v1.24.0 behavior). No regression.

## Data mapping

### ODX-D DIAG-CODED-TYPE (per ISO 22901)

```xml
<DIAG-CODED-TYPE BASE-TYPE-ENCODING="NONE" BASE-DATA-TYPE="A_UINT32" xsi:type="STANDARD-LENGTH-TYPE">
  <BIT-LENGTH>16</BIT-LENGTH>
</DIAG-CODED-TYPE>
```

Fields we capture:
- `BASE-DATA-TYPE` (required): e.g. `A_UINT8`, `A_UINT16`, `A_UINT32`, `A_ASCIISTRING`, `A_FLOAT32`, etc.
- `BASE-TYPE-ENCODING` (required): e.g. `NONE-DEFINED`, `2C` (two's complement), `IEEE-FLOAT32`, etc.
- `<BIT-LENGTH>` (optional): bit length. If absent, omit from output.

### Generated ARXML

```xml
<DCM-DSP-DID>
  <SHORT-NAME>Did_F186</SHORT-NAME>
  <DCM-DSP-DID-DATA>
    <DIAG-CODED-TYPE>A_UINT32</DIAG-CODED-TYPE>
    <BASE-TYPE-ENCODING>NONE</BASE-TYPE-ENCODING>
    <BIT-LENGTH>16</BIT-LENGTH>
  </DCM-DSP-DID-DATA>
</DCM-DSP-DID>
```

When `data` is absent (legacy hand-crafted fixtures):

```xml
<DCM-DSP-DID>
  <SHORT-NAME>DID_VIN</SHORT-NAME>
</DCM-DSP-DID>
```

(Same as v1.24.0 behavior; no `<DCM-DSP-DID-DATA>` block.)

### ARXML envelope

No change from v1.24.0. The same `<AR-PACKAGES>` → `<AR-PACKAGE>` → `<ELEMENTS>` envelope wraps the DcmDspDid elements.

## Tasks (4 total)

### T1: Extend `parseOdxHandler` + `OdxDidSummary`

**Files**:
- Modify: `src/main/ipc/parseOdxHandler.ts` (extend `extractDids` to walk 0x22 REQUEST PARAMS and extract DIAG-CODED-TYPE)
- Modify: `src/shared/types.ts` (extend `OdxDidSummary` with optional `data` field + new `OdxDidData` interface)
- Modify: `src/main/ipc/__tests__/parseOdxHandler.test.ts` (extend T1 hand-crafted fixture with a 0x22 REQUEST that has DIAG-CODED-TYPE; **+4 new tests**)

**Tests** (4 new):
1. `extractDids surfaces DIAG-CODED-TYPE from 0x22 REQUEST's DID-value PARAM` (uses hand-crafted fixture with a 0x22 REQUEST)
2. `extractDids falls back gracefully when 0x22 REQUEST has no DIAG-CODED-TYPE` (e.g., a 0x22 REQUEST with only SERVICE-ID + SUBFUNCTION PARAMS)
3. `extractDids handles DIDs from <DID-OBJECT> (legacy spec shape) without DIAG-CODED-TYPE` (preserves v1.22.0 behavior)
4. `OdxDidSummary data field is correctly typed as optional` (compile-time check; assert a fixture with `data === undefined` and another with `data === { dataType, encoding, bitLength }`)

### T2: Update mapper + emit `<DCM-DSP-DID-DATA>` block

**Files**:
- Modify: `src/core/bridge/odxToDiagnosticExtract.ts` (extend `buildDcmContent` to emit `<DCM-DSP-DID-DATA>` when `data` is present)
- Modify: `src/core/bridge/__tests__/odxToDiagnosticExtract.test.ts` (**+3 new tests**)

**Tests** (3 new):
1. `emits <DCM-DSP-DID-DATA> with all 3 fields when data has bitLength`
2. `emits <DCM-DSP-DID-DATA> without <BIT-LENGTH> when data.bitLength is undefined`
3. `does NOT emit <DCM-DSP-DID-DATA> block when data is undefined (backward-compat)`

### T3: Real-OEM fixture regression test (ship-blocking)

**Files**:
- Modify: `src/main/ipc/__tests__/odxImportDiagnosticExtractHandler.real.test.ts` (extend existing v1.24.0 T4 test with DID data assertions) **OR** create a new `odxImportDiagnosticExtractHandler.real.did-data.test.ts` (**+1 new ship-blocking test**)

**Decision**: extend the existing T4 test (cleaner — single test file per real-OEM fixture). Add 1-2 new `it()` blocks for DID data regression.

**Tests** (1-2 new):
1. `DCM-DSP-DID-DATA populated from Demo_Cdd.odx-d's 0x22 REQUESTs` (verify 34 DIDs have `<DCM-DSP-DID-DATA>` blocks; verify at least 1 DID has expected DIAG-CODED-TYPE values)
2. `Specific DID F186 (or another known DID) has expected concrete DIAG-CODED-TYPE` (pin 1-2 DIDs to their exact BASE-DATA-TYPE + BASE-TYPE-ENCODING + BIT-LENGTH values)

### T4: Ship (release notes + tag + gh release)

**Files**:
- Create: `docs/release-notes/v1.24.x/README.md`
- Modify: `CHANGELOG.md` (add v1.24.x row above v1.24.0)
- Modify: `docs/user-manual.html` (bump baseline version to v1.24.x)
- New git tag: `v1.24.x` at the ship commit
- New GitHub release: `v1.24.x`

**Version number**: per project convention, v1.24.x is a placeholder. The implementer should confirm the final version number (likely v1.24.1 PATCH).

## Test plan

**T1 unit tests** (4 new):
- Hand-crafted fixture with 0x22 REQUEST that has DIAG-CODED-TYPE
- Fallback when 0x22 REQUEST has no DIAG-CODED-TYPE
- Legacy `<DID-OBJECT>` path preserved
- Type check for optional `data` field

**T2 unit tests** (3 new):
- DCM-DSP-DID-DATA with all 3 fields
- DCM-DSP-DID-DATA without BIT-LENGTH
- No DCM-DSP-DID-DATA when data is undefined (backward-compat)

**T3 real-OEM tests** (1-2 new):
- All 34 DIDs have DIAG-CODED-TYPE blocks
- 1-2 specific DIDs pinned to concrete values

**Backward-compat tests** (no new — must continue to pass):
- v1.22.0 T1 hand-crafted fixture: 11 tests
- v1.24.0 T1: 12 tests
- v1.24.0 T2: 8 tests
- v1.24.0 T3 + T3.1: 12 tests
- v1.24.0 T4: 2 tests
- Total: 47 existing tests must continue to pass

**Total new tests**: 8-9 (T1: 4, T2: 3, T3: 1-2). Net target: 2812-2813 + 6 SKIP / 0 fail.

## Success criteria

- [ ] pnpm type-check 0 errors (both `tsconfig.json` + `tsconfig.web.json`)
- [ ] pnpm lint 0 errors, 0 warnings
- [ ] pnpm format clean
- [ ] pnpm vitest 2812-2813 + 6 SKIP / 0 fail
- [ ] pnpm verify 7-stage GREEN
- [ ] T3 real-OEM test passes against `samples/odx/Demo_Cdd.odx-d`
- [ ] All 47 existing tests continue to pass (no regression)
- [ ] Code-review whole-branch 0C/0H/0M/0L (or all-MEDIUM-documentation per v1.22.0 precedent)
- [ ] Tag v1.24.x published; gh release live

## Risks

1. **PARAM classification for 0x22 REQUESTS**: 0x22 REQUESTS may have 1+ PARAMS (SERVICE-ID, SUBFUNCTION, DID-value, ...). The DID data is in the PARAM that is NOT SERVICE-ID and NOT SUBFUNCTION. This classification needs care. **Mitigation**: T1 implementer must inspect a real 0x22 REQUEST in `Demo_Cdd.odx-d` before coding (the T1 hand-crafted fixture doesn't have this complexity).
2. **Backward-compat with v1.22.0 T1 hand-crafted fixture**: the hand-crafted fixture's DIDs (DID_VIN, etc.) come from `<DID-OBJECT>` (legacy spec shape) which doesn't have DIAG-CODED-TYPE. So `data` will be undefined → mapper emits `<DCM-DSP-DID>` without data block (same as v1.24.0). **Mitigation**: `data` is OPTIONAL; mapper falls back gracefully.
3. **xsi:type not parsed**: `STANDARD-LENGTH-TYPE` vs `LEADING-LENGTH-INFO-TYPE` is a Vector export detail we don't capture. If user's BSWMD requires this, merge will report a schema error. **Mitigation**: documented as a future PATCH.
4. **i18n bypass pattern** (per v1.23.1 T1 L1 lesson + v1.24.0 T3.1 L1): if any diagnostic string is hardcoded English, the renderer breaks zh-CN. **Mitigation**: not applicable here (no user-facing diagnostic strings in v1.24.x PATCH — purely ARXML output). T2 mapper tests verify all output is XML-escaped.

## Cross-references

- v1.24.0 MINOR (predecessor, provides the bridge): `docs/release-notes/v1.24.0/README.md`
- v1.22.0 T1 (predecessor, ODX-D importer): `docs/release-notes/v1.22.0/README.md`
- v1.24.0 T1 (mapper, this PATCH extends): `src/core/bridge/odxToDiagnosticExtract.ts`
- v1.22.0 T1 + v1.24.0 T4 fix (parseOdxHandler, this PATCH extends): `src/main/ipc/parseOdxHandler.ts`
- Real-OEM fixture invariant: `~/.claude/projects/D--claude-proj2/memory/real-oem-fixture-required-for-vendor-format-work.md`
- v1.23.1 T1 L1 i18n-bypass lesson: applies if any user-facing strings (not the case here)

## Self-Review

1. **Spec coverage**: Goals 1-4 each have a component in Architecture. Non-goals explicit. Data mapping covers all 3 captured fields. Test plan covers all 4 tasks.
2. **Placeholder scan**: No "TBD" / "TODO" / "implement later" markers. All sed/test/code references are concrete.
3. **Type consistency**: `OdxDidSummary.data` is `OdxDidData | undefined`; `OdxDidData` has `dataType: string`, `encoding: string`, `bitLength?: number`. Mapper's `buildDcmContent` checks `did.data !== undefined` before emitting the data block.
4. **Scope check**: 4 tasks, ~8-9 new tests, 2 files modified + 1 new test file (or 1 file modified + 1 modified test file). Comparable to v1.23.0 PATCH (3 tasks) and v1.24.0 PATCH-es (which haven't shipped yet).
5. **Risk check**: All 4 risks have mitigations. The most critical is #1 (PARAM classification for 0x22 REQUESTS) — addressed by pre-flight inspection of a real REQUEST.

---

**Status**: PROPOSED — pending user approval. Will write implementation plan after this spec is approved.
