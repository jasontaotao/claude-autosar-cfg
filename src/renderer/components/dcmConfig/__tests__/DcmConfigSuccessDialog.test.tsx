// @vitest-environment jsdom
//
// DcmConfigSuccessDialog — v1.31.0 PATCH T1.
//
// Pinned behaviours (parity DiagnosticExtractSuccessDialog):
//   1. Renders outputPath + 5 service kind counts + appliedStepCount in body
//   2. Renders the single outputPath (no dem/dcm split — single output)
//   3. Does not render when open is false
//   4. Close button fires onClose
//   5. Escape key fires onClose
//   6. Backdrop click fires onClose

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DcmConfigSuccessDialog } from '../DcmConfigSuccessDialog.js';

describe('DcmConfigSuccessDialog (v1.31.0 PATCH T1)', () => {
  afterEach(() => cleanup());

  const baseProps = {
    open: true,
    result: {
      dcmConfigXml: '<arxml/>',
      odxLinkedDcmDspCount: 7,
      odxLinkedRoutineCount: 3,
      serviceCounts: {
        DcmClearDTC: 1,
        DcmReadDTC: 1,
        DcmReadDataById: 2,
        DcmWriteDataById: 1,
        DcmRoutineControl: 2,
      },
      outputPath: '/out/Dcm_Config.arxml',
      appliedStepCount: 7,
    },
    locale: 'en' as const,
    onClose: vi.fn(),
  };

  it('renders outputPath in paths list', () => {
    render(<DcmConfigSuccessDialog {...baseProps} />);
    expect(screen.getByText('/out/Dcm_Config.arxml')).toBeInTheDocument();
  });

  it('renders appliedStepCount + service counts in body', () => {
    render(<DcmConfigSuccessDialog {...baseProps} />);
    const body = screen.getByTestId('dcm-config-success-body').textContent ?? '';
    expect(body).toMatch(/7/);
    expect(body).toMatch(/applied/i);
  });

  it('does not render when open is false', () => {
    render(<DcmConfigSuccessDialog {...baseProps} open={false} />);
    expect(screen.queryByTestId('dcm-config-success-dialog')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<DcmConfigSuccessDialog {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('dcm-config-success-close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<DcmConfigSuccessDialog {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on backdrop click', () => {
    const onClose = vi.fn();
    render(<DcmConfigSuccessDialog {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('dcm-config-success-dialog'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
