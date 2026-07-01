// src/main/__tests__/sandbox-flip.test.ts
//
// v1.18.0 MINOR T2 (SE-1) — preload bridge audit + sandbox flip safety net.
//
// Background: `webPreferences.sandbox: true` (OS-level Chromium sandbox) is
// HIGH risk because any preload bridge regression surfaces as renderer crash.
// Phase 0 research confirmed the bridge is safe (`src/preload/index.ts` exposes
// only typed function refs; `getRendererPlatform` returns a string verbatim, not
// the raw `process` object). These tests pin that invariant so future refactors
// don't accidentally leak Node handles (process / require / Buffer / fs) to the
// renderer.
//
// Three assertions guard the flip:
//
//   1. `exposeInMainWorld('autosarApi', api)` is invoked with the expected
//      typed function surface (no Node handles, no `process`, no `Buffer`,
//      no `require`).
//   2. The exposed api object does NOT contain raw Node global handles as
//      own properties; `getPlatform()` (the only sync passthrough) returns
//      the materialized `process.platform` string.
//   3. `getRendererPlatform()` returns `process.platform` verbatim.
//
// If a future refactor accidentally spreads or destructures a Node global into
// the api object, tests 1 or 2 fail (Object.keys audit + value-type audit).

import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the `electron` module BEFORE importing the preload bundle.
// ---------------------------------------------------------------------------
//
// `contextBridge.exposeInMainWorld` is captured by `exposedApis` so tests can
// assert on the shape of the bridge surface. `ipcRenderer.invoke` is mocked so
// the bridge construction does not throw on missing IPC handlers in test env.
// We do NOT mock `process.platform`; `getRendererPlatform()` must read the real
// host platform (Node env), and we assert it equals `process.platform` verbatim.
//
// `vi.hoisted` ensures `exposedApis` is initialized before `vi.mock`'s factory
// (which runs first due to Vitest's hoisting) needs to assign to it.

const { exposedApis } = vi.hoisted(() => ({
  exposedApis: {} as Record<string, unknown>,
}));

vi.mock('electron', () => {
  return {
    contextBridge: {
      exposeInMainWorld: (key: string, api: unknown): void => {
        exposedApis[key] = api;
      },
    },
    ipcRenderer: {
      invoke: vi.fn().mockResolvedValue({ ok: true, ts: 0 }),
      on: vi.fn(),
      off: vi.fn(),
    },
  };
});

// Now safe to import — the mock resolves `electron` for the preload bundle.
import { getRendererPlatform } from '../../preload/platform';

// Top-level import triggers `contextBridge.exposeInMainWorld('autosarApi', api)`
// once on module init. We capture the result for assertions below; `exposedApis`
// is populated as a side-effect of the top-level `import`.
//
// We use a static top-level import (not dynamic `import()`) because Vitest's
// static analysis cannot follow dynamic template-literal paths. Instead we get
// one execution per test file — sufficient for pinning the API surface, since
// the invariant is structural (typed function refs only).
import '../../preload/index';

describe('SE-1: preload bridge audit (sandbox:true safety net)', () => {
  it('exposes the autosarApi channel with exactly the expected function surface', () => {
    // Read the api surface directly from our mock — the preload module ran
    // `contextBridge.exposeInMainWorld('autosarApi', api)` at top level, and
    // `exposedApis['autosarApi']` is the captured value.
    const api = exposedApis['autosarApi'];
    expect(api).toBeDefined();
    expect(typeof api).toBe('object');
    expect(api).not.toBeNull();

    const keys = Object.keys(api as Record<string, unknown>).sort();
    expect(keys).toEqual([
      'copyTemplate',
      'deleteArxml',
      'deleteBswmd',
      'deleteScript',
      'getAppVersion',
      'getFeatureFlags',
      'getPlatform',
      'listScripts',
      'listTemplates',
      'onScriptProgress',
      'openArxml',
      'openArxmlMulti',
      'openBswmdDialog',
      'parseArxml',
      'parseBswmd',
      'pickDir',
      'ping',
      'projectClose',
      'projectNew',
      'projectOpen',
      'projectSave',
      'readBswmd',
      'runScript',
      'saveArxml',
      'saveScript',
      'stencilGenerate',
      'stencilSave',
      'writeArxmlBatch',
    ]);

    // Every exposed value must be a function — not a Node global, not an
    // object reference, not a primitive that could leak a handle.
    for (const k of keys) {
      expect(typeof (api as Record<string, unknown>)[k]).toBe('function');
    }
  });

  it('does NOT leak Node handles (process / Buffer / require) into the bridge', () => {
    const api = exposedApis['autosarApi'] as Record<string, unknown>;

    // The api object itself: no Node global references as own properties.
    expect(Object.prototype.hasOwnProperty.call(api, 'process')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(api, 'require')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(api, 'Buffer')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(api, 'global')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(api, '__dirname')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(api, 'module')).toBe(false);

    // The only synchronous passthrough is `getPlatform()` (string). Invoke it
    // and confirm the return is a string — not an object that could carry a
    // Node handle across the bridge.
    const platform = (api['getPlatform'] as () => unknown)();
    expect(typeof platform).toBe('string');
    expect(platform).toBe(process.platform);
  });

  it('getRendererPlatform() returns process.platform verbatim', () => {
    expect(getRendererPlatform()).toBe(process.platform);
    expect(typeof getRendererPlatform()).toBe('string');
  });
});
