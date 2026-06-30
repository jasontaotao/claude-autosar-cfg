// Sprint 14 #1 — node:vm sandbox runner.
//
// V0.1 design (per spec § 8.2): no real cancellation. Timeout is a
// post-hoc marker. The vm is created in main thread; long-running
// scripts WILL block the main process. This is accepted as the
// "trusted engineer" trust model. V0.2 will move to worker_threads.
//
// The script wrapper (per spec § 4.3) wraps each entry as an IIFE
// with named exports hoisted to `__m_<shortName>` so the entry can
// import them.

import { runInContext, createContext, Script as VmScript } from 'node:vm';

import type { ArxmlDocument } from '../../core/arxml/types.js';

import { buildScriptCtx } from './ctx.js';
import type {
  ScriptEntry,
  ScriptLog,
  ScriptMutation,
  ScriptRunResult,
  ScriptViolation,
} from './types.js';

export interface RunOptions {
  /** Wall-clock timeout in ms. Post-hoc only (spec § 8.2). */
  readonly timeoutMs?: number;
  /** Required: the project the script operates on. */
  readonly project: ArxmlDocument;
  /**
   * Optional live-progress hook. Fires synchronously after each
   * `ctx.log.*` call (in addition to the `logs` sink-array push),
   * allowing the caller to stream `ScriptProgressEvent`s to the
   * renderer before `runInSandbox` returns. The first argument is
   * the `runId` assigned at run start; the second is the `ScriptLog`
   * line that was just emitted.
   *
   * Added in v1.17.0 (IPC-1) to close the orphan SCRIPT_PROGRESS
   * push channel. The hook is invoked from inside the user-script
   * call frame — callers MUST keep the body allocation-light
   * (e.g. an IPC `send`) and MUST NOT throw.
   */
  readonly onLog?: ((runId: string, log: ScriptLog) => void) | undefined;
}

/**
 * Mutable sink arrays the runner writes into during execution.
 * Callers (vm-runner consumers like the IPC handler) read these
 * AFTER `runInSandbox` returns. Splitting them into separate
 * arrays keeps the function signature explicit and matches the
 * discriminated `ScriptRunResult` shape.
 */
export interface RunSinks {
  readonly logs: ScriptLog[];
  readonly violations: ScriptViolation[];
  readonly mutations: ScriptMutation[];
}

let _runCounter = 0;
function nextRunId(): string {
  _runCounter += 1;
  return `run-${Date.now().toString(36)}-${_runCounter.toString(36)}`;
}

/**
 * Run `entry.source` inside a fresh `node:vm` context, returning a
 * `ScriptRunResult`. Logs / violations / mutations are appended to
 * the matching sink arrays.
 */
export function runInSandbox(
  entry: ScriptEntry,
  logs: ScriptLog[],
  violations: ScriptViolation[],
  mutations: ScriptMutation[],
  options: RunOptions,
): ScriptRunResult {
  const start = Date.now();
  const runId = nextRunId();

  // Snapshot the sink arrays at entry so we can return their
  // current state at any error boundary.
  const logsStart = logs.length;
  const violationsStart = violations.length;
  const mutationsStart = mutations.length;

  const ctx = buildScriptCtx({
    project: options.project,
    onLog: (l) => {
      logs.push(l);
      // Fire the live-progress hook AFTER the sink push so any
      // observer sees the logs array in sync with the events it
      // receives. The hook is optional — most callers (tests)
      // omit it.
      options.onLog?.(runId, l);
    },
    onViolation: (v) => violations.push(v),
    onMutation: (m) => mutations.push(m),
  });

  const wrapped = buildWrapper(entry);

  // Block obvious Node globals. node:vm does not include `process`,
  // `require`, `Buffer`, `global` by default, but we double-tap for
  // the rare Node versions that DO leak some of them.
  const vmCtx: Record<string, unknown> = {
    ctx,
    process: undefined,
    require: undefined,
    module: undefined,
    exports: undefined,
    __dirname: undefined,
    __filename: undefined,
    fetch: undefined,
    globalThis: undefined,
    console: undefined,
  };

  const context = createContext(vmCtx, { name: 'sandbox' });

  // 1) Compile phase: surface syntax errors as `syntax-error`.
  let script: VmScript;
  try {
    script = new VmScript(wrapped, { filename: `${entry.shortName}.js` });
  } catch (e) {
    const stack = e instanceof Error ? e.stack : undefined;
    const { line, column } = parseStackLocation(stack ?? '');
    return {
      runId,
      status: 'syntax-error',
      logs: logs.slice(logsStart),
      violations: violations.slice(violationsStart),
      mutations: mutations.slice(mutationsStart),
      durationMs: Date.now() - start,
      errorMessage: e instanceof Error ? e.message : String(e),
      errorLine: line,
      errorColumn: column,
    };
  }

  // 2) Execution phase: surface runtime errors as `runtime-error`
  // or `timeout` (V8's internal interrupt throws "Script execution
  // timed out" when `timeout` is set on runInContext).
  try {
    script.runInContext(context, { timeout: options.timeoutMs ?? 5000 });
  } catch (e) {
    const stack = e instanceof Error ? e.stack : undefined;
    const parsed = parseStackLocation(stack ?? '');
    let line: number | undefined = parsed.line;
    let column: number | undefined = parsed.column;
    // V8 strips the stack from errors thrown inside `vm.runInContext`.
    // Our wrapper catches the error INSIDE the sandbox, records
    // user-line, and re-throws a fresh Error carrying it. Read it
    // back here so the renderer can mark the right source position.
    if (line === undefined && e && typeof e === 'object' && 'userLine' in e) {
      const u = (e as { userLine?: unknown }).userLine;
      if (typeof u === 'number' && u > 0) {
        line = u;
        column = 1;
      }
    }
    const message = e instanceof Error ? e.message : String(e);
    const isTimeout = /timed out/i.test(message);
    return {
      runId,
      status: isTimeout ? 'timeout' : 'runtime-error',
      logs: logs.slice(logsStart),
      violations: violations.slice(violationsStart),
      mutations: mutations.slice(mutationsStart),
      durationMs: Date.now() - start,
      errorMessage: message,
      errorLine: line,
      errorColumn: column,
    };
  }

  // 3) Post-hoc timeout flag: if the script finished but exceeded
  // its budget, mark `timeout` so the renderer can show a banner.
  // The script's mutations are still in the sinks; the renderer
  // decides whether to commit or discard.
  const durationMs = Date.now() - start;
  const timedOut = options.timeoutMs !== undefined && durationMs > options.timeoutMs;
  return {
    runId,
    status: timedOut ? 'timeout' : 'ok',
    logs: logs.slice(logsStart),
    violations: violations.slice(violationsStart),
    mutations: mutations.slice(mutationsStart),
    durationMs,
  };
}

/**
 * Wrap the user entry source as an IIFE. Each module gets its own
 * `__m_<shortName>` binding; the import-resolver populates `_import`
 * before user code runs. (Phase B wires the actual imports; V0.1
 * keeps the wrapper shape stable so Phase B is a no-op for the
 * IIFE / binding contract.)
 *
 * The user code is wrapped in a try/catch that re-throws with the
 * captured user-line number. V8 strips stack frames from errors
 * thrown inside `vm.runInContext` (the stack is empty when caught
 * outside), so we encode the line ourselves by extracting the
 * line of the throw via `Error().stack` from inside the sandbox.
 */
function buildWrapper(entry: ScriptEntry): string {
  return [
    `"use strict";`,
    `const __m_${safeIdent(entry.shortName)} = (function(){`,
    `  try {`,
    entry.source
      .split('\n')
      .map((l) => `    ${l}`)
      .join('\n'),
    `  } catch (__e) {`,
    `    const __line = (__e && typeof __e.lineNumber === 'number') ? __e.lineNumber : 0;`,
    `    const __userLine = Math.max(1, __line - 3);`,
    `    const __wrapped = new Error(__e && __e.message ? __e.message : String(__e));`,
    `    __wrapped.userLine = __userLine;`,
    `    throw __wrapped;`,
    `  }`,
    `  return { /* exports populated by top-level declarations */ };`,
    `})();`,
    `void __m_${safeIdent(entry.shortName)};`,
  ].join('\n');
}

function safeIdent(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Extract the first V8-style line/column from a stack trace. Returns
 * `{ line, column }` with `undefined` fields if nothing parseable
 * is found.
 */
export function parseStackLocation(stack: string): {
  readonly line: number | undefined;
  readonly column: number | undefined;
} {
  if (!stack) return { line: undefined, column: undefined };
  // Common V8 patterns:
  //   `at <name> (file:N:M)`
  //   `at file:N:M`            (no parens, no name)
  //   `<anonymous>:N:M`        (synthetic frame, no parens)
  //   `file:N:M`               (any "name:N:M" tail)
  const m1 = stack.match(/<anonymous>:(\d+):(\d+)/);
  if (m1) return { line: Number(m1[1]), column: Number(m1[2]) };
  const m2 = stack.match(/\((?:\/[^)]+?|[^)\s]+):(\d+):(\d+)\)/);
  if (m2) return { line: Number(m2[1]), column: Number(m2[2]) };
  const m3 = stack.match(/(?:^|\s)([^\s():]+):(\d+):(\d+)/);
  if (m3) return { line: Number(m3[2]), column: Number(m3[3]) };
  return { line: undefined, column: undefined };
}

/** Convenience: return the line number from a stack (or undefined). */
export function mapErrorLine(stack: string): number | undefined {
  return parseStackLocation(stack).line;
}

// Re-export to silence unused-import warnings for RunSinks / runInContext
// which the public API exposes but the implementation imports directly.
export { runInContext };
