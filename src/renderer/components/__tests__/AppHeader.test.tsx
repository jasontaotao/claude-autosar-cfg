// @vitest-environment jsdom
//
// AppHeader (Sprint 9 #5, Sprint 10 #2):
//   - Sprint 9 #5: slim 40px top bar consolidating h1 + ArxmlPanel
//   - Sprint 10 #2: multi-file open via openArxmlMulti + addDocument
//                   (was openArxml + setDoc); new doc-tab strip between
//                   the actions and the right-side stats.
//
// Tests pin:
//   1. file Open / Save buttons live in the header
//   2. version string renders on the right
//   3. when no doc is loaded, file name is not shown
//   4. when a doc is loaded, basename shows + AUTOSAR version renders
//   5. Save button disabled when clean; enabled + 'is-dirty' when dirty
//   6. Open click triggers autosarApi.openArxmlMulti (Sprint 10 #2 — was openArxml)
//   7. doc-tab strip: hidden when 0 docs, shows each basename, active
//      is highlighted, click switches active, × removes

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArxmlDocument, ArxmlVersion } from '@core/arxml/types.js';
import type { ProjectManifest } from '@shared/project';

import { MANIFEST_SCHEMA_VERSION } from '../../../shared/project.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';
import { AppHeader } from '../AppHeader.js';
import { confirm } from '../ConfirmDialog.js';

// Mock the dialog module so we can drive the 3-button choice from the
// test (the real ConfirmRoot is mounted at App level — not by the
// AppHeader unit suite). Without the mock, `confirm()` would resolve
// with 'continue' (safe fallback) and the test could not exercise
// the discard / saveAndProceed paths.
vi.mock('../ConfirmDialog.js', () => ({
  confirm: vi.fn(),
  ConfirmRoot: () => null,
}));

const confirmMock = vi.mocked(confirm);

// Sprint 14 / Task 11 — AppHeader now requires the ECUC-picker props.
// Most of the legacy suite doesn't care about the picker (they test
// the file/project menu); we provide a no-op pair here so the existing
// assertions stay green. The picker-specific behavior is covered by
// the new T11 menu-entry tests in the third describe block below.
//
// Sprint 14 / Phase C (T14) — script panel toggle. Same idea: the
// legacy tests don't care which way the toggle reads, so a default
// closed state with a no-op toggler keeps them green. The new
// toggle-specific behavior is pinned by the T14 tests.
const noopProps = {
  onEcucModuleSelect: (): void => {},
  canSelectEcucModule: false,
  scriptPanelOpen: false,
  onToggleScriptPanel: (): void => {},
};

interface MockWindowAutosarApi {
  getAppVersion: ReturnType<typeof vi.fn>;
  openArxml: ReturnType<typeof vi.fn>;
  openArxmlMulti: ReturnType<typeof vi.fn>;
  parseArxml: ReturnType<typeof vi.fn>;
  saveArxml: ReturnType<typeof vi.fn>;
}

function makeWindowApi(): MockWindowAutosarApi {
  return {
    getAppVersion: vi.fn().mockResolvedValue('0.9.5'),
    openArxml: vi.fn().mockResolvedValue({ canceled: true }),
    openArxmlMulti: vi.fn().mockResolvedValue({ kind: 'canceled' }),
    parseArxml: vi.fn(),
    saveArxml: vi.fn(),
  };
}

function makeDoc(version: ArxmlVersion = '4.2'): ArxmlDocument {
  return {
    path: '/in-memory',
    version,
    packages: [
      {
        shortName: 'AUTOSAR',
        path: '/AUTOSAR',
        elements: [],
        packages: [{ shortName: 'EcucDefs', path: '/AUTOSAR/EcucDefs', elements: [] }],
      },
    ],
  };
}

describe('AppHeader (Sprint 9 #5 + Sprint 10 #2)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
    // Sprint 11 Phase 1 (Option A) — default locale is 'zh-CN' for new
    // users; tests assert on English strings (e.g. /Save/, "All checks
    // passed") so we pin the locale to 'en' for the duration of the suite.
    useArxmlStore.getState().setLocale('en');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = makeWindowApi();
  });

  it('renders the slim top bar (40px class, h-10 token) and the app name', () => {
    render(<AppHeader {...noopProps} />);
    const header = screen.getByTestId('app-header');
    expect(header).toBeInTheDocument();
    expect(header.className).toContain('app-header');
    expect(screen.getByText(/claude-AutosarCfg/)).toBeInTheDocument();
  });

  it('renders the app version on the right side, dim and monospace', async () => {
    render(<AppHeader {...noopProps} />);
    const ver = await screen.findByText(/^v0\.9\.5$/);
    expect(ver).toBeInTheDocument();
    expect(ver.className).toContain('app-version');
  });

  it('does not show a doc name when no doc is loaded', () => {
    render(<AppHeader {...noopProps} />);
    expect(screen.queryByTestId(/^app-doc-name|chevron-/)).toBeNull();
    expect(screen.queryByText(/^AUTOSAR 4\./)).toBeNull();
  });

  it('does NOT show a doc-name or doc-version even when a doc is loaded (regression for "ecuc 内容层级" removal)', () => {
    // Sprint 13+ — the menu bar should only carry functional controls.
    // The active-doc basename + AUTOSAR version chip were removed from
    // AppHeader's left/right corners because they duplicated the loaded
    // doc's information (already visible in Tree / FileListTab). This
    // test pins the absence so a future change can't silently bring
    // the chrome back.
    useArxmlStore
      .getState()
      .setDoc(makeDoc(), 'C:/some/path/AUTOSAR_MOD_ECUConfigurationParameters.arxml');
    render(<AppHeader {...noopProps} />);
    expect(screen.queryByTestId('app-doc-name')).toBeNull();
    expect(screen.queryByText(/^AUTOSAR 4\.2$/)).toBeNull();
  });

  it('Save button is disabled when doc is clean; enabled + has dirty class when dirty', () => {
    useArxmlStore.getState().setDoc(makeDoc(), '/p/x.arxml');
    const { rerender } = render(<AppHeader {...noopProps} />);
    const save = screen.getByTestId('btn-save');
    expect(save).toBeDisabled();
    expect(save.className).not.toContain('is-dirty');

    useArxmlStore.setState({ dirtyPaths: new Set(['/p/x.arxml']) });
    rerender(<AppHeader {...noopProps} />);
    const save2 = screen.getByTestId('btn-save');
    expect(save2).not.toBeDisabled();
    expect(save2.className).toContain('is-dirty');
    expect(save2.textContent).toMatch(/Save/);
  });

  it('Save click passes currentPath = filePath to autosarApi.saveArxml (Sprint 16 silent-save-back)', async () => {
    // Sprint 16 — the renderer hands the IPC the on-disk path so the
    // main process can silent-save without popping showSaveDialog.
    // `setDoc(doc, filePath)` is the canonical way to load a doc
    // with a known on-disk path; the Save button then forwards that
    // path as `currentPath`.
    const api = makeWindowApi();
    api.saveArxml.mockResolvedValue({
      ok: true,
      value: { canceled: false, path: '/p/x.arxml' },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = api;
    useArxmlStore.getState().setDoc(makeDoc(), '/p/x.arxml');
    useArxmlStore.setState({ dirtyPaths: new Set(['/p/x.arxml']) });
    render(<AppHeader {...noopProps} />);
    fireEvent.click(screen.getByTestId('btn-save'));
    await vi.waitFor(() => expect(api.saveArxml).toHaveBeenCalledTimes(1));
    const call = api.saveArxml.mock.calls[0]?.[0] as {
      doc: ArxmlDocument;
      defaultName: string;
      currentPath?: string;
    };
    expect(call.currentPath).toBe('/p/x.arxml');
    expect(call.defaultName).toBe('x.arxml');
  });

  it('Open click triggers autosarApi.openArxmlMulti (Sprint 10 #2: multi-file channel)', () => {
    const api = makeWindowApi();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = api;
    render(<AppHeader {...noopProps} />);
    // 打开下拉菜单，再点击"打开 ARXML"
    fireEvent.click(screen.getByTestId('menu-project-trigger').querySelector('button')!);
    fireEvent.click(screen.getByTestId('btn-open'));
    expect(api.openArxmlMulti).toHaveBeenCalledTimes(1);
    expect(api.openArxmlMulti).toHaveBeenCalledWith({ title: 'Open AUTOSAR ARXML' });
  });

  it('Open click with multi-file result feeds addDocument per file (Sprint 10 #2)', async () => {
    const api = makeWindowApi();
    api.openArxmlMulti.mockResolvedValue({
      kind: 'opened',
      results: [
        { path: '/p/A.arxml', content: '<a/>' },
        { path: '/p/B.arxml', content: '<b/>' },
      ],
    });
    api.parseArxml.mockResolvedValue({ ok: true, value: makeDoc() });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = api;
    render(<AppHeader {...noopProps} />);
    // 打开下拉菜单，再点击"打开 ARXML"
    fireEvent.click(screen.getByTestId('menu-project-trigger').querySelector('button')!);
    fireEvent.click(screen.getByTestId('btn-open'));
    // parseArxml called once per file
    await vi.waitFor(() => expect(api.parseArxml).toHaveBeenCalledTimes(2));
    // documents[] has 2 entries
    expect(useArxmlStore.getState().documents.length).toBe(2);
    expect(useArxmlStore.getState().documentPaths).toEqual(['/p/A.arxml', '/p/B.arxml']);
    // last parsed is the active doc
    expect(useArxmlStore.getState().activeDocumentPath).toBe('/p/B.arxml');
  });
});

// ---------------------------------------------------------------------------
// Sprint 10 #2 — doc-tab strip behavior
// ---------------------------------------------------------------------------

describe('AppHeader doc-tab strip (Sprint 10 #2)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
    useArxmlStore.getState().setLocale('en');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = makeWindowApi();
  });

  it('does NOT render the doc-tab strip — even when multiple docs are loaded (regression for "ecuc 内容层级" removal)', () => {
    // Sprint 13+ — the menu bar should only carry functional controls.
    // The doc-tab strip (each loaded ARXML shown as a clickable tab in
    // the menu bar) was removed because the loaded doc set is now
    // navigable via FileListTab in the LeftPanel. This test pins the
    // absence so a future change can't silently bring the strip back.
    useArxmlStore.getState().addDocument(makeDoc(), 'C:/path/Com.arxml');
    useArxmlStore.getState().addDocument(makeDoc(), 'C:/path/PduR.arxml');
    useArxmlStore.getState().setActiveDocument('C:/path/Com.arxml');

    render(<AppHeader {...noopProps} />);
    expect(screen.queryByRole('tablist')).toBeNull();
    // Spot-check the old per-doc testids are gone too.
    expect(screen.queryByTestId('doc-tab-C:/path/Com.arxml')).toBeNull();
    expect(screen.queryByTestId('doc-tab-close-C:/path/PduR.arxml')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sprint 16b T7 — Save All toolbar button
// ---------------------------------------------------------------------------
//
// Common case: BSWMD-to-ECUC generates N files, user edits params in
// several of them, then clicks 全部保存 once instead of N individual
// Save clicks. The new `btn-save-all` button loops over every entry
// in `store.dirtyPaths`, calls saveArxml with `currentPath` so the
// main process silent-saves (reuses the T2 contract), and surfaces
// the saved/failed counts in a toast.

describe('AppHeader Save All button (Sprint 16b T7)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
    useArxmlStore.getState().setLocale('en');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = makeWindowApi();
  });

  it('Save All click silent-saves every dirty ECUC via currentPath', async () => {
    // 3 dirty docs with distinct filePaths → saveArxml called 3 times,
    // each with currentPath === doc.path; markSaved called 3 times;
    // toast set to "已保存 3 个文件" / "Saved 3 files"
    const api = makeWindowApi();
    // Echo the requested currentPath back as the saved path so
    // markSaved drops the matching entry from dirtyPaths on every
    // iteration. (Hard-coding a single path would let markSaved
    // succeed only once because subsequent calls are no-ops on the
    // already-removed path — which masks real behaviour for the
    // multi-doc case.)
    api.saveArxml.mockImplementation(async (req: { currentPath?: string }) => ({
      ok: true,
      value: { canceled: false, path: req.currentPath ?? '/p/A.arxml' },
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = api;

    // Three distinct docs, all dirty.
    useArxmlStore.getState().addDocument(makeDoc(), '/p/A.arxml');
    useArxmlStore.getState().addDocument(makeDoc(), '/p/B.arxml');
    useArxmlStore.getState().addDocument(makeDoc(), '/p/C.arxml');
    useArxmlStore.setState({
      dirtyPaths: new Set(['/p/A.arxml', '/p/B.arxml', '/p/C.arxml']),
    });

    render(<AppHeader {...noopProps} />);
    fireEvent.click(screen.getByTestId('btn-save-all'));

    // Three silent saves, one per dirty path.
    await vi.waitFor(() => expect(api.saveArxml).toHaveBeenCalledTimes(3));
    const calls = api.saveArxml.mock.calls;
    const seenPaths = calls.map((c) => (c[0] as { currentPath?: string }).currentPath).sort();
    expect(seenPaths).toEqual(['/p/A.arxml', '/p/B.arxml', '/p/C.arxml']);
    // All calls carried currentPath (no dialog) — every call had a path.
    for (const c of calls) {
      const req = c[0] as { currentPath?: string };
      expect(req.currentPath).toBeTruthy();
    }

    // markSaved was called for every dirty path → dirtyPaths is empty.
    await vi.waitFor(() => {
      expect(useArxmlStore.getState().dirtyPaths.size).toBe(0);
    });

    // Toast reports the success count, localized for the current locale.
    await vi.waitFor(() => {
      const err = useArxmlStore.getState().error;
      expect(err).toBe('Saved 3 files');
    });
  });

  it('Save All is disabled when no doc is dirty', () => {
    // 0 dirty paths → button disabled.
    useArxmlStore.getState().addDocument(makeDoc(), '/p/A.arxml');
    useArxmlStore.getState().addDocument(makeDoc(), '/p/B.arxml');
    // dirtyPaths stays empty.
    render(<AppHeader {...noopProps} />);
    const btn = screen.getByTestId('btn-save-all');
    expect(btn).toBeDisabled();
  });

  // ---------------------------------------------------------------------------
  // Sprint 17a T3 — Save All button gets `is-dirty` visual cue
  // ---------------------------------------------------------------------------

  it('Save All gets is-dirty className when any doc is dirty', () => {
    const dirtyDoc = makeDoc();
    useArxmlStore.getState().addDocument(makeDoc(), '/p/A.arxml');
    useArxmlStore.getState().addDocument(dirtyDoc, '/p/B.arxml');
    // Mark B as dirty via the store's mutation API.
    useArxmlStore.setState((s) => {
      const nextDirty = new Set(s.dirtyPaths);
      nextDirty.add('/p/B.arxml');
      return { dirtyPaths: nextDirty };
    });
    render(<AppHeader {...noopProps} />);
    const btn = screen.getByTestId('btn-save-all');
    expect(btn.className).toContain('is-dirty');
  });

  it('Save All omits is-dirty className when no doc is dirty', () => {
    useArxmlStore.getState().addDocument(makeDoc(), '/p/A.arxml');
    useArxmlStore.getState().addDocument(makeDoc(), '/p/B.arxml');
    // No dirty mark → dirtyPaths stays empty.
    render(<AppHeader {...noopProps} />);
    const btn = screen.getByTestId('btn-save-all');
    expect(btn.className).not.toContain('is-dirty');
  });

  it('Save All surfaces partial-failure toast', async () => {
    // 2 dirty, second saveArxml returns ok:false → toast shows failure
    // (1 saved, 1 failed). The first doc is still saved; the second
    // doc's dirty bit is preserved (markSaved was NOT called for it).
    const api = makeWindowApi();
    // First call (A.arxml) succeeds, second call (B.arxml) fails.
    api.saveArxml
      .mockResolvedValueOnce({ ok: true, value: { canceled: false, path: '/p/A.arxml' } })
      .mockResolvedValueOnce({
        ok: false,
        error: { kind: 'permission-denied', message: 'EACCES' },
      });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = api;

    useArxmlStore.getState().addDocument(makeDoc(), '/p/A.arxml');
    useArxmlStore.getState().addDocument(makeDoc(), '/p/B.arxml');
    useArxmlStore.setState({ dirtyPaths: new Set(['/p/A.arxml', '/p/B.arxml']) });

    render(<AppHeader {...noopProps} />);
    fireEvent.click(screen.getByTestId('btn-save-all'));

    await vi.waitFor(() => expect(api.saveArxml).toHaveBeenCalledTimes(2));
    // Only the successful path was markSaved'd → /p/A.arxml is clean,
    // /p/B.arxml is still dirty.
    await vi.waitFor(() => {
      const dirty = useArxmlStore.getState().dirtyPaths;
      expect(dirty.has('/p/A.arxml')).toBe(false);
      expect(dirty.has('/p/B.arxml')).toBe(true);
      expect(dirty.size).toBe(1);
    });
    // Toast reports partial failure: 1 saved, 1 failed, EACCES.
    await vi.waitFor(() => {
      const err = useArxmlStore.getState().error;
      expect(err).not.toBeNull();
      expect(err).toContain('Saved 1');
      expect(err).toContain('1 failed');
      expect(err).toContain('EACCES');
    });
  });
});

// ---------------------------------------------------------------------------
// Sprint 13+ — store-error banner surfacing
// ---------------------------------------------------------------------------
//
// Background: load failures that originate outside AppHeader (BSWMD load
// from ProjectPanel / FileListTab via useProjectActions.addBswmdFromDialog,
// the store.addBswmd failure path, future cross-store error sources)
// write to `useArxmlStore.error` but AppHeader previously only rendered
// its own local `state.error`. The result was a silent failure — the
// user clicked a button, nothing happened, no feedback.
//
// Sprint 13+ follow-up: the inline span was too cramped (max-width
// 30vw + ellipsis) and the error message was clipped for any failure
// with multi-segment content. The store-error surface moved to a
// dedicated <ErrorBanner /> component mounted as a sibling of
// AppHeader (see ErrorBanner.test.tsx for the new tests). AppHeader
// no longer renders an inline error — it just writes action failures
// to the store via `setError`.

// ---------------------------------------------------------------------------
// Sprint 13+ Stage 4 M8 — formatParseError i18n
// ---------------------------------------------------------------------------
//
// AppHeader.onOpen surfaces a per-file ParseError via the store; the
// error message is built by `formatParseError(e, locale)`. We verify
// the localized text by reading `useArxmlStore.error` after the open
// flow runs through its async path.
describe('AppHeader formatParseError i18n (Sprint 13+ Stage 4 M8)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = makeWindowApi();
  });

  it('renders the parse-error in Chinese when locale is zh-CN', async () => {
    useArxmlStore.getState().setLocale('zh-CN');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (globalThis as any).window.autosarApi as MockWindowAutosarApi;
    api.openArxmlMulti.mockResolvedValue({
      kind: 'opened',
      results: [{ path: '/p/Bad.arxml', content: '<bad/>' }],
    });
    api.parseArxml.mockResolvedValue({
      ok: false,
      error: { kind: 'xml-malformed', message: 'unclosed tag' },
    });

    render(<AppHeader {...noopProps} />);
    fireEvent.click(screen.getByTestId('menu-project-trigger').querySelector('button')!);
    fireEvent.click(screen.getByTestId('btn-open'));

    await vi.waitFor(() => expect(api.parseArxml).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => {
      const err = useArxmlStore.getState().error;
      expect(err).not.toBeNull();
      expect(err).toContain('XML 格式错误');
      expect(err).toContain('unclosed tag');
    });
  });

  it('renders the parse-error in English when locale is en', async () => {
    useArxmlStore.getState().setLocale('en');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (globalThis as any).window.autosarApi as MockWindowAutosarApi;
    api.openArxmlMulti.mockResolvedValue({
      kind: 'opened',
      results: [{ path: '/p/Bad.arxml', content: '<bad/>' }],
    });
    api.parseArxml.mockResolvedValue({
      ok: false,
      error: { kind: 'missing-root', message: 'expected <AUTOSAR>' },
    });

    render(<AppHeader {...noopProps} />);
    fireEvent.click(screen.getByTestId('menu-project-trigger').querySelector('button')!);
    fireEvent.click(screen.getByTestId('btn-open'));

    await vi.waitFor(() => expect(api.parseArxml).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => {
      const err = useArxmlStore.getState().error;
      expect(err).not.toBeNull();
      expect(err).toContain('Missing root element');
      expect(err).toContain('expected <AUTOSAR>');
    });
  });
});

// ---------------------------------------------------------------------------
// Project chip × button (close project + clear tree)
// ---------------------------------------------------------------------------
//
// User-reported: "I closed the project, why does the tree still have
// content?". The fix: clicking × on the project chip must wipe the
// in-memory document set (close + clear), not just drop the manifest
// reference. The original `closeProject` is preserved for callers that
// rely on the loose-mode contract; a new `closeProjectAndDiscard`
// action does the destructive variant.
//
// When the project has unsaved changes (dirtyPaths.size > 0), the
// click must surface a 3-button Save / Discard / Cancel dialog:
//   - saveAndProceed → save all dirty ARXML, then close
//   - discard        → close without saving
//   - continue       → no-op (user changed their mind)
// When dirtyPaths is empty, the click closes immediately with no
// dialog. This describe pins the full flow.

describe('AppHeader project chip × button (close + clear)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
    useArxmlStore.getState().setLocale('en');
    confirmMock.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = makeWindowApi();
  });

  function openProjectInStore(): void {
    // Inject the bare-minimum manifest/projectPath so the project
    // chip renders in AppHeader. We bypass `openProject` to keep the
    // test focused on the × button — the open flow has its own suite.
    const manifest: ProjectManifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      id: '00000000-0000-0000-0000-000000000099',
      name: 'TestProj',
      valueArxmlPaths: ['/p/A.arxml'],
      bswmdPaths: [],
    };
    useArxmlStore.setState({ project: manifest, projectPath: '/p/test.autosarcfg.json' });
  }

  it('does NOT render the × button when no project is open', () => {
    render(<AppHeader {...noopProps} />);
    expect(screen.queryByTestId('btn-project-close')).toBeNull();
  });

  it('renders the × button on the project chip when a project is open', () => {
    openProjectInStore();
    render(<AppHeader {...noopProps} />);
    const btn = screen.getByTestId('btn-project-close');
    expect(btn).toBeInTheDocument();
    expect(btn.getAttribute('aria-label')).toMatch(/TestProj/);
  });

  it('× click with no dirty docs closes immediately — no dialog, store cleared', async () => {
    openProjectInStore();
    useArxmlStore.getState().addDocument(makeDoc(), '/p/A.arxml');
    // No dirty mark.
    render(<AppHeader {...noopProps} />);

    fireEvent.click(screen.getByTestId('btn-project-close'));

    // The dialog must NOT have been opened.
    expect(confirmMock).not.toHaveBeenCalled();
    // The destructive store action ran — project + documents gone.
    await vi.waitFor(() => {
      const s = useArxmlStore.getState();
      expect(s.project).toBeNull();
      expect(s.projectPath).toBeNull();
      expect(s.documents).toEqual([]);
      expect(s.displayDoc).toBeNull();
    });
  });

  it('× click with dirty docs + Discard → saveArxml NOT called, store cleared', async () => {
    openProjectInStore();
    useArxmlStore.getState().addDocument(makeDoc(), '/p/A.arxml');
    useArxmlStore.setState({ dirtyPaths: new Set(['/p/A.arxml']) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (globalThis as any).window.autosarApi as MockWindowAutosarApi;
    confirmMock.mockResolvedValue('discard');

    render(<AppHeader {...noopProps} />);
    fireEvent.click(screen.getByTestId('btn-project-close'));

    // The dialog was offered to the user.
    await vi.waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    // No save happened — discard means throw away.
    expect(api.saveArxml).not.toHaveBeenCalled();
    // Store wiped.
    await vi.waitFor(() => {
      const s = useArxmlStore.getState();
      expect(s.project).toBeNull();
      expect(s.documents).toEqual([]);
      expect(s.dirtyPaths.size).toBe(0);
    });
  });

  it('× click with dirty docs + Save → saveArxml called for each dirty path, then store cleared', async () => {
    openProjectInStore();
    useArxmlStore.getState().addDocument(makeDoc(), '/p/A.arxml');
    useArxmlStore.getState().addDocument(makeDoc(), '/p/B.arxml');
    useArxmlStore.setState({ dirtyPaths: new Set(['/p/A.arxml', '/p/B.arxml']) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (globalThis as any).window.autosarApi as MockWindowAutosarApi;
    api.saveArxml.mockImplementation(async (req: { currentPath?: string }) => ({
      ok: true,
      value: { canceled: false, path: req.currentPath ?? '/p/A.arxml' },
    }));
    confirmMock.mockResolvedValue('saveAndProceed');

    render(<AppHeader {...noopProps} />);
    fireEvent.click(screen.getByTestId('btn-project-close'));

    await vi.waitFor(() => expect(api.saveArxml).toHaveBeenCalledTimes(2));
    const calledPaths = api.saveArxml.mock.calls
      .map((c) => (c[0] as { currentPath?: string }).currentPath)
      .sort();
    expect(calledPaths).toEqual(['/p/A.arxml', '/p/B.arxml']);
    // Once every dirty path was markSaved'd and dispatched the close,
    // the store is empty.
    await vi.waitFor(() => {
      const s = useArxmlStore.getState();
      expect(s.project).toBeNull();
      expect(s.documents).toEqual([]);
      expect(s.dirtyPaths.size).toBe(0);
    });
  });

  it('× click with dirty docs + Cancel → saveArxml NOT called, project stays open', async () => {
    openProjectInStore();
    useArxmlStore.getState().addDocument(makeDoc(), '/p/A.arxml');
    useArxmlStore.setState({ dirtyPaths: new Set(['/p/A.arxml']) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (globalThis as any).window.autosarApi as MockWindowAutosarApi;
    confirmMock.mockResolvedValue('continue');

    render(<AppHeader {...noopProps} />);
    fireEvent.click(screen.getByTestId('btn-project-close'));

    await vi.waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    expect(api.saveArxml).not.toHaveBeenCalled();
    // Nothing changed — project and documents are still there.
    const s = useArxmlStore.getState();
    expect(s.project).not.toBeNull();
    expect(s.documents).toHaveLength(1);
    expect(s.dirtyPaths.size).toBe(1);
  });

  it('× click with dirty docs + Save + a save failure aborts the close (project stays open)', async () => {
    // The brief said Save means "save all and close". If ANY save
    // fails, the user should NOT lose the project — the partial
    // success leaves dirty state on the failing file, the toast
    // surfaces the error, and the project chip stays visible.
    openProjectInStore();
    useArxmlStore.getState().addDocument(makeDoc(), '/p/A.arxml');
    useArxmlStore.getState().addDocument(makeDoc(), '/p/B.arxml');
    useArxmlStore.setState({ dirtyPaths: new Set(['/p/A.arxml', '/p/B.arxml']) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (globalThis as any).window.autosarApi as MockWindowAutosarApi;
    api.saveArxml
      .mockResolvedValueOnce({ ok: true, value: { canceled: false, path: '/p/A.arxml' } })
      .mockResolvedValueOnce({
        ok: false,
        error: { kind: 'permission-denied', message: 'EACCES' },
      });
    confirmMock.mockResolvedValue('saveAndProceed');

    render(<AppHeader {...noopProps} />);
    fireEvent.click(screen.getByTestId('btn-project-close'));

    await vi.waitFor(() => expect(api.saveArxml).toHaveBeenCalledTimes(2));
    // Project did NOT close — B.arxml is still dirty and the toast
    // is set to the partial-failure message (mirrors Save All
    // semantics so the user can fix the error and try again).
    await vi.waitFor(() => {
      const s = useArxmlStore.getState();
      expect(s.error).not.toBeNull();
      expect(s.error).toContain('1 failed');
    });
    const s = useArxmlStore.getState();
    expect(s.project).not.toBeNull();
    expect(s.documents).toHaveLength(2);
    expect(s.dirtyPaths.has('/p/B.arxml')).toBe(true);
  });
});

describe('AppHeader (v1.11.4 PATCH-B — headless E2E fallback)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
    useArxmlStore.getState().setLocale('en');
  });

  it('renders vdev when window.autosarApi is undefined (headless E2E harness case)', async () => {
    // Closes v1.11.2 P1 (E2E harness gap). The 9 pre-existing E2E specs
    // crash on AppHeader mount when window.autosarApi is undefined
    // because the original code unconditionally called
    // `window.autosarApi.getAppVersion()`. The PATCH-B fix detects the
    // missing API and falls back to 'dev' so headless Vite drives
    // (without Electron's preload) can mount the header and reach
    // the actual test assertions.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = undefined;
    render(<AppHeader {...noopProps} />);
    const ver = await screen.findByText(/^vdev$/);
    expect(ver).toBeInTheDocument();
    expect(ver.className).toContain('app-version');
  });

  it('renders v? when window.autosarApi exists but getAppVersion is missing (production-anomaly signal)', async () => {
    // Defensive fallback for partial-mock or production preload-bridge
    // failure cases (e.g. a future IPC refactor drops the channel,
    // or the preload script throws during Electron startup). Per
    // code-review MEDIUM on v1.11.4 PATCH-B, this is distinct from
    // the headless-E2E case (where autosarApi is entirely undefined
    // and 'dev' is the expected fallback). Showing '?' instead of
    // 'dev' surfaces the anomaly instead of silently masking it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = {
      openArxml: vi.fn(),
      openArxmlMulti: vi.fn(),
      parseArxml: vi.fn(),
      saveArxml: vi.fn(),
    };
    render(<AppHeader {...noopProps} />);
    const ver = await screen.findByText(/^v\?$/);
    expect(ver).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // v1.12.0 PATCH D3 (M2) — rejected IPC promise must also surface `v?`.
  // -------------------------------------------------------------------------
  //
  // The v1.11.4 PATCH-B fix only covered the SYNCHRONOUS failure modes
  // (autosarApi undefined / getAppVersion missing). The much more common
  // production failure — a REJECTED IPC promise (preload bridge failure,
  // race during Electron startup, future IPC refactor that dropped the
  // channel) — was left with no `.catch`, so the UI stayed on the literal
  // `'…'` placeholder forever. This test pins the corrected behaviour.
  it('renders v? when getAppVersion rejects (IPC failure → production-anomaly signal)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = {
      getAppVersion: vi.fn().mockRejectedValue(new Error('IPC channel dropped')),
      openArxml: vi.fn(),
      openArxmlMulti: vi.fn(),
      parseArxml: vi.fn(),
      saveArxml: vi.fn(),
    };
    render(<AppHeader {...noopProps} />);
    const ver = await screen.findByText(/^v\?$/);
    expect(ver).toBeInTheDocument();
  });
});
