# BSW Code Generator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `generate` sub-command to the headless CLI that emits BSW
configuration C source code (Cfg.c / Cfg.h / PBcfg.c) from ECUC values +
BSWMD schemas, with EcuC as the MVP demo module.

**Architecture:** Three-stage pipeline (pre-process → generate →
post-process) backed by a `GeneratorRegistry` (TS class static
registration), pure-function `ModuleGenerator.emit()`, Handlebars
templates for C source emission, and a single `Diagnostic[]` channel
shared across all stages. New `src/core/generator/` package; new
`src/cli/handlers/generate.ts` handler that dispatches via existing
`command-dispatcher.ts`.

**Tech Stack:** TypeScript (ES2022, strict mode), vitest (already in
project), Handlebars (renderer dep, reused), `fast-xml-parser` (already
in project for BSWMD/ECUC parsing), existing `LoadProject` for BSWMD
loading.

**Reference Spec:** `docs/superpowers/specs/2026-06-24-bsw-code-generator-design.md`

---

## Global Constraints

- **TypeScript strict**: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — every array access narrows; optional props use `?:` or `| undefined` explicitly
- **C99 output**: no `_Atomic`, `_Generic`, `stdbool.h`, or compound literals
- **Test framework**: vitest, colocated as `__tests__/*.test.ts` next to source (project pattern)
- **Coverage floor**: ≥80% line coverage on `src/core/generator/**` (project floor per `common/testing.md`)
- **CLI exit codes** (project convention `src/cli/exitCodes.ts`):
  - `0` = EXIT_SUCCESS (clean)
  - `1` = EXIT_FATAL (any ERROR diagnostic)
  - `2` = EXIT_WARNING (only WARNING diagnostics)
  - `3` = EXIT_INVALID_INPUT (bad argv / unsupported variant)
  - `--strict` flag promotes WARNING → ERROR (exit code 1 instead of 2)
- **No mutation**: all helper inputs are `Readonly<>`; emit returns fresh objects
- **Pure functions**: every `ModuleGenerator.emit()` MUST be deterministic
  (same `(def, values, ctx)` → same artifacts)
- **Templates are partial-fenced**: Handlebars templates use `{{> partialName}}` syntax with no in-template string concatenation
- **Atomic file write**: post-process uses temp-file + rename pattern; no in-place edits
- **Commit messages** follow `<type>: <description>` convention (feat, fix, test, docs, chore, refactor)

## Implementation Notes (deferred from MVP)

These items are part of the spec but **not** enforced in the MVP.
The structure is in place so v2+ can add them without redesign:

1. **BswImplementation filter** (spec invariant 3) — `NormalizedConfigTree.implByModule`
   is built but `runPipeline` does not check that a module's schema is
   eligible for the active BswImplementation. v2 adds an early `validateImpls()`
   step that emits `ECUC-GEN-013` for ineligible modules.
2. **clang-format integration** (spec stage 3) — post-process uses raw
   `writeOutputTree` without formatting. v2 shells out to a project-local
   `clang-format` binary behind a feature flag.
3. **Variant with no elements** — emits an INFO diagnostic
   `ECUC-GEN-INFO-001` but does not push it from MVP emit path. v2 adds
   the empty-detection logic in `EcuCGenerator.emit()`.
4. **Task 18's diagnostic fixture tests** — task writes 3 explicit tests;
   the remaining 9 follow the same pattern with their fixtures from
   `testdata/generator/diagnostics/<code>/`. The implementer writes
   one test per code; do not skip this — every code MUST be triggered
   by a fixture (acceptance gate).

---

## File Structure

```
src/core/generator/
├── index.ts                       # public API: re-exports pipeline, registry, normalize
├── diagnostics.ts                 # Diagnostic type + Severity + Code enum (12 codes)
├── registry.ts                    # GeneratorRegistry + interfaces
├── handlebars.ts                  # createEngine() — shared Handlebars instance + helper registration
├── handlebars-helpers.ts          # pure helpers: cIdent, cType, cValue, paramConfigClass, bswmdPathOf, partitionName
├── normalize.ts                   # pre-process: BSWMD + BSWCFG → NormalizedConfigTree
├── pipeline.ts                    # orchestrator: pre-process → generate → post-process
├── post-process.ts                # format (clang-format) + atomic write
├── choices-loader.ts              # load choices.json sidecar
├── emit/
│   ├── strategy.ts                # configClass × isArray → C (3 helpers: emitConstDecl, emitExternDecl, emitLoaderEntry)
│   ├── types.ts                   # ECUC type → C type (typeToCType)
│   ├── container.ts               # container emit (sortByIndex + emitContainerDecl)
│   ├── choice.ts                  # choice emit (#ifdef via loadChoiceMacros + emitChoiceBranch)
│   └── reference.ts               # reference integrity check + emitReferenceDecl
├── templates/
│   ├── _partials/
│   │   ├── license.h.hbs
│   │   ├── header_guard.h.hbs
│   │   └── c_decl.h.hbs
│   └── ecuc/
│       ├── cfg.h.hbs              # EcuC_Cfg.h
│       ├── cfg.c.hbs              # EcuC_Cfg.c
│       └── pbcfg.c.hbs            # EcuC_PBcfg.c
└── modules/
    └── ecuc.ts                    # EcuCGenerator (ModuleGenerator impl)

src/core/generator/__tests__/      # colocated vitest specs (one per source file)
├── diagnostics.test.ts
├── registry.test.ts
├── handlebars-helpers.test.ts
├── handlebars.test.ts
├── normalize.test.ts
├── pipeline.test.ts
├── post-process.test.ts
├── emit-strategy.test.ts
├── emit-types.test.ts
├── emit-container.test.ts
├── emit-choice.test.ts
├── emit-reference.test.ts
├── ecuc.test.ts                   # happy path
├── ecuc.snapshot.test.ts          # golden file compare (6 fixtures)
└── ecuc.diagnostic.test.ts        # one fixture per DiagnosticCode

src/cli/handlers/
└── generate.ts                    # generateHeadlessProject + GenerateArgs/Result types

src/cli/command-dispatcher.ts      # MODIFIED: add generate handler import + case

src/shared/headless/ipc-contract.ts # MODIFIED: add GenerateArgs + GenerateResult types

testdata/generator/
├── ecuc-bswmd.arxml               # EcuC schema (minimal)
├── ecuc-bswcfg-1.arxml            # PreCompile only
├── ecuc-bswcfg-mixed.arxml        # PreCompile + PostBuild mix
├── ecuc-bswcfg-refs.arxml         # with cross-module reference
├── ecuc-expected/                 # golden snapshot files
│   ├── PreCompile-1/
│   │   ├── EcuC_Cfg.c
│   │   └── EcuC_Cfg.h
│   ├── Mixed-1/
│   │   ├── EcuC_Cfg.c
│   │   ├── EcuC_Cfg.h
│   │   └── EcuC_PBcfg.c
│   └── Refs-1/
│       ├── EcuC_Cfg.c
│       └── EcuC_Cfg.h
└── diagnostics/
    └── <code>/*.arxml             # one fixture per DiagnosticCode
```

---

## Task 1: Diagnostic channel — type, severity, code enum

**Files:**

- Create: `src/core/generator/diagnostics.ts`
- Create: `src/core/generator/__tests__/diagnostics.test.ts`

**Interfaces:**

- Produces: `Diagnostic` type, `DiagnosticSeverity` const, `DiagnosticCode` const — used by all later tasks

- [ ] **Step 1: Write the failing test**

```ts
// src/core/generator/__tests__/diagnostics.test.ts
import { describe, it, expect } from 'vitest';
import { DiagnosticSeverity, DiagnosticCode, type Diagnostic } from '../diagnostics.js';

describe('DiagnosticSeverity', () => {
  it('exposes ERROR / WARNING / INFO', () => {
    expect(DiagnosticSeverity.ERROR).toBe('ERROR');
    expect(DiagnosticSeverity.WARNING).toBe('WARNING');
    expect(DiagnosticSeverity.INFO).toBe('INFO');
  });
});

describe('DiagnosticCode', () => {
  it('exposes the 12 documented codes', () => {
    expect(DiagnosticCode.ECUC_GEN_NO_SCHEMA).toBe('ECUC-GEN-001');
    expect(DiagnosticCode.ECUC_GEN_NO_GENERATOR).toBe('ECUC-GEN-002');
    expect(DiagnosticCode.ECUC_GEN_THROW).toBe('ECUC-GEN-003');
    expect(DiagnosticCode.ECUC_GEN_REF_UNRESOLVED).toBe('ECUC-GEN-010');
    expect(DiagnosticCode.ECUC_GEN_MULTIPLICITY).toBe('ECUC-GEN-011');
    expect(DiagnosticCode.ECUC_GEN_TYPE_MISMATCH).toBe('ECUC-GEN-012');
    expect(DiagnosticCode.ECUC_GEN_RANGE).toBe('ECUC-GEN-013');
    expect(DiagnosticCode.ECUC_GEN_ORDERING).toBe('ECUC-GEN-020');
    expect(DiagnosticCode.ECUC_GEN_DUPLICATE_SHORTNAME).toBe('ECUC-GEN-021');
    expect(DiagnosticCode.ECUC_GEN_TEMPLATE_RENDER).toBe('ECUC-GEN-030');
    expect(DiagnosticCode.ECUC_GEN_OUTPUT_WRITE).toBe('ECUC-GEN-031');
    expect(DiagnosticCode.ECUC_GEN_INFO_EMPTY_VARIANT).toBe('ECUC-GEN-INFO-001');
  });
});

describe('Diagnostic', () => {
  it('is constructible with required fields only', () => {
    const d: Diagnostic = {
      severity: DiagnosticSeverity.ERROR,
      code: DiagnosticCode.ECUC_GEN_THROW,
      message: 'oops',
    };
    expect(d.severity).toBe('ERROR');
    expect(d.code).toBe('ECUC-GEN-003');
    expect(d.moduleShortName).toBeUndefined();
    expect(d.bswmdPath).toBeUndefined();
    expect(d.ecucPath).toBeUndefined();
    expect(d.line).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/generator/__tests__/diagnostics.test.ts`
Expected: FAIL with "Cannot find module '../diagnostics.js'"

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/generator/diagnostics.ts

export const DiagnosticSeverity = {
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  INFO: 'INFO',
} as const;

export const DiagnosticCode = {
  ECUC_GEN_NO_SCHEMA: 'ECUC-GEN-001',
  ECUC_GEN_NO_GENERATOR: 'ECUC-GEN-002',
  ECUC_GEN_THROW: 'ECUC-GEN-003',
  ECUC_GEN_REF_UNRESOLVED: 'ECUC-GEN-010',
  ECUC_GEN_MULTIPLICITY: 'ECUC-GEN-011',
  ECUC_GEN_TYPE_MISMATCH: 'ECUC-GEN-012',
  ECUC_GEN_RANGE: 'ECUC-GEN-013',
  ECUC_GEN_ORDERING: 'ECUC-GEN-020',
  ECUC_GEN_DUPLICATE_SHORTNAME: 'ECUC-GEN-021',
  ECUC_GEN_TEMPLATE_RENDER: 'ECUC-GEN-030',
  ECUC_GEN_OUTPUT_WRITE: 'ECUC-GEN-031',
  ECUC_GEN_INFO_EMPTY_VARIANT: 'ECUC-GEN-INFO-001',
} as const;

export type DiagnosticSeverityValue = (typeof DiagnosticSeverity)[keyof typeof DiagnosticSeverity];

export type DiagnosticCodeValue = (typeof DiagnosticCode)[keyof typeof DiagnosticCode];

export interface Diagnostic {
  readonly severity: DiagnosticSeverityValue;
  readonly code: DiagnosticCodeValue;
  readonly moduleShortName?: string;
  readonly bswmdPath?: string;
  readonly ecucPath?: string;
  readonly line?: number;
  readonly message: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/core/generator/__tests__/diagnostics.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/generator/diagnostics.ts src/core/generator/__tests__/diagnostics.test.ts
git commit -m "feat(generator): Diagnostic channel types + 12 codes"
```

---

## Task 2: GeneratorRegistry — interfaces + register/get

**Files:**

- Create: `src/core/generator/registry.ts`
- Create: `src/core/generator/__tests__/registry.test.ts`

**Interfaces:**

- Produces: `GenerationContext`, `GeneratedArtifact`, `ModuleGenerator` types + `registerGenerator()` and `getGenerator()` functions — used by all generator code

- [ ] **Step 1: Write the failing test**

```ts
// src/core/generator/__tests__/registry.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerGenerator,
  getGenerator,
  type ModuleGenerator,
  type GeneratedArtifact,
} from '../registry.js';
import { Diagnostic } from '../diagnostics.js';

class StubGen implements ModuleGenerator {
  readonly moduleShortName: string;
  constructor(name: string) {
    this.moduleShortName = name;
  }
  emit(): readonly GeneratedArtifact[] {
    return [];
  }
}

beforeEach(() => {
  // Reset module-level registry by re-importing. Cheap hack for tests:
  // dynamically import a fresh copy via the test runner's isolation.
});

describe('registerGenerator / getGenerator', () => {
  it('registers and retrieves a generator by shortName', () => {
    registerGenerator(new StubGen('EcuC'));
    const g = getGenerator('EcuC');
    expect(g).toBeDefined();
    expect(g!.moduleShortName).toBe('EcuC');
  });

  it('returns undefined for unknown shortName', () => {
    expect(getGenerator('NotRegistered')).toBeUndefined();
  });

  it('throws when registering duplicate shortName', () => {
    registerGenerator(new StubGen('Dup'));
    expect(() => registerGenerator(new StubGen('Dup'))).toThrow(/already registered/);
  });
});
```

Note: registry is module-level state. For test isolation, prefer
`describe.concurrent.skip` if running in parallel. The simplest fix is to
add a `_resetForTest()` export; do that in this same task.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/generator/__tests__/registry.test.ts`
Expected: FAIL with "Cannot find module '../registry.js'"

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/generator/registry.ts
import type { Diagnostic } from './diagnostics.js';

export type GenerationVariant = 'PreCompile' | 'Link' | 'PostBuild';

export interface GenerationContext {
  readonly variant: GenerationVariant;
  readonly bswmdIndex: ReadonlyMap<string, unknown>; // narrowed by normalize task
  readonly implByModule: ReadonlyMap<string, string>;
  readonly outDir: string;
  readonly diagnostics: Diagnostic[];
}

export interface GeneratedArtifact {
  readonly path: string;
  readonly content: string;
}

export interface ModuleGenerator {
  readonly moduleShortName: string;
  emit(def: unknown, values: unknown, ctx: GenerationContext): readonly GeneratedArtifact[];
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

/** Test-only: clear all registered generators. */
export function _resetRegistryForTest(): void {
  generators.clear();
}
```

- [ ] **Step 4: Update test to use reset between cases**

Edit `src/core/generator/__tests__/registry.test.ts` — add to imports:

```ts
import { _resetRegistryForTest } from '../registry.js';
```

Replace the `beforeEach` body:

```ts
beforeEach(() => {
  _resetRegistryForTest();
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/core/generator/__tests__/registry.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/core/generator/registry.ts src/core/generator/__tests__/registry.test.ts
git commit -m "feat(generator): GeneratorRegistry + interfaces (test-isolated)"
```

---

## Task 3: Handlebars engine setup + cIdent helper

**Files:**

- Create: `src/core/generator/handlebars.ts`
- Create: `src/core/generator/handlebars-helpers.ts`
- Create: `src/core/generator/__tests__/handlebars-helpers.test.ts`
- Create: `src/core/generator/__tests__/handlebars.test.ts`

**Interfaces:**

- Produces: `createEngine()` function, `cIdent(path)` helper — used by all template rendering

- [ ] **Step 1: Write the failing test for cIdent**

```ts
// src/core/generator/__tests__/handlebars-helpers.test.ts
import { describe, it, expect } from 'vitest';
import { cIdent } from '../handlebars-helpers.js';

describe('cIdent', () => {
  it('joins slash-separated path with underscores', () => {
    expect(cIdent('Mcu/Clock/ClockDivider')).toBe('Mcu_Clock_ClockDivider');
  });

  it('replaces dashes with underscores', () => {
    expect(cIdent('EcuC-PartitionConfig')).toBe('EcuC_PartitionConfig');
  });

  it('replaces dots with underscores', () => {
    expect(cIdent('Mcu.Clock.Divider')).toBe('Mcu_Clock_Divider');
  });

  it('strips leading/trailing whitespace', () => {
    expect(cIdent('  EcuC  ')).toBe('EcuC');
  });

  it('preserves already-valid identifiers unchanged', () => {
    expect(cIdent('EcuC_Partition_0')).toBe('EcuC_Partition_0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/generator/__tests__/handlebars-helpers.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal cIdent implementation**

```ts
// src/core/generator/handlebars-helpers.ts

/**
 * Convert an ECUC-style path into a legal C identifier.
 * - `/`, `-`, `.`, `:` → `_`
 * - Trims whitespace
 * - Collapses runs of `_`
 * Returns '' for empty input.
 */
export function cIdent(path: string): string {
  return path
    .trim()
    .replace(/[\/\-.:]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/core/generator/__tests__/handlebars-helpers.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Write the engine test**

```ts
// src/core/generator/__tests__/handlebars.test.ts
import { describe, it, expect } from 'vitest';
import { createEngine } from '../handlebars.js';
import Handlebars from 'handlebars';

describe('createEngine', () => {
  it('returns a Handlebars instance with cIdent registered', () => {
    const engine = createEngine();
    const tpl = engine.compile('{{cIdent path}}');
    expect(tpl({ path: 'Mcu/Clock/Div' })).toBe('Mcu_Clock_Div');
  });

  it('reuses the same helpers across compilations', () => {
    const engine = createEngine();
    const tpl1 = engine.compile('{{cIdent a}}');
    const tpl2 = engine.compile('[{{cIdent b}}]');
    expect(tpl1({ a: 'X/Y' })).toBe('X_Y');
    expect(tpl2({ b: 'Z' })).toBe('[Z]');
  });

  it('throws if used with the bare Handlebars import (helpers not registered)', () => {
    const bare = Handlebars.create();
    const tpl = bare.compile('{{cIdent path}}');
    // bare Handlebars returns '' for unknown helpers (Handlebars default)
    // — this test confirms createEngine is the right entry point.
    expect(tpl({ path: 'X' })).toBe('');
  });
});
```

- [ ] **Step 6: Run engine test to verify it fails**

Run: `pnpm test src/core/generator/__tests__/handlebars.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 7: Write engine implementation**

```ts
// src/core/generator/handlebars.ts
import Handlebars from 'handlebars';
import { cIdent } from './handlebars-helpers.js';

/**
 * Create a fresh Handlebars instance with generator-specific helpers
 * registered. The renderer uses its own Handlebars instance via the
 * renderer package; we keep a separate one here to avoid coupling.
 */
export function createEngine(): typeof Handlebars {
  const engine = Handlebars.create();
  engine.registerHelper('cIdent', (path: unknown) => cIdent(String(path ?? '')));
  return engine;
}
```

- [ ] **Step 8: Run all generator tests so far**

Run: `pnpm test src/core/generator/`
Expected: PASS (8 tests across 3 files)

- [ ] **Step 9: Commit**

```bash
git add src/core/generator/handlebars.ts src/core/generator/handlebars-helpers.ts \
        src/core/generator/__tests__/handlebars.test.ts \
        src/core/generator/__tests__/handlebars-helpers.test.ts
git commit -m "feat(generator): Handlebars engine + cIdent helper"
```

---

## Task 4: Handlebars helpers — cType, cValue

**Files:**

- Modify: `src/core/generator/handlebars-helpers.ts`
- Modify: `src/core/generator/__tests__/handlebars-helpers.test.ts`
- Modify: `src/core/generator/handlebars.ts` (register new helpers)

**Interfaces:**

- Produces: `cType(def)` and `cValue(value, def)` — used by EcuC templates

- [ ] **Step 1: Add failing tests**

Append to `src/core/generator/__tests__/handlebars-helpers.test.ts`:

```ts
import { cType, cValue } from '../handlebars-helpers.js';

describe('cType', () => {
  it('maps EcucIntegerParamDef min=0 max=255 to uint8', () => {
    expect(cType({ kind: 'integer', min: 0, max: 255 })).toBe('uint8');
  });

  it('maps min=-128 max=127 to sint8', () => {
    expect(cType({ kind: 'integer', min: -128, max: 127 })).toBe('sint8');
  });

  it('maps min=0 max=65535 to uint16', () => {
    expect(cType({ kind: 'integer', min: 0, max: 65535 })).toBe('uint16');
  });

  it('maps min=0 max=4294967295 to uint32', () => {
    expect(cType({ kind: 'integer', min: 0, max: 4294967295 })).toBe('uint32');
  });

  it('maps larger range to uint64', () => {
    expect(cType({ kind: 'integer', min: 0, max: 4294967296 })).toBe('uint64');
  });

  it('maps EcucBooleanParamDef to uint8', () => {
    expect(cType({ kind: 'boolean' })).toBe('uint8');
  });

  it('maps EcucStringParamDef to const char*', () => {
    expect(cType({ kind: 'string' })).toBe('const char*');
  });

  it('maps EcucFloatParamDef to float32 by default', () => {
    expect(cType({ kind: 'float' })).toBe('float32');
  });

  it('returns ?? for unknown kind', () => {
    expect(cType({ kind: 'mystery' })).toBe('??');
  });
});

describe('cValue', () => {
  it('renders integer literal unchanged', () => {
    expect(cValue(42, { kind: 'integer' })).toBe('42');
  });

  it('renders boolean as 0/1', () => {
    expect(cValue(true, { kind: 'boolean' })).toBe('1');
    expect(cValue(false, { kind: 'boolean' })).toBe('0');
  });

  it('renders string literal with C escaping', () => {
    expect(cValue('hello', { kind: 'string' })).toBe('"hello"');
    expect(cValue('a"b', { kind: 'string' })).toBe('"a\\"b"');
    expect(cValue('a\\b', { kind: 'string' })).toBe('"a\\\\b"');
  });

  it('renders float with 6-digit precision', () => {
    expect(cValue(3.14, { kind: 'float' })).toBe('3.140000f');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/core/generator/__tests__/handlebars-helpers.test.ts`
Expected: FAIL — `cType` and `cValue` not exported

- [ ] **Step 3: Implement cType and cValue**

Append to `src/core/generator/handlebars-helpers.ts`:

```ts
export interface BswmdIntegerParamDef {
  readonly kind: 'integer';
  readonly min?: number;
  readonly max?: number;
}
export interface BswmdBooleanParamDef {
  readonly kind: 'boolean';
}
export interface BswmdStringParamDef {
  readonly kind: 'string';
}
export interface BswmdFloatParamDef {
  readonly kind: 'float';
}
export interface BswmdEnumerationParamDef {
  readonly kind: 'enumeration';
  readonly typeName: string;
}
export interface BswmdReferenceParamDef {
  readonly kind: 'reference';
  readonly targetType: string;
}
export interface BswmdFunctionNameDef {
  readonly kind: 'function-name';
  readonly signature: string;
}
export type BswmdParamDef =
  | BswmdIntegerParamDef
  | BswmdBooleanParamDef
  | BswmdStringParamDef
  | BswmdFloatParamDef
  | BswmdEnumerationParamDef
  | BswmdReferenceParamDef
  | BswmdFunctionNameDef;

export function cType(def: BswmdParamDef): string {
  switch (def.kind) {
    case 'integer': {
      const min = def.min ?? 0;
      const max = def.max ?? 0;
      const unsigned = min >= 0;
      const range = max - min;
      if (!unsigned) {
        if (range <= 127) return 'sint8';
        if (range <= 32767) return 'sint16';
        if (range <= 2147483647) return 'sint32';
        return 'sint64';
      }
      if (range <= 255) return 'uint8';
      if (range <= 65535) return 'uint16';
      if (range <= 4294967295) return 'uint32';
      return 'uint64';
    }
    case 'boolean':
      return 'uint8';
    case 'string':
      return 'const char*';
    case 'float':
      return 'float32';
    case 'enumeration':
      return 'uint8';
    case 'reference':
      return `const ${def.targetType} * const`;
    case 'function-name':
      return def.signature;
    default:
      return '??';
  }
}

export function cValue(value: unknown, def: BswmdParamDef): string {
  switch (def.kind) {
    case 'integer':
      return String(value);
    case 'boolean':
      return value ? '1' : '0';
    case 'string': {
      const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `"${escaped}"`;
    }
    case 'float':
      return `${(value as number).toFixed(6)}f`;
    case 'enumeration':
      return String(value);
    case 'reference':
      return String(value);
    case 'function-name':
      return String(value);
    default:
      return '0';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/core/generator/__tests__/handlebars-helpers.test.ts`
Expected: PASS (all tests, including earlier 5)

- [ ] **Step 5: Register helpers in the engine**

Edit `src/core/generator/handlebars.ts`:

```ts
import Handlebars from 'handlebars';
import { cIdent, cType, cValue } from './handlebars-helpers.js';

export function createEngine(): typeof Handlebars {
  const engine = Handlebars.create();
  engine.registerHelper('cIdent', (path: unknown) => cIdent(String(path ?? '')));
  engine.registerHelper('cType', (def: unknown) => cType(def as never));
  engine.registerHelper('cValue', (value: unknown, def: unknown) => cValue(value, def as never));
  return engine;
}
```

- [ ] **Step 6: Run all generator tests**

Run: `pnpm test src/core/generator/`
Expected: PASS (all tests)

- [ ] **Step 7: Commit**

```bash
git add src/core/generator/handlebars-helpers.ts src/core/generator/handlebars.ts \
        src/core/generator/__tests__/handlebars-helpers.test.ts
git commit -m "feat(generator): cType + cValue helpers (ECUC → C mapping)"
```

---

## Task 5: Handlebars helpers — paramConfigClass, bswmdPathOf, partitionName

**Files:**

- Modify: `src/core/generator/handlebars-helpers.ts`
- Modify: `src/core/generator/__tests__/handlebars-helpers.test.ts`
- Modify: `src/core/generator/handlebars.ts` (register helpers)

- [ ] **Step 1: Add failing tests**

Append to `src/core/generator/__tests__/handlebars-helpers.test.ts`:

```ts
import { paramConfigClass, bswmdPathOf, partitionName } from '../handlebars-helpers.js';
import type { GenerationVariant } from '../registry.js';

describe('paramConfigClass', () => {
  const defWithPair = {
    paramConfigClasses: [
      { configVariant: 'PreCompile', configClass: 'PreCompile' },
      { configVariant: 'Link', configClass: 'Link' },
      { configVariant: 'PostBuild', configClass: 'PostBuild' },
    ],
  };

  it('returns the matching configClass for active variant', () => {
    expect(paramConfigClass(defWithPair, 'PreCompile' as GenerationVariant)).toBe('PreCompile');
    expect(paramConfigClass(defWithPair, 'Link' as GenerationVariant)).toBe('Link');
    expect(paramConfigClass(defWithPair, 'PostBuild' as GenerationVariant)).toBe('PostBuild');
  });

  it('throws when no pair exists for the active variant', () => {
    expect(() =>
      paramConfigClass({ paramConfigClasses: [] }, 'PreCompile' as GenerationVariant),
    ).toThrow(/no configClass/);
  });
});

describe('bswmdPathOf', () => {
  it('joins instance path with slashes', () => {
    expect(bswmdPathOf({ path: ['Mcu', 'Clock', 'Divider'] })).toBe('Mcu/Clock/Divider');
  });

  it('returns empty string for empty path', () => {
    expect(bswmdPathOf({ path: [] })).toBe('');
  });
});

describe('partitionName', () => {
  it('passes through shortName as C identifier', () => {
    expect(partitionName('Partition_0')).toBe('Partition_0');
  });

  it('prefixes with module shortName when bare name given', () => {
    expect(partitionName('EcuC/0')).toBe('EcuC_0');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/core/generator/__tests__/handlebars-helpers.test.ts`
Expected: FAIL — symbols not exported

- [ ] **Step 3: Implement helpers**

Append to `src/core/generator/handlebars-helpers.ts`:

```ts
import type { GenerationVariant } from './registry.js';

export type ConfigClass = 'PreCompile' | 'Link' | 'PostBuild';

export interface BswmdAbstractConfigurationClass {
  readonly configVariant: ConfigClass;
  readonly configClass: ConfigClass;
}

export interface HasParamConfigClasses {
  readonly paramConfigClasses: readonly BswmdAbstractConfigurationClass[];
}

/**
 * Pick the configClass for the active variant.
 * Throws if no pair matches (caller should treat as ERROR diagnostic).
 */
export function paramConfigClass(
  def: HasParamConfigClasses,
  variant: GenerationVariant,
): ConfigClass {
  const match = def.paramConfigClasses.find((p) => p.configVariant === variant);
  if (!match) {
    throw new Error(`no configClass for variant=${variant}`);
  }
  return match.configClass;
}

export function bswmdPathOf(instance: { readonly path: readonly string[] }): string {
  return instance.path.join('/');
}

export function partitionName(name: string): string {
  return cIdent(name);
}
```

- [ ] **Step 4: Register new helpers in engine**

Edit `src/core/generator/handlebars.ts`:

```ts
import Handlebars from 'handlebars';
import {
  cIdent,
  cType,
  cValue,
  paramConfigClass,
  bswmdPathOf,
  partitionName,
  type HasParamConfigClasses,
} from './handlebars-helpers.js';
import type { GenerationVariant } from './registry.js';

export function createEngine(): typeof Handlebars {
  const engine = Handlebars.create();
  engine.registerHelper('cIdent', (path: unknown) => cIdent(String(path ?? '')));
  engine.registerHelper('cType', (def: unknown) => cType(def as never));
  engine.registerHelper('cValue', (value: unknown, def: unknown) => cValue(value, def as never));
  engine.registerHelper('paramConfigClass', (def: unknown, variant: unknown) =>
    paramConfigClass(def as HasParamConfigClasses, variant as GenerationVariant),
  );
  engine.registerHelper('bswmdPathOf', (inst: unknown) =>
    bswmdPathOf(inst as { readonly path: readonly string[] }),
  );
  engine.registerHelper('partitionName', (name: unknown) => partitionName(String(name ?? '')));
  return engine;
}
```

- [ ] **Step 5: Run all generator tests**

Run: `pnpm test src/core/generator/`
Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add src/core/generator/handlebars-helpers.ts src/core/generator/handlebars.ts \
        src/core/generator/__tests__/handlebars-helpers.test.ts
git commit -m "feat(generator): paramConfigClass + bswmdPathOf + partitionName helpers"
```

---

## Task 6: Emit strategy — configClass × isArray → C

**Files:**

- Create: `src/core/generator/emit/strategy.ts`
- Create: `src/core/generator/__tests__/emit-strategy.test.ts`

**Interfaces:**

- Produces: `emitConstDecl(param)`, `emitExternDecl(param)`, `emitLoaderEntry(param)` — used by module generators

- [ ] **Step 1: Write the failing test**

```ts
// src/core/generator/__tests__/emit-strategy.test.ts
import { describe, it, expect } from 'vitest';
import { emitConstDecl, emitExternDecl, emitLoaderEntry } from '../emit/strategy.js';
import { cType, cValue } from '../handlebars-helpers.js';

const intDef = { kind: 'integer', min: 0, max: 255 } as const;
const intArrDef = { kind: 'integer', min: 0, max: 255 } as const;

describe('emitConstDecl (PreCompile)', () => {
  it('emits scalar CONST with type and value', () => {
    const s = emitConstDecl({
      ident: 'EcuC_X',
      def: intDef,
      value: 42,
      isArray: false,
      cType: cType(intDef),
      cValue: cValue(42, intDef),
    });
    expect(s).toBe('CONST(uint8, AUTOMATIC) uint8 EcuC_X = 42;');
  });

  it('emits array CONST with brace-enclosed values', () => {
    const s = emitConstDecl({
      ident: 'EcuC_X',
      def: intArrDef,
      value: [1, 2, 3],
      isArray: true,
      cType: cType(intArrDef),
      cValue: cValue(0, intArrDef),
    });
    expect(s).toBe('CONST(uint8, AUTOMATIC) uint8 EcuC_X[3] = { 1, 2, 3 };');
  });
});

describe('emitExternDecl (Link)', () => {
  it('emits scalar extern', () => {
    const s = emitExternDecl({
      ident: 'EcuC_X',
      cType: cType(intDef),
      isArray: false,
    });
    expect(s).toBe('extern CONST(uint8, AUTOMATIC) uint8 EcuC_X;');
  });

  it('emits array extern with size', () => {
    const s = emitExternDecl({
      ident: 'EcuC_X',
      cType: cType(intArrDef),
      isArray: true,
      arrayLen: 3,
    });
    expect(s).toBe('extern CONST(uint8, AUTOMATIC) uint8 EcuC_X[3];');
  });
});

describe('emitLoaderEntry (PostBuild)', () => {
  it('emits scalar static declaration', () => {
    const s = emitLoaderEntry({
      ident: 'EcuC_X',
      cType: cType(intDef),
      isArray: false,
      value: 42,
    });
    expect(s).toBe('static uint8 EcuC_X;');
  });

  it('emits array static with loader entry line', () => {
    const s = emitLoaderEntry({
      ident: 'EcuC_X',
      cType: cType(intArrDef),
      isArray: true,
      arrayLen: 3,
      offset: 0,
    });
    expect(s).toContain('static uint8 EcuC_X[3];');
    expect(s).toContain('*(uint8*)((uintptr_t)baseAddr + 0x00u) = 42;');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/generator/__tests__/emit-strategy.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement strategy**

```ts
// src/core/generator/emit/strategy.ts

export interface ConstDeclInput {
  readonly ident: string;
  readonly def: unknown;
  readonly value: unknown;
  readonly isArray: boolean;
  readonly cType: string;
  readonly cValue: string;
}

export function emitConstDecl(input: ConstDeclInput): string {
  if (!input.isArray) {
    return `CONST(${input.cType}, AUTOMATIC) ${input.cType} ${input.ident} = ${input.cValue};`;
  }
  const arr = input.value as readonly unknown[];
  const lit = arr.map((v) => String(v)).join(', ');
  return `CONST(${input.cType}, AUTOMATIC) ${input.cType} ${input.ident}[${arr.length}] = { ${lit} };`;
}

export interface ExternDeclInput {
  readonly ident: string;
  readonly cType: string;
  readonly isArray: boolean;
  readonly arrayLen?: number;
}

export function emitExternDecl(input: ExternDeclInput): string {
  if (!input.isArray) {
    return `extern CONST(${input.cType}, AUTOMATIC) ${input.cType} ${input.ident};`;
  }
  return `extern CONST(${input.cType}, AUTOMATIC) ${input.cType} ${input.ident}[${input.arrayLen ?? 0}];`;
}

export interface LoaderEntryInput {
  readonly ident: string;
  readonly cType: string;
  readonly isArray: boolean;
  readonly value?: unknown;
  readonly arrayLen?: number;
  readonly offset?: number;
}

export function emitLoaderEntry(input: LoaderEntryInput): string {
  if (!input.isArray) {
    return `static ${input.cType} ${input.ident};`;
  }
  const offset = (input.offset ?? 0).toString(16).padStart(2, '0');
  return [
    `static ${input.cType} ${input.ident}[${input.arrayLen ?? 0}];`,
    `*(uint8*)((uintptr_t)baseAddr + 0x${offset}u) = ${input.value ?? 0};`,
  ].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/core/generator/__tests__/emit-strategy.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/generator/emit/strategy.ts src/core/generator/__tests__/emit-strategy.test.ts
git commit -m "feat(generator): configClass × isArray emit strategy"
```

---

## Task 7: ECUC type → C type mapping (extracted from cType)

**Files:**

- Create: `src/core/generator/emit/types.ts`
- Create: `src/core/generator/__tests__/emit-types.test.ts`

**Interfaces:**

- Produces: `typeToCType(ecucDef)` — used by container emit (Task 8)

Note: `cType()` in `handlebars-helpers.ts` already handles ECUC → C
mapping. This task extracts a non-helper variant for use in TypeScript
code (not templates). The two must stay in sync; add a comment cross-
referencing.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/generator/__tests__/emit-types.test.ts
import { describe, it, expect } from 'vitest';
import { typeToCType } from '../emit/types.js';

describe('typeToCType', () => {
  it('matches cType() for integer ranges', () => {
    expect(typeToCType({ kind: 'integer', min: 0, max: 255 })).toBe('uint8');
    expect(typeToCType({ kind: 'integer', min: 0, max: 65535 })).toBe('uint16');
    expect(typeToCType({ kind: 'integer', min: 0, max: 4294967295 })).toBe('uint32');
    expect(typeToCType({ kind: 'integer', min: 0, max: 4294967296 })).toBe('uint64');
    expect(typeToCType({ kind: 'integer', min: -128, max: 127 })).toBe('sint8');
  });

  it('handles boolean, string, float, enumeration, reference, function-name', () => {
    expect(typeToCType({ kind: 'boolean' })).toBe('uint8');
    expect(typeToCType({ kind: 'string' })).toBe('const char*');
    expect(typeToCType({ kind: 'float' })).toBe('float32');
    expect(typeToCType({ kind: 'enumeration', typeName: 'EcuC_StateType' })).toBe('uint8');
    expect(typeToCType({ kind: 'reference', targetType: 'Mcu_ClockConfigType' })).toBe(
      'const Mcu_ClockConfigType * const',
    );
    expect(typeToCType({ kind: 'function-name', signature: 'void (*)(void)' })).toBe(
      'void (*)(void)',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/generator/__tests__/emit-types.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement typeToCType**

```ts
// src/core/generator/emit/types.ts
//
// Same logic as `cType()` in handlebars-helpers.ts but callable from
// TypeScript code (not templates). Keep in sync with cType().

import type { BswmdParamDef } from '../handlebars-helpers.js';

export function typeToCType(def: BswmdParamDef): string {
  switch (def.kind) {
    case 'integer': {
      const min = def.min ?? 0;
      const max = def.max ?? 0;
      const unsigned = min >= 0;
      const range = max - min;
      if (!unsigned) {
        if (range <= 127) return 'sint8';
        if (range <= 32767) return 'sint16';
        if (range <= 2147483647) return 'sint32';
        return 'sint64';
      }
      if (range <= 255) return 'uint8';
      if (range <= 65535) return 'uint16';
      if (range <= 4294967295) return 'uint32';
      return 'uint64';
    }
    case 'boolean':
      return 'uint8';
    case 'string':
      return 'const char*';
    case 'float':
      return 'float32';
    case 'enumeration':
      return 'uint8';
    case 'reference':
      return `const ${def.targetType} * const`;
    case 'function-name':
      return def.signature;
    default:
      return '??';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/core/generator/__tests__/emit-types.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/generator/emit/types.ts src/core/generator/__tests__/emit-types.test.ts
git commit -m "feat(generator): typeToCType — ECUC type → C type (TS-side)"
```

---

## Task 8: Container emit + deterministic ordering

**Files:**

- Create: `src/core/generator/emit/container.ts`
- Create: `src/core/generator/__tests__/emit-container.test.ts`

**Interfaces:**

- Produces: `sortByIndex(instances)`, `emitContainerDecl(container)` — used by EcuC generator

- [ ] **Step 1: Write the failing test**

```ts
// src/core/generator/__tests__/emit-container.test.ts
import { describe, it, expect } from 'vitest';
import { sortByIndex, emitContainerDecl, type ContainerInstance } from '../emit/container.js';
import type { BswmdParamDef } from '../handlebars-helpers.js';

describe('sortByIndex', () => {
  it('sorts by INDEX attribute ascending', () => {
    const insts: ContainerInstance[] = [
      { shortName: 'b', index: 2 },
      { shortName: 'a', index: 1 },
      { shortName: 'c', index: 3 },
    ];
    const sorted = sortByIndex(insts);
    expect(sorted.map((i) => i.shortName)).toEqual(['a', 'b', 'c']);
  });

  it('falls back to shortName lexical when INDEX absent', () => {
    const insts: ContainerInstance[] = [{ shortName: 'b' }, { shortName: 'a' }, { shortName: 'c' }];
    const sorted = sortByIndex(insts);
    expect(sorted.map((i) => i.shortName)).toEqual(['a', 'b', 'c']);
  });

  it('handles mixed INDEX/no-INDEX: indexed first, then lexical', () => {
    const insts: ContainerInstance[] = [
      { shortName: 'no-index-1' },
      { shortName: 'indexed-2', index: 2 },
      { shortName: 'indexed-1', index: 1 },
      { shortName: 'no-index-2' },
    ];
    const sorted = sortByIndex(insts);
    // indexed-1, indexed-2 (by index), then no-index-1, no-index-2 (by shortName)
    expect(sorted.map((i) => i.shortName)).toEqual([
      'indexed-1',
      'indexed-2',
      'no-index-1',
      'no-index-2',
    ]);
  });
});

describe('emitContainerDecl', () => {
  it('emits typedef struct with all params', () => {
    const def: BswmdParamDef[] = [
      { kind: 'integer', min: 0, max: 65535 } as BswmdParamDef,
      { kind: 'boolean' } as BswmdParamDef,
    ];
    const s = emitContainerDecl({
      typeName: 'EcuC_PartitionConfigType',
      paramDefs: def,
    });
    expect(s).toContain('typedef struct {');
    expect(s).toContain('uint16 EcuC_PartitionConfig_0;');
    expect(s).toContain('uint8 EcuC_PartitionConfig_1;');
    expect(s).toContain('} EcuC_PartitionConfigType;');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/generator/__tests__/emit-container.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement container emit**

```ts
// src/core/generator/emit/container.ts
import { cType } from '../handlebars-helpers.js';
import type { BswmdParamDef } from '../handlebars-helpers.js';

export interface ContainerInstance {
  readonly shortName: string;
  readonly index?: number;
}

/**
 * Deterministic ordering: indexed first (by INDEX asc), then unindexed
 * (by shortName lexical asc). Stable for snapshot diffs.
 */
export function sortByIndex<T extends ContainerInstance>(instances: readonly T[]): readonly T[] {
  const indexed = instances
    .filter((i) => i.index !== undefined)
    .sort((a, b) => a.index! - b.index!);
  const unindexed = instances
    .filter((i) => i.index === undefined)
    .sort((a, b) => a.shortName.localeCompare(b.shortName));
  return [...indexed, ...unindexed];
}

export interface ContainerDeclInput {
  readonly typeName: string;
  readonly paramDefs: readonly BswmdParamDef[];
}

export function emitContainerDecl(input: ContainerDeclInput): string {
  const fields = input.paramDefs
    .map((def, i) => `    ${cType(def)} ${input.typeName}_${i};`)
    .join('\n');
  return `typedef struct {\n${fields}\n} ${input.typeName};`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/core/generator/__tests__/emit-container.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/generator/emit/container.ts src/core/generator/__tests__/emit-container.test.ts
git commit -m "feat(generator): container emit + deterministic INDEX ordering"
```

---

## Task 9: Choice emit (Approach A: #ifdef) + choices.json loader

**Files:**

- Create: `src/core/generator/emit/choice.ts`
- Create: `src/core/generator/choices-loader.ts`
- Create: `src/core/generator/__tests__/emit-choice.test.ts`
- Create: `src/core/generator/__tests__/choices-loader.test.ts`

**Interfaces:**

- Produces: `loadChoiceMacros(moduleShortName)`, `emitChoiceBranch(...)` — used by EcuC generator

- [ ] **Step 1: Write the failing test for choices-loader**

```ts
// src/core/generator/__tests__/choices-loader.test.ts
import { describe, it, expect } from 'vitest';
import { loadChoiceMacros } from '../choices-loader.js';

describe('loadChoiceMacros', () => {
  it('returns the macro map from a JSON sidecar', () => {
    // Simulated loader — in production this reads from
    // src/core/generator/modules/<mod>/choices.json. For test, we mock.
    const macros = loadChoiceMacros('EcuC');
    expect(macros).toBeDefined();
    expect(typeof macros).toBe('object');
  });

  it('returns empty object for unknown module', () => {
    const macros = loadChoiceMacros('NotRegistered');
    expect(macros).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/generator/__tests__/choices-loader.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement choices-loader (with built-in EcuC defaults)**

```ts
// src/core/generator/choices-loader.ts
//
// Reads `src/core/generator/modules/<moduleShortName>/choices.json`.
// For MVP, returns built-in defaults for known modules so tests pass
// without file I/O. v2 can swap to actual fs reads.

const BUILTIN: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  EcuC: {
    EcucPartitionChoice: 'EcuC_USE_OS_PARTITION',
  },
};

export function loadChoiceMacros(moduleShortName: string): Readonly<Record<string, string>> {
  return BUILTIN[moduleShortName] ?? {};
}
```

- [ ] **Step 4: Run loader test to verify it passes**

Run: `pnpm test src/core/generator/__tests__/choices-loader.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing test for emit-choice**

```ts
// src/core/generator/__tests__/emit-choice.test.ts
import { describe, it, expect } from 'vitest';
import { emitChoiceBranch } from '../emit/choice.js';

describe('emitChoiceBranch', () => {
  it('emits #if MACRO ... #else ... #endif block', () => {
    const s = emitChoiceBranch({
      macroName: 'EcuC_USE_OS_PARTITION',
      ifBranch: 'CONST(EcuC_OsPartitionType, AUTOMATIC) EcuC_OsPartition = { 0 };',
      elseBranch: 'CONST(EcuC_RomPartitionType, AUTOMATIC) EcuC_RomPartition = { 0 };',
    });
    expect(s).toBe(
      [
        '#ifdef EcuC_USE_OS_PARTITION',
        'CONST(EcuC_OsPartitionType, AUTOMATIC) EcuC_OsPartition = { 0 };',
        '#else',
        'CONST(EcuC_RomPartitionType, AUTOMATIC) EcuC_RomPartition = { 0 };',
        '#endif',
      ].join('\n'),
    );
  });

  it('emits #ifndef-only block when elseBranch is null', () => {
    const s = emitChoiceBranch({
      macroName: 'EcuC_USE_OPTIONAL',
      ifBranch: 'uint8 EcuC_Flag = 1;',
      elseBranch: null,
    });
    expect(s).toBe(['#ifndef EcuC_USE_OPTIONAL', 'uint8 EcuC_Flag = 1;', '#endif'].join('\n'));
  });
});
```

- [ ] **Step 6: Run emit-choice test to verify it fails**

Run: `pnpm test src/core/generator/__tests__/emit-choice.test.ts`
Expected: FAIL

- [ ] **Step 7: Implement emitChoiceBranch**

```ts
// src/core/generator/emit/choice.ts

export interface ChoiceBranchInput {
  readonly macroName: string;
  readonly ifBranch: string;
  readonly elseBranch: string | null;
}

export function emitChoiceBranch(input: ChoiceBranchInput): string {
  if (input.elseBranch === null) {
    return `#ifndef ${input.macroName}\n${input.ifBranch}\n#endif`;
  }
  return [`#ifdef ${input.macroName}`, input.ifBranch, '#else', input.elseBranch, '#endif'].join(
    '\n',
  );
}
```

- [ ] **Step 8: Run all tests, then commit**

Run: `pnpm test src/core/generator/`
Expected: PASS

```bash
git add src/core/generator/emit/choice.ts src/core/generator/choices-loader.ts \
        src/core/generator/__tests__/emit-choice.test.ts \
        src/core/generator/__tests__/choices-loader.test.ts
git commit -m "feat(generator): choice emit (#ifdef) + choices.json loader"
```

---

## Task 10: Reference integrity validation + emit

**Files:**

- Create: `src/core/generator/emit/reference.ts`
- Create: `src/core/generator/__tests__/emit-reference.test.ts`

**Interfaces:**

- Produces: `validateReferences(tree)`, `emitReferenceDecl(ref, targetType)` — used by pipeline pre-process + EcuC emit

- [ ] **Step 1: Write the failing test**

```ts
// src/core/generator/__tests__/emit-reference.test.ts
import { describe, it, expect } from 'vitest';
import {
  validateReferences,
  emitReferenceDecl,
  type ReferenceEdge,
  type NormalizedConfigTree,
} from '../emit/reference.js';
import { DiagnosticSeverity, DiagnosticCode } from '../diagnostics.js';

const makeTree = (valuesByModule: Record<string, unknown>): NormalizedConfigTree => ({
  bswmdIndex: new Map(),
  valuesByModule: new Map(Object.entries(valuesByModule)),
  implByModule: new Map(),
  references: [
    {
      sourceModule: 'EcuC',
      sourcePath: 'RefToMcuClock',
      targetModule: 'Mcu',
      targetPath: 'ClockConfig_0',
    },
  ] as ReferenceEdge[],
});

describe('validateReferences', () => {
  it('reports no diagnostics when target exists', () => {
    const tree = makeTree({
      EcuC: { RefToMcuClock: {} },
      Mcu: { ClockConfig_0: {} },
    });
    const diags = validateReferences(tree);
    const errors = diags.filter((d) => d.severity === DiagnosticSeverity.ERROR);
    expect(errors).toHaveLength(0);
  });

  it('reports ECUC-GEN-010 when target module missing', () => {
    const tree = makeTree({ EcuC: { RefToMcuClock: {} } });
    const diags = validateReferences(tree);
    const err = diags.find((d) => d.code === DiagnosticCode.ECUC_GEN_REF_UNRESOLVED);
    expect(err).toBeDefined();
    expect(err!.moduleShortName).toBe('EcuC');
    expect(err!.ecucPath).toBe('RefToMcuClock');
  });

  it('reports ECUC-GEN-010 when target path missing', () => {
    const tree = makeTree({
      EcuC: { RefToMcuClock: {} },
      Mcu: { OtherConfig: {} },
    });
    const diags = validateReferences(tree);
    const err = diags.find((d) => d.code === DiagnosticCode.ECUC_GEN_REF_UNRESOLVED);
    expect(err).toBeDefined();
  });
});

describe('emitReferenceDecl', () => {
  it('emits pointer-to-const-target decl', () => {
    const s = emitReferenceDecl({
      ident: 'EcuC_RefToMcuClock',
      targetIdent: 'Mcu_ClockConfig_0',
      targetType: 'Mcu_ClockConfigType',
    });
    expect(s).toBe(
      'CONST(Mcu_ClockConfigType * const, AUTOMATIC) EcuC_RefToMcuClock = &Mcu_ClockConfig_0;',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/generator/__tests__/emit-reference.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```ts
// src/core/generator/emit/reference.ts
import { DiagnosticSeverity, DiagnosticCode, type Diagnostic } from '../diagnostics.js';

export interface ReferenceEdge {
  readonly sourceModule: string;
  readonly sourcePath: string;
  readonly targetModule: string;
  readonly targetPath: string;
}

export interface NormalizedConfigTree {
  readonly bswmdIndex: ReadonlyMap<string, unknown>;
  readonly valuesByModule: ReadonlyMap<string, unknown>;
  readonly implByModule: ReadonlyMap<string, string>;
  readonly references: readonly ReferenceEdge[];
}

/**
 * Validate that every cross-module reference resolves to an existing
 * target. Returns diagnostics; pushed to ctx.diagnostics by the caller.
 */
export function validateReferences(tree: NormalizedConfigTree): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const ref of tree.references) {
    const targetMod = tree.valuesByModule.get(ref.targetModule);
    if (!targetMod) {
      out.push({
        severity: DiagnosticSeverity.ERROR,
        code: DiagnosticCode.ECUC_GEN_REF_UNRESOLVED,
        moduleShortName: ref.sourceModule,
        ecucPath: ref.sourcePath,
        message: `Reference target module ${ref.targetModule} not loaded`,
      });
      continue;
    }
    const targetContainer = (targetMod as Record<string, unknown>)[ref.targetPath];
    if (targetContainer === undefined) {
      out.push({
        severity: DiagnosticSeverity.ERROR,
        code: DiagnosticCode.ECUC_GEN_REF_UNRESOLVED,
        moduleShortName: ref.sourceModule,
        ecucPath: ref.sourcePath,
        message: `Reference target ${ref.targetModule}/${ref.targetPath} not found in values`,
      });
    }
  }
  return out;
}

export interface ReferenceDeclInput {
  readonly ident: string;
  readonly targetIdent: string;
  readonly targetType: string;
}

export function emitReferenceDecl(input: ReferenceDeclInput): string {
  return `CONST(${input.targetType} * const, AUTOMATIC) ${input.ident} = &${input.targetIdent};`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/core/generator/__tests__/emit-reference.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/generator/emit/reference.ts src/core/generator/__tests__/emit-reference.test.ts
git commit -m "feat(generator): reference integrity validation + emit"
```

---

## Task 11: pre-process — normalizeToTree

**Files:**

- Create: `src/core/generator/normalize.ts`
- Create: `src/core/generator/__tests__/normalize.test.ts`

**Interfaces:**

- Produces: `normalizeToTree(bswmdIndex, ecucValues)` returning `NormalizedConfigTree` — used by pipeline

- [ ] **Step 1: Write the failing test**

```ts
// src/core/generator/__tests__/normalize.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeToTree } from '../normalize.js';
import type { BswmdModuleDef } from '../handlebars-helpers.js';
import type { EcucModuleConfigurationValues } from '../../ecuc/types.js'; // adjust to actual path

const ecucDef: BswmdModuleDef = {
  shortName: 'EcuC',
  paramConfigClasses: [],
  containerConfigClasses: [],
};

const ecucValues = {
  definitionRef: 'EcuC',
  containers: [],
  parameters: [],
  references: [],
} as unknown as EcucModuleConfigurationValues;

describe('normalizeToTree', () => {
  it('builds a tree from BSWMD + ECUC values', () => {
    const tree = normalizeToTree(new Map([['EcuC', ecucDef]]), new Map([['EcuC', ecucValues]]));
    expect(tree.bswmdIndex.get('EcuC')).toBe(ecucDef);
    expect(tree.valuesByModule.get('EcuC')).toBe(ecucValues);
    expect(tree.references).toEqual([]);
  });

  it('collects cross-module references', () => {
    const values = {
      ...ecucValues,
      references: [{ path: 'RefToMcuClock', targetModule: 'Mcu', targetPath: 'ClockConfig_0' }],
    } as unknown as EcucModuleConfigurationValues;
    const tree = normalizeToTree(
      new Map([
        ['EcuC', ecucDef],
        ['Mcu', { ...ecucDef, shortName: 'Mcu' }],
      ]),
      new Map([['EcuC', values]]),
    );
    expect(tree.references).toHaveLength(1);
    expect(tree.references[0]?.targetModule).toBe('Mcu');
  });

  it('warns when values reference an unloaded module', () => {
    const values = {
      ...ecucValues,
      references: [{ path: 'RefToMcuClock', targetModule: 'Mcu', targetPath: 'ClockConfig_0' }],
    } as unknown as EcucModuleConfigurationValues;
    const tree = normalizeToTree(new Map([['EcuC', ecucDef]]), new Map([['EcuC', values]]));
    // Reference still recorded (target existence check happens in validateReferences)
    expect(tree.references).toHaveLength(1);
  });
});
```

Note: the actual `EcucModuleConfigurationValues` type lives in the
project's existing `src/core/ecuc/` types module. Replace the import
path with the project's real path before running.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/generator/__tests__/normalize.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement normalizeToTree**

```ts
// src/core/generator/normalize.ts
import type { ReferenceEdge, NormalizedConfigTree } from './emit/reference.js';

export interface BswmdModuleDefLite {
  readonly shortName: string;
  // Other fields are kept opaque for normalize; consumers narrow via bswmdIndex.
}

/** Project's actual ECUC values type — adjust import to match real path. */
export interface EcucModuleConfigurationValuesInput {
  readonly definitionRef?: string;
  readonly containers?: readonly unknown[];
  readonly parameters?: readonly unknown[];
  readonly references?: readonly {
    readonly path: string;
    readonly targetModule: string;
    readonly targetPath: string;
  }[];
}

export function normalizeToTree(
  bswmdIndex: ReadonlyMap<string, BswmdModuleDefLite>,
  ecucValues: ReadonlyMap<string, EcucModuleConfigurationValuesInput>,
): NormalizedConfigTree {
  const references: ReferenceEdge[] = [];
  for (const [moduleShortName, values] of ecucValues) {
    for (const ref of values.references ?? []) {
      references.push({
        sourceModule: moduleShortName,
        sourcePath: ref.path,
        targetModule: ref.targetModule,
        targetPath: ref.targetPath,
      });
    }
  }
  return {
    bswmdIndex: bswmdIndex as ReadonlyMap<string, unknown>,
    valuesByModule: ecucValues as ReadonlyMap<string, unknown>,
    implByModule: new Map(),
    references,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/core/generator/__tests__/normalize.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/generator/normalize.ts src/core/generator/__tests__/normalize.test.ts
git commit -m "feat(generator): normalizeToTree — pre-process BSWMD + ECUC values"
```

---

## Task 12: Pipeline orchestrator (3-stage)

**Files:**

- Create: `src/core/generator/pipeline.ts`
- Create: `src/core/generator/__tests__/pipeline.test.ts`

**Interfaces:**

- Produces: `runPipeline(args)` returning `{ exitCode, diagnostics, artifacts }` — used by CLI handler

- [ ] **Step 1: Write the failing test**

```ts
// src/core/generator/__tests__/pipeline.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { runPipeline } from '../pipeline.js';
import {
  registerGenerator,
  _resetRegistryForTest,
  type ModuleGenerator,
  type GeneratedArtifact,
} from '../registry.js';
import { DiagnosticSeverity, DiagnosticCode } from '../diagnostics.js';

class StubGen implements ModuleGenerator {
  readonly moduleShortName = 'Stub';
  emit(): readonly GeneratedArtifact[] {
    return [{ path: 'Stub/Stub_Cfg.c', content: '/* stub */' }];
  }
}

beforeEach(() => {
  _resetRegistryForTest();
  registerGenerator(new StubGen());
});

describe('runPipeline', () => {
  it('returns exitCode=0 and 1 artifact for a clean run', async () => {
    const result = await runPipeline({
      bswmdIndex: new Map([['Stub', { shortName: 'Stub' }]]),
      ecucValues: new Map([['Stub', {}]]),
      variant: 'PreCompile',
      outDir: '/tmp/out',
      moduleFilter: undefined,
      strict: false,
    });
    expect(result.exitCode).toBe(0);
    expect(result.artifacts.size).toBe(1);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('returns exitCode=0 with WARNING for missing generator', async () => {
    _resetRegistryForTest(); // unregister Stub
    const result = await runPipeline({
      bswmdIndex: new Map([['Stub', { shortName: 'Stub' }]]),
      ecucValues: new Map([['Stub', {}]]),
      variant: 'PreCompile',
      outDir: '/tmp/out',
      moduleFilter: undefined,
      strict: false,
    });
    expect(result.exitCode).toBe(0);
    const warn = result.diagnostics.find((d) => d.code === DiagnosticCode.ECUC_GEN_NO_GENERATOR);
    expect(warn).toBeDefined();
    expect(warn!.severity).toBe(DiagnosticSeverity.WARNING);
  });

  it('returns exitCode=1 with ERROR for generator throw', async () => {
    class ThrowGen implements ModuleGenerator {
      readonly moduleShortName = 'Stub';
      emit(): readonly GeneratedArtifact[] {
        throw new Error('boom');
      }
    }
    _resetRegistryForTest();
    registerGenerator(new ThrowGen());
    const result = await runPipeline({
      bswmdIndex: new Map([['Stub', { shortName: 'Stub' }]]),
      ecucValues: new Map([['Stub', {}]]),
      variant: 'PreCompile',
      outDir: '/tmp/out',
      moduleFilter: undefined,
      strict: false,
    });
    expect(result.exitCode).toBe(1);
    const err = result.diagnostics.find((d) => d.code === DiagnosticCode.ECUC_GEN_THROW);
    expect(err).toBeDefined();
    expect(err!.severity).toBe(DiagnosticSeverity.ERROR);
  });

  it('honors --strict: WARNING becomes exitCode=1', async () => {
    _resetRegistryForTest();
    const result = await runPipeline({
      bswmdIndex: new Map([['Stub', { shortName: 'Stub' }]]),
      ecucValues: new Map([['Stub', {}]]),
      variant: 'PreCompile',
      outDir: '/tmp/out',
      moduleFilter: undefined,
      strict: true,
    });
    expect(result.exitCode).toBe(1);
  });

  it('honors moduleFilter: only runs specified modules', async () => {
    class AGen implements ModuleGenerator {
      readonly moduleShortName = 'A';
      emit(): readonly GeneratedArtifact[] {
        return [{ path: 'A/a.c', content: '' }];
      }
    }
    class BGen implements ModuleGenerator {
      readonly moduleShortName = 'B';
      emit(): readonly GeneratedArtifact[] {
        return [{ path: 'B/b.c', content: '' }];
      }
    }
    _resetRegistryForTest();
    registerGenerator(new AGen());
    registerGenerator(new BGen());
    const result = await runPipeline({
      bswmdIndex: new Map([
        ['A', {}],
        ['B', {}],
      ]),
      ecucValues: new Map([
        ['A', {}],
        ['B', {}],
      ]),
      variant: 'PreCompile',
      outDir: '/tmp/out',
      moduleFilter: ['A'],
      strict: false,
    });
    expect(result.artifacts.size).toBe(1);
    expect(result.artifacts.has('A/a.c')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/generator/__tests__/pipeline.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement pipeline**

```ts
// src/core/generator/pipeline.ts
import { DiagnosticSeverity, DiagnosticCode, type Diagnostic } from './diagnostics.js';
import { normalizeToTree } from './normalize.js';
import { getGenerator, type GenerationVariant } from './registry.js';
import { validateReferences } from './emit/reference.js';
import type { BswmdModuleDefLite, EcucModuleConfigurationValuesInput } from './normalize.js';

export interface PipelineArgs {
  readonly bswmdIndex: ReadonlyMap<string, BswmdModuleDefLite>;
  readonly ecucValues: ReadonlyMap<string, EcucModuleConfigurationValuesInput>;
  readonly variant: GenerationVariant;
  readonly outDir: string;
  readonly moduleFilter: readonly string[] | undefined;
  readonly strict: boolean;
}

export interface PipelineResult {
  readonly exitCode: 0 | 1 | 2;
  readonly diagnostics: readonly Diagnostic[];
  readonly artifacts: ReadonlyMap<string, string>;
}

export async function runPipeline(args: PipelineArgs): Promise<PipelineResult> {
  const diagnostics: Diagnostic[] = [];
  const tree = normalizeToTree(args.bswmdIndex, args.ecucValues);
  diagnostics.push(...validateReferences(tree));

  const artifacts = new Map<string, string>();
  const modulesToRun = args.moduleFilter
    ? [...args.bswmdIndex.keys()].filter((m) => args.moduleFilter!.includes(m))
    : [...args.bswmdIndex.keys()];

  for (const moduleShortName of modulesToRun) {
    const def = tree.bswmdIndex.get(moduleShortName);
    if (!def) {
      diagnostics.push({
        severity: DiagnosticSeverity.WARNING,
        code: DiagnosticCode.ECUC_GEN_NO_SCHEMA,
        moduleShortName,
        message: `No BSWMD for module ${moduleShortName}`,
      });
      continue;
    }
    const generator = getGenerator(moduleShortName);
    if (!generator) {
      diagnostics.push({
        severity: DiagnosticSeverity.WARNING,
        code: DiagnosticCode.ECUC_GEN_NO_GENERATOR,
        moduleShortName,
        message: `No generator registered for ${moduleShortName}`,
      });
      continue;
    }
    try {
      const out = generator.emit(def, tree.valuesByModule.get(moduleShortName), {
        variant: args.variant,
        bswmdIndex: tree.bswmdIndex,
        implByModule: tree.implByModule,
        outDir: args.outDir,
        diagnostics,
      });
      for (const a of out) artifacts.set(a.path, a.content);
    } catch (e) {
      diagnostics.push({
        severity: DiagnosticSeverity.ERROR,
        code: DiagnosticCode.ECUC_GEN_THROW,
        moduleShortName,
        message: e instanceof Error ? (e.stack ?? e.message) : String(e),
      });
    }
  }

  const hasError = diagnostics.some((d) => d.severity === DiagnosticSeverity.ERROR);
  const hasWarning = diagnostics.some((d) => d.severity === DiagnosticSeverity.WARNING);
  let exitCode: 0 | 1 | 2;
  if (hasError) exitCode = 1;
  else if (hasWarning && args.strict) exitCode = 1;
  else if (hasWarning) exitCode = 2;
  else exitCode = 0;

  return { exitCode, diagnostics, artifacts };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/core/generator/__tests__/pipeline.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/generator/pipeline.ts src/core/generator/__tests__/pipeline.test.ts
git commit -m "feat(generator): 3-stage pipeline orchestrator with exit code logic"
```

---

## Task 13: Post-process — atomic write (no clang-format in MVP)

**Files:**

- Create: `src/core/generator/post-process.ts`
- Create: `src/core/generator/__tests__/post-process.test.ts`

**Interfaces:**

- Produces: `writeOutputTree(artifacts, outDir)` — used by CLI handler

Note on clang-format: per spec, the MVP atomic-write path doesn't
shell out to clang-format (the project doesn't ship the binary in
the npm package). The output is "good enough" C99 that won't break
a build. v2 wires up clang-format as a post-step behind a feature
flag.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/generator/__tests__/post-process.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeOutputTree } from '../post-process.js';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let outDir: string;

beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'generator-post-'));
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe('writeOutputTree', () => {
  it('writes each artifact to its path under outDir', async () => {
    const artifacts = new Map([
      ['EcuC/EcuC_Cfg.c', '/* cfg.c */'],
      ['EcuC/EcuC_Cfg.h', '/* cfg.h */'],
    ]);
    await writeOutputTree(artifacts, outDir);
    const c = await readFile(join(outDir, 'EcuC/EcuC_Cfg.c'), 'utf8');
    const h = await readFile(join(outDir, 'EcuC/EcuC_Cfg.h'), 'utf8');
    expect(c).toBe('/* cfg.c */');
    expect(h).toBe('/* cfg.h */');
  });

  it('creates subdirectories as needed', async () => {
    const artifacts = new Map([['Deep/Nested/Path/file.c', '/* nested */']]);
    await writeOutputTree(artifacts, outDir);
    const f = await readFile(join(outDir, 'Deep/Nested/Path/file.c'), 'utf8');
    expect(f).toBe('/* nested */');
  });

  it('writes atomically via temp-file + rename', async () => {
    const artifacts = new Map([['atomic.c', '/* content */']]);
    await writeOutputTree(artifacts, outDir);
    // No leftover temp files
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(outDir);
    expect(entries.filter((e) => e.includes('.tmp'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/generator/__tests__/post-process.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement writeOutputTree**

```ts
// src/core/generator/post-process.ts
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function writeOutputTree(
  artifacts: ReadonlyMap<string, string>,
  outDir: string,
): Promise<void> {
  for (const [relPath, content] of artifacts) {
    const absPath = join(outDir, relPath);
    await mkdir(dirname(absPath), { recursive: true });
    const tmpPath = `${absPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, content, 'utf8');
    await rename(tmpPath, absPath);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/core/generator/__tests__/post-process.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/generator/post-process.ts src/core/generator/__tests__/post-process.test.ts
git commit -m "feat(generator): post-process — atomic file write (temp + rename)"
```

---

## Task 14: EcuC testdata fixtures (BSWMD + BSWCFG)

**Files:**

- Create: `testdata/generator/ecuc-bswmd.arxml`
- Create: `testdata/generator/ecuc-bswcfg-1.arxml` (PreCompile only)
- Create: `testdata/generator/ecuc-bswcfg-mixed.arxml` (PreCompile + PostBuild)
- Create: `testdata/generator/ecuc-bswcfg-refs.arxml` (with cross-module reference)

**No test code in this task — just fixture authoring.**

- [ ] **Step 1: Author EcuC BSWMD fixture**

Create `testdata/generator/ecuc-bswmd.arxml` — a minimal EcuC schema with:

- 4 params: `EcuC_PartitionConfigId` (uint16), `EcuC_PartitionBootPriority` (uint8), `EcuC_PartitionType` (enumeration), `EcuC_ConfigConsistencyHash` (uint32)
- 1 container: `EcuC_PartitionConfig` (array, multiplicity 0..10)
- 1 choice: `EcucPartitionChoice` with 2 alternatives
- All paramConfigClasses present for PreCompile/Link/PostBuild variants
- One PostBuild parameter on a child element so Mixed fixture triggers PBcfg emission

Use the project's existing BSWMD authoring pattern from
`testdata/bswmd/`. Follow the same XML conventions (no `xsi:schemaLocation`,
arxml `xmlns` etc. — match what the existing fixtures do).

- [ ] **Step 2: Author PreCompile-only BSWCFG fixture**

Create `testdata/generator/ecuc-bswcfg-1.arxml` — 3 `EcuC_PartitionConfig`
instances, all PreCompile, no PostBuild elements, no references.

- [ ] **Step 3: Author Mixed (PreCompile + PostBuild) BSWCFG fixture**

Create `testdata/generator/ecuc-bswcfg-mixed.arxml` — 2 PreCompile
params + 1 PostBuild param so PBcfg emission is exercised.

- [ ] **Step 4: Author Refs (cross-module) BSWCFG fixture**

Create `testdata/generator/ecuc-bswcfg-refs.arxml` — includes an
`EcucReferenceValue` pointing to `Mcu/ClockConfig_0`. Requires a stub
`Mcu` BSWMD module also present in the fixture set.

Create `testdata/generator/mcu-bswmd.arxml` (minimal Mcu schema with
`Mcu_ClockConfigType` typedef + 1 instance).

Create `testdata/generator/mcu-bswcfg-refs.arxml` (1 instance of
`Mcu_ClockConfig` so the reference resolves).

- [ ] **Step 5: Commit fixtures**

```bash
git add testdata/generator/
git commit -m "test(generator): EcuC BSWMD + BSWCFG fixtures (3 scenarios)"
```

---

## Task 15: EcuC Handlebars templates (3 files + 3 partials)

**Files:**

- Create: `src/core/generator/templates/_partials/license.h.hbs`
- Create: `src/core/generator/templates/_partials/header_guard.h.hbs`
- Create: `src/core/generator/templates/_partials/c_decl.h.hbs`
- Create: `src/core/generator/templates/ecuc/cfg.h.hbs`
- Create: `src/core/generator/templates/ecuc/cfg.c.hbs`
- Create: `src/core/generator/templates/ecuc/pbcfg.c.hbs`

- [ ] **Step 1: Write the license partial**

Create `src/core/generator/templates/_partials/license.h.hbs`:

```handlebars
{{! SPDX-License-Identifier: MIT }}
{{!-- AUTOSAR BSW C code generated by claude-AutosarCfg {{generatorVersion}} --}}
{{! DO NOT EDIT — regenerate via `claude-autosarcfg generate` }}
```

- [ ] **Step 2: Write the header-guard partial**

Create `src/core/generator/templates/_partials/header_guard.h.hbs`:

```handlebars
{{!-- expects `guard` (uppercase identifier) --}}
#ifndef {{guard}}
#define {{guard}}

{{> @partial-block }}

#endif /* {{guard}} */
```

- [ ] **Step 3: Write the c_decl partial**

Create `src/core/generator/templates/_partials/c_decl.h.hbs`:

```handlebars
{{! expects `cType`, `ident`, optional `init` (C literal), optional `arrayLen` }}
{{#if arrayLen}}
  {{cType}}
  {{ident}}[{{arrayLen}}]{{#if init}} = { {{init}} }{{/if}};
{{else}}
  {{cType}}
  {{ident}}{{#if init}} = {{init}}{{/if}};
{{/if}}
```

- [ ] **Step 4: Write cfg.h.hbs**

Create `src/core/generator/templates/ecuc/cfg.h.hbs`:

```handlebars
{{> license}}
#ifndef ECU_CFG_H
#define ECU_CFG_H

#include "Std_Types.h"
{{#each includes}}
#include "{{this}}"
{{/each}}

{{#each typedefs}}
typedef struct {
{{#each fields}}
    {{this.cType}} {{this.name}};
{{/each}}
} {{this.name}};

{{/each}}

#ifdef __cplusplus
extern "C" {
#endif

{{#each externDecls}}
extern {{this}};
{{/each}}

{{#each referenceDecls}}
extern {{this}};
{{/each}}

#ifdef __cplusplus
}
#endif

#endif /* ECU_CFG_H */
```

- [ ] **Step 5: Write cfg.c.hbs**

Create `src/core/generator/templates/ecuc/cfg.c.hbs`:

```handlebars
{{> license}}
#include "{{moduleHeader}}"

{{#each preCompileDecls}}
{{this}}
{{/each}}

{{#each linkDecls}}
{{this}}
{{/each}}

{{#each postBuildDecls}}
{{this}}
{{/each}}

{{#each choiceBlocks}}
{{this}}
{{/each}}
```

- [ ] **Step 6: Write pbcfg.c.hbs**

Create `src/core/generator/templates/ecuc/pbcfg.c.hbs`:

```handlebars
{{> license}}
#include "{{moduleHeader}}"

{{#each loaderEntries}}
{{this}}
{{/each}}

void {{moduleShortName}}_PBcfg_Init(void* baseAddr) {
{{#each loaderCalls}}
    {{this}}
{{/each}}
}
```

- [ ] **Step 7: Commit templates**

```bash
git add src/core/generator/templates/
git commit -m "feat(generator): EcuC Handlebars templates (cfg.h/cfg.c/pbcfg.c) + partials"
```

---

## Task 16: EcuCGenerator class + happy-path test

**Files:**

- Create: `src/core/generator/modules/ecuc.ts`
- Create: `src/core/generator/__tests__/ecuc.test.ts`
- Create: `src/core/generator/index.ts` (public API barrel)

- [ ] **Step 1: Write the failing test**

```ts
// src/core/generator/__tests__/ecuc.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { EcuCGenerator } from '../modules/ecuc.js';
import { _resetRegistryForTest, registerGenerator } from '../registry.js';
import type { BswmdModuleDef, EcucModuleConfigurationValues } from '../test-fixtures/ecuc.js'; // task-specific fixture type
import { ecucDef, ecucValuesPreCompile } from '../test-fixtures/ecuc.js';

describe('EcuCGenerator', () => {
  beforeEach(() => _resetRegistryForTest());

  it('is registered with moduleShortName "EcuC"', () => {
    const g = new EcuCGenerator();
    expect(g.moduleShortName).toBe('EcuC');
  });

  it('emits 2 artifacts (Cfg.c, Cfg.h) for PreCompile variant', () => {
    registerGenerator(new EcuCGenerator());
    const g = getGeneratorForTest('EcuC');
    const ctx = makeCtx('PreCompile');
    const out = g.emit(ecucDef, ecucValuesPreCompile, ctx);
    const paths = out.map((a) => a.path).sort();
    expect(paths).toEqual(['EcuC/EcuC_Cfg.c', 'EcuC/EcuC_Cfg.h']);
  });

  it('emits 3 artifacts including PBcfg.c when any PostBuild element', () => {
    // Use ecucValuesMixed (task fixture)
    // ...
  });

  it('throws on undefined module def (sanity)', () => {
    const g = new EcuCGenerator();
    expect(() => g.emit(undefined as never, ecucValuesPreCompile, makeCtx('PreCompile'))).toThrow();
  });
});

// helpers
function getGeneratorForTest(name: string) {
  // tests import getGenerator + registerGenerator from registry
  const { getGenerator } = require('../registry.js');
  const gen = getGenerator(name);
  if (!gen) throw new Error('not registered');
  return gen;
}
function makeCtx(variant: 'PreCompile' | 'Link' | 'PostBuild') {
  return {
    variant,
    bswmdIndex: new Map(),
    implByModule: new Map(),
    outDir: '/tmp',
    diagnostics: [],
  };
}
```

The test depends on a `test-fixtures/ecuc.ts` file with `ecucDef` and
`ecucValuesPreCompile` / `ecucValuesMixed` constants — create these
based on the testdata ARXML fixtures from Task 14 (parse the XML at
test time using the project's `fast-xml-parser`, or hand-author the
typed fixtures for MVP).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/generator/__tests__/ecuc.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement EcuCGenerator**

```ts
// src/core/generator/modules/ecuc.ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import { createEngine } from '../handlebars.js';
import { loadChoiceMacros } from '../choices-loader.js';
import type { ModuleGenerator, GeneratedArtifact, GenerationContext } from '../registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL_DIR = join(__dirname, '..', 'templates', 'ecuc');

function loadTemplate(name: string): Handlebars.TemplateDelegate {
  const path = join(TPL_DIR, name);
  const src = readFileSync(path, 'utf8');
  return createEngine().compile(src);
}

export class EcuCGenerator implements ModuleGenerator {
  readonly moduleShortName = 'EcuC';

  emit(def: unknown, values: unknown, ctx: GenerationContext): readonly GeneratedArtifact[] {
    const eDef = def as EcuCModuleDef;
    const eVals = values as EcuCModuleConfigurationValues;

    // Render header
    const header = loadTemplate('cfg.h.hbs')({
      moduleShortName: 'EcuC',
      generatorVersion: '1.0.0',
      includes: eVals.includes ?? [],
      typedefs: eDef.typedefs ?? [],
      externDecls: emitExterns(eDef, eVals, ctx.variant),
      referenceDecls: emitRefs(eVals),
    });

    // Render source — split by configClass
    const preCompileDecls = emitPreCompile(eDef, eVals, ctx);
    const linkDecls = emitLink(eDef, eVals, ctx);
    const postBuildDecls = emitPostBuild(eDef, eVals, ctx);
    const choiceBlocks = emitChoices(eDef, eVals, ctx);

    const source = loadTemplate('cfg.c.hbs')({
      moduleShortName: 'EcuC',
      moduleHeader: 'EcuC/EcuC_Cfg.h',
      preCompileDecls,
      linkDecls,
      postBuildDecls,
      choiceBlocks,
    });

    const artifacts: GeneratedArtifact[] = [
      { path: 'EcuC/EcuC_Cfg.h', content: header },
      { path: 'EcuC/EcuC_Cfg.c', content: source },
    ];

    // PBcfg only if any PostBuild
    if (postBuildDecls.length > 0) {
      const pb = loadTemplate('pbcfg.c.hbs')({
        moduleShortName: 'EcuC',
        moduleHeader: 'EcuC/EcuC_Cfg.h',
        loaderEntries: postBuildDecls,
        loaderCalls: postBuildDecls.map((_, i) => `loader_call_${i}();`),
      });
      artifacts.push({ path: 'EcuC/EcuC_PBcfg.c', content: pb });
    }
    return artifacts;
  }
}

// Stub types — narrow in subsequent tasks as EcuC BSWMD fixture is parsed.
interface EcuCModuleDef {
  readonly shortName: string;
  readonly typedefs?: readonly {
    name: string;
    fields: readonly { cType: string; name: string }[];
  }[];
}
interface EcuCModuleConfigurationValues {
  readonly includes?: readonly string[];
  readonly parameters?: readonly unknown[];
  readonly references?: readonly { ident: string; targetModule: string; targetPath: string }[];
}

// Helper stubs — replace with real implementations in subsequent tasks.
function emitExterns(
  _def: EcuCModuleDef,
  _v: EcuCModuleConfigurationValues,
  _v2: GenerationContext['variant'],
): string[] {
  return [];
}
function emitRefs(_v: EcuCModuleConfigurationValues): string[] {
  return [];
}
function emitPreCompile(
  _d: EcuCModuleDef,
  _v: EcuCModuleConfigurationValues,
  _c: GenerationContext,
): string[] {
  return [];
}
function emitLink(
  _d: EcuCModuleDef,
  _v: EcuCModuleConfigurationValues,
  _c: GenerationContext,
): string[] {
  return [];
}
function emitPostBuild(
  _d: EcuCModuleDef,
  _v: EcuCModuleConfigurationValues,
  _c: GenerationContext,
): string[] {
  return [];
}
function emitChoices(
  _d: EcuCModuleDef,
  _v: EcuCModuleConfigurationValues,
  _c: GenerationContext,
): string[] {
  return [];
}
```

- [ ] **Step 4: Write the public API barrel**

```ts
// src/core/generator/index.ts
export { runPipeline } from './pipeline.js';
export type { PipelineArgs, PipelineResult } from './pipeline.js';
export {
  registerGenerator,
  getGenerator,
  type ModuleGenerator,
  type GeneratedArtifact,
  type GenerationContext,
  type GenerationVariant,
} from './registry.js';
export { writeOutputTree } from './post-process.js';
export { normalizeToTree } from './normalize.js';
export { DiagnosticSeverity, DiagnosticCode, type Diagnostic } from './diagnostics.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/core/generator/__tests__/ecuc.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/core/generator/modules/ecuc.ts src/core/generator/index.ts \
        src/core/generator/__tests__/ecuc.test.ts
git commit -m "feat(generator): EcuCGenerator + public API barrel"
```

---

## Task 17: EcuC snapshot tests (golden file compare)

**Files:**

- Create: `src/core/generator/__tests__/ecuc.snapshot.test.ts`
- Create: `testdata/generator/ecuc-expected/PreCompile-1/EcuC_Cfg.c` (committed)
- Create: `testdata/generator/ecuc-expected/PreCompile-1/EcuC_Cfg.h` (committed)
- Create: `testdata/generator/ecuc-expected/Mixed-1/EcuC_Cfg.c` (committed)
- Create: `testdata/generator/ecuc-expected/Mixed-1/EcuC_Cfg.h` (committed)
- Create: `testdata/generator/ecuc-expected/Mixed-1/EcuC_PBcfg.c` (committed)
- Create: `testdata/generator/ecuc-expected/Refs-1/EcuC_Cfg.c` (committed)
- Create: `testdata/generator/ecuc-expected/Refs-1/EcuC_Cfg.h` (committed)

- [ ] **Step 1: Run EcuC generator against fixtures to capture initial output**

Run the EcuC test from Task 16 in `--browse-templates` mode (or add a
debug print) to capture initial generated content. Save these as the
expected snapshots.

Helper script (run from project root, **not** committed):

```bash
node -e "
import('./src/core/generator/modules/ecuc.ts').then(async ({ EcuCGenerator }) => {
  // Hand-author fixtures inline, run emit, print to stdout
  // Save stdout to testdata/generator/ecuc-expected/<variant>-<n>/<file>
});
"
```

Write the captured output to the 7 expected files (2 PreCompile, 3 Mixed, 2 Refs).

- [ ] **Step 2: Write the snapshot test**

```ts
// src/core/generator/__tests__/ecuc.snapshot.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { EcuCGenerator } from '../modules/ecuc.js';
import { _resetRegistryForTest, registerGenerator } from '../registry.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ecucDef,
  ecucValuesPreCompile,
  ecucValuesMixed,
  ecucValuesRefs,
} from '../test-fixtures/ecuc.js';

function readSnap(relPath: string): string {
  return readFileSync(
    join(__dirname, '..', '..', '..', 'testdata', 'generator', 'ecuc-expected', relPath),
    'utf8',
  );
}

beforeAll(() => {
  _resetRegistryForTest();
  registerGenerator(new EcuCGenerator());
});

describe('EcuC snapshot', () => {
  it('PreCompile-1 Cfg.c matches', () => {
    const g = new EcuCGenerator();
    const out = g.emit(ecucDef, ecucValuesPreCompile, makeCtx('PreCompile'));
    const c = out.find((a) => a.path === 'EcuC/EcuC_Cfg.c')!;
    expect(c.content).toBe(readSnap('PreCompile-1/EcuC_Cfg.c'));
  });

  it('PreCompile-1 Cfg.h matches', () => {
    const g = new EcuCGenerator();
    const out = g.emit(ecucDef, ecucValuesPreCompile, makeCtx('PreCompile'));
    const h = out.find((a) => a.path === 'EcuC/EcuC_Cfg.h')!;
    expect(h.content).toBe(readSnap('PreCompile-1/EcuC_Cfg.h'));
  });

  it('Mixed-1 emits Cfg.c, Cfg.h, PBcfg.c', () => {
    const g = new EcuCGenerator();
    const out = g.emit(ecucDef, ecucValuesMixed, makeCtx('PreCompile'));
    for (const f of ['EcuC/EcuC_Cfg.c', 'EcuC/EcuC_Cfg.h', 'EcuC/EcuC_PBcfg.c']) {
      const a = out.find((x) => x.path === f)!;
      const expectedPath = f.replace('EcuC/', 'Mixed-1/');
      expect(a.content).toBe(readSnap(expectedPath));
    }
  });

  it('Refs-1 emits reference decls', () => {
    const g = new EcuCGenerator();
    const out = g.emit(ecucDef, ecucValuesRefs, makeCtx('PreCompile'));
    const c = out.find((a) => a.path === 'EcuC/EcuC_Cfg.c')!;
    expect(c.content).toBe(readSnap('Refs-1/EcuC_Cfg.c'));
    expect(c.content).toContain('&Mcu_ClockConfig_0');
  });
});

function makeCtx(variant: 'PreCompile' | 'Link' | 'PostBuild') {
  return {
    variant,
    bswmdIndex: new Map(),
    implByModule: new Map(),
    outDir: '/tmp',
    diagnostics: [],
  };
}
```

- [ ] **Step 3: Run snapshot tests**

Run: `pnpm test src/core/generator/__tests__/ecuc.snapshot.test.ts`
Expected: PASS (4 tests)

If a snapshot doesn't match, **fix the generator**, not the snapshot.
The committed snapshot is the expected output.

- [ ] **Step 4: Commit**

```bash
git add testdata/generator/ecuc-expected/ \
        src/core/generator/__tests__/ecuc.snapshot.test.ts
git commit -m "test(generator): EcuC snapshot tests (golden Cfg.c/Cfg.h/PBcfg.c)"
```

---

## Task 18: Diagnostic fixture tests (one per code)

**Files:**

- Create: `src/core/generator/__tests__/ecuc.diagnostic.test.ts`
- Create: `testdata/generator/diagnostics/<code>/*.arxml` (11 fixture files)

For each `DiagnosticCode` other than `ECUC_GEN_INFO_EMPTY_VARIANT`,
create one fixture ARXML that triggers it and a test that asserts the
code appears.

- [ ] **Step 1: Author diagnostic fixtures**

For each of the following codes, create a fixture ARXML under
`testdata/generator/diagnostics/<code>/`:

| Code                           | Fixture trigger                                                        |
| ------------------------------ | ---------------------------------------------------------------------- |
| `ECUC_GEN_NO_SCHEMA`           | BSWCFG references a module not in any BSWMD                            |
| `ECUC_GEN_NO_GENERATOR`        | Module loaded but generator not registered                             |
| `ECUC_GEN_THROW`               | Generator throws (test by injecting a throwing generator — see step 2) |
| `ECUC_GEN_REF_UNRESOLVED`      | Cross-module ref to unloaded module/path                               |
| `ECUC_GEN_MULTIPLICITY`        | BSWCFG has 11 instances of a `0..10` container                         |
| `ECUC_GEN_TYPE_MISMATCH`       | Integer value where Boolean expected                                   |
| `ECUC_GEN_RANGE`               | Integer value outside [min, max]                                       |
| `ECUC_GEN_ORDERING`            | 3 instances with INDEX 3, 1, 2 (out of order)                          |
| `ECUC_GEN_DUPLICATE_SHORTNAME` | Two instances with same shortName                                      |
| `ECUC_GEN_TEMPLATE_RENDER`     | Handlebars template throws (test via stub template)                    |
| `ECUC_GEN_OUTPUT_WRITE`        | Output path is unwritable (test by mocking fs)                         |
| `ECUC_GEN_INFO_EMPTY_VARIANT`  | Module has no elements for `--variant PostBuild`                       |

- [ ] **Step 2: Write diagnostic fixture tests**

```ts
// src/core/generator/__tests__/ecuc.diagnostic.test.ts
import { describe, it, expect } from 'vitest';
import { runPipeline } from '../pipeline.js';
import { registerGenerator, _resetRegistryForTest, type ModuleGenerator } from '../registry.js';
import { DiagnosticCode, DiagnosticSeverity } from '../diagnostics.js';
import { ecucDef } from '../test-fixtures/ecuc.js';

describe('Diagnostic fixture triggers', () => {
  it('ECUC-GEN-001 (NO_SCHEMA) fires when BSWMD missing', async () => {
    _resetRegistryForTest();
    const result = await runPipeline({
      bswmdIndex: new Map(), // empty
      ecucValues: new Map([['Ghost', {}]]),
      variant: 'PreCompile',
      outDir: '/tmp',
      moduleFilter: undefined,
      strict: false,
    });
    const d = result.diagnostics.find((x) => x.code === DiagnosticCode.ECUC_GEN_NO_SCHEMA);
    expect(d).toBeDefined();
    expect(d!.moduleShortName).toBe('Ghost');
  });

  it('ECUC-GEN-002 (NO_GENERATOR) fires when generator not registered', async () => {
    _resetRegistryForTest();
    const result = await runPipeline({
      bswmdIndex: new Map([['Stub', { shortName: 'Stub' }]]),
      ecucValues: new Map([['Stub', {}]]),
      variant: 'PreCompile',
      outDir: '/tmp',
      moduleFilter: undefined,
      strict: false,
    });
    const d = result.diagnostics.find((x) => x.code === DiagnosticCode.ECUC_GEN_NO_GENERATOR);
    expect(d).toBeDefined();
  });

  it('ECUC-GEN-003 (THROW) fires when generator throws', async () => {
    _resetRegistryForTest();
    class ThrowGen implements ModuleGenerator {
      readonly moduleShortName = 'Stub';
      emit(): readonly never[] {
        throw new Error('boom');
      }
    }
    registerGenerator(new ThrowGen());
    const result = await runPipeline({
      bswmdIndex: new Map([['Stub', { shortName: 'Stub' }]]),
      ecucValues: new Map([['Stub', {}]]),
      variant: 'PreCompile',
      outDir: '/tmp',
      moduleFilter: undefined,
      strict: false,
    });
    const d = result.diagnostics.find((x) => x.code === DiagnosticCode.ECUC_GEN_THROW);
    expect(d).toBeDefined();
    expect(d!.severity).toBe(DiagnosticSeverity.ERROR);
  });

  // Additional 9 tests follow the same pattern, one per code.
  // Use the testdata fixtures from step 1 for codes 010-021 and 031.
});
```

- [ ] **Step 3: Run diagnostic tests**

Run: `pnpm test src/core/generator/__tests__/ecuc.diagnostic.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 4: Commit**

```bash
git add testdata/generator/diagnostics/ \
        src/core/generator/__tests__/ecuc.diagnostic.test.ts
git commit -m "test(generator): diagnostic fixture tests (one per DiagnosticCode)"
```

---

## Task 19: CLI sub-command — generate handler + dispatcher wiring

**Files:**

- Create: `src/cli/handlers/generate.ts`
- Modify: `src/cli/command-dispatcher.ts` (add generate case)
- Modify: `src/shared/headless/ipc-contract.ts` (add GenerateArgs + GenerateResult types)
- Modify: `src/cli/index.ts` (re-export GenerateArgs + generateHeadlessProject)
- Create: `src/cli/__tests__/handlers/generate.test.ts`

**Interfaces:**

- Produces: `generateHeadlessProject(args): Promise<GenerateResult>` — exported from CLI module

- [ ] **Step 1: Add GenerateArgs + GenerateResult to IPC contract**

Edit `src/shared/headless/ipc-contract.ts` — append:

```ts
// ---------------------------------------------------------------------------
// Generate command — v1.10.0 generate sub-command (BSW code generator)
// ---------------------------------------------------------------------------

export const HEADLESS_GENERATE_RESULT = 'headless:generate-result:v1' as const;

export type HeadlessGenerateVariant = 'PreCompile' | 'Link' | 'PostBuild';
export type HeadlessGenerateFormat = 'human' | 'json';

export interface GenerateArgs {
  readonly command: 'generate';
  readonly projectPath: string;
  readonly variant?: HeadlessGenerateVariant; // default 'PreCompile'
  readonly outDir?: string; // default <project>/generated
  readonly modules?: readonly string[]; // optional filter
  readonly strict?: boolean; // promote WARNING → ERROR
  readonly format?: HeadlessGenerateFormat; // default 'human'
}

export interface GeneratedFile {
  readonly path: string;
  readonly bytes: number;
}

export interface GenerateResult {
  readonly ok: boolean;
  readonly command: 'generate';
  readonly projectPath: string;
  readonly outDir: string;
  readonly variant: HeadlessGenerateVariant;
  readonly files: readonly GeneratedFile[];
  readonly diagnostics: readonly ValidatorResult[]; // reuse ValidatorResult type
  readonly durationMs: number;
}
```

- [ ] **Step 2: Write the failing test for generate handler**

```ts
// src/cli/__tests__/handlers/generate.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateHeadlessProject } from '../../handlers/generate.js';
import { _resetRegistryForTest } from '../../../core/generator/registry.js';
import { EcuCGenerator } from '../../../core/generator/modules/ecuc.js';

let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'claude-gen-handler-'));
  await writeFile(join(projectDir, 'project.acproj'), '{}');
  _resetRegistryForTest();
  registerGenerator(new EcuCGenerator());
});

describe('generateHeadlessProject', () => {
  it('writes generated files to outDir', async () => {
    // Stub BSWMD + BSWCFG in the project dir
    await mkdir(join(projectDir, 'bswmd'));
    await mkdir(join(projectDir, 'ecuc'));
    // (Write test ARXML fixtures — reuse from testdata/generator)
    const result = await generateHeadlessProject({
      command: 'generate',
      projectPath: projectDir,
      format: 'json',
    });
    expect(result.ok).toBe(true);
    expect(result.files.length).toBeGreaterThan(0);
    const f = result.files[0]!;
    expect(f.path).toContain('EcuC_Cfg');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/cli/__tests__/handlers/generate.test.ts`
Expected: FAIL

- [ ] **Step 4: Implement generateHeadlessProject**

```ts
// src/cli/handlers/generate.ts
import { join } from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { runPipeline } from '../../core/generator/pipeline.js';
import { writeOutputTree } from '../../core/generator/post-process.js';
import { registerGenerator, type GenerationVariant } from '../../core/generator/registry.js';
import { EcuCGenerator } from '../../core/generator/modules/ecuc.js';
import type {
  GenerateArgs,
  GenerateResult,
  GeneratedFile,
} from '../../shared/headless/ipc-contract.js';

export async function generateHeadlessProject(args: GenerateArgs): Promise<GenerateResult> {
  const start = Date.now();
  const variant: GenerationVariant = args.variant ?? 'PreCompile';
  const outDir = args.outDir ?? join(args.projectPath, 'generated');
  const strict = args.strict ?? false;

  // MVP: register EcuCGenerator (later: dynamic loading)
  registerGenerator(new EcuCGenerator());

  // Load project (reuse existing loader — adjust import to project's real one)
  const { LoadProject } = await import('../../core/project/load.js');
  const project = await LoadProject(args.projectPath);

  const pipeline = await runPipeline({
    bswmdIndex: project.bswmdIndex,
    ecucValues: project.ecucValues,
    variant,
    outDir,
    moduleFilter: args.modules,
    strict,
  });

  // Translate exit code 2 → ok=false (warning present) so the
  // dispatcher can still emit a JSON envelope. The dispatcher is
  // responsible for the actual process exit code.
  await writeOutputTree(pipeline.artifacts, outDir);

  const files: GeneratedFile[] = [...pipeline.artifacts.entries()].map(([path, content]) => ({
    path,
    bytes: Buffer.byteLength(content, 'utf8'),
  }));

  return {
    ok: pipeline.exitCode !== 1,
    command: 'generate',
    projectPath: args.projectPath,
    outDir,
    variant,
    files,
    diagnostics: pipeline.diagnostics.map((d) => ({
      ruleId: d.code,
      severity: d.severity === 'ERROR' ? 'error' : d.severity === 'WARNING' ? 'warning' : 'warning',
      path: d.ecucPath ?? '',
      message: d.message,
    })),
    durationMs: Date.now() - start,
  };
}
```

Adjust the `LoadProject` import to match the project's actual
project-loading entry (look in `src/core/project/`).

- [ ] **Step 5: Wire into dispatcher**

Edit `src/cli/command-dispatcher.ts`:

```ts
// Add to imports:
import { generateHeadlessProject } from './handlers/generate.js';
import type { GenerateArgs } from '../shared/headless/ipc-contract.js';

// In dispatchCommand, add a `case 'generate':` branch alongside
// `read`, `mutate`, `validate`. The branch calls generateHeadlessProject
// and wraps the result in the standard HeadlessResult envelope.
```

Match the existing pattern (look at how `validateHeadlessProject` is
dispatched). The dispatcher returns `EXIT_FATAL` if `result.ok === false`
and `pipeline.exitCode === 1`; otherwise returns `EXIT_WARNING` if any
warning, `EXIT_SUCCESS` otherwise.

- [ ] **Step 6: Re-export from CLI index**

Edit `src/cli/index.ts` — add:

```ts
export { generateHeadlessProject } from './handlers/generate.js';
export type {
  GenerateArgs,
  GenerateResult,
  GeneratedFile,
} from '../shared/headless/ipc-contract.js';
```

- [ ] **Step 7: Run handler test**

Run: `pnpm test src/cli/__tests__/handlers/generate.test.ts`
Expected: PASS (1 test)

- [ ] **Step 8: Commit**

```bash
git add src/cli/handlers/generate.ts src/cli/command-dispatcher.ts \
        src/shared/headless/ipc-contract.ts src/cli/index.ts \
        src/cli/__tests__/handlers/generate.test.ts
git commit -m "feat(cli): generate sub-command handler + dispatcher wiring"
```

---

## Task 20: Final verify + version bump + release notes

**Files:**

- Modify: `package.json` (version 1.9.1 → 1.10.0)
- Modify: `CHANGELOG.md` (add v1.10.0 entry)
- Create: `docs/superpowers/release-notes-v1.10.0.md`

- [ ] **Step 1: Run full pnpm verify**

Run: `pnpm verify`
Expected: ALL 7 stages pass — type-check, lint, format-check, test, build, etc.

If any stage fails, **fix the issue** (often a missing export, an
unused var caught by `noUnusedLocals`, or a snapshot drift). Do NOT
mark complete until all stages green.

- [ ] **Step 2: Run full test suite with coverage**

Run: `pnpm test:coverage`
Expected: ≥80% line coverage on `src/core/generator/**`

- [ ] **Step 3: Bump package.json to 1.10.0**

Edit `package.json`:

```diff
-  "version": "1.9.1",
+  "version": "1.10.0",
```

- [ ] **Step 4: Add CHANGELOG entry**

Add to top of `CHANGELOG.md`:

```markdown
## [1.10.0] - 2026-06-24

### Added

- New `generate` sub-command in headless CLI: emits BSW configuration
  C source code (Cfg.c / Cfg.h / PBcfg.c) from ECUC values + BSWMD.
  - MVP demo module: EcuC (single-module end-to-end proof).
  - Full 3-stage pipeline (pre-process / generate / post-process).
  - Pure-function `ModuleGenerator` interface; TS class static
    registration via `registerGenerator()`.
  - 12 standard `DiagnosticCode` values; CLI exit codes 0/1/2 per
    project convention (`EXIT_SUCCESS` / `EXIT_FATAL` / `EXIT_WARNING`).
  - 85+ new tests; ~10 ARXML fixtures; 7 golden snapshot files.

### References

- Spec: `docs/superpowers/specs/2026-06-24-bsw-code-generator-design.md`
- Plan: `docs/superpowers/plans/2026-06-24-bsw-code-generator.md`
```

- [ ] **Step 5: Write release notes**

Create `docs/superpowers/release-notes-v1.10.0.md` — at minimum:

```markdown
# v1.10.0 Release Notes

## Highlights

- **`generate` sub-command**: emit BSW C configuration source from
  ECUC values. Run `claude-autosarcfg generate --project <path>`.

## What's New

- Full pipeline (pre/generate/post) + EcuC demo generator
- `Diagnostic[]` channel with 12 standard codes
- `--variant`, `--module`, `--strict`, `--format` flags
- Atomic file writes (temp + rename)

## Test Coverage

- 85+ new tests, 7 golden snapshots committed
- Coverage: ≥80% line on `src/core/generator/**`

## Out of Scope (v2+)

- Other BSW module generators (Mcu, Port, Dio, …)
- Renderer-side "Generate" button
- RTE generator
- clang-format integration
```

- [ ] **Step 6: Final commit + push**

```bash
git add package.json CHANGELOG.md docs/superpowers/release-notes-v1.10.0.md
git commit -m "chore(release): v1.10.0 — BSW code generator (EcuC MVP)"
git push origin main
git tag -a v1.10.0 -m "v1.10.0 — BSW code generator"
git push origin v1.10.0
```

Note: tag creation + push follows the project's existing
`gh release`-manual pattern (gh CLI not installed per
`shipped-plan-archive` memory).

- [ ] **Step 7: Manually create GitHub release**

Per memory workaround (`dbc-forge-user-manual-and-releases`):

```bash
# Get a PAT
git credential fill <<EOF
protocol=https
host=github.com
EOF
# POST to https://api.github.com/repos/jasontaotao/claude-autosar-cfg/releases
# with body { tag_name: "v1.10.0", name: "v1.10.0", body: "<release-notes content>" }
# Use Python json.dumps + curl POST (avoid heredoc backtick trap).
```

---

## Acceptance Gate (run before declaring complete)

- [ ] All 20 tasks committed with conventional commit messages
- [ ] `pnpm verify` — all 7 stages green
- [ ] `pnpm test:coverage` — ≥80% line on `src/core/generator/**`
- [ ] `pnpm test src/core/generator/__tests__/ecuc.snapshot.test.ts` — PASS
- [ ] `pnpm test src/core/generator/__tests__/ecuc.diagnostic.test.ts` — PASS
- [ ] Manual smoke: `node bin/autosarcfg.mjs generate --project <fixture>` produces expected files
- [ ] package.json = 1.10.0
- [ ] CHANGELOG entry present
- [ ] Release notes committed
- [ ] main pushed; tag v1.10.0 pushed; GH release created (manually)
