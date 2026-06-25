# v1.11.4 — R4.0 version list single-source + E2E AppHeader fallback + BSWMD fixture extract (PATCH)

**Date**: 2026-06-24
**Type**: PATCH (3 commits since v1.11.3, on `feature/v1-11-4-patch-debt`)
**PR**: (TBD — gh API)
**Merge commit**: (TBD)
**Tag**: `v1.11.4` (force-moved to merge commit per v1.5.1 / v1.7.0 / v1.11.2 / v1.11.3 pattern)

## Summary

Closes the remaining v1.12.0+ PATCH backlog items (A: R4.0 version list debt, B: E2E harness AppHeader fallback, C: BSWMD fixture extract) ahead of the upcoming v1.12.0 MINOR (joint review rerun + BSW code generator 补完). Three independent fixes, no behavior change in production paths, all quality gates clean.

## PATCH A — R4.0 version list single-source

**Problem**: `SUPPORTED_ARXML_VERSIONS` (types.ts:187) + `ARXML_VERSIONS` (version.ts:21) were two hand-synced lists. v1.8.5 (commit `8870566`) had a real bug where `'4.0'` was added to one list but forgotten in the other, breaking R4.0 ECUC file parsing (fixed in v1.8.5 with commit `2e48ccf`). The current code has a real (but intentional) asymmetry: `00005`/`00006` 5-digit literals are in `ARXML_VERSIONS` (BSWMD→ARXML 1:1 direct-map set) but not in `SUPPORTED_ARXML_VERSIONS` (parser-accept set). The asymmetry is correct but undocumented and a single-side edit could re-introduce drift.

**Fix**:
- `src/core/arxml/types.ts:5-49` — Extracted `ARXML_DIRECT_MAP_VERSIONS` (13-item `as const` array) as the canonical source of truth.
- `src/core/arxml/types.ts:48` — `ArxmlVersion` is now derived as `(typeof ARXML_DIRECT_MAP_VERSIONS)[number]`.
- `src/core/arxml/types.ts:223-237` — `SUPPORTED_ARXML_VERSIONS` is a documented 11-item subset (parser-accept set; excludes `00005`/`00006` with rationale inline).
- `src/core/arxml/version.ts:28-30` — `ARXML_VERSIONS` is now `new Set(ARXML_DIRECT_MAP_VERSIONS)` (full 13-item direct-map set).
- Adding a new version in the future is a single-line edit at one location.

**Tests** (3 new in `src/core/arxml/__tests__/types.test.ts`):
- `is the canonical 13-item list of ARXML versions` — pins the canonical list size and contents
- `ArxmlVersion is the literal union of ARXML_DIRECT_MAP_VERSIONS` — compile-time + runtime check
- `SUPPORTED_ARXML_VERSIONS is a strict subset of ARXML_DIRECT_MAP_VERSIONS (parser-accept ⊂ direct-map)` — pins the intentional asymmetry (00005/00006 in direct-map, NOT in parser-accept)
- `mapBswmdVersionToArxml returns every ARXML_DIRECT_MAP_VERSIONS entry unchanged (full 1:1 direct-map)` — semantic test for the BSWMD↔ARXML mapping

## PATCH B — E2E harness AppHeader fallback

**Problem** (v1.11.2 P1, carryover): `AppHeader` calls `window.autosarApi.getAppVersion()` on undefined `window.autosarApi`, crashing 9 E2E specs at `waitForHeader` in headless environment (Vite-driven without Electron's preload).

**Fix** (`src/renderer/components/AppHeader.tsx:194-211`):

```typescript
if (window.autosarApi?.getAppVersion !== undefined) {
  void window.autosarApi.getAppVersion().then(setAppVersion);
} else if (typeof window.autosarApi === 'undefined') {
  setAppVersion('dev');  // E2E harness: expected fallback
} else {
  setAppVersion('?');    // Production anomaly: preload bridge failure,
                         //   future IPC refactor dropped the channel,
                         //   or race during Electron startup
}
```

The two-fallback design (per code-review MEDIUM) distinguishes:
- **`'dev'`** — `autosarApi` entirely undefined (headless E2E, expected)
- **`'?'`** — `autosarApi` present but `getAppVersion` missing (production anomaly; surfaces the bug instead of silently masking it)

**Tests** (2 new in `src/renderer/components/__tests__/AppHeader.test.tsx`):
- `renders vdev when window.autosarApi is undefined (headless E2E harness case)` — pins the expected E2E fallback
- `renders v? when window.autosarApi exists but getAppVersion is missing (production-anomaly signal)` — pins the production-failure distinction

## PATCH C — BSWMD fixture extract

**Problem**: `makeBswModule` + `makeBswmd` were duplicated across 3 test files (`useArxmlStore.addparam.test.ts`, `useArxmlStore.deleteModule.test.ts`, `useArxmlStore.mutation.test.ts`). The mutation version had a different signature (4-arg with subContainer) than addparam/deleteModule (4-arg with paramPath), so the duplication was not 100% identical but was near-identical in structure.

**Fix**:
- `src/renderer/store/__tests__/__fixtures__/bswmd.ts` (NEW, 137 lines) — exports 3 helpers:
  - `makeBswModule(module, container, param, paramPath)` — single topContainer with 1 param (addparam + deleteModule tests)
  - `makeBswModuleWithSubContainer(module, topContainer, subContainer, param?)` — topContainer with 1 subContainer (infinite) + 1 param (mutation tests)
  - `makeBswmd(mod)` — wraps a BswModuleDef in a BswmdDocument with version 4.6
- `useArxmlStore.addparam.test.ts` (-43 lines local def, +8 lines import comment)
- `useArxmlStore.deleteModule.test.ts` (-43 lines local def, +6 lines import comment)
- `useArxmlStore.mutation.test.ts` (-56 lines local def, +10 lines import comment, uses `import { makeBswModuleWithSubContainer as makeBswModule }` alias to keep 7 call sites unchanged)

**Tests**: 33 unchanged in 3 affected files (pure fixture refactor, no behavior change).

## Code review

`code-reviewer` agent verdict: `0C / 0H / 1M / 2L` → **APPROVE**.

- **MEDIUM (PATCH B, resolved)**: Fallback distinguishability between E2E (`autosarApi === undefined`) and production anomaly (`autosarApi` present but `getAppVersion` missing) was added in the same commit. `'dev'` for E2E, `'?'` for production.
- **LOW (PATCH A)**: Removed `as const` on `SUPPORTED_ARXML_VERSIONS`, losing literal-type narrowing at the array level. The semantic information is preserved (subset invariant test walks every entry at runtime). Stylistic, not a correctness bug.
- **LOW (PATCH C)**: Dual-helper design (`makeBswModule` + `makeBswModuleWithSubContainer`) requires call-site awareness. Documented in the fixtures module's header comment and at the alias import site. Not a correctness concern.

## Quality gates

- pnpm format: clean
- pnpm lint: 0
- pnpm type-check: 0
- pnpm test: 2258 pass + 1 skip
- pnpm build: success
- pnpm vitest --config vitest.regression.config.ts: 2 pass (import round-trip)

## Files changed

- `CHANGELOG.md` (+42)
- `src/core/arxml/types.ts` (+76 / -24)
- `src/core/arxml/version.ts` (+13 / -14)
- `src/core/arxml/__tests__/types.test.ts` (+67 / -3)
- `src/renderer/components/AppHeader.tsx` (+18 / -3)
- `src/renderer/components/__tests__/AppHeader.test.tsx` (+57 / -19)
- `src/renderer/store/__tests__/__fixtures__/bswmd.ts` (NEW, +137)
- `src/renderer/store/__tests__/useArxmlStore.addparam.test.ts` (-35)
- `src/renderer/store/__tests__/useArxmlStore.deleteModule.test.ts` (-37)
- `src/renderer/store/__tests__/useArxmlStore.mutation.test.ts` (-46)
- `docs/release-notes/release-notes-v1.11.3.md` (NEW, carryover from v1.11.3 ship)
- `docs/release-notes/release-notes-v1.11.4.md` (NEW)

## Related

- v1.11.3 PATCH: tier-4 fold extends to outer AUTOSAR wrap (the prior PATCH that closed the Adc add/remove regression)
- v1.11.2 PATCH: trust sprint (close 4 HIGH from v1.10.2 joint review) — P1 E2E harness gap originated here
- v1.12.0+ backlog: 1 MINOR candidate remaining (D: joint review rerun + E: BSW code generator 补完)
- [[claude-autosarcfg-r4-0-supported-fix]] — historical root cause of why version-list debt matters
- [[claude-autosarcfg-v1-11-2-known-issues]] — P1 E2E harness gap origin
- workflow `workflows/autosarcfg-joint-review.mjs` — for v1.12.0 D (joint review rerun)
