# v1.27.2 PATCH — Dcm Extract Doc Shape Fix Design Spec

> **Status:** DRAFT (user approved 2026-07-06 — "可以,动手改吧")
> **Goal:** Fix `odxToDiagnosticExtract.buildDcmContent` shape so that v1.27.0's xlsx mapper `add-child` resolves against the extract doc end-to-end. This is the deeper spec drift exposed (but NOT closed) by v1.27.1's silent-filter bug chain closure (commit `7e614a2`).

## Background

v1.27.1 PATCH closed the silent-filter / ctx / strip-prefix bug chain that hid the Dcm config IPC's broken end-to-end behavior. With those fixes applied, the next defect surfaced:

- `odxToDiagnosticExtract.buildDcmContent` emits `<DCM-DSP-DID>` data-spec tags (AUTOSAR canonical data element).
- v1.27.0 spec §96 mandates "DIDs + Routines as `<DcmDspDid>`/`<DcmDspRoutine>` elements" — i.e. service container instances, not data-spec elements.
- v1.27.0 mapper (`xlsxDcmServicesToEcucBatch`) emits `add-child` to `Dcm/DcmDspDid` parent. BSWMD's `DcmDspDid` is an `ECUC-PARAM-CONF-CONTAINER-DEF` (leaf, no sub-containers), so `findChildDefForAdd` cannot find a child def to add and returns `path-not-found`. The mapper also does not emit `definitionRef`, so the permissive fallback (`subContainers[0] ?? choices[0]`) fails too.
- Even if extract doc had `<DcmDspDid>` containers, the mapper's `add-child` to a leaf-container parent would never resolve. The mapper design assumes a non-leaf parent that doesn't exist in either BSWMD or extract doc.

The v1.27.1 PATCH shipped a `.skip` test (`xlsx service add-children actually land on disk (RED-1 deeper spec drift)`) that documents this defect and the activation protocol for the follow-up PATCH. v1.27.2 closes it.

## Design

### Architecture (3 changes)

1. **`buildDcmContent` output shape**: switch from `<DCM-DSP-DID>` data-spec elements to `<ECUC-CONTAINER-VALUE>` service-container instances of `<DcmDspDid>` type, placed as direct children of the `DiagExtract` package's `ELEMENTS` (i.e. as siblings of each other, not wrapped in a `<DcmDsp>` collection). Each `<ECUC-CONTAINER-VALUE>` carries:
   - `<SHORT-NAME>` = ODX DID shortName (preserves identity from ODX)
   - `<DEFINITION-REF DEST="DCM-DSP-DID">/Dcm/DcmDspDid</DEFINITION-REF>` — the BSWMD-side definition hint
   - `<DCM-DSP-DID-DATA>` block preserved verbatim (BASE-DATA-TYPE / BASE-TYPE-ENCODING / BIT-LENGTH from v1.24.x PATCH)
   - Same applies to Routines → `<ECUC-CONTAINER-VALUE>` of `<DcmDspRoutine>` type with `<DCM-DSP-ROUTINE>` data block preserved.

2. **`xlsxDcmServicesToEcucBatch` emit shape**: switch `parentPath` from `Dcm/DcmDspDid` (the leaf type) to `Dcm` (module shortName, module-level add), and **always emit `definitionRef`** pointing at the canonical BSWMD container def (e.g. `/Dcm/DcmDspDid` for DcmReadDataById). The mutation engine's `findParentContainerDef` already handles module-level parents via a synthetic-parent fallback (`applyPatchSteps.ts:714-732`), so this resolves correctly. The `definitionRef` tells `findChildDefForAdd` which child def to instantiate, side-stepping the leaf-container's empty `subContainers` / `choices`.

3. **Test assertion updates**: 4 `odxToDiagnosticExtract.test.ts` assertions update from `<DCM-DSP-DID>` element presence to `<ECUC-CONTAINER-VALUE>` with `<DEFINITION-REF DEST="DCM-DSP-DID">` presence. The 5 `xlsxDcmServicesToEcucBatch.test.ts` invariant tests update from `parentPath.endsWith('/DcmDspDid')` to `parentPath === 'Dcm'` + `definitionRef === '/Dcm/DcmDspDid'` (and analogous for the other 4 sheet kinds).

### Why module-level add (sibling) over DcmDspDid-parent add (child)

BSWMD declares `DcmDspDid` as an `ECUC-PARAM-CONF-CONTAINER-DEF` — a leaf configuration container. AUTOSAR convention: leaf containers cannot have children added at runtime; only the module (or a non-leaf container) can host multiple container instances. By emitting `parentPath: 'Dcm'`, the mapper creates new `<ECUC-CONTAINER-VALUE>` of `<DcmDspDid>` type as siblings of the ODX-extracted instances, all under the `Dcm` module. This matches how `DcmDspClearDTC` / `DcmDspDid` / `DcmDspRoutine` / `DcmDspReadDTCInformation` are siblings in the BSWMD CONTAINERS list — they share the module as their parent.

### Component breakdown

| Component                           | File                                                                     | Change                                                                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `buildDcmContent`                   | `src/core/bridge/odxToDiagnosticExtract.ts:83-103`                       | Rewrite to emit `<ECUC-CONTAINER-VALUE>` of `<DcmDspDid>` type (and `<DcmDspRoutine>` for Routines), with `<DEFINITION-REF>` + preserved `<DCM-DSP-DID-DATA>` / `<DCM-DSP-ROUTINE>` blocks |
| `xlsxDcmServicesToEcucBatch` mapper | `src/core/bridge/xlsxDcmServicesToEcucBatch.ts:50-100`                   | Change `parentPath` from `containerDef.path.replace(/^\/[^/]+\//, '')` to module shortName `'Dcm'`; always emit `definitionRef` per row's SHEET_TO_CONTAINER_SHORT_NAME mapping            |
| Mapper invariant tests              | `src/core/bridge/__tests__/xlsxDcmServicesToEcucBatch.test.ts:151-179`   | Update 5 invariant tests: `parentPath === 'Dcm'` + `definitionRef === '/Dcm/<canonical>'`                                                                                                  |
| Extract tests                       | `src/core/bridge/__tests__/odxToDiagnosticExtract.test.ts:38,95,167,187` | Update 4 assertions: from `<DCM-DSP-DID>` element presence to `<ECUC-CONTAINER-VALUE>` with `<DEFINITION-REF DEST="DCM-DSP-DID">` presence; preserve data-block assertions                 |
| Dcm config handler test             | `src/main/ipc/__tests__/dcmConfigHandler.test.ts`                        | Activate `.skip` RED-1 test (`.skip` → active). Verify xlsx service add-children land on disk (`ReadVbatt` / `StartErase` in `finalXml`).                                                  |

### Data flow

```
ODX-D file → parseOdxHandler → OdxSummary
       ↓
   dcmConfigPipeline (step 2)
       ↓
   odxToDiagnosticExtract (post-fix: emits ECUC-CONTAINER-VALUE of DcmDspDid type)
       ↓
   dcmContent ARXML string (DiagExtract package, ECUC-CONTAINER-VALUE children)
       ↓
   dcmConfigHandler (step 6)
       ↓
   parseArxml → ArxmlDocument
       ↓
   applyPatchesToExtract(mapper steps with parentPath='Dcm', definitionRef='/Dcm/DcmDspDid')
       ↓
   applyPatchSteps → applyAddChild (synthetic parent fallback resolves Dcm module)
                    → findChildDefForAdd matches definitionRef → adds ECUC-CONTAINER-VALUE as sibling
       ↓
   serializeArxml → finalXml (DiagExtract with ODX-extracted + xlsx-added ECUC-CONTAINER-VALUEs)
       ↓
   writeAtomic → Dcm_Config.arxml on disk
```

### Error handling

Same as v1.27.1 PATCH (silent-filter removed in commit `7e614a2`; spec §275 fail-fast posture preserved). Any non-empty patch-error set now surfaces via `IpcResult.error` instead of being silently swallowed. No additional error-handling changes needed.

### Testing

**Pre-patch tests that need updating** (4 + 5):

- `odxToDiagnosticExtract.test.ts:38,95,167,187` — assert `<DCM-DSP-DID>` element presence → update to assert `<ECUC-CONTAINER-VALUE>` with `<DEFINITION-REF>` presence.
- `xlsxDcmServicesToEcucBatch.test.ts:151-179` — assert `parentPath.endsWith('/DcmDspDid')` → update to `parentPath === 'Dcm'` + `definitionRef === '/Dcm/DcmDspDid'`.

**New / activated tests**:

- `dcmConfigHandler.test.ts` — activate the v1.27.1 `.skip` RED-1 test ("xlsx service add-children actually land on disk"). Verify `ReadVbatt` / `StartErase` appear in `finalXml`. Snapshot rollback still required.
- `xlsxDcmServicesToEcucBatch.test.ts` — strengthen invariant tests with explicit `definitionRef` assertions.

**verify 7-stage**: must remain ALL GREEN (format, lint, type-check, test, coverage, build, import-regression).

## Out of Scope (deferred)

- **`stripBswmdPackageRoot` helper consolidation** — both `xlsxToEcucBatch.ts:71` and (formerly) `xlsxDcmServicesToEcucBatch.ts:80` used the same fragile regex. v1.27.2 removes the `xlsxDcmServicesToEcucBatch` strip entirely (replaced by module-level add). `xlsxToEcucBatch.ts:71` remains pending consolidation.
- **Renderer-side `applied` counter on `DcmConfigHandlerResult`** — would let the UI distinguish "0 patches applied" from "no xlsx rows in input". v1.28.0 MINOR candidate.
- **Real-OEM BSWMD override path** — v1.27.0 spec §75 deferred to v1.28.0+.

## Migration Notes

**No breaking changes to user-facing IPC.** The `dcmConfigHandler` IPC surface is unchanged; only the on-disk ARXML output shape changes (extract content switches from data-spec elements to service-container instances).

**Test fixture updates** (4 `odxToDiagnosticExtract.test.ts` assertions): the round-trip assertion text changes from `<DCM-DSP-DID>` substring to `<ECUC-CONTAINER-VALUE>` substring. The semantic content (DID count, data-block fields) is preserved.

**Backwards compatibility for the 4-surface test fixture** (`samples/odx/Demo_Cdd.odx-d` regression test): the `import-round-trip.test.ts` regression test only asserts content presence (DIDs/Routines survive the round-trip), not element names, so it should pass unchanged. To be verified during GREEN.

## Next Steps (post-merge)

1. v1.27.2 PATCH ships (this design) → activates RED-1 test + closes the spec drift.
2. v1.28.0 MINOR: long-term follow-ups per v1.27.1 PATCH release notes (strip-prefix helper, real-OEM BSWMD override, applied counter on result envelope).
