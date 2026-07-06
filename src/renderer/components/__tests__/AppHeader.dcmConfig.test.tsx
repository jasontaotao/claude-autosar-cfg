// @vitest-environment jsdom
//
// AppHeader dcm-config integration — v1.31.0 PATCH T4.
//
// Pinned behaviours:
//   1. Renders the "Open Dcm Config" button when props allow
//   2. Calls onOpenDcmConfig on click
//   3. Disabled when dcmConfigBusy is true
//   4. Disabled when canOpenDcmConfig is false (no Dcm BSWMD)
//   5. Has a title attribute explaining the disabled reason
//
// Pattern parity: mirrors the v1.22.0 T3 ODX test (AppHeader.odx.test
// .tsx) — opens the menu via btn-menu-toggle first because the entry
// sits inside the EB tresos-style dropdown group (per brief step 5
// "Insert the new button immediately after the Open ODX entry").

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

  it('renders the Open Dcm Config button in the dropdown', () => {
    render(<AppHeader {...baseProps} />);
    fireEvent.click(screen.getByTestId('btn-menu-toggle'));
    expect(screen.getByTestId('btn-open-dcm-config')).toBeInTheDocument();
  });

  it('calls onOpenDcmConfig on click', () => {
    const onOpenDcmConfig = vi.fn();
    render(<AppHeader {...baseProps} onOpenDcmConfig={onOpenDcmConfig} />);
    fireEvent.click(screen.getByTestId('btn-menu-toggle'));
    fireEvent.click(screen.getByTestId('btn-open-dcm-config'));
    expect(onOpenDcmConfig).toHaveBeenCalledOnce();
  });

  it('disables button when dcmConfigBusy is true', () => {
    render(<AppHeader {...baseProps} dcmConfigBusy={true} />);
    fireEvent.click(screen.getByTestId('btn-menu-toggle'));
    expect(screen.getByTestId('btn-open-dcm-config')).toBeDisabled();
  });

  it('disables button and surfaces noDcmBswmd title when canOpenDcmConfig is false', () => {
    render(<AppHeader {...baseProps} canOpenDcmConfig={false} />);
    fireEvent.click(screen.getByTestId('btn-menu-toggle'));
    const btn = screen.getByTestId('btn-open-dcm-config');
    expect(btn).toBeDisabled();
    // The disabled-reason title surfaces the missing-prerequisite
    // string (BSWMD not loaded / project not open) so the user
    // understands why the entry is greyed out.
    expect(btn.getAttribute('title')).toBeTruthy();
  });

  // v1.31.1 PATCH — busy title surfaces "生成中…" (zh-CN default) so
  // the user sees the in-flight reason distinct from the
  // missing-prereq reason. The store default locale is zh-CN;
  // a follow-up test could swap the store locale to en to assert
  // the en translation.
  it('surfaces localized busy title when dcmConfigBusy is true', () => {
    render(<AppHeader {...baseProps} dcmConfigBusy={true} />);
    fireEvent.click(screen.getByTestId('btn-menu-toggle'));
    const btn = screen.getByTestId('btn-open-dcm-config');
    expect(btn).toBeDisabled();
    expect(btn.getAttribute('title')).toBe('生成中…');
  });
});
