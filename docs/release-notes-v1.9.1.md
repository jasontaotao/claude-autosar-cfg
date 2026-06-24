# Release Notes — v1.9.1

> **Date**: 2026-06-24
> **Target**: PATCH bump from v1.9.0 SHIPPED (`599a417`)
> **Scope**: Vendor-prefix fold hardening + EcucDefs fold (tier 4)
> **Branch**: `feature/v1-9-1-ecucdefs-fold` from `feature/sprint-x-vendor-prefix`

## Summary

v1.9.1 closes the vendor-prefix fold work that landed in v1.9.0 with six
follow-up fixes and one UX improvement. The headline change is **EcucDefs
fold (tier 4)** — BSWMD-generated ECUC documents with the standard
`AUTOSAR_R22 > EcucDefs > Adc` shape now render as `AUTOSAR_R22 > Adc`
(two layers) instead of three, matching the JWQ3399 vendor-prefix fold
UX for the inner EcucDefs layer.

## Changed behavior

### Tree: hide the `EcucDefs` AR-PACKAGE layer when it carries a single module

When a BSWMD-generated ECUC document uses the standard AUTOSAR namespace
shape (`AUTOSAR_R22 > EcucDefs > <Module>`), the Tree now collapses the
`EcucDefs` layer and renders the module directly under the outer
namespace. Behavior for hand-written ECUC documents that include
sibling elements inside `EcucDefs` (e.g. a reference alongside the
module) is unchanged — those packages are preserved as-is.

| Before | After |
|---|---|
| `AUTOSAR_R22 > EcucDefs > Adc > containers...` | `AUTOSAR_R22 > Adc > containers...` |
| `EcucDefs > Adc > containers...` | `Adc > containers...` (hoisted to root) |
| `EcucDefs > [Adc_module, ref]` (siblings) | unchanged (preserved) |

The new fold is naming-only — it does not require the module to be
present in any loaded BSWMD schema, so a fresh project with no BSWMDs
loaded still benefits.

### Code quality: Prettier formatting on Sprint X WIP files

Seven files authored as part of the Sprint X vendor-prefix hardening
were committed without running prettier. v1.9.1 reformats them in a
separate `chore(format)` commit (no semantic change) so the project's
`pnpm verify` gate stays green for downstream PRs.

## Migration

None. Existing ECUC projects re-render correctly on next open. The fold
is transparent — no on-disk ARXML change, no user action required.

### Tree: hoist nested vendor-folded packages (tier 4 nested case)

The initial v1.9.1 release shipped the `foldVendorPackages` tier 4
logic but missed the corresponding Tree renderer update. The top-level
`flatMap` in `src/renderer/components/tree/Tree.tsx` correctly hoists
synthesised pkgs at the document root, but `renderPackage`'s nested
recursion (`pkg.packages.map`) did not check `isVendorFoldResult`,
causing an extra "synthesised pkg" treeitem between the outer package
and the ECUC module.

User-visible bug: `AUTOSAR_R22 > EcucDefs > Adc_module` rendered as
`AUTOSAR_R22 > Adc pkg > Adc module` (3 layers) instead of
`AUTOSAR_R22 > Adc module` (2 layers).

Fix: `renderPackage` now branches on `sp.isVendorFoldResult` and
routes nested synthesised pkgs through `renderChildren` with the
parent package's path as `parentPath`, so child paths stay consistent
with the post-fold shape (e.g. `/AUTOSAR_R22/Adc`).

## Tests

- **Total**: 2224 passed + 1 skipped (up from 2219 + 1 in v1.9.0 SHIPPED)
- **New tests**: 5 across 2 files:
  - 4 in `src/renderer/store/helpers/__tests__/combinedDoc.test.ts` (tier 4 fold logic):
    1. `folds AUTOSAR_R22 > EcucDefs > Adc_module to AUTOSAR_R22 > [Adc hoisted]`
    2. `folds EcucDefs > Adc_module (single wrap, no AUTOSAR layer) to [Adc hoisted at root]`
    3. `refuses to fold when EcucDefs has sibling elements (module + reference) — invariant I1`
    4. `folds EcucDefs even when the module is NOT in loaded BSWMDs (naming-only tier)`
  - 1 in `src/renderer/components/tree/__tests__/Tree.test.tsx` (tier 4 nested hoist):
    5. `hoists the ECUC module past a NESTED vendor-folded package (tier 4 inside AUTOSAR_R22)`
  2. `folds EcucDefs > Adc_module (single wrap, no AUTOSAR layer) to [Adc hoisted at root]`
  3. `refuses to fold when EcucDefs has sibling elements (module + reference) — invariant I1`
  4. `folds EcucDefs even when the module is NOT in loaded BSWMDs (naming-only tier)`
- **All pre-existing tests**: still pass. No regressions in vendor fold
  (tiers 1-3), mutation paths, round-trip serialization, or import flows.

## Spec / plan artifacts

- **Spec**: [`docs/superpowers/specs/2026-06-23-ecucdefs-fold-design.md`](specs/2026-06-23-ecucdefs-fold-design.md)
- **Plan**: [`docs/superpowers/plans/2026-06-23-ecucdefs-fold.md`](plans/2026-06-23-ecucdefs-fold.md)
- **Locked invariants**:
  - **I1**: element count strictly preserved by any fold
  - **I2**: fold window contains exactly one `kind: 'module'` element
  - **I3**: path rewrite semantics unchanged — `path: '/<deepest shortName>'`

## Commits since v1.9.0 (`599a417`)

| Commit | Type | Subject |
|---|---|---|
| `552b231` | fix | `fix(tree): hoist nested vendor-folded packages (tier 4 nested case)` |
| `1721431` | feat | `feat(combinedDoc): add EcucDefs fold (tier 4) for BSWMD-generated ECUC` |
| `b03398f` | chore | `chore(format): prettier --write on Sprint X WIP files` |
| `5b425c4` | fix | `fix(arxml): unblock removeContainer + picker dedup on nested-package docs` |
| `acdd43d` | fix | `fix(sprint-x): enum dropdowns + param mutations for vendor-CDD projects` |
| `8cd6b05` | fix | `fix(arxml): unblock addContainer on vendor-prefix legacy docs (3 layer fix)` |
| `97d2944` | fix | `fix(renderer): hoist vendor-folded top-level package in Tree` |
| `b425986` | chore | `chore(format): prettier --write user repro test` |
| `c46f4a8` | fix | `fix(arxml): mirror BSWMD physical structure in ECUC skeleton` |

## Out of scope (deferred)

- **`AUTOSAR(_.*)?` exact fold** (would collapse `AUTOSAR_R22 > Adc` to a
  single root, matching JWQ3399 parity). Requires a separate 5th tier or
  a regex change. Defer.
- **`EAS` exact fold** — same shape as the above. Defer.
- **Multi-module / mixed-element `EcucDefs`** — would require deciding
  whether to fold, split, or warn. No current fixture exercises this;
  defer until a real use case surfaces.
- **`isVendorFoldResult` flag rename** — the flag is slightly
  misleading (this isn't a vendor fold) but the Tree's contract on it
  (hoist the contained element to parent) is exactly what we want.
  Semantic rename is a separate concern.

## Known issues (pre-existing, not introduced by v1.9.1)

None specific to v1.9.1. See [`CHANGELOG.md`](../CHANGELOG.md) for the
cumulative list.