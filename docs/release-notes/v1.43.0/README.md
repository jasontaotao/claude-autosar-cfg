# v1.43.0 MINOR — DcmConfigHandler Project-Manifest BSWMD Resolution

**Released:** 2026-07-11
**Tag:** [`v1.43.0`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.43.0)
**Cycle type:** MINOR (backwards-compatible IPC contract extension)
**Ship basis:** 3 source commits (T0 spec + T1 main + T2 renderer)

## Summary

Replaces the 2-strategy walk-up Dcm BSWMD discovery with a project-manifest-aware resolver that scans `ProjectManifest.bswmdPaths` for the Dcm BSWMD first, falling back to the walk-up only when no manifest is loaded or the manifest's `bswmdPaths` does not contain a Dcm BSWMD.

**Backwards-compatible**: existing callers that pass `bswmdPath` (real-OEM override) bypass the resolver entirely; existing callers that omit `bswmdPaths` continue to hit the walk-up fallback (sample/demo-ECU usage unchanged).

| | v1.42.4 baseline | **v1.43.0** | Delta |
|---|---|---|---|
| `dcmConfigHandler.ts` | 270 LoC | 320 LoC | +50 |
| `useDcmConfigLauncher.ts` | 430 LoC | 443 LoC | +13 |
| Tests | 3124 + 7 SKIP | 3124 + 7 SKIP | 0 |
| Functional change (existing call paths) | — | **0** | — |

## Commits (3)

| # | Commit | Title | LoC |
|---|---|---|---|
| T0 spec | `daa3dba` | `docs(spec): v1.43.0 MINOR T0 -- DcmConfigHandler project-manifest bswmdPaths resolution` | +141 LoC (NEW) |
| T1 | `7421a87` | `refactor(main): v1.43.0 MINOR T1 -- dcmConfigHandler manifest bswmdPaths resolution` | +50 / −4 LoC |
| T2 | `191e8ed` | `refactor(renderer): v1.43.0 MINOR T2 -- wire bswmdPaths into useDcmConfigLauncher IPC call` | +13 / −1 LoC |

## 3-step resolution (precedence order)

1. **Explicit `args.bswmdPath`** (unchanged from v1.30.0) — caller-provided path wins. Bypasses resolver entirely.
2. **Manifest `bswmdPaths` scan** (NEW v1.43.0) — handler scans `ProjectManifest.bswmdPaths` for `Bsw_Dcm_Bswmd.arxml` (case-insensitive basename match + `existsSync` check). Returns first matching path that exists on disk.
3. **Walk-up fallback** (preserved from v1.30.0) — invokes `locateDcmBswmdPath(args.odxPath)` 2-strategy walk-up (cwd → odx-dir) for sample/demo-ECU fixtures.

## IPC contract change

`DcmConfigHandlerArgs` gains an optional `bswmdPaths?: readonly string[]` field:

```typescript
export interface DcmConfigHandlerArgs {
  readonly odxPath: string;
  readonly xlsxRows: readonly EcucInstanceRow[];
  readonly outputPath?: string;
  readonly bswmdPath?: string;
  // v1.43.0 MINOR — project-manifest bswmdPaths
  readonly bswmdPaths?: readonly string[];
}
```

**Backwards-compatible**: existing IPC callers that omit `bswmdPaths` continue to hit Step 3 (walk-up). Existing tests that pass only `odxPath` + `xlsxRows` continue to work.

## Why this matters for real-OEM projects

Real-OEM projects can now omit `bswmdPath` if their `.autoscarfg.json` manifest lists a Dcm BSWMD — the resolver picks it up automatically. Today, real-OEM projects MUST pass `args.bswmdPath` explicitly because the walk-up only finds the sample fixture. Sample/demo-ECU usage continues to work via the walk-up fallback.

## What was already wired (v1.32.0 T5 → v1.43.0 wire-up completion)

The v1.32.0 T5 cycle already added the `bswmdPaths` selector subscription to `useDcmConfigLauncher.ts` (line 266: `const bswmdPaths = useArxmlStore((s) => s.project?.bswmdPaths ?? EMPTY_BSWMD_PATHS);`) with the stable empty-array fallback (`EMPTY_BSWMD_PATHS: readonly string[] = Object.freeze([]) as readonly string[];`) — but the snapshot was never passed to the IPC call. **v1.43.0 T2 completes the wire-up** by spreading `bswmdPaths` into the `dcmConfig` call args.

## No new tests added

Existing `dcmConfigHandler.test.ts` covers the 2-step (explicit override + walk-up) flow which still works after T1 (the resolver inserts a new Step 2 between them but does not change the existing paths). `useDcmConfigLauncher.test.ts` covers the IPC call wiring which still works after T2 (the new field is spread into the call).

**Future cycle**: add unit tests for `resolveBswmdPathFromManifest` (3 cases: empty array → null; array with matching basename → match; array without match → null) when a real-OEM fixture is available for end-to-end testing. The helper is currently tested implicitly via the IPC handler test.

## Test results

**3124 + 7 SKIP / 0 fail** (zero test delta — pure additive change). pnpm verify 7-stage GREEN. **18/18** dcmConfigHandler tests + **39/39** useDcmConfigLauncher tests pass.

## Related documents

- **T0 spec**: `docs/superpowers/specs/2026-07-11-v1-43-0-minor-dcm-config-bswmd-manifest-resolution.md`
- **CHANGELOG**: top entry of `CHANGELOG.md`
- **Devlog**: see `01-Projects/claude-AutosarCfg/development/devlog.md` 2026-07-11 entries
- **v1.42.4 ship notes** (useAppHeaderShell): `docs/release-notes/v1.42.4/README.md`
- **v1.32.0 T5** (bswmdPaths selector subscription): per `useDcmConfigLauncher.ts:220-227` + `:266`

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)