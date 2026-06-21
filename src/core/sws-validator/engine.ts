// src/core/sws-validator/engine.ts
// Cluster G (v1.6.0) — ValidationEngine.
//
// Orchestrates: build context → for each rule call `check(ctx)` → aggregate →
// enforce timeout per rule. Pure / sync / no I/O (no fs, no IPC). The
// timeout is a post-hoc marker (V0.1 same as v1.3.0 Script Engine —
// v1.7.0 will swap to worker_threads if perf budget missed).
//
// Tour coordination (G spec §3.9): when `tourState.validationPaused === true`,
// the engine silently returns `[]` (no warning, no error). This is the
// expected behavior during a W tour, not a failure mode.

import { DEFAULT_LOCALE, t } from '../../shared/i18n.js';
import type { Locale } from '../../shared/i18n.js';

import type { RuleRegistry } from './RuleRegistry.js';
import { buildValidationContext } from './context.js';
import { subscribeToValidationPaused } from './hooks/useTourState.js';
import type {
  InternalValidatorResult,
  RunInput,
  RunOptions,
  RunResult,
  Severity,
  ValidatorRule,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_SEVERITY_FLOOR: Severity = 'info';

const SEVERITY_ORDER: Readonly<Record<Severity, number>> = {
  error: 3,
  warning: 2,
  info: 1,
};

/**
 * In-process mirror of `useArxmlStore.tour.validationPaused`. Updated
 * via `subscribeToValidationPaused()` at engine-init time (see
 * `installTourSubscription` below). The debounce handler reads this
 * flag — when `true`, it silently skips rule execution per G spec §3.9
 * (Round 3 in-process refinement).
 */
let inProcessValidationPaused = false;

/**
 * Install the in-process tour subscription. Idempotent — multiple
 * callers are safe (the engine will overwrite the previous mirror
 * with the latest value, which is what we want).
 *
 * Called from the renderer at app-boot (e.g. ValidationPanel mount
 * or App.tsx). NOT called from the CLI path (no tour in headless).
 */
export function installTourSubscription(): () => void {
  return subscribeToValidationPaused((paused) => {
    inProcessValidationPaused = paused;
  });
}

/**
 * Run validation across the supplied rules + project state.
 *
 * Returns a `RunResult` synchronously. The async signature is reserved
 * for v1.7.0's worker-thread swap (G spec §11 R2) and is consistent
 * with `ScriptRunResult` callers in the renderer.
 */
export async function runValidation(
  registry: RuleRegistry,
  input: RunInput,
  opts: RunOptions = {},
): Promise<RunResult> {
  const start = Date.now();

  // Tour coordination (G spec §3.9): silent skip when W tour is running.
  // Two triggers fire this gate:
  //   1. opts.tourState (explicit, e.g. test fixture)
  //   2. inProcessValidationPaused (set by installTourSubscription())
  // Either one being true returns [].
  const tourPaused = opts.tourState?.validationPaused === true || inProcessValidationPaused;
  if (tourPaused) {
    return {
      results: [],
      durationMs: Date.now() - start,
      rulesRun: 0,
      rulesSkipped: registry.size,
      timedOut: [],
    };
  }

  const locale: Locale = opts.locale ?? DEFAULT_LOCALE;
  const severityFloor = opts.severityFloor ?? DEFAULT_SEVERITY_FLOOR;
  const timeoutMs = opts.timeoutMsPerRule ?? DEFAULT_TIMEOUT_MS;

  // Filter by ruleIds if specified.
  const allRules = registry.getAll();
  const rules: readonly ValidatorRule[] =
    opts.ruleIds === undefined ? allRules : registry.filter(opts.ruleIds);

  const ctx = buildValidationContext({
    document: input.document,
    schemaLayer: input.schemaLayer,
    locale,
    tourState: opts.tourState ?? { validationPaused: false },
  });

  const results: InternalValidatorResult[] = [];
  const timedOut: string[] = [];
  let rulesRun = 0;
  const rulesSkipped = allRules.length - rules.length;

  for (const rule of rules) {
    const ruleStart = Date.now();
    try {
      const out = rule.check(ctx);
      const elapsed = Date.now() - ruleStart;
      rulesRun += 1;
      if (elapsed > timeoutMs) {
        timedOut.push(rule.id);
      }
      for (const r of out) {
        if (severityPasses(r.severity, severityFloor)) {
          results.push(r);
        }
      }
    } catch (err) {
      // Per G spec §7.1: caught at boundary. Emit one synthetic error
      // result with `messageKey: 'swsValidator.runtimeError'`.
      rulesRun += 1;
      results.push({
        ruleId: rule.id,
        severity: 'error',
        messageKey: 'swsValidator.runtimeError',
        messageVars: {
          ruleId: rule.id,
          message: err instanceof Error ? err.message : String(err),
        },
        path: '',
      });
    }
  }

  // Sort by severity (error first) then by path for stable panel display.
  results.sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity];
    const sb = SEVERITY_ORDER[b.severity];
    if (sa !== sb) return sb - sa;
    return a.path.localeCompare(b.path);
  });

  return {
    results: Object.freeze(results),
    durationMs: Date.now() - start,
    rulesRun,
    rulesSkipped,
    timedOut: Object.freeze(timedOut),
  };
}

function severityPasses(s: Severity, floor: Severity): boolean {
  // Floor of 'info' passes everything; 'warning' filters out info;
  // 'error' filters out warning + info.
  return SEVERITY_ORDER[s] >= SEVERITY_ORDER[floor];
}

/**
 * Convenience helper: translate an internal result using the shared
 * i18n helper. Returns the pre-localized `message` string. Used by the
 * GUI panel + CLI JSON output (which both render the localized message
 * directly). For the canonical wire shape used by A+C, see
 * `adapter.ts:toWireResult`.
 */
export function renderMessage(
  result: InternalValidatorResult,
  locale: Locale = DEFAULT_LOCALE,
): string {
  // Cast: InternalValidatorResult.messageKey is a `string` so user-defined
  // rules can use their own namespace; the bundled `t()` typing wants
  // `keyof Messages` (the build-time-known keys). At runtime the parity
  // test catches typos.
  return t(
    locale,
    result.messageKey as Parameters<typeof t>[1],
    result.messageVars as Readonly<Record<string, string | number | boolean>> | undefined,
  );
}
