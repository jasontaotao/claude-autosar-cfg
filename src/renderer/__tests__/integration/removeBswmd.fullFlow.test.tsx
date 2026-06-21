// @vitest-environment jsdom
//
// Sprint 17 P4 T4.1 — End-to-end integration test for the BSWMD
// remove-from-disk flow. Exercises the public surface assembled by
// P1 + P2 (IPC, store actions, dialog, hook) and proves the 4-option
// dialog dispatch correctly drives:
//   - 'cancel'             — no mutation, store unchanged, no IPC
//   - 'only'               — in-memory `removeBswmd`, BSWMD on disk
//   - 'cascade'            — IPC `deleteArxml` per dependent +
//                            in-memory `removeBswmd`, BSWMD on disk
//   - 'cascade-and-unlink' — IPC `deleteArxml` per dependent +
//                            IPC `deleteBswmd` (BSWMD unlinked),
//                            lastRemoveSnapshot pushed
//
// Strategy: mount `RemoveModuleConfirmRoot` so the module-level
// `confirmRemoveBswmd()` resolves to a real button click (rather
// than the immediate `'cancel'` fallback), then drive the
// `useProjectActions.removeBswmdWithFullFlow` hook (the single
// public entry point exposed by P2). We start the flow without
// awaiting so we can click the dialog button in between; this is
// the same fire-and-await pattern `renderHook` tests use for
// promise-returning hooks with sibling UI.
//
// Dependencies on P3 (UI wiring): NONE. This test deliberately
// avoids `ProjectPanel` / `LeftPanel` / `ContextMenu` because P3
// is shipping in parallel. The hook is the public entry point for
// all P3 callers, so testing the hook is sufficient to pin the
// integration contract.

import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BswModuleDef, BswmdDocument } from '@core/project/bswmd.js';

import { MANIFEST_SCHEMA_VERSION } from '../../../shared/project.js';
import type { ProjectDeleteArxmlResult, ProjectDeleteBswmdResult } from '../../../shared/types.js';
import {
  type RemoveBswmdChoice,
  RemoveModuleConfirmRoot,
} from '../../components/RemoveModuleConfirmDialog.js';
import { useProjectActions } from '../../hooks/useProjectActions.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';

// ---------------------------------------------------------------------------
// Fixture builders — minimal valid BSWMD schema + dependent ECUC doc
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

const BSWMD_PATH = 'D:/bswmd/Can.arxml';
const DEP_PATH = 'D:/proj/Can_EcucValues.arxml';

function makeDependentDoc(): {
  readonly path: string;
  readonly version: '4.6';
  readonly packages: readonly never[];
  readonly sourceBswmdPath: string;
} {
  return {
    path: DEP_PATH,
    version: '4.6',
    packages: [],
    sourceBswmdPath: BSWMD_PATH,
  };
}

// ---------------------------------------------------------------------------
// IPC stub
// ---------------------------------------------------------------------------

interface AutosarApiStub {
  readonly deleteArxml: ReturnType<typeof vi.fn>;
  readonly deleteBswmd: ReturnType<typeof vi.fn>;
}

let originalAutosarApi: unknown;

function installApiStub(overrides: Partial<AutosarApiStub> = {}): AutosarApiStub {
  const stub: AutosarApiStub = {
    deleteArxml: vi.fn(async () => ({ kind: 'ok' as const } satisfies ProjectDeleteArxmlResult)),
    deleteBswmd: vi.fn(async () => ({ kind: 'ok' as const } satisfies ProjectDeleteBswmdResult)),
    ...overrides,
  };
  (window as { autosarApi?: unknown }).autosarApi = stub;
  return stub;
}

beforeEach(() => {
  originalAutosarApi = (window as { autosarApi?: unknown }).autosarApi;
  // Project open + 1 BSWMD + 1 dependent ECUC doc with `sourceBswmdPath`
  // pointing back at the BSWMD. The `findDependentsOfBswmd` action
  // filters by that field, so this is the only wiring needed for the
  // cascade flow to surface dependents.
  useArxmlStore.getState().clear();
  useArxmlStore.setState({
    bswmdSchemas: [makeBswmd([makeBswModuleDef('Can')])],
    bswmdPaths: [BSWMD_PATH],
    documents: [makeDependentDoc()],
    documentPaths: [DEP_PATH],
    project: {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Integration Test Project',
      valueArxmlPaths: [DEP_PATH],
      bswmdPaths: [BSWMD_PATH],
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

// ---------------------------------------------------------------------------
// Helpers — mount the dialog root + drive each choice
// ---------------------------------------------------------------------------

/**
 * Mount `RemoveModuleConfirmRoot` and wait for the post-mount effect to
 * assign `externalSetState`. Without this, `confirmRemoveBswmd()` falls
 * back to resolving immediately with `'cancel'` (the safe-fallback
 * branch in the dialog module).
 */
async function mountDialogRoot(): Promise<void> {
  render(<RemoveModuleConfirmRoot />);
  await act(async () => {
    await Promise.resolve();
  });
}

/** Resolve the next pending `confirmRemoveBswmd` promise by clicking the
 *  matching button in the dialog. Mirrors the dialog test pattern in
 *  `RemoveModuleConfirmDialog.test.tsx`. */
async function chooseDialogChoice(choice: RemoveBswmdChoice): Promise<void> {
  await waitFor(() => {
    expect(screen.getByTestId('remove-overlay')).toBeInTheDocument();
  });
  const testIdByChoice: Record<RemoveBswmdChoice, string> = {
    cancel: 'remove-cancel',
    only: 'remove-only',
    cascade: 'remove-cascade',
    'cascade-and-unlink': 'remove-cascadeAndUnlink',
  };
  const dialogBtn = await waitFor(() => screen.getByTestId(testIdByChoice[choice]));
  await act(async () => {
    fireEvent.click(dialogBtn);
  });
  await waitFor(() => {
    expect(screen.queryByTestId('remove-overlay')).not.toBeInTheDocument();
  });
}

/**
 * Render the `useProjectActions` hook and start (NOT await) the
 * `removeBswmdWithFullFlow` call. Returns the unawaited promise so
 * the caller can click the dialog button in between, then await the
 * result. The first render must flush before the action is invoked;
 * we `await act(async () => {})` to settle it. Pattern adapted from
 * `useProjectActions.removeBswmd.test.ts` (which awaits the call
 * inside `act`) — here we deliberately separate the two so the
 * dialog click can race with the await.
 */
async function startRemoveFlow(path: string): Promise<{
  readonly result: { current: ReturnType<typeof useProjectActions> | null };
  readonly flowPromise: Promise<unknown>;
}> {
  const result = renderHook(() => useProjectActions());
  // Flush the initial render so result.current is populated.
  await act(async () => {
    await Promise.resolve();
  });
  const action = result.result.current;
  if (action === null) throw new Error('hook result not populated after render');
  // Start the flow but don't await — we need to click the dialog.
  const flowPromise = action.removeBswmdWithFullFlow(path);
  return { result: result.result, flowPromise };
}

// ===========================================================================
// Section 1 — Full flow integration
// ===========================================================================

describe('Sprint 17 P4 — removeBswmdWithFullFlow end-to-end (P1+P2 surface)', () => {
  it('"cancel" choice → no mutations, no IPC, store + on-disk file untouched', async () => {
    await mountDialogRoot();
    const stub = installApiStub();

    const { flowPromise } = await startRemoveFlow(BSWMD_PATH);
    // Dialog must surface before we click.
    await chooseDialogChoice('cancel');
    const actionResult = await flowPromise;

    // No IPC calls (no cascade, no unlink).
    expect(stub.deleteArxml).not.toHaveBeenCalled();
    expect(stub.deleteBswmd).not.toHaveBeenCalled();
    // Store state untouched.
    expect(useArxmlStore.getState().bswmdPaths).toEqual([BSWMD_PATH]);
    expect(useArxmlStore.getState().documentPaths).toEqual([DEP_PATH]);
    expect(useArxmlStore.getState().lastRemoveSnapshot).toBeNull();
    // Hook returns ok (cancel is not an error from the hook's POV).
    expect(actionResult).toEqual({ kind: 'ok' });
  });

  it('"only" choice → in-memory removeBswmd, no IPC, BSWMD stays on disk', async () => {
    await mountDialogRoot();
    const stub = installApiStub();

    const { flowPromise } = await startRemoveFlow(BSWMD_PATH);
    await chooseDialogChoice('only');
    const actionResult = await flowPromise;

    // No IPC (BSWMD not unlinked from disk; dependent not deleted).
    expect(stub.deleteArxml).not.toHaveBeenCalled();
    expect(stub.deleteBswmd).not.toHaveBeenCalled();
    // Store: BSWMD removed in-memory, dependent left dangling
    // (intentional — the user picked "only").
    expect(useArxmlStore.getState().bswmdPaths).toEqual([]);
    expect(useArxmlStore.getState().documentPaths).toEqual([DEP_PATH]);
    // No snapshot (only `removeBswmdFromDisk` pushes a snapshot).
    expect(useArxmlStore.getState().lastRemoveSnapshot).toBeNull();
    expect(actionResult).toEqual({ kind: 'ok' });
  });

  it('"cascade" choice → IPC deleteArxml per dep + in-memory removeBswmd', async () => {
    await mountDialogRoot();
    const stub = installApiStub();

    const { flowPromise } = await startRemoveFlow(BSWMD_PATH);
    await chooseDialogChoice('cascade');
    const actionResult = await flowPromise;

    // deleteArxml fired for the dependent
    expect(stub.deleteArxml).toHaveBeenCalledTimes(1);
    expect(stub.deleteArxml).toHaveBeenCalledWith({ filePath: DEP_PATH });
    // deleteBswmd NOT fired (BSWMD stays on disk)
    expect(stub.deleteBswmd).not.toHaveBeenCalled();
    // Store: both BSWMD and dependent gone
    expect(useArxmlStore.getState().bswmdPaths).toEqual([]);
    expect(useArxmlStore.getState().documentPaths).toEqual([]);
    // No snapshot (the disk-unlink is the snapshot trigger)
    expect(useArxmlStore.getState().lastRemoveSnapshot).toBeNull();
    expect(actionResult).toEqual({ kind: 'ok' });
  });

  it('"cascade-and-unlink" choice → IPC deleteArxml + IPC deleteBswmd + snapshot', async () => {
    await mountDialogRoot();
    const stub = installApiStub();

    const { flowPromise } = await startRemoveFlow(BSWMD_PATH);
    await chooseDialogChoice('cascade-and-unlink');
    const actionResult = await flowPromise;

    // Both IPCs fired
    expect(stub.deleteArxml).toHaveBeenCalledTimes(1);
    expect(stub.deleteArxml).toHaveBeenCalledWith({ filePath: DEP_PATH });
    expect(stub.deleteBswmd).toHaveBeenCalledTimes(1);
    expect(stub.deleteBswmd).toHaveBeenCalledWith({ filePath: BSWMD_PATH });
    // Store: both gone
    expect(useArxmlStore.getState().bswmdPaths).toEqual([]);
    expect(useArxmlStore.getState().documentPaths).toEqual([]);
    // Snapshot pushed (so undoLastRemoveBswmd would restore in-memory)
    const snapshot = useArxmlStore.getState().lastRemoveSnapshot;
    expect(snapshot).not.toBeNull();
    expect(snapshot?.path).toBe(BSWMD_PATH);
    expect(snapshot?.schema.modules[0]?.shortName).toBe('Can');
    expect(actionResult).toEqual({ kind: 'ok' });
  });

  it('"cascade" partial-failure (IPC write-failed) → store state preserved, hook returns error', async () => {
    // Simulate a failing disk unlink on the dependent delete. The
    // hook should bail with `{ kind: 'error' }` and NOT remove the
    // BSWMD from the store (because the cascade is half-done).
    await mountDialogRoot();
    const stub = installApiStub({
      deleteArxml: vi.fn(async () => ({
        kind: 'write-failed' as const,
        message: 'EACCES: permission denied',
      } satisfies ProjectDeleteArxmlResult)),
    });

    const { flowPromise } = await startRemoveFlow(BSWMD_PATH);
    await chooseDialogChoice('cascade');
    const actionResult = await flowPromise;

    expect(stub.deleteArxml).toHaveBeenCalledTimes(1);
    // Hook surfaces the error
    expect(actionResult).toMatchObject({
      kind: 'error',
      message: expect.stringMatching(/EACCES/) as unknown as string,
    });
    // Store state preserved (BSWMD still there; we bailed before
    // removeBswmd; removeDocument for the dep never ran because the
    // IPC errored first).
    expect(useArxmlStore.getState().bswmdPaths).toEqual([BSWMD_PATH]);
    expect(useArxmlStore.getState().documentPaths).toEqual([DEP_PATH]);
  });
});

// ===========================================================================
// Section 2 — End-to-end round-trip (cascade-and-unlink + undo)
// ===========================================================================

describe('Sprint 17 P4 — cascade-and-unlink + undoLastRemoveBswmd round-trip', () => {
  it('after cascade-and-unlink, undo restores the BSWMD schema in-memory', async () => {
    await mountDialogRoot();
    installApiStub();

    // Snapshot the original schema reference for identity assertion.
    const originalSchema = useArxmlStore.getState().bswmdSchemas[0];
    expect(originalSchema).toBeDefined();

    const { flowPromise } = await startRemoveFlow(BSWMD_PATH);
    await chooseDialogChoice('cascade-and-unlink');
    const actionResult = await flowPromise;

    expect(actionResult).toEqual({ kind: 'ok' });
    expect(useArxmlStore.getState().bswmdPaths).toEqual([]);
    expect(useArxmlStore.getState().lastRemoveSnapshot).not.toBeNull();

    // Now exercise the single-level undo.
    await act(async () => {
      useArxmlStore.getState().undoLastRemoveBswmd();
    });

    // Schema back, snapshot cleared.
    const after = useArxmlStore.getState();
    expect(after.bswmdPaths).toEqual([BSWMD_PATH]);
    expect(after.bswmdSchemas).toHaveLength(1);
    expect(after.bswmdSchemas[0]).toBe(originalSchema); // reference equality
    expect(after.lastRemoveSnapshot).toBeNull();
  });
});