# v1.28.1 PATCH — `addChildSiblingStep` Direct Unit Test + `applyPatchesToExtract` Envelope Unification

> **Ship date:** 2026-07-06
> **Commit:** `047b387`
> **Tag:** v1.28.1
> **Baseline:** v1.28.0 MINOR (`4fe39b8`)
> **Tests:** 2871 + 6 SKIP / 0 fail (+4 from v1.28.0's 2867)

## Summary

Closes 2 of the 5 MEDIUM items from v1.28.0 MINOR release notes §"Out of Scope (deferred)". No IPC surface change. No behavior change. The remaining 3 MEDIUMs (`addChildSiblingStep` API extension for Com-stack alignment; `prefixDocRootPath` for non-add-child/non-set-param ops; JSDoc changelog density) are deferred to v1.29.0 MINOR which has the pre-flight design scope.

## What's New

### T1 — `addChildSiblingStep` direct unit test

NEW `src/core/bridge/__tests__/addChildSiblingStep.test.ts` with 4 cases:

| Case | Assertion |
|---|---|
| `instanceParams: {}` | 1 `add-child` step only — no `set-param` follows |
| Shape fields | `parentPath`, `shortName`, `definitionRef` carry through verbatim |
| Mixed-type params | 1 `add-child` + 1 `set-param` per defined entry (string/number/boolean) |
| `null` skipping | `nullParam` dropped; `''` (empty string) kept (it's NOT null) |

Why this matters: pre-v1.28.1, `addChildSiblingStep` was exercised only via the v1.27.0 T5 cross-vendor invariant (`xlsxDcmServicesToEcucBatch.test.ts` describe `real-OEM cross-vendor invariant`), which catches BSWMD-provenance drift but doesn't pin the helper's per-call shape. The direct tests now pin that shape so future v1.29.0 MINOR Com-stack mapper-shape alignment refactors cannot silently shift the per-row emission without these tests breaking first.

### T2 — `applyPatchesToExtract` envelope type unification

`src/core/arxml/extractPatch.ts` migrated from the helper's ad-hoc `{ ok: true; value: string } | { ok: false; message: string }` envelope to the project-standard `Result<string>` type (`core/arxml/types.ts:266-268`).

Two consumers updated:
- `src/main/ipc/dcmConfigHandler.ts:208` — `patched.message` → `patched.error` (the IPC `IpcResult<T>` envelope's nested `{ message }` shape is unchanged).
- `src/core/bridge/__tests__/dcmConfigPipeline.test.ts:200` — same rename in the v1.27.5 PATCH real-OEM end-to-end test.

The IPC handler's outer surface is unchanged: renderer consumers still receive `{ ok: false, error: { message: ... } }` via `IpcResult<DcmConfigHandlerResult>`.

### T3 — code-reviewer in-commit MEDIUM fix

The v1.28.0 `addChildSiblingStep` implementation had a defensive guard `if (value === null || value === undefined) continue;` where the `value === undefined` branch was unreachable from typed callers (`AddChildSiblingStepInput.instanceParams` is `Readonly<Record<string, string | number | boolean | null>>` — `undefined` is not in the union). The defensive test required an `as unknown as` cast that bypassed exactly the type safety it claimed to test.

The unused defensive guard is removed; the test case that required the unsafe cast is removed. Helper contract and implementation now match cleanly.

## Files shipped

| File | Type | LoC |
|---|---|---|
| `src/core/bridge/__tests__/addChildSiblingStep.test.ts` | NEW | +134 |
| `src/core/arxml/extractPatch.ts` | MODIFY | +9/-10 |
| `src/core/bridge/__tests__/dcmConfigPipeline.test.ts` | MODIFY | +1/-1 |
| `src/main/ipc/dcmConfigHandler.ts` | MODIFY | +1/-1 |
| `src/core/bridge/addChildSiblingStep.ts` | MODIFY | +2/-2 |

Total: 5 files / +147/-13.

## Migration Notes

No breaking changes to user-facing IPC. No behavior change. Test count delta: +4.

For users on v1.28.0 or earlier:

- `applyPatchesToExtract`'s caller-side field name changed from `message` to `error` when reading the failure case. Both values are string messages — same meaning, same kind of diagnostic text.
- `addChildSiblingStep` no longer accepts `undefined` param values defensively; this was unreachable from typed callers and the simplification is internal.
- New direct unit test file at `src/core/bridge/__tests__/addChildSiblingStep.test.ts`.

## Out of Scope (deferred)

Code-review surfaced 5 MEDIUM items in v1.28.0; v1.28.1 closes the 2 listed above. The remaining 3 are deferred to v1.29.0 MINOR which has pre-flight design scope:

- **`addChildSiblingStep` API extension for Com-stack alignment** — the Com-stack mapper cannot consume the helper as-is (different emit shape). Deferred to v1.29.0 MINOR which is the larger refactor that actually needs it.
- **`prefixDocRootPath` for non-add-child / non-set-param ops** — the helper returns the step unchanged for `add`/`remove`/`replace`/etc. ops. Renaming to `prefixAddChildOrSetParamStepPath` would be cosmetic. Deferred.
- **`addChildSiblingStep` JSDoc changelog density** — the file header is ~20 lines. Could be 2-3 lines + release-notes link. Defensible as-is.

LOW: `addChildSiblingStep.test.ts` import ordering (type imports grouped at top — already conventional). Stylistic only.

## Test Results

- pnpm format: clean (1 autofix round on the new test file)
- pnpm lint: 0 errors
- pnpm type-check: 0 errors (both `tsconfig.json` + `tsconfig.web.json`)
- pnpm vitest: **2871 + 6 SKIP / 0 fail** (+4 from v1.28.0's 2867)
- pnpm verify: 7-stage GREEN, EXIT=0
- code-reviewer: APPROVED (1 MEDIUM fixed in-commit, 2 LOW + 2 NOTE deferred)
- Exit code: 0

## Next Steps

- **v1.29.0 MINOR** — Com-stack mapper-shape alignment (the larger refactor that subsumes the `addChildSiblingStep` API extension and the `stripBswmdPackageRoot` semantics alignment).
- **v1.30.0 MINOR** — IPC API changes (real-OEM BSWMD override path for `dcmConfigHandler`; `DcmConfigHandlerResult` applied counter envelope). IPC-stable v1.28.x chain enables this next.
