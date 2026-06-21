// src/renderer/keyboard/__tests__/CheatSheet.test.tsx
// v1.6.0 Cluster U — CheatSheet rendering tests (TDD).

import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// @vitest-environment jsdom

import { CheatSheet, type CheatSheetSection } from '../CheatSheet.js';

const sections: readonly CheatSheetSection[] = [
  {
    category: 'file',
    categoryLabelKey: 'shortcut.category.file',
    items: [
      { commandId: 'file.open', label: 'Open Project', bindingsDisplay: ['Ctrl+O'] },
      { commandId: 'file.save', label: 'Save', bindingsDisplay: ['Ctrl+S'] },
    ],
  },
  {
    category: 'edit',
    categoryLabelKey: 'shortcut.category.edit',
    items: [{ commandId: 'edit.undo', label: 'Undo', bindingsDisplay: ['Ctrl+Z'] }],
  },
];

describe('CheatSheet (v1.6.0 U)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('does not render when closed', () => {
    const { container } = render(
      <CheatSheet open={false} sections={sections} locale="en" onClose={() => undefined} />,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders every section heading and item when open', () => {
    render(<CheatSheet open={true} sections={sections} locale="en" onClose={() => undefined} />);
    expect(screen.getByText('Open Project')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Undo')).toBeInTheDocument();
    // Category headings (via t(en, 'shortcut.category.*'))
    expect(screen.getByText('File')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('closes when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<CheatSheet open={true} sections={sections} locale="en" onClose={onClose} />);
    act(() => {
      fireEvent.click(screen.getByTestId('cheat-sheet-close'));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('filters items by the search input', () => {
    render(<CheatSheet open={true} sections={sections} locale="en" onClose={() => undefined} />);
    const input = screen.getByTestId('cheat-sheet-search');
    act(() => {
      fireEvent.change(input, { target: { value: 'save' } });
    });
    expect(screen.queryByText('Open Project')).toBeNull();
    expect(screen.getByText('Save')).toBeInTheDocument();
  });
});
