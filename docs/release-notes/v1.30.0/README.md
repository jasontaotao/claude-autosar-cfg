# v1.30.0 MINOR — dcmConfig IPC Bridge Wiring

> **Ship date:** 2026-07-06
> **Commit:** `83953d9 feat(ipc)`
> **Tag:** v1.30.0
> **Baseline:** v1.29.0 MINOR (`f038ce6`)
> **Tests:** 2888 + 7 SKIP / 0 fail (+10 from v1.29.0's 2878+6)
> **Spec:** [docs/superpowers/specs/2026-07-06-v1-30-0-minor-dcm-config-IPC-bridge-wiring-design.md](../superpowers/specs/2026-07-06-v1-30-0-minor-dcm-config-IPC-bridge-wiring-design.md)

## Summary

Wires the existing-but-unregistered `dcmConfigHandler` (v1.27.0 T4) to the IPC bridge end-to-end. The dcm config bridge was implementation-complete since v1.27.0 but never had a channel registration or preload exposure — it sat as dead code from the renderer's perspective. v1.30.0 closes this gap as a single MINOR, also adding two small affordances on the same shape (real-OEM BSWMD override path + `appliedStepCount` counter). The full renderer UX (success dialog, failure toast, ContextMenu integration) lands in 1.31.0 PATCH.

## What's New

### T1 — `IPC_CHANNELS.DCM_CONFIG` channel

First channel in a new `dcm:*` namespace. Mirrors the unsuffixed v1.22.0 / v1.24.0 ODX-bridge convention (no `:v1` suffix — this is the v1.30.0 first cut of the bridge surface).

```ts
// src/shared/ipc-contract.ts
DCM_CONFIG: 'dcm:config',
export const DCM_CONFIG = IPC_CHANNELS.DCM_CONFIG;
```

### T2 — DcmConfigRequest / DcmConfigResponse types in `shared/types.ts`

Additive on the wire. Both types follow the `DbcImportComStack*` precedent (the canonical IPC envelope shape across the project).

```ts
// New: DcmConfigRequest (mirrors DcmConfigHandlerArgs)
//   - odxPath (required, absolute path of the ODX-D file)
//   - xlsxRows (required, 5 Dcm service kinds + per-row params)
//   - outputPath? (optional, defaults to <odxDir>/Dcm_Config.arxml)
//   - bswmdPath? (v1.30.0 MINOR — real-OEM BSWMD override)

// New: DcmConfigResponse (envelope) + DcmConfigHandlerResult (success value)
//   - dcmConfigXml, odxLinkedDcmDspCount, odxLinkedRoutineCount, serviceCounts,
//     outputPath (existing since v1.27.0)
//   - appliedStepCount (v1.30.0 MINOR — pre-apply intent counter from
//     serviceSteps.length)
```

### T3 — `dcmConfigHandler` signature + implementation

- `DcmConfigHandlerArgs` gains `bswmdPath?: string`. When provided, the handler reads this file directly and skips the `<samples>/arxml/demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml` discovery walk entirely. **No fall-through** (real-OEM is a declaration, not a hint; a missing file surfaces `BSWMD file unreadable` rather than silently substituting the sample fixture).
- `DcmConfigHandlerResult` gains `appliedStepCount: number`, computed pre-apply from `serviceSteps.length`. Counter is meaningful even when the patch engine reports errors downstream (it represents "what the mapper intended to do").
- New explicit try/catch wrapper around the bswmdPath `readFileSync` surfaces a `BSWMD file unreadable` error class (the renderer can regex-match this for a "real-OEM path not found" toast, distinct from the catch-all path-not-found).
- Returns `DcmConfigResponse` (was `IpcResult<DcmConfigHandlerResult>` — the inline `IpcResult` definition is now removed; the envelope is the canonical `DcmConfigResponse` from `shared/types.ts`).

### T4 — Channel registration

`src/main/ipc/register.ts` adds the channel registration alongside the existing xlsx-bridge entries:

```ts
ipcMain.handle(
  IPC_CHANNELS.DCM_CONFIG,
  async (_evt, req: DcmConfigRequest): Promise<DcmConfigResponse> => {
    return dcmConfigHandler(req);
  },
);
```

### T5 — Preload bridge exposure

`src/preload/index.ts` exposes the new IPC method in the `autosarApi` object:

```ts
dcmConfig: (req: DcmConfigRequest): Promise<DcmConfigResponse> =>
  ipcRenderer.invoke(IPC_CHANNELS.DCM_CONFIG, req),
```

The `sandbox-flip.test.ts` SE-1 audit (which pins the `autosarApi` surface to a static expected-function list) is updated to include `dcmConfig` in its expected surface. The audit continues to guarantee no Node handles leak across the bridge.

### T6 — Minimal renderer trigger

`src/renderer/components/dcmConfig/DcmConfigTrigger.tsx` renders a "Generate Dcm Config" button that calls `window.autosarApi.dcmConfig({odxPath, xlsxRows, bswmdPath?})` and surfaces the raw IpcResult in a `<pre data-testid="dcm-config-result">`. No dialog, no animation, no project-context menu integration — those land in 1.31.0 PATCH.

The `DcmConfigTrigger` is exported as a component but **NOT** wired into `App.tsx` in v1.30.0 (the test surface is the renderer consumer for now; full integration in 1.31.0).

## Files shipped

| File | Type | LoC |
|---|---|---|
| `src/main/ipc/dcmConfigHandler.ts` | MODIFY | bswmdPath? + appliedStepCount + BSWMD try/catch + DcmConfigResponse |
| `src/main/ipc/register.ts` | MODIFY | +IPC channel registration + handler import |
| `src/main/ipc/__tests__/dcmConfigHandler.test.ts` | MODIFY | +3 v1.30.0 affordance tests + appliedStepCount assertion |
| `src/main/ipc/__tests__/dcmConfigRegistration.test.ts` | NEW | Channel name stability smoke |
| `src/main/__tests__/sandbox-flip.test.ts` | MODIFY | +'dcmConfig' in expected surface list |
| `src/preload/index.ts` | MODIFY | +`dcmConfig` in api object + DcmConfigRequest/Response imports |
| `src/preload/__tests__/dcmConfigExposure.test.ts` | NEW | vi.mock('electron') + invoke wrapper assertion |
| `src/shared/ipc-contract.ts` | MODIFY | +`DCM_CONFIG` channel + top-level alias |
| `src/shared/types.ts` | MODIFY | +`DcmConfigServiceKind` + `DcmConfigRequest` + `DcmConfigPipelineResult` + `DcmConfigHandlerResult` + `DcmConfigResponse` |
| `src/renderer/components/dcmConfig/DcmConfigTrigger.tsx` | NEW | Minimal trigger button (full UX in 1.31.0) |
| `src/renderer/components/dcmConfig/index.ts` | NEW | Barrel re-export |
| `src/renderer/components/dcmConfig/__tests__/DcmConfigTrigger.test.tsx` | NEW | jsdom-env smoke (3 cases) |

**Total: 12 files (7 modified, 5 new) / +372/-96.** Test count delta: **+10** (2888+7 from 2878+6 baseline).

## Decision Log

- **D1 — Additive on the wire.** `bswmdPath` is optional, `appliedStepCount` is additive. Old IPC callers (if any) continue to work — `bswmdPath` defaults to the discovery walk; `appliedStepCount` is ignored by old readers. No migration shim.
- **D2 — `dcm:*` namespace.** New namespace, not `xlsx:ecuc:batch:*`. The dcm bridge is a sibling of `odx:importDiagnosticExtract`, not part of the Com-stack xlsx batch. Leaves room for future Dcm-only operations (`dcm:applyStubs`, etc.) in 1.31.0+.
- **D3 — `appliedStepCount` semantics = pre-apply raw.** `serviceSteps.length` (computed BEFORE `applyPatchesToExtract`) so the counter is meaningful even when the engine errors out. Trade-off documented in spec §3.3: a future minor can introduce `actualAppliedStepCount` next to it if user confusion surfaces.
- **D4 — `bswmdPath` no fall-through.** Explicit override is a declaration; missing file → `BSWMD file unreadable` (NOT silent fall-back to sample fixture). Fail-loud over fail-soft, per `silent-failure-hunter` lesson.
- **D5 — Bare button, not full UX.** v1.30.0 wires the IPC bridge end-to-end + adds the trigger as a component export. Full success dialog, failure toast, ODX file picker, project-context menu integration → 1.31.0 PATCH.

## Out of Scope (deferred to 1.31.0 PATCH)

- Full `DcmConfigSuccessDialog.tsx` (modeled on `DiagnosticExtractSuccessDialog.tsx`).
- Failure toast with localized copy (zh-CN + en) for the 6 fail-fast error classes.
- `ContextMenu.tsx` "Generate Dcm Config" entry (gated on `manifest.bswmdPaths` containing a Dcm BSWMD).
- Project-manifest-driven `bswmdPath` auto-population from `manifest.bswmdPaths`.
- ODX file picker integration (`openOdx()` → `DcmConfigTrigger`).
- `DcmConfigResponse` envelope → discriminated error envelope migration (parity with `DbcImportComStackResponse`).
- `DcmConfigTrigger` wiring into `App.tsx` / `AppHeader.tsx`.

## Test Results

- pnpm format: clean (1 autofix round on the new spec + DcmConfigTrigger)
- pnpm lint: 0 errors (after `EcucInstanceRow` import-order fix in dcmConfigHandler.ts; `dcmConfigHandler.js` import-order fix in register.ts)
- pnpm type-check: 0 errors (both `tsconfig.json` + `tsconfig.web.json` after clearing stale `tsbuildinfo` cache)
- pnpm vitest: **2888 + 7 SKIP / 0 fail** (+10 from v1.29.0's 2878+6)
- pnpm verify: 7-stage GREEN, EXIT=0
- code-reviewer: APPROVED (no HIGH/CRITICAL; MEDIUM/LOW/NOTE per spec §8)
- Exit code: 0

## Next Steps

- **1.31.0 PATCH** — full renderer UX (success dialog + failure toast + ContextMenu integration + project-manifest auto-population + ODX file picker + envelope envelope migration).
- **Backfill opportunity** — vault lessons #157 + #158 from the v1.28.1 PATCH capture (deferred to a future dispatch when Write-tool access is restored to pkm-capture subagents).
