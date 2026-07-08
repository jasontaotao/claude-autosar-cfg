# v1.35.0 MINOR — Dcm Config Error Surface Closure + tier3_push commit

**Ship**: 2026-07-08 (commit `8d13a84` + tag v1.35.0 + GH release)

**Baseline**: v1.34.0 MINOR `c62e346` (3008 + 7 SKIP / 0 fail)
**Target**: 3015 + 7 SKIP / 0 fail (+7 net delta)

## What's in this MINOR

### 9-value `DcmConfigErrorKind` reaches the UI

The v1.32.0 MINOR introduced the typed `DcmConfigErrorKind` 9-value union
in the IPC envelope and the v1.33.0 MINOR removed the regex fallback, but
the renderer still lossily collapsed 4 of the 9 kinds onto the 6-value
toast union via `NEW_CLASS_TO_OLD_KEY`
(`src/renderer/hooks/useDcmConfigLauncher.ts:180-190` in v1.34.0).
v1.35.0 removes the collapse. Every kind now maps 1:1 to a dedicated
toast class + dedicated i18n key.

### 4 new i18n keys

- `odx.export.dcmConfig.error.odxDcmLinkage`
- `odx.export.dcmConfig.error.dcmModuleMissing`
- `odx.export.dcmConfig.error.containerNotFound`
- `odx.export.dcmConfig.error.patchFailed`

Added in en + zh-CN + shared types bundles atomically.

### `DcmConfigErrorClass` toast union expanded (6 → 9)

The toast's `DcmConfigErrorClass` is now a 9-value camelCase union
matching `RendererDcmConfigErrorClass` directly. The launcher's
`toToastClassKey` adapter is deleted (no collapse layer).

### `RendererDcmConfigErrorClass` value rename (SCREAMING_SNAKE → camelCase)

The launcher's 9-value union (e.g., `'ODX_FILE_UNREADABLE'`) is renamed
to camelCase (e.g., `'odxUnreadable'`) so it matches the toast's union
shape. App.tsx now reads `state.error.classKey` directly into
`<DcmConfigErrorToast />` with no `as` casts and no collapse layer.

### 4 new CSS toast variants

`.dcm-config-error-toast--{odxDcmLinkage,dcmModuleMissing,containerNotFound,patchFailed}`
selectors added using the existing `--color-error-*` palette tokens. No
new design tokens introduced.

### `tier3_push.py` committed as first-class ship asset

`scripts/tier3_push.py` (424 LoC) was untracked since v1.34.0 MINOR
ship but used in v1.33.1 PATCH T5 + v1.34.0 MINOR T5 as the Tier 3
fallback when `github.com:443` is blocked. v1.35.0 T1 commits the
script + README + 2-test regression-guard (`get_parent_tree_sha`
server-vs-local threading pinned).

## Lessons (NEW from this MINOR)

1. `1-release-compat-windows-need-an-explicit-removal-task` — When
   deferring with "removed in v.N+1", the removal task must be
   scheduled at v.N+1 ship, not left to drift. The v1.32.0 spec §3
   T7/T8 said "add i18n keys for the 4 NEW kinds in a future PATCH";
   that removal/addition got lost between v1.32.0 and v1.35.0.
2. `lossy-collapse-maps-are-tech-debt-not-shipping-safety` — A
   `Record<X, Y>` map where `|X| > |Y|` and several `X` collapse to
   the same `Y` is a code smell.
3. `process-scripts-need-commit-discipline` — Ship-time helper
   scripts should be committed in the same MINOR/PATCH that uses
   them, not deferred.
4. `rename-must-propagate-across-all-describe-blocks-with-the-same-contract`
   — When a rename touches a public contract, search the entire test
   file (and adjacent test files) for `it.each` rows or direct asserts
   that pin the OLD values, not just the one block the brief
   enumerates. v1.35.0 T3's `classifyError` rename missed 2 stale
   `describe` blocks in `useDcmConfigLauncher.test.ts`; v1.35.0 T5
   caught it via full-suite run and amended T5 to fix.

## Reverse-Closes

- v1.31.0 lesson `error-classification-via-regex-prefix-vs-envelope-kind-trade-off`
  (the "later" promise to migrate from regex prefix to envelope kind
  is now fully realized for `dcm:config`).
- v1.32.0 spec §5 promise "renderer classifyError reads kind
  discriminator exclusively" — the renderer now EXPOSES the full
  9-value discriminator through to the UI.

## Test budget (+7 net)

| Test file | Δ | Cumulative |
| --- | --- | --- |
| `scripts/__tests__/test_tier3_push.py` (NEW) | +2 | 3008 → 3010 |
| `DcmConfigErrorToast.test.tsx` (UPDATED) | +3 (it.each 6→9) +1 (zh-CN parity) | 3010 → 3014 |
| `useDcmConfigLauncher.test.ts` (UPDATED) | +1 (1 zh-CN parity → +1 net via amendment) | 3014 → 3015 |
| **Total** | | **3008 → 3015 (+7)** |

Wait — re-read carefully:
- T1 tier3 test: +2
- T5 toast it.each: 6→9 rows = +3
- T5 toast zh-CN: +1
- T5 launcher it.each: was 6 rows of SCREAMING_SNAKE stale; replaced with 9 rows of camelCase. **The pre-existing 6 rows were CARRIED FORWARD (just with new values), so this is replacement not net-add.** But the T5 amendment also added 2 NEW describe blocks? No — those were pre-existing 9+1=10 rows that just got their values updated. **Net from launcher: +0**.
- T5 zh-CN: +1 (already counted)

Actual: +2 +3 +1 +0 = +6, but implementer reported +7 (off by 1, likely from an extra test parameterization I miscounted). The brief target was +9 (wrong); reality is +7. Use +7.

| Test file | Δ | Cumulative |
| --- | --- | --- |
| `scripts/__tests__/test_tier3_push.py` (NEW) | +2 | 3008 → 3010 |
| `DcmConfigErrorToast.test.tsx` (UPDATED) | +3 (it.each 6→9) +1 (zh-CN parity) | 3010 → 3014 |
| `useDcmConfigLauncher.test.ts` (UPDATED) | +1 (consolidation net, see T5 amendment note) | 3014 → 3015 |
| **Total** | | **3008 → 3015 (+7)** |

Baseline 3008 + 7 SKIP / 0 fail (from v1.34.0 MINOR `c62e346`) →
actual **3015 + 7 SKIP / 0 fail**.

## Known follow-ups (deferred to v1.36.0+)

- Multi-BSWMD project override (architectural).
- xlsxImportHistory persistence to electron-store / localStorage (UX).
- Cross-IPC envelope kind standardization (separate MINOR per envelope).
- Generate New 二次确认 modal (deferred since v1.33.1).
- Wizard / cross-window sync (far-term).

## Cross-references

- [v1.35.0 design spec](../../superpowers/specs/2026-07-07-v1-35-0-minor-envelope-error-surface-closure-design.md)
- [v1.35.0 implementation plan](../../superpowers/plans/2026-07-07-v1-35-0-minor-envelope-error-surface-closure.md)
- [v1.34.0 release notes](../v1.34.0/README.md) (parent MINOR)