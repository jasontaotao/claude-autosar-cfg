# v1.32.1 PATCH — Override UI (disabled) + release-notes SHA backfill

**Ship**: 2026-07-07 (commit `<TBD>` + tag v1.32.1 + GH release)

**Baseline**: v1.32.0 MINOR `9efb5d6` (2983 + 7 SKIP / 0 fail)
**Target**: 2987 + 7 SKIP / 0 fail (+4 delta)

## What's in this PATCH

### Override UI (disabled)

- `DcmConfigSuccessDialog` now renders a `<details>` subcomponent with the `dcmConfig.bswmdPath.override` summary.
- The override `<input>` is `readOnly` + `disabled`; value mirrors `bswmdHasDcm.dcmBswmdPath` (the autofill path).
- **Browse button deferred to v1.33.0+** (no `bswmd:pick` IPC yet).
- Activating the override will require a follow-up MINOR that adds (a) a `bswmd:pick` IPC handler + preload exposure, (b) a Browse button click handler, (c) a way to override `args.bswmdPath` in the launcher.

### Release-notes fixes (post-ship audit)

- `docs/release-notes/v1.32.0/README.md` line ~3: backfilled `<TBD>` → `9efb5d6` (lesson: `release-notes-self-sha-stale-is-ship-acceptable-per-precedent`; backfilling at the next PATCH is the established pattern).
- Rewrote the Override UI bullet in v1.32.0 to reflect actual ship state (the v1.32.0 release notes claimed "Override UI ships disabled" but the UI was not shipped at all).

### i18n key removal

- Removed `dcmConfig.picker.title` from all 3 i18n bundles (`en` + `zh-CN` + `shared/interface`). The OS dialog title is owned by `openOdxHandler.ts:30` (`title: 'Open ODX'`), not the renderer; the picker returns `null` with no DOM surface to render a renderer-side title.

## Lessons (NEW from this PATCH)

None. This PATCH closes existing review findings from the v1.32.0 whole-branch audit; no NEW 1-of-1 lessons emerged.

## Known follow-ups (deferred to v1.33.0+)

- `bswmd:pick` IPC + Browse button + enable Override `<details>` (replaces the current disabled state).
- Drop `classifyErrorByRegex` regex fallback (1-release compat window ends in v1.33.0).
- Add `odx:open-with-default` IPC to pass project-root hint to the picker.
- Make `bswmdPath` required on `DcmConfigHandlerResult` (currently optional).
- Architectural: source `xlsxRows` from a renderer store slice (currently `promptAndOpen`/`handlePickerResolve` pass `xlsxRows: []` placeholder — needs a real source-of-truth slice + IPC subscription).
- Consider canonical `parseArxmlLite` for BSWMD-only files (replace direct fast-xml-parser usage in `arxmlModuleShortNames.ts`).
