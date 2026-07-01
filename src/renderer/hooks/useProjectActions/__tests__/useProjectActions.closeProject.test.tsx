// v1.19.0 MINOR — closeProject hook tests.
//
// Verifies that the new `closeProject()` method (added in v1.19.0 to
// the `useProjectActions` hook) wires the v1.18.2 PROJECT_CLOSE IPC
// + clears the store's project + projectPath. Idempotent.
//
// Mirrors the test pattern in `useProjectOpen.saveProject.test.tsx`
// (v1.18.0 T3 IPC-4): direct call of the exported hook via the test
// renderer, with `window.autosarApi.projectClose` + `useArxmlStore`
// mocked via `vi.hoisted`.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useArxmlStore } from '../../../store/useArxmlStore';
import { useProjectActions } from '../../useProjectActions.js';

// @vitest-environment jsdom

const mocks = vi.hoisted(() => {
  const projectClose = vi.fn();
  return { projectClose };
});

beforeEach(() => {
  mocks.projectClose.mockReset();
  mocks.projectClose.mockResolvedValue({ kind: 'closed' });
  // Inject projectClose into the autosarApi surface that the renderer sees.
  (window as unknown as { autosarApi: { projectClose: typeof mocks.projectClose } }).autosarApi = {
    projectClose: mocks.projectClose,
  };
  // Reset the store between tests so project + projectPath start null.
  useArxmlStore.setState({
    project: null,
    projectPath: null,
    dirtyPaths: new Set(),
    documents: [],
    documentPaths: [],
    error: null,
  });
});

afterEach(() => {
  useArxmlStore.setState({
    project: null,
    projectPath: null,
    dirtyPaths: new Set(),
    documents: [],
    documentPaths: [],
    error: null,
  });
});

describe('useProjectActions.closeProject (v1.19.0 MINOR)', () => {
  it('calls projectClose IPC + clears the store project state', async () => {
    // Pre-seed the store with a project + projectPath so the close
    // actually has something to clear.
    act(() => {
      useArxmlStore.setState({
        project: {
          schemaVersion: '1',
          id: 'test-project',
          name: 'test-project',
          bswmdPaths: [],
          valueArxmlPaths: [],
        },
        projectPath: '/tmp/test.autosarcfg.json',
      });
    });

    const { result } = renderHook(() => useProjectActions());

    await act(async () => {
      const r = await result.current.closeProject();
      expect(r.kind).toBe('ok');
    });

    expect(mocks.projectClose).toHaveBeenCalledTimes(1);
    expect(useArxmlStore.getState().project).toBeNull();
    expect(useArxmlStore.getState().projectPath).toBeNull();
  });

  it('is idempotent when called when no project is open', async () => {
    // No pre-seed: store starts null.
    const { result } = renderHook(() => useProjectActions());

    await act(async () => {
      const r = await result.current.closeProject();
      expect(r.kind).toBe('ok');
    });

    expect(mocks.projectClose).toHaveBeenCalledTimes(1);
    expect(useArxmlStore.getState().project).toBeNull();
    expect(useArxmlStore.getState().projectPath).toBeNull();
  });

  it('preserves documents[] + dirtyPaths so the user keeps editing in loose mode', async () => {
    // Pre-seed with project + documents + dirty path.
    act(() => {
      useArxmlStore.setState({
        project: {
          schemaVersion: '1',
          id: 'test-project',
          name: 'test-project',
          bswmdPaths: [],
          valueArxmlPaths: [],
        },
        projectPath: '/tmp/test.autosarcfg.json',
        documentPaths: ['/tmp/doc1.arxml'],
        documents: [{ path: '/tmp/doc1.arxml' } as never],
        dirtyPaths: new Set(['/tmp/doc1.arxml']),
      });
    });

    const { result } = renderHook(() => useProjectActions());

    await act(async () => {
      await result.current.closeProject();
    });

    // Project + projectPath cleared.
    expect(useArxmlStore.getState().project).toBeNull();
    expect(useArxmlStore.getState().projectPath).toBeNull();
    // Documents + dirty paths preserved (loose-mode editing).
    expect(useArxmlStore.getState().documentPaths).toEqual(['/tmp/doc1.arxml']);
    expect(useArxmlStore.getState().dirtyPaths.size).toBe(1);
    expect(useArxmlStore.getState().dirtyPaths.has('/tmp/doc1.arxml')).toBe(true);
  });
});
