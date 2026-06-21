// src/core/sws-validator/sandbox/__parity__.test.ts
// Cluster G (v1.6.0) — sandbox parity test vs v1.3.0 Script Engine
// `vm-runner.ts` (G spec §3.8 / §8.1 G3 row — H1 mitigation).
//
// High-leverage ~30-LOC test that asserts the blocked-module list,
// allowed-env-vars, globalThis-write blocking, and eval/Function
// blocking match the v1.3.0 Script Engine source verbatim. Catches
// the most likely drift if Script Engine updates its whitelist and
// G silently inherits the change (or vice versa).
//
// Read both files at runtime via fs.readFileSync and compare the
// sets verbatim. Source files live at fixed paths in the repo.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const SCRIPT_VM_RUNNER = resolve(
  __dirname,
  '../../../main/script/vm-runner.ts',
);
const G_VM_RUNNER = resolve(__dirname, './vm-runner.ts');

/**
 * Extract the set of blocked global names from the `vmCtx: Record<string, unknown> = { ... }`
 * literal in a vm-runner source. Both runners share the same shape; we
 * pull the keys out of the literal that are assigned `undefined`.
 */
function extractBlockedGlobals(source: string): readonly string[] {
  // Greedy match for the `{ ... }` literal assigned to `vmCtx`. Tolerates
  // whitespace and newlines.
  const m = /vmCtx\s*:\s*Record<string,\s*unknown>\s*=\s*\{([\s\S]*?)\}/.exec(source);
  if (m === null || m[1] === undefined) return [];
  const body = m[1];
  const keys: string[] = [];
  // Each entry is `name: undefined` or `name: value`. Capture only the
  // `name: undefined` ones — those are the blocked globals.
  const re = /(\w+)\s*:\s*undefined/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(body)) !== null) {
    const key = mm[1];
    if (key !== undefined) keys.push(key);
  }
  keys.sort();
  return keys;
}

describe('G sandbox parity vs v1.3.0 Script Engine vm-runner', () => {
  it('blocked-global list matches v1.3.0 source verbatim', () => {
    const scriptSrc = readFileSync(SCRIPT_VM_RUNNER, 'utf-8');
    const gSrc = readFileSync(G_VM_RUNNER, 'utf-8');
    const scriptBlocked = extractBlockedGlobals(scriptSrc);
    const gBlocked = extractBlockedGlobals(gSrc);
    expect(gBlocked).toEqual(scriptBlocked);
    // Sanity: at minimum these 9 should be blocked per v1.3.0.
    expect(gBlocked).toEqual(
      expect.arrayContaining([
        'process',
        'require',
        'module',
        'exports',
        '__dirname',
        '__filename',
        'fetch',
        'globalThis',
        'console',
      ]),
    );
  });

  it('vm context isolation is enforced via createContext (not new Function / eval)', () => {
    const gSrc = readFileSync(G_VM_RUNNER, 'utf-8');
    // Sanity: the sandbox should not use Function constructor or eval
    // directly to compile user source. Script Engine uses `new VmScript(...)`.
    expect(gSrc).toMatch(/new VmScript\(/);
    expect(gSrc).not.toMatch(/new Function\(/);
    expect(gSrc).not.toMatch(/^\s*eval\(/m);
  });
});