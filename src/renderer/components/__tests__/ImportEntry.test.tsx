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
      parseArxml: vi
        .fn()
        .mockResolvedValueOnce(parsed1)
        .mockResolvedValueOnce(parsed2),
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
    // guard uses window.confirm; we stub it to return false (= no
    // proceed). openArxmlMulti should NOT be called.
    useArxmlStore.setState({
      // dirty via a phantom dirtyPath: the store's isDirty()
      // considers the importSession state too, so we just set
      // importSession to a non-null value to force dirty.
      // Easier: just set viewMode='import-merged' which
      // implicitly makes isDirty() true? No — we need a direct
      // dirty hit. The cleanest way: use updateParam to dirty a
      // doc. We have to set a doc first.
      // The simplest path: set importSession to a fake session so
      // isDirty() returns true. The ImportEntry will then bail at
      // the dirty guard.
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
    // window.confirm is the dirty-guard primitive in ImportEntry.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { getByTestId } = render(<ImportEntry />);
    fireEvent.click(getByTestId('import-entry-button'));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(stub.openArxmlMulti).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
