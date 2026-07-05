# v1.25.0 Errata — Integer-default Concern Re-attributed + Fixed

> **Errata date:** 2026-07-05
> **Applies to:** v1.25.0 MINOR (`980d04a0acdee8652a1610dd2edcaf202dc190b4`)
> **Status:** Root cause FIXED in v1.25.1 PATCH (path-prefix in `xlsxEcucBatchImportHandler`).
> **Replacement:** See corrected "Known Issues" entry in [README.md](./README.md).

## Background

The v1.25.0 release notes' "Known Issues" section flagged an "Integer-default cosmetic" concern. The PKM permanent note recorded this as a latent `applySetParam` integer no-op that v1.25.x PATCH T2 was meant to fix.

## T2 Diagnostic

T2 of v1.25.x PATCH executed a diagnose-first approach (per T4 misdiagnosis lesson):

1. Wrote the diagnostic test `src/core/__tests__/c1-integer-default-diagnostic.test.ts` that exercises the FULL pipeline end-to-end on an integer-default param fixture (`ComPduId` with `DEFAULT-VALUE=0`; user encodes `ComPduId=1`).
2. Ran the diagnostic and captured console.log output.

## Diagnostic Findings (T2 Stage 1)

The diagnostic test PASSES when the engine receives faithfully-aligned paths:

| Surface | Behavior |
| --- | --- |
| `xlsxToEcucBatch` mapper | Emits `set-param` for every non-null param value, including `ComPduId=1`. ✅ |
| `applyPatchSteps.applySetParam` | Reports `applied === 1` when post-call value differs from pre-call value. ✅ |
| `serializeArxml` | Does NOT omit `<VALUE>` based on BSWMD-default equality (verified by grep — no `defaultValue` references in `core/arxml/serializer.ts`). ✅ |
| End-to-end (with faithful paths) | `ComPduId=1` lands as `<VALUE>1</VALUE>` in serialized ARXML. ✅ |

**Conclusion**: T4's attribution to `applySetParam` integer no-op was a **misdiagnosis**. The engine and serializer layers are functionally correct.

## Actual Root Cause (T2 Stage 2 — re-attribution + fix)

While the diagnostic test (with paths hand-aligned to the engine's expectations) passes, a separate probe run against the production IPC handler path revealed the **real** cause of the v1.25.0 integer-default behavior:

- The IPC handler `xlsxEcucBatchImportHandler.ts` runs `translateStepPath` on mapper output, which case-translates BSWMD segment names and strips the leaf container-def segment — but does NOT prefix the resulting `containerPath` with the doc's root-package anchor.
- The engine's `findContainerByPath` (`core/project/setters.ts:47-81`) reconstructs doc paths starting with `/<pkg.shortName>` (e.g., `/Com`) and uses strict equality `myPath === path`.
- Strict equality fails when the step's `containerPath` lacks the leading-`/` prefix, so every `set-param` step after `add-child` rejects with `path-not-found`.
- The container is still created (via `add-child`) with BSWMD-derived defaults via `fillParamsFromBswmd`, which is why the v1.25.0 75-row ship-blocking test passes its textual-pin assertion (`<VALUE>SEND</VALUE>` matches the BSWMD `<DEFAULT-VALUE>SEND</DEFAULT-VALUE>` for `ComIPduDirection`) despite the `set-param` step failing silently.

The 75-row test intentionally does not pin numeric param values (see test comment at lines 178-185 of `xlsxEcucBatchImportHandler.real.test.ts`), so the integer-default regression was masked by the textual/enum default-equality coincidence.

## Fix (T2-AMP Scope Expansion)

After re-attribution, v1.25.x PATCH T2 was expanded (with user approval) to apply the fix in-scope. The fix lives in `src/main/ipc/xlsxEcucBatchImportHandler.ts`:

- New helper `prefixDocRootPath(step, docRootPkg)` prepends `/<docRootPkg>/` to every step's `containerPath` / `parentPath`.
- `applyStepsToFile` now resolves `docRes.value.packages[0].shortName` (the doc's root AR-PACKAGE) and applies `prefixDocRootPath` to every step before `applyPatchSteps`.

The fix is doc-aware (uses each doc's actual root package, not a hardcoded `AUTOSAR` constant) — so it works for both the demo project (pkg `Com`) and the 75-row fixture (also pkg `Com`), and any future AUTOSAR project regardless of root package name.

## Resolution

**Bug FIXED in v1.25.1 PATCH.** The path-prefix bug is corrected. The diagnostic + regression tests both pass:

| Test | Pre-fix | Post-fix |
| --- | --- | --- |
| `c1-integer-default-diagnostic.test.ts` | PASS (with hand-aligned paths) | PASS |
| `xlsxEcucBatchImportHandler.real.test.ts` T2 regression (`ComPduId=1`) | FAIL (path-not-found) | PASS |
| `xlsxEcucBatchImportHandler.real.test.ts` 75-row ship-blocking | PASS (masked bug) | PASS |
| `dbcImportComStackHandler.test.ts` (10 tests) | PASS | PASS |

## Follow-up (deferred to v1.25.x PATCH T3)

The demo-ecu BSWMD currently declares `ComPduId` without `<DEFAULT-VALUE>0</DEFAULT-VALUE>`. After the T2 fix, `fillParamsFromBswmd` still returns an empty params map for the new container — so set-param against the demo BSWMD surfaces `param-not-found` (correctly, no longer masked by path-not-found). T3 will add `<DEFAULT-VALUE>` blocks to the demo BSWMDs so users get a fully-working demo out of the box.

## Test Summary

- Diagnostic test (engine + serializer surface): PASS
- Regression test appended (IPC handler integration boundary): PASS (was EXPECTED FAIL per initial Branch D; now GREEN post-fix)
- Full suite: 2833 + 6 SKIP / 0 fail (+2 net from v1.25.0's 2831 baseline)
- Type-check: 0 errors
- Lint: 0 errors
- Format: clean

---

## Addendum (2026-07-05) — v1.25.1 T3 Misnomer Reverted in v1.25.2 PATCH

> **Addendum date:** 2026-07-05
> **Cross-reference:** [v1.25.2 PATCH release notes](../v1.25.2/README.md) (commit `49ef5d9` + `ab10d95`)

### Re-attribution

This errata originally documented v1.25.1 PATCH T2 (path-prefix fix) as the resolution to the integer-default concern. v1.25.1 PATCH T3 was treated as a separate, additive DX-only enrichment — 3 demo BSWMDs now declare all 5 Com-stack kinds × ≥3 params × `<DEFAULT-VALUE>` blocks. T3 was framed as a "known consequence" for v1.25.1: the bridge mapper's hardcoded path was said to be misaligned with the T3-enriched BSWMD's container name.

The framing was inverted. The actual situation:

| Surface | Path used | Source |
| --- | --- | --- |
| `xlsxToEcucBatch.ts:24` (mapper) | `PduR/PduRRoutingPaths/PduRRoutingPath` | Production code (pre-v1.25.1) |
| `samples/arxml/demo-ecu/PduR_Config.arxml` (value file) | `PduRRoutingPaths` | Pre-v1.25.1 demo |
| `samples/comstack-existing-fixture/PduR.bswmd.arxml:20` (real-OEM fixture) | `PduRRoutingPaths` | Vector-derived OEM |
| Canonical AUTOSAR (`AUTOSAR_MOD_ECUConfigurationParameters.arxml:155998`) | `PduRRoutingPaths` | AUTOSAR spec |
| v1.25.1 T3 demo-ecu BSWMD (post-T3) | `PduRRoutingTables` | **v1.25.1 T3 introduced this** |

T3 renamed the demo-ecu BSWMD's container from canonical `PduRRoutingPaths` to non-canonical `PduRRoutingTables`. The mapper (already correct) was unchanged. The 2 test assertions relaxed in v1.25.1 (per spec Risks option (b)) were relaxed in response to a regression T3 itself introduced — not in response to an enrichment that needed subsequent realignment.

### v1.25.2 PATCH T1 Fix

Reverts the BSWMD misnomer. Single-line fix in `samples/arxml/demo-ecu/bswmd/Bsw_PduR_Bswmd.arxml:14`: `PduRRoutingTables` → `PduRRoutingPaths`. Effects:

- PduR `add-child` steps now resolve correctly via the engine's `findContainerByPath` (the container exists in the BSWMD with the name the mapper expects).
- PduR instances land in the committed ARXML (were silently filtered as `path-not-found` in v1.25.1).
- The 2 test assertions relaxed in v1.25.1 PATCH (`perFile.PduR >= 0` and `addedCounts.pduR >= 0`) are restored to `>= 1`. The "known consequence" comment blocks are removed.

Mapper (already canonical) and value file (already canonical) are unchanged. A separate T1 review nit (`ab10d95`) aligned a stale header comment in `xlsxToEcucBatch.ts:9` that referenced the planned-but-wrong mapper edit; the comment now matches the canonical code.

### Process Lesson

The v1.25.1 spec framed the bridge mapper realignment as "deferred to follow-up PATCH" rather than catching the BSWMD misnomer at design-review time. The T3 enrichment would have been caught earlier if the spec had cross-referenced the canonical AUTOSAR + real-OEM fixture + value-file path when declaring the BSWMD enrichment. v1.26.0 PATCH spec template will include a "BSWMD enrichment cross-reference check" as a mandatory review item.

### Test Summary (v1.25.2)

- Full suite: 2834 + 6 SKIP / 0 fail (0 net change from v1.25.1; assertion restoration only)
- Type-check: 0 errors
- Lint: 0 errors
- Format: clean