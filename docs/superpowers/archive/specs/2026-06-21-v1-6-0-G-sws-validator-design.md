# claude-AutosarCfg v1.6.0 — Cluster G: SWS Validator Framework Design

**Date**: 2026-06-21
**Author**: brainstorm output (Cluster G spec writer)
**Status**: DRAFT — pending user review of open questions
**Type**: v1.6.0 MINOR sprint, Cluster G (3 of 4 v1.6.0 clusters)
**Source brainstorm memory**: [[claude-AutosarCfg-v1-6-brainstorm]]
**Sibling clusters**: W (Onboarding), A+C (Headless CLI), U (Keyboard)
**Depends on**: v1.5.1 Foundation (`NormalizedDocument`, `applyMutation`), A+C framework's `--validate` IPC stub

---

## 0. Why Cluster G

Cluster G is one of four v1.6.0 clusters locked in the brainstorm
([claude-AutosarCfg-v1-6-brainstorm]). v1.5.1 ships the `NormalizedDocument`
abstraction, real `applyMutation`, and `preserveSourceOrder` — the foundation
G needs. A+C ships a `--validate` stub that just returns `ok: true`; G
replaces the stub with a real validator engine and 4 AUTOSAR SWS-conformant
starter rules (C1, C3, C4, C5; C2 deferred to v1.7.0).

G delivers the **"ESLint of AUTOSAR"** narrative: rule-based, plugin-style,
machine-checkable SWS conformance for BSW module configuration. The cluster
is intentionally narrow (framework + starter rules, no rule UI editor) so it
can ship inside the v1.6.0 window alongside W / A+C / U.

### 0.1 Roadmap placement

```
v1.5.1 (shipped)  →  v1.6.0 (this sprint, 4 clusters)  →  v1.7.0 (Cluster 3)
   foundation            W + A+C + G + U                  I + K + N
                          ↑↑↑
                          Cluster G is here
```

G is **parallel-after-A+C-framework**: the rule framework itself can land
any time after v1.5.1 ships, but the CLI integration (`--validate`) needs
A+C's IPC stub to be present so G can swap the implementation.

## 1. Scope

### In scope (G cluster)

1. **ValidatorEngine** — single entry point that takes a normalized
   project state + a rule registry and returns a flat
   `ValidatorResult[]` array.
2. **Rule interface** (TypeScript) — `interface ValidatorRule` with
   `id`, `defaultSeverity`, `messageKey`, `check(ctx)`.
3. **RuleRegistry** — built-in registry that ships 4 starter rules
   (C1, C3, C4, C5; C2 deferred to v1.7.0) and exposes a `register(rule)`
   API for user-defined drop-in rules.
4. **RuleLoader** — drop-in mechanism: load `*.validator.ts` files from
   `<projectDir>/.sws-validators/` and from a user-global directory
   (`~/.claude-AutosarCfg/validators/`).
5. **ValidationContext** — read-only view over `NormalizedDocument` +
   `SchemaLayer` + runtime metadata (locale, BSWMD module list).
6. **Sandbox** — user-defined rules execute in a hardened `node:vm`
   context with whitelisted APIs. Reuse v1.3.0 Script Engine's
   `vm-runner.ts` patterns.
7. **GUI integration** — bottom-of-window validation panel that surfaces
   `ValidatorResult[]`, supports click-to-navigate (path → store action),
   severity filtering, and a manual re-run trigger.
8. **CLI integration** — A+C `--validate` (currently a stub returning
   `ok: true`) routes through `ValidatorEngine.run` and emits a
   machine-readable report (JSON + summary on stderr).
9. **Feature flag** — `experimental.swsValidator` default OFF.
10. **i18n** — every rule's `messageKey` resolves in zh-CN + en via the
    existing `src/shared/i18n.ts` system.
11. **4 starter rules** — see §4.6 (locked: C1, C3, C4, C5; C2 `SWS_COMM_CHANNEL_PDUR_ALIGN` deferred to v1.7.0 as alignment warning is subjective and likely to produce false positives).

### Out of scope (explicit non-goals for v1.6.0)

- **Custom rule UI editor** — users write rules in their editor of
  choice and drop the `.validator.ts` file into the loader directory.
  In-app rule authoring is **v1.7.0+**.
- **Per-rule severity override UI** — severity comes from the rule's
  `defaultSeverity`. Future UI override deferred.
- **Rule dependency graph** — rules are independent. Cross-rule
  choreography deferred.
- **Auto-fix (`fix?` field)** — `ValidatorResult.fix` is a documented
  optional field but **no starter rule emits it in v1.6.0**. Auto-apply
  is v1.7.0+.
- **Remote rule registry / marketplace** — local files only.
- **Cluster 3 features** — DBC↔ECUC bridge (I), BSWMD-free stencil
  wizard (K), ASPICE traceability (N). All v1.7.0+.
- **Variants (B)** — v1.8.0+. Rules ignore `POST-BUILD-VARIANT-CONDITION`
  entirely in v1.6.0 (we explicitly do **not** validate variant
  conditions).
- **UDS/DoIP (J)** — parked on `research/uds-doip` branch, not part
  of G.
- **Lint rules for `claude-autosar` v0.4** — that is a separate Python
  project; G does **not** touch Python lint rules.

## 2. Decisions Locked

| #   | Question                                | Answer                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1  | Where do validators live in code?       | **A — `src/core/sws-validator/`** parallel to existing `src/core/validation/`. Reuse `ValidationError` / `ValidationContext` types where shapes match.                                                                                                                                                                                                                                                             |
| G2  | Rule file format                        | **C — TypeScript ESM `.validator.ts`** (matches project ESM-only rule, matches v1.3.0 Script Engine user-script shape).                                                                                                                                                                                                                                                                                            |
| G3  | Sandbox mechanism                       | **B — `node:vm` reuse** from Sprint 14 Script Engine `vm-runner.ts`. Same whitelisted ctx API (no `fs`, no `process`, read-only project).                                                                                                                                                                                                                                                                          |
| G4  | Rule loader directory                   | **D — dual**: `<projectDir>/.sws-validators/` + user-global `~/.claude-AutosarCfg/validators/`. Both load order: user-global first.                                                                                                                                                                                                                                                                                |
| G5  | Feature flag                            | **A — `experimental.swsValidator` default OFF**, follows v1.5.1 PR(6) pattern (`src/main/arxml-stream/feature-flag.ts`).                                                                                                                                                                                                                                                                                           |
| G6  | Starter rule count                      | **4 rules locked**: C1 `SWS_COM_PDUID_UNIQUE` + C3 `SWS_PDUR_ROUTING_COMPLETE` + C4 `SWS_ECUC_MULTIPLICITY_MIN` + C5 `SWS_BSWMD_DEPS_PRESENT`. C2 `SWS_COMM_CHANNEL_PDUR_ALIGN` deferred to v1.7.0 (alignment warning is subjective; high false-positive risk per G reviewer).                                                                                                                                     |
| G7  | GUI integration                         | **B — dedicated `ValidationPanel` component** docked at the bottom of the window (parallel to Issues panel), toggleable via toolbar.                                                                                                                                                                                                                                                                               |
| G8  | CLI integration                         | **A — replace A+C `--validate` stub** with full `ValidatorEngine.run` + machine-readable JSON output.                                                                                                                                                                                                                                                                                                              |
| G9  | i18n key shape                          | **A — `swsValidator.<ruleId>.<variant>`** with at least 2 keys per starter rule (short + long variant).                                                                                                                                                                                                                                                                                                            |
| G10 | Where does `validate` IPC channel live? | **A — `IPC_CHANNELS` in `src/shared/ipc-contract.ts`** as new keys `SWS_VALIDATE: 'sws-validator:run:v1'` + `SWS_VALIDATE_CANCEL: 'sws-validator:cancel:v1'`. Adopt `:v1` suffix per A+C §6 IPC versioning policy (channels frozen at v1.6.0 tag; v1.7.0 introduces `:v2` for breaking changes). (CLI uses main-process invocation, not IPC, but the GUI↔main boundary still needs a channel for `runValidation`.) |

### Decisions pending user review (locked by user, not by spec)

- **G6-starter-set** — **RESOLVED 2026-06-21**: 4 rules locked (C1, C3, C4, C5; C2 deferred). See G6 row above.
- **G7-panel-default-state** — collapsed by default vs open? Spec says
  collapsed; user may override.
- **G8-cli-output-format** — JSON-only in v1.6.0; SARIF deferred to v1.7.0.

## 3. Build Approach

**Approach 1 — Vertical Slice (chosen)**. 5 PRs ordered by dependency:

```
Wave 1 (parallel after v1.5.1 ships):
  PR(G1) core/sws-validator types + engine + ValidationContext
  PR(G2) starter rules 1–4 (C1, C3, C4, C5; independent of G3–G5)
  PR(G3) RuleLoader + sandbox

Wave 2 (depends on Wave 1):
  PR(G4) GUI ValidationPanel + store hook

Wave 3 (depends on Wave 1, parallel with G4):
  PR(G5) CLI integration (replaces A+C --validate stub)
                        ↓
                   v1.6.0 tag
```

Total: 3–4 weeks per the brainstorm. Each PR ≤ 500 lines except G5
(≈ 600 lines for CLI output formatting + SARIF adapter).

### Why not Big-Bang

v1.5.0 BSWMD-picker + v1.5.1 Foundation both demonstrated that
parallel-feature PRs (each individually reviewable) catch bugs faster
than a single 2000-line mega-PR.

### Why not just bolt onto Script Engine

Tempting (G could ship as `script:run kind: 'validator'`). **Rejected**
because:

1. Script Engine's `ScriptViolation` carries `kind: 'script:xxx'` (no
   cross-module kind registry) — G needs a stable kind taxonomy
   (`SWS_COM`, `SWS_COMM`, etc.) so external tooling can parse the output.
2. Script Engine is single-threaded synchronous; G's GUI integration
   wants debounced incremental re-runs (300ms after edit). Different
   scheduling model.
3. Script Engine sandboxes per-project; G sandboxes per-rule and
   reuses the same vm machinery but with a different ctx API (read-only
   project, no mutation).
4. External tool consumption (SARIF / CI integration) wants a
   stable CLI; Script Engine is GUI-scripting-oriented.

G still **borrows** the vm-runner.ts implementation and the
whitelist. Reuse, don't fork. See §3.8 below for the v1.6.0 copy
vs. v1.7.0 shared-extraction plan + the parity-test mitigation.

### 3.8 Sandbox strategy (v1.6.0 copy + v1.7.0 extraction + parity test mitigation)

**v1.6.0 sandbox strategy** (per synthesizer H1 fix, locked 2026-06-21):

- **Copy** `src/main/script/vm-runner.ts` →
  `src/core/sws-validator/sandbox/vm-runner.ts` (NOT direct import).
- **Rationale**: G's `RuleCtx` API ≠ Script Engine's `ScriptCtx`. G's
  `RuleCtx` is **read-only** + exposes `log` + a `result()` helper;
  Script Engine's `ScriptCtx` supports mutation + `applyMutation` etc.
  Direct import would force one side to absorb the other's API.
- **v1.7.0 plan**: extract `src/core/sandbox/vm-runner.ts` as the
  canonical SoT; both consumers (G validator rules + v1.3.0 Script
  Engine) bind to it via a thin adapter layer (each consumer provides
  its own ctx API; the underlying vm-runner accepts the ctx shape via
  DI). Tracked as a v1.7.0 plan-stage task (not in v1.6.0 scope).
- **v1.6.0 mitigation**: 1-file parity test
  (`src/core/sws-validator/sandbox/__parity__.test.ts`) asserting
  the blocked-module list + allowed-env-vars + globalThis-write
  blocking + eval/Function-constructor blocking match the v1.3.0
  Script Engine source verbatim. ~30 LOC; high leverage
  (catches the most likely drift). See §8.1 G3 row.

### 3.9 Tour ↔ Validator coordination (cross-store coupling with W)

**Why this section exists** (per synthesizer H3 fix, locked 2026-06-21):

W's 5-step tour runs a first-run overlay; if the user edits a value
mid-tour (Step 3 highlights the ECUC editor), G's 300ms debounce would
fire background validation runs (each ≤ 500 ms on a 1000-node project
per §8.5 budget). These runs could stutter the tour animation and
leak intermediate errors into the right pane while the spotlight is
on the left/middle panes. G must skip validation while the tour is
running and the validation panel should be paused.

**Coordination contract** (locked with W spec Round 3 fix, 2026-06-21;
in-process zustand subscription per W's canonical design — NO new IPC
channel):

1. W spec adds `validationPaused: boolean` to `TourState` (in addition
   to the existing 5-kind union). Set `true` whenever
   `tourState.kind === 'running'` (all 5 `currentStep` values 0-4).
2. W spec publishes `tour:state-changed` to the **renderer event bus**
   via the existing `useArxmlStore.subscribe()` (no new IPC channel —
   pure in-process, renderer-only). Event payload:
   `{ readonly state: TourState; readonly validationPaused: boolean }`.
   Event fires on every `TourState` transition (start / advance / back /
   skip / complete / reset). See W spec §3.7 for the canonical
   description of this propagation mechanism.
3. G's `swsValidatorSlice` subscribes via
   `useArxmlStore.subscribe(state => state.tour, (tour) => { validationPaused = tour.kind === 'running'; })`
   (in-process, renderer-only, 0 new IPC, 0 main involvement) and
   mirrors the value into a local `tourState: { validationPaused: boolean }`
   field on the `ValidationContext` (see §5.1).
4. G's debounce handler early-returns `[]` when `validationPaused === true`.
   No warning emitted; silent skip is the expected behavior during a
   tour. See §7.5.

**Implementation sketch** (`src/core/sws-validator/engine.ts` — line N
to be confirmed at plan-stage):

```ts
import { useArxmlStore } from 'src/renderer/store/useArxmlStore';

// In-process subscribe at engine-init time (renderer-only path).
// Mirrors W's tourSlice state via zustand subscription — no IPC.
let validationPaused = false;
useArxmlStore.subscribe(
  (state) => state.tour,
  (tour) => {
    validationPaused = tour.kind === 'running';
  },
);

const debouncedRun = debounce(
  (projectState: { document: NormalizedDocument; schemaLayer: SchemaLayer | null }) => {
    // Tour coordination per §3.9: silent skip when W tour is running.
    // No warning; the user knows the tour is up.
    if (validationPaused) {
      return [] as readonly InternalValidatorResult[];
    }
    return runValidators(projectState);
  },
  300,
);
```

**Why in-process zustand subscription, not new IPC channel** (per
Round 3 fix, 2026-06-21): W and G slices are both composed into the
same `useArxmlStore` (per v1.5.1 PR(5) split). Cross-slice reads via
`useArxmlStore.subscribe()` keep the slice module graph one-directional
(G does not import W, W does not import G) and avoid the cost of a
new M→R IPC channel + main-process handler. Headless CLI does not
observe tour state (no tour in CLI); the `headless:validate-result:v1`
event (A+C §6 channel 3) remains separate and is consumed by G's
CLI integration only.

**Cross-spec references**:

- W spec §3.3 `TourState` (post-Round 3) + §3.7 `tour:state-changed`
  in-process propagation (canonical; Round 3 fix)
- A+C spec §10.6 cross-spec integration matrix (row #8: W tour validation paused → G debounce skip; renderer-process observer via Vitest + jsdom)
- See §7.5 for the silent-skip error-handling policy.

## 4. Architecture & Components

### 4.1 Module map

```
src/core/sws-validator/                     ← new sub-path
  ├─ types.ts                               ← ValidatorRule, ValidatorResult, ValidationContext
  ├─ engine.ts                              ← ValidatorEngine.run(state, opts)
  ├─ registry.ts                            ← RuleRegistry.register / getAll / getByKind
  ├─ loader.ts                              ← RuleLoader.load(dir)
  ├─ context.ts                             ← ValidationContext builder (read-only view)
  ├─ errors.ts                              ← SwsValidatorError discriminated union
  ├─ starter/
  │   ├─ com-pduid-uniqueness.ts            ← SWS_COM_PDUID_UNIQUE
  │   ├─ pdur-routing-completeness.ts       ← SWS_PDUR_ROUTING_COMPLETE
  │   ├─ ecuc-multiplicity-min.ts           ← SWS_ECUC_MULTIPLICITY_MIN
  │   └─ bswmd-module-deps.ts               ← SWS_BSWMD_DEPS_PRESENT
  │                                          (C2 SWS_COMM_CHANNEL_PDUR_ALIGN deferred to v1.7.0)
  ├─ sandbox/
  │   ├─ vm-runner.ts                       ← forks Sprint 14 #1 vm-runner.ts
  │   └─ ctx-api.ts                         ← whitelisted ctx surface for user rules
  └─ __tests__/
      ├─ engine.test.ts
      ├─ registry.test.ts
      ├─ loader.test.ts
      ├─ starter/*.test.ts
      └─ sandbox/vm-runner.test.ts

src/main/ipc/
  └─ sws-validator-handler.ts               ← new IPC handler for GUI→main

src/renderer/
  ├─ components/ValidationPanel/
  │   ├─ ValidationPanel.tsx
  │   ├─ ValidationPanel.module.css
  │   └─ __tests__/ValidationPanel.test.tsx
  └─ store/slices/swsValidatorSlice.ts      ← new zustand slice

src/main/arxml-stream/feature-flag.ts       ← MODIFY: add `experimental.swsValidator`
src/shared/ipc-contract.ts                 ← MODIFY: add `SWS_VALIDATE: 'sws-validator:run:v1'` + `SWS_VALIDATE_CANCEL: 'sws-validator:cancel:v1'` (`:v1` suffix per A+C §6)
src/shared/i18n.ts                         ← MODIFY: add swsValidator.* keys
src/core/sws-validator/adapter.ts          ← NEW: toWireResult() translator (C1 fix; see §5.1.1)
```

### 4.2 Reused modules (no modifications)

- `src/core/validation/` — existing `ValidationError`, `ValidationResult`,
  `validateProjectForRenderer` stay untouched. G adds **parallel** types
  (`InternalValidatorResult`, `SwsValidatorErrorKind`) because the rule
  taxonomy is different (SWS-rule-id vs `ValidationErrorKind`). The
  wire shape (`ValidatorResult`) is imported from A+C's contract — see §5.1.
- `src/core/arxml/types.ts` — `ArxmlDocument`, `ArxmlModule`,
  `ArxmlContainer`, `ArxmlReference` reused for input shape.
- `src/shared/normalized-document.ts` (v1.5.1) — primary input to
  `ValidatorEngine.run`.
- `src/shared/runtime-schema.ts` (`SchemaLayer`) — passed to the
  context for rules that need to query BSWMD params.
- `src/main/script/vm-runner.ts` (v1.3.0 Script Engine) — copied /
  re-exported, not imported directly (different ctx API surface). See
  §3.8 "Sandbox strategy" below for the v1.6.0 copy / v1.7.0 extraction
  plan + parity test mitigation.
- `src/renderer/store/slices/ecucSlice.ts` (v1.5.1) — `setParam` /
  `removeChild` store actions reused for "click error → jump to path".

### 4.3 Component responsibilities

| Component               | Responsibility                                                                                 | Layer    |
| ----------------------- | ---------------------------------------------------------------------------------------------- | -------- |
| `ValidatorEngine`       | Orchestrates: build context → for each rule call `check(ctx)` → aggregate → enforce timeout.   | core     |
| `RuleRegistry`          | Owns the rule set. `register(rule)` at startup; `getAll()` returns snapshot.                   | core     |
| `RuleLoader`            | Reads `.validator.ts` files, evaluates them in the sandbox, registers returned rules.          | core     |
| `ValidationContext`     | Read-only view over project state. Each `check(ctx)` call receives a fresh context.            | core     |
| `Starter rules`         | 3–5 hardcoded rules in `core/sws-validator/starter/`. Each is a 50–100 line pure function.     | core     |
| `sws-validator-handler` | IPC handler: `ipcMain.handle('sws-validator:run:v1', ...)`. Bridge between renderer and main.  | main     |
| `ValidationPanel`       | React component. Lists results, severity filter, click-to-navigate.                            | renderer |
| `swsValidatorSlice`     | Zustand slice. Holds `results`, `running`, `lastRunAt`, `enabled`. Calls engine via IPC.       | renderer |
| Feature flag            | `experimental.swsValidator` default OFF. Both GUI panel mount and CLI `--validate` check this. | main     |

### 4.4 Data flow

```
                ┌────────────────────────────────────────────────────┐
                │ NormalizedDocument (v1.5.1 PR4)                    │
                │ SchemaLayer (Sprint 12 #2 / runtime-schema.ts)     │
                │ Locale (zh-CN | en)                                │
                └─────────────────────┬──────────────────────────────┘
                                      │
                                      ▼
                          ┌───────────────────────┐
                          │ buildContext(state)   │
                          │ → ValidationContext   │
                          └───────────┬───────────┘
                                      │
                                      ▼
   ┌─────────────┐      ┌────────────────────────────────────────────┐
   │ RuleRegistry│─────▶│ ValidatorEngine.run(ctx, opts)             │
   │ (built-in + │      │  for rule of rules:                         │
   │  loaded)    │      │    withTimeout(rule.check(ctx), 5s)         │
   └─────────────┘      │  collect → sort by severity+path            │
                        └───────────┬────────────────────────────────┘
                                    │
                                    ▼
                       ┌────────────────────────┐
                       │ InternalValidatorResult[] (engine)  │
                       │          │  toWireResult() (adapter) │
                       │          ▼                              │
                       │ ValidatorResult[] (wire / A+C)        │
                       └─────────┬──────────────┘
                                 │
                ┌────────────────┼──────────────────┐
                ▼                ▼                  ▼
       ┌─────────────┐    ┌──────────────┐    ┌──────────────┐
       │ GUI store   │    │ CLI stdout   │    │ SARIF output │
       │ (slice)     │    │ (JSON)       │    │ (--format)   │
       └─────────────┘    └──────────────┘    └──────────────┘
```

### 4.5 IPC integration

**Path split (by design, clarified Round 3 2026-06-21)**: wire types
(`ValidatorResult` / `HeadlessCommand` / `HeadlessResult` / `HeadlessError`
etc.) live in `src/shared/headless/ipc-contract.ts` (A+C §6 canonical
SoT — the canonical wire-shape SoT path). IPC channel constants (32
existing v1.5.1 channels + 3 new `:v1` A+C channels + 2 new `:v1` G
channels) live in `src/shared/ipc-contract.ts` (v1.5.1 PR(5) split,
per the W §11 References round-trip). G imports both paths as needed;
the two files are separate by design — IPC channels are channel-name
constants for `contextBridge` / `ipcRenderer` / `ipcMain`; validator
wire types are TS interfaces describing message payloads. No path
conflict.

**RESOLVED 2026-06-21**: A+C spec
(`2026-06-21-v1-6-0-AC-headless-cli-design.md`) ships canonical
`ValidatorResult` + IPC channels (see A+C §6 IPC Contract Reference).
G adopts via the changes in §5.1 (`InternalValidatorResult` +
`toWireResult()` translator) and the channel renames below. The
PENDING banner that previously appeared here is closed per
synthesizer C1 + C3 fixes.

**GUI ↔ Main channel (locked by G, `:v1` suffix per A+C §6)**:

```ts
// src/shared/ipc-contract.ts — G adds (post-C3 rename):
SWS_VALIDATE: 'sws-validator:run:v1',
SWS_VALIDATE_CANCEL: 'sws-validator:cancel:v1',
```

> **Versioning rationale**: All v1.6.0 channels use the `:v1` suffix
> (A+C §6: "v1.6.0 ships `:v1` channels. They MUST NOT be modified
> after v1.6.0 tag. Breaking changes introduce `:v2` channels").
> G's original `sws-validator:run` (no suffix) violated this policy
> in the same release; rename to `:v1` brings G into compliance. Note:
> this `:v1` rule applies only to IPC channels (over the
> `contextBridge` / `ipcRenderer` boundary). Renderer-internal events
> like W's `tour:state-changed` (per §3.9 + W §3.7) stay in-process
> via `useArxmlStore.subscribe` and are NOT subject to the `:v1`
> suffix policy.

Request (renderer → main):

```ts
interface SwsValidateRequest {
  readonly projectDir: string;
  readonly ruleIds?: readonly string[]; // omit = run all
  readonly options?: {
    readonly severityFloor?: 'info' | 'warning' | 'error';
    readonly maxRulesMs?: number; // default 5000
  };
}
```

Response (main → renderer):

```ts
type SwsValidateResponse =
  | {
      readonly ok: true;
      // Wire shape = A+C's ValidatorResult (post toWireResult()).
      // See §5.1.1 for the translation contract.
      readonly results: ReadonlyArray<ValidatorResult>;
      readonly durationMs: number;
    }
  | { readonly ok: false; readonly error: string };
```

**CLI integration** (no IPC — direct call, per A+C NEW-Q-B):

```ts
// In A+C's `--validate` handler (PR(4) of A+C spec):
import { runValidation } from '@core/sws-validator';
import { toWireResult } from '@core/sws-validator/adapter';
import { DEFAULT_LOCALE } from 'src/shared/i18n';
const internal = await runValidation(state, opts);
const wire = internal.results.map((r) => toWireResult(r, DEFAULT_LOCALE));
emitCliOutput({ ...internal, results: wire });
```

Reconciliation status: A+C's `--validate` exit code mapping expects
`ValidatorResult[]` (A+C §4 line 257-273). G's `toWireResult()` adapter
produces this shape directly. CLI integration is ready. SARIF remains
a v1.7.0+ follow-up (per G-G8-CLI-format decision).

### 4.6 Starter rules (4 locked, 1 deferred)

Each rule has a stable rule id, an i18n key prefix, a default
severity, and a one-line description. The 4 selected land in
`core/sws-validator/starter/` in PR(G2); C2 stays in
`/docs/superpowers/specs/2026-06-21-v1-6-0-G-starter-rules-catalog.md`
as the **deferred-to-v1.7.0** backlog (alignment warning is subjective;
high false-positive risk per G reviewer).

| #   | Rule id                       | Module | Severity | Description                                                                                                            | SWS reference               | v1.6.0 status                                            |
| --- | ----------------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------- |
| C1  | `SWS_COM_PDUID_UNIQUE`        | Com    | error    | ComPduId values within a ComConfig must be unique; PduId collisions are SWS-conformance violations.                    | SWS_Com §6.x ComPduId       | **SHIPS** (PR(G2))                                       |
| C2  | `SWS_COMM_CHANNEL_PDUR_ALIGN` | ComM   | warning  | Each user-requested ComMChannel must be referenced by exactly one PduRRoutingPath in the project's PduR config.        | SWS_ComM §7.x               | **DEFERRED** to v1.7.0 (subjective; false-positive risk) |
| C3  | `SWS_PDUR_ROUTING_COMPLETE`   | PduR   | error    | Every PduRRoutingPath must specify a complete source→destination path (no empty src or dest).                          | SWS_PduR §7.x               | **SHIPS** (PR(G2))                                       |
| C4  | `SWS_ECUC_MULTIPLICITY_MIN`   | EcuC   | error    | For each EcucContainerDef, the actual child-instance count must be ≥ `lowerMultiplicity`.                              | SWS_EcuC §9.x               | **SHIPS** (PR(G2))                                       |
| C5  | `SWS_BSWMD_DEPS_PRESENT`      | cross  | error    | Every BSWMD-declared module dependency (referenced `<ECUC-MODULE-DEF-REF>`) must be defined by some loaded BSWMD file. | SWS_General (cross-cutting) | **SHIPS** (PR(G2))                                       |

### 4.7 Example rule skeleton (illustrative, NOT implementation code)

This is a sketch to make the interface shape concrete. Full code lands
in PR(G2). TypeScript field comments intentionally bilingual per
`common/coding-style.md` (`中文` for business, `English` for API).

```ts
// src/core/sws-validator/starter/com-pduid-uniqueness.ts
import type { ValidatorRule, ValidationContext, InternalValidatorResult } from '../types.js';

/**
 * Starter rule SWS_COM_PDUID_UNIQUE — Com PduId uniqueness within ComConfig.
 *
 * ComConfigSet → ComConfig → ComIPdu → ComPduId (integer). The same ComPduId
 * must not appear twice inside the same ComConfig. Cross-ComConfig duplicates
 * are tolerated by AUTOSAR but flagged as a warning (future enhancement).
 */
export const rule: ValidatorRule = {
  id: 'SWS_COM_PDUID_UNIQUE',
  defaultSeverity: 'error',
  messageKey: 'swsValidator.SWS_COM_PDUID_UNIQUE.short',
  check(ctx: ValidationContext): readonly InternalValidatorResult[] {
    // Implementation in PR(G2). Walks ctx.modules filtered by kind === 'com',
    // groups ComIPdu children by ComPduId, emits one error per duplicate group.
    return [];
  },
};
```

## 5. API / Interface Contract

### 5.1 Core types (`src/core/sws-validator/types.ts`)

> **RESOLVED 2026-06-21 (per synthesizer C1 fix)**: G's `SwsValidatorResult`
> is **renamed** to `InternalValidatorResult` and is the **engine-internal**
> representation. The canonical **wire** shape is A+C's `ValidatorResult`,
> imported from `src/shared/headless/ipc-contract.ts` (or a thin
> `src/shared/validator-result.ts` re-export — plan-stage confirm). A
> `toWireResult()` translator at the IPC boundary converts internal
> results → wire results (see §5.1.1 below).

```ts
/**
 * SWS validator result kinds — stable taxonomy for external tooling
 * (CI / SARIF / IDE integration). Distinct from `ValidationErrorKind`
 * because SWS rules are stable across releases while `ValidationErrorKind`
 * is internal to claude-AutosarCfg's schema-driven validator.
 */
export type SwsValidatorErrorKind =
  | 'duplicate-id'
  | 'unresolved-ref'
  | 'missing-dependency'
  | 'multiplicity-violation'
  | 'routing-incomplete'
  | 'channel-misaligned';

export type Severity = 'error' | 'warning' | 'info';

/**
 * Internal representation used by the G engine. NOT emitted to the wire.
 * Use `toWireResult()` (see §5.1.1) when crossing the IPC boundary.
 */
export interface InternalValidatorResult {
  /** Matches the rule's `id`. Lets external tools map back to docs. */
  readonly ruleId: string;
  readonly severity: Severity;
  /** i18n key in `src/shared/i18n.ts` (zh-CN + en both required). */
  readonly messageKey: string;
  /** Variables for i18n interpolation: { pduName: 'ComIPdu_0', ... }. */
  readonly messageVars?: Readonly<Record<string, string | number>>;
  /** Absolute path of the offending element, if applicable. Empty string = project-level. */
  readonly path: string;
  /** Optional auto-fix descriptor — NOT emitted by v1.6.0 starter rules. */
  readonly fix?: never; // placeholder; v1.7.0 may relax this
}

/**
 * Canonical wire shape (A+C §4, line 267-273). G imports this verbatim —
 * do not re-declare. The A+C `ValidatorResult` carries pre-localized
 * `message` on the wire (per A+C §6 "Error envelope across channels":
 * "message is pre-localized via t(locale, key, params) before being
 * placed on the wire").
 *
 * **Import-path note (Round 3 fix, 2026-06-21)**: Wire types are
 * imported from `src/shared/headless/ipc-contract.ts` (A+C §6 canonical
 * SoT — the wire-shape file). IPC channel constants (used in the
 * `sws-validator-handler.ts` IPC handler) are imported separately from
 * `src/shared/ipc-contract.ts` (the v1.5.1 PR(5) channel registry
 * file). See §4.5 "Path split" callout for the full rationale.
 */
import type { ValidatorResult } from 'src/shared/headless/ipc-contract';
export type { ValidatorResult };

/** Read-only view passed to each rule. Built once per `ValidatorEngine.run`. */
export interface ValidationContext {
  readonly project: NormalizedDocument;
  readonly schemaLayer: SchemaLayer | null;
  readonly locale: Locale;
  readonly moduleShortNames: readonly string[];
  /**
   * Tour coordination (per §3.9, locked 2026-06-21; Round 3 in-process
   * fix). When `validationPaused === true`, the engine **silently
   * skips** rule execution (returns `[]`); rules must not see this
   * field — only the debounce gate in `engine.ts` consults it. Sourced
   * from `useArxmlStore.tour` via the in-process zustand subscription
   * established in §3.9 (W spec §3.7 is canonical for the
   * `tour:state-changed` propagation design).
   */
  readonly tourState: { readonly validationPaused: boolean };
  /** Helper to dereference a path to its element. Throws on missing path. */
  readAt(path: string): NormalizedElement;
  /** Helper to find all elements matching a predicate. */
  findAll(predicate: (el: NormalizedElement) => boolean): readonly NormalizedElement[];
  /** Helper to find all modules with a given definitionRef shortName. */
  findModules(shortName: string): readonly NormalizedModule[];
}

/**
 * The contract every rule must satisfy. Pure function: same input ⇒
 * same output. No I/O. No mutation.
 */
export interface ValidatorRule {
  /** Stable id, MUST be unique across all registered rules. Convention: `SWS_<MODULE>_<NAME>`. */
  readonly id: string;
  readonly defaultSeverity: Severity;
  /** Resolvable in `src/shared/i18n.ts` for both zh-CN and en. */
  readonly messageKey: string;
  /** Implementation: read context, return zero or more results. */
  check(ctx: ValidationContext): readonly InternalValidatorResult[];
  /** Optional: rules can declare a target module shortName for filtering. */
  readonly targetModule?: string;
}
```

#### 5.1.1 Wire-result translator (`src/core/sws-validator/adapter.ts`)

The boundary between G's engine and A+C's IPC contract. Lives in a
dedicated adapter file so future cluster additions (e.g. v1.7.0 N
ASPICE traceability) can reuse the same translator.

```ts
// src/core/sws-validator/adapter.ts
import { t } from 'src/shared/i18n';
import type { Locale } from 'src/shared/i18n';
import type { ValidatorResult } from 'src/shared/headless/ipc-contract';
import type { InternalValidatorResult } from './types.js';

/**
 * Translate an internal G result to the canonical wire shape.
 *
 * - Pre-localizes `message` via t(locale, messageKey, messageVars)
 *   (per A+C §6 "Error envelope across channels" — no post-hoc
 *   translation in the renderer)
 * - Drops the engine-only `fix` placeholder
 * - G's `severity: 'info'` is preserved on the wire; renderer/CLI
 *   decide how to filter (A+C's union omits `'info'` from `--validate`
 *   results because G's v1.6.0 only ships error/warning rules)
 *
 * **Field policy** (per re-review N1, 2026-06-21): the `fix` field
 * is RESERVED for v1.7.0 (currently `fix?: never` on
 * `InternalValidatorResult`). If a future maintainer relaxes the
 * engine type to `fix?: SomeShape`, this translator MUST be updated
 * to include the new field via a discriminated union — silent drop
 * is a wire bug. Tracked in §10 v1.7.0 handoff #2.
 */
export function toWireResult(internal: InternalValidatorResult, locale: Locale): ValidatorResult {
  return {
    ruleId: internal.ruleId,
    severity: internal.severity === 'info' ? 'warning' : internal.severity,
    path: internal.path,
    message: t(locale, internal.messageKey, internal.messageVars),
    i18nKey: internal.messageKey,
  };
}
```

### 5.2 Engine API

```ts
// src/core/sws-validator/engine.ts
export interface RunOptions {
  readonly ruleIds?: readonly string[]; // undefined = all registered
  readonly severityFloor?: Severity; // default: 'info' (everything)
  readonly timeoutMsPerRule?: number; // default: 5000
  readonly locale?: Locale; // default: DEFAULT_LOCALE
}

export interface RunResult {
  readonly results: readonly InternalValidatorResult[];
  readonly durationMs: number;
  readonly rulesRun: number;
  readonly rulesSkipped: number;
  readonly timedOut: readonly string[]; // ruleIds that exceeded timeout
}

export function runValidation(
  state: { readonly document: NormalizedDocument; readonly schemaLayer: SchemaLayer | null },
  opts?: RunOptions,
): Promise<RunResult>;
```

### 5.3 Loader API

```ts
// src/core/sws-validator/loader.ts
export interface LoaderOptions {
  readonly projectDir?: string; // enables project-local rules
  readonly userGlobalDir?: string; // defaults to ~/.claude-AutosarCfg/validators/
  readonly sandbox?: 'vm' | 'none'; // default: 'vm' for untrusted dirs
}

export async function loadRules(opts?: LoaderOptions): Promise<readonly ValidatorRule[]>;
```

### 5.4 Sandbox API (`src/core/sws-validator/sandbox/ctx-api.ts`)

The whitelisted surface visible to user-defined rules. Mirrors v1.3.0
Script Engine's `ctx` API but **read-only** and **rule-shaped**.

```ts
export interface RuleCtx {
  /** Same `ValidationContext` shape as built-in rules — read-only. */
  readonly project: ValidationContext;
  /** Logging — `info` / `warn` / `error`. Output ends up in CLI JSON / GUI panel footer. */
  log: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
  /** Build a result. Helper to enforce the contract shape. */
  result(partial: Omit<InternalValidatorResult, 'ruleId'>): InternalValidatorResult;
}
```

**Blocked APIs** (per sandbox policy, must throw on access):

- `fs`, `path`, `child_process`, `os`, `process` (except whitelisted `process.env.LANG`)
- `require`, `import()` of any path outside the validators dir
- `globalThis` write access
- Network APIs (`http`, `https`, `net`, `dgram`)
- `eval`, `Function` constructor

### 5.5 Rule file format (`.validator.ts`)

User-dropped rules are TypeScript ESM files with the following shape:

```ts
// ~/.claude-AutosarCfg/validators/my-org-pduid.rule.validator.ts
import type { ValidatorRule } from 'claude-AutosarCfg/core/sws-validator/types';

const rule: ValidatorRule = {
  id: 'ORG_PDUID_RANGE_001',
  defaultSeverity: 'warning',
  messageKey: 'swsValidator.ORG_PDUID_RANGE_001.short',
  check(ctx) {
    // ... user logic ...
    return [];
  },
};

export default rule;
```

Loader expectations:

- File name suffix **must** be `.validator.ts`.
- File **must** default-export a `ValidatorRule`.
- Multiple rules per file via `export default [rule1, rule2]` is supported.
- Module resolution: standard Node ESM. Rules can import from
  `claude-AutosarCfg/core/...` paths (mapped via `package.json` exports).

### 5.6 CLI surface (PR(G5))

```
claude-AutosarCfg --validate [--format json|sarif] [--severity error|warning|info] \
                  [--rule <ruleId>]... [--project <dir>]
```

- Exit codes: `0` = no errors (warnings allowed), `1` = at least one
  error, `2` = engine failure (timeout, sandbox crash, no rules).
- JSON output: one object per result, schema below.
- SARIF output: standard SARIF 2.1.0 (when `--format sarif`).

## 6. Data Model Summary

| Type                      | Where defined                                         | Lifetime                                                   |
| ------------------------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| `NormalizedDocument`      | `src/shared/normalized-document.ts` (v1.5.1)          | Per project load                                           |
| `SchemaLayer`             | `src/core/validation/runtimeSchema.ts`                | Per project load                                           |
| `ValidationContext`       | `src/core/sws-validator/types.ts`                     | Per `runValidation` call                                   |
| `InternalValidatorResult` | `src/core/sws-validator/types.ts`                     | Per `runValidation` call                                   |
| `ValidatorResult` (wire)  | `src/shared/headless/ipc-contract.ts` (A+C)           | Per `runValidation` call (translated via `toWireResult()`) |
| `RunResult`               | `src/core/sws-validator/engine.ts`                    | Per `runValidation` call                                   |
| `toWireResult()`          | `src/core/sws-validator/adapter.ts` (NEW, per C1 fix) | Per `runValidation` call (boundary translation)            |
| `SwsValidateResponse`     | `src/shared/ipc-contract.ts`                          | Per GUI panel refresh                                      |
| `swsValidatorSlice`       | `src/renderer/store/slices/swsValidatorSlice.ts`      | Persistent across navigation                               |

## 7. Error Handling

### 7.1 Rule execution errors

| Scenario                        | Behavior                                                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rule exceeds `timeoutMsPerRule` | Run continues; `timedOut: [ruleId, ...]` in `RunResult`. UI marks the rule with a "timed out" badge.                                                           |
| Rule throws                     | Caught at the engine boundary. Emit one synthetic `error` result with `messageKey: 'swsValidator.runtimeError'` and `path: ''`. Continue with remaining rules. |
| Rule returns malformed shape    | Validator at registration time; runtime check at call site (defensive). Skip + log.                                                                            |

```ts
export type SwsValidatorError =
  | { readonly kind: 'rule-threw'; readonly ruleId: string; readonly message: string }
  | { readonly kind: 'rule-timeout'; readonly ruleId: string; readonly timeoutMs: number }
  | { readonly kind: 'rule-load-failed'; readonly path: string; readonly message: string }
  | { readonly kind: 'i18n-key-missing'; readonly ruleId: string; readonly messageKey: string }
  | { readonly kind: 'sandbox-violation'; readonly ruleId: string; readonly attempted: string };
```

### 7.2 Loader errors

- Missing directory → empty result, no warning (optional dirs).
- Malformed `.validator.ts` → log error, skip file, continue loading others.
- Sandbox violation during `import` → log error, skip rule, continue.

### 7.3 i18n

- Every `messageKey` is resolved at **result-emission time** via the
  existing `t(locale, key)` helper from `src/shared/i18n.ts`.
- Missing key → fall back to `key` literal + log a console warning
  once per key (deduped). Never throw.
- At registration time, every built-in rule's `messageKey` is checked
  against both `MessagesZhCN` and `MessagesEn`. Loader rejects
  user-defined rules whose keys are missing in both locales.

### 7.4 Feature flag fallback

- Flag OFF → GUI panel not mounted; CLI `--validate` exits with code 3
  - message "experimental.swsValidator is disabled".
- Flag OFF → IPC `sws-validator:run:v1` returns `{ ok: false, error: 'feature-disabled' }`.

### 7.5 Tour validation-paused silent skip (per §3.9, locked 2026-06-21; Round 3 in-process fix)

When W's tour is running and publishes `tour:state-changed` with
`validationPaused: true` via the in-process zustand subscription (per
§3.9 + W §3.7), G's debounce handler **silently returns `[]`**
(no validation runs, no warning toast, no errors logged, no
`SwsValidatorError` emitted).

- This is **expected behavior**, not a failure mode. The user
  intentionally has the tour overlay up; intermediate validation
  results would only distract.
- When the tour advances / skips / completes, the same in-process
  event fires with `validationPaused: false`; the debounce resumes
  normal behavior on the next edit (the engine does NOT retroactively
  run validation for edits made during the paused window).
- The CLI is unaffected (no tour in headless mode). The pause
  coordination is renderer-side only; headless validation runs
  unconditionally.
- Acceptance: §10 BLOCK item "Tour running 期间 G validator 0 调用" +
  A+C §10.6 cross-spec integration test #8
  (`integration/tour-pause-validator.test.ts`; renderer-process observer
  via Vitest + jsdom).

## 8. Testing Strategy

### 8.1 Per-PR unit tests

| PR        | Coverage target                                                                                                           | New tests (est.)                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| G1        | engine (single rule, multi-rule, timeout, throw, severity floor)                                                          | 8                                       |
| G1        | ValidationContext (readAt, findAll, findModules edge cases)                                                               | 6                                       |
| G1        | types / i18n-key registration check                                                                                       | 3                                       |
| G2        | each starter rule × ≥ 4 scenarios (pass / fail / edge / missing BSWMD)                                                    | 4 × 4 = 16                              |
| G3        | RuleLoader (project dir / user-global / malformed / sandbox violation)                                                    | 8                                       |
| G3        | vm-runner.ts (whitelist enforcement)                                                                                      | 6                                       |
| G3        | **vm-runner parity test** (blocked-module list + env-vars + globalThis + eval/Function match v1.3.0 Script Engine source) | **1** (~30 LOC, H1 mitigation per §3.8) |
| G4        | ValidationPanel render (empty / results / severity filter / navigate)                                                     | 6                                       |
| G4        | swsValidatorSlice (run / cancel / clear / error handling)                                                                 | 4                                       |
| G5        | CLI JSON output (golden file)                                                                                             | 4                                       |
| G5        | CLI SARIF output (golden file)                                                                                            | 4                                       |
| G5        | IPC handler (success / timeout / feature-disabled)                                                                        | 3                                       |
| **Total** |                                                                                                                           | **~68**                                 |

Final target: project total grows from ~1692 (v1.5.1) to **~1760**
(+68). Per `common/testing.md`, 80% floor; automotive-specific rules
do not apply (no ASIL claim for an IDE tool).

### 8.2 Integration tests

- **`engine.full-pipeline.test.ts`** — load a real fixture
  (`eb-master-12mb.arxml` or `comments-rich.arxml`), run all starter
  rules, snapshot results. Catches rule interaction regressions.
- **`loader.real-project.test.ts`** — fixture with 2 user-defined
  `.validator.ts` files in `.sws-validators/`, assert rules register
  and run.
- **`gui.panel-flow.test.tsx`** — render `ValidationPanel`, click a
  result, assert store action `setParam(path)` invoked.

### 8.7 Cross-Spec Integration Tests (G-owned subset)

Reference A+C spec **§10.6** 9-scenario cross-spec integration
matrix (locked 2026-06-21). G cluster owns the following scenarios:

| Scenario # | Description                                                                                                  | Test file                                                          | Owner PR         |
| ---------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------- |
| **#5**     | G validation result → A+C CLI stdout via `toWireResult()` translator (after C1 fix; integration smoke test)  | `tests/integration/v1-6-0/g-result-cli.test.ts` (NEW)              | **G-5** (PR(G5)) |
| **#8**     | W tour `validationPaused: true` → G debounce early-returns `[]` (per §3.9 + §7.5; e2e with real W + G + IPC) | `tests/integration/v1-6-0/tour-pause-validator.test.ts` (NEW)      | **G-4** (PR(G4)) |
| **#9**     | G sandbox parity vs v1.3.0 Script Engine `vm-runner` (per §3.8 / §8.1 G3 row + H1 mitigation; unit-level)    | `src/core/sws-validator/sandbox/__parity__.test.ts` (NEW, ~30 LOC) | **G-3** (PR(G3)) |

**Acceptance**: All 3 G-owned scenarios pass = G cluster ready for
v1.6.0 ship. The other 6 A+C §10.6 scenarios are owned by A+C / W / U
clusters and cross-referenced in their respective specs.

**Cross-spec note**: scenarios #5 + #8 require real W + G + A+C IPC
wiring (NOT mocked); the integration test must use the actual
`headless:validate-result:v1` IPC channel + the renderer-internal
`tour:state-changed` zustand subscription (NOT a new M→R IPC channel;
see §3.9 + W §3.7 for the canonical design) and exercise the
`toWireResult()` boundary end-to-end. Plan-stage test-scaffolding
task must wire this before PR(G4) merges.

### 8.3 E2E tests

- **GUI flow**: load project → wait for panel → click error → verify
  navigation. Skip if `experimental.swsValidator` OFF.
- **CLI flow**: `pnpm exec claude-AutosarCfg --validate
tests/fixtures/arxml/eb-master-12mb.arxml --format json` exits 1,
  JSON validates against schema.

### 8.4 Coverage gate

| Type                  | Threshold                                        |
| --------------------- | ------------------------------------------------ |
| Pure refactor (none)  | n/a                                              |
| New core (G1, G2, G3) | ≥ 90% stmts / ≥ 80% branches                     |
| New renderer (G4)     | ≥ 85% stmts / ≥ 75% branches (component heavy)   |
| New CLI (G5)          | ≥ 90% stmts / ≥ 80% branches                     |
| **Total**             | **≥ 95.5% stmts / ≥ 87% branches** (Q4 D parity) |

### 8.5 Performance budget

```
test('full validation of a 1000-node project completes in ≤ 500ms', async () => {
  const state = buildFixtureState('eb-master-12mb'); // subset ~ 1000 nodes
  const start = Date.now();
  const result = await runValidation(state, { ruleIds: starterRuleIds });
  expect(Date.now() - start).toBeLessThan(500);
  expect(result.rulesRun).toBeGreaterThanOrEqual(4);
});
```

Not a merge gate; regression alarm. Recorded in release notes.

## 9. Migration / Backward Compatibility

- **No breaking changes** to `ValidationError`, `ValidationResult`,
  or any existing IPC channel.
- The existing `validateProjectForRenderer` continues to be the
  single-doc / project-pipeline validator (9 native kinds). G's
  rules are **additive** — they emit a different engine shape
  (`InternalValidatorResult`) with a different taxonomy
  (`SwsValidatorErrorKind`). The wire shape is A+C's `ValidatorResult`.
- Existing stores do not need migration. The new
  `swsValidatorSlice` is a sibling, not a replacement.
- Feature flag default OFF means **zero observable change** to any
  user on upgrade unless they explicitly enable
  `experimental.swsValidator`.
- i18n keys are additive (`swsValidator.*` namespace) — no existing
  key touched.

## 10. v1.6.0 → v1.7.0 Handoff

What G leaves ready for v1.7.0+:

1. **Rule authoring in-app** — `ValidationPanel` adds an "Edit custom
   rules" toolbar button that opens the rule in CodeMirror (reuse
   v1.3.0 Script Engine editor).
2. **Auto-fix** — `InternalValidatorResult.fix` field is reserved (typed
   `never` for now). v1.7.0 adds a discriminated union.
3. **Per-rule severity override** — store key in `swsValidatorSlice`
   already supports it.
4. **K Stencil Wizard** consumes `RunResult` to gate generation.
5. **N ASPICE Traceability** indexes `result.ruleId` against
   requirement specs.

## 11. Risks & Open Questions

| #   | Risk / Question                                                                                                                           | Likelihood | Impact | Owner / Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | ~~**PENDING AC IPC CONTRACT** — G5 assumes A+C's `--validate` channel shape; A+C spec writer may pick a different signature.~~            | M          | P1     | **RESOLVED 2026-06-21 (synthesizer C1 + C3 fixes)**: A+C spec `2026-06-21-v1-6-0-AC-headless-cli-design.md` ships canonical `ValidatorResult` + 3 IPC channels (see A+C §6 IPC Contract Reference). G adopts via §5.1 (`InternalValidatorResult` engine + `toWireResult()` adapter translating to A+C `ValidatorResult`) and §4.5 (channels renamed to `sws-validator:run:v1` / `sws-validator:cancel:v1` per A+C §6 versioning policy). PR(G5) is unblocked.                                                                                                                                                                                                                                                                |
| R2  | **Sandbox reuse risk** — Sprint 14 Script Engine's `vm-runner.ts` is single-process; G might want worker threads for big projects.        | L          | P2     | PR(G3) reuses vm-runner as-is; v1.7.0 swap to worker_threads if perf budget missed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| H1  | **Sandbox copy drift** — G copies `vm-runner.ts` per §3.8 (different ctx API); if Script Engine updates its whitelist, G silently drifts. | M          | P1     | **RESOLVED 2026-06-21** (synthesizer H1): §3.8 declares v1.6.0 copy + v1.7.0 shared extraction plan + §8.1 G3 parity test (1 file, ~30 LOC, asserts blocked-module list + env-vars + globalThis + eval/Function match v1.3.0 source verbatim). A+C §13 R2 cross-references the bundle-check assertion (A+C `--validate` stub tree-shakes sandbox in v1.6.0; v1.7.0 PR(G5) bundle-check asserts no vm-runner reference in v1.6.0 CLI binary).                                                                                                                                                                                                                                                                                 |
| R3  | ~~Starter rule selection — 3 vs 4 vs 5 starter rules.~~                                                                                   | M          | P2     | **RESOLVED 2026-06-21**: 4 starter rules locked (C1 + C3 + C4 + C5); C2 `SWS_COMM_CHANNEL_PDUR_ALIGN` deferred to v1.7.0 (alignment warning subjective; false-positive risk per G reviewer).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| R4  | **Incremental vs full re-validation** — GUI debounce after every keystroke is wasteful; full re-run on save is too sparse.                | M          | P2     | Spec choice: 300ms debounce, run on idle. Plan-stage confirmation needed. Alternative: re-run only rules tagged with the edited path's module.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| H3  | **G 300ms debounce vs W tour running** — if a user edits mid-tour, G fires background validation runs that stutter the tour.              | M          | P1     | **RESOLVED 2026-06-21** (synthesizer H3, Round 3 in-process refinement): §3.9 declares W-owned `validationPaused: boolean` field on `TourState` + `tour:state-changed` propagation via **in-process zustand subscription** (`useArxmlStore.subscribe`, no new IPC channel per W §3.7 canonical); §5.1 adds `tourState: { validationPaused: boolean }` to `ValidationContext`; §7.5 documents silent-skip policy; engine.ts debounce early-returns `[]` when `validationPaused === true`. Cross-spec acceptance: A+C §10.6 integration test #8 (`integration/tour-pause-validator.test.ts`; renderer-process observer via Vitest + jsdom). W spec §3.7 owns the `validationPaused` field + event emission; G only subscribes. |
| R5  | **i18n key cardinality** — 3–5 rules × ≥ 2 keys each = 6–10 new entries in 2 locales. Manageable but invites drift.                       | L          | P2     | Plan stage adds an i18n-key lint test that fails if a starter rule's `messageKey` is missing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| R6  | ~~SARIF coverage — SARIF 2.1.0 is rich; G's emitter might miss locations / code flows.~~                                                  | L          | P2     | **RESOLVED 2026-06-21 (G8-CLI-format decision)**: SARIF deferred to v1.7.0. v1.6.0 ships JSON-only output. Risk closes with scope reduction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| R7  | **Module shortName casing** — BSWMD module names are case-sensitive; rule filters must match exactly.                                     | L          | P1     | Plan-stage test: every starter rule's `targetModule` matches a known fixture BSWMD shortName.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| R8  | **Cross-BSWMD deps rule (C5) is the most expensive** — O(N²) on large projects. May need indexing.                                        | M          | P2     | Plan stage: profile on `eb-master-12mb.arxml`. If > 500ms, add a project-wide module index built once per `runValidation`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R9  | **GUI panel mount cost** — bottom panel always mounted adds idle overhead even when flag OFF.                                             | L          | P3     | Plan stage: mount only when flag is ON. Render placeholder when OFF.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| R10 | **What happens if user-defined rule id collides with built-in**?                                                                          | M          | P1     | Loader rejects user rule if `id` already registered. Log warning, skip rule.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## 12. Acceptance Criteria

### BLOCK (must all pass to ship v1.6.0)

| #   | Item                                                                                                                                                                    | Verification                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | All 5 G PRs merged to `main`                                                                                                                                            | `git log --oneline ^v1.5.1..HEAD --grep='^feat(sws'`                             |
| 2   | Tests pass                                                                                                                                                              | `pnpm test` — 1692 → ~1764                                                       |
| 3   | Coverage gate                                                                                                                                                           | `pnpm test:coverage` ≥ 95.5 / ≥ 87                                               |
| 4   | All 4 locked starter rules (C1, C3, C4, C5) have ≥ 2 i18n keys in zh-CN and en                                                                                          | `pnpm test:i18n` — new `swsValidator.*` keys                                     |
| 4b  | **vm-runner parity test passes** (blocked-module list + env-vars + globalThis-write + eval/Function match v1.3.0 Script Engine source verbatim, per §3.8 / §8.1 G3 row) | `pnpm test src/core/sws-validator/sandbox/__parity__.test.ts`                    |
| 4c  | **Tour running 期间 G validator 0 调用** (W `validationPaused: true` → G `engine.ts` debounce early-returns `[]`; per §3.9 / §7.5)                                      | e2e + A+C §10.6 integration test #8 (`integration/tour-pause-validator.test.ts`) |
| 5   | Loader rejects malformed / sandbox-violating rules                                                                                                                      | unit test                                                                        |
| 6   | `--validate` CLI returns correct exit code (0/1/2)                                                                                                                      | e2e shell test                                                                   |
| 7   | 0 type errors, 0 lint errors                                                                                                                                            | `pnpm typecheck && pnpm lint`                                                    |
| 8   | Build success; bundle ≤ 850 kB                                                                                                                                          | `pnpm build`                                                                     |
| 9   | `experimental.swsValidator` default OFF                                                                                                                                 | grep feature-flag.ts                                                             |
| 10  | GUI panel hidden when flag OFF                                                                                                                                          | manual smoke + render test                                                       |
| 11  | No existing IPC / i18n key / store action broken                                                                                                                        | 1692 existing tests as fuse                                                      |

### WARN (should pass, ship if minor miss)

| #   | Item                                                                             | Verification    |
| --- | -------------------------------------------------------------------------------- | --------------- |
| 12  | 1000-node project validation ≤ 500ms                                             | perf benchmark  |
| 13  | All 4 starter rules cover ≥ 80% of common AUTOSAR SWS errors in the BSWMD corpus | coverage matrix |
| 14  | Drop-in rule example documented in `docs/validators-example.md`                  | docs review     |
| 15  | code-reviewer 0 C / ≤ 2 H / ≤ 5 M                                                | per-PR review   |

### OUT of scope (v1.6.0 explicitly does NOT deliver)

- ❌ Custom rule in-app editor (v1.7.0+)
- ❌ Auto-fix / `fix` field on starter rules (v1.7.0+)
- ❌ Per-rule severity override UI (v1.7.0+)
- ❌ Rule marketplace / remote registry (deferred)
- ❌ Variant-aware rules (B Variants → v1.8.0+)
- ❌ UDS/DoIP rules (J → parked on `research/uds-doip`)
- ❌ ASPICE traceability integration (N → v1.7.0)
- ❌ DBC↔ECUC validation rules (I → v1.7.0; depends on dbc-forge reuse)
- ❌ Stencil wizard gating (K → v1.7.0; consumes G's `RunResult`)

## 13. References

- [[claude-AutosarCfg-v1-6-brainstorm]] — source brainstorm
- [[claude-autosarcfg-v1-5-1-shipped]] — `NormalizedDocument` /
  `applyMutation` foundation
- [[claude-autosarcfg-v1-5-0-shipped]] — store action context
- [[claude-AutosarCfg-sprint-14-v1-3-0-shipped]] — vm-runner.ts reuse
- [[claude-AutosarCfg-v1-5-1-foundation-design]] — v1.5.1 spec
- [[claude-AutosarCfg-v1-5-1-foundation]] — v1.5.1 plan
- `src/core/validation/types.ts` — `ValidationError` shape (reused
  for inspiration only; G uses its own `InternalValidatorResult`)
- `src/shared/headless/ipc-contract.ts` — A+C `ValidatorResult` wire
  shape (G imports verbatim per C1 fix; see §5.1)
- `src/main/script/vm-runner.ts` (v1.3.0) — sandbox pattern to copy
- `src/shared/normalized-document.ts` (v1.5.1) — primary input shape
- `src/shared/i18n.ts` — i18n key registry
- `src/shared/ipc-contract.ts` — IPC channel registry
- `src/main/arxml-stream/feature-flag.ts` — feature-flag pattern
- AUTOSAR SWS specifications (reference only, plan-stage lookup):
  - SWS_Com (Com module)
  - SWS_ComM (ComM module)
  - SWS_PduR (PduR module)
  - SWS_EcuC (EcuC module)
  - SWS_General (cross-cutting conventions)

---

**End of Cluster G design spec. Ready for user review of §2 (G6 starter
list), §4.5 (AC IPC contract reconciliation), §11 (R3 rule count,
R4 incremental strategy). Plan stage unlocks after these are locked.**
