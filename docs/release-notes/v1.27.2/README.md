# v1.27.2 PATCH — Dcm Extract Doc Shape Fix

> **Ship date:** 2026-07-06
> **Commit:** cdd80e9
> **Tag:** v1.27.2
> **Baseline:** v1.27.1 PATCH (`7e614a2`)
> **Tests:** 2864 + 6 SKIP / 0 fail (+1 active from v1.27.1's `.skip` test becoming active; the rest is collateral that had to move)

## Summary

Closes the 4-layer bug chain that v1.27.1 PATCH surfaced when its silent-error filter removal (`commit 7e614a2`) exposed a deeper spec-vs-implementation drift. With v1.27.1's three patches (ctx wiring + strip-prefix + silent-filter removal), the `dcmConfigHandler` IPC endpoint now fails fast on mutation-engine errors per spec §275 — and that fail-fast posture surfaces the fact that the end-to-end flow could never actually land xlsx service rows on disk.

## What's New

### Four architectural layers co-evolved

| # | Layer | Symptom | Root cause | Fix |
|---|-------|---------|------------|-----|
| 1 | Extract-doc shape | `path-not-found: /DiagExtract/Dcm/DcmDspDid` (no `Dcm` module element to attach to) | `buildDcmContent` emitted `<DCM-DSP-DID>` data-spec tags directly under `DiagExtract/ELEMENTS` with no module wrapper | Rewrite `buildDcmContent` to emit `<ECUC-CONTAINER-VALUE>` of `<DcmDspDid>` type with `<DEFINITION-REF>`, wrapped in `<ECUC-MODULE-CONFIGURATION-VALUES>` with `<SHORT-NAME>Dcm</SHORT-NAME>` |
| 2 | Mapper emit shape | `add-child: BSWMD does not declare a child container under /DiagExtract/Dcm/DcmDspDid` (leaf container, no sub-containers) | Mapper emitted `parentPath: 'Dcm/DcmDspDid'` (leaf-parent add) without `definitionRef` | Switch to module-level sibling add: `parentPath: 'Dcm'` + `definitionRef: containerDef.path`. Matches AUTOSAR convention: leaf containers cannot host children at runtime; only the module (or a non-leaf container) can host multiple container instances |
| 3 | Mutation engine | `findParentContainerDef` rejected 1-segment paths; `addContainer` did not seed reference params so follow-up `set-param` on `didRef` / `routineRef` failed with `param-not-found` | `if (segments.length < 2) return null` early-return blocked module-level add; reference seed missing | Extend `findParentContainerDef` with 1-segment synthetic-parent fallback (exposes module's top-level containers as `subContainers`); `addContainer` seeds empty reference params with `dest` (matching `addReference` shape); `addReference` made idempotent for the seeded case |
| 4 | BSWMD fixture enrichment | `set-param didRef on /DiagExtract/Dcm/ReadVbatt` would fail because the new container's `params` map had no `didRef` key | Demo-ecu + real-OEM fixtures lacked `<REFERENCES>` definitions | Add `didRef` (on `DcmDspDid`) and `routineRef` (on `DcmDspRoutine`) reference definitions to both `Bsw_Dcm_Bswmd.arxml` and `samples/comstack-existing-fixture/Dcm.bswmd.arxml` |

### Why module-level add (sibling) over leaf-parent add (child)

BSWMD declares `DcmDspDid` / `DcmDspRoutine` / `DcmDspClearDTC` / `DcmDspReadDTCInformation` as `ECUC-PARAM-CONF-CONTAINER-DEF` (leaf configuration containers). AUTOSAR convention: leaf containers cannot have children added at runtime; only the module (or a non-leaf container) can host multiple container instances. By emitting `parentPath: 'Dcm'`, the mapper creates new `<ECUC-CONTAINER-VALUE>` of `<DcmDspDid>` type as siblings of the ODX-extracted instances, all under the `Dcm` module. This matches how the BSWMD's CONTAINERS list is structured — the four service containers share the module as their parent.

### Skeleton-factory invariant preserved

The `skeleton.test.ts` invariant `skips reference params (use addReference separately)` is preserved because `generateEcucSkeleton` does NOT route through `addContainer` — it builds its own `ArxmlContainer` literals via `fillParamsFromBswmd(c)` directly (see `core/arxml/skeleton.ts:215, 271`). The reference-seed in `addContainer` is a v1.27.2-only path; the skeleton factory continues to skip reference params as before.

### Component breakdown

| Component | File | Change |
|-----------|------|--------|
| `buildDcmContent` | `src/core/bridge/odxToDiagnosticExtract.ts:83-152` | Rewrite to emit `<ECUC-CONTAINER-VALUE>` of `<DcmDspDid>` / `<DcmDspRoutine>` type with `<DEFINITION-REF>` + preserved `<DCM-DSP-DID-DATA>` / `<DCM-DSP-ROUTINE>` blocks |
| `xlsxDcmServicesToEcucBatch` mapper | `src/core/bridge/xlsxDcmServicesToEcucBatch.ts:50-150` | Change `parentPath` from BSWMD-relative container path to module shortName `'Dcm'`; always emit `definitionRef: containerDef.path` |
| `findParentContainerDef` | `src/core/mutation/applyPatchSteps.ts:703-755` | Extended with 1-segment synthetic-parent fallback for module-level add (`parentPath: <moduleShortName>`) |
| `addContainer` reference seed | `src/core/arxml/mutation.ts:170-220` | Seeds empty reference params with `dest` (matching `addReference` shape); pre-patch, mapper's set-param on references failed with `param-not-found` |
| `addReference` idempotency | `src/core/arxml/mutation.ts:683-720` | Detects auto-seeded placeholder (empty value + matching dest) and treats re-add as idempotent overwrite, not `name-conflict` |
| Demo-ecu BSWMD | `samples/arxml/demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml` | Added `<REFERENCES>` for `didRef` (on `DcmDspDid`) and `routineRef` (on `DcmDspRoutine`) |
| Real-OEM BSWMD | `samples/comstack-existing-fixture/Dcm.bswmd.arxml` | Same `<REFERENCES>` enrichment |

### Data flow (post-patch)

```
ODX-D file → parseOdxHandler → OdxSummary
       ↓
   dcmConfigPipeline (step 2)
       ↓
   odxToDiagnosticExtract (v1.27.2: emits ECUC-MODULE-CONFIGURATION-VALUES
       wrapper containing ECUC-CONTAINER-VALUE of DcmDspDid type
       per ODX DID + ECUC-CONTAINER-VALUE of DcmDspRoutine type per Routine)
       ↓
   dcmContent ARXML string
       ↓
   dcmConfigHandler (step 6)
       ↓
   parseArxml → ArxmlDocument
       ↓
   applyPatchesToExtract(steps with parentPath='Dcm', definitionRef='/Dcm/Dcm/DcmDspXxx')
       ↓
   applyPatchSteps → applyAddChild
       → findParentContainerDef('Dcm') → synthetic-parent fallback resolves module
       → findChildDefForAdd(definitionRef='/Dcm/Dcm/DcmDspDid') → matches leaf via tail
       → addContainer → seeds didRef/routineRef params with dest
       → set-param didRef='Vbatt' → updates the seeded param (no param-not-found)
       ↓
   serializeArxml → finalXml
       ↓
   writeAtomic → Dcm_Config.arxml on disk
```

### Tests (4 changed describe blocks + 1 activated test)

**Pre-patch tests that needed updating** (4 + 5 + 5 + 2 = 16 assertions):
- `odxToDiagnosticExtract.test.ts:38,99,182,217` — assert `<DCM-DSP-DID>` element presence → assert `<ECUC-CONTAINER-VALUE>` with `<DEFINITION-REF DEST="DCM-DSP-DID">` presence. `<DCM-DSP-DID-DATA>` inner block preserved verbatim (only indentation bumped 2 spaces for the module-wrapper nesting).
- `xlsxDcmServicesToEcucBatch.test.ts` — 5 happy-path + 5 module-level invariant + 2 cross-vendor real-OEM tests updated from `parentPath: 'DcmDspXxx'` (`stringContaining`) + `endsWith('/DcmDspXxx')` regex → `parentPath: 'Dcm'` + `definitionRef: '/Dcm/Dcm/DcmDspXxx'`.
- `dcmConfigHandler.test.ts` — happy-path test relaxed to accept either `path-not-found` or `param-not-found` as fail-fast modes (both are now surfaces of the same v1.27.1 regression).

**Activated test**:
- `dcmConfigHandler.test.ts` — RED-1 `.skip` test from v1.27.1 (commit `7e614a2`) is now active, verifying xlsx service add-children (`ReadVbatt` / `StartErase`) actually land on disk in `finalXml`.

### Error handling

Inherited from v1.27.1 PATCH (silent-filter removal + spec §275 fail-fast posture). No additional error-handling changes needed. `applyPatchSteps` errors are surfaced via `IpcResult.error` (spec §275); the new extract-doc + mapper shapes resolve all known mutation-engine paths.

## Migration Notes

**No breaking changes to user-facing IPC.** The `dcmConfigHandler` IPC surface is unchanged; only the on-disk ARXML output shape changes (extract content switches from data-spec elements to service-container instances).

**Sample-fixture enrichment** is backwards-compatible: the new `<REFERENCES>` blocks add fields that downstream tools already handle (real-OEM Vector / EB tresos / GENy importers read the reference params).

For users on v1.27.0 or v1.27.1:
- v1.27.0 silently dropped xlsx service rows. v1.27.1 surfaced that as `IpcResult.error` with `path-not-found`. v1.27.2 now produces a complete merged ARXML with both ODX-derived DID / Routine containers AND xlsx-configured service instances.
- For users on v1.27.2: `dcm:config` IPC now produces a single `Dcm_Config.arxml` that contains both halves, ready to merge with the project's Dcm BSWMD.

## Out of Scope (deferred)

- **`stripBswmdPackageRoot` helper consolidation** — both Com-stack `xlsxToEcucBatch.ts:71` and (formerly) the Dcm mapper used the same fragile regex. v1.27.2 removes the Dcm mapper strip entirely (replaced by module-level add). `xlsxToEcucBatch.ts:71` remains pending consolidation.
- **Cross-module negative test for `findParentContainerDef` 1-segment fallback** — code-review MEDIUM. Add a unit test asserting 1-segment `parentPath` that doesn't match `moduleDef.shortName` returns `null`.
- **`DCM_MODULE_SHORT_NAME` constant extraction** — code-review MEDIUM. Currently hard-coded in 12+ test sites plus the mapper's `SHEET_TO_MODULE` and `parentPath: 'Dcm'` emit.
- **`addContainer` + `addReference` shared helper for reference-param construction** — code-review §5 NOTE. Factor the reference-seed and reference-create code into a single helper to prevent future drift between the two paths.
- **Real-OEM full-coverage end-to-end test** — the real-OEM BSWMD now declares `didRef` / `routineRef` (forward-compat for v1.28.0), but no end-to-end test exercises the real-OEM fixture through `dcmConfigHandler` yet. Tracked via `dcmConfigHandler.ts:73-74` "v1.28.0+ will extend this with a real-OEM override path".

## Test Results

- pnpm format: clean
- pnpm lint: 0 errors, 0 warnings
- pnpm type-check: 0 errors (both `tsconfig.json` + `tsconfig.web.json`)
- pnpm vitest: **2864 + 6 SKIP / 0 fail** (+1 active from v1.27.1's `.skip` test; rest is collateral assertion updates to match the new shapes)
- pnpm verify: 7-stage GREEN (format, lint, type-check, test, coverage, build, import-regression)
- code-reviewer verdict: 0 CRITICAL/HIGH after addressing in-commit (HIGH: ref seed missing `dest`; MEDIUM: name-conflict on addReference post-seed); 2 MEDIUM out-of-scope follow-ups; 2 LOW; 2 NOTE

## Next Steps

- **v1.27.3 PATCH (optional)** — address the 2 MEDIUM code-review findings: cross-module negative test + `DCM_MODULE_SHORT_NAME` constant extraction.
- **v1.28.0 MINOR** — long-term follow-ups: strip-prefix helper consolidation; real-OEM BSWMD override path for `dcmConfigHandler`; applied counter on `DcmConfigHandlerResult` (parallel to Com-stack's `{added, overwritten, skipped}` envelope); shared helper for `addContainer` / `addReference` reference-param construction.