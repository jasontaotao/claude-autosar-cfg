# v1.32.0 MINOR — Dcm Config Hardening + UX Completion

**Ship**: 2026-07-07 (commit `<TBD>` + tag v1.32.0 + GH release)

**Baseline**: v1.31.1 PATCH `44eb1c0` (2933 + 7 SKIP / 0 fail)
**Target**: 2985 + 7 SKIP / 0 fail (+52 net delta; +51 cases + 1 result payload field).

## What's in this MINOR

### Envelope migration (semver-additive)

- `DcmConfigResponse.error.kind` is now required (9 literals + 'unknown').
- Renderer `classifyError` reads kind first; legacy regex fallback kept for one release, removed in v1.33.0.
- New typed `DcmConfigError` class (`src/core/bridge/dcmConfigError.ts`) carries the kind across the IPC boundary.

### Renderer UX completion

- Filename regex for `hasDcmBswmd` replaced with real BSWMD parse via `findDcmBswmd` + `arxmlModuleShortNames`.
- Dedicated `DcmConfigPicker` wraps `openOdx()` with `.odx$` filter (inherited from existing IPC).
- `useDcmConfigLauncher.promptAndOpen()` skips the picker when `activeDocumentPath` is already `.odx`.
- `bswmdPath` auto-populated from project manifest; UI shows "Auto-selected from project manifest: <path>" in the success dialog.
- Override UI ships **disabled** (text-only, no Browse button) — deferred to v1.33.0.

## Lessons (NEW from this MINOR)

1. `error-classification-via-regex-prefix-vs-envelope-kind-trade-off` — re-affirmed (now realized as additive migration).
2. `filename-regex-for-ux-gate-vs-parse-based-detection-trade-off` — re-affirmed (regex deleted, parse-based).
3. `backward-compat-branch-on-missing-discriminator-field` — applied for one-release IPC forward-compat.
4. `re-entrancy-guard-via-useref-not-setstate-callback-state` — applied in `DcmConfigPicker` for React 19 strict-mode.
5. `centralize-domain-identifiers` — `DCM_MODULE_SHORT_NAME` reused.
6. `presentational-dialog-parity-port-pattern` — `DcmConfigPicker` thin-wrapper shape.

## Known follow-ups (deferred to v1.33.0+)

- Drop legacy regex fallback path in renderer.
- Override Browse button + new `bswmd:pick` IPC.
- New `odx:open-with-default` IPC to pass project-root hint to the picker.
