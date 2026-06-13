#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const STAGES = [
  { name: 'lint', cmd: 'pnpm', args: ['lint'] },
  { name: 'type-check', cmd: 'pnpm', args: ['type-check'] },
  { name: 'test', cmd: 'pnpm', args: ['test'] },
  { name: 'coverage', cmd: 'pnpm', args: ['test:coverage'] },
  // E2E skipped by default (requires display); user can run `pnpm test:e2e` manually.
  { name: 'build', cmd: 'pnpm', args: ['build'] },
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