// Vitest config for the regression suite (Sprint 14 T15 — verify.mjs
// stage 7 import round-trip guard).
//
// The default `vitest.config.ts` excludes `tests/regression/**` from
// its `include` list (per spec §8.6: "Test should: NOT pollute the
// unit test suite"). The regression suite lives under
// `tests/regression/` so `pnpm test` does not pick it up. Stage 7 of
// `scripts/verify.mjs` invokes this config explicitly via:
//   pnpm vitest run --config vitest.regression.config.ts
//
// Why a separate config: vitest 1.6's CLI filter (`pnpm vitest run
// tests/regression/...`) is filtered against the config's `include`
// list — passing a path on the CLI does NOT add it. A separate
// config is the canonical pattern for opt-in suites.

import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: [resolve(__dirname, 'src/test/setup.ts')],
    include: ['tests/regression/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
});
