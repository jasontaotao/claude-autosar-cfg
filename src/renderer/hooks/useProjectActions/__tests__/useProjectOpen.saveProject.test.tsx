// @vitest-environment jsdom
//
// `useProjectActions.saveProject` — v1.18.0 IPC-4 try/catch envelope.
//
// Sprint A pre-IPC-4, `saveProject` at `src/renderer/hooks/useProjectActions.ts`
// line 292-312 awaited `window.autosarApi.projectSave(...)` WITHOUT a
// try/catch envelope. If the IPC threw (rare but real: main-process crash,
// IPC channel reset, sandbox error, renderer reloaded mid-save), the
// rejection propagated up through React's render cycle and crashed the
// renderer silently — the user saw no error toast, the dirty marker
// stayed on, no recovery prompt.
//
// IPC-4 wraps the await in try/catch so the rejection is converted to a
// `ProjectActionResult` `error` envelope the UI already knows how to
// surface. Pre-IPC-5 (`openProjectFromDialog`) already had the same
// envelope pattern at line 453-466; this is the symmetry pass for
// `saveProject`.
//
// Tested invariants (all 4 must pass for IPC-4 closure):
//   1. Happy path — `projectSave` returns `{ kind: 'saved' }`
//      → `saveProject()` returns `{ kind: 'ok' }` (no regression;
//      pre-IPC-4 behavior).
//   2. Write-failed envelope — `projectSave` returns
//      `{ kind: 'write-failed', message }` → `saveProject()` returns
//      `{ kind: 'error', message: <localized> }`. Localized via
//      `app.error.saveProjectFailed` (zh-CN / en). Mirrors the
//      pre-IPC-4 behavior with the i18n key that was already wired.
//   3. Thrown exception caught — `projectSave` throws
//      `new Error('IPC channel reset')` → `saveProject()` returns
//      `{ kind: 'error', message: 'IPC channel reset' }`. THIS is the
//      new behavior IPC-4 enables (pre-IPC-4 the exception propagated).
//   4. Thrown non-Error caught — `projectSave` throws the bare string
//      `'string error'` → `saveProject()` returns
//      `{ kind: 'error', message: 'string error' }` via the
//      `String(e)` fallback when `e instanceof Error` is false.
//
// Test naming deliberately avoids `saveProject envelope` (the spec name
// is `useProjectOpen.test.tsx` per the plan; we use the closest matching
// file path `useProjectActions/__tests__/useProjectOpen.saveProject.test.tsx`
// to match project conventions under that directory).
//
// IPC mock strategy: assign a stub object onto `window.autosarApi`
// that exposes `projectSave`. Each test overrides the stub before
// calling the hook and restores it in afterEach (mirrors the existing
// `useProjectActions.test.ts` convention).
//
// Store seeding strategy: to keep this test file independent of the
// full `openProject(...)` flow (which requires parseable ARXML docs),
// `project` and `projectPath` are seeded via `useArxmlStore.setState(...)`
// directly. The hook reads them via `useArxmlStore.getState()` at call
// time — exactly like production code.

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useArxmlStore } from '../../../store/useArxmlStore.js';
import { useProjectActions } from '../../useProjectActions.js';

// ---------------------------------------------------------------------------
// IPC stub shape (minimal — only projectSave needed for IPC-4)
// ---------------------------------------------------------------------------

type ProjectSaveResultLike =
  | { readonly kind: 'saved' }
  | { readonly kind: 'write-failed'; readonly message: string };

interface AutosarApiStub {
  projectSave: (req: {
    readonly manifestPath: string;
    readonly manifest: unknown;
    readonly files: readonly unknown[];
  }) => Promise<ProjectSaveResultLike>;
}

let originalAutosarApi: unknown;

beforeEach(() => {
  originalAutosarApi = (window as { autosarApi?: unknown }).autosarApi;
  // Reset store to a known empty state so previous test bleed-over is
  // ruled out. `clear()` resets project + projectPath back to null.
  useArxmlStore.getState().clear();
  // Seed a populated project so the `project === null || projectPath === null`
  // first-line guard inside `saveProject` does NOT short-circuit to
  // `canceled` (which would mask the IPC-layer tests' true positive).
  useArxmlStore.setState({
    project: {
      schemaVersion: 1,
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Test Project',
      valueArxmlPaths: [],
      bswmdPaths: [],
    },
    projectPath: '/tmp/test-project.arxml',
  } as never);
});

afterEach(() => {
  if (originalAutosarApi === undefined) {
    delete (window as { autosarApi?: unknown }).autosarApi;
  } else {
    (window as { autosarApi?: unknown }).autosarApi = originalAutosarApi;
  }
  cleanup();
  vi.restoreAllMocks();
});

function installApiStub(stub: Partial<AutosarApiStub>): AutosarApiStub {
  const merged: AutosarApiStub = {
    projectSave: stub.projectSave ?? (async () => ({ kind: 'saved' as const })),
  };
  (window as { autosarApi?: unknown }).autosarApi = merged;
  return merged;
}

// ===========================================================================
// IPC-4 — saveProject try/catch envelope
// ===========================================================================

describe('useProjectActions — saveProject IPC-4 try/catch envelope', () => {
  it('Test 1: happy path — projectSave returns {kind:"saved"} → saveProject returns {kind:"ok"}', async () => {
    // Arrange — IPC stub resolves with kind "saved"
    const projectSaveSpy = vi.fn(async () => ({ kind: 'saved' as const }));
    installApiStub({ projectSave: projectSaveSpy });

    // Act
    const { result } = renderHook(() => useProjectActions());
    let response;
    await act(async () => {
      response = await result.current.saveProject();
    });

    // Assert — IPC called once with seeded project+projectPath; returns ok
    expect(projectSaveSpy).toHaveBeenCalledTimes(1);
    expect(projectSaveSpy).toHaveBeenCalledWith({
      manifestPath: '/tmp/test-project.arxml',
      manifest: expect.objectContaining({ id: '00000000-0000-0000-0000-000000000001' }),
      files: [],
    });
    expect(response).toEqual({ kind: 'ok' });
  });

  it('Test 2: write-failed envelope — projectSave returns {kind:"write-failed",message} → saveProject returns {kind:"error",message:<localized zh-CN>}', async () => {
    // Arrange — IPC stub resolves with write-failed
    installApiStub({
      projectSave: async () => ({ kind: 'write-failed', message: 'EACCES' }),
    });
    // Arrange — locale already 'zh-CN' from beforeEach (store default)

    // Act
    const { result } = renderHook(() => useProjectActions());
    let response;
    await act(async () => {
      response = await result.current.saveProject();
    });

    // Assert — envelope maps to ProjectActionResult error with
    // `app.error.saveProjectFailed` template + result.message
    // (`保存项目失败: EACCES` per i18n.zh-CN.ts).
    expect(response).toEqual({
      kind: 'error',
      message: '保存项目失败: EACCES',
    });
  });

  it('Test 3: thrown exception caught — projectSave throws Error("IPC channel reset") → saveProject returns {kind:"error",message:"IPC channel reset"}', async () => {
    // Arrange — IPC stub REJECTS with an Error. Pre-IPC-4 the rejection
    // propagated out of the hook and crashed React's render. IPC-4
    // catches `unknown`, narrows via `e instanceof Error`, returns the
    // error envelope.
    installApiStub({
      projectSave: async () => {
        throw new Error('IPC channel reset');
      },
    });

    // Act
    const { result } = renderHook(() => useProjectActions());
    let response;
    await act(async () => {
      response = await result.current.saveProject();
    });

    // Assert — no propagation; clean error envelope with the original message
    expect(response).toEqual({
      kind: 'error',
      message: 'IPC channel reset',
    });
  });

  it('Test 4: thrown non-Error caught — projectSave throws bare string → saveProject returns {kind:"error",message:<String(e) fallback>}', async () => {
    // Arrange — IPC stub REJECTS with a bare string (not an Error).
    // Covers the `e instanceof Error ? e.message : String(e)` fallback
    // branch in the catch handler.
    installApiStub({
      projectSave: async () => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'string error';
      },
    });

    // Act
    const { result } = renderHook(() => useProjectActions());
    let response;
    await act(async () => {
      response = await result.current.saveProject();
    });

    // Assert — fallback path: bare string → `String(e)` = 'string error'
    expect(response).toEqual({
      kind: 'error',
      message: 'string error',
    });
  });
});
