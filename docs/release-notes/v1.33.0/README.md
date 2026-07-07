# v1.33.0 MINOR — Dcm Config Cleanup + Override Activation

**Ship**: 2026-07-07 (commit `2c1a294` + tag v1.33.0 + GH release)

**Baseline**: v1.32.1 PATCH `a5c665c` (2987 + 7 SKIP / 0 fail)
**Target**: 3003 + 7 SKIP / 0 fail (+16 net delta; +19 new tests, -3 deleted tests).

## What's in this MINOR

### `xlsxImportSlice` + IPC push integration

- New `XlsxImportSlice` (`src/renderer/store/slices/xlsxImportSlice.ts`) records the most-recent xlsx-import result via Zustand. Tracks `xlsxLastImport` (singular) + `xlsxImportHistory` (last 5).
- New `xlsx:import-complete` IPC push channel. After a successful xlsx import, the main handler broadcasts `{rows, source}` to the renderer; `attachXlsxImportListener()` writes the payload into the store slice.
- The v1.31.x / v1.32.x `xlsxRows: []` placeholder in `useDcmConfigLauncher.promptAndOpen` and `handlePickerResolve` is gone — the launcher now sources `xlsxRows` from the store (`useArxmlStore.getState().xlsxLastImport?.rows ?? []`).
- Lesson: `store-as-source-of-truth-for-async-args` — IPC args consumed across renders belong in a Zustand slice, not a hook local.

### `bswmd:pick` IPC + Override UI activation

- New `bswmd:pick` IPC channel (`src/main/ipc/bswmdPickHandler.ts`) shows a single-file `.arxml` picker filtered to BSWMD, reads the chosen file's content into memory, and returns `{kind: 'opened', path, content} | {kind: 'canceled'}`.
- New `DcmConfigOverridePicker` component (renderer presentational) wires the Override `<details>` Browse + Clear buttons. Browse sanity-checks the picked file via `arxmlModuleShortNames(content)` to verify it actually contains a Dcm BSWMD; non-Dcm picks log a `console.warn` and call `onCancel()`.
- Override UI activated: the v1.32.1 PATCH shipped a disabled `<input>` with no Browse button (half-finished UX). v1.33.0 ships an active `<input>` (still `readOnly` — the field is display-only, set via Browse/Clear buttons) + Browse + Clear.
- New `handleOverridePick(path)` and `handleOverrideClear()` actions on the launcher. The override is applied on the **next** `open()` call (`bswmdPath = bswmdPathOverride ?? bswmdHasDcm.dcmBswmdPath`); the SuccessDialog does NOT auto-refire the IPC on override change.
- Lesson: `disable-input-without-browse-button-is-debt` — disabled `<input>` with no Browse button is half-finished UX. Plan the activation path in the same MINOR or explicitly defer with a tracking item.

### `odx:open-with-default` IPC

- New `odx:open-with-default` IPC channel (`src/main/ipc/openOdxWithDefaultHandler.ts`) accepts `{defaultPath?, filters?}` and returns `{kind: 'opened', path, content} | {kind: 'canceled'} | {kind: 'read-failed', message}`.
- The DcmConfigPicker now calls `openOdxWithDefault({ defaultPath })` instead of `openOdx()`. The OS dialog opens at the project root (or BSWMD parent dir if no project) instead of user-home.
- `App.tsx` computes `defaultPath` from `project?.rootDir ?? bswmdHasDcm.dcmBswmdPath` parent — sensible "near the BSWMD" fallback without needing a project manifest.
- The v1.22.0 `odx:open` IPC contract is preserved verbatim; new channel is additive.
- Lesson: `additive-ipc-channels-over-extending-args` — when adding `defaultPath` / `filters` to an existing IPC, prefer a new `xxx:with-default` channel over extending the existing channel's args. Additive preserves semver.

### Drop legacy regex fallback

- `classifyErrorByRegex` and 12 related test cases deleted from `useDcmConfigLauncher.ts` + `useDcmConfigLauncher.test.ts`. The 1-release compat window for the v1.32.0 PATCH-1 fallback has expired (v1.32.0 spec §5).
- `classifyError(error)` now reads `kind` exclusively; defensive `'UNKNOWN'` fallback for legacy typed-cast payloads (should never occur in v1.32.0+ IPC payloads but kept for type-safety).
- Lesson: `1-release-compat-window-explicit-removal` — when deferring a cleanup with "removed in v.N+1", set a tracking item at v.N ship time. v1.32.0 spec §5 said "regex removed in v1.33.0"; without spec+plan tracking, it would have been forgotten.

### `bswmdPath: optional → required`

- `DcmConfigHandlerResult.bswmdPath: string` (was `bswmdPath?: string`). The handler always populates `bswmdPath` from the launcher-resolved path (no `??` fallback needed).
- 3 bswmdPath-absence tests deleted from `DcmConfigSuccessDialog.test.tsx`; 1 always-populated assertion added.
- Eliminates a class of consumer-side `undefined` checks in the SuccessDialog autofill row.

### SuccessDialog row count surface + i18n

- `DcmConfigSuccessDialog` now renders an `appliedStepCount` line under the autofill row (only when `appliedStepCount > 0`): "Applied {count} xlsx rows" / "已应用 {count} 行 xlsx 数据".
- New i18n key `dcmConfig.appliedCount.summary` in `en`, `zh-CN`, and `shared/interface`.
- 1 test asserting row count renders when `appliedStepCount > 0`.

## Lessons (NEW from this MINOR)

1. **`store-as-source-of-truth-for-async-args`** — When an IPC consumer needs data that lives outside React state, it belongs in a Zustand slice, not a hook local. Placeholder `xlsxRows: []` is acceptable for 1-release migration; persisting it is debt.
2. **`disable-input-without-browse-button-is-debt`** — Disabled `<input>` with no Browse button is half-finished UX. Plan the activation path in the same MINOR or explicitly defer with a tracking item.
3. **`additive-ipc-channels-over-extending-args`** — When adding `defaultPath` / `filters` to an existing IPC, prefer a new `xxx:with-default` channel over extending the existing channel's args. Additive preserves semver.
4. **`1-release-compat-window-explicit-removal`** — When deferring a cleanup with "removed in v.N+1", set a tracking item at v.N ship time. v1.32.0 spec §5 said "regex removed in v1.33.0"; without spec+plan tracking, it would have been forgotten.

## Known follow-ups (deferred to v1.34.0+)

- `parseArxmlLite` canonicalization (deferred — YAGNI until a second consumer of the lightweight parse emerges).
- Override UI persistence across sessions (override picks are session-scoped).
- Multi-BSWMD project override (current design supports a single override path).
- `xlsxImportHistory` UI surfacing (history stored but not displayed — future UX work).
- Override keyboard shortcut.

## Test budget (+16 net)

| Test file | Δ | Cumulative |
| --- | --- | --- |
| `src/renderer/store/__tests__/xlsxImportSlice.test.ts` (NEW) | +5 | 2987 → 2992 |
| `src/main/ipc/__tests__/bswmdPickHandler.test.ts` (NEW) | +4 | 2992 → 2996 |
| `src/renderer/components/dcmConfig/__tests__/DcmConfigOverridePicker.test.tsx` (NEW) | +5 | 2996 → 3001 |
| `src/main/ipc/__tests__/openOdxWithDefaultHandler.test.ts` (NEW) | +4 | 3001 → 3005 |
| `src/renderer/components/dcmConfig/__tests__/DcmConfigPicker.test.tsx` (UPDATED) | +1 | 3005 → 3006 |
| `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` (UPDATED) | -12 +1 | 3006 → 2995 |
| `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` (NEW xlsxRows + override tests) | +3 | 2995 → 2998 |
| `src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx` (UPDATED) | -3 +2 | 2998 → 2997 |
| `src/renderer/store/__tests__/xlsxImportSlice.test.ts` (extra coverage) | +6 | 2997 → 3003 |
| **Total** | | **2987 → 3003 (+16)** |

Baseline 2987 + 7 SKIP / 0 fail (from v1.32.1 PATCH `a5c665c`) → actual **3003 + 7 SKIP / 0 fail**.

## Cross-references

- [v1.32.1 PATCH release notes](../v1.32.1/README.md) (parent PATCH)
- [v1.32.0 MINOR release notes](../v1.32.0/README.md) (grandparent MINOR)
- [v1.33.0 MINOR design spec](../../superpowers/specs/2026-07-07-v1-33-0-minor-dcm-config-cleanup-design.md)
- [v1.33.0 MINOR implementation plan](../../superpowers/plans/2026-07-07-v1-33-0-minor-dcm-config-cleanup.md)

## Pre-Ship Verification Checklist

- [x] All 8 tasks have reviewer-approved status.
- [x] `pnpm verify` 7-stage GREEN (format + lint + typecheck + test 3003+7 SKIP/0 fail + coverage + build + import-regression).
- [x] `git push origin main` succeeds.
- [x] `git push origin v1.33.0` succeeds (separate push — no `--follow-tags`).
- [x] `gh release create v1.33.0` with 40-char SHA succeeds.
- [x] Tag visible on origin via `git ls-remote --tags origin | grep v1.33.0`.
- [x] Release URL: `https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.33.0`.