# v1.28.0 MINOR — Pure-Refactor Closure of v1.27.x Deferred Items

> **Ship date:** 2026-07-06
> **Commit:** _pending_
> **Tag:** v1.28.0
> **Baseline:** v1.27.5 PATCH (`5d29f3c`)
> **Tests:** 2867 + 6 SKIP / 0 fail (no test count change — pure refactor)

## Summary

Closes 3 pure-refactor cleanups that v1.27.x PATCH release notes
deferred as "out of scope" (non-IPC-surface changes). All behavior
preserved end-to-end. Test suite unchanged. Diff net -157 LoC across
5 modified + 3 new files.

## What's New

### T1 — `applyPatchesToExtract` exported as shared module

Promoted from `src/main/ipc/dcmConfigHandler.ts:125-208`
(function-scoped internal) to a new public module
`src/core/arxml/extractPatch.ts`. Two benefits:

1. **Eliminates 10 LoC of inline duplication** in the v1.27.5 PATCH
   real-OEM end-to-end test
   (`src/core/bridge/__tests__/dcmConfigPipeline.test.ts`). The test
   now imports `applyPatchesToExtract` and uses the same wrapper
   the IPC handler uses — a future refactor of the wrapper updates
   both sites in lockstep.

2. **Consolidates `prefixDocRootPath`** that existed in TWO production
   sites (`dcmConfigHandler.ts` + `xlsxEcucBatchImportHandler.ts`).
   The MINOR exports the shared implementation; both consumers now
   import from one place. Future `add`/`remove`/`replace`-op
   support in the wrapper lands in both call paths at once.

### T2 — `addChildSiblingStep` helper extracted for Dcm mapper

New `src/core/bridge/addChildSiblingStep.ts` with helper signature
`addChildSiblingStep({moduleShortName, instanceShortName, containerDefPath, instanceParams})`
returning `readonly PatchStep[]`. Closes the v1.27.2 PATCH release notes
§"Out of Scope (deferred)" TODO at
`xlsxDcmServicesToEcucBatch.ts:106-110` that proposed this exact
helper name. The Dcm mapper now consumes the helper; its inline
`addChildBase + per-param set-param` construction is gone.

**Note on Com-stack alignment**: the helper's API is Dcm-specific
(parentPath = moduleShortName, always emits definitionRef). The
Com-stack mapper's emit shape is structurally different (uses leaf-
parent path, conditional definitionRef, includes `kind` discriminator)
and is not yet ready to consume this helper. The Com-stack
alignment is a separate, larger refactor — deferred to a future
MINOR with explicit pre-flight design (the file-header comment in
`addChildSiblingStep.ts` documents this asymmetry honestly).

### T3 — `stripBswmdPackageRoot` helper extracted

New `src/core/bridge/pathUtils.ts` with `stripBswmdPackageRoot(bswmdPath)`
extracted from the inline regex at `xlsxToEcucBatch.ts:71`. The
YAGNI concern (1-line helper) was reviewed at v1.27.2 PATCH time and
deferred; with v1.28.0 MINOR bundling broader path-translation work,
the helper takes its place as the documented surface. Future
mapper-shape alignment work has one place to change the strip logic.

## Why module-level over shared/

`extractPatch.ts` lives at `core/arxml/extractPatch.ts` (sibling to
`parser.ts` + `serializer.ts` — its peer consumers) because the
wrapper is fundamentally an ARXML-stitch operation. `addChildSiblingStep.ts`
+ `pathUtils.ts` live at `core/bridge/` per the project's domain-
organize convention. None are promoted to `src/shared/` because none
are used by the renderer.

## Error handling

No change. Inherits the v1.27.2 fail-fast posture + spec §275. The
shared `applyPatchesToExtract` uses the same custom
`{ok: true, value: string} | {ok: false, message: string}` envelope
as the v1.27.5 inline function it replaces. A future MINOR could
migrate to the project-standard `Result<T, E>` type
(`core/arxml/types.ts:266-268`) — flagged in code-review as MEDIUM
deferral.

## Migration Notes

No breaking changes to user-facing IPC. No behavior change. No
renderer-visible difference. Test count delta: 0.

For users on v1.27.5 or earlier:

- 3 new shared modules under `core/arxml/` and `core/bridge/`
  (`extractPatch.ts`, `addChildSiblingStep.ts`, `pathUtils.ts`).
- `dcmConfigHandler.ts` and `xlsxEcucBatchImportHandler.ts` consume
  the shared `prefixDocRootPath` instead of carrying their own copy.
- `xlsxDcmServicesToEcucBatch.ts` consumes `addChildSiblingStep`
  instead of constructing PatchSteps inline.
- `xlsxToEcucBatch.ts` uses `stripBswmdPackageRoot` instead of an
  inline `.replace` regex.

## Out of Scope (deferred)

Code-review surfaced 5 MEDIUM items not addressed in this MINOR:

- **`addChildSiblingStep` direct unit test** — the helper is
  exercised through the existing mapper cross-vendor tests (5
  sheets × 2 BSWMDs = 10 test cases), which catch any observable
  emission shape drift. Adding a direct unit test would only catch
  internal refactor regressions. Defensible gap, flagged for
  future test-coverage MINOR.
- **`addChildSiblingStep` API extension for Com-stack alignment** —
  Com-stack mapper cannot consume the helper as-is (different emit
  shape: leaf-parent path, conditional `definitionRef`, `kind`
  discriminator). Adding these as optional fields would expand the
  helper's API without an immediate consumer. Deferred to the
  Com-stack alignment MINOR that actually needs them.
- **`applyPatchesToExtract` envelope type unification** — the
  helper's `{ok, value/message}` envelope duplicates the project's
  canonical `Result<T, E>` type. Migrating to `Result` is a
  multi-caller refactor (IPC handler + v1.27.5 test + future
  consumers) and a pre-emptive cleanup without an immediate bug.
  Deferred.
- **`prefixDocRootPath` for non-add-child / non-set-param ops** —
  the helper returns the step unchanged for `add`/`remove`/
  `replace`/`remove-with-cascade`/`variant-downgrade` ops. In
  practice, the IPC handler only ever produces `add-child` +
  `set-param` from the mappers, so the no-op is correct. Renaming
  the helper to `prefixAddChildOrSetParamStepPath` would make the
  scope explicit; YAGNI. Deferred.
- **`addChildSiblingStep` JSDoc changelog density** — the file
  header is 20 lines explaining the v1.28.0 closure context.
  Could be shortened to a 2-3 line release-notes link. Defensible
  as-is (justifies helper existence at a glance). Deferred.

## Test Results

- pnpm format: clean (3 autofix rounds on the 3 new modules + the
  test file, after the wider import surface was finalized)
- pnpm lint: 0 errors (1 import-order autofix round on
  `xlsxEcucBatchImportHandler.ts` after adding the shared import)
- pnpm type-check: 0 errors (both `tsconfig.json` + `tsconfig.web.json`)
- pnpm vitest: **2867 + 6 SKIP / 0 fail** (no test count change)
- pnpm verify: 7-stage GREEN
- code-reviewer: 1 HIGH (3rd copy of `prefixDocRootPath` at
  `xlsxEcucBatchImportHandler.ts:144-163` — fixed in-commit) +
  5 MEDIUM + 2 LOW + 2 NOTE
- Exit code: 0

## Next Steps

- **v1.28.1 PATCH (optional)** — address code-review MEDIUM follow-ups
  (`addChildSiblingStep` direct unit test + envelope type
  unification).
- **v1.29.0 MINOR** — Com-stack mapper-shape alignment (the
  larger refactor that subsumes the `addChildSiblingStep` API
  extension + `stripBswmdPackageRoot` semantics alignment).
- **v1.30.0 MINOR** — IPC API changes (real-OEM BSWMD override
  path for `dcmConfigHandler`; `DcmConfigHandlerResult` applied
  counter). These were deferred from v1.28.0 to keep the MINOR
  pure-refactor and IPC-stable.
