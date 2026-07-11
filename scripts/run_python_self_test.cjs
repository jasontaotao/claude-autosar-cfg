// Wrapper invoked by `scripts/verify.mjs` (v1.45.0 PATCH).
//
// Probes for a Python interpreter on PATH (python3 / python / py)
// and, if found, runs `scripts/test_python.py` from the repo root.
// Missing Python is tolerated: prints a warning and exits 0 so CI
// machines without Python do not block `pnpm verify`.
//
// Per-process working directory assumption: verify.mjs runs from the
// repo root, so `spawnSync` defaults are sufficient.
//
// Exit codes:
//   0 -- self-test passed (or skipped because no Python on PATH)
//   1 -- self-test failed (import error, hook count mismatch, etc.)

'use strict';

const { spawnSync } = require('node:child_process');

const candidates = process.platform === 'win32'
  ? ['python', 'python3', 'py']
  : ['python3', 'python'];

for (const cmd of candidates) {
  const probe = spawnSync(cmd, ['--version'], { stdio: 'pipe' });
  if (probe.status === 0) {
    const r = spawnSync(cmd, ['scripts/test_python.py'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    process.exit(r.status == null ? 1 : r.status);
  }
}

console.warn(
  '[python-self-test] WARNING: no Python interpreter on PATH ' +
  '(probed: ' + candidates.join(', ') + '); skipping. The ' +
  'validate_hook_range self-test is a no-op on this machine. ' +
  'Future tmp-*.py scripts importing validate_hook_range will ' +
  'still receive the runtime HookCountMismatch guard at import ' +
  'time, but the 4 self-tests defined in test_python.py will not ' +
  'run. Install Python to enable this stage.'
);
process.exit(0);
