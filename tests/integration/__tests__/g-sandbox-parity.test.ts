// tests/integration/g-sandbox-parity.test.ts
// Cluster G (v1.6.0) — Cross-spec integration test #9.
//
// A+C spec §10.6 owns this scenario. Verifies G spec §3.8 / §8.1
// H1 mitigation: the G sandbox copy matches the v1.3.0 Script
// Engine vm-runner.ts in blocked-module list + globalThis-write
// blocking + eval/Function blocking.
//
// Lives in tests/integration/ (vitest config's include glob catches
// tests/**/__tests__/**/*.test.ts) — distinct from the unit-level
// parity test in src/core/sws-validator/sandbox/__parity__.test.ts.
// This integration variant adds the "rules run inside the sandbox"
// angle: verifies user-defined rules cannot reach forbidden APIs.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { SchemaLayer } from '../../../src/core/validation/runtimeSchema.js';
import type { NormalizedDocument } from '../../../src/shared/normalized-document.js';
import { buildValidationContext } from '../../../src/core/sws-validator/context.js';
import { InMemoryLogSink, runRuleInSandbox } from '../../../src/core/sws-validator/sandbox/vm-runner.js';

const SCRIPT_VM_RUNNER = resolve(
  __dirname,
  '../../../src/main/script/vm-runner.ts',
);
const G_VM_RUNNER = resolve(
  __dirname,
  '../../../src/core/sws-validator/sandbox/vm-runner.ts',
);

function extractBlockedGlobals(source: string): readonly string[] {
  const m = /vmCtx\s*:\s*Record<string,\s*unknown>\s*=\s*\{([\s\S]*?)\}/.exec(source);
  if (m === null || m[1] === undefined) return [];
  const keys: string[] = [];
  const re = /(\w+)\s*:\s*undefined/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(m[1])) !== null) {
    const k = mm[1];
    if (k !== undefined) keys.push(k);
  }
  keys.sort();
  return keys;
}

describe('Cross-spec #9 — G sandbox parity vs v1.3.0 Script Engine', () => {
  it('blocked-global list matches v1.3.0 verbatim (integration scope)', () => {
    const scriptSrc = readFileSync(SCRIPT_VM_RUNNER, 'utf-8');
    const gSrc = readFileSync(G_VM_RUNNER, 'utf-8');
    expect(extractBlockedGlobals(gSrc)).toEqual(extractBlockedGlobals(scriptSrc));
  });

  it('a rule attempting require() / process / fs access is blocked at runtime', () => {
    const doc: NormalizedDocument = {
      version: '4.2',
      packages: [],
      modules: [],
      references: [],
      sourceOrder: [],
      origin: 'dom',
    };
    const layer: SchemaLayer = {
      params: new Map(),
      containers: new Map(),
      sourcePaths: new Set(),
      moduleRoots: [],
    };
    const ctx = buildValidationContext({ document: doc, schemaLayer: layer, locale: 'en' });
    const sink = new InMemoryLogSink();

    const r = runRuleInSandbox({
      context: ctx,
      ruleId: 'R_TRY',
      source: `// Attempt to reach forbidden APIs.
      let saw = '';
      if (typeof require !== 'undefined') saw += 'require:1';
      if (typeof process !== 'undefined') saw += 'process:1';
      if (typeof fs !== 'undefined') saw += 'fs:1';
      if (typeof globalThis !== 'undefined') saw += 'globalThis:1';
      ctx.result({
        severity: 'warning',
        messageKey: 'swsValidator.runtimeError',
        messageVars: { ruleId: 'R_TRY', message: saw || 'none' },
        path: '/probe',
      });
      `,
      logSink: sink,
    });

    expect(r.status).toBe('ok');
    expect(r.results).toHaveLength(1);
    // No sandbox API was reachable.
    expect(r.results[0]?.messageVars?.['message']).toBe('none');
  });
});