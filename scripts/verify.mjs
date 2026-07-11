#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const STAGES = [
  { name: 'format', cmd: 'pnpm', args: ['format:check'] },
  { name: 'lint', cmd: 'pnpm', args: ['lint'] },
  { name: 'type-check', cmd: 'pnpm', args: ['type-check'] },
  { name: 'test', cmd: 'pnpm', args: ['test'] },
  { name: 'coverage', cmd: 'pnpm', args: ['test:coverage'] },
  // E2E skipped by default (requires display); user can run `pnpm test:e2e` manually.
  { name: 'build', cmd: 'pnpm', args: ['build'] },
  // Sprint 14 T15 — import round-trip regression guard (spec §8.6).
  // Opt-in: lives under tests/regression/ which is excluded from
  // vitest.config.ts so `pnpm test` does not pick it up. Uses a
  // dedicated vitest.regression.config.ts that whitelists
  // `tests/regression/**`.
  {
    name: 'import-regression',
    cmd: 'pnpm',
    args: ['vitest', 'run', '--config', 'vitest.regression.config.ts'],
  },
  // v1.45.0 PATCH — Python self-test stage. Closes v1.44.1 honest
  // deviation (b): the 4 self-tests defined for `validate_hook_range`
  // were previously only run via `python -c "..."` from the module
  // docstring, never wired into CI. Now wrapped in `scripts/test_python.py`
  // and invoked via a small Node wrapper that probes for `python` /
  // `python3` / `py` on PATH (Windows-via-git-bash doesn't always have
  // a Python shebang). Missing Python is tolerated (warning + skip)
  // because macOS/Linux agents may not have Python installed; the
  // self-test only matters when a future tmp-*.py chunk-replacement
  // script actually imports `validate_hook_range`.
  {
    name: 'python-self-test',
    cmd: 'node',
    args: ['scripts/run_python_self_test.cjs'],
  },
];

let failed = false;
for (const stage of STAGES) {
  console.log(`\n=== Stage: ${stage.name} ===`);
  const r = spawnSync(stage.cmd, stage.args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    console.error(`Stage ${stage.name} FAILED`);
    failed = true;
    break;
  }
}
process.exit(failed ? 1 : 0);
