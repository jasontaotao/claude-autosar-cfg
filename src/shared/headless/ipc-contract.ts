// Headless Config Engine IPC contract — wire-shape SoT (v1.6.0 A+C-2).
//
// Per A+C spec §6: this file owns the wire types (ValidatorResult /
// HeadlessCommand / HeadlessResult / HeadlessError + PatchDocument) so
// G (Cluster G SWS Validator), W (Demo ECU), and U (Command Palette) can
// all import from one canonical location. The IPC channel constants
// themselves live in `src/shared/ipc-contract.ts` next to the existing 32
// channels — this file only re-exports them under HEADLESS_* names for
// renderer convenience (per Round 3 clarification, 2026-06-21).
//
// Path split (by design):
//   - Wire types        → src/shared/headless/ipc-contract.ts (THIS file)
//   - Channel constants → src/shared/ipc-contract.ts (existing v1.5.1)
//
// All channel names use `:v1` suffix per v1.5.0 convention; v1.7.0 may
// introduce `:v2` channels without breaking v1.6.0 callers.

// ---------------------------------------------------------------------------
// IPC channels (re-exported from src/shared/ipc-contract.ts for convenience)
// ---------------------------------------------------------------------------

/**
 * Renderer→Main invoke channel. Carries a `HeadlessRunRequest` (a
 * `HeadlessCommand` + optional locale override). v1.6.0 only registers
 * this channel; the GUI bridge that calls it ships in v1.7.0+
 * (per A+C spec §6 "Channel 1").
 */
export const HEADLESS_RUN_COMMAND = 'headless:run-command:v1' as const;

/**
 * Main→Renderer push event. After a mutate completes (CLI or future
 * GUI bridge), main emits this so the GUI can refresh the project tree
 * + dirty flag without re-reading the manifest (per A+C spec §6
 * "Channel 2").
 */
export const HEADLESS_MUTATE_APPLIED = 'headless:mutate-applied:v1' as const;

/**
 * Main→Renderer push event. Cluster G SWS Validator emits structured
 * violations to the GUI Issues panel via this channel (per A+C spec §6
 * "Channel 3"). In v1.6.0 A+C only emits an empty + `stub: true` payload;
 * G cluster replaces the body in v1.6.0 G-side.
 */
export const HEADLESS_VALIDATE_RESULT = 'headless:validate-result:v1' as const;

/** Discriminated union of all 3 headless IPC channel names. */
export type HeadlessIpcChannel =
  | typeof HEADLESS_RUN_COMMAND
  | typeof HEADLESS_MUTATE_APPLIED
  | typeof HEADLESS_VALIDATE_RESULT;

// ---------------------------------------------------------------------------
// ValidatorResult — canonical wire shape (per A+C spec §4 + C1 fix)
// ---------------------------------------------------------------------------

/**
 * One violation surfaced on the `headless:validate-result:v1` channel.
 *
 * This is the **wire type** — G's engine-internal `SwsEngineResult`
 * (renamed from `SwsValidatorResult` per C1 fix) is translated to this
 * shape at the IPC boundary via `swsResultToValidatorResult` (G-owned
 * adapter; see G spec §5.1).
 *
 * `severity` is restricted to `'error' | 'warning'` here. G's engine
 * may internally distinguish `'info'`, but the wire union narrows it
 * to A+C's supported tiers — renderers parse `severity` for filter
 * logic without dealing with a third tier (per synthesizer C1 fix).
 */
export interface ValidatorResult {
  /** Stable rule id (e.g. `SWS_COM_PDUID_UNIQUE`). */
  readonly ruleId: string;
  readonly severity: 'error' | 'warning';
  /** ECUC path of the offending container / param / reference. */
  readonly path: string;
  /** Pre-localized message string (renderer does not re-translate). */
  readonly message: string;
  /** Optional i18n key for renderer-side severity-grouped grouping. */
  readonly i18nKey?: string;
}

// ---------------------------------------------------------------------------
// HeadlessCommand — dispatched sub-command envelope (per A+C spec §4)
// ---------------------------------------------------------------------------

export interface ReadArgs {
  /** Path to `.autosarcfg.json` manifest or a single `.arxml` for loose mode. */
  readonly projectPath: string;
  /** Restrict output to specific paths (POSIX extended-glob; empty = all). */
  readonly paths?: ReadonlyArray<string>;
  readonly format: 'json' | 'summary' | 'arxml-dump';
}

export interface MutateArgs {
  readonly projectPath: string;
  /** Path to patch file, or `'-'` for stdin. */
  readonly patch: string;
  readonly format: 'json' | 'summary';
  readonly dryRun: boolean;
}

export interface ValidateArgs {
  readonly projectPath: string;
  readonly format: 'json' | 'summary';
  /** v1: stub only — emits empty result with `stub: true`. */
  readonly stub: boolean;
}

/** Discriminated union of the v1 CLI sub-commands (per A+C spec §4 + v1.11.0 generate). */
export type HeadlessCommand =
  | { readonly kind: 'read'; readonly input: ReadArgs }
  | { readonly kind: 'mutate'; readonly input: MutateArgs }
  | { readonly kind: 'validate'; readonly input: ValidateArgs }
  | { readonly kind: 'generate'; readonly input: GenerateArgs };

// ---------------------------------------------------------------------------
// Generate command — v1.11.0 BSW generator sub-command
// ---------------------------------------------------------------------------

/** Pre-compile / link-time / post-build variant selectors for BSW code generation. */
export type HeadlessGenerateVariant = 'PreCompile' | 'Link' | 'PostBuild';

/** Output format for the `generate` sub-command. */
export type HeadlessGenerateFormat = 'human' | 'json';

/**
 * Arguments for the `generate` sub-command (v1.11.0 BSW generator).
 *
 * Mirrors the dispatcher envelope: `command` discriminates to `generate`
 * so a future GUI bridge can parse the union without per-call narrowing.
 */
export interface GenerateArgs {
  readonly command: 'generate';
  /** Path to `.autosarcfg.json` manifest. */
  readonly projectPath: string;
  /** Variant selector; default `PreCompile`. */
  readonly variant?: HeadlessGenerateVariant;
  /** Output directory; default `<projectPath>/generated`. */
  readonly outDir?: string;
  /** Optional module short-name allowlist; undefined = all modules. */
  readonly modules?: readonly string[];
  /** Promote WARNING → ERROR (exit 1 instead of 0). */
  readonly strict?: boolean;
  /** Output format; default `human` for CLI ergonomics. */
  readonly format?: HeadlessGenerateFormat;
}

/** A single generated file: relative path + byte count. */
export interface GeneratedFile {
  readonly path: string;
  readonly bytes: number;
}

/**
 * Result envelope for the `generate` sub-command. `ok` is `false` only
 * when the pipeline reported at least one ERROR (i.e. exitCode 1).
 * WARNING-only runs still surface as `ok: true` so the dispatcher can
 * map them to EXIT_WARNING without an exception.
 */
export interface GenerateResult {
  readonly ok: boolean;
  readonly command: 'generate';
  readonly projectPath: string;
  readonly outDir: string;
  readonly variant: HeadlessGenerateVariant;
  readonly files: readonly GeneratedFile[];
  readonly diagnostics: readonly ValidatorResult[];
  readonly durationMs: number;
}

// ---------------------------------------------------------------------------
// HeadlessResult — standard output envelope (per A+C spec §4)
// ---------------------------------------------------------------------------

export interface ReadResultSummary {
  readonly arxmlVersion: string;
  readonly moduleCount: number;
  readonly containerCount: number;
  readonly parameterCount: number;
  readonly referenceCount: number;
}

export interface ReadResult {
  readonly ok: true;
  readonly command: 'read';
  readonly projectPath: string;
  readonly summary: ReadResultSummary;
  /**
   * Full normalized document OR array of `{path, content}` raw XML
   * snippets depending on `format`. Renderers parse the `command`
   * discriminant to narrow.
   */
  readonly document: unknown;
  readonly durationMs: number;
}

export interface MutateResult {
  readonly ok: true;
  readonly command: 'mutate';
  readonly projectPath: string;
  readonly patchId: string;
  readonly stepsApplied: number;
  readonly stepsTotal: number;
  /** v1.18.0 Obs-3 — non-fatal step diagnostics from `applyPatchSteps`. */
  readonly warnings: ReadonlyArray<MutationStepWarning>;
  readonly durationMs: number;
  /** Populated only when `--dry-run` is set. */
  readonly dryRunPreview?: string;
}

export interface ValidateResult {
  readonly ok: true;
  readonly command: 'validate';
  readonly projectPath: string;
  /** v1: always empty array + `stub: true`. G cluster fills in v1.6.0 G-side. */
  readonly results: ReadonlyArray<ValidatorResult>;
  readonly stub: true;
  readonly durationMs: number;
}

/** Discriminated union of all successful command results (read / mutate / validate / generate). */
export type HeadlessResult = ReadResult | MutateResult | ValidateResult | GenerateResult;

// ---------------------------------------------------------------------------
// v1.15.5 — StubHeadlessResult
//
// Generic stub envelope returned by unwired IPC channels (`HEADLESS_RUN_COMMAND`)
// registered as placeholders so the channel name space is fully populated
// (channel-name drift risk closed). Mirrors the `ValidateResult.stub: true`
// pattern but without the `command` / `projectPath` discriminators that
// concrete command results carry.
// ---------------------------------------------------------------------------

export interface StubHeadlessResult {
  readonly ok: true;
  readonly stub: true;
}

// ---------------------------------------------------------------------------
// HeadlessError — failure envelope (per A+C spec §4 + §9)
// ---------------------------------------------------------------------------

/** A single step-level error inside a `mutation-failed` HeadlessError. */
export interface MutationStepError {
  readonly stepIndex: number;
  readonly kind: string;
  readonly message: string;
}

/**
 * v1.18.0 MINOR T1 (Obs-3) — wire-shape for `StepWarning`.
 *
 * Mirrors `StepWarning` in `src/core/mutation/applyPatchSteps.ts`
 * but omits the optional `step: PatchStep` field — the wire shape
 * carries only what consumers (CLI, headless scripts) need. The
 * renderer can re-derive the step context from the patch document
 * if it needs to drill down.
 */
export interface MutationStepWarning {
  readonly stepIndex: number;
  readonly kind: string;
  readonly message: string;
}

export type HeadlessError =
  | { readonly kind: 'file-not-found'; readonly path: string }
  | { readonly kind: 'permission-denied'; readonly path: string }
  | {
      readonly kind: 'parse-error';
      readonly path: string;
      readonly line?: number;
      readonly message: string;
    }
  | { readonly kind: 'patch-invalid'; readonly reason: string; readonly line?: number }
  | { readonly kind: 'unsupported-patch-version'; readonly version: string }
  | {
      readonly kind: 'mutation-failed';
      readonly planId: string;
      readonly errors: ReadonlyArray<MutationStepError>;
    }
  | { readonly kind: 'write-failed'; readonly path: string; readonly message: string }
  | { readonly kind: 'i18n-key-missing'; readonly key: string }
  | { readonly kind: 'internal-error'; readonly message: string };

/**
 * Canonical failure envelope returned on non-zero exit codes.
 * Mirrors `core/arxml/types.ts` Result shape but adds `code` (exit code)
 * + `stderr` (pre-localized human-readable lines).
 */
export interface HeadlessFailure {
  readonly ok: false;
  /** 1 = fatal, 2 = partial success w/ warnings (no error), 3 = invalid input. */
  readonly code: 1 | 2 | 3;
  readonly error: HeadlessError;
  readonly stderr: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// PatchDocument — patch file input shape (per A+C spec §4 + §8)
// ---------------------------------------------------------------------------

/**
 * AUTOSAR-specific extensions to RFC 6902 JSON Patch. The 3 extensions
 * cover cascade-delete + set-param that pure JSON Patch cannot express
 * cleanly (per A+C spec §4 "Why not pure RFC 6902" rationale).
 */
export type PatchStep =
  // RFC 6902 subset — for paths not covered by AUTOSAR extensions.
  | { readonly op: 'add'; readonly path: string; readonly value: unknown }
  | { readonly op: 'remove'; readonly path: string }
  | { readonly op: 'replace'; readonly path: string; readonly value: unknown }
  // AUTOSAR-specific extensions.
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
      readonly definitionRef?: string;
    }
  | {
      readonly op: 'remove-with-cascade';
      readonly containerPath: string;
      readonly cascade: boolean;
    }
  // v1.18.0 MINOR T8 (C8) — variant engineering downgrade step.
  // Carries the multiplicity transition that the param is about to
  // undergo; `variantDowngradeStep` evaluates it and emits a
  // `StepWarning { kind: 'variant-downgrade' }` when the transition
  // loosens variant binding. The dispatcher wires the warning into
  // `ApplyResult.warnings` (T1 / Obs-3). The step is a *diagnostic*
  // op — it does NOT mutate the document.
  | {
      readonly op: 'variant-downgrade';
      readonly containerPath: string;
      readonly paramName: string;
      readonly fromMultiplicity: 'POST-BUILD' | 'PRE-COMPILE' | 'LINK-TIME';
      readonly toMultiplicity: 'POST-BUILD' | 'PRE-COMPILE' | 'LINK-TIME';
    };

/**
 * Canonical input shape for the `mutate` command. Empty `steps` array
 * is legal (no-op; exit 0). Schema version is `"1"` and enforced
 * strictly (unknown versions → `unsupported-patch-version` exit 3).
 */
export interface PatchDocument {
  /** Schema version. Currently `"1"`. Strict — unknown versions → exit 3. */
  readonly autosarcfgPatchVersion: '1';
  /** Optional metadata (round-tripped to `MutateResult` for audit trail). */
  readonly metadata?: Readonly<Record<string, string>>;
  /** Ordered list of mutations to apply. Empty array = no-op (still exit 0). */
  readonly steps: ReadonlyArray<PatchStep>;
}

// ---------------------------------------------------------------------------
// i18n keys for error envelope (per A+C spec §9 — 16 keys × 2 locales)
// ---------------------------------------------------------------------------

/**
 * Canonical i18n key namespace for HeadlessError envelope messages.
 * These keys MUST resolve in both `MessagesZhCN` and `MessagesEn`
 * bundles; the i18n parity test (`src/shared/__tests__/i18n.test.ts`)
 * catches missing keys at build time.
 */
export type HeadlessErrorI18nKey =
  | 'headless.error.projectNotFound'
  | 'headless.error.parseFailed'
  | 'headless.error.bswmdParseFailed'
  | 'headless.error.patchNotFound'
  | 'headless.error.permissionDenied'
  | 'headless.error.diskFull'
  | 'headless.error.pathTraversal'
  | 'headless.error.patchMissingVersion'
  | 'headless.error.unsupportedPatchVersion'
  | 'headless.error.patchInvalidStep'
  | 'headless.error.patchInvalidValue'
  | 'headless.error.patchParseFailed'
  | 'headless.error.mutationPathNotFound'
  | 'headless.error.mutationMultiplicity'
  | 'headless.error.mutationCycle'
  | 'headless.error.fileLocked'
  | 'headless.error.strictModeWarning';
