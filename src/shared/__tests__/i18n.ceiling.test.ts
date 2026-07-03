// i18n — Per-cluster file ceiling regression test (v1.23.1 T2).
//
// Pins the post-split ceiling: each of the 7 cluster files under
// `src/shared/i18n/` MUST stay under 300 lines. The pre-split
// monolithic `i18n.ts` was 869 lines; the cluster split targets
// ≤300 lines per cluster file (largest is editor at ~120 keys, so
// 240 lines including comments is a comfortable ceiling).
//
// If a cluster file balloons back to 300+ lines, this test fails
// before the next refactor pushes the bundle back into one file.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

const CLUSTERS = ['app', 'dialog', 'editor', 'validation', 'dbc', 'odx', 'misc'] as const;

const CEILING = 300;

describe('i18n — per-cluster file ceiling (v1.23.1 T2)', () => {
  it.each(CLUSTERS)('cluster %s is under %d lines', (cluster) => {
    const filePath = join(TEST_DIR, '..', 'i18n', `${cluster}.ts`);
    const lines = readFileSync(filePath, 'utf8').split('\n').length;
    expect(lines, `${cluster}.ts (${lines} lines)`).toBeLessThan(CEILING);
  });
});
