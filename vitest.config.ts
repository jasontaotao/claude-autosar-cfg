import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/core/**', 'src/shared/**'],
      exclude: [
        '**/__tests__/**',
        '**/*.test.ts',
        // Re-export / constant files have no executable code by design.
        'src/core/index.ts',
        'src/core/version.ts',
        'src/shared/ipc-contract.ts',
        'src/shared/types.ts',
      ],
      thresholds: {
        // S0 floor on actual logic files. S4 raises lines/statements to 90%.
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});
