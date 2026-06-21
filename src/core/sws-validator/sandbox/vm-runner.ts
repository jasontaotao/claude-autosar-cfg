// src/core/sws-validator/sandbox/vm-runner.ts
// Cluster G (v1.6.0) — Copy of v1.3.0 Script Engine `vm-runner.ts`,
// adapted to the G `RuleCtx` API (read-only project + log + result() helper).
//
// Per G spec §3.8: copy + adapt (NOT direct import). Direct import would
// force one side to absorb the other's API (Script Engine supports
// mutation; G is read-only). v1.7.0 plan: extract
// `src/core/sandbox/vm-runner.ts` as the canonical SoT.
//
// IMPORTANT: this file is a CARBON COPY of the v1.3.0
// `src/main/script/vm-runner.ts` with the ctx API swapped. The
// `__parity__.test.ts` asserts the blocked-module list + allowed-env-vars
// + globalThis-write blocking + eval/Function blocking match the v1.3.0
// source verbatim — see G spec §8.1 G3 row + §3.8 mitigation.

import { runInContext, createContext, Script as VmScript } from 'node:vm';

import type { ValidationContext, InternalValidatorResult } from '../types.js';

import type { RuleCtx, RuleLogSink } from './types.js';

export interface RunOptions {
  /** Wall-clock timeout in ms. Post-hoc only (mirrors v1.3.0 spec § 8.2). */
  readonly timeoutMs?: number;
  /** Required: the validation context the rule operates on. */
  readonly context: ValidationContext;
  /** Required: the rule id stamped on results emitted via `ctx.result()`. */
  readonly ruleId: string;
  /** Source code of the user-defined rule. */
  readonly source: string;
  /** Log sink (collected during execution, returned on result). */
  readonly logSink: RuleLogSink;
}

export interface RuleRunResult {
  readonly status: 'ok' | 'syntax-error' | 'runtime-error' | 'timeout';
  readonly results: readonly InternalValidatorResult[];
  readonly logs: readonly string[];
  readonly durationMs: number;
  readonly errorMessage?: string;
}

let _runCounter = 0;
function nextRunId(): string {
  _runCounter += 1;
  return `rule-${Date.now().toString(36)}-${_runCounter.toString(36)}`;
}

/**
 * Run user-defined rule source inside a fresh `node:vm` context, with
 * the G `RuleCtx` API exposed. Mirrors `runInSandbox` from
 * `src/main/script/vm-runner.ts` (v1.3.0) but with the G ctx shape.
 *
 * The user rule is expected to call `ctx.result({ ... })` zero or more
 * times and may call `ctx.log.info/warn/error(msg)` to surface log
 * entries. Results are collected and returned.
 */
export function runRuleInSandbox(options: RunOptions): RuleRunResult {
  const start = Date.now();
  void nextRunId(); // monotonically increasing id; reserved for future diagnostics

  const results: InternalValidatorResult[] = [];
  const logsStart = options.logSink.logs.length;

  const ctx: RuleCtx = {
    project: options.context,
    log: {
      info: (msg) => options.logSink.push('info', msg),
      warn: (msg) => options.logSink.push('warn', msg),
      error: (msg) => options.logSink.push('error', msg),
    },
    result: (partial) => {
      const stamped: InternalValidatorResult = { ...partial, ruleId: options.ruleId };
      results.push(stamped);
      return stamped;
    },
  };

  const wrapped = buildWrapper(options.source);

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

  const context = createContext(vmCtx, { name: 'sws-rule' });

  let script: VmScript;
  try {
    script = new VmScript(wrapped, { filename: 'sws-rule.js' });
  } catch (e) {
    return {
      status: 'syntax-error',
      results: Object.freeze(results.slice()),
      logs: options.logSink.logs.slice(logsStart),
      durationMs: Date.now() - start,
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  }

  try {
    script.runInContext(context, { timeout: options.timeoutMs ?? 5000 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const isTimeout = /timed out/i.test(message);
    return {
      status: isTimeout ? 'timeout' : 'runtime-error',
      results: Object.freeze(results.slice()),
      logs: options.logSink.logs.slice(logsStart),
      durationMs: Date.now() - start,
      errorMessage: message,
    };
  }

  const durationMs = Date.now() - start;
  const timedOut = options.timeoutMs !== undefined && durationMs > options.timeoutMs;
  return {
    status: timedOut ? 'timeout' : 'ok',
    results: Object.freeze(results),
    logs: options.logSink.logs.slice(logsStart),
    durationMs,
  };
}

/**
 * Wrap the user rule source as an IIFE. Mirrors the v1.3.0 wrapper
 * pattern (the wrapper try/catch re-throws with the captured
 * user-line number so the renderer can highlight the offending line).
 */
function buildWrapper(source: string): string {
  return [
    `"use strict";`,
    `(function(){`,
    `  try {`,
    source
      .split('\n')
      .map((l) => `    ${l}`)
      .join('\n'),
    `  } catch (__e) {`,
    `    const __line = (__e && typeof __e.lineNumber === 'number') ? __e.lineNumber : 0;`,
    `    const __userLine = Math.max(1, __line - 2);`,
    `    const __wrapped = new Error(__e && __e.message ? __e.message : String(__e));`,
    `    __wrapped.userLine = __userLine;`,
    `    throw __wrapped;`,
    `  }`,
    `})();`,
  ].join('\n');
}

/** In-memory log sink — for tests + single-shot runs. */
export class InMemoryLogSink implements RuleLogSink {
  readonly logs: string[] = [];
  push(_level: 'info' | 'warn' | 'error', message: string): void {
    this.logs.push(message);
  }
}