// @vitest-environment jsdom
//
// `useProjectActions.removeBswmdWithFullFlow` — Sprint 17 P2 hook
// tests. This is the unified replacement for the Sprint 14 T12
// `removeBswmdWithCascade` and the existing `removeBswmdWithGuard`.
//
// Differences from the old `removeBswmdWithCascade`:
//   1. **Dirty-guard prepended.** The old version intentionally skipped
//      the dirty-guard (per its comment "cascade removal is an explicit
//      user action"). P1 design recommended merging dirty-guard +
//      cascade into a single entry point to avoid state-fork when
//      the user cancels one dialog but the other was already shown.
//      P2 follows the recommendation.
//   2. **4-option dialog (not 3).** The new dialog has
//      `cascade-and-unlink` (delete BSWMD file from disk on top of
//      cascade). The 4th option routes through the new store action
//      `removeBswmdFromDisk` (added in P1) which fires the
//      `bswmd:delete` IPC.
//   3. **'only' path also routes through `removeBswmdFromDisk` for
//      consistency with P1's contract.** Wait — no, 'only' means
//      "remove from project but leave the file on disk". That's
//      `removeBswmd` (in-memory only), NOT `removeBswmdFromDisk`.
//
//   Re-clarification of the 4 paths:
//     - no dependents: in-memory only (`removeBswmd`)
//     - 'only':       in-memory only (`removeBswmd`)
//     - 'cascade':    deleteArxml per dep + `removeBswmd` (BSWMD stays on disk)
//     - 'cascade-and-unlink': deleteArxml per dep + `removeBswmdFromDisk`
//                            (BSWMD unlinked from disk)
//
// Test scope:
//   1.  no dependents + no dirty → no dialog, in-memory `removeBswmd`
//   2.  has dependents + no dirty → dialog shown
//   3.  cancel → no mutations
//   4.  'only' → in-memory `removeBswmd`, no IPC deleteArxml
//   5.  'cascade' → IPC deleteArxml per dep + `removeBswmd`, BSWMD stays
//   6.  'cascade-and-unlink' → IPC deleteArxml per dep + `removeBswmdFromDisk`
//                              (BSWMD unlinked from disk via IPC deleteBswmd)
//   7.  unknown path → no dialog, no IPC, no state change
//   8.  dirty-guard cancel → no dialog shown, no state change
//                              (dialog-with-cascade pre-supposes user
//                              passed the dirty-guard)

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BswModuleDef, BswmdDocument } from '@core/project/bswmd.js';

import { MANIFEST_SCHEMA_VERSION } from '../../../shared/project.js';
import type { ProjectDeleteArxmlResult, ProjectDeleteBswmdResult } from '../../../shared/types.js';
import * as RemoveModuleConfirmDialogModule from '../../components/RemoveModuleConfirmDialog.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';
import { useProjectActions } from '../useProjectActions.js';

// ---------------------------------------------------------------------------
// Fixture builders (mirrors useProjectActions.s14.test.ts)
// ---------------------------------------------------------------------------

function makeBswModuleDef(shortName: string): BswModuleDef {
  return {
    shortName,
    path: `/${shortName}`,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [],
    providedEntries: [],
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
  } as unknown as BswModuleDef;
}

function makeBswmd(modules: readonly BswModuleDef[]): BswmdDocument {
  return { version: '4.0', modules, warnings: [] };
}

// ---------------------------------------------------------------------------
// IPC stub
// ---------------------------------------------------------------------------

interface AutosarApiStub {
  deleteArxml: (req: { readonly filePath: string }) => Promise<ProjectDeleteArxmlResult>;
  deleteBswmd: (req: { readonly filePath: string }) => Promise<ProjectDeleteBswmdResult>;
}

let originalAutosarApi: unknown;

beforeEach(() => {
  originalAutosarApi = (window as { autosarApi?: unknown }).autosarApi;
  // Default state: 1 BSWMD loaded + 1 dependent ECUC value-side doc.
  // Tests that want different state overwrite via useArxmlStore.setState.
  useArxmlStore.getState().clear();
  useArxmlStore.getState().setLocale('zh-CN');
  useArxmlStore.setState({
    bswmdSchemas: [makeBswmd([makeBswModuleDef('Can')])],
    bswmdPaths: ['D:/bswmd/Can.arxml'],
    documents: [
      {
        path: 'D:/proj/A_EcucValues.arxml',
        version: '4.6',
        packages: [],
        sourceBswmdPath: 'D:/bswmd/Can.arxml',
      },
    ],
    documentPaths: ['D:/proj/A_EcucValues.arxml'],
    project: {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Test Project',
      valueArxmlPaths: ['D:/proj/A_EcucValues.arxml'],
      bswmdPaths: ['D:/bswmd/Can.arxml'],
    },
  });
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

function installApiStub(): AutosarApiStub {
  const stub: AutosarApiStub = {
    deleteArxml: vi.fn(async () => ({ kind: 'ok' as const })),
    deleteBswmd: vi.fn(async () => ({ kind: 'ok' as const })),
  };
  (window as { autosarApi?: unknown }).autosarApi = stub;
  return stub;
}

// ===========================================================================
// Section 1 — removeBswmdWithFullFlow
// ===========================================================================

describe('useProjectActions — removeBswmdWithFullFlow (Sprint 17 P2)', () => {
  it('no dependents + no dirty → in-memory removeBswmd, no dialog, no IPC', async () => {
    // Arrange — drop the dependent doc so dependents is empty
    useArxmlStore.setState({
      documents: [],
      documentPaths: [],
      project: {
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Test Project',
        valueArxmlPaths: [],
        bswmdPaths: ['D:/bswmd/Can.arxml'],
      },
    });
    const stub = installApiStub();
    const confirmSpy = vi.spyOn(RemoveModuleConfirmDialogModule, 'confirmRemoveBswmd');

    // Act
    const { result } = renderHook(() => useProjectActions());
    await act(async () => {
      await result.current.removeBswmdWithFullFlow('D:/bswmd/Can.arxml');
    });

    // Assert — no dialog, no IPC, BSWMD removed
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(stub.deleteArxml).not.toHaveBeenCalled();
    expect(stub.deleteBswmd).not.toHaveBeenCalled();
    expect(useArxmlStore.getState().bswmdPaths).toEqual([]);
  });

  it('has dependents + no dirty → dialog shown (no IPC yet)', async () => {
    // Arrange
    installApiStub();
    const stub = (window as unknown as { autosarApi: AutosarApiStub }).autosarApi;
    const confirmSpy = vi
      .spyOn(RemoveModuleConfirmDialogModule, 'confirmRemoveBswmd')
      .mockResolvedValue('cancel' as never);

    // Act
    const { result } = renderHook(() => useProjectActions());
    await act(async () => {
      await result.current.removeBswmdWithFullFlow('D:/bswmd/Can.arxml');
    });

    // Assert — dialog shown with the dependent listed
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        targetShortName: 'Can.arxml',
        dependents: expect.arrayContaining([
          expect.objectContaining({ filePath: 'D:/proj/A_EcucValues.arxml' }),
        ]),
      }),
    );
    // No IPC calls because user cancelled
    expect(stub.deleteArxml).not.toHaveBeenCalled();
    expect(stub.deleteBswmd).not.toHaveBeenCalled();
    // Cancel = no state change
    expect(useArxmlStore.getState().bswmdPaths).toEqual(['D:/bswmd/Can.arxml']);
  });

  it("'only' choice → in-memory removeBswmd, no IPC", async () => {
    installApiStub();
    const stub = (window as unknown as { autosarApi: AutosarApiStub }).autosarApi;
    vi.spyOn(RemoveModuleConfirmDialogModule, 'confirmRemoveBswmd').mockResolvedValue(
      'only' as never,
    );

    const { result } = renderHook(() => useProjectActions());
    await act(async () => {
      await result.current.removeBswmdWithFullFlow('D:/bswmd/Can.arxml');
    });

    expect(stub.deleteArxml).not.toHaveBeenCalled();
    expect(stub.deleteBswmd).not.toHaveBeenCalled();
    expect(useArxmlStore.getState().bswmdPaths).toEqual([]);
    // Dependent doc stays in store (BSWMD was removed but no cascade)
    expect(useArxmlStore.getState().documentPaths).toEqual(['D:/proj/A_EcucValues.arxml']);
  });

  it("'cascade' choice → IPC deleteArxml per dep + in-memory removeBswmd (BSWMD stays on disk)", async () => {
    installApiStub();
    const stub = (window as unknown as { autosarApi: AutosarApiStub }).autosarApi;
    vi.spyOn(RemoveModuleConfirmDialogModule, 'confirmRemoveBswmd').mockResolvedValue(
      'cascade' as never,
    );

    const { result } = renderHook(() => useProjectActions());
    await act(async () => {
      await result.current.removeBswmdWithFullFlow('D:/bswmd/Can.arxml');
    });

    expect(stub.deleteArxml).toHaveBeenCalledTimes(1);
    expect(stub.deleteArxml).toHaveBeenCalledWith({ filePath: 'D:/proj/A_EcucValues.arxml' });
    // BSWMD NOT unlinked from disk (no deleteBswmd IPC call)
    expect(stub.deleteBswmd).not.toHaveBeenCalled();
    expect(useArxmlStore.getState().bswmdPaths).toEqual([]);
    expect(useArxmlStore.getState().documentPaths).toEqual([]);
  });

  it("'cascade-and-unlink' choice → IPC deleteArxml per dep + IPC deleteBswmd (BSWMD unlinked from disk)", async () => {
    installApiStub();
    const stub = (window as unknown as { autosarApi: AutosarApiStub }).autosarApi;
    vi.spyOn(RemoveModuleConfirmDialogModule, 'confirmRemoveBswmd').mockResolvedValue(
      'cascade-and-unlink' as never,
    );

    const { result } = renderHook(() => useProjectActions());
    await act(async () => {
      await result.current.removeBswmdWithFullFlow('D:/bswmd/Can.arxml');
    });

    // Both IPCs fired
    expect(stub.deleteArxml).toHaveBeenCalledTimes(1);
    expect(stub.deleteArxml).toHaveBeenCalledWith({ filePath: 'D:/proj/A_EcucValues.arxml' });
    expect(stub.deleteBswmd).toHaveBeenCalledTimes(1);
    expect(stub.deleteBswmd).toHaveBeenCalledWith({ filePath: 'D:/bswmd/Can.arxml' });
    // Snapshot pushed (so undoLastRemoveBswmd is meaningful)
    expect(useArxmlStore.getState().lastRemoveSnapshot).not.toBeNull();
    expect(useArxmlStore.getState().bswmdPaths).toEqual([]);
    expect(useArxmlStore.getState().documentPaths).toEqual([]);
  });

  it('unknown path → no dialog, no IPC, no state change', async () => {
    const stub = installApiStub();
    const confirmSpy = vi.spyOn(RemoveModuleConfirmDialogModule, 'confirmRemoveBswmd');

    const { result } = renderHook(() => useProjectActions());
    await act(async () => {
      await result.current.removeBswmdWithFullFlow('D:/bswmd/never-added.arxml');
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(stub.deleteArxml).not.toHaveBeenCalled();
    expect(stub.deleteBswmd).not.toHaveBeenCalled();
    // Original BSWMD untouched
    expect(useArxmlStore.getState().bswmdPaths).toEqual(['D:/bswmd/Can.arxml']);
  });

  it('dirty-guard cancel → no dialog shown, no state change (cancelled before cascade dialog)', async () => {
    // Arrange — make the project dirty so the dirty-guard fires.
    // Seed dirtyPaths directly (no need to addDocument — that would
    // leave a doc in documentPaths and trip up the assertions below).
    useArxmlStore.setState({ dirtyPaths: new Set(['D:/proj/A_EcucValues.arxml']) });

    installApiStub();
    const stub = (window as unknown as { autosarApi: AutosarApiStub }).autosarApi;
    const confirmSpy = vi.spyOn(RemoveModuleConfirmDialogModule, 'confirmRemoveBswmd');

    // Act — guardedDirtySwitch will see the dirty state and ask the
    // dirty-guard ConfirmDialog (not the cascade dialog). When the
    // user cancels, the function returns early.
    const { result } = renderHook(() => useProjectActions());
    await act(async () => {
      // The dirty-guard Cancel button resolves to a 'cancel' guardedDirtySwitch
      // outcome. The hook should short-circuit and never show the cascade dialog.
      await result.current.removeBswmdWithFullFlow('D:/bswmd/Can.arxml');
    });

    // Assert — no cascade dialog shown, no IPC, no store mutations
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(stub.deleteArxml).not.toHaveBeenCalled();
    expect(stub.deleteBswmd).not.toHaveBeenCalled();
    // BSWMD + dependent untouched
    expect(useArxmlStore.getState().bswmdPaths).toEqual(['D:/bswmd/Can.arxml']);
    expect(useArxmlStore.getState().documentPaths).toEqual(['D:/proj/A_EcucValues.arxml']);
  });
});
