// @vitest-environment jsdom
//
// ProjectPanel BSWMD UI (Sprint 12 #2 Task 5).
//
// Pins the renderer-side wiring of the BSWMD FileList inside ProjectPanel:
//
//   1. LooseView does NOT render the BSWMD section at all (loose mode
//      cannot load BSWMDs — user-confirmed design decision).
//   2. OpenView (project open, 0 BSWMDs) renders the empty hint and a
//      "Load BSWMD..." button next to the section title.
//   3. OpenView with 2 BSWMDs renders 2 list items, each with its own
//      remove button, and still exposes the add button.
//   4. Clicking the "Load BSWMD..." button invokes
//      `useProjectActions().addBswmdFromDialog`, which in turn reaches
//      the IPC `openBswmdDialog` channel (verified via a stubbed
//      `window.autosarApi`).
//   5. Clicking a list-item remove button invokes the
//      `removeBswmd(path)` action from the store.
//   6. i18n: the button label switches between en ("Load BSWMD...") and
//      zh-CN ("加载 BSWMD...") when the locale flips via the store.

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Locale } from '@shared/i18n';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { ProjectPanel } from '../ProjectPanel.js';

// ---------------------------------------------------------------------------
// Minimal helpers — no full manifest round-tripping, just the slots
// ProjectPanel.OpenView reads.
// ---------------------------------------------------------------------------

interface SampleProjectArgs {
  readonly name: string;
  readonly bswmdPaths?: readonly string[];
  readonly arxmlPaths?: readonly string[];
}

function openSampleProject(args: SampleProjectArgs): void {
  // Pin both the project manifest AND the store's parallel `bswmdPaths`
  // (Sprint 12 #2): when the user has already loaded BSWMDs from a
  // previous session, the store carries them even though the OpenView
  // section renders them from `manifest.bswmdPaths`. We seed both
  // here so OpenView (which reads `manifest.bswmdPaths` via the prop)
  // shows the expected items.
  useArxmlStore.setState({
    project: {
      schemaVersion: '1',
      id: '00000000-0000-0000-0000-000000000001',
      name: args.name,
      valueArxmlPaths: args.arxmlPaths ?? [],
      bswmdPaths: args.bswmdPaths ?? [],
    },
    projectPath: '/fake/project.json',
    bswmdPaths: args.bswmdPaths ?? [],
  });
}

interface AutosarApiStub {
  readonly openBswmdDialog: ReturnType<typeof vi.fn>;
  readonly readBswmd: ReturnType<typeof vi.fn>;
}

let originalAutosarApi: unknown;

function installApiStub(): AutosarApiStub {
  // Default to "canceled" — we only assert that the dialog was opened,
  // not the post-dialog flow. addBswmdFromDialog short-circuits to
  // `{ kind: 'canceled' }` so the store stays untouched.
  const openBswmdDialog = vi.fn().mockResolvedValue({ kind: 'canceled' as const });
  const readBswmd = vi.fn().mockResolvedValue({
    kind: 'read-failed' as const,
    message: 'unused',
  });
  const stub: AutosarApiStub = { openBswmdDialog, readBswmd };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.autosarApi = stub;
  return stub;
}

beforeEach(() => {
  originalAutosarApi = (globalThis as { window?: { autosarApi?: unknown } }).window?.autosarApi;
  useArxmlStore.getState().clear();
  useArxmlStore.getState().setLocale('en');
});

afterEach(() => {
  if (originalAutosarApi === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window.autosarApi;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = originalAutosarApi;
  }
});

// ---------------------------------------------------------------------------
// LooseView — must not render any BSWMD UI
// ---------------------------------------------------------------------------

describe('ProjectPanel LooseView (Sprint 12 #2 Task 5)', () => {
  it('does not render the BSWMD section when no project is open', () => {
    render(<ProjectPanel />);

    // Loose mode renders the loose view
    expect(screen.getByTestId('project-panel-loose')).toBeInTheDocument();
    // BSWMD section absent
    expect(screen.queryByTestId('project-panel-bswmd-list')).toBeNull();
    expect(screen.queryByTestId('project-panel-bswmd-add')).toBeNull();
    // The BSWMD title text would only show under the open view; assert its
    // absence directly via translation key (en bundle).
    expect(screen.queryByText(/^BSWMDs$/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// OpenView — BSWMD section
// ---------------------------------------------------------------------------

describe('ProjectPanel OpenView BSWMD section (Sprint 12 #2 Task 5)', () => {
  it('renders the empty hint and a "Load BSWMD..." button when 0 BSWMDs loaded', () => {
    openSampleProject({ name: 'Demo', bswmdPaths: [] });
    render(<ProjectPanel />);

    // Open view visible
    expect(screen.getByTestId('project-panel-open')).toBeInTheDocument();
    // No list rendered yet
    expect(screen.queryByTestId('project-panel-bswmd-list')).toBeNull();
    // Empty hint shows the "Load BSWMD" call-to-action
    expect(
      screen.getByText(/Click "Load BSWMD" to add a schema file\./),
    ).toBeInTheDocument();
    // Add button exists
    const addBtn = screen.getByTestId('project-panel-bswmd-add');
    expect(addBtn).toBeInTheDocument();
    expect(addBtn.textContent).toMatch(/Load BSWMD/);
  });

  it('renders 2 list items, each with a remove button, plus the add button when 2 BSWMDs loaded', () => {
    openSampleProject({
      name: 'Demo',
      bswmdPaths: ['/path/to/CanIf_Bswmd.arxml', '/path/to/Can_Bswmd.arxml'],
    });
    render(<ProjectPanel />);

    // List is present with both entries
    const list = screen.getByTestId('project-panel-bswmd-list');
    expect(list).toBeInTheDocument();
    expect(list.querySelectorAll('li')).toHaveLength(2);
    // Basenames show
    expect(screen.getByText('CanIf_Bswmd.arxml')).toBeInTheDocument();
    expect(screen.getByText('Can_Bswmd.arxml')).toBeInTheDocument();
    // Each list item exposes a remove button (testId encodes the full path)
    expect(
      screen.getByTestId('project-panel-bswmd-remove-/path/to/CanIf_Bswmd.arxml'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('project-panel-bswmd-remove-/path/to/Can_Bswmd.arxml'),
    ).toBeInTheDocument();
    // Add button still present
    expect(screen.getByTestId('project-panel-bswmd-add')).toBeInTheDocument();
  });

  it('clicking "Load BSWMD..." reaches window.autosarApi.openBswmdDialog via useProjectActions().addBswmdFromDialog', async () => {
    const api = installApiStub();
    openSampleProject({ name: 'Demo', bswmdPaths: [] });
    render(<ProjectPanel />);

    fireEvent.click(screen.getByTestId('project-panel-bswmd-add'));

    // addBswmdFromDialog is async — wait until the dialog stub has been
    // hit before asserting. cancel-then-noop means the store state is
    // unchanged and the IPC layer recorded exactly one open call.
    await vi.waitFor(() => expect(api.openBswmdDialog).toHaveBeenCalledTimes(1));
    expect(useArxmlStore.getState().bswmdSchemas).toHaveLength(0);
  });

  it('clicking a list-item remove button calls removeBswmd(path) on the store', () => {
    openSampleProject({
      name: 'Demo',
      bswmdPaths: ['/path/to/CanIf_Bswmd.arxml'],
    });
    render(<ProjectPanel />);

    fireEvent.click(
      screen.getByTestId('project-panel-bswmd-remove-/path/to/CanIf_Bswmd.arxml'),
    );

    // removeBswmd drops the path from bswmdPaths. Manifest is the
    // truth source for OpenView's FileList, but the store action
    // also clears `bswmdPaths` so loose-mode and re-validation stay
    // consistent. We assert via the parallel `bswmdPaths` slot since
    // the test seeds both, and removeBswmd is a no-op on unknown
    // paths — exercising the slot proves the callback fired.
    const state = useArxmlStore.getState();
    // The store's removeBswmd mirrors to the manifest as well. Assert
    // the path was dropped from one of the two (either is sufficient
    // since removeBswmd is a no-op when neither knows about it).
    const droppedFromPaths = !state.bswmdPaths.includes('/path/to/CanIf_Bswmd.arxml');
    const droppedFromManifest =
      state.project === null ||
      !state.project.bswmdPaths.includes('/path/to/CanIf_Bswmd.arxml');
    expect(droppedFromPaths || droppedFromManifest).toBe(true);
  });

  it('renders "加载 BSWMD..." when locale is zh-CN', () => {
    useArxmlStore.getState().setLocale('zh-CN' satisfies Locale);
    openSampleProject({ name: 'Demo', bswmdPaths: [] });
    render(<ProjectPanel />);

    const addBtn = screen.getByTestId('project-panel-bswmd-add');
    expect(addBtn.textContent).toMatch(/加载 BSWMD/);
  });
});