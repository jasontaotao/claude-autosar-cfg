# v1.33.1 PATCH — Override UI Debt Cleanup + Generate New Action

**Ship**: 2026-07-07 (commit `50449c3` + tag v1.33.1 + GH release)

**Baseline**: v1.33.0 MINOR `2c1a294` (3003 + 7 SKIP / 0 fail)
**Target**: 2998 + 7 SKIP / 0 fail (-5 net delta; PATCH negative tests due to feature revert).

## What's in this PATCH

### `Generate New` button replaces Override UI

The v1.33.0 MINOR `SuccessDialog` Override `<details>` UI (Browse + Clear buttons + override `<input>`) shipped as half-finished UX — the override `bswmdPath` field was local-only and required the user to close + reopen the dialog to apply. v1.33.1 removes the Override UI entirely and adds a `Generate New` button at the same vertical position. Click → opens `bswmd:pick` (existing IPC, unchanged contract) → sanity-checks the picked file via `arxmlModuleShortNames` → re-fires `dcm:config` with `{odxPath: lastOdxPath, xlsxRows, bswmdPath: <new picked>}` → SuccessDialog re-renders with the new autofill + appliedStepCount.

### `bswmdPathOverride` state field deleted

Tied to the deleted Override UI; no consumer in `useDcmConfigLauncher` after `handleGenerateNew` lands. `lastOdxPath: string | null` replaces it on the state shape — captured on every successful `dcm:config` resolution.

### `handleOverridePick` + `handleOverrideClear` deleted

Both wired to the deleted Override UI. Replaced by `handleGenerateNew()` on the same hook return surface.

### `i18n`: `dcmConfig.bswmdPath.override` removed; `dcmConfig.generateNew.button` added

3 i18n bundles + type signature updated atomically.

## Lessons (NEW from this PATCH)

1. `remove-dead-ui-tied-state-immediately` — when a PATCH reverts a MINOR's UI surface, the bound state/handlers/interface methods go in the same PATCH or a tightly-coupled task. Don't leave "state without consumer" as a debt.
2. `partial-feature-rollback-keeps-kept-assets` — PATCH that reverts a partial feature should preserve the new IPC assets (here, `bswmd:pick` is reused by Generate New). Rollback the UI shell, keep the channel.
3. `whole-branch-medium-observation-collects-at-minor-ship` — MEDIUM observations left at MINOR ship are legitimately resolved in the next PATCH. PATCH-sized body + small blast radius beats rushed mid-MINOR correction.

(Reverse-closes the v1.33.0 lesson `disable-input-without-browse-button-is-debt`: rather than complete the half-finished UI, delete the half-finished UI. The principle "either complete or don't ship" honors the lesson from the deletion direction.)

## Known follow-ups (deferred to v1.34.0+)

- `parseArxmlLite` canonicalization (YAGNI).
- `xlsxImportHistory` UI surfacing.
- Override persistence across sessions (now N/A — no override UI).
- Generate New operation 二次确认 modal (destructive re-write explicit, no confirm needed).

## Test budget (-5 net)

| Test file | Δ | Cumulative |
| --- | --- | --- |
| `useDcmConfigLauncher.test.ts` (UPDATED) | -3 (T1 deleted) +5 (T2 added) | 3003 → 3005 |
| `DcmConfigSuccessDialog.test.tsx` (UPDATED) | -2 (T3 deleted) +2 (T3 added) | 3005 → 3005 |
| `DcmConfigOverridePicker.test.tsx` (DELETE) | -5 | 3005 → 3000 |
| `DcmConfigOverridePicker.test.tsx` (DELETE — count check) | | |
| **Net** | -5 | **3003 → 2998** |

Baseline 3003 + 7 SKIP / 0 fail (from v1.33.0 MINOR `2c1a294`) → actual **2998 + 7 SKIP / 0 fail**.

## Cross-references

- [v1.33.1 design spec](../../superpowers/specs/2026-07-07-v1-33-1-patch-override-ui-debt-cleanup-design.md)
- [v1.33.1 implementation plan](../../superpowers/plans/2026-07-07-v1-33-1-patch-override-ui-debt-cleanup.md)
- [v1.33.0 MINOR release notes](../v1.33.0/README.md) (parent MINOR — the MEDIUM observation this PATCH closes)