// @vitest-environment jsdom
//
// `useProjectActions` — Sprint 12 #3 Phase 1 Task 5 rewrite tests.
//
// Pins the contract for the unified NewProjectDialog + dirty-guard flow:
//   1. `newProject()` opens the dialog (no IPC). The actual create is
//      deferred to `submitNewProject(name, dir)` which the host wires
//      into `<NewProjectDialog onSubmit={...} />` (Task 8 part 2).
//   2. `submitNewProject(name, dir)` switches on `window.autosarApi.projectNew`
//      result kinds: created → close dialog + openProject; overwrite-confirm
//      → return error (Phase 1 simplification); write-failed / invalid-name
//      → return error.
//   3. The three switching actions (`openProjectFromDialog`,
//      `addBswmdFromDialog`, `removeBswmdWithGuard`) gate themselves on
//      `dirtyPaths.size > 0`. When dirty, they surface a 3-button
//      ConfirmDialog via the module-level `confirm()` API (Task 6). The
//      'continue' choice cancels, the 'discard' choice proceeds, and the
//      'saveAndProceed' choice is treated as 'canceled' in Phase 1
//      (TODO: Phase 2 will wire saveProject first, then proceed on success).
//
// Sprint 12 #2 had 9 tests for `addBswmdFromDialog` — those still pass.
// This file adds 14 new tests (3 for newProject / submitNewProject,
// 5 for openProject dirty-guard, 3 for addBswmd dirty-guard, 5 for
// removeBswmd guard) plus the 9 Sprint 12 #2 baseline tests = 23 total.
//
// Store monkey-patching: Sprint 12 #3 Task 7's dialog-state setters
// (`setNewProjectDialogOpen`, `setConfirmDialogOpen`, `setPendingAction`)
// live on the store. To keep this test file independent of the store's
// evolving shape, we install no-op defaults in `beforeEach` if the
// store doesn't already expose them. Production code (App.tsx + the
// hook) calls these directly; the patch only smooths the test
// environment.
//
// IPC mock strategy: assign a stub object onto `window.autosarApi` that
// exposes `projectNew` / `projectOpen` / `openBswmdDialog` / `readBswmd`.
// Each test sets the stub before calling the hook and restores it in
// afterEach to avoid bleed-over. `confirm()` from `ConfirmDialog` is
// stubbed via `vi.spyOn` for tests that exercise the dirty-guard path.

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArxmlContainer, ArxmlDocument, ArxmlModule } from '@core/arxml/types';

import { MANIFEST_SCHEMA_VERSION } from '../../../shared/project.js';
import type { ProjectManifest } from '../../../shared/project.js';
import * as ConfirmDialogModule from '../../components/ConfirmDialog.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';
import type { PendingAction } from '../../store/useArxmlStore.js';
import { useProjectActions } from '../useProjectActions.js';

// ---------------------------------------------------------------------------
// Store dialog-state patch
// ---------------------------------------------------------------------------
//
// Sprint 12 #3 Task 7 added three top-level setters to the store
// (`setNewProjectDialogOpen`, `setConfirmDialogOpen`,
// `setPendingAction`). They're consumed by the hook. If those setters
// aren't yet present on the store (e.g. tests run against an older
// branch), this helper installs no-op shims so the hook can still be
// called without throwing. Production builds where Task 7 has shipped
// already have the real setters and the patch is a no-op.
// ---------------------------------------------------------------------------

function ensureDialogStatePatch(): void {
  const state = useArxmlStore.getState();
  if (typeof state.setNewProjectDialogOpen !== 'function') {
    useArxmlStore.setState({
      newProjectDialogOpen: false,
      setNewProjectDialogOpen: (open: boolean) => {
        useArxmlStore.setState({ newProjectDialogOpen: open });
      },
    } as never);
  }
  if (typeof state.setConfirmDialogOpen !== 'function') {
    useArxmlStore.setState({
      confirmDialogOpen: false,
      setConfirmDialogOpen: (open: boolean) => {
        useArxmlStore.setState({ confirmDialogOpen: open });
      },
    } as never);
  }
  if (typeof state.setPendingAction !== 'function') {
    useArxmlStore.setState({
      pendingAction: null,
      setPendingAction: (action: PendingAction | null) => {
        useArxmlStore.setState({ pendingAction: action });
      },
    } as never);
  }
}

// ---------------------------------------------------------------------------
// Test fixture builders
// ---------------------------------------------------------------------------

/** Minimal valid BSWMD (autosar-standard ECUC-MODULE-DEF dialect). */
const MIN_BSWMD = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Adc</SHORT-NAME>
          <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
          <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>AdcGeneral</SHORT-NAME>
              <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
              <PARAMETERS>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>AdcDevErrorDetect</SHORT-NAME>
                  <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <MIN>0</MIN>
                  <MAX>1</MAX>
                </ECUC-INTEGER-PARAM-DEF>
              </PARAMETERS>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

/** Malformed BSWMD: triggers `parseBswmd` to return `{ kind: 'xml-malformed' }`. */
const MALFORMED_BSWMD = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Adc
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

function sampleManifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test Project',
    valueArxmlPaths: [],
    bswmdPaths: [],
    ...overrides,
  };
}

/**
 * Build a minimal but realistic ECUC value-side doc. Mirrors the
 * `makeEcucDocWithParam` helper used in `useArxmlStore.multidoc.test.ts`.
 * We use a programmatic doc instead of XML parsing because the
 * parser rejects `ECUC-MODULE-DEF` (that's the BSWMD-side schema,
 * parsed by `parseBswmd`).
 */
function makeEcucDoc(ecucParamValue: number, filePath: string): ArxmlDocument {
  const general: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'EcuCGeneral',
    params: {
      ConfigConsistencyRequired: { type: 'integer', value: ecucParamValue },
    },
    children: [],
  };
  const ecuc: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'EcuC',
    params: {},
    children: [general],
    references: [],
  };
  return {
    path: filePath,
    version: '4.6',
    packages: [
      {
        shortName: 'EAS',
        path: '/EAS',
        elements: [ecuc],
      },
    ],
  };
}

/**
 * Open a project with a single active value-side doc so we can exercise
 * the dirty guard. The doc content doesn't matter — we just need an
 * `activeDocumentPath` so `updateParam` can flip the dirty bit.
 */
function openProjectWithDoc(path = '/proj/p.json'): void {
  const doc = makeEcucDoc(1, '/proj/a.arxml');
  useArxmlStore.getState().openProject({
    manifestPath: path,
    manifest: sampleManifest(),
    docs: [{ rel: 'a.arxml', path: '/proj/a.arxml', content: 'placeholder' }],
  });
  // `openProject` parses via parseArxml which can't handle our fake ECUC
  // value-side — but it doesn't matter; we then `addDocument` the
  // synthetic doc to give `updateParam` something real to mutate.
  useArxmlStore.getState().addDocument(doc, '/proj/a.arxml');
}

/**
 * Mark the active doc as dirty by mutating a param via the public
 * `updateParam` action. The container path is hardcoded to match the
 * fixture in `makeEcucDoc`.
 */
function makeDirty(): void {
  openProjectWithDoc();
  useArxmlStore.getState().updateParam('/EAS/EcuC/EcuCGeneral', 'ConfigConsistencyRequired', {
    type: 'integer',
    value: 99,
  });
  expect(useArxmlStore.getState().dirtyPaths.size).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// IPC stub
// ---------------------------------------------------------------------------

type ProjectNewResultLike =
  | { readonly kind: 'created'; readonly path: string; readonly manifest: ProjectManifest }
  | { readonly kind: 'overwrite-confirm'; readonly path: string }
  | { readonly kind: 'write-failed'; readonly message: string }
  | { readonly kind: 'invalid-name'; readonly message: string };

type ProjectOpenResultLike =
  | { readonly kind: 'canceled' }
  | {
      readonly kind: 'opened';
      readonly manifestPath: string;
      readonly manifest: ProjectManifest;
      readonly docs: readonly { rel: string; path: string; content: string }[];
    }
  | { readonly kind: 'read-failed'; readonly message: string };

type BswmdDialogResult =
  | { readonly kind: 'ok'; readonly path: string }
  | { readonly kind: 'canceled' };
type ReadResult =
  | { readonly kind: 'ok'; readonly content: string }
  | { readonly kind: 'read-failed'; readonly message: string };

interface AutosarApiStub {
  projectNew: (req: {
    readonly name: string;
    readonly directory: string;
  }) => Promise<ProjectNewResultLike>;
  projectOpen: () => Promise<ProjectOpenResultLike>;
  openBswmdDialog: () => Promise<BswmdDialogResult>;
  readBswmd: (req: { readonly path: string }) => Promise<ReadResult>;
}

let originalAutosarApi: unknown;

beforeEach(() => {
  originalAutosarApi = (window as { autosarApi?: unknown }).autosarApi;
  useArxmlStore.getState().clear();
  useArxmlStore.getState().setLocale('zh-CN');
  ensureDialogStatePatch();
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
    projectNew:
      stub.projectNew ?? (async () => ({ kind: 'write-failed', message: 'unconfigured stub' })),
    projectOpen: stub.projectOpen ?? (async () => ({ kind: 'canceled' })),
    openBswmdDialog: stub.openBswmdDialog ?? (async () => ({ kind: 'canceled' })),
    readBswmd:
      stub.readBswmd ?? (async () => ({ kind: 'read-failed', message: 'unconfigured stub' })),
  };
  (window as { autosarApi?: unknown }).autosarApi = merged;
  return merged;
}

// ===========================================================================
// Section 1 — `newProject()` opens NewProjectDialog
// ===========================================================================

describe('useProjectActions — newProject opens NewProjectDialog (Sprint 12 #3 Task 5)', () => {
  it('newProject() flips newProjectDialogOpen=true and sets pendingAction — no IPC', async () => {
    // Arrange — no project, install a stub that would fail the test if
    // newProject accidentally called IPC.
    const projectNewSpy = vi.fn(async () => ({
      kind: 'created' as const,
      path: '/should/not/reach.arxml',
      manifest: sampleManifest(),
    }));
    installApiStub({ projectNew: projectNewSpy });

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.newProject();

    // Assert — IPC NOT called; dialog open + pending action set; returns ok
    expect(projectNewSpy).not.toHaveBeenCalled();
    expect(response.kind).toBe('ok');
    const after = useArxmlStore.getState();
    expect(after.newProjectDialogOpen).toBe(true);
    expect(after.pendingAction).toEqual({ kind: 'newProject' });
  });

  it('newProject() with clean state (no dirty) opens dialog directly', async () => {
    // No project, no dirty paths → guard is a no-op, dialog opens.
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.newProject();
    expect(response.kind).toBe('ok');
    const after = useArxmlStore.getState();
    expect(after.newProjectDialogOpen).toBe(true);
  });

  it('newProject() with dirty state + confirm "continue" cancels (does not open dialog)', async () => {
    // dirtyPaths.size > 0 → confirm() is called. Mock it to return 'continue'.
    vi.spyOn(ConfirmDialogModule, 'confirm').mockResolvedValue('continue');
    makeDirty(); // existing helper — opens project + addDocument + updateParam

    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.newProject();

    expect(response.kind).toBe('canceled');
    const after = useArxmlStore.getState();
    expect(after.newProjectDialogOpen).toBe(false);
  });

  it('newProject() with dirty state + confirm "discard" proceeds (opens dialog)', async () => {
    vi.spyOn(ConfirmDialogModule, 'confirm').mockResolvedValue('discard');
    makeDirty();

    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.newProject();

    expect(response.kind).toBe('ok');
    const after = useArxmlStore.getState();
    expect(after.newProjectDialogOpen).toBe(true);
  });
});

// ===========================================================================
// Section 2 — `submitNewProject(name, dir)` IPC result switch
// ===========================================================================

describe('useProjectActions — submitNewProject (Sprint 12 #3 Task 5)', () => {
  it('"created" → close dialog + openProject + clears pendingAction', async () => {
    // Arrange — open dialog first (mimics NewProjectDialog being visible)
    act(() => {
      useArxmlStore.getState().setNewProjectDialogOpen(true);
      useArxmlStore.getState().setPendingAction({ kind: 'newProject' });
    });
    const manifest = sampleManifest({ name: 'NewProj' });
    installApiStub({
      projectNew: async () => ({ kind: 'created', path: '/d/NewProj.autosarcfg.json', manifest }),
    });

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.submitNewProject('NewProj', '/d');

    // Assert
    expect(response.kind).toBe('ok');
    const after = useArxmlStore.getState();
    expect(after.newProjectDialogOpen).toBe(false);
    expect(after.pendingAction).toBeNull();
    expect(after.project?.name).toBe('NewProj');
    expect(after.projectPath).toBe('/d/NewProj.autosarcfg.json');
  });

  it('"overwrite-confirm" → returns error, dialog stays open (Phase 1 simplification)', async () => {
    // Arrange — dialog already open
    act(() => {
      useArxmlStore.getState().setNewProjectDialogOpen(true);
      useArxmlStore.getState().setPendingAction({ kind: 'newProject' });
    });
    installApiStub({
      projectNew: async () => ({
        kind: 'overwrite-confirm',
        path: '/d/NewProj.autosarcfg.json',
      }),
    });

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.submitNewProject('NewProj', '/d');

    // Assert — error result; dialog remains open so user can edit
    expect(response.kind).toBe('error');
    if (response.kind !== 'error') throw new Error('unreachable');
    expect(response.message).toContain('NewProj.autosarcfg.json');
    const after = useArxmlStore.getState();
    expect(after.newProjectDialogOpen).toBe(true);
    expect(after.pendingAction).toEqual({ kind: 'newProject' });
    expect(after.project).toBeNull();
  });

  it('"write-failed" → returns error with the IPC message', async () => {
    // Arrange
    act(() => {
      useArxmlStore.getState().setNewProjectDialogOpen(true);
    });
    installApiStub({
      projectNew: async () => ({
        kind: 'write-failed',
        message: 'EACCES: permission denied',
      }),
    });

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.submitNewProject('Foo', '/d');

    // Assert
    expect(response.kind).toBe('error');
    if (response.kind !== 'error') throw new Error('unreachable');
    expect(response.message).toBe('EACCES: permission denied');
    expect(useArxmlStore.getState().newProjectDialogOpen).toBe(true);
  });

  it('"invalid-name" → returns error with the IPC message', async () => {
    // Arrange
    act(() => {
      useArxmlStore.getState().setNewProjectDialogOpen(true);
    });
    installApiStub({
      projectNew: async () => ({
        kind: 'invalid-name',
        message: 'Project name cannot contain path separators (/ or \\)',
      }),
    });

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.submitNewProject('foo/bar', '/d');

    // Assert
    expect(response.kind).toBe('error');
    if (response.kind !== 'error') throw new Error('unreachable');
    expect(response.message).toContain('path separators');
    expect(useArxmlStore.getState().newProjectDialogOpen).toBe(true);
  });
});

// ===========================================================================
// Section 3 — `openProjectFromDialog` dirty-guard
// ===========================================================================

describe('useProjectActions — openProjectFromDialog dirty-guard (Sprint 12 #3 Task 5)', () => {
  it('isDirty=false → skips ConfirmDialog and proceeds straight to IPC', async () => {
    // Arrange — clean project
    openProjectWithDoc();
    expect(useArxmlStore.getState().dirtyPaths.size).toBe(0);
    const confirmSpy = vi.spyOn(ConfirmDialogModule, 'confirm');
    const projectOpenSpy = vi.fn(async () => ({
      kind: 'opened' as const,
      manifestPath: '/o/p.json',
      manifest: sampleManifest({ name: 'Opened' }),
      docs: [],
    }));
    installApiStub({ projectOpen: projectOpenSpy });

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.openProjectFromDialog();

    // Assert — no confirm, IPC called, project swapped in
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(projectOpenSpy).toHaveBeenCalledTimes(1);
    expect(response.kind).toBe('ok');
    expect(useArxmlStore.getState().project?.name).toBe('Opened');
  });

  it('isDirty=true + user picks "continue" → returns canceled without IPC', async () => {
    // Arrange — dirty project
    makeDirty();
    const confirmSpy = vi
      .spyOn(ConfirmDialogModule, 'confirm')
      .mockResolvedValue('continue' as never);
    const projectOpenSpy = vi.fn();
    installApiStub({ projectOpen: projectOpenSpy });

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.openProjectFromDialog();

    // Assert
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(projectOpenSpy).not.toHaveBeenCalled();
    expect(response.kind).toBe('canceled');
    expect(useArxmlStore.getState().project?.name).toBe('Test Project');
  });

  it('isDirty=true + user picks "discard" → proceeds to IPC and swaps project', async () => {
    // Arrange — dirty project
    makeDirty();
    vi.spyOn(ConfirmDialogModule, 'confirm').mockResolvedValue('discard' as never);
    const projectOpenSpy = vi.fn(async () => ({
      kind: 'opened' as const,
      manifestPath: '/o/other.json',
      manifest: sampleManifest({ name: 'Opened' }),
      docs: [],
    }));
    installApiStub({ projectOpen: projectOpenSpy });

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.openProjectFromDialog();

    // Assert
    expect(projectOpenSpy).toHaveBeenCalledTimes(1);
    expect(response.kind).toBe('ok');
    expect(useArxmlStore.getState().project?.name).toBe('Opened');
  });

  it('isDirty=true + user picks "saveAndProceed" → returns canceled (Phase 1 TODO)', async () => {
    // Arrange — dirty project, saveProject cannot save without a path on disk,
    // so Phase 1 treats saveAndProceed as canceled. Phase 2 will wire saveProject
    // before the proceed branch.
    makeDirty();
    vi.spyOn(ConfirmDialogModule, 'confirm').mockResolvedValue('saveAndProceed' as never);
    const projectOpenSpy = vi.fn();
    installApiStub({ projectOpen: projectOpenSpy });

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.openProjectFromDialog();

    // Assert — IPC NOT called; user keeps the dirty project intact
    expect(projectOpenSpy).not.toHaveBeenCalled();
    expect(response.kind).toBe('canceled');
    expect(useArxmlStore.getState().project?.name).toBe('Test Project');
  });
});

// ===========================================================================
// Section 4 — `addBswmdFromDialog` dirty-guard (extends Sprint 12 #2)
// ===========================================================================

describe('useProjectActions — addBswmdFromDialog dirty-guard (Sprint 12 #3 Task 5)', () => {
  it('isDirty=true + user picks "discard" → proceeds to file picker + IPC', async () => {
    // Arrange — dirty project, mock confirm → discard
    makeDirty();
    vi.spyOn(ConfirmDialogModule, 'confirm').mockResolvedValue('discard' as never);
    const openStub = vi.fn(async () => ({ kind: 'ok' as const, path: '/tmp/clean.arxml' }));
    installApiStub({
      openBswmdDialog: openStub,
      readBswmd: async () => ({ kind: 'ok', content: MIN_BSWMD }),
    });

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.addBswmdFromDialog();

    // Assert — confirm called, dialog ran, BSWMD added
    expect(response.kind).toBe('ok');
    expect(openStub).toHaveBeenCalledTimes(1);
    const after = useArxmlStore.getState();
    expect(after.bswmdSchemas).toHaveLength(1);
    expect(after.bswmdPaths).toEqual(['/tmp/clean.arxml']);
  });

  it('isDirty=true + user picks "continue" → returns canceled without file picker', async () => {
    // Arrange — dirty project, confirm → continue
    makeDirty();
    vi.spyOn(ConfirmDialogModule, 'confirm').mockResolvedValue('continue' as never);
    const openSpy = vi.fn();
    installApiStub({ openBswmdDialog: openSpy });

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.addBswmdFromDialog();

    // Assert
    expect(openSpy).not.toHaveBeenCalled();
    expect(response.kind).toBe('canceled');
    expect(useArxmlStore.getState().bswmdPaths).toHaveLength(0);
  });

  it('isDirty=true + user picks "saveAndProceed" → returns canceled (Phase 1 TODO)', async () => {
    // Arrange — dirty project, confirm → saveAndProceed
    makeDirty();
    vi.spyOn(ConfirmDialogModule, 'confirm').mockResolvedValue('saveAndProceed' as never);
    const openSpy = vi.fn();
    installApiStub({ openBswmdDialog: openSpy });

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.addBswmdFromDialog();

    // Assert — Phase 1 simplification: skip save + cancel
    expect(openSpy).not.toHaveBeenCalled();
    expect(response.kind).toBe('canceled');
  });
});

// ===========================================================================
// Section 5 — `removeBswmdWithGuard` dirty-guard
// ===========================================================================

describe('useProjectActions — removeBswmdWithGuard (Sprint 12 #3 Task 5)', () => {
  it('isDirty=false → calls store.removeBswmd without opening ConfirmDialog', async () => {
    // Arrange — open project, load a BSWMD, but don't mark dirty
    openProjectWithDoc();
    useArxmlStore.getState().addBswmd('/schemas/CanIf.arxml', MIN_BSWMD);
    expect(useArxmlStore.getState().dirtyPaths.size).toBe(0);
    expect(useArxmlStore.getState().bswmdPaths).toEqual(['/schemas/CanIf.arxml']);
    const confirmSpy = vi.spyOn(ConfirmDialogModule, 'confirm');

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.removeBswmdWithGuard('/schemas/CanIf.arxml');

    // Assert — no confirm dialog; BSWMD removed
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(response.kind).toBe('ok');
    expect(useArxmlStore.getState().bswmdPaths).toEqual([]);
  });

  it('isDirty=true + user picks "discard" → calls store.removeBswmd', async () => {
    // Arrange — dirty project, one BSWMD loaded
    makeDirty();
    useArxmlStore.getState().addBswmd('/schemas/Adc.arxml', MIN_BSWMD);
    expect(useArxmlStore.getState().bswmdPaths).toEqual(['/schemas/Adc.arxml']);
    vi.spyOn(ConfirmDialogModule, 'confirm').mockResolvedValue('discard' as never);

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.removeBswmdWithGuard('/schemas/Adc.arxml');

    // Assert
    expect(response.kind).toBe('ok');
    expect(useArxmlStore.getState().bswmdPaths).toEqual([]);
  });

  it('isDirty=true + user picks "continue" → returns canceled, BSWMD kept', async () => {
    // Arrange
    makeDirty();
    useArxmlStore.getState().addBswmd('/schemas/PduR.arxml', MIN_BSWMD);
    vi.spyOn(ConfirmDialogModule, 'confirm').mockResolvedValue('continue' as never);

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.removeBswmdWithGuard('/schemas/PduR.arxml');

    // Assert — canceled; BSWMD still loaded
    expect(response.kind).toBe('canceled');
    expect(useArxmlStore.getState().bswmdPaths).toEqual(['/schemas/PduR.arxml']);
  });

  it('isDirty=true + user picks "saveAndProceed" → returns canceled (Phase 1 TODO)', async () => {
    // Arrange
    makeDirty();
    useArxmlStore.getState().addBswmd('/schemas/CanTp.arxml', MIN_BSWMD);
    vi.spyOn(ConfirmDialogModule, 'confirm').mockResolvedValue('saveAndProceed' as never);

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.removeBswmdWithGuard('/schemas/CanTp.arxml');

    // Assert — Phase 1 simplification: skip save + cancel
    expect(response.kind).toBe('canceled');
    expect(useArxmlStore.getState().bswmdPaths).toEqual(['/schemas/CanTp.arxml']);
  });

  it('unknown path → returns canceled without opening ConfirmDialog (no-op semantics)', async () => {
    // Arrange — dirty project, but unknown path
    makeDirty();
    const confirmSpy = vi.spyOn(ConfirmDialogModule, 'confirm');

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.removeBswmdWithGuard('/schemas/NotLoaded.arxml');

    // Assert — confirm not opened (no action to confirm); canceled to mirror
    // the no-op semantics of the underlying store action.
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(response.kind).toBe('canceled');
  });
});

// ===========================================================================
// Section 6 — Sprint 12 #2 addBswmdFromDialog baseline (preserved)
// ===========================================================================

describe('useProjectActions — addBswmdFromDialog loose-mode gate (Sprint 12 #2 baseline)', () => {
  it('returns error + does NOT call IPC or mutate store when no project is open (zh-CN)', async () => {
    expect(useArxmlStore.getState().project).toBeNull();
    const openSpy = vi.fn(async () => ({ kind: 'ok' as const, path: '/tmp/x.arxml' }));
    const readSpy = vi.fn(async () => ({ kind: 'ok' as const, content: MIN_BSWMD }));
    installApiStub({ openBswmdDialog: openSpy, readBswmd: readSpy });

    const { result } = renderHook(() => useProjectActions());
    const action = result.current.addBswmdFromDialog;
    const response = await action();

    expect(response.kind).toBe('error');
    if (response.kind !== 'error') throw new Error('unreachable');
    expect(response.message).toBe('需要先打开或创建项目');
    expect(openSpy).not.toHaveBeenCalled();
    expect(readSpy).not.toHaveBeenCalled();
    expect(useArxmlStore.getState().bswmdSchemas).toHaveLength(0);
    expect(useArxmlStore.getState().bswmdPaths).toHaveLength(0);
  });

  it('returns the same localized message in en', async () => {
    useArxmlStore.getState().setLocale('en');
    installApiStub({});

    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.addBswmdFromDialog();

    expect(response.kind).toBe('error');
    if (response.kind !== 'error') throw new Error('unreachable');
    expect(response.message).toBe('Please open or create a project first');
  });
});

describe('useProjectActions — addBswmdFromDialog canceled (Sprint 12 #2 baseline)', () => {
  it('returns canceled when user dismisses the open dialog (no readBswmd call)', async () => {
    openProjectWithDoc();
    const openStub = vi.fn(async () => ({ kind: 'canceled' as const }));
    const readSpy = vi.fn(async () => ({ kind: 'ok' as const, content: MIN_BSWMD }));
    installApiStub({ openBswmdDialog: openStub, readBswmd: readSpy });

    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.addBswmdFromDialog();

    expect(response.kind).toBe('canceled');
    expect(openStub).toHaveBeenCalledTimes(1);
    expect(readSpy).not.toHaveBeenCalled();
    expect(useArxmlStore.getState().bswmdSchemas).toHaveLength(0);
  });
});

describe('useProjectActions — addBswmdFromDialog read failure (Sprint 12 #2 baseline)', () => {
  it('returns error with readBswmdFailed message when readBswmd fails (zh-CN)', async () => {
    openProjectWithDoc();
    installApiStub({
      openBswmdDialog: async () => ({ kind: 'ok', path: '/tmp/bad.arxml' }),
      readBswmd: async () => ({ kind: 'read-failed', message: 'ENOENT' }),
    });

    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.addBswmdFromDialog();

    expect(response.kind).toBe('error');
    if (response.kind !== 'error') throw new Error('unreachable');
    expect(response.message).toContain('读取 BSWMD 失败');
    expect(response.message).toContain('ENOENT');
    expect(useArxmlStore.getState().bswmdSchemas).toHaveLength(0);
  });

  it('returns error with localized read message in en', async () => {
    useArxmlStore.getState().setLocale('en');
    openProjectWithDoc();
    installApiStub({
      openBswmdDialog: async () => ({ kind: 'ok', path: '/tmp/bad.arxml' }),
      readBswmd: async () => ({ kind: 'read-failed', message: 'No such file' }),
    });

    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.addBswmdFromDialog();

    expect(response.kind).toBe('error');
    if (response.kind !== 'error') throw new Error('unreachable');
    expect(response.message).toContain('Failed to read BSWMD');
    expect(response.message).toContain('No such file');
  });
});

describe('useProjectActions — addBswmdFromDialog parse failure (Sprint 12 #2 baseline)', () => {
  it('returns error with parseBswmdFailed message when content is malformed', async () => {
    openProjectWithDoc();
    installApiStub({
      openBswmdDialog: async () => ({ kind: 'ok', path: '/tmp/bad.arxml' }),
      readBswmd: async () => ({ kind: 'ok', content: MALFORMED_BSWMD }),
    });

    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.addBswmdFromDialog();

    expect(response.kind).toBe('error');
    if (response.kind !== 'error') throw new Error('unreachable');
    expect(response.message).toContain('解析失败');
    expect(useArxmlStore.getState().bswmdSchemas).toHaveLength(0);
    expect(useArxmlStore.getState().bswmdPaths).toHaveLength(0);
  });
});

describe('useProjectActions — addBswmdFromDialog duplicate path (Sprint 12 #2 baseline)', () => {
  it('returns error with duplicateBswmd message when path already loaded', async () => {
    openProjectWithDoc();
    useArxmlStore.getState().addBswmd('/tmp/dup.arxml', MIN_BSWMD);
    expect(useArxmlStore.getState().bswmdSchemas).toHaveLength(1);

    installApiStub({
      openBswmdDialog: async () => ({ kind: 'ok', path: '/tmp/dup.arxml' }),
      readBswmd: async () => ({ kind: 'ok', content: MIN_BSWMD }),
    });

    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.addBswmdFromDialog();

    expect(response.kind).toBe('error');
    if (response.kind !== 'error') throw new Error('unreachable');
    expect(response.message).toContain('已加载过');
    expect(response.message).toContain('/tmp/dup.arxml');
    expect(useArxmlStore.getState().bswmdSchemas).toHaveLength(1);
    expect(useArxmlStore.getState().bswmdPaths).toEqual(['/tmp/dup.arxml']);
  });
});

describe('useProjectActions — addBswmdFromDialog happy path (Sprint 12 #2 baseline)', () => {
  it('returns ok + store.bswmdSchemas.length === 1 for a valid new file (clean project, no guard)', async () => {
    openProjectWithDoc();
    expect(useArxmlStore.getState().dirtyPaths.size).toBe(0);
    installApiStub({
      openBswmdDialog: async () => ({ kind: 'ok', path: '/tmp/new.arxml' }),
      readBswmd: async () => ({ kind: 'ok', content: MIN_BSWMD }),
    });

    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.addBswmdFromDialog();

    expect(response.kind).toBe('ok');
    const after = useArxmlStore.getState();
    expect(after.bswmdSchemas).toHaveLength(1);
    expect(after.bswmdPaths).toEqual(['/tmp/new.arxml']);
    expect(after.error).toBeNull();
  });

  it('returns ok for two sequential loads (path indexing is fresh each time)', async () => {
    openProjectWithDoc();
    let counter = 0;
    const paths = ['/tmp/a.arxml', '/tmp/b.arxml'];
    installApiStub({
      openBswmdDialog: async () => {
        const path = paths[counter] ?? '/tmp/c.arxml';
        return { kind: 'ok' as const, path };
      },
      readBswmd: async () => ({ kind: 'ok' as const, content: MIN_BSWMD }),
    });

    const { result } = renderHook(() => useProjectActions());
    const first = await result.current.addBswmdFromDialog();
    counter += 1;
    const second = await result.current.addBswmdFromDialog();

    expect(first.kind).toBe('ok');
    expect(second.kind).toBe('ok');
    const after = useArxmlStore.getState();
    expect(after.bswmdSchemas).toHaveLength(2);
    expect(after.bswmdPaths).toEqual(['/tmp/a.arxml', '/tmp/b.arxml']);
  });
});
