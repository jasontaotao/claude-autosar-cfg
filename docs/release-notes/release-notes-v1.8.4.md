# v1.8.4 — Three correctness bugfixes

> **Release date**: 2026-06-22
> **Predecessor**: v1.8.3 (`@dbc-forge/core` git submodule migration) SHIPPED 2026-06-22 (HEAD `f36648b`)
> **Type**: PATCH
> **Branch**: `main`
> **Commits since v1.8.3**: 5 (4 bugfix + 1 review-addressing)

## What's new

Three HIGH/MEDIUM correctness bugs found by manual review of v1.8.3
SHIPPED code. No new feature, no API change, no schema change.

### Bug 1 — `generateEcucSkeleton` now follows BSWMD `doc.version`

Previously `src/core/arxml/skeleton.ts:88` hardcoded
`version: '4.6'` for **every** generated ECUC skeleton, regardless of
the source BSWMD's declared version. A BSWMD with `xmlns=...
/schema/r5.0` or `.../schema/00051` (R22-11) produced a skeleton
written with the r4.6 namespace + `AUTOSAR_4-6-0.xsd`
`schemaLocation` — invalid for the source.

Fix: new `mapBswmdVersionToArxml(v: string): ArxmlVersion` at
`src/core/arxml/version.ts` maps the BSWMD accept set to the ARXML
emit set. Pass-through for every value in the `ArxmlVersion` union;
defaults to `'4.6'` for BSWMD-only values (notably `'4.0'` and any
future vendor / r4.8+ literal — silent fallback preserves v1.8.3
behaviour for the no-direct-match case).

### Bug 2 — `addContainer` allows multi-instance containers

Previously `mutation.ts:145-147` unconditionally rejected any 2nd
sibling with the same shortName via `name-conflict`, even when the
BSWMD declared `upperMultiplicity: 'infinite'` (or any value > 1).
AUTOSAR ECUC spec permits multiple instances of any container with
`upper > 1` — examples include multiple `Pdu` under one `Com`, or
multiple `DemEventParameter` under one `DemEventSet`.

Fix: drop the Step 3 name-conflict guard for containers. When a
sibling with the same shortName already exists, the core layer
auto-suffixes the new container with `_<n>` (Vector CANdb++ default
naming). Step 2's multiplicity-exceeded check still fires first when
a finite `upper` is exhausted, so the suffix loop never produces more
instances than the BSWMD allows.

**User-visible change**: the picker no longer rejects a 2nd click on
the same container row; instead it inserts a sibling named
`Pdu_1` / `Pdu_2` / etc. Parameter uniqueness (which must hold) is
preserved by `addParameter` (separate code path).

### Bug 3 — `📋 N/M` chip count reflects ECUC-instantiated docs

Previously `src/renderer/components/ProjectPanel.tsx:339-340` derived
`activeCount` from `getActiveModules(schema).length` — a BSWMD-side
filter on `disabledModules`, unrelated to whether any ECUC doc was
generated from this BSWMD. The chip sat next to the `+` button the
user clicks to CREATE ECUC docs, so the visual adjacency strongly
implied "N ECUC docs already exist from M modules". Old behaviour:
loading a 5-module BSWMD showed `📋 5/5` immediately, with zero
ECUC docs.

Fix: derive the chip count from
`documents.filter(d => bswmdKeyFor(d.sourceBswmdPath) === bswmdKeyFor(bswmdPath)).length`.
The `bswmdKeyFor` match bridges the manifest-relative POSIX vs
store-absolute Windows path-shape mismatch (same pattern the
`bswmdKeyToSchema` map already uses).

The `+` button disabled condition moves from `activeCount === 0`
to `totalCount === 0` (the BSWMD has any modules at all). For a
BSWMD where every module is disabled, `+` stays enabled but the
picker shows an empty module list — strict-correct gate that lets
the user re-enable modules then return to the picker.

## Internal changes

- `src/core/arxml/version.ts` (new, ~40 lines): version mapping helper
- `src/core/arxml/skeleton.ts`: 1-line change at :88
- `src/core/arxml/mutation.ts`: drop Step 3 guard + auto-suffix loop
- `src/renderer/components/ProjectPanel.tsx`: chip count derivation,
  drop `getActiveModules` import
- 3 new test files (skeleton-version, mutation-multi-instance,
  ProjectPanel.chip-count) + 3 existing test files updated to drop
  pinned-buggy-behavior assertions

## Test count delta

**+17 tests** (Bug 1: 9, Bug 2: 4, Bug 3: 5 minus 1 already-renamed
existing test). With v1.8.2 baseline of 2097 pass + 1 skip →
**2114 pass + 1 skip**.

## Spec / Plan / Reviews

- Spec: `docs/superpowers/specs/2026-06-22-v1-8-4-bugfixes-design.md`
  (committed ahead of implementation)
- code-reviewer (whole-branch vs v1.8.3): **APPROVE_WITH_NOTES** —
  0 Critical / 0 High / 1 Medium / 3 Low. All addressed in
  `chore(review)` commit except the 1 deferred Low (test-fixture
  drift between two regression files — acceptable for 2 files, can
  consolidate if a 3rd appears).
- Local `pnpm verify` (all 7 stages): EXIT=0 / format ✓ / lint ✓ /
  type-check ✓ / test (2114 + 1 skip) ✓ / coverage ✓ / build ✓ /
  import-regression (2/2) ✓.

## Known issues (carry-over, not blockers)

- **M1 (LOW, carry from v1.8.1)**: `.error-banner-action` CSS class
  has no specific rule. Deferred.
- **CSS @import ordering** (pre-existing): cosmetic Vite warning.
- **Chunk size** (pre-existing): renderer bundle 837.88 kB. Code-
  splitting deferred to a future MAJOR.
- **3 pre-existing TS2322** in `removeBswmd.fullFlow.test.tsx`
  (carry since v1.7.1). Deferred.
- **README onboarding** (LOW from v1.8.3 code-review): no
  `git clone --recurse-submodules` hint. Deferred to v1.8.4+
  follow-up.
- **Opt 1** (Tree single-module package layer UX LOW) — deferred to
  separate brainstorm sprint.
- **Opt 2** (cross-version BSWMD schema-layer collision MEDIUM
  design) — deferred to separate brainstorm sprint; source
  comment at `runtimeSchema.ts:29` already tracks this as a
  roadmap item.

## Why PATCH and not MINOR?

No new feature, no API surface change for existing users, no schema
change. Three focused correctness fixes that are well-bounded by
failing tests. v1.8.3 consumers see Bug 1 (correct version on
skeleton), Bug 2 (new ECUC layout works for multi-instance), and
Bug 3 (chip count is now accurate) — no behavior regression for
flows that worked correctly before.