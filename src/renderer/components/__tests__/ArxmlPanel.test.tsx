// @vitest-environment jsdom
//
// ArxmlPanel (Sprint 9 #5): was a bulky "ARXML I/O" card with Open / Save
// buttons and a doc summary. After the UI refactor it is just a slim
// status footer showing package / element / version counts. These tests
// lock:
//   1. renders nothing when no doc is loaded
//   2. shows the summary line when a doc is loaded
//   3. counts nested packages and elements (EB tresos BSWMD shape)

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ArxmlDocument } from '@core/arxml/types.js';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { ArxmlPanel } from '../ArxmlPanel.js';

describe('ArxmlPanel status footer (Sprint 9 #5)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
    // Sprint 11 Phase 1 (Option A) — tests assert on English labels.
    useArxmlStore.getState().setLocale('en');
  });

  it('renders nothing when no doc is loaded', () => {
    const { container } = render(<ArxmlPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the summary line when a doc is loaded', () => {
    const doc: ArxmlDocument = {
      path: '/x.arxml',
      version: '4.2',
      packages: [
        {
          shortName: 'EcucDefs',
          path: '/EcucDefs',
          elements: [
            {
              kind: 'module',
              tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
              shortName: 'Adc',
              params: {},
              children: [],
              references: [],
            },
            {
              kind: 'module',
              tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
              shortName: 'Can',
              params: {},
              children: [],
              references: [],
            },
          ],
        },
      ],
    };
    useArxmlStore.getState().setDoc(doc, '/x.arxml');
    render(<ArxmlPanel />);
    const footer = screen.getByTestId('status-footer');
    expect(footer).toBeInTheDocument();
    expect(footer.textContent).toMatch(/Packages:\s*1/);
    expect(footer.textContent).toMatch(/Elements:\s*2/);
    expect(footer.textContent).toMatch(/AUTOSAR\s*4\.2/);
  });

  it('counts nested packages and elements (EB tresos BSWMD shape)', () => {
    const doc: ArxmlDocument = {
      path: '/x.arxml',
      version: '4.2',
      packages: [
        {
          shortName: 'AUTOSAR',
          path: '/AUTOSAR',
          elements: [],
          packages: [
            {
              shortName: 'EcucDefs',
              path: '/AUTOSAR/EcucDefs',
              elements: [
                {
                  kind: 'module',
                  tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                  shortName: 'Adc',
                  params: {},
                  children: [],
                  references: [],
                },
                {
                  kind: 'module',
                  tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                  shortName: 'Can',
                  params: {},
                  children: [],
                  references: [],
                },
              ],
            },
            {
              shortName: 'LifeCycleInfoSets',
              path: '/AUTOSAR/LifeCycleInfoSets',
              elements: [],
            },
          ],
        },
      ],
    };
    useArxmlStore.getState().setDoc(doc, '/x.arxml');
    render(<ArxmlPanel />);
    const footer = screen.getByTestId('status-footer');
    // 3 packages total (AUTOSAR + EcucDefs + LifeCycleInfoSets)
    expect(footer.textContent).toMatch(/Packages:\s*3/);
    // 2 elements (both in EcucDefs, Adc + Can)
    expect(footer.textContent).toMatch(/Elements:\s*2/);
  });

  it('shows the "unsaved changes" hint when the store dirty flag is set', () => {
    useArxmlStore.getState().setDoc(
      {
        path: '/x.arxml',
        version: '4.6',
        packages: [],
      },
      '/x.arxml',
    );
    useArxmlStore.setState({ dirtyPaths: new Set(['/x.arxml']) });
    render(<ArxmlPanel />);
    expect(screen.getByText(/unsaved changes/)).toBeInTheDocument();
  });
});
