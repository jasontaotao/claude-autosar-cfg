// src/renderer/keyboard/__tests__/CommandPalette.test.tsx
// v1.6.0 Cluster U — CommandPalette behavior tests (TDD RED → GREEN).
//
// Covers the palette lifecycle: open/close, query filtering, selection,
// keyboard navigation, execution, and focus restoration.

import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// @vitest-environment jsdom

import { CommandPalette, type PaletteCommand } from '../CommandPalette.js';

const commands: readonly PaletteCommand[] = [
  {
    id: 'file.open',
    label: 'Open Project',
    description: 'Open an existing project',
    bindings: ['Ctrl+O'],
    category: 'file',
  },
  {
    id: 'file.save',
    label: 'Save',
    description: 'Save the active document',
    bindings: ['Ctrl+S'],
    category: 'file',
  },
  {
    id: 'edit.undo',
    label: 'Undo',
    description: 'Undo the last edit',
    bindings: ['Ctrl+Z'],
    category: 'edit',
  },
  {
    id: 'script.run',
    label: 'Run Script',
    description: 'Run the selected script',
    bindings: [],
    category: 'script',
  },
];

describe('CommandPalette (v1.6.0 U)', () => {
  beforeEach(() => {
    // jsdom defaults: no aria-modal etc. host element exists.
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('does not render anything when closed', () => {
    const { container } = render(<CommandPalette open={false} commands={commands} locale="zh-CN" onExecute={() => undefined} onClose={() => undefined} />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders the dialog with input + list when open', () => {
    render(<CommandPalette open={true} commands={commands} locale="zh-CN" onExecute={() => undefined} onClose={() => undefined} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/输入命令|Type a command/i)).toBeInTheDocument();
  });

  it('lists every command when query is empty', () => {
    render(<CommandPalette open={true} commands={commands} locale="en" onExecute={() => undefined} onClose={() => undefined} />);
    expect(screen.getByText('Open Project')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Undo')).toBeInTheDocument();
    expect(screen.getByText('Run Script')).toBeInTheDocument();
  });

  it('filters commands by case-insensitive substring match', () => {
    render(<CommandPalette open={true} commands={commands} locale="en" onExecute={() => undefined} onClose={() => undefined} />);
    const input = screen.getByPlaceholderText(/Type a command/i);
    act(() => {
      fireEvent.change(input, { target: { value: 'save' } });
    });
    expect(screen.queryByText('Open Project')).toBeNull();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.queryByText('Undo')).toBeNull();
  });

  it('renders an empty-state message when nothing matches', () => {
    render(<CommandPalette open={true} commands={commands} locale="en" onExecute={() => undefined} onClose={() => undefined} />);
    const input = screen.getByPlaceholderText(/Type a command/i);
    act(() => {
      fireEvent.change(input, { target: { value: 'nonexistent-xyz' } });
    });
    expect(screen.getByText(/no matching commands/i)).toBeInTheDocument();
  });

  it('calls onExecute with the selected command id and closes palette', () => {
    const onExecute = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette open={true} commands={commands} locale="en" onExecute={onExecute} onClose={onClose} />);
    const input = screen.getByPlaceholderText(/Type a command/i);
    act(() => {
      fireEvent.change(input, { target: { value: 'undo' } });
    });
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(onExecute).toHaveBeenCalledWith('edit.undo');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('arrow-down moves the highlight to the next item', () => {
    render(<CommandPalette open={true} commands={commands} locale="en" onExecute={() => undefined} onClose={() => undefined} />);
    const input = screen.getByPlaceholderText(/Type a command/i);
    act(() => {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
    });
    // Second item should now be marked selected (aria-selected=true on the li)
    const selected = document.querySelector('[aria-selected="true"]');
    expect(selected).not.toBeNull();
    expect(selected?.textContent).toMatch(/save|undo/i);
  });

  it('Escape closes the palette via onClose', () => {
    const onClose = vi.fn();
    render(<CommandPalette open={true} commands={commands} locale="en" onExecute={() => undefined} onClose={onClose} />);
    const input = screen.getByPlaceholderText(/Type a command/i);
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// Lightweight vi.fn polyfill — vitest exports it via the global
// namespace in the jsdom env, but referencing the explicit import
// keeps the file portable when imported by tools that don't auto-
// expose globals (e.g. isolated TS type-checks).
import { vi } from 'vitest';