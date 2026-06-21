// @vitest-environment jsdom
// src/renderer/components/ValidationPanel/ValidationPanel.test.tsx
// Cluster G (v1.6.0) — ValidationPanel tests.

import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setFlagForTest, _resetFlagCache } from '@core/sws-validator/feature-flag.js';
import type { InternalValidatorResult } from '@core/sws-validator/types.js';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { useSwsValidatorStore } from '../../store/useSwsValidatorStore.js';

import { SwsValidationPanel } from './ValidationPanel.js';

const SAMPLE_RESULTS: InternalValidatorResult[] = [
  {
    ruleId: 'SWS_COM_PDUID_UNIQUE',
    severity: 'error',
    messageKey: 'swsValidator.SWS_COM_PDUID_UNIQUE.short',
    messageVars: { pduName: 'Pdu_A' },
    path: '/Pkg/Com/ComConfig/Pdu_A',
  },
  {
    ruleId: 'SWS_PDUR_ROUTING_COMPLETE',
    severity: 'warning',
    messageKey: 'swsValidator.SWS_PDUR_ROUTING_COMPLETE.short',
    messageVars: { pathName: 'Path_BAD' },
    path: '/Pkg/PduR/RoutingPaths/Path_BAD',
  },
];

describe('SwsValidationPanel', () => {
  beforeEach(() => {
    setFlagForTest('swsValidator', true);
    _resetFlagCache();
    useSwsValidatorStore.setState({
      results: [],
      running: false,
      enabled: true,
      panelOpen: true,
      severityFilter: 'all',
      lastRunAt: null,
      focusedErrorIndex: 0,
    });
  });

  afterEach(() => {
    setFlagForTest(null);
    _resetFlagCache();
  });

  it('renders disabled placeholder when feature flag is OFF', () => {
    setFlagForTest('swsValidator', false);
    _resetFlagCache();
    useSwsValidatorStore.setState({ enabled: false });
    render(<SwsValidationPanel locale="en" />);
    expect(screen.getByTestId('sws-panel-disabled')).toBeTruthy();
  });

  it('renders toggle button when panel is closed', () => {
    useSwsValidatorStore.setState({ panelOpen: false });
    render(<SwsValidationPanel locale="en" />);
    expect(screen.getByTestId('sws-panel-toggle-open')).toBeTruthy();
  });

  it('renders 4 starter rules results when populated', () => {
    useSwsValidatorStore.setState({ results: SAMPLE_RESULTS });
    render(<SwsValidationPanel locale="en" />);
    expect(screen.getByTestId('sws-panel')).toBeTruthy();
    const rows = screen.getAllByTestId(/sws-panel-row-/);
    expect(rows.length).toBe(2);
  });

  it('filters to error-only when severity filter is error', () => {
    useSwsValidatorStore.setState({
      results: SAMPLE_RESULTS,
      severityFilter: 'error',
    });
    render(<SwsValidationPanel locale="en" />);
    const rows = screen.getAllByTestId(/sws-panel-row-/);
    expect(rows.length).toBe(1);
  });

  it('fires select(path) when an error row is clicked', () => {
    useSwsValidatorStore.setState({ results: SAMPLE_RESULTS });
    const select = vi.fn();
    useArxmlStore.setState({ select } as never);
    render(<SwsValidationPanel locale="en" />);
    // The button inside the row carries the onClick — query by role+text.
    const buttons = screen.getAllByRole('button');
    // Click the first row button (not filter buttons which have data-testid).
    const rowButton = buttons.find((b) => b.classList.contains('sws-panel-row-button'));
    expect(rowButton).toBeTruthy();
    fireEvent.click(rowButton!);
    expect(select).toHaveBeenCalledWith('/Pkg/Com/ComConfig/Pdu_A');
  });
});
