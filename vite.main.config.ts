import { resolve } from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/main',
    lib: {
      entry: resolve(__dirname, 'src/main/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      // Sprint 14 #1 — script-engine runner (vm-runner.ts) and its
      // handler (script-handler.ts) use node:vm + node:crypto. These
      // are main-process-only; we externalize them so rollup doesn't
      // try to bundle them into the main-process entry.
      external: [
        'electron',
        'node:path',
        'node:url',
        'node:fs',
        'node:vm',
        'node:crypto',
      ],
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
