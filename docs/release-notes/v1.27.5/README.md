# v1.27.5 PATCH — Real-OEM End-to-End Test + BSWMD Fixture Completion

> **Ship date:** 2026-07-06
> **Commit:** _pending_
> **Tag:** v1.27.5
> **Baseline:** v1.27.4 PATCH (`547d6e4`)
> **Tests:** 2867 + 6 SKIP / 0 fail (+1 from v1.27.4's 2866)

## Summary

Adds the long-deferred real-OEM end-to-end coverage for `dcmConfigPipeline`,
which in turn **closes two latent BSWMD-fixture bugs that the new end-to-end
test surfaced on first run**:

1. `DcmDspRoutine` in the real-OEM BSWMD (`samples/comstack-existing-fixture/
   Dcm.bswmd.arxml`) lacked a `<REFERENCES>` block for `routineRef`. v1.27.2
   PATCH release notes claimed both demo-ecu + real-OEM got the enrichment
   but the in-file edit only added `<REFERENCES>` to `DcmDspDid`, not
   `DcmDspRoutine`. The end-to-end test's `set-param routineRef` step
   surfaced `param-not-found` on first run, exposing the gap.

2. `DcmDspDid.didRef`'s `<ECUC-REFERENCE-VALUE>` path in the real-OEM BSWMD
   used the demo-ecu package prefix (`/Dcm/DcmDspDid`) instead of the
   real-OEM AUTOSAR package prefix (`/AUTOSAR/Dcm/DcmDspDid`). Fixed to
   use `/AUTOSAR/...`.

The new test pins all of this for future regression.

## What's New

### T1 — Real-OEM end-to-end test

Added at `src/core/bridge/__tests__/dcmConfigPipeline.test.ts`:

```typescript
describe('dcmConfigPipeline — real-OEM end-to-end (v1.27.5)', () => {
  // 1. parseDemoBswmds against the real-OEM Dcm BSWMD fixture
  // 2. dcmConfigPipeline (ODX-Dcm linkage + extract)
  // 3. xlsxDcmServicesToEcucBatch → service PatchSteps
  // 4. applyPatchSteps to extract ARXML
  // 5. serializeArxml → finalXml
  // Asserts: ODX shortNames + xlsx service shortNames stitched,
  //          /AUTOSAR/ prefix on real-OEM DEFINITION-REFs
});
```

The test replicates the IPC handler's `applyPatchesToExtract` wrapper
(dcmConfigHandler.ts:125-184, function-scoped internal) — i.e., the
prefix-strip step that prepends `/<docRootPkg>/` to step paths, plus
`serializeArxml({sourceArxml})` for namespace preservation. Both
behaviors are required for end-to-end correctness, neither is on the
public `applyPatchSteps` API surface.

Pre-v1.27.5, the v1.27.0 T5 cross-vendor invariant was exercised at
the MAPPER level only (mapper invariant — same canonical container
shortName regardless of BSWMD provenance). The full orchestrator-link-
mutate-serialize sequence had no end-to-end test. The two latent
fixture bugs above went unnoticed because mapper unit tests don't
actually apply + serialize the merged ARXML.

**Future refactor opportunity (v1.28.0 MINOR scope):** the
`applyPatchesToExtract` wrapper is duplicated in the test (10 LoC).
Extracting it to a shared module (e.g. `src/core/arxml/extractPatch.ts`)
that both the IPC handler and the test import would remove the
duplication. Marked as deferral in the test comment block.

### T2 — Real-OEM BSWMD fixture completion

Added `<REFERENCES>` block for `routineRef` on `<DcmDspRoutine>` AND
corrected `<ECUC-REFERENCE-VALUE>` path prefix on `<didRef>` from
`/Dcm/DcmDspDid` to `/AUTOSAR/Dcm/DcmDspDid` in `samples/comstack-
existing-fixture/Dcm.bswmd.arxml`. Both edits close latent gaps from
v1.27.2 PATCH's partial-fixture-enrichment.

## Why module-level over shared/

N/A — v1.27.5 closes test + BSWMD fixture gaps. No cross-folder exports.

## Error handling

No change. Inherits the v1.27.2 fail-fast posture + spec §275. The
new test itself exercises the fail-fast path: pre-fix, the
`set-param routineRef` step hit `param-not-found` and the end-to-end
test surfaced it. Post-fix, all 4 applied, no errors.

## Migration Notes

No breaking changes to user-facing IPC. Behavior identical to v1.27.4
for users running the demo-ecu pipeline. Real-OEM users gain: the
real-OEM Dcm BSWMD now produces a structurally correct merged ARXML
when fed through the full pipeline; pre-v1.27.5, the routine-reference
half was silently missing because the BSWMD didn't declare the
reference even though the mapper was emitting `set-param routineRef`
against it.

For users on v1.27.0 / v1.27.1 / v1.27.2 / v1.27.3 / v1.27.4:
- Test count delta: +1 (2866 → 2867).
- Real-OEM Dcm BSWMD fixture: now declares `routineRef` on
  `DcmDspRoutine` (matches demo-ecu's `<REFERENCES>` shape); corrects
  `didRef` value path from demo-ecu prefix to AUTOSAR prefix.

## Out of Scope (deferred)

- **`applyPatchesToExtract` wrapper extraction** to a shared module —
  test currently duplicates the 10 LoC of prefix-strip logic. Tracked
  for v1.28.0 MINOR; non-trivial because `dcmConfigHandler.ts:125-184`
  exposes this as a function-scoped internal, and exporting it would
  be an IPC-supporting module-surface decision (not a PATCH-scope
  refactor).

- **`dcmConfigHandler` real-OEM BSWMD override path** — IPC handler
  currently hard-codes the demo-ecu fixture lookup at
  `dcmConfigHandler.ts:265-275` (`Bsw_Dcm_Bswmd.arxml`). Adding a
  `bswmdPath` arg to extend the IPC surface to accept real-OEM BSWMD
  is an IPC API change. Tracked for v1.28.0 MINOR.

- **`DcmConfigHandlerResult` applied counter** — extend IPC result
  envelope with `{added, overwritten, skipped}` (mirror Com-stack).
  IPC API shape change. Tracked for v1.28.0 MINOR.

- **`stripBswmdPackageRoot` helper consolidation** — single-site use
  in `xlsxToEcucBatch.ts:71`; YAGNI per CLAUDE.md `coding-style.md`.
  The real consolidation opportunity is **mapper-shape alignment**
  between Dcm (`parentPath: moduleShortName` + `definitionRef`) and
  Com-stack (`parentPath: stripped-path`) — bundle into v1.28.0 MINOR.

## Test Results

- pnpm format: clean (1 autofix round on `dcmConfigPipeline.test.ts`
  after the new imports were added — same pattern as v1.27.3/v1.27.4)
- pnpm lint: 0 errors (1 import-order autofix round on
  `dcmConfigPipeline.test.ts`)
- pnpm type-check: 0 errors (both `tsconfig.json` + `tsconfig.web.json`)
- pnpm vitest: **2867 + 6 SKIP / 0 fail** (+1 from v1.27.4's 2866)
- pnpm verify: 7-stage GREEN
- Exit code: 0

## Next Steps

- **v1.27.6 PATCH (optional)** — same pattern if any further
  `applyPatchesToExtract` bugs surface.
- **v1.28.0 MINOR** — long-term follow-ups: extract
  `applyPatchesToExtract` to shared module; mapper-shape alignment
  (Dcm vs Com-stack); `dcmConfigHandler` real-OEM override path;
  `DcmConfigHandlerResult` applied counter; `stripBswmdPackageRoot`
  helper (or skip if mapper-shape alignment supersedes).
