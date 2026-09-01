// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { ArxmlContainer, ArxmlDocument, ArxmlPackage } from '@core/arxml/types.js';

import { useArxmlStore } from '../../../store/useArxmlStore';
import { Tree } from '../Tree.js';

function makeDoc(): ArxmlDocument {
  const child: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'Child',
    params: {},
    children: [],
  };
  const parent: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'Parent',
    params: {},
    children: [child],
  };
  const module = {
    kind: 'module' as const,
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'EcuC',
    params: {},
    children: [parent],
    references: [],
  };
  const pkg: ArxmlPackage = {
    shortName: 'Can',
    path: '/Can',
    elements: [module],
  };
  return { path: '/Can', version: '4.6', packages: [pkg] };
}

afterEach(cleanup);

describe('Tree — rename expands mapped paths', () => {
  it('keeps descendants expanded when a selected container is renamed', () => {
    const doc = makeDoc();
    useArxmlStore.setState({
      doc,
      displayDoc: doc,
      documents: [doc],
      documentPaths: ['/Can.arxml'],
      activeDocumentPath: '/Can.arxml',
      viewMode: 'single',
      selectedPath: '/Can/EcuC/Parent',
    });

    render(<Tree store={useArxmlStore} />);
    fireEvent.click(screen.getByTestId('chevron-/Can'));
    fireEvent.click(screen.getByTestId('chevron-/Can/EcuC'));
    fireEvent.click(screen.getByTestId('chevron-/Can/EcuC/Parent'));

    expect(screen.getByTestId('treeitem-/Can/EcuC/Parent/Child')).toBeInTheDocument();

    act(() => {
      useArxmlStore.getState().renameContainer('/Can/EcuC/Parent', 'Renamed');
    });

    expect(screen.getByTestId('treeitem-/Can/EcuC/Renamed/Child')).toBeInTheDocument();
    expect(screen.getByTestId('chevron-/Can/EcuC/Renamed')).toBeInTheDocument();
  });
});
