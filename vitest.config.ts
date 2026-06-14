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
    include: [
      'src/**/__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.test.tsx',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
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
