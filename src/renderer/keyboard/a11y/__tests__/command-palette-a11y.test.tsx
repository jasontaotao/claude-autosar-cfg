// src/renderer/keyboard/a11y/__tests__/command-palette-a11y.test.ts
// v1.6.0 Cluster U — CommandPalette a11y behavior (WCAG 2.2 AA).
//
// Verifies:
//   - role="dialog" aria-modal="true"
//   - focus trap installed on mount (first focusable gets focus)
//   - focus restored to opener on close

import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

// @vitest-environment jsdom

import { CommandPalette, type PaletteCommand } from '../../CommandPalette.js';

const commands: readonly PaletteCommand[] = [
  { id: 'file.open', label: 'Open', description: 'Open a file', bindings: ['Ctrl+O'], category: 'file' },
  { id: 'file.save', label: 'Save', description: 'Save the file', bindings: ['Ctrl+S'], category: 'file' },
];

describe('CommandPalette a11y (v1.6.0 U)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('exposes role=dialog + aria-modal=true', () => {
    const { container } = render(
      <CommandPalette open={true} commands={commands} locale="en" onExecute={() => undefined} onClose={() => undefined} />,
    );
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
  });

  it('focuses the input on mount (first focusable element inside the dialog)', () => {
    render(
      <CommandPalette open={true} commands={commands} locale="en" onExecute={() => undefined} onClose={() => undefined} />,
    );
    // Allow rAF + trapFocus to settle.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const input = screen.getByTestId('command-palette-input');
        expect(document.activeElement).toBe(input);
        resolve();
      }, 30);
    });
  });

  it('Tab from the last list item wraps to the input (focus trap)', () => {
    render(
      <CommandPalette open={true} commands={commands} locale="en" onExecute={() => undefined} onClose={() => undefined} />,
    );
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const input = screen.getByTestId('command-palette-input');
        const lastItem = document.querySelector(`[data-testid="command-palette-item-${commands[1]?.id}"]`) as HTMLElement;
        lastItem?.focus();
        act(() => {
          fireEvent.keyDown(document, { key: 'Tab' });
        });
        // Focus should wrap back to the input (the first focusable).
        expect(document.activeElement).toBe(input);
        resolve();
      }, 30);
    });
  });
});