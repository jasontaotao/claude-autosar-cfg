# v1.29.0 MINOR — Com-Stack Mapper Shape Alignment to `addChildSiblingStep`

> **Ship date:** 2026-07-06
> **Commit:** `f038ce6` refactor(bridge)
> **Tag:** v1.29.0
> **Baseline:** v1.28.1 PATCH (`047b387`)
> **Tests:** 2878 + 6 SKIP / 0 fail (+7 from v1.28.1's 2871+6)
> **Spec:** [docs/superpowers/specs/2026-07-06-v1-29-0-minor-com-stack-mapper-shape-alignment-design.md](../superpowers/specs/2026-07-06-v1-29-0-minor-com-stack-mapper-shape-alignment-design.md)

## Summary

Closes the Com-stack half of the v1.27.2 PATCH release-notes TODO that proposed consolidating the two mapper shapes into one helper. v1.28.0 MINOR closed the Dcm half (`xlsxDcmServicesToEcucBatch` → `addChildSiblingStep`); v1.29.0 closes the Com-stack half (`xlsxToEcucBatch` → `addChildSiblingStep`). The helper now absorbs both emit shapes through optional `parentPath`/`moduleShortName`/`containerDefPath` fields with strict precedence rules.

IPC surface impact: **zero**. Both mappers continue to emit `PatchStep[]` into internal pipelines. `dcmConfigHandler` + `xlsxEcucBatchImportHandler` unaffected.

## What's New

### T1 — `addChildSiblingStep` extension

The shared helper at `src/core/bridge/addChildSiblingStep.ts` now accepts three optional input shapes:

| Call shape | Mapper | `parentPath` source | `definitionRef` emission |
|---|---|---|---|
| `{ moduleShortName, containerDefPath }` | Dcm | derived from `moduleShortName` | ALWAYS emitted |
| `{ parentPath, containerDefPath? }` | Com-stack | caller-provided (multi-segment leaf-parent) | conditional (omitted when `containerDefPath` is `undefined`) |
| `{ parentPath, moduleShortName, containerDefPath }` | (defensive) | caller-provided `parentPath` wins | follows `containerDefPath` presence |
| (none of `parentPath` or `moduleShortName`) | (any) | — | throws |

Under `exactOptionalPropertyTypes: true` (project tsconfig), each optional field is typed `T | undefined` explicitly so callers may either OMIT or PASS-as-`undefined`. The internal `resolveParentPath` helper uses two `if (X !== undefined) return X` guards to give strict narrowing, avoiding the `??`-produced `string | undefined` that exactOptionalPropertyTypes rejects.

### T2 — `xlsxToEcucBatch.ts` swap

The Com-stack mapper's inline emission at lines 82-99 is replaced with a single `addChildSiblingStep(...)` call:

```ts
steps.push(
  ...addChildSiblingStep({
    parentPath, // multi-segment leaf-parent (strip-prefixed)
    instanceShortName: row.shortName,
    containerDefPath: row.definitionRef, // conditional-spread behavior unchanged
    instanceParams: row.params,
  }),
);
```

The mapper file shape now mirrors the Dcm mapper post-v1.28.0: both mappers delegate to the shared helper. Behavioral parity invariants (per spec §3.2) all hold — verified by the existing 25 Com-stack mapper tests passing without modification.

### T3 — Dcm mapper emission parity (load-bearing regression)

The Dcm mapper call site (`xlsxDcmServicesToEcucBatch.ts:115-121`) is **unchanged** but its input shape (`moduleShortName` + `containerDefPath` as before) is now type-compatible with the helper's optional-field extension. All 14 existing Dcm mapper tests + the 5 real-OEM cross-vendor invariant tests + the 4 dcmConfigPipeline end-to-end tests pass without modification — proving Dcm emission did not shift.

### T4 — `null` AND `undefined` param skip (Risk §8 #4)

The Com-stack mapper's legacy in-line loop checked `value === null || value === undefined`. The v1.29.0 helper now matches: skips both null and undefined. Direct test added: `'skips param entries whose value is undefined (mirror of null-skip)'` at `__tests__/addChildSiblingStep.test.ts:241-270`.

## Files shipped

| File | Type | LoC |
|---|---|---|
| `src/core/bridge/addChildSiblingStep.ts` | MODIFY | input type + helper body + new `resolveParentPath` |
| `src/core/bridge/xlsxToEcucBatch.ts` | MODIFY | in-line emit → helper call |
| `src/core/bridge/__tests__/addChildSiblingStep.test.ts` | MODIFY | 6 new direct unit tests + 1 new mirror test |
| `docs/superpowers/specs/2026-07-06-v1-29-0-minor-com-stack-mapper-shape-alignment-design.md` | NEW | 282 LoC pre-flight design |

Production + tests: 3 files modified + 1 spec added. Net production LoC change: approximately +20/-25 (helper grew with optional fields + resolveParentPath; mapper shrank by in-line emit).

## Decision Log

- **D1 — Approach A (extend helper, not split)**. Per the user's locked approach and lessons #151/#156 (helper-extraction-prefer-one-helper + scan-all-copies), we extend the existing helper rather than splitting into `addChildModuleLevelStep` + `addChildLeafStep`. The "two helpers" path was rejected as introducing duplication risk; the "discriminated union" path was rejected as over-engineered for two callers.
- **D2 — `parentPath` wins over `moduleShortName` when both provided**. Defensive against future refactors that pre-compute `parentPath` upstream. Documentation comment in the helper file header makes this explicit.
- **D3 — Throw when neither `parentPath` nor `moduleShortName` provided**. Fail-fast per project rule (no silent `undefined` propagation). Spec §1.4 documents this; direct test pinned.
- **D4 — Conditional-spread on `containerDefPath`**. The `...(input.containerDefPath !== undefined && { definitionRef: input.containerDefPath })` pattern matches the legacy Com-stack mapper's conditional-spread idiom at `xlsxToEcucBatch.ts:86`. Produces no `definitionRef: undefined` form in the step's `Object.keys`.

## Code-Reviewer Verdict

APPROVED. No CRITICAL/HIGH findings. 3 MEDIUM findings (kitchen-sink helper, test redundancy on `definitionRef` absent shape, spec/implementation snippet drift on the `| undefined` annotation) — all defensible per spec. 3 LOW + 3 NOTE findings acceptable.

## Out of Scope (deferred)

- **Splitting `addChildSiblingStep` into two helpers** (`addChildModuleLevelStep` + `addChildLeafStep`) — explicitly deferred per spec §9. The helper's kitchen-sink tendency is acknowledged; future MINOR can revisit when caller count grows or contract stabilizes.
- **Dcm mapper v1.29.0+ refactors** (e.g., `SHEET_TO_CONTAINER_SHORT_NAME` const auto-inference) — preserved per v1.27.0 release notes.
- **Dem service generator** — deferred per v1.27.0 release notes.
- **Generic BSWMD-driven bridge** for any module (Dcm + Dem + Com + CanIf + ...) — long-term follow-up.
- **Renderer-side `applied` counter on `DcmConfigHandlerResult`** — deferred from v1.27.2 PATCH (next in v1.30.0 MINOR).
- **Real-OEM BSWMD override path** for arbitrary vendor exports — deferred per v1.27.0 spec (next in v1.30.0 MINOR).
- **New IPC contracts** — out of scope (IPC surface unchanged).

## Test Results

- pnpm format: clean (1 autofix round on addChildSiblingStep.ts + 1 on the spec file)
- pnpm lint: 0 errors (exactOptionalPropertyTypes flag addressed inline in helper input type)
- pnpm type-check: 0 errors (both `tsconfig.json` + `tsconfig.web.json`)
- pnpm vitest: **2878 + 6 SKIP / 0 fail** (+7 from v1.28.1's 2871+6)
- pnpm verify: 7-stage GREEN, EXIT=0
- code-reviewer: APPROVED
- spec compliance: all 11 §3.3 steps executed
- Exit code: 0

## Next Steps

- **v1.30.0 MINOR** — IPC API changes (real-OEM BSWMD override path for `dcmConfigHandler`; `DcmConfigHandlerResult` applied counter envelope). IPC-stable v1.28.x + v1.29.x chain enables the breaking IPC work next.
- **Backfill opportunity** — vault `vault_pkm` lesson files #157 + #158 (the v1.28.1 capture noted these were captured inline in the topic file only; backfilling into separate `development/lessons/` files is a 5-min follow-up when Write-tool access is restored to future pkm-capture dispatches).
