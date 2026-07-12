# v1.52.0 — DRY Consolidation + Bridge-Runtime Seam Refactor (MINOR)

**Released:** 2026-07-12
**Tag:** [`v1.52.0`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.52.0)
**Cycle type:** MINOR (tree-touching refactors per v1.45.0 D1 complement)
**Ship basis:** 3 source commits (T1 + T2 + T3) + 1 docs ship (T4)

## Summary

Closes **Round-10 audit F-3 (MEDIUM, picker-handler DRY clone family)** + **Round-9 audit F-3 (MEDIUM, bridge-failed behavioral coverage)** dispatched across 3 atomic commits. Both fixes share root cause — `function-extract-for-test-seam-needs-deeper-integration-test-architecture` (2/3 confirmations, now almost standalone tier promotion).

| | v1.51.0 baseline | **v1.52.0** | Delta |
|---|---|---|---|
| `pickFile.ts:pickFileWithCap` helper | absent | **NEW ~80 LoC** | closes Round-10 F-3 |
| `_bridge-runtime.ts` seam | absent | **NEW 188 LoC** | enables Round-9 F-3 behavioral test |
| 3 picker handlers | 198 LoC inline body | **91 LoC post-helper** | -107 LoC (-54%) |
| `dbcImportComStackHandler.ts` | 557 LoC | **417 LoC** | -140 LoC (-25%) |
| Tests | 3156 + 7 SKIP | **3157 + 7 SKIP** | +1 from T3 |
| `pnpm verify` | 8-stage GREEN | 8-stage GREEN | maintained |

## Commits

| # | Commit | Title |
|---|---|---|
| T1 | `68fdef1` | `refactor(io): v1.52.0 MINOR T1 -- pickFileWithCap helper consolidates 3 picker handlers` |
| T2 | `62775d7` | `refactor(ipc): v1.52.0 MINOR T2 -- bridge-runtime seam refactor for F-3 closure` |
| T3 | `874cfa3` | `test(ipc): v1.52.0 MINOR T3 -- bridge-failed kind behavioral closure (Round-9 F-3)` |
| T4 | (this commit) | `docs(release): v1.52.0 MINOR -- DRY consolidation + bridge-runtime seam refactor + F-3 closure` |

## What's new

### T1 — pickFileWithCap helper (Round-10 F-3 closure)

The 3 picker handlers (`openDbcHandler.ts`, `openOdxWithDefaultHandler.ts`, `bswmdPickHandler.ts`) had line-for-line duplicates of the same `dialog.showOpenDialog + readFileWithCap + modal-on-failure` body. v1.46.0 D5 explicitly deferred this dedup (the "dual-home deduplication deferred" observation). This PATCH closes it.

NEW `src/main/io/pickFile.ts` exports:
- `PickFileOptions` (title + filters + defaultPath? + failureTitle)
- `PickFileOutcome` (canceled | opened | read-failed discriminated union)
- `pickFileWithCap(opts)` — the picker + read + modal-on-failure sequence

3 caller patterns:
- DBC: title='Open DBC', filters=[.dbc, *]
- ODX: title='Select ODX-D file', filters=request-passed or default [.odx]
- BSWMD: title='Override BSWMD', filters=[.arxml, *], collapses read-failed → canceled

### T2 — `_bridge-runtime.ts` seam extraction

Round-9 audit F-3 was a deferred closure: the inline-private `runBridgeForProject` + `applyPlanToFile` functions blocked vi.spyOn. v1.52.0 T2 extracts them to `src/main/ipc/_bridge-runtime.ts` with the lesson `#15` protocol — body bytes character-for-character, only imports list + signatures + function names changed.

NEW `src/main/ipc/_bridge-runtime.ts` exports:
- `runBridgeForProject(paths, plan, bswmdDefs)` — 3-outcome bridge coordinator
- `applyPlanToFile(filePath, planSteps, moduleDef)` — per-file patch + serialize
- `formatBridgeParseError` / `formatBridgeSerializeError` / `formatBridgeBswmdError` — IPC error envelope formatters
- `BridgeFileOutcome` / `BridgeFileOutcomeOrNull` / `RunBridgeResult` types

The handler file (`dbcImportComStackHandler.ts`) is reduced from 557 LoC to 417 LoC (-25%) — the inline bridge-runtime internals (lines 171-321) are removed in favor of the imported seam.

### T3 — Round-9 F-3 behavioral test

The T3 test is at `src/main/ipc/__tests__/dbcImportComStackHandler.test.ts:503-583`. Uses `vi.spyOn(_bridge_runtime, 'runBridgeForProject').mockImplementation(...)` to inject a 3-null outcome tuple — triggers the bridge-failed guard at handler line 296.

**Lesson discovered mid-T3**: vi.spyOn does NOT propagate to module-internal lexical references — `vi.spyOn(_bridge_runtime, 'applyPlanToFile')` doesn't redirect `runBridgeForProject`'s internal call to `applyPlanToFile` (JS module-internal names resolve at module-load time, not via the export-binding lookup vi.spyOn mutates). Solution: spy on the public coordinator (`runBridgeForProject`) which IS the handler's call surface.

This is the **2nd confirmation** of the lesson candidate `function-extract-for-test-seam-needs-deeper-integration-test-architecture` — first confirmation was the v1.51.0 PATCH T4 deferral; this cycle resolves F-3 via seam extraction. 1 more observation promotes to standalone tier.

## Decisions

- **D1 MINOR not PATCH** — tree-touching refactors per v1.45.0 D1 complement. NEW files: `pickFile.ts`, `_bridge-runtime.ts`. ~140 LoC deleted from existing handler file.
- **D2 verbatim-clip protocol** — function bodies moved character-for-character (lesson `#15`). Only imports list + signatures + function names changed.
- **D3 spy on coordinator (not internal helper)** — vitest's vi.spyOn mutates export bindings only; module-internal lexical refs resolve at module-load time. Spying `runBridgeForProject` (the public coordinator) intercepts all calls transitively.
- **D4 BSWMD picker preserves read-failed → canceled collapse** — per the v1.33.0 T2 design (the picker collapses read errors to canceled so the renderer's "no change" branch is uniform). The 3 caller collapse rules are NOT universally the same.

## Honest deviations

- **(a)** T1 net LoC change: ~80 LoC new in `pickFile.ts` + ~107 LoC deleted across 3 handlers = ~27 LoC net reduction. The new helper centralizes the duplicate body so future handlers consume the same shape.
- **(b)** T3 mockImplementation requires `mockImplementation` (not `mockImplementationOnce`) because `runBridgeForProject` calls `applyPlanToFile` 3 times — `mockImplementationOnce` only intercepts the first call.

## Process lessons applied (across T1-T3)

- **Lesson #10** (devlog-follow-up-status-claims) — `pnpm verify` 8-stage state confirmed at every commit boundary.
- **Lesson #11** (pkm-capture-stub-topic-file-recovery) — applied proactively; capture-decisions file written inline via Write tool.
- **Lesson #13** (per-flow prereq analysis) — T1 traced the 3 picker handlers' shared body shape before extraction; T2 traced the bridge-runtime internals + verified parse-error path type-coercion; T3 verified vitest vi.spyOn limitation before attempting the mock.
- **Lesson #14** (chunk-replacement guard) — T2 used a Python range-removal script for the 171-309 line extraction in `dbcImportComStackHandler.ts` (chunk-replacement avoids risk of miscounting).
- **Lesson #15** (`function-extract-must-clip-verbatim-not-reimplement`) — applied to T2. Function bodies moved character-for-character with zero logic edits.

## NEW lesson candidate observations

- **`vi-spyon-export-binding-does-not-intercept-module-internal-lexical-references`** — vitest's `vi.spyOn(module, 'name')` mutates only the exported binding; module-internal references to the same name resolve at module-load time via lexical scope, so the spy does NOT propagate. Solution: spy the public entry point or refactor the module to self-reference via the exported name. **1 of 3 observations** (this cycle); promotion requires 2 more.

- **`function-extract-for-test-seam-needs-deeper-integration-test-architecture`** — Round-9 F-3 + Round-10 F-5 a/b/c deferrals (v1.51.0 PATCH) were both rooted in the same problem: source structured for production not for test isolation. v1.52.0 T2 resolves the F-3 side via seam extraction. **2/3 confirmations**; promotion requires 1 more.

## Test results

- vitest 350/350 files / **3157 + 7 SKIP / 0 fail** (+1 net from v1.51.0).
- tsc `--noEmit -p tsconfig.json` + `--noEmit -p tsconfig.web.json` both clean (1 side-effect fix during T2 import cleanup).
- prettier check clean (2 auto-fixes).
- eslint `--max-warnings 0` clean (3 auto-fixes: import/order).
- **`pnpm verify` 8-stage GREEN** — python-self-test 8/8 PASS.

## Related documents

- **CHANGELOG**: top entry of `CHANGELOG.md`.
- **v1.51.0 ship notes** (predecessor, Round-10 audit closure): `docs/release-notes/v1.51.0/README.md`.
- **v1.51.0 PATCH T4 deferral stub** (now obsolete; replaced by T3): `src/main/ipc/__tests__/dbcImportComStackHandler.test.ts` (was lines 504-530 in v1.51.0; replaced in-place by the new T3 case).

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
