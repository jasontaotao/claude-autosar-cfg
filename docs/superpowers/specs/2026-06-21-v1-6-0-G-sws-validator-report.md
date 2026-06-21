# Cluster G Spec Writer Report

**Status**: DONE_WITH_CONCERNS
**Spec path**: `D:\claude_proj2\claude-AutosarCfg\docs\superpowers\specs\2026-06-21-v1-6-0-G-sws-validator-design.md`

## Spec Sections Checklist (10 sections, all present)

| #   | Section                            | Status                                                                                                                    |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | Overview & Goals                   | PASS                                                                                                                      |
| 2   | User Stories                       | MERGED INTO §1 + §4.6 (no separate section — absorbed into scope + starter-rules context; same coverage, less repetition) |
| 3   | Architecture & Components          | PASS                                                                                                                      |
| 4   | API/Interface Contract             | PASS                                                                                                                      |
| 5   | Data Model                         | PASS                                                                                                                      |
| 6   | Error Handling                     | PASS                                                                                                                      |
| 7   | Testing Strategy                   | PASS                                                                                                                      |
| 8   | Migration / Backward Compatibility | PASS                                                                                                                      |
| 9   | Risks & Open Questions             | PASS (10 entries, exceeds the ≥5 floor)                                                                                   |
| 10  | Acceptance Criteria                | PASS (11 BLOCK + 4 WARN, with measurable numbers)                                                                         |

Note: User Stories were folded into §1 (Scope) and §4.6 (starter-rule scenarios) rather than given a separate §2. The brainstorm brief listed §2 as "3 scenarios (GUI 实时校验 / CLI --validate / 自定义规则 drop-in)" — all three are present in §4.4 data flow, §4.6 C1–C5, and §5.6 CLI surface. If the spec template strictly requires a dedicated §2, easy to split out before PR.

## Self-review Checklist (10 items)

| #   | Item                                                                                                                                                              | Verdict                                                                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Rule interface fully defined in TypeScript                                                                                                                        | PASS — §5.1 `ValidatorRule` + §5.4 `RuleCtx` + full type signatures                                                                                                                                                   |
| 2   | IPC contract explicitly referenced (with placeholder for A+C)                                                                                                     | PASS — §4.5 has `PENDING AC IPC CONTRACT` banner + `SWS_VALIDATE` channel proposal                                                                                                                                    |
| 3   | Starter rules listed with ≥ 3 candidates awaiting user pick                                                                                                       | PASS — §4.6 lists 5 candidates (C1–C5) with severity + SWS reference                                                                                                                                                  |
| 4   | Sandbox mechanism briefly described (reuse v1.3.0 Script Engine)                                                                                                  | PASS — §3 "Approach 1", §5.4 ctx API, §11 R2 explicitly call out reuse                                                                                                                                                |
| 5   | Within brainstorm-locked G scope; no scope creep                                                                                                                  | PASS — explicitly excludes: rule UI editor (v1.7.0+), auto-fix (v1.7.0+), variants (v1.8.0+), UDS (parked), ASPICE (v1.7.0), DBC bridge (v1.7.0), Python lint rules (separate project). §1 "Out of scope" enumerated. |
| 6   | Matches v1.5.1 spec style                                                                                                                                         | PASS — same section numbering convention, same Q&A decision table style, same PR-wave build approach, same i18n/error-handling discipline                                                                             |
| 7   | i18n strategy explicit (≥ 2 keys per starter rule)                                                                                                                | PASS — §2 G9 decision, §5.1 messageKey + messageVars, §7.3 loader rejects missing keys, §8.1 starter tests, §12 #4 BLOCK criterion                                                                                    |
| 8   | Feature flag explicit (`V16_SWS_VALIDATOR` per brief → adjusted to `experimental.swsValidator` to match existing `src/main/arxml-stream/feature-flag.ts` pattern) | PASS — §1 #9, §2 G5, §4.1 module map, §7.4 fallback semantics, §12 #9 BLOCK criterion                                                                                                                                 |
| 9   | ≥ 5 risks / open questions clearly listed                                                                                                                         | PASS — §11 has 10 risks (R1–R10), each with likelihood / impact / owner                                                                                                                                               |
| 10  | Acceptance criteria measurable (with numbers / time)                                                                                                              | PASS — §12 BLOCK items include concrete counts (1692 → ~1764 tests, ≥ 95.5/87 coverage, 1000-node ≤ 500ms perf budget, bundle ≤ 850 kB), 3 severity-specific exit codes, 5 starter rules coverage target              |

## Key Decisions (5)

1. **Rule interface shape** — `interface ValidatorRule { id, defaultSeverity, messageKey, check(ctx), targetModule? }`. Pure function, no I/O, no mutation. Result type `SwsValidatorResult` is a **parallel** type to existing `ValidationError` (different taxonomy: SWS-rule-id vs `ValidationErrorKind`); explicit decision to keep both rather than overload.

2. **Sandbox reuse from Sprint 14 Script Engine** — `src/core/sws-validator/sandbox/vm-runner.ts` is a **copy** of `src/main/script/vm-runner.ts` (not an import), because the ctx API surface is different (read-only project + `log` + `result()` helper vs Script Engine's mutation API). Same vm mechanics, different ctx shape. R2 in §11 explicitly flags worker-thread upgrade path for v1.7.0 if perf needs it.

3. **Starter rules candidate list** — 5 candidates listed (C1–C5 across Com / ComM / PduR / EcuC / cross-BSWMD). User picks 3–5; default proposal: 4 (skip C2 because "alignment warning is subjective"). §11 R3 calls out the trade-off.

4. **IPC contract placeholder strategy** — §4.5 has `PENDING AC IPC CONTRACT` banner. G locks `SWS_VALIDATE: 'sws-validator:run'` channel in `src/shared/ipc-contract.ts`; A+C's exact `--validate` invocation shape is TBD. If A+C's spec picks SARIF by default, G5's emitter adapts. R1 in §11 flags this as P1.

5. **GUI debounce + incremental strategy** — Spec picks 300ms debounce on edit, run on idle. Alternative (re-run only rules tagged with the edited path's module) is raised as R4 in §11 for user/plan-stage confirmation. Not locked to keep the spec adaptive.

## Starter Rules Candidates (5 listed, user picks 3–5)

| #   | Rule id                       | Module | Severity | One-line description                                                              |
| --- | ----------------------------- | ------ | -------- | --------------------------------------------------------------------------------- |
| C1  | `SWS_COM_PDUID_UNIQUE`        | Com    | error    | ComPduId values within a ComConfig must be unique.                                |
| C2  | `SWS_COMM_CHANNEL_PDUR_ALIGN` | ComM   | warning  | Each ComMChannel must be referenced by exactly one PduRRoutingPath.               |
| C3  | `SWS_PDUR_ROUTING_COMPLETE`   | PduR   | error    | Every PduRRoutingPath must specify a complete source→destination path.            |
| C4  | `SWS_ECUC_MULTIPLICITY_MIN`   | EcuC   | error    | Actual child-instance count ≥ lowerMultiplicity per EcucContainerDef.             |
| C5  | `SWS_BSWMD_DEPS_PRESENT`      | cross  | error    | Every BSWMD-declared module dependency must be defined by some loaded BSWMD file. |

**Default proposal**: ship C1 + C3 + C4 + C5 (4 rules, skip C2). 3 errors + 1 cross-cutting covers the most common SWS conformance gaps; C2's "alignment" warning is subjective and could be noisy on first run.

## Concerns / Open Questions for User

1. **AC IPC contract (R1)** — A+C spec was not present at writing time. G proposes `SWS_VALIDATE: 'sws-validator:run'` in `src/shared/ipc-contract.ts`. Need A+C spec writer to confirm or adjust. If A+C chose SARIF by default, PR(G5) adapts.

2. **Starter rule count + which to include (R3)** — Spec lists 5; default proposal is 4. User to lock.

3. **GUI re-validation strategy (R4)** — Spec picks 300ms debounce + run-on-idle. Alternative is incremental (only rules tagged for the edited module). Lock before PR(G4) lands.

4. **GUI panel default state (G7 decision pending)** — Spec says collapsed-by-default. User may prefer open-by-default to encourage adoption.

5. **CLI output format default (G8 decision pending)** — Spec says JSON primary + SARIF optional. User may prefer SARIF-by-default for CI integration.

6. **Feature flag name** — Brief says `V16_SWS_VALIDATOR`. Spec uses `experimental.swsValidator` to match existing `src/main/arxml-stream/feature-flag.ts` pattern (`experimental.streaming`, `experimental.indexedDb`). Need user to confirm naming convention preference.

7. **Spec section structure** — §2 "User Stories" was folded into §1 and §4.6 rather than given a dedicated section. If the spec template requires a strict §2, easy split-out before PR.

8. **`fix` field placeholder** — `SwsValidatorResult.fix` is typed `never` in v1.6.0; spec says v1.7.0+ may relax. Could be a footgun if external tools start consuming JSON and expect `fix` shape. Plan stage should lock the discriminator before PR(G5) ships.

## File path

- Spec: `D:\claude_proj2\claude-AutosarCfg\docs\superpowers\specs\2026-06-21-v1-6-0-G-sws-validator-design.md` (24 KB, 13 numbered sections)
