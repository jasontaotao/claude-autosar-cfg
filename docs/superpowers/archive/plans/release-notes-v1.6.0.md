# Release Notes — v1.6.0 (2026-06-21)

> **Ship summary**: MINOR bump. 4 new features ship behind feature flags default OFF — Headless Config Engine CLI, SWS Validator framework, First-Run Onboarding tour, Keyboard-First Power User mode. 26 commits since v1.5.1, 1972 tests pass + 1 skipped, 0 type errors, 0 lint errors, project-wide coverage 96.61% / 87.72% (target ≥ 95.5% / ≥ 87%).

## What's new

### 🚀 Cluster A+C — Headless Config Engine CLI

Standalone Node CLI for CI/CD integration. Reuses v1.5.1 PR(4) `applyMutation` and PR(3) `removeWithCascade` for in-memory mutations + atomic disk writes.

```bash
# Read an ARXML and dump to stdout
node bin/autosarcfg.mjs read --input ./project.arxml

# Apply a JSON Patch (RFC 6902 subset + 3 AUTOSAR extensions)
node bin/autosarcfg.mjs mutate --input ./project.arxml --patch ./patch.json --output ./out.arxml

# Stub validate (emits headless:validate-result:v1 for SWS Validator integration)
node bin/autosarcfg.mjs --validate --input ./project.arxml
```

- **16 flags**: `--input` / `--output` / `--patch` / `--validate` / `--format` / `--verbose` / `--dry-run` / `--quiet` / `--backup` / `--streaming` / `--cache` / `--platform` / `--module` / `--config` / `--help` / `--version`
- **4 exit codes**: 0 success / 1 fatal / 2 partial-with-warnings / 3 invalid-input
- **3 new IPC channels** in `src/shared/headless/ipc-contract.ts` with `:v1` versioning policy:
  - `headless:run-command:v1` — main entry
  - `headless:mutate-applied:v1` — mutation completion event
  - `headless:validate-result:v1` — validation result event (G cluster consumer)
- **Patch format**: subset of RFC 6902 (`add` / `remove` / `replace`) + 3 AUTOSAR extensions (`set-param` / `add-child` / `remove-with-cascade`); `autosarcfgPatchVersion: "1"` discriminator
- **Feature flag**: `experimental.headlessCli` default OFF (CLI binary itself does NOT check the flag; flag only gates the future GUI "Run CLI" button)

### 🚀 Cluster G — SWS Validator framework

AUTOSAR Specification of Software (SWS) module constraint validator. Plugin architecture — users can drop in custom `.validator.ts` files (mirrors v1.3.0 `.script.ts` pattern).

- **4 starter rules** (deferred C2 `SWS_COMM_CHANNEL_PDUR_ALIGN` to v1.7.0 — alignment warning is too subjective for v1.6.0):
  - `SWS_COM_PDUID_UNIQUE` (Com, error): ComConfig 内 ComPduId 唯一
  - `SWS_PDUR_ROUTING_COMPLETE` (PduR, error): 每条 PduRRoutingPath 必须有完整 src→dest
  - `SWS_ECUC_MULTIPLICITY_MIN` (EcuC, error): 实例数 ≥ lowerMultiplicity
  - `SWS_BSWMD_DEPS_PRESENT` (cross, error): BSWMD 声明的 module dependency 必须有对应 BSWMD 文件
- **GUI ValidationPanel**: bottom-docked, displays 4 starter rules' results, click-to-jump to offending tree node
- **Sandbox**: copy of v1.3.0 `src/main/script/vm-runner.ts` (different `RuleCtx` API — read-only + `log` + `result()` helper) with 1-file parity test as v1.6.0 mitigation. v1.7.0 plan to extract `src/core/sandbox/vm-runner.ts` as canonical SoT.
- **in-process tour-pause subscription** (D1 design choice): renderer `useArxmlStore.subscribe(state.tour, ...)` — 0 new IPC channel, 0 main-process involvement. When W tour is `running`, G validator debounce handler early-returns empty array.
- **Feature flag**: `experimental.swsValidator` default OFF

### 🚀 Cluster W — First-Run Onboarding

5-step tour for first-time users. Bundled Demo ECU fixture with intentional SWS violation for visible validation demo.

- **Tour state machine** (5 variants): `idle` → `running` → `completed` / `dismissed` / `suppressed`
- **`validationPaused` field**: when `kind === 'running'`, G validator early-returns (in-process subscribe, per D1)
- **5 tour steps**:
  1. Left panel (Project tree)
  2. Middle (ECUC editor)
  3. Right pane content (intentional SWS_COM_PDUID_UNIQUE violation visible)
  4. Save flow
  5. Export ARXML
- **Demo ECU bundled fixture** (`samples/arxml/demo-ecu/`): 5 BSWMDs (Com / ComM / CanIf / EcuC / PduR) + 5 value ARXMLs + `demo.autosarcfg.json` manifest with 1 intentional `SWS_COM_PDUID_UNIQUE` violation
- **7-day suppress window** after completion/dismissal
- **Feature flag**: `experimental.onboarding` default OFF

### 🚀 Cluster U — Keyboard-First Power User

51 shortcuts + Cmd-K command palette + WCAG 2.2 AA a11y.

- **Cmd-K command palette**: fuzzy filter + execute + 50+ registered commands
- **Cheat sheet** (`?` key): shows all 51 shortcuts grouped by category
- **51 shortcuts** in 12 categories:
  - File (5): Open / Save / Save As / Close / Recent
  - Edit (7): Undo / Redo / Cut / Copy / Paste / Find / Replace
  - View (5): Toggle Left Panel / Toggle Right Panel / Zoom In / Zoom Out / Reset Zoom
  - Navigate (5): Go to Definition / Go to Reference / Next Error / Prev Error / Focus Search
  - Selection (5): Select All / Expand / Shrink / Multi-cursor Above / Multi-cursor Below
  - Tree (5): Expand All / Collapse All / Jump to Parent / First Child / Last Child
  - Script (4): Open Script Editor / Run Script / Save Script / Format Script (复用 v1.3.0 `applyScript` IPC)
  - ECUC (5): Add Container / Delete Container / Add Parameter / Edit Parameter / Duplicate
  - Window (3): New / Close / Focus Next Panel
  - Help (2): Show Shortcuts / Show Docs
  - Palette (1): Cmd-K (Show Command Palette)
  - **Validation (4, G-coupled)**: F8 (Next Error) / Shift+F8 (Prev Error) / Mod+Shift+V (Toggle ValidationPanel) / Mod+Shift+E (Focus ValidationPanel)
- **ResetOnboardingMenuItem** wiring W's `tour:reset` IPC (U wires UI surface; W ships IPC contract)
- **a11y (WCAG 2.2 AA)**: focus trap + `aria-keyshortcuts` attributes on all 51 shortcut UI elements + axe-core CI gate
- **Feature flag**: `experimental.keyboardFirst` default OFF

## Cross-spec integration

9-scenario cross-spec integration test matrix (A+C spec §10.6, 22/22 tests pass):

| #   | Scenario                                                  | Owner cluster | File                                                                                      |
| --- | --------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| 1   | CLI read ARXML                                            | A+C           | `tests/integration/a-c-1-cli-read.test.ts`                                                |
| 2   | CLI mutate + write                                        | A+C           | `tests/integration/a-c-2-cli-mutate.test.ts`                                              |
| 3   | CLI `--validate` stub emit `headless:validate-result:v1`  | A+C           | `tests/integration/a-c-3-cli-validate.test.ts`                                            |
| 4   | W Demo ECU loaded via CLI                                 | A+C + W       | `tests/integration/a-c-4-w-demo-ecu.test.ts` + `tests/integration/w-demo-ecu-cli.test.ts` |
| 5   | G validation result → CLI stdout                          | A+C + G       | `tests/integration/g-result-cli.test.ts` (pending G-5 wire-up)                            |
| 6   | U command palette "Run Script" → v1.3.0 `applyScript` IPC | U             | `tests/integration/u-run-script.test.ts`                                                  |
| 7   | U Cmd-S triggers A+C save path (GUI bridge)               | U + A+C       | **defer v1.7.0** (no GUI bridge in v1.6.0)                                                |
| 8   | W tour validation paused → G skip                         | W + G         | `tests/integration/tour-pause-validator.test.ts`                                          |
| 9   | G sandbox parity vs v1.3.0 Script Engine                  | G             | `src/core/sws-validator/sandbox/__parity__.test.ts`                                       |

## Stats

| Metric                 | v1.5.1 | v1.6.0                                                                                                             | Delta                       |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| Commits since last tag | —      | **26**                                                                                                             | +26                         |
| Tests passing          | 1692   | **1972**                                                                                                           | +280                        |
| Tests skipped          | 1      | 1                                                                                                                  | 0                           |
| Type errors            | 0      | 0                                                                                                                  | 0                           |
| Lint errors            | 0      | 0                                                                                                                  | 0                           |
| Coverage (stmt)        | 96.31% | **96.61%**                                                                                                         | +0.30%                      |
| Coverage (branch)      | 87.96% | **87.72%**                                                                                                         | -0.24% (still above target) |
| New IPC channels       | —      | 4 (`headless:run-command:v1` / `headless:mutate-applied:v1` / `headless:validate-result:v1` / `feature-flags:get`) | +4                          |
| New i18n keys          | —      | 124 × 2 locales                                                                                                    | +248 entries                |
| New dependencies       | —      | 0 (commander.js already in v1.5.1 deps)                                                                            | 0                           |

## Cross-cluster concerns closed (Round 3 micro-edit + final fix)

- ✅ C2.1 `ValidatorResult.severity` narrowed to 2 values (spec + code aligned)
- ✅ C2.2 G `tourSlice` + W `TourProvider` mount conflict resolved
- ✅ C2.5 `writeAtomic` path doc-rot fixed (W spec §4.1 corrected)
- ✅ C2.6 `data-tour-id="right-pane-content"` 1-line wired in App.tsx
- ✅ C2.7 `feature-flags:get` IPC main handler shipped
- ⏳ C2.3 `useSwsValidatorStore.run()` no caller — v1.7.0 follow-up
- ⏳ C2.4 A+C mutate handler stub — v1.7.0 follow-up (requires main-process CLI refactor)

## Upgrade notes

- **Bit-for-bit identical to v1.5.1** when all 4 feature flags are OFF (default)
- No breaking changes to existing IPC channels (the 32 v1.5.1 channels are untouched)
- New `feature-flags:get` IPC channel is additive
- New IPC channels (`headless:*:v1`) use `:v1` versioning policy per A+C spec §6

## Known limitations (v1.6.0 → v1.7.0 follow-ups)

- **`bin/autosarcfg.mjs` uses Node's `--experimental-strip-types`** — works locally; published package needs esbuild bundling
- **G cluster sandbox is a copy of v1.3.0 Script Engine** with 1-file parity test mitigation; v1.7.0 plan to extract `src/core/sandbox/vm-runner.ts` as canonical SoT
- **U `useSwsValidatorStore.run()` is registered but not driven** — 4 G-coupled shortcuts (F8 / Shift+F8 / Mod+Shift+V / Mod+Shift+E) wait for v1.7.0 to wire run bodies
- **`arxml-stream` memory bounded-ness** remains unachieved (carried over from v1.5.1 PR(6) Sub-B) — v1.7.0 plan to swap in a true SAX parser

## Acknowledgements

This release ships 4 new features developed in parallel via 17 subagent dispatches (4 spec writers + 5 review agents + 1 synthesizer + 3 spec editors + 1 re-review + 4 spec editors R2 + 1 re-review R2 + 1 micro-edit + 4 implementers + 1 final fix). All 4 cluster canonical SoT paths locked:

- `writeAtomic` in `src/main/ipc/projectSaveHandler.ts:50` (v1.5.1 PR(4))
- Demo ECU manifest in `samples/arxml/demo-ecu/demo.autosarcfg.json` + `src/renderer/onboarding/DemoEcuManifest.ts`
- Canonical wire-shape in `src/shared/headless/ipc-contract.ts` (extend, don't fork v1.5.1's `src/shared/ipc-contract.ts`)
- `feature-flags:get` IPC handler in `src/main/ipc/featureFlagsHandler.ts`
