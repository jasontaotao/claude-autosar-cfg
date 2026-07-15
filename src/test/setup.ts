// Vitest setup: load jest-dom matchers (toBeInTheDocument, toHaveAttribute, etc.)
// and auto-unmount React components between tests to prevent DOM accumulation.
import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// Web-Crypto environment guard.
//
// `src/core/project/manifest.ts` reads `globalThis.crypto.randomUUID()` for
// project-id generation. Manifest tests assume Web Crypto is available. If a
// future vitest/jsdom bump removes the polyfill (or someone switches the
// environment to happy-dom), the first manifest test would throw a
// confusing message deep inside `createEmptyManifest`. Fail fast here with
// a clear, actionable error so the breakage is obvious in the test
// summary, not buried in a stack trace.
if (
  typeof globalThis.crypto === 'undefined' ||
  typeof globalThis.crypto.randomUUID !== 'function'
) {
  throw new Error(
    'Vitest setup: globalThis.crypto.randomUUID is required by src/core/project/manifest.ts. ' +
      'Use Node ≥ 19 / Electron ≥ 30 / a jsdom build that exposes Web Crypto.',
  );
}

// ResizeObserver polyfill (Sprint 13+ Stage 4 Q1).
//
// `react-resizable-panels` v4 uses `ResizeObserver` to track panel size
// changes; jsdom does not implement `ResizeObserver` natively. Without
// this polyfill, mounting the workspace Group throws "n is not a
// constructor" inside `new ResizeObserver(...)` and the entire App
// render tree fails.
class ResizeObserverPolyfill {
  private readonly callbacks = new Set<ResizeObserverCallback>();

  constructor(cb: ResizeObserverCallback) {
    this.callbacks.add(cb);
  }

  observe(): void {
    // No-op: jsdom does not produce layout, so we never fire.
  }

  unobserve(): void {
    // No-op.
  }

  disconnect(): void {
    this.callbacks.clear();
  }
}

// Install once on globalThis. The `window` guard is needed because
// some test files run in a node-only environment (e.g. the i18n
// parity test) where `globalThis.window` is undefined.
if (typeof globalThis.ResizeObserver === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = ResizeObserverPolyfill;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = (globalThis as any).window;
  if (w !== undefined) {
    w.ResizeObserver = ResizeObserverPolyfill;
  }
}

// v1.55.0 — localStorage polyfill for node-environment tests.
// The project's vitest config (`vitest.config.ts`) sets
// `environment: 'node'` for the whole tree; jsdom is not used.
// The renderer store's localStorage-hydration helpers (e.g.
// `loadLeftPanelProjectCollapsedFromStorage` in useArxmlStore.ts)
// read `localStorage` at module load, BEFORE per-test `import`s
// evaluate, so a polyfill installed inside a test file never runs
// in time. Centralising the shim in this setup file (run once via
// `setupFiles` before any test module loads) keeps the renderer's
// production module-level reads silent in the test log while
// preserving the documented contract: quota / private-mode errors
// inside the setter's try/catch degrade to `console.warn` only.
// The shim is a no-op for quota / private-mode behavior — those
// errors are caught INSIDE the setter and fallback to `false`.
if (typeof globalThis.localStorage === 'undefined') {
  const localStorageStore = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).localStorage = {
    getItem: (k: string) =>
      localStorageStore.has(k) ? (localStorageStore.get(k) as string) : null,
    setItem: (k: string, v: string) => {
      localStorageStore.set(k, v);
    },
    removeItem: (k: string) => {
      localStorageStore.delete(k);
    },
    clear: () => {
      localStorageStore.clear();
    },
    key: (i: number) => Array.from(localStorageStore.keys())[i] ?? null,
    get length() {
      return localStorageStore.size;
    },
  };
}
