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

  // v1.31.1 PATCH — close-button label is i18n'd (was hardcoded "Close").
  it.each(['en', 'zh-CN'] as const)('renders localized close label for locale %s', (locale) => {
    render(<DcmConfigSuccessDialog {...baseProps} locale={locale} />);
    const close = screen.getByTestId('dcm-config-success-close');
    const expected = locale === 'en' ? 'Close' : '关闭';
    expect(close.textContent).toBe(expected);
  });

  // v1.32.0 MINOR T7 — autofill label renders when handler echoed bswmdPath.
  it('renders autofill label when bswmdPath is set (en)', () => {
    render(
      <DcmConfigSuccessDialog
        {...baseProps}
        locale="en"
        result={{
          ...baseProps.result,
          bswmdPath: '/proj/samples/arxml/demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml',
        }}
      />,
    );
    expect(screen.getByTestId('dcm-config-success-bswmd-autofill')).toBeInTheDocument();
    expect(screen.getByText('Auto-selected from project manifest')).toBeInTheDocument();
    expect(
      screen.getByText('/proj/samples/arxml/demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml'),
    ).toBeInTheDocument();
  });

  it('renders autofill label when bswmdPath is set (zh-CN)', () => {
    render(
      <DcmConfigSuccessDialog
        {...baseProps}
        locale="zh-CN"
        result={{
          ...baseProps.result,
          bswmdPath: '/proj/samples/arxml/demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml',
        }}
      />,
    );
    expect(screen.getByTestId('dcm-config-success-bswmd-autofill')).toBeInTheDocument();
    expect(screen.getByText('已从项目清单自动选择')).toBeInTheDocument();
    expect(
      screen.getByText('/proj/samples/arxml/demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml'),
    ).toBeInTheDocument();
  });

  it('does not render autofill label when bswmdPath is absent', () => {
    render(<DcmConfigSuccessDialog {...baseProps} />);
    expect(screen.queryByTestId('dcm-config-success-bswmd-autofill')).not.toBeInTheDocument();
  });

  // v1.32.1 PATCH P3 — Override <details> shell consumes the
  // 'dcmConfig.bswmdPath.override' i18n key (previously unused).
  it.each([
    { locale: 'en' as const, expected: 'Override BSWMD path' },
    { locale: 'zh-CN' as const, expected: '覆盖 BSWMD 路径' },
  ])('renders Override summary label for locale $locale', ({ locale, expected }) => {
    render(
      <DcmConfigSuccessDialog
        {...baseProps}
        locale={locale}
        result={{ ...baseProps.result, bswmdPath: '/proj/bswmd/Dcm.arxml' }}
      />,
    );
    const override = screen.getByTestId('dcm-config-success-bswmd-override');
    expect(override).toBeInTheDocument();
    expect(override.querySelector('summary')?.textContent).toBe(expected);
  });

  it('Override <details> defaults to collapsed (no input visible)', () => {
    render(
      <DcmConfigSuccessDialog
        {...baseProps}
        result={{ ...baseProps.result, bswmdPath: '/proj/bswmd/Dcm.arxml' }}
      />,
    );
    const override = screen.getByTestId('dcm-config-success-bswmd-override') as HTMLDetailsElement;
    // Native <details> is collapsed by default — input is in the DOM but hidden.
    expect(override.open).toBe(false);
  });

  it('Override input value matches the autofilled bswmdPath', () => {
    const bswmdPath = '/proj/samples/arxml/demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml';
    render(<DcmConfigSuccessDialog {...baseProps} result={{ ...baseProps.result, bswmdPath }} />);
    const input = screen.getByTestId('dcm-config-success-bswmd-override-input') as HTMLInputElement;
    expect(input.value).toBe(bswmdPath);
    // readOnly + disabled — browse button is deferred to v1.33.0.
    expect(input.readOnly).toBe(true);
    expect(input.disabled).toBe(true);
  });
});
