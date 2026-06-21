// @vitest-environment jsdom
//
// Sprint 17 P3 T3.4 — LeftPanel `×` button uses removeBswmdWithFullFlow.
//
// Pin: when the user clicks the `×` remove button on a BSWMD row in
// the ProjectPanel (mounted by LeftPanel), the call goes through
// `useProjectActions.removeBswmdWithFullFlow(path)` — NOT the legacy
// `removeBswmdWithGuard`. The full-flow hook handles the 4-option
// dialog (cancel / only / cascade / cascade-and-unlink) when the
// BSWMD has dependents; the legacy guard silently removes with no
// dialog.
//
// Test strategy: stub `useProjectActions` with mocks for both the
// legacy and the new flow. Render LeftPanel with a project open
// containing 1 BSWMD. Click `×` on the BSWMD row. Assert:
//   - `removeBswmdWithFullFlow` was called once with the BSWMD path
//   - `removeBswmdWithGuard` was NOT called
//
// We don't mock `findDependentsOfBswmd` here — the test pins the
// wiring, not the dialog resolution. The dialog resolution is
// pinned by `useProjectActions.removeBswmd.test.ts` and the P4
// integration suite.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectManifest } from '@shared/project';

import * as projectActionsModule from '../../hooks/useProjectActions';
import { useArxmlStore } from '../../store/useArxmlStore';
import { LeftPanel } from '../LeftPanel';

// Mock the `useProjectActions` hook so the test can spy on which
// method the LeftPanel × button actually calls. We keep the real
// `ProjectActionResult` type by re-exporting the rest of the
// module untouched.
vi.mock('../../hooks/useProjectActions', async () => {
  const actual = await vi.importActual<typeof projectActionsModule>(
    '../../hooks/useProjectActions',
  );
  return {
    ...actual,
    useProjectActions: vi.fn(),
  };
});

const MANIFEST_PATH = 'C:/projects/demo.autosarcfg.json';

function makeManifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    schemaVersion: '1',
    id: 'demo-id',
    name: 'Demo Project',
    valueArxmlPaths: [],
    bswmdPaths: [],
    ...overrides,
  };
}

const mockRemoveBswmdWithGuard = vi.fn(async () => ({ kind: 'ok' as const }));
const mockRemoveBswmdWithFullFlow = vi.fn(async () => ({ kind: 'ok' as const }));

beforeEach(() => {
  vi.clearAllMocks();
  // Default mock: the hook returns our spies. Tests can override.
  (projectActionsModule.useProjectActions as ReturnType<typeof vi.fn>).mockReturnValue({
    newProject: vi.fn(),
    openProjectFromDialog: vi.fn(),
    saveProject: vi.fn(),
    addBswmdFromDialog: vi.fn(),
    removeBswmdWithGuard: mockRemoveBswmdWithGuard,
    removeBswmdWithFullFlow: mockRemoveBswmdWithFullFlow,
    submitNewProject: vi.fn(),
  });
  // Set up a project with 1 BSWMD so the × button is rendered.
  useArxmlStore.setState({
    leftTab: 'project',
    project: makeManifest({ bswmdPaths: ['/p/EcucDefs/EcuC.arxml'] }),
    projectPath: MANIFEST_PATH,
    bswmdPaths: ['/p/EcucDefs/EcuC.arxml'],
    bswmdSchemas: [],
    documents: [],
    documentPaths: [],
    validationErrors: [],
    lastValidatedAt: null,
    doc: null,
    filePath: null,
    selectedPath: null,
  });
});

afterEach(() => {
  cleanup();
  useArxmlStore.getState().clear();
  vi.clearAllMocks();
});

describe('LeftPanel (Sprint 17 P3 T3.4 — × button uses removeBswmdWithFullFlow)', () => {
  it('clicking the BSWMD × button calls removeBswmdWithFullFlow, NOT removeBswmdWithGuard', async () => {
    render(<LeftPanel />);

    const removeBtn = screen.getByTestId('project-panel-bswmd-remove-/p/EcucDefs/EcuC.arxml');
    expect(removeBtn).toBeInTheDocument();

    fireEvent.click(removeBtn);

    // Flush microtasks so the async useCallback has a chance to run.
    await Promise.resolve();
    await Promise.resolve();

    // P3 contract: the × button routes through the unified full-flow
    // hook so the 4-option dialog (cancel / only / cascade /
    // cascade-and-unlink) opens when the BSWMD has dependents.
    expect(mockRemoveBswmdWithFullFlow).toHaveBeenCalledTimes(1);
    expect(mockRemoveBswmdWithFullFlow).toHaveBeenCalledWith('/p/EcucDefs/EcuC.arxml');
    // Legacy guard must NOT be called — P2 replaced it.
    expect(mockRemoveBswmdWithGuard).not.toHaveBeenCalled();
  });
});