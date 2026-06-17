// @vitest-environment jsdom
//
// ErrorBanner tests (Sprint 13+) — replaces the previous inline
// `app-header-error` span that was max-width 30vw with ellipsis. The
// banner now sits below AppHeader, gets full viewport width, supports
// multiline content, and exposes a "view" affordance that opens a
// dedicated modal for the "view 窗口" the user explicitly asked for.
//
// Coverage:
//   1. banner is hidden when store.error is null (no chrome when no error)
//   2. banner renders store.error with full content (no ellipsis)
//   3. dismiss button clears the store error
//   4. copy button calls navigator.clipboard.writeText
//   5. "View" button appears for long errors and opens <ErrorViewerModal />
//   6. message click also opens the modal (any clickable surface)
//   7. modal closes via × / Escape / backdrop; dismissAll clears store

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { ErrorBanner } from '../ErrorBanner.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

// jsdom doesn't ship a clipboard implementation. Stub it so the
// copy button doesn't throw — the banner's try/catch already swallows
// failures but we want to assert the call happened.
let writeTextSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeTextSpy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText: writeTextSpy },
    configurable: true,
  });
  useArxmlStore.getState().clear();
  useArxmlStore.getState().setLocale('en');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ErrorBanner (Sprint 13+)', () => {
  it('renders nothing when store.error is null', () => {
    const { container } = render(<ErrorBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders store.error with full content (no clipping)', () => {
    const longMsg = 'line1\nline2\nline3\nline4\nline5';
    useArxmlStore.getState().setError(longMsg);
    render(<ErrorBanner />);
    const banner = screen.getByTestId('error-banner');
    expect(banner).toBeInTheDocument();
    // All five lines preserved — the inline span would have shown only line1.
    for (const line of longMsg.split('\n')) {
      expect(banner.textContent).toContain(line);
    }
  });

  it('dismiss button clears the store error', () => {
    useArxmlStore.getState().setError('transient failure');
    render(<ErrorBanner />);
    fireEvent.click(screen.getByTestId('error-banner-dismiss'));
    expect(useArxmlStore.getState().error).toBeNull();
    expect(screen.queryByTestId('error-banner')).toBeNull();
  });

  it('copy button writes the full message to clipboard', () => {
    useArxmlStore.getState().setError('copy me please');
    render(<ErrorBanner />);
    fireEvent.click(screen.getByTestId('error-banner-copy'));
    expect(writeTextSpy).toHaveBeenCalledWith('copy me please');
  });

  it('does not render the "view" button for short errors', () => {
    useArxmlStore.getState().setError('short');
    render(<ErrorBanner />);
    expect(screen.queryByTestId('error-banner-view')).toBeNull();
  });

  it('renders the "view" button for long errors and opens the modal on click', async () => {
    const longMsg = 'x'.repeat(400); // > 280 char threshold
    useArxmlStore.getState().setError(longMsg);
    render(<ErrorBanner />);
    fireEvent.click(screen.getByTestId('error-banner-view'));
    // ErrorViewerModal mounts into document.body via portal.
    await waitFor(() => {
      expect(screen.getByTestId('error-viewer-overlay')).toBeInTheDocument();
    });
    expect(screen.getByTestId('error-viewer-body').textContent).toContain(longMsg);
  });

  it('clicking the message body opens the viewer modal too', async () => {
    useArxmlStore.getState().setError('any content');
    render(<ErrorBanner />);
    fireEvent.click(screen.getByTestId('error-banner-message'));
    await waitFor(() => {
      expect(screen.getByTestId('error-viewer-overlay')).toBeInTheDocument();
    });
  });

  it('modal × button closes the viewer without clearing store error', async () => {
    useArxmlStore.getState().setError('modal close');
    render(<ErrorBanner />);
    fireEvent.click(screen.getByTestId('error-banner-message'));
    await waitFor(() => {
      expect(screen.getByTestId('error-viewer-overlay')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('error-viewer-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('error-viewer-overlay')).toBeNull();
    });
    // Banner still visible — closing the viewer only collapses the modal.
    expect(screen.getByTestId('error-banner')).toBeInTheDocument();
    expect(useArxmlStore.getState().error).toBe('modal close');
  });

  it('modal "Dismiss & clear" button closes viewer and clears store', async () => {
    useArxmlStore.getState().setError('dismiss me');
    render(<ErrorBanner />);
    fireEvent.click(screen.getByTestId('error-banner-message'));
    await waitFor(() => {
      expect(screen.getByTestId('error-viewer-overlay')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('error-viewer-dismiss'));
    await waitFor(() => {
      expect(screen.queryByTestId('error-viewer-overlay')).toBeNull();
    });
    expect(useArxmlStore.getState().error).toBeNull();
  });

  it('Escape key closes the viewer', async () => {
    useArxmlStore.getState().setError('esc close');
    render(<ErrorBanner />);
    fireEvent.click(screen.getByTestId('error-banner-message'));
    await waitFor(() => {
      expect(screen.getByTestId('error-viewer-overlay')).toBeInTheDocument();
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('error-viewer-overlay')).toBeNull();
    });
  });

  it('modal copy button writes the message', async () => {
    useArxmlStore.getState().setError('modal copy me');
    render(<ErrorBanner />);
    fireEvent.click(screen.getByTestId('error-banner-message'));
    await waitFor(() => {
      expect(screen.getByTestId('error-viewer-overlay')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('error-viewer-copy'));
    expect(writeTextSpy).toHaveBeenCalledWith('modal copy me');
  });
});
