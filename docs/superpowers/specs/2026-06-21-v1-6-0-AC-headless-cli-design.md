# claude-AutosarCfg v1.6.0 Cluster A+C — Headless Config Engine CLI Design

**Date**: 2026-06-21
**Author**: design spec writer (parent-agent dispatched)
**Status**: DRAFT (awaiting user approval before writing implementation plan)
**Type**: New feature sprint (MINOR bump)
**Source brainstorm memory**: [[claude-autosarcfg-v1-6-brainstorm]]
**Depends on**: v1.5.1 Foundation (`5f0678c`-style output: `NormalizedDocument` + realized `applyMutation` + 7-slice store + arxml-stream router with feature flags)
**Unlocks**: v1.6.0 Cluster G (SWS Validator framework), v1.6.0 Cluster U (Cmd-K command palette), v1.7.0 Cluster 3 (I DBC bridge / K Stencil Wizard / N ASPICE)

---

## 0. Why A+C

v1.5.0 SHIPPED 2026-06-20 with a desktop GUI over `applyMutation` (Sprint 14 #2 stub) and `removeWithCascade`. v1.5.1 Foundation sprint (in flight, ~5 PRs) replaces the stub with a real `applyMutation(plan): MutationResult`, splits `useArxmlStore` into 7 slices, and adds a feature-flagged arxml-stream router.

Brainstorm for v1.6.0 ([claude-autosarcfg-v1-6-brainstorm]) ranked **Cluster A+C Headless Config Engine CLI** as the **single critical-path dependency**: Cluster G (SWS Validator), Cluster N (ASPICE Traceability Hooks in v1.7.0), and Cluster B (Variants in v1.8.0) all need a non-GI bound entry point. Without A+C, the GUI is the only automation surface — every CI/CD pipeline, every batch mutation, every dry-run check becomes a screenshot dance.

A+C is the foundation under the "ESLint of AUTOSAR" narrative: install once, wire into CI, block bad merges. It is also the only v1.6.0 cluster whose IPC contract the others (G, W, U) literally import.

---

## 1. Scope

### In scope (v1)

1. **`autosarcfg` CLI binary** — a single executable entry point under `bin/autosarcfg` (Windows) / `bin/autosarcfg.mjs` (POSIX via shebang), also exposed as `pnpm autosarcfg ...` script. No Electron / no GUI dependency at runtime.
2. **Three commands**: `read` (dump project as JSON / arxml summary), `mutate` (apply a JSON/YAML patch file), `validate` (placeholder; emits structured result for G cluster to fill in v1.6.0 G-side).
3. **Headless store adapter** — a new `HeadlessStoreContext` (in `src/main/headless/`) that re-exports `applyMutation` / `removeWithCascade` / `parseArxml` / `serializeArxml` from `core/` + `shared/` without touching `useArxmlStore`. The renderer store stays GUI-only.
4. **IPC contract (forward-declared)** — three new channels: `headless:run-command:v1` (main entry), `headless:mutate-applied:v1` (push event), `headless:validate-result:v1` (push event). Other clusters (G, U) import these channel constants but do NOT use them in v1 — they are reserved for the future GUI integration.
5. **Feature flag**: `experimental.headlessCli` defaults OFF in `settings.json` (matching v1.5.1's dual-track policy from Q6 A). The CLI binary itself does NOT check the flag (it's a separate process); the flag controls only the **GUI's** future "Run CLI command" button.
6. **Patch format**: subset of RFC 6902 JSON Patch (`add` / `remove` / `replace`) plus 3 AUTOSAR-specific extensions (`set-param`, `add-child`, `remove-with-cascade`).
7. **Output formats**: `--format json` (machine-readable, default in CI), `--format summary` (human-readable, default in TTY), `--format arxml-dump` (raw XML of selected paths).
8. **Exit codes**: 0 (success) / 1 (error) / 2 (partial success with warnings) / 3 (invalid input).
9. **i18n**: CLI error messages use `t(locale, key, params)` with two locales (EN + ZH). Internal logs are English-only (debug tool, not user-facing).

### Out of scope (deferred)

- Real validator rules (Cluster G, v1.6.0) — `--validate` only emits an empty `ValidatorResult[]` shape with a `stub: true` flag.
- GUI integration (Cmd-K command palette hooks, "Run CLI" buttons) — deferred to v1.7.0 Cluster U.
- Plugin system for external validators — deferred to v1.7.0+ (post-Cluster G stabilization).
- Watch mode (`autosarcfg watch`) — deferred to v1.7.0+.
- Remote / RPC mode — **defer permanently** (per brainstorm drop of N ASPICE + B Variants).
- DBC ↔ ECUC bridge — Cluster I in v1.7.0 (reuse `dbc-forge`).
- BSWMD-Free Stencil Wizard — Cluster K in v1.7.0 (depends on G validators).

---

## 2. Decisions Locked

| #   | Question                                                       | Answer                                                                          | Why                                                                                                                                                          |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | CLI parser library                                             | **`commander.js`** (^12)                                                         | Already the de-facto Node CLI standard; zero deps; supports sub-commands + variadic args + `--no-*` flags; smaller bundle than yargs.                       |
| Q2  | Patch format                                                   | **Subset of RFC 6902 + 3 AUTOSAR extensions** (see §4)                          | RFC 6902 is widely understood (CI tooling already speaks it); extensions cover cascade-delete / set-param that JSON Patch cannot express.                  |
| Q3  | Patch input source                                             | **`--patch <file>` (path) + `--patch -` (stdin)**                                | File path is the CI-friendly default; stdin enables pipe-from-`jq` / pipe-from-script workflows. Both paths must produce identical `PatchDocument`.       |
| Q4  | Exit codes                                                     | **4 codes** (0/1/2/3)                                                            | Matches POSIX conventions; 2 lets CI distinguish "warnings, please review" from "fatal, fail the build"; 3 lets formatters catch bad input fast.           |
| Q5  | Headless process model                                         | **Standalone Node script (no Electron)**                                        | GUI is a wrapper around core; headless should not pay Electron's memory tax (~150 MB); CI runners prefer pure-Node startup (<50 MB).                         |
| Q6  | Feature flag scope                                             | **`experimental.headlessCli` (default OFF, controls GUI button only)**          | CLI binary itself does not check the flag — if you invoke `autosarcfg`, it runs. The flag only gates the future GUI "Run CLI" affordance (deferred).       |
| Q7  | i18n locale selection                                          | **`--locale en\|zh` flag** + `LANG` env var fallback                             | Explicit flag wins for CI reproducibility; env-var fallback matches GNU gettext convention; default = `en` when both absent.                                |
| Q8  | Patch version header                                           | **Required `autosarcfg-patch-version: "1"` field**                               | Lets v1.7.0+ introduce breaking patch schema changes without breaking v1.6.0 patch files; rejects unknown versions explicitly.                               |
| Q9  | Streaming + IndexedDB cache in CLI                             | **Honor the same `settings.json` flags as GUI**                                 | CLI reads `~/.config/claude-autosarcfg/settings.json` (or `%APPDATA%` on Windows); consistent behavior; same `experimental.streaming` / `experimental.indexedDb`. |
| Q10 | Failure-mode summary format                                    | **`{ ok: false, code: <exit-code>, error: { kind, message, details? } }`**       | Machine-readable error envelope; CI can grep `error.kind` for retry logic; `details` carries `path` / `planId` / `stepIndex` when applicable.              |
| Q11 | Patch version compatibility                                    | **Strict (no forward compat)**                                                  | A v1.7.0-only `kind` value in a v1.6.0 patch file exits 3 with `unsupported-patch-version`. Looser compat is a footgun for CI.                                |
| Q12 | Logging                                                         | **stderr-only structured logs, `--verbose` for debug**                          | stdout is reserved for the result envelope (so `autosarcfg ... | jq` works); logs go to stderr to not contaminate the pipe.                              |

---

## 3. Build Approach

**Approach 1 — Layered Atomic (chosen)**. Five PRs, three merge waves:

```
Wave 1 (parallel, ~1 wk):
  PR(1) headless store adapter           ─┐
  PR(2) patch parser + types              ─┤
  PR(3) command dispatcher (read/mutate)  ─┘

Wave 2 (depends on Wave 1, ~1 wk):
  PR(4) validate stub + IPC contract + i18n

Wave 3 (depends on PR(3), ~1 wk):
  PR(5) CLI binary + commander wiring + e2e + release bump
                  ↓
            v1.6.0 tag
```

Total: 3–5 wks (with Wave 1 at peak parallelism). Each PR ≤ 600 lines.

### Why not Big-Bang

Cluster A+C is the critical path for G / W / U. A 1500-line PR hides the IPC contract decisions until code review — the exact failure mode that bit v1.4.2 (P0 IPC field drop, P0 chip 0/0).

### Why not Parallel-Streams

The IPC contract must be frozen BEFORE W / G / U can reference it. PR(4) ships the contract; W / G / U specs ship in parallel thereafter, each pinning to the channel names + payload types from this spec.

---

## 4. Architecture

### Module map (new code)

```
src/main/headless/                          ← new sub-path (mirrors arxml-stream)
  ├─ package.json                           ← sub-path exports (no new npm package)
  ├─ index.ts                               ← public surface
  ├─ cli/
  │   ├─ entry.ts                           ← commander.js wiring (default export = main())
  │   ├─ flags.ts                           ← flag parsing helpers
  │   └─ exit.ts                            ← exit-code mapping
  ├─ commands/
  │   ├─ read.ts                            ← read command implementation
  │   ├─ mutate.ts                          ← mutate command (delegates to core + HeadlessStore)
  │   └─ validate.ts                        ← stub (returns empty ValidatorResult[])
  ├─ store/
  │   ├─ headless-store.ts                  ← HeadlessStoreContext: wraps core/ calls
  │   └─ patch-types.ts                     ← PatchDocument + step kinds
  ├─ patch/
  │   ├─ patch-parser.ts                    ← file/stdin → PatchDocument
  │   ├─ patch-validator.ts                 ← schema validation (zod)
  │   └─ patch-applier.ts                   ← dispatch step → core mutation API
  ├─ format/
  │   ├─ json.ts                            ← JSON output formatter
  │   ├─ summary.ts                         ← human-readable summary
  │   └─ arxml-dump.ts                      ← raw ARXML extraction
  ├─ ipc-contract.ts                        ← 3 new channels + payload types (forward-declared)
  ├─ errors.ts                              ← HeadlessError envelope (mirrors core/arxml/types.ts Result)
  └─ feature-flag.ts                        ← reads settings.json + CLI flag override
```

### Reused modules (zero new code in these paths)

```
src/core/arxml/
  ├─ parser.ts              ← ARXML → ArxmlDocument
  ├─ serializer.ts          ← ArxmlDocument → ARXML (preserves order)
  ├─ mutation.ts            ← add/remove/replace primitives (no applyMutation stub anymore)
  ├─ path.ts                ← path normalization + findByPath
  └─ types.ts               ← ArxmlDocument, MutationError, Result envelope

src/shared/
  ├─ normalized-document.ts ← fromArxmlDocument() (v1.5.1 output)
  ├─ path.ts                ← isPathInside() (v1.5.1 hardened)
  └─ i18n.ts                ← t(locale, key, params) (v1.4.0 trust sprint)
```

### Key abstractions

**`PatchDocument`** — the canonical input shape:

```ts
export interface PatchDocument {
  /** Schema version. Currently "1". Strict — unknown versions → exit 3. */
  readonly autosarcfgPatchVersion: '1';
  /** Optional metadata (round-tripped to `data` in result for audit trail). */
  readonly metadata?: Readonly<Record<string, string>>;
  /** Ordered list of mutations to apply. Empty array = no-op (still exit 0). */
  readonly steps: ReadonlyArray<PatchStep>;
}

export type PatchStep =
  // RFC 6902 subset — for paths not covered by AUTOSAR extensions.
  | { readonly op: 'add'; readonly path: string; readonly value: unknown }
  | { readonly op: 'remove'; readonly path: string }
  | { readonly op: 'replace'; readonly path: string; readonly value: unknown }
  // AUTOSAR-specific extensions — preferred for any path the BSWMD
  // schema can validate (avoids raw JSON-Patch escaping of `/` in
  // shortName values like `ComM/ComSignal`).
  | {
      readonly op: 'set-param';
      readonly containerPath: string;
      readonly paramName: string;
      readonly value: string | number | boolean | null;
    }
  | {
      readonly op: 'add-child';
      readonly parentPath: string;
      readonly shortName: string;
      readonly definitionRef?: string; // optional BSWMD lookup hint
    }
  | {
      readonly op: 'remove-with-cascade';
      readonly containerPath: string;
      readonly cascade: boolean;
    };
```

**`HeadlessCommand`** — the dispatched sub-command:

```ts
export type HeadlessCommand =
  | { readonly kind: 'read'; readonly input: ReadArgs }
  | { readonly kind: 'mutate'; readonly input: MutateArgs }
  | { readonly kind: 'validate'; readonly input: ValidateArgs };

export interface ReadArgs {
  /** Path to AUTOSAR project manifest (`.autosarcfg.json`) or a single `.arxml` file. */
  readonly projectPath: string;
  /** Restrict output to specific paths (POSIX extended-glob; empty = whole project). */
  readonly paths?: ReadonlyArray<string>;
  readonly format: 'json' | 'summary' | 'arxml-dump';
}

export interface MutateArgs {
  readonly projectPath: string;
  /** Path to patch file, or `'-'` for stdin. */
  readonly patch: string;
  readonly format: 'json' | 'summary';
  readonly dryRun: boolean;
  readonly verbose: boolean;
}

export interface ValidateArgs {
  readonly projectPath: string;
  readonly format: 'json' | 'summary';
  /** v1: stub only — emits empty result with `stub: true`. */
  readonly stub: boolean;
}
```

**`HeadlessResult`** — the standard output envelope:

```ts
export type HeadlessResult =
  | ReadResult
  | MutateResult
  | ValidateResult;

export interface ReadResult {
  readonly ok: true;
  readonly command: 'read';
  readonly projectPath: string;
  readonly summary: {
    readonly arxmlVersion: string;
    readonly moduleCount: number;
    readonly containerCount: number;
    readonly parameterCount: number;
    readonly referenceCount: number;
  };
  readonly document: NormalizedDocument | ReadonlyArray<{ readonly path: string; readonly content: string }>;
  readonly durationMs: number;
}

export interface MutateResult {
  readonly ok: true;
  readonly command: 'mutate';
  readonly projectPath: string;
  readonly patchId: string;
  readonly stepsApplied: number;
  readonly stepsTotal: number;
  readonly warnings: ReadonlyArray<{ readonly stepIndex: number; readonly message: string }>;
  readonly durationMs: number;
  /** Populated only when --dry-run is set. */
  readonly dryRunPreview?: string;
}

export interface ValidateResult {
  readonly ok: true;
  readonly command: 'validate';
  readonly projectPath: string;
  /** v1: always empty array + `stub: true`. G cluster fills in v1.6.0. */
  readonly results: ReadonlyArray<ValidatorResult>;
  readonly stub: true;
  readonly durationMs: number;
}

export interface ValidatorResult {
  readonly ruleId: string;
  readonly severity: 'error' | 'warning';
  readonly path: string;
  readonly message: string;
  readonly i18nKey?: string;
}
```

**`HeadlessError`** — the failure envelope (mirrors `core/arxml/types.ts` `Result`):

```ts
export type HeadlessError =
  | { readonly kind: 'file-not-found'; readonly path: string }
  | { readonly kind: 'permission-denied'; readonly path: string }
  | { readonly kind: 'parse-error'; readonly path: string; readonly line?: number; readonly message: string }
  | { readonly kind: 'patch-invalid'; readonly reason: string; readonly line?: number }
  | { readonly kind: 'unsupported-patch-version'; readonly version: string }
  | { readonly kind: 'mutation-failed'; readonly planId: string; readonly errors: ReadonlyArray<MutationStepError> }
  | { readonly kind: 'write-failed'; readonly path: string; readonly message: string }
  | { readonly kind: 'i18n-key-missing'; readonly key: string }
  | { readonly kind: 'internal-error'; readonly message: string };

export interface HeadlessFailure {
  readonly ok: false;
  readonly code: 1 | 2 | 3;
  readonly error: HeadlessError;
  readonly stderr: ReadonlyArray<string>;
}
```

---

## 5. Data Flow

### 5.1 Read command

```
[autosarcfg read --project ./demo.autosarcfg.json --format json]
        │
        ▼
[commander parses flags → ReadArgs]
        │
        ▼
[HeadlessStore.openProject(manifestPath)]
        │   ← reuse core/project/manifest.ts loadManifest()
        │   ← reuse core/arxml/parser.ts parseArxml() per file
        ▼
[NormalizedDocument]   ← fromArxmlDocument() (v1.5.1)
        │
        ▼ (if --paths given)
[filter by glob → subset]
        │
        ▼
[format: json | summary | arxml-dump]
        │
        ▼ (stdout)
[ReadResult] → exit 0
        │
        ▼ (stderr, only if --verbose)
[logs]
```

### 5.2 Mutate command

```
[autosarcfg mutate --project ./demo.autosarcfg.json --patch ./fix.yaml --dry-run]
        │
        ▼
[PatchParser.parse(file or stdin) → PatchDocument]
        │   ← zod schema validation
        ▼
[autosarcfg-patch-version === '1'?]
        │ no → exit 3 (unsupported-patch-version)
        ▼ yes
[convert each PatchStep → MutationStep in normalized-document.ts]
        │   ← JSON Patch ops → 'add'/'remove'/'replace' pass through
        │   ← AUTOSAR extensions map to addChild / setParam / removeWithCascade
        ▼
[MutationPlan { planId, createdAt, mutations }]
        │
        ▼
[HeadlessStore.applyMutation(plan) → MutationResult]   ← v1.5.1 realized impl
        │   ← routes through preserveOrder (v1.5.1 PR(2))
        │   ← atomic write (v1.5.1 PR(4))
        ▼
[MutateResult + warnings]
        │
        ▼
{if dry-run: emit preview to stdout, no write; else: write, emit summary}
        │
        ▼
[exit 0 if all steps applied | exit 2 if warnings | exit 1 if any error]
```

### 5.3 Validate command (stub)

```
[autosarcfg validate --project ./demo.autosarcfg.json]
        │
        ▼
[HeadlessStore.openProject(manifestPath)]
        │
        ▼
[ValidatorRunner.run(doc) → ReadonlyArray<ValidatorResult>]
        │   v1: returns [] with stub: true
        │   G cluster (v1.6.0): replaces body with real rule dispatch
        ▼
[ValidateResult { stub: true, results: [], ... }]
        │
        ▼ (stdout)
[exit 0]
```

### 5.4 Atomic write (inherited from v1.5.1)

```
[MutationResult.arxmlWritten]
        │
        ▼
[write to path.tmp] → [fsync] → [MoveFileEx / rename(2)]
                                          │
                                          ▼
                          [delete temp on any failure]
                          [original file unchanged on failure]
```

Same `writeAtomic()` helper from `src/main/ipc/projectSaveHandler.ts`. The CLI re-exports it via `src/main/headless/store/headless-store.ts` rather than calling IPC (it is a different process).

---

## 6. IPC Contract Reference (for G / W / U clusters)

**Canonical wire-shape SoT**: All `ValidatorResult` / `HeadlessCommand` / `HeadlessResult` / `HeadlessError` types live in `src/shared/headless/ipc-contract.ts` (to be created in plan-stage; existing v1.5.1 has `src/shared/ipc-contract.ts` with 32 channels — extend, don't fork). G spec E1 imports from this path verbatim; W spec E1 Demo ECU manifest schema sits alongside; U spec is consumer only. **Path split (per Round 3 clarification, 2026-06-21)**: this file holds wire types only; the IPC channel constants (32 existing v1.5.1 + 3 new `:v1` A+C + 2 new `:v1` G) live separately in `src/shared/ipc-contract.ts`. Two files by design.

All channel names use the `:v1` suffix per v1.5.0 convention (so v1.7.0 can introduce `:v2` channels without breaking v1.6.0 callers). The CLI binary does NOT use IPC in v1 (it is a standalone Node process); these channels are reserved for the future GUI bridge (v1.7.0 Cluster U "Run CLI" button). **Note**: the `tour:state-changed` event between W and G (per §10.6 row 8 + W §3.7 + G §3.9) is **NOT** an IPC channel — it is a renderer-internal zustand subscription (`useArxmlStore.subscribe`), so the `:v1` suffix policy does not apply to it.

```ts
// src/shared/ipc-contract.ts — addition (PR(4) of this spec)

export const IPC_CHANNELS = {
  // ... existing 32 channels (unchanged) ...
  HEADLESS_RUN_COMMAND: 'headless:run-command:v1',         // R→M invoke
  HEADLESS_MUTATE_APPLIED: 'headless:mutate-applied:v1',   // M→R push
  HEADLESS_VALIDATE_RESULT: 'headless:validate-result:v1', // M→R push
} as const;
```

### Channel 1: `headless:run-command:v1` (R→M, invoke)

**Purpose**: GUI forwards a `HeadlessCommand` to the main process so a future "Run CLI" button can execute the same code path as the standalone binary without spawning a child process.

**Request payload** (`HeadlessRunRequest`):

```ts
export interface HeadlessRunRequest {
  readonly command: HeadlessCommand;
  /** Locale override; if absent, uses GUI's current locale. */
  readonly locale?: 'en' | 'zh';
}
```

**Response payload** (`HeadlessRunResponse`):

```ts
export type HeadlessRunResponse =
  | { readonly ok: true; readonly result: HeadlessResult }
  | { readonly ok: false; readonly error: HeadlessError; readonly exitCode: 1 | 2 | 3 };
```

**When this fires**: ONLY in v1.7.0+ when the GUI bridge ships. In v1.6.0 the channel is registered but no renderer calls it (guarded by `experimental.headlessCli` flag).

### Channel 2: `headless:mutate-applied:v1` (M→R, push event)

**Purpose**: After a mutate completes (CLI or future GUI bridge), main emits this so the GUI can refresh the project tree + dirty flag without re-reading the manifest.

**Event payload** (`HeadlessMutateAppliedEvent`):

```ts
export interface HeadlessMutateAppliedEvent {
  readonly projectPath: string;
  readonly patchId: string;
  readonly paths: ReadonlyArray<string>; // paths touched (for tree refresh hint)
  readonly durationMs: number;
}
```

**Subscribers** (v1.7.0+):
- `useArxmlStore` mutation slice — refreshes dirty paths + emits toast
- Cluster U Cmd-K command palette — surfaces "Last CLI run" status

### Channel 3: `headless:validate-result:v1` (M→R, push event)

**Purpose**: Cluster G SWS Validator emits structured violations to the GUI Issues panel.

**Event payload** (`HeadlessValidateResultEvent`):

```ts
export interface HeadlessValidateResultEvent {
  readonly projectPath: string;
  readonly results: ReadonlyArray<ValidatorResult>;
  readonly durationMs: number;
}
```

**Subscribers** (v1.6.0 G cluster):
- Issues panel — rows + filter-by-severity
- AppHeader dismissible banner — top-level error count
- Cluster U Cmd-K — "jump to next violation" command

### Versioning policy

- v1.6.0 ships `:v1` channels. They MUST NOT be modified after v1.6.0 tag.
- Breaking changes introduce `:v2` channels (parallel existence; renderer chooses).
- Additive payload fields (new optional properties) are backwards-compatible within `:v1` and do NOT bump the version.

### Error envelope across channels

All three channels use the `HeadlessError` union from §4 as the canonical failure shape. Renderers parse `error.kind` for retry logic; `error.message` is pre-localized via `t(locale, key, params)` before being placed on the wire (no post-hoc translation in the renderer).

---

## 7. CLI Reference

### 7.1 Global flags (apply to every sub-command)

| Flag                  | Type      | Default     | Description                                                                                      |
| --------------------- | --------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `--project <path>`    | string    | (required)  | Path to `.autosarcfg.json` manifest, or to a single `.arxml` for loose mode.                     |
| `--locale <en\|zh>`   | string    | `en` (or `$LANG` first segment) | Error message locale.                                                                 |
| `--format <fmt>`      | string    | `summary` (TTY) / `json` (piped) | Output format: `json` / `summary` / `arxml-dump`.                               |
| `--verbose`           | boolean   | false       | Emit structured debug logs to stderr (timing per step, cache hits, parser path).                 |
| `--quiet`             | boolean   | false       | Suppress the human-readable summary on success; still emit `--format` body.                     |
| `--no-color`          | boolean   | false       | Disable ANSI color codes in `summary` output (CI default).                                       |
| `--streaming`         | boolean   | (from flag) | Override `experimental.streaming` for this invocation. `--no-streaming` forces DOM.              |
| `--cache`             | boolean   | (from flag) | Override `experimental.indexedDb` for this invocation. `--no-cache` disables the cache.          |
| `--platform <p>`      | string    | `process.platform` (auto) | Override detected platform (`darwin` / `win32` / `linux`); default reads `process.platform` from Node.js builtin. SoT for cross-cluster (U cluster §3.3 uses this directly, no IPC). See §17 Q8. |

### 7.2 `autosarcfg read`

| Flag            | Type            | Default | Description                                                          |
| --------------- | --------------- | ------- | -------------------------------------------------------------------- |
| `--paths <g>`   | string[]        | (all)   | Restrict output to specific paths (POSIX extended-glob, repeatable). |
| `--summary-only`| boolean         | false   | Emit only the `summary` object, not the full document.               |

**Examples**:

```bash
# Full project dump as JSON
autosarcfg read --project ./demo.autosarcfg.json --format json

# Human-readable summary
autosarcfg read --project ./demo.autosarcfg.json

# Restrict to ComM module
autosarcfg read --project ./demo.autosarcfg.json --paths "/**/ComM/**" --format arxml-dump
```

### 7.3 `autosarcfg mutate`

| Flag            | Type    | Default | Description                                                                          |
| --------------- | ------- | ------- | ------------------------------------------------------------------------------------ |
| `--patch <p>`   | string  | (required) | Path to patch file, or `'-'` for stdin.                                          |
| `--dry-run`     | boolean | false   | Compute the result without writing; emit preview to stdout.                          |
| `--strict`      | boolean | false   | Treat any warning as exit 1 (default: warnings → exit 2).                            |
| `--backup`      | boolean | true    | Write `<file>.bak-<timestamp>` next to each mutated file before atomic rename.       |

**Examples**:

```bash
# Apply patch from file
autosarcfg mutate --project ./demo.autosarcfg.json --patch ./fix.yaml

# Dry-run from stdin
echo '{"autosarcfgPatchVersion":"1","steps":[]}' | autosarcfg mutate --project ./demo.autosarcfg.json --patch -

# CI-friendly: JSON output, strict mode
autosarcfg mutate --project ./demo.autosarcfg.json --patch ./fix.json --format json --strict
```

### 7.4 `autosarcfg validate`

| Flag            | Type    | Default | Description                                                          |
| --------------- | ------- | ------- | -------------------------------------------------------------------- |
| `--rules <id>`  | string[] | (all) | Restrict to specific rule IDs (no-op in v1 stub; reserved for G).    |
| `--severity <s>`| string  | (all)  | Filter output by severity: `error` / `warning` / `info`.             |

**v1 behavior**: emits `{ stub: true, results: [], ... }` and exits 0. G cluster replaces the body in v1.6.0 G-side.

### 7.5 Exit codes

| Code | Meaning                                | Stdout                                | Stderr                   |
| ---- | -------------------------------------- | ------------------------------------- | ------------------------ |
| `0`  | Success                                | `HeadlessResult` (or `--quiet` = empty) | logs (if `--verbose`)   |
| `1`  | Fatal error (parse, IO, internal)      | `HeadlessFailure` (if `--format json`)| human-readable message  |
| `2`  | Partial success (≥1 warning, no error) | `HeadlessResult` with `warnings[]`    | warning lines            |
| `3`  | Invalid input (bad flag, bad patch, unsupported version) | `HeadlessFailure` | usage hint        |

### 7.6 Process model

- **Standalone Node**: `node bin/autosarcfg.mjs ...` (no Electron, no `require('electron')`).
- **Distribution**: `bin/autosarcfg.mjs` ships in the npm package's `bin` field; pnpm/npm create a symlink. Windows users get `bin/autosarcfg.cmd` shim.
- **No daemon mode**: each invocation is a fresh process. `watch` mode is deferred to v1.7.0+.
- **No environment capture**: process does NOT read `process.env.HOME`-style secret files. Settings only.

---

## 8. Patch Format Specification (v1)

### 8.1 Top-level shape

```yaml
# fix.yaml
autosarcfgPatchVersion: "1"
metadata:
  author: "ci-bot"
  ticket: "JIRA-1234"
  description: "Set ComM bus wakeup timeout to 200ms"
steps:
  - op: set-param
    containerPath: /AUTOSAR/EcucDefs/ComM/ComMConfigSet
    paramName: ComMBusWakeupTimeout
    value: 200
  - op: add-child
    parentPath: /AUTOSAR/EcucDefs/ComM/ComMConfigSet
    shortName: ComMChannel_0
    definitionRef: /AUTOSAR/EcucDefs/ComM/ComMChannel
```

### 8.2 Step semantics

| `op`                  | Maps to (core API)                                  | Required fields                    | Optional fields        |
| --------------------- | --------------------------------------------------- | ---------------------------------- | ---------------------- |
| `add`                 | raw JSON Patch                                      | `path`, `value`                    | —                      |
| `remove`              | raw JSON Patch                                      | `path`                             | —                      |
| `replace`             | raw JSON Patch                                      | `path`, `value`                    | —                      |
| `set-param`           | `core/arxml/mutation.ts addParameter` (replace path) | `containerPath`, `paramName`, `value` | —                  |
| `add-child`           | `core/arxml/mutation.ts addContainer`               | `parentPath`, `shortName`          | `definitionRef`        |
| `remove-with-cascade` | `core/arxml/mutation.ts removeWithCascade`          | `containerPath`, `cascade`         | —                      |

### 8.3 Path syntax

- POSIX-style with `/` separators, even on Windows (normalized internally).
- Leading `/` required (RFC 6902 convention).
- Special characters in `shortName` (e.g. `ComM/ComSignal`) are escaped as `~1` per RFC 6901.
- For `set-param` / `add-child` / `remove-with-cascade`, the path is the **container** path (no trailing `/ParamName`).

### 8.4 Validation rules

- `autosarcfgPatchVersion` MUST equal `"1"`. Anything else → `unsupported-patch-version` (exit 3).
- `steps` MUST be a non-`undefined` array (empty array is legal — no-op).
- Each step is validated against its `op`-specific zod schema in `src/main/headless/patch/patch-validator.ts`.
- `definitionRef` in `add-child` is a HINT — the runtime attempts a BSWMD lookup; on miss, it falls back to the auto-resolved `ContainerDef` for `shortName` (matches the existing `addContainer` semantics from v1.5.0).
- Duplicate `set-param` against the same `containerPath + paramName` → the later one wins (matches in-memory store behavior).

### 8.5 Why not pure RFC 6902

- `set-param` / `add-child` / `remove-with-cascade` cannot be cleanly expressed as JSON Patch without baking AUTOSAR semantics into path strings (`/AUTOSAR/EcucDefs/ComM/.../ComMBusWakeupTimeout` is ambiguous between a parameter node and a container node).
- The extensions let CI scripts stay readable: `set-param` says exactly what it does.
- Future extensions (e.g. `add-reference-with-dest`) are easier to add than nested JSON Patch `add` with `value: { kind: 'reference', dest: 'PDU' }` payloads.

---

## 9. Error Handling

### 9.1 File errors

| Scenario                              | `HeadlessError.kind`     | Exit code | Message key                                           |
| ------------------------------------- | ------------------------ | --------- | ----------------------------------------------------- |
| `--project` path missing              | `file-not-found`         | 1         | `headless.error.projectNotFound`                      |
| ARXML parse failure                   | `parse-error`            | 1         | `headless.error.parseFailed` (with `path`, `line`)    |
| BSWMD parse failure                   | `parse-error`            | 1         | `headless.error.bswmdParseFailed` (with `path`)       |
| `--patch` path missing                | `file-not-found`         | 1         | `headless.error.patchNotFound`                        |
| EACCES on read or write               | `permission-denied`      | 1         | `headless.error.permissionDenied` (with `path`)       |
| Disk full during atomic write         | `write-failed`           | 1         | `headless.error.diskFull` (with `path`)               |
| `..` parent-traversal in any path     | `permission-denied`      | 1         | `headless.error.pathTraversal` (with `path`)          |

### 9.2 Patch errors

| Scenario                              | `HeadlessError.kind`            | Exit code | Message key                                   |
| ------------------------------------- | ------------------------------- | --------- | --------------------------------------------- |
| Missing `autosarcfgPatchVersion`      | `patch-invalid`                 | 3         | `headless.error.patchMissingVersion`          |
| `autosarcfgPatchVersion !== "1"`      | `unsupported-patch-version`     | 3         | `headless.error.unsupportedPatchVersion`      |
| Step missing required field           | `patch-invalid`                 | 3         | `headless.error.patchInvalidStep`             |
| Step `value` type mismatch            | `patch-invalid`                 | 3         | `headless.error.patchInvalidValue`            |
| Patch file is malformed YAML/JSON     | `patch-invalid`                 | 3         | `headless.error.patchParseFailed`             |

### 9.3 Mutation errors

| Scenario                              | `HeadlessError.kind`     | Exit code | Message key                                   |
| ------------------------------------- | ------------------------ | --------- | --------------------------------------------- |
| `applyMutation` returned `path-not-found` | `mutation-failed`    | 1         | `headless.error.mutationPathNotFound`         |
| Multiplicity violation                | `mutation-failed`        | 1         | `headless.error.mutationMultiplicity`         |
| Cascade cycle detected                | `mutation-failed`        | 1         | `headless.error.mutationCycle`                |
| Concurrent file lock (Windows)        | `write-failed`           | 1         | `headless.error.fileLocked`                   |
| Warnings only (non-strict)            | (in `warnings[]`)        | 2         | (no global error)                             |
| Warnings with `--strict`              | `mutation-failed`        | 1         | `headless.error.strictModeWarning`            |

### 9.4 Internal errors

- Catch-all: `internal-error` with `message = err.message` (no stack trace exposed; full stack in stderr if `--verbose`).
- Never silent-swallow (per `common/coding-style.md`).
- i18n: every error kind has an EN + ZH translation in `src/shared/i18n.ts` (`headless.error.*` namespace, 16 keys × 2 locales = 32 strings).

### 9.5 Error message format (summary)

```
ERROR [mutation-failed] at step 3: multiplicity exceeded
  path: /AUTOSAR/EcucDefs/ComM/ComMConfigSet/ComMChannel
  required: 0..5
  actual: 5

See `autosarcfg --help mutate` for details.
```

JSON form (`--format json` + non-zero exit):

```json
{
  "ok": false,
  "code": 1,
  "error": {
    "kind": "mutation-failed",
    "planId": "patch-2026-06-21T10:30:00Z",
    "errors": [
      { "stepIndex": 3, "kind": "add-child", "error": "multiplicity-exceeded" }
    ]
  },
  "stderr": ["[ERROR] step 3: multiplicity exceeded"]
}
```

---

## 10. Testing Strategy

### 10.1 Unit tests (per PR)

| PR                        | New unit tests                                            | Notes                                          |
| ------------------------- | --------------------------------------------------------- | ---------------------------------------------- |
| (1) headless store        | 6 (open/apply/error paths)                                | reuse 1557-test fuse                           |
| (2) patch parser          | 14 (RFC 6902 + extensions + invalid version + empty)      | zod-validated                                  |
| (3) command dispatcher    | 9 (read/mutate happy path + each error kind)              | snapshot per format                            |
| (4) validate stub + IPC   | 6 (stub returns + 3 IPC channel contracts)                | channel payload round-trip                     |
| (5) CLI binary + e2e      | 4 (process spawn: help / read / mutate / invalid input)   | `child_process.spawn` against built dist       |
| **Total**                 | **+39**                                                   | **1557 → ~1596 tests**                         |

### 10.2 Integration tests

```
test/headless/
  ├─ fixtures/
  │   ├─ demo.autosarcfg.json
  │   ├─ simple-patch.yaml
  │   ├─ empty-patch.yaml
  │   ├─ bad-version-patch.yaml
  │   └─ cascade-patch.yaml
  ├─ read-command.spec.ts             ← 4 cases (json/summary/arxml-dump/paths)
  ├─ mutate-command.spec.ts           ← 6 cases (happy/warning/error/dry-run/stdin/backup)
  └─ validate-command.spec.ts         ← 1 case (stub returns empty)
```

### 10.3 E2E (CLI binary)

```
test/e2e/headless/
  ├─ cli-binary.spec.ts               ← spawn `node bin/autosarcfg.mjs ...`
  │                                     4 scenarios: --help / read / mutate (real fixture) / mutate error
  └─ exit-codes.spec.ts               ← matrix of 12 (3 commands × 4 exit codes)
```

### 10.4 Coverage gate

| Type                          | Threshold                                                |
| ----------------------------- | -------------------------------------------------------- |
| Pure refactor (none in v1)    | n/a                                                      |
| New module (CLI + store)      | New code ≥ 90% stmts / 80% branches; critical paths 100% |
| Patch parser                  | New code ≥ 95% stmts / 90% branches (high-risk surface)  |
| **Total**                     | **≥ 95.5% stmts / ≥ 87% branches** (matches v1.5.1 bar)  |

### 10.5 Performance benchmark (warn-only)

```ts
test('5MB project load', async () => {
  const start = Date.now();
  const out = await runCli(['read', '--project', FIXTURE_5MB]);
  expect(Date.now() - start).toBeLessThan(2000); // 2s vs GUI 5s (headless)
  expect(JSON.parse(out.stdout).summary.moduleCount).toBeGreaterThan(0);
});

test('10-step patch apply', async () => {
  const start = Date.now();
  const out = await runCli(['mutate', '--project', FIXTURE, '--patch', PATCH_10_STEPS]);
  expect(Date.now() - start).toBeLessThan(1000); // 1s for 10 steps
  expect(JSON.parse(out.stdout).stepsApplied).toBe(10);
});
```

Not a merge gate; regression alarm.

### 10.6 Cross-Spec Integration Tests

A+C is critical-path. The cluster's IPC contract (`headless:*:v1`) is the SoT that G / W / U import; W's Demo ECU manifest path is the entry point both GUI and CLI share. Cross-spec integration tests must verify end-to-end behavior across these boundaries before any cluster ships.

Integration test matrix (9 cross-spec scenarios):

| # | Scenario | A+C role | Other cluster role | Test file | Status |
|---|----------|----------|--------------------|-----------|--------|
| 1 | CLI read ARXML (existing fixture) | read path | n/a | `integration/cli-read.test.ts` | ✅ existing |
| 2 | CLI mutate + write (existing fixture) | mutate path | n/a | `integration/cli-mutate.test.ts` | ✅ existing |
| 3 | CLI `--validate` stub emits `headless:validate-result:v1` | emit empty result + `stub: true` | G receives | `integration/cli-validate-stub.test.ts` | ❌ TODO R2 |
| 4 | W Demo ECU loaded via CLI (`samples/arxml/demo-ecu/demo.autosarcfg.json`) | read Demo ECU manifest | W spec §2.5 manifest schema | `integration/w-demo-ecu.test.ts` | ❌ TODO R2 |
| 5 | G validation result piped to CLI stdout | receive A+C event → format | G spec §5.1.1 `toWireResult` | `integration/g-result-cli.test.ts` | ❌ TODO R2 |
| 6 | U command palette "Run Script" | n/a (A+C out-of-scope; G/U v1.3.0 Script Engine path) | U spec §3.4 + v1.3.0 Script Engine | n/a (U own test) | U-side |
| 7 | U shortcut `Mod+S` triggers A+C save path | mutate path (write via `applyMutation`) | U spec §5.2 `Mod+S` Save | `integration/u-save-shortcut.test.ts` | ❌ TODO R2 (v1.7.0 GUI bridge) |
| 8 | W tour validation paused → G debounce skips | observe via renderer-process `useArxmlStore.subscribe` (in-process, W-owned renderer event; A+C test observes via Vitest + jsdom — per Round 3 fix, 2026-06-21) | W spec §3.7 `tour:state-changed` canonical (in-process) + G spec §3.9 debounce gate | `integration/tour-pause-validator.test.ts` | ❌ TODO R2 |
| 9 | G sandbox parity vs v1.3.0 Script Engine vm-runner | n/a (A+C `--validate` stub tree-shakes sandbox) | G spec H1 (vm-runner copy) | G-side | n/a (G own test) |

**Each TODO row above** is implementation work for the plan-stage task list. The plan writer must assign an owner (per cluster), a test file path, and a merge wave slot. None of the 6 TODO rows block spec-stage exit; they are plan-stage deliverables under H7 (synthesizer §3 + §5). A+C's own contribution to each row is bound by §6 (IPC contract) and §7.1 (`--platform` flag → Q8 SoT).

---

## 11. Acceptance Criteria

### BLOCK (must all pass to ship)

| #   | Item                                                          | Verification                          |
| --- | ------------------------------------------------------------- | ------------------------------------- |
| 1   | All 5 PRs merged to main                                      | `git log --oneline ^v1.5.1..HEAD`     |
| 2   | Tests pass                                                    | `pnpm test` — 1557 → ~1596            |
| 3   | Coverage gate                                                 | `pnpm test:coverage` — ≥ 95.5 / ≥ 87  |
| 4   | 3 IPC channels registered with correct payload types          | `pnpm typecheck` (uses `IpcChannel`)  |
| 5   | 0 type errors, 0 lint errors                                  | `pnpm typecheck && pnpm lint`         |
| 6   | Build success; bundle ≤ 850 kB                                | `pnpm build`                          |
| 7   | CLI binary runs without Electron                              | `node bin/autosarcfg.mjs --help`      |
| 8   | i18n EN + ZH coverage for 16 error keys                       | `pnpm test:i18n`                      |
| 9   | Round-trip: read → mutate (noop) → read produces same JSON    | `test/headless/round-trip.spec.ts`     |
| 10  | Patch parser rejects unknown version (exit 3)                 | `test/headless/patch-version.spec.ts`  |
| 11  | Atomic write never partial-writes                             | `test/headless/atomic-write.spec.ts`   |
| 12  | `experimental.headlessCli` documented in `settings.json` schema | grep config doc                    |
| 13  | 9/9 cross-spec integration tests pass (per §10.6 matrix)  | `pnpm test:integration` — `integration/{cli-read,cli-mutate,cli-validate-stub,w-demo-ecu,g-result-cli,u-save-shortcut,tour-pause-validator}.test.ts` + G-side + U-side parity |

### WARN (should pass, ship if minor miss)

| #   | Item                                                          | Verification   |
| --- | ------------------------------------------------------------- | -------------- |
| 13  | 5MB load < 2s                                                 | benchmark      |
| 14  | 10-step patch < 1s                                            | benchmark      |
| 15  | code-reviewer 0 C / ≤ 2 H / ≤ 5 M                             | per-PR review  |
| 16  | 4 exit codes documented in `--help` output                    | manual smoke   |

### OUT of scope (v1.6.0 A+C explicitly does NOT deliver)

- ❌ GUI "Run CLI" button (deferred to v1.7.0 U; flag-gated)
- ❌ Real validator rules (Cluster G, v1.6.0 G-side)
- ❌ Watch mode (`autosarcfg watch`, v1.7.0+)
- ❌ Plugin system for external validators (v1.7.0+)
- ❌ Remote / RPC mode (deferred permanently)
- ❌ Cross-platform shell shims beyond `.cmd` (deferred)
- ❌ DBC ↔ ECUC bridge (Cluster I, v1.7.0)

---

## 12. Ship Mechanics

- **Tag**: `v1.6.0` (MINOR bump; package.json 1.5.1 → 1.6.0)
- **Release notes**: reuse v1.5.0/v1.4.x template; emphasize "headless CI integration"
- **Emphasis**: "ESLint of AUTOSAR" — first non-GUI surface; CI is the on-ramp
- **GH release**: manual (gh CLI still not installed)
- **Memory**: write `claude-autosarcfg-v1-6-0-AC-shipped.md` after tag
- **CHANGELOG**: 3 entries (Cluster A+C ships; G/U ships later in v1.6.0; IPC contract frozen at `:v1`)

---

## 13. Risk Register

| Risk                                              | Likelihood | Impact | Mitigation                                                       |
| ------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------- |
| Patch format over-fitted to current schema        | M          | P2     | Q11 strict versioning + `unsupported-patch-version` exit code    |
| CLI binary drags in unwanted deps                 | L          | P1     | PR(5) bundles only `core/` + `shared/` + `headless/`; check size  |
| Atomic write regression (inherited from v1.5.1)   | L          | P0     | 1557 tests as fuse + dedicated atomic-write spec                  |
| IPC channel breaking change                       | L          | P1     | `:v1` suffix + additive-only policy + freeze at v1.6.0 tag        |
| i18n key missing for one of 16 errors             | M          | P3     | `pnpm test:i18n` snapshot; fail build on missing key             |
| Windows path handling differs from POSIX          | M          | P2     | reuse `isPathInside` (v1.5.1 PR(1)) + `path.normalize` everywhere |
| Cluster G spec drift invalidates IPC contract     | M          | P1     | PR(4) ships contract FIRST; G/W/U reference §6 verbatim          |
| `--streaming` / `--cache` flag override misuse     | L          | P3     | `--no-streaming`/`--no-cache` explicit; flag changes logged      |
| Stdin buffering for very large patches            | L          | P3     | Read in chunks; cap at 64 MiB (above v1.5.1 BSWMD cap)           |
| Cluster U palette references wrong channel name   | L          | P2     | Re-export all 3 channels from `IPC_CHANNELS`; single source      |

---

## 14. Migration / Backward Compatibility

- **GUI is unaffected**: The CLI is a separate process; no renderer code changes in v1.6.0 A+C.
- **`useArxmlStore` is unaffected**: The 7 slices (v1.5.1 PR(5)) keep their existing API. A+C adds a parallel `HeadlessStoreContext`, never the renderer store.
- **IPC channels are additive**: 3 new channels (`headless:*:v1`); 32 existing channels unchanged. Per `common/security.md` "Add new features without breaking existing interfaces".
- **Patch files**: pre-v1.6.0 patch files do not exist (new format). No migration needed.
- **Manifests**: v1.6.0 uses the same `.autosarcfg.json` v1 schema (Sprint 11); no `schemaVersion` bump required.
- **Feature flag default OFF**: `experimental.headlessCli` is OFF; users opt in by editing `settings.json`. Default behavior (everything off) = identical to v1.5.1.

---

## 15. Dependencies

### New npm dependencies (production)

- **`commander` ^12** — CLI parser. Zero deps. MIT.

### No new devDependencies

All test tooling (vitest, playwright) already present.

---

## 16. References

- [[claude-autosarcfg-v1-6-brainstorm]] — source brainstorm, locked decisions
- [[claude-autosarcfg-v1-5-1-shipped]] (forthcoming) — Foundation sprint that v1.6.0 A+C builds on
- [[claude-autosarcfg-overview]] — project state
- `docs/superpowers/specs/2026-06-21-v1-5-1-foundation-design.md` — input contracts (NormalizedDocument, MutationResult, feature flags)
- `docs/superpowers/specs/2026-06-18-script-engine-design.md` — reference for sandboxed-execution patterns (vm-runner; CLI uses `node:vm`-style isolation in `--strict` mode? deferred)
- `src/shared/ipc-contract.ts` — existing 32 channels; A+C adds 3 more
- `src/main/ipc/projectSaveHandler.ts` — `writeAtomic()` helper reused
- `src/core/arxml/mutation.ts` — `applyMutation` (v1.5.1 PR(4) realized)
- `src/main/arxml-stream/router.ts` — feature flag pattern reused for `experimental.headlessCli`
- `src/shared/normalized-document.ts` — `NormalizedDocument` is the read-side contract

---

## 17. Open Questions for User

1. **`commander.js` vs `yargs` vs `cac`** — chose commander.js for bundle size + ecosystem. Want to confirm before locking in `package.json`.
2. **`--backup` default `true`** — chose default-on because atomic-rename overwrites the user's file, and `mv`-style backups are the convention in this domain (AUTOSAR tools, CI scripts). Want confirmation before default-on ships.
3. **i18n string count (16)** — chose 16 keys × 2 locales = 32 strings. Can reduce to 8 if some errors share a generic message, but that hurts grep-ability. Confirm 16.
4. **Streaming/cache flag inheritance** — chose "CLI reads `settings.json` + flag override". Alternative: CLI ignores `settings.json` and reads env vars only. Confirm settings.json inheritance.
5. **`PatchDocument.metadata` round-trip** — chose to round-trip metadata into the result envelope for audit. Alternative: drop it. Confirm round-trip.
6. **Cluster U Cmd-K palette pre-stub** — Should the v1.6.0 A+C release ship a `Cmd-K → "Run last CLI command"` placeholder that no-ops with "G cluster pending", or wait for U entirely? Recommend wait (avoids dead UI in v1.6.0).
7. **Cluster G contract alignment** — G cluster will fill in `--validate`. The shape `ValidatorResult { ruleId, severity, path, message, i18nKey? }` is locked here. Confirm before G spec writes.
8. **(NEW) Cross-cluster platform SoT resolution** — `process.platform` is the canonical SoT for cross-cluster platform detection. CLI default reads it directly via Node.js builtin (no IPC); `--platform` flag (§7.1) is the explicit override. U cluster consumes the same SoT via preload bridge (no `getPlatform()` IPC channel needed). Locked per Round 1 re-review F2 + U spec §10.0 row 3 forward-cite + synthesizer §3 H6. Reference: §7.1 `--platform` flag row.