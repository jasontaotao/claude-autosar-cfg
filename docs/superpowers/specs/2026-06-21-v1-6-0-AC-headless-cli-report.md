# v1.6.0 Cluster A+C — Design Spec Writer Report

**Date**: 2026-06-21
**Agent**: design-spec-writer (cluster A+C, critical path)
**Status**: DONE_WITH_CONCERNS (7 user-decisions open in §17)

---

## 1. Status

**DONE_WITH_CONCERNS** — Spec written end-to-end (17 sections, ~960 lines). 7 open questions for user in §17 (none block spec approval, all are policy defaults worth confirming before implementation plan).

## 2. Spec Path

`D:\claude_proj2\claude-AutosarCfg\docs\superpowers\specs\2026-06-21-v1-6-0-AC-headless-cli-design.md`

## 3. Section Inventory (10 required + 7 supplementary)

| §   | Section                                             | Required     | Present                                                                                                 |
| --- | --------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| 0   | Why A+C                                             | (context)    | ✅                                                                                                      |
| 1   | Scope (in/out)                                      | (1)          | ✅                                                                                                      |
| 2   | Decisions Locked (Q1–Q12)                           | (bonus)      | ✅                                                                                                      |
| 3   | Build Approach (5-PR layered)                       | (bonus)      | ✅                                                                                                      |
| 4   | Architecture & Components                           | (3)          | ✅                                                                                                      |
| 5   | Data Flow                                           | (bonus)      | ✅                                                                                                      |
| 6   | **IPC Contract Reference**                          | (key)        | ✅ (3 channels: `headless:run-command:v1`, `headless:mutate-applied:v1`, `headless:validate-result:v1`) |
| 7   | CLI Reference (flags, exit codes)                   | (4)          | ✅ (global flags + read/mutate/validate, 4 exit codes)                                                  |
| 8   | Patch Format Spec (RFC 6902 + 3 AUTOSAR extensions) | (4, partial) | ✅                                                                                                      |
| 9   | Error Handling                                      | (6)          | ✅ (16 error kinds × 2 locales = 32 i18n keys, all 4 exit codes covered)                                |
| 10  | Testing Strategy                                    | (7)          | ✅ (+39 tests: unit + integration + e2e; 95.5%/87% bar)                                                 |
| 11  | Acceptance Criteria                                 | (10)         | ✅ (12 BLOCK + 4 WARN, measurable: 2s for 5MB load, 1s for 10-step patch)                               |
| 12  | Ship Mechanics                                      | (bonus)      | ✅                                                                                                      |
| 13  | Risk Register                                       | (9, partial) | ✅ (10 risks)                                                                                           |
| 14  | Migration / Backward Compat                         | (8)          | ✅ (no GUI/store/IPC breakage; additive `:v1` channels only)                                            |
| 15  | Dependencies                                        | (bonus)      | ✅ (1 new prod dep: `commander` ^12)                                                                    |
| 16  | References                                          | (bonus)      | ✅                                                                                                      |
| 17  | Open Questions for User                             | (9)          | ✅ (7 decisions)                                                                                        |

## 4. Self-Review Checklist (11 items)

| #   | Item                                                                                | Pass?                                                                                                                                |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | IPC contract defined to implementable granularity (channel + payload + error code)? | ✅ 3 channels with full TS interfaces + 4 exit codes                                                                                 |
| 2   | CLI flags complete (≥8)?                                                            | ✅ 7 global + 3 read + 4 mutate + 2 validate = 16 flags                                                                              |
| 3   | Exit codes cover all failure modes (≥4)?                                            | ✅ 0/1/2/3 with explicit mapping per scenario                                                                                        |
| 4   | Patch format explicit (subset RFC 6902 + custom)?                                   | ✅ 3 RFC 6902 ops + 3 AUTOSAR extensions, schema-versioned "1"                                                                       |
| 5   | Consistent with brainstorm A+C scope, no scope creep?                               | ✅ no remote/RPC, no GUI button, no watch mode — all deferred correctly                                                              |
| 6   | Consistent with v1.5.1 spec style?                                                  | ✅ same section ordering (Why / Scope / Decisions / Architecture / DataFlow / IPC / Errors / Tests / Acceptance / Risks / Migration) |
| 7   | i18n policy explicit (CLI errors via `t()`)?                                        | ✅ 16 keys × EN+ZH = 32 strings; CLI logs English-only                                                                               |
| 8   | Feature flag defined (`V16_HEADLESS_CLI` / `experimental.headlessCli` default OFF)? | ✅ matches v1.5.1 dual-track pattern (Q6 A)                                                                                          |
| 9   | Risks + user-decisions listed (≥5)?                                                 | ✅ 10 risks + 7 user-decisions                                                                                                       |
| 10  | Acceptance criteria measurable (numbers / times / paths)?                           | ✅ "5MB load < 2s", "10-step patch < 1s", "16 error kinds × 2 locales", exact paths                                                  |
| 11  | Dedicated "IPC Contract Reference" section for G/W/U to import?                     | ✅ §6 is 60+ lines of channel names + TS payloads + versioning policy                                                                |

## 5. Key Decisions Locked

1. **CLI parser**: `commander.js` ^12 (zero deps, smaller bundle than yargs).
2. **Patch format**: Subset RFC 6902 (`add`/`remove`/`replace`) + 3 AUTOSAR extensions (`set-param`, `add-child`, `remove-with-cascade`); strict `autosarcfgPatchVersion: "1"` for future versioning.
3. **Exit codes**: 4 codes (0 success / 1 fatal / 2 partial-with-warnings / 3 invalid-input); matches POSIX convention + lets CI distinguish "warnings, review" from "fatal, fail".
4. **IPC channels**: 3 new `:v1` channels added to `IPC_CHANNELS` in `src/shared/ipc-contract.ts` — additive only, no existing channel touched. CLI binary does NOT use IPC in v1 (forward-declared for v1.7.0 GUI bridge).
5. **Process model**: Standalone Node (`node bin/autosarcfg.mjs ...`), no Electron. Distributed via npm `bin` field; Windows shim is `bin/autosarcfg.cmd`. Future "GUI Run CLI" button is feature-flagged OFF (`experimental.headlessCli`).
6. **Feature flag inheritance**: CLI reads the same `settings.json` as GUI for `experimental.streaming` / `experimental.indexedDb` (consistency); `--streaming` / `--cache` CLI flags override per-invocation.
7. **Error envelope**: `HeadlessFailure { ok: false, code: 1|2|3, error: HeadlessError, stderr: string[] }` — `error.kind` for CI grep + retry logic, `error.message` pre-localized on the wire.

## 6. IPC Contract Reference (for G / W / U cluster specs)

### Channel 1 — `headless:run-command:v1` (R→M, invoke)

**Purpose**: GUI forwards `HeadlessCommand` to main (v1.7.0+ "Run CLI" button). v1.6.0: registered but unused.

```ts
// Request
export interface HeadlessRunRequest {
  readonly command: HeadlessCommand;
  readonly locale?: 'en' | 'zh';
}

// Response
export type HeadlessRunResponse =
  | { readonly ok: true; readonly result: HeadlessResult }
  | { readonly ok: false; readonly error: HeadlessError; readonly exitCode: 1 | 2 | 3 };

export type HeadlessCommand =
  | { readonly kind: 'read'; readonly input: ReadArgs }
  | { readonly kind: 'mutate'; readonly input: MutateArgs }
  | { readonly kind: 'validate'; readonly input: ValidateArgs };
```

### Channel 2 — `headless:mutate-applied:v1` (M→R, push event)

**Purpose**: After mutate completes, main pushes so GUI can refresh tree + dirty flag. v1.6.0: emitted by CLI; subscribes deferred to v1.7.0 U.

```ts
export interface HeadlessMutateAppliedEvent {
  readonly projectPath: string;
  readonly patchId: string;
  readonly paths: ReadonlyArray<string>; // paths touched (tree refresh hint)
  readonly durationMs: number;
}
```

### Channel 3 — `headless:validate-result:v1` (M→R, push event)

**Purpose**: Cluster G SWS Validator pushes violations to GUI Issues panel.

```ts
export interface HeadlessValidateResultEvent {
  readonly projectPath: string;
  readonly results: ReadonlyArray<ValidatorResult>;
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

### Versioning policy (frozen at v1.6.0 tag)

- All channels use `:v1` suffix.
- Breaking changes → parallel `:v2` channels (renderer picks).
- Additive payload fields are back-compat within `:v1` (no version bump).

### Shared error envelope

All three channels use the `HeadlessError` union (16 kinds: `file-not-found`, `permission-denied`, `parse-error`, `patch-invalid`, `unsupported-patch-version`, `mutation-failed`, `write-failed`, `i18n-key-missing`, `internal-error`, ...). `error.message` is **pre-localized** via `t(locale, key, params)` before being placed on the wire — no post-hoc translation in the renderer.

## 7. Concerns / Open Questions for User

Listed in §17 of the spec. None block spec approval; all are policy defaults worth confirming before the implementation plan is written.

1. **CLI parser choice**: `commander.js` chosen over `yargs`/`cac`. Confirm.
2. **`--backup` default `true`**: default-on to match AUTOSAR tooling convention (file overwrite needs `.bak-<ts>`). Confirm.
3. **i18n string count (16)**: can reduce to 8 generic-but-less-grep-able. Confirm 16.
4. **Settings.json inheritance in CLI**: CLI reads `~/.config/claude-autosarcfg/settings.json` for `experimental.streaming` / `experimental.indexedDb`. Alternative: env-var only. Confirm.
5. **`PatchDocument.metadata` round-trip**: round-trip into result envelope for audit trail. Confirm or drop.
6. **Cluster U pre-stub**: should v1.6.0 A+C ship a Cmd-K placeholder for "Run last CLI command"? Recommend **no** (avoids dead UI).
7. **Cluster G contract alignment**: `ValidatorResult` shape locked here. **G spec MUST import verbatim** (no drift) — request user confirmation that G spec writer will pin to this shape.

## 8. Files Touched

- ✅ Created: `docs/superpowers/specs/2026-06-21-v1-6-0-AC-headless-cli-design.md` (~960 lines)
- ✅ Created: `docs/superpowers/specs/2026-06-21-v1-6-0-AC-headless-cli-report.md` (this file)
- ❌ Did NOT touch any `src/`, `package.json`, IPC channels, store slices, or existing spec files
- ❌ Did NOT run `pnpm test`, `pnpm build`, or any code-modifying commands
- ❌ Did NOT create any implementation plan (Phase 3) — waits for user approval per spec workflow

## 9. Next Steps (per parent agent)

1. User reviews spec + answers 7 open questions in §17.
2. After approval: parent agent dispatches implementation-plan-writer to produce `docs/superpowers/plans/2026-06-21-v1-6-0-AC-headless-cli.md` (5-PR layered atomic).
3. Cluster G / W / U spec writers should import §6 (IPC Contract Reference) verbatim — confirm before G/U/W specs ship.
