// v1.18.2 PATCH — PROJECT_CLOSE handler tests.
//
// Verifies that `projectCloseHandler` in
// `src/main/ipc/projectCloseHandler.ts` resets the open-project
// manifest path state and returns the `closed` envelope.
//
// The handler is pure (no IO, no electron mock needed). Tests directly
// import `projectCloseHandler` + `getOpenProjectManifestPath` +
// `__resetOpenProjectManifestPathForTests` (the test seam pattern
// established in `src/main/ipc/project-manifest-state.ts`).
//
// `__resetOpenProjectManifestPathForTests()` keeps tests isolated —
// without it, prior tests that set the manifest path would leak
// across cases.

import { afterEach, describe, expect, it } from 'vitest';

import {
  __resetOpenProjectManifestPathForTests,
  getOpenProjectManifestPath,
  setOpenProjectManifestPath,
} from '../project-manifest-state.js';
import { projectCloseHandler } from '../projectCloseHandler.js';

afterEach(() => {
  __resetOpenProjectManifestPathForTests();
});

describe('projectCloseHandler', () => {
  it('returns closed envelope and clears state when a project is open', () => {
    setOpenProjectManifestPath('/tmp/proj.autosarcfg.json');

    const result = projectCloseHandler();

    expect(result).toEqual({ kind: 'closed' });
    expect(getOpenProjectManifestPath()).toBeNull();
  });

  it('is idempotent when no project is open', () => {
    // No pre-set; state starts null after afterEach reset.
    const result = projectCloseHandler();

    expect(result).toEqual({ kind: 'closed' });
    expect(getOpenProjectManifestPath()).toBeNull();
  });

  it('does not throw on subsequent calls', () => {
    projectCloseHandler();
    // Second call: state is already null from the first close.
    const result = projectCloseHandler();

    expect(result).toEqual({ kind: 'closed' });
    expect(getOpenProjectManifestPath()).toBeNull();
  });

  it('resets state so downstream containment checks see null', () => {
    setOpenProjectManifestPath('/tmp/proj.autosarcfg.json');

    projectCloseHandler();

    // Direct read of state — proves that subsequent calls to
    // getOpenProjectManifestPath() (e.g. from bswmdDeleteHandler
    // path-containment check) see null after close. Defensive null
    // check in those handlers is a separate concern (deferred to a
    // follow-up PATCH per plan §0.4).
    expect(getOpenProjectManifestPath()).toBeNull();
  });
});
