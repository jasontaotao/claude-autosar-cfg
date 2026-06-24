# v1.11.3 — EcucDefs fold extends to outer AUTOSAR wrap (PATCH)

**Date**: 2026-06-24
**Type**: PATCH (1 commit since v1.11.2)
**PR**: [#4](https://github.com/jasontaotao/claude-autosar-cfg/pull/4)
**Merge commit**: `6a9710da8944b8294e153cf79073a8115a13d271`
**Tag**: `v1.11.3` (force-moved to merge commit per v1.5.1 / v1.7.0 / v1.11.2 pattern)

## Summary

Closes the Adc add/remove regression where the v1.9.0 tier-4 fold rule only collapsed the inner `EcucDefs` layer of a BSWMD-derived value file shaped `AUTOSAR_R22 > EcucDefs > <module>`, leaving the outer `AUTOSAR(_.*)?` wrap visible. The resulting post-fold selectedPath of `/AUTOSAR_R22/<module>/...` no longer matched the un-folded source doc's 3-layer structure, so every mutation dispatch (`addContainer` / `addParameter` / `removeContainer` / `removeParameter` / `addReference`) returned `path-not-found` and the menu actions were silently no-ops.

## Fix

`src/renderer/store/helpers/combinedDoc.ts:684-693 + 756` — extends the `isFoldableHere` OR chain with a new tier-4-derived trigger. When the only nested child of the outer wrap is a tier-4 foldable `EcucDefs` pkg (carries exactly one `kind: 'module'` element and no sub-packages), the outer `AUTOSAR(_.*)?` wrap is also collapsed. The structural pattern `EcucDefs + single module` is the contract — no BSWMD match required, consistent with the existing tier-4 naming-only rule.

- Hoisted pkg is marked `isVendorFoldResult: true` so `Tree.tsx:158-170` continues to render it past the vendor namespace
- Post-fold selectedPath becomes `/Adc/...` and `findByPath`'s vendor-fold fallback (`core/arxml/path.ts:84-105`) resolves it on the un-folded source doc
- Strictly opt-in by the inner shape — a user-defined `AUTOSAR_Foo > EcucDefs` with mixed contents (more than one element, no module element, or sub-packages) still preserves both layers per the existing tier-4 + MEDIUM #2 invariants

## Tests

+1 net (2251 → 2252 in `combinedDoc.test.ts`)

- **Updated**: `'folds AUTOSAR_R22 > EcucDefs > Adc_module to [Adc hoisted at root] (outer wrap collapses too)'` — now asserts the full 3-layer collapse (Adc hoisted at root with `path === '/Adc'`, `isVendorFoldResult === true`)
- **New**: `'end-to-end — Adc_EcucValues.arxml shape yields post-fold selectedPath that resolves on the source doc'` — inlines a 3-layer doc with a single `AdcConfigSet` child, asserts both fold output AND that `findByPath` on the source doc resolves the post-fold path `/Adc/AdcConfigSet` (proving the vendor-fold fallback chain works end-to-end, not just the fold output)

## Code review

`code-reviewer` agent verdict: `0C / 0H / 1M / 1L`. The MEDIUM (CHANGELOG/test coverage mismatch — original "end-to-end" test didn't actually call `findByPath`) was resolved in the same commit by adding a real `findByPath` assertion to the new test.

## Quality gates

- pnpm format: clean
- pnpm lint: 0
- pnpm type-check: 0
- pnpm test: 2252 pass + 1 skip
- pnpm build: success
- pnpm vitest --config vitest.regression.config.ts: 2 pass (import round-trip regression)

## Files changed

- `CHANGELOG.md` (+12)
- `src/renderer/store/helpers/combinedDoc.ts` (+44, -1)
- `src/renderer/store/helpers/__tests__/combinedDoc.test.ts` (+79, -10)

## Related

- Closes the v1.9.0 tier-4 fold rule gap (`5b425c4` on `feature/sprint-x-vendor-prefix`)
- Reuses the existing `isVendorFoldResult: true` marker introduced in v1.9.0 (`Tree.tsx:158-170`)
- Reuses the existing `findByPath` vendor-fold fallback (`core/arxml/path.ts:84-105`)
- v1.11.2 PATCH: trust sprint (close 4 HIGH from v1.10.2 joint review) — see [release notes](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.11.2)
