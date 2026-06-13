import { resolve } from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/preload',
    lib: {
      entry: resolve(__dirname, 'src/preload/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.cjs',
    },
    rollupOptions: {
      external: ['electron'],
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
