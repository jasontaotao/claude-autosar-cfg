# v1.43.0 MINOR — DcmConfigHandler ProjectManifest Resolution

**Author**: claude-AutosarCfg pre-T0 analysis controller
**Date:** 2026-07-11
**Status:** analysis (awaiting implementation; prerequisite for v1.43.0 T1-T4)
**Baseline:** `73cd02a` (v1.42.4 PATCH T3 ship, 3124 + 7 SKIP / 0 fail)
**Target:** Replace 2-strategy walk-up Dcm BSWMD discovery with project-manifest resolution. Real-OEM projects (with `.autosarcfg.json` manifest containing `bswmdPaths`) resolve via manifest; sample/demo-ECU usage falls back to walk-up. **Backwards-compatible**: existing callers pass `bswmdPath` and bypass the resolver entirely.

## Goal

Closes the v1.30.0 MINOR follow-up that was carried forward to v1.43.0: replace `locateDcmBswmdPath` 2-strategy walk-up (cwd → odx-dir) with a project-manifest-aware resolver that scans `ProjectManifest.bswmdPaths` for the Dcm BSWMD first, falling back to the walk-up only when no manifest is loaded (loose mode) or when the manifest's `bswmdPaths` does not contain a Dcm BSWMD.

**Why this matters for real-OEM projects**: today, real-OEM projects MUST pass `args.bswmdPath` explicitly because the walk-up only finds the sample fixture. With manifest resolution, real-OEM projects can omit `bswmdPath` if their `.autosarcfg.json` lists a Dcm BSWMD — the resolver picks it up automatically. Sample/demo-ECU usage continues to work via the walk-up fallback.

## Background — what was actually measured on `73cd02a`

**`src/main/ipc/dcmConfigHandler.ts`** measured 2026-07-11:

- **`locateDcmBswmdPath(odxPath: string): string`** (line 84-106, 22 LoC) — 2-strategy walk-up:
  - Strategy 1: walk up from `process.cwd()` up to 6 levels
  - Strategy 2: walk up from `pathResolve(odxPath, '..')` up to 6 levels
  - Throws `DcmConfigError({kind: 'no-dcm-bswmd-fixture', ...})` on miss
- **`walkUpForFixture(start: string): string | null`** (line 111-128, 18 LoC) — recursive parent-directory walker
- **`resolveDcmBswmdPath(args: DcmConfigHandlerArgs): string`** (line 141-143, 3 LoC) — precedence wrapper: `args.bswmdPath ?? locateDcmBswmdPath(args.odxPath)`
- **`DcmConfigHandlerArgs`** (line 155-170, 16 LoC) — `{ odxPath, xlsxRows, outputPath?, bswmdPath? }`
- **Caller site**: `src/renderer/hooks/useDcmConfigLauncher.ts:391` — `await getApi().dcmConfig(args)` where `args = { odxPath, xlsxRows, bswmdPath? }`

**`src/renderer/hooks/useDcmConfigLauncher.ts`** measured 2026-07-11 (existing partial infrastructure):

- **Line 227**: `const EMPTY_BSWMD_PATHS: readonly string[] = Object.freeze([]) as readonly string[];` — stable empty-array fallback (v1.32.0 T5 fix for render-loop trap)
- **Line 266**: `const bswmdPaths = useArxmlStore((s) => s.project?.bswmdPaths ?? EMPTY_BSWMD_PATHS);` — already subscribes to manifest bswmdPaths
- **Line 303**: `const pathsSnapshot: readonly string[] = bswmdPaths;` — defensive copy in IPC trigger path
- **Line 373-379**: `useEffect` dep array includes `[bswmdPaths]` — bswmdHasDcm re-derives when project's bswmd list changes
- **However**: `pathsSnapshot` is computed but NOT passed to `getApi().dcmConfig(args)` — the existing infrastructure is unused for IPC. **This is the wire-up that v1.43.0 completes.**

**`src/shared/project.ts`** (ProjectManifest):

- `interface ProjectManifest { ..., bswmdPaths: readonly string[]; }` (line 37) — already populated by `ProjectManifestNewRequest` IPC

## Design — 3-step resolution (precedence order)

### Step 1: explicit `args.bswmdPath` (unchanged)

If caller passes `bswmdPath`, use it directly. Bypasses resolver entirely. Precedence unchanged from v1.30.0. **Backwards-compatible** — no behavior change for existing callers.

### Step 2: manifest `bswmdPaths` scan (NEW v1.43.0)

If `args.bswmdPath` is absent AND `args.bswmdPaths` is present and non-empty, scan each path for the Dcm BSWMD signature. Resolution criteria:

1. **Filename match**: any entry whose basename equals `Bsw_Dcm_Bswmd.arxml` (case-sensitive on POSIX, case-insensitive on Windows — `path.basename(p) === 'Bsw_Dcm_Bswmd.arxml'` after normalizing case)
2. **Existence check**: `existsSync(candidate)` returns true (file is on disk)
3. **First match wins**: return the first matching entry in array order

If no entry matches, fall through to Step 3.

**Why filename-only match** (not content sniff): the project-manifest is the user's authoritative declaration of which BSWMDs belong to the project. Filename matching keeps the resolver O(N) and content-free. The Dcm BSWMD signature (`Dcm/Can/PduR/Com` container shortNames) is checked later when the handler reads + parses the file (existing `parseArxml` flow).

### Step 3: walk-up fallback (preserved from v1.30.0)

If Step 1 + Step 2 both fail, invoke the existing `locateDcmBswmdPath(args.odxPath)` walk-up. **Backwards-compatible** — sample/demo-ECU usage unchanged.

### IPC contract change

`DcmConfigHandlerArgs` gains an optional `bswmdPaths?: readonly string[]` field:

```typescript
export interface DcmConfigHandlerArgs {
  /** Absolute path of the ODX-D file on disk. */
  readonly odxPath: string;
  /** xlsx rows carrying the 5 Dcm service kinds + per-row params. */
  readonly xlsxRows: readonly EcucInstanceRow[];
  /** Optional output path; defaults to `<odxDir>/Dcm_Config.arxml`. */
  readonly outputPath?: string;
  /**
   * v1.30.0 MINOR — real-OEM BSWMD override. When set, the handler
   * reads this file directly and skips ALL discovery (manifest +
   * walk-up). The file MUST be a parseable Dcm BSWMD with the
   * canonical AUTOSAR container shortNames.
   */
  readonly bswmdPath?: string;
  /**
   * v1.43.0 MINOR — project-manifest bswmdPaths. The handler scans
   * this array for `Bsw_Dcm_Bswmd.arxml` (case-insensitive basename).
   * When the caller passes `bswmdPaths` from the project manifest,
   * the resolver can find the Dcm BSWMD without walk-up discovery
   * (which only finds sample fixtures). Falls through to walk-up if
   * no entry matches.
   */
  readonly bswmdPaths?: readonly string[];
}
```

**Backwards-compatible**: existing IPC callers that omit `bswmdPaths` continue to hit Step 3 (walk-up). Existing tests that pass only `odxPath` + `xlsxRows` continue to work.

## Dependency ordering (T-by-T execution)

1. **T0** (this spec) — Per-flow analysis with cross-VC state coupling (this file).
2. **T1** — Modify `dcmConfigHandler.ts`:
   - Extend `DcmConfigHandlerArgs` with `bswmdPaths?: readonly string[]`
   - Add `resolveBswmdPathFromManifest(bswmdPaths: readonly string[]): string | null` helper (~15 LoC)
   - Modify `resolveDcmBswmdPath(args)` to: `args.bswmdPath ?? resolveBswmdPathFromManifest(args.bswmdPaths ?? []) ?? locateDcmBswmdPath(args.odxPath)`
3. **T2** — Modify `useDcmConfigLauncher.ts`:
   - Extend `DcmConfigApi.dcmConfig` interface with `bswmdPaths?: readonly string[]`
   - Modify `open()` callback to read `bswmdPaths` from `useArxmlStore` (already subscribed) and pass to IPC call
4. **T3** — Add tests:
   - Unit test for `resolveBswmdPathFromManifest` (3 cases: empty array → null; array with matching basename → match; array without match → null)
   - Integration test for `dcmConfigHandler` with `bswmdPaths` provided (resolves via manifest)
   - Regression test confirming walk-up fallback still works when `bswmdPaths` is absent (existing fixture tests must still pass)
5. **T4** — Tier 3 push + tag `v1.43.0` (MINOR) + GH release.

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| IPC contract change breaks `useDcmConfigLauncher` if the preload bridge type is not updated | LOW | Preload bridge (`src/preload/index.ts:302`) forwards args as-is; type widening on the renderer-side `DcmConfigApi` interface is internal |
| Filename basename match fails on case-sensitive filesystems (Windows preserves case but matches case-insensitively) | LOW | Normalize both sides via `path.basename(p).toLowerCase() === 'bsw_dcm_bswmd.arxml'` |
| Manifest `bswmdPaths` entry references a file that no longer exists on disk | LOW | `existsSync` check before returning; falls through to walk-up |
| Manifest bswmdPaths is large (100+ BSWMDs) | LOW | O(N) scan is cheap; 100 file basename checks is <1ms |
| Walk-up fallback still needed for sample fixture discovery | LOW (intentional) | Preserved as Step 3 — no breaking change for existing test suite |

## Pre-flight verify (lesson #10)

Before T1: `git fetch + git rev-list --count origin/main..HEAD + git ls-remote origin HEAD` → expect `HEAD = origin/main = 73cd02a`; `git tag -l v1.43.*` → expect none. After T1+T2+T3: `pnpm tsc --noEmit + pnpm vitest run` → expect **3124 + N tests** (N = new tests in T3) / 0 fail.

## Target LoC

| | v1.42.4 baseline | v1.43.0 MINOR target |
|---|---|---|
| `src/main/ipc/dcmConfigHandler.ts` | ~270 LoC | **~290 LoC** (+20 for IPC field + manifest resolver helper) |
| `src/renderer/hooks/useDcmConfigLauncher.ts` | ~430 LoC | **~440 LoC** (+10 for IPC args extension) |
| New tests | — | **+3 tests** (manifest helper unit + handler integration + walk-up regression) |

Net: ~30 LoC source + 3 tests. Small MINOR cycle — appropriate for a backwards-compatible IPC extension.

## What this MINOR does NOT do

- **Does NOT change the existing walk-up behavior**: Step 3 preserves the v1.30.0 walk-up discovery for sample/demo-ECU usage. Backwards-compatible.
- **Does NOT add content-sniffing to the resolver**: filename basename match is sufficient because the project manifest is authoritative. Content-sniffing (parsing each BSWMD to find Dcm containers) would add 100ms+ per call.
- **Does NOT remove `locateDcmBswmdPath`**: still used as Step 3 fallback. Future cycle could remove it once all sample fixtures are projectized.
- **Does NOT change `DcmConfigSuccessDialog` / `DcmConfigOverridePicker`**: UI is unchanged. The resolver is invisible to the user — they just see "DCM Config generated" with no awareness of whether the path came from `bswmdPath` override / manifest / walk-up.
- **Does NOT add a `bswmdPathResolutionKind` field to the response**: the resolver's choice is internal. Future cycle could add observability for which path was selected (manifest vs walk-up) for debugging.