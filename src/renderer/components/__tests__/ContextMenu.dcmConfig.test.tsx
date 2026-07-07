// @vitest-environment jsdom
//
// ContextMenu dcm-config integration — v1.31.0 PATCH T6 +
// v1.32.0 MINOR T8.
//
// Pinned behaviours:
//   1. Renders "Generate Dcm Config" when target.kind='bswmd' and
//      `useBswmdHasDcm().hasDcm` is true.
//   2. Does NOT render the entry when `hasDcm` is false.
//   3. Clicking the entry emits a `generate-dcm-config` action with
//      the target's path.
//
// v1.32.0 T8 — replaced the v1.31.x `isDcmBswmdPath` regex fixture
// with the new `useBswmdHasDcm` selector hook. The hook itself is
// memoized inside `useDcmConfigLauncher` (T5) so we mock the
// selector — the launcher's IPC stub is unnecessary for this
// context-menu-only test (the entry never fires the IPC, only
// emits the action for the host to route).

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { ContextMenuRoot, openContextMenu } from '../ContextMenu.js';

// Silence the launcher's IPC stub surfacing on this test — ContextMenu
// does not call it, but the import-time read of `useBswmdHasDcm`
// pulls `useDcmConfigLauncher` transitively which subscribes to the
// store. Stub the store-derived reads so the launcher's initial
// `findDcmBswmd` IPC hop is a no-op (test focus is the menu gating).

// v1.32.0 T8 — mock the selector hook so ContextMenu gates the
// "Generate Dcm Config" entry off the project's parse-based Dcm
// BSWMD presence. The two tests below toggle the response shape.
let mockHasDcm = true;
let mockDcmBswmdPath: string | undefined = '/dcm.arxml';
vi.mock('../../hooks/useBswmdHasDcm.js', () => ({
  useBswmdHasDcm: () => ({
    hasDcm: mockHasDcm,
    dcmBswmdPath: mockDcmBswmdPath,
  }),
}));

const actionSpy = vi.fn();

beforeEach(() => {
  actionSpy.mockReset();
  // Reset the store to a clean slate so each test starts without a
  // project / active doc leaking into ContextMenu's view-mode reads.
  useArxmlStore.setState({
    project: null,
    activeDocumentPath: null,
    filePath: null,
  } as never);
  // Default to hasDcm=true so existing assertions stay linear.
  mockHasDcm = true;
  mockDcmBswmdPath = '/dcm.arxml';
  // Mount the menu root once per test.
  render(<ContextMenuRoot onAction={actionSpy} locale="en" />);
});

afterEach(() => {
  cleanup();
});

function openAt(kind: 'bswmd', path: string, shortName: string): void {
  act(() => {
    openContextMenu({ kind, path, shortName }, 100, 100);
  });
}

describe('ContextMenu dcm-config (v1.32.0 MINOR T8)', () => {
  it('renders the entry when bswmdHasDcm.hasDcm is true', () => {
    mockHasDcm = true;
    openAt('bswmd', '/samples/Bsw_Custom_v3.arxml', 'Bsw_Custom_v3.arxml');
    expect(screen.getByTestId('context-menu-item-generate-dcm-config')).toBeInTheDocument();
  });

  it('does NOT render the entry when bswmdHasDcm.hasDcm is false', () => {
    mockHasDcm = false;
    mockDcmBswmdPath = undefined;
    openAt('bswmd', '/samples/Bsw_Com_Bswmd.arxml', 'Bsw_Com_Bswmd.arxml');
    expect(screen.queryByTestId('context-menu-item-generate-dcm-config')).not.toBeInTheDocument();
  });

  it('emits generate-dcm-config action on click with the target path', () => {
    mockHasDcm = true;
    const path = '/samples/Bsw_Dcm_Bswmd.arxml';
    openAt('bswmd', path, 'Bsw_Dcm_Bswmd.arxml');
    fireEvent.click(screen.getByTestId('context-menu-item-generate-dcm-config'));
    expect(actionSpy).toHaveBeenCalledOnce();
    expect(actionSpy).toHaveBeenCalledWith({ type: 'generate-dcm-config', path });
  });
});
