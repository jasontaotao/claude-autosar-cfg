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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = makeWindowApi();
  });

  it('renders the slim top bar (40px class, h-10 token) and the app name', () => {
    render(<AppHeader />);
    const header = screen.getByTestId('app-header');
    expect(header).toBeInTheDocument();
    expect(header.className).toContain('app-header');
    expect(screen.getByText(/claude-AutosarCfg/)).toBeInTheDocument();
  });

  it('renders the app version on the right side, dim and monospace', async () => {
    render(<AppHeader />);
    const ver = await screen.findByText(/^v0\.9\.5$/);
    expect(ver).toBeInTheDocument();
    expect(ver.className).toContain('app-version');
  });

  it('does not show a doc name when no doc is loaded', () => {
    render(<AppHeader />);
    expect(screen.queryByTestId(/^app-doc-name|chevron-/)).toBeNull();
    expect(screen.queryByText(/^AUTOSAR 4\./)).toBeNull();
  });

  it('shows only the file basename (not the full Windows path) when a doc is loaded', () => {
    useArxmlStore
      .getState()
      .setDoc(makeDoc(), 'C:/some/path/AUTOSAR_MOD_ECUConfigurationParameters.arxml');
    render(<AppHeader />);
    // The doc-name span in app-header-left carries the basename (Sprint 9 #5).
    // Sprint 10 #2 added the doc-tab strip which also shows the basename —
    // disambiguate via the data-testid.
    const docName = screen.getByTestId('app-doc-name');
    expect(docName).toBeInTheDocument();
    expect(docName.getAttribute('title')).toBe(
      'C:/some/path/AUTOSAR_MOD_ECUConfigurationParameters.arxml',
    );
    expect(docName.textContent).toContain('AUTOSAR_MOD_ECUConfigurationParameters.arxml');
    expect(docName.textContent).not.toContain('C:/some/path/');
  });

  it('renders the AUTOSAR document version after a doc is loaded', () => {
    useArxmlStore.getState().setDoc(makeDoc(), '/p/x.arxml');
    render(<AppHeader />);
    expect(screen.getByText(/^AUTOSAR 4\.2$/)).toBeInTheDocument();
  });

  it('Save button is disabled when doc is clean; enabled + has dirty class when dirty', () => {
    useArxmlStore.getState().setDoc(makeDoc(), '/p/x.arxml');
    const { rerender } = render(<AppHeader />);
    const save = screen.getByTestId('btn-save');
    expect(save).toBeDisabled();
    expect(save.className).not.toContain('is-dirty');

    useArxmlStore.setState({ dirtyPaths: new Set(['/p/x.arxml']) });
    rerender(<AppHeader />);
    const save2 = screen.getByTestId('btn-save');
    expect(save2).not.toBeDisabled();
    expect(save2.className).toContain('is-dirty');
    expect(save2.textContent).toMatch(/Save/);
  });

  it('Open click triggers autosarApi.openArxmlMulti (Sprint 10 #2: multi-file channel)', () => {
    const api = makeWindowApi();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = api;
    render(<AppHeader />);
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
    render(<AppHeader />);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = makeWindowApi();
  });

  it('does not render the doc-tab strip when no docs are loaded', () => {
    render(<AppHeader />);
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('renders one tab per loaded doc, basename only, with the active highlighted', () => {
    useArxmlStore.getState().addDocument(makeDoc(), 'C:/path/Com.arxml');
    useArxmlStore.getState().addDocument(makeDoc(), 'C:/path/PduR.arxml');
    useArxmlStore.getState().setActiveDocument('C:/path/Com.arxml');

    render(<AppHeader />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    // Basenames (use role=tab to disambiguate from the doc-name span in app-header-left)
    const comTab = screen.getByRole('tab', { name: 'Com.arxml' });
    const pduRTab = screen.getByRole('tab', { name: 'PduR.arxml' });
    expect(comTab).toBeInTheDocument();
    expect(pduRTab).toBeInTheDocument();
    // Active highlight: the wrapper div carries the is-active class, the
    // button (which is the role=tab element) carries aria-selected.
    expect(comTab.getAttribute('aria-selected')).toBe('true');
    expect(pduRTab.getAttribute('aria-selected')).toBe('false');
    const activeWrapper = screen.getByTestId('doc-tab-C:/path/Com.arxml');
    expect(activeWrapper.className).toContain('is-active');
    const inactiveWrapper = screen.getByTestId('doc-tab-C:/path/PduR.arxml');
    expect(inactiveWrapper.className).not.toContain('is-active');
  });

  it('clicking a non-active tab switches the active document', () => {
    useArxmlStore.getState().addDocument(makeDoc(), 'C:/path/Com.arxml');
    useArxmlStore.getState().addDocument(makeDoc(), 'C:/path/PduR.arxml');
    useArxmlStore.getState().setActiveDocument('C:/path/Com.arxml');

    render(<AppHeader />);
    fireEvent.click(screen.getByRole('tab', { name: 'PduR.arxml' }));
    expect(useArxmlStore.getState().activeDocumentPath).toBe('C:/path/PduR.arxml');
  });

  it('clicking the × button on a tab removes the document', () => {
    useArxmlStore.getState().addDocument(makeDoc(), 'C:/path/Com.arxml');
    useArxmlStore.getState().addDocument(makeDoc(), 'C:/path/PduR.arxml');
    useArxmlStore.getState().setActiveDocument('C:/path/Com.arxml');

    render(<AppHeader />);
    const closeBtn = screen.getByTestId('doc-tab-close-C:/path/PduR.arxml');
    fireEvent.click(closeBtn);
    // Com.arxml remains, PduR.arxml removed
    const next = useArxmlStore.getState();
    expect(next.documentPaths).toEqual(['C:/path/Com.arxml']);
    expect(next.activeDocumentPath).toBe('C:/path/Com.arxml');
  });

  it('removing the active doc promotes the first remaining (or null if last)', () => {
    useArxmlStore.getState().addDocument(makeDoc(), 'C:/path/Com.arxml');
    useArxmlStore.getState().addDocument(makeDoc(), 'C:/path/PduR.arxml');
    // active is PduR.arxml (the last added)
    expect(useArxmlStore.getState().activeDocumentPath).toBe('C:/path/PduR.arxml');

    render(<AppHeader />);
    fireEvent.click(screen.getByTestId('doc-tab-close-C:/path/PduR.arxml'));
    const next = useArxmlStore.getState();
    expect(next.documentPaths).toEqual(['C:/path/Com.arxml']);
    // First remaining becomes active
    expect(next.activeDocumentPath).toBe('C:/path/Com.arxml');
  });
});
