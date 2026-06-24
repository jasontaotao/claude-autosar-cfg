# EcucDefs Fold — Design Spec

> **Date**: 2026-06-23
> **Target**: v1.8.5 PATCH (or next free slot)
> **Scope**: Add a 4th fold trigger to `foldVendorPackages` for the standard AUTOSAR
> namespace `EcucDefs` so the Tree hides the `EcucDefs` layer when it carries exactly
> one `<ECUC-MODULE-CONFIGURATION-VALUES>` element.
> **Branch base**: current `main` (v1.8.3 SHIPPED at `afe3f9d`)

## Background

`foldVendorPackages` in `src/renderer/store/helpers/combinedDoc.ts:550-708`
collapses vendor-prefix AR-PACKAGE chains so the Tree shows only the user-facing
module name. Current rules (v1.9.0 Sprint X Phase 5c):

| Tier        | Regex                                               | BSWMD gate     | Examples folded                               |
| ----------- | --------------------------------------------------- | -------------- | --------------------------------------------- |
| trusted     | `^JWQ_.*_PACK$`                                     | none           | `JWQ_CDD_PACK > JWQ_Packet > JWQ3399`         |
| generic (a) | inner is a BSWMD module                             | yes            | `EcucDefs > [anything where inner is module]` |
| generic (b) | `^(EAS\|EcucDefs\|AUTOSAR(_.*)?)$` + inner is BSWMD | yes (and-gate) | `EAS > Can` (when Can is loaded)              |

The `AUTOSAR_R22 > EcucDefs > Adc` shape produced by the BSWMD-to-ECUC skeleton
flow (`Adc_bswmd.arxml` with `mod.path = /AUTOSAR_R22/EcucDefs/Adc`) fails all
three tiers:

- `AUTOSAR_R22` matches generic (b) regex, but `inner.shortName === 'EcucDefs'`
  is not a BSWMD module → fails the and-gate.
- `EcucDefs` has `packages === undefined` (the ECUC module element is directly
  in `pkg.elements`, not in a sub-package) → generic (a) `nested.length === 1`
  fails.
- `EcucDefs` is not a trusted `JWQ_.*_PACK` → tier 1 fails.

Result: Tree shows the full `AUTOSAR_R22 > EcucDefs > Adc` chain instead of the
single `Adc` root the user expects.

## Goal

When `EcucDefs` (the standard AUTOSAR namespace) carries exactly one
`<ECUC-MODULE-CONFIGURATION-VALUES>` element, fold it the same way the existing
tiers do: collapse the layer, mark the surviving package with
`isVendorFoldResult: true`, hoist the module element to the parent. User sees
`AUTOSAR_R22 > Adc` (one layer) instead of `AUTOSAR_R22 > EcucDefs > Adc` (two
layers).

For the Adc case, this does **not** reach JWQ3399 parity (which collapses to a
single root) — `AUTOSAR_R22` is a separate, generic-tier rule and is **out of
scope** for this spec.

## Design

### The new trigger (4th tier)

**Note on placement (2026-06-23 implementation correction)**: the
spec was initially drafted as "add a disjunct to `isFoldableHere`".
On implementation it became clear that formulation doesn't work —
`isFoldableHere` requires `nested.length === 1 && pkg.elements.length === 0`,
but tier 4 requires `pkg.packages === undefined && pkg.elements.length === 1`
(mutually exclusive preconditions). The disjunct would never fire
because the wrapper gates reject tier-4-eligible packages. The
implementation places tier 4 as an **early-return** before the
existing `isFoldableHere` logic, which is the only correct shape.

The new tier lives as a separate fast-path branch in `foldPackage`,
placed BEFORE the wrapper-tier logic:

```ts
// New tier: EcucDefs namespace wraps a single ECUC module element
// directly (skeleton.ts emits module under EcucDefs.elements, not
// under a sub-package, so the existing nested.length === 1 gate
// can't see it). Fires when EcucDefs is the only standard namespace
// in the user's project — multi-module / mixed-element EcucDefs is
// preserved unchanged.
const ecucDefsHasSingleModule =
  pkg.shortName === 'EcucDefs' &&
  pkg.packages === undefined &&
  pkg.elements.length === 1 &&
  pkg.elements[0]!.kind === 'module';

const isFoldableHere =
  nested !== undefined &&
  nested.length === 1 &&
  pkg.elements.length === 0 &&
  (innerMatchesBswmd ||
    trustedPackRe.test(pkg.shortName) ||
    (genericPrefixRe.test(pkg.shortName) && innerMatchesBswmd) ||
    ecucDefsHasSingleModule);
```

### Why exact `===` instead of regex

The current `GENERIC_VENDOR_PREFIX_RE` uses `^(EAS|EcucDefs|AUTOSAR(_.*)?)$`
which folds `EcucDefs` only when `innerMatchesBswmd`. We use exact `===`
because the trigger condition is different: we are looking at `pkg.elements[0]`
(the module element directly), not at `nested[0]` (a sub-package). The exact
match is a one-symbol safety guarantee — typos like `Ecucdef` or
`ECUCDEFS` never trigger the fold.

### Why the `pkg.elements.length === 1` check (I2)

Domain rule for this codebase: an ECUC value-side ARXML file contains exactly
one `<ECUC-MODULE-CONFIGURATION-VALUES>` element per
`<AR-PACKAGE><SHORT-NAME>EcucDefs</SHORT-NAME></AR-PACKAGE>`. This is enforced
by `skeleton.ts:115-175` and the parser test fixtures. The check is
**belt-and-suspenders** for two reasons:

1. A future skeleton or hand-written ARXML could put a reference or unknown
   element next to the module. The check refuses to fold (preserves them)
   instead of silently dropping them.
2. If AUTOSAR ever permits multi-module EcucDefs (not currently a thing), the
   existing check naturally extends — we just need to relax the length and
   decide what "fold" means for siblings (out of scope for this spec).

### Invariants (locked)

| ID  | Statement                                                        | Enforcement                                                                                                                     |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| I1  | Element count strictly preserved by any fold                     | All 4 tiers require `pkg.elements.length === 0` OR `=== 1`; ref-equal fast path returns the same reference when nothing changed |
| I2  | Fold window contains exactly one `kind: 'module'` element        | New tier's `pkg.elements.length === 1 && elements[0]!.kind === 'module'` check                                                  |
| I3  | Path rewrite semantics unchanged: `path: '/<deepest shortName>'` | Reuse existing `combinedDoc.ts:703` logic; new tier hits the same hoist block                                                   |

### Out of scope (deferred)

- **`AUTOSAR(_.*)?` exact fold** — would collapse `AUTOSAR_R22 > Adc` to a
  single root, matching JWQ3399 parity. Requires a separate 5th tier with the
  same `hasSingleModule` check, OR promotes `AUTOSAR(_.*)?` from generic to
  trusted (regex change). **Defer**: a user-named package matching
  `AUTOSAR.*` is implausible at the file root, but needs a design call.
- **`EAS` exact fold** — same shape as `AUTOSAR(_.*)?`. Defer.
- **Multi-module / mixed-element EcucDefs** — would require deciding whether
  to fold, split, or warn. No current fixture exercises this; defer until
  a real use case surfaces.
- **Pure rename of the new tier's flag** — `isVendorFoldResult` is reused
  unchanged. The flag's name is slightly misleading (this isn't a vendor
  fold) but the Tree's contract on it (hoist the contained element to
  parent) is exactly what we want. A semantic rename is a separate concern.

## Affected files

- **Modify**: `src/renderer/store/helpers/combinedDoc.ts:656-662` — add the
  4th disjunct. ~5 lines (one const + one `||`).
- **Modify**: `src/renderer/store/helpers/combinedDoc.ts:619-708` — update
  the block comment to document the new tier. ~10 lines of comment.
- **Add tests**: `src/renderer/store/helpers/__tests__/combinedDoc.test.ts`
  — add a new `describe('EcucDefs fold (tier 4)')` block with 4 cases:
  1. `AUTOSAR_R22 > EcucDefs > Adc_module` (the Adc case) → folds to
     `AUTOSAR_R22 > [Adc hoisted]`
  2. `EcucDefs > Adc_module` (single wrap) → folds to `[Adc hoisted]`
  3. `EcucDefs > [Adc_module, reference]` (mixed elements) → **refuses**
     fold (returns the package unchanged)
  4. `EcucDefs > Adc_module` where `Adc` is NOT in `bswmdModules` → folds
     anyway (the new tier is naming-only, no BSWMD gate)

## Acceptance gates

- `pnpm exec vitest run src/renderer/store/helpers/__tests__/combinedDoc.test.ts`
  passes all 4 new cases.
- Existing `combinedDoc.test.ts` cases (vendor fold, generic fold) all pass.
- Existing `mutation.test.ts`, `useArxmlStore.mutation.test.ts`,
  `applyParamUpdate.vendorCdd.test.ts` pass (no change to mutation paths).
- `pnpm verify` all 7 stages green (same gate as v1.8.3).
- Manual smoke: load `Adc_bswmd.arxml` (mod.path = `/AUTOSAR_R22/EcucDefs/Adc`),
  confirm Tree shows `AUTOSAR_R22 > Adc > containers...` (2 layers) instead
  of the current 3 layers.

## Risk assessment

- **Code surface**: 5 lines in 1 file. Touches a hot path
  (`foldVendorPackages` runs on every displayDoc compute), but the disjunct
  short-circuits on the cheap `pkg.shortName === 'EcucDefs'` check before
  the more expensive `pkg.elements.length === 1` check. Branch mispredict
  is negligible.
- **Behavioral change**: 2 visible changes in the user's Adc workflow
  (Tree depth, selectedPath prefix). All `selectedPath` reads go through
  `findByPath` which is fold-aware (v1.4.0 17c). No mutation or save path
  affected.
- **Regression risk**: Low. The 4th tier only fires for the exact string
  `EcucDefs`; all other package names short-circuit on the regex test. The
  4 fixture cases (1 folds / 1 folds / 1 refuses / 1 folds) lock the
  intended behavior at the helper level.
