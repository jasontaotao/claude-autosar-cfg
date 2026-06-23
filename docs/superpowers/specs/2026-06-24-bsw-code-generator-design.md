# BSW C Code Generator — Design Spec

> **Date**: 2026-06-24
> **Target**: v1.9.0 MINOR (next feature slot after current shipped work)
> **Scope**: Add a `generate` sub-command to the existing headless CLI v1 that
> emits BSW configuration C source code (Cfg.c / Cfg.h / PBcfg.c) from ECUC
> module configuration values + BSWMD schemas.
> **Branch base**: current `main` (v1.8.4 series)
> **MVP demo module**: EcuC (single-module end-to-end proof)

## Background

claude-AutosarCfg already loads BSWMD (BSW Module Description) ARXML, parses
ECUC values, validates configurations, and round-trips ARXML. The missing
piece is the **last mile**: emitting compilable C configuration code that an
MCU toolchain can build.

EB tresos and ETAS RTA-BSW solve this with proprietary generator plugins
(.xpt / OSGi / .cgen descriptors). claude-AutosarCfg is a TS toolchain; we
need a TS-native generator that follows the AUTOSAR meta-model rules.

### Research summary (deep-research 2026-06-23)

Fan-out 5 angles, 2 of 5 candidate claims survived adversarial verification.
The unverified claims were vendor-specific (cannot confirm EB tresos / ETAS
internal architecture from public sources — all vendor docs were paywalled
or unreachable). The surviving findings come from the AUTOSAR MMOD standard
(R22-11).

| # | Claim | Vote | Confidence | Status |
|---|---|---|---|---|
| 1 | Schema vs Values strict split (definition ref + BswImplementation) | 3-0 | High | **Foundation** |
| 2 | Per-element `configClass` + `configVariant` pair mandate | 2-1 | High | **Foundation** |
| 3 | 3-stage pipeline (pre / generate / post) | — | Medium | **Design choice** |
| 4 | Diagnostic channel pattern | — | Medium | **Design choice** |
| 5 | ECUC type → C mapping rules | — | Medium | **Design choice** |

Three claims were refuted (0-3 votes): PreCompileTime/VariantLinkTime/VariantPostBuild
exact wording, container `atpSplitable` + sort order mandate, and
EcucChoiceContainerDef child `multiplicity 0..1`. The implementer should
treat these as configurable behavior rather than hard standards.

### Open questions (deferred to v2+)

- Whether EB tresos / ETAS public docs become available for byte-compat work
- Post-build binary format at runtime (standard mandates C interface, not binary)
- Inter-module reference circular detection (tree walk will catch; full graph
  analysis is v2)

## Goals

1. **End-to-end working pipeline** for one BSW module (EcuC) that:
   - Loads BSWMD + BSWCFG from an existing `.acproj` project
   - Walks the ECUC values tree filtered by active variant
   - Emits `EcuC_Cfg.h` + `EcuC_Cfg.c` (+ `EcuC_PBcfg.c` if any PostBuild)
   - Output passes `clang-format` and is byte-stable (snapshot tested)
2. **Pluggable module registration** so v2+ can add Mcu, Port, Dio, etc.
   without redesigning the registry
3. **Shared Diagnostic channel** with the existing CLI surface so a future
   renderer-side "Generate" button can subscribe to the same error model
4. **Strict TDD** — every helper and emit strategy is unit tested; full
   EcuC pipeline has snapshot + integration tests

## Non-Goals (MVP)

- RTE generation (separate concern, future sprint)
- Post-build binary blob format (we emit loader C; binary is v2)
- Cross-vendor byte-compat (EB tresos / ETAS output compat)
- Renderer-side "Generate" UI button (v2 — IPC layer can wrap the same core)
- Module generators other than EcuC (each new module is its own sprint)
- Dynamic plugin loading from npm (TS class registration is enough for MVP)
- BSWMD vendor-extension discovery (we treat BSWMD as-is, no `GENERATION-INFO` parsing)

## Locked Decisions (from brainstorm)

| # | Decision | Rationale |
|---|---|---|
| 1 | MVP scope = full pipeline + **EcuC demo module only** | Proves architecture end-to-end with smallest possible test surface |
| 2 | Template engine = **Handlebars** (already in renderer) | 6KB, helpers sufficient, no new dep |
| 3 | Module registration = **pure TS class + static `registerGenerator()`** | Type safety at compile time, no descriptor schema to maintain |
| 4 | C standard = **C99** | MISRA-C compatibility wins over modernity |
| 5 | CLI entry = **headless CLI v1 sub-command** (no new binary) | Existing `validate` / `extract` / `sws` shape |
| A | `--variant` default = `PreCompile` | Most common case |
| B | Missing generator → **WARNING**, not ERROR | Allow partial output |
| C | multiplicity violation → ERROR; ordering violation → WARNING | Strict on type contract, lenient on layout |
| D | Registry key = module **shortName** (e.g. `"EcuC"`), not full path | Vendor-neutral across BSWMD path variants |
| E | `emit()` is **pure function** | Required for snapshot tests + cache + parallelism |
| F | Module generators **mutually independent** | No cross-module reads; enables parallel generate stage |
| G | Container order: by `<INDEX>` ascending, fallback shortName lexical | Deterministic for snapshot diffs |
| H | Choice emit = Approach A (`#ifdef`) only for MVP | EcuC has one simple choice; v2 if needed |
| I | Reference target unresolved → **ERROR** | Reference is ECUC hard constraint |
| J | Snapshot tests = vitest snapshot (committed to repo) | No external tool dependency |
| K | Add `--strict` flag (treat WARNING as ERROR) | Useful for CI |
| L | Exit code: any ERROR → 1; all WARNING → 0 | Standard CLI convention |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    headless CLI v1 (existing)                       │
│                    + generate sub-command                            │
└─────────────────────────────────────────────────────────────────────┘
                                │ invokes
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  core/generator/ (NEW)                              │
│                                                                     │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│   │  pre-process │ ─▶ │   generate   │ ─▶ │  post-process│          │
│   │              │    │              │    │              │          │
│   │  • load BS-  │    │  • walk def  │    │  • clang-    │          │
│   │    WMD/      │    │  • filter by │    │    format    │          │
│   │    BSWCFG    │    │    variant   │    │  • write     │          │
│   │  • build     │    │  • dispatch  │    │    output    │          │
│   │    normalized│    │    to module │    │    tree      │          │
│   │    tree      │    │    generator │    │              │          │
│   └──────────────┘    └──────────────┘    └──────────────┘          │
│                                                                     │
│   ┌────────────────────────────────────────────────────┐            │
│   │  GeneratorRegistry (TS class 静态注册)              │            │
│   │  + Handlebars engine (复用 renderer 的)              │            │
│   │  + Diagnostic channel (severity/code/path/msg)      │            │
│   └────────────────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────────────┘
                                │ reads
                                ▼
                ┌──────────────────────────────┐
                │  Schema (BSWMD ARXML)         │
                │  Values (BSWCFG / ECUC-VALUES)│
                │  BswImplementation            │
                └──────────────────────────────┘
```

### Key invariants

1. **Schema / Values strict separation** (claim #1, 3-0 vote). The generator
   never reads default values from BSWMD at runtime; all values come from
   BSWCFG. BSWMD is consulted only for type / multiplicity / range validation.
2. **Variant-driven emission** (claim #2, 2-1 vote). The `generate` CLI takes
   a `--variant` flag; the pre-process stage filters EcucAbstractConfigurationClass
   elements by the active variant.
3. **BswImplementation is a filter, not a selector.** Generator lookup is by
   module shortName. BswImplementation only determines which schema is
   *eligible* to be used; the generator itself does not inspect it.
4. **Diagnostic accumulation across stages.** pre / generate / post each
   push to a shared `Diagnostic[]`. CLI exit code derives from severity
   (ERROR → 1, all WARNING → 0, `--strict` collapses WARNING to ERROR).

## Data Model

### NormalizedConfigTree (pre-process output)

```typescript
// src/core/generator/normalize.ts

export interface NormalizedConfigTree {
  /** Map: module shortName → module definition */
  readonly bswmdIndex: ReadonlyMap<string, BswmdModuleDef>;
  /** Map: module shortName → module values (from BSWCFG) */
  readonly valuesByModule: ReadonlyMap<string, EcucModuleConfigurationValues>;
  /** Map: module shortName → BswImplementation reference */
  readonly implByModule: ReadonlyMap<string, string>;
  /** All reference edges across modules (source → target) */
  readonly references: readonly ReferenceEdge[];
}

export interface ReferenceEdge {
  readonly sourceModule: string;
  readonly sourcePath: string;
  readonly targetModule: string;
  readonly targetPath: string;
}
```

`normalizeToTree(ecucValues, bswmds)` walks every `EcucModuleConfigurationValues`,
resolves its `definition` reference back to a `EcucModuleDef`, builds
`bswmdIndex`, then validates all cross-module references against
`valuesByModule`.

## Pipeline

### Stage 1: pre-process

- Load `.acproj` (existing `LoadProject` reused)
- Parse BSWMD ARXML (existing `bswmdParser`)
- Parse BSWCFG ARXML (existing `bswcfgParser` or equivalent)
- Build `NormalizedConfigTree` via `normalizeToTree`
- Validate multiplicity, range, type, reference integrity
- Each validation failure → `Diagnostic[]` entry (ERROR or WARNING per
  decision C)

### Stage 2: generate

```typescript
for (const [moduleShortName, moduleValues] of tree.valuesByModule) {
  const def = tree.bswmdIndex.get(moduleShortName);
  if (!def) {
    diagnostics.push({ severity: 'WARNING', code: 'ECUC-GEN-001', ... });
    continue;
  }
  const generator = registry.get(moduleShortName);
  if (!generator) {
    diagnostics.push({ severity: 'WARNING', code: 'ECUC-GEN-002', ... });
    continue;
  }
  try {
    const artifacts = generator.emit(def, moduleValues, ctx);
    for (const a of artifacts) staged.set(a.path, a.content);
  } catch (e) {
    diagnostics.push({ severity: 'ERROR', code: 'ECUC-GEN-003', moduleShortName, message: e.stack });
  }
}
```

### Stage 3: post-process

- Run `clang-format` (project-local binary, NOT a remote package — see
  web/hooks.md for PostToolUse hook policy)
- Atomic write: temp file + rename
- Verify no duplicate top-level symbols across the emitted files
  (regex: `^(?:extern\s+)?(?:CONST\s*\()?\s*[A-Za-z_]\w*\s+[A-Za-z_]\w*`)
- Stage output goes to `--out` directory (default `<project>/generated/`)

## Module Registration

### Interface

```typescript
// src/core/generator/registry.ts

export interface GenerationContext {
  readonly variant: 'PreCompile' | 'Link' | 'PostBuild';
  readonly bswmdIndex: ReadonlyMap<string, BswmdModuleDef>;
  readonly implByModule: ReadonlyMap<string, string>;
  readonly outDir: string;
  readonly diagnostics: Diagnostic[];
}

export interface GeneratedArtifact {
  /** Path relative to outDir, e.g. "EcuC/EcuC_Cfg.c" */
  readonly path: string;
  /** C source content, unformatted (formatted in post-process) */
  readonly content: string;
}

export interface ModuleGenerator {
  readonly moduleShortName: string;
  emit(
    def: BswmdModuleDef,
    values: EcucModuleConfigurationValues,
    ctx: GenerationContext
  ): readonly GeneratedArtifact[];
}

const generators = new Map<string, ModuleGenerator>();

export function registerGenerator(g: ModuleGenerator): void {
  if (generators.has(g.moduleShortName)) {
    throw new Error(`Generator for ${g.moduleShortName} already registered`);
  }
  generators.set(g.moduleShortName, g);
}

export function getGenerator(shortName: string): ModuleGenerator | undefined {
  return generators.get(shortName);
}
```

### EcuC Generator (MVP demo)

Located at `src/core/generator/modules/ecuc.ts`. Implements `ModuleGenerator`
with `moduleShortName = 'EcuC'`. Renders 3 templates:

| Template | Path | Notes |
|---|---|---|
| `cfg.h.hbs` | `EcuC/EcuC_Cfg.h` | Typedefs, extern decls, header guard |
| `cfg.c.hbs` | `EcuC/EcuC_Cfg.c` | CONST decls for PreCompile, externs for Link, RAM shadows for PostBuild |
| `pbcfg.c.hbs` | `EcuC/EcuC_PBcfg.c` | Loader entries (only emitted if any PostBuild element) |

EcuC emit logic:
1. Filter def by active variant: `pickByVariant(def.paramConfigClasses, ctx.variant)`
2. Partition values by element's configClass: PreCompile / Link / PostBuild
3. Render `cfg.h.hbs` with `moduleShortName`, includes (gathered from
   reference targets), typedef list, extern list
4. Render `cfg.c.hbs` with three pre-partitioned value lists
5. If any PostBuild element present, render `pbcfg.c.hbs`

**Variant with no matching elements**: if `ctx.variant === 'PreCompile'`
but the module's BSWMD only declares `PostBuild` configClasses, the
emitted Cfg.c has an empty data section (only file header + typedef
list, no `CONST(...)` arrays). The generator does **not** error — it
emits valid compilable C and pushes an INFO diagnostic
(`ECUC-GEN-INFO-001`, "no elements for active variant"). This avoids
forcing the integrator to re-invoke generate with a different variant
just to discover an empty result.

## Code Emission Rules

### configClass × isArray strategy

| configClass \ isArray | Scalar | Array |
|---|---|---|
| **PreCompile** | `CONST(Type, AUTOMATIC) uint8 EcuC_X = 42;` | `CONST(Type, AUTOMATIC) uint8 EcuC_X[3] = { 1, 2, 3 };` |
| **Link** | `extern CONST(Type, AUTOMATIC) uint8 EcuC_X;` | `extern CONST(Type, AUTOMATIC) uint8 EcuC_X[3];` |
| **PostBuild** | `static uint8 EcuC_X;` | `static uint8 EcuC_X[3];` + loader entry (see PBcfg format below) |

**PostBuild loader entry format** (defined for MVP, kept simple — v2 may
extend):

```c
/* In EcuC_PBcfg.c */
void EcuC_PBcfg_Init(void* baseAddr) {
    /* Entry per PostBuild element, generated at compile time */
    *(uint8*)((uintptr_t)baseAddr + 0x00u) = (uint8)EcuC_X_InitValue;
    /* ... more entries ... */
}
```

`InitValue` is the initial value written by the loader (== the PreCompile
constant). The `baseAddr` is provided by the integrator at boot; addresses
are sequential and deterministic so two consecutive builds produce
byte-identical loader functions (snapshot-stable).

Strategy table lives inside `src/core/generator/emit/strategy.ts`. Module
generators call helpers (`emitConstDecl`, `emitExternDecl`, `emitLoaderEntry`)
instead of concatenating strings directly.

### ECUC type → C type

| ECUC Type | C Type | Notes |
|---|---|---|
| `EcucIntegerParamDef` ≤32-bit | `uint8`/`uint16`/`uint32`/`sint8`/... | Narrowest fit by min/max range |
| `EcucIntegerParamDef` >32-bit | `uint64` | |
| `EcucFloatParamDef` | `float32` / `float64` | Per precision requirement |
| `EcucBooleanParamDef` | `uint8` (0/1) | No `<stdbool.h>` (MISRA) |
| `EcucStringParamDef` | `const char*` | Default |
| `EcucEnumerationParamDef` | `uint8` + `EcuC_XType` enum typedef | |
| `EcucReferenceValue` | `const TargetType * const` | |
| `EcucFunctionNameDef` | `void (*)(void)` | Typedef'd function pointer |

### Container

```c
typedef struct {
    uint16  EcuC_PartitionConfigId;
    uint8   EcuC_PartitionBootPriority;
    EcuC_PartitionType EcuC_PartitionType;
} EcuC_PartitionConfigType;

CONST(EcuC_PartitionConfigType, AUTOMATIC)
EcuC_PartitionConfig[3] = {
    { .EcuC_PartitionConfigId = 0, .EcuC_PartitionBootPriority = 1, .EcuC_PartitionType = 0 },
    { .EcuC_PartitionConfigId = 1, .EcuC_PartitionBootPriority = 2, .EcuC_PartitionType = 1 },
    { .EcuC_PartitionConfigId = 2, .EcuC_PartitionBootPriority = 3, .EcuC_PartitionType = 0 },
};
```

Order: by ECUC `<INDEX>` ascending, fallback shortName lexical
(decision G). Ordering violation → WARNING.

### Choice Container (Approach A — `#ifdef`)

The `#ifdef` macro name is **configurable per module**; modules declare
their choice macros in a small JSON/YAML sidecar
(`src/core/generator/modules/<mod>/choices.json`) loaded at generator
registration time. Default fallback: `<MODULE>_<CHOICE_NAME>`.

Illustrative EcuC example:

```c
#ifdef EcuC_USE_OS_PARTITION
  CONST(EcuC_OsPartitionType, AUTOMATIC) EcuC_OsPartition = { ... };
#else
  CONST(EcuC_RomPartitionType, AUTOMATIC) EcuC_RomPartition = { ... };
#endif
```

Approach B (parallel always-emitted structs + runtime selection) deferred
to v2 (decision H).

### Reference

```c
/* In EcuC_Cfg.h */
#include "Mcu.h"

/* In EcuC_Cfg.c */
extern CONST(Mcu_ClockConfigType, AUTOMATIC) Mcu_ClockConfig_0;
CONST(Mcu_ClockConfigType * const, AUTOMATIC) EcuC_RefToMcuClock = &Mcu_ClockConfig_0;
```

Reference integrity is validated in pre-process (target path must exist in
some module's values). Failure → ERROR (decision I).

## Template Engine

Handlebars (already a renderer dep, no new package). Helpers registered in
`src/core/generator/handlebars-helpers.ts`, **separate from** renderer
helpers to keep coupling minimal.

| Helper | Signature | Returns |
|---|---|---|
| `cIdent` | `(path: string) => string` | Legal C identifier (`/` → `_`) |
| `cType` | `(def: BswmdParamDef) => string` | C typedef name |
| `cValue` | `(value: EcucValue, def: BswmdParamDef) => string` | C literal |
| `paramConfigClass` | `(def, variant) => 'PreCompile'\|'Link'\|'PostBuild'` | Active class |
| `bswmdPathOf` | `(instance: EcucValueInstance) => string` | Dotted BSWMD path |
| `partitionName` | `(name: string) => string` | C-safe partition id |

All helpers pure functions, 100% branch coverage required.

Partials (`src/core/generator/templates/_partials/`):

| Partial | Purpose |
|---|---|
| `license.h.hbs` | Project license header (committed file, copyright editable) |
| `header_guard.h.hbs` | Standard `#ifndef X / #define X / #endif` wrapper |
| `c_decl.h.hbs` | Shared C declaration patterns |

## Diagnostic Channel

```typescript
// src/core/generator/diagnostics.ts

export const DiagnosticSeverity = {
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  INFO: 'INFO',
} as const;

export const DiagnosticCode = {
  ECUC_GEN_NO_SCHEMA:           'ECUC-GEN-001',  // WARN — BSWMD missing the module
  ECUC_GEN_NO_GENERATOR:        'ECUC-GEN-002',  // WARN — Registry missing the generator
  ECUC_GEN_THROW:               'ECUC-GEN-003',  // ERROR — Generator threw
  ECUC_GEN_REF_UNRESOLVED:      'ECUC-GEN-010',  // ERROR — Reference target missing
  ECUC_GEN_MULTIPLICITY:        'ECUC-GEN-011',  // ERROR — Instance count out of bounds
  ECUC_GEN_TYPE_MISMATCH:       'ECUC-GEN-012',  // ERROR — Value vs def type
  ECUC_GEN_RANGE:               'ECUC-GEN-013',  // ERROR — Value out of min/max
  ECUC_GEN_ORDERING:            'ECUC-GEN-020',  // WARN — Container ordering violation
  ECUC_GEN_DUPLICATE_SHORTNAME: 'ECUC-GEN-021',  // ERROR — Duplicate shortName in module
  ECUC_GEN_TEMPLATE_RENDER:     'ECUC-GEN-030',  // ERROR — Handlebars render failed
  ECUC_GEN_OUTPUT_WRITE:        'ECUC-GEN-031',  // ERROR — File write failed
  ECUC_GEN_INFO_EMPTY_VARIANT:  'ECUC-GEN-INFO-001', // INFO — no elements for active variant
} as const;

export interface Diagnostic {
  readonly severity: typeof DiagnosticSeverity[keyof typeof DiagnosticSeverity];
  readonly code: typeof DiagnosticCode[keyof typeof DiagnosticCode];
  readonly moduleShortName?: string;
  readonly bswmdPath?: string;
  readonly ecucPath?: string;
  readonly line?: number;
  readonly message: string;
}
```

CLI behavior:

- Any ERROR → `process.exitCode = 1`
- Only WARNINGs → `exitCode = 0`
- `--strict` flag: all WARNING → ERROR
- `--format json` outputs JSON array of all diagnostics (for CI)

## CLI Sub-Command

```bash
claude-autosarcfg generate \
  --project <path> \
  --variant PreCompile|Link|PostBuild \
  --out <dir> \
  [--module <name>] [--module <name>] \
  [--strict] [--format human|json] \
  [--browse-templates]
```

| Flag | Default | Notes |
|---|---|---|
| `--project` | (required) | Path to `.acproj` |
| `--variant` | `PreCompile` | Decision A |
| `--out` | `<project>/generated/` | Directory for emitted artifacts |
| `--module` | all | Filter to subset (MVP: equivalent to EcuC only) |
| `--strict` | off | Decision K |
| `--format` | `human` | `human` or `json` |
| `--browse-templates` | off | Dev mode: dump merged template output to stderr |

Sits alongside existing `validate`, `extract`, `sws` sub-commands in
`src/cli/commands/`.

## Testing Strategy

| Layer | Test count target | Tool | Coverage goal |
|---|---|---|---|
| Unit (helpers) | ~30 | vitest | 100% branch |
| Unit (emit strategy) | ~15 | vitest | 100% branch |
| Unit (normalize) | ~15 | vitest | 100% branch |
| Integration (EcuC pipeline) | ~10 | vitest | happy path + 3+ diagnostic codes |
| **Snapshot** (EcuC, golden Cfg.c/h) | 6 (3 fixtures × 2 variants) | vitest snapshot | byte-stable output |
| Diagnostic fixture | ~10 (1 per DiagnosticCode) | vitest | every code triggered by exactly one fixture |
| CLI | ~5 | spawn node CLI | argv parsing + exit code |

Total target: ~85 new tests, ≥80% line coverage on `core/generator/`
package (project floor per `common/testing.md`).

### Snapshot test layout

```
testdata/generator/
├── ecuc-bswmd.arxml           # EcuC schema (minimal subset)
├── ecuc-bswcfg.arxml          # sample values
├── ecuc-bswcfg-mixed.arxml    # mixed PreCompile + PostBuild
├── ecuc-bswcfg-refs.arxml     # with cross-module reference to Mcu
└── ecuc-expected/
    ├── PreCompile-1/
    │   ├── EcuC_Cfg.c
    │   ├── EcuC_Cfg.h
    │   └── (no PBcfg.c)
    ├── PostBuild-1/
    │   ├── EcuC_Cfg.c
    │   ├── EcuC_Cfg.h
    │   └── EcuC_PBcfg.c
    └── Refs-1/
        ├── EcuC_Cfg.c       # contains `&Mcu_ClockConfig_0`
        └── EcuC_Cfg.h       # contains `#include "Mcu.h"`
```

Snapshots committed to repo; CI fails on diff (decision J).

### Diagnostic fixture test

Each `DiagnosticCode` enum value gets at least one `*.arxml` fixture under
`testdata/generator/diagnostics/<code>/` that triggers it. Test asserts the
specific code appears with the expected severity in `Diagnostic[]`.

## File Layout

```
src/core/generator/
├── index.ts                  # public API (exports normalize, registry, pipeline)
├── pipeline.ts               # orchestrator: pre/generate/post
├── registry.ts               # GeneratorRegistry + interfaces
├── normalize.ts              # pre-process: BSWMD + BSWCFG → NormalizedConfigTree
├── emit/
│   ├── strategy.ts           # configClass × isArray → C emit
│   ├── types.ts              # ECUC type → C type
│   ├── container.ts          # container emit (order, naming)
│   ├── choice.ts             # choice emit (#ifdef)
│   └── reference.ts          # reference emit + integrity
├── diagnostics.ts            # Diagnostic type + codes
├── handlebars-helpers.ts     # pure helpers
├── templates/
│   ├── _partials/
│   │   ├── license.h.hbs
│   │   ├── header_guard.h.hbs
│   │   └── c_decl.h.hbs
│   └── ecuc/
│       ├── cfg.h.hbs
│       ├── cfg.c.hbs
│       └── pbcfg.c.hbs
└── modules/
    └── ecuc.ts               # EcuCGenerator

tests/core/generator/         # ~85 tests
testdata/generator/           # fixtures + snapshots

src/cli/commands/
└── generate.ts               # CLI sub-command entrypoint
```

Estimated size: ~800 lines TS (excluding templates) + ~250 lines .hbs
templates + ~85 tests + ~10 fixture files.

## Acceptance Criteria

1. `pnpm test tests/core/generator/` passes all ~85 tests with ≥80% line
   coverage on `src/core/generator/**`
2. `pnpm verify` (project's full 7-stage pipeline from v1.7.3+) passes with
   no new type errors, lint errors, or build failures
3. Running `claude-autosarcfg generate --project <test-project>` against
   the bundled `testdata/generator/ecuc-*` fixtures produces output
   **byte-identical** to committed snapshots
4. Each `DiagnosticCode` enum value has at least one fixture that triggers
   it; running against that fixture produces the expected diagnostic
5. `--strict` flag toggles WARNING → ERROR behavior as documented
6. `--format json` outputs valid JSON parseable by `JSON.parse`
7. CLI exits with code 1 when any ERROR is produced, code 0 otherwise

## Out-of-Scope (Future Work)

| Item | Sprint target | Rationale |
|---|---|---|
| Mcu / Port / Dio generators | v1.10.0+ | Each module is its own sprint; validates registry extension |
| Renderer-side "Generate" button + IPC | v1.11.0+ | Reuses this core via existing IPC pattern |
| Post-build binary blob format | v1.12.0+ | Standard mandates C interface; binary is open design |
| RTE generator | v2.0+ | Separate domain; bigger scope |
| Dynamic plugin loader from npm | v2.0+ | Only if/when third parties need to ship generators |
| BSWMD `GENERATION-INFO` extension | v2.0+ | Vendor-specific metadata; would require spec coordination |
| EB tresos / ETAS byte-compat | v2.0+ | Would need vendor docs; only valuable for migration workflows |

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `clang-format` not available on CI | Vendor binary via project-local tool; verify in `pnpm verify` stage 7 |
| Snapshot drift on C formatter upgrade | Pin `clang-format` version; documented in `docs/build-deps.md` |
| Handlebars escape behavior in C strings | Tests include string with `"`, `\`, and embedded `{{` literals |
| Cross-module reference circular (A→B→A) | Pre-process walks reference graph; circular → ERROR with cycle path |
| Snapshot file churn on whitespace | `clang-format` runs deterministically; CI smoke test on Linux + Windows |
| User passes `--variant` value that no module supports | Pre-process filters; missing variant → WARNING per module |

## References

- AUTOSAR MMOD R22-11: `https://www.autosar.org/fileadmin/standards/foundation/22-11/AUTOSAR_MMOD_ECUConfiguration.pdf`
- Project rules: `~/.claude/rules/ecc/common/testing.md` (80% coverage floor),
  `~/.claude/rules/ecc/common/coding-style.md` (immutability + KISS)
- Web rules: `~/.claude/rules/ecc/web/hooks.md` (project-local formatter hook)
- Sprint 14 Final (headless CLI v1): `docs/superpowers/specs/2026-06-20-sprint-14-final.md`
