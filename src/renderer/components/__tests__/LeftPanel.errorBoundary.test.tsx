// @vitest-environment jsdom
// P2 (spec §9.13) — fault injection: a throwing Tree / ValidationPanel
// must degrade to its in-panel error card without taking down siblings.
// Reality notes (ledger R1): Tree is mounted below the tab bar (always
// visible); ValidationPanel lives in the "validate" tab.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LeftPanel } from '../LeftPanel.js';

vi.mock('../tree/Tree.js', () => ({
  Tree: () => {
    throw new Error('boom: tree fault');
  },
}));
vi.mock('../ValidationPanel.js', () => ({
  ValidationPanel: () => {
    throw new Error('boom: validation fault');
  },
}));

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
afterEach(() => {
  cleanup();
  consoleErrorSpy.mockClear();
});

function renderPanel(): void {
  render(<LeftPanel />);
}

describe('LeftPanel local error boundaries (P2 fault injection)', () => {
  it('throwing Tree degrades to panel-error-tree; tab bar survives', () => {
    renderPanel();
    expect(screen.getByTestId('panel-error-tree')).toHaveTextContent('boom: tree fault');
    expect(screen.getByTestId('left-tab-validate')).toBeInTheDocument();
  });

  it('throwing ValidationPanel degrades to panel-error-validation-panel; Tree survives', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('left-tab-validate'));
    expect(screen.getByTestId('panel-error-validation-panel')).toHaveTextContent(
      'boom: validation fault',
    );
    expect(document.querySelector('.left-panel-tree')).not.toBeNull();
  });
});
