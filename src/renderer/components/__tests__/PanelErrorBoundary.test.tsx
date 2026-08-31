// @vitest-environment jsdom
// P2 (spec §4.1) — PanelErrorBoundary: reusable in-panel error boundary.
// Fault injection stays inside the panel card; retry remounts; copy
// details writes message + stack; Close only renders when wired.
import { fireEvent, render, screen } from '@testing-library/react';
import { Component, type JSX, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PanelErrorBoundary } from '../PanelErrorBoundary.js';

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
afterEach(() => {
  consoleErrorSpy.mockClear();
});

class Bomb extends Component<{ shouldThrow: boolean }, object> {
  override render(): ReactNode {
    if (this.props.shouldThrow) throw new Error('boom: panel fault');
    return <div data-testid="panel-content">ok</div>;
  }
}

function Harness({
  shouldThrow,
  onClose,
}: {
  shouldThrow: boolean;
  onClose?: () => void;
}): JSX.Element {
  return (
    <PanelErrorBoundary panel="tree" locale="en" onClose={onClose}>
      <Bomb shouldThrow={shouldThrow} />
    </PanelErrorBoundary>
  );
}

describe('PanelErrorBoundary', () => {
  it('renders children transparently when no error', () => {
    render(<Harness shouldThrow={false} />);
    expect(screen.getByTestId('panel-content')).toBeInTheDocument();
  });

  it('renders the in-panel error card when a child throws', () => {
    render(<Harness shouldThrow />);
    const card = screen.getByTestId('panel-error-tree');
    expect(card).toHaveAttribute('role', 'alert');
    expect(card).toHaveTextContent('Panel error');
    expect(card).toHaveTextContent('boom: panel fault');
    expect(screen.queryByTestId('panel-content')).toBeNull();
  });

  it('Retry re-mounts children after they stop throwing', () => {
    const { rerender } = render(<Harness shouldThrow />);
    expect(screen.getByTestId('panel-error-tree')).toBeInTheDocument();
    rerender(<Harness shouldThrow={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByTestId('panel-content')).toBeInTheDocument();
    expect(screen.queryByTestId('panel-error-tree')).toBeNull();
  });

  it('Copy details writes message + stack to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(<Harness shouldThrow />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy details' }));
    await vi.waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('boom: panel fault')),
    );
  });

  it('renders Close only when onClose is provided and wires it', () => {
    const onClose = vi.fn();
    render(<Harness shouldThrow onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
