// @vitest-environment jsdom
//
// DiagnosticExtractSuccessDialog — v1.24.0 MINOR T3.
//
// Pinned behaviours (T3 Phase 2 — RED):
//   1. Renders DTC/DID/Routine counts in the success body
//   2. Renders both generated file paths (Dem + Dcm)
//   3. Does not render when `open` is false
//   4. Close button fires `onClose`
//   5. Escape key fires `onClose`
//
// Mirrors the v1.22.0 T2 OdxViewer / v1.21.0 T4 DbcViewer a11y
// pattern: Escape + backdrop-click + initial focus on close.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DiagnosticExtractSuccessDialog } from '../DiagnosticExtractSuccessDialog.js';

describe('DiagnosticExtractSuccessDialog (v1.24.0 T3)', () => {
  afterEach(() => cleanup());

  const baseProps = {
    open: true,
    demPath: '/out/Dem_Extract.arxml',
    dcmPath: '/out/Dcm_Extract.arxml',
    stats: { dtcCount: 99, didCount: 34, routineCount: 4 },
    locale: 'en' as const,
    onClose: vi.fn(),
    onOpenInWorkspace: vi.fn(),
  };

  it('renders counts in success body', () => {
    render(<DiagnosticExtractSuccessDialog {...baseProps} />);
    const body = screen.getByTestId('diag-extract-success-body').textContent ?? '';
    expect(body).toMatch(/99/);
    expect(body).toMatch(/DemEvent/i);
    expect(body).toMatch(/34/);
    expect(body).toMatch(/DID/i);
    expect(body).toMatch(/4/);
    expect(body).toMatch(/Routine/i);
  });

  it('renders both file paths', () => {
    render(<DiagnosticExtractSuccessDialog {...baseProps} />);
    expect(screen.getByText('/out/Dem_Extract.arxml')).toBeInTheDocument();
    expect(screen.getByText('/out/Dcm_Extract.arxml')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(<DiagnosticExtractSuccessDialog {...baseProps} open={false} />);
    expect(screen.queryByTestId('diag-extract-success-dialog')).not.toBeInTheDocument();
  });

  it('renders and calls the open-in-workspace action', () => {
    const onOpenInWorkspace = vi.fn();
    render(
      <DiagnosticExtractSuccessDialog
        {...baseProps}
        onOpenInWorkspace={onOpenInWorkspace}
      />,
    );
    fireEvent.click(screen.getByTestId('diag-extract-open-in-workspace'));
    expect(onOpenInWorkspace).toHaveBeenCalledOnce();
  });
  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<DiagnosticExtractSuccessDialog {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('diag-extract-success-close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<DiagnosticExtractSuccessDialog {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
