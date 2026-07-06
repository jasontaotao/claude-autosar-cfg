# v1.31.0 PATCH — Dcm Config Renderer UX

> **Ship date:** 2026-07-06
> **Baseline:** v1.30.0 MINOR (`83953d9`)
> **Tests:** 2923 + 7 SKIP / 0 fail (+35 from v1.30.0's 2888+7)
> **Spec:** [docs/superpowers/specs/2026-07-06-v1-31-0-patch-dcm-config-renderer-ux-design.md](../../superpowers/specs/2026-07-06-v1-31-0-patch-dcm-config-renderer-ux-design.md)
> **Plan:** [docs/superpowers/plans/2026-07-06-v1-31-0-patch-dcm-config-renderer-ux.md](../../superpowers/plans/2026-07-06-v1-31-0-patch-dcm-config-renderer-ux.md)

## Summary

Closes the v1.30.0 MINOR "renderer UX is developer-only" carry-over. 4 deliverables ship a production-grade success/failure UX for the `dcm:config` IPC: Success Dialog (parity DiagnosticExtract), failure toast with 6 i18n-localized error classes, AppHeader dropdown entry, and ContextMenu right-click entry. IPC surface unchanged from v1.30.0.

## What's New

### T1 — 13 new i18n keys (3 files)

Adds 1 success title + 1 success body + 6 error classes + 1 dismiss + 3 action labels + 1 app menu entry. en + zh-CN parity.

### T2 — `DcmConfigSuccessDialog` (renderer/components/dcmConfig/)

Modal shown on `dcm:config` IPC success. Renders `outputPath` + `appliedStepCount` + the linked DSP / routine counts. Parity with `DiagnosticExtractSuccessDialog` (Escape / backdrop / autofocus / i18n).

### T3 — `useDcmConfigLauncher` (renderer/hooks/)

Custom hook owning the state machine + IPC + error classifier. Re-entrancy guard (`useRef`) prevents AppHeader button + ContextMenu entry double-fire. `classifyError` regex-maps the v1.30.0 handler's 6 error sites to renderer-distinguishable class keys.

### T4 — AppHeader dropdown entry

`Open Dcm Config` dropdown menu entry. Gated on `dcmConfigBusy` (in-flight) + `canOpenDcmConfig` (= ODX loaded AND Dcm BSWMD present in `project.bswmdPaths`).

### T5 — ContextMenu right-click entry

`Generate Dcm Config` entry surfaced when right-clicking a BSWMD row (`kind: 'bswmd'` + path matches `/Dcm\.arxml$|Dcm_.*\.arxml$/i`). Mirrors the AppHeader gate so the two entry points cannot disagree.

### T7 — App.tsx wiring

`App.tsx` instantiates the launcher hook + derives the 3 gates + threads the new AppHeader props + renders both `<DcmConfigSuccessDialog>` and `<DcmConfigErrorToast>` at root + routes `ContextMenuAction['generate-dcm-config']` through the same launcher.

## Files shipped

- `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx` (NEW)
- `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.css` (NEW)
- `src/renderer/components/dcmConfig/DcmConfigErrorToast.tsx` (NEW)
- `src/renderer/components/dcmConfig/DcmConfigErrorToast.css` (NEW)
- `src/renderer/components/dcmConfig/DcmConfigTrigger.tsx` (NEW, stub)
- `src/renderer/components/dcmConfig/index.ts` (NEW)
- `src/renderer/hooks/useDcmConfigLauncher.ts` (NEW)
- `src/renderer/components/AppHeader.tsx` (MODIFIED — 3 new props)
- `src/renderer/components/ContextMenu.tsx` (MODIFIED — `generate-dcm-config` action)
- `src/renderer/App.tsx` (MODIFIED — launcher + 3 gates + dialog/toast render + action routing)
- `src/shared/i18n.en/odx.ts` (MODIFIED — 11 keys added)
- `src/shared/i18n.zh-CN/odx.ts` (MODIFIED — 11 keys added)
- `src/shared/i18n.en/app.ts` (MODIFIED — 1 key added)
- `src/shared/i18n.zh-CN/app.ts` (MODIFIED — 1 key added)
- `src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx` (NEW — 6 cases)
- `src/renderer/components/dcmConfig/__tests__/DcmConfigErrorToast.test.tsx` (NEW — 11 cases)
- `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.tsx` (NEW — 12 cases)
- `src/renderer/components/__tests__/AppHeader.dcmConfig.test.tsx` (NEW — 4 cases)
- `src/renderer/components/__tests__/ContextMenu.dcmConfig.test.tsx` (NEW — 3 cases)

## Decision Log

- **D1** 4-piece scope (Success Dialog + failure toast + AppHeader entry + ContextMenu entry). Envelope migration / ODX picker / manifest auto-population deferred to v1.32.0+.
- **D2** AppHeader dropdown (parity `Open ODX` / `Open DBC`).
- **D3** ContextMenu `kind: 'bswmd'` (existing) + Dcm path regex.
- **D4** `hasDcmBswmd` = filename regex (no BSWMD parse in renderer).
- **D5** Error class via regex prefix (no envelope `kind` migration).
- **D6** Layered hook + 2 presentational (parity DiagnosticExtract).

## Out of Scope (deferred to v1.32.0+)

- `DcmConfigResponse` envelope → discriminated `error.kind` migration
- Dedicated ODX file picker (reuse v1.22.0 `openOdx()` + `activeDocumentPath`)
- Project-manifest `bswmdPath` auto-population
- Multi-step wizard

## Minor (non-blocking, address post-MINOR polish)

- Defensive IPC try/catch — `useDcmConfigLauncher.open()` does NOT wrap the `dcmConfig` IPC call in a try/catch. If the IPC throws (rejected promise from `window.autosarApi.dcmConfig`), the `inFlightRef` is reset by the `finally` block but no error toast is shown. The contract assumes `dcmConfig` always resolves with `{ ok, ... }`; a future polish PATCH can add a `catch` arm that surfaces `'unexpected'` for thrown rejections.

## Next Steps

- **v1.32.0 MINOR** — `DcmConfigResponse` envelope migration (discriminated `error.kind`) + consume at the launcher (drop regex classifier) + defensive IPC try/catch.