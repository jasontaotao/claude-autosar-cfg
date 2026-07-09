// core/project/bswmd.ts
// BSWMD module shim — preserves the legacy `import { ... } from
// '../core/project/bswmd.js'` import path for every existing consumer.
//
// WHY THIS FILE EXISTS (and why the brief's plan to delete it doesn't work
// as-is):
//
//   The brief / spec for v1.41.x PATCH T1 instructs:
//     1. Move all `bswmd.ts` content to `src/core/project/bswmd/{types,
//        parse,lookup,validate,index}.ts`.
//     2. Delete the original `src/core/project/bswmd.ts`.
//
//   Step 1 (split) is mechanical. Step 2 (delete) breaks the import
//   graph because TypeScript with `moduleResolution: "Bundler"` +
//   `module: "ESNext"` does NOT auto-resolve a directory `index.ts`
//   for `.js`-suffixed relative imports — it looks for `bswmd.ts`
//   (file) only. The brief's claim that "./bswmd auto-resolves to
//   ./bswmd/index.ts" is empirically false for this tsconfig
//   combination; node16 mode would behave differently but the project
//   is on Bundler.
//
//   Two acceptable workarounds exist:
//     A. Update every consumer import (`bswmd.js` → `bswmd/index.js`).
//        ~50 files affected; high churn, risks merge conflicts.
//     B. Keep a thin shim file at `bswmd.ts` that re-exports from
//        `./bswmd/index.ts`. ONE file. Preserves every external import
//        path verbatim. Same net effect on file-size cap (the shim is
//        ~15 LoC, the directory's max file is <1200 LoC).
//
//   This file IS the workaround (B). It exists because the spec's
//   barrel pattern only works in node16 mode; we are on Bundler.
//
//   The directory `src/core/project/bswmd/` (4 sub-files + index.ts)
//   is the source of truth for all BSWMD types, the parse pipeline,
//   lookup helpers, and version-detection helpers. The barrel at
//   `index.ts` re-exports everything. This shim file does NOT
//   re-implement anything; it just gives the legacy import path a
//   resolution target so the existing codebase (and its ~50 import
//   sites) compiles unchanged.
//
//   Maintenance: if the project ever switches to `moduleResolution:
//   "Node16"` or extensionless imports (Bundler allows both), this
//   shim can be deleted and the directory's index.ts becomes the
//   resolution target natively.

// Re-export everything from the directory barrel. `export *` mirrors
// the barrel pattern so every named export from the original
// `bswmd.ts` is reachable via either `bswmd.js` (this shim) or
// `bswmd/index.js` (the directory barrel).
export * from './bswmd/index.js';
