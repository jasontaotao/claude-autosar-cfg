// i18n — Shim absence regression test (v1.23.2 PATCH).
//
// Pins the post-v1.23.2 invariant: the 21-line compat shim that v1.23.1
// T2 left at `src/shared/i18n.ts` MUST be deleted, not merely unused.
// The shim existed only as a transition aid for callers that imported
// from `@shared/i18n` (file) vs `@shared/i18n/index.js` (folder). After
// v1.23.2 T1, all callers use the explicit folder path, so the shim is
// dead weight and a future re-introduction would silently re-create the
// file-vs-folder ambiguity that this PATCH resolved.
//
// If this test fails, the shim has been re-added — investigate why and
// either delete it again or, if a real reason exists, update this test
// to document the new invariant.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
// src/shared/__tests__/ → src/shared/
const SHARED_DIR = join(TEST_DIR, '..');
const SHIM_PATH = join(SHARED_DIR, 'i18n.ts');

describe('i18n compat shim (v1.23.2)', () => {
  it('does not exist at src/shared/i18n.ts', () => {
    expect(existsSync(SHIM_PATH)).toBe(false);
  });
});
