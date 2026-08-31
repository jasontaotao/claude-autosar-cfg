// @vitest-environment jsdom
// P2 (spec §9.13) — fault injection: the wrapped DbcViewer degrades to
// its in-modal error card; the card Close exits the dialog via onClose.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DbcViewer } from '../DbcViewer.js';

vi.mock('../DbcViewerInner.js', () => ({
  DbcViewerInner: () => {
    throw new Error('boom: dbc viewer fault');
  },
}));

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
afterEach(() => {
  cleanup();
  consoleErrorSpy.mockClear();
});

describe('DbcViewer local error boundary (P2 fault injection)', () => {
  it('throwing viewer content degrades to panel-error-dbc-viewer with working Close', () => {
    const onClose = vi.fn();
    render(<DbcViewer open path="/x.dbc" summary={null} locale="en" onClose={onClose} />);
    const card = screen.getByTestId('panel-error-dbc-viewer');
    expect(card).toHaveTextContent('boom: dbc viewer fault');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
