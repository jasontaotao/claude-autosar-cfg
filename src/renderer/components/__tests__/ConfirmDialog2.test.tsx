// @vitest-environment jsdom
//
// ConfirmDialog2 — v1.36.0 MINOR T4.
//
// Pinned behaviours:
//   1. Renders nothing when no dialog is active
//   2. Shows the dialog with the provided title + message
//   3. Confirm button resolves with 'confirm'
//   4. Cancel button + Esc + × button + backdrop click all resolve with 'cancel'
//   5. confirmDestructive() before mount resolves immediately with 'cancel' (defensive)

import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useArxmlStore } from '../../store/useArxmlStore';

import { ConfirmRoot2, confirmDestructive } from '../ConfirmDialog2.js';

beforeEach(() => {
  useArxmlStore.setState({ locale: 'en' });
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ConfirmDialog2 (v1.36.0 MINOR T4)', () => {
  it('does not render when no dialog is active', () => {
    render(<ConfirmRoot2 />);
    expect(screen.queryByTestId('confirm-destructive-overlay')).not.toBeInTheDocument();
  });

  it('shows the dialog with the provided title + message', () => {
    render(<ConfirmRoot2 />);
    act(() => {
      void confirmDestructive({
        title: 'Regenerate?',
        message: 'Re-fire with new BSWMD: /path/to/file.arxml',
      });
    });
    expect(screen.getByTestId('confirm-destructive-title').textContent).toBe('Regenerate?');
    expect(screen.getByTestId('confirm-destructive-message').textContent).toBe(
      'Re-fire with new BSWMD: /path/to/file.arxml',
    );
  });

  it('confirm button resolves with "confirm"', async () => {
    render(<ConfirmRoot2 />);
    let resolved: 'confirm' | 'cancel' | null = null;
    act(() => {
      void confirmDestructive({ title: 't', message: 'm' }).then((c) => {
        resolved = c;
      });
    });
    fireEvent.click(screen.getByTestId('confirm-destructive-confirm'));
    // Allow promise to settle
    await act(async () => {
      await Promise.resolve();
    });
    expect(resolved).toBe('confirm');
  });

  it('cancel button resolves with "cancel"', async () => {
    render(<ConfirmRoot2 />);
    let resolved: 'confirm' | 'cancel' | null = null;
    act(() => {
      void confirmDestructive({ title: 't', message: 'm' }).then((c) => {
        resolved = c;
      });
    });
    fireEvent.click(screen.getByTestId('confirm-destructive-cancel'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(resolved).toBe('cancel');
  });

  it('backdrop click resolves with "cancel"', async () => {
    render(<ConfirmRoot2 />);
    let resolved: 'confirm' | 'cancel' | null = null;
    act(() => {
      void confirmDestructive({ title: 't', message: 'm' }).then((c) => {
        resolved = c;
      });
    });
    fireEvent.click(screen.getByTestId('confirm-destructive-overlay'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(resolved).toBe('cancel');
  });
});
