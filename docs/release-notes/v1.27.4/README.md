# v1.27.4 PATCH — Reference-Param Helper + Synthetic-Parent Positive Control

> **Ship date:** 2026-07-06
> **Commit:** _pending_
> **Tag:** v1.27.4
> **Baseline:** v1.27.3 PATCH (`2b186ba`)
> **Tests:** 2866 + 6 SKIP / 0 fail (+1 from v1.27.3's 2865)

## Summary

Closes two v1.27.2/v1.27.3 deferred cleanups: (a) extracts a single
`makeReferenceParamValue` helper that locks the v1.27.2 PATCH
`addContainer`-auto-seed ↔ `addReference`-fresh-write shape invariant,
(b) adds the synthetic-parent fallback **positive control** test
(sibling of v1.27.3's negative cross-module test). Pure refactor +
one regression-lock test. No behavior change. No IPC surface change.

## What's New

### T1 — Extract `makeReferenceParamValue` helper in `mutation.ts`

Adds a private `makeReferenceParamValue({value, dest, definitionRef})`
helper at `src/core/arxml/mutation.ts` (immediately above
`containerPathToSubPath`) and routes both reference-param
construction sites through it:

| Site | Before | After |
|------|--------|-------|
| `addContainer` auto-seed (line 194) | inline `{type:'reference', value:'', dest, definitionRef}` object literal | `makeReferenceParamValue({...})` call |
| `addReference` fresh-write branch (line 710) | inline `value` literal + conditional spread for `definitionRef` | `makeReferenceParamValue({...})` call |

The helper always emits `dest` (fixes the v1.27.2 PATCH HIGH
code-review finding that auto-seeded entries lacked `dest`). It
conditionally emits `definitionRef` only when non-empty (preserves the
existing `addReference` behavior for malformed-BSWMD safety).

**`addReference`'s idempotent-overwrite branch is intentionally NOT
routed through the helper** — that branch preserves `existing.definitionRef`
when the incoming `refDef.path === ''` (defensive semantics — inverse
of this helper's conditional). The asymmetry is documented in the
helper's JSDoc and at the call site.

Net diff: **+47 / -12** on `mutation.ts` (helper doc-block + 28 LoC
added, 16 LoC removed at the 2 call sites that switched). Behavior
identical — all 45 existing `mutation.test.ts` cases pass unchanged.

### T2 — Synthetic-parent positive control test

Adds 1 test at
`src/core/mutation/__tests__/applyPatchSteps.test.ts` asserting that
`applyPatchSteps(doc, [{op:'add-child', parentPath:'/EcucDefs/Com', …}], {moduleDef})`
(with `moduleDef.shortName === 'Com'`) succeeds — applying the 2-segment
synthetic-parent fallback at `applyPatchSteps.ts:746-758`, finding the
child def via `definitionRef` tail (`/D/Com/ComGeneral`), and creating
a new sibling `ComGeneral_NewSibling` under the Com module.

**Sister to v1.27.3's cross-module negative test** at line 293+: where
v1.27.3 pins the boundary REJECTS cross-module paths, v1.27.4 pins the
boundary ACCEPTS module-matching paths. Together they fence the
synthetic-parent fallback in both directions — a future regression that
breaks either side now has a unit-level assertion with a clear failure
message, instead of cascading into the mapper integration tests.

Net diff: **+47 / -0** on the test file (one new `it(...)` with
extensive comment block).

## Why module-level over shared/

N/A — these changes are internal to `core/arxml/mutation.ts` and
`core/mutation/applyPatchSteps.test.ts`. No cross-folder exports.

## Error handling

No change. v1.27.2 fail-fast posture + spec §275 inherited unchanged.
No new error envelopes.

## Migration Notes

No breaking changes to user-facing IPC. Behavior is byte-for-byte
identical — this is a pure refactor:

- `addContainer` auto-seed produces the same `ParamValue` shape it
  produced in v1.27.2 / v1.27.3.
- `addReference` fresh-write produces the same `ParamValue` shape it
  produced in v1.27.2 / v1.27.3.
- `addReference` idempotent-overwrite behavior is unchanged (intentionally
  NOT routed through the helper — see T1 note above).

For users on v1.27.3 or earlier:

- Test count delta: +1 (2865 → 2866).
- Production behavior: unchanged.

## Out of Scope (deferred)

- **`stripBswmdPackageRoot` helper consolidation** — v1.27.2 deferred.
  V1.27.4 re-evaluated: the strip-prefix idiom at `xlsxToEcucBatch.ts:71`
  is now a single-site use (v1.27.2 PATCH removed the Dcm-mapper strip).
  Extracting a 1-line `.replace(/^\/[^/]+\//, '')` into a named utility
  creates indirection without semantic value — YAGNI per CLAUDE.md
  `coding-style.md`. The real consolidation opportunity here is the
  **mapper-shape alignment** between Dcm (`parentPath: moduleShortName`
  + `definitionRef`) and Com-stack (`parentPath: stripped-path`) — that
  refactor wants a `MINOR` boundary to also align the PatchStep emit
  shape. Deferred to v1.28.0 MINOR.

- **`addContainer` + `addReference` `dest` JSDoc cross-link** — the
  helper's JSDoc mentions the v1.27.2 PATCH HIGH fix at
  `mutation.ts:190-193`; the inverse JSDoc on `addReference` does not
  yet cross-link back. Doc tidy-up only; deferred.

- **Real-OEM full-coverage end-to-end test for `dcmConfigHandler`** —
  v1.27.2 deferred; BSWMD fixture already added. Deferred to v1.27.5
  PATCH or v1.28.0 MINOR.

- **Applied counter on `DcmConfigHandlerResult`** — v1.27.2 deferred.
  IPC API shape change (extends envelope). Deferred to v1.28.0 MINOR.

- **Real-OEM BSWMD override path for `dcmConfigHandler`** — v1.27.2
  deferred. IPC API change (adds argument). Deferred to v1.28.0 MINOR.

## Test Results

- pnpm format: clean (1 autofix round on `mutation.ts` after the helper
  refactor moved code across prettier line-width boundaries)
- pnpm lint: 0 errors, 0 warnings
- pnpm type-check: 0 errors (both `tsconfig.json` + `tsconfig.web.json`)
- pnpm vitest: **2866 + 6 SKIP / 0 fail** (+1 from v1.27.3's 2865)
- pnpm verify: 7-stage GREEN (format, lint, type-check, test,
  coverage, build, import-regression)
- Exit code: 0

## Next Steps

- v1.27.5 PATCH (optional) — Real-OEM end-to-end coverage of
  `dcmConfigHandler`. Closes one more v1.27.2 deferred.
- v1.28.0 MINOR — long-term follow-ups: mapper-shape consolidation
  (Dcm vs Com-stack); real-OEM BSWMD override path for
  `dcmConfigHandler`; applied counter on `DcmConfigHandlerResult`.
