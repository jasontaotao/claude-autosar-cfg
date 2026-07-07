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
      // v1.33.0 MINOR T6 — `bswmdPath` is required on
      // DcmConfigHandlerResult. The autofill row in SuccessDialog
      // now renders unconditionally; the baseProps carries the
      // canonical demo-ecu BSWMD path so the default render path
      // surfaces the autofill row in every test that doesn't
      // explicitly override it.
      bswmdPath: '/proj/samples/arxml/demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml',
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
  //
  // v1.33.0 MINOR T6 — `bswmdPath` is REQUIRED on
  // DcmConfigHandlerResult, so the autofill row is rendered
  // unconditionally. The previous 3-test surface (positive en,
  // positive zh-CN, absence when bswmdPath undefined) collapses to
  // a single bilingual positive test against the unconditional
  // autofill render. Net: -2 tests.
  it.each(['en', 'zh-CN'] as const)(
    'renders autofill label with the resolved bswmdPath (locale %s)',
    (locale) => {
      render(<DcmConfigSuccessDialog {...baseProps} locale={locale} />);
      // Always-populated assertion: baseProps.result.bswmdPath is
      // the canonical demo-ecu BSWMD path; the autofill row must
      // surface it in both locales.
      expect(baseProps.result.bswmdPath).toBe(
        '/proj/samples/arxml/demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml',
      );
      expect(screen.getByTestId('dcm-config-success-bswmd-autofill')).toBeInTheDocument();
      const expectedLabel =
        locale === 'en' ? 'Auto-selected from project manifest' : '已从项目清单自动选择';
      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
      expect(
        screen.getByText('/proj/samples/arxml/demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml'),
      ).toBeInTheDocument();
    },
  );

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
    // v1.33.0 MINOR T2 — input is now `disabled={false}` (Browse button
    // wired). Still readOnly since the input reflects picker state, not
    // direct user typing. v1.32.1 PATCH P3 originally shipped this as
    // disabled (lesson disable-input-without-browse-button-is-debt).
    expect(input.readOnly).toBe(true);
    expect(input.disabled).toBe(false);
  });

  // v1.33.0 MINOR T2 — Override <details> now ships a Browse button
  // and a Clear button (DcmConfigOverridePicker). Confirms the
  // activation is complete in the same MINOR.
  it('Override <details> renders Browse + Clear buttons', () => {
    render(
      <DcmConfigSuccessDialog
        {...baseProps}
        result={{ ...baseProps.result, bswmdPath: '/proj/bswmd/Dcm.arxml' }}
      />,
    );
    expect(screen.getByRole('button', { name: /browse/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  // v1.33.0 MINOR T7 — SuccessDialog row count surface.
  //
  // When `result.appliedStepCount > 0` the dialog renders an extra
  // `<p>` with the i18n-translated "Applied N xlsx rows" line below
  // the autofill row. The key is `dcmConfig.appliedCount.summary`
  // and the placeholder is `{count}`. Zero / missing appliedStepCount
  // suppresses the line entirely (no empty <p>).
  it.each([
    { locale: 'en' as const, appliedStepCount: 5, expected: 'Applied 5 xlsx rows' },
    { locale: 'zh-CN' as const, appliedStepCount: 3, expected: '已应用 3 行 xlsx 数据' },
  ])(
    'renders applied step count line when appliedStepCount > 0 (locale $locale)',
    ({ locale, appliedStepCount, expected }) => {
      render(
        <DcmConfigSuccessDialog
          {...baseProps}
          locale={locale}
          result={{ ...baseProps.result, appliedStepCount }}
        />,
      );
      expect(screen.getByText(expected)).toBeInTheDocument();
      // data-testid affordance — the line is queryable for future E2E
      // tests without depending on localized text.
      expect(screen.getByTestId('dcm-config-success-applied-count')).toBeInTheDocument();
    },
  );

  it('omits the applied count line when appliedStepCount is 0', () => {
    render(
      <DcmConfigSuccessDialog
        {...baseProps}
        result={{ ...baseProps.result, appliedStepCount: 0 }}
      />,
    );
    expect(screen.queryByTestId('dcm-config-success-applied-count')).not.toBeInTheDocument();
  });
});
