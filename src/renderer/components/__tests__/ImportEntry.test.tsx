// @vitest-environment jsdom
//
// ImportEntry (Sprint 14 / T10) — verifies that the [Import…]
// button renders, dispatches the openArxmlMulti IPC on click,
// forwards the multi-select result to startImport, and bails out
// cleanly when the user cancels the dialog. We stub the preload
// bridge on `window.autosarApi` directly (the same pattern other
// component tests use).
//
// Tests pin:
//   1. The button renders the localized label.
//   2. Clicking with a 0-file result does NOT call startImport.
//   3. Clicking with a N-file result calls startImport with N
//      (docs, paths) and flips viewMode to 'import-merged'.
//   4. Clicking with `parseArxml` returning an error surfaces
//      a localized error (the startImport is still dispatched
//      with the successful subset when at least one file parsed).

import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useArxmlStore } from '../../store/useArxmlStore';
import { ImportEntry } from '../ImportEntry';

// ConfirmDialog is module-level; mock the `confirm` function so we
// can drive each choice deterministically. The hoisted() helper lets
// us share the same `vi.fn()` reference between the mock factory
// and the test body.
const { confirmMock } = vi.hoisted(() => ({
  confirmMock: vi.fn(),
}));

vi.mock('../ConfirmDialog', () => ({
  confirm: confirmMock,
}));

// Stub the preload bridge. We use `vi.fn()` for each method so
// individual tests can swap in a per-test implementation.
interface ApiStub {
  openArxmlMulti: ReturnType<typeof vi.fn>;
  parseArxml: ReturnType<typeof vi.fn>;
  saveArxml: ReturnType<typeof vi.fn>;
}

function installApiStub(overrides: Partial<ApiStub> = {}): ApiStub {
  const stub: ApiStub = {
    openArxmlMulti: overrides.openArxmlMulti ?? vi.fn().mockResolvedValue({ kind: 'canceled' }),
    parseArxml: overrides.parseArxml ?? vi.fn(),
    saveArxml: overrides.saveArxml ?? vi.fn(),
  };
  // We have to cast to the global type. The store-side actions do
  // not care about the shape beyond the specific method names.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).autosarApi = stub;
  return stub;
}

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).autosarApi;
});

describe('ImportEntry (Sprint 14 / T10)', () => {
  beforeEach(() => {
    useArxmlStore.setState({
      importSession: null,
      lastCommitSnapshot: null,
      viewMode: 'single',
      isDirty: () =>
        useArxmlStore.getState().dirtyPaths.size > 0 ||
        useArxmlStore.getState().importSession !== null,
    });
  });

  it('renders the localized [Import…] button', () => {
    installApiStub();
    const { getByTestId } = render(<ImportEntry />);
    expect(getByTestId('import-entry-button')).toBeInTheDocument();
  });

  it('does NOT call startImport when the user cancels the dialog', async () => {
    const stub = installApiStub({
      openArxmlMulti: vi.fn().mockResolvedValue({ kind: 'canceled' }),
    });
    const { getByTestId } = render(<ImportEntry />);
    fireEvent.click(getByTestId('import-entry-button'));
    await waitFor(() => expect(stub.openArxmlMulti).toHaveBeenCalledTimes(1));
    expect(useArxmlStore.getState().importSession).toBeNull();
  });

  it('calls startImport(docs, paths) when the dialog returns N files', async () => {
    const parsed1 = {
      ok: true as const,
      value: {
        path: '/in/A.arxml',
        version: '4.6',
        packages: [
          {
            shortName: 'EAS',
            path: '/EAS',
            elements: [
              {
                kind: 'module' as const,
                tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                shortName: 'ModA',
                params: {},
                children: [],
                references: [],
              },
            ],
          },
        ],
      },
    };
    const parsed2 = {
      ok: true as const,
      value: {
        path: '/in/B.arxml',
        version: '4.6',
        packages: [
          {
            shortName: 'EAS',
            path: '/EAS',
            elements: [
              {
                kind: 'module' as const,
                tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                shortName: 'ModB',
                params: {},
                children: [],
                references: [],
              },
            ],
          },
        ],
      },
    };
    const stub = installApiStub({
      openArxmlMulti: vi.fn().mockResolvedValue({
        kind: 'opened',
        results: [
          { path: '/in/A.arxml', content: '<a/>' },
          { path: '/in/B.arxml', content: '<b/>' },
        ],
      }),
      parseArxml: vi.fn().mockResolvedValueOnce(parsed1).mockResolvedValueOnce(parsed2),
    });
    const { getByTestId } = render(<ImportEntry />);
    fireEvent.click(getByTestId('import-entry-button'));
    await waitFor(() => expect(useArxmlStore.getState().importSession).not.toBeNull());
    const session = useArxmlStore.getState().importSession!;
    expect(session.originalPaths).toEqual(['/in/A.arxml', '/in/B.arxml']);
    expect(session.selections).toHaveLength(2);
    expect(useArxmlStore.getState().viewMode).toBe('import-merged');
    expect(stub.parseArxml).toHaveBeenCalledTimes(2);
  });

  it('surfaces a localized error when ALL files fail to parse', async () => {
    const stub = installApiStub({
      openArxmlMulti: vi.fn().mockResolvedValue({
        kind: 'opened',
        results: [{ path: '/in/Bad.arxml', content: '<bad/>' }],
      }),
      parseArxml: vi.fn().mockResolvedValue({
        ok: false,
        error: { kind: 'malformed', message: 'no root' },
      }),
    });
    const { getByTestId } = render(<ImportEntry />);
    fireEvent.click(getByTestId('import-entry-button'));
    await waitFor(() => expect(stub.parseArxml).toHaveBeenCalledTimes(1));
    expect(useArxmlStore.getState().importSession).toBeNull();
    expect(useArxmlStore.getState().error).not.toBeNull();
  });

  it('blocks on the dirty-guard when isDirty() is true (user cancel → no startImport)', async () => {
    // Mark the store dirty so isDirty() returns true. The dirty-
    // guard uses ConfirmDialog.confirm; we mock it to resolve to
    // 'continue' (= no proceed). openArxmlMulti should NOT be
    // called.
    useArxmlStore.setState({
      // Mark the store dirty by faking an importSession. The
      // store's isDirty() also returns true when importSession is
      // non-null (it treats an in-flight import as unsaved).
      importSession: {
        id: 'import-x',
        incomingDocs: [],
        originalPaths: [],
        selections: [],
        resolutions: [],
        activeModuleForDiff: null,
        createdAt: 0,
        undoStack: [],
      },
    });
    const stub = installApiStub();
    // Sprint 17a: dirty-guard uses ConfirmDialog.confirm (3-state).
    confirmMock.mockResolvedValueOnce('continue');
    const { getByTestId } = render(<ImportEntry />);
    fireEvent.click(getByTestId('import-entry-button'));
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(stub.openArxmlMulti).not.toHaveBeenCalled();
  });

  it('proceeds with the import when the user chooses "discard" in the dirty-guard', async () => {
    // Mark dirty via importSession (cheaper than constructing a real
    // document). confirm resolves to 'discard' = proceed without
    // saving. openArxmlMulti SHOULD be called.
    useArxmlStore.setState({
      importSession: {
        id: 'import-x',
        incomingDocs: [],
        originalPaths: [],
        selections: [],
        resolutions: [],
        activeModuleForDiff: null,
        createdAt: 0,
        undoStack: [],
      },
    });
    const stub = installApiStub({
      openArxmlMulti: vi.fn().mockResolvedValue({ kind: 'canceled' }),
    });
    confirmMock.mockResolvedValueOnce('discard');
    const { getByTestId } = render(<ImportEntry />);
    fireEvent.click(getByTestId('import-entry-button'));
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    await waitFor(() => expect(stub.openArxmlMulti).toHaveBeenCalledTimes(1));
    expect(stub.saveArxml).not.toHaveBeenCalled();
  });

  it('runs the silent-save loop when the user chooses "saveAndProceed" in the dirty-guard', async () => {
    // Mark dirty by populating dirtyPaths AND documents so the
    // save-loop has something to iterate. confirm resolves to
    // 'saveAndProceed' = save each dirty doc, then proceed with
    // the import dialog.
    const dirtyPath = '/in/Dirty.arxml';
    // Minimal ArxmlDocument shape — only `.path` is read by the
    // save-loop's `find()` lookup; serialize() is never invoked
    // because saveArxml is stubbed.
    const dirtyDoc = {
      path: dirtyPath,
      version: '4.6',
      packages: [],
    } as unknown as ReturnType<typeof useArxmlStore.getState>['documents'][number];
    useArxmlStore.setState({
      dirtyPaths: new Set([dirtyPath]),
      documents: [dirtyDoc],
    });
    const stub = installApiStub({
      saveArxml: vi.fn().mockResolvedValue({
        ok: true,
        value: { canceled: false, path: dirtyPath },
      }),
      openArxmlMulti: vi.fn().mockResolvedValue({ kind: 'canceled' }),
    });
    confirmMock.mockResolvedValueOnce('saveAndProceed');
    const { getByTestId } = render(<ImportEntry />);
    fireEvent.click(getByTestId('import-entry-button'));
    // saveArxml is called BEFORE openArxmlMulti (the loop must
    // complete first per `ImportEntry.tsx:90-107`).
    await waitFor(() => expect(stub.saveArxml).toHaveBeenCalledTimes(1));
    expect(stub.saveArxml).toHaveBeenCalledWith(
      expect.objectContaining({ currentPath: dirtyPath }),
    );
    await waitFor(() => expect(stub.openArxmlMulti).toHaveBeenCalledTimes(1));
  });

  it('bails the import when the first silent-save fails', async () => {
    // saveAndProceed + a save that returns ok:false → the loop
    // bails on the first failure and openArxmlMulti is NEVER
    // called. The unsaved edits stay in memory.
    const dirtyPath = '/in/Dirty.arxml';
    const dirtyDoc = {
      path: dirtyPath,
      version: '4.6',
      packages: [],
    } as unknown as ReturnType<typeof useArxmlStore.getState>['documents'][number];
    useArxmlStore.setState({
      dirtyPaths: new Set([dirtyPath]),
      documents: [dirtyDoc],
    });
    const stub = installApiStub({
      saveArxml: vi.fn().mockResolvedValue({
        ok: false,
        error: { kind: 'write-failed', message: 'EACCES' },
      }),
    });
    confirmMock.mockResolvedValueOnce('saveAndProceed');
    const { getByTestId } = render(<ImportEntry />);
    fireEvent.click(getByTestId('import-entry-button'));
    await waitFor(() => expect(stub.saveArxml).toHaveBeenCalledTimes(1));
    // The bail happens synchronously after the first save failure;
    // openArxmlMulti should never fire.
    expect(stub.openArxmlMulti).not.toHaveBeenCalled();
    expect(useArxmlStore.getState().error).not.toBeNull();
  });
});
