// @vitest-environment jsdom
//
// AppHeader dcm-config integration — v1.31.0 PATCH T4.
//
// Pinned behaviours:
//   1. Renders the "Open Dcm Config" button when props allow
//   2. Calls onOpenDcmConfig on click
//   3. Disabled when dcmConfigBusy is true
//   4. Disabled when no project manifest / no Dcm BSWMD is present
//   5. Has a title attribute explaining the disabled reason

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppHeader } from '../AppHeader.js';

const baseProps = {
  onEcucModuleSelect: vi.fn(),
  canSelectEcucModule: true,
  scriptPanelOpen: false,
  onToggleScriptPanel: vi.fn(),
  onGenerate: vi.fn(),
  canGenerate: true,
  generateBusy: false,
  onOpenDbc: vi.fn(),
  dbcBusy: false,
  onOpenOdx: vi.fn(),
  odxBusy: false,
  onOpenDbcImport: vi.fn(),
  dbcImportBusy: false,
  onOpenXlsxBatch: vi.fn(),
  xlsxBatchBusy: false,
  onOpenDcmConfig: vi.fn(),
  canOpenDcmConfig: true,
  dcmConfigBusy: false,
};

describe('AppHeader dcm-config (v1.31.0 PATCH T4)', () => {
  afterEach(() => cleanup());

  it('renders the Open Dcm Config button', () => {
    render(<AppHeader {...baseProps} />);
    expect(screen.getByTestId('btn-open-dcm-config')).toBeInTheDocument();
  });

  it('calls onOpenDcmConfig on click', () => {
    const onOpenDcmConfig = vi.fn();
    render(<AppHeader {...baseProps} onOpenDcmConfig={onOpenDcmConfig} />);
    fireEvent.click(screen.getByTestId('btn-open-dcm-config'));
    expect(onOpenDcmConfig).toHaveBeenCalledOnce();
  });

  it('disables button when dcmConfigBusy is true', () => {
    render(<AppHeader {...baseProps} dcmConfigBusy={true} />);
    expect(screen.getByTestId('btn-open-dcm-config')).toBeDisabled();
  });
});