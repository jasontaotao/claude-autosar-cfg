// @vitest-environment jsdom
//
// App shell mounting tests (Sprint 12 #3 Task 8 part 2).
//
// Pins the contract that `<App />` always mounts three dialog hosts at
// the root:
//
//   1. `<PromptRoot />`        — Sprint 12 #2 housekeeping
//      (`src/renderer/components/PromptDialog.tsx`).
//   2. `<NewProjectDialog />`  — Sprint 12 #3 Phase 1 (Task 1+2).
//   3. `<ConfirmRoot />`       — Sprint 12 #3 Phase 1 (Task 6, module-level
//      API). `<ConfirmRoot />` MUST mount before `<NewProjectDialog />`
//      so the module-level `confirm()` API can drive the dirty-protection
//      dialog from inside `useProjectActions.submitNewProject` (Task 5).
//
// Test strategy (small / focused):
//   - PromptRoot: module-level externalSetState. We trigger it via
//     `prompt()` and assert the overlay mounts.
//   - NewProjectDialog: store-driven visibility. Default closed (no
//     overlay). Open via `setNewProjectDialogOpen(true)` and assert the
//     `npd-overlay` testid mounts.
//   - ConfirmRoot: module-level externalSetState. We trigger it via
//     `confirm()` and assert the overlay mounts.
//
// We do NOT exercise internal flow (e.g. dirty-protection + switching
// action) here — those belong to the hook layer / useProjectActions
// tests. This file only proves the three dialog hosts are mounted by
// `App.tsx`.

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.js';
import { confirm } from '../components/ConfirmDialog.js';
import { prompt } from '../components/PromptDialog.js';
import { useArxmlStore } from '../store/useArxmlStore.js';

// ---------------------------------------------------------------------------
// Test fixture: stub the preload bridge so AppHeader (and any other
// component that touches `window.autosarApi`) renders without throwing in
// jsdom. The dialog-host tests don't exercise the IPC layer — they only
// assert that the three dialog hosts mount. Each method is a no-op
// vi.fn() that resolves with a shape that matches the IPC contract.
// ---------------------------------------------------------------------------

interface MinimalAutosarApi {
  readonly getAppVersion: ReturnType<typeof vi.fn>;
  readonly openArxml: ReturnType<typeof vi.fn>;
  readonly openArxmlMulti: ReturnType<typeof vi.fn>;
  readonly parseArxml: ReturnType<typeof vi.fn>;
  readonly saveArxml: ReturnType<typeof vi.fn>;
  readonly projectNew: ReturnType<typeof vi.fn>;
  readonly projectOpen: ReturnType<typeof vi.fn>;
  readonly projectSave: ReturnType<typeof vi.fn>;
  readonly openBswmdDialog: ReturnType<typeof vi.fn>;
  readonly readBswmd: ReturnType<typeof vi.fn>;
  readonly pickDir: ReturnType<typeof vi.fn>;
}

function installAutosarApiStub(): MinimalAutosarApi {
  const stub: MinimalAutosarApi = {
    getAppVersion: vi.fn().mockResolvedValue('0.12.0'),
    openArxml: vi.fn().mockResolvedValue({ canceled: true }),
    openArxmlMulti: vi.fn().mockResolvedValue({ kind: 'canceled' }),
    parseArxml: vi.fn(),
    saveArxml: vi.fn(),
    projectNew: vi.fn().mockResolvedValue({ kind: 'canceled' }),
    projectOpen: vi.fn().mockResolvedValue({ kind: 'canceled' }),
    projectSave: vi.fn().mockResolvedValue({ kind: 'write-failed', message: '' }),
    openBswmdDialog: vi.fn().mockResolvedValue({ kind: 'canceled' }),
    readBswmd: vi.fn().mockResolvedValue({ kind: 'read-failed', message: '' }),
    pickDir: vi.fn().mockResolvedValue({ kind: 'canceled' }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.autosarApi = stub;
  return stub;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  installAutosarApiStub();
  // Reset the renderer store between tests so a stale `newProjectDialogOpen`
  // or `locale` doesn't leak across cases. `clear()` closes both dialogs and
  // drops the pending action.
  useArxmlStore.getState().clear();
  useArxmlStore.getState().setLocale('en');
});

afterEach(() => {
  // Wipe the IPC stub so the next test (and any other suite that
  // re-installs with a different shape) starts clean.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).window.autosarApi;
  cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('App (Sprint 12 #3 Task 8 part 2 — dialog host mounting)', () => {
  it('mounts <PromptRoot /> — module-level prompt() can open a dialog', async () => {
    render(<App />);

    // PromptRoot uses module-level externalSetState. The post-mount effect
    // must flush before prompt() can open a dialog.
    await act(async () => {
      await Promise.resolve();
    });

    // No dialog visible yet (PromptRoot is closed by default).
    expect(screen.queryByTestId('prompt-overlay')).toBeNull();

    // Trigger the module-level API. Awaiting the promise is fire-and-forget
    // for this assertion — we just want the overlay to mount.
    void prompt({ message: 'project name' });
    await waitFor(() => {
      expect(screen.getByTestId('prompt-overlay')).toBeInTheDocument();
    });
  });

  it('mounts <NewProjectDialog /> — store-driven visibility, closed by default', () => {
    render(<App />);

    // The dialog is store-driven. With newProjectDialogOpen === false the
    // component returns null, so neither the overlay nor the input should
    // be present.
    expect(screen.queryByTestId('npd-overlay')).toBeNull();
    expect(screen.queryByTestId('npd-name-input')).toBeNull();
  });

  it('mounts <NewProjectDialog /> — opens when the store flag flips to true', async () => {
    render(<App />);

    act(() => {
      useArxmlStore.getState().setNewProjectDialogOpen(true);
    });

    // The store flip should immediately mount the dialog. The name input
    // is the most stable render root to assert on (testid is unique to
    // this dialog and not gated by user interaction).
    await waitFor(() => {
      expect(screen.getByTestId('npd-overlay')).toBeInTheDocument();
    });
    expect(screen.getByTestId('npd-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('npd-dir-input')).toBeInTheDocument();
    expect(screen.getByTestId('npd-create')).toBeInTheDocument();
  });

  it('mounts <NewProjectDialog /> — closes when the store flag flips to false', async () => {
    render(<App />);

    act(() => {
      useArxmlStore.getState().setNewProjectDialogOpen(true);
    });
    await waitFor(() => {
      expect(screen.getByTestId('npd-overlay')).toBeInTheDocument();
    });

    act(() => {
      useArxmlStore.getState().setNewProjectDialogOpen(false);
    });
    await waitFor(() => {
      expect(screen.queryByTestId('npd-overlay')).toBeNull();
    });
  });

  it('mounts <ConfirmRoot /> — module-level confirm() can open a dialog', async () => {
    render(<App />);

    // ConfirmRoot uses module-level externalSetState. The post-mount effect
    // must flush before confirm() can open a dialog. We give React a chance
    // to commit the effect before invoking confirm().
    await act(async () => {
      await Promise.resolve();
    });

    // No dialog visible yet (ConfirmRoot is closed by default).
    expect(screen.queryByTestId('confirm-overlay')).toBeNull();

    // Trigger the module-level API. The promise resolves on user action; we
    // just need to assert the overlay mounts.
    void confirm({ title: 'Unsaved changes', message: 'Discard?' });
    await waitFor(() => {
      expect(screen.getByTestId('confirm-overlay')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-continue')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-discard')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-saveAndProceed')).toBeInTheDocument();
  });

  it('mounts all three dialog hosts side-by-side (PromptRoot + NewProjectDialog + ConfirmRoot)', async () => {
    render(<App />);

    // Flush post-mount effects for the module-level hosts.
    await act(async () => {
      await Promise.resolve();
    });

    // Open every dialog at once — verifies they coexist without portals
    // colliding. (z-index is owned by their respective CSS files; App.tsx
    // is intentionally agnostic about ordering beyond mount order.)
    act(() => {
      useArxmlStore.getState().setNewProjectDialogOpen(true);
    });
    void prompt({ message: 'name?' });
    void confirm({ title: 'Unsaved', message: 'Discard?' });

    await waitFor(() => {
      expect(screen.getByTestId('npd-overlay')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId('prompt-overlay')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId('confirm-overlay')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Sprint 13+ — left-column project-panel gate (regression for the
// LooseView removal in commit 1de85c0). Without this gate App.tsx
// renders the open-mode ProjectPanelInfo only when a project is open,
// leaving the top of the left column empty in loose mode. The fix
// mounts a compact banner with quick-action buttons instead.
// ---------------------------------------------------------------------------

describe('App left-column project panel (Sprint 13+)', () => {
  it('renders loose-mode banner (text-only hint, no New/Open buttons) when no project is open', () => {
    // Sprint 13+ follow-up: user removed the loose banner's quick-action
    // buttons because they duplicated the AppHeader project menu. The
    // banner is now text-only; users reach New / Open via the menu.
    render(<App />);
    const banner = screen.getByTestId('project-panel-loose');
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toMatch(/No project loaded/);
    // Quick-action buttons must NOT exist anymore (regression for the
    // duplicate-controls removal).
    expect(screen.queryByTestId('project-panel-loose-new')).toBeNull();
    expect(screen.queryByTestId('project-panel-loose-open')).toBeNull();
  });

  it('does not render loose-mode banner when a project is open', () => {
    // Seed the store with a minimal project + path so App's
    // `project !== null && projectPath !== null` gate flips.
    useArxmlStore.setState({
      project: {
        schemaVersion: '1',
        id: '00000000-0000-0000-0000-000000000001',
        name: 'demo',
        valueArxmlPaths: [],
        bswmdPaths: [],
      },
      projectPath: 'C:/tmp/demo.autosarcfg.json',
    });
    render(<App />);
    expect(screen.queryByTestId('project-panel-loose')).toBeNull();
    // The open-mode panel mounts; use the manifest-title testid rather
    // than `getByText('demo')` because the AppHeader project chip also
    // renders the project name and would match twice.
    expect(screen.getByTestId('project-panel-open')).toBeInTheDocument();
  });
});
