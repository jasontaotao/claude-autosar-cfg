// @vitest-environment jsdom
// P2 (spec §9.13) — fault injection: the wrapped OdxViewer degrades to
// its in-modal error card; the card Close exits the dialog via onClose.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OdxViewer } from '../OdxViewer.js';

vi.mock('../OdxViewerInner.js', () => ({
  OdxViewerInner: () => {
    throw new Error('boom: odx viewer fault');
  },
}));

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
afterEach(() => {
  cleanup();
  consoleErrorSpy.mockClear();
});

describe('OdxViewer local error boundary (P2 fault injection)', () => {
  it('throwing viewer content degrades to panel-error-odx-viewer with working Close', () => {
    const onClose = vi.fn();
    render(
      <OdxViewer
        open
        path="/x.odx"
        summary={null}
        locale="en"
        onClose={onClose}
        onExport={(): void => undefined}
        exporting={false}
      />,
    );
    const card = screen.getByTestId('panel-error-odx-viewer');
    expect(card).toHaveTextContent('boom: odx viewer fault');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
