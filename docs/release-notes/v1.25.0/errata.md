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