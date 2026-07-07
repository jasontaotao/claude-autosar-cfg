// @vitest-environment jsdom
// v1.33.0 MINOR T2 — DcmConfigOverridePicker.
//
// Pinned behaviours:
//   1. Renders Browse + Clear buttons.
//   2. Browse click invokes bswmdPick IPC; on `opened` calls onChange
//      with the picked path.
//   3. Browse click on `canceled` calls onCancel.
//   4. Browse click on a non-Dcm BSWMD calls onCancel + console.warn
//      (sanity-check parse via arxmlModuleShortNames + DCM_MODULE_SHORT_NAME).
//   5. Clear click calls onChange with empty string.
//
// Note: the brief specifies `userEvent.setup()` from
// `@testing-library/user-event`, but that dep is not installed in this
// project. Established convention in `DcmConfigTrigger.test.tsx` /
// `DcmConfigSuccessDialog.test.tsx` uses `fireEvent` + `waitFor` for
// async user gestures. We follow the project convention here; the
// behavioural assertions are identical.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DcmConfigOverridePicker } from '../DcmConfigOverridePicker.js';

describe('DcmConfigOverridePicker (v1.33.0 T2)', () => {
  beforeEach(() => {
    (window as unknown as { autosarApi: unknown }).autosarApi = {
      bswmdPick: vi.fn(),
    };
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Browse + Clear buttons', () => {
    render(
      <DcmConfigOverridePicker
        value="/dcm.arxml"
        onChange={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: /browse/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  it('Browse click invokes bswmdPick IPC and calls onChange on opened', async () => {
    const onChange = vi.fn();
    (window.autosarApi.bswmdPick as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'opened',
      path: '/override.arxml',
      content:
        '<AR-PACKAGES><AR-PACKAGE><ELEMENTS><ECUC-MODULE-DEF><SHORT-NAME>Dcm</SHORT-NAME></ECUC-MODULE-DEF></ELEMENTS></AR-PACKAGE></AR-PACKAGES>',
    });
    render(
      <DcmConfigOverridePicker value="" onChange={onChange} onCancel={() => undefined} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /browse/i }));
    await waitFor(() => expect(window.autosarApi.bswmdPick).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith('/override.arxml');
  });

  it('Browse click calls onCancel when user cancels', async () => {
    const onCancel = vi.fn();
    (window.autosarApi.bswmdPick as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'canceled',
    });
    render(
      <DcmConfigOverridePicker
        value=""
        onChange={() => undefined}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /browse/i }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  });

  it('Browse click calls onCancel + warns when picked file is not a Dcm BSWMD', async () => {
    const onCancel = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    (window.autosarApi.bswmdPick as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'opened',
      path: '/not-dcm.arxml',
      content:
        '<AR-PACKAGES><AR-PACKAGE><ELEMENTS><ECUC-MODULE-DEF><SHORT-NAME>CanIf</SHORT-NAME></ECUC-MODULE-DEF></ELEMENTS></AR-PACKAGE></AR-PACKAGES>',
    });
    render(
      <DcmConfigOverridePicker
        value=""
        onChange={() => undefined}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /browse/i }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not a valid Dcm BSWMD'));
  });

  it('Clear click calls onChange with empty string', async () => {
    const onChange = vi.fn();
    render(
      <DcmConfigOverridePicker
        value="/old.arxml"
        onChange={onChange}
        onCancel={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(''));
  });
});
