# v1.31.1 PATCH — Dcm Config Renderer UX Polish (9-batch)

> **Ship date:** 2026-07-06
> **Baseline:** v1.31.0 PATCH (`19752dd`)
> **Tests:** 2933 + 7 SKIP / 0 fail (+10 from v1.31.0's 2923+7)
> **Spec:** [docs/superpowers/specs/2026-07-06-v1-31-0-patch-dcm-config-renderer-ux-design.md](../../superpowers/specs/2026-07-06-v1-31-0-patch-dcm-config-renderer-ux-design.md) (parent)

## Summary

Closes 9 of the 22 POLISH/plan-mandated Minor findings surfaced in the v1.31.0 PATCH whole-branch review. No new IPC surface; all changes are local to the renderer, i18n bundles, and a release-notes typo. Defensive IPC try/catch (T4 plan-mandated Minor #12) finally ships.

## What's New (9 polish items closed)

1. **#1 Close button i18n** — `DcmConfigSuccessDialog` close label now flows through `t(locale, 'odx.export.dcmConfig.success.close')`. New key added to all 3 i18n bundles (`en`, `zh-CN`).
2. **#2 Reactive locale selector** — `App.tsx` dialog/toast locale props now read from the existing reactive `useArxmlStore((s) => s.locale)` selector (was `useArxmlStore.getState().locale` — non-reactive, stale on locale flip).
3. **#3 Busy title** — `AppHeader.tsx` `btn-open-dcm-config` now surfaces `t(locale, 'app.open.dcmConfig.busy')` (`'生成中…'` / `'Generating…'`) when `dcmConfigBusy` is true. Was previously `undefined` (only the `!canOpenDcmConfig` title was set).
4. **#4 Shared Dcm regex constant** — new `src/renderer/components/dcmConfig/regex.ts` exports `DCM_BSWMD_PATH_REGEX` + `isDcmBswmdPath()`. Replaces inline regex duplication in `App.tsx` + `ContextMenu.tsx` (FINAL review Minor #21).
5. **#5 Trailing newline** — `docs/release-notes/v1.31.0/README.md` now has a trailing newline (was missing).
6. **#6 Redundant `(p: string)` annotation dropped** — `App.tsx` `hasDcmBswmd` selector now uses `(p) =>` (the `bswmdPaths` field is already `readonly string[]`).
7. **#7 Doc/test filename mismatch** — release notes now say `.ts` (not `.tsx`) for `useDcmConfigLauncher.test.ts` (JSX-free hook test).
8. **#8 Defensive IPC try/catch** — `useDcmConfigLauncher.open()` now wraps the `dcmConfig` IPC in `try/catch/finally`. The `finally` was already releasing `inFlightRef`; the new `catch` arm surfaces thrown rejections as `unexpected` error toasts. Closes T4 whole-branch review plan-mandated Minor #12.
9. **#9 T2 latent type fix** — `vi.useFakeTimers()` discard is documented in the `beforeEach` comment of `DcmConfigErrorToast.test.tsx` (T7 implementer already addressed).

## Files shipped

| File | Type | LoC |
|---|---|---|
| `src/renderer/components/dcmConfig/regex.ts` | NEW | 29 |
| `src/renderer/components/dcmConfig/__tests__/regex.test.ts` | NEW | 41 (6 cases) |
| `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx` | MODIFY | +1/-1 (Close → i18n) |
| `src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx` | MODIFY | +12 (1 new case, locale-parameterized) |
| `src/renderer/App.tsx` | MODIFY | +3/-4 (locale reactive + regex import + redundant annotation dropped) |
| `src/renderer/components/AppHeader.tsx` | MODIFY | +5/-1 (3-way title attr + i18n key) |
| `src/renderer/components/__tests__/AppHeader.dcmConfig.test.tsx` | MODIFY | +9 (1 new case) |
| `src/renderer/components/ContextMenu.tsx` | MODIFY | +3/-4 (regex import + usage) |
| `src/renderer/hooks/useDcmConfigLauncher.ts` | MODIFY | +14/-1 (defensive try/catch) |
| `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` | MODIFY | +28 (1 new case) |
| `src/shared/i18n/odx.ts` | MODIFY | +2 (`success.close` + `app.open.dcmConfig.busy`) |
| `src/shared/i18n.en/odx.ts` | MODIFY | +2 |
| `src/shared/i18n.zh-CN/odx.ts` | MODIFY | +2 |
| `docs/release-notes/v1.31.0/README.md` | MODIFY | +1/-1 (trailing newline + .ts fix) |

**Total: 14 files (2 new / 12 modified) / +133/-11.** Test count delta: **+10** (2923+7 → 2933+7 SKIP / 0 fail).

## Decision Log

- **D1** Combined 9 POLISH + 1 plan-mandated Minor into one PATCH (per CLAUDE.md lean + user explicit "别分开做") — single branch, single tag, single pkm-capture dispatch.
- **D2** New `regex.ts` module colocated with `dcmConfig/` (not `shared/`) — it's a renderer-only concern (no main-side consumer); colocating with the consumer folder keeps the import graph shallow.
- **D3** Defensive IPC try/catch (Minor #12) — added the `catch` arm now even though the IPC envelope is in practice guaranteed. Future-proofs against contextBridge serialization failures on malformed args.

## Out of Scope (still deferred to v1.32.0+)

- `DcmConfigResponse` envelope → discriminated `error.kind` migration
- Dedicated ODX file picker (reuse v1.22.0 `openOdx()` + `activeDocumentPath`)
- Project-manifest `bswmdPath` auto-population
- Multi-step wizard
- Visual polish batch (toast + dialog design pass)

## Next Steps

- **v1.32.0 MINOR** — envelope migration + drop regex classifier (the 3 NEW 1-of-1 lessons from v1.31.0 + the deferred items).