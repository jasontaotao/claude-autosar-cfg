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

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { AppHeader } from '../AppHeader.js';

// Sprint 14 / Task 11 — AppHeader now requires the ECUC-picker props.
// Most of the legacy suite doesn't care about the picker (they test
// the file/project menu); we provide a no-op pair here so the existing
// assertions stay green. The picker-specific behavior is covered by
// the new T11 menu-entry tests in the third describe block below.
const noopProps = {
  onEcucModuleSelect: (): void => {},
  canSelectEcucModule: false,
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
