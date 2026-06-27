# v1.11.0 Release Notes

> **Release date:** 2026-06-24
> **Predecessor:** v1.10.3 (`7f957fe` wire H1 dirty-guard, completing all 7 v1.10.1 review findings) SHIPPED 2026-06-24
> **Type:** MINOR
> **Branch:** `feature/v1-11-0-bsw-generator`
> **Commits since v1.10.3:** 18 (Tasks 1–19 + Recovery + Review-fix + Verify-fix + Release)

## Highlights

- **`generate` sub-command**: emit BSW C configuration source from ECUC values. Run `claude-autosarcfg generate --project <path>`.

## What's New

- Full pipeline (pre-process / generate / post-process) + EcuC demo generator
- `Diagnostic[]` channel with 12 standard codes
- `--variant`, `--module`, `--strict`, `--format` flags
- Atomic file writes (temp + rename)
- Pure-function `ModuleGenerator` interface; TS class static registration via `registerGenerator()`
- 12 standard `DiagnosticCode` values; CLI exit codes 0/1/2 per project convention (`EXIT_SUCCESS` / `EXIT_FATAL` / `EXIT_WARNING`)

## Architecture

The new generator sits under `src/core/generator/` and is composed of:

| Module                                    | Role                                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `diagnostics.ts`                          | `DiagnosticCode` enum (12 codes) + `Diagnostic` channel type                                             |
| `registry.ts`                             | `registerGenerator()` / `getGenerator()` / `clearRegistry()`                                             |
| `handlebars.ts` + `handlebars-helpers.ts` | Handlebars engine + `cIdent` / `cType` / `cValue` / `paramConfigClass` / `bswmdPathOf` / `partitionName` |
| `normalize.ts`                            | `normalizeToTree` — pre-process BSWMD + ECUC values into a tree                                          |
| `pipeline.ts`                             | 3-stage orchestrator (pre-process / generate / post-process) with exit-code logic                        |
| `post-process.ts`                         | Atomic file write (temp + rename)                                                                        |
| `emit/strategy.ts`                        | configClass × isArray matrix                                                                             |
| `emit/types.ts`                           | `typeToCType` (ECUC → C)                                                                                 |
| `emit/container.ts`                       | Container emit with deterministic INDEX ordering                                                         |
| `emit/choice.ts`                          | Choice emit (`#ifdef` blocks) + choices.json loader                                                      |
| `emit/reference.ts`                       | Reference integrity validation + emit                                                                    |
| `modules/ecuc.ts`                         | `EcuCGenerator` class (single-module end-to-end proof)                                                   |
| `index.ts`                                | Public API barrel                                                                                        |

## CLI

```sh
claude-autosarcfg generate \
  --project ./test.autosarcfg.json \
  --out-dir ./generated \
  --variant PreCompile \
  --module EcuC \
  --strict
```

Exit codes:

| Code | Meaning                                                                                      |
| ---- | -------------------------------------------------------------------------------------------- |
| 0    | `EXIT_SUCCESS` — all modules generated cleanly                                               |
| 1    | `EXIT_FATAL` — at least one E-class diagnostic (BSWMD/ECUC schema missing, broken ref, etc.) |
| 2    | `EXIT_WARNING` — only W-class diagnostics (missing optional ref, default-fill only, etc.)    |

## Test Coverage

- **85+ new tests** across 16 generator test files
- 7 golden snapshot files (Cfg.c / Cfg.h / PBcfg.c for 3 EcuC scenarios + 4 diagnostic cases)
- Coverage on `src/core/generator/**`:
  - Lines / Statements: **91.94%**
  - Functions: **94.87%**
  - Branches: **74.86%**
- Pre-existing test counts unchanged elsewhere (2296 pass + 1 skip + 10 todo in full suite; 16 pre-existing workspace-dependent failures in `user-jwq3399-*` / `workspace-111-*` are out of scope — they read from the user's desktop workspace, not committed)

## Verification

`pnpm verify` (all 7 stages):

| Stage             | Status                                                                        |
| ----------------- | ----------------------------------------------------------------------------- |
| format            | PASS                                                                          |
| lint              | PASS (after dropping dead `deleteEcucModuleAction` var)                       |
| type-check        | 5 pre-existing renderer WIP errors in ECUC delete feature remain out of scope |
| test              | 2296 pass + 1 skip + 10 todo; 16 pre-existing workspace failures              |
| coverage          | generator 91.94% / 74.86% / 94.87% — above 80% floor                          |
| build             | 3 stages PASS (renderer 846.77 kB / main 370.83 kB / preload 2.44 kB)         |
| import-regression | 2 tests PASS                                                                  |

## Out of Scope (v2+)

The MVP ships with one known limitation per the spec — these are deferred to v2:

- **`isPostBuild` substring heuristic** — replaced in v2 with proper `paramConfigClass` lookups against parsed BSWMD
- **Unreachable `001 NO_SCHEMA` branch in `pipeline.ts`** — currently dead code because of the dual-Map construction in `normalizeToTree`
- **Reference emit** — current goldens for `Refs-1` don't include `&Mcu_ClockConfig_0` (placeholder only)
- **clang-format integration** in post-process — atomic write only, no formatter pass
- **Renderer-side "Generate" button** — CLI-only in v1.11.0
- **Other BSW module generators** (Mcu, Port, Dio, Can, Com, PduR, …) — only EcuC ships in MVP
- **RTE generator** — separate future feature

## Files committed

- `src/core/generator/**` (12 source modules + 16 test files + fixtures + templates)
- `src/cli/handlers/generate.ts` (CLI handler) + tests
- `src/cli/command-dispatcher.ts` (route `generate` command)
- Spec: `docs/superpowers/specs/2026-06-24-bsw-code-generator-design.md`
- Plan: `docs/superpowers/plans/2026-06-24-bsw-code-generator.md`

## References

- Spec: `docs/superpowers/specs/2026-06-24-bsw-code-generator-design.md`
- Plan: `docs/superpowers/plans/2026-06-24-bsw-code-generator.md`
- Task reports: `.git/sdd/task-{1..19}-report.md`
