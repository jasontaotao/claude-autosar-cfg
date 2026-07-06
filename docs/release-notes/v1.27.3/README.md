# v1.27.3 PATCH — DCM_MODULE_SHORT_NAME Constant + Cross-Module Negative Test

> **Ship date:** 2026-07-06
> **Commit:** _pending_
> **Tag:** v1.27.3
> **Baseline:** v1.27.2 PATCH (`f5b3eca`)
> **Tests:** 2865 + 6 SKIP / 0 fail (+1 from v1.27.2's 2864)

## Summary

Closes the two MEDIUM code-review follow-ups deferred from v1.27.2 PATCH
(release notes §"Out of Scope (deferred)"): (a) constant extraction
for the Dcm module shortName, and (b) the regression lock-in test for
the v1.27.2 1-segment synthetic-parent fallback boundary. Pure
code-shape change — no behavior change. No IPC surface change.

## What's New

### T1 — Cross-module negative test for `findParentContainerDef` 1-segment fallback

Added one regression test at
`src/core/mutation/__tests__/applyPatchSteps.test.ts` asserting that
`applyPatchSteps(doc, [{op:'add-child', parentPath:'PduR', …}], {moduleDef})`
(with `moduleDef.shortName === 'Com'`) surfaces `kind: 'path-not-found'`
with the offending path in the message.

The test pins the v1.27.2 fallback boundary at
`applyPatchSteps.ts:725-737`: the 1-segment synthetic-parent fallback
fires ONLY when `parentPath` strictly equals `moduleDef.shortName`. If
a future maintainer ever softens the check to `startsWith` or any
prefix-tolerant match, this test breaks loud — the regression would
otherwise silently mis-attribute sibling containers to the wrong module
in cross-vendor projects.

**Test-only** — no production code change. Current behavior is
already correct (the test passes on existing code).

### T2 — Extract `DCM_MODULE_SHORT_NAME` constant

New file `src/core/bridge/dcmConstants.ts` exporting:

```typescript
export const DCM_MODULE_SHORT_NAME = 'Dcm' as const;
```

Replaces 19 ad-hoc `'Dcm'` literals across 6 files (3 prod + 3 test):

| File | Sites replaced |
|------|----------------|
| `src/core/bridge/xlsxDcmServicesToEcucBatch.ts` | 5 (SHEET_TO_MODULE values) |
| `src/core/bridge/dcmConfigPipeline.ts` | 2 (`.get()` + error message) |
| `src/main/ipc/dcmConfigHandler.ts` | 3 (Map key + `.get()` + comment ref skipped) |
| `src/core/bridge/__tests__/xlsxDcmServicesToEcucBatch.test.ts` | 8 (parentPath + Map keys + `.toBe()` ×3) |
| `src/core/bridge/__tests__/dcmConfigPipeline.test.ts` | 1 (Map key — error-msg regex unchanged) |
| `src/core/bridge/__tests__/demoBswmdLoader.test.ts` | 2 (input arg + `.has()`) |

`DCM_MODULE_SHORT_NAME` is co-located with the other Dcm-bridge files
(`xlsxDcmServicesToEcucBatch.ts`, `dcmConfigPipeline.ts`) per the
project's domain-organize convention. NOT promoted to `src/shared/`
because the renderer never references Dcm by module shortName — kept
scoped to the bridge.

## Why module-level over shared/

`src/shared/dcm/constants.ts` would imply cross-cut use across main,
renderer, and bridge. Today only `core/bridge/` and `main/ipc/`
reference the constant; promoting it to shared would be YAGNI (cf.
project CLAUDE.md coding-style guidance on speculative generality).
Future extractor: `YagniAvoidModuleNamingHardcoding` if a renderer-
side Dcm identifier ever emerges.

## Error handling

No change. The v1.27.2 fail-fast posture + spec §275 spec are
inherited unchanged.

## Migration Notes

No breaking changes to user-facing IPC. No downstream-impact changes.

For users on v1.27.0 / v1.27.1 / v1.27.2:
- Behavior identical to v1.27.2 (refactor only).
- Test count delta: +1 (1 new regression-lock test).

For users on v1.27.0 / v1.27.1 who skipped v1.27.2: still need v1.27.2
for the original bug-closure behavior.

## Out of Scope (deferred)

- `stripBswmdPackageRoot` helper consolidation — both
  `xlsxToEcucBatch.ts:71` and the (now-removable) Dcm-mapper
  strip-prefix idiom still need consolidation. v1.27.3 simplifies
  one mapper by hoisting the constant, but the strip-prefix regex
  (only on Com side) remains.
- Cross-module positive test for the synthetic-parent fallback
  (the case where `parentPath === moduleDef.shortName` actually
  succeeds) — already exercised by v1.27.2 mapper integration
  tests in `xlsxDcmServicesToEcucBatch.test.ts`. Adding a direct
  unit test would be redundant.
- `addContainer` + `addReference` shared helper for reference-param
  construction — code-review §5 NOTE from v1.27.2. Still deferred.
- Real-OEM full-coverage end-to-end test for `dcmConfigHandler` —
  v1.27.2 release notes note. Still deferred.

## Test Results

- pnpm format: clean
- pnpm lint: 0 errors, 0 warnings
- pnpm type-check: 0 errors (both `tsconfig.json` + `tsconfig.web.json`)
- pnpm vitest: **2865 + 6 SKIP / 0 fail** (+1 from v1.27.2's 2864)
- pnpm verify: 7-stage GREEN (format, lint, type-check, test,
  coverage, build, import-regression)
- Exit code: 0

## Next Steps

- v1.27.4 PATCH (optional) — address v1.27.2 §5 NOTE follow-ups
  (`addContainer` + `addReference` shared reference-param helper).
- v1.28.0 MINOR — long-term follow-ups: strip-prefix helper
  consolidation; real-OEM BSWMD override path for `dcmConfigHandler`;
  applied counter on `DcmConfigHandlerResult` (parallel to
  Com-stack's `{added, overwritten, skipped}` envelope).
