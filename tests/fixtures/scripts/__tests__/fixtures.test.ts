// Sprint 14 #1 Phase B (T10) — sample script fixtures parse test.
//
// Fixtures live under `tests/fixtures/scripts/` and are the canonical
// examples referenced by spec §3.4 + Phase D T17 E2E. They must:
//   1. Parse via `node --check` (no syntax errors)
//   2. Use the Phase A ctx API (`ctx.project.findContainers`,
//      `ctx.log.*`, `ctx.validator.addViolation`,
//      `ctx.utils.path.*`)
//   3. Use `ctx._import('./utils/path.js')` for shared helpers (T2's
//      resolver wires this)

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const FIXTURE_DIR = join(__dirname, '..');

function nodeCheck(file: string): void {
  // `node --check` is synchronous and emits a non-zero exit code on
  // parse failure. We swallow stdout/stderr to keep vitest output
  // clean (success path is silent).
  execSync(`node --check ${JSON.stringify(file)}`, { stdio: 'pipe' });
}

describe('Sprint 14 #1 script fixtures (T10)', () => {
  it('pduid-uniqueness.js parses + uses ctx._import + validator', () => {
    const file = join(FIXTURE_DIR, 'pduid-uniqueness.js');
    const src = readFileSync(file, 'utf8');
    nodeCheck(file);
    expect(src).toMatch(/from ['"]\.\/utils\/path/);
    expect(src).toMatch(/ctx\.project\.findContainers/);
    expect(src).toMatch(/ctx\.validator\.addViolation/);
    expect(src).toMatch(/ctx\.log\.info/);
  });

  it('wdgif-defaults.js parses + uses ctx.setValue + log.info', () => {
    const file = join(FIXTURE_DIR, 'wdgif-defaults.js');
    const src = readFileSync(file, 'utf8');
    nodeCheck(file);
    expect(src).toMatch(/ctx\.project\.findContainers/);
    expect(src).toMatch(/\.setValue\(0\)/);
    expect(src).toMatch(/ctx\.log\.info/);
  });

  it('utils/path.js parses + exports the 4 path helpers', () => {
    const file = join(FIXTURE_DIR, 'utils', 'path.js');
    const src = readFileSync(file, 'utf8');
    nodeCheck(file);
    expect(src).toMatch(/export const basename/);
    expect(src).toMatch(/export const dirname/);
    expect(src).toMatch(/export const join/);
    expect(src).toMatch(/export const split/);
  });
});