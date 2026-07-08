# v1.37.1 PATCH — BSWMD Parser Module-Level Parameters/References + Un-bound H2 Validation

**Ship**: 2026-07-08 (TAG PENDING — T5 will fill)

**Baseline**: v1.37.0 MINOR `a840b22` (3048 + 7 SKIP / 0 fail)
**Target**: 3065 + 7 SKIP / 0 fail (+8 net delta from v1.37.0).

## What's in this PATCH

Closes the v1.37.0 MINOR "Known Follow-ups" item **v1.37.1 PATCH (parser
extension)** — extend `buildEcucModule` at
`src/core/project/bswmd.ts:997-1076` to populate
`BswModuleDef.parameters` / `BswModuleDef.references` from
`<ECUC-MODULE-DEF>`'s module-level `<PARAMETERS>` / `<REFERENCES>` blocks.
Then un-bind the v1.37.0 H2 validation gate so the runtime check actually
fires for BSWMDs that declare module-level entries.

3 atomic commits, each scoped to a single concern, all under the same
brief:

### T1 — `buildEcucModule` populates `BswModuleDef.parameters` from `<PARAMETERS>` (commit `16395dc`)

**Problem**: The v1.37.0 MINOR T3 (H2) added
`BswModuleDef.parameters?: readonly ParamDef[]` as an optional readonly
field, but the parser never populated it. `buildEcucModule` only read
`<CONTAINERS>` + `<PROVIDED-ENTRYS>` from `<ECUC-MODULE-DEF>`. Real
fixtures yield `moduleDef.parameters === undefined` for every BSWMD —
which `mutation.ts:590` collapses via `?? []` into the no-op branch.
The defence-in-depth check added in v1.37.0 was latent: the type
existed, the validation branched, but the parser never fed data into
the type.

**Fix**: `buildEcucModule` at `src/core/project/bswmd.ts:1013-1038` now
reads the module-level `<PARAMETERS>` block (sibling of `<CONTAINERS>`
inside `<ECUC-MODULE-DEF>`) and populates `BswModuleDef.parameters`
via the existing `buildParamList` helper — same dispatch
(`paramKindFromTag` + `buildParam`) used by `buildContainer` for
child-container parameters. Zero new dispatch logic; reused helper.

- `BswModuleDef.parameters` is now `readonly ParamDef[]` (always defined
  when `<PARAMETERS>` is present, initialised to `[]` when absent).
  Mirrors the established `ContainerDef.parameters` contract.
- The `?? []` fallback in `mutation.ts:590` stays (back-compat with
  hand-built `BswModuleDef` literals in `round-trip-mutation.test.ts`
  that bypass `buildEcucModule`).
- Pre-v1.37.0 baseline preserved: real BSWMDs in
  `samples/arxml/AUTOSAR_MOD_ECUConfigurationParameters.arxml` (100
  modules audited) declare module-level `<PARAMETERS>` on **0
  modules**, so the validation gate stays a no-op for the canonical
  fixture set until a BSWMD declares the entry.

File:line citation:

- `src/core/project/bswmd.ts:1013-1038` — new `<PARAMETERS>` extraction
  block (mirrors the T2 `<REFERENCES>` block structure below it).
- `src/core/project/bswmd.ts:1107` — `parameters: ParamDef[]` added to
  the returned `BswModuleDef` literal.
- `src/core/project/__tests__/bswmd.test.ts` — 3 NEW tests in
  `describe('parseBswmd - module-level <PARAMETERS> extraction (v1.37.1
  T1)')`: populates from `<PARAMETERS>` (EcuC `ModuleId` + `VendorId`
  shape), populates across all 5 param kinds (integer / float / string
  / boolean / enumeration), initialises to `[]` when the block is
  absent.

### T2 — `buildEcucModule` populates `BswModuleDef.references` from `<REFERENCES>` (commit `0454e64`)

**Problem**: Symmetric to T1. `BswModuleDef.references?: readonly
ReferenceDef[]` was declared in v1.37.0 but never populated — the
parser dropped the module-level `<REFERENCES>` block (where PduR
declares `<PduRBswImplication>` and similar top-level cross-module
references). Real `ECUC-REFERENCE-DEF` / `ECUC-FOREIGN-REFERENCE-DEF`
/ `ECUC-CHOICE-REFERENCE-DEF` declarations at the module level were
silently invisible to the runtime `addReference` validation.

**Fix**: `buildEcucModule` at `src/core/project/bswmd.ts:1037-1075` now
reads the module-level `<REFERENCES>` block via the existing
`buildRefList(node, parentPath)` helper (the same one `buildContainer`
uses for child-container references — zero new dispatch). Wired into
the returned `BswModuleDef` literal at `bswmd.ts:1107`. Symmetric to
T1: `references` is always defined when `<REFERENCES>` is present,
initialised to `[]` when absent.

- All 3 reference kinds (reference / foreign-reference /
  choice-reference) routed through the existing dispatch.
- `?? []` fallback in `mutation.ts:752` stays (same back-compat
  rationale as T1 — `round-trip-mutation.test.ts` builds literals
  without these fields).
- Real-fixture impact: 0 modules in the canonical fixture set
  declare module-level `<REFERENCES>` (verified by T1's pre-T2 audit),
  so the gate stays no-op in production today.

File:line citation:

- `src/core/project/bswmd.ts:1037-1075` — new `<REFERENCES>` extraction
  block (mirrors T1 parameters block).
- `src/core/project/bswmd.ts:1107` — `references: ReferenceDef[]`
  added to the returned `BswModuleDef` literal.
- `src/core/project/__tests__/bswmd.test.ts` — 3 NEW tests in
  `describe('parseBswmd - module-level <REFERENCES> extraction (v1.37.1
  T2)')`: populates from `<REFERENCES>` (PduR `PduRBswImplication`
  shape), populates across all 3 reference kinds, initialises to `[]`
  when the block is absent.

### T3 — Un-bind H2 validation gate (commit `8beb2d7`)

**Problem**: With T1 + T2 done, the parser now feeds the
`BswModuleDef.parameters` / `BswModuleDef.references` arrays. But the
H2 validation gate added in v1.37.0 MINOR T3 was bounded by
`length > 0` — the gate stays no-op unless a BSWMD explicitly
declares the array. With T1+T2, that condition is now met for any
real BSWMD that declares module-level entries. The un-bind is the
last step to close the v1.37.0 H2 latent-validation disclosure.

**Fix**: `src/core/arxml/mutation.ts` `addParameter` (around line 590)
and `addReference` (around line 752) `subPath === ''` module-level
branches — preceding comment blocks updated to describe the un-bound
form (parser now always populates the module-level arrays). Logic
retained as `?? []` + `length > 0 && !some(...)` because of a critical
brief-vs-implementation finding (see "Critical honesty" section
below).

File:line citation:

- `src/core/arxml/mutation.ts:590-596` — `addParameter` module-level
  validation branch. Comments updated for the un-bound rationale.
- `src/core/arxml/mutation.ts:752-758` — `addReference` module-level
  validation branch. Mirror of the `addParameter` change.
- `src/core/arxml/__tests__/mutation.test.ts` — 2 NEW tests in the
  v1.37.0 T3 H2 describe blocks:
  1. `v1.37.1 PATCH T3 — addParameter at module-level with EMPTY
     moduleDef.parameters passes (no validation surface)`.
  2. `v1.37.1 PATCH T3 — addReference at module-level with EMPTY
     moduleDef.references passes (no validation surface)`.

Both tests prove the un-bound form is naturally a no-op when the BSWMD
omits module-level entries (no declared entries to match against →
`.some(...)` returns false → guard short-circuits).

## Critical honesty (brief-vs-implementation deviation)

The T3 brief instructed: *"Drop the `length > 0` guard."* The
implementer **retained** the guard with updated comments instead of
dropping it. Rationale:

1. **`!some([])` returns `true`** — JavaScript semantics. Dropping the
   `length > 0` guard would cause the validation to fire for EVERY
   `paramDef` / `refDef` added to a BSWMD with an empty module-level
   declared set — i.e. it would break the pre-v1.37.0 baseline for
   every BSWMD that omits module-level params/refs (the 100-of-100
   majority in our canonical fixture set). The implementer caught
   this on the first test run (both NEW T3 tests failed with
   `r.ok === false` when the guard was dropped) and reverted to the
   bounded form with updated comments.

2. **Type optionality** — `BswModuleDef.parameters` / `.references`
   remain typed as `readonly T[]` (optional — `readonly parameters?:
   readonly ParamDef[]` at `src/core/project/bswmd.ts:102` and
   `:110`). The 11 round-trip tests in
   `src/core/arxml/__tests__/round-trip-mutation.test.ts` build their
   own `BswModuleDef` literals at lines 155 / 203 / 242 WITHOUT these
   fields (they bypass `buildEcucModule`). Dropping `?? []` caused 11
   of 21 round-trip tests to crash with `TypeError: Cannot read
   properties of undefined (reading 'length')` in the first attempt
   — restoring `?? []` fixed them.

3. **Semantic intent preserved** — The brief's intent was "make the
   gate fire when a real BSWMD declares module-level params". The
   `length > 0` guard encodes exactly that: *"no validation surface →
   no-op"* when the BSWMD omits the entry; *"fire the gate"* when
   the parser populates a non-empty array. This is now wired up by
   T1 + T2: a BSWMD that declares `<PARAMETERS>` or `<REFERENCES>`
   will yield a populated non-empty array, and the gate will fire.

The PATCH is correct as landed. The brief's literal wording was
adapted to preserve the stated behavioural intent while honouring
JavaScript semantics and the established type contract.

## Behavioural change (intended by this PATCH)

BSWMDs that **DECLARE** module-level params (EcuC's `<ModuleId>`,
`<VendorId>`; PduR's `<PduRBswImplication>` etc.) now actually
validate `addParameter` / `addReference` calls against the BSWMD
declarations. Previously the validation was a silent no-op for these
modules because the bounded `length > 0` guard short-circuited
before the parser populated the arrays.

This is the intended fix — closes the v1.37.0 H2 defence-in-depth
breach. When a user of a BSWMD that DOES declare module-level params
passes a stale `paramDef` / `refDef`, they will now hit
`invalid-param-type` for the first time — exactly the gap the
v1.37.0 review flagged.

## Production impact (verified)

Scanned `samples/arxml/AUTOSAR_MOD_ECUConfigurationParameters.arxml`
(100 modules) in T1 — **0 modules declare module-level
`<PARAMETERS>` / `<REFERENCES>`**. Production behaviour unchanged for
all existing BSWMDs in the canonical fixture set. The validation
only fires for BSWMDs that DECLARE module-level params (the
intended fix).

The 21 round-trip-mutation tests still pass (all 21, including the 11
that build `BswModuleDef` literals bypassing `buildEcucModule`).
Back-compat preserved.

## Future hardening follow-up (not in this PATCH)

`round-trip-mutation.test.ts` at lines 155 / 203 / 242 builds
`BswModuleDef` literals bypassing `buildEcucModule` — they don't
populate `parameters` / `references`. A future PATCH should migrate
these to populate explicitly (or route through `buildEcucModule`),
after which the `?? []` fallback in `mutation.ts:590` / `:752` can
be dropped. T1 + T2 + T3 set up the data path; the test fixture
migration is a separate hygiene item that doesn't block this ship.

## Lessons (NEW from this PATCH)

1. **`bounded-validation-guard-empty-array-remains-correct-when-populated-by-parser`**
   — When removing bounded checks (e.g. `length > 0`), preserve them
   if they semantically encode "no validation surface → no-op" rather
   than "no-op for legacy back-compat". The guard is correct even
   when the array is always populated by the parser, because the
   empty case still encodes a meaningful invariant: *"this BSWMD has
   no declared entries to validate against"*. Dropping the guard
   would conflate that invariant with a stale `undefined` value
   from pre-T1 BSWMDs. The `!some([])` JavaScript behavior is the
   trap: `Array.prototype.some` returns false on an empty array, so
   the negated form `!some([])` returns true — meaning the
   validation would fire spuriously.

## Test budget

| Stage | Count | Delta |
|---|---|---|
| v1.36.1 baseline | 3048 | — |
| v1.37.0 MINOR final | 3057 | +9 net |
| T1 — `bswmd.test.ts` module-level `<PARAMETERS>` | +3 | 3060 |
| T2 — `bswmd.test.ts` module-level `<REFERENCES>` | +3 | 3063 |
| T3 — `mutation.test.ts` un-bound gate | +2 | 3065 |
| **v1.37.1 final** | **3065** | **+8 net** |

Verified final count from T4's `pnpm exec vitest run`: **3065 + 7
SKIP / 0 fail** (+8 net from v1.37.0's 3057 baseline; +17 net from
v1.36.1's 3048 baseline). Per-task delta: T1 +3 + T2 +3 + T3 +2 =
**+8 net**, matching.

All 3 modified files end with trailing newline (the auto-format hook
caught the trailing-newline drift before T4's commit; no manual
intervention needed).

## Reverse-Closes

- v1.37.0 follow-up: *"Extend `buildEcucModule` at
  `src/core/project/bswmd.ts:974-1026` to populate
  `BswModuleDef.parameters` / `BswModuleDef.references` from
  `item['PARAMETERS']` / `item['REFERENCES']`. ... Then un-bound the
  H2 validation by dropping the `moduleParams.length > 0` /
  `moduleRefs.length > 0` guards — the parser will populate the
  arrays, and the check will fire whenever the BSWMD declares the
  entry."* — **CLOSED** (with the guard-preservation honesty note
  above).

## Cross-references

- [v1.37.0 release notes](../v1.37.0/README.md) (parent MINOR; the
  latent H2 was disclosed here)
- [v1.37.0 design spec](../../superpowers/specs/2026-07-08-v1-37-0-minor-mutation-engine-purity-design.md)
- [v1.37.0 implementation plan](../../superpowers/plans/2026-07-08-v1-37-0-minor-mutation-engine-purity.md)
- [v1.37.0 progress ledger](../../../.git/sdd/progress-v1.37.0.md)
- [v1.37.0 T1-T4 reports](../../../.git/sdd/task-*-report.md)
- [v1.37.1 T1 report](../../../.git/sdd/task-1-report.md) — buildEcucModule populates parameters
- [v1.37.1 T2 report](../../../.git/sdd/task-2-v1.37.1-report.md) — buildEcucModule populates references
- [v1.37.1 T3 report](../../../.git/sdd/task-3-report.md) — un-bind H2 validation gate (with brief-bug-caught honesty note)
- [v1.37.1 T4 report (this release-artifacts)](../../../.git/sdd/task-4-report.md)