# v1.37.0 MINOR — Mutation Engine Purity + Reference Correctness + BSWMD Module-Level Validation

**Ship**: 2026-07-08 (TAG PENDING — T5 will fill)

**Baseline**: v1.36.1 PATCH `c661a13` (3048 + 7 SKIP / 0 fail)
**Target**: 3057 + 7 SKIP / 0 fail (+9 net delta from v1.36.1).

The spec's "+5 net" / "+7 net" estimates were per-file arithmetic that
under-counted the test restructuring needed. Real math after all 3 tasks:

- T1 added 4 NEW tests (the new `setters.test.ts` file had zero pre-existing
  tests; the implementer absorbed 1 prior `script-pduid-validation.test.ts`
  failure that was the canary for the C1 contract breach — T1 fixed it).
- T2 added 1 NEW test (the seeded-then-addReference idempotent branch was
  previously uncovered).
- T3 added 4 NEW tests (2 declared-passes + 2 undeclared-errors at module
  level for both `addParameter` + `addReference`).
- Net = **+9 tests**, not +5 / +7.

Verified final count from T4's `pnpm exec vitest run`: **3057 + 7 SKIP /
0 fail**.

## What's in this MINOR

### C1: mutation engine purity — `setParamInDocument` / `addChildInDocument` / `removeChildInDocument` return new `ArxmlDocument` (commit `4147203`)

**Problem**: The 3 helpers in `src/core/project/setters.ts` were
`void`-returning and mutated `doc.packages[].elements[]` in place via the
file-private `spliceContainer` helper. The top-of-file contract comment in
`src/core/mutation/applyPatchSteps.ts:8-21` claimed "all ops are
immutable and return new doc refs" but the legacy `core/project/` helpers
bypassed that contract. The 2 existing callsites in `applyPatchSteps`
(`applySetParam` + `applyReplaceOp`) happened to be pre-guarded so no
throw escaped in production — but the contract breach was latent, and
the next caller would silently mutate the caller's doc.

**Fix**: The 3 helpers now return `ArxmlDocument` (immutable update
pattern that mirrors `core/arxml/mutation.ts`'s `replaceElement`-based
rebuild). The legacy `spliceContainer` helper was renamed `replaceContainer`
and demoted from `export` to file-private. Each helper rebuilds the doc
tree with the spread-and-replace pattern; reference-equality
(`next !== doc`) is now the authoritative "did anything change?" signal.

`removeChildInDocument` preserves ref-equality on the no-op short-circuit
(via `if (nextChildren.length === target.children.length) return doc`)
so a remove of a non-existent child doesn't allocate a fresh doc.

**Bonus consumer updates caught by the type system** (not in the original
brief):

- `src/main/script/transaction.ts` — `createTransaction` now wraps state
  in a closure and exposes `project` via a getter so post-commit reads see
  the new doc binding (the immutable setters return a new ref we swap into
  `state.project`). The closure `TX_STATE` `WeakMap` lets
  `commitTransaction` reach the state for assignment. External callers
  cannot mutate the project ref because they cannot reach `TX_STATE` (not
  exported).
- `tests/e2e-vitest/__tests__/script-pduid-validation.test.ts` — the
  `injectDuplicate` test captured the returned new ref across 2 sequential
  `setParamInDocument` calls. This was the canary test for the C1
  contract breach (it had been failing on the new ref-equality assertion
  surface before T1).

File:line citation:

- `src/core/project/setters.ts` — `setParamInDocument` (returns
  `ArxmlDocument`), `addChildInDocument` (returns `ArxmlDocument`),
  `removeChildInDocument` (returns `ArxmlDocument`), `replaceContainer`
  (file-private, immutable). `ArxmlPackage` added to the type import for
  `rebuildPackage`'s signature.
- `src/core/project/__tests__/setters.test.ts` (NEW, 4 tests) — ref-
  equality contract tests for all 3 helpers (new doc on real mutation,
  source tree untouched, mutation visible in new doc, no-op short-circuit
  returns same ref).
- `src/core/mutation/applyPatchSteps.ts:8-21` — top-of-file comment
  block updated to "all ops are immutable and return new doc refs";
  the misleading "mutates the doc in place" + "must use applied" excuse
  was removed. `applySetParam` + `applyReplaceOp` now capture `nextDoc`.
- `src/main/script/transaction.ts` — `createTransaction` closure pattern
  with `WeakMap` `TX_STATE` so the new doc binding is reachable for
  post-commit reads. Defensive guard throws if `commitTransaction` is
  called on a tx not built via `createTransaction`.
- `src/main/script/__tests__/transaction.test.ts` — 2 assertions updated
  to read from `tx.project` (post-commit binding) instead of the source
  `project` const (now immutable).
- `src/core/mutation/__tests__/apply-patch-replace-rejects-shape.test.ts`
  — 2 assertions updated to read from `result.doc` instead of `doc`.
- `tests/e2e-vitest/__tests__/script-pduid-validation.test.ts` —
  `injectDuplicate` updated to capture the returned new ref.

### H1: `addReference` accepts user-supplied target path via `options?: { value?: string }` (commit `3705d8c`)

**Problem**: `addReference`'s idempotent-overwrite branch (the path
exercised when `addContainer` auto-seeds an empty reference placeholder)
hard-coded `value: ''` while its comment claimed it "carries the
user-supplied target path". The function signature took no `value` arg;
the comment was documentary fraud — it promised the renderer would
receive the picked path in `record.value` but actually only `definitionRef`
carried the path. The fresh-write branch (used when the container is
empty) had the same shape.

**Fix**: Added `options?: { value?: string }` as the 5th parameter of
`addReference` (after `moduleDef`). Both the idempotent-overwrite branch
and the fresh-write branch now consume `options?.value ?? ''` — default
`''` for backward compat with callers that don't pass the option.

The pre-existing renderer caller at
`src/renderer/store/slices/mutationSlice.ts:303,326` is positional and
does not pass `options`; it compiles unchanged because the parameter is
optional. The H2 follow-up wiring (the renderer passes `{ value }` from
the user's picked path) is T5 scope.

**Note on signature**: The brief's plan showed a 7-param `addReference`
(post the legacy signature with `pkg` / `parent` / `moduleDef` exposed).
The actual post-T1 function is 4-param — `pkg` and `parent` are computed
inside via `locateParent`. The implementer adapted the brief's intent
by adding `options` as the 5th param (after `moduleDef`); the renderer
caller's positional args remain compatible.

File:line citation:

- `src/core/arxml/mutation.ts` — `addReference` signature gains
  `options?: { value?: string }` as 5th param. Idempotent branch + fresh-
  write branch both use `options?.value ?? ''`. Idempotent branch also
  sets `definitionRef: refDef.path` (preserved from pre-v1.37.0 behavior).
- `src/core/arxml/__tests__/mutation.test.ts` — new test "v1.37.0 MINOR
  T2 (H1) — seeded-then-addReference with non-empty value option fills
  value" inside the existing `describe('addReference', ...)` block. Seeds
  an empty reference (auto-seeded-placeholder pattern), then re-calls
  `addReference` with `{ value: USER_PICKED_PATH }`. Asserts
  `value === USER_PICKED_PATH` and `definitionRef === USER_PICKED_PATH`.

### H2: module-level BSWMD validation in `addParameter` + `addReference` (commit `0db85cd`)

**Problem**: `addParameter` and `addReference` skipped their BSWMD
validation when `subPath === ''` (the container path ends at a module
segment). The justification in the original code was "modules rarely
carry parameters" — but "rarely" ≠ "never". AUTOSAR modules DO declare
top-level parameters (e.g. `EcuC` has `<ModuleId>`, `<VendorId>`) and
top-level references (e.g. `PduR` has `<PduRBswImplication>`). The
defence-in-depth check was a silent gap.

**Fix**: Added the `else` branch in the `subPath === ''` case of both
`addParameter` (line 590-596) and `addReference` (line 754-760). The
new branch validates against `moduleDef.parameters ?? []` (or
`moduleDef.references ?? []` for `addReference`). Both return the same
`{ ok: false, error: { kind: 'invalid-param-type', key, expected } }`
shape as the sub-container branch.

**Type extension**: `BswModuleDef` (in `src/core/project/bswmd.ts:81-146`)
gains 2 new optional readonly fields:

- `parameters?: readonly ParamDef[]` — module-level `<PARAMETERS>` block
  from `<ECUC-MODULE-DEF>`.
- `references?: readonly ReferenceDef[]` — module-level `<REFERENCES>`
  block from `<ECUC-MODULE-DEF>`.

Both are `?:`-optional with `undefined`-defaulting for full back-compat
with every existing test fixture + `BswmdDocument`. Uses the same
`exactOptionalPropertyTypes: true` pattern as the existing
`moduleHeader?: string | undefined` field at `bswmd.ts:128`.

**CRITICAL honesty note (bounded validation = latent until parser)**:

T3's fix is **partially complete**. The validation gate fires correctly
when a BSWMD declares module-level `<PARAMETERS>` / `<REFERENCES>`; the
parser does not yet extract these from `<ECUC-MODULE-DEF>`. The BSWMD
parser entry point is `buildEcucModule` at
`src/core/project/bswmd.ts:974-1026` — it does not currently read
`item['PARAMETERS']` or `item['REFERENCES']`. Today, every real BSWMD
yields `moduleDef.parameters === undefined` (or `[]`), so the new
check is a no-op for production code paths.

The 4 new tests still pass because the test fixture populates the new
fields directly via `makeBswModule({ ..., parameters: [...] })`. The
defence-in-depth is **latent** — it will activate automatically the
moment a follow-up PATCH teaches the parser to extract module-level
params/refs from `<ECUC-MODULE-DEF>`.

The implementer bounded the validation (`length > 0`) so production
callsites without parser-populated data are no-ops. This preserves every
existing BSWMD consumer + the 11 round-trip tests that load real BSWMDs
and call `addParameter` at module root.

**Why the brief's plan was not directly implementable in 2 files**:
The plan (`docs/superpowers/plans/2026-07-08-v1-37-0-minor-mutation-engine-purity.md:660-665`)
assumed `moduleDef.parameters` / `moduleDef.references` already existed
as `readonly` arrays on `BswModuleDef`. **They do not.** Pre-v1.37.0,
`BswModuleDef` (defined at `src/core/project/bswmd.ts:81-123`) had only
`containers`, `providedEntries`, plus dialect metadata — no `parameters` /
`references`. The implementer followed the path of least invasiveness:
added the fields as optional, bounded the validation, shipped a 3-file
commit instead of 2. This required touching `bswmd.ts` (the type
extension), `mutation.ts` (the validation), and `mutation.test.ts` (the
fixtures + new tests).

File:line citation:

- `src/core/arxml/mutation.ts:590-596` — `addParameter` module-level
  validation branch. Bounded by `moduleParams.length > 0` so back-compat
  with pre-v1.37.0 BSWMDs is preserved.
- `src/core/arxml/mutation.ts:754-760` — `addReference` module-level
  validation branch. Mirror of the `addParameter` change.
- `src/core/project/bswmd.ts:88-110` — `BswModuleDef.parameters` +
  `BswModuleDef.references` optional readonly arrays with explanatory
  JSDoc.
- `src/core/arxml/__tests__/mutation.test.ts` — `makeBswModule` fixture
  extended with optional `moduleLevel: { parameters?, references? }` bag
  (defaults to `[]` so 3000+ existing tests don't need rewiring). 4 NEW
  tests: declared-passes + undeclared-errors for both `addParameter` +
  `addReference` at module-level container path.

## Lessons (NEW from this MINOR)

1. `legacy-mutation-helper-bypasses-documented-immutable-contract` —
   When a public API documents "immutable" but a legacy helper mutates
   in place, the fix is to refactor the helper to return new refs (mirror
   the immutable engines in the same file). The mutation engine
   (`core/arxml/mutation.ts`) already uses `replaceElement`; the legacy
   `core/project/` helpers had silently diverged. The next caller would
   have silently mutated the caller's doc.
2. `api-comment-vs-implementation-divergence-is-a-symptom-of-an-api-gap`
   — When a code comment claims behavior the implementation doesn't
   deliver, the function signature is missing a parameter. The H1 finding
   was a comment promising "carries the user-supplied target path" but
   the function took no `value` arg. The fix is to add the parameter
   (default to current behavior) and let the comment become true.
3. `conditional-validation-skip-with-justification-still-skips-validation`
   — "rarely" ≠ "never". When a guard has `if (...)` justification, the
   `else` should validate against the right other-def, not skip. The H2
   justification "modules rarely carry parameters" was wrong; AUTOSAR
   modules DO declare top-level parameters (EcuC's `ModuleId`,
   `VendorId`).

## Test budget

| Stage | Count | Delta |
|---|---|---|
| v1.36.1 baseline | 3048 | — |
| T1 (C1) — `setters.test.ts` NEW | +4 | 3052 |
| T2 (H1) — `mutation.test.ts` addReference | +1 | 3053 |
| T3 (H2) — `mutation.test.ts` module-level | +4 | 3057 |
| **v1.37.0 final** | **3057** | **+9 net** |

**Actual verified count (T4 `pnpm exec vitest run`):** 3057 + 7 SKIP /
0 fail (+9 net from v1.36.1's 3048 baseline). See "Target" at top of
file.

All 3 modified files end with trailing newline (T1 reviewer's prior miss
was avoided on T2 + T3).

## Known follow-ups (deferred to v1.37.x PATCH chain)

The MINOR surfaced 3 follow-up items across the v1.36.1 review + this
MINOR's implementer notes:

- **v1.37.1 PATCH (parser extension)**: Extend `buildEcucModule` at
  `src/core/project/bswmd.ts:974-1026` to populate
  `BswModuleDef.parameters` / `BswModuleDef.references` from
  `item['PARAMETERS']` / `item['REFERENCES']`. Reuse `buildContainerList`'s
  `ECUC-INTEGER-PARAM-DEF` / `ECUC-REFERENCE-PARAM-DEF` handling at
  `bswmd.ts:1040-1078`. Then un-bound the H2 validation by dropping the
  `moduleParams.length > 0` / `moduleRefs.length > 0` guards — the
  parser will populate the arrays, and the check will fire whenever the
  BSWMD declares the entry.
- **v1.37.2 PATCH (renderer wiring for H1)**: Renderer caller at
  `src/renderer/store/slices/mutationSlice.ts:303,326` (reference-pick
  flow) currently does not pass `options.value`. Wire the user's picked
  path through to `addReference` so the `value` field on the stored
  `ParamValue` matches the picked path (the H1 fix only changed the API
  surface; the renderer's call to consume the new option is a separate
  item).
- **C1 siblings (deferred from v1.36.1 review)**: L2 deep-walk, M1
  equality, M3 dest equality, M4 permissive fallback, L1 null coerce —
  each a separate PATCH or bundled into a future equality-semantics
  MINOR.

No NEW follow-ups generated by the H2 latent-validation disclosure
(the disclosure itself is the lesson; the parser extension is the
deferred follow-up listed above).

## Reverse-Closes

- v1.36.1 post-ship review C1: "setters.ts mutates doc in place; bypasses
  the immutable contract documented in applyPatchSteps.ts:8-21"
- v1.36.1 post-ship review H1: "addReference comment claims it carries
  user-supplied target path but the signature has no value param"
- v1.36.1 post-ship review H2: "addParameter + addReference skip BSWMD
  validation at module-level container paths"

## Cross-references

- [v1.36.1 release notes](../v1.36.1/README.md) (parent PATCH; review
  target)
- [v1.37.0 design spec](../../superpowers/specs/2026-07-08-v1-37-0-minor-mutation-engine-purity-design.md)
- [v1.37.0 implementation plan](../../superpowers/plans/2026-07-08-v1-37-0-minor-mutation-engine-purity.md)
- [v1.37.0 progress ledger](../../../.git/sdd/progress-v1.37.0.md)
- [v1.37.0 T1 (C1) report](../../../.git/sdd/task-1-report.md)
- [v1.37.0 T2 (H1) report](../../../.git/sdd/task-2-report.md)
- [v1.37.0 T3 (H2) report](../../../.git/sdd/task-3-report.md)
- [v1.37.0 T4 (this release-artifacts) report](../../../.git/sdd/task-4-report.md)
