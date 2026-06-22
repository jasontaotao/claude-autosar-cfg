# v1.8.0 — Cluster 3 K: BSWMD-Free Stencil Wizard — Design

> **Status**: 📋 DESIGN READY 2026-06-21 (awaiting user review)
> **Owner**: Claude Fable 5 (this session)
> **Cluster**: v1.8.0 Cluster 3 K (single-item release after v1.7.3 hotfix line)
> **Predecessor**: v1.7.3 SHIPPED 2026-06-21 (HEAD `6273997`); v1.7.2 SHIPPED 2026-06-21; v1.6.0 SHIPPED (Cluster G SWS Validator — K's gate dependency)
> **Goal**: Provide a GUI wizard that lets users generate a minimal valid ECUC module configuration skeleton (Com / ComM / PduR / EcuC) without requiring BSWMD files, optionally gated by the v1.6.0 Cluster G SWS Validator. Output is a single `.arxml` file the user can save anywhere and reopen later as a template.

## 1. Background

### 1.1 Problem statement

**Today**: Generating any ECUC module configuration requires the user to:

1. Have BSWMD files (BSW Module Descriptions) available locally — typically vendor-specific (EB tresos, Vector, etc.) and licensed.
2. Pick the right BSWMDs into the project (Sprint 16 + Sprint 17 work).
3. Right-click the right container hierarchy to add sub-containers, then parametrize each one by hand.

For three real user cohorts this is a blocker:

- **New users / evaluators** who don't have BSWMD files and want to try the tool with a real-world module shape (Com / ComM / PduR are the canonical "hello world" of AUTOSAR BSW).
- **Educators / trainers** demonstrating AUTOSAR concepts and wanting to ship a clean example without dragging in vendor proprietary schemas.
- **Template authors** who want to author a "good default" config once and distribute it as a single `.arxml` that other users can open.

### 1.2 What K is — and is not

| K is | K is **not** |
|---|---|
| A **wizard** that generates a minimal valid ECUC skeleton for 4 standard BSW module families (Com / ComM / PduR / EcuC) | A BSWMD authoring tool |
| **BSWMD-free by default** — generates from a hand-curated internal schema, not from a vendor BSWMD | A replacement for vendor BSWMDs in production ECU work |
| Optionally gated by **G's SWS Validator** (`sws-validator:run:v1` IPC) so the generated template passes a starter-rule smoke check | A full G integration — only `run` is reused, no rule authoring, no auto-fix |
| A **single-output** `.arxml` generator (one file per wizard run) | A template library / marketplace / remote registry |
| Available via File menu **and** the Cmd-K palette (cross-cutting with Cluster U from v1.6.0) | Available as a CLI command (CLI parity is v1.9.0+; K ships GUI only) |

### 1.3 What unlocks this in v1.8.0 (vs. why v1.7.0 couldn't)

| Dependency | Status | Why it gates K |
|---|---|---|
| Cluster **G** (SWS Validator, v1.6.0) | ✅ SHIPPED | K's "gate" feature reuses `sws-validator:run:v1`. Without G there is no validator to call. |
| Cluster **U** (Cmd-K palette, v1.6.0) | ✅ SHIPPED | K is registered as a Cmd-K command. Without U the palette entry would be orphan. |
| Cluster **A+C** (applyPatchSteps + arxmlStream, v1.5.1) | ✅ SHIPPED | K's "With-BSWMD" mode reuses `applyPatchSteps` to merge user schema with template. |
| Cluster **W** (Onboarding tour, v1.6.0) | ✅ SHIPPED | Optional future: K can be a tour stop. Not required for v1.8.0 K to ship. |

## 2. Approach options (already pre-decided by user)

The brainstorming cycle selected **Standard scope** (2-sub-sprint delivery). Two narrower and one wider alternatives were considered:

| Option | Scope | Sub-sprints | MINOR bump | Risk |
|---|---|---|---|---|
| **A. MVP** | 1 family (Com only) + 1 mode (BSWMD-free) + 1 trigger (File menu) | 1 | v1.8.0 | Low — but ships a thin feature, less differentiation vs. hand-writing |
| **B. Standard** ✅ | 4 families + BSWMD-free + With-BSWMD + 2 triggers (menu + Cmd-K) + G gate toggle | 2 | v1.8.0 | Medium — 4 family schemas need maintenance, but standard option per Cluster 3 plan |
| **C. Full** | B + template library + cross-project sharing UI + Variant-aware | 4+ | v1.9.0 | High — Variant-aware blocks on B Variants (parked); library is speculative scope |

**Lock**: Option B for v1.8.0. Option C's template library / sharing deferred to v1.9.0+ (after B Variants lands).

## 3. Architecture

### 3.1 Component map

```
┌─────────────────────────────────────────────────────────────────┐
│ RENDERER                                                         │
│                                                                  │
│  ┌──────────────────────────┐    ┌────────────────────────────┐  │
│  │ File menu                │    │ Cmd-K palette              │  │
│  │ "New from Stencil..."    │    │ entry: "New from Stencil"  │  │
│  └────────────┬─────────────┘    └────────────┬───────────────┘  │
│               │                               │                  │
│               └──────────────┬────────────────┘                  │
│                              ▼                                   │
│                  ┌───────────────────────┐                      │
│                  │ StencilWizard dialog  │                      │
│                  │  - FamilyPicker       │                      │
│                  │  - ModeToggle (free/  │                      │
│                  │    with-BSWMD)        │                      │
│                  │  - GateToggle (G ERR  │                      │
│                  │    block)             │                      │
│                  │  - Generate button    │                      │
│                  └───────────┬───────────┘                      │
└──────────────────────────────┼──────────────────────────────────┘
                               │ IPC: stencil:generate:v1
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ MAIN                                                             │
│                                                                  │
│  ┌────────────────────────────────┐  ┌────────────────────────┐ │
│  │ stencilHandler (IPC entry)     │  │ sws-validator:run:v1   │ │
│  │  - validates inputs            │──│ (v1.6.0 G, reused)     │ │
│  │  - resolves family schema      │  └────────────────────────┘ │
│  │  - if gate ON → call G         │                            │
│  │  - applyPatchSteps (or built-  │  ┌────────────────────────┐ │
│  │    in builder for free mode)   │──│ applyPatchSteps         │ │
│  │  - returns serialized XML      │  │ (v1.5.1 A+C, reused)    │ │
│  └────────────┬───────────────────┘  └────────────────────────┘ │
│               │                                                  │
│               ▼                                                  │
│  ┌────────────────────────────────┐                              │
│  │ src/main/stencil/              │                              │
│  │   schemas/                     │                              │
│  │     com.ts   comm.ts           │                              │
│  │     pdur.ts  ecuc.ts           │                              │
│  │   builder.ts (BSWMD-free path) │                              │
│  └────────────────────────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                  Returns: serialized ECUC XML string
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ RENDERER (cont.)                                                │
│  StencilWizard.saveDialog → writes to user-chosen path          │
│  + shows toast with path + "Open in project" button             │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Data flow

1. User triggers wizard (File menu / Cmd-K)
2. Wizard opens modal with: family dropdown (4), mode toggle (BSWMD-free / With-BSWMD), gate toggle (default OFF)
3. User picks options, clicks Generate
4. Renderer calls `stencil:generate:v1` IPC with `{ family, mode, gate }`
5. Main process:
   - Loads family-specific schema from `src/main/stencil/schemas/<family>.ts`
   - If `gate === true`: calls `sws-validator:run:v1` on the generated doc. If any `severity === 'error'` → returns `{ ok: false, errors }` (block).
   - Builds ARXML document
   - If `mode === 'with-bswmd'`: uses `applyPatchSteps` to merge user-selected BSWMDs (gathered from `useArxmlStore.bswmdSchemas`)
   - If `mode === 'free'`: uses internal `builder.ts` (no external schema lookup)
6. Returns serialized XML string + save path suggestion
7. Renderer shows native save dialog; on confirm, writes file + toast

### 3.3 Reuse surface (no new infrastructure)

| Reused component | Why reuse, not rebuild |
|---|---|
| `NewProjectDialog` modal pattern | Same shell, same Z-index, same i18n; K's wizard copies the layout |
| `sws-validator:run:v1` (v1.6.0) | G already provides the validator + error envelope. K consumes verbatim. |
| `applyPatchSteps` (v1.5.1) | Single-doc mutation engine; handles both free and with-BSWMD modes |
| Cmd-K palette registration (v1.6.0 U) | `keyboard/shortcuts/script.ts` already shows the registry pattern |
| `feature-flag.ts` dynamic-import (v1.7.3) | Stencil follows same pattern: flag in main, renderer via IPC |

### 3.4 New IPC surface

```
Channel:        stencil:generate:v1
Direction:      renderer → main
Request:        { family: 'com' | 'comm' | 'pdur' | 'ecuc',
                  mode: 'free' | 'with-bswmd',
                  gate: boolean,
                  projectPath?: string }   // for with-bswmd mode
Response:       { ok: true,  xml: string, suggestedFilename: string }
              | { ok: false, errors: ValidatorResult[] }   // gate block
              | { ok: false, error: { code, message, i18nKey } }   // other failure
```

Naming follows v1.6.0 convention (`<domain>:<verb>:v1` per A+C §6).

## 4. Scope of v1.8.0 K

### 4.1 Functional scope

| # | Feature | Sub-sprint | Notes |
|---|---|---|---|
| 1 | 4 family schemas (com/comm/pdur/ecuc) hand-curated | A | Each is ~80-150 LOC TS, captures the canonical ECUC container hierarchy for that module |
| 2 | `src/main/stencil/builder.ts` (BSWMD-free path) | A | Pure function `buildComModule(): ArxmlDocument` etc., no I/O |
| 3 | `src/main/ipc/stencilHandler.ts` IPC entry | A | Input validation + dispatch + serializer |
| 4 | `src/shared/ipc-contract.ts` adds `stencil:generate:v1` types | A | Per A+C §6 versioning policy |
| 5 | `src/renderer/components/StencilWizard/` modal UI | A | FamilyPicker + ModeToggle + GateToggle + Generate button |
| 6 | File menu entry "New from Stencil..." | A | Hook into existing menu reducer |
| 7 | Cmd-K palette registration | A | Mirrors v1.6.0 U's script command registration |
| 8 | `experimental.stencilWizard` feature flag | A | Default OFF (per G/U precedent) |
| 9 | i18n keys (`stencil.*` namespace, en + zh-CN) | A | ~10-12 keys: title, family labels, mode labels, gate label, generate/save/cancel, error toasts |
| 10 | G gate integration (real call to `sws-validator:run:v1`) | B | Block on `severity === 'error'` only; show errors in wizard, allow dismiss |
| 11 | With-BSWMD mode (applyPatchSteps merge) | B | When user has BSWMDs in current project, offer as merge target |
| 12 | Reopen-as-template (File → Open existing .arxml = template) | B | KISS — no separate template concept |
| 13 | E2E test (Playwright) | B | Full wizard → generate → save → reopen flow |
| 14 | Polish: aria-labels, focus trap, esc-to-close | B | Reuse NewProjectDialog accessibility patterns |

### 4.2 Deliverable counts (estimate)

- **New files**: ~12 (4 schemas + builder + handler + modal + 3 sub-components + tests)
- **Modified files**: ~5 (ipc-contract, i18n, file menu, cmd-K registry, feature-flag)
- **Test count delta**: ~30-40 new tests (8-10 family schema + 10 builder + 5 IPC + 3 gate integration + 1 E2E + ~10-15 UI)
- **Lines**: ~800-1200 LOC (excluding tests)

### 4.3 Sub-sprint breakdown

**Sub-sprint A: Plumbing + UI** (~5-7 days)
- Tasks 1-9 from §4.1
- Ships behind feature flag, no G gate yet
- Local manual test: wizard opens, generates Com skeleton, saves, opens file shows valid ECUC
- Output: `feature/stencil-wizard-a` branch, ready for review

**Sub-sprint B: Gate + polish + E2E** (~4-6 days)
- Tasks 10-14 from §4.1
- Wires G RunResult as gate
- Adds E2E test
- Final review + release
- Output: `feature/stencil-wizard-b` branch, merges to main, tag v1.8.0

## 5. Decisions to Lock

| # | Decision | Locked value | Rationale |
|---|---|---|---|
| D1 | Wizard trigger surface | File menu + Cmd-K palette | Both per user request; matches U cross-cut pattern |
| D2 | Module families supported | Com, ComM, PduR, EcuC (4) | Canonical "hello world" BSW modules per AUTOSAR SWS; covers ~80% of demo use cases |
| D3 | Default generation mode | BSWMD-free | Matches "BSWMD-Free Stencil" name; most users don't have BSWMDs handy |
| D4 | G gate default | OFF | Opt-in toggle; strict gating is user choice, not forced |
| D5 | Gate block threshold | `severity === 'error'` only | WARN/INFO shown as toast, don't block |
| D6 | Output format | Single `.arxml` file | KISS; multi-file templates add complexity for little demo value |
| D7 | Template storage concept | None — File → Open existing `.arxml` is "template" | Avoids dual concepts; file path IS the template identity |
| D8 | Feature flag name | `experimental.stencilWizard` | Follows G's `experimental.swsValidator` and U's `experimental.cmdKPalette` precedent |
| D9 | Feature flag default | OFF | Match G/U; user opts in via settings.json |
| D10 | CLI equivalent in v1.8.0 | NO — GUI only | CLI parity deferred to v1.9.0+ alongside template library |
| D11 | i18n locales | en + zh-CN | Matches all v1.6.0/v1.7.x precedent |
| D12 | With-BSWMD mode source | Project's currently-loaded BSWMDs via `useArxmlStore.bswmdSchemas` | Avoids re-implementing BSWMD picker UI |
| D13 | Schema source for BSWMD-free mode | Hand-curated `src/main/stencil/schemas/<family>.ts` | Authored once; spec captured in code comments referencing AUTOSAR SWS |
| D14 | Test framework additions | None — reuse Vitest + Playwright already in stack | KISS |

## 6. Out of Scope (deferred)

| Item | Reason | When |
|---|---|---|
| Template library / marketplace | Speculative; need user signal first | v1.9.0+ |
| Cross-project template sharing UI | Filesystem-only is sufficient for now | v1.9.0+ |
| Custom module family authoring UI | Hand-curated schemas are 80/20 for demo use case | v1.9.0+ |
| Auto-fix (consuming G's `fix` field) | G's `fix` is `never` for now; needs G side work first | After G ships `fix` field |
| Variant-aware generation (B Variants) | B Variants parked per v1.6.0 brainstorm | After B Variants lands |
| CLI command (`pnpm autosarcfg stencil --family=com`) | GUI covers demo use case; CLI parity defers | v1.9.0+ |
| Integration with dbc-forge I (v1.7.0) | K doesn't need dbc-forge; that's I's scope (DBC ↔ ECUC bridge) | n/a |
| K consuming W's `validationPaused` for tour-pause | Not needed — K is one-shot, not debounced | n/a |
| Schema hot-reload (edit family schema without rebuild) | Speculative; bundle schemas with binary | v1.9.0+ |

## 7. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 4 hand-curated family schemas diverge from real AUTOSAR SWS | M | M | Reference AUTOSAR SWS_Com / SWS_ComM / SWS_PduR / SWS_EcuC in schema file comments; periodic review |
| R2 | G gate mis-classifies generated template as "valid" when it isn't | L | M | G's `error` severity is conservative; smoke test asserts gate blocks on intentional errors |
| R3 | With-BSWMD mode merge produces invalid output if user's BSWMDs are malformed | M | M | Reuse `applyPatchSteps` validation; surface apply errors as gate block |
| R4 | File menu entry clutters UI when flag OFF | L | L | Hide entry when `experimental.stencilWizard === false` (same as G hides panel) |
| R5 | Save dialog UX differs across Windows / macOS / Linux | L | L | Reuse existing Electron save dialog pattern from File → Save As |
| R6 | Feature flag default OFF means most users never discover K | M | M | Add to W onboarding tour as opt-in stop (post-v1.8.0 follow-up); document in release notes |
| R7 | E2E test for file save dialog is flaky on Linux CI | M | L | Use mock save path in E2E; integration test on real path manually |
| R8 | IPC channel name collides with future K2 (e.g., `stencil:apply`) | L | L | Reserve `stencil:*` namespace prefix in IPC contract doc |

## 8. Acceptance Criteria

### BLOCK (must all pass to ship v1.8.0)

| # | Item | Verification |
|---|---|---|
| 1 | Sub-sprint A + B both merged to main | `git log --oneline ^v1.7.3..HEAD --grep='^feat(stencil'` |
| 2 | Tests pass | `pnpm test` — 2033 → ≥ 2063 |
| 3 | Coverage gate maintained | `pnpm test:coverage` ≥ 95.5% / ≥ 87% |
| 4 | All 4 family schemas have ≥ 1 round-trip test (build → serialize → parse → assert container hierarchy) | `pnpm test src/main/stencil/__tests__/schemas.test.ts` |
| 5 | i18n parity | en + zh-CN both have all `stencil.*` keys, parity test passes |
| 6 | G gate blocks when `severity === 'error'` | integration test: bad Com config + gate ON → wizard shows error toast, no save |
| 7 | G gate allows when only `severity === 'warning'` | integration test: warn-only result + gate ON → wizard saves successfully |
| 8 | 0 type errors, 0 lint errors | `pnpm type-check && pnpm lint` |
| 9 | Build success; renderer bundle ≤ 850 kB | `pnpm build` |
| 10 | `experimental.stencilWizard` default OFF | grep feature-flag.ts |
| 11 | File menu + Cmd-K palette entries hidden when flag OFF | render test |
| 12 | With-BSWMD mode uses project's loaded BSWMDs | integration test |
| 13 | E2E: wizard → generate → save → reopen → assert content | Playwright |
| 14 | No existing IPC / i18n key / store action broken | 2033 existing tests as fuse |
| 15 | code-reviewer APPROVE | per-PR review |

### WARN (should pass, ship if minor miss)

| # | Item | Verification |
|---|---|---|
| 16 | 4 family schemas match ≥ 90% of common AUTOSAR SWS container structure for each module | manual review against SWS specs |
| 17 | Wizard opens in < 200ms | perf benchmark |
| 18 | WCAG 2.2 AA compliance | axe-core E2E |

### OUT of scope (v1.8.0 explicitly does NOT deliver)

(See §6 above.)

## 9. References

- [[claude-autosarcfg-v1-6-brainstorm]] — source brainstorm that put K in v1.7.0 Cluster 3, now bumped to v1.8.0
- [[claude-AutosarCfg-v1-6-0-shipped]] — Cluster G SWS Validator (K's gate) and Cluster U Cmd-K palette (K's second trigger) shipped here
- [[claude-autosarcfg-v1-5-1-shipped]] — `applyPatchSteps` engine that K's with-BSWMD mode reuses
- [[claude-autosarcfg-v1-7-3-shipped]] — most recent predecessor; v1.7.3 renderer build fix
- [[claude-autosarcfg-v1-7-0-shipped]] — Cluster 3 I (dbc-forge) shipped; K is the remaining Cluster 3 item
- `src/main/stencil/` — new directory created by this spec
- `src/renderer/components/StencilWizard/` — new directory created by this spec
- `src/shared/ipc-contract.ts` — IPC channel registry (add `stencil:generate:v1`)
- `src/shared/i18n.ts` — i18n key registry (add `stencil.*` namespace)
- AUTOSAR SWS specifications (reference for hand-curated schemas):
  - SWS_Com (Com module — communication)
  - SWS_ComM (ComM module — communication manager)
  - SWS_PduR (PduR module — PDU router)
  - SWS_EcuC (EcuC module — ECU configuration)

---

## Appendix A: Schema authoring approach (for implementer)

Each `src/main/stencil/schemas/<family>.ts` should:

1. Export a pure function `build<FAMILY>Module(): ArxmlDocument` returning a minimal valid ECUC document
2. Capture the canonical container hierarchy from the AUTOSAR SWS spec — e.g., for Com:
   - `Com` (root) → `ComConfig` → `ComIPdu` (≥ 1) → `ComIPduDirection`, `ComIPduSignalProcessing`
   - Plus common params: `ComConfigurationClass`, `ComPduIdGenerator`
3. Reference the SWS spec in a leading comment block
4. Be ~80-150 LOC per family

Example skeleton (Com):

```typescript
// src/main/stencil/schemas/com.ts
// AUTOSAR SWS_Com reference — minimal valid Com module skeleton
// §: SWS_Com_<container-defining-section>
import type { ArxmlDocument } from '../../arxml/types.js';

export function buildComModule(): ArxmlDocument {
  return {
    rootPackages: [{
      shortName: 'Com',
      containers: [{
        shortName: 'ComConfig',
        containers: [{
          shortName: 'ComIPdu',
          // ...minimal valid hierarchy
        }],
        params: [{
          shortName: 'ComConfigurationClass',
          value: { type: 'enum', value: 'PRE_COMPILE' },
        }],
      }],
    }],
  };
}
```

(Actual implementation in plan stage; this is illustrative.)

## Appendix B: Why "Standard" not "MVP" or "Full"

- **MVP** (1 family, 1 mode, 1 trigger) ships a feature that looks small vs. EB tresos / Vector DaVinci. Differentiation needs at least 3-4 families.
- **Standard** matches the v1.6.0 brainstorm's "Cluster 3" framing — K is one of three cluster items (I shipped as v1.7.0 plumbing, K is the user-facing feature, N was dropped).
- **Full** (template library, sharing UI, variants) introduces speculative scope. Each item in Full is its own v1.9.0+ brainstorm candidate.

---

**END OF SPEC — awaiting user review.**