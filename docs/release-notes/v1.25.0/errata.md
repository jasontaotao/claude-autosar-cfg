# v1.25.0 Errata — Integer-default Concern Re-attributed

> **Errata date:** 2026-07-05
> **Applies to:** v1.25.0 MINOR (`980d04a0acdee8652a1610dd2edcaf202dc190b4`)
> **Status:** Concern partially confirmed by T2 diagnostic.
> **Replacement:** See corrected "Known Issues" entry in [README.md](./README.md).

## Background

The v1.25.0 release notes' "Known Issues" section flagged an "Integer-default cosmetic" concern. The PKM permanent note recorded this as a latent `applySetParam` integer no-op that v1.25.x PATCH T2 was meant to fix.

## T2 Diagnostic

T2 of v1.25.x PATCH executed a diagnose-first approach (per T4 misdiagnosis lesson):

1. Wrote the diagnostic test `src/core/__tests__/c1-integer-default-diagnostic.test.ts` that exercises the FULL pipeline end-to-end on an integer-default param fixture (`ComPduId` with `DEFAULT-VALUE=0`; user encodes `ComPduId=1`).
2. Ran the diagnostic and captured console.log output.

## Diagnostic Findings

The diagnostic test PASSES when the engine receives faithfully-aligned paths:

| Surface | Behavior |
| --- | --- |
| `xlsxToEcucBatch` mapper | Emits `set-param` for every non-null param value, including `ComPduId=1`. ✅ |
| `applyPatchSteps.applySetParam` | Reports `applied === 1` when post-call value differs from pre-call value. ✅ |
| `serializeArxml` | Does NOT omit `<VALUE>` based on BSWMD-default equality (verified by grep — no `defaultValue` references in `core/arxml/serializer.ts`). ✅ |
| End-to-end (with faithful paths) | `ComPduId=1` lands as `<VALUE>1</VALUE>` in serialized ARXML. ✅ |

**Conclusion**: T4's attribution to `applySetParam` integer no-op was a **misdiagnosis**. The engine and serializer layers are functionally correct.

## Actual Root Cause (out of scope for v1.25.x PATCH T2)

While the diagnostic test (with paths hand-aligned to the engine's expectations) passes, a separate probe run against the production IPC handler path revealed the **real** cause of the v1.25.0 integer-default behavior:

- The IPC handler `xlsxEcucBatchImportHandler.ts` runs `translateStepPath` on mapper output, which case-translates BSWMD segment names and strips the leaf container-def segment — but does NOT prefix the resulting `containerPath` with a leading `/`.
- The engine's `findContainerByPath` (`core/project/setters.ts:47-81`) reconstructs doc paths starting with `/<pkg.shortName>` (e.g., `/Com`).
- Strict equality `myPath === path` fails when the step's `containerPath` lacks the leading slash, so every `set-param` step after `add-child` rejects with `path-not-found`.
- The container is still created (via `add-child`) with BSWMD-derived defaults via `fillParamsFromBswmd`, which is why the v1.25.0 75-row ship-blocking test passes its textual-pin assertion (`<VALUE>SEND</VALUE>` matches the BSWMD `<DEFAULT-VALUE>SEND</DEFAULT-VALUE>` for `ComIPduDirection`) despite the `set-param` step failing silently.

The 75-row test intentionally does not pin numeric param values (see test comment at lines 178-185 of `xlsxEcucBatchImportHandler.real.test.ts`), so the integer-default regression was masked by the textual/enum default-equality coincidence.

## Where the Fix Belongs

The fix is in `src/main/ipc/xlsxEcucBatchImportHandler.ts:translateStepPath` — add a leading `/` prefix to the translated `containerPath` / `parentPath` so the engine's `findContainerByPath` walks align. This file is OUT OF SCOPE for v1.25.x PATCH T2 (per the brief's "Files" restriction to `xlsxToEcucBatch.ts` / `serializer.ts` / `applyPatchSteps.ts`). The fix is therefore deferred to a future patch (target: v1.25.x PATCH T3 or later).

## Resolution

**No code change for v1.25.x PATCH T2.** The diagnostic confirms that the engine + serializer pipeline is sound when given correctly-aligned paths. The actual IPC-handler path-prefix bug is documented here and targeted for a future patch.

The "Integer-default cosmetic" Known Issue entry in [README.md](./README.md) is updated to point at this erratum.

## Regression Guard

`src/core/__tests__/c1-integer-default-diagnostic.test.ts` (T2) remains in the suite as a regression guard for the engine + serializer path. A second regression test was appended to `src/main/ipc/__tests__/xlsxEcucBatchImportHandler.real.test.ts` (T2) to pin ComPduId=1 landing through the full import handler — this case is expected to FAIL until the IPC handler path-prefix fix lands in a future patch (per Branch D action).

## Test Summary

- Diagnostic test (engine + serializer surface, hand-aligned paths): PASS
- Regression test appended (IPC handler integration boundary): **EXPECTED FAIL** (documented; fix deferred)
- Type-check: 0 errors
- Lint: 0 errors
- Format: clean