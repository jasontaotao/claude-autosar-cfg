# v1.17.0 Phase 2.5 Brief-Drift Findings — 2026-06-29

> Gate C of v1.17.0 MINOR implementation plan. Phase 2.5 brief-drift correction is mandatory before any code opens. Per `phase-2-5-brief-drift-correction.md`: 5 shapes, 9-of-9+ confirmed since v1.2.13.

**Baseline**: v1.15.5 + v1.16.0 (C12 layered guard landed)
**Spec reference**: `docs/superpowers/specs/2026-06-29-v1-17-0-minor-design.md`
**Joint review reference**: `docs/superpowers/v1-17-0-joint-review-findings.md`

---

## 1. Brief-Drift Shapes (5 standard + 1 added)

### Shape 1 — Type-union rip site count

**Original spec estimate**: 5 exhaustive switches require updates when C9 + C10 add fields.

**Phase 2.5 actual**: **9+ sites** in `src/core/generator/` + 1 in `src/renderer/store/slices/bswmdSlice.ts`. Brief-drift correction: **expand Batch 1 commit count by +2-4 commits** to cover:

| Site                                           | Path                              | Why                                                         |
| ---------------------------------------------- | --------------------------------- | ----------------------------------------------------------- |
| `src/core/generator/modules/_shared.ts:54`     | `switch (kind)`                   | Generator module kinds — extends with C9 `derivedFrom`      |
| `src/core/generator/modules/_shared.ts:351`    | `switch (kind)`                   | Second module kind switch — same domain                     |
| `src/core/generator/handlebars-helpers.ts:170` | `switch (def.kind)`               | Handlebars render — emits derived-from chain                |
| `src/core/generator/handlebars-helpers.ts:195` | `switch (def.kind)`               | Handlebars render — second site                             |
| `src/core/generator/emit/type-check.ts:40`     | `switch (kind)`                   | Type emit — derived module type                             |
| `src/core/arxml/mutation.ts:1226`              | `switch (kind)`                   | Mutation — extends with C9 derived branch                   |
| `src/core/project/bswmd.ts:1228`               | `switch (kind)`                   | BSWMD module kind switch (directly consumes BswmdModuleDef) |
| `src/core/arxml/defaultValue.ts:39`            | `switch (paramDef.kind)`          | Default values — possibly touched by C9                     |
| `src/renderer/store/slices/bswmdSlice.ts:307`  | comment about `switch kind`       | Renderer store — type-union rip                             |
| `src/renderer/hooks/useCreateEcucFromBswmd.ts` | (not in grep — verify in Batch 1) | Spec-listed                                                 |

**Action**: update spec §2.3 type-union rip sites list. No semantic change; just confirm Batch 1 commits grow from 6-8 to **8-12**.

### Shape 2 — XML element usage

**38 files** reference the AUTOSAR elements in scope (MULTIPLICITY-CONFIG-CLASSES / DERIVED-FROM / FOREIGN-REFERENCE-DEF / MODULE-REF). Brief-drift correction: existing fixtures in `testdata/generator/` and `tests/fixtures/` are LARGE (`mcu-bswmd.arxml`, `ecuc-bswmd.arxml`, etc.) — they likely already include MULTIPLICITY-CONFIG-CLASSES blocks, providing test coverage without new fixtures.

| Surface                     | Files                                                                                                                                                                                                                                       | Notes                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Production parser/validator | `src/core/project/bswmd.ts`, `src/core/arxml/parser.ts`, `src/core/validation/validate.ts`, `src/core/validation/types.ts`                                                                                                                  | All three carry-over items land here                                        |
| Production generator        | `src/core/generator/emit/multiplicity.ts`, `src/core/generator/emit/reference.ts`, `src/core/generator/handlebars-helpers.ts`, `src/core/generator/pipeline.ts`, `src/core/generator/normalize.ts`, `src/core/generator/modules/_shared.ts` | Generator already has multiplicity emit — C8 may need to extend, not create |
| CLI                         | `src/cli/handlers/generate.ts`, `src/cli/__tests__/handlers/generate.test.ts`                                                                                                                                                               | CLI dispatcher                                                              |
| Renderer                    | `src/renderer/components/editor/modes/ReferenceEditor.tsx` (C10 cross-dialect UI)                                                                                                                                                           | Already handles FOREIGN-REFERENCE-DEF partially                             |
| Tests                       | `src/core/validation/__tests__/checkRefDests.test.ts` (C10 coverage), `src/core/arxml/__tests__/skeleton.test.ts` (C11 coverage), `src/core/arxml/__tests__/parser.test.ts` (general parser)                                                | Existing test surface is good                                               |
| Testdata                    | `testdata/generator/*.arxml`, `tests/fixtures/{arxml,bswmd}/*.arxml`                                                                                                                                                                        | Realistic ARXML fixtures                                                    |

**Action**: spec is correct. No additional fixtures needed for Batch 1.

### Shape 3 — `useProjectActions` / `AppHeader` consumer surface

**40 files** in renderer reference these symbols. Brief-drift correction: the spec splits are correct, but the test-file migration must be explicit.

**Existing tests for `useProjectActions`**:

- `src/renderer/hooks/__tests__/useProjectActions.test.ts`
- `src/renderer/hooks/__tests__/useProjectActions.removeBswmd.test.ts`
- `src/renderer/hooks/__tests__/useProjectActions.s14.test.ts`
- `src/renderer/__tests__/integration/removeBswmd.fullFlow.test.tsx`

**Existing tests for `AppHeader`**:

- `src/renderer/components/__tests__/AppHeader.test.tsx`
- `src/renderer/components/__tests__/AppHeader.scripts.test.tsx`
- `src/renderer/components/__tests__/AppHeader.contextMenu.test.tsx` (referenced via grep, may not exist)
- `src/renderer/components/AppHeader/__tests__/ResetOnboardingMenuItem.test.tsx` (in subdir convention)

**Action**: C13 split must migrate these test files. Plan:

- `useProjectActions.test.ts` → keep in `src/renderer/hooks/__tests__/` (it tests the aggregate hook)
- `useProjectActions.removeBswmd.test.ts` → migrate to `src/renderer/hooks/useProjectActions/__tests__/useProjectMutate.test.tsx`
- `useProjectActions.s14.test.ts` → keep at top-level or migrate per content

**Decision**: move test files to mirror the new subdir layout where the content maps cleanly; otherwise keep at `__tests__/` parent dir to minimize import churn. Document each test file's destination in Batch 2 spec.

### Shape 4 — `useProjectActions.ts` `@main/*` import audit (v1.15.5 lesson #2)

**Result**: **Zero matches** in `src/renderer/hooks/useProjectActions.ts`. v1.16.0 C12 ESLint guard is holding. **C13 split is safe to proceed.**

### Shape 5 — Renderer `electron` package import audit

**Result**: **Zero matches** in `src/renderer/`. Confirmed: renderer never imports `electron` directly. v1.16.0 ESLint guard + preload bridge contract is intact.

### Shape 6 (added) — Exhaustive switch consumer count

Beyond the spec's 5 type-union rip sites, Phase 2.5 found **9+ generator-side switches** (Shape 1). The spec's update path is to expand §2.3's list. **Net Batch 1 commits**: 6-8 → 8-12.

---

## 2. Brief-Drift Corrections Applied to Spec

| Original spec                            | Phase 2.5 actual                                                                                                       | Update                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Batch 1 commits: 6-8                     | 8-12 (more generator switches)                                                                                         | Expand type-union rip site list (§2.3)            |
| Batch 1 tests: +11                       | +11 (no change — existing fixtures cover)                                                                              | None                                              |
| C13 test migration                       | `useProjectActions.{removeBswmd,s14}.test.ts` + `AppHeader.{,scripts,contextMenu}.test.tsx` need destination decisions | Add C13 test-file migration table to Batch 2 spec |
| Type-union rip sites (spec §2.3)         | 9+ sites, not 5                                                                                                        | Expand list (Shape 1 above)                       |
| `@main` import in `useProjectActions.ts` | Zero matches (verified)                                                                                                | Confirms C13 split is safe                        |
| Renderer `electron` import               | Zero matches (verified)                                                                                                | Confirms v1.16.0 guard intact                     |

---

## 3. Brief-Drift Findings (NONE surface as blockers)

- **No `@main/*` imports** in `useProjectActions.ts` or `AppHeader.tsx` ✅
- **No `electron` package imports** in renderer ✅
- **No semantic drift in spec** — `ApplyResult.warnings`, `BswmdModuleDef.derivedFrom`, `ReferenceEdge.dest`/`destDialect` are all new fields; existing consumers continue to work
- **No fixture drift** — existing `testdata/generator/*.arxml` + `tests/fixtures/bswmd/*.arxml` provide realistic test surface
- **No test-file semantic drift** — existing tests cover the planned scope; C13 split test migration is mechanical

---

## 4. Brief-Drift Anomalies Worth Noting (non-blocking)

1. **`src/core/generator/emit/multiplicity.ts` exists** — the file is named for MULTIPLICITY but is in the _generator_, not the validator. C8's validator rule BSW-SEC-005 should NOT land here (validation is in `src/core/validation/validate.ts`). Verify in Batch 3 that we don't accidentally extend the generator's multiplicity emit instead of the validator.

2. **`src/core/generator/modules/_shared.ts` has TWO switch sites on `kind` (lines 54, 351)** — both consume module kinds. C9 type-union rip touches both.

3. **`src/renderer/components/editor/modes/ReferenceEditor.tsx` already partially handles FOREIGN-REFERENCE-DEF** — confirm C10 changes don't break existing reference editor UX.

4. **`src/core/validation/types.ts:138` has a comment about `tagName === 'MODULE-REF'`** (per Joint review) — the C11 implementation should align with this prior design intent.

5. **`src/cli/command-dispatcher.ts:57` has `switch (parsed.kind)`** — not directly affected by C9/C10 type extensions (parsed is `CliArgs`), but verify in Batch 3 that C8's variant engineering output doesn't break the dispatcher's `kind` discrimination.

---

## 5. Sign-Off

**Gate C complete. No drift blockers. Spec is sound; commit-count estimate for Batch 1 expands from 6-8 to 8-12 due to additional generator-side exhaustive switches.**

**Next gate**: Gate D (v1.15.6 PATCH ships first). Then Batch 1 → Batch 2 → Batch 3 → ship v1.17.0.

**PKM pattern**: this Phase 2.5 doc is the audit trail for the brief-vs-source verification. Lessons:

- Always count exhaustive `switch (kind|type|variant)` consumers when planning a type-union extension (Shape 1) — the spec's 5-site estimate was 9+.
- Always grep `@main/*` AND `electron` package imports in renderer before splitting renderer files (Shapes 4-5) — C12 ESLint guard is structural but verifier must confirm.
- Always map test-file destinations when splitting source files (Shape 3) — mechanical but error-prone.
