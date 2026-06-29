import { resolve } from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig({
  // v1.8.0 K Stencil — main process transitively pulls in
  // `core/sws-validator/engine.ts` (via src/main/ipc/stencilHandler.ts),
  // which imports `@shared/i18n` for DEFAULT_LOCALE / t(). Without
  // aliases here, Rollup fails to resolve `@shared/i18n` when
  // walking the bundle graph (matched in renderer config + tsconfig
  // paths but not in vite.main.config). The architectural fix (Bug B)
  // is to stop core/sws-validator/hooks/useTourState.ts from importing
  // renderer/store/useArxmlStore.ts — then the renderer slice chain
  // disappears from main's bundle and engine.ts's @shared import is
  // the only remaining cross-cutting dep.
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
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
      //
      // v1.16.1 PATCH — script-handler.ts migrated sync readFileSync /
      // writeFileSync to async readFile (from node:fs/promises) +
      // writeAtomic. node:fs/promises is the promise-namespaced view
      // of the same fs implementation that 'node:fs' already
      // externalizes, so it must also be listed here. Without this,
      // rollup errors at build with `Module 'node:fs/promises' has
      // been externalized for browser compatibility` and refuses to
      // resolve `readFile`.
      external: [
        'electron',
        'node:path',
        'node:url',
        'node:fs',
        'node:fs/promises',
        'node:vm',
        'node:crypto',
      ],
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
