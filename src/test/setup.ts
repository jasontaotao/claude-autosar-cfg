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
