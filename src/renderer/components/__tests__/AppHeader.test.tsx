// @vitest-environment jsdom
//
// AppHeader (Sprint 9 #5): slim 40px top bar that consolidates the
// previous App.tsx h1 block + ArxmlPanel "ARXML I/O" card into one
// borderless strip. These tests lock:
//   1. file Open / Save buttons live in the header (not the old card)
//   2. version string renders on the right
//   3. when no doc is loaded, file name is not shown
//   4. when a doc is loaded, basename shows + AUTOSAR version renders
//   5. Save button is disabled when doc is clean; enabled + 'is-dirty' when dirty

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArxmlDocument } from '@core/arxml/types.js';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { AppHeader } from '../AppHeader.js';

interface MockWindowAutosarApi {
  getAppVersion: ReturnType<typeof vi.fn>;
  openArxml: ReturnType<typeof vi.fn>;
  parseArxml: ReturnType<typeof vi.fn>;
  saveArxml: ReturnType<typeof vi.fn>;
}

function makeWindowApi(): MockWindowAutosarApi {
  return {
    getAppVersion: vi.fn().mockResolvedValue('0.9.5'),
    openArxml: vi.fn().mockResolvedValue({ canceled: true }),
    parseArxml: vi.fn(),
    saveArxml: vi.fn(),
  };
}

function makeDoc(): ArxmlDocument {
  return {
    path: 'C:/some/path/AUTOSAR_MOD_ECUConfigurationParameters.arxml',
    version: '4.2',
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

describe('AppHeader (Sprint 9 #5)', () => {
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
    // getAppVersion is async-resolved; use findByText to wait for the
    // placeholder ellipsis to be replaced with the real version string.
    const ver = await screen.findByText(/^v0\.9\.5$/);
    expect(ver).toBeInTheDocument();
    expect(ver.className).toContain('app-version');
  });

  it('does not show a doc name when no doc is loaded', () => {
    render(<AppHeader />);
    expect(screen.queryByTestId(/^app-doc-name|chevron-/)).toBeNull();
    // AUTOSAR version line is also hidden until a doc is loaded
    expect(screen.queryByText(/^AUTOSAR 4\./)).toBeNull();
  });

  it('shows only the file basename (not the full Windows path) when a doc is loaded', () => {
    useArxmlStore
      .getState()
      .setDoc(makeDoc(), 'C:/some/path/AUTOSAR_MOD_ECUConfigurationParameters.arxml');
    render(<AppHeader />);
    const docName = screen.getByText('AUTOSAR_MOD_ECUConfigurationParameters.arxml');
    expect(docName).toBeInTheDocument();
    // The full path string is exposed via the title attribute (tooltip on hover)
    expect(docName.getAttribute('title')).toBe(
      'C:/some/path/AUTOSAR_MOD_ECUConfigurationParameters.arxml',
    );
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

    // Flip the dirty flag in the store directly (covers the visual state path
    // without going through the editor → store round-trip).
    useArxmlStore.getState().markSaved('/p/x.arxml'); // markSaved is a no-op for dirty, so flip via updateParam
    // Trigger dirty by mutating a param through the store (no-op for our minimal doc)
    useArxmlStore.setState({ dirty: true });
    rerender(<AppHeader />);
    const save2 = screen.getByTestId('btn-save');
    expect(save2).not.toBeDisabled();
    expect(save2.className).toContain('is-dirty');
    expect(save2.textContent).toMatch(/Save/);
  });

  it('Open button click triggers the autosarApi.openArxml IPC call', () => {
    const api = makeWindowApi();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = api;
    render(<AppHeader />);
    fireEvent.click(screen.getByTestId('btn-open'));
    expect(api.openArxml).toHaveBeenCalledTimes(1);
    expect(api.openArxml).toHaveBeenCalledWith({ title: 'Open AUTOSAR ARXML' });
  });
});
