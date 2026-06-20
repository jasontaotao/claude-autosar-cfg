// @vitest-environment jsdom
//
// Sprint A X2 — P0-3 wiring: `<BswmdPickerRoot />` reacts to the
// store's `bswmdPicker.open` flag. Once mounted inside `<App />` (or
// rendered standalone in this test), calling
// `useArxmlStore.openBswmdPicker()` MUST mount the dialog and
// `closeBswmdPicker()` MUST unmount it.
//
// This file is intentionally minimal: the existing
// `BswmdPickerDialog.test.tsx` covers all picker behavior in depth
// (search / pick / Done / cancel / locale). Here we only pin that
// the mount → store open flip → render round-trip works after a
// standalone mount. The P0-3 gap is that App.tsx never mounts the
// component at all, so this test passes standalone but fails when
// called against an `<App />` that lacks the root.

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { BswmdPickerRoot } from '../BswmdPickerDialog.js';

beforeEach(() => {
  useArxmlStore.getState().clear();
});

afterEach(() => {
  cleanup();
});

describe('BswmdPickerRoot mount (Sprint A X2 — wiring smoke)', () => {
  it('renders nothing when the picker is closed', () => {
    render(<BswmdPickerRoot />);
    expect(screen.queryByTestId('bspd-overlay')).toBeNull();
  });

  it('mounts the overlay when the store flips bswmdPicker.open=true', async () => {
    render(<BswmdPickerRoot />);

    act(() => {
      useArxmlStore.getState().openBswmdPicker({
        parentPath: '/EAS/Adc/AdcConfig',
        kind: 'parameter',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('bspd-overlay')).toBeInTheDocument();
    });
    expect(screen.getByTestId('bspd-title')).toBeInTheDocument();
    expect(screen.getByTestId('bspd-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('bspd-done')).toBeInTheDocument();
  });

  it('unmounts the overlay when the store flips bswmdPicker.open=false', async () => {
    render(<BswmdPickerRoot />);

    act(() => {
      useArxmlStore.getState().openBswmdPicker({
        parentPath: '/EAS/Adc/AdcConfig',
        kind: 'container',
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId('bspd-overlay')).toBeInTheDocument();
    });

    act(() => {
      useArxmlStore.getState().closeBswmdPicker();
    });

    await waitFor(() => {
      expect(screen.queryByTestId('bspd-overlay')).toBeNull();
    });
  });
});