// Sprint 17b (H8) — `script-handler` path-containment tests.
//
// The script engine reads/writes the manifest path it was given at
// startup (`_manifestPath` in `script-handler.ts`). For defensive
// parity with the other write paths (PROJECT_SAVE, saveArxmlHandler)
// the handler must reject any `__resetForTest` call that hands it a
// path containing a `..` parent-traversal segment.
//
// 1 case pins the rejection contract:
//   1. rejects a malicious `_manifestPath` (`../etc/passwd`) — the
//      next handler invocation throws `ScriptError` with
//      `kind: 'invalid-path'`.

import { normalize } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ScriptError } from '../../script/errors.js';
import {
  __resetForTest,
  scriptListHandler,
} from '../script-handler.js';

describe('script-handler path-containment (Sprint 17b H8)', () => {
  afterEach(() => {
    __resetForTest(null, null);
  });

  it('rejects _manifestPath with a parent-traversal segment (list handler)', async () => {
    // A path that retains a `..` segment after `path.normalize` —
    // e.g. `foo/../../etc/passwd` normalizes to `../etc/passwd`. We
    // use a relative-form path that is clearly a traversal attempt
    // (starts with `..`). The handler refuses even before the
    // filesystem is touched.
    const malicious = '../etc/passwd';
    // Sanity: the normalized form still has a `..` segment so the
    // handler's pre-flight check has something to flag.
    expect(normalize(malicious).includes('..')).toBe(true);
    __resetForTest(malicious, 'demo');

    await expect(scriptListHandler({ projectId: 'demo' })).rejects.toBeInstanceOf(ScriptError);
    await expect(scriptListHandler({ projectId: 'demo' })).rejects.toMatchObject({
      payload: { kind: 'invalid-path' },
    });
  });
});
